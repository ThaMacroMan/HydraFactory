import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import { CARDANO_ROOT } from "../../../../server/constants";

const execAsync = promisify(exec);

interface UTXOValue {
  lovelace?: number;
  [key: string]: number | undefined;
}

interface UTXOData {
  address: string;
  value: UTXOValue;
  datum?: string | null;
  datumhash?: string | null;
  scriptRef?: unknown;
}

type UTXOResponse = Record<string, UTXOData>;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const startTime = Date.now();
  console.log(`[commit] ========== COMMIT REQUEST START ==========`);
  console.log(`[commit] Timestamp: ${new Date().toISOString()}`);

  if (req.method !== "POST") {
    console.error(`[commit] Invalid method: ${req.method}`);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { party, port: portParam } = req.query;
  const partyStr = String(party);
  console.log(`[commit] Party: ${partyStr}`);
  console.log(`[commit] Port parameter: ${portParam || "not provided"}`);

  // Use provided port or calculate it
  const { getWalletApiPort } = await import("../../../../server/constants");
  let port: number | null = null;
  if (portParam) {
    port = parseInt(String(portParam), 10);
    console.log(`[commit] Using provided port: ${port}`);
  } else {
    port = await getWalletApiPort(partyStr);
    console.log(`[commit] Calculated port from party: ${port}`);
  }

  if (!port) {
    console.error(`[commit] Failed to determine port for party: ${partyStr}`);
    return res
      .status(400)
      .json({ error: "Invalid party or unable to determine port" });
  }
  console.log(`[commit] Using Hydra API port: ${port}`);

  const { utxo } = req.body;
  console.log(`[commit] Request body UTXO: ${utxo || "not provided"}`);

  if (!utxo || typeof utxo !== "string") {
    console.error(`[commit] Invalid UTXO in request body:`, {
      utxo,
      type: typeof utxo,
    });
    return res.status(400).json({ error: "UTXO reference is required" });
  }

  // Validate and sanitize UTXO input to prevent command injection
  // UTXO format: txHash#txIx (hex string#number)
  const utxoSanitized = utxo.trim();
  console.log(`[commit] Sanitized UTXO: ${utxoSanitized}`);

  if (!/^[a-fA-F0-9]+#[0-9]+$/.test(utxoSanitized)) {
    console.error(`[commit] UTXO format validation failed: ${utxoSanitized}`);
    return res.status(400).json({
      error: "Invalid UTXO format. Expected format: txHash#txIx",
    });
  }
  console.log(`[commit] UTXO format validated successfully`);

  // The Hydra commit endpoint expects the full UTXO JSON object (as returned by cardano-cli query utxo)
  // Format: { "txHash#txIx": { "address": "...", "value": {...}, ... } }
  // We need to query the UTXO from the chain to get its full structure
  console.log(
    `[commit] ========== STEP 1: Querying UTXO from chain ==========`
  );
  console.log(`[commit] Target UTXO: ${utxoSanitized}`);

  try {
    // Use CARDANO_ROOT from constants, with fallback for backward compatibility
    const cardanoCliPath =
      process.env.CARDANO_CLI_PATH ||
      path.join(CARDANO_ROOT, "bin", "cardano-cli");
    console.log(
      `[commit] ========== STEP 2: Cardano CLI Configuration ==========`
    );
    console.log(
      `[commit] CARDANO_CLI_PATH env: ${
        process.env.CARDANO_CLI_PATH || "not set"
      }`
    );
    console.log(`[commit] CARDANO_ROOT: ${CARDANO_ROOT}`);
    console.log(`[commit] Using cardano-cli path: ${cardanoCliPath}`);
    console.log(
      `[commit] Cardano CLI exists: ${fs.existsSync(cardanoCliPath)}`
    );

    // Try multiple possible socket paths
    const possibleSocketPaths = [
      path.join(process.cwd(), ".cardano/node.socket"), // hydrafactory/.cardano/node.socket
      path.join(process.cwd(), "../cardano-preprod-node/node.socket"), // fallback
      process.env.CARDANO_NODE_SOCKET_PATH, // environment variable
    ].filter(Boolean) as string[];

    console.log(`[commit] Checking socket paths:`, possibleSocketPaths);
    let socketPath: string | null = null;
    for (const possiblePath of possibleSocketPaths) {
      const exists = fs.existsSync(possiblePath);
      console.log(
        `[commit]   - ${possiblePath}: ${exists ? "✓ FOUND" : "✗ not found"}`
      );
      if (exists) {
        socketPath = possiblePath;
        break;
      }
    }

    if (!socketPath) {
      console.error(
        `[commit] No socket path found. Checked:`,
        possibleSocketPaths
      );
      return res.status(503).json({
        error:
          "Cardano node socket not found. Please ensure the Cardano node is running.",
        checkedPaths: possibleSocketPaths,
      });
    }
    console.log(`[commit] Using socket path: ${socketPath}`);

    // Get the party's address first - we need it to query UTXOs
    console.log(
      `[commit] ========== STEP 3: Building Wallet Address ==========`
    );
    const fundsVkPath = path.join(
      process.cwd(),
      ".tmp/wallets",
      partyStr,
      "payment.vkey"
    );
    console.log(`[commit] Payment vkey path: ${fundsVkPath}`);
    console.log(`[commit] Payment vkey exists: ${fs.existsSync(fundsVkPath)}`);

    if (!fs.existsSync(fundsVkPath)) {
      console.error(`[commit] Payment vkey not found at: ${fundsVkPath}`);
      return res.status(404).json({
        error: "Payment verification key not found",
        message: `Could not find payment.vkey for ${partyStr}. Please ensure the wallet is properly set up.`,
      });
    }

    // Build address from verification key
    const escapeShell = (str: string) => `'${str.replace(/'/g, "'\"'\"'")}'`;
    const addressCmd =
      `${escapeShell(cardanoCliPath)} address build ` +
      `--payment-verification-key-file ${escapeShell(fundsVkPath)} ` +
      `--testnet-magic 1`;

    console.log(`[commit] Building address for ${partyStr}...`);
    console.log(`[commit] Address command: ${addressCmd}`);
    const addressStartTime = Date.now();
    let address: string;
    try {
      const addressResult = await execAsync(addressCmd);
      address = addressResult.stdout.trim();
      const addressTime = Date.now() - addressStartTime;
      console.log(`[commit] ✓ Address built successfully in ${addressTime}ms`);
      console.log(`[commit] Address for ${partyStr}: ${address}`);
      if (addressResult.stderr) {
        console.log(`[commit] Address build stderr: ${addressResult.stderr}`);
      }
    } catch (addressError) {
      const addressTime = Date.now() - addressStartTime;
      console.error(
        `[commit] ✗ Failed to build address after ${addressTime}ms`
      );
      console.error(`[commit] Address error:`, addressError);
      if (addressError instanceof Error) {
        console.error(`[commit] Error message: ${addressError.message}`);
        const execError = addressError as Error & {
          stderr?: string;
          stdout?: string;
        };
        if (execError.stderr) {
          console.error(`[commit] Error stderr: ${execError.stderr}`);
        }
        if (execError.stdout) {
          console.error(`[commit] Error stdout: ${execError.stdout}`);
        }
      }
      return res.status(500).json({
        error: "Failed to build address",
        details:
          addressError instanceof Error
            ? addressError.message
            : "Unknown error",
      });
    }

    // Query all UTXOs for this address, then filter for the specific UTXO
    // This is the correct way to query a specific UTXO - query by address, not by --tx-in
    console.log(
      `[commit] ========== STEP 4: Querying UTXOs from Chain ==========`
    );
    const queryCmd =
      `${escapeShell(cardanoCliPath)} query utxo ` +
      `--address ${address} ` +
      `--testnet-magic 1 ` +
      `--socket-path ${escapeShell(socketPath)} ` +
      `--out-file /dev/stdout`;

    console.log(`[commit] Querying UTXOs for address: ${address}`);
    console.log(`[commit] Query command: ${queryCmd}`);
    const queryStartTime = Date.now();
    const { stdout: utxoJson, stderr: queryError } = await execAsync(queryCmd);
    const queryTime = Date.now() - queryStartTime;
    console.log(`[commit] Query completed in ${queryTime}ms`);
    console.log(`[commit] Query stdout length: ${utxoJson?.length || 0} bytes`);
    if (queryError) {
      console.log(`[commit] Query stderr: ${queryError}`);
    }

    if (queryError && !utxoJson) {
      console.error(`[commit] ✗ Error querying UTXOs:`, queryError);
      return res.status(500).json({
        error: "Failed to query UTXOs from chain",
        details: queryError,
      });
    }

    console.log(`[commit] ========== STEP 5: Parsing UTXO Response ==========`);
    let allUtxos: UTXOResponse;
    try {
      allUtxos = JSON.parse(utxoJson) as UTXOResponse;
      console.log(`[commit] ✓ UTXO JSON parsed successfully`);
      console.log(
        `[commit] Number of UTXOs found: ${Object.keys(allUtxos).length}`
      );
      if (Object.keys(allUtxos).length > 0) {
        console.log(
          `[commit] UTXO keys (first 5):`,
          Object.keys(allUtxos).slice(0, 5)
        );
      }
    } catch (parseError) {
      console.error(`[commit] ✗ Failed to parse UTXO JSON`);
      console.error(`[commit] Parse error:`, parseError);
      console.error(
        `[commit] Raw output (first 500 chars):`,
        utxoJson?.substring(0, 500)
      );
      return res.status(500).json({
        error: "Failed to parse UTXO data from cardano-cli",
        details:
          parseError instanceof Error ? parseError.message : "Parse error",
      });
    }

    // Verify we got UTXOs
    if (!allUtxos || typeof allUtxos !== "object") {
      console.error(`[commit] ✗ Invalid UTXO response format`);
      console.error(`[commit] Response type: ${typeof allUtxos}`);
      console.error(`[commit] Response value:`, allUtxos);
      return res.status(500).json({
        error: "Invalid UTXO response from cardano-cli",
        details: "Response was not a valid JSON object",
      });
    }

    // Filter for the specific UTXO we need
    // Try exact match first, then case-insensitive match (cardano-cli sometimes returns lowercase)
    console.log(`[commit] ========== STEP 6: Finding Target UTXO ==========`);
    console.log(`[commit] Looking for UTXO: ${utxoSanitized}`);
    const utxoData: UTXOResponse = {};
    let foundUtxoKey: string | null = null;

    if (allUtxos[utxoSanitized]) {
      foundUtxoKey = utxoSanitized;
      console.log(`[commit] ✓ Found exact match: ${foundUtxoKey}`);
    } else {
      console.log(
        `[commit] No exact match found, trying case-insensitive match...`
      );
      // Try case-insensitive match
      const lowerUtxo = utxoSanitized.toLowerCase();
      let checkedCount = 0;
      for (const key of Object.keys(allUtxos)) {
        checkedCount++;
        if (key.toLowerCase() === lowerUtxo) {
          foundUtxoKey = key;
          console.log(
            `[commit] ✓ Found case-insensitive match: ${foundUtxoKey} (checked ${checkedCount} UTXOs)`
          );
          break;
        }
      }
      if (!foundUtxoKey) {
        console.log(
          `[commit] ✗ No match found after checking ${checkedCount} UTXOs`
        );
      }
    }

    if (foundUtxoKey) {
      console.log(`[commit] ========== STEP 7: Validating UTXO ==========`);
      const utxoInfo = allUtxos[foundUtxoKey];
      console.log(`[commit] UTXO info:`, {
        key: foundUtxoKey,
        address: utxoInfo.address,
        value: utxoInfo.value,
        hasDatum: !!utxoInfo.datum,
        hasDatumHash: !!utxoInfo.datumhash,
      });

      // Verify the UTXO belongs to this wallet's address
      if (utxoInfo.address && utxoInfo.address !== address) {
        console.error(`[commit] ✗ UTXO address mismatch`);
        console.error(`[commit] UTXO address: ${utxoInfo.address}`);
        console.error(`[commit] Wallet address: ${address}`);
        return res.status(400).json({
          error: "UTXO address mismatch",
          message: `The UTXO ${utxoSanitized} does not belong to this wallet's address. Please ensure you're committing a UTXO from the correct wallet.`,
          utxo: utxoSanitized,
          utxoAddress: utxoInfo.address,
          walletAddress: address,
        });
      }
      console.log(`[commit] ✓ UTXO address matches wallet address`);

      utxoData[foundUtxoKey] = utxoInfo;
      console.log(`[commit] ✓ UTXO validated and ready for commit`);
      console.log(
        `[commit] UTXO key: ${foundUtxoKey} (requested: ${utxoSanitized})`
      );
      const lovelace = utxoInfo.value?.lovelace || 0;
      const ada = lovelace / 1000000;
      console.log(
        `[commit] UTXO value: ${ada.toFixed(6)} ADA (${lovelace} lovelace)`
      );

      // If the key doesn't match exactly, log a warning
      if (foundUtxoKey !== utxoSanitized) {
        console.warn(
          `[commit] ⚠ UTXO key case mismatch: requested ${utxoSanitized}, found ${foundUtxoKey}`
        );
      }
    } else {
      // UTXO not found - it may have been spent or doesn't exist
      const availableUtxos = Object.keys(allUtxos);
      console.error(`[commit] UTXO ${utxoSanitized} not found in wallet`);
      console.error(
        `[commit] Available UTXOs (${availableUtxos.length}):`,
        availableUtxos.slice(0, 10)
      ); // Log first 10
      return res.status(400).json({
        error: "UTXO not found or already spent",
        message: `The UTXO ${utxoSanitized} does not exist in this wallet or has already been spent. Please refresh your wallet UTXOs and try again with a different UTXO.`,
        utxo: utxoSanitized,
        availableUtxosCount: availableUtxos.length,
        availableUtxos:
          availableUtxos.length > 0
            ? availableUtxos.slice(0, 5)
            : "No UTXOs found in wallet",
        walletAddress: address,
      });
    }

    console.log(`[commit] ========== STEP 8: Checking Head Status ==========`);
    console.log(`[commit] UTXO data prepared:`, Object.keys(utxoData));

    // Check if this is a subsequent commit (after initial commit)
    // First, check the head status to see if there are already commits
    let useIncrement = false;
    let isOpen = false; // Initialize isOpen to avoid undefined reference
    let headTag: string | null = null;
    let hasCommitted = false;
    let hasPendingCommits = false;
    const statusUrl = `http://127.0.0.1:${port}/head`;
    console.log(`[commit] Fetching head status from: ${statusUrl}`);
    const statusStartTime = Date.now();
    try {
      const statusResponse = await fetch(statusUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const statusTime = Date.now() - statusStartTime;
      console.log(
        `[commit] Head status response: ${statusResponse.status} (${statusTime}ms)`
      );

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        headTag = statusData.tag;
        console.log(`[commit] ✓ Head status retrieved successfully`);
        hasPendingCommits = (statusData.pendingCommits || 0) > 0;
        hasCommitted = (statusData.committed?.length || 0) > 0;
        // If head is Open, check if there are UTXOs in the head (means it's already been committed to)
        const hasUtxosInHead = Boolean(
          statusData.utxo &&
            typeof statusData.utxo === "object" &&
            Object.keys(statusData.utxo).length > 0
        );
        // If head is Open, it means it's already been initialized and committed to
        // When head is Open, commits create deposit transactions that need to be collected
        // The /commit endpoint creates the deposit transaction, but the head needs to collect it
        isOpen = statusData.tag === "Open";
        const isOpenWithUtxos = isOpen && hasUtxosInHead;
        // For Open heads, we still use /commit endpoint, but it creates a deposit transaction
        // The head should automatically collect it once confirmed on-chain
        useIncrement = isOpen; // Track if this is an incremental commit (Open state)
        console.log(
          `[commit] ========== Head status check for ${party} ==========`
        );
        console.log(`[commit] Head tag: ${statusData.tag}`);
        console.log(
          `[commit] Pending commits: ${statusData.pendingCommits || 0}`
        );
        console.log(
          `[commit] Committed UTXOs: ${statusData.committed?.length || 0}`
        );
        console.log(
          `[commit] UTXOs in head: ${
            hasUtxosInHead ? Object.keys(statusData.utxo).length : 0
          }`
        );
        console.log(`[commit] Has pending commits: ${hasPendingCommits}`);
        console.log(`[commit] Has committed: ${hasCommitted}`);
        console.log(`[commit] Is Open: ${isOpen}`);
        console.log(`[commit] Is Open with UTXOs: ${isOpenWithUtxos}`);
        console.log(`[commit] Will use increment: ${useIncrement}`);

        // Validate that the head is in a state that allows commits
        // The head should be in "Initial" or "Open" state to allow commits
        // "Idle" state means the head hasn't been initialized yet
        if (headTag === "Idle") {
          console.error(
            `[commit] Head is in Idle state for ${party}. The head must be initialized before commits can be made.`
          );
          return res.status(400).json({
            error: "Head not initialized",
            message:
              "The Hydra head is in Idle state and has not been initialized. Please initialize the head using the 'Init' button before attempting to commit UTXOs.",
            headTag,
          });
        }

        // Check if head is in "Initial" state but might not have validator script on-chain yet
        // This can happen if initialization transaction hasn't been submitted or confirmed
        if (headTag === "Initial") {
          // Check if there's a pending initialization transaction
          // If the head is Initial but has no committed UTXOs and no pending commits,
          // it might mean the initialization transaction hasn't been submitted yet
          const hasCommitted = (statusData.committed?.length || 0) > 0;
          const hasPendingCommits = (statusData.pendingCommits || 0) > 0;

          if (!hasCommitted && !hasPendingCommits) {
            console.warn(
              `[commit] Head is in Initial state but has no committed UTXOs or pending commits. This might indicate the initialization transaction hasn't been submitted or confirmed yet.`
            );
            // Don't block the commit, but log a warning
            // The actual error will come from Hydra if the validator script is missing
          }
        }
      } else {
        console.warn(
          `[commit] Head status check failed with status: ${statusResponse.status}`
        );
      }
    } catch (statusErr) {
      console.warn(
        `[commit] Could not check head status, defaulting to commit:`,
        statusErr
      );
    }

    // Hydra API only has /commit endpoint (no /increment endpoint exists)
    // All commits use /commit regardless of head state
    // When head is Open, /commit creates a deposit transaction that the head will collect
    console.log(
      `[commit] ========== STEP 9: Calling Hydra Commit API ==========`
    );
    const endpoint = `/commit`;
    const commitUrl = `http://127.0.0.1:${port}${endpoint}`;
    console.log(`[commit] Endpoint: ${endpoint}`);
    console.log(`[commit] Full URL: ${commitUrl}`);
    console.log(
      `[commit] Head state: ${isOpen ? "Open" : "Initial/Initializing"}`
    );
    console.log(
      `[commit] Commit type: ${useIncrement ? "incremental" : "first"} commit`
    );
    console.log(`[commit] UTXO data being sent:`, {
      utxoKey: Object.keys(utxoData)[0],
      utxoValue: utxoData[Object.keys(utxoData)[0]]?.value,
    });

    if (isOpen) {
      console.log(
        `[commit] ⚠ IMPORTANT: When head is Open, commit creates a deposit transaction.`
      );
      console.log(
        `[commit] The deposit must be confirmed on-chain before the head can collect it.`
      );
      console.log(
        `[commit] The head should automatically collect it once confirmed (may take a few seconds).`
      );
    }

    // Send the full UTXO object to the commit/increment endpoint
    // The endpoint expects the UTXO in the format returned by cardano-cli query utxo
    const commitStartTime = Date.now();
    console.log(`[commit] Sending POST request to Hydra API...`);
    const response = await fetch(commitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(utxoData),
    });
    const commitTime = Date.now() - commitStartTime;
    console.log(`[commit] Hydra API response received in ${commitTime}ms`);
    console.log(`[commit] HTTP response status: ${response.status}`);
    console.log(
      `[commit] Response headers:`,
      Object.fromEntries(response.headers.entries())
    );

    if (!response.ok) {
      console.error(
        `[commit] ✗ Hydra API returned error status: ${response.status}`
      );
      const errorText = await response.text();
      console.error(
        `[commit] Error response body (first 1000 chars):`,
        errorText.substring(0, 1000)
      );
      console.error(
        `[commit] Error response length: ${errorText.length} bytes`
      );

      // Check if it's a script validation error (common for subsequent commits)
      const isScriptError =
        errorText.includes("ScriptFailedInWallet") ||
        errorText.includes("MissingScript");
      const isMissingScript = errorText.includes("MissingScript");
      const isNotEnoughFuel = errorText.includes("NotEnoughFuel");

      console.log(`[commit] Error analysis:`, {
        isScriptError,
        isMissingScript,
        isNotEnoughFuel,
      });

      // If it's a MissingScript error, the head may not be properly initialized
      if (isMissingScript) {
        console.error(`[commit] ✗ MissingScript error detected`);
        console.error(
          `[commit] This usually means the Hydra head was not properly initialized with the validator script.`
        );
        console.error(
          `[commit] Head state: ${headTag || "unknown"}, Has committed: ${
            hasCommitted || false
          }, Pending commits: ${hasPendingCommits || false}`
        );

        // Extract script hash from error if available
        const scriptHashMatch = errorText.match(
          /ScriptHash\s+"([a-fA-F0-9]+)"/
        );
        const scriptHash = scriptHashMatch ? scriptHashMatch[1] : null;

        const totalTime = Date.now() - startTime;
        console.log(
          `[commit] ========== COMMIT FAILED (${totalTime}ms) ==========`
        );

        let diagnosticMessage =
          "Commit failed: The Hydra validator script is missing on-chain.";
        let suggestions: string[] = [];

        if (headTag === "Initial" && !hasCommitted && !hasPendingCommits) {
          suggestions.push(
            "The head is in Initial state but the initialization transaction may not have been submitted to the chain.",
            "Please check if the initialization transaction was submitted and confirmed.",
            "You may need to re-initialize the head if the initialization transaction failed."
          );
        } else if (headTag === "Initial") {
          suggestions.push(
            "The head is initialized but the validator script may not be confirmed on-chain yet.",
            "Wait a few seconds for the initialization transaction to be confirmed, then try again.",
            "Check the head status to see if there are any pending initialization transactions."
          );
        } else {
          suggestions.push(
            "Ensure all parties have initialized the head using the 'Init' button.",
            "Wait for the head to be fully initialized before attempting to commit UTXOs.",
            "If the head was recently initialized, wait a few seconds for the transaction to be confirmed on-chain."
          );
        }

        return res.status(response.status).json({
          error: errorText || `HTTP error! status: ${response.status}`,
          status: response.status,
          isScriptError: true,
          isMissingScript: true,
          scriptHash: scriptHash || undefined,
          headTag: headTag || undefined,
          message: diagnosticMessage,
          suggestions,
          troubleshooting: {
            step1:
              "Check if all parties have clicked 'Init' and the initialization transaction was submitted",
            step2:
              "Wait for the initialization transaction to be confirmed on-chain (usually takes a few seconds)",
            step3:
              "Verify the head status shows it's ready for commits (not Idle)",
            step4: "If the issue persists, try re-initializing the head",
          },
        });
      }

      if (isNotEnoughFuel) {
        console.error(`[commit] ✗ NotEnoughFuel error detected`);
        console.error(
          `[commit] This usually means insufficient fees or collateral for the transaction.`
        );

        // Try to extract transaction details from error for better diagnostics
        // The error format is: TxIn (TxId {unTxId = SafeHash "..."}) (TxIx {unTxIx = N})
        const txInputMatches =
          errorText.match(
            /TxIn\s*\(TxId\s*\{unTxId\s*=\s*SafeHash\s+"([a-fA-F0-9]+)"\}\)\s*\(TxIx\s*\{unTxIx\s*=\s*(\d+)\}\)/g
          ) || [];

        // Also try to extract just the hash and index separately for more flexibility
        const hashMatches =
          errorText.match(/SafeHash\s+"([a-fA-F0-9]{64})"/g) || [];
        const indexMatches = errorText.match(/unTxIx\s*=\s*(\d+)/g) || [];

        console.error(
          `[commit] Transaction inputs from error (first 3):`,
          txInputMatches.slice(0, 3)
        );
        console.error(
          `[commit] Hash matches found: ${hashMatches.length}, Index matches: ${indexMatches.length}`
        );
        console.error(
          `[commit] Available UTXOs in wallet:`,
          Object.keys(allUtxos).slice(0, 5)
        );

        // Check if Hydra is trying to use a UTXO that doesn't exist in the wallet
        let fuelUtxoIssue = false;
        let missingFuelUtxo: string | null = null;
        let missingFuelUtxoIndex: number | null = null;

        // First try to match full TxIn patterns
        for (const match of txInputMatches) {
          const hashMatch = match.match(/SafeHash\s+"([a-fA-F0-9]+)"/);
          const indexMatch = match.match(/unTxIx\s*=\s*(\d+)/);
          if (hashMatch && hashMatch[1]) {
            const txHash = hashMatch[1];
            const txIndex = indexMatch ? parseInt(indexMatch[1], 10) : null;
            const utxoKey = txIndex !== null ? `${txHash}#${txIndex}` : null;

            // Check if this UTXO exists in the wallet (case-insensitive)
            const utxoExists = utxoKey
              ? Object.keys(allUtxos).some(
                  (key) => key.toLowerCase() === utxoKey.toLowerCase()
                )
              : Object.keys(allUtxos).some((key) =>
                  key.toLowerCase().startsWith(txHash.toLowerCase())
                );

            if (!utxoExists) {
              fuelUtxoIssue = true;
              missingFuelUtxo = txHash;
              missingFuelUtxoIndex = txIndex;
              console.error(
                `[commit] ⚠️ Hydra is trying to use UTXO ${
                  utxoKey || txHash
                }... but it's not in the wallet's current UTXOs. This suggests Hydra's wallet state is stale.`
              );
              break;
            }
          }
        }

        // If no matches from full pattern, try extracting hashes directly
        if (!fuelUtxoIssue && hashMatches.length > 0) {
          for (const hashMatch of hashMatches) {
            const hash = hashMatch.match(/SafeHash\s+"([a-fA-F0-9]+)"/)?.[1];
            if (hash) {
              // Check if any UTXO in wallet starts with this hash
              const utxoExists = Object.keys(allUtxos).some((key) =>
                key.toLowerCase().startsWith(hash.toLowerCase())
              );
              if (!utxoExists) {
                fuelUtxoIssue = true;
                missingFuelUtxo = hash;
                console.error(
                  `[commit] ⚠️ Hydra is trying to use UTXO with hash ${hash.substring(
                    0,
                    16
                  )}... but it's not in the wallet's current UTXOs. This suggests Hydra's wallet state is stale.`
                );
                break;
              }
            }
          }
        }

        const totalTime = Date.now() - startTime;
        console.log(
          `[commit] ========== COMMIT FAILED (${totalTime}ms) ==========`
        );

        let diagnosticMessage =
          "Commit failed: Insufficient funds for transaction fees or collateral.";
        let suggestions: string[] = [];

        if (fuelUtxoIssue) {
          const missingUtxoKey =
            missingFuelUtxoIndex !== null
              ? `${missingFuelUtxo?.substring(
                  0,
                  16
                )}...#${missingFuelUtxoIndex}`
              : `${missingFuelUtxo?.substring(0, 16)}...`;
          diagnosticMessage = `Commit failed: Hydra is trying to use a fuel UTXO (${missingUtxoKey}) that doesn't exist or has been spent. This suggests Hydra's wallet state is out of sync with the chain. The fuel UTXO was likely created during initialization but has since been spent or moved.`;
          suggestions.push(
            "Hydra's internal wallet state is stale - the fuel UTXO it's trying to use was from the initialization transaction but has since been spent",
            "This is a known issue: Hydra maintains an internal wallet state that can become stale after transactions",
            "Wait a few seconds and try again - Hydra may need to sync its wallet state from the chain",
            "Try refreshing your wallet UTXOs in the UI to see the current state",
            "If the issue persists, you may need to restart the Hydra node to refresh its wallet state",
            "As a workaround, try committing a different UTXO or wait for Hydra to automatically refresh its state"
          );
        } else {
          suggestions.push(
            "Ensure the UTXO has sufficient ADA (at least 2-3 ADA recommended for fees and collateral)",
            "Try committing a larger UTXO that has more funds",
            "Check your wallet balance and ensure you have enough funds",
            "In Conway era, transactions require collateral for Plutus script validation"
          );
        }

        return res.status(response.status).json({
          error: errorText || `HTTP error! status: ${response.status}`,
          status: response.status,
          isScriptError: false,
          isNotEnoughFuel: true,
          isFuelUtxoIssue: fuelUtxoIssue,
          missingFuelUtxo: missingFuelUtxo || undefined,
          missingFuelUtxoIndex:
            missingFuelUtxoIndex !== null ? missingFuelUtxoIndex : undefined,
          missingFuelUtxoKey:
            fuelUtxoIssue && missingFuelUtxo && missingFuelUtxoIndex !== null
              ? `${missingFuelUtxo}#${missingFuelUtxoIndex}`
              : fuelUtxoIssue && missingFuelUtxo
              ? missingFuelUtxo
              : undefined,
          message: diagnosticMessage,
          suggestions,
          troubleshooting: fuelUtxoIssue
            ? {
                step1:
                  "This is a wallet state sync issue - Hydra's view of your wallet UTXOs is stale",
                step2:
                  "The fuel UTXO Hydra is trying to use was from the initialization transaction but has since been spent",
                step3:
                  "Try waiting a few seconds and refreshing your wallet UTXOs - Hydra may auto-sync",
                step4:
                  "If the issue persists, restart the Hydra node to refresh its wallet state",
                step5:
                  "This is a known limitation: Hydra maintains internal wallet state that can become stale",
              }
            : {
                step1:
                  "Verify the UTXO has at least 2-3 ADA (not just the minimum 1 ADA)",
                step2: "Try selecting a different UTXO with more funds",
                step3: "Check if your wallet has sufficient balance for fees",
              },
        });
      }

      const totalTime = Date.now() - startTime;
      console.log(
        `[commit] ========== COMMIT FAILED (${totalTime}ms) ==========`
      );
      return res.status(response.status).json({
        error: errorText || `HTTP error! status: ${response.status}`,
        status: response.status,
        isScriptError,
        message: isScriptError
          ? "Commit failed: The Hydra validator script may be missing. This can happen if the head state changed or if you're committing multiple UTXOs in quick succession. Try waiting a moment and committing again, or check the head status."
          : undefined,
      });
    }

    console.log(
      `[commit] ========== STEP 10: Processing Success Response ==========`
    );
    const data = await response.json();
    console.log(`[commit] ✓ Hydra API returned success`);
    console.log(`[commit] Response data:`, {
      hasCborHex: !!data.cborHex,
      txId: data.txId,
      type: data.type,
      description: data.description,
      cborHexLength: data.cborHex?.length,
    });

    // Check if the response indicates the commit was actually accepted
    // Some Hydra nodes might return a transaction even if the commit can't be processed
    if (!data.cborHex) {
      console.error(`[commit] ✗ Commit response missing cborHex`);
      console.error(`[commit] Response data:`, data);
      const totalTime = Date.now() - startTime;
      console.log(
        `[commit] ========== COMMIT FAILED (${totalTime}ms) ==========`
      );
      return res.status(500).json({
        error: "Commit response missing transaction data",
        details: data,
      });
    }

    console.log(`[commit] ✓ Transaction data validated`);
    console.log(`[commit] Transaction ID: ${data.txId}`);
    console.log(`[commit] Transaction type: ${data.type || "unknown"}`);
    console.log(
      `[commit] Transaction description: ${data.description || "none"}`
    );
    console.log(`[commit] CBOR hex length: ${data.cborHex.length} bytes`);

    // The commit endpoint returns the transaction directly (not wrapped in a "transaction" object)
    // Format: { "cborHex": "...", "txId": "...", "type": "...", "description": "..." }
    // We'll wrap it in a "transaction" object for consistency with the frontend expectations
    const totalTime = Date.now() - startTime;
    console.log(
      `[commit] ========== COMMIT SUCCESS (${totalTime}ms) ==========`
    );
    console.log(`[commit] Summary:`, {
      party: partyStr,
      utxo: utxoSanitized,
      txId: data.txId,
      headState: isOpen ? "Open" : "Initial/Initializing",
      totalTimeMs: totalTime,
    });

    return res.status(200).json({
      transaction: {
        cborHex: data.cborHex,
        txId: data.txId,
      },
      type: data.type,
      description: data.description,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(
      `[commit] ========== COMMIT EXCEPTION (${totalTime}ms) ==========`
    );
    console.error(`[commit] Exception for party ${partyStr}:`, error);
    if (error instanceof Error) {
      console.error(`[commit] Error message: ${error.message}`);
      console.error(`[commit] Error stack:`, error.stack);
    }
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to commit UTXO",
    });
  }
}
