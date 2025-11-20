import type { NextApiRequest, NextApiResponse } from "next";
import * as fs from "fs";
import * as path from "path";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { party } = req.query;
  const partyStr = String(party);

  try {
    const vkeyPath = path.join(
      process.cwd(),
      ".tmp/wallets",
      partyStr,
      "hydra.vkey"
    );

    if (!fs.existsSync(vkeyPath)) {
      return res.status(404).json({ error: "Verification key not found" });
    }

    const vkeyContent = fs.readFileSync(vkeyPath, "utf-8");
    const vkey = JSON.parse(vkeyContent);

    // Extract the hex value from cborHex (remove the "5820" prefix which is CBOR encoding)
    const cborHex = vkey.cborHex;
    // The hex value is after "5820" (which means "bytes of length 32")
    const hexKey = cborHex.startsWith("5820") ? cborHex.slice(4) : cborHex;

    return res.status(200).json({
      vkey: hexKey,
      cborHex: cborHex,
      full: vkey,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to get verification key",
      details: error.message,
    });
  }
}
