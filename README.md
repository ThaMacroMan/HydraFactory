# Hydrafactory

A local-first playground for Cardano Hydra development. Generate wallets with `cardano-cli`, fund them via the faucet, and control Hydra heads directly from a clean Next.js UI.

## Features

- **Guided Cardano Node Setup** – All information, links, and automated tools needed to set up a Cardano node with live tracking
- **Wallet Factory** – One-click wallet generation, automated funding, and UTXO splitting
- **Hydra Node Automation** – Start, stop, and manage Hydra nodes with a single click
- **Hydra Head Control** – Initialize, commit, close, fanout, and send transactions through an intuitive UI

## Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```
2. Download required Cardano/Hydra binaries and configuration files (see **Cardano Node Setup** section below)

## Running locally

```bash
npm run dev
```

Visit `http://localhost:3000` and follow the on-screen steps.

---

## Cardano Node Setup

The **Cardano Node Setup** section provides everything you need to get a Cardano node running:

### Automated File Tracking
- **Live download status** – The UI tracks which required files are downloaded and which are missing
- **Real-time checklist** – See at a glance what's installed:
  - Cardano node binary
  - Cardano CLI binary
  - Mithril client (for fast sync)
  - Configuration files (mainnet, preprod, preview)
  - Genesis files
  - Protocol parameters

### One-Click Downloads
- **Download buttons** for each required component
- **Automatic verification** of downloaded files
- **Direct links** to official Cardano documentation and download sources

### Automated Node Control
- **Start Cardano Node** button – Automatically:
  - Sets up the environment
  - Configures library paths
  - Starts the node in the background
  - Monitors sync status
- **Stop Cardano Node** button – Cleanly shuts down the node process
- **Live status monitoring** – See real-time sync progress and node health

### Setup Instructions
The UI provides step-by-step instructions:
1. Download required binaries and configs
2. Run `setup-env.sh` to configure your environment
3. Start the node with a single click
4. Monitor sync status in real-time

All setup information, links, and commands are embedded directly in the interface—no need to search external documentation.

---

## Wallet Factory

The **Wallet Factory** simplifies wallet creation and management:

### One-Click Wallet Generation
- **Generate wallets instantly** – Creates payment keys, signing keys, and addresses with a single click
- **Automatic key management** – All keys are stored securely in `.tmp/wallets/<wallet-id>/`
- **Multiple wallet support** – Create as many test wallets as you need

### Automated Funding
- **Direct faucet integration** – Links to Cardano testnet faucets
- **Copy-to-clipboard addresses** – One-click copy wallet addresses for faucet requests
- **Funding status tracking** – Monitor when wallets receive funds

### UTXO Management
- **Automatic UTXO splitting** – Split large UTXOs into smaller ones with a single click
- **UTXO visualization** – See all UTXOs for each wallet at a glance
- **Balance tracking** – Real-time balance updates for all wallets

### Features
- **Send ADA** – Transfer funds between wallets directly from the UI
- **Wallet list** – View all created wallets with their addresses and balances
- **Refresh balances** – Update wallet states on demand

---

## Hydra Nodes

The **Hydra Nodes** section automates the process of setting up and managing Hydra nodes:

### Single-Click Node Management
- **Start All Nodes** button – Automatically:
  - Starts all configured Hydra nodes (Alice, Bob, etc.)
  - Configures each node with the correct ports and keys
  - Sets up persistence directories
  - Launches nodes in the background
- **Stop All Nodes** button – Cleanly shuts down all running Hydra nodes
- **Individual node control** – Start or stop individual nodes as needed

### Node Status Monitoring
- **Real-time status** – See which nodes are online/offline
- **Port monitoring** – Verify nodes are listening on correct ports (4001, 4002, etc.)
- **Connection status** – WebSocket connection indicators for each node

### History Management
- **Clear History** button – Reset node state and transaction history
- **Persistence management** – Nodes maintain state across restarts
- **State visualization** – View current node state and configuration

