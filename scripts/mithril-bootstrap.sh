#!/bin/zsh
# Script to bootstrap Cardano node using Mithril fast sync
# Usage: cd .cardano && ../scripts/mithril-bootstrap.sh

# Get the directory where this script is located
SCRIPT_DIR="${${(%):-%x}:A:h}"
# Get project root (parent of scripts directory)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CARDANO_DIR="$PROJECT_ROOT/.cardano"

# Change to .cardano directory
cd "$CARDANO_DIR" || {
    echo "❌ Error: Could not change to .cardano directory: $CARDANO_DIR"
    exit 1
}

# Check if mithril-client exists, if not, try to install it automatically
if [ ! -f "./bin/mithril-client" ]; then
    echo "📥 mithril-client not found. Attempting to download automatically..."
    echo ""
    
    # Ensure bin directory exists
    mkdir -p bin
    
    # Use Mithril's official installer script
    echo "Downloading mithril-client using official installer..."
    curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/input-output-hk/mithril/refs/heads/main/mithril-install.sh | sh -s -- -c mithril-client -d unstable -p ./bin
    
    if [ $? -eq 0 ] && [ -f "./bin/mithril-client" ]; then
        echo "✅ mithril-client installed successfully!"
        echo ""
    else
        echo "❌ Automatic installation failed"
        echo ""
        echo "Please download mithril-client manually from:"
        echo "  https://github.com/input-output-hk/mithril/releases"
        echo ""
        echo "Or run this command:"
        echo "  curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/input-output-hk/mithril/refs/heads/main/mithril-install.sh | sh -s -- -c mithril-client -d unstable -p ./bin"
        echo ""
        exit 1
    fi
fi

# Mithril configuration for preprod
export GENESIS_VERIFICATION_KEY=$(curl -s https://raw.githubusercontent.com/input-output-hk/mithril/main/mithril-infra/configuration/release-preprod/genesis.vkey)
export ANCILLARY_VERIFICATION_KEY=$(curl -s https://raw.githubusercontent.com/input-output-hk/mithril/main/mithril-infra/configuration/release-preprod/ancillary.vkey)
export AGGREGATOR_ENDPOINT=https://aggregator.release-preprod.api.mithril.network/aggregator

echo "🚀 Bootstrapping Cardano node with Mithril (fast sync)..."
echo "   This will download a certified snapshot instead of syncing from genesis"
echo "   Aggregator: $AGGREGATOR_ENDPOINT"
echo ""

# Check if db directory exists and has data
if [ -d "db" ] && [ "$(ls -A db 2>/dev/null)" ]; then
    echo "⚠️  Warning: Database directory 'db' already exists and contains data"
    echo -n "   This will replace the existing database. Continue? (y/n) "
    read -k 1 REPLY
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    echo ""
    echo "🗑️  Removing existing database..."
    rm -rf db
    echo ""
fi

# Create db directory
mkdir -p db

echo "📥 Downloading Mithril snapshot..."
echo "   This may take a few minutes depending on your connection speed"
echo ""

# Run mithril-client to download snapshot (using new cardano-db command)
# Note: The aggregator endpoint determines the network (preprod in this case)
./bin/mithril-client cardano-db download latest \
  --download-dir ./db \
  --genesis-verification-key "$GENESIS_VERIFICATION_KEY" \
  --aggregator-endpoint "$AGGREGATOR_ENDPOINT"

if [ $? -eq 0 ]; then
    echo ""
    echo "📦 Mithril extracted database to ./db/db/"
    echo "   Moving files to ./db/ for Cardano node..."
    
    # Mithril extracts to db/db/, but Cardano node expects db/
    # Move contents from db/db/ to db/
    if [ -d "db/db" ] && [ "$(ls -A db/db 2>/dev/null)" ]; then
        # Move all contents from db/db/ to db/
        mv db/db/* db/ 2>/dev/null || true
        # Remove the now-empty db/db directory
        rmdir db/db 2>/dev/null || true
        echo "   ✓ Database files moved to correct location"
    fi
    
    echo ""
    echo "✅ Mithril bootstrap completed successfully!"
    echo ""
    echo "💡 The node database has been bootstrapped with a certified snapshot."
    echo "   You can now start the Cardano node and it will sync much faster."
    echo ""
    echo "   Start the node with: ../scripts/start-cardano-node.sh"
else
    echo ""
    echo "❌ Mithril bootstrap failed"
    echo "   You can still start the node normally - it will sync from genesis (slower)"
    exit 1
fi

