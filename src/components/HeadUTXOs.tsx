import { useState, useEffect } from "react";
import { Party, HeadStatus } from "@/lib/hydra-client";

interface HeadUTXOsProps {
  party: Party;
  headStatus: HeadStatus | null;
}

interface UTXO {
  [key: string]: {
    address: string;
    value: {
      [key: string]: number;
    };
  };
}

export default function HeadUTXOs({ party, headStatus }: HeadUTXOsProps) {
  const [utxos, setUtxos] = useState<UTXO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHeadOpen = headStatus?.tag === "Open";

  const fetchUTXOs = async () => {
    if (!isHeadOpen) {
      setUtxos(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hydra/${party}/utxos`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setUtxos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch UTXOs");
      setUtxos(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isHeadOpen) {
      fetchUTXOs();
      // Refresh every 15 seconds - reduced from 5s (not used in HydraHeadAction, less critical)
      const interval = setInterval(fetchUTXOs, 15000);
      return () => clearInterval(interval);
    } else {
      setUtxos(null);
    }
  }, [isHeadOpen, party]); // eslint-disable-line react-hooks/exhaustive-deps

  const utxoCount = utxos ? Object.keys(utxos).length : 0;
  const totalLovelace = utxos
    ? Object.values(utxos).reduce((sum, utxo) => {
        return sum + (utxo.value?.lovelace || 0);
      }, 0)
    : 0;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">Head UTXOs</h3>
        {isHeadOpen && (
          <button
            onClick={fetchUTXOs}
            disabled={loading}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-sm transition"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        )}
      </div>

      {!isHeadOpen && (
        <div className="p-3 bg-yellow-900/50 border border-yellow-500 rounded text-yellow-200 text-sm">
          Head must be in <strong>Open</strong> state to view UTXOs. Current
          state: <strong>{headStatus?.tag || "Unknown"}</strong>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {isHeadOpen && !loading && utxos && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-900 rounded">
            <span className="text-gray-400">Total UTXOs:</span>
            <span className="text-white font-semibold">{utxoCount}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-900 rounded">
            <span className="text-gray-400">Total ADA:</span>
            <span className="text-white font-semibold">
              {(totalLovelace / 1000000).toFixed(6)} ADA
            </span>
          </div>

          {utxoCount > 0 && (
            <div className="mt-4">
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(utxos).map(([utxoRef, utxo]) => (
                  <div
                    key={utxoRef}
                    className="p-3 bg-gray-900 rounded text-xs"
                  >
                    <div className="font-mono text-gray-400 mb-1">
                      {utxoRef}
                    </div>
                    <div className="text-gray-300">
                      <div>
                        Address:{" "}
                        <span className="font-mono text-white">
                          {utxo.address}
                        </span>
                      </div>
                      <div className="mt-1">
                        Value:{" "}
                        {Object.entries(utxo.value || {}).map(
                          ([unit, amount]) => (
                            <span key={unit} className="text-white">
                              {unit === "lovelace"
                                ? `${(amount / 1000000).toFixed(6)} ADA`
                                : `${amount} ${unit}`}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {utxoCount === 0 && (
            <div className="p-3 bg-gray-900 rounded text-gray-400 text-sm text-center">
              No UTXOs in the head yet. Commit some UTXOs first.
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="text-center py-4 text-gray-400">Loading UTXOs...</div>
      )}
    </div>
  );
}
