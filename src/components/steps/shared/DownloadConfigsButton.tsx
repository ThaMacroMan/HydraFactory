import { useState } from "react";

interface DownloadConfigsButtonProps {
  onRefresh: () => void;
}

export default function DownloadConfigsButton({
  onRefresh,
}: DownloadConfigsButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetch("/api/cardano/download-configs", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        alert(
          `Successfully downloaded ${
            data.results.filter((r: any) => r.success).length
          } config files!`
        );
      } else {
        const successCount = data.results.filter((r: any) => r.success).length;
        const failedFiles = data.results
          .filter((r: any) => !r.success)
          .map((r: any) => r.file)
          .join(", ");
        alert(
          `Downloaded ${successCount}/${
            data.results.length
          } files.\n\nFailed: ${failedFiles || "none"}`
        );
      }
      onRefresh();
    } catch (error) {
      alert("Error downloading config files. Check console for details.");
      console.error(error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="px-3 py-1.5 text-xs border border-sky-500/50 text-sky-400 rounded-lg hover:bg-sky-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
      title="Download all Cardano configuration files from book.world.dev.cardano.org"
    >
      {downloading ? "Downloading..." : "Download All Configs"}
    </button>
  );
}




