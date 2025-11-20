import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { promises as fs } from "fs";
import { TMP_ROOT, PROJECT_ROOT } from "../../../server/constants";
import { pathExists } from "../../../server/fs-utils";

const WALLET_BASE = path.join(TMP_ROOT, "wallets");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Check if wallets directory exists
    if (!(await pathExists(WALLET_BASE))) {
      return res.status(200).json({ wallets: [] });
    }

    const walletDirs = await fs.readdir(WALLET_BASE);
    const wallets = [];

    for (const walletDirName of walletDirs) {
      const walletDir = path.join(WALLET_BASE, walletDirName);
      const metaFile = path.join(walletDir, "wallet.json");
      const addressFile = path.join(walletDir, "address.txt");

      try {
        // Read wallet metadata
        const meta = JSON.parse(await fs.readFile(metaFile, "utf8"));
        
        // Read address if it exists
        let cardanoAddress = meta.cardanoAddress;
        if (!cardanoAddress && (await pathExists(addressFile))) {
          cardanoAddress = (await fs.readFile(addressFile, "utf8")).trim();
        }

        // Generate persistence directory name if not stored (for backward compatibility)
        let persistenceDirName = meta.persistenceDirName;
        if (!persistenceDirName) {
          // Fallback: generate from label + short ID for old wallets
          const shortId = meta.id ? meta.id.substring(0, 8) : Math.random().toString(36).substring(2, 10);
          persistenceDirName = `persistence-${meta.label || walletDirName}-${shortId}`;
        }

        // Build file paths (relative to project root)
        const getRelativePath = (fullPath: string) => {
          return path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, "/");
        };
        const paymentVkey = getRelativePath(path.join(walletDir, "payment.vkey"));
        const paymentSkey = getRelativePath(path.join(walletDir, "payment.skey"));
        const hydraVkey = getRelativePath(path.join(walletDir, "hydra.vkey"));
        const hydraSkey = getRelativePath(path.join(walletDir, "hydra.skey"));
        const metaFilePath = getRelativePath(metaFile);
        const addressFilePath = getRelativePath(addressFile);

        wallets.push({
          id: meta.id,
          label: meta.label || walletDirName,
          cardanoAddress: cardanoAddress || "",
          hydraWalletId: meta.hydraWalletId || `hydra-${meta.id}`,
          persistenceDirName,
          files: {
            paymentVkey,
            paymentSkey,
            hydraVkey,
            hydraSkey,
            addressFile: addressFilePath,
            infoFile: metaFilePath,
          },
        });
      } catch (error) {
        // Skip wallets that can't be read
        console.error(`Failed to read wallet ${walletDirName}:`, error);
      }
    }

    // Sort by creation date (newest first) if available
    wallets.sort((a, b) => {
      // Try to maintain order based on directory name or creation
      return 0;
    });

    return res.status(200).json({ wallets });
  } catch (error) {
    console.error("Failed to list wallets:", error);
    return res.status(500).json({ error: (error as Error).message });
  }
}

