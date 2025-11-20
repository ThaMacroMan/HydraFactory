import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Party } from "@/lib/hydra-client";
import React from "react";

export interface TransactionLogEntry {
  id: string;
  timestamp: number;
  fromParty?: string;
  toParty?: string;
  utxoRef?: string;
  amount?: string;
  change?: string | null;
  sendHalf?: boolean;
  status: "submitted" | "success" | "error" | "confirmed" | "pending";
  error?: string;
  txHash?: string;
  txId?: string;
  snapshotNumber?: number | null;
  type?: "confirmed" | "pending" | "ui" | "mainchain";
}

interface TransactionLogProps {
  transactions: TransactionLogEntry[];
  onClear?: () => void;
  aliceStatus?: any;
  bobStatus?: any;
  partyFilter?: string | null; // Filter transactions by party
  title?: string; // Custom title for the log
  mainChainTransactions?: TransactionLogEntry[]; // Main chain transactions (commits, etc.)
}

export default function TransactionLog({ transactions, onClear, aliceStatus, bobStatus, partyFilter, title, mainChainTransactions = [] }: TransactionLogProps) {
  // Default to expanded for Hydra Transactions to show all metadata
  const [isExpanded, setIsExpanded] = useState(title === "Hydra Transactions");
  const [hydraHistory, setHydraHistory] = useState<TransactionLogEntry[]>([]);
  const fetchingRef = useRef(false);

  // Fetch Hydra head history (server-side accumulated)
  const fetchHistory = useCallback(async () => {
    if (!aliceStatus || aliceStatus.tag !== "Open") {
      setHydraHistory([]);
      return;
    }
    
    // Prevent concurrent requests
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    
    try {
      const response = await fetch("/api/hydra/alice/history");
      if (response.ok) {
        const data = await response.json();
        
        // Convert Hydra transactions to log entries
        const historyEntries: TransactionLogEntry[] = data.transactions.map((tx: any) => ({
          id: `hydra-${tx.txId || `tx-${Date.now()}`}`,
          timestamp: tx.timestamp || Date.now(),
          txId: tx.txId,
          txHash: tx.txId,
          status: tx.type === "confirmed" ? "confirmed" : "pending",
          snapshotNumber: tx.snapshotNumber,
          type: tx.type,
          amount: tx.txId ? `TX ${tx.txId.substring(0, 8)}...` : "Transaction",
        }));
        
        // Only update if history actually changed
        setHydraHistory(prevHistory => {
          // Quick check: if lengths are different, definitely update
          if (prevHistory.length !== historyEntries.length) {
            return historyEntries;
          }
          // Deep comparison - only update if content changed
          const prevIds = new Set(prevHistory.map(tx => tx.txId || tx.id));
          const newIds = new Set(historyEntries.map(tx => tx.txId || tx.id));
          if (prevIds.size !== newIds.size || 
              !Array.from(prevIds).every(id => newIds.has(id))) {
            return historyEntries;
          }
          // Check if any transaction status changed
          const prevMap = new Map(prevHistory.map(tx => [tx.txId || tx.id, tx]));
          const hasChanges = historyEntries.some(tx => {
            const prev = prevMap.get(tx.txId || tx.id);
            return !prev || prev.status !== tx.status || prev.snapshotNumber !== tx.snapshotNumber;
          });
          return hasChanges ? historyEntries : prevHistory;
        });
      }
    } catch (err) {
      console.warn("Failed to fetch Hydra history:", err);
    } finally {
      fetchingRef.current = false;
    }
  }, [aliceStatus?.tag]);

  useEffect(() => {
    // Initial fetch on mount
    fetchHistory();
    
    // History is now fetched intentionally (on mount, after actions, etc.)
    // No automatic polling - reduces unnecessary API calls
  }, [fetchHistory]);

  // Combine UI transactions with Hydra history, removing duplicates
  // Memoize to prevent recalculation unless inputs change
  const allTransactions = useMemo(() => {
    let filtered: TransactionLogEntry[] = [];
    
    // If title is "Hydra Transactions", show all Hydra head transactions
    // This includes both confirmed/pending snapshots AND UI-initiated transactions within the head
    if (title === "Hydra Transactions") {
      // Include Hydra snapshots (confirmed/pending) and UI transactions (sent within head)
      filtered = [...hydraHistory, ...transactions].filter((tx) => {
        // Include Hydra snapshots
        if (tx.type === "confirmed" || tx.type === "pending") {
          return true;
        }
        // Include UI transactions that are sent to the Hydra head (not main chain)
        // These are transactions created by handleSendUTXO which sends UTXOs within the head
        return tx.type === "ui" || !tx.type; // UI transactions have type "ui" or no type
      });
    } else if (partyFilter) {
      // For Cardano wallet logs (Alice Cardano, Bob Cardano), show main chain transactions only
      // Main chain transactions include commits (moving UTXOs from main chain to Hydra head)
      // Exclude all Hydra head transactions (both confirmed/pending and UI-initiated send UTXO)
      filtered = mainChainTransactions.filter((tx) => {
        // Only show main chain transactions for this party
        return tx.fromParty === partyFilter && tx.type === "mainchain";
      });
    } else {
      // Default: show all transactions
      filtered = [...hydraHistory, ...transactions, ...mainChainTransactions];
    }
    
    return filtered
      .filter((tx, index, self) => 
        index === self.findIndex((t) => 
          (tx.txId && t.txId && tx.txId === t.txId) || 
          (tx.id === t.id)
        )
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [hydraHistory, transactions, partyFilter, title, mainChainTransactions]);

  // Always show the log if partyFilter is set or if it's Hydra Transactions
  // Only hide if no filter, not Hydra Transactions, and no transactions
  if (allTransactions.length === 0 && !partyFilter && title !== "Hydra Transactions") {
    return null;
  }

  return (
    <div className={`${partyFilter ? 'bg-blue-600/20 border-blue-500/50' : 'bg-blue-950/40 border-blue-900/60'} rounded-xl border p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-white transition-all duration-300 flex items-center gap-2">
          {!partyFilter && (
            <div className="w-5 h-5 bg-blue-800 rounded flex items-center justify-center text-white font-bold text-[10px]">
              ⚡
            </div>
          )}
          {partyFilter && (
            <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center text-white font-bold text-[10px]">
              ₳
            </div>
          )}
          {title || `Transaction History`} {allTransactions.length > 0 && `(${allTransactions.length})`}
          {!partyFilter && title !== "Hydra Transactions" && (
            <span className="text-sm text-gray-300 font-normal ml-2 transition-all duration-300">
              ({hydraHistory.length} from Hydra, {transactions.length} from UI, {mainChainTransactions.length} main chain)
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`px-3 py-1 ${partyFilter ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-800 hover:bg-blue-900'} rounded text-white text-sm transition`}
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      <div className={`space-y-2 ${isExpanded ? "max-h-[600px]" : "max-h-[300px]"} overflow-y-auto`}>
        {allTransactions.length === 0 ? (
          <div className="text-center py-8 text-gray-300 text-sm">
            No transactions yet
          </div>
        ) : (
          allTransactions.map((tx) => {
          // Use stable key for React reconciliation
          const txKey = tx.txId || tx.id;
          const statusColor = 
            tx.status === "success" || tx.status === "confirmed" ? "text-green-400" :
            tx.status === "error" ? "text-red-400" :
            tx.status === "pending" ? "text-yellow-400" :
            "text-blue-400";
          
          const statusIcon =
            tx.status === "success" || tx.status === "confirmed" ? "✓" :
            tx.status === "error" ? "✗" :
            tx.status === "pending" ? "⏳" :
            "→";
          
          const isHydraTx = tx.type === "confirmed" || tx.type === "pending";
          const isMainChainTx = tx.type === "mainchain";

          return (
            <div
              key={txKey}
              className={`p-3 ${partyFilter ? 'bg-blue-700/30 border-blue-600/50 hover:border-blue-500/70' : 'bg-blue-950/50 border-blue-900/50 hover:border-blue-800/70'} rounded text-xs border transition-all duration-200`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={statusColor}>{statusIcon}</span>
                    {isHydraTx ? (
                      <span className="text-white font-semibold">
                        Hydra Transaction
                        {tx.snapshotNumber !== null && (
                          <span className="text-gray-300 text-xs ml-2">
                            Snapshot #{tx.snapshotNumber}
                          </span>
                        )}
                      </span>
                    ) : isMainChainTx ? (
                      <span className="text-white font-semibold">
                        Main Chain Transaction
                      </span>
                    ) : (
                      <>
                        <span className="text-white font-semibold">
                          {tx.fromParty} → {tx.toParty}
                        </span>
                        {tx.sendHalf && (
                          <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded text-[10px]">
                            ½
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="text-gray-200 mb-1">
                    {isHydraTx ? (
                      <span className="text-gray-300 text-xs">
                        {tx.status === "confirmed" ? "Confirmed in snapshot" : "Pending confirmation"}
                      </span>
                    ) : isMainChainTx ? (
                      <div className="text-gray-300 text-xs space-y-1">
                        <div className="font-semibold text-white">{tx.amount || "Committed to Hydra head"}</div>
                        <div>Commit to Hydra</div>
                        {tx.utxoRef && (
                          <div className="text-gray-400 font-mono text-[10px]">
                            UTXO: {tx.utxoRef.length > 20 
                              ? `${tx.utxoRef.substring(0, 8)}...${tx.utxoRef.substring(tx.utxoRef.length - 8)}`
                              : tx.utxoRef}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <span className="font-semibold text-white">{tx.amount}</span>
                        {tx.change && (
                          <span className="text-gray-400 ml-2">
                            (change: {tx.change})
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {/* Always show metadata for Hydra Transactions, or when expanded */}
                  {(isExpanded || title === "Hydra Transactions") && (
                    <>
                      {tx.utxoRef && (
                        <div className="text-gray-300 font-mono text-[10px] mt-1 break-all">                                                                     
                          UTXO: {tx.utxoRef}
                        </div>
                      )}
                      {(tx.txHash || tx.txId) && (
                        <div className="text-gray-300 font-mono text-[10px] mt-1 break-all">                                                                     
                          TX ID: {tx.txId || tx.txHash}
                        </div>
                      )}
                      {tx.snapshotNumber !== null && (
                        <div className="text-gray-300 text-[10px] mt-1">
                          Snapshot: #{tx.snapshotNumber}
                        </div>
                      )}
                      {tx.type && (
                        <div className="text-gray-300 text-[10px] mt-1">
                          Type: {tx.type}
                        </div>
                      )}
                      {tx.fromParty && (
                        <div className="text-gray-300 text-[10px] mt-1">
                          From: {tx.fromParty}
                        </div>
                      )}
                      {tx.toParty && (
                        <div className="text-gray-300 text-[10px] mt-1">
                          To: {tx.toParty}
                        </div>
                      )}
                      {tx.error && (
                        <div className="text-red-400 text-[10px] mt-1 break-words">
                          Error: {tx.error}
                        </div>
                      )}
                      <div className="text-gray-400 text-[10px] mt-1">
                        {new Date(tx.timestamp).toLocaleString()}
                      </div>
                    </>
                  )}
                </div>
                {!isExpanded && (
                  <div className="text-gray-500 text-[10px] ml-2">
                    {new Date(tx.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          );
        })
        )}
      </div>
    </div>
  );
}

