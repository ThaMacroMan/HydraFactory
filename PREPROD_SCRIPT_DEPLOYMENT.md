# Deploying Custom Hydra Scripts to Preprod

This guide focuses specifically on creating and deploying custom Hydra scripts to **preprod testnet**.

## Quick Overview

1. **Write** your Plutus validator script (Haskell or Aiken)
2. **Compile** it to a `.plutus` file
3. **Deploy** it to preprod using the deployment script
4. **Add** the transaction ID to HydraFactory

## Step 1: Where to Write Your Script

### Option A: Modify Official Hydra Scripts (Recommended for Starters)

1. **Clone the Hydra repository:**

   ```bash
   git clone https://github.com/input-output-hk/hydra.git
   cd hydra
   ```

2. **Find the validator scripts:**

   - Main head validator: `hydra-plutus/src/Hydra/Plutus/Contracts/Head.hs`
   - Stake validator: `hydra-plutus/src/Hydra/Plutus/Contracts/Stake.hs`
   - Commit validator: `hydra-plutus/src/Hydra/Plutus/Contracts/Commit.hs`

3. **Create your custom version:**
   - Copy the file you want to modify
   - Make your changes
   - Keep the same interface/structure (important!)

### Option B: Write from Scratch (Advanced)

If you're creating a completely custom validator, you'll need to:

- Understand Hydra's protocol requirements
- Match the expected redeemer/datum structure
- Potentially modify `hydra-node` to work with your changes

**Recommended**: Start with Option A to understand the structure first.

## Step 2: Compile Your Script

### Using Nix (Official Hydra Method)

```bash
cd hydra
nix develop
cabal build hydra-plutus
```

The compiled scripts will be in the build output. Look for `.plutus` files.

### Using Aiken (Simpler Alternative)

If you're using Aiken:

```bash
aiken build
# Outputs compiled scripts in build/
```

## Step 3: Deploy to Preprod

### Using the Deployment Script (Easiest)

HydraFactory includes a deployment script:

```bash
# Make sure you have:
# 1. A wallet created in HydraFactory
# 2. Cardano node running and synced
# 3. Wallet funded with testnet ADA

./scripts/deploy-hydra-script.sh path/to/your/script.plutus wallet-label
```

**Example:**

```bash
./scripts/deploy-hydra-script.sh ./my-custom-head.plutus alice
```

The script will:

- ✅ Check prerequisites (wallet exists, node running, etc.)
- ✅ Deploy your script to preprod
- ✅ Output the transaction ID
- ✅ Provide next steps

### Manual Deployment (Alternative)

If you prefer manual control:

```bash
# 1. Get protocol parameters
cd .cardano
source ../scripts/setup-env.sh
cd ..

cardano-cli query protocol-parameters \
  --testnet-magic 1 \
  --socket-path .cardano/node.socket \
  --out-file .tmp/protocol-params.json

# 2. Get your wallet's UTXO
cardano-cli query utxo \
  --testnet-magic 1 \
  --socket-path .cardano/node.socket \
  --address $(cat .tmp/wallets/alice/payment.addr)

# 3. Build transaction (replace UTXO_HASH#INDEX with actual values)
cardano-cli transaction build \
  --testnet-magic 1 \
  --socket-path .cardano/node.socket \
  --tx-in <UTXO_HASH>#<INDEX> \
  --tx-out "$(cat .tmp/wallets/alice/payment.addr)+2000000" \
  --tx-out-reference-script-file path/to/your/script.plutus \
  --tx-out-datum-hash-value 42 \
  --change-address $(cat .tmp/wallets/alice/payment.addr) \
  --protocol-params-file .tmp/protocol-params.json \
  --out-file .tmp/deploy-script.tx

# 4. Sign transaction
cardano-cli transaction sign \
  --testnet-magic 1 \
  --socket-path .cardano/node.socket \
  --tx-body-file .tmp/deploy-script.tx \
  --signing-key-file .tmp/wallets/alice/payment.skey \
  --out-file .tmp/deploy-script.signed

# 5. Submit transaction
cardano-cli transaction submit \
  --testnet-magic 1 \
  --socket-path .cardano/node.socket \
  --tx-file .tmp/deploy-script.signed

# 6. Get transaction ID
cardano-cli transaction txid --tx-file .tmp/deploy-script.signed
```

## Step 4: Add to HydraFactory

1. **Copy the transaction ID** from Step 3
2. **Open HydraFactory** in your browser
3. **Go to "3.5. Custom Hydra Scripts"** section
4. **Click "+ Add Script"**
5. **Fill in:**
   - Name: e.g., "My Custom Head Validator"
   - Description: Optional description
   - Transaction IDs: Paste the TX ID (or comma-separated if multiple)
6. **Click "Create Script"**

## Step 5: Use Your Custom Script

1. **Go to "4. Start Hydra nodes"** section
2. **Select your custom script** from the dropdown
3. **Start your nodes** - they'll use your custom script!

## Important Notes for Preprod

- ✅ **Network**: Always use `--testnet-magic 1` for preprod
- ✅ **Faucet**: Get testnet ADA from https://docs.cardano.org/cardano-testnets/tools/faucet
- ✅ **Explorer**: View transactions at https://preprod.cardanoscan.io
- ⚠️ **Multiple Scripts**: Hydra 1.1.0+ requires multiple scripts (head, stake, commit). Deploy each separately and provide comma-separated TX IDs.

## Troubleshooting

### "Script file not found"

- Make sure you've compiled your script first
- Check the file path is correct
- Verify it's a `.plutus` file

### "Wallet not found"

- Create a wallet in HydraFactory first
- Use the exact wallet label (case-sensitive)

### "No UTXOs found"

- Fund your wallet from a preprod faucet
- Wait for the transaction to confirm

### "Transaction failed"

- Check you have enough ADA for fees (usually ~0.2-0.5 ADA)
- Verify your Cardano node is synced
- Check the transaction on the explorer for error details

## Example Workflow

```bash
# 1. Clone and modify Hydra
git clone https://github.com/input-output-hk/hydra.git
cd hydra
# ... make your changes to Head.hs ...

# 2. Compile
nix develop
cabal build hydra-plutus
# Find the compiled .plutus file in dist-newstyle/

# 3. Deploy (from HydraFactory project root)
cd /path/to/hydrafactory
./scripts/deploy-hydra-script.sh ../hydra/dist-newstyle/.../head.plutus alice

# 4. Copy the TX ID and add it to HydraFactory UI
```

## Next Steps

- Test your custom script with a small Hydra head
- Monitor node logs for any validation errors
- Iterate and redeploy as needed

---

**Remember**: Custom scripts must be compatible with `hydra-node`. If you change the validator interface significantly, you may need to modify `hydra-node` source code as well.
