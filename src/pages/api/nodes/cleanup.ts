import type { NextApiRequest, NextApiResponse } from "next";
import { cleanupHydraPersistence } from "../../../server/nodes";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { walletIds } = req.body ?? {};
    
    const result = await cleanupHydraPersistence(
      walletIds && Array.isArray(walletIds) ? walletIds : undefined
    );
    
    res.status(200).json(result);
  } catch (error) {
    console.error(`[nodes/cleanup] Error cleaning up persistence:`, error);
    res.status(500).json({ error: (error as Error).message });
  }
}

