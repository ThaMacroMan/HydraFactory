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

interface SendRequest {
  fromWalletId?: string; // UUID - for backward compatibility
  fromWalletLabel?: string; // Wallet label (directory name) - preferred
  fromWalletAddress?: string; // Wallet address - passed to avoid lookup
  toAddress: string;
  amount: string; // in ADA
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const totalStart = performance.now();
  console.log(`[wallet:send] ========== SEND REQUEST START ==========`);
  
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

    const { fromWalletId, fromWalletLabel, fromWalletAddress, toAddress, amount }: SendRequest = req.body;

    if ((!fromWalletId && !fromWalletLabel) || !toAddress || !amount) {
      return res.status(400).json({
        error: "fromWalletId or fromWalletLabel, toAddress, and amount are required",
      });
    }

    // Find the wallet directory - prefer label (directory name) for faster lookup
    let walletDir: string | null = null;
    let walletName: string | null = null;

    if (fromWalletLabel) {
      // Direct lookup by label (directory name) - much faster
      const dir = path.join(WALLET_BASE, fromWalletLabel);
      const metaFile = path.join(dir, "wallet.json");
      if (await pathExists(metaFile)) {
        walletDir = dir;
        walletName = fromWalletLabel;
      }
    }

    // Fallback to UUID lookup if label not provided or not found
    if (!walletDir && fromWalletId) {
      const walletDirs = await fs.readdir(WALLET_BASE);
      for (const dirName of walletDirs) {
        const dir = path.join(WALLET_BASE, dirName);
        const metaFile = path.join(dir, "wallet.json");
        try {
          const meta = JSON.parse(await fs.readFile(metaFile, "utf8"));
          if (meta.id === fromWalletId) {
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
      return res.status(404).json({ error: "Source wallet not found" });
    }

    const paymentSkey = path.join(walletDir, "payment.skey");
    const paymentVkey = path.join(walletDir, "payment.vkey");
    const addressFile = path.join(walletDir, "address.txt");

    if (!(await pathExists(paymentSkey)) || !(await pathExists(paymentVkey))) {
      return res.status(404).json({ error: "Wallet keys not found" });
    }

    // Use provided address if available, otherwise read from file
    const fromAddress = fromWalletAddress || (await fs.readFile(addressFile, "utf8")).trim();

    // Convert ADA to lovelace (1 ADA = 1,000,000 lovelace)
    const lovelace = Math.floor(parseFloat(amount) * 1_000_000);

    if (lovelace <= 0) {
      return res.status(400).json({ error: "Amount must be greater than 0" });
    }

    // Check if socket exists
    const socketExists = await pathExists(CARDANO_NODE_SOCKET);
    if (!socketExists) {
      return res.status(400).json({
        error: "Cardano node socket not found. Is the node running?",
      });
    }

    // Query UTxO - cardano-cli outputs JSON when stdout is not a TTY
    const utxoQueryStart = performance.now();
    console.log(`[wallet:send] Querying UTXO for ${fromAddress}...`);
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
        captureOutput: true,
        env: {
          ...process.env,
          CARDANO_NODE_SOCKET_PATH: CARDANO_NODE_SOCKET,
        },
      }
    );
    const utxoQueryTime = performance.now() - utxoQueryStart;
    console.log(`[wallet:send] UTXO query completed in ${utxoQueryTime.toFixed(2)}ms`);

    const utxoOutput = utxoResult.stdout || "";

    // Parse UTxO to find sufficient funds
    let totalLovelace = BigInt(0);
    const utxos: Array<{ txHash: string; txIx: string; lovelace: bigint }> = [];

    // Check if output is JSON format
    if (utxoOutput.trim().startsWith("{")) {
      try {
        const utxoJson = JSON.parse(utxoOutput);
        for (const utxoKey in utxoJson) {
          const utxo = utxoJson[utxoKey];
          if (utxo && utxo.value && utxo.value.lovelace) {
            const [txHash, txIx] = utxoKey.split("#");
            const lovelace = BigInt(utxo.value.lovelace);
            utxos.push({ txHash, txIx: txIx || "0", lovelace });
            totalLovelace += lovelace;
          }
        }
      } catch (parseError) {
        console.error("Failed to parse UTxO JSON:", parseError);
        return res.status(500).json({ error: "Failed to parse UTxO data" });
      }
    } else {
      // Parse text format (fallback)
      const utxoLines = utxoOutput.split("\n").filter((line) => line.trim());
      const utxoDataLines = utxoLines.slice(2); // Skip header lines

      for (const line of utxoDataLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const txHash = parts[0];
          const txIx = parts[1];
          const lovelaceMatch = line.match(/(\d+)\s+lovelace/);
          if (lovelaceMatch) {
            const lovelace = BigInt(lovelaceMatch[1]);
            utxos.push({ txHash, txIx, lovelace });
            totalLovelace += lovelace;
          }
        }
      }
    }

