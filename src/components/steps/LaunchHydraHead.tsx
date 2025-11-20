import HydraPartyCard, { HydraPartyCardRef } from "@/components/HydraPartyCard";
import WalletUTXOs, { WalletUTXOsRef } from "@/components/WalletUTXOs";
import TransactionLog, {
  TransactionLogEntry,
} from "@/components/TransactionLog";
import TransactionChart from "@/components/TransactionChart";
import { HeadStatus, Party } from "@/lib/hydra-client";
import { useRef, useCallback, useEffect, useState } from "react";

interface WalletPair {
  id: string;
  label?: string;
  cardanoAddress: string;
  hydraWalletId: string;
  persistenceDirName?: string;
  balance?: {
    ada: string;
    hasFunds: boolean;
    utxoCount?: number;
  };
  files?: {
    paymentVkey: string;
    paymentSkey: string;
    hydraVkey: string;
    hydraSkey: string;
    addressFile: string;
    infoFile: string;
  };
}

interface NodeStatus {
  online: boolean;
  data?: unknown;
  error?: string;
}

interface HydraHeadActionProps {
  selectedWalletIds: string[];
  wallets: WalletPair[];
  hydraStatus: Record<string, HeadStatus | null>;
  nodeStatus: Record<string, NodeStatus>; // Node online/offline status
  transactions: TransactionLogEntry[];
  hydraHistory: TransactionLogEntry[];
  mainChainTransactions: TransactionLogEntry[];
  walletUtxosCache?: Record<string, any[]>; // Cached Cardano wallet UTXOs
  stateFileInitializing?: Record<string, boolean>; // Passed from parent
  onStatusUpdate: (party: string, status: HeadStatus) => void;
  onSendUTXO: (
    fromParty: Party,
    toParty: Party,
    utxoRef: string,
    utxo: any,
    sendHalf?: boolean
  ) => Promise<void>;
  onInit: () => Promise<void>;
  onClose: () => Promise<void>;
  onFanout: () => Promise<void>;
  onClearTransactions: () => void;
}

// Track initialization state from state files (more reliable than API status)
// Key: wallet label, Value: isInitializing boolean

