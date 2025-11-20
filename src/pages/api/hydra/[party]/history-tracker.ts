// Server-side history tracker that accumulates snapshots over time
// This file maintains a map of snapshot numbers to their transactions

interface SnapshotData {
  snapshotNumber: number;
  transactions: any[];
  timestamp: number;
}

// In-memory store: party -> snapshot number -> snapshot data
const historyStore: Map<string, Map<number, SnapshotData>> = new Map();

export function getHistoryForParty(party: string): SnapshotData[] {
  const partyHistory = historyStore.get(party) || new Map();
  return Array.from(partyHistory.values()).sort((a, b) => b.snapshotNumber - a.snapshotNumber);
}

export function updateHistoryForParty(party: string, snapshotNumber: number, transactions: any[]): void {
  if (!historyStore.has(party)) {
    historyStore.set(party, new Map());
  }
  
  const partyHistory = historyStore.get(party)!;
  
  // Only add if we haven't seen this snapshot before
  if (!partyHistory.has(snapshotNumber)) {
    partyHistory.set(snapshotNumber, {
      snapshotNumber,
      transactions,
      timestamp: Date.now(),
    });
  } else {
    // Update existing snapshot (in case transactions are added)
    const existing = partyHistory.get(snapshotNumber)!;
    // Merge transactions, avoiding duplicates
    const existingTxIds = new Set(existing.transactions.map((t: any) => t.txId));
    const newTxs = transactions.filter((t: any) => t.txId && !existingTxIds.has(t.txId));
    if (newTxs.length > 0) {
      partyHistory.set(snapshotNumber, {
        ...existing,
        transactions: [...existing.transactions, ...newTxs],
      });
    }
  }
}

export function getAllTransactionsForParty(party: string): any[] {
  const snapshots = getHistoryForParty(party);
  const allTransactions: any[] = [];
  
  snapshots.forEach(snapshot => {
    snapshot.transactions.forEach((tx: any) => {
      allTransactions.push({
        ...tx,
        snapshotNumber: snapshot.snapshotNumber,
        type: "confirmed",
        timestamp: snapshot.timestamp,
      });
    });
  });
  
  return allTransactions;
}

