import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { CARDANO_ROOT, HYDRA_ROOT, TMP_ROOT } from "../../../server/constants";
import { ensureDir, pathExists } from "../../../server/fs-utils";
import { runCommand } from "../../../server/process-utils";

const CARDANO_CLI = path.join(CARDANO_ROOT, "bin", "cardano-cli");
const HYDRA_NODE = path.join(HYDRA_ROOT, "hydra-node");
const WALLET_BASE = path.join(TMP_ROOT, "wallets");

const WALLET_NAMES = [
  "alice",
  "bob",
  "charlie",
  "diana",
  "eve",
  "frank",
  "grace",
  "henry",
  "iris",
  "jack",
  "kate",
  "leo",
  "mia",
  "noah",
  "olivia",
  "paul",
  "quinn",
  "ruby",
  "sam",
  "tina",
];

async function getNextWalletName(): Promise<string> {
  try {
    // Check if directory exists
    try {
      await fs.access(WALLET_BASE);
    } catch {
      // Directory doesn't exist, start with alice
      return "alice";
    }

    const existingWallets = await fs.readdir(WALLET_BASE);
    const existingNames = new Set<string>();

    // Check both folder names and labels in wallet.json
    for (const walletFolder of existingWallets) {
      existingNames.add(walletFolder);
      const walletDir = path.join(WALLET_BASE, walletFolder);
      const metaFile = path.join(walletDir, "wallet.json");
      try {
        const meta = JSON.parse(await fs.readFile(metaFile, "utf8"));
        if (meta.label) {
          existingNames.add(meta.label);
        }
      } catch {
        // Skip if file doesn't exist or can't be parsed
      }
    }

    // First try alice and bob
    if (!existingNames.has("alice")) return "alice";
    if (!existingNames.has("bob")) return "bob";

    // Then try random names
    const availableNames = WALLET_NAMES.filter(
      (name) => !existingNames.has(name)
    );
    if (availableNames.length > 0) {
      return availableNames[Math.floor(Math.random() * availableNames.length)];
    }

    // Fallback to a random name if all are taken
    return `wallet-${Math.random().toString(36).substring(2, 8)}`;
  } catch {
    // If any error occurs, start with alice
    return "alice";
  }
}

interface WalletResponse {
  id: string;
  label?: string;
  cardanoAddress: string;
  hydraWalletId: string;
  persistenceDirName: string;
  files: {
    paymentVkey: string;
    paymentSkey: string;
    hydraVkey: string;
    hydraSkey: string;
    addressFile: string;
    infoFile: string;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!(await pathExists(CARDANO_CLI))) {
      return res.status(500).json({
        error:
          "cardano-cli not found. Please download required software to .cardano/bin",
      });
    }

    if (!(await pathExists(HYDRA_NODE))) {
      return res.status(500).json({
        error:
          "hydra-node not found. Please download required software to .hydra/hydra-node",
      });
    }

    const id = randomUUID();
    const label = await getNextWalletName();
    // Generate persistence directory name: wallet-label + short ID (first 8 chars of UUID)
    const shortId = id.substring(0, 8);
    const persistenceDirName = `persistence-${label}-${shortId}`;
    const walletDir = path.join(WALLET_BASE, label);

    await ensureDir(walletDir);

    const paymentVkey = path.join(walletDir, "payment.vkey");
    const paymentSkey = path.join(walletDir, "payment.skey");
    const hydraVkey = path.join(walletDir, "hydra.vkey");
    const hydraSkey = path.join(walletDir, "hydra.skey");
    const addressFile = path.join(walletDir, "address.txt");
    const metaFile = path.join(walletDir, "wallet.json");

    await runCommand(CARDANO_CLI, [
      "address",
      "key-gen",
      "--verification-key-file",
      paymentVkey,
      "--signing-key-file",
      paymentSkey,
    ]);

    await runCommand(CARDANO_CLI, [
      "address",
      "build",
      "--payment-verification-key-file",
      paymentVkey,
      "--testnet-magic",
      "1",
      "--out-file",
      addressFile,
    ]);

    const cardanoAddress = (await fs.readFile(addressFile, "utf8")).trim();

    // Generate hydra keys using hydra-node
    // hydra-node generates .sk and .vk files, so we'll use a temp name and rename
    const hydraKeyBase = path.join(walletDir, "hydra");
    await runCommand(HYDRA_NODE, [
      "gen-hydra-key",
      "--output-file",
      hydraKeyBase,
    ]);

    // Rename the generated files to the expected names
    // hydra-node generates {output-file}.sk and {output-file}.vk
    const generatedSkey = `${hydraKeyBase}.sk`;
    const generatedVkey = `${hydraKeyBase}.vk`;

    // Check if files exist and rename them
    if (await pathExists(generatedSkey)) {
      await fs.rename(generatedSkey, hydraSkey);
    }
    if (await pathExists(generatedVkey)) {
      await fs.rename(generatedVkey, hydraVkey);
    }

    const info = {
      id,
      label: label ?? null,
      createdAt: new Date().toISOString(),
      cardanoAddress,
      hydraWalletId: `hydra-${id}`,
      persistenceDirName,
      files: {
        paymentVkey,
        paymentSkey,
        hydraVkey,
        hydraSkey,
        addressFile,
      },
    };

    await fs.writeFile(metaFile, JSON.stringify(info, null, 2));

    const response: WalletResponse = {
      id,
      label,
      cardanoAddress,
      hydraWalletId: `hydra-${id}`,
      persistenceDirName,
      files: {
        paymentVkey,
        paymentSkey,
        hydraVkey,
        hydraSkey,
        addressFile,
        infoFile: metaFile,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("wallet:create", error);
    return res.status(500).json({ error: (error as Error).message });
  }
}
