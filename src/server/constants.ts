import path from "path";

export const PROJECT_ROOT = process.cwd();
export const CARDANO_ROOT = path.join(PROJECT_ROOT, ".cardano");
export const HYDRA_ROOT = path.join(PROJECT_ROOT, ".hydra");
export const TMP_ROOT = path.join(PROJECT_ROOT, ".tmp");

export const DEFAULT_HYDRA_HTTP =
  process.env.HYDRA_HTTP_URL ?? "http://127.0.0.1:4001";
export const DEFAULT_HYDRA_WS =
  process.env.HYDRA_WS_URL ?? "ws://127.0.0.1:4001";

export const HYDRA_NODE_PORTS: Record<string, number> = {
  alice: 4001,
  bob: 4002,
};

/**
 * Get the API port for a wallet based on its label
 * Ports are assigned sequentially: 4001, 4002, 4003, etc.
 * For known wallets (alice, bob), use hardcoded ports.
 * For others, calculate based on alphabetical order of all wallets.
 */
export async function getWalletApiPort(party: string): Promise<number | null> {
  // Use hardcoded ports for alice and bob
  if (party === "alice") return 4001;
  if (party === "bob") return 4002;

  // For other wallets, find their position in all wallets
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const walletsDir = path.join(process.cwd(), ".tmp", "wallets");

    // Check if wallets directory exists
    try {
      await fs.access(walletsDir);
    } catch {
      return null;
    }

    // Get all wallet directories
    const entries = await fs.readdir(walletsDir, { withFileTypes: true });
    const walletDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(); // Sort alphabetically for consistent ordering

    // Find the index of this wallet
    const index = walletDirs.indexOf(party);
    if (index === -1) {
      return null; // Wallet not found
    }

    // Calculate port: 4001 + index
    return 4001 + index;
  } catch (error) {
    console.error(`[getWalletApiPort] Error getting port for ${party}:`, error);
    return null;
  }
}
