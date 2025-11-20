import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { promises as fs } from "fs";
import { performance } from "perf_hooks";
import { CARDANO_ROOT, TMP_ROOT } from "../../../server/constants";
import { ensureDir, pathExists } from "../../../server/fs-utils";
import { runCommand } from "../../../server/process-utils";

const CARDANO_CLI = path.join(CARDANO_ROOT, "bin", "cardano-cli");
const CARDANO_NODE_SOCKET = path.join(CARDANO_ROOT, "node.socket");
const WALLET_BASE = path.join(TMP_ROOT, "wallets");
const PROTOCOL_PARAMS = path.join(CARDANO_ROOT, "protocol-parameters.json");

interface SplitUtxoRequest {
  walletLabel?: string;
  walletId?: string;
  walletAddress?: string;
  utxoRef: string; // Format: "txHash#txIx"
  outputs: Array<{ address: string; amount: string }>; // amount in ADA
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const totalStart = performance.now();
  console.log(`[wallet:split-utxo] ========== SPLIT UTXO REQUEST START ==========`);
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!(await pathExists(CARDANO_CLI))) {
      return res.status(500).json({
        error:
          "cardano-cli not found. Please download required software to .cardano/bin",
      });
    }

    const { walletLabel, walletId, walletAddress, utxoRef, outputs }: SplitUtxoRequest = req.body;

    if ((!walletId && !walletLabel) || !utxoRef || !outputs || outputs.length === 0) {
      return res.status(400).json({
        error: "walletId or walletLabel, utxoRef, and outputs are required",
      });
    }

    // Find the wallet directory
    let walletDir: string | null = null;
    let walletName: string | null = null;

    if (walletLabel) {
      const dir = path.join(WALLET_BASE, walletLabel);
      const metaFile = path.join(dir, "wallet.json");
      if (await pathExists(metaFile)) {
        walletDir = dir;
        walletName = walletLabel;
      }
    }

    if (!walletDir && walletId) {
      const walletDirs = await fs.readdir(WALLET_BASE);
      for (const dirName of walletDirs) {
        const dir = path.join(WALLET_BASE, dirName);
        const metaFile = path.join(dir, "wallet.json");
        try {
          const meta = JSON.parse(await fs.readFile(metaFile, "utf8"));
          if (meta.id === walletId) {
            walletDir = dir;
            walletName = dirName;
            break;
          }
        } catch {
          // Continue searching
        }
      }
    }

    if (!walletDir || !walletName) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    const paymentSkey = path.join(walletDir, "payment.skey");
    const paymentVkey = path.join(walletDir, "payment.vkey");
    const addressFile = path.join(walletDir, "address.txt");

    if (!(await pathExists(paymentSkey)) || !(await pathExists(paymentVkey))) {
      return res.status(404).json({ error: "Wallet keys not found" });
    }

    // Use provided address if available, otherwise read from file
    const fromAddress = walletAddress || (await fs.readFile(addressFile, "utf8")).trim();

    // Check if socket exists
    const socketExists = await pathExists(CARDANO_NODE_SOCKET);
    if (!socketExists) {
      return res.status(400).json({
        error: "Cardano node socket not found. Is the node running?",
      });
    }

    // Parse UTXO reference
    const [txHash, txIx] = utxoRef.split("#");
    if (!txHash || !txIx) {
      return res.status(400).json({ error: "Invalid utxoRef format. Expected: txHash#txIx" });
    }

    // Query UTXOs for the wallet address to find the specific UTXO
    const utxoQueryStart = performance.now();
    console.log(`[wallet:split-utxo] Querying UTXOs for ${fromAddress}...`);
    const utxoResult = await runCommand(
      CARDANO_CLI,
      [
        "query",
        "utxo",
        "--address",
        fromAddress,
        "--testnet-magic",
        "1",
        "--socket-path",
        CARDANO_NODE_SOCKET,
      ],
      {
        env: {
          ...process.env,
          CARDANO_NODE_SOCKET_PATH: CARDANO_NODE_SOCKET,
        },
      }
    );
    const utxoQueryTime = performance.now() - utxoQueryStart;
    console.log(`[wallet:split-utxo] UTXO query completed in ${utxoQueryTime.toFixed(2)}ms`);

    const utxoOutput = utxoResult.stdout || "";
    let utxoLovelace = BigInt(0);

    // Parse UTXO value - find the specific UTXO by reference
    if (utxoOutput.trim().startsWith("{")) {
      try {
        const utxoJson = JSON.parse(utxoOutput);
        const utxoKey = Object.keys(utxoJson).find(key => key === utxoRef);
        if (utxoKey && utxoJson[utxoKey]?.value?.lovelace) {
          utxoLovelace = BigInt(utxoJson[utxoKey].value.lovelace);
        }
      } catch (e) {
        console.error(`[wallet:split-utxo] Failed to parse UTXO JSON:`, e);
      }
    } else {
      // Parse text format (fallback)
      const lines = utxoOutput.split("\n");
      for (const line of lines) {
        if (line.includes(utxoRef)) {
          const lovelaceMatch = line.match(/(\d+)\s+lovelace/);
          if (lovelaceMatch) {
            utxoLovelace = BigInt(lovelaceMatch[1]);
            break;
          }
        }
      }
    }

    if (utxoLovelace === BigInt(0)) {
      return res.status(400).json({ error: "UTXO not found or has no value" });
    }

    // Minimum UTXO threshold is 1 ADA (1,000,000 lovelace)
    const MIN_UTXO_LOVELACE = BigInt(1_000_000);
    
    // Convert output amounts to lovelace and calculate total
    const outputLovelaces = outputs.map(out => BigInt(Math.floor(parseFloat(out.amount) * 1_000_000)));
    const totalOutputLovelace = outputLovelaces.reduce((sum, val) => sum + val, BigInt(0));
    
    // Validate each output meets minimum UTXO threshold
    for (let i = 0; i < outputLovelaces.length; i++) {
      if (outputLovelaces[i] < MIN_UTXO_LOVELACE) {
        return res.status(400).json({
          error: `Output ${i + 1} (${outputs[i].amount} ADA) is below minimum UTXO threshold of 1 ADA. Each output must be at least 1 ADA.`,
        });
      }
    }
    
    // Estimate transaction fee (roughly 0.3 ADA for 3 outputs)
    const estimatedFee = BigInt(300_000);
    const requiredTotal = totalOutputLovelace + estimatedFee;
    
    // Check if we have enough funds (accounting for fees and potential change output)
    // We need at least the outputs + fees, and ideally leave room for a valid change output
    if (utxoLovelace < requiredTotal) {
      return res.status(400).json({
        error: `Insufficient funds. UTXO has ${(Number(utxoLovelace) / 1_000_000).toFixed(2)} ADA, but need ${(Number(requiredTotal) / 1_000_000).toFixed(2)} ADA for outputs + fees.`,
      });
    }
    
    // If there will be change, ensure it meets minimum UTXO threshold
    const potentialChange = utxoLovelace - totalOutputLovelace;
    // Note: actual change will be less after fees, but we validate after build if needed

    // Build transaction with multiple outputs
    const buildStart = performance.now();
    const txBodyFile = path.join(walletDir, `split-${Date.now()}.raw`);
    
    // Build tx-out arguments for all outputs
    const buildArgs = [
      "conway",
      "transaction",
      "build",
      "--testnet-magic",
      "1",
      "--socket-path",
      CARDANO_NODE_SOCKET,
      "--tx-in",
      utxoRef,
    ];

    // Add all outputs
    outputs.forEach((out, idx) => {
      const lovelace = outputLovelaces[idx];
      buildArgs.push("--tx-out", `${out.address}+${lovelace.toString()}`);
    });

    // Change address (any remaining funds after fees)
    buildArgs.push("--change-address", fromAddress);
    buildArgs.push("--out-file", txBodyFile);

    if (await pathExists(PROTOCOL_PARAMS)) {
      buildArgs.push("--protocol-params-file", PROTOCOL_PARAMS);
    }

    console.log(`[wallet:split-utxo] Building transaction with ${outputs.length} outputs...`);
    try {
      await runCommand(CARDANO_CLI, buildArgs, {
        env: {
          ...process.env,
          CARDANO_NODE_SOCKET_PATH: CARDANO_NODE_SOCKET,
        },
      });
    } catch (error: any) {
      await fs.unlink(txBodyFile).catch(() => {});
      const errorMessage = error.message || error.stderr || String(error);
      
      // Check for minimum UTXO threshold error
      if (errorMessage.includes("minimum UTXO threshold") || errorMessage.includes("minUTxOValue")) {
        return res.status(400).json({
          error: `Transaction failed: Change output is below minimum UTXO threshold of 1 ADA. The wallet needs more funds to split into 3 UTXOs. Each UTXO (including change) must be at least 1 ADA.`,
        });
      }
      
      return res.status(500).json({
        error: `Failed to build transaction: ${errorMessage}`,
      });
    }
    const buildTime = performance.now() - buildStart;
    console.log(`[wallet:split-utxo] Transaction build completed in ${buildTime.toFixed(2)}ms`);

    // Sign transaction
    const signStart = performance.now();
    const txSignedFile = path.join(walletDir, `split-${Date.now()}.signed`);
    
    console.log(`[wallet:split-utxo] Signing transaction...`);
    try {
      await runCommand(
        CARDANO_CLI,
        [
          "conway",
          "transaction",
          "sign",
          "--tx-body-file",
          txBodyFile,
          "--signing-key-file",
          paymentSkey,
          "--testnet-magic",
          "1",
          "--out-file",
          txSignedFile,
        ],
        {
          env: {
            ...process.env,
            CARDANO_NODE_SOCKET_PATH: CARDANO_NODE_SOCKET,
          },
        }
      );
    } catch (error: any) {
      await fs.unlink(txBodyFile).catch(() => {});
      await fs.unlink(txSignedFile).catch(() => {});
      return res.status(500).json({
        error: `Failed to sign transaction: ${error.message || error}`,
      });
    }
    const signTime = performance.now() - signStart;
    console.log(`[wallet:split-utxo] Transaction signing completed in ${signTime.toFixed(2)}ms`);

    // Submit transaction
    const submitStart = performance.now();
    console.log(`[wallet:split-utxo] Submitting transaction...`);
    let submitOutput = "";
    try {
      const submitResult = await runCommand(
        CARDANO_CLI,
        [
          "conway",
          "transaction",
          "submit",
          "--tx-file",
          txSignedFile,
          "--testnet-magic",
          "1",
          "--socket-path",
          CARDANO_NODE_SOCKET,
        ],
        {
          env: {
            ...process.env,
            CARDANO_NODE_SOCKET_PATH: CARDANO_NODE_SOCKET,
          },
        }
      );
      submitOutput = submitResult.stdout || "";
    } catch (error: any) {
      await fs.unlink(txBodyFile).catch(() => {});
      await fs.unlink(txSignedFile).catch(() => {});
      return res.status(500).json({
        error: `Failed to submit transaction: ${error.message || error}`,
      });
    }
    const submitTime = performance.now() - submitStart;
    console.log(`[wallet:split-utxo] Transaction submission completed in ${submitTime.toFixed(2)}ms`);

    // Clean up temp files
    try {
      await fs.unlink(txBodyFile);
      await fs.unlink(txSignedFile);
    } catch {
      // Ignore cleanup errors
    }

    const totalTime = performance.now() - totalStart;
    console.log(`[wallet:split-utxo] ========== SPLIT UTXO COMPLETE (${totalTime.toFixed(2)}ms) ==========`);

    return res.status(200).json({
      success: true,
      message: `Successfully split UTXO into ${outputs.length} outputs`,
      txHash: submitOutput.trim() || "Submitted",
    });
  } catch (error: any) {
    console.error(`[wallet:split-utxo] Error:`, error);
    return res.status(500).json({
      error: error.message || "Failed to split UTXO",
    });
  }
}

