import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { CARDANO_ROOT } from "../../../server/constants";
import { pathExists } from "../../../server/fs-utils";
import { runCommand } from "../../../server/process-utils";

const CARDANO_NODE_SOCKET = path.join(CARDANO_ROOT, "node.socket");

interface CardanoStatus {
  running: boolean;
  synced?: boolean;
  syncProgress?: string;
  error?: string;
  version?: string;
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<CardanoStatus>
) {
  try {
    // Check if socket exists (indicates node might be running)
    const socketExists = await pathExists(CARDANO_NODE_SOCKET);

    // Check if process is running
    let processRunning = false;
    try {
      const { stdout } = await runCommand(
        "pgrep",
        ["-f", "cardano-node.*run"],
        {
          logCommand: "pgrep cardano-node",
        }
      );
      processRunning = stdout.trim().length > 0;
    } catch (error) {
      // pgrep returns non-zero if no process found, which is fine
      // Check if it's actually a "not found" error or something else
      const errMsg = (error as Error).message;
      if (
        !errMsg.includes("Command failed") ||
        errMsg.includes("exit code 1")
      ) {
        processRunning = false;
      } else {
        // Some other error, log it but assume not running
        console.warn("pgrep check failed:", errMsg);
        processRunning = false;
      }
    }

    // Node is running if process exists OR socket exists (socket might not exist during Mithril replay)
    const running = processRunning || socketExists;

    // Get node version if binary exists
    let version: string | undefined;
    try {
      const CARDANO_NODE = path.join(CARDANO_ROOT, "bin", "cardano-node");
      if (await pathExists(CARDANO_NODE)) {
        try {
          const { stdout } = await runCommand(CARDANO_NODE, ["--version"], {
            logCommand: "cardano-node --version",
          });
          // Extract version from output (format: "cardano-node 8.9.2 - linux - x86_64")
          const versionMatch = stdout.match(/cardano-node\s+([\d.]+)/);
          if (versionMatch) {
            version = versionMatch[1];
          }
        } catch {
          // Version check failed, but that's okay
        }
      }
    } catch {
      // Ignore version check errors
    }

    if (!running) {
      return res.status(200).json({ running: false, version });
    }

    // Try to query tip to check sync status
    try {
      const CARDANO_CLI = path.join(CARDANO_ROOT, "bin", "cardano-cli");
      if (!(await pathExists(CARDANO_CLI))) {
        return res.status(200).json({
          running: true,
          synced: false,
          error: "cardano-cli not found in .cardano/bin",
          version,
        });
      }
      const { stdout } = await runCommand(
        CARDANO_CLI,
        ["query", "tip", "--testnet-magic", "1"],
        {
          env: {
            ...process.env,
            CARDANO_NODE_SOCKET_PATH: CARDANO_NODE_SOCKET,
          },
        }
      );

      const tip = JSON.parse(stdout);
      const syncProgress = tip.syncProgress || "0.00";
      const synced = syncProgress === "100.00";

      return res.status(200).json({
        running: true,
        synced,
        syncProgress,
        version,
      });
    } catch (error) {
      // Node might be running but not ready yet (e.g., replaying blocks from Mithril)
      // Try to get progress from logs if socket isn't ready
      let replayProgress: string | undefined;
      let isReplaying = false;
      try {
        const logFile = path.join(CARDANO_ROOT, "logs", "cardano-node.log");
        if (await pathExists(logFile)) {
          const { stdout } = await runCommand("tail", ["-200", logFile], {
            cwd: CARDANO_ROOT,
          });
          
          // Check if we're replaying blocks (Mithril bootstrap)
          isReplaying = stdout.includes("Replayed block") || stdout.includes("ChainDB");
          
          // Look for replay progress: "Progress: XX.XX%"
          const progressMatch = stdout.match(/Progress:\s*(\d+\.\d+)%/);
          if (progressMatch) {
            replayProgress = progressMatch[1];
          } else if (isReplaying) {
            // If we're replaying but no progress found, try to extract from slot numbers
            const slotMatch = stdout.match(/slot\s+(\d+)\s+out\s+of\s+(\d+)/);
            if (slotMatch) {
              const currentSlot = parseInt(slotMatch[1]);
              const totalSlots = parseInt(slotMatch[2]);
              if (totalSlots > 0) {
                replayProgress = ((currentSlot / totalSlots) * 100).toFixed(2);
              }
            }
          }
        }
      } catch {
        // Ignore log reading errors
      }

      // If process is running but socket doesn't exist, it's likely replaying
      if (processRunning && !socketExists) {
        isReplaying = true;
      }

      return res.status(200).json({
        running: true,
        synced: false,
        syncProgress: replayProgress || "0.00",
        version,
      });
    }
  } catch (error) {
    return res.status(500).json({
      running: false,
      error: (error as Error).message,
    });
  }
}
