import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { promises as fs } from "fs";
import { CARDANO_ROOT } from "../../../server/constants";
import { pathExists } from "../../../server/fs-utils";
import { runCommand } from "../../../server/process-utils";

const CARDANO_CLI = path.join(CARDANO_ROOT, "bin", "cardano-cli");
const CARDANO_NODE_SOCKET = path.join(CARDANO_ROOT, "node.socket");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { address } = req.query;

  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "Address is required" });
  }

  try {
    if (!(await pathExists(CARDANO_CLI))) {
      return res.status(500).json({
        error:
          "cardano-cli not found. Please download required software to .cardano/bin",
      });
    }

    // Check if socket exists
    const socketExists = await pathExists(CARDANO_NODE_SOCKET);
    if (!socketExists) {
      return res.status(200).json({
        address,
        lovelace: "0",
        ada: "0.000000",
        hasFunds: false,
        utxoCount: 0,
        error: "Cardano node socket not found. Is the node running?",
      });
    }

    // Query UTxO for the address
    const result = await runCommand(
      CARDANO_CLI,
      [
        "query",
        "utxo",
        "--address",
        address,
        "--testnet-magic",
        "1",
      ],
      {
        captureOutput: true,
        env: {
          ...process.env,
          CARDANO_NODE_SOCKET_PATH: CARDANO_NODE_SOCKET,
        },
      }
    );

    // Check for errors in stderr
    if (result.stderr && result.stderr.trim()) {
      console.error("cardano-cli query utxo error:", result.stderr);
      // If it's a connection error, return 0 balance with error message
      if (result.stderr.includes("connect") || result.stderr.includes("Connection")) {
        return res.status(200).json({
          address,
          lovelace: "0",
          ada: "0.000000",
          hasFunds: false,
          utxoCount: 0,
          error: "Cannot connect to Cardano node. Is it running and synced?",
        });
      }
    }

    // Parse the output to calculate total ADA and count UTXOs
    const output = result.stdout || "";
    
    let totalLovelace = BigInt(0);
    let utxoCount = 0;
    
    // Check if output is JSON format (cardano-cli returns JSON when not a TTY)
    if (output.trim().startsWith("{")) {
      try {
        const utxoJson = JSON.parse(output);
        // Iterate through all UTxOs in the JSON object
        for (const utxoKey in utxoJson) {
          const utxo = utxoJson[utxoKey];
          if (utxo && utxo.value && utxo.value.lovelace) {
            totalLovelace += BigInt(utxo.value.lovelace);
            utxoCount++;
          }
        }
      } catch (parseError) {
        console.error("Failed to parse UTxO JSON:", parseError);
        // Fall through to text parsing
      }
    } else {
      // Parse text format (fallback for human-readable output)
      const lines = output.split("\n").filter((line) => line.trim());
      
      // Find the header line (contains "TxHash" or "Amount")
      let headerIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("TxHash") || lines[i].includes("Amount")) {
          headerIndex = i;
          break;
        }
      }
      
      // Skip header lines (header + separator line)
      const utxoLines = headerIndex >= 0 ? lines.slice(headerIndex + 2) : lines.slice(2);
      
      for (const line of utxoLines) {
        if (!line.trim()) continue;
        
        // Parse lovelace from each UTxO line
        const lovelaceMatch = line.match(/(\d+(?:,\d{3})*)\s+lovelace/i);
        if (lovelaceMatch) {
          const lovelaceStr = lovelaceMatch[1].replace(/,/g, "");
          const lovelace = BigInt(lovelaceStr);
          totalLovelace += lovelace;
          utxoCount++;
          continue;
        }
      }
    }

    // Convert lovelace to ADA (1 ADA = 1,000,000 lovelace)
    const ada = Number(totalLovelace) / 1_000_000;

    return res.status(200).json({
      address,
      lovelace: totalLovelace.toString(),
      ada: ada.toFixed(6),
      hasFunds: ada > 0,
      utxoCount,
    });
  } catch (error) {
    console.error("Balance query error:", error);
    // If query fails (e.g., node not synced), return 0 balance
    return res.status(200).json({
      address,
      lovelace: "0",
      ada: "0.000000",
      hasFunds: false,
      utxoCount: 0,
      error: (error as Error).message,
    });
  }
}

