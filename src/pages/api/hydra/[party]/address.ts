import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

// Cache addresses - they never change for a given party, so cache forever
const addressCache = new Map<string, string>();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { party } = req.query;
  
  const partyStr = String(party);

  // Check cache first - addresses never change, so cache forever
  const cachedAddress = addressCache.get(partyStr);
  if (cachedAddress) {
    return res.status(200).json({ address: cachedAddress });
  }

  try {
    const cardanoCliPath = path.join(
      process.cwd(),
      "../cardano-preprod-node/bin/cardano-cli"
    );
    
    const vkPath = path.join(
      process.cwd(),
      ".tmp/wallets",
      partyStr,
      "payment.vkey"
    );

    if (!fs.existsSync(vkPath)) {
      return res.status(404).json({ error: "Verification key not found" });
    }

    const addressCmd = `${cardanoCliPath} address build --payment-verification-key-file ${vkPath} --testnet-magic 1`;
    const result = await execAsync(addressCmd);
    const address = result.stdout.trim();

    // Cache the address forever (it never changes)
    addressCache.set(partyStr, address);

    return res.status(200).json({ address });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to get address",
      details: error.message,
    });
  }
}

