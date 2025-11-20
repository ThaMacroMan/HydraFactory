import type { NextApiRequest, NextApiResponse } from "next";
import { getHydraNodeStatus } from "../../../server/nodes";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Get walletIds from query parameter if provided
    const walletIds = req.query.walletIds
      ? (Array.isArray(req.query.walletIds)
          ? req.query.walletIds
          : [req.query.walletIds]
        ).map((id) => String(id))
      : undefined;
    
    const status = await getHydraNodeStatus(walletIds);
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
