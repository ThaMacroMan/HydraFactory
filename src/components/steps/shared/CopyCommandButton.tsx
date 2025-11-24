import { useState } from "react";

interface CopyCommandButtonProps {
  command: string;
  description?: string;
}

export default function CopyCommandButton({
  command,
  description,
}: CopyCommandButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="space-y-2">
      {description && <p className="text-sm text-gray-400">{description}</p>}
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-gray-900 rounded px-3 py-2 font-mono text-xs break-all">
          {command}
        </code>
        <button
          onClick={handleCopy}
          className="px-3 py-2 text-xs border border-gray-700 rounded-lg hover:bg-gray-800 transition whitespace-nowrap"
          title="Copy to clipboard"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}




