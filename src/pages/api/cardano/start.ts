import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { promises as fs } from "fs";
import { PROJECT_ROOT, CARDANO_ROOT } from "../../../server/constants";
import { runCommand } from "../../../server/process-utils";
import { pathExists } from "../../../server/fs-utils";

const CARDANO_NODE = path.join(CARDANO_ROOT, "bin", "cardano-node");
const CARDANO_CONFIG = path.join(CARDANO_ROOT, "config.json");
const CARDANO_TOPOLOGY = path.join(CARDANO_ROOT, "topology.json");
const CARDANO_SOCKET = path.join(CARDANO_ROOT, "node.socket");
const CARDANO_DB = path.join(CARDANO_ROOT, "db");
const CARDANO_LOGS = path.join(CARDANO_ROOT, "logs", "cardano-node.log");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Check if node is already running
    // pgrep returns exit code 1 when no processes found, which is fine
    let checkResult;
    try {
      checkResult = await runCommand(
        "pgrep",
        ["-f", "cardano-node.*run"]
      );
    } catch (error) {
      // pgrep returns exit code 1 when no processes found - this is expected
      checkResult = { stdout: "", stderr: "" };
    }
    
    if (checkResult.stdout.trim().length > 0) {
      return res.status(200).json({
        success: true,
        message: "Cardano node is already running",
        running: true,
      });
    }

    // Check prerequisites
    if (!(await pathExists(CARDANO_NODE))) {
      return res.status(400).json({
        error: "cardano-node binary not found. Please download required software.",
      });
    }

    if (!(await pathExists(CARDANO_CONFIG))) {
      return res.status(400).json({
        error: "config.json not found. Please download configuration files.",
      });
    }

    // Remove old socket if it exists
    try {
      await fs.unlink(CARDANO_SOCKET);
    } catch {
      // Socket doesn't exist, that's fine
    }

    // Ensure directories exist
    await fs.mkdir(CARDANO_DB, { recursive: true });
    await fs.mkdir(path.dirname(CARDANO_LOGS), { recursive: true });

    // Start cardano-node in background using shell command with redirection
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    // Escape paths for shell safety
    const escapeShell = (str: string) => `'${str.replace(/'/g, "'\"'\"'")}'`;
    
    const command = `cd ${escapeShell(CARDANO_ROOT)} && nohup ${escapeShell(CARDANO_NODE)} run --config ${escapeShell(CARDANO_CONFIG)} --topology ${escapeShell(CARDANO_TOPOLOGY)} --socket-path ${escapeShell(CARDANO_SOCKET)} --database-path ${escapeShell(CARDANO_DB)} >> ${escapeShell(CARDANO_LOGS)} 2>&1 & echo $!`;
    
    try {
      const { stdout } = await execAsync(command);
      const pid = stdout.trim();
      console.log(`Cardano node started with PID: ${pid}`);
    } catch (error) {
      // Command might still succeed even if exec reports an error
      console.warn("Note: exec reported error, but node may have started:", error);
    }

    // Give it a moment to start
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Check if it's actually running
    // pgrep returns exit code 1 when no processes found, which is fine
    let verifyResult;
    try {
      verifyResult = await runCommand(
        "pgrep",
        ["-f", "cardano-node.*run"]
      );
    } catch (error) {
      // pgrep returns exit code 1 when no processes found - this is expected
      verifyResult = { stdout: "", stderr: "" };
    }

    const isRunning = verifyResult.stdout.trim().length > 0;

    return res.status(200).json({
      success: true,
      message: isRunning
        ? "Cardano node started successfully"
        : "Start command executed (node may still be initializing)",
      running: isRunning,
    });
  } catch (error) {
    console.error("Error starting Cardano node:", error);
    return res.status(500).json({
      error: (error as Error).message,
    });
  }
}

