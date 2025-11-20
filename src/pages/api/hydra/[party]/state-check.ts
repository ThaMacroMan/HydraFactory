import type { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import path from "path";
import { HYDRA_ROOT } from "../../../../server/constants";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { party } = req.query;
  const partyStr = String(party);

  try {
    // Find the persistence directory for this party
    // Look for directories matching pattern: persistence-{party}-*
    const persistenceDirs = await fs.readdir(HYDRA_ROOT, { withFileTypes: true });
    const partyPersistenceDir = persistenceDirs.find(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith(`persistence-${partyStr}-`)
    );

    if (!partyPersistenceDir) {
      // No persistence directory means no initialization has happened
      return res.status(200).json({ isInitializing: false });
    }

    const stateFilePath = path.join(
      HYDRA_ROOT,
      partyPersistenceDir.name,
      "state"
    );

    // Check if state file exists
    try {
      await fs.access(stateFilePath);
    } catch {
      // State file doesn't exist
      return res.status(200).json({ isInitializing: false });
    }

    // Read the state file (it's JSONL format - one JSON object per line)
    const stateFileContent = await fs.readFile(stateFilePath, "utf-8");
    const lines = stateFileContent.trim().split("\n").filter(Boolean);

    // Check for HeadInitialized and HeadOpened events
    let hasHeadInitialized = false;
    let hasHeadOpened = false;

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.stateChanged?.tag === "HeadInitialized") {
          hasHeadInitialized = true;
        }
        if (event.stateChanged?.tag === "HeadOpened") {
          hasHeadOpened = true;
        }
      } catch (parseError) {
        // Skip invalid JSON lines
        continue;
      }
    }

    // If HeadInitialized exists but HeadOpened doesn't, we're in initialization
    const isInitializing = hasHeadInitialized && !hasHeadOpened;

    return res.status(200).json({ isInitializing });
  } catch (error) {
    console.error(`[state-check] Error checking state for ${partyStr}:`, error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to check state",
    });
  }
}

