import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
  useImperativeHandle,
  forwardRef,
  startTransition,
} from "react";
import { HydraAPIClient, HeadStatus, Party } from "@/lib/hydra-client";
import React from "react";

interface HydraPartyCardProps {
  party: Party;
  otherParties: Party[];
  initialStatus?: HeadStatus | null; // Status from parent (unified endpoint)
  onStatusUpdate?: (status: HeadStatus) => void;
  onSendUTXO?: (
    fromParty: Party,
    toParty: Party,
    utxoRef: string,
    utxo: any,
    sendHalf?: boolean
  ) => Promise<void>;
}

export interface HydraPartyCardRef {
  refreshUTXOs: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

interface UTXO {
  [key: string]: {
    address: string;
    value: {
      [key: string]: number;
    };
  };
}

const statusColors: Record<string, string> = {
  Idle: "bg-gray-500",
  Initial: "bg-yellow-500",
  Initializing: "bg-yellow-500",
  Open: "bg-green-500",
  Closed: "bg-orange-500",
  Finalized: "bg-blue-500",
};

const statusLabels: Record<string, string> = {
  Idle: "Idle",
  Initial: "Initializing",
  Initializing: "Initializing",
  Open: "Open",
  Closed: "Closed",
  Finalized: "Finalized",
};

const HydraPartyCard = forwardRef<HydraPartyCardRef, HydraPartyCardProps>(
  ({ party, otherParties, initialStatus, onStatusUpdate, onSendUTXO }, ref) => {
    const [status, setStatus] = useState<HeadStatus | null>(
      initialStatus || null
    );
    const [utxos, setUtxos] = useState<UTXO | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [wsConnected, setWsConnected] = useState(false);
    const [sendingUtxo, setSendingUtxo] = useState<string | null>(null);
    const [partyAddress, setPartyAddress] = useState<string | null>(null);
    // Use ref to always have latest status in fetchUTXOs callback
    const statusRef = useRef<HeadStatus | null>(null);
    const [sendHalf, setSendHalf] = useState(false);
    const [isRefreshingUtxos, setIsRefreshingUtxos] = useState(false);
    // Track if this is a manual refresh (user clicked) vs background refresh
    const isManualRefreshRef = useRef(false);

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
    const clientRef = useRef(new HydraAPIClient(party));
    const onStatusUpdateRef = useRef(onStatusUpdate);
    const fetchingStatusRef = useRef(false);
    const fetchingUtxosRef = useRef(false);
    const fetchingUtxosStartTimeRef = useRef<number | null>(null);
    const lastUtxoFetchTimeRef = useRef<number | null>(null);
    const utxosRef = useRef<UTXO | null>(null);
    const lastStatusFetchTimeRef = useRef<number | null>(null);

    // Keep ref updated
    useEffect(() => {
      onStatusUpdateRef.current = onStatusUpdate;
    }, [onStatusUpdate]);

    // Sync initialStatus prop updates silently (prevent flicker from unified polling)
    useEffect(() => {
      if (initialStatus === undefined) return; // Don't update if prop not provided

      // Only update if status actually changed (deep comparison)
      const currentStatus = statusRef.current || status;
      const statusChanged =
        JSON.stringify(currentStatus) !== JSON.stringify(initialStatus);

      if (statusChanged) {
        // Use startTransition to update silently in background
        startTransition(() => {
          setStatus((prevStatus) => {
            // Deep comparison to prevent unnecessary updates
            if (JSON.stringify(prevStatus) === JSON.stringify(initialStatus)) {
              return prevStatus;
            }
            statusRef.current = initialStatus;
            return initialStatus;
          });
        });
      }
    }, [initialStatus, status]);

    const fetchStatus = useCallback(async () => {
      // Prevent concurrent requests (but allow initial load)
      if (fetchingStatusRef.current) return;
      fetchingStatusRef.current = true;

      // Only show loading on initial fetch, not on subsequent polls
      if (status === null) {
        setLoading(true);
      }
      // Don't clear error immediately - keep showing it until we get a successful response
      try {
        const newStatus = await clientRef.current.getStatus();

        // If status is null, the node is not running - this is acceptable, don't show error
        if (newStatus === null) {
          // Clear error - node not running is not an error condition
          setError(null);
          // Keep last known status if we have one, otherwise set to null
          if (status === null) {
            setStatus(null);
          }
          // Mark as disconnected if node is not running
          setWsConnected(false);
          // Don't call onStatusUpdate if status is null (node not running)
          return;
        }

        // Clear error on successful fetch
        setError(null);
        // Mark as connected if we successfully got status
        setWsConnected(true);

        // Only update if status actually changed - use deep comparison to prevent flickering
        // Use startTransition to update silently in background
        startTransition(() => {
          setStatus((prevStatus) => {
            // Compare tag first for quick check
            if (prevStatus?.tag !== newStatus.tag) {
              statusRef.current = newStatus; // Update ref when status changes
              // Only clear UTXOs if status changes FROM Open/SnapshotConfirmed TO something else
              // Don't clear if changing TO Open (UTXOs will be fetched by useEffect)
              const prevIsOpen =
                prevStatus?.tag === "Open" ||
                prevStatus?.tag === "SnapshotConfirmed";
              const newIsOpen =
                newStatus.tag === "Open" ||
                newStatus.tag === "SnapshotConfirmed";
              if (prevIsOpen && !newIsOpen) {
                startTransition(() => {
                  setUtxos(null);
                });
              }
              return newStatus;
            }
            // Deep comparison for other fields
            if (JSON.stringify(prevStatus) === JSON.stringify(newStatus)) {
              return prevStatus; // Return same reference if unchanged
            }
            statusRef.current = newStatus; // Update ref when status changes
            // Don't clear UTXOs if status is still Open - just update the status
            // UTXOs will be preserved and refreshed by polling
            return newStatus;
          });
        });
        // Track when status was fetched via HTTP (for ignoring stale WebSocket updates)
        lastStatusFetchTimeRef.current = Date.now();
        if (onStatusUpdateRef.current) {
          onStatusUpdateRef.current(newStatus);
        }
      } catch (err) {
        // Only show errors for actual problems, not when node is simply not running
        // Provide user-friendly error messages
        let errorMessage = "Failed to fetch status";

        if (err instanceof Error) {
          const error = err as any;

          // Check if it's a server error (500, 502, 503, etc.)
          if (error.isServerError || (error.status && error.status >= 500)) {
            errorMessage = `Server error (${
              error.status || "500"
            }): The Hydra node may be temporarily unavailable. Please try again in a moment.`;
          }
          // Check for specific HTTP status codes
          else if (error.status === 404) {
            errorMessage =
              "Hydra node endpoint not found. Please check if the node is running.";
          } else if (error.status === 503) {
            // 503 is handled as null in getStatus, so this shouldn't happen, but just in case
            setError(null);
            return;
          } else if (error.status) {
            errorMessage = `Error ${error.status}: ${
              error.message || "Failed to fetch status"
            }`;
          } else {
            errorMessage = error.message || "Failed to fetch status";
          }
        }

        setError(formatError(errorMessage));

        // Don't clear status on error - keep showing last known status
        // Only clear if we don't have a status yet (initial load failure)
        if (status === null) {
          statusRef.current = null;
          setStatus(null);
        }

        console.error(
          `[HydraPartyCard] Error fetching status for ${party}:`,
          err
        );
      } finally {
        setLoading(false);
        fetchingStatusRef.current = false;
      }
    }, [status, party]);

    const fetchPartyAddress = async () => {
      try {
        const response = await fetch(`/api/hydra/${party}/address`);
        if (response.ok) {
          const data = await response.json();
          setPartyAddress(data.address);
        }
      } catch (err) {
        console.warn(`Failed to fetch address for ${party}:`, err);
      }
    };

    // Fetch UTXOs via API - status response doesn't include UTXOs in expected format
    const fetchUTXOs = useCallback(
      async (isManual = false) => {
        // Check both ref and state to avoid stale checks
        // Ref is updated immediately, state might lag slightly
        const currentStatus = statusRef.current || status;
        // Don't clear UTXOs here - let useEffect handle clearing when status changes
        // This prevents cancelling refreshes during re-renders
        // Treat "SnapshotConfirmed" as "Open" for UTXO fetching (it's an intermediate state)
        // Also allow fetching when Closed so users can see final state
        const isOpenState =
          currentStatus?.tag === "Open" ||
          currentStatus?.tag === "SnapshotConfirmed";
        const isClosedState =
          currentStatus?.tag === "Closed" ||
          (currentStatus as any)?.contents?.tag === "HeadClosed";
        if (!isOpenState && !isClosedState) {
          setIsRefreshingUtxos(false);
          return;
        }

        // Allow concurrent requests - don't block refreshes
        // If a request is in progress, let it complete but also start a new one
        // This ensures we always get the latest state, especially after transactions
        // Only skip if request just started (< 100ms ago) to prevent spam
        if (fetchingUtxosRef.current) {
          const timeSinceStart = fetchingUtxosStartTimeRef.current
            ? Date.now() - fetchingUtxosStartTimeRef.current
            : 0;

          // If request just started (< 100ms), skip to prevent spam
          if (timeSinceStart < 100) {
            return;
          }

          // If request is stuck (> 5 seconds), reset and allow new request
          if (timeSinceStart > 5000) {
            console.warn(
              `[HydraPartyCard] Previous UTXO fetch appears stuck, resetting for ${party}`
            );
            fetchingUtxosRef.current = false;
            fetchingUtxosStartTimeRef.current = null;
          }
          // Otherwise, allow the new request to proceed (will update when it completes)
        }
        fetchingUtxosRef.current = true;
        fetchingUtxosStartTimeRef.current = Date.now();
        isManualRefreshRef.current = isManual;
        // Only show loading indicator for manual refreshes, not background updates
        if (isManual) {
          setIsRefreshingUtxos(true);
        }

        try {
          // Fetch UTXOs via API
          const utxosData = await clientRef.current.getUTXOs();
          console.log(
            `[HydraPartyCard] Fetched UTXOs via API for ${party}:`,
            Object.keys(utxosData || {}).length,
            "UTXOs"
          );
          // Only update if UTXOs actually changed - prevent unnecessary re-renders
          // Use startTransition to update silently in background
          startTransition(() => {
            setUtxos((prevUtxos) => {
              if (!prevUtxos) {
                lastUtxoFetchTimeRef.current = Date.now();
                return utxosData;
              }
              // Quick check: compare number of UTXOs first
              const prevKeys = Object.keys(prevUtxos);
              const newKeys = Object.keys(utxosData);
              if (prevKeys.length !== newKeys.length) {
                lastUtxoFetchTimeRef.current = Date.now();
                return utxosData;
              }
              // Deep comparison only if keys match
              if (JSON.stringify(prevUtxos) === JSON.stringify(utxosData)) {
                return prevUtxos; // Return same reference if unchanged
              }
              lastUtxoFetchTimeRef.current = Date.now();
              return utxosData;
            });
          });
          // Fetch party address only if missing - it's cached on server, so this is fast
          // Don't block UTXO updates on address fetch
          if (!partyAddress) {
            fetchPartyAddress().catch(() => {
              // Silently fail - address is only for filtering, not critical
            });
          }
        } catch (err) {
          // Log error but don't fail completely - UTXO fetch is not critical for UI
          console.warn(
            `[HydraPartyCard] Failed to fetch UTXOs for ${party}:`,
            err
          );
          // Don't clear UTXOs on error - keep showing last known state
        } finally {
          fetchingUtxosRef.current = false;
          fetchingUtxosStartTimeRef.current = null;
          // Only clear loading state if it was a manual refresh
          if (isManualRefreshRef.current) {
            setIsRefreshingUtxos(false);
          }
          isManualRefreshRef.current = false;
        }
      },
      [partyAddress, party, status]
    );

    // Expose refreshUTXOs method via ref for parent to call after transactions
    // refreshStatus is now a no-op - status comes from props via unified endpoint
    useImperativeHandle(
      ref,
      () => ({
        refreshUTXOs: () => fetchUTXOs(false), // Background refresh - no loading indicator
        refreshStatus: () => Promise.resolve(), // No-op - status managed by parent via unified endpoint
      }),
      [fetchUTXOs]
    );

    // Update status when initialStatus prop changes (from unified endpoint)
    useEffect(() => {
      if (initialStatus !== undefined) {
        setStatus(initialStatus);
        statusRef.current = initialStatus;
        // Mark as connected if we have a status
        setWsConnected(initialStatus !== null);
      }
    }, [initialStatus]);

    useEffect(() => {
      // Status now comes from parent via initialStatus prop (unified endpoint)
      // No independent fetching - simplifies status management

      // Set up WebSocket connection (optional - HTTP polling is primary)
      // WebSocket is nice-to-have for real-time updates, but not required
      clientRef.current
        .connect((data) => {
          // Handle WebSocket messages
          if (data.tag) {
            const prevTag = statusRef.current?.tag;

            // Ignore stale WebSocket updates if we have a recent HTTP fetch
            // WebSocket often sends stale status on reconnection (e.g., "Greetings" when head is "Open")
            const recentHttpFetch =
              lastStatusFetchTimeRef.current &&
              Date.now() - lastStatusFetchTimeRef.current < 3000; // Within last 3 seconds

            // Only ignore if: we have recent HTTP fetch, current status exists, and WebSocket status differs
            // This prevents stale WebSocket reconnection from overriding correct HTTP-fetched status
            if (recentHttpFetch && prevTag && prevTag !== data.tag) {
              // Special case: if current status is "Open" and WebSocket sends non-Open, definitely ignore
              // "Open" is the authoritative state when head is running
              if (prevTag === "Open" && data.tag !== "Open") {
                return; // Ignore this stale WebSocket update
              }
              // For other status transitions, allow WebSocket (might be legitimate state change)
            }

            statusRef.current = data; // Update ref immediately
            // Only clear UTXOs if status changes FROM Open TO something else (but not Closed)
            // We want to keep UTXOs visible when Closed so users can see who gets what
            if (
              prevTag === "Open" &&
              data.tag !== "Open" &&
              data.tag !== "Closed"
            ) {
              startTransition(() => {
                setUtxos(null);
              });
            } else if (data.tag === "Open" && prevTag !== "Open") {
              // Fetch UTXOs when head becomes Open (transition from non-Open to Open)
              // Background refresh - no loading indicator
              fetchUTXOs(false);
            } else if (data.tag === "Closed" && prevTag !== "Closed") {
              // Fetch UTXOs when head becomes Closed (transition to Closed)
              // Background refresh - no loading indicator
              fetchUTXOs(false);
            }
            // Don't clear UTXOs if status is still Open - preserve them
            setStatus(data);
            if (onStatusUpdateRef.current) {
              onStatusUpdateRef.current(data);
            }
          }
        })
        .then(() => {
          // WebSocket connected - this is optional, HTTP polling is primary
          setWsConnected(true);
        })
        .catch((err) => {
          // WebSocket failed - that's okay, we use HTTP polling as primary
          // Don't set wsConnected to false here - let HTTP status determine it
          console.warn(
            `WebSocket connection failed for ${party} (using HTTP polling instead):`,
            err
          );
        });

      // Status is now fetched intentionally (on mount, after actions, etc.)
      // No automatic polling - reduces unnecessary API calls

      return () => {
        clientRef.current.disconnect();
      };
    }, [party]);

    // Keep utxosRef in sync with utxos state
    useEffect(() => {
      utxosRef.current = utxos;
    }, [utxos]);

    // Fetch UTXOs when head becomes Open and poll for updates
    useEffect(() => {
      // Update ref immediately when status changes
      statusRef.current = status;

      // Treat "SnapshotConfirmed" as "Open" for UTXO polling (it's an intermediate state)
      const isOpenState =
        status?.tag === "Open" || status?.tag === "SnapshotConfirmed";
      if (isOpenState) {
        // Initial fetch if we don't have UTXOs
        if (!utxos || Object.keys(utxos).length === 0) {
          fetchUTXOs(false);
        }

        // Set up polling for UTXOs when head is Open
        // Poll every 1 second for fast updates
        const pollInterval = setInterval(() => {
          const currentStatus = statusRef.current || status;
          const currentIsOpen =
            currentStatus?.tag === "Open" ||
            currentStatus?.tag === "SnapshotConfirmed";
          if (currentIsOpen && !fetchingUtxosRef.current) {
            fetchUTXOs(false); // Background refresh - no loading indicator
          }
        }, 1000); // Poll every 1 second when Open for fast updates

        // Fetch address only once - it's cached on server and never changes
        if (!partyAddress) {
          fetchPartyAddress().catch(() => {
            // Silently fail - address is only for filtering, not critical
          });
        }

        return () => {
          clearInterval(pollInterval);
        };
      }

      // When head is Closed, fetch UTXOs once to display them (but don't poll)
      const isClosedState =
        status?.tag === "Closed" ||
        (status as any)?.contents?.tag === "HeadClosed";
      if (isClosedState) {
        console.log(
          `[HydraPartyCard] Head is Closed, fetching UTXOs. Current UTXOs:`,
          utxos
        );
        // Always try to fetch when Closed, even if we have some UTXOs (they might be stale)
        fetchUTXOs(false); // Fetch once to show final state
      }

      // Don't clear UTXOs when Closed - we want to show them
      if (status !== null && !isOpenState && !isClosedState) {
        // Only clear UTXOs if status explicitly changed to non-Open (and not SnapshotConfirmed)
        // Don't clear if status is null (might be loading)
        // Don't clear if it's SnapshotConfirmed (treat as Open)
        if (status?.tag !== "SnapshotConfirmed") {
          startTransition(() => {
            setUtxos(null);
          });
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status?.tag]);

    const handleSendUTXO = async (
      utxoRef: string,
      utxo: any,
      toParty: Party
    ) => {
      if (!onSendUTXO) return;

      const startTime = performance.now();
      const utxoRefStr =
        typeof utxoRef === "string" ? utxoRef : String(utxoRef);

      console.log(`[HydraPartyCard] ========== SEND UTXO START ==========`);
      console.log(
        `[HydraPartyCard] Party: ${party}, To: ${toParty}, UTXO: ${utxoRefStr}`
      );
      console.log(
        `[HydraPartyCard] Send Half: ${sendHalf}, Amount: ${(
          (utxo.value?.lovelace || 0) / 1000000
        ).toFixed(2)} ADA`
      );
      console.log(`[HydraPartyCard] Timestamp: ${new Date().toISOString()}`);

      setSendingUtxo(utxoRefStr);
      setError(null);
      try {
        const beforeCall = performance.now();
        await onSendUTXO(party, toParty, utxoRefStr, utxo, sendHalf);
        const afterCall = performance.now();
        console.log(
          `[HydraPartyCard] onSendUTXO completed in ${(
            afterCall - beforeCall
          ).toFixed(2)}ms`
        );

        // Don't refresh UTXOs here - parent component (HydraHeadAction) handles targeted refresh
        // This prevents duplicate API calls and ensures only sender/receiver refresh
        // Unified endpoint handles status updates automatically

        const totalTime = performance.now() - startTime;
        console.log(
          `[HydraPartyCard] ========== SEND UTXO COMPLETE (${totalTime.toFixed(
            2
          )}ms) ==========`
        );
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to send UTXO";
        const totalTime = performance.now() - startTime;
        console.error(
          `[HydraPartyCard] ========== SEND UTXO FAILED (${totalTime.toFixed(
            2
          )}ms) ==========`
        );
        console.error(`[HydraPartyCard] Error:`, err);
        setError(formatError(errorMsg));
      } finally {
        setSendingUtxo(null);
      }
    };

    const client = clientRef.current;

    const partyName = party.charAt(0).toUpperCase() + party.slice(1);
    // Map "SnapshotConfirmed" to "Open" for display - it's an intermediate state, not a user-facing status
    const displayTag =
      status?.tag === "SnapshotConfirmed" ? "Open" : status?.tag || "Unknown";
    const statusTag = displayTag;
    const statusColor = statusColors[statusTag] || "bg-gray-500";

    // Calculate UTXO stats for header
    const utxoStats = useMemo(() => {
      // Include Open, SnapshotConfirmed, and Closed states for stats calculation
      const isVisibleState =
        status?.tag === "Open" ||
        status?.tag === "SnapshotConfirmed" ||
        status?.tag === "Closed" ||
        (status as any)?.contents?.tag === "HeadClosed";
      if (!utxos || !isVisibleState) {
        return { ownedCount: 0, totalUtxos: 0, totalADA: "0.00" };
      }

      const ownedUtxos = Object.entries(utxos).filter(([_, utxo]) => {
        if (!utxo || typeof utxo !== "object" || !utxo.address) {
          return false;
        }
        if (partyAddress) {
          return utxo.address === partyAddress;
        }
        return true;
      });

      const totalLovelace = ownedUtxos.reduce((sum, [_, utxo]) => {
        if (!utxo || typeof utxo !== "object") return sum;
        const lovelace =
          utxo.value &&
          typeof utxo.value === "object" &&
          "lovelace" in utxo.value
            ? (utxo.value as any).lovelace || 0
            : 0;
        return sum + lovelace;
      }, 0);
      const totalADA = (totalLovelace / 1000000).toFixed(2);

      return {
        ownedCount: ownedUtxos.length,
        totalUtxos: Object.keys(utxos).length,
        totalADA,
      };
    }, [utxos, status?.tag, partyAddress]);

    // Determine if this card should flow left or right based on party
    const flowsRight = party === "alice";
    const flowsLeft = party === "bob";

    return (
      <div className="bg-blue-950/40 rounded-xl border border-blue-900/60 p-2 h-full flex flex-col relative overflow-hidden">
        {/* Flowing visual element toward center - Alice flows right, Bob flows left */}
        {flowsRight && (
          <div className="hidden md:block absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-blue-950/60 via-blue-950/30 to-transparent pointer-events-none rounded-r-xl"></div>
        )}
        {flowsLeft && (
          <div className="hidden md:block absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-blue-950/60 via-blue-950/30 to-transparent pointer-events-none rounded-l-xl"></div>
        )}
        <div className="mb-1.5 relative z-10 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-5 h-5 bg-blue-800 rounded-lg flex items-center justify-center text-white font-bold text-[10px]">
                ⚡
              </div>
              <h2 className="text-sm font-bold text-white">
                {partyName} Hydra
              </h2>
              {/* UTXO Stats - Inline with party name */}
              {(status?.tag === "Open" ||
                status?.tag === "SnapshotConfirmed" ||
                status?.tag === "Closed" ||
                (status as any)?.contents?.tag === "HeadClosed") && (
                <div className="flex items-center gap-2 ml-2 text-xs">
                  <span className="text-gray-400">
                    {utxoStats.totalADA} ADA
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-400">
                    {utxoStats.ownedCount}
                    {utxoStats.totalUtxos > utxoStats.ownedCount && (
                      <span className="text-gray-500">
                        /{utxoStats.totalUtxos}
                      </span>
                    )}{" "}
                    UTXO{utxoStats.ownedCount !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={
                  status?.tag === "Open" ||
                  status?.tag === "SnapshotConfirmed" ||
                  status?.tag === "Closed" ||
                  (status as any)?.contents?.tag === "HeadClosed"
                    ? () => fetchUTXOs(true)
                    : undefined
                }
                disabled={
                  isRefreshingUtxos ||
                  loading ||
                  (status?.tag !== "Open" &&
                    status?.tag !== "SnapshotConfirmed")
                }
                className="text-xs text-blue-300 hover:text-blue-200 disabled:opacity-50 transition-opacity"
                title={
                  isRefreshingUtxos || loading ? "Refreshing..." : "Refresh"
                }
              >
                {isRefreshingUtxos || loading ? "↻" : "Refresh"}
              </button>
              {/* Status Indicator */}
              <div className="flex items-center gap-1">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${statusColor} transition-all duration-300`}
                  title={`Status: ${statusLabels[statusTag] || statusTag}`}
                />
                <span className="text-xs text-white font-semibold transition-all duration-300">
                  {statusLabels[statusTag] || statusTag}
                </span>
              </div>
              {/* Connection Indicator */}
              <div className="flex items-center gap-1">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    wsConnected ? "bg-green-500" : "bg-red-500"
                  }`}
                  title={
                    wsConnected
                      ? "WebSocket Connected"
                      : "WebSocket Disconnected"
                  }
                />
                <span className="text-xs text-gray-400">
                  {wsConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
            {/* Send Half toggle */}
            {otherParties.length > 0 &&
              (status?.tag === "Open" ||
                status?.tag === "SnapshotConfirmed") && (
                <button
                  onClick={() => setSendHalf(!sendHalf)}
                  className={`ml-2 px-2 py-1 rounded text-[10px] font-medium transition ${
                    sendHalf
                      ? "bg-purple-600 text-white hover:bg-purple-700"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                  title={
                    sendHalf ? "Sending half amount" : "Sending full amount"
                  }
                >
                  Send Half
                </button>
              )}
          </div>
        </div>

        {/* UTXO List */}
        {(status?.tag === "Open" ||
          status?.tag === "SnapshotConfirmed" ||
          status?.tag === "Closed" ||
          (status as any)?.contents?.tag === "HeadClosed") && (
          <div className="space-y-1.5 max-h-[96px] min-h-[96px] overflow-y-auto">
            {/* Keep structure visible during refresh to prevent layout shift */}
            {(() => {
              // Show loading state only if we have no UTXOs and are manually refreshing
              // Don't show loading for background refreshes to prevent flicker
              if (isRefreshingUtxos && !utxos) {
                return (
                  <div className="text-center py-4 text-xs text-gray-500">
                    Loading UTXOs...
                  </div>
                );
              }

              if (!utxos || Object.keys(utxos).length === 0) {
                return (
                  <div className="text-center py-4 text-xs text-gray-500">
                    No UTXOs in head
                  </div>
                );
              }

              // Filter UTXOs to only show those owned by this party
              const ownedUtxos = Object.entries(utxos).filter(([_, utxo]) => {
                if (!utxo || typeof utxo !== "object" || !utxo.address) {
                  return false;
                }
                if (partyAddress) {
                  return utxo.address === partyAddress;
                }
                return true;
              });

              if (ownedUtxos.length === 0) {
                return (
                  <div className="text-center py-4 text-xs text-gray-500">
                    {partyAddress ? "No UTXOs owned by you" : "Loading..."}
                  </div>
                );
              }

              return (
                <div className="space-y-1">
                  {ownedUtxos.map(([utxoRef, utxo]) => {
                    const utxoRefStr =
                      typeof utxoRef === "string" ? utxoRef : String(utxoRef);
                    const utxoKey = utxoRefStr;
                    if (!utxo || typeof utxo !== "object") {
                      return null;
                    }
                    const lovelace =
                      utxo.value &&
                      typeof utxo.value === "object" &&
                      "lovelace" in utxo.value
                        ? (utxo.value as any).lovelace || 0
                        : 0;
                    const ada = (lovelace / 1000000).toFixed(2);
                    const isSending = sendingUtxo === utxoRefStr;

                    return (
                      <div
                        key={utxoKey}
                        className={`p-1 bg-blue-950/50 rounded border border-blue-900/60 text-xs ${
                          isSending
                            ? "opacity-50"
                            : "cursor-pointer hover:bg-blue-950/70 transition"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-mono text-gray-400 text-[10px] whitespace-nowrap">
                              {`${utxoRefStr.substring(
                                0,
                                4
                              )}...${utxoRefStr.substring(
                                utxoRefStr.length - 4
                              )}`}
                            </span>
                            <span className="text-white font-semibold transition-all duration-200 whitespace-nowrap">
                              {ada} ADA
                            </span>
                          </div>
                          <div className="flex gap-1 flex-wrap items-center">
                            {isSending ? (
                              <span className="text-yellow-400 text-xs">
                                Sending...
                              </span>
                            ) : (
                              (() => {
                                // Check if head is closed - don't show send buttons
                                const isClosed =
                                  status?.tag === "Closed" ||
                                  (status as any)?.contents?.tag ===
                                    "HeadClosed";

                                if (isClosed) {
                                  return null; // Don't show send buttons when closed
                                }

                                if (otherParties.length === 0) {
                                  return (
                                    <span className="text-gray-500 text-xs">
                                      No recipients
                                    </span>
                                  );
                                }

                                return otherParties.map((toParty) => (
                                  <button
                                    key={toParty}
                                    onClick={() =>
                                      handleSendUTXO(utxoRefStr, utxo, toParty)
                                    }
                                    className="px-1.5 py-0.5 bg-blue-800 hover:bg-blue-900 rounded text-white text-[10px] whitespace-nowrap"
                                    title={`Send ${
                                      sendHalf ? "half" : "all"
                                    } to ${toParty}`}
                                  >
                                    → {toParty}
                                    {sendHalf && " (½)"}
                                  </button>
                                ));
                              })()
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {error && (
          <div className="mb-2 p-2 bg-red-900/50 border border-red-500 rounded text-red-200 text-xs flex items-center justify-between gap-2 break-words overflow-hidden max-w-full">
            <span className="flex-1 break-words">{error}</span>
            <button
              onClick={() => setError(null)}
              className="flex-shrink-0 text-red-300 hover:text-red-100 transition-colors"
              title="Dismiss error"
              aria-label="Close error"
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
          </div>
        )}
      </div>
    );
  }
);

HydraPartyCard.displayName = "HydraPartyCard";

// Memoize to prevent unnecessary re-renders when transactions happen
// The component manages its own state internally, so we only re-render if party or callbacks change
export default memo(HydraPartyCard, (prevProps, nextProps) => {
  return (
    prevProps.party === nextProps.party &&
    JSON.stringify(prevProps.otherParties) ===
      JSON.stringify(nextProps.otherParties) &&
    prevProps.onStatusUpdate === nextProps.onStatusUpdate &&
    prevProps.onSendUTXO === nextProps.onSendUTXO
  );
});
