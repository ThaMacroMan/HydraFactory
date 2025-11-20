import ChecklistItem from "./shared/ChecklistItem";

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
                    {hydraItems.map((item) => (
                      <ChecklistItem
                        key={item.path}
                        item={item}
                        onRefresh={onRefresh}
                      />
                    ))}
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