### Automated Configuration
- **Automatic key assignment** – Nodes automatically use the correct signing keys
- **Port management** – Ports are assigned automatically (Alice: 4001, Bob: 4002, etc.)
- **Protocol parameters** – Automatically loaded from `.hydra/protocol-parameters.json`

---

## Launch Hydra Head

The **Launch Hydra Head** section provides full control over Hydra head lifecycle:

### Initialize Head
- **One-click initialization** – Initialize a new Hydra head with selected wallets
- **Automatic party setup** – Configure all parties (Alice, Bob, etc.) automatically
- **Status tracking** – Monitor initialization progress in real-time

### Commit UTXOs
- **Visual UTXO selection** – See all available UTXOs from each wallet
- **Selective commits** – Choose which UTXOs to commit to the head
- **Automatic transaction building** – Transactions are built and signed automatically
- **Commit status** – Track commit progress and confirmations

### Transaction Sending
- **Send within head** – Transfer ADA between parties inside the Hydra head
- **UTXO selection** – Choose specific UTXOs to send
- **Half/full amount options** – Send half or full UTXO amounts
- **Real-time updates** – See transactions appear immediately in the head

### Close Head
- **Initiate close** – Start the process of closing the head
- **Snapshot confirmation** – Monitor snapshot confirmation on the main chain
- **Automatic state tracking** – UI tracks close progress automatically

### Fanout
- **Finalize head** – Fanout committed UTXOs back to the main chain
- **Transaction tracking** – Monitor fanout transactions on the main chain
- **UTXO recovery** – See UTXOs return to wallet addresses

### Real-Time Monitoring
- **Head status** – Live status of the head (Idle, Initializing, Open, Closed, etc.)
- **Transaction log** – Complete history of all head transactions
- **UTXO tracking** – See all UTXOs currently in the head
- **Party status cards** – Individual status for each party in the head

### Advanced Features
- **WebSocket connections** – Real-time updates via WebSocket
- **Transaction chart** – Visual representation of head transactions
- **Error handling** – Clear error messages and recovery suggestions
- **State persistence** – Head state persists across page refreshes

---

## Directory Structure

- `docs/` – Markdown guides rendered at `/docs/*`
- `src/pages/api/` – Wallet, node, and Hydra action endpoints
- `src/server/` – Node-side helpers for running scripts and interacting with Hydra
- `src/components/steps/` – UI components for each setup step
- `.cardano/` – Cardano binaries and configuration files (gitignored)
- `.hydra/` – Hydra node data and persistence (gitignored)
- `.tmp/` – Temporary files including wallet keys (gitignored)

## Safety Notes

- All Cardano/Hydra binaries and data are stored in `.cardano/` directory inside this project
- Wallet key files are stored under `.tmp/wallets/<id>`. Delete them when done testing
- Hydra commands assume the nodes expose ports `4001/4002` on localhost (configurable)
- The `.cardano/`, `.hydra/`, and `.tmp/` directories are gitignored and won't be committed
- All paths use `process.cwd()` and are portable across different systems

## Environment Variables

Optional environment variables for customization:

- `CARDANO_NODE_SOCKET_PATH` – Custom path to Cardano node socket
- `HYDRA_HTTP_URL` – Custom Hydra HTTP endpoint (default: `http://127.0.0.1:4001`)
- `HYDRA_WS_URL` – Custom Hydra WebSocket endpoint (default: `ws://127.0.0.1:4001`)

## Troubleshooting

- **CLI command fails** → Verify you sourced `setup-env.sh` and the binaries exist in `.cardano/bin/`
- **Hydra actions time out** → Confirm Alice/Bob processes are online via the node status cards
- **Faucet errors** → Wait 60 minutes between requests or use another GitHub account
- **Node won't start** → Check that ports 4001, 4002, etc. are not already in use
- **Socket not found** → Ensure Cardano node is running and socket exists at `.cardano/node.socket`

## Contributing

This project is open source. All paths are relative and portable. The codebase uses:
- `process.cwd()` for all path resolution
- Environment variables for customization
- Relative paths in all scripts

## License

[Add your license here]
# HydraFactory
