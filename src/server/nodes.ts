import path from "path";
import { promises as fs } from "fs";
import {
  HYDRA_NODE_PORTS,
  CARDANO_ROOT,
  TMP_ROOT,
  PROJECT_ROOT,
  HYDRA_ROOT,
} from "./constants";
import { ensureDir } from "./fs-utils";
import { runCommand } from "./process-utils";

const NODE_SCRIPTS: Record<string, string> = {
  alice: "hydra-alice.sh",
  bob: "hydra-bob.sh",
};

export interface WalletNodeConfig {
  walletId: string;
  walletLabel: string;
  persistenceDirName: string;
  listenPort: number;
  apiPort: number;
  peerPorts: number[];
  otherWalletLabels: string[];
}

export async function startHydraNode(node: string) {
  console.log(`[startHydraNode] Starting node: ${node}`);

  if (!NODE_SCRIPTS[node]) {
    console.error(`[startHydraNode] Unknown node: ${node}`);
    throw new Error(`Unknown node ${node}`);
  }

  const scriptsPath = path.join(CARDANO_ROOT, NODE_SCRIPTS[node]);
  console.log(`[startHydraNode] Script path: ${scriptsPath}`);

  const logsDir = path.join(TMP_ROOT, "logs");
  await ensureDir(logsDir);
  const logPath = path.join(logsDir, `hydra-${node}.log`);
  console.log(`[startHydraNode] Log path: ${logPath}`);

  const bashCommand = `cd ${CARDANO_ROOT} && source setup-env.sh && nohup ${scriptsPath} >> ${logPath} 2>&1 & echo $!`;
  console.log(`[startHydraNode] Executing command: ${bashCommand}`);

  try {
    const { stdout, stderr } = await runCommand("bash", ["-lc", bashCommand]);
    console.log(`[startHydraNode] Command stdout: ${stdout}`);
    if (stderr) {
      console.log(`[startHydraNode] Command stderr: ${stderr}`);
    }

    const pid = stdout.trim();
    console.log(`[startHydraNode] Node ${node} started with PID: ${pid}`);

    return { pid, logPath };
  } catch (error) {
    console.error(`[startHydraNode] Error executing command:`, error);
    throw error;
  }
}

