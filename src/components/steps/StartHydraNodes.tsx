import { useState, useEffect, useRef } from "react";
import { HeadStatus } from "@/lib/hydra-client";

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

interface CustomScript {
  id: string;
  name: string;
  description?: string;
  txIds: string;
  network: "preprod" | "mainnet" | "preview";
  createdAt: string;
  isDefault?: boolean;
}

interface HydraNodesProps {
  wallets: WalletPair[];
  selectedWalletIds: string[];
  onSelectWallet: (walletId: string) => void;
  nodeStatus: Record<string, NodeStatus>;
  headStatus: Record<string, HeadStatus | null>;
  onRefreshStatus?: () => void;
  onNodeStatusUpdate?: (nodeStatus: Record<string, NodeStatus>) => void;
  onStateFileInitializingChange?: (
    stateFileInitializing: Record<string, boolean>
  ) => void;
  onHeadStatusUpdate?: (headStatus: Record<string, HeadStatus | null>) => void;
}

function CopyButton({
  text,
  copied,
  onCopy,
  label,
}: {
  text: string;
  copied: boolean;
  onCopy: (e?: React.MouseEvent) => void;
  label?: string;
}) {
  const handleCopy = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    try {
      await navigator.clipboard.writeText(text);
      onCopy(e);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`px-2 py-1 text-[10px] border rounded transition ${
        copied
          ? "bg-green-600/20 border-green-500/50 text-green-400"
          : "border-gray-600/50 hover:bg-gray-700/50 text-gray-400"
      }`}
      title="Copy to clipboard"
    >
      {copied ? "✓" : label || "Copy"}
    </button>
  );
}

function CompactErrorBox({
  error,
  visible,
  copied,
  onClose,
  onCopy,
}: {
  error: string;
  visible: boolean;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
}) {
  if (!visible || !error) return null;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(error);
      onCopy();
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 bg-red-950/30 border border-red-500/30 rounded text-[10px] text-red-400 max-w-xs cursor-pointer hover:bg-red-950/40 hover:border-red-500/50 transition"
      onClick={handleCopy}
      title="Click to copy error"
    >
      <svg
        className="w-3 h-3 flex-shrink-0 text-red-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="truncate flex-1 min-w-0">{error}</span>
      {copied ? (
        <span className="text-[9px] text-green-400 flex-shrink-0">Copied!</span>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="flex-shrink-0 text-red-400 hover:text-red-300 transition"
          title="Close error"
        >
          <svg
            className="w-3 h-3"
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
      )}
    </div>
  );
}

