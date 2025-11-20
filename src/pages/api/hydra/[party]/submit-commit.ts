import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { CARDANO_ROOT } from "../../../../server/constants";

const execAsync = promisify(exec);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { party } = req.query;
  const { transaction } = req.body;

  const partyStr = String(party).trim();
  if (!partyStr) {
    console.error(`[submit-commit] Missing party parameter`);
    return res.status(400).json({ error: "Missing party parameter" });
  }

  // Validate party name to prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(partyStr)) {
    return res.status(400).json({
      error:
        "Invalid party name. Only alphanumeric characters, hyphens, and underscores are allowed.",
    });
  }

  console.log(`[submit-commit] Received commit request for ${partyStr}`);
  console.log(`[submit-commit] Transaction data:`, {
    hasCborHex: !!transaction?.cborHex,
    cborHexLength: transaction?.cborHex?.length,
    txId: transaction?.txId,
  });

  if (!transaction || !transaction.cborHex) {
    console.error(`[submit-commit] Missing transaction or cborHex`);
    return res
      .status(400)
      .json({ error: "Transaction with cborHex is required" });
  }

  try {
    // Use CARDANO_ROOT from constants, with fallback for backward compatibility
    const cardanoCliPath =
      process.env.CARDANO_CLI_PATH ||
      path.join(CARDANO_ROOT, "bin", "cardano-cli");

    // Get the signing key for the party from the new wallet structure
    const walletKeyPath = path.join(
      process.cwd(),
      ".tmp/wallets",
      partyStr,
      "payment.skey"
    );

    // Fallback to old credentials path for backward compatibility (if using external cardano-preprod-node)
    const oldKeyPath = process.env.CARDANO_CREDENTIALS_PATH
      ? path.join(process.env.CARDANO_CREDENTIALS_PATH, `${partyStr}-funds.sk`)
      : null;

    let fundsKeyPath: string | null = null;
    if (fs.existsSync(walletKeyPath)) {
      fundsKeyPath = walletKeyPath;
    } else if (oldKeyPath && fs.existsSync(oldKeyPath)) {
      fundsKeyPath = oldKeyPath;
    }

    if (!fundsKeyPath) {
      return res.status(500).json({
        error: `Payment signing key not found for ${partyStr}`,
        checkedPaths: oldKeyPath
          ? [walletKeyPath, oldKeyPath]
          : [walletKeyPath],
      });
    }

    // Create temporary files for the transaction
    const tempDir = "/tmp";
    const timestamp = Date.now();
    const txBodyFile = path.join(
      tempDir,
      `commit-tx-${partyStr}-${timestamp}.raw`
    );
    const txSignedFile = path.join(
      tempDir,
      `commit-tx-${partyStr}-${timestamp}.signed`
    );

    // The commit transaction from Hydra is already a complete transaction in CBOR format
    // cardano-cli transaction sign expects a TextEnvelope JSON format, not raw CBOR
    // We need to wrap the CBOR hex in a TextEnvelope structure
    const cborHex = transaction.cborHex;
    console.log(
      `[submit-commit] Creating TextEnvelope for transaction (CBOR length: ${cborHex.length})`
    );

    // Get wallet address to query for collateral UTXOs
    const walletAddressFile = path.join(
      process.cwd(),
      ".tmp/wallets",
      partyStr,
      "payment.addr"
    );

    // Fallback to old address path
    const oldAddressPath = process.env.CARDANO_CREDENTIALS_PATH
      ? path.join(
          process.env.CARDANO_CREDENTIALS_PATH,
          `${partyStr}-funds.addr`
        )
      : null;

    let walletAddress: string | null = null;
    if (fs.existsSync(walletAddressFile)) {
      walletAddress = fs.readFileSync(walletAddressFile, "utf-8").trim();
    } else if (oldAddressPath && fs.existsSync(oldAddressPath)) {
      walletAddress = fs.readFileSync(oldAddressPath, "utf-8").trim();
    }

    // Try multiple possible socket paths
    const possibleSocketPaths = [
      path.join(process.cwd(), ".cardano/node.socket"),
      path.join(process.cwd(), "../cardano-preprod-node/node.socket"),
      process.env.CARDANO_NODE_SOCKET_PATH,
    ].filter(Boolean) as string[];

    let socketPath: string | null = null;
    for (const possiblePath of possibleSocketPaths) {
      if (fs.existsSync(possiblePath)) {
        socketPath = possiblePath;
        break;
      }
    }

    if (!socketPath) {
      return res.status(503).json({
        error:
          "Cardano node socket not found. Please ensure the Cardano node is running.",
        checkedPaths: possibleSocketPaths,
      });
    }

    // Find a collateral UTXO (needs at least 5 ADA for safety)
    let collateralUtxo: string | null = null;
    const minCollateralAda = 5;
    const minCollateralLovelace = minCollateralAda * 1000000;

    if (walletAddress) {
      try {
        const escapeShell = (str: string) =>
          `'${str.replace(/'/g, "'\"'\"'")}'`;
        const queryCmd =
          `${escapeShell(cardanoCliPath)} query utxo ` +
          `--address ${escapeShell(walletAddress)} ` +
          `--testnet-magic 1 ` +
          `--socket-path ${escapeShell(socketPath)} ` +
          `--out-file /dev/stdout`;

        console.log(`[submit-commit] Querying wallet UTXOs for collateral...`);
        const { stdout: utxoJson } = await execAsync(queryCmd);
        const utxos = JSON.parse(utxoJson);

        // Find the first UTXO with enough value for collateral
        for (const [utxoRef, utxoData] of Object.entries(utxos)) {
          const value = (utxoData as any).value;
          const lovelace =
            typeof value === "number" ? value : value?.lovelace || 0;

          if (lovelace >= minCollateralLovelace) {
            collateralUtxo = utxoRef;
            console.log(
              `[submit-commit] Found collateral UTXO: ${collateralUtxo} (${
                lovelace / 1000000
              } ADA)`
            );
            break;
          }
        }

        if (!collateralUtxo) {
          console.warn(
            `[submit-commit] No suitable collateral UTXO found (need at least ${minCollateralAda} ADA)`
          );
        }
      } catch (collateralError) {
        console.warn(
          `[submit-commit] Could not find collateral UTXO:`,
          collateralError
        );
        // Continue without collateral - transaction might not need it
      }
    }

    // Create TextEnvelope JSON format that cardano-cli expects
    const textEnvelope = {
      type: transaction.type || "Tx ConwayEra",
      description: transaction.description || "",
      cborHex: cborHex,
    };

    fs.writeFileSync(txBodyFile, JSON.stringify(textEnvelope, null, 2));
    console.log(
      `[submit-commit] Wrote transaction TextEnvelope to: ${txBodyFile}`
    );

    // Sign the transaction using --tx-file (for complete transactions)
    // The transaction from Hydra is already a complete unsigned transaction
    // Escape paths for shell safety (all paths come from path.join, but escape for extra safety)
    const escapeShell = (str: string) => `'${str.replace(/'/g, "'\"'\"'")}'`;

    // Build sign command with collateral if available
    let signCmd =
      `${escapeShell(cardanoCliPath)} conway transaction sign ` +
      `--tx-file ${escapeShell(txBodyFile)} ` +
      `--signing-key-file ${escapeShell(fundsKeyPath)} ` +
      `--testnet-magic 1 ` +
      `--out-file ${escapeShell(txSignedFile)}`;

    // Note: We can't add collateral during signing - it must be in the transaction body
    // The transaction from Hydra should already include collateral if needed
    // If it doesn't, we'll need to rebuild it (complex - would require decoding CBOR)
    // For now, we'll try to submit and see if it works

    console.log(
      `[submit-commit] Signing commit transaction for ${partyStr}...`
    );
    console.log(`[submit-commit] Sign command: ${signCmd}`);
    const { stdout: signOutput, stderr: signError } = await execAsync(signCmd);
    console.log(`[submit-commit] Sign output:`, signOutput || "none");
    if (signError) {
      console.log(`[submit-commit] Sign stderr:`, signError);
    }
    if (signError && !signOutput) {
      console.error(`[submit-commit] Sign error: ${signError}`);
      // Clean up and return error
      try {
        if (fs.existsSync(txBodyFile)) fs.unlinkSync(txBodyFile);
      } catch (e) {}
      return res.status(500).json({
        error: "Failed to sign transaction",
        details: signError,
      });
    }

    const submitCmd =
      `${escapeShell(cardanoCliPath)} conway transaction submit ` +
      `--tx-file ${escapeShell(txSignedFile)} ` +
      `--testnet-magic 1 ` +
      `--socket-path ${escapeShell(socketPath)}`;

    console.log(
      `[submit-commit] Submitting commit transaction for ${partyStr}...`
    );
    console.log(`[submit-commit] Submit command: ${submitCmd}`);
    console.log(`[submit-commit] Socket path: ${socketPath}`);
    const { stdout: submitOutput, stderr: submitError } = await execAsync(
      submitCmd
    );
    console.log(`[submit-commit] Submit output:`, submitOutput || "none");
    if (submitError) {
      console.log(`[submit-commit] Submit stderr:`, submitError);
    }

    // Clean up temporary files
    try {
      if (fs.existsSync(txBodyFile)) fs.unlinkSync(txBodyFile);
      if (fs.existsSync(txSignedFile)) fs.unlinkSync(txSignedFile);
    } catch (cleanupError) {
      console.warn(`[submit-commit] Cleanup error: ${cleanupError}`);
    }

    if (submitError && !submitOutput) {
      console.error(`[submit-commit] Submit error: ${submitError}`);

      // Parse error to provide better feedback
      const errorStr = String(submitError);
      let errorMessage = "Failed to submit transaction";
      let isCollateralError = false;
      let isBadInputError = false;
      let isValueMismatchError = false;

      if (
        errorStr.includes("InsufficientCollateral") ||
        errorStr.includes("NoCollateralInputs")
      ) {
        isCollateralError = true;
        errorMessage =
          "Transaction is missing collateral inputs. This is a known issue with Hydra commit transactions in Conway era. The transaction needs collateral for Plutus script validation, but Hydra doesn't include it. Please ensure your wallet has at least 5 ADA available for collateral, and try refreshing your wallet UTXOs before committing.";
      } else if (errorStr.includes("BadInputsUTxO")) {
        isBadInputError = true;
        errorMessage =
          "The UTXO being committed may have already been spent or doesn't exist. Please refresh your wallet UTXOs and try again with a different UTXO.";
      } else if (errorStr.includes("ValueNotConservedUTxO")) {
        isValueMismatchError = true;
        errorMessage =
          "Transaction value mismatch. The UTXO being committed may have been spent or the transaction is invalid. Please refresh your wallet UTXOs and try again.";
      } else if (errorStr.includes("TranslationLogicMissingInput")) {
        isBadInputError = true;
        errorMessage =
          "Transaction references a UTXO that doesn't exist or has been spent. Please refresh your wallet UTXOs and try again.";
      }

      return res.status(500).json({
        error: errorMessage,
        details: submitError,
        isCollateralError,
        isBadInputError,
        isValueMismatchError,
        suggestion: isCollateralError
          ? "This is a limitation of the current Hydra implementation. The commit transaction needs to be rebuilt with collateral inputs, which requires modifying the transaction CBOR. As a workaround, try committing a different UTXO or ensure your wallet has sufficient funds."
          : isBadInputError || isValueMismatchError
          ? "Refresh your wallet UTXOs and try committing a different UTXO that hasn't been spent."
          : undefined,
      });
    }

    console.log(
      `[submit-commit] Commit transaction submitted successfully for ${partyStr}`
    );
    return res.status(200).json({
      success: true,
      message: "Commit transaction submitted to mainchain",
      output: submitOutput || "Transaction submitted",
    });
  } catch (error) {
    console.error(`[submit-commit] Error:`, error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to submit commit transaction",
    });
  }
}
