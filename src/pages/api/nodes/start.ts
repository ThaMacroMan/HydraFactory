import type { NextApiRequest, NextApiResponse } from "next";
import { startHydraNode, startHydraNodeForWallet, WalletNodeConfig } from "../../../server/nodes";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    console.log("[nodes/start] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { node, wallets } = req.body ?? {};
    console.log("[nodes/start] Request received:", { node, wallets, body: req.body });
    
    // Support both old format (single node) and new format (multiple wallets)
    if (node) {
      // Legacy support: single node by name
    console.log(`[nodes/start] Starting Hydra node: ${node}`);
    const result = await startHydraNode(node);
    console.log(`[nodes/start] Node ${node} started successfully:`, result);
      return res.status(200).json(result);
    }
    
    if (wallets && Array.isArray(wallets) && wallets.length > 0) {
      // New format: start multiple nodes for wallets
      console.log(`[nodes/start] Starting ${wallets.length} Hydra nodes`);
      
      const results = await Promise.allSettled(
        wallets.map((config: WalletNodeConfig) => startHydraNodeForWallet(config))
      );
      
      const successResults: any[] = [];
      const errors: any[] = [];
      
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successResults.push({
            walletId: wallets[index].walletId,
            ...result.value,
          });
        } else {
          errors.push({
            walletId: wallets[index].walletId,
            error: result.reason?.message || "Unknown error",
          });
        }
      });
      
      console.log(`[nodes/start] Started ${successResults.length} nodes, ${errors.length} errors`);
      
      return res.status(200).json({
        success: true,
        results: successResults,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
    
    console.log("[nodes/start] Error: node or wallets is required");
    return res.status(400).json({ error: "node or wallets is required" });
  } catch (error) {
    console.error(`[nodes/start] Error starting node:`, error);
    res.status(500).json({ error: (error as Error).message });
  }
}
