import type { NextApiRequest, NextApiResponse } from "next";

// Hydra repository GitHub URLs for the original scripts
const HYDRA_SCRIPT_URLS = {
  head: "https://raw.githubusercontent.com/input-output-hk/hydra/main/hydra-plutus/src/Hydra/Plutus/Contracts/Head.hs",
  stake:
    "https://raw.githubusercontent.com/input-output-hk/hydra/main/hydra-plutus/src/Hydra/Plutus/Contracts/Stake.hs",
  commit:
    "https://raw.githubusercontent.com/input-output-hk/hydra/main/hydra-plutus/src/Hydra/Plutus/Contracts/Commit.hs",
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { script } = req.query;

    if (!script || typeof script !== "string") {
      return res.status(400).json({ error: "Script type is required" });
    }

    const scriptType = script as keyof typeof HYDRA_SCRIPT_URLS;
    if (!HYDRA_SCRIPT_URLS[scriptType]) {
      return res.status(400).json({
        error: `Invalid script type. Must be one of: ${Object.keys(
          HYDRA_SCRIPT_URLS
        ).join(", ")}`,
      });
    }

    const url = HYDRA_SCRIPT_URLS[scriptType];
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch script: ${response.statusText}`);
    }

    const sourceCode = await response.text();

    return res.status(200).json({
      scriptType,
      sourceCode,
      url,
    });
  } catch (error) {
    console.error("[scripts/view-original] Error:", error);
    return res.status(500).json({
      error: "Failed to fetch original script",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
