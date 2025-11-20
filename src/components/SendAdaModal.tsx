import { memo, useState, useEffect, useRef } from "react";

interface WalletPair {
  id: string;
  label?: string;
  cardanoAddress: string;
  balance?: {
    ada: string;
    hasFunds: boolean;
  };
}

interface SendAdaModalProps {
  isOpen: boolean;
  wallets: WalletPair[];
  onClose: () => void;
  onSend: (fromWalletId: string, toAddress: string, amount: string) => Promise<void>;
}

function SendAdaModal({ isOpen, wallets, onClose, onSend }: SendAdaModalProps) {
  const [sendingAda, setSendingAda] = useState(false);
  const [sendFrom, setSendFrom] = useState<string>("");
  const [sendTo, setSendTo] = useState<string>("");
  const [sendAmount, setSendAmount] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const renderCountRef = useRef(0);
  const openTimeRef = useRef<number | null>(null);
  const prevStateRef = useRef({ sendingAda, sendFrom, sendTo, sendAmount, successMessage, errorMessage });

  // Log when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      renderCountRef.current = 0;
      openTimeRef.current = performance.now();
      console.log(`[SendAdaModal] ========== MODAL OPENED ==========`);
      console.log(`[SendAdaModal] Open time: ${new Date().toISOString()}`);
      console.log(`[SendAdaModal] Wallets count: ${wallets.length}`);
    } else {
      if (openTimeRef.current !== null) {
        const openDuration = performance.now() - openTimeRef.current;
        console.log(`[SendAdaModal] ========== MODAL CLOSED ==========`);
        console.log(`[SendAdaModal] Total open duration: ${openDuration.toFixed(2)}ms`);
        console.log(`[SendAdaModal] Total renders: ${renderCountRef.current}`);
        openTimeRef.current = null;
      }
    }
  }, [isOpen, wallets.length]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSendFrom("");
      setSendTo("");
      setSendAmount("");
      setSuccessMessage(null);
      setErrorMessage(null);
      setSendingAda(false);
    }
  }, [isOpen]);

  // Log renders (only log significant state changes to avoid spam)
  useEffect(() => {
    if (isOpen) {
      renderCountRef.current++;
      const stateChanged = 
        prevStateRef.current.sendingAda !== sendingAda ||
        prevStateRef.current.sendFrom !== sendFrom ||
        prevStateRef.current.sendTo !== sendTo ||
        prevStateRef.current.sendAmount !== sendAmount ||
        prevStateRef.current.successMessage !== successMessage ||
        prevStateRef.current.errorMessage !== errorMessage;
      
      if (stateChanged || renderCountRef.current <= 3) {
        console.log(`[SendAdaModal] Render #${renderCountRef.current} at ${performance.now().toFixed(2)}ms`);
        console.log(`[SendAdaModal] State:`, {
          sendingAda,
          sendFrom,
          sendTo,
          sendAmount,
          hasSuccessMessage: !!successMessage,
          hasErrorMessage: !!errorMessage,
        });
        prevStateRef.current = { sendingAda, sendFrom, sendTo, sendAmount, successMessage, errorMessage };
      }
    }
  }, [isOpen, sendingAda, sendFrom, sendTo, sendAmount, successMessage, errorMessage]);

  if (!isOpen) return null;

  const handleSend = async () => {
    const startTime = performance.now();
    console.log(`[SendAdaModal] ========== HANDLE SEND START ==========`);
    console.log(`[SendAdaModal] Start time: ${new Date().toISOString()}`);
    console.log(`[SendAdaModal] Form data:`, { sendFrom, sendTo, sendAmount });

    // Clear previous messages
    const clearStart = performance.now();
    setSuccessMessage(null);
    setErrorMessage(null);
    console.log(`[SendAdaModal] Clear messages: ${(performance.now() - clearStart).toFixed(2)}ms`);

    if (!sendFrom || !sendTo || !sendAmount) {
      const validationTime = performance.now() - startTime;
      console.log(`[SendAdaModal] Validation failed (empty fields): ${validationTime.toFixed(2)}ms`);
      setErrorMessage("Please fill in all fields");
      return;
    }

    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      const validationTime = performance.now() - startTime;
      console.log(`[SendAdaModal] Validation failed (invalid amount): ${validationTime.toFixed(2)}ms`);
      setErrorMessage("Please enter a valid amount");
      return;
    }

    const validationTime = performance.now() - startTime;
    console.log(`[SendAdaModal] Validation passed: ${validationTime.toFixed(2)}ms`);

    try {
      const setLoadingStart = performance.now();
      setSendingAda(true);
      console.log(`[SendAdaModal] Set loading state: ${(performance.now() - setLoadingStart).toFixed(2)}ms`);

      const onSendStart = performance.now();
      console.log(`[SendAdaModal] Calling onSend callback...`);
      await onSend(sendFrom, sendTo, sendAmount);
      const onSendDuration = performance.now() - onSendStart;
      console.log(`[SendAdaModal] onSend completed: ${onSendDuration.toFixed(2)}ms`);

      // Show success message
      const findWalletStart = performance.now();
      const toWallet = wallets.find((w) => w.cardanoAddress === sendTo);
      const toWalletName = toWallet?.label || toWallet?.id || "wallet";
      console.log(`[SendAdaModal] Found wallet: ${(performance.now() - findWalletStart).toFixed(2)}ms`);

      const setSuccessStart = performance.now();
      setSuccessMessage(`Successfully sent ${sendAmount} ADA to ${toWalletName}!`);
      console.log(`[SendAdaModal] Set success message: ${(performance.now() - setSuccessStart).toFixed(2)}ms`);

      // Reset form
      const resetFormStart = performance.now();
      setSendFrom("");
      setSendTo("");
      setSendAmount("");
      console.log(`[SendAdaModal] Reset form: ${(performance.now() - resetFormStart).toFixed(2)}ms`);

      const totalTime = performance.now() - startTime;
      console.log(`[SendAdaModal] ========== HANDLE SEND SUCCESS ==========`);
      console.log(`[SendAdaModal] Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`[SendAdaModal] Breakdown: validation=${validationTime.toFixed(2)}ms, onSend=${onSendDuration.toFixed(2)}ms`);

      // Auto-close after 2 seconds
      setTimeout(() => {
        console.log(`[SendAdaModal] Auto-closing modal after success...`);
        setSuccessMessage(null);
        onClose();
      }, 2000);
    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`[SendAdaModal] ========== HANDLE SEND ERROR ==========`);
      console.error(`[SendAdaModal] Total time before error: ${totalTime.toFixed(2)}ms`);
      console.error(`[SendAdaModal] Error:`, error);
      setErrorMessage((error as Error).message || "Failed to send ADA");
    } finally {
      const setLoadingEndStart = performance.now();
      setSendingAda(false);
      console.log(`[SendAdaModal] Set loading false: ${(performance.now() - setLoadingEndStart).toFixed(2)}ms`);
    }
  };

  const handleClose = () => {
    console.log(`[SendAdaModal] handleClose called, sendingAda: ${sendingAda}`);
    if (!sendingAda) {
      setSendFrom("");
      setSendTo("");
      setSendAmount("");
      setSuccessMessage(null);
      setErrorMessage(null);
      onClose();
    } else {
      console.log(`[SendAdaModal] Close blocked - transaction in progress`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-semibold">Send ADA</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-300"
            disabled={sendingAda}
          >
            ✕
          </button>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <p className="text-sm text-emerald-400 font-medium">{successMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400 font-medium">{errorMessage}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              From Wallet
            </label>
            <select
              value={sendFrom}
              onChange={(e) => setSendFrom(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              disabled={sendingAda}
            >
              <option value="">Select source wallet</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.label || wallet.id} (
                  {wallet.balance?.ada || "0.000000"} ADA)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              To Wallet
            </label>
            <select
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              disabled={sendingAda}
            >
              <option value="">Select destination wallet</option>
              {wallets
                .filter((w) => w.id !== sendFrom)
                .map((wallet) => (
                  <option key={wallet.id} value={wallet.cardanoAddress}>
                    {wallet.label || wallet.id} (
                    {wallet.balance?.ada || "0.000000"} ADA)
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Amount (ADA)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              placeholder="0.0"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              disabled={sendingAda}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 border border-gray-700 rounded-lg hover:bg-gray-800"
            disabled={sendingAda}
          >
            {successMessage ? "Close" : "Cancel"}
          </button>
          <button
            onClick={handleSend}
            className="flex-1 px-4 py-2 bg-emerald-600 rounded-lg hover:bg-emerald-500 disabled:opacity-50"
            disabled={sendingAda || !sendFrom || !sendTo || !sendAmount || !!successMessage}
          >
            {sendingAda ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
// Custom comparison: only re-render if isOpen changes or wallets structure changes
// We intentionally don't check balances to avoid re-renders on balance updates
// (balances are shown in dropdowns but don't affect modal functionality)
export default memo(SendAdaModal, (prevProps, nextProps) => {
  // If modal state changed, always re-render
  if (prevProps.isOpen !== nextProps.isOpen) {
    return false; // false means "not equal, re-render"
  }
  
  // If modal is closed, don't re-render
  if (!nextProps.isOpen) {
    return true; // true means "equal, skip re-render"
  }
  
  // If wallets array length changed, re-render (wallet added/removed)
  if (prevProps.wallets.length !== nextProps.wallets.length) {
    return false;
  }
  
  // Check if wallet IDs or labels changed (structure change)
  // We don't check balances to avoid re-renders on frequent balance updates
  for (let i = 0; i < prevProps.wallets.length; i++) {
    const prevWallet = prevProps.wallets[i];
    const nextWallet = nextProps.wallets[i];
    if (
      prevWallet.id !== nextWallet.id ||
      prevWallet.label !== nextWallet.label ||
      prevWallet.cardanoAddress !== nextWallet.cardanoAddress
    ) {
      return false;
    }
  }
  
  // Callbacks should be stable (useCallback in parent)
  // If they're the same reference, skip re-render
  return true; // Skip re-render
});

