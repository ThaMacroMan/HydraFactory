import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { promises as fs } from "fs";
import { CARDANO_ROOT, HYDRA_ROOT } from "../../../server/constants";
import { ensureDir, pathExists } from "../../../server/fs-utils";

// Preprod config file URLs from https://book.world.dev.cardano.org/env-preprod.html
const CONFIG_FILES = [
  {
    name: "config.json",
    url: "https://book.world.dev.cardano.org/environments/preprod/config.json",
    description: "Cardano node configuration file (non-block-producer)",
  },
  {
    name: "topology.json",
    url: "https://book.world.dev.cardano.org/environments/preprod/topology.json",
    description: "Network topology configuration",
  },
  {
    name: "protocol-parameters.json",
    url: "https://book.world.dev.cardano.org/environments/preprod/protocol-parameters.json",
    description: "Cardano protocol parameters",
  },
  {
    name: "byron-genesis.json",
    url: "https://book.world.dev.cardano.org/environments/preprod/byron-genesis.json",
    description: "Byron era genesis file",
  },
  {
    name: "shelley-genesis.json",
    url: "https://book.world.dev.cardano.org/environments/preprod/shelley-genesis.json",
    description: "Shelley era genesis file",
  },
  {
    name: "alonzo-genesis.json",
    url: "https://book.world.dev.cardano.org/environments/preprod/alonzo-genesis.json",
    description: "Alonzo era genesis file",
  },
  {
    name: "conway-genesis.json",
    url: "https://book.world.dev.cardano.org/environments/preprod/conway-genesis.json",
    description: "Conway era genesis file",
  },
  {
    name: "peer-snapshot.json",
    url: "https://book.world.dev.cardano.org/environments/preprod/peer-snapshot.json",
    description: "Peer snapshot for P2P network discovery",
  },
];

interface DownloadResult {
  file: string;
  success: boolean;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await ensureDir(CARDANO_ROOT);
    await ensureDir(HYDRA_ROOT);

    const results: DownloadResult[] = [];

    for (const configFile of CONFIG_FILES) {
      // protocol-parameters.json goes to .hydra/, everything else goes to .cardano/
      const targetRoot = configFile.name === "protocol-parameters.json" ? HYDRA_ROOT : CARDANO_ROOT;
      const filePath = path.join(targetRoot, configFile.name);

      // Skip if file already exists
      if (await pathExists(filePath)) {
        results.push({
          file: configFile.name,
          success: true,
        });
        continue;
      }

      try {
        // Download the file
        const response = await fetch(configFile.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const content = await response.text();
        await fs.writeFile(filePath, content, "utf-8");

        results.push({
          file: configFile.name,
          success: true,
        });
      } catch (error) {
        results.push({
          file: configFile.name,
          success: false,
          error: (error as Error).message,
        });
      }
    }

    const allSuccess = results.every((r) => r.success);
    const successCount = results.filter((r) => r.success).length;

    return res.status(allSuccess ? 200 : 207).json({
      success: allSuccess,
      message: `Downloaded ${successCount}/${CONFIG_FILES.length} config files`,
      results,
    });
  } catch (error) {
    console.error("Download configs error:", error);
    return res.status(500).json({
      error: (error as Error).message,
    });
  }
}

