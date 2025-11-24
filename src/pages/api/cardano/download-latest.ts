import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { promises as fs } from "fs";
import { CARDANO_ROOT } from "../../../server/constants";
import { pathExists, ensureDir } from "../../../server/fs-utils";

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get latest release info
    const releaseResponse = await fetch(
      "https://api.github.com/repos/IntersectMBO/cardano-node/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "HydraFactory",
        },
      }
    );

    if (!releaseResponse.ok) {
      throw new Error(
        `GitHub API error: ${releaseResponse.status} ${releaseResponse.statusText}`
      );
    }

    const release: GitHubRelease = await releaseResponse.json();

    // Detect platform
    const platform = process.platform;
    const arch = process.arch;

    // Determine which asset to download
    let selectedAsset: (typeof release.assets)[0] | null = null;

    // Priority order: platform-specific archives
    const platformPatterns = [
      // macOS
      { pattern: /darwin|macos/i, test: platform === "darwin" },
      // Linux
      { pattern: /linux/i, test: platform === "linux" },
      // Windows
      { pattern: /windows|win/i, test: platform === "win32" },
    ];

    for (const { pattern, test } of platformPatterns) {
      if (test) {
        // Try to find architecture-specific first
        const archPattern = arch === "x64" ? /x86_64|amd64/i : /arm64|aarch64/i;
        selectedAsset =
          release.assets.find(
            (asset) =>
              pattern.test(asset.name) &&
              archPattern.test(asset.name) &&
              /\.(tar\.gz|zip)$/i.test(asset.name)
          ) || null;

        // Fallback to any platform match
        if (!selectedAsset) {
          selectedAsset =
            release.assets.find(
              (asset) =>
                pattern.test(asset.name) && /\.(tar\.gz|zip)$/i.test(asset.name)
            ) || null;
        }
        break;
      }
    }

    if (!selectedAsset) {
      return res.status(400).json({
        error: `No suitable archive found for platform ${platform} (${arch}). Available assets: ${release.assets
          .map((a) => a.name)
          .join(", ")}`,
      });
    }

    // Download the archive
    const archiveName = selectedAsset.name;
    const archivePath = path.join(CARDANO_ROOT, archiveName);

    // Check if archive already exists
    if (await pathExists(archivePath)) {
      // Archive already exists, proceed to extraction
      return res.status(200).json({
        success: true,
        message: "Archive already exists, proceeding to extraction",
        archivePath: archiveName,
        version: release.tag_name.replace(/^v/, ""),
      });
    }

    // Download the archive
    const downloadResponse = await fetch(selectedAsset.browser_download_url);
    if (!downloadResponse.ok) {
      throw new Error(
        `Failed to download archive: ${downloadResponse.status} ${downloadResponse.statusText}`
      );
    }

    await ensureDir(CARDANO_ROOT);
    const buffer = Buffer.from(await downloadResponse.arrayBuffer());
    await fs.writeFile(archivePath, buffer);

    return res.status(200).json({
      success: true,
      message: "Archive downloaded successfully",
      archivePath: archiveName,
      version: release.tag_name.replace(/^v/, ""),
    });
  } catch (error) {
    console.error("Download error:", error);
    return res.status(500).json({
      error: `Failed to download latest release: ${(error as Error).message}`,
    });
  }
}