    if (utxos.length === 0) {
      return res.status(400).json({ error: "No UTxO found in source wallet" });
    }

    if (totalLovelace < BigInt(lovelace)) {
      return res.status(400).json({
        error: `Insufficient funds. Available: ${Number(totalLovelace) / 1_000_000} ADA, Requested: ${amount} ADA`,
      });
    }

    // Calculate fee (rough estimate, will be refined)
    const estimatedFee = 200_000; // 0.2 ADA
    const totalNeeded = BigInt(lovelace + estimatedFee);

    // Select UTxOs to cover the amount + fee
    const selectedUtxos: typeof utxos = [];
    let selectedTotal = BigInt(0);
    for (const utxo of utxos) {
      selectedUtxos.push(utxo);
      selectedTotal += utxo.lovelace;
      if (selectedTotal >= totalNeeded) break;
    }

    // Build transaction
    const txBodyFile = path.join(walletDir, "tx-body.tmp");
    const txSignedFile = path.join(walletDir, "tx-signed.tmp");

    // Build raw transaction
    const buildStart = performance.now();
    console.log(`[wallet:send] Building transaction...`);
    const buildArgs = [
      "conway",
      "transaction",
      "build",
      "--testnet-magic",
      "1",
      "--socket-path",
      CARDANO_NODE_SOCKET,
    ];

    // Add all selected UTxOs as inputs
    for (const utxo of selectedUtxos) {
      buildArgs.push("--tx-in", `${utxo.txHash}#${utxo.txIx}`);
    }

    // Add output to recipient
    // --change-address ensures any excess funds (after amount + fees) are returned to sender
    buildArgs.push(
      "--tx-out",
      `${toAddress}+${lovelace}`,
      "--change-address",
      fromAddress, // Change UTXOs are returned to the sending wallet
      "--out-file",
      txBodyFile
    );

    if (await pathExists(PROTOCOL_PARAMS)) {
      buildArgs.push("--protocol-params-file", PROTOCOL_PARAMS);
    }

    await runCommand(CARDANO_CLI, buildArgs, {
      env: {
        ...process.env,
        CARDANO_NODE_SOCKET_PATH: CARDANO_NODE_SOCKET,
      },
    });
    const buildTime = performance.now() - buildStart;
    console.log(`[wallet:send] Transaction build completed in ${buildTime.toFixed(2)}ms`);

    // Sign transaction
    const signStart = performance.now();
    console.log(`[wallet:send] Signing transaction...`);
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
    const signTime = performance.now() - signStart;
    console.log(`[wallet:send] Transaction signing completed in ${signTime.toFixed(2)}ms`);

    // Submit transaction
    const submitStart = performance.now();
    console.log(`[wallet:send] Submitting transaction...`);
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
        captureOutput: true,
        env: {
          ...process.env,
          CARDANO_NODE_SOCKET_PATH: CARDANO_NODE_SOCKET,
        },
      }
    );
    const submitTime = performance.now() - submitStart;
    console.log(`[wallet:send] Transaction submission completed in ${submitTime.toFixed(2)}ms`);

    // Clean up temp files
    try {
      await fs.unlink(txBodyFile);
      await fs.unlink(txSignedFile);
    } catch {
      // Ignore cleanup errors
    }

    const totalTime = performance.now() - totalStart;
    console.log(`[wallet:send] ========== SEND REQUEST SUCCESS ==========`);
    console.log(`[wallet:send] Total time: ${totalTime.toFixed(2)}ms`);
    
    return res.status(200).json({
      success: true,
      message: `Successfully sent ${amount} ADA to ${toAddress}`,
      txHash: submitResult.stdout?.trim() || "Transaction submitted",
    });
  } catch (error) {
    const totalTime = performance.now() - totalStart;
    console.error(`[wallet:send] ========== SEND REQUEST ERROR ==========`);
    console.error(`[wallet:send] Total time before error: ${totalTime.toFixed(2)}ms`);
    console.error("wallet:send", error);
    return res.status(500).json({ error: (error as Error).message });
  }
}

