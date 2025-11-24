#!/bin/zsh
# Environment variables for Hydra Head tutorial
# Source this file before running hydra-node commands
# Usage: cd .cardano && source ../scripts/setup-env.sh

# Prevent re-sourcing if already sourced
if [ -n "${HYDRA_ENV_SET:-}" ]; then
    return 0
fi

# Get the directory where this script is located
SCRIPT_DIR="${${(%):-%x}:A:h}"
# Get project root (parent of scripts directory)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CARDANO_DIR="$PROJECT_ROOT/.cardano"
HYDRA_DIR="$PROJECT_ROOT/.hydra"

# Ensure we're in the .cardano directory
if [ "$(basename $(pwd))" != ".cardano" ]; then
    echo "⚠️  Warning: This script should be sourced from the .cardano directory"
    echo "   Current directory: $(pwd)"
    echo "   Expected: $CARDANO_DIR"
    echo "   Run: cd .cardano && source ../scripts/setup-env.sh"
fi

# Add binaries to PATH
export PATH="$CARDANO_DIR/bin:$HYDRA_DIR:$PATH"
export DYLD_FALLBACK_LIBRARY_PATH="$CARDANO_DIR/bin:/opt/homebrew/lib"
export DYLD_LIBRARY_PATH="/opt/homebrew/lib:$DYLD_LIBRARY_PATH"

# Mithril variables (for mithril-client - already used, but kept for completeness)
export GENESIS_VERIFICATION_KEY=$(curl -s https://raw.githubusercontent.com/input-output-hk/mithril/main/mithril-infra/configuration/release-preprod/genesis.vkey)
export ANCILLARY_VERIFICATION_KEY=$(curl -s https://raw.githubusercontent.com/input-output-hk/mithril/main/mithril-infra/configuration/release-preprod/ancillary.vkey)
export AGGREGATOR_ENDPOINT=https://aggregator.release-preprod.api.mithril.network/aggregator

# Cardano node socket path (relative to .cardano directory)
export CARDANO_NODE_SOCKET_PATH="$CARDANO_DIR/node.socket"
export CARDANO_NODE_NETWORK_ID=1

# Hydra scripts TX ID for preprod (required by hydra-node)
# This is the transaction ID where Hydra's initial smart contract scripts are deployed                                                                          
# For Hydra 1.1.0 on preprod - three comma-separated transaction IDs
# Default: Official Hydra scripts for preprod
# Override: Set CUSTOM_SCRIPTS_TX_ID environment variable to use custom scripts
# Format: Comma-separated transaction IDs (e.g., "tx1,tx2,tx3")
if [ -z "${CUSTOM_SCRIPTS_TX_ID:-}" ]; then
  export SCRIPTS_TX_ID="407bf714186db790f2624701b2e065850dd7b7cf998c931222d99a56d8ad256b,4cae9ad9c1cc4f82ce2fd51f9e1155a37ac88957f81128ba1c51bc7c6734ce6c,a3a27a3049be1fe931a0d99bf132a88b848b12dc50f50856cb86e12bb135f5d2"
else
  export SCRIPTS_TX_ID="$CUSTOM_SCRIPTS_TX_ID"
  echo "  Using custom scripts TX ID: $SCRIPTS_TX_ID"
fi

# Mark as sourced
export HYDRA_ENV_SET=1

echo "✓ Environment variables configured for Hydra Head tutorial"
echo "  CARDANO_NODE_SOCKET_PATH: $CARDANO_NODE_SOCKET_PATH"
echo "  SCRIPTS_TX_ID: $SCRIPTS_TX_ID"
