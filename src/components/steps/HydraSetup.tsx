import { useState } from "react";
import Image from "next/image";
import ChecklistItem from "./shared/ChecklistItem";
import ExtractButton from "./shared/ExtractButton";
import DownloadButton from "./shared/DownloadButton";

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

interface HydraSetupProps {
  expanded: boolean;
  onToggle: () => void;
  checklist: ChecklistData | null;
  onRefresh: () => void;
}

function HydraNodeItem({
  item,
  onRefresh,
}: {
  item: SoftwareItem;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-800/70 transition"
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
          <p className="font-medium">{item.name}</p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${
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
                  section. Download the archive for your platform (macOS ARM64,
                  Linux x86_64, or Windows), then drop the downloaded file into
                  the <span className="font-mono text-gray-300">.hydra</span>{" "}
                  folder.
                </p>
                <div className="rounded-lg overflow-hidden border border-gray-700">
                  <Image
                    src="/hydranodedownload.png"
                    alt="GitHub release page showing Hydra node binaries download"
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
                  onDownloaded={onRefresh}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function HydraSetup({
  expanded,
  onToggle,
  checklist,
  onRefresh,
}: HydraSetupProps) {
  const hydraItems =
    checklist?.items.filter(
      (item) =>
        item.path.startsWith("hydra-") ||
        item.path === "protocol-parameters.json"
    ) ?? [];
  const allHydraInstalled =
    hydraItems.length > 0 && hydraItems.every((item) => item.installed);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-800/50 transition"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                allHydraInstalled ? "bg-emerald-500" : "bg-gray-500"
              }`}
            />
            <h2 className="text-xl font-semibold">2. Hydra Setup</h2>
          </div>
          <span className="text-sm text-gray-400">
            {allHydraInstalled ? "Ready" : "Installation required"}
          </span>
        </div>
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

      {expanded && (
        <div className="px-6 py-6 space-y-6 border-t border-gray-800">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Required Software Checklist</h3>
              <p className="text-xs text-gray-500">
                Checking: <span className="font-mono">.cardano/</span> &{" "}
                <span className="font-mono">.hydra/</span>
              </p>
            </div>
            {checklist ? (
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">
                    Hydra
                  </h4>
                  <div className="space-y-2">
                    {hydraItems.map((item) =>
                      item.path === "hydra-node" ? (
                        <HydraNodeItem
                          key={item.path}
                          item={item}
                          onRefresh={onRefresh}
                        />
                      ) : (
                        <ChecklistItem
                          key={item.path}
                          item={item}
                          onRefresh={onRefresh}
                        />
                      )
                    )}
                  </div>
                </div>

                {allHydraInstalled && (
                  <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <p className="text-sm text-emerald-400">
                      ✓ All required software is installed and ready.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Loading checklist...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
