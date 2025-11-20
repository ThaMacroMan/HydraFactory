import { useState, useEffect, useCallback } from "react";

interface DownloadButtonProps {
  filePath: string;
  className?: string;
  onDownloaded?: () => void;
}

export default function DownloadButton({
  filePath,
  className = "",
  onDownloaded,
}: DownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState<{
    url: string;
    instructions: string;
  } | null>(null);

  const fetchDownloadInfo = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/cardano/download?filePath=${encodeURIComponent(filePath)}`
      );
      const data = await res.json();
      if (data.url) {
        setDownloadInfo(data);
      }
    } catch (error) {
      console.error("Failed to fetch download info:", error);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  const handleDownload = () => {
    if (downloadInfo) {
      window.open(downloadInfo.url, "_blank", "noopener,noreferrer");
      // Refresh checklist after a delay to detect the downloaded archive
      // Give user time to download and drop the file (5 seconds)
      if (onDownloaded) {
        setTimeout(() => {
          onDownloaded();
        }, 5000);
      }
    } else {
      fetchDownloadInfo();
    }
  };

  useEffect(() => {
    fetchDownloadInfo();
  }, [fetchDownloadInfo]);

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className={`px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 rounded-lg disabled:opacity-50 whitespace-nowrap ${className}`}
      title={downloadInfo?.instructions}
    >
      {loading ? "Loading..." : "Download"}
    </button>
  );
}

