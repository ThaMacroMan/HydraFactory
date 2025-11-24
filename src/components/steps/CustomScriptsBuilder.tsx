import { useState, useEffect } from "react";

interface CustomScript {
  id: string;
  name: string;
  description?: string;
  txIds: string;
  network: "preprod" | "mainnet" | "preview";
  createdAt: string;
  isDefault?: boolean;
}

interface CustomScriptsBuilderProps {
  onScriptChange?: (scriptId: string | null) => void;
}

export default function CustomScriptsBuilder({
  onScriptChange,
}: CustomScriptsBuilderProps) {
  const [expanded, setExpanded] = useState(false);
  const [scripts, setScripts] = useState<CustomScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [viewingOriginal, setViewingOriginal] = useState(false);
  const [originalScript, setOriginalScript] = useState<{
    scriptType: string;
    sourceCode: string;
    url: string;
  } | null>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    txIds: "",
    network: "preprod" as "preprod" | "mainnet" | "preview", // Default to preprod
  });

  const loadScripts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/scripts/list");
      if (!res.ok) throw new Error("Failed to load scripts");
      const data = await res.json();
      setScripts(data.scripts || []);
      setError(null);
    } catch (err) {
      console.error("Error loading scripts:", err);
      setError(err instanceof Error ? err.message : "Failed to load scripts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScripts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.txIds.trim()) {
      setError("Name and Transaction IDs are required");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const res = await fetch("/api/scripts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create script");
      }

      await loadScripts();
      setShowCreateForm(false);
      setFormData({
        name: "",
        description: "",
        txIds: "",
        network: "preprod",
      });
    } catch (err) {
      console.error("Error creating script:", err);
      setError(err instanceof Error ? err.message : "Failed to create script");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this script?")) {
      return;
    }

    try {
      setDeleting(id);
      setError(null);
      const res = await fetch(`/api/scripts/delete?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete script");
      }

      await loadScripts();
    } catch (err) {
      console.error("Error deleting script:", err);
      setError(err instanceof Error ? err.message : "Failed to delete script");
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const viewOriginalScript = async (scriptType: "head" | "stake" | "commit") => {
    try {
      setLoadingOriginal(true);
      setError(null);
      const res = await fetch(`/api/scripts/view-original?script=${scriptType}`);
      if (!res.ok) throw new Error("Failed to load original script");
      const data = await res.json();
      setOriginalScript(data);
      setViewingOriginal(true);
    } catch (err) {
      console.error("Error loading original script:", err);
      setError(err instanceof Error ? err.message : "Failed to load original script");
    } finally {
      setLoadingOriginal(false);
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
            <div
              className={`w-3 h-3 rounded-full ${
                scripts.length > 0 ? "bg-emerald-400" : "bg-gray-500"
              }`}
            />
            <h2 className="text-xl font-semibold">3.5. Custom Hydra Scripts</h2>
          </div>
          <span className="text-sm text-gray-400">
            {scripts.length} script{scripts.length !== 1 ? "s" : ""}
          </span>
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

      {expanded && (
        <div className="px-6 py-6 space-y-4 border-t border-gray-800">
          {error && (
            <div className="bg-red-950/30 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-300">
              Build custom Hydra validator scripts by adjusting parameters and deploying to preprod.
            </p>
            <button
              onClick={() => {
                setShowCreateForm(!showCreateForm);
                setError(null);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
            >
              {showCreateForm ? "Cancel" : "+ Build Custom Script"}
            </button>
          </div>

          {showCreateForm && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-200">
                  Build Custom Script
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => viewOriginalScript("head")}
                    disabled={loadingOriginal}
                    className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded transition"
                  >
                    {loadingOriginal ? "Loading..." : "View Head.hs"}
                  </button>
                  <button
                    onClick={() => viewOriginalScript("stake")}
                    disabled={loadingOriginal}
                    className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded transition"
                  >
                    {loadingOriginal ? "Loading..." : "View Stake.hs"}
                  </button>
                </div>
              </div>

              {viewingOriginal && originalScript && (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-h-96 overflow-auto">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400 font-mono">
                      {originalScript.scriptType}.hs
                    </p>
                    <button
                      onClick={() => setViewingOriginal(false)}
                      className="text-xs text-gray-400 hover:text-gray-300"
                    >
                      Close
                    </button>
                  </div>
                  <pre className="text-xs text-gray-300 font-mono whitespace-pre overflow-x-auto">
                    <code>{originalScript.sourceCode}</code>
                  </pre>
                  <a
                    href={originalScript.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 mt-2 inline-block"
                  >
                    View on GitHub →
                  </a>
                </div>
              )}

              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
                <p className="text-xs text-yellow-300">
                  <strong>Note:</strong> Currently, you need to manually modify the script source, compile it, and deploy it. 
                  Parameter adjustment UI coming soon. For now, use the deployment script after making changes.
                </p>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                    placeholder="My Custom Hydra Script"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                    placeholder="Optional description of your custom script"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Transaction IDs * (comma-separated)
                  </label>
                  <textarea
                    value={formData.txIds}
                    onChange={(e) =>
                      setFormData({ ...formData, txIds: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500"
                    placeholder="407bf714186db790f2624701b2e065850dd7b7cf998c931222d99a56d8ad256b,4cae9ad9c1cc4f82ce2fd51f9e1155a37ac88957f81128ba1c51bc7c6734ce6c"
                    rows={3}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter one or more transaction IDs where your scripts are
                    deployed (64-character hex strings, comma-separated)
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Network
                  </label>
                  <div className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-400">
                    Preprod (Testnet) - Only preprod is supported currently
                  </div>
                  <input type="hidden" value="preprod" />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition"
                  >
                    {creating ? "Creating..." : "Create Script"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setFormData({
                        name: "",
                        description: "",
                        txIds: "",
                        network: "preprod",
                      });
                      setError(null);
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading scripts...</div>
          ) : scripts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No scripts found. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {scripts.map((script) => (
                <div
                  key={script.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-gray-200">
                          {script.name}
                        </h4>
                        {script.isDefault && (
                          <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-xs rounded">
                            Default
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-gray-700 text-gray-400 text-xs rounded capitalize">
                          {script.network}
                        </span>
                      </div>
                      {script.description && (
                        <p className="text-xs text-gray-400 mb-2">
                          {script.description}
                        </p>
                      )}
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 font-mono break-all">
                          {script.txIds}
                        </p>
                        <p className="text-xs text-gray-500">
                          Created: {formatDate(script.createdAt)}
                        </p>
                      </div>
                    </div>
                    {!script.isDefault && (
                      <button
                        onClick={() => handleDelete(script.id)}
                        disabled={deleting === script.id}
                        className="ml-4 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 text-red-400 text-xs rounded transition"
                      >
                        {deleting === script.id ? "Deleting..." : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 space-y-2">
            <p className="text-xs text-blue-300">
              <strong>📝 How to Create & Deploy Scripts:</strong>
            </p>
            <ol className="text-xs text-blue-200/80 space-y-1 ml-4 list-decimal">
              <li>
                <strong>Write</strong> your Plutus validator (modify{" "}
                <code className="text-blue-300">hydra-plutus/src/Hydra/Plutus/Contracts/Head.hs</code> in the Hydra repo)
              </li>
              <li>
                <strong>Compile</strong> it: <code className="text-blue-300">nix develop && cabal build hydra-plutus</code>
              </li>
              <li>
                <strong>Deploy</strong> to preprod: <code className="text-blue-300">./scripts/deploy-hydra-script.sh script.plutus wallet-label</code>
              </li>
              <li>
                <strong>Add</strong> the transaction ID here in HydraFactory
              </li>
            </ol>
            <p className="text-xs text-blue-300 mt-2">
              See{" "}
              <a
                href="/PREPROD_SCRIPT_DEPLOYMENT.md"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-200"
              >
                PREPROD_SCRIPT_DEPLOYMENT.md
              </a>{" "}
              for the complete preprod deployment guide.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

