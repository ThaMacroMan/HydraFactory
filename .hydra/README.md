# Hydra Node Binaries Directory

This directory contains Hydra node binaries extracted from downloaded archives.

## What Goes Here

When you download and extract a Hydra archive (e.g., `hydra-aarch64-darwin-*.zip`), the extraction process will automatically place the binaries here:

- `hydra-node` - Main Hydra node binary for running Hydra heads
- `hydra-tui` - Hydra terminal user interface (optional)

## Setup

### Option 1: Use the UI

1. Download a Hydra archive to `.cardano/` or `.hydra/`
2. Use the "Extract" button in the Hydrafactory UI
3. The binaries will be automatically extracted to this directory

### Option 2: Manual Extraction

```bash
# Download the archive
cd .hydra
# Download from: https://github.com/cardano-scaling/hydra/releases
# Example: hydra-aarch64-darwin-1.0.0-*.zip

# Extract the archive
unzip hydra-aarch64-darwin-*.zip

# Make binaries executable
chmod +x hydra-node hydra-tui
```

## Directory Structure

```
.hydra/
├── hydra-node          # Main Hydra node binary
├── hydra-tui           # Hydra TUI (optional)
└── README.md           # This file
```

## Usage

The Hydra binaries in this directory are used by the Hydrafactory application to run Hydra nodes. The UI will automatically detect when binaries are present here.

## Links

- **Hydra GitHub**: https://github.com/cardano-scaling/hydra
- **Hydra Releases**: https://github.com/cardano-scaling/hydra/releases
- **Hydra Documentation**: https://hydra.family/head-protocol/docs/

