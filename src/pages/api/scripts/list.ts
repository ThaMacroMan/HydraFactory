import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import { TMP_ROOT } from "@/server/constants";

interface CustomScript {
  id: string;
  name: string;
  description?: string;
  txIds: string; // Comma-separated transaction IDs
  network: "preprod" | "mainnet" | "preview";
  createdAt: string;
  isDefault?: boolean;
}

const SCRIPTS_DIR = path.join(TMP_ROOT, "scripts");
const SCRIPTS_FILE = path.join(SCRIPTS_DIR, "scripts.json");

async function ensureScriptsFile() {
  try {
    await fs.mkdir(SCRIPTS_DIR, { recursive: true });
    try {
      await fs.access(SCRIPTS_FILE);
    } catch {
      // File doesn't exist, create with default script
      const defaultScript: CustomScript = {
        id: "default",
        name: "Official Hydra Scripts (Preprod)",
        description: "Default Hydra scripts for preprod network",
        txIds:
          "407bf714186db790f2624701b2e065850dd7b7cf998c931222d99a56d8ad256b,4cae9ad9c1cc4f82ce2fd51f9e1155a37ac88957f81128ba1c51bc7c6734ce6c,a3a27a3049be1fe931a0d99bf132a88b848b12dc50f50856cb86e12bb135f5d2",
        network: "preprod",
        createdAt: new Date().toISOString(),
        isDefault: true,
      };
      await fs.writeFile(
        SCRIPTS_FILE,
        JSON.stringify([defaultScript], null, 2)
      );
    }
  } catch (error) {
    console.error("[scripts/list] Error ensuring scripts file:", error);
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await ensureScriptsFile();
    const data = await fs.readFile(SCRIPTS_FILE, "utf-8");
    const scripts: CustomScript[] = JSON.parse(data);
    return res.status(200).json({ scripts });
  } catch (error) {
    console.error("[scripts/list] Error listing scripts:", error);
    return res.status(500).json({
      error: "Failed to list scripts",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

