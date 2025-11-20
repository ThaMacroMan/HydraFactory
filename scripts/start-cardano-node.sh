#!/bin/zsh
# Script to start Cardano node for preprod testnet
# Usage: cd .cardano && ../scripts/start-cardano-node.sh

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

# Check if node is already running
RUNNING_PIDS=$(pgrep -f "cardano-node.*run" 2>/dev/null | tr '\n' ' ')
if [ -n "$RUNNING_PIDS" ]; then
    echo "⚠️  Cardano node process(es) found: $RUNNING_PIDS"
    echo ""
    echo "If these are stuck processes, run: ../scripts/cleanup-stuck-nodes.sh"
    echo ""
    echo -n "Continue anyway? (y/n) "
    read -k 1 REPLY
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    echo ""
fi

# Remove old socket if it exists
if [ -S "node.socket" ]; then
    echo "⚠️  Removing old socket file: node.socket"
    rm -f node.socket
    echo ""
fi

# Create db directory if it doesn't exist
mkdir -p db

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if cardano-node binary exists
if [ ! -f "./bin/cardano-node" ]; then
    echo "❌ Error: cardano-node binary not found in ./bin/cardano-node"
    echo ""
    echo "Please ensure you have:"
    echo "  1. Downloaded the Cardano node archive"
    echo "  2. Extracted it to .cardano/bin/"
    echo ""
    echo "You can use the 'Download All Configs' button in the Hydrafactory UI"
    echo "or manually extract the archive to .cardano/bin/"
    exit 1
fi

# Check if config.json exists
if [ ! -f "config.json" ]; then
    echo "❌ Error: config.json not found"
    echo ""
    echo "Please download config.json to .cardano/"
    echo "You can use the 'Download All Configs' button in the Hydrafactory UI"
    exit 1
fi

# Check if database is empty or doesn't exist, and if mithril-client is available
if [ ! -d "db" ] || [ -z "$(ls -A db 2>/dev/null)" ]; then
    if [ -f "./bin/mithril-client" ]; then
        echo "💡 Database is empty. Mithril fast sync is available!"
        echo ""
        echo "Would you like to bootstrap with Mithril for fast sync? (recommended)"
        echo "   This will download a certified snapshot instead of syncing from genesis"
        echo "   Sync time: minutes instead of hours"
        echo ""
        echo -n "Bootstrap with Mithril? (Y/n) "
        read -k 1 REPLY
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            echo ""
            echo "🚀 Running Mithril bootstrap..."
            ../scripts/mithril-bootstrap.sh
            if [ $? -ne 0 ]; then
                echo ""
                echo "⚠️  Mithril bootstrap failed. Starting node with traditional sync..."
                echo ""
            fi
        else
            echo ""
            echo "Starting node with traditional sync (this will take longer)..."
            echo ""
        fi
    else
        echo "💡 Database is empty. For faster sync, install mithril-client and run:"
        echo "   ../scripts/mithril-bootstrap.sh"
        echo ""
        echo "Starting node with traditional sync (this will take longer)..."
        echo ""
    fi
fi

echo "🚀 Starting Cardano node (preprod testnet)..."
echo "   Config: config.json"
echo "   Topology: topology.json"
echo "   Socket: node.socket"
echo "   Database: db/"
echo ""

# Remove all extended attributes from binaries and libraries (macOS security)
# This prevents "untrusted" errors when running downloaded binaries
if [ -d "./bin" ]; then
  find ./bin -type f -exec xattr -c {} \; 2>/dev/null || true
fi

# Set library path for macOS (in case libraries are in bin/)
export DYLD_LIBRARY_PATH="./bin:${DYLD_LIBRARY_PATH:-}"

# Start cardano-node in background
nohup ./bin/cardano-node run \
  --config config.json \
  --topology topology.json \
  --socket-path ./node.socket \
  --database-path db \
  > logs/cardano-node.log 2>&1 &

NODE_PID=$!
echo "✅ Cardano node started (PID: $NODE_PID)"
echo ""
echo "💡 The node needs to sync with the network before Hydra nodes can connect."
echo "   You can check sync status with: cardano-cli query tip --testnet-magic 1"
echo ""
echo "🛑 To stop: ../scripts/stop-cardano-node.sh (or: pkill -f 'cardano-node.*run')"
echo ""
echo "📝 Tailing logs (Ctrl+C to exit)..."
echo ""
tail -f logs/cardano-node.log

