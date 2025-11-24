import type { NextApiRequest, NextApiResponse } from "next";

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

interface ReleaseInfo {
  latestVersion: string;
  latestTag: string;
  publishedAt: string;
  releaseUrl: string;
  assets: Array<{
    name: string;
    downloadUrl: string;
    size: number;
  }>;
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ReleaseInfo | { error: string }>
) {
  if (_req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const response = await fetch(
      "https://api.github.com/repos/IntersectMBO/cardano-node/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "HydraFactory",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }

    const release: GitHubRelease = await response.json();

    // Extract version from tag (e.g., "8.9.2" from "8.9.2" or "v8.9.2")
    const version = release.tag_name.replace(/^v/, "");

    return res.status(200).json({
      latestVersion: version,
      latestTag: release.tag_name,
      publishedAt: release.published_at,
      releaseUrl: release.html_url,
      assets: release.assets.map((asset) => ({
        name: asset.name,
        downloadUrl: asset.browser_download_url,
        size: asset.size,
      })),
    });
  } catch (error) {
    console.error("Error fetching releases:", error);
    return res.status(500).json({
      error: `Failed to fetch latest releases: ${(error as Error).message}`,
    });
  }
}