export default function HydraNodes({
  wallets,
  selectedWalletIds,
  onSelectWallet,
  nodeStatus,
  headStatus,
  onRefreshStatus,
  onNodeStatusUpdate,
  onStateFileInitializingChange,
  onHeadStatusUpdate,
}: HydraNodesProps) {
  const [expanded, setExpanded] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [expandedCommands, setExpandedCommands] = useState<
    Record<string, boolean>
  >({});
  const [copiedCommands, setCopiedCommands] = useState<Record<string, boolean>>(
    {}
  );
  const [copiedLogs, setCopiedLogs] = useState<Record<string, boolean>>({});
  const [startingNodes, setStartingNodes] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startErrorVisible, setStartErrorVisible] = useState(true);
  const [startErrorCopied, setStartErrorCopied] = useState(false);
  const [stoppingNodes, setStoppingNodes] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupErrorVisible, setCleanupErrorVisible] = useState(true);
  const [cleanupErrorCopied, setCleanupErrorCopied] = useState(false);
  const [stateFileInitializing, setStateFileInitializing] = useState<
    Record<string, boolean>
  >({});
  const [scripts, setScripts] = useState<CustomScript[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [loadingScripts, setLoadingScripts] = useState(true);
  const isCheckingStatusRef = useRef(false);
  const onRefreshStatusRef = useRef(onRefreshStatus);
  const onNodeStatusUpdateRef = useRef(onNodeStatusUpdate);
  const onStateFileInitializingChangeRef = useRef(
    onStateFileInitializingChange
  );
  const onHeadStatusUpdateRef = useRef(onHeadStatusUpdate);
  const headStatusRef = useRef(headStatus);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load scripts on mount
  useEffect(() => {
    const loadScripts = async () => {
      try {
        setLoadingScripts(true);
        const res = await fetch("/api/scripts/list");
        if (res.ok) {
          const data = await res.json();
          setScripts(data.scripts || []);
          // Auto-select default script if available
          const defaultScript = data.scripts?.find((s: CustomScript) => s.isDefault);
          if (defaultScript) {
            setSelectedScriptId(defaultScript.id);
          } else if (data.scripts?.length > 0) {
            setSelectedScriptId(data.scripts[0].id);
          }
        }
      } catch (error) {
        console.error("Error loading scripts:", error);
      } finally {
        setLoadingScripts(false);
      }
    };
    loadScripts();
  }, []);

  // Keep the refs updated with the latest callbacks and head status
  useEffect(() => {
    onRefreshStatusRef.current = onRefreshStatus;
    onNodeStatusUpdateRef.current = onNodeStatusUpdate;
    onStateFileInitializingChangeRef.current = onStateFileInitializingChange;
    onHeadStatusUpdateRef.current = onHeadStatusUpdate;
    headStatusRef.current = headStatus;
  }, [
    onRefreshStatus,
    onNodeStatusUpdate,
    onStateFileInitializingChange,
    onHeadStatusUpdate,
    headStatus,
  ]);

  // Unified check for both node status and initialization state
  // Throttled to prevent excessive API calls
  useEffect(() => {
    const checkUnifiedStatus = async () => {
      if (selectedWalletIds.length === 0 || isCheckingStatusRef.current) {
        // Clear state if no wallets selected
        if (selectedWalletIds.length === 0) {
          setStateFileInitializing({});
          if (onStateFileInitializingChangeRef.current) {
            onStateFileInitializingChangeRef.current({});
          }
        }
        return;
      }

      isCheckingStatusRef.current = true;
      try {
        // Build wallet configs for the unified endpoint
        const walletConfigs = selectedWalletIds
          .map((walletId) => {
            const wallet = wallets.find((w) => w.id === walletId);
            if (!wallet) return null;
            return {
              walletId,
              walletLabel: wallet.label || walletId,
            };
          })
          .filter(
            (config): config is { walletId: string; walletLabel: string } =>
              config !== null
          );

        if (walletConfigs.length === 0) return;

        const shouldCheckStateFiles = walletConfigs.some(({ walletLabel }) => {
          const status = headStatus[walletLabel];
          if (!status) {
            return true;
          }
          return status.tag === "Initial" || status.tag === "Initializing";
        });

        const res = await fetch("/api/nodes/unified-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletConfigs,
            includeStateChecks: shouldCheckStateFiles,
          }),
        });

        if (res.ok) {
          const data = await res.json();

          // Update node status directly from unified response (prevents duplicate API calls)
          if (data.nodeStatus) {
            if (onNodeStatusUpdateRef.current) {
              // Use the new callback to update nodeStatus directly
              onNodeStatusUpdateRef.current(data.nodeStatus);
            } else if (onRefreshStatusRef.current) {
              // Fallback to old method for backward compatibility
              onRefreshStatusRef.current();
            }
          }

          // Update initialization state
          if (data.stateFileInitializing) {
            setStateFileInitializing(data.stateFileInitializing);
            if (onStateFileInitializingChangeRef.current) {
              onStateFileInitializingChangeRef.current(
                data.stateFileInitializing
              );
            }
          }

          // Update head status if available
          if (data.headStatus && onHeadStatusUpdateRef.current) {
            onHeadStatusUpdateRef.current(data.headStatus);
          }
        }
      } catch (error) {
        console.error("[HydraNodes] Error checking unified status:", error);
      } finally {
        isCheckingStatusRef.current = false;
      }
    };

    // Check status when selected wallets change
    checkUnifiedStatus();

    // Simple fixed-interval polling - 5 seconds for all states
    // This eliminates circular dependency and complexity
    const POLL_INTERVAL = 5000;

    // Set up periodic refresh with fixed interval
    const scheduleNextPoll = () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }

      intervalRef.current = setTimeout(() => {
        if (selectedWalletIds.length > 0 && !isCheckingStatusRef.current) {
          checkUnifiedStatus();
        }
        // Schedule next poll
        scheduleNextPoll();
      }, POLL_INTERVAL);
    };

    // Start polling
    scheduleNextPoll();

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [selectedWalletIds, wallets]); // Removed headStatus from deps - using ref instead

  const handleStartAllNodes = async () => {
    if (selectedWalletIds.length === 0) {
      setStartError("Please select at least one wallet");
      setStartErrorVisible(true);
      setStartErrorCopied(false);
      return;
    }

    setStartingNodes(true);
    setStartError(null);
    setStartErrorVisible(true);
    setStartErrorCopied(false);

    try {
      // Clean up persistence for selected wallets before starting nodes
      // This prevents PartiesMismatch errors when switching wallet combinations
      try {
        const cleanupResponse = await fetch("/api/nodes/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletIds: selectedWalletIds }),
        });

        if (cleanupResponse.ok) {
          const cleanupResult = await cleanupResponse.json();
          console.log("Cleaned up persistence before starting nodes:", cleanupResult);
        }
      } catch (cleanupError) {
        // Log but don't fail - cleanup is best effort
        console.warn("Failed to cleanup persistence before starting nodes:", cleanupError);
      }

      // Build wallet configurations
      const walletConfigs = selectedWalletIds.map((walletId, index) => {
        const wallet = wallets.find((w) => w.id === walletId);
        if (!wallet) throw new Error(`Wallet ${walletId} not found`);

        const walletLabel = wallet.label || walletId;
        const persistenceDirName =
          wallet.persistenceDirName ||
          `persistence-${walletLabel}-${walletId.substring(0, 8)}`;
        const listenPort = 5001 + index;
        const apiPort = 4001 + index;

        const otherWallets = selectedWalletIds.filter((id) => id !== walletId);
        const peerPorts = otherWallets.map((otherId) => {
          const otherIndex = selectedWalletIds.indexOf(otherId);
          return 5001 + otherIndex;
        });

        const otherWalletLabels = otherWallets.map((otherId) => {
          const otherWallet = wallets.find((w) => w.id === otherId);
          return otherWallet?.label || otherId;
        });

        return {
          walletId,
          walletLabel,
          persistenceDirName,
          listenPort,
          apiPort,
          peerPorts,
          otherWalletLabels,
        };
      });

      const response = await fetch("/api/nodes/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          wallets: walletConfigs,
          scriptId: selectedScriptId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start nodes");
      }

      const result = await response.json();

      if (result.errors && result.errors.length > 0) {
        // Check if any errors are PartiesMismatch related
        const hasPartiesMismatch = result.errors.some((e: any) =>
          e.error?.includes("PartiesMismatch") || e.error?.includes("ParameterMismatch")
        );

        let errorMessage = "Some nodes failed to start: ";
        if (hasPartiesMismatch) {
          errorMessage +=
            "PartiesMismatch detected - persisted state doesn't match current wallet selection. ";
          errorMessage +=
            "Persistence has been cleaned up. Please try starting nodes again.";
        } else {
          errorMessage += result.errors
            .map((e: any) => `${e.walletId}: ${e.error}`)
            .join(", ");
        }

        setStartError(errorMessage);
        setStartErrorVisible(true);
        setStartErrorCopied(false);
      }

      // Refresh node status after a short delay, then check again for stability
      setTimeout(() => {
        if (onRefreshStatus) {
          onRefreshStatus();
          // Check again after 5 seconds to ensure nodes are stable
          setTimeout(() => {
            onRefreshStatus();
          }, 5000);
        } else {
          window.location.reload();
        }
      }, 3000);
    } catch (error) {
      console.error("Error starting nodes:", error);
      setStartError((error as Error).message);
      setStartErrorVisible(true);
      setStartErrorCopied(false);
    } finally {
      setStartingNodes(false);
    }
  };

  const handleStopNodes = async () => {
    setStoppingNodes(true);
    setCleanupError(null);
    setCleanupErrorVisible(true);
    setCleanupErrorCopied(false);

    try {
      const stopResponse = await fetch("/api/nodes/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletIds: selectedWalletIds }),
      });

      if (!stopResponse.ok) {
        const error = await stopResponse.json();
        throw new Error(error.error || "Failed to stop nodes");
      }

      const stopResult = await stopResponse.json();
      console.log("Stop result:", stopResult);

      // Refresh status after nodes stop
      setTimeout(() => {
        if (onRefreshStatus) {
          onRefreshStatus();
        } else {
          window.location.reload();
        }
      }, 2000);
    } catch (error) {
      console.error("Error stopping nodes:", error);
      setCleanupError((error as Error).message);
      setCleanupErrorVisible(true);
      setCleanupErrorCopied(false);
    } finally {
      setStoppingNodes(false);
    }
  };

  const handleClearHistory = async () => {
    if (
      !confirm(
        "Are you sure you want to delete all history? This will remove all persistence directories and cannot be undone."
      )
    ) {
      return;
    }

    setCleaningUp(true);
    setCleanupError(null);
    setCleanupErrorVisible(true);
    setCleanupErrorCopied(false);

    try {
      const cleanupResponse = await fetch("/api/nodes/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletIds: selectedWalletIds }),
      });

      if (!cleanupResponse.ok) {
        const error = await cleanupResponse.json();
        throw new Error(error.error || "Failed to cleanup persistence");
      }

      const cleanupResult = await cleanupResponse.json();
      console.log("Cleanup result:", cleanupResult);

      if (cleanupResult.errors && cleanupResult.errors.length > 0) {
        setCleanupError(
          `Some errors occurred: ${cleanupResult.errors.join(", ")}`
        );
        setCleanupErrorVisible(true);
        setCleanupErrorCopied(false);
      }

      // Refresh status
      setTimeout(() => {
        if (onRefreshStatus) {
          onRefreshStatus();
        } else {
          window.location.reload();
        }
      }, 1000);
    } catch (error) {
      console.error("Error cleaning up persistence:", error);
      setCleanupError((error as Error).message);
      setCleanupErrorVisible(true);
      setCleanupErrorCopied(false);
    } finally {
      setCleaningUp(false);
    }
  };

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between border-b border-gray-800">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-4 flex-1 hover:opacity-80 transition"
        >
          <div className="flex items-center gap-3">
            {(() => {
              // Check if all selected nodes are running
              const allNodesRunning =
                selectedWalletIds.length > 0 &&
                selectedWalletIds.every((walletId) => {
                  const wallet = wallets.find((w) => w.id === walletId);
                  if (!wallet) return false;
                  const walletLabel = wallet.label || walletId;
                  const status =
                    nodeStatus[walletId] || nodeStatus[walletLabel];
                  return status?.online === true;
                });

              return (
                <div
                  className={`w-3 h-3 rounded-full ${
                    allNodesRunning
                      ? "bg-emerald-400"
                      : selectedWalletIds.length > 0
                      ? "bg-amber-400"
                      : "bg-gray-500"
                  }`}
                />
              );
            })()}
            <h2 className="text-xl font-semibold">4. Start Hydra nodes</h2>
          </div>
          <span className="text-sm text-gray-400">
            {selectedWalletIds.length === 0
              ? "No wallets selected"
              : `${selectedWalletIds.length} wallet${
                  selectedWalletIds.length !== 1 ? "s" : ""
                } selected`}
          </span>
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCommands(!showCommands)}
            className="px-3 py-1.5 text-xs border border-gray-600 rounded-lg hover:bg-gray-800 text-gray-300 transition"
          >
            {showCommands ? "Hide Commands" : "Show Commands"}
          </button>
          <svg
            onClick={() => setExpanded(!expanded)}
            className={`w-5 h-5 text-gray-400 transition-transform cursor-pointer hover:opacity-80 ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="px-6 py-6 space-y-4 border-t border-gray-800">
          <div className="space-y-4">
            {/* Script Selector */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <label className="block text-sm text-gray-300 font-medium mb-2">
                Hydra Script
              </label>
              {loadingScripts ? (
                <div className="text-xs text-gray-400">Loading scripts...</div>
              ) : scripts.length === 0 ? (
                <div className="text-xs text-gray-400">
                  No scripts available. Create one in the Custom Scripts section.
                </div>
              ) : (
                <select
                  value={selectedScriptId || ""}
                  onChange={(e) => setSelectedScriptId(e.target.value || null)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                >
                  {scripts.map((script) => (
                    <option key={script.id} value={script.id}>
                      {script.name}
                      {script.isDefault ? " (Default)" : ""} - {script.network}
                    </option>
                  ))}
                </select>
              )}
              {selectedScriptId && (
                <p className="text-xs text-gray-500 mt-2">
                  Selected:{" "}
                  {scripts.find((s) => s.id === selectedScriptId)?.name || "Unknown"}
                </p>
              )}
            </div>

            {selectedWalletIds.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {(() => {
                        // Check if all selected nodes are running
                        const allNodesRunning =
                          selectedWalletIds.length > 0 &&
                          selectedWalletIds.every((walletId) => {
                            const wallet = wallets.find(
                              (w) => w.id === walletId
                            );
                            if (!wallet) return false;
                            const walletLabel = wallet.label || walletId;
                            const status =
                              nodeStatus[walletId] || nodeStatus[walletLabel];
                            return status?.online === true;
                          });

                        const isDisabled =
                          startingNodes ||
                          stoppingNodes ||
                          cleaningUp ||
                          allNodesRunning;

                        return (
                          <button
                            onClick={handleStartAllNodes}
                            disabled={isDisabled}
                            className={`px-4 py-2 rounded-lg font-medium text-sm transition flex items-center gap-2 ${
                              isDisabled
                                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                                : "bg-blue-600 hover:bg-blue-700 text-white"
                            }`}
                          >
                            {startingNodes ? (
                              <>
                                <svg
                                  className="animate-spin h-4 w-4"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                                <span>Starting Nodes...</span>
                              </>
                            ) : allNodesRunning ? (
                              <>
                                <svg
                                  className="h-4 w-4 text-green-400"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                <span>Nodes Running</span>
                              </>
                            ) : (
                              "Start All Nodes"
                            )}
                          </button>
                        );
                      })()}
                      <button
                        onClick={handleStopNodes}
                        disabled={startingNodes || stoppingNodes || cleaningUp}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                          startingNodes || stoppingNodes || cleaningUp
                            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                            : "bg-orange-600 hover:bg-orange-700 text-white"
                        }`}
                      >
                        {stoppingNodes ? "Stopping..." : "Stop Nodes"}
                      </button>
                      <button
                        onClick={handleClearHistory}
                        disabled={startingNodes || stoppingNodes || cleaningUp}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                          startingNodes || stoppingNodes || cleaningUp
                            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                            : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        {cleaningUp ? "Clearing..." : "Clear History"}
                      </button>
                      <CompactErrorBox
                        error={startError || ""}
                        visible={startErrorVisible}
                        copied={startErrorCopied}
                        onClose={() => setStartErrorVisible(false)}
                        onCopy={() => {
                          setStartErrorCopied(true);
                          setTimeout(() => setStartErrorCopied(false), 2000);
                        }}
                      />
                      <CompactErrorBox
                        error={cleanupError || ""}
                        visible={cleanupErrorVisible}
                        copied={cleanupErrorCopied}
                        onClose={() => setCleanupErrorVisible(false)}
                        onCopy={() => {
                          setCleanupErrorCopied(true);
                          setTimeout(() => setCleanupErrorCopied(false), 2000);
                        }}
                      />
                    </div>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2 flex-shrink-0 lg:max-w-md">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-blue-300 font-medium whitespace-nowrap">
                        📦 Required: Nix package manager
                      </p>
                      <span className="text-xs text-blue-200/80">
                        If not installed:{" "}
                        <code className="text-blue-300">
                          sh &lt;(curl -L https://nixos.org/nix/install)
                        </code>
                      </span>
                    </div>
                  </div>
                </div>

                {showCommands && (
                  <div className="bg-gray-800/30 rounded-lg border border-gray-700/50">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/50">
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                        Manual Commands
                      </p>
                      {selectedWalletIds.length > 1 && (
                        <button
                          onClick={() => {
                            const allExpanded = selectedWalletIds.every(
                              (id) => expandedCommands[id]
                            );
                            const newState: Record<string, boolean> = {};
                            selectedWalletIds.forEach((id) => {
                              newState[id] = !allExpanded;
                            });
                            setExpandedCommands(newState);
                          }}
                          className="px-2 py-1 text-xs border border-gray-600/50 rounded hover:bg-gray-700/50 text-gray-400 transition"
                        >
                          {selectedWalletIds.every((id) => expandedCommands[id])
                            ? "Collapse"
                            : "Expand"}
                        </button>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="grid gap-2">
                        {selectedWalletIds.map((walletId, index) => {
                          const wallet = wallets.find((w) => w.id === walletId);
                          if (!wallet) return null;

                          const walletLabel = wallet.label || walletId;
                          // Use persistence directory name from wallet, or generate fallback
                          const persistenceDirName =
                            wallet.persistenceDirName ||
                            `persistence-${walletLabel}-${walletId.substring(
                              0,
                              8
                            )}`;
                          const listenPort = 5001 + index;
                          const apiPort = 4001 + index;
                          const otherWallets = selectedWalletIds.filter(
                            (id) => id !== walletId
                          );

                          // Generate peer arguments (all other selected wallets)
                          const peerLines = otherWallets
                            .map((otherId) => {
                              const otherIndex =
                                selectedWalletIds.indexOf(otherId);
                              return `  --peer 127.0.0.1:${
                                5001 + otherIndex
                              } \\`;
                            })
                            .join("\n");

                          // Generate cardano verification key arguments (all other wallets)
                          const cardanoVkeyLines = otherWallets
                            .map((otherId) => {
                              const otherWallet = wallets.find(
                                (w) => w.id === otherId
                              );
                              const otherLabel = otherWallet?.label || otherId;
                              return `  --cardano-verification-key .tmp/wallets/${otherLabel}/payment.vkey \\`;
                            })
                            .join("\n");

                          // Generate hydra verification key arguments (all other wallets)
                          const hydraVkeyLines = otherWallets
                            .map((otherId) => {
                              const otherWallet = wallets.find(
                                (w) => w.id === otherId
                              );
                              const otherLabel = otherWallet?.label || otherId;
                              return `  --hydra-verification-key .tmp/wallets/${otherLabel}/hydra.vkey \\`;
                            })
                            .join("\n");

                          // Get selected script's TX IDs or use default
                          const selectedScript = scripts.find(
                            (s) => s.id === selectedScriptId
                          );
                          const scriptsTxId = selectedScript
                            ? selectedScript.txIds
                            : "$SCRIPTS_TX_ID";

                          const command = `cd .cardano && source ../scripts/setup-env.sh && cd .. && \\
source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh && \\
.hydra/hydra-node \\
  --node-id ${walletId}-node \\
  --persistence-dir .hydra/${persistenceDirName} \\
  --listen 127.0.0.1:${listenPort} \\
${peerLines ? peerLines : ""}${
                            peerLines ? "\n" : ""
                          }  --cardano-signing-key .tmp/wallets/${walletLabel}/payment.skey \\
${
  cardanoVkeyLines ? cardanoVkeyLines + "\n" : ""
}  --hydra-signing-key .tmp/wallets/${walletLabel}/hydra.skey \\
${
  hydraVkeyLines ? hydraVkeyLines + "\n" : ""
}  --hydra-scripts-tx-id "${scriptsTxId}" \\
  --ledger-protocol-parameters .hydra/protocol-parameters.json \\
  --testnet-magic 1 \\
  --node-socket "$CARDANO_NODE_SOCKET_PATH" \\
  --api-port ${apiPort} \\
  --api-host 0.0.0.0`;

                          const status = nodeStatus[walletId];
                          const online = status?.online ?? false;

                          const isCommandExpanded =
                            expandedCommands[walletId] ?? false;
                          const isCopied = copiedCommands[walletId] ?? false;

                          return (
                            <div
                              key={walletId}
                              className="bg-gray-900/40 rounded border border-gray-700/30 hover:border-gray-600/50 transition"
                            >
                              <button
                                onClick={() =>
                                  setExpandedCommands((prev) => ({
                                    ...prev,
                                    [walletId]: !prev[walletId],
                                  }))
                                }
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-800/30 transition"
                              >
                                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                  <svg
                                    className={`w-3 h-3 text-gray-500 transition-transform flex-shrink-0 ${
                                      isCommandExpanded ? "rotate-90" : ""
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 5l7 7-7 7"
                                    />
                                  </svg>
                                  <span className="text-xs font-medium text-gray-300 capitalize">
                                    {wallet?.label || walletId}
                                  </span>
                                  <div
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      online ? "bg-emerald-400" : "bg-amber-400"
                                    }`}
                                  />
                                  <span
                                    className={`text-xs ${
                                      online
                                        ? "text-emerald-400"
                                        : "text-amber-400"
                                    }`}
                                  >
                                    {online ? "Online" : "Offline"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {online && (
                                    <CopyButton
                                      text={`tail -f .tmp/logs/hydra-${walletId}.log`}
                                      copied={copiedLogs[walletId] ?? false}
                                      onCopy={(e) => {
                                        setCopiedLogs((prev) => ({
                                          ...prev,
                                          [walletId]: true,
                                        }));
                                        setTimeout(() => {
                                          setCopiedLogs((prev) => ({
                                            ...prev,
                                            [walletId]: false,
                                          }));
                                        }, 2000);
                                      }}
                                      label="Logs Command"
                                    />
                                  )}
                                  <CopyButton
                                    text={command}
                                    copied={isCopied}
                                    onCopy={(e) => {
                                      setCopiedCommands((prev) => ({
                                        ...prev,
                                        [walletId]: true,
                                      }));
                                    }}
                                    label="Start Command"
                                  />
                                </div>
                              </button>
                              {isCommandExpanded && (
                                <div className="px-3 pb-3 pt-2 border-t border-gray-700/30 space-y-3">
                                  {online && (
                                    <div>
                                      <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-[10px] text-gray-400 font-medium">
                                          Logs Command
                                        </p>
                                        <CopyButton
                                          text={`tail -f .tmp/logs/hydra-${walletId}.log`}
                                          copied={copiedLogs[walletId] ?? false}
                                          onCopy={(e) => {
                                            setCopiedLogs((prev) => ({
                                              ...prev,
                                              [walletId]: true,
                                            }));
                                            setTimeout(() => {
                                              setCopiedLogs((prev) => ({
                                                ...prev,
                                                [walletId]: false,
                                              }));
                                            }, 2000);
                                          }}
                                          label="Copy"
                                        />
                                      </div>
                                      <div className="bg-black/60 rounded p-2.5 font-mono text-[10px] leading-relaxed whitespace-pre overflow-x-auto">
                                        <code className="block text-gray-300">
                                          {`tail -f .tmp/logs/hydra-${walletId}.log`}
                                        </code>
                                      </div>
                                    </div>
                                  )}
                                  <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <p className="text-[10px] text-gray-400 font-medium">
                                        Start Command
                                      </p>
                                      <CopyButton
                                        text={command}
                                        copied={isCopied}
                                        onCopy={(e) => {
                                          setCopiedCommands((prev) => ({
                                            ...prev,
                                            [walletId]: true,
                                          }));
                                        }}
                                        label="Copy"
                                      />
                                    </div>
                                    <div className="bg-black/60 rounded p-2.5 font-mono text-[10px] leading-relaxed whitespace-pre overflow-x-auto">
                                      <code className="block text-gray-300">
                                        {command}
                                      </code>
                                    </div>
                                  </div>
                                  {status?.error && (
                                    <p className="text-[10px] text-red-400 mt-2">
                                      {status.error}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Wallet Selector */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-300 font-medium mb-3">
                Select Wallets for Hydra Head
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {wallets.map((wallet) => {
                  const isSelected = selectedWalletIds.includes(wallet.id);
                  const status = nodeStatus[wallet.id];
                  const online = status?.online ?? false;
                  const hasError = status?.error && !online;

                  // Calculate API port based on position in selected wallets
                  const selectedIndex = selectedWalletIds.indexOf(wallet.id);
                  const apiPort =
                    selectedIndex >= 0 ? 4001 + selectedIndex : null;

                  return (
                    <button
                      key={wallet.id}
                      onClick={() => {
                        onSelectWallet(wallet.id);
                        // Status will be checked automatically by useEffect when selectedWalletIds changes
                      }}
                      className={`
                        flex items-center justify-between px-2.5 py-1.5 rounded-md border transition-all                                                              
                        ${
                          isSelected
                            ? "bg-blue-600/20 border-blue-500 shadow-md shadow-blue-500/20"
                            : "bg-gray-700/30 border-gray-600 hover:border-gray-500 hover:bg-gray-700/50"
                        }
                      `}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isSelected && apiPort !== null && (
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              online
                                ? "bg-emerald-400"
                                : hasError
                                ? "bg-red-400"
                                : "bg-amber-400"
                            }`}
                            title={
                              online
                                ? "Online"
                                : hasError
                                ? `Error: ${status.error}`
                                : "Offline"
                            }
                          />
                        )}
                        <span className="text-xs font-medium text-gray-100 capitalize truncate">
                          {wallet.label || wallet.id}
                        </span>
                        {isSelected && online && (
                          <span className="text-[10px] font-medium text-emerald-400 flex-shrink-0">
                            running
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <svg
                          className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 ml-1"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  );
                })}
                {wallets.length === 0 && (
                  <p className="text-sm text-gray-400 italic col-span-full">
                    No wallets found. Generate wallets in the Wallet Factory
                    section.
                  </p>
                )}
              </div>
            </div>

            {selectedWalletIds.length === 0 && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-400">
                  Select at least one wallet above to generate startup commands.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
