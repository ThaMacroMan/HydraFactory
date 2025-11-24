import { useState } from "react";
import Image from "next/image";
import ChecklistItem from "./shared/ChecklistItem";
import DownloadConfigsButton from "./shared/DownloadConfigsButton";
import CopyCommandButton from "./shared/CopyCommandButton";
import ExtractButton from "./shared/ExtractButton";
import DownloadButton from "./shared/DownloadButton";

interface CardanoStatus {
  running: boolean;
  synced?: boolean;
  syncProgress?: string;
  error?: string;
  version?: string;
}

interface ReleaseInfo {
  latestVersion: string;
  latestTag: string;
  publishedAt: string;
  releaseUrl: string;
  assets: Array<{
    name: string;
    downloadUrl: string;
    size: number;
  }>;
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

interface CardanoNodeSetupProps {
  expanded: boolean;
  onToggle: () => void;
  status: CardanoStatus | null;
  loading: boolean;
  checklist: ChecklistData | null;
  onRefresh: () => void;
}

function CardanoNodeCliItem({
  item,
  onRefresh,
}: {
  item: SoftwareItem;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/30 hover:border-gray-600/50 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-800/70 transition cursor-pointer group"
      >
        <div className="mt-0.5">
          {item.installed ? (
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 text-gray-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 text-left">
          <p className="font-medium group-hover:text-gray-100 transition-colors">
            {item.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
            {expanded ? "Less" : "More"}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 group-hover:text-gray-300 transition-all ${
              expanded ? "rotate-90" : ""
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
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-700/50">
          <div className="pt-2">
            <p className="text-sm text-gray-400">{item.description}</p>
            <p className="text-xs text-gray-500 font-mono mt-1 break-all">
              {item.fullPath}
            </p>
            {item.archiveFound && !item.installed && (
              <p className="text-xs text-amber-400 mt-1">
                ⚠️ Archive found: {item.archivePath?.split("/").pop()}
              </p>
            )}
          </div>
          {!item.installed && (
            <>
              <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
                <p className="text-sm font-medium mb-2">
                  📥 Download Instructions
                </p>
                <p className="text-xs text-gray-400 mb-3">
                  Scroll down on the GitHub release page to find the Assets
                  section. Download the archive for your platform (macOS, Linux,
                  or Windows), then drop the downloaded file into the{" "}
                  <span className="font-mono text-gray-300">.cardano</span>{" "}
                  folder.
                </p>
                <div className="rounded-lg overflow-hidden border border-gray-700">
                  <Image
                    src="/cardanodownload.png"
                    alt="GitHub release page showing Cardano binaries download"
                    width={1200}
                    height={800}
                    className="w-full h-auto"
                  />
                </div>
              </div>
              <div className="flex gap-4 justify-center">
                {item.needsExtraction && item.archivePath && (
                  <ExtractButton
                    archivePath={item.archivePath}
                    targetPath={item.path}
                    onExtracted={onRefresh}
                    className="px-6 py-3 text-sm font-medium"
                  />
                )}
                <DownloadButton
                  filePath={item.path}
                  className="px-6 py-3 text-sm font-medium"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CardanoNodeSetup({
  expanded,
  onToggle,
  status,
  loading,
  checklist,
  onRefresh,
}: CardanoNodeSetupProps) {
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [started, setStarted] = useState(false);
  const [checkingReleases, setCheckingReleases] = useState(false);
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState(false);
  const running = status?.running ?? false;
  const synced = status?.synced ?? false;
  const currentVersion = status?.version;

  const handleStart = async () => {
    try {
      setStarting(true);
      setStarted(false);
      const res = await fetch("/api/cardano/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start node");
      }
      setStarted(true);
      // Refresh status after a short delay
      setTimeout(() => {
        onRefresh();
        setStarted(false);
      }, 2000);
    } catch (error) {
      alert(`Failed to start Cardano node: ${(error as Error).message}`);
      setStarted(false);
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      setStopping(true);
      const res = await fetch("/api/cardano/stop", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to stop node");
      }
      // Refresh status after a short delay
      setTimeout(() => {
        onRefresh();
      }, 1000);
    } catch (error) {
      alert(`Failed to stop Cardano node: ${(error as Error).message}`);
    } finally {
      setStopping(false);
    }
  };

  const handleCheckReleases = async () => {
    try {
      setCheckingReleases(true);
      setReleaseError(null);
      const res = await fetch("/api/cardano/releases");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch releases");
      }
      setReleaseInfo(data);
    } catch (error) {
      setReleaseError((error as Error).message);
    } finally {
      setCheckingReleases(false);
    }
  };

  const isUpdateAvailable = (): boolean => {
    if (!currentVersion || !releaseInfo) return false;
    const current = currentVersion.split(".").map(Number);
    const latest = releaseInfo.latestVersion.split(".").map(Number);
    for (let i = 0; i < Math.max(current.length, latest.length); i++) {
      const curr = current[i] || 0;
      const lat = latest[i] || 0;
      if (lat > curr) return true;
      if (lat < curr) return false;
    }
    return false;
  };

  const handleDownloadAndInstall = async () => {
    if (running) {
      if (
        !confirm(
          "The Cardano node is currently running. It must be stopped before upgrading. Stop the node now?"
        )
      ) {
        return;
      }
      // Stop the node first
      try {
        await handleStop();
        // Wait a bit for the node to stop
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        alert(
          `Failed to stop node: ${(error as Error).message}. Please stop it manually before upgrading.`
        );
        return;
      }
    }

    try {
      setDownloading(true);
      setInstalling(false);
      setInstallError(null);
      setInstallSuccess(false);

      // Step 1: Download the latest release
      const downloadRes = await fetch("/api/cardano/download-latest", {
        method: "POST",
      });
      const downloadData = await downloadRes.json();
      if (!downloadRes.ok) {
        throw new Error(downloadData.error || "Failed to download release");
      }

      // Step 2: Extract the archive
      setDownloading(false);
      setInstalling(true);

      const extractRes = await fetch("/api/cardano/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archivePath: downloadData.archivePath,
          targetPath: "bin/",
        }),
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok) {
        throw new Error(extractData.error || "Failed to extract archive");
      }

      setInstalling(false);
      setInstallSuccess(true);

      // Refresh status and checklist to show new version
      setTimeout(() => {
        onRefresh();
        setInstallSuccess(false);
      }, 2000);
    } catch (error) {
      setDownloading(false);
      setInstalling(false);
      setInstallError((error as Error).message);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-800/50 transition">
        <button onClick={onToggle} className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                loading
                  ? "bg-gray-400 animate-pulse"
                  : running && synced
                  ? "bg-emerald-500"
                  : running
                  ? "bg-amber-500"
                  : "bg-gray-500"
              }`}
            />
            <h2 className="text-xl font-semibold">1. Cardano Node Setup</h2>
          </div>
          <span className="text-sm text-gray-400">
            {loading
              ? "Loading..."
              : running && synced
              ? "Running & Synced"
              : running
              ? status?.error?.includes("Replaying")
                ? `Replaying (${status?.syncProgress ?? "0.00"}%)`
                : `Syncing (${status?.syncProgress ?? "0.00"}%)`
              : "Not Running"}
          </span>
        </button>
        <div
          className="flex gap-2 items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleStart}
            disabled={
              running || starting || loading || !checklist?.allInstalled
            }
            className="px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
            title={
              !checklist?.allInstalled
                ? "Please install all required software first"
                : undefined
            }
          >
            {running
              ? "Started"
              : starting
              ? started
                ? "Started"
                : "Starting..."
              : "Start Node"}
          </button>
          <button
            onClick={handleStop}
            disabled={!running || stopping || loading}
            className="px-3 py-2 text-sm bg-red-600 hover:bg-red-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
          >
            {stopping ? "Stopping..." : "Stop Node"}
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-2 text-sm border border-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button onClick={onToggle} className="ml-2">
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${
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
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-6 py-6 space-y-6 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold mb-1">Status</h3>
              {loading ? (
                <p className="text-sm text-gray-400">Checking node status...</p>
              ) : (
                <p className="text-sm text-gray-400">
                  {running
                    ? synced
                      ? "Cardano node is running and fully synced with the preprod network."
                      : status?.error?.includes("Replaying")
                      ? `Syncing using Mithril (faster download) - ${
                          status?.syncProgress ?? "0.00"
                        }%`
                      : `Cardano node is running but still syncing (${
                          status?.syncProgress ?? "0.00"
                        }%).`
                    : "Cardano node is not running. Start it using the instructions below."}
                </p>
              )}
              {!loading && running && !synced && (
                <div className="mt-2">
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          parseFloat(status?.syncProgress || "0")
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {currentVersion && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Version:</span>
                  <span className="text-xs font-mono text-gray-300">
                    {currentVersion}
                  </span>
                  {releaseInfo && isUpdateAvailable() && (
                    <span className="text-xs text-amber-400 font-medium">
                      (Update available: {releaseInfo.latestVersion})
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 items-end">
              <div className="flex gap-2">
                <button
                  onClick={handleCheckReleases}
                  disabled={checkingReleases}
                  className="px-3 py-2 text-sm border border-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checkingReleases ? "Checking..." : "Check Updates"}
                </button>
                <CopyCommandButton
                  command="cd .cardano && tail -f logs/cardano-node.log"
                  description="View node logs"
                />
              </div>
              {releaseInfo && (
                <div className="flex flex-col items-end gap-2 min-w-[280px]">
                  {isUpdateAvailable() ? (
                    <>
                      <button
                        onClick={handleDownloadAndInstall}
                        disabled={
                          downloading ||
                          installing ||
                          running ||
                          (!isUpdateAvailable() && currentVersion)
                        }
                        className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium w-full"
                        title={
                          running
                            ? "Stop the node before upgrading"
                            : !isUpdateAvailable() && currentVersion
                            ? "You are already on the latest version"
                            : "Download and install the latest Cardano node release"
                        }
                      >
                        {downloading
                          ? "Downloading..."
                          : installing
                          ? "Installing..."
                          : "Download & Install Latest"}
                      </button>
                      {installSuccess && (
                        <div className="w-full p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs">
                          <p className="text-emerald-400">
                            ✓ Installed {releaseInfo.latestVersion}
                          </p>
                        </div>
                      )}
                      {installError && (
                        <div className="w-full p-2 bg-red-500/10 border border-red-500/20 rounded text-xs">
                          <p className="text-red-400">✗ {installError}</p>
                        </div>
                      )}
                      <div className="w-full text-xs text-gray-400">
                        <p className="mb-1">
                          Latest: <span className="font-mono text-gray-300">{releaseInfo.latestVersion}</span>
                        </p>
                        <p className="text-gray-500">
                          Published {new Date(releaseInfo.publishedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </>
                  ) : currentVersion ? (
                    <div className="w-full p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs">
                      <p className="text-emerald-400">
                        ✓ Latest version ({currentVersion})
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">Required Software Checklist</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Click any item below to expand and view details
                </p>
              </div>
              <p className="text-xs text-gray-500">
                Checking: <span className="font-mono">.cardano/</span> &{" "}
                <span className="font-mono">.hydra/</span>
              </p>
            </div>
            {checklist ? (
              <div className="space-y-3">
                {/* Cardano Binaries Group */}
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">
                    Cardano Binaries
                  </h4>
                  <div className="space-y-2">
                    {(() => {
                      const cardanoBinaries = checklist.items.filter((item) =>
                        item.path.startsWith("bin/")
                      );
                      const cardanoNode = cardanoBinaries.find(
                        (item) => item.path === "bin/cardano-node"
                      );
                      const cardanoCli = cardanoBinaries.find(
                        (item) => item.path === "bin/cardano-cli"
                      );
                      const otherBinaries = cardanoBinaries.filter(
                        (item) =>
                          item.path !== "bin/cardano-node" &&
                          item.path !== "bin/cardano-cli"
                      );

                      // Combine Cardano Node and CLI into one item
                      const combinedCardanoItem =
                        cardanoNode && cardanoCli
                          ? {
                              ...cardanoNode,
                              name: "Cardano Node & CLI",
                              description:
                                "Cardano node binary and command-line interface (both come from the same archive)",
                              installed:
                                cardanoNode.installed && cardanoCli.installed,
                              archiveFound:
                                cardanoNode.archiveFound ||
                                cardanoCli.archiveFound,
                              archivePath:
                                cardanoNode.archivePath ||
                                cardanoCli.archivePath,
                              needsExtraction:
                                cardanoNode.needsExtraction ||
                                cardanoCli.needsExtraction,
                            }
                          : null;

                      return (
                        <>
                          {combinedCardanoItem && (
                            <CardanoNodeCliItem
                              key="cardano-node-cli"
                              item={combinedCardanoItem}
                              onRefresh={onRefresh}
                            />
                          )}
                          {otherBinaries.map((item) => (
                            <ChecklistItem
                              key={item.path}
                              item={item}
                              onRefresh={onRefresh}
                            />
                          ))}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Cardano Config Files Group */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-400">
                      Configuration Files
                    </h4>
                    <DownloadConfigsButton onRefresh={onRefresh} />
                  </div>
                  <div className="space-y-2">
                    {checklist.items
                      .filter(
                        (item) =>
                          !item.path.startsWith("bin/") &&
                          !item.path.startsWith("hydra-") &&
                          item.path !== "protocol-parameters.json"
                      )
                      .map((item) => (
                        <ChecklistItem
                          key={item.path}
                          item={item}
                          onRefresh={onRefresh}
                        />
                      ))}
                  </div>
                </div>

                {checklist.allInstalled && (
                  <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <p className="text-sm text-emerald-400">
                      ✓ All required software is installed and ready.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Loading checklist...</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-3">Setup Instructions</h3>
            <div className="bg-gray-800/50 rounded-lg p-4 space-y-4 text-sm">
              <div>
                <p className="font-medium mb-2">1. Prepare environment</p>
                <CopyCommandButton
                  command="cd .cardano && source ../scripts/setup-env.sh"
                  description="Sets up environment variables"
                />
              </div>
              <div>
                <p className="font-medium mb-2">2. Start Cardano node</p>
                <CopyCommandButton
                  command="../scripts/start-cardano-node.sh"
                  description="Starts the Cardano node with automatic Mithril fast sync"
                />
              </div>
              <div>
                <p className="font-medium mb-2">3. Verify sync status</p>
                <CopyCommandButton
                  command="./bin/cardano-cli query tip --testnet-magic 1"
                  description="Check if the node is synced (look for syncProgress: 100.00)"
                />
              </div>
              <div>
                <p className="font-medium mb-2">4. View node logs (optional)</p>
                <CopyCommandButton
                  command="tail -f logs/cardano-node.log"
                  description="View real-time node logs in terminal (Ctrl+C to exit)"
                />
              </div>
            </div>
          </div>

          {releaseInfo && isUpdateAvailable() && (
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50 space-y-3">
              <div>
                <h4 className="font-semibold text-sm mb-2">Upgrade Instructions</h4>
                <div className="bg-gray-900/50 rounded-lg p-3 space-y-2 text-xs">
                  <div>
                    <p className="font-medium mb-1">Automatic Installation</p>
                    <p className="text-gray-400 mb-2">
                      Click the "Download & Install Latest" button above to
                      automatically download and install the latest release. The
                      process will:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 ml-2 text-gray-400">
                      <li>Stop the Cardano node (if running)</li>
                      <li>Download the latest release archive for your platform</li>
                      <li>Extract and install the new binaries to{" "}
                        <code className="text-gray-300">.cardano/bin/</code>
                      </li>
                      <li>Update the version information</li>
                    </ol>
                  </div>
                  <div className="pt-2 border-t border-gray-700/50">
                    <p className="font-medium mb-1">Manual Installation</p>
                    <p className="text-gray-400 mb-2">
                      Alternatively, you can manually download from the{" "}
                      <a
                        href={releaseInfo.releaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        GitHub release page
                      </a>
                      . Download the archive for your platform and drop it into the{" "}
                      <code className="text-gray-300">.cardano</code> folder, then
                      use the Extract button in the checklist above.
                    </p>
                    <div className="text-gray-500 text-xs">
                      <p className="mb-1">Available downloads:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        {releaseInfo.assets
                          .filter((asset) =>
                            /\.(zip|tar\.gz)$/i.test(asset.name)
                          )
                          .slice(0, 5)
                          .map((asset) => (
                            <li key={asset.name} className="font-mono text-xs">
                              {asset.name} (
                              {(asset.size / 1024 / 1024).toFixed(1)} MB)
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {releaseError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">
                Failed to check releases: {releaseError}
              </p>
            </div>
          )}

          {status?.error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">Error: {status.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
