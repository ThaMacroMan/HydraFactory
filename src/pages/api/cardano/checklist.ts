import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { promises as fs } from "fs";
import { CARDANO_ROOT, HYDRA_ROOT } from "../../../server/constants";
import { pathExists } from "../../../server/fs-utils";

interface SoftwareItem {
  name: string;
  path: string;
  fullPath: string;
  installed: boolean;
  description: string;
  downloadUrl?: string;
  archiveFound?: boolean;
  archivePath?: string;
  needsExtraction?: boolean;
}

interface ChecklistResponse {
  items: SoftwareItem[];
  allInstalled: boolean;
}

// Grouped: Cardano binaries, then Cardano config files, then Hydra
const REQUIRED_SOFTWARE: Omit<SoftwareItem, "installed" | "fullPath">[] = [
  // Cardano Binaries
  {
    name: "Cardano Node",
    path: "bin/cardano-node",
    description: "Cardano node binary for running the preprod relay",
  },
  {
    name: "Cardano CLI",
    path: "bin/cardano-cli",
    description: "Command-line interface for Cardano operations",
  },
  {
    name: "Mithril Client",
    path: "bin/mithril-client",
    description:
      "Mithril client for fast node bootstrapping (optional but recommended)",
  },
  // Cardano Configuration Files
  {
    name: "Configuration File",
    path: "config.json",
    description: "Cardano node configuration file",
  },
  {
    name: "Topology File",
    path: "topology.json",
    description: "Network topology configuration",
  },
  {
    name: "Byron Genesis",
    path: "byron-genesis.json",
    description: "Byron era genesis file",
  },
  {
    name: "Shelley Genesis",
    path: "shelley-genesis.json",
    description: "Shelley era genesis file",
  },
  {
    name: "Alonzo Genesis",
    path: "alonzo-genesis.json",
    description: "Alonzo era genesis file",
  },
  {
    name: "Conway Genesis",
    path: "conway-genesis.json",
    description: "Conway era genesis file",
  },
  {
    name: "Peer Snapshot",
    path: "peer-snapshot.json",
    description: "Peer snapshot for P2P network discovery",
  },
  // Hydra
  {
    name: "Hydra Node",
    path: "hydra-node",
    description: "Hydra head protocol node binary",
  },
  {
    name: "Protocol Parameters",
    path: "protocol-parameters.json",
    description: "Cardano protocol parameters (used by Hydra)",
  },
];

async function findArchiveFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const archives: string[] = [];
    for (const entry of entries) {
      if (entry.isFile()) {
        const name = entry.name.toLowerCase();
        if (
          name.endsWith(".tar.gz") ||
          name.endsWith(".zip") ||
          name.endsWith(".tar")
        ) {
          archives.push(entry.name);
        }
      }
    }
    return archives;
  } catch {
    return [];
  }
}

async function findBinaryInExtracted(
  dir: string,
  binaryName: string
): Promise<string | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const extractedPath = path.join(dir, entry.name, binaryName);
        if (await pathExists(extractedPath)) {
          return extractedPath;
        }
        // Also check common subdirectories
        const subDirs = ["bin", "dist", "build"];
        for (const subDir of subDirs) {
          const subPath = path.join(dir, entry.name, subDir, binaryName);
          if (await pathExists(subPath)) {
            return subPath;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ChecklistResponse>
) {
  try {
    const cardanoArchives = await findArchiveFiles(CARDANO_ROOT);
    const hydraArchives = await findArchiveFiles(HYDRA_ROOT);

    const items: SoftwareItem[] = await Promise.all(
      REQUIRED_SOFTWARE.map(async (item) => {
        // Determine root directory based on item type
        // protocol-parameters.json is used by Hydra, so it goes in .hydra and is grouped with Hydra
        const isHydraItem =
          item.path.startsWith("hydra-") ||
          item.path === "protocol-parameters.json";
        const rootDir = isHydraItem ? HYDRA_ROOT : CARDANO_ROOT;
        const fullPath = path.join(rootDir, item.path);
        const installed = await pathExists(fullPath);

        let archiveFound = false;
        let archivePath: string | undefined;
        let needsExtraction = false;

        // If binary not found, check for archives and extracted directories
        if (!installed) {
          const binaryName = path.basename(item.path);
          const archives = isHydraItem ? hydraArchives : cardanoArchives;

          // Determine which archive type to look for based on binary name
          const isCardano = binaryName.includes("cardano");
          const isHydra = binaryName.includes("hydra");

          // Check for matching archives
          for (const archive of archives) {
            const archiveLower = archive.toLowerCase();
            const matchesCardano =
              isCardano && archiveLower.includes("cardano");
            const matchesHydra = isHydra && archiveLower.includes("hydra");

            if (matchesCardano || matchesHydra) {
              archiveFound = true;
              archivePath = path.join(rootDir, archive);
              needsExtraction = true;
              break;
            }
          }

          // Check if binary exists in extracted directory
          const extractedPath = await findBinaryInExtracted(
            rootDir,
            binaryName
          );
          if (extractedPath) {
            archiveFound = true;
            archivePath = extractedPath;
            needsExtraction = true;
          }
        }

        return {
          ...item,
          fullPath,
          installed,
          archiveFound,
          archivePath,
          needsExtraction,
        };
      })
    );

    const allInstalled = items.every((item) => item.installed);

    return res.status(200).json({
      items,
      allInstalled,
    });
  } catch {
    return res.status(500).json({
      items: [],
      allInstalled: false,
    });
  }
}
