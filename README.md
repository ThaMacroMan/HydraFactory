# HydraFactory

A local playground for Cardano Hydra setup and testing. Automate setup, manage wallets, and control Hydra heads through a simple web interface.

## Quick Start

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` and follow the on-screen steps.

---

## What You Can Do

### 1. Cardano Node Setup

- **Download & install** Cardano binaries and configs with one click
- **Start/stop** your Cardano node automatically
- **Track progress** with live sync status and file checklists

### 2. Wallet Factory

- **Create wallets** instantly with one click
- **Fund wallets** via testnet faucets (links provided)
- **Split UTXOs** automatically for better transaction handling
- **Send ADA** between wallets directly from the UI

### 3. Hydra Nodes

- **Start/stop** all Hydra nodes with a single button
- **Monitor status** in real-time (online/offline, ports, connections)
- **Clear history** to reset node state when needed

### 4. Launch Hydra Head

- **Initialize** a new Hydra head with selected wallets
- **Commit UTXOs** to the head with visual selection
- **Send transactions** between parties inside the head
- **Close & fanout** to return funds to the main chain
- **Monitor everything** with real-time status, transaction logs, and charts

---

## Setup Steps

1. **Install dependencies**: `npm install`
2. **Download Cardano files**: Use the download buttons in the UI
3. **Start Cardano node**: Click "Start Cardano Node" button
4. **Create wallets**: Use Wallet Factory to generate test wallets
5. **Fund wallets**: Use testnet faucets (links in UI)
6. **Start Hydra nodes**: Click "Start All Nodes"
7. **Launch head**: Select wallets and click "Initialize"

All instructions, links, and commands are built into the interface—no external docs needed.

---

## Important Notes

- **Data storage**: All binaries and data are stored in `.cardano/`, `.hydra/`, and `.tmp/` (gitignored)
- **Wallet keys**: Stored in `.tmp/wallets/<id>/` — delete when done testing
- **Ports**: Hydra nodes use ports 4001, 4002, etc. (configurable)
- **Environment**: Run `setup-env.sh` if CLI commands fail

## Current Issues

**Committing UTXOs** is still a work in progress. If you encounter errors when committing a specific UTXO, try committing a different UTXO instead. This usually resolves the issue.

---

## Troubleshooting

- **CLI fails** → Check that binaries exist in `.cardano/bin/` and you've run `setup-env.sh`
- **Hydra timeouts** → Verify nodes are online via the status cards
- **Node won't start** → Check if ports 4001, 4002 are already in use
- **Socket not found** → Ensure Cardano node is running
- **Commit errors** → Try committing a different UTXO (see Current Issues above)

---

## License

[Add your license here]