export default function HydraHeadAction({
  selectedWalletIds,
  wallets,
  hydraStatus,
  nodeStatus,
  transactions,
  hydraHistory,
  mainChainTransactions,
  walletUtxosCache,
  stateFileInitializing: propStateFileInitializing = {},
  onStatusUpdate,
  onSendUTXO,
  onInit,
  onClose,
  onFanout,
  onClearTransactions,
}: HydraHeadActionProps) {
  // Refs to access HydraPartyCard refresh methods
  const partyCardRefs = useRef<Record<string, HydraPartyCardRef | null>>({});
  // Refs to access WalletUTXOs refresh methods
  const walletUtxosRefs = useRef<Record<string, WalletUTXOsRef | null>>({});
  // Track which wallets have already had their initial refresh triggered
  const initialRefreshTriggered = useRef<Set<string>>(new Set());

  // Use state from props (managed by parent component)
  const stateFileInitializing = propStateFileInitializing;

  // Tooltip states
  const [showInitTooltip, setShowInitTooltip] = useState(false);
  const [showCloseTooltip, setShowCloseTooltip] = useState(false);
  const [showFanoutTooltip, setShowFanoutTooltip] = useState(false);

  // Loading states for actions
  const [isInitializing, setIsInitializing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isFanouting, setIsFanouting] = useState(false);

  // Contestation deadline timer state
  const [contestationTimeRemaining, setContestationTimeRemaining] = useState<
    string | null
  >(null);
  const [contestationSecondsRemaining, setContestationSecondsRemaining] =
    useState<number | null>(null);

  // Fanout summary state
  const [fanoutSummary, setFanoutSummary] = useState<
    | {
        party: string;
        lostUtxos: number;
        receivedUtxos: number;
        lostAda: string;
        receivedAda: string;
      }[]
    | null
  >(null);

  // Wrapper for onSendUTXO - only refreshes UTXOs for sender and receiver
  // The unified status endpoint polls every 10 seconds and will update status automatically
  // We only need to refresh UTXOs for the parties involved in the transaction
  const handleSendUTXOWithRefresh = useCallback(
    async (
      fromParty: Party,
      toParty: Party,
      utxoRef: string,
      utxo: any,
      sendHalf?: boolean
    ) => {
      // Call the original onSendUTXO
      await onSendUTXO(fromParty, toParty, utxoRef, utxo, sendHalf);

      // Aggressively refresh UTXOs immediately and continuously after transaction
      // Don't wait for snapshot confirmation - just keep refreshing until we see the update
      const refreshBoth = () => {
        if (partyCardRefs.current[fromParty]?.refreshUTXOs) {
          partyCardRefs.current[fromParty]!.refreshUTXOs();
        }
        if (
          toParty !== fromParty &&
          partyCardRefs.current[toParty]?.refreshUTXOs
        ) {
          partyCardRefs.current[toParty]!.refreshUTXOs();
        }
      };

      // Immediate refresh
      refreshBoth();

      // Aggressive polling: refresh every 200ms for 2 seconds to catch update ASAP
      // Then regular 2s polling takes over
      let refreshCount = 0;
      const maxRefreshes = 10; // 10 refreshes * 200ms = 2 seconds
      const aggressiveInterval = setInterval(() => {
        refreshBoth();
        refreshCount++;
        if (refreshCount >= maxRefreshes) {
          clearInterval(aggressiveInterval);
        }
      }, 200); // Refresh every 200ms
    },
    [onSendUTXO]
  );

  // Wrapper for head actions that refreshes status after action
  // Simplified: single refresh after reasonable delay (Hydra processes async)
  const handleInitWithRefresh = useCallback(async () => {
    setIsInitializing(true);
    try {
      // Clear any previous fanout summary when initializing a new head
      setFanoutSummary(null);
      await onInit();
      // Refresh status and Cardano wallet UTXOs after 2 seconds - gives Hydra time to process WebSocket command
      // Initialization spends UTXOs (each party sends ~6 ADA), so we need to refresh Cardano wallet UTXOs
      setTimeout(() => {
        selectedWalletIds.forEach((walletId) => {
          const wallet = wallets.find((w) => w.id === walletId);
          if (!wallet) return;
          const walletLabel = wallet.label || walletId;
          // Refresh Hydra head status
          if (partyCardRefs.current[walletLabel]?.refreshStatus) {
            partyCardRefs.current[walletLabel]!.refreshStatus();
          }
          // Refresh Cardano wallet UTXOs (initialization spends UTXOs)
          if (walletUtxosRefs.current[walletLabel]?.refreshWalletUtxos) {
            walletUtxosRefs.current[walletLabel]!.refreshWalletUtxos();
          }
        });
        // Clear loading state after refresh (initialization is async, so we give it time)
        setTimeout(() => {
          setIsInitializing(false);
        }, 1000);
      }, 2000);
    } catch (error) {
      console.error("Failed to initialize:", error);
      setIsInitializing(false);
    }
  }, [onInit, selectedWalletIds, wallets]);

  const handleCloseWithRefresh = useCallback(async () => {
    await onClose();
    // Refresh status after 2 seconds - gives Hydra time to process WebSocket command
    setTimeout(() => {
      selectedWalletIds.forEach((walletId) => {
        const wallet = wallets.find((w) => w.id === walletId);
        if (!wallet) return;
        const walletLabel = wallet.label || walletId;
        if (partyCardRefs.current[walletLabel]?.refreshStatus) {
          partyCardRefs.current[walletLabel]!.refreshStatus();
        }
      });
    }, 2000);
  }, [onClose, selectedWalletIds, wallets]);

  const handleFanoutWithRefresh = useCallback(async () => {
    setIsFanouting(true);
    try {
      // Capture pre-fanout state: Cardano wallet UTXOs and Hydra head UTXOs by party
      const preFanoutState: Record<
        string,
        {
          cardanoUtxos: number;
          cardanoUtxosList: any[];
          cardanoAddress: string;
          hydraUtxosForParty: number;
          hydraUtxosList: Array<{ key: string; utxo: any }>;
        }
      > = {};

      // First, get all Hydra head UTXOs (same for all parties, but we'll filter by address)
      let allHydraUtxos: Record<string, any> = {};
      try {
        const firstWallet = wallets.find((w) =>
          selectedWalletIds.includes(w.id)
        );
        if (firstWallet) {
          const firstWalletLabel = firstWallet.label || firstWallet.id;
          const hydraResponse = await fetch(
            `/api/hydra/${firstWalletLabel}/utxos`
          );
          if (hydraResponse.ok) {
            const hydraData = await hydraResponse.json();
            allHydraUtxos = hydraData.utxos || hydraData;
          }
        }
      } catch (error) {
        console.error("Failed to get Hydra head UTXOs:", error);
      }

      for (const walletId of selectedWalletIds) {
        const wallet = wallets.find((w) => w.id === walletId);
        if (!wallet) continue;
        const walletLabel = wallet.label || walletId;

        try {
          // Get pre-fanout Cardano wallet UTXOs
          const cardanoResponse = await fetch(
            `/api/hydra/${walletLabel}/wallet-utxos`
          );
          let cardanoUtxos = 0;
          let cardanoUtxosList: any[] = [];
          if (cardanoResponse.ok) {
            const cardanoData = await cardanoResponse.json();
            cardanoUtxosList = cardanoData.utxos || [];
            cardanoUtxos = cardanoUtxosList.length;
          }

          // Filter Hydra head UTXOs that belong to this party's address
          const partyAddress = wallet.cardanoAddress;
          const hydraUtxosForParty = Object.entries(allHydraUtxos).filter(
            ([_, utxo]: [string, any]) => utxo.address === partyAddress
          );
          const hydraUtxosList = hydraUtxosForParty.map(([key, utxo]) => ({
            key,
            utxo,
          }));

          preFanoutState[walletLabel] = {
            cardanoUtxos,
            cardanoUtxosList,
            cardanoAddress: partyAddress,
            hydraUtxosForParty: hydraUtxosForParty.length,
            hydraUtxosList,
          };
        } catch (error) {
          console.error(
            `Failed to get pre-fanout state for ${walletLabel}:`,
            error
          );
          preFanoutState[walletLabel] = {
            cardanoUtxos: 0,
            cardanoUtxosList: [],
            cardanoAddress: wallet.cardanoAddress || "",
            hydraUtxosForParty: 0,
            hydraUtxosList: [],
          };
        }
      }

      await onFanout();

      // Clear any previous summary
      setFanoutSummary(null);

      // Wait for fanout to complete, then calculate summary
      // Store allHydraUtxos in closure for use in post-fanout calculation
      const capturedAllHydraUtxos = allHydraUtxos;
      setTimeout(async () => {
        // Refresh status first
        selectedWalletIds.forEach((walletId) => {
          const wallet = wallets.find((w) => w.id === walletId);
          if (!wallet) return;
          const walletLabel = wallet.label || walletId;
          if (partyCardRefs.current[walletLabel]?.refreshStatus) {
            partyCardRefs.current[walletLabel]!.refreshStatus();
          }
        });

        // Wait for UTXOs to settle on main chain after fanout
        setTimeout(async () => {
          const summary: {
            party: string;
            lostUtxos: number;
            receivedUtxos: number;
            lostAda: string;
            receivedAda: string;
          }[] = [];

          for (const walletId of selectedWalletIds) {
            const wallet = wallets.find((w) => w.id === walletId);
            if (!wallet) continue;
            const walletLabel = wallet.label || walletId;
            const preState = preFanoutState[walletLabel];

            if (!preState) continue;

            try {
              // Get post-fanout Cardano wallet UTXOs
              const response = await fetch(
                `/api/hydra/${walletLabel}/wallet-utxos`
              );
              if (response.ok) {
                const data = await response.json();
                const postFanoutCardanoUtxosList = data.utxos || [];
                const postFanoutCardanoUtxos =
                  postFanoutCardanoUtxosList.length;

                // Calculate received UTXOs: new UTXOs in wallet after fanout
                const receivedUtxos = Math.max(
                  0,
                  postFanoutCardanoUtxos - preState.cardanoUtxos
                );

                // Calculate received ADA: sum of ADA from new UTXOs
                let receivedAdaLovelace = 0;
                const preUtxoRefs = new Set(
                  preState.cardanoUtxosList.map(
                    (u: any) => u.txHash + "#" + u.txIx
                  )
                );
                for (const utxo of postFanoutCardanoUtxosList) {
                  const utxoRef = utxo.txHash + "#" + utxo.txIx;
                  if (!preUtxoRefs.has(utxoRef)) {
                    // This is a new UTXO (received from fanout)
                    const adaValue = utxo.value?.lovelace || 0;
                    receivedAdaLovelace +=
                      typeof adaValue === "string"
                        ? parseInt(adaValue, 10)
                        : adaValue;
                  }
                }

                // Calculate lost UTXOs: UTXOs that were in Hydra head for this party but didn't come back
                // We need to check which Hydra UTXOs came back to this party's wallet
                const postUtxoRefs = new Set(
                  postFanoutCardanoUtxosList.map(
                    (u: any) => u.txHash + "#" + u.txIx
                  )
                );

                // Find Hydra UTXOs that didn't come back to this party
                let lostUtxos = 0;
                let lostAdaLovelace = 0;
                for (const { key, utxo } of preState.hydraUtxosList) {
                  // Hydra UTXOs are keyed as "txHash#txIx"
                  if (!postUtxoRefs.has(key)) {
                    // This Hydra UTXO didn't come back to this party's wallet
                    lostUtxos++;
                    const adaValue = utxo.value?.lovelace || 0;
                    lostAdaLovelace +=
                      typeof adaValue === "string"
                        ? parseInt(adaValue, 10)
                        : adaValue;
                  }
                }

                // Format ADA values (convert lovelace to ADA)
                const formatAda = (lovelace: number) => {
                  if (lovelace === 0) return "0";
                  const ada = lovelace / 1_000_000;
                  return ada >= 1
                    ? ada.toFixed(2) + " ₳"
                    : (ada * 1000).toFixed(0) + " m₳";
                };

                // Only add to summary if there are actual changes
                if (lostUtxos > 0 || receivedUtxos > 0) {
                  summary.push({
                    party: walletLabel,
                    lostUtxos,
                    receivedUtxos,
                    lostAda: formatAda(lostAdaLovelace),
                    receivedAda: formatAda(receivedAdaLovelace),
                  });
                }
              }
            } catch (error) {
              console.error(
                `Failed to calculate fanout summary for ${walletLabel}:`,
                error
              );
            }
          }

          if (summary.length > 0) {
            setFanoutSummary(summary);
          }

          // Clear loading state after fanout completes
          setIsFanouting(false);
        }, 3000); // Wait 3 seconds after status refresh for UTXOs to settle
      }, 2000);
    } catch (error) {
      console.error("Failed to fanout:", error);
      setIsFanouting(false);
    }
  }, [onFanout, selectedWalletIds, wallets]);

  // Calculate contestation deadline from status
  // Use the earliest deadline from all selected wallets in Closed state
  useEffect(() => {
    // Find all selected wallets in Closed state
    const closedWallets = selectedWalletIds
      .map((walletId) => {
        const wallet = wallets.find((w) => w.id === walletId);
        if (!wallet) return null;
        const walletLabel = wallet.label || walletId;
        const status = hydraStatus[walletLabel];

        // Handle different status structures - check both top level and contents
        const statusTag = status?.tag || (status as any)?.contents?.tag;
        const deadline =
          status?.contestationDeadline ||
          (status as any)?.contents?.contestationDeadline;

        if (
          (statusTag === "Closed" || statusTag === "HeadClosed") &&
          deadline
        ) {
          return {
            walletLabel,
            deadline: deadline,
          };
        }
        return null;
      })
      .filter(
        (w): w is { walletLabel: string; deadline: number | string } =>
          w !== null
      );

    if (closedWallets.length === 0) {
      setContestationTimeRemaining(null);
      setContestationSecondsRemaining(null);
      return;
    }

    // Find the earliest deadline (all parties should have the same deadline, but use earliest to be safe)
    const deadlines = closedWallets.map((w) => {
      const deadline = w.deadline;
      if (typeof deadline === "string") {
        return Math.floor(new Date(deadline).getTime() / 1000);
      } else if (typeof deadline === "number") {
        return deadline > 1000000000000
          ? Math.floor(deadline / 1000)
          : deadline;
      }
      return null;
    });

    const validDeadlines = deadlines.filter((d): d is number => d !== null);
    if (validDeadlines.length === 0) {
      setContestationTimeRemaining(null);
      setContestationSecondsRemaining(null);
      return;
    }

    const earliestDeadline = Math.min(...validDeadlines);

    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = earliestDeadline - now;

      setContestationSecondsRemaining(remaining);

      if (remaining <= 0) {
        setContestationTimeRemaining("READY NOW!");
        setContestationSecondsRemaining(0);
        return;
      }

      // Format as hours, minutes, seconds
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;

      if (hours > 0) {
        setContestationTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setContestationTimeRemaining(`${minutes}m ${seconds}s`);
      } else {
        setContestationTimeRemaining(`${seconds}s`);
      }
    };

    // Update immediately
    updateCountdown();

    // Update every 1 second for real-time countdown
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [selectedWalletIds, wallets, hydraStatus]);

  // Clear refresh flag for deselected wallets so they can refresh again if re-selected
  useEffect(() => {
    // Remove wallets that are no longer selected from the refresh tracking
    const selectedSet = new Set(
      selectedWalletIds.map((id) => {
        const wallet = wallets.find((w) => w.id === id);
        return wallet?.label || id;
      })
    );

    // Clean up tracking for wallets that are no longer selected
    initialRefreshTriggered.current.forEach((walletLabel) => {
      if (!selectedSet.has(walletLabel)) {
        initialRefreshTriggered.current.delete(walletLabel);
        // Also clear the refs when wallet is deselected
        partyCardRefs.current[walletLabel] = null;
        walletUtxosRefs.current[walletLabel] = null;
      }
    });
  }, [selectedWalletIds, wallets]);

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">5. Launch Hydra Head</h2>
        </div>
      </div>

      {/* Contestation Deadline Timer - Show when head is Closed */}
      {selectedWalletIds.length > 0 &&
        selectedWalletIds.some((walletId) => {
          const wallet = wallets.find((w) => w.id === walletId);
          if (!wallet) return false;
          const walletLabel = wallet.label || walletId;
          const status = hydraStatus[walletLabel];
          const statusTag = status?.tag || (status as any)?.contents?.tag;
          return statusTag === "Closed" || statusTag === "HeadClosed";
        }) &&
        (contestationTimeRemaining !== null ? (
          <div
            className={`mb-4 p-4 rounded-lg shadow-lg border-2 ${
              contestationSecondsRemaining !== null &&
              contestationSecondsRemaining <= 60
                ? "bg-gradient-to-r from-red-900/50 to-orange-800/40 border-red-500/70 animate-pulse"
                : "bg-gradient-to-r from-orange-900/40 to-orange-800/30 border-orange-500/60"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="text-orange-200 font-bold text-sm mb-1">
                  ⏱️ Contestation Period - Fanout Available In:
                </div>
                <div className="text-xs text-orange-300/90 font-medium">
                  {contestationSecondsRemaining !== null &&
                  contestationSecondsRemaining <= 0 ? (
                    <span className="text-green-300 font-bold">
                      ✅ READY! You can now click Fanout
                    </span>
                  ) : contestationSecondsRemaining !== null &&
                    contestationSecondsRemaining <= 60 ? (
                    <span className="text-red-300 font-bold animate-pulse">
                      ⚠️ Almost ready! Wait {contestationSecondsRemaining}s more
                    </span>
                  ) : (
                    "⚠️ Wait for timer to reach 0 before clicking Fanout"
                  )}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`font-black text-2xl tabular-nums tracking-wider ${
                    contestationSecondsRemaining !== null &&
                    contestationSecondsRemaining <= 60
                      ? "text-red-200 animate-pulse"
                      : "text-orange-100"
                  }`}
                >
                  {contestationTimeRemaining || "Calculating..."}
                </div>
              </div>
            </div>
          </div>
        ) : null)}

      {/* Txns and Speed Analytics with Action Buttons */}
      {selectedWalletIds.length > 0 && (
        <div className="mb-3 flex items-stretch gap-4">
          {/* Action Buttons - Left Side */}
          <div className="flex flex-col justify-between w-full max-w-[100px]">
            <div className="relative">
              <button
                onClick={handleInitWithRefresh}
                onMouseEnter={() => setShowInitTooltip(true)}
                onMouseLeave={() => setShowInitTooltip(false)}
                disabled={
                  isInitializing ||
                  selectedWalletIds.length === 0 ||
                  !selectedWalletIds.every((walletId) => {
                    const wallet = wallets.find((w) => w.id === walletId);
                    if (!wallet) return false;
                    const walletLabel = wallet.label || walletId;

                    // Check if node is online (required for any action)
                    const node =
                      nodeStatus[walletId] || nodeStatus[walletLabel];
                    if (!node?.online) return false;

                    // Check head status
                    const status = hydraStatus[walletLabel];

                    // Disable if state file shows we're initializing OR if API says Initializing
                    if (
                      stateFileInitializing[walletLabel] ||
                      status?.tag === "Initializing"
                    )
                      return false;

                    // Enable only if ALL parties have node online AND head status is Idle
                    return status?.tag === "Idle";
                  })
                }
                className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg text-white text-sm font-semibold transition-all shadow-lg hover:shadow-xl disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isInitializing && (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                )}
                {isInitializing ? "Initializing..." : "Initialize"}
              </button>
              {showInitTooltip && (
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 pointer-events-none whitespace-nowrap">
                  <div className="text-xs text-blue-300 font-medium">
                    Initialize Hydra Head
                  </div>
                  <div className="text-xs text-gray-300 mt-1">
                    {selectedWalletIds.some((walletId) => {
                      const wallet = wallets.find((w) => w.id === walletId);
                      if (!wallet) return false;
                      const walletLabel = wallet.label || walletId;
                      return stateFileInitializing[walletLabel];
                    })
                      ? "Initialization in progress..."
                      : "Create a new Hydra head with selected parties"}
                  </div>
                  <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-1">
                    <div className="w-2 h-2 bg-gray-900 border-l border-b border-gray-700 rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <button
                onClick={handleCloseWithRefresh}
                onMouseEnter={() => setShowCloseTooltip(true)}
                onMouseLeave={() => setShowCloseTooltip(false)}
                disabled={
                  selectedWalletIds.length === 0 ||
                  !selectedWalletIds.every((walletId) => {
                    const wallet = wallets.find((w) => w.id === walletId);
                    if (!wallet) return false;
                    const walletLabel = wallet.label || walletId;
                    const status = hydraStatus[walletLabel];
                    // Enable only if ALL parties are Open
                    return status?.tag === "Open";
                  })
                }
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg text-white text-sm font-semibold transition-all shadow-lg hover:shadow-xl disabled:shadow-none"
              >
                Close
              </button>
              {showCloseTooltip && (
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 pointer-events-none whitespace-nowrap">
                  <div className="text-xs text-blue-300 font-medium">
                    Close Hydra Head
                  </div>
                  <div className="text-xs text-gray-300 mt-1">
                    Close the head and return funds to main chain
                  </div>
                  <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-1">
                    <div className="w-2 h-2 bg-gray-900 border-l border-b border-gray-700 rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
            <div
              className="relative"
              onMouseEnter={() => setShowFanoutTooltip(true)}
              onMouseLeave={() => setShowFanoutTooltip(false)}
            >
              <button
                onClick={handleFanoutWithRefresh}
                disabled={
                  isFanouting ||
                  selectedWalletIds.length === 0 ||
                  !selectedWalletIds.every((walletId) => {
                    const wallet = wallets.find((w) => w.id === walletId);
                    if (!wallet) return false;
                    const walletLabel = wallet.label || walletId;
                    const status = hydraStatus[walletLabel];
                    const statusTag =
                      status?.tag || (status as any)?.contents?.tag;
                    // Enable only if ALL parties are Closed
                    return statusTag === "Closed" || statusTag === "HeadClosed";
                  }) ||
                  // Also disable if contestation period hasn't elapsed
                  (contestationSecondsRemaining !== null &&
                    contestationSecondsRemaining > 0)
                }
                className="w-full px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg text-white text-sm font-semibold transition-all shadow-lg hover:shadow-xl disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isFanouting && (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                )}
                {isFanouting ? "Fanouting..." : "Fanout"}
              </button>
              {showFanoutTooltip && (
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 pointer-events-none whitespace-nowrap">
                  <div className="text-xs text-blue-300 font-medium">
                    Fanout Hydra Head
                  </div>
                  <div className="text-xs text-gray-300 mt-1">
                    {contestationSecondsRemaining !== null &&
                    contestationSecondsRemaining > 0
                      ? `Wait ${
                          contestationTimeRemaining || "..."
                        } for contestation period to elapse`
                      : "Distribute final state back to parties"}
                  </div>
                  <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-1">
                    <div className="w-2 h-2 bg-gray-900 border-l border-b border-gray-700 rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Chart */}
          <div className="flex-1 h-[250px]">
            <TransactionChart
              transactions={transactions}
              hydraHistory={hydraHistory}
            />
          </div>
        </div>
      )}

      {/* Fanout Summary */}
      {fanoutSummary && fanoutSummary.length > 0 && (
        <div className="mb-3 p-4 bg-gradient-to-r from-green-900/40 to-blue-900/40 border border-green-500/60 rounded-lg relative">
          <button
            onClick={() => setFanoutSummary(null)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-200 transition-colors"
            title="Dismiss summary"
            aria-label="Close summary"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <div className="text-green-200 font-bold text-sm mb-2">
            📊 Fanout Summary
          </div>
          <div className="space-y-1.5">
            {fanoutSummary.map(
              ({ party, lostUtxos, receivedUtxos, lostAda, receivedAda }) => (
                <div
                  key={party}
                  className="text-xs text-gray-300 flex items-center gap-2 flex-wrap"
                >
                  <span className="font-semibold text-white capitalize">
                    {party}:
                  </span>
                  {lostUtxos > 0 && (
                    <span className="text-orange-300">
                      lost {lostUtxos} UTXO{lostUtxos !== 1 ? "s" : ""}
                      {lostAda !== "0" && ` (${lostAda})`}
                    </span>
                  )}
                  {lostUtxos > 0 && receivedUtxos > 0 && (
                    <span className="text-gray-500">•</span>
                  )}
                  {receivedUtxos > 0 && (
                    <span className="text-green-300">
                      received {receivedUtxos} UTXO
                      {receivedUtxos !== 1 ? "s" : ""}
                      {receivedAda !== "0" && ` (${receivedAda})`}
                    </span>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Party Cards - Dynamic for all selected wallets */}
      {selectedWalletIds.length > 0 ? (
        <div className="space-y-4 mb-3">
          {selectedWalletIds.map((walletId) => {
            const wallet = wallets.find((w) => w.id === walletId);
            if (!wallet) return null;

            const walletLabel = wallet.label || walletId;
            const status = hydraStatus[walletLabel] || null;
            const otherWallets = selectedWalletIds
              .filter((id) => id !== walletId)
              .map((id) => {
                const w = wallets.find((w) => w.id === id);
                return w?.label || id;
              });

            return (
              <div
                key={walletId}
                className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-2"
              >
                {/* Cardano Wallet */}
                <div>
                  <WalletUTXOs
                    ref={(ref) => {
                      walletUtxosRefs.current[walletLabel] = ref;
                    }}
                    party={walletLabel}
                    headStatus={status}
                    cachedUtxos={walletUtxosCache?.[walletLabel]}
                  />
                </div>

                {/* Hydra Wallet */}
                <div className="relative">
                  <HydraPartyCard
                    ref={(ref) => {
                      const wasNotSet = !partyCardRefs.current[walletLabel];
                      partyCardRefs.current[walletLabel] = ref;
                      // If ref was just set (wasn't set before) and is now available, trigger refresh
                      // This handles the case where component mounts and ref is set
                      // Only refresh once per wallet to prevent duplicate refreshes
                      if (
                        wasNotSet &&
                        ref &&
                        !initialRefreshTriggered.current.has(walletLabel)
                      ) {
                        initialRefreshTriggered.current.add(walletLabel);
                        // Small delay to ensure component is fully mounted
                        setTimeout(() => {
                          ref.refreshStatus();
                          // If status is already Open, also refresh UTXOs
                          const currentStatus = hydraStatus[walletLabel];
                          if (currentStatus?.tag === "Open") {
                            ref.refreshUTXOs();
                          }
                        }, 100);
                      }
                    }}
                    party={walletLabel}
                    otherParties={otherWallets}
                    initialStatus={status} // Pass status from unified endpoint
                    onStatusUpdate={(s) => onStatusUpdate(walletLabel, s)}
                    onSendUTXO={handleSendUTXOWithRefresh}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
          Select wallets in the &quot;Hydra nodes&quot; section above to see
          their controls here.
        </div>
      )}

      {/* Transaction Logs */}
      {selectedWalletIds.length > 0 ? (
        <div className="mt-3 w-full">
          <TransactionLog
            transactions={transactions}
            onClear={onClearTransactions}
            aliceStatus={null}
            bobStatus={null}
            partyFilter={null}
            title="Hydra Transactions"
            mainChainTransactions={mainChainTransactions}
          />
        </div>
      ) : null}
    </section>
  );
}
