import { useState, useEffect } from "react";
import SendAdaModal from "@/components/SendAdaModal";

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

interface WalletFactoryProps {
  wallets: WalletPair[];
  creatingWallet: boolean;
  onCreateWallet: () => void;
  onSendAda: (
    fromWalletId: string,
    toAddress: string,
    amount: string
  ) => Promise<void>;
  isInitialLoading?: boolean;
  onRefreshBalances?: () => void;
  onSplitSingleUtxos?: () => Promise<void>;
}

const faucetUrl = "https://docs.cardano.org/cardano-testnets/tools/faucet";

export default function WalletFactory({
  wallets,
  creatingWallet,
  onCreateWallet,
  onSendAda,
  isInitialLoading = false,
  onRefreshBalances,
  onSplitSingleUtxos,
}: WalletFactoryProps) {
  const [expanded, setExpanded] = useState(true);
  const [fundDropdownOpen, setFundDropdownOpen] = useState(false);
  const [showFundTooltip, setShowFundTooltip] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);

  // Combine initial loading with manual refresh state
  const isRefreshingState = isInitialLoading || isRefreshing;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!fundDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".fund-dropdown-container")) {
        setFundDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [fundDropdownOpen]);

  const fundWallet = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      window.open(faucetUrl, "_blank");
    } catch {
      alert("Failed to copy address. Please copy manually: " + address);
    }
  };

  const handleCloseSendModal = () => {
    setShowSendModal(false);
  };

  const handleRefresh = () => {
    if (isRefreshing || !onRefreshBalances) return;
    setIsRefreshing(true);
    onRefreshBalances();
    // Clear loading state after a delay (refresh operations are async but not awaited)
    setTimeout(() => {
      setIsRefreshing(false);
    }, 2000);
  };

  const handleSplitUtxos = async () => {
    if (isSplitting || !onSplitSingleUtxos) return;
    setIsSplitting(true);
    try {
      await onSplitSingleUtxos();
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <>
      <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-800/50 transition"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  wallets.length > 0 ? "bg-emerald-500" : "bg-gray-500"
                }`}
              />
              <h2 className="text-xl font-semibold">3. Wallet Factory</h2>
            </div>
            <span className="text-sm text-gray-400">
              {wallets.length === 0
                ? "No wallets"
                : `${wallets.length} wallet${wallets.length !== 1 ? "s" : ""}`}
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
          <div className="px-6 py-6 space-y-4 border-t border-gray-800">
            <div className="space-y-4">
              <p className="text-gray-400 text-sm">
                Generates CLI keypairs, addresses, and corresponding Hydra
                wallet IDs.
              </p>
              <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                <div className="relative fund-dropdown-container flex-shrink-0 ml-8">
                  <button
                    onClick={() => setFundDropdownOpen(!fundDropdownOpen)}
                    onMouseEnter={() =>
                      wallets.length > 0 && setShowFundTooltip(true)
                    }
                    onMouseLeave={() => setShowFundTooltip(false)}
                    className="px-4 py-2 bg-emerald-600 rounded-lg hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2 relative whitespace-nowrap"
                    disabled={wallets.length === 0}
                    title={
                      wallets.length === 0 ? "No wallets available to fund" : ""
                    }
                  >
                    Fund wallet
                    <svg
                      className={`w-4 h-4 transition-transform ${
                        fundDropdownOpen ? "rotate-180" : ""
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
                    {showFundTooltip && wallets.length > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 pointer-events-none opacity-100 transition-opacity duration-0">
                        <div className="text-xs text-amber-300 font-medium whitespace-nowrap">
                          ⚠️ Select Preprod network
                        </div>
                        <div className="text-xs text-gray-300 mt-1 whitespace-nowrap">
                          Fund a wallet from the faucet
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                          <div className="w-2 h-2 bg-gray-900 border-r border-b border-gray-700 rotate-45"></div>
                        </div>
                      </div>
                    )}
                  </button>
                  {fundDropdownOpen && wallets.length > 0 && (
                    <div className="absolute left-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                      {wallets.map((wallet) => (
                        <button
                          key={wallet.id}
                          onClick={() => {
                            fundWallet(wallet.cardanoAddress);
                            setFundDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg flex items-center justify-between gap-2"
                        >
                          <span className="capitalize text-sm">
                            {wallet.label || wallet.id}
                          </span>
                          {wallet.balance !== undefined && (
                            <span className="text-xs text-gray-400">
                              {wallet.balance.ada} ADA
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowSendModal(true)}
                  className="px-4 py-2 bg-emerald-600 rounded-lg hover:bg-emerald-500 disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                  disabled={wallets.length < 2}
                  title={
                    wallets.length < 2
                      ? "Need at least 2 wallets to send ADA"
                      : ""
                  }
                >
                  Send ADA
                </button>
                {onRefreshBalances && (
                  <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50 flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                    disabled={wallets.length === 0 || isRefreshingState}
                    title="Refresh wallet balances and UTXOs"
                  >
                    <svg
                      className={`w-4 h-4 ${
                        isRefreshingState ? "animate-spin" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    {isRefreshingState ? "Refreshing..." : "Refresh"}
                  </button>
                )}
                {onSplitSingleUtxos && (
                  <button
                    onClick={handleSplitUtxos}
                    className="px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-500 disabled:opacity-50 flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                    disabled={wallets.length === 0 || isSplitting}
                    title="Split wallets with single UTXO into 3 UTXOs (needed for Hydra commits)"
                  >
                    <svg
                      className={`w-4 h-4 ${isSplitting ? "animate-spin" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    {isSplitting ? "Splitting..." : "Split UTXOs"}
                  </button>
                )}
                <button
                  onClick={onCreateWallet}
                  className="px-4 py-2 bg-sky-600 rounded-lg hover:bg-sky-500 disabled:opacity-50 flex-shrink-0 whitespace-nowrap mr-8"
                  disabled={creatingWallet}
                >
                  {creatingWallet ? "Generating..." : "Generate wallet pair"}
                </button>
              </div>
            </div>
            {wallets.length === 0 ? (
              <p className="text-gray-500 text-sm">
                Wallets appear here as soon as you generate them.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {wallets.map((wallet) => (
                  <div
                    key={wallet.id}
                    className="border border-gray-800 rounded-xl p-4"
                  >
                    <div className="flex items-center gap-2 flex-wrap text-md">
                      <span className="font-semibold text-base capitalize text-gray-100">
                        {wallet.label || wallet.id}
                      </span>
                      {wallet.balance !== undefined && (
                        <>
                          <span
                            className={`text-sm font-medium ${
                              wallet.balance.hasFunds
                                ? "text-emerald-400"
                                : "text-gray-400"
                            }`}
                          >
                            {wallet.balance.ada} ADA
                          </span>
                          {wallet.balance.utxoCount !== undefined && (
                            <span className="text-sm text-gray-100">
                              ({wallet.balance.utxoCount} UTXO
                              {wallet.balance.utxoCount !== 1 ? "s" : ""})
                            </span>
                          )}
                        </>
                      )}
                      {wallet.cardanoAddress && (
                        <span
                          className="font-mono text-gray-400 text-xs truncate"
                          title={wallet.cardanoAddress}
                        >
                          {wallet.cardanoAddress.slice(0, 12)}...
                          {wallet.cardanoAddress.slice(-8)}
                        </span>
                      )}
                    </div>
                    {wallet.files && (
                      <div className="flex gap-4 mt-1.5 text-xs">
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-500">Cardano: </span>
                          <div
                            className="font-mono text-gray-400 truncate"
                            title={wallet.files.paymentVkey}
                          >
                            {wallet.files.paymentVkey.split("/").pop()}
                          </div>
                          <div
                            className="font-mono text-gray-400 truncate"
                            title={wallet.files.paymentSkey}
                          >
                            {wallet.files.paymentSkey.split("/").pop()}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-500">Hydra: </span>
                          <div
                            className="font-mono text-gray-400 truncate"
                            title={wallet.files.hydraVkey}
                          >
                            {wallet.files.hydraVkey.split("/").pop()}
                          </div>
                          <div
                            className="font-mono text-gray-400 truncate"
                            title={wallet.files.hydraSkey}
                          >
                            {wallet.files.hydraSkey.split("/").pop()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <SendAdaModal
        isOpen={showSendModal}
        wallets={wallets}
        onClose={handleCloseSendModal}
        onSend={onSendAda}
      />
    </>
  );
}
