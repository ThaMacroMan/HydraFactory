import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { CARDANO_ROOT } from "../../../server/constants";
import { ensureDir, pathExists } from "../../../server/fs-utils";
import { runCommand } from "../../../server/process-utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const binDir = path.join(CARDANO_ROOT, "bin");
    await ensureDir(binDir);

    // Check if already installed
    const mithrilPath = path.join(binDir, "mithril-client");
    if (await pathExists(mithrilPath)) {
      return res.status(200).json({
        success: true,
        message: "mithril-client is already installed",
        path: mithrilPath,
      });
    }

    // Use Mithril's official installer script
    // This downloads and installs mithril-client automatically
    const installScript = `curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/input-output-hk/mithril/refs/heads/main/mithril-install.sh | sh -s -- -c mithril-client -d unstable -p ${binDir}`;

    console.log("Installing mithril-client...");
    const { stdout, stderr } = await runCommand("sh", ["-c", installScript], {
      cwd: CARDANO_ROOT,
      timeout: 120000, // 2 minute timeout
    });

    // Check if installation was successful
    if (await pathExists(mithrilPath)) {
      // Make it executable
      await runCommand("chmod", ["+x", mithrilPath], {
        cwd: CARDANO_ROOT,
      });

      // Remove macOS quarantine if on macOS
      try {
        await runCommand("xattr", ["-c", mithrilPath], {
          cwd: CARDANO_ROOT,
        });
      } catch {
        // Ignore if xattr fails (e.g., on non-macOS systems)
      }

      return res.status(200).json({
        success: true,
        message: "mithril-client installed successfully",
        path: mithrilPath,
        output: stdout,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "Installation completed but mithril-client not found",
        stderr: stderr,
        stdout: stdout,
      });
    }
  } catch (error) {
    console.error("Mithril installation error:", error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
