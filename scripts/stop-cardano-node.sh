#!/bin/zsh
# Script to stop Cardano node
# Usage: cd .cardano && ../scripts/stop-cardano-node.sh

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

# Find running Cardano node processes
RUNNING_PIDS=$(pgrep -f "cardano-node.*run" 2>/dev/null | tr '\n' ' ')

if [ -z "$RUNNING_PIDS" ]; then
    echo "ℹ️  No Cardano node process found running"
    
    # Check if socket exists (might be stale)
    if [ -S "node.socket" ]; then
        echo "⚠️  Found stale socket file: node.socket"
        echo -n "Remove it? (y/n) "
        read -k 1 REPLY
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -f node.socket
            echo "✅ Socket file removed"
        fi
    fi
    exit 0
fi

echo "🛑 Stopping Cardano node (PIDs: $RUNNING_PIDS)..."
echo ""

# Try graceful shutdown first (SIGTERM)
kill -TERM $RUNNING_PIDS 2>/dev/null

# Wait a bit for graceful shutdown
sleep 2

# Check if processes are still running
REMAINING_PIDS=$(pgrep -f "cardano-node.*run" 2>/dev/null | tr '\n' ' ')

if [ -n "$REMAINING_PIDS" ]; then
    echo "⚠️  Processes still running, forcing shutdown..."
    kill -KILL $REMAINING_PIDS 2>/dev/null
    sleep 1
fi

# Final check
FINAL_PIDS=$(pgrep -f "cardano-node.*run" 2>/dev/null | tr '\n' ' ')

if [ -z "$FINAL_PIDS" ]; then
    echo "✅ Cardano node stopped successfully"
    
    # Remove socket file if it exists
    if [ -S "node.socket" ]; then
        rm -f node.socket
        echo "✅ Socket file removed"
    fi
else
    echo "❌ Warning: Some processes may still be running (PIDs: $FINAL_PIDS)"
    echo "   You may need to kill them manually: kill -9 $FINAL_PIDS"
    exit 1
fi

