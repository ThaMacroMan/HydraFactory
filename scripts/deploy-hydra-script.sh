#!/bin/zsh
# Script to deploy a custom Hydra validator script to preprod
# Usage: ./scripts/deploy-hydra-script.sh <script-file.plutus> <wallet-label>

set -e

if [ $# -lt 2 ]; then
  echo "Usage: $0 <script-file.plutus> <wallet-label>"
  echo ""
  echo "Example:"
  echo "  $0 ./my-custom-script.plutus alice"
  echo ""
  echo "This script will:"
  echo "  1. Deploy your compiled Plutus script to preprod"
  echo "  2. Output the transaction ID"
  echo "  3. You can then add this TX ID to HydraFactory"
  exit 1
fi

SCRIPT_FILE="$1"
WALLET_LABEL="$2"

# Get project root
SCRIPT_DIR="${${(%):-%x}:A:h}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CARDANO_DIR="$PROJECT_ROOT/.cardano"
WALLET_DIR="$PROJECT_ROOT/.tmp/wallets/$WALLET_LABEL"

# Check if script file exists
if [ ! -f "$SCRIPT_FILE" ]; then
  echo "❌ Error: Script file not found: $SCRIPT_FILE"
  exit 1
fi

# Check if wallet exists
if [ ! -d "$WALLET_DIR" ]; then
  echo "❌ Error: Wallet not found: $WALLET_LABEL"
  echo "   Wallet directory: $WALLET_DIR"
  echo "   Create a wallet in HydraFactory first"
  exit 1
fi

# Check if Cardano node is running
if [ ! -S "$CARDANO_DIR/node.socket" ]; then
  echo "❌ Error: Cardano node socket not found"
  echo "   Start your Cardano node in HydraFactory first"
  exit 1
fi

echo "📦 Deploying Hydra script to preprod..."
echo "   Script: $SCRIPT_FILE"
echo "   Wallet: $WALLET_LABEL"
echo ""

# Source environment
cd "$CARDANO_DIR" && source "$PROJECT_ROOT/scripts/setup-env.sh" && cd "$PROJECT_ROOT"

# Get wallet address
WALLET_ADDR=$(cat "$WALLET_DIR/payment.addr")
echo "📍 Wallet address: $WALLET_ADDR"

# Get protocol parameters
echo "📋 Fetching protocol parameters..."
cardano-cli query protocol-parameters \
  --testnet-magic 1 \
  --socket-path "$CARDANO_NODE_SOCKET_PATH" \
  --out-file "$PROJECT_ROOT/.tmp/protocol-params.json"

# Get UTXO
echo "💰 Checking wallet UTXOs..."
UTXO_OUTPUT=$(cardano-cli query utxo \
  --testnet-magic 1 \
  --socket-path "$CARDANO_NODE_SOCKET_PATH" \
  --address "$WALLET_ADDR")

if [ -z "$UTXO_OUTPUT" ] || [ "$(echo "$UTXO_OUTPUT" | wc -l)" -le 2 ]; then
  echo "❌ Error: No UTXOs found in wallet"
  echo "   Fund your wallet from a preprod faucet first"
  exit 1
fi

# Get first UTXO (you may want to improve this to select a specific one)
UTXO=$(echo "$UTXO_OUTPUT" | tail -n +3 | head -n 1 | awk '{print $1"#"$2}')
UTXO_AMOUNT=$(echo "$UTXO_OUTPUT" | tail -n +3 | head -n 1 | awk '{print $3}')

echo "   Using UTXO: $UTXO ($UTXO_AMOUNT lovelace)"

# Build transaction
TX_BODY="$PROJECT_ROOT/.tmp/deploy-script.txbody"
TX_SIGNED="$PROJECT_ROOT/.tmp/deploy-script.signed"

echo "🔨 Building transaction..."
cardano-cli transaction build \
  --testnet-magic 1 \
  --socket-path "$CARDANO_NODE_SOCKET_PATH" \
  --tx-in "$UTXO" \
  --tx-out "$WALLET_ADDR+2000000" \
  --tx-out-reference-script-file "$SCRIPT_FILE" \
  --tx-out-datum-hash-value 42 \
  --change-address "$WALLET_ADDR" \
  --protocol-params-file "$PROJECT_ROOT/.tmp/protocol-params.json" \
  --out-file "$TX_BODY" \
  --witness-override 2

# Sign transaction
echo "✍️  Signing transaction..."
cardano-cli transaction sign \
  --testnet-magic 1 \
  --socket-path "$CARDANO_NODE_SOCKET_PATH" \
  --tx-body-file "$TX_BODY" \
  --signing-key-file "$WALLET_DIR/payment.skey" \
  --out-file "$TX_SIGNED"

# Submit transaction
echo "📤 Submitting transaction to preprod..."
SUBMIT_OUTPUT=$(cardano-cli transaction submit \
  --testnet-magic 1 \
  --socket-path "$CARDANO_NODE_SOCKET_PATH" \
  --tx-file "$TX_SIGNED" 2>&1)

if echo "$SUBMIT_OUTPUT" | grep -q "successfully submitted"; then
  # Get TX ID from signed transaction
  TX_ID=$(cardano-cli transaction txid --tx-file "$TX_SIGNED")
  echo ""
  echo "✅ Transaction submitted successfully!"
  echo ""
  echo "📝 Transaction ID: $TX_ID"
  echo ""
  echo "🔗 View on preprod explorer:"
  echo "   https://preprod.cardanoscan.io/transaction/$TX_ID"
  echo ""
  echo "📋 Next steps:"
  echo "   1. Copy the transaction ID above"
  echo "   2. Go to HydraFactory → Custom Hydra Scripts section"
  echo "   3. Click '+ Add Script'"
  echo "   4. Paste the transaction ID (or comma-separated IDs if deploying multiple scripts)"
  echo "   5. Give it a name and save"
  echo ""
else
  echo "❌ Error submitting transaction:"
  echo "$SUBMIT_OUTPUT"
  exit 1
fi

