import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import { TMP_ROOT } from "@/server/constants";

const SCRIPTS_DIR = path.join(TMP_ROOT, "scripts");
const SCRIPTS_FILE = path.join(SCRIPTS_DIR, "scripts.json");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Script ID is required" });
    }

    try {
      await fs.access(SCRIPTS_FILE);
    } catch {
      return res.status(404).json({ error: "Scripts file not found" });
    }

    const data = await fs.readFile(SCRIPTS_FILE, "utf-8");
    const scripts = JSON.parse(data);

    // Prevent deleting default script
    const scriptIndex = scripts.findIndex((s: any) => s.id === id);
    if (scriptIndex === -1) {
      return res.status(404).json({ error: "Script not found" });
    }

    if (scripts[scriptIndex].isDefault) {
      return res.status(400).json({ error: "Cannot delete default script" });
    }

    scripts.splice(scriptIndex, 1);
    await fs.writeFile(SCRIPTS_FILE, JSON.stringify(scripts, null, 2));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[scripts/delete] Error deleting script:", error);
    return res.status(500).json({
      error: "Failed to delete script",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