export async function startHydraNodeForWallet(
  config: WalletNodeConfig,
  scriptId?: string | null
) {
  console.log(
    `[startHydraNodeForWallet] Starting node for wallet: ${config.walletId} with script: ${scriptId || 'default'}`
  );

  const {
    walletId,
    walletLabel,
    persistenceDirName,
    listenPort,
    apiPort,
    peerPorts,
    otherWalletLabels,
  } = config;

  // Get script TX IDs if scriptId is provided
  let scriptsTxId = "$SCRIPTS_TX_ID"; // Default to environment variable
  if (scriptId) {
    try {
      const { promises: fs } = await import("fs");
      const scriptsFile = path.join(TMP_ROOT, "scripts", "scripts.json");
      try {
        const data = await fs.readFile(scriptsFile, "utf-8");
        const scripts = JSON.parse(data);
        const selectedScript = scripts.find((s: any) => s.id === scriptId);
        if (selectedScript) {
          scriptsTxId = selectedScript.txIds;
          console.log(`[startHydraNodeForWallet] Using custom script: ${selectedScript.name}`);
        } else {
          console.warn(`[startHydraNodeForWallet] Script ${scriptId} not found, using default`);
        }
      } catch (error) {
        console.warn(`[startHydraNodeForWallet] Error loading script ${scriptId}, using default:`, error);
      }
    } catch (error) {
      console.warn(`[startHydraNodeForWallet] Error importing fs, using default script:`, error);
    }
  }

  // Check if node is already running by checking the API port
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    await fetch(`http://127.0.0.1:${apiPort}/head`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    console.log(
      `[startHydraNodeForWallet] Node for ${walletId} is already running on port ${apiPort}`
    );
    return {
      pid: null,
      logPath: null,
      alreadyRunning: true,
      message: `Node for ${walletLabel} is already running`,
    };
  } catch {
    // Node is not running, proceed to start it
  }

  const logsDir = path.join(TMP_ROOT, "logs");
  await ensureDir(logsDir);
  const logPath = path.join(logsDir, `hydra-${walletId}.log`);

  // Ensure persistence directory exists
  const persistenceDir = path.join(HYDRA_ROOT, persistenceDirName);
  await ensureDir(persistenceDir);

  // Construct the command using absolute paths with proper escaping
  // Helper to escape shell arguments
  const escapeShell = (str: string) => `'${str.replace(/'/g, "'\"'\"'")}'`;

  const hydraNodePath = path.join(HYDRA_ROOT, "hydra-node");
  const cardanoSigningKey = path.join(
    TMP_ROOT,
    "wallets",
    walletLabel,
    "payment.skey"
  );
  const hydraSigningKey = path.join(
    TMP_ROOT,
    "wallets",
    walletLabel,
    "hydra.skey"
  );
  const protocolParams = path.join(HYDRA_ROOT, "protocol-parameters.json");

  // Build peer arguments with proper escaping
  const peerArgsEscaped = peerPorts
    .map((port) => `  --peer 127.0.0.1:${port} \\`)
    .join("\n");

  // Build cardano verification key arguments with proper paths
  const cardanoVkeyArgsEscaped = otherWalletLabels
    .map((label) => {
      const vkeyPath = path.join(TMP_ROOT, "wallets", label, "payment.vkey");
      return `  --cardano-verification-key ${escapeShell(vkeyPath)} \\`;
    })
    .join("\n");

  // Build hydra verification key arguments with proper paths
  const hydraVkeyArgsEscaped = otherWalletLabels
    .map((label) => {
      const vkeyPath = path.join(TMP_ROOT, "wallets", label, "hydra.vkey");
      return `  --hydra-verification-key ${escapeShell(vkeyPath)} \\`;
    })
    .join("\n");

  // Construct the command with proper escaping
  const command = `cd ${escapeShell(
    CARDANO_ROOT
  )} && source ../scripts/setup-env.sh && cd .. && \\
source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh && \\
${escapeShell(hydraNodePath)} \\
  --node-id ${walletId}-node \\
  --persistence-dir ${escapeShell(persistenceDir)} \\
  --listen 127.0.0.1:${listenPort} \\
${
  peerArgsEscaped ? peerArgsEscaped + "\n" : ""
}  --cardano-signing-key ${escapeShell(cardanoSigningKey)} \\
${
  cardanoVkeyArgsEscaped ? cardanoVkeyArgsEscaped + "\n" : ""
}  --hydra-signing-key ${escapeShell(hydraSigningKey)} \\
${
  hydraVkeyArgsEscaped ? hydraVkeyArgsEscaped + "\n" : ""
}  --hydra-scripts-tx-id "${scriptsTxId}" \\
  --ledger-protocol-parameters ${escapeShell(protocolParams)} \\
  --testnet-magic 1 \\
  --node-socket "$CARDANO_NODE_SOCKET_PATH" \\
  --api-port ${apiPort} \\
  --api-host 0.0.0.0`;

  const zshCommand = `cd ${escapeShell(
    PROJECT_ROOT
  )} && ${command} >> ${escapeShell(logPath)} 2>&1 & echo $!`;

  console.log(`[startHydraNodeForWallet] Executing command for ${walletId}`);

  try {
    const { stdout, stderr } = await runCommand("zsh", ["-lc", zshCommand]);
    console.log(`[startHydraNodeForWallet] Command stdout: ${stdout}`);
    if (stderr) {
      console.log(`[startHydraNodeForWallet] Command stderr: ${stderr}`);
    }

    // Extract PID from stdout - it's the last line after all the env setup messages
    const lines = stdout.trim().split("\n");
    const pid = lines[lines.length - 1].trim();
    console.log(
      `[startHydraNodeForWallet] Node ${walletId} started with PID: ${pid}`
    );

    // Give it a moment to start, then verify it's actually running
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check if the process is still running after a brief delay
    try {
      // Use pgrep to check if process exists (works on macOS and Linux)
      // pgrep returns exit code 1 when no process found, which we need to handle
      let checkResult;
      try {
        checkResult = await runCommand("pgrep", [
          "-f",
          `hydra-node.*${walletId}-node`,
        ]);
      } catch (pgrepError) {
        // pgrep returns exit code 1 when no process found - check if process really died
        checkResult = { stdout: "", stderr: "" };
      }

      if (!checkResult.stdout.trim() || !checkResult.stdout.includes(pid)) {
        // Process died, check logs for errors
        const fs = await import("fs/promises");
        try {
          const logContent = await fs.readFile(logPath, "utf-8");
          const lastLines = logContent.split("\n").slice(-20).join("\n");
          console.error(
            `[startHydraNodeForWallet] Node ${walletId} (PID ${pid}) died shortly after start. Last log lines:\n${lastLines}`
          );
          throw new Error(
            `Node process died shortly after start. Check logs at ${logPath}`
          );
        } catch (logError) {
          if ((logError as Error).message.includes("died")) {
            throw logError;
          }
          console.error(
            `[startHydraNodeForWallet] Node ${walletId} (PID ${pid}) died and log file not readable`
          );
          throw new Error(
            `Node process died shortly after start. Check logs at ${logPath}`
          );
        }
      }
    } catch (error) {
      // If error message indicates process died, throw it
      if (
        (error as Error).message.includes("died") ||
        (error as Error).message.includes("not running")
      ) {
        throw error;
      }
      // Otherwise, just warn but don't fail - process might still be starting
      console.warn(
        `[startHydraNodeForWallet] Could not verify process ${pid} for ${walletId}:`,
        error
      );
    }

    return { pid, logPath, alreadyRunning: false };
  } catch (error) {
    console.error(`[startHydraNodeForWallet] Error executing command:`, error);
    throw error;
  }
}

