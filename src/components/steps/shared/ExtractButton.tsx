import { useState } from "react";

interface ExtractButtonProps {
  archivePath: string;
  targetPath: string;
  onExtracted: () => void;
  className?: string;
}

export default function ExtractButton({
  archivePath,
  targetPath,
  onExtracted,
  className = "",
}: ExtractButtonProps) {
  const [extracting, setExtracting] = useState(false);

  const handleExtract = async () => {
    try {
      setExtracting(true);
      const res = await fetch("/api/cardano/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivePath, targetPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Extraction failed");
      }
      alert("Extraction successful! Binaries copied to .cardano/bin/");
      onExtracted();
    } catch (error) {
      alert(`Extraction failed: ${(error as Error).message}`);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <button
      onClick={handleExtract}
      disabled={extracting}
      className={`px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 whitespace-nowrap ${className}`}
      title="Extract archive and copy binaries to bin/"
    >
      {extracting ? "Extracting..." : "Extract"}
    </button>
  );
}

