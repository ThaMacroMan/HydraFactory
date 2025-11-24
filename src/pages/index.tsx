import Head from "next/head";
import Image from "next/image";
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  startTransition,
} from "react";
import { TransactionLogEntry } from "@/components/TransactionLog";
import { HeadStatus, Party, HydraAPIClient } from "@/lib/hydra-client";
import CardanoNodeSetup from "@/components/steps/CardanoNodeSetup";
import HydraSetup from "@/components/steps/HydraSetup";
import WalletFactory from "@/components/steps/WalletFactory";
import HydraNodes from "@/components/steps/StartHydraNodes";
import HydraHeadAction from "@/components/steps/LaunchHydraHead";

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

interface CardanoStatus {
  running: boolean;
  synced?: boolean;
  syncProgress?: string;
  error?: string;
}

interface SoftwareItem {
  name: string;
  path: string;
  fullPath: string;
  installed: boolean;
  description: string;
  archiveFound?: boolean;
  archivePath?: string;
  needsExtraction?: boolean;
}

interface ChecklistData {
  items: SoftwareItem[];
  allInstalled: boolean;
}

export default function Home() {
  const [wallets, setWallets] = useState<WalletPair[]>([]);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([]);
  const [nodeStatus, setNodeStatus] = useState<Record<string, NodeStatus>>({});
  const [cardanoStatus, setCardanoStatus] = useState<CardanoStatus | null>(
    null
  );
  const [cardanoStatusLoading, setCardanoStatusLoading] = useState(true);
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);
  const [cardanoExpanded, setCardanoExpanded] = useState(false);
  const [hydraExpanded, setHydraExpanded] = useState(false);
  const [checkingBalances, setCheckingBalances] = useState<
    Record<string, boolean>
  >({});
  const checkingBalancesRef = useRef<Record<string, boolean>>({});
  const [fetchingUtxos, setFetchingUtxos] = useState<Record<string, boolean>>(
    {}
  );
  const fetchingUtxosRef = useRef<Record<string, boolean>>({});
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [pendingTransaction, setPendingTransaction] = useState<{
    fromWalletId: string;
    toAddresses: string[]; // All recipient addresses
    amount: string;
    initialFromBalance: number;
    initialToBalances: Record<string, number>; // Balance for each recipient
    expectedAmount: number;
    startTime: number;
  } | null>(null);
  const pendingTransactionRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const fetchHistoryRef = useRef<(() => Promise<void>) | null>(null);
  // Flag to prevent history refresh from hydraStatus changes right after transaction
  const skipNextHistoryRefreshRef = useRef(false);
  // Track previous hydraStatus to detect actual changes (not just updates)
  const prevHydraStatusRef = useRef<Record<string, HeadStatus | null>>({});
  // Cache for Cardano wallet UTXOs - shared between WalletFactory and WalletUTXOs
  const [walletUtxosCache, setWalletUtxosCache] = useState<
    Record<string, any[]>
  >({});

  // Track when initial loading completes - when all UTXO fetches finish
  // Balance is calculated from UTXOs, so we only need to wait for UTXO fetches
  useEffect(() => {
    if (!isInitialLoading) return;

    const walletsWithAddresses = wallets.filter((w) => w.cardanoAddress);
    if (walletsWithAddresses.length === 0) {
      // No wallets with addresses, but wait a bit in case wallets are still loading
      const timer = setTimeout(() => {
        setIsInitialLoading(false);
      }, 1000);
      return () => clearTimeout(timer);
    }

    // Check if any UTXOs are still being fetched
    const anyFetchingUtxos = walletsWithAddresses.some((w) => {
      const walletLabel = w.label || w.id;
      return fetchingUtxos[walletLabel] === true;
    });

    // If fetches are in progress, keep loading
    if (anyFetchingUtxos) {
      return;
    }

    // No fetches in progress - but wait a bit to ensure all staggered operations have started
    // Max delay is 1000ms, so wait 1500ms to be safe
    const timer = setTimeout(() => {
      // Double-check that nothing started in the meantime
      const stillFetchingUtxos = walletsWithAddresses.some((w) => {
        const walletLabel = w.label || w.id;
        return fetchingUtxos[walletLabel] === true;
      });

      if (!stillFetchingUtxos) {
        setIsInitialLoading(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [wallets, fetchingUtxos, isInitialLoading]);

  // HydraFE state variables - track status for all wallets by label
  const [hydraStatus, setHydraStatus] = useState<
    Record<string, HeadStatus | null>
  >({});
  const [transactions, setTransactions] = useState<TransactionLogEntry[]>([]);
  const [hydraHistory, setHydraHistory] = useState<TransactionLogEntry[]>([]);
  const [mainChainTransactions, setMainChainTransactions] = useState<
    TransactionLogEntry[]
  >([]);
  const [stateFileInitializing, setStateFileInitializing] = useState<
    Record<string, boolean>
  >({});

  const refreshNodeStatus = async () => {
    try {
      // Pass selected wallet IDs to check their status
      const walletIdsParam =
        selectedWalletIds.length > 0
          ? `?walletIds=${selectedWalletIds
              .map((id) => encodeURIComponent(id))
              .join("&walletIds=")}`
          : "";
      const res = await fetch(`/api/nodes/status${walletIdsParam}`);
      const data = await res.json();
      setNodeStatus(data);
    } catch (error) {
      console.error(error);
    }
  };

  const refreshCardanoStatus = async (showLoading = false) => {
    try {
      if (showLoading) {
        setCardanoStatusLoading(true);
      }
      const res = await fetch("/api/cardano/status");
      const data = await res.json();
      setCardanoStatus(data);
    } catch (error) {
      console.error(error);
    } finally {
      if (showLoading) {
        setCardanoStatusLoading(false);
      }
    }
  };

  const refreshChecklist = async () => {
    try {
      const res = await fetch("/api/cardano/checklist");
      const data = await res.json();
      setChecklist(data);
    } catch (error) {
      console.error(error);
    }
  };

  const checkWalletBalance = useCallback(
    async (walletId: string, address: string) => {
      if (!address) {
        console.warn(`No address provided for wallet ${walletId}`);
        return;
      }
      // Prevent concurrent balance checks for the same wallet using ref
      if (checkingBalancesRef.current[walletId]) {
        return;
      }
      try {
        checkingBalancesRef.current[walletId] = true;
        setCheckingBalances((prev) => ({ ...prev, [walletId]: true }));
        const res = await fetch(
          `/api/wallets/balance?address=${encodeURIComponent(address)}`
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        if (data.error) {
          // Don't clear balance on error - keep existing balance
          console.warn(`Balance check error for ${address}:`, data.error);
        } else {
          setWallets((prev) =>
            prev.map((w) =>
              w.id === walletId
                ? {
                    ...w,
                    balance: {
                      ada: data.ada,
                      hasFunds: data.hasFunds,
                      utxoCount: data.utxoCount || 0,
                    },
                  }
                : w
            )
          );
        }
      } catch (error) {
        // Silently handle network errors - don't spam console
        if (
          error instanceof TypeError &&
          error.message.includes("Failed to fetch")
        ) {
          // Network error - likely API is not available, skip silently
          return;
        }
        console.error(`Failed to check balance for ${walletId}:`, error);
        // Don't clear balance on error - keep existing balance
      } finally {
        checkingBalancesRef.current[walletId] = false;
        setCheckingBalances((prev) => ({ ...prev, [walletId]: false }));
      }
    },
    []
  );

  // Helper function to calculate balance from UTXOs
  const calculateBalanceFromUtxos = useCallback((utxos: any[]) => {
    if (!utxos || utxos.length === 0) {
      return {
        ada: "0.000000",
        hasFunds: false,
        utxoCount: 0,
      };
    }

    const totalLovelace = utxos.reduce((sum, utxo) => {
      return sum + (utxo.lovelace || 0);
    }, 0);

    const ada = (totalLovelace / 1_000_000).toFixed(6);

    return {
      ada,
      hasFunds: totalLovelace > 0,
      utxoCount: utxos.length,
    };
  }, []);

  // Fetch and cache wallet UTXOs - shared between WalletFactory and WalletUTXOs
  // Also calculates and updates balance from UTXOs (eliminates need for separate balance endpoint)
  const fetchWalletUtxos = useCallback(
    async (party: string) => {
      // Prevent concurrent UTXO fetches for the same wallet
      if (fetchingUtxosRef.current[party]) {
        return;
      }
      try {
        fetchingUtxosRef.current[party] = true;
        setFetchingUtxos((prev) => ({ ...prev, [party]: true }));
        const response = await fetch(`/api/hydra/${party}/wallet-utxos`);
        if (response.ok) {
          const data = await response.json();
          const utxos = data.utxos || [];
          setWalletUtxosCache((prev) => ({
            ...prev,
            [party]: utxos,
          }));

          // Calculate balance from UTXOs and update wallet balance
          const balance = calculateBalanceFromUtxos(utxos);
          setWallets((prev) =>
            prev.map((w) => {
              // Match by party name (label or id)
              const walletLabel = w.label || w.id;
              if (walletLabel.toLowerCase() === party.toLowerCase()) {
                return {
                  ...w,
                  balance,
                };
              }
              return w;
            })
          );
        }
      } catch (err) {
        console.warn(`Failed to fetch UTXOs for ${party}:`, err);
      } finally {
        fetchingUtxosRef.current[party] = false;
        setFetchingUtxos((prev) => ({ ...prev, [party]: false }));
      }
    },
    [calculateBalanceFromUtxos]
  );

  const loadWallets = useCallback(async () => {
    setIsInitialLoading(true);
    try {
      const res = await fetch("/api/wallets/list");
      const data = await res.json();
      if (res.ok && data.wallets) {
        // Preserve existing balance data when updating wallets
        setWallets((prevWallets) => {
          const balanceMap = new Map(prevWallets.map((w) => [w.id, w.balance]));
          return data.wallets.map((wallet: WalletPair) => ({
            ...wallet,
            balance: balanceMap.get(wallet.id) || wallet.balance,
          }));
        });
        // Fetch UTXOs for all loaded wallets - balance is calculated from UTXOs
        // This eliminates the need for a separate balance endpoint call
        data.wallets.forEach((wallet: WalletPair) => {
          if (wallet.cardanoAddress) {
            // Use a staggered delay to prevent all requests at once
            const delay = Math.random() * 500 + 500; // 500-1000ms random delay
            const walletLabel = wallet.label || wallet.id;
            setTimeout(() => {
              fetchWalletUtxos(walletLabel);
            }, delay);
          }
        });
        // Initialize selected wallets if empty - default to alice and bob if they exist
        if (selectedWalletIds.length === 0) {
          const availableWallets = data.wallets.map((w: WalletPair) => w.id);
          const defaultWallets = ["alice", "bob"].filter((id) =>
            availableWallets.includes(id)
          );
          if (defaultWallets.length > 0) {
            setSelectedWalletIds(defaultWallets);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load wallets:", error);
    }
  }, [fetchWalletUtxos, selectedWalletIds.length]);

  // Initial load - only run once on mount
  useEffect(() => {
    refreshNodeStatus();
    refreshCardanoStatus(true); // Show loading on initial load
    refreshChecklist();
    loadWallets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount

  // Periodic refresh interval - separate from initial load
  useEffect(() => {
    const interval = setInterval(() => {
      refreshNodeStatus();
      refreshCardanoStatus(false); // Don't show loading on periodic refreshes
      refreshChecklist();
    }, 300000); // Refresh every 5 minutes - these are setup checks, not needed frequently
    return () => clearInterval(interval);
  }, []); // Empty deps - interval doesn't need to restart

  // Removed automatic balance polling - balances are now refreshed manually via refresh button
  // This reduces API calls and improves page performance

  // Watch for balance changes to detect when pending transaction is confirmed
  useEffect(() => {
    if (!pendingTransaction) return;

    const fromWallet = wallets.find(
      (w) => w.id === pendingTransaction.fromWalletId
    );

    if (!fromWallet) return;

    const currentFromBalance = fromWallet.balance?.ada
      ? parseFloat(fromWallet.balance.ada)
      : 0;

    // Check if sender balance decreased (transaction confirmed)
    const fromBalanceDecreased =
      currentFromBalance <
      pendingTransaction.initialFromBalance -
        pendingTransaction.expectedAmount * 0.9; // Allow 10% tolerance for fees

    // Check all recipients to see if any received funds
    let anyRecipientReceived = false;
    for (const toAddress of pendingTransaction.toAddresses) {
      const toWallet = wallets.find((w) => w.cardanoAddress === toAddress);
      if (toWallet) {
        const currentToBalance = toWallet.balance?.ada
          ? parseFloat(toWallet.balance.ada)
          : 0;
        const initialToBalance =
          pendingTransaction.initialToBalances[toAddress] || 0;

        if (
          currentToBalance >
          initialToBalance + pendingTransaction.expectedAmount * 0.1
        ) {
          anyRecipientReceived = true;
          break;
        }
      }
    }

    if (fromBalanceDecreased || anyRecipientReceived) {
      console.log(
        `[sendAda] Transaction confirmed! From: ${pendingTransaction.initialFromBalance} -> ${currentFromBalance}`
      );
      if (pendingTransactionRef.current) {
        clearInterval(pendingTransactionRef.current);
        pendingTransactionRef.current = null;
      }
      setPendingTransaction(null);
    }
  }, [wallets, pendingTransaction]);

  // Refresh UTXOs for all wallets when refreshing balances
  const refreshWalletUtxos = useCallback(() => {
    wallets.forEach((wallet) => {
      const walletLabel = wallet.label || wallet.id;
      if (wallet.cardanoAddress) {
        fetchWalletUtxos(walletLabel);
      }
    });
  }, [wallets, fetchWalletUtxos]);

  // Split single UTXO wallets into 3 UTXOs for easier Hydra commits
  const splitSingleUtxoWallets = useCallback(async () => {
    const walletsToSplit: Array<{ wallet: WalletPair; utxos: any[] }> = [];

    // Check each wallet for single UTXO
    for (const wallet of wallets) {
      const walletLabel = wallet.label || wallet.id;
      const utxos = walletUtxosCache[walletLabel] || [];

      // If wallet has exactly 1 UTXO, add to split list
      if (utxos.length === 1 && wallet.cardanoAddress) {
        walletsToSplit.push({ wallet, utxos });
      }
    }

    if (walletsToSplit.length === 0) {
      alert(
        "No wallets with single UTXO found. All wallets already have multiple UTXOs or no UTXOs."
      );
      return;
    }

    // Split each wallet's single UTXO into 3
    for (const { wallet, utxos } of walletsToSplit) {
      const walletLabel = wallet.label || wallet.id;
      const utxo = utxos[0];
      // Get lovelace value - handle both formats
      const totalLovelace =
        utxo.lovelace ||
        (utxo.value?.lovelace ? BigInt(utxo.value.lovelace) : BigInt(0));
      const totalLovelaceNum =
        typeof totalLovelace === "bigint"
          ? Number(totalLovelace)
          : totalLovelace;

      if (totalLovelaceNum < 1000000) {
        alert(
          `${walletLabel} has insufficient funds (less than 1 ADA). Need at least 1 ADA to split.`
        );
        continue;
      }

      // Minimum UTXO threshold is 1 ADA (1,000,000 lovelace)
      const MIN_UTXO_LOVELACE = 1000000;
      // Estimate fee (roughly 0.3 ADA for a transaction with 3 outputs)
      const estimatedFee = 300000; // 0.3 ADA in lovelace
      // Reserve for change output (must also meet minimum UTXO threshold)
      const changeReserve = MIN_UTXO_LOVELACE;
      // Total reserved for fees and change
      const totalReserved = estimatedFee + changeReserve;
      const availableLovelace = totalLovelaceNum - totalReserved;

      // Need at least 3 ADA (one for each output) + fees + change reserve
      const minRequired = MIN_UTXO_LOVELACE * 3 + totalReserved;
      if (totalLovelaceNum < minRequired) {
        alert(
          `${walletLabel} has insufficient funds. Need at least ${(
            minRequired / 1000000
          ).toFixed(
            2
          )} ADA (3 UTXOs of 1 ADA each + fees + change) to split. Current: ${(
            totalLovelaceNum / 1000000
          ).toFixed(2)} ADA.`
        );
        continue;
      }

      // Split into 3 parts, each at least 1 ADA
      // Distribute evenly from available funds (after reserving for fees and change)
      const part1 = Math.max(
        MIN_UTXO_LOVELACE,
        Math.floor(availableLovelace / 3)
      );
      const part2 = Math.max(
        MIN_UTXO_LOVELACE,
        Math.floor((availableLovelace - part1) / 2)
      );
      const part3 = availableLovelace - part1 - part2; // Remainder goes to third output

      // Final validation: ensure all parts meet minimum
      if (
        part1 < MIN_UTXO_LOVELACE ||
        part2 < MIN_UTXO_LOVELACE ||
        part3 < MIN_UTXO_LOVELACE
      ) {
        alert(
          `${walletLabel} cannot be split into 3 UTXOs. Each UTXO must be at least 1 ADA. Available after fees and change reserve: ${(
            availableLovelace / 1000000
          ).toFixed(2)} ADA.`
        );
        continue;
      }

      try {
        console.log(
          `[splitSingleUtxoWallets] Splitting ${walletLabel}'s UTXO into 3 parts`
        );

        // Send transaction with 3 outputs to the same address (internal transfer)
        // We'll use the send API with a special flag or create a custom split endpoint
        // For now, let's create 3 separate sends (simpler approach)
        // Actually, better to create a single transaction with 3 outputs

        // Use the send API but we need to modify it to support multiple outputs
        // Let's create a split transaction: send to self in 3 parts
        const response = await fetch("/api/wallets/split-utxo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletLabel,
            walletId: wallet.id,
            walletAddress: wallet.cardanoAddress,
            utxoRef: utxo.utxoRef || `${utxo.txHash}#${utxo.txIx}`,
            outputs: [
              {
                address: wallet.cardanoAddress,
                amount: (part1 / 1000000).toFixed(6),
              },
              {
                address: wallet.cardanoAddress,
                amount: (part2 / 1000000).toFixed(6),
              },
              {
                address: wallet.cardanoAddress,
                amount: (part3 / 1000000).toFixed(6),
              },
            ],
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(
            error.error || `Failed to split UTXO for ${walletLabel}`
          );
        }

        const data = await response.json();
        console.log(
          `[splitSingleUtxoWallets] Successfully split ${walletLabel}'s UTXO:`,
          data
        );

        // Refresh UTXOs after a delay to allow transaction to be processed
        setTimeout(() => {
          fetchWalletUtxos(walletLabel);
        }, 2000);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[splitSingleUtxoWallets] Failed to split ${walletLabel}'s UTXO:`,
          error
        );
        // Fail silently for "UTXO not found or has no value" errors
        // This can happen if the UTXO was already spent or doesn't exist
        if (
          !errorMessage.includes("UTXO not found") &&
          !errorMessage.includes("has no value")
        ) {
          alert(`Failed to split UTXO for ${walletLabel}: ${errorMessage}`);
        }
      }
    }

    // Refresh all UTXOs after splitting
    setTimeout(() => {
      refreshWalletUtxos();
    }, 3000);
  }, [wallets, walletUtxosCache, fetchWalletUtxos, refreshWalletUtxos]);

  const sendAda = useCallback(
    async (
      fromWalletId: string,
      recipients: Array<{ address: string; amounts: string[] }>
    ) => {
      const startTime = performance.now();
      console.log(`[sendAda] ========== SEND ADA START ==========`);
      console.log(`[sendAda] Start time: ${new Date().toISOString()}`);

      // Find wallet to get label and address for faster API lookup
      const fromWallet = wallets.find((w) => w.id === fromWalletId);
      const fromWalletLabel = fromWallet?.label;
      const fromWalletAddress = fromWallet?.cardanoAddress;

      const totalAmount = recipients
        .reduce(
          (sum, r) => sum + r.amounts.reduce((s, a) => s + parseFloat(a), 0),
          0
        )
        .toFixed(6);
      console.log(`[sendAda] Parameters:`, {
        fromWalletId,
        fromWalletLabel,
        fromWalletAddress,
        recipientsCount: recipients.length,
        totalAmount,
      });

      const prepareStart = performance.now();
      const requestBody = {
        fromWalletLabel, // Use label for faster directory lookup
        fromWalletId, // Keep for backward compatibility
        fromWalletAddress, // Pass address to avoid API lookup
        recipients, // Array of recipients, each with multiple amounts
      };
      const prepareTime = performance.now() - prepareStart;
      console.log(
        `[sendAda] Request body prepared: ${prepareTime.toFixed(2)}ms`
      );

      const fetchStart = performance.now();
      console.log(`[sendAda] Starting fetch to /api/wallets/send...`);
      const res = await fetch("/api/wallets/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const fetchTime = performance.now() - fetchStart;
      console.log(`[sendAda] Fetch completed: ${fetchTime.toFixed(2)}ms`);
      console.log(`[sendAda] Response status: ${res.status} ${res.statusText}`);

      const parseStart = performance.now();
      const data = await res.json();
      const parseTime = performance.now() - parseStart;
      console.log(`[sendAda] JSON parsed: ${parseTime.toFixed(2)}ms`);

      if (!res.ok) {
        const totalTime = performance.now() - startTime;
        console.error(`[sendAda] ========== SEND ADA ERROR ==========`);
        console.error(`[sendAda] Total time: ${totalTime.toFixed(2)}ms`);
        console.error(`[sendAda] Error data:`, data);
        // Clear pending transaction on error
        if (pendingTransactionRef.current) {
          clearInterval(pendingTransactionRef.current);
          pendingTransactionRef.current = null;
        }
        setPendingTransaction(null);
        throw new Error(data.error || "Failed to send ADA");
      }

      const totalTime = performance.now() - startTime;
      console.log(`[sendAda] ========== SEND ADA SUCCESS ==========`);
      console.log(`[sendAda] Total time: ${totalTime.toFixed(2)}ms`);
      console.log(
        `[sendAda] Breakdown: prepare=${prepareTime.toFixed(
          2
        )}ms, fetch=${fetchTime.toFixed(2)}ms, parse=${parseTime.toFixed(2)}ms`
      );
      console.log(`[sendAda] Response data:`, data);

      // Store initial balances to detect when transaction appears
      // Track all recipients for loading indicators
      const toAddresses = recipients.map((r) => r.address);
      const initialFromBalance = fromWallet?.balance?.ada
        ? parseFloat(fromWallet.balance.ada)
        : 0;

      // Get initial balances for all recipients
      const initialToBalances: Record<string, number> = {};
      recipients.forEach((recipient) => {
        const toWallet = wallets.find(
          (w) => w.cardanoAddress === recipient.address
        );
        initialToBalances[recipient.address] = toWallet?.balance?.ada
          ? parseFloat(toWallet.balance.ada)
          : 0;
      });

      const expectedAmount = parseFloat(totalAmount);

      // Set pending transaction state with all recipient addresses
      setPendingTransaction({
        fromWalletId,
        toAddresses, // All recipient addresses
        amount: totalAmount, // Store total as string for compatibility
        initialFromBalance,
        initialToBalances, // Balances for all recipients
        expectedAmount,
        startTime: Date.now(),
      });

      // Clear any existing polling interval
      if (pendingTransactionRef.current) {
        clearInterval(pendingTransactionRef.current);
      }

      // Poll for transaction confirmation
      let pollCount = 0;
      const maxPolls = 30; // 30 polls * 2 seconds = 60 seconds max
      pendingTransactionRef.current = setInterval(() => {
        pollCount++;
        console.log(
          `[sendAda] Polling for transaction confirmation (attempt ${pollCount}/${maxPolls})...`
        );

        // Refresh UTXOs to check for balance change
        refreshWalletUtxos();

        if (pollCount >= maxPolls) {
          // Safety timeout - clear after 60 seconds even if not confirmed
          console.log(
            `[sendAda] Max polls reached, clearing pending transaction (transaction may still be processing)`
          );
          if (pendingTransactionRef.current) {
            clearInterval(pendingTransactionRef.current);
            pendingTransactionRef.current = null;
          }
          setPendingTransaction(null);
        }
      }, 2000); // Poll every 2 seconds

      // Initial refresh after 3 seconds
      setTimeout(() => {
        console.log(`[sendAda] Initial UTXO refresh (3s after send)...`);
        refreshWalletUtxos();
      }, 3000);
    },
    [wallets, refreshWalletUtxos]
  );

  const createWallet = async () => {
    try {
      setCreatingWallet(true);
      const res = await fetch("/api/wallets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create wallet");
      }
      const newWallet: WalletPair = { ...data, balance: undefined };
      setWallets((prev) => [newWallet, ...prev]);
      // Fetch UTXOs after a short delay (balance is calculated from UTXOs)
      setTimeout(() => {
        const walletLabel = data.label || data.id;
        fetchWalletUtxos(walletLabel);
      }, 1000);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setCreatingWallet(false);
    }
  };

  // HydraFE: Set up global callback for commit transactions (main chain transactions)
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).onCommitTransaction = (commitData: {
        party: string;
        utxoRef: string;
        txId?: string;
        timestamp: number;
        ada?: number;
      }) => {
        console.log(
          `[onCommitTransaction] ========== Received commit transaction ==========`
        );
        console.log(`[onCommitTransaction] Commit data:`, commitData);
        console.log(`[onCommitTransaction] ADA value:`, commitData.ada);
        console.log(
          `[onCommitTransaction] ADA undefined?:`,
          commitData.ada === undefined
        );

        const amount =
          commitData.ada !== undefined
            ? `${commitData.ada.toFixed(2)} ADA`
            : "Commit to Hydra";
        console.log(`[onCommitTransaction] Calculated amount:`, amount);

        const logEntry: TransactionLogEntry = {
          id: `commit-${commitData.timestamp}-${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          timestamp: commitData.timestamp,
          fromParty: commitData.party as Party,
          utxoRef: commitData.utxoRef,
          amount,
          status: "success",
          type: "mainchain",
          txId: commitData.txId,
        };

        console.log(`[onCommitTransaction] Created log entry:`, logEntry);
        setMainChainTransactions((prev) => {
          const updated = [...prev, logEntry];
          console.log(
            `[onCommitTransaction] Updated transactions count:`,
            updated.length
          );
          return updated;
        });
      };
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).onCommitTransaction;
      }
    };
  }, []);

  // HydraFE: Memoize status setters to prevent unnecessary re-renders
  const handleStatusUpdate = useCallback(
    (party: string, status: HeadStatus) => {
      setHydraStatus((prev) => ({ ...prev, [party]: status }));
    },
    []
  );

  // HydraFE: Fetch Hydra history for chart
  useEffect(() => {
    const fetchHistory = async () => {
      // Check if any wallet has an open head
      const hasOpenHead = Object.values(hydraStatus).some(
        (status) => status?.tag === "Open"
      );
      if (!hasOpenHead) {
        setHydraHistory([]);
        return;
      }

      // Find the first wallet with an open head to fetch history
      const openWallet = Object.entries(hydraStatus).find(
        ([_, status]) => status?.tag === "Open"
      )?.[0];

      if (!openWallet) {
        setHydraHistory([]);
        return;
      }

      try {
        const response = await fetch(`/api/hydra/${openWallet}/history`);
        if (response.ok) {
          const data = await response.json();
          const historyEntries: TransactionLogEntry[] = data.transactions.map(
            (tx: any) => ({
              id: `hydra-${tx.txId || `tx-${Date.now()}`}`,
              timestamp: tx.timestamp || Date.now(),
              txId: tx.txId,
              txHash: tx.txId,
              status: tx.type === "confirmed" ? "confirmed" : "pending",
              snapshotNumber: tx.snapshotNumber,
              type: tx.type,
              amount: tx.txId
                ? `TX ${tx.txId.substring(0, 8)}...`
                : "Transaction",
            })
          );
          // Update history silently in background to prevent visible refresh
          startTransition(() => {
            setHydraHistory(historyEntries);
          });
        }
      } catch (err) {
        console.warn("Failed to fetch Hydra history for chart:", err);
      }
    };

    // Store fetchHistory in ref so it can be called from handleSendUTXO
    fetchHistoryRef.current = fetchHistory;

    // Skip history refresh if we just sent a transaction (to avoid double refresh)
    if (skipNextHistoryRefreshRef.current) {
      skipNextHistoryRefreshRef.current = false;
      return;
    }

    // Only refresh history if there's an actual structural change (head opened/closed)
    // Not just status updates (which happen frequently from unified endpoint)
    const prevStatus = prevHydraStatusRef.current;
    const hasStructuralChange = Object.keys(hydraStatus).some((key) => {
      const prev = prevStatus[key];
      const curr = hydraStatus[key];
      // Only refresh if head state changed (e.g., Idle -> Open, Open -> Closed)
      return prev?.tag !== curr?.tag;
    });

    // Update ref for next comparison
    prevHydraStatusRef.current = { ...hydraStatus };

    // Only fetch history on mount or structural changes, not on every status update
    if (hasStructuralChange || Object.keys(prevStatus).length === 0) {
      fetchHistory();
    }

    // History is now fetched intentionally (on mount, after transactions, etc.)
    // No automatic polling - reduces unnecessary API calls
  }, [hydraStatus]);

  // HydraFE: Memoize handleSendUTXO to prevent unnecessary re-renders of child components
  const handleSendUTXO = useCallback(
    async (
      fromParty: Party,
      toParty: Party,
      utxoRef: string,
      utxo: any,
      sendHalf: boolean = false
    ) => {
      const startTime = performance.now();
      console.log(
        `[handleSendUTXO] ========== TRANSACTION FLOW START ==========`
      );
      console.log(
        `[handleSendUTXO] From: ${fromParty}, To: ${toParty}, UTXO: ${utxoRef}`
      );
      console.log(
        `[handleSendUTXO] Send Half: ${sendHalf}, Amount: ${(
          (utxo.value?.lovelace || 0) / 1000000
        ).toFixed(2)} ADA`
      );

      // Create optimistic transaction entry immediately for instant UI feedback
      const optimisticEntryId = `${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const optimisticEntry: TransactionLogEntry = {
        id: optimisticEntryId,
        timestamp: Date.now(),
        fromParty,
        toParty,
        utxoRef,
        amount: sendHalf
          ? `${((utxo.value?.lovelace || 0) / 2000000).toFixed(2)} ADA`
          : `${((utxo.value?.lovelace || 0) / 1000000).toFixed(2)} ADA`,
        change: sendHalf
          ? `${((utxo.value?.lovelace || 0) / 2000000).toFixed(2)} ADA`
          : null,
        sendHalf,
        status: "pending",
        type: "ui",
      };
      // Add optimistic entry immediately
      setTransactions((prev) => [...prev, optimisticEntry]);

      try {
        // Get the target party's address by building it from their verification key
        // We'll let the API determine the correct address
        let targetAddress = utxo.address; // Fallback - will be determined by API

        // Try to build the transaction via API
        const buildTxStart = performance.now();
        console.log(
          `[handleSendUTXO] Starting build-tx API call at ${new Date().toISOString()}`
        );
        const response = await fetch("/api/hydra/build-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromParty,
            toParty,
            utxoRef,
            utxo,
            targetAddress,
            sendHalf,
          }),
        });
        const buildTxEnd = performance.now();
        console.log(
          `[handleSendUTXO] build-tx API call completed in ${(
            buildTxEnd - buildTxStart
          ).toFixed(2)}ms`
        );

        const parseStart = performance.now();
        const result = await response.json();
        const parseEnd = performance.now();
        console.log(
          `[handleSendUTXO] JSON parsing completed in ${(
            parseEnd - parseStart
          ).toFixed(2)}ms`
        );

        if (!response.ok) {
          // If building fails, show the error
          const totalTime = performance.now() - startTime;
          console.error(
            `[handleSendUTXO] ========== BUILD FAILED (${totalTime.toFixed(
              2
            )}ms) ==========`
          );
          throw new Error(
            result.error ||
              result.message ||
              `Failed to build transaction. UTXO: ${utxoRef}, Target: ${targetAddress}`
          );
        }

        // If we got a transaction, submit it automatically
        // The build-tx API determines the actual owner and signs with their key
        // Submit to the actual owner's node (result may include actualOwner if different)
        if (result.transaction) {
          // Use actualOwner if provided, otherwise use fromParty
          const submitParty = (result as any).actualOwner || fromParty;
          console.log(
            `[handleSendUTXO] Transaction built successfully, actualOwner: ${submitParty}`
          );
          console.log(
            `[handleSendUTXO] Transaction CBOR length: ${
              result.transaction?.length || "unknown"
            } bytes`
          );

          // Update the optimistic entry to "submitted" status with actual result data
          // Use startTransition for smooth, non-blocking update
          startTransition(() => {
            setTransactions((prev) =>
              prev.map((tx) =>
                tx.id === optimisticEntryId
                  ? {
                      ...tx,
                      amount:
                        result.amount ||
                        `${((utxo.value?.lovelace || 0) / 1000000).toFixed(
                          2
                        )} ADA`,
                      change: result.change || null,
                      sendHalf: result.sendHalf || false,
                      status: "submitted" as const,
                    }
                  : tx
              )
            );
          });

          const submitStart = performance.now();
          console.log(
            `[handleSendUTXO] Submitting transaction to ${submitParty}'s head at ${new Date().toISOString()}`
          );

          // Verify head is open before submitting - use cached status to avoid API call
          // Unified endpoint polls every 10s, so cached status is usually fresh
          const cachedHeadStatus = hydraStatus[submitParty];
          // Allow transactions when Open or SnapshotConfirmed (SnapshotConfirmed is an intermediate state, transactions work fine)
          const isOpenState =
            cachedHeadStatus?.tag === "Open" ||
            cachedHeadStatus?.tag === "SnapshotConfirmed";
          if (!cachedHeadStatus || !isOpenState) {
            const statusTag = cachedHeadStatus?.tag || "not available";
            const errorMsg = `Cannot submit transaction: Head is ${statusTag}. Head must be Open to submit transactions.`;
            console.error(`[handleSendUTXO] ${errorMsg}`);
            throw new Error(errorMsg);
          }

          console.log(
            `[handleSendUTXO] Head status verified (cached): ${cachedHeadStatus.tag}`
          );

          // Use client for transaction submission only
          const client = new HydraAPIClient(submitParty);
          const submitResult = await client.newTransaction(result.transaction);
          const submitEnd = performance.now();
          console.log(
            `[handleSendUTXO] Hydra submission completed in ${(
              submitEnd - submitStart
            ).toFixed(2)}ms`
          );
          console.log(`[handleSendUTXO] Submit result:`, submitResult);

          // Update the optimistic entry to "success" status
          // Use startTransition for smooth, non-blocking update
          startTransition(() => {
            setTransactions((prev) =>
              prev.map((tx) =>
                tx.id === optimisticEntryId
                  ? {
                      ...tx,
                      status: "success" as const,
                      txHash:
                        submitResult?.tag === "SubmitTxSubmitted"
                          ? "submitted"
                          : undefined,
                    }
                  : tx
              )
            );
          });

          // Set flag to skip the next hydraStatus-triggered history refresh
          // This prevents double refresh when unified status updates hydraStatus
          skipNextHistoryRefreshRef.current = true;

          // Debounce history refresh to avoid glitchy double-updates
          // Wait 1.5 seconds to let the unified status endpoint update first
          // This prevents the history refresh from conflicting with the optimistic update
          setTimeout(() => {
            if (fetchHistoryRef.current) {
              fetchHistoryRef.current();
            }
            // Clear the flag after our manual refresh
            skipNextHistoryRefreshRef.current = false;
          }, 1500);

          // Success! Transaction was built, signed, and submitted
          const totalTime = performance.now() - startTime;
          console.log(
            `[handleSendUTXO] ========== TRANSACTION FLOW COMPLETE (${totalTime.toFixed(
              2
            )}ms) ==========`
          );
          console.log(
            `[handleSendUTXO] Breakdown: Build=${(
              buildTxEnd - buildTxStart
            ).toFixed(2)}ms, Submit=${(submitEnd - submitStart).toFixed(2)}ms`
          );
        } else {
          const totalTime = performance.now() - startTime;
          console.error(
            `[handleSendUTXO] ========== NO TRANSACTION RETURNED (${totalTime.toFixed(
              2
            )}ms) ==========`
          );
          throw new Error("No transaction returned from builder");
        }
      } catch (err) {
        const totalTime = performance.now() - startTime;
        console.error(
          `[handleSendUTXO] ========== TRANSACTION FLOW ERROR (${totalTime.toFixed(
            2
          )}ms) ==========`
        );
        console.error(`[handleSendUTXO] Error details:`, err);

        // Extract user-friendly error message
        let errorMessage = "Unknown error";
        if (err instanceof Error) {
          errorMessage = err.message;

          // Provide more helpful error messages for common issues
          if (
            errorMessage.includes("Head is") &&
            errorMessage.includes("not Open")
          ) {
            // Already user-friendly
          } else if (
            errorMessage.includes("doesn't exist in the Hydra head") ||
            errorMessage.includes("BadInputsUTxO")
          ) {
            // Already user-friendly from API, but add suggestion
            errorMessage +=
              " Try refreshing the UTXO list or check if the head state is synchronized.";
          } else if (
            errorMessage.includes("400") ||
            errorMessage.includes("Bad Request")
          ) {
            errorMessage =
              "Transaction validation failed. Please check the transaction details.";
          } else if (
            errorMessage.includes("404") ||
            errorMessage.includes("Not Found")
          ) {
            errorMessage =
              "Hydra node endpoint not found. Please ensure the node is running.";
          } else if (
            errorMessage.includes("503") ||
            errorMessage.includes("Service Unavailable")
          ) {
            errorMessage =
              "Hydra node is not available. Please ensure the node is running.";
          } else if (errorMessage.includes("fetch")) {
            errorMessage =
              "Failed to connect to Hydra node. Please check if the node is running.";
          } else if (errorMessage.includes("timeout")) {
            errorMessage =
              "Transaction submission timed out. Please try again.";
          }
        }

        // Update the optimistic entry to "error" status
        // Use startTransition for smooth, non-blocking update
        startTransition(() => {
          setTransactions((prev) => {
            const existingEntry = prev.find(
              (tx) => tx.id === optimisticEntryId
            );
            if (existingEntry) {
              return prev.map((tx) =>
                tx.id === optimisticEntryId
                  ? {
                      ...tx,
                      status: "error" as const,
                      error: errorMessage,
                    }
                  : tx
              );
            }
            // If entry doesn't exist (shouldn't happen), create a new error entry
            const errorEntry: TransactionLogEntry = {
              id: optimisticEntryId,
              timestamp: Date.now(),
              fromParty,
              toParty,
              utxoRef,
              amount: `${((utxo.value?.lovelace || 0) / 1000000).toFixed(
                2
              )} ADA`,
              sendHalf: false,
              status: "error",
              error: errorMessage,
              type: "ui", // UI-initiated transactions within the Hydra head
            };
            return [...prev, errorEntry];
          });
        });

        // Re-throw with user-friendly message
        throw new Error(errorMessage);
      }
    },
    [hydraStatus] // Include hydraStatus to use cached status instead of API call
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Head>
        <title>Hydrafactory</title>
        <meta name="description" content="Local Hydra + Cardano factory" />
      </Head>
      <main className="max-w-6xl mx-auto px-6 py-12 space-y-10">
        <header className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-4">
            <Image
              src="/favicon.ico"
              alt="Hydra Factory"
              width={64}
              height={64}
              className="w-16 h-16"
            />
            <p className="text-6xl uppercase tracking-wider text-sky-400 font-bold">
              Hydra Factory
            </p>
          </div>
          <h1 className="text-xl font-semibold">
            Spin up your node, wallets, and a Hydra head in one place.
          </h1>
        </header>

        <section className="w-full">
          <CardanoNodeSetup
            expanded={cardanoExpanded}
            onToggle={() => setCardanoExpanded(!cardanoExpanded)}
            status={cardanoStatus}
            loading={cardanoStatusLoading}
            checklist={checklist}
            onRefresh={() => {
              refreshCardanoStatus(true); // Show loading when manually refreshing
              refreshChecklist();
            }}
          />
        </section>

        <section className="w-full">
          <HydraSetup
            expanded={hydraExpanded}
            onToggle={() => setHydraExpanded(!hydraExpanded)}
            checklist={checklist}
            onRefresh={() => {
              refreshChecklist();
            }}
          />
        </section>

        <WalletFactory
          wallets={wallets}
          creatingWallet={creatingWallet}
          onCreateWallet={createWallet}
          onSendAda={sendAda}
          isInitialLoading={isInitialLoading}
          pendingTransaction={pendingTransaction}
          onRefreshBalances={() => {
            // Refresh UTXOs for all wallets - balance is calculated from UTXOs
            // This eliminates the need for a separate balance endpoint call
            refreshWalletUtxos();
          }}
          onSplitSingleUtxos={splitSingleUtxoWallets}
        />

        <HydraNodes
          wallets={wallets}
          selectedWalletIds={selectedWalletIds}
          onSelectWallet={(walletId) => {
            if (selectedWalletIds.includes(walletId)) {
              setSelectedWalletIds(
                selectedWalletIds.filter((id) => id !== walletId)
              );
            } else {
              setSelectedWalletIds([...selectedWalletIds, walletId]);
            }
          }}
          nodeStatus={nodeStatus}
          headStatus={hydraStatus}
          onRefreshStatus={refreshNodeStatus}
          onNodeStatusUpdate={(newNodeStatus) => {
            // Update nodeStatus directly from unified endpoint (prevents duplicate API calls)
            setNodeStatus(newNodeStatus);
          }}
          onStateFileInitializingChange={setStateFileInitializing}
          onHeadStatusUpdate={(headStatus) => {
            // Update hydraStatus silently in background (non-blocking)
            // Use startTransition to prevent visible UI flicker during updates
            startTransition(() => {
              setHydraStatus((prev) => {
                const updated = { ...prev };
                Object.entries(headStatus).forEach(([walletLabel, status]) => {
                  updated[walletLabel] = status;
                });
                return updated;
              });
            });
          }}
        />

        <HydraHeadAction
          selectedWalletIds={selectedWalletIds}
          wallets={wallets}
          hydraStatus={hydraStatus}
          nodeStatus={nodeStatus}
          transactions={transactions}
          hydraHistory={hydraHistory}
          mainChainTransactions={mainChainTransactions}
          walletUtxosCache={walletUtxosCache}
          stateFileInitializing={stateFileInitializing}
          onStatusUpdate={handleStatusUpdate}
          onSendUTXO={handleSendUTXO}
          onInit={async () => {
            // Get all other wallet labels for multi-party init
            const allWalletLabels = selectedWalletIds
              .map((id) => {
                const w = wallets.find((w) => w.id === id);
                return w?.label || id;
              })
              .filter(Boolean);

            // Call init on all selected wallets with other parties info
            // Use the same port calculation as node startup (4001 + index)
            const promises = selectedWalletIds.map(async (walletId, index) => {
              const wallet = wallets.find((w) => w.id === walletId);
              if (!wallet) return;
              const walletLabel = wallet.label || walletId;
              const otherParties = allWalletLabels.filter(
                (l) => l !== walletLabel
              );
              // Calculate port based on selection order (same as node startup)
              const apiPort = 4001 + index;

              try {
                const response = await fetch(
                  `/api/hydra/${walletLabel}/action?action=init&otherParties=${otherParties.join(
                    ","
                  )}&port=${apiPort}`,
                  { method: "POST" }
                );
                if (!response.ok) {
                  const error = await response.json().catch(() => ({}));
                  console.error(`Init failed for ${walletLabel}:`, error);
                  alert(
                    `Init failed for ${walletLabel}: ${
                      error.error || "Unknown error"
                    }`
                  );
                } else {
                  console.log(`Init successful for ${walletLabel}`);
                }
              } catch (error) {
                console.error(`Init failed for ${walletLabel}:`, error);
                alert(
                  `Init failed for ${walletLabel}: ${
                    error instanceof Error ? error.message : "Network error"
                  }`
                );
              }
            });
            await Promise.all(promises);
          }}
          onClose={async () => {
            // Call close on all selected wallets
            const promises = selectedWalletIds.map(async (walletId) => {
              const wallet = wallets.find((w) => w.id === walletId);
              if (!wallet) return;
              const walletLabel = wallet.label || walletId;
              try {
                const response = await fetch(
                  `/api/hydra/${walletLabel}/action?action=close`,
                  { method: "POST" }
                );
                if (!response.ok) {
                  const error = await response.json().catch(() => ({}));
                  console.error(`Close failed for ${walletLabel}:`, error);
                  alert(
                    `Close failed for ${walletLabel}: ${
                      error.error || "Unknown error"
                    }`
                  );
                } else {
                  console.log(`Close successful for ${walletLabel}`);
                }
              } catch (error) {
                console.error(`Close failed for ${walletLabel}:`, error);
                alert(
                  `Close failed for ${walletLabel}: ${
                    error instanceof Error ? error.message : "Network error"
                  }`
                );
              }
            });
            await Promise.all(promises);
          }}
          onFanout={async () => {
            // Call fanout on all selected wallets
            const promises = selectedWalletIds.map(async (walletId) => {
              const wallet = wallets.find((w) => w.id === walletId);
              if (!wallet) return;
              const walletLabel = wallet.label || walletId;
              try {
                const response = await fetch(
                  `/api/hydra/${walletLabel}/action?action=fanout`,
                  { method: "POST" }
                );
                if (!response.ok) {
                  const error = await response.json().catch(() => ({}));
                  console.error(`Fanout failed for ${walletLabel}:`, error);
                  alert(
                    `Fanout failed for ${walletLabel}: ${
                      error.error || "Unknown error"
                    }`
                  );
                } else {
                  console.log(`Fanout successful for ${walletLabel}`);
                }
              } catch (error) {
                console.error(`Fanout failed for ${walletLabel}:`, error);
                alert(
                  `Fanout failed for ${walletLabel}: ${
                    error instanceof Error ? error.message : "Network error"
                  }`
                );
              }
            });
            await Promise.all(promises);
          }}
          onClearTransactions={() => setTransactions([])}
        />
      </main>
    </div>
  );
}
