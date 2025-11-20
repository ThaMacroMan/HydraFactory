import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  memo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Party, HydraAPIClient, HeadStatus } from "@/lib/hydra-client";

interface WalletUTXO {
  utxoRef: string;
  txHash: string;
  txIx: string;
  lovelace: number;
  ada: number;
  address: string;
}

interface WalletUTXOsProps {
  party: Party;
  headStatus?: HeadStatus | null;
  cachedUtxos?: any[]; // Optional cached UTXOs to avoid re-fetching
}

export interface WalletUTXOsRef {
  refreshWalletUtxos: () => Promise<void>;
}

const WalletUTXOs = forwardRef<WalletUTXOsRef, WalletUTXOsProps>(
  ({ party, headStatus, cachedUtxos }, ref) => {
  const [utxos, setUtxos] = useState<WalletUTXO[]>(cachedUtxos || []);
  const [error, setError] = useState<string | null>(null);

  // Helper to format error messages - truncate long technical errors
  const formatError = useCallback((errorMsg: string): string => {
    // Maximum length for error display
    const MAX_LENGTH = 120;

    // If error is short enough, return as-is
    if (errorMsg.length <= MAX_LENGTH) {
      return errorMsg;
    }

    // Try to extract a meaningful summary from common error patterns
    if (errorMsg.includes("NotEnoughFuel")) {
      return "NotEnoughFuel: Transaction failed due to insufficient fees or collateral";
    }
    if (errorMsg.includes("InsufficientCollateral")) {
      return "InsufficientCollateral: Transaction needs collateral inputs";
    }
    if (errorMsg.includes("BadInputsUTxO")) {
      return "BadInputsUTxO: UTXO may have been spent or doesn't exist";
    }
    if (errorMsg.includes("ValueNotConservedUTxO")) {
      return "ValueNotConservedUTxO: Transaction value mismatch";
    }

    // For other long errors, truncate and add ellipsis
    return errorMsg.substring(0, MAX_LENGTH) + "...";
  }, []);

  // Helper to safely set error (always string)
  const setErrorSafe = useCallback(
    (err: any) => {
      let errorMsg: string;
      if (typeof err === "string") {
        errorMsg = err;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      } else if (err && typeof err === "object") {
        // If it's an object, try to extract a meaningful message
        const msg =
          (err as any).message || (err as any).error || JSON.stringify(err);
        errorMsg = typeof msg === "string" ? msg : "An error occurred";
      } else {
        errorMsg = "An error occurred";
      }
      // Format the error to keep it concise
      setError(formatError(errorMsg));
    },
    [formatError]
  );
  const [committingUtxo, setCommittingUtxo] = useState<string | null>(null);
  // Track committed UTXOs that should still show as "Committing" even after being removed from wallet list
  // Store as Map<utxoRef, ada> to preserve UTXO details for display
  const [committedUtxos, setCommittedUtxos] = useState<Map<string, number>>(
    new Map()
  );
  const client = new HydraAPIClient(party);
  const fetchingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchWalletUtxos = useCallback(async () => {
    // Prevent concurrent requests
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsRefreshing(true);

    // Don't clear existing UTXOs - keep them visible during refresh
    // Only clear error if we're starting fresh (no existing UTXOs)
    setUtxos((prevUtxos) => {
      if (prevUtxos.length === 0) {
        setError(null);
      }
      return prevUtxos; // Keep existing UTXOs visible during fetch
    });

    try {
      const response = await fetch(`/api/hydra/${party}/wallet-utxos`);
      if (response.ok) {
        const data = await response.json();
        const newUtxos: WalletUTXO[] = data.utxos || [];

        // Only update if UTXOs actually changed (incremental update)
        setUtxos((prevUtxos) => {
          // Create maps for quick lookup
          const prevMap = new Map(prevUtxos.map((u) => [u.utxoRef, u]));
          const newMap = new Map(newUtxos.map((u) => [u.utxoRef, u]));

          // Check if anything changed
          const hasChanges =
            prevUtxos.length !== newUtxos.length ||
            prevUtxos.some((u) => {
              const newUtxo = newMap.get(u.utxoRef);
              return (
                !newUtxo ||
                newUtxo.lovelace !== u.lovelace ||
                newUtxo.ada !== u.ada
              );
            }) ||
            newUtxos.some((u) => !prevMap.has(u.utxoRef));

          // Only update if there are actual changes
          if (hasChanges) {
            return newUtxos;
          }
          return prevUtxos; // Return same reference if unchanged
        });

        // Clear error on successful fetch
        setError(null);
      } else {
        const errorData = await response.json();
        // Ensure error message is always a string
        const errorMsg =
          typeof errorData.error === "string"
            ? errorData.error
            : "Failed to fetch wallet UTXOs";
        throw new Error(errorMsg);
      }
    } catch (err) {
      // Only set error if we don't have existing data, or if it's a critical error
      setUtxos((prevUtxos) => {
        if (prevUtxos.length === 0) {
          // Ensure error message is always a string
          let errorMsg: string;
          if (err instanceof Error) {
            errorMsg = err.message;
          } else if (typeof err === "string") {
            errorMsg = err;
          } else {
            errorMsg = "Failed to fetch wallet UTXOs";
          }
          setError(formatError(errorMsg));
        } else {
          // For existing data, just log the error but don't show it to user
          console.warn(
            `[WalletUTXOs] Failed to refresh UTXOs for ${party}:`,
            err
          );
        }
        return prevUtxos; // Keep existing UTXOs on error
      });
    } finally {
      fetchingRef.current = false;
      setIsRefreshing(false);
    }
  }, [party]);

  useEffect(() => {
    // Use cached UTXOs if available, otherwise fetch
    if (cachedUtxos && Array.isArray(cachedUtxos) && cachedUtxos.length > 0) {
      // Convert cached UTXOs to WalletUTXO format if needed
      const formattedUtxos: WalletUTXO[] = cachedUtxos.map((utxo: any) => ({
        utxoRef: utxo.utxoRef || `${utxo.txHash}#${utxo.txIx}`,
        txHash: utxo.txHash || utxo.utxoRef?.split("#")[0] || "",
        txIx: utxo.txIx || utxo.utxoRef?.split("#")[1] || "0",
        lovelace: utxo.lovelace || 0,
        ada: utxo.ada || (utxo.lovelace ? utxo.lovelace / 1000000 : 0),
        address: utxo.address || "",
      }));
      setUtxos(formattedUtxos);
    } else if (!cachedUtxos || cachedUtxos.length === 0) {
      // Only fetch on initial load if no cache - Cardano wallet UTXOs don't change frequently
      // The slow cardano-cli query (20-39s) blocks the server and slows down Hydra API calls
      // Users can manually refresh via the refresh button when needed
      fetchWalletUtxos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, cachedUtxos]); // Update when party or cache changes

  // Expose refresh method via ref
  useImperativeHandle(
    ref,
    () => ({
      refreshWalletUtxos: fetchWalletUtxos,
    }),
    [fetchWalletUtxos]
  );

  const handleCommit = async (utxoRef: string, retryCount: number = 0) => {
    console.log(`[WalletUTXOs] ========== Starting commit ==========`);
    console.log(`[WalletUTXOs] Party: ${party}`);
    console.log(`[WalletUTXOs] UTXO: ${utxoRef}`);
    console.log(`[WalletUTXOs] Retry count: ${retryCount}`);
    console.log(
      `[WalletUTXOs] Current head status:`,
      headStatus
        ? {
            tag: headStatus.tag,
            pendingCommits: headStatus.pendingCommits,
            committed: headStatus.committed?.length || 0,
            canCommit: canCommit,
          }
        : "headStatus is null/undefined"
    );
    console.log(`[WalletUTXOs] Current UTXOs in state:`, utxos.length);

    // Check if commits are allowed in current head state
    if (!headStatus) {
      const errorMsg = `Cannot commit: Head status not available. Please wait for the head to initialize.`;
      console.error(`[WalletUTXOs] ${errorMsg}`);
      setErrorSafe(errorMsg);
      return;
    }

    // After initial commit, we may need to use increment instead
    const hasPendingCommits = (headStatus.pendingCommits || 0) > 0;
    const hasCommitted = (headStatus.committed?.length || 0) > 0;
    const isSubsequentCommit = hasPendingCommits || hasCommitted;

    console.log(`[WalletUTXOs] Commit context:`, {
      hasPendingCommits,
      hasCommitted,
      isSubsequentCommit,
      canCommit,
    });

    if (!canCommit && headStatus.tag === "Open") {
      const errorMsg = `Cannot commit: Head is in "${headStatus.tag}" state. Commits are only allowed during Initial or Initializing states.`;
      console.error(`[WalletUTXOs] ${errorMsg}`);
      setErrorSafe(errorMsg);
      return;
    }

    // Find the UTXO being committed
    const utxoToCommit = utxos.find((u) => u.utxoRef === utxoRef);
    console.log(
      `[WalletUTXOs] Found UTXO to commit:`,
      utxoToCommit
        ? {
            utxoRef: utxoToCommit.utxoRef,
            ada: utxoToCommit.ada,
            lovelace: utxoToCommit.lovelace,
          }
        : "NOT FOUND"
    );

    setCommittingUtxo(utxoRef);
    // Add to committed map so it shows as "Committing" even after being removed from wallet list
    // Store ADA amount for display
    const adaAmount = utxoToCommit?.ada || 0;
    setCommittedUtxos((prev) => {
      const next = new Map(prev);
      next.set(utxoRef, adaAmount);
      return next;
    });

    setError(null);
    try {
      // Send full UTXO reference (txHash#txIx) - WebSocket handles it correctly
      console.log(`[WalletUTXOs] Calling commit API for ${party}...`);
      const result = await client.commit(utxoRef);
      console.log(`[WalletUTXOs] Commit API response:`, {
        hasTransaction: !!result.transaction,
        hasError: !!result.error,
        hasMessage: !!result.message,
        isScriptError: result.isScriptError,
        txId: result.transaction?.txId,
        cborHexLength: result.transaction?.cborHex?.length,
      });

      // Commit returns a transaction that needs to be signed and submitted
      if (result.transaction) {
        console.log(`[WalletUTXOs] Commit transaction received:`, {
          hasCborHex: !!result.transaction.cborHex,
          cborHexLength: result.transaction.cborHex?.length,
          txId: result.transaction.txId,
        });

        // Automatically sign and submit the transaction
        try {
          console.log(
            `[WalletUTXOs] Submitting commit transaction to mainchain...`
          );
          const submitResponse = await fetch(
            `/api/hydra/${party}/submit-commit`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transaction: result.transaction }),
            }
          );

          console.log(
            `[WalletUTXOs] Submit response status:`,
            submitResponse.status
          );

          if (!submitResponse.ok) {
            const errorData = await submitResponse.json();
            console.error(`[WalletUTXOs] Submit failed:`, errorData);

            // Ensure error message is always a string
            let errorMsg: string;
            if (typeof errorData.message === "string") {
              errorMsg = errorData.message;
            } else if (typeof errorData.error === "string") {
              errorMsg = errorData.error;
            } else {
              errorMsg = "Failed to submit commit transaction";
            }
            throw new Error(errorMsg);
          }

          const submitResult = await submitResponse.json();
          console.log(
            `[WalletUTXOs] Commit transaction submitted successfully:`,
            submitResult
          );

          // If head is Open, we need to wait for the deposit to be confirmed and collected
          // The deposit transaction must be confirmed on-chain before the head can collect it
          // This process can take 10-30 seconds: deposit confirmation (5-10s) + head collection (5-20s)
          if (headStatus?.tag === "Open") {
            console.log(
              `[WalletUTXOs] Head is Open - deposit transaction submitted.`
            );
            console.log(
              `[WalletUTXOs] The deposit must be confirmed on-chain (5-10 seconds), then the head will collect it automatically (5-20 seconds).`
            );
            console.log(
              `[WalletUTXOs] Total expected time: 10-30 seconds. You can monitor progress in the TUI.`
            );

            // For Open heads, deposits are collected asynchronously by the head
            // We don't need to wait here - the deposit is submitted and will be collected automatically
            // The user can see the progress in the TUI which shows "PendingDeposit" status
            console.log(
              `[WalletUTXOs] Deposit transaction submitted successfully. The head will process it automatically.`
            );
          } else {
            // For Initial/Initializing states, commits need time to be confirmed on-chain
            // The head will collect them automatically once confirmed (can take 5-10+ seconds)
            // Don't check status immediately - let unified polling handle it
            console.log(
              `[WalletUTXOs] Commit transaction submitted. The head will collect it once confirmed on-chain (may take 5-10 seconds).`
            );
            // Note: Status will update automatically via unified polling endpoint
          }

          // Track commit as a main chain transaction
          // Commits are main chain transactions (moving UTXOs from main chain to Hydra head)
          // Find the UTXO details to include ADA amount
          const committedUtxo = utxos.find((u) => u.utxoRef === utxoRef);
          console.log(`[WalletUTXOs] Looking up UTXO for transaction log:`, {
            utxoRef,
            found: !!committedUtxo,
            ada: committedUtxo?.ada,
            lovelace: committedUtxo?.lovelace,
          });

          // Immediately remove the committed UTXO from the list (optimistic update)
          // This prevents trying to commit the same UTXO twice
          setUtxos((prevUtxos) =>
            prevUtxos.filter((u) => u.utxoRef !== utxoRef)
          );

          const commitData = {
            party,
            utxoRef,
            txId: result.transaction.txId,
            timestamp: Date.now(),
            ada: committedUtxo?.ada,
          };
          console.log(
            `[WalletUTXOs] Calling onCommitTransaction with:`,
            commitData
          );

          if (
            typeof window !== "undefined" &&
            (window as any).onCommitTransaction
          ) {
            (window as any).onCommitTransaction(commitData);
            console.log(
              `[WalletUTXOs] onCommitTransaction called successfully`
            );
          } else {
            console.warn(
              `[WalletUTXOs] onCommitTransaction callback not available`
            );
          }

          // Success - refresh wallet UTXOs after a delay to get updated list from chain
          // Increased delay to allow transaction to be confirmed on-chain
          console.log(
            `[WalletUTXOs] Scheduling wallet refresh in 5 seconds...`
          );
          setTimeout(fetchWalletUtxos, 5000);
        } catch (submitErr) {
          console.error(
            `[WalletUTXOs] Error submitting commit transaction:`,
            submitErr
          );

          // Ensure error message is always a string
          let errorMsg: string;
          if (submitErr instanceof Error) {
            errorMsg = submitErr.message;
          } else if (typeof submitErr === "string") {
            errorMsg = submitErr;
          } else {
            errorMsg = "Unknown error";
          }

          setErrorSafe(
            `Commit transaction created but submission failed: ${errorMsg}`
          );
        }
      } else if (result.error) {
        console.error(`[WalletUTXOs] Commit API returned error:`, result);

        // Ensure error message is a string
        let errorMsg: string;
        if (typeof result.error === "string") {
          errorMsg = result.error;
        } else if (result.message && typeof result.message === "string") {
          errorMsg = result.message;
        } else {
          errorMsg = "Commit failed";
        }

        // If it's a script error and we haven't retried yet, wait and retry once
        if (result.isScriptError && retryCount === 0) {
          console.log(
            `[WalletUTXOs] Script error detected, waiting 3 seconds and retrying...`
          );
          setErrorSafe(
            "Waiting for head to process previous commit, retrying..."
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));
          return handleCommit(utxoRef, 1); // Retry once
        }

        throw new Error(errorMsg);
      } else {
        console.log(
          `[WalletUTXOs] Commit successful (no transaction returned)`
        );
        // Success - refresh wallet UTXOs
        setTimeout(fetchWalletUtxos, 2000);
      }
    } catch (err) {
      // Ensure error message is always a string
      let errorMsg: string;
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === "string") {
        errorMsg = err;
      } else {
        errorMsg = "Commit failed";
      }
      console.error(`[WalletUTXOs] Commit error:`, err);
      setErrorSafe(errorMsg);
      // On error, remove from committed map and clear committing state
      setCommittedUtxos((prev) => {
        const next = new Map(prev);
        next.delete(utxoRef);
        return next;
      });
      setCommittingUtxo(null);
    } finally {
      console.log(`[WalletUTXOs] Commit process completed for ${utxoRef}`);
      // Clear committingUtxo but keep in committedUtxos set so it still shows as "Committing"
      setCommittingUtxo(null);
      // Keep in committedUtxos set - will be removed when commit is confirmed
    }
  };

  const totalADA = useMemo(() => {
    return utxos.reduce((sum, utxo) => sum + utxo.ada, 0);
  }, [utxos]);

  const partyName = party.charAt(0).toUpperCase() + party.slice(1);

  // Check if head is in a state that allows commits
  // Commits are allowed during Initial and Initializing states only
  // After initial commit, subsequent commits use "increment" endpoint
  const canCommit = useMemo(() => {
    // If headStatus is not available yet, don't allow commits
    if (!headStatus) {
      console.log(
        `[WalletUTXOs] Commit allowed check for ${party}: headStatus not available yet`
      );
      return false;
    }
    // Commits are only allowed during Initial and Initializing states
    const allowed =
      headStatus.tag === "Initial" || headStatus.tag === "Initializing";
    console.log(`[WalletUTXOs] Commit allowed check for ${party}:`, {
      tag: headStatus.tag,
      allowed,
      pendingCommits: headStatus.pendingCommits,
      committed: headStatus.committed?.length || 0,
    });
    return allowed;
  }, [headStatus, party]);

  // Determine if this is an increment (subsequent commit) or initial commit
  // If head is Open, it's already been initialized, so use increment
  // Also use increment if there are pending commits or already committed UTXOs
  const isIncrement = useMemo(() => {
    if (!headStatus) return false;
    const isOpen = headStatus.tag === "Open";
    const hasPendingCommits = (headStatus.pendingCommits || 0) > 0;
    const hasCommitted = (headStatus.committed?.length || 0) > 0;
    return isOpen || hasPendingCommits || hasCommitted;
  }, [headStatus]);

  // Clear committed UTXOs when head status changes to Open (commits have been collected)
  useEffect(() => {
    if (headStatus?.tag === "Open" && committedUtxos.size > 0) {
      console.log(
        `[WalletUTXOs] Head is Open, clearing ${committedUtxos.size} committed UTXOs`
      );
      setCommittedUtxos(new Map());
    }
  }, [headStatus?.tag]);

  return (
    <div className="bg-blue-600/20 rounded-xl border border-blue-500/50 p-2 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-5 h-5 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-[10px]">
            ₳
          </div>
          <h3 className="text-sm font-bold text-white">{partyName} Cardano</h3>
          <div className="flex items-center gap-2 ml-2 text-xs">
            <span className="text-gray-400">{totalADA.toFixed(2)} ADA</span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400">
              {utxos.length} UTXO{utxos.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <button
          onClick={fetchWalletUtxos}
          disabled={isRefreshing}
          className="text-xs text-blue-300 hover:text-blue-200 disabled:opacity-50 transition-opacity flex-shrink-0"
          title={isRefreshing ? "Refreshing..." : "Refresh wallet UTXOs"}
        >
          {isRefreshing ? "↻" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-1.5 p-2 bg-red-900/50 border border-red-500 rounded text-red-200 text-xs flex-shrink-0 break-words overflow-hidden max-w-full">
          {String(error)}
        </div>
      )}

      <div className="space-y-1.5 max-h-[96px] min-h-[96px] overflow-y-auto">
        {utxos.length === 0 && !isRefreshing ? (
          <div className="text-center py-4 text-gray-400 text-xs">
            No UTXOs in wallet
          </div>
        ) : utxos.length === 0 && isRefreshing ? (
          <div className="text-center py-4 text-gray-400 text-xs">
            Loading...
          </div>
        ) : (
          <>
            {/* Show regular UTXOs */}
            {utxos.map((utxo) => {
              const isCommitting =
                committingUtxo === utxo.utxoRef ||
                committedUtxos.has(utxo.utxoRef);
              return (
                <div
                  key={utxo.utxoRef}
                  className={`p-1 bg-blue-700/30 rounded border border-blue-600/50 text-xs ${
                    isCommitting ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-mono text-gray-400 text-[10px] whitespace-nowrap">
                        {typeof utxo.utxoRef === "string"
                          ? `${utxo.utxoRef.substring(
                              0,
                              4
                            )}...${utxo.utxoRef.substring(
                              utxo.utxoRef.length - 4
                            )}`
                          : String(utxo.utxoRef)}
                      </span>
                      <span className="text-white font-semibold whitespace-nowrap">
                        {utxo.ada.toFixed(2)} ADA
                      </span>
                    </div>
                    {canCommit && (
                      <button
                        onClick={() => handleCommit(utxo.utxoRef, 0)}
                        disabled={isCommitting}
                        className="px-2 py-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:cursor-not-allowed rounded text-white text-xs transition whitespace-nowrap flex-shrink-0"
                      >
                        {isCommitting
                          ? isIncrement
                            ? "Incrementing..."
                            : "Committing..."
                          : isIncrement
                          ? "Increment"
                          : "Commit"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Show committed UTXOs that are no longer in wallet list */}
            {Array.from(committedUtxos.entries())
              .filter(([utxoRef]) => !utxos.some((u) => u.utxoRef === utxoRef))
              .map(([utxoRef, ada]) => (
                <div
                  key={utxoRef}
                  className="p-1 bg-blue-700/30 rounded border border-blue-600/50 text-xs opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-mono text-gray-400 text-[10px] whitespace-nowrap">
                        {typeof utxoRef === "string"
                          ? `${utxoRef.substring(0, 4)}...${utxoRef.substring(
                              utxoRef.length - 4
                            )}`
                          : String(utxoRef)}
                      </span>
                      <span className="text-white font-semibold whitespace-nowrap">
                        {ada.toFixed(2)} ADA
                      </span>
                    </div>
                    {canCommit && (
                      <button
                        disabled
                        className="px-2 py-1 bg-gray-700 disabled:cursor-not-allowed rounded text-white text-xs transition whitespace-nowrap flex-shrink-0"
                      >
                        {isIncrement ? "Incrementing..." : "Committing..."}
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
);

// Memoize to prevent unnecessary re-renders
// Only re-render if party or headStatus.tag changes
// Hydra transactions should not cause Cardano wallet refreshes
export default memo(WalletUTXOs, (prevProps, nextProps) => {
  // Deep comparison of headStatus to prevent re-renders from status updates
  const prevTag = prevProps.headStatus?.tag;
  const nextTag = nextProps.headStatus?.tag;
  const prevPendingCommits = prevProps.headStatus?.pendingCommits;
  const nextPendingCommits = nextProps.headStatus?.pendingCommits;

  return (
    prevProps.party === nextProps.party &&
    prevTag === nextTag &&
    prevPendingCommits === nextPendingCommits
  );
});
