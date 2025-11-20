import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

// Cache for wallet UTXOs to avoid slow cardano-cli calls
// This API endpoint can take 20-39 seconds, so caching is critical
interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30000; // 30 seconds cache - matches frontend polling interval

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { party } = req.query;

  const partyStr = String(party);

  // Check cache first - this endpoint is very slow (20-39s), so caching is critical
  const cacheKey = `wallet-utxos-${partyStr}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    // Get the party's address
    const fundsVkPath = path.join(
      process.cwd(),
      ".tmp/wallets",
      partyStr,
      "payment.vkey"
    );

    const cardanoCliPath = path.join(
      process.cwd(),
      "../cardano-preprod-node/bin/cardano-cli"
    );

    // Check if cardano-cli exists
    if (!fs.existsSync(cardanoCliPath)) {
      return res.status(501).json({
        error: `cardano-cli not found at: ${cardanoCliPath}`,
      });
    }

    const network = "testnet-magic 1";

    // Build address from verification key
    const addressCmd = `${cardanoCliPath} address build --payment-verification-key-file ${fundsVkPath} --${network}`;
    const addressResult = await execAsync(addressCmd);
    const address = addressResult.stdout.trim();

    // Query UTXOs for this address
    // Try multiple possible socket paths
    const possibleSocketPaths = [
      path.join(process.cwd(), ".cardano/node.socket"), // hydrafactory/.cardano/node.socket
      path.join(process.cwd(), "../cardano-preprod-node/node.socket"), // fallback
      process.env.CARDANO_NODE_SOCKET_PATH, // environment variable
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

    const utxoCmd = `${cardanoCliPath} query utxo --address ${address} --${network} --socket-path ${socketPath} --out-file /dev/stdout`;
    const utxoResult = await execAsync(utxoCmd);

    // Parse JSON output from cardano-cli
    let utxosData: any = {};
    try {
      utxosData = JSON.parse(utxoResult.stdout);
    } catch (e) {
      // Fallback to text parsing if JSON fails
      const lines = utxoResult.stdout.trim().split("\n").slice(2);
      utxosData = {};
      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const txHash = parts[0];
          const txIx = parts[1];
          const lovelace = parts[parts.length - 2];
          const key = `${txHash}#${txIx}`;
          utxosData[key] = {
            value: { lovelace: parseInt(lovelace) || 0 },
          };
        }
      });
    }

    const utxos = Object.entries(utxosData).map(
      ([utxoRef, utxoData]: [string, any]) => {
        const lovelace = utxoData?.value?.lovelace || 0;
        const [txHash, txIx] = utxoRef.split("#");

        return {
          utxoRef,
          txHash,
          txIx,
          lovelace,
          ada: lovelace / 1000000,
          address,
        };
      }
    );

    const responseData = {
      address,
      utxos,
    };

    // Cache the result
    cache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now(),
    });

    // Clean up old cache entries (older than 2x TTL)
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > CACHE_TTL * 2) {
        cache.delete(key);
      }
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error(
      `[wallet-utxos] Error fetching UTXOs for ${partyStr}:`,
      error
    );
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to fetch wallet UTXOs",
    });
  }
}
