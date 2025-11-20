import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { promises as fs } from "fs";
import { CARDANO_ROOT, HYDRA_ROOT } from "../../../server/constants";
import { pathExists, ensureDir } from "../../../server/fs-utils";
import { runCommand } from "../../../server/process-utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { archivePath, targetPath } = req.body ?? {};

  if (!archivePath || !targetPath) {
    return res
      .status(400)
      .json({ error: "archivePath and targetPath are required" });
  }

  try {
    // Determine if this is a Hydra archive based on filename
    const archiveName = path.basename(archivePath);
    const isHydraArchive = archiveName.toLowerCase().includes("hydra");

    // Find the archive - check both directories if relative path
    let fullArchivePath: string;
    if (path.isAbsolute(archivePath)) {
      fullArchivePath = archivePath;
    } else {
      // Try CARDANO_ROOT first, then HYDRA_ROOT
      const cardanoPath = path.join(CARDANO_ROOT, archivePath);
      const hydraPath = path.join(HYDRA_ROOT, archivePath);

      if (await pathExists(cardanoPath)) {
        fullArchivePath = cardanoPath;
      } else if (await pathExists(hydraPath)) {
        fullArchivePath = hydraPath;
      } else {
        // Default to the appropriate root based on archive type
        fullArchivePath = isHydraArchive
          ? path.join(HYDRA_ROOT, archivePath)
          : path.join(CARDANO_ROOT, archivePath);
      }
    }

    if (!(await pathExists(fullArchivePath))) {
      return res.status(404).json({ error: "Archive not found" });
    }

    // Extract archive
    const isTarGz = archiveName.endsWith(".tar.gz");
    const isZip = archiveName.endsWith(".zip");

    // Choose extraction root based on archive type
    const extractionRoot = isHydraArchive ? HYDRA_ROOT : CARDANO_ROOT;
    await ensureDir(extractionRoot);

    if (isTarGz) {
      // Extract tar.gz
      await runCommand("tar", ["-xzf", fullArchivePath, "-C", extractionRoot], {
        cwd: extractionRoot,
      });
    } else if (isZip) {
      // Extract zip
      await runCommand("unzip", ["-q", fullArchivePath, "-d", extractionRoot], {
        cwd: extractionRoot,
      });
    } else {
      return res.status(400).json({ error: "Unsupported archive format" });
    }

    // Determine target directory for binaries
    const targetBinDir = isHydraArchive
      ? HYDRA_ROOT
      : path.join(CARDANO_ROOT, "bin");
    await ensureDir(targetBinDir);

    // Try to find the extracted directory (some archives create a subdirectory)
    const archiveBaseName = archiveName.replace(/\.(tar\.gz|zip)$/, "");
    const possibleExtractedDir = path.join(extractionRoot, archiveBaseName);

    // Determine where binaries are located
    let sourceBinDir: string | null = null;

    // Case 1: Binaries are in extractedDir/bin/ (Cardano style)
    const binSubdir = path.join(possibleExtractedDir, "bin");
    if (await pathExists(binSubdir)) {
      sourceBinDir = binSubdir;
    }
    // Case 2: Binaries are directly in extractedDir/ (Hydra style)
    else if (await pathExists(possibleExtractedDir)) {
      // Check if extractedDir contains binaries directly
      const files = await fs.readdir(possibleExtractedDir);
      const hasBinaries = files.some(
        (f) =>
          f.startsWith("hydra-") || f.startsWith("cardano-") || f === "bech32"
      );
      if (hasBinaries) {
        sourceBinDir = possibleExtractedDir;
      }
    }
    // Case 3: Archive extracted directly to extraction root (no subdirectory)
    else {
      // Check if binaries were extracted directly to root
      const rootFiles = await fs.readdir(extractionRoot);
      const rootBinaries = rootFiles.filter(
        (f) =>
          (f.startsWith("hydra-") ||
            f.startsWith("cardano-") ||
            f === "bech32") &&
          !f.includes(".")
      );
      if (rootBinaries.length > 0) {
        // Copy from root to target
        for (const file of rootBinaries) {
          const sourcePath = path.join(extractionRoot, file);
          const targetPath = path.join(targetBinDir, file);
          const stat = await fs.stat(sourcePath);
          if (stat.isFile()) {
            await fs.copyFile(sourcePath, targetPath);
            await fs.chmod(targetPath, 0o755);
            // Remove macOS quarantine attribute to prevent "untrusted" errors
            try {
              await runCommand("xattr", ["-d", "com.apple.quarantine", targetPath], {
                cwd: extractionRoot,
              });
            } catch {
              // Ignore errors if xattr fails (e.g., on non-macOS systems)
            }
          }
        }
        // Also copy any .dylib files from root
        const rootDylibs = rootFiles.filter((f) => f.endsWith(".dylib") || f.endsWith(".so"));
        if (rootDylibs.length > 0 && !isHydraArchive) {
          const libTargetDir = path.join(CARDANO_ROOT, "lib");
          await ensureDir(libTargetDir);
          for (const file of rootDylibs) {
            const sourcePath = path.join(extractionRoot, file);
            const targetPath = path.join(libTargetDir, file);
            const stat = await fs.stat(sourcePath);
            if (stat.isFile()) {
              await fs.copyFile(sourcePath, targetPath);
              try {
                await runCommand("xattr", ["-d", "com.apple.quarantine", targetPath], {
                  cwd: extractionRoot,
                });
              } catch {
                // Ignore errors
              }
            }
          }
        }
        return res.status(200).json({
          success: true,
          message: "Archive extracted successfully",
        });
      }
    }

    // Copy binaries and libraries from source to target directory
    if (sourceBinDir) {
      const files = await fs.readdir(sourceBinDir);
      for (const file of files) {
        const sourcePath = path.join(sourceBinDir, file);
        const targetPath = path.join(targetBinDir, file);
        const stat = await fs.stat(sourcePath);
        if (stat.isFile()) {
          await fs.copyFile(sourcePath, targetPath);
          // Make executable (for binaries, harmless for libraries)
          await fs.chmod(targetPath, 0o755);
          // Remove macOS quarantine attribute to prevent "untrusted" errors
          try {
            await runCommand("xattr", ["-d", "com.apple.quarantine", targetPath], {
              cwd: CARDANO_ROOT,
            });
          } catch {
            // Ignore errors if xattr fails (e.g., on non-macOS systems)
          }
        }
      }
    }

    // Also check for and copy .dylib files from lib/ subdirectory (if it exists)
    const possibleLibDir = path.join(possibleExtractedDir, "lib");
    if (await pathExists(possibleLibDir)) {
      const libTargetDir = path.join(CARDANO_ROOT, "lib");
      await ensureDir(libTargetDir);
      const libFiles = await fs.readdir(possibleLibDir);
      for (const file of libFiles) {
        if (file.endsWith(".dylib") || file.endsWith(".so")) {
          const sourcePath = path.join(possibleLibDir, file);
          const targetPath = path.join(libTargetDir, file);
          const stat = await fs.stat(sourcePath);
          if (stat.isFile()) {
            await fs.copyFile(sourcePath, targetPath);
            // Remove macOS quarantine attribute
            try {
              await runCommand("xattr", ["-d", "com.apple.quarantine", targetPath], {
                cwd: CARDANO_ROOT,
              });
            } catch {
              // Ignore errors
            }
          }
        }
      }
    }

    // Also check for .dylib files in the same directory as binaries
    if (sourceBinDir) {
      const files = await fs.readdir(sourceBinDir);
      const dylibFiles = files.filter((f) => f.endsWith(".dylib") || f.endsWith(".so"));
      if (dylibFiles.length > 0) {
        // Copy .dylib files to a lib/ directory in CARDANO_ROOT
        const libTargetDir = path.join(CARDANO_ROOT, "lib");
        await ensureDir(libTargetDir);
        for (const file of dylibFiles) {
          const sourcePath = path.join(sourceBinDir, file);
          const targetPath = path.join(libTargetDir, file);
          const stat = await fs.stat(sourcePath);
          if (stat.isFile()) {
            await fs.copyFile(sourcePath, targetPath);
            // Remove macOS quarantine attribute
            try {
              await runCommand("xattr", ["-d", "com.apple.quarantine", targetPath], {
                cwd: CARDANO_ROOT,
              });
            } catch {
              // Ignore errors
            }
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Archive extracted successfully",
    });
  } catch (error) {
    console.error("Extract error:", error);
    return res.status(500).json({
      error: (error as Error).message,
    });
  }
}
