# Where Are the Hydra Scripts Currently Used?

## Current Scripts Location

The scripts you're currently using are **deployed on-chain** on the Cardano preprod testnet. They're referenced by their **transaction IDs** (TX IDs), not stored locally.

### 1. **On-Chain Location (Where They Live)**

The scripts are deployed as **reference scripts** on the Cardano blockchain:

- **Network**: Preprod testnet
- **Transaction IDs** (currently hardcoded in `scripts/setup-env.sh`):
  ```
  407bf714186db790f2624701b2e065850dd7b7cf998c931222d99a56d8ad256b
  4cae9ad9c1cc4f82ce2fd51f9e1155a37ac88957f81128ba1c51bc7c6734ce6c
  a3a27a3049be1fe931a0d99bf132a88b848b12dc50f50856cb86e12bb135f5d2
  ```

- **View on Explorer**: 
  - https://preprod.cardanoscan.io/transaction/407bf714186db790f2624701b2e065850dd7b7cf998c931222d99a56d8ad256b
  - https://preprod.cardanoscan.io/transaction/4cae9ad9c1cc4f82ce2fd51f9e1155a37ac88957f81128ba1c51bc7c6734ce6c
  - https://preprod.cardanoscan.io/transaction/a3a27a3049be1fe931a0d99bf132a88b848b12dc50f50856cb86e12bb135f5d2

### 2. **Source Code Location (Where They're Written)**

The original source code for these scripts is in the [Hydra GitHub repository](https://github.com/cardano-scaling/hydra):

- **Head Validator**: 
  - https://github.com/cardano-scaling/hydra/blob/main/hydra-plutus/src/Hydra/Plutus/Contracts/Head.hs
  - This is the main validator that controls the Hydra head state machine

- **Stake Validator**: 
  - https://github.com/cardano-scaling/hydra/blob/main/hydra-plutus/src/Hydra/Plutus/Contracts/Stake.hs
  - Manages stake deposits and withdrawals

- **Commit Validator**: 
  - https://github.com/cardano-scaling/hydra/blob/main/hydra-plutus/src/Hydra/Plutus/Contracts/Commit.hs
  - Handles commit transactions

### 3. **How Script IDs Are Managed**

The Hydra team publishes script transaction IDs in their `networks.json` file:

- **Location**: https://raw.githubusercontent.com/cardano-scaling/hydra/master/hydra-node/networks.json
- **Format**: JSON file mapping network names and versions to transaction IDs
- **Example** (from Hydra docs):
  ```bash
  hydra_version=0.22.2
  hydra-node \
    --hydra-scripts-tx-id $(curl https://raw.githubusercontent.com/cardano-scaling/hydra/master/hydra-node/networks.json | jq -r ".preprod.\"${hydra_version}\"")
  ```

### 4. **In Your HydraFactory Project**

Currently, the script TX IDs are hardcoded in:

- **File**: `scripts/setup-env.sh` (lines 46-51)
- **Default TX IDs**: The three transaction IDs listed above (for Hydra 1.1.0 on preprod)
- **Override**: Set `CUSTOM_SCRIPTS_TX_ID` environment variable to use different scripts

### 5. **How hydra-node Uses Them**

When you start a `hydra-node`, it:
1. Reads the `--hydra-scripts-tx-id` parameter
2. Fetches the script from the Cardano blockchain using those transaction IDs
3. Uses those scripts to validate all on-chain transactions for the Hydra head

The scripts are **not downloaded or stored locally** - they're fetched from the blockchain when needed.

## Summary

- **Scripts live**: On-chain (Cardano preprod blockchain)
- **Scripts source**: GitHub (https://github.com/cardano-scaling/hydra)
- **Script IDs stored**: `scripts/setup-env.sh` (hardcoded) or `networks.json` (official source)
- **How to view**: Use the "View Head.hs" / "View Stake.hs" buttons in HydraFactory, or visit GitHub directly
- **How to change**: Deploy new scripts and update the TX IDs in HydraFactory

## Next Steps

If you want to:
- **View the source code**: Use the "View Head.hs" button in HydraFactory or visit GitHub
- **Modify scripts**: Clone the Hydra repo, modify the `.hs` files, compile, and deploy
- **Use different scripts**: Deploy your custom scripts and add their TX IDs in HydraFactory

