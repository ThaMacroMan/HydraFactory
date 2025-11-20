import { useState } from "react";

interface InstallMithrilButtonProps {
  onInstalled: () => void;
}

export default function InstallMithrilButton({
  onInstalled,
}: InstallMithrilButtonProps) {
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    try {
      setInstalling(true);
      const res = await fetch("/api/cardano/install-mithril", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ mithril-client installed successfully!");
        onInstalled();
      } else {
        alert(`❌ Installation failed: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      alert(`❌ Installation failed: ${(error as Error).message}`);
      console.error(error);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <button
      onClick={handleInstall}
      disabled={installing}
      className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 whitespace-nowrap"
      title="Automatically install mithril-client using Mithril's official installer"
    >
      {installing ? "Installing..." : "Install Automatically"}
    </button>
  );
}
