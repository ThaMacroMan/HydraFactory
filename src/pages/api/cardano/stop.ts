import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { PROJECT_ROOT } from "../../../server/constants";
import { runCommand } from "../../../server/process-utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Check if node is running
    // pgrep returns exit code 1 when no processes found, which is fine
    let checkResult;
    try {
      checkResult = await runCommand("pgrep", ["-f", "cardano-node.*run"]);
    } catch (error) {
      // pgrep returns exit code 1 when no processes found - this is expected
      checkResult = { stdout: "", stderr: "" };
    }

    const pids = checkResult.stdout.trim();
    if (pids.length === 0) {
      // Check if socket exists (might be stale)
      const socketPath = path.join(PROJECT_ROOT, ".cardano", "node.socket");
      try {
        const { statSync } = await import("fs");
        const stats = statSync(socketPath);
        if (stats.isSocket()) {
          // Remove stale socket
          await import("fs").then((fs) => fs.promises.unlink(socketPath));
        }
      } catch {
        // Socket doesn't exist, that's fine
      }

      return res.status(200).json({
        success: true,
        message: "Cardano node is not running",
        running: false,
      });
    }

    // Try graceful shutdown first (SIGTERM)
    // Cardano node needs time to flush database and close cleanly
    const pidList = pids.split(/\s+/).filter((pid) => pid.trim());
    for (const pid of pidList) {
      try {
        await runCommand("kill", ["-TERM", pid]);
      } catch {
        // Process may have already exited
      }
    }

    // Wait longer for graceful shutdown - Cardano node needs time to:
    // 1. Finish current operations
    // 2. Flush database writes
    // 3. Close connections cleanly
    // This reduces the need for chunk validation on restart
    await new Promise((resolve) => setTimeout(resolve, 7000));

    // Check if processes are still running
    // pgrep returns exit code 1 when no processes found, which is fine
    let verifyResult;
    try {
      verifyResult = await runCommand("pgrep", ["-f", "cardano-node.*run"]);
    } catch (error) {
      // pgrep returns exit code 1 when no processes found - this is expected
      verifyResult = { stdout: "", stderr: "" };
    }

    const remainingPids = verifyResult.stdout.trim();
    if (remainingPids.length > 0) {
      // Force kill if still running
      const remainingPidList = remainingPids
        .split(/\s+/)
        .filter((pid) => pid.trim());
      for (const pid of remainingPidList) {
        try {
          await runCommand("kill", ["-KILL", pid]);
        } catch {
          // Process may have already exited
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Remove socket file if it exists
    const socketPath = path.join(PROJECT_ROOT, ".cardano", "node.socket");
    try {
      await import("fs").then((fs) => fs.promises.unlink(socketPath));
    } catch {
      // Socket doesn't exist or already removed
    }

    // Final check
    // pgrep returns exit code 1 when no processes found, which is fine
    let finalCheck;
    try {
      finalCheck = await runCommand("pgrep", ["-f", "cardano-node.*run"]);
    } catch (error) {
      // pgrep returns exit code 1 when no processes found - this is expected
      finalCheck = { stdout: "", stderr: "" };
    }

    const isStillRunning = finalCheck.stdout.trim().length > 0;

    return res.status(200).json({
      success: true,
      message: isStillRunning
        ? "Stop command executed (some processes may still be shutting down)"
        : "Cardano node stopped successfully",
      running: isStillRunning,
    });
  } catch (error) {
    console.error("Error stopping Cardano node:", error);
    return res.status(500).json({
      error: (error as Error).message,
    });
  }
}
