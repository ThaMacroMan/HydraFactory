import { useState } from "react";
import ExtractButton from "./ExtractButton";
import InstallMithrilButton from "./InstallMithrilButton";
import DownloadButton from "./DownloadButton";

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

interface ChecklistItemProps {
  item: SoftwareItem;
  onRefresh: () => void;
}

export default function ChecklistItem({
  item,
  onRefresh,
}: ChecklistItemProps) {
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
        <div className="px-3 pb-3 space-y-2 border-t border-gray-700/50">
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
            <div className="flex gap-2 flex-wrap">
              {item.path === "bin/mithril-client" && (
                <InstallMithrilButton onInstalled={onRefresh} />
              )}
              {item.needsExtraction && item.archivePath && (
                <ExtractButton
                  archivePath={item.archivePath}
                  targetPath={item.path}
                  onExtracted={onRefresh}
                />
              )}
              <DownloadButton filePath={item.path} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

