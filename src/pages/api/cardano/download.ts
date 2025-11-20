import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { CARDANO_ROOT, HYDRA_ROOT } from "../../../server/constants";
import { pathExists } from "../../../server/fs-utils";

interface DownloadInfo {
  name: string;
  url: string;
  instructions: string;
}

const DOWNLOAD_INFO: Record<string, DownloadInfo> = {
  "bin/cardano-node": {
    name: "Cardano Node",
    url: "https://github.com/IntersectMBO/cardano-node/releases",
    instructions: "Download the latest release for your platform and extract cardano-node to .cardano/bin/",
  },
  "bin/cardano-cli": {
    name: "Cardano CLI",
    url: "https://github.com/IntersectMBO/cardano-node/releases",
    instructions: "Download the latest release for your platform and extract cardano-cli to .cardano/bin/",
  },
  "bin/mithril-client": {
    name: "Mithril Client",
    url: "https://github.com/input-output-hk/mithril/releases",
    instructions: "Use the 'Install Automatically' button in the UI, or manually download from GitHub releases and extract mithril-client to .cardano/bin/",
  },
  "hydra-node": {
    name: "Hydra Node",
    url: "https://github.com/cardano-scaling/hydra/releases",
    instructions: "Download the latest release for your platform (e.g., hydra-aarch64-darwin-*.zip) and extract hydra-node to .hydra/",
  },
  "config.json": {
    name: "Config File",
    url: "https://book.world.dev.cardano.org/env-preprod.html",
    instructions: "Download config.json from the preprod testnet configuration page",
  },
  "topology.json": {
    name: "Topology File",
    url: "https://book.world.dev.cardano.org/env-preprod.html",
    instructions: "Download topology.json from the preprod testnet configuration page",
  },
  "protocol-parameters.json": {
    name: "Protocol Parameters",
    url: "https://book.world.dev.cardano.org/env-preprod.html",
    instructions: "Download protocol-parameters.json from the preprod testnet configuration page",
  },
  "byron-genesis.json": {
    name: "Byron Genesis",
    url: "https://book.world.dev.cardano.org/env-preprod.html",
    instructions: "Download byron-genesis.json from the preprod testnet configuration page",
  },
  "shelley-genesis.json": {
    name: "Shelley Genesis",
    url: "https://book.world.dev.cardano.org/env-preprod.html",
    instructions: "Download shelley-genesis.json from the preprod testnet configuration page",
  },
  "alonzo-genesis.json": {
    name: "Alonzo Genesis",
    url: "https://book.world.dev.cardano.org/env-preprod.html",
    instructions: "Download alonzo-genesis.json from the preprod testnet configuration page",
  },
  "conway-genesis.json": {
    name: "Conway Genesis",
    url: "https://book.world.dev.cardano.org/env-preprod.html",
    instructions: "Download conway-genesis.json from the preprod testnet configuration page",
  },
  "peer-snapshot.json": {
    name: "Peer Snapshot",
    url: "https://book.world.dev.cardano.org/env-preprod.html",
    instructions: "Download peer-snapshot.json from the preprod testnet configuration page",
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { filePath } = req.query;

  if (!filePath || typeof filePath !== "string") {
    return res.status(400).json({ error: "filePath is required" });
  }

  // Determine root directory based on file path
  // protocol-parameters.json is used by Hydra, so it goes in .hydra
  const isHydraFile = filePath.startsWith("hydra-") || filePath === "protocol-parameters.json";
  const rootDir = isHydraFile ? HYDRA_ROOT : CARDANO_ROOT;
  const fullPath = path.join(rootDir, filePath);
  const exists = await pathExists(fullPath);

  if (exists) {
    return res.status(200).json({
      exists: true,
      message: "File already exists",
    });
  }

  const info = DOWNLOAD_INFO[filePath];
  if (!info) {
    return res.status(404).json({ error: "Download info not found for this file" });
  }

  return res.status(200).json({
    exists: false,
    name: info.name,
    url: info.url,
    instructions: info.instructions,
  });
}

