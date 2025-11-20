import type { NextApiRequest, NextApiResponse } from "next";
import { updateHistoryForParty, getAllTransactionsForParty } from "./history-tracker";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { party, port: portParam } = req.query;
  const partyStr = String(party);

  // Use provided port or calculate it
  const { getWalletApiPort } = await import("../../../../server/constants");
  let port: number | null = null;
  if (portParam) {
    port = parseInt(String(portParam), 10);
  } else {
    port = await getWalletApiPort(partyStr);
  }

  if (!port) {
    return res.status(400).json({ error: "Invalid party or unable to determine port" });
  }

  try {
    const response = await fetch(`http://127.0.0.1:${port}/head`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const headData = await response.json();

    // Extract transaction history from head state
    const coordinatedState = headData?.contents?.coordinatedHeadState;
    const allTxs = coordinatedState?.allTxs || {};
    const confirmedSnapshot = coordinatedState?.confirmedSnapshot;
    const confirmedTxs = confirmedSnapshot?.snapshot?.confirmed || [];
    const snapshotNumber = confirmedSnapshot?.snapshot?.number || 0;
    const headId = confirmedSnapshot?.snapshot?.headId;

    // Update server-side history tracker with current snapshot
    if (snapshotNumber > 0 && confirmedTxs.length > 0) {
      updateHistoryForParty(party, snapshotNumber, confirmedTxs);
    }

    // Get all accumulated transactions from history tracker
    const allHistoryTransactions = getAllTransactionsForParty(party);

    // Add pending transactions from allTxs (not yet confirmed)
    const pendingTransactions: any[] = [];
    Object.entries(allTxs).forEach(([txId, tx]: [string, any]) => {
      // Check if this transaction is already in our history
      const isInHistory = allHistoryTransactions.some((ht: any) => ht.txId === txId);
      if (!isInHistory) {
        pendingTransactions.push({
          txId,
          cborHex: typeof tx === 'object' ? tx.cborHex : tx,
          snapshotNumber: null,
          type: "pending",
          timestamp: Date.now(),
          headId,
        });
      }
    });

    // Combine all transactions (history + pending)
    const allTransactions = [...allHistoryTransactions, ...pendingTransactions]
      .sort((a, b) => {
        // Sort by snapshot number (descending), then by timestamp
        if (a.snapshotNumber !== b.snapshotNumber) {
          return (b.snapshotNumber || 0) - (a.snapshotNumber || 0);
        }
        return b.timestamp - a.timestamp;
      });

    return res.status(200).json({
      transactions: allTransactions,
      snapshotNumber,
      headState: headData?.contents?.tag,
      allTxs,
      confirmedSnapshot,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch history",
    });
  }
}