export async function stopHydraNodes(walletIds?: string[]) {
  console.log(`[stopHydraNodes] Stopping nodes for wallets:`, walletIds);

  try {
    // Find all hydra-node processes
    let checkResult;
    try {
      checkResult = await runCommand("pgrep", ["-f", "hydra-node"]);
    } catch (error) {
      // pgrep returns exit code 1 when no processes found - this is expected
      checkResult = { stdout: "", stderr: "" };
    }

    const pids = checkResult.stdout.trim();
    if (pids.length === 0) {
      console.log(`[stopHydraNodes] No hydra-node processes found`);
      return {
        success: true,
        message: "No Hydra nodes are running",
        stopped: [],
      };
    }

    // Filter PIDs if specific wallet IDs are provided
    // For now, we'll stop all hydra-node processes
    // In the future, we could filter by wallet ID from the process args
    const pidList = pids.split(/\s+/).filter((pid) => pid.trim());
    const stoppedPids: string[] = [];

    // Try graceful shutdown first (SIGTERM)
    for (const pid of pidList) {
      try {
        await runCommand("kill", ["-TERM", pid]);
        stoppedPids.push(pid);
        console.log(`[stopHydraNodes] Sent SIGTERM to PID ${pid}`);
      } catch (error) {
        console.log(`[stopHydraNodes] Failed to stop PID ${pid}:`, error);
      }
    }

    // Wait for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check if processes are still running
    let verifyResult;
    try {
      verifyResult = await runCommand("pgrep", ["-f", "hydra-node"]);
    } catch (error) {
      verifyResult = { stdout: "", stderr: "" };
    }

    const remainingPids = verifyResult.stdout.trim();
    if (remainingPids.length > 0) {
      // Force kill if still running
      const remainingPidList = remainingPids
        .split(/\s+/)
        .filter((pid) => pid.trim());
      for (const pid of remainingPidList) {
        try {
          await runCommand("kill", ["-KILL", pid]);
          console.log(`[stopHydraNodes] Force killed PID ${pid}`);
        } catch (error) {
          console.log(
            `[stopHydraNodes] Failed to force kill PID ${pid}:`,
            error
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Final check
    let finalCheck;
    try {
      finalCheck = await runCommand("pgrep", ["-f", "hydra-node"]);
    } catch (error) {
      finalCheck = { stdout: "", stderr: "" };
    }

    const isStillRunning = finalCheck.stdout.trim().length > 0;

    return {
      success: true,
      message: isStillRunning
        ? "Stop command executed (some processes may still be shutting down)"
        : "Hydra nodes stopped successfully",
      stopped: stoppedPids,
      running: isStillRunning,
    };
  } catch (error) {
    console.error(`[stopHydraNodes] Error stopping nodes:`, error);
    throw error;
  }
}

export async function cleanupHydraPersistence(walletIds?: string[]) {
  console.log(
    `[cleanupHydraPersistence] Cleaning up persistence for wallets:`,
    walletIds
  );

  const fs = await import("fs/promises");
  const persistenceDir = HYDRA_ROOT;

  try {
    const entries = await fs.readdir(persistenceDir, { withFileTypes: true });
    const persistenceDirs = entries
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith("persistence-")
      )
      .map((entry) => entry.name);

    const deletedDirs: string[] = [];
    const errors: string[] = [];

    for (const dirName of persistenceDirs) {
      try {
        // If walletIds provided, only delete matching persistence dirs
        // Persistence dir format: persistence-{label}-{walletIdPrefix}
        if (walletIds && walletIds.length > 0) {
          const shouldDelete = walletIds.some((walletId) => {
            // Check if the persistence dir name contains the wallet ID prefix
            return dirName.includes(walletId.substring(0, 8));
          });

          if (!shouldDelete) {
            continue;
          }
        }

        const dirPath = path.join(persistenceDir, dirName);
        await fs.rm(dirPath, { recursive: true, force: true });
        deletedDirs.push(dirName);
        console.log(`[cleanupHydraPersistence] Deleted ${dirName}`);
      } catch (error) {
        const errorMsg = `Failed to delete ${dirName}: ${
          (error as Error).message
        }`;
        errors.push(errorMsg);
        console.error(`[cleanupHydraPersistence] ${errorMsg}`);
      }
    }

    return {
      success: true,
      message: `Cleaned up ${deletedDirs.length} persistence directory(ies)`,
      deleted: deletedDirs,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error(
      `[cleanupHydraPersistence] Error cleaning up persistence:`,
      error
    );
    throw error;
  }
}

export async function getHydraNodeStatus(walletIds?: string[]) {
  // If walletIds provided, check those wallets by their calculated API ports
  // Otherwise, fall back to HYDRA_NODE_PORTS for backward compatibility
  let nodesToCheck: Array<[string, number]>;

  if (walletIds && walletIds.length > 0) {
    // Calculate ports: 4001 + index for each wallet
    nodesToCheck = walletIds.map((walletId, index) => [walletId, 4001 + index]);
  } else {
    // Fallback to hardcoded ports
    nodesToCheck = Object.entries(HYDRA_NODE_PORTS);
  }

  const entries = await Promise.all(
    nodesToCheck.map(async ([node, port]) => {
      try {
        const controller = new AbortController();
        // Reduced timeout from 1500ms to 500ms for faster response
        const timeout = setTimeout(() => controller.abort(), 500);
        const response = await fetch(`http://127.0.0.1:${port}/head`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const errorMsg = `HTTP ${response.status}`;
          console.error(
            `[getHydraNodeStatus] Node ${node} (port ${port}) returned error: ${errorMsg}`
          );
          return [node, { online: false, error: errorMsg }];
        }
        const data = await response.json();
        return [node, { online: true, data }];
      } catch (error) {
        const errorMsg = (error as Error).message;
        // Only log errors if it's not a connection refused (which is expected when node is offline)
        if (
          !errorMsg.includes("ECONNREFUSED") &&
          !errorMsg.includes("fetch failed")
        ) {
          console.error(
            `[getHydraNodeStatus] Node ${node} (port ${port}) error:`,
            errorMsg
          );
        }
        return [node, { online: false, error: errorMsg }];
      }
    })
  );

  return Object.fromEntries(entries);
}

// Cache for persistence directory lookups (cleared on each request to avoid stale data)
let persistenceDirCache: Record<string, string | null> | null = null;

/**
 * Check state file for initialization status (optimized)
 */
async function checkStateFileInitializing(
  walletLabel: string
): Promise<boolean> {
  try {
    // Build cache on first call (shared across all wallets in same request)
    if (persistenceDirCache === null) {
      persistenceDirCache = {};
      const persistenceDirs = await fs.readdir(HYDRA_ROOT, {
        withFileTypes: true,
      });
      // Build cache of all persistence directories
      persistenceDirs.forEach((entry) => {
        if (entry.isDirectory() && entry.name.startsWith("persistence-")) {
          // Extract wallet label from directory name: persistence-{label}-{hash}
          const match = entry.name.match(/^persistence-(.+?)-/);
          if (match) {
            const label = match[1];
            if (!persistenceDirCache![label]) {
              persistenceDirCache![label] = entry.name;
            }
          }
        }
      });
    }

    const persistenceDirName = persistenceDirCache[walletLabel];
    if (!persistenceDirName) {
      return false;
    }

    const stateFilePath = path.join(HYDRA_ROOT, persistenceDirName, "state");

    // Check if state file exists
    try {
      await fs.access(stateFilePath);
    } catch {
      return false;
    }

    // Optimize: Only read the last 100 lines instead of entire file
    // State files can be large, but we only need to check recent events
    const stateFileContent = await fs.readFile(stateFilePath, "utf-8");
    const lines = stateFileContent.trim().split("\n").filter(Boolean);

    // Only check last 100 lines for performance (recent events are at the end)
    const linesToCheck = lines.slice(-100);

    // Check for HeadInitialized and HeadOpened events
    let hasHeadInitialized = false;
    let hasHeadOpened = false;

    for (const line of linesToCheck) {
      try {
        const event = JSON.parse(line);
        if (event.stateChanged?.tag === "HeadInitialized") {
          hasHeadInitialized = true;
        }
        if (event.stateChanged?.tag === "HeadOpened") {
          hasHeadOpened = true;
        }
        // Early exit if we found both (optimization)
        if (hasHeadInitialized && hasHeadOpened) {
          break;
        }
      } catch {
        continue;
      }
    }

    // If HeadInitialized exists but HeadOpened doesn't, we're in initialization
    return hasHeadInitialized && !hasHeadOpened;
  } catch (error) {
    console.error(
      `[checkStateFileInitializing] Error checking state for ${walletLabel}:`,
      error
    );
    return false;
  }
}

/**
 * Unified function to get both node status and initialization state
 * @param walletConfigs Array of { walletId, walletLabel } objects
 */
export async function getUnifiedNodeStatus(
  walletConfigs: Array<{ walletId: string; walletLabel: string }>,
  options?: { includeStateChecks?: boolean }
) {
  // Clear persistence dir cache at start of each request
  persistenceDirCache = null;

  // Run node status and state checks in parallel for better performance
  const walletIds = walletConfigs.map((wc) => wc.walletId);

  const [nodeStatusResult, stateChecksResult] = await Promise.all([
    // Get node status (online/offline) - this also includes head status data
    getHydraNodeStatus(walletIds),
    // Get initialization state for each wallet (only if needed)
    options?.includeStateChecks === false
      ? Promise.resolve([])
      : Promise.all(
          walletConfigs.map(async ({ walletLabel }) => {
            const isInitializing = await checkStateFileInitializing(
              walletLabel
            );
            return [walletLabel, isInitializing] as [string, boolean];
          })
        ),
  ]);

  // Extract head status from the node status data
  // nodeStatus is keyed by walletId, and each entry has { online: boolean, data?: HeadStatus }
  const headStatus: Record<string, any> = {}; // HeadStatus type from hydra-client
  walletConfigs.forEach(({ walletId, walletLabel }) => {
    const status = nodeStatusResult[walletId];
    if (status?.online && status.data) {
      // The data from /head endpoint contains the head status
      headStatus[walletLabel] = status.data;
    } else {
      // If node is offline or no data, set to null
      headStatus[walletLabel] = null;
    }
  });

  const stateFileInitializing =
    options?.includeStateChecks === false
      ? {}
      : Object.fromEntries(stateChecksResult);

  return {
    nodeStatus: nodeStatusResult,
    headStatus, // Add head status extracted from the /head API response
    stateFileInitializing,
  };
}
