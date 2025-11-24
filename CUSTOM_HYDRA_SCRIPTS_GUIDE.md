# Custom Hydra Scripts Guide

This guide explains how to create, deploy, and use custom Hydra validator scripts with HydraFactory.

## Understanding Hydra Scripts

Hydra scripts are **Plutus validator scripts** that define the rules for how a Hydra head operates on-chain. The `--hydra-scripts-tx-id` parameter tells `hydra-node` which transaction contains the deployed scripts.

By default, HydraFactory uses the official Hydra scripts deployed on preprod. However, you can create and deploy your own custom scripts to:

- Modify head behavior (e.g., different closing conditions)
- Add custom validation logic
- Experiment with new features
- Test protocol changes

## Prerequisites

1. **Cardano Node** running and synced
2. **Cardano CLI** installed (included in HydraFactory)
3. **Plutus development environment** (Haskell or Aiken)
4. **Funded wallet** for deploying scripts (requires ADA for transaction fees)

## Step 1: Write Your Custom Validator Script

Hydra scripts are Plutus validators. You can write them in:

### Option A: Haskell (Official Hydra Method)

The official Hydra scripts are written in Haskell. You'll need to:

1. Clone the Hydra repository:

```bash
git clone https://github.com/input-output-hk/hydra.git
cd hydra
```

2. Study the existing validator scripts in `hydra-plutus/`:

   - `hydra-plutus/src/Hydra/Plutus/Contracts/Head.hs` - Main head validator
   - `hydra-plutus/src/Hydra/Plutus/Contracts/Stake.hs` - Stake validator

3. Modify or create your custom validator following the same structure.

### Option B: Aiken (Simpler Alternative)

Aiken is a modern Plutus language that's easier to learn:

```aiken
validator {
  fn validate(redeemer, context) {
    // Your custom validation logic here
    // Must follow Hydra's expected interface
    True
  }
}
```

**Important**: Your custom script must implement the same interface as the standard Hydra scripts, or you'll need to modify `hydra-node` to work with your changes.

## Step 2: Compile Your Script

### For Haskell/Plutus:

```bash
# In the hydra repository
nix develop
cabal build hydra-plutus
# This generates the compiled script files
```

### For Aiken:

```bash
aiken build
# Generates compiled scripts in build/
```

## Step 3: Deploy Your Script to Cardano

You need to create a transaction that includes your compiled Plutus script as a reference script.

### Using Cardano CLI:

```bash
# 1. Get your script file (compiled Plutus script in CBOR format)
SCRIPT_FILE="path/to/your/script.plutus"

# 2. Get protocol parameters
cardano-cli query protocol-parameters \
  --testnet-magic 1 \
  --socket-path .cardano/node.socket \
  --out-file protocol-params.json

# 3. Get your wallet's UTXO
cardano-cli query utxo \
  --testnet-magic 1 \
  --socket-path .cardano/node.socket \
  --address $(cat .tmp/wallets/your-wallet/payment.addr)

# 4. Build the transaction (example - adjust UTXO and amounts)
cardano-cli transaction build \
  --testnet-magic 1 \
  --socket-path .cardano/node.socket \
  --tx-in <UTXO_HASH>#<INDEX> \
  --tx-out "$(cat .tmp/wallets/your-wallet/payment.addr)+2000000" \
  --tx-out-reference-script-file $SCRIPT_FILE \
  --tx-out-datum-hash-value 42 \
  --change-address $(cat .tmp/wallets/your-wallet/payment.addr) \
  --protocol-params-file protocol-params.json \
  --out-file deploy-script.tx

# 5. Sign the transaction
cardano-cli transaction sign \
  --testnet-magic 1 \
  --socket-path .cardano/node.socket \
  --tx-body-file deploy-script.tx \
  --signing-key-file .tmp/wallets/your-wallet/payment.skey \
  --out-file deploy-script.signed

# 6. Submit the transaction
cardano-cli transaction submit \
  --testnet-magic 1 \
  --socket-path .cardano/node.socket \
  --tx-file deploy-script.signed

# 7. Get the transaction ID
cardano-cli transaction txid --tx-file deploy-script.signed
```

**Note**: For Hydra 1.1.0+, you may need to deploy multiple scripts (head validator, stake validator, etc.). Each will have its own transaction ID, and you'll need to provide them as comma-separated values.

## Step 4: Configure HydraFactory to Use Your Custom Script

Once you have your transaction ID(s), you have two options:

### Option A: Environment Variable (Recommended)

Set the `CUSTOM_SCRIPTS_TX_ID` environment variable before starting HydraFactory:

```bash
export CUSTOM_SCRIPTS_TX_ID="your-tx-id-1,your-tx-id-2,your-tx-id-3"
npm run dev
```

### Option B: Update setup-env.sh

Edit `scripts/setup-env.sh` and replace the `SCRIPTS_TX_ID` value:

```bash
export SCRIPTS_TX_ID="your-tx-id-1,your-tx-id-2,your-tx-id-3"
```

### Option C: Use the UI Configuration

If a configuration UI is added, you can set it there (future feature).

## Step 5: Verify Your Custom Script

1. Start your Hydra nodes with the custom script TX ID
2. Initialize a Hydra head
3. Test that your custom validation logic works as expected
4. Check the node logs for any script-related errors

## Important Considerations

### Script Compatibility

⚠️ **Warning**: Custom scripts must be compatible with `hydra-node`. If you change the validator interface significantly, you may need to:

- Modify `hydra-node` source code to work with your scripts
- Rebuild `hydra-node` from source
- Ensure all parties use the same custom scripts

### Multiple Scripts

Hydra 1.1.0+ uses multiple scripts:

- **Head validator**: Main head state machine
- **Stake validator**: Stake management
- **Commit validator**: Commit handling

You may need to deploy all of them and provide all transaction IDs.

### Network Compatibility

- **Preprod**: Use `--testnet-magic 1`
- **Mainnet**: Use `--mainnet` (and mainnet transaction IDs)

Make sure your scripts are deployed on the same network your nodes are running on.

## Troubleshooting

### "Script not found" errors

- Verify the transaction ID is correct
- Ensure the transaction is confirmed on-chain
- Check that you're using the correct network (preprod vs mainnet)

### "Script validation failed" errors

- Your custom script logic may be rejecting transactions
- Check your validator's validation conditions
- Review the transaction that's failing

### "Incompatible script" errors

- Your script interface may not match what `hydra-node` expects
- Consider using the official Hydra scripts as a reference
- You may need to modify `hydra-node` to work with your custom scripts

## Example: Minimal Custom Script

Here's a minimal example of what a custom Hydra script might look like (conceptual):

```haskell
-- This is a simplified example - actual Hydra scripts are more complex
validator :: ScriptContext -> Bool
validator ctx =
  -- Your custom validation logic
  -- Must check that the transaction follows Hydra protocol rules
  True
```

## Resources

- [Hydra Repository](https://github.com/input-output-hk/hydra)
- [Plutus Documentation](https://plutus.readthedocs.io/)
- [Aiken Documentation](https://aiken-lang.org/)
- [Cardano CLI Documentation](https://docs.cardano.org/cardano-core/cardano-cli)

## Next Steps

1. Study the official Hydra scripts to understand the protocol
2. Start with small modifications to existing scripts
3. Test thoroughly on preprod before considering mainnet
4. Consider contributing improvements back to the Hydra project

---

**Note**: Creating custom Hydra scripts is an advanced topic. Make sure you understand Plutus, the Hydra protocol, and Cardano transaction structure before attempting this.
