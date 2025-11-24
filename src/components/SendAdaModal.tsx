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

interface Recipient {
  address: string;
  amounts: string[];
}

interface SendAdaModalProps {
  isOpen: boolean;
  wallets: WalletPair[];
  onClose: () => void;
  onSend: (fromWalletId: string, recipients: Recipient[]) => Promise<void>;
  pendingTransaction?: {
    fromWalletId: string;
    toAddresses: string[];
    amount: string;
  } | null;
}

function SendAdaModal({
  isOpen,
  wallets,
  onClose,
  onSend,
  pendingTransaction,
}: SendAdaModalProps) {
  const [sendingAda, setSendingAda] = useState(false);
  const [sendFrom, setSendFrom] = useState<string>("");
  const [recipients, setRecipients] = useState<Recipient[]>([
    { address: "", amounts: [""] },
  ]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const renderCountRef = useRef(0);
  const openTimeRef = useRef<number | null>(null);
  const prevStateRef = useRef({
    sendingAda,
    sendFrom,
    recipients,
    successMessage,
    errorMessage,
  });

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
        console.log(
          `[SendAdaModal] Total open duration: ${openDuration.toFixed(2)}ms`
        );
        console.log(`[SendAdaModal] Total renders: ${renderCountRef.current}`);
        openTimeRef.current = null;
      }
    }
  }, [isOpen, wallets.length]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSendFrom("");
      setRecipients([{ address: "", amounts: [""] }]);
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
        JSON.stringify(prevStateRef.current.recipients) !==
          JSON.stringify(recipients) ||
        prevStateRef.current.successMessage !== successMessage ||
        prevStateRef.current.errorMessage !== errorMessage;

      if (stateChanged || renderCountRef.current <= 3) {
        console.log(
          `[SendAdaModal] Render #${renderCountRef.current} at ${performance
            .now()
            .toFixed(2)}ms`
        );
        console.log(`[SendAdaModal] State:`, {
          sendingAda,
          sendFrom,
          recipientsCount: recipients.length,
          hasSuccessMessage: !!successMessage,
          hasErrorMessage: !!errorMessage,
        });
        prevStateRef.current = {
          sendingAda,
          sendFrom,
          recipients,
          successMessage,
          errorMessage,
        };
      }
    }
  }, [isOpen, sendingAda, sendFrom, recipients, successMessage, errorMessage]);

  if (!isOpen) return null;

  const handleSend = async () => {
    const startTime = performance.now();
    console.log(`[SendAdaModal] ========== HANDLE SEND START ==========`);
    console.log(`[SendAdaModal] Start time: ${new Date().toISOString()}`);
    console.log(`[SendAdaModal] Form data:`, { sendFrom, recipients });

    // Clear previous messages
    const clearStart = performance.now();
    setSuccessMessage(null);
    setErrorMessage(null);
    console.log(
      `[SendAdaModal] Clear messages: ${(
        performance.now() - clearStart
      ).toFixed(2)}ms`
    );

    if (!sendFrom) {
      const validationTime = performance.now() - startTime;
      console.log(
        `[SendAdaModal] Validation failed (no from wallet): ${validationTime.toFixed(
          2
        )}ms`
      );
      setErrorMessage("Please select a source wallet");
      return;
    }

    // Validate recipients
    const validRecipients = recipients
      .map((r) => ({
        address: r.address.trim(),
        amounts: r.amounts.filter((a) => a.trim() !== ""),
      }))
      .filter((r) => r.address && r.amounts.length > 0);

    if (validRecipients.length === 0) {
      const validationTime = performance.now() - startTime;
      console.log(
        `[SendAdaModal] Validation failed (no valid recipients): ${validationTime.toFixed(
          2
        )}ms`
      );
      setErrorMessage(
        "Please add at least one recipient with at least one amount"
      );
      return;
    }

    // Validate all amounts
    for (const recipient of validRecipients) {
      for (const amountStr of recipient.amounts) {
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          const validationTime = performance.now() - startTime;
          console.log(
            `[SendAdaModal] Validation failed (invalid amount): ${validationTime.toFixed(
              2
            )}ms`
          );
          setErrorMessage(`Invalid amount: ${amountStr}`);
          return;
        }
      }
    }

    const validationTime = performance.now() - startTime;
    console.log(
      `[SendAdaModal] Validation passed: ${validationTime.toFixed(2)}ms`
    );

    try {
      const setLoadingStart = performance.now();
      setSendingAda(true);
      console.log(
        `[SendAdaModal] Set loading state: ${(
          performance.now() - setLoadingStart
        ).toFixed(2)}ms`
      );

      const onSendStart = performance.now();
      console.log(`[SendAdaModal] Calling onSend callback...`);
      await onSend(sendFrom, validRecipients);
      const onSendDuration = performance.now() - onSendStart;
      console.log(
        `[SendAdaModal] onSend completed: ${onSendDuration.toFixed(2)}ms`
      );

      // Show success message
      const setSuccessStart = performance.now();
      const totalUtxos = validRecipients.reduce(
        (sum, r) => sum + r.amounts.length,
        0
      );
      const totalAmount = validRecipients.reduce(
        (sum, r) => sum + r.amounts.reduce((s, a) => s + parseFloat(a), 0),
        0
      );
      const recipientNames = validRecipients
        .map((r) => {
          const wallet = wallets.find((w) => w.cardanoAddress === r.address);
          return wallet?.label || wallet?.id || "wallet";
        })
        .join(", ");
      setSuccessMessage(
        `Successfully sent ${totalUtxos} UTXO${
          totalUtxos > 1 ? "s" : ""
        } (${totalAmount.toFixed(6)} ADA total) to ${
          validRecipients.length
        } recipient${
          validRecipients.length > 1 ? "s" : ""
        } (${recipientNames})!`
      );
      console.log(
        `[SendAdaModal] Set success message: ${(
          performance.now() - setSuccessStart
        ).toFixed(2)}ms`
      );

      // Reset form
      const resetFormStart = performance.now();
      setSendFrom("");
      setRecipients([{ address: "", amounts: [""] }]);
      console.log(
        `[SendAdaModal] Reset form: ${(
          performance.now() - resetFormStart
        ).toFixed(2)}ms`
      );

      const totalTime = performance.now() - startTime;
      console.log(`[SendAdaModal] ========== HANDLE SEND SUCCESS ==========`);
      console.log(`[SendAdaModal] Total time: ${totalTime.toFixed(2)}ms`);
      console.log(
        `[SendAdaModal] Breakdown: validation=${validationTime.toFixed(
          2
        )}ms, onSend=${onSendDuration.toFixed(2)}ms`
      );

      // Auto-close after 3 seconds
      setTimeout(() => {
        console.log(`[SendAdaModal] Auto-closing modal after success...`);
        setSuccessMessage(null);
        onClose();
      }, 3000);
    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`[SendAdaModal] ========== HANDLE SEND ERROR ==========`);
      console.error(
        `[SendAdaModal] Total time before error: ${totalTime.toFixed(2)}ms`
      );
      console.error(`[SendAdaModal] Error:`, error);
      setErrorMessage((error as Error).message || "Failed to send ADA");
    } finally {
      const setLoadingEndStart = performance.now();
      setSendingAda(false);
      console.log(
        `[SendAdaModal] Set loading false: ${(
          performance.now() - setLoadingEndStart
        ).toFixed(2)}ms`
      );
    }
  };

  const handleClose = () => {
    console.log(`[SendAdaModal] handleClose called, sendingAda: ${sendingAda}`);
    if (!sendingAda) {
      setSendFrom("");
      setRecipients([{ address: "", amounts: [""] }]);
      setSuccessMessage(null);
      setErrorMessage(null);
      onClose();
    } else {
      console.log(`[SendAdaModal] Close blocked - transaction in progress`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4">
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
            <p className="text-sm text-emerald-400 font-medium">
              {successMessage}
            </p>
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Recipients</label>
              <button
                type="button"
                onClick={() =>
                  setRecipients([...recipients, { address: "", amounts: [""] }])
                }
                className="text-xs text-sky-400 hover:text-sky-300"
                disabled={sendingAda}
              >
                + Add Recipient
              </button>
            </div>
            <div className="space-y-4">
              {recipients.map((recipient, recipientIndex) => (
                <div
                  key={recipientIndex}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-400">
                      Recipient {recipientIndex + 1}
                    </label>
                    {recipients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newRecipients = recipients.filter(
                            (_, i) => i !== recipientIndex
                          );
                          setRecipients(
                            newRecipients.length > 0
                              ? newRecipients
                              : [{ address: "", amounts: [""] }]
                          );
                        }}
                        className="px-2 py-1 text-xs text-red-400 hover:text-red-300"
                        disabled={sendingAda}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-400">
                      To Wallet
                    </label>
                    <select
                      value={recipient.address}
                      onChange={(e) => {
                        const newRecipients = [...recipients];
                        newRecipients[recipientIndex].address = e.target.value;
                        setRecipients(newRecipients);
                      }}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm"
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
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-400">
                        Amount(s) (ADA)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const newRecipients = [...recipients];
                          newRecipients[recipientIndex].amounts.push("");
                          setRecipients(newRecipients);
                        }}
                        className="text-[10px] text-sky-400 hover:text-sky-300"
                        disabled={sendingAda}
                      >
                        + Add Amount
                      </button>
                    </div>
                    <div className="space-y-2">
                      {recipient.amounts.map((amount, amountIndex) => (
                        <div key={amountIndex} className="flex gap-2">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={amount}
                            onChange={(e) => {
                              const newRecipients = [...recipients];
                              newRecipients[recipientIndex].amounts[
                                amountIndex
                              ] = e.target.value;
                              setRecipients(newRecipients);
                            }}
                            placeholder="0.0"
                            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm"
                            disabled={sendingAda}
                          />
                          {recipient.amounts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newRecipients = [...recipients];
                                newRecipients[recipientIndex].amounts =
                                  newRecipients[recipientIndex].amounts.filter(
                                    (_, i) => i !== amountIndex
                                  );
                                if (
                                  newRecipients[recipientIndex].amounts
                                    .length === 0
                                ) {
                                  newRecipients[recipientIndex].amounts = [""];
                                }
                                setRecipients(newRecipients);
                              }}
                              className="px-2 text-red-400 hover:text-red-300"
                              disabled={sendingAda}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {recipient.amounts.filter((a) => a.trim() !== "").length >
                      0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Total:{" "}
                        {recipient.amounts
                          .filter((a) => a.trim() !== "")
                          .reduce((sum, a) => sum + (parseFloat(a) || 0), 0)
                          .toFixed(6)}{" "}
                        ADA
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {recipients.some(
              (r) => r.address && r.amounts.some((a) => a.trim() !== "")
            ) && (
              <p className="text-xs text-gray-400 mt-2">
                Grand Total:{" "}
                {recipients
                  .reduce(
                    (sum, r) =>
                      sum +
                      r.amounts
                        .filter((a) => a.trim() !== "")
                        .reduce((s, a) => s + (parseFloat(a) || 0), 0),
                    0
                  )
                  .toFixed(6)}{" "}
                ADA to{" "}
                {
                  recipients.filter(
                    (r) => r.address && r.amounts.some((a) => a.trim() !== "")
                  ).length
                }{" "}
                recipient
                {recipients.filter(
                  (r) => r.address && r.amounts.some((a) => a.trim() !== "")
                ).length > 1
                  ? "s"
                  : ""}
              </p>
            )}
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
            disabled={
              sendingAda ||
              !sendFrom ||
              recipients.every(
                (r) => !r.address || r.amounts.every((a) => a.trim() === "")
              ) ||
              !!successMessage ||
              !!pendingTransaction
            }
          >
            {sendingAda
              ? "Sending..."
              : pendingTransaction
              ? "Transaction in progress..."
              : "Send"}
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
