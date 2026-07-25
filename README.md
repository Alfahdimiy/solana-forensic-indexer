A real-time on-chain forensic indexer built with TypeScript, @solana/web3.js, and MySQL.

## Features
- **WebSocket Streaming:** Monitors target program accounts and instruction logs on Solana mainnet in real time.
- **Risk Detection:** Identifies authority changes, freeze triggers, and mint operations.
- **Database Logging:** Auto-stores flagged transaction signatures and risk payloads into MySQL.

## Setup & Execution
1. Configure \`.env\` with your database and RPC credentials.
2. Ensure MySQL is running locally.
3. Run \npm run dev\ or \npx tsx src/index.ts