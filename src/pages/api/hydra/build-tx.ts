import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import { TMP_ROOT } from "../../../server/constants";

const execAsync = promisify(exec);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const startTime = performance.now();
  const requestTimestamp = new Date().toISOString();
  console.log(`[build-tx] ========== BUILD-TX API START ==========`);
  console.log(
    `[build-tx] ${req.method} request received at ${requestTimestamp}`
  );

  if (req.method !== "POST") {
    console.log(`[build-tx] Method not allowed: ${req.method}`);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const parseStart = performance.now();
  const { fromParty, toParty, utxoRef, utxo, targetAddress, sendHalf } =
    req.body;
  const parseEnd = performance.now();
  console.log(
    `[build-tx] Request body parsed in ${(parseEnd - parseStart).toFixed(2)}ms`
  );
  console.log(`[build-tx] Request params:`, {
    fromParty,
    toParty,
    utxoRef,
    targetAddress,
    lovelace: utxo?.value?.lovelace,
    sendHalf: sendHalf || false,
  });

  if (!fromParty || !toParty || !utxoRef || !utxo || !targetAddress) {
    console.error(`[build-tx] Missing required parameters:`, {
      fromParty,
      toParty,
      utxoRef,
      hasUtxo: !!utxo,
      targetAddress,
    });
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Parse UTXO reference (format: txHash#index)
    const parseUtxoStart = performance.now();
    const [txHash, index] = utxoRef.split("#");
    if (!txHash || !index) {
      console.error(`[build-tx] Invalid UTXO reference format: ${utxoRef}`);
      return res.status(400).json({
        error: "Invalid UTXO reference format. Expected: txHash#index",
      });
    }

    const totalLovelace = utxo.value?.lovelace || 0;
    const sendLovelace = sendHalf
      ? Math.floor(totalLovelace / 2)
      : totalLovelace;
    const changeLovelace = sendHalf ? totalLovelace - sendLovelace : 0;
    const amountAda = sendLovelace / 1000000;
    const changeAda = changeLovelace / 1000000;
    const parseUtxoEnd = performance.now();
    console.log(
      `[build-tx] Parsed UTXO in ${(parseUtxoEnd - parseUtxoStart).toFixed(
        2
      )}ms: txHash=${txHash}, index=${index}, total=${(
        totalLovelace / 1000000
      ).toFixed(6)} ADA, sending=${amountAda.toFixed(6)} ADA${
        sendHalf ? `, change=${changeAda.toFixed(6)} ADA` : ""
      }`
    );

    // Path to cardano-cli (adjust based on your setup)
    const cardanoCliPath = path.join(
      process.cwd(),
      "../cardano-preprod-node/bin/cardano-cli"
    );
    console.log(`[build-tx] Cardano CLI path: ${cardanoCliPath}`);

    // Check if cardano-cli exists
    if (!fs.existsSync(cardanoCliPath)) {
      console.error(`[build-tx] cardano-cli not found at: ${cardanoCliPath}`);
      return res.status(501).json({
        error: "cardano-cli not found",
        instructions: {
          utxoRef,
          fromParty,
          toParty,
          targetAddress,
          amount: `${amountAda} ADA`,
          manualSteps: [
            `Build transaction: cardano-cli transaction build-raw`,
            `  --tx-in ${utxoRef}`,
            `--tx-out ${targetAddress}+${sendLovelace}`,
            `  --fee 0`,
            `Sign and submit to ${fromParty}'s head`,
          ],
        },
      });
    }

    // Determine which party actually owns the UTXO based on the address
    // In Hydra heads, all parties see the same UTXOs, so we need to check ownership
    const addressCheckStart = performance.now();
    let addressCheckEnd = addressCheckStart;
    const utxoAddress = utxo.address;
    console.log(
      `[build-tx] Starting address resolution at ${new Date().toISOString()}`
    );
    console.log(`[build-tx] UTXO address: ${utxoAddress}`);

    // Helper function to get address for any party - FAST: read from wallet file
    // No need to call cardano-cli - addresses are already stored in wallet files
    const getPartyAddress = (party: string): string | null => {
      const partyStart = performance.now();
      const addressFilePath = path.join(
        TMP_ROOT,
        "wallets",
        party,
        "address.txt"
      );

      if (!fs.existsSync(addressFilePath)) {
        console.warn(
          `[build-tx] Address file not found for ${party} at: ${addressFilePath}`
        );
        return null;
      }

      try {
        const address = fs.readFileSync(addressFilePath, "utf8").trim();
        const partyEnd = performance.now();
        console.log(
          `[build-tx] Read ${party}'s address from file in ${(
            partyEnd - partyStart
          ).toFixed(2)}ms (instant, no CLI call)`
        );
        return address;
      } catch (error: any) {
        console.warn(
          `[build-tx] Failed to read address for ${party}:`,
          error.message
        );
        return null;
      }
    };

    // Optimize for speed: Only get toParty's address (for output)
    // Trust fromParty owns the UTXO - if not, Hydra will reject it, but that's fine
    // This matches hydrafe's behavior and is much faster
    let actualOwner = fromParty;
    const partyAddresses: Record<string, string> = {};

    try {
      // Determine actual owner by comparing UTXO address with wallet addresses
      // Read all wallet addresses to find the owner (fast file reads, no CLI)
      const walletsDir = path.join(TMP_ROOT, "wallets");
      if (fs.existsSync(walletsDir)) {
        const walletDirs = fs
          .readdirSync(walletsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);

        // Read all addresses (file I/O, instant - no CLI calls!)
        for (const party of walletDirs) {
          const address = getPartyAddress(party);
          if (address) {
            partyAddresses[party] = address;
            // Check if this party owns the UTXO
            if (utxoAddress === address) {
              actualOwner = party;
              console.log(
                `[build-tx] UTXO belongs to ${party} (verified via address match)`
              );
            }
          }
        }
      }

      // Ensure we have toParty's address for the output
      if (!partyAddresses[toParty]) {
        const toPartyAddress = getPartyAddress(toParty);
        if (toPartyAddress) {
          partyAddresses[toParty] = toPartyAddress;
        }
      }

      addressCheckEnd = performance.now();
      console.log(
        `[build-tx] Address resolution completed in ${(
          addressCheckEnd - addressCheckStart
        ).toFixed(2)}ms (read from files, no CLI calls)`
      );
      console.log(`[build-tx] Actual owner: ${actualOwner}, To: ${toParty}`);
    } catch (error: any) {
      console.warn(
        `[build-tx] Could not read addresses, using ${fromParty} as owner:`,
        error.message
      );
      addressCheckEnd = performance.now();
    }

    // Determine the correct target address based on toParty
    let correctTargetAddress = targetAddress;
    if (toParty in partyAddresses) {
      correctTargetAddress = partyAddresses[toParty];
      console.log(
        `[build-tx] Sending to ${toParty}'s address: ${correctTargetAddress}`
      );
    } else {
      // Fallback to provided address if we couldn't fetch it
      console.log(`[build-tx] Using provided target address: ${targetAddress}`);
    }

    // Get the signing key for the actual owner
    const signingKeyPath = path.join(
      TMP_ROOT,
      "wallets",
      actualOwner,
      "payment.skey"
    );

    if (!fs.existsSync(signingKeyPath)) {
      console.error(
        `[build-tx] Payment signing key not found for ${actualOwner} at: ${signingKeyPath}`
      );
      return res.status(500).json({
        error: `Payment signing key not found for ${actualOwner}`,
        expectedPath: signingKeyPath,
      });
    }

    console.log(
      `[build-tx] Using payment signing key for ${actualOwner}: ${signingKeyPath}`
    );

    // For Hydra heads, transactions are simpler (no fees needed)
    // Build a raw transaction
    const tempDir = "/tmp";
    const timestamp = Date.now();
    const txBodyFile = path.join(tempDir, `tx-${timestamp}.raw`);
    const txSignedFile = path.join(tempDir, `tx-${timestamp}.signed`);

    // Build raw transaction
    // For Hydra heads, we use build-raw with fee 0 (no network needed for raw)
    // If sending half, we need to send change back to the owner
    const buildStart = performance.now();
    console.log(
      `[build-tx] Starting transaction build at ${new Date().toISOString()}`
    );
    let buildCmd =
      `${cardanoCliPath} conway transaction build-raw ` +
      `--tx-in ${utxoRef} ` +
      `--tx-out "${correctTargetAddress}+${sendLovelace}"`;

    // Add change output if sending half
    if (sendHalf && changeLovelace > 0) {
      // Get the owner's address for change (already have it from earlier)
      const ownerAddress = partyAddresses[actualOwner];
      if (ownerAddress) {
        buildCmd += ` --tx-out "${ownerAddress}+${changeLovelace}"`;
        console.log(
          `[build-tx] Adding change output: ${ownerAddress}+${changeLovelace}`
        );
      } else {
        console.warn(
          `[build-tx] Could not find address for ${actualOwner} to send change, skipping change output`
        );
      }
    }

    buildCmd += ` --fee 0 --out-file ${txBodyFile}`;

    console.log(`[build-tx] Building transaction with command: ${buildCmd}`);
    try {
      const cliBuildStart = performance.now();
      const buildResult = await execAsync(buildCmd);
      const cliBuildEnd = performance.now();
      console.log(
        `[build-tx] cardano-cli build-raw completed in ${(
          cliBuildEnd - cliBuildStart
        ).toFixed(2)}ms`
      );
      console.log(
        `[build-tx] Transaction built successfully. Output:`,
        buildResult.stdout
      );
    } catch (error: any) {
      console.error(`[build-tx] Failed to build transaction:`, error.message);
      console.error(`[build-tx] Command stderr:`, error.stderr);
      return res.status(500).json({
        error: "Failed to build transaction",
        details: error.message,
        command: buildCmd,
        stderr: error.stderr,
      });
    }

    // Sign the transaction with funds key only
    // Note: Hydra keys are for protocol operations, not transaction signing
    // cardano-cli doesn't support HydraSigningKey_ed25519 type
    const signStart = performance.now();
    let signEnd = signStart;
    console.log(
      `[build-tx] Starting transaction signing at ${new Date().toISOString()}`
    );
    const signCmd =
      `${cardanoCliPath} conway transaction sign ` +
      `--tx-body-file ${txBodyFile} ` +
      `--signing-key-file ${signingKeyPath} ` +
      `--out-file ${txSignedFile}`;

    console.log(`[build-tx] Signing transaction with command: ${signCmd}`);
    try {
      const cliSignStart = performance.now();
      const signResult = await execAsync(signCmd);
      const cliSignEnd = performance.now();
      console.log(
        `[build-tx] cardano-cli sign completed in ${(
          cliSignEnd - cliSignStart
        ).toFixed(2)}ms`
      );
      console.log(
        `[build-tx] Transaction signed successfully. Output:`,
        signResult.stdout
      );
      signEnd = performance.now();
      console.log(
        `[build-tx] Total signing time: ${(signEnd - signStart).toFixed(2)}ms`
      );
    } catch (error: any) {
      console.error(`[build-tx] Failed to sign transaction:`, error.message);
      console.error(`[build-tx] Command stderr:`, error.stderr);
      // Clean up temp file
      try {
        fs.unlinkSync(txBodyFile);
      } catch {}
      return res.status(500).json({
        error: "Failed to sign transaction",
        details: error.message,
        command: signCmd,
        stderr: error.stderr,
      });
    }

    // Read the signed transaction CBOR hex
    // cardano-cli outputs JSON with cborHex field
    let signedTxCbor: string;
    try {
      console.log(
        `[build-tx] Reading signed transaction from: ${txSignedFile}`
      );
      const signedTxContent = fs.readFileSync(txSignedFile, "utf8");
      console.log(
        `[build-tx] Signed transaction file content length: ${signedTxContent.length}`
      );
      const signedTx = JSON.parse(signedTxContent);
      console.log(
        `[build-tx] Parsed signed transaction keys:`,
        Object.keys(signedTx)
      );
      // Extract cborHex from the JSON response
      signedTxCbor = signedTx.cborHex || signedTx.cborWitness || signedTx;

      if (!signedTxCbor || typeof signedTxCbor !== "string") {
        console.error(
          `[build-tx] Invalid transaction format. Available keys:`,
          Object.keys(signedTx)
        );
        throw new Error("Invalid transaction format - cborHex not found");
      }
      console.log(
        `[build-tx] Extracted CBOR hex length: ${signedTxCbor.length}`
      );
    } catch (error: any) {
      console.error(
        `[build-tx] Failed to read signed transaction:`,
        error.message
      );
      return res.status(500).json({
        error: "Failed to read signed transaction",
        details: error.message,
        note: "Expected JSON with cborHex field from cardano-cli",
      });
    }

    // Clean up temp files
    try {
      fs.unlinkSync(txBodyFile);
      fs.unlinkSync(txSignedFile);
      console.log(`[build-tx] Cleaned up temp files`);
    } catch (err) {
      console.warn(`[build-tx] Failed to clean up temp files:`, err);
    }

    const buildEnd = performance.now();
    const totalDuration = buildEnd - startTime;
    console.log(
      `[build-tx] ========== BUILD-TX API COMPLETE (${totalDuration.toFixed(
        2
      )}ms) ==========`
    );
    const addressDuration =
      addressCheckEnd > addressCheckStart
        ? (addressCheckEnd - addressCheckStart).toFixed(2)
        : "0.00";
    console.log(
      `[build-tx] Breakdown: Parse=${(parseUtxoEnd - parseUtxoStart).toFixed(
        2
      )}ms, Address=${addressDuration}ms, Build=${(
        buildEnd - buildStart
      ).toFixed(2)}ms, Sign=${(signEnd - signStart).toFixed(2)}ms`
    );
    console.log(
      `[build-tx] Transaction CBOR hex (first 50 chars): ${signedTxCbor.substring(
        0,
        50
      )}...`
    );

    // Return the signed transaction CBOR hex
    return res.status(200).json({
      success: true,
      transaction: signedTxCbor,
      utxoRef,
      fromParty,
      actualOwner, // The party that actually owns the UTXO (may differ from fromParty)
      toParty,
      targetAddress: correctTargetAddress, // The actual address used
      amount: `${amountAda.toFixed(6)} ADA`,
      change:
        sendHalf && changeLovelace > 0 ? `${changeAda.toFixed(6)} ADA` : null,
      sendHalf: sendHalf || false,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[build-tx] Error after ${duration}ms:`, error);
    return res.status(500).json({
      error: "Failed to process transaction",
      details: error.message,
    });
  }
}
