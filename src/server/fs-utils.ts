import { promises as fs } from "fs";

export async function ensureDir(path: string) {
  await fs.mkdir(path, { recursive: true });
}

export async function pathExists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
