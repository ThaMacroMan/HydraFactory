import type { NextApiRequest, NextApiResponse } from "next";
import { getUnifiedNodeStatus } from "../../../server/nodes";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { walletConfigs } = req.body;
    const includeStateChecks = req.body.includeStateChecks;

    if (!Array.isArray(walletConfigs)) {
      return res.status(400).json({ error: "walletConfigs must be an array" });
    }

    const result = await getUnifiedNodeStatus(walletConfigs, {
      includeStateChecks: includeStateChecks !== false,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
