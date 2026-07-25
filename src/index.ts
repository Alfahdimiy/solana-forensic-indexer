import dotenv from 'dotenv';
import { initDatabase } from './config/db';
import { SolanaListener } from './indexer/listener';
import { startApiServer } from './api/server';

dotenv.config();

// Raydium AMM V4 Program ID
const TARGET_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

async function main() {
  try {
    // 1. Initialize database schema & migrations
    await initDatabase();

    // 2. Start REST API Server
    startApiServer();

    // 3. Boot up real-time listener pipeline
    const listener = new SolanaListener(
      process.env.SOLANA_RPC_URL!,
      process.env.SOLANA_WS_URL!
    );

    await listener.startListening(TARGET_PROGRAM_ID);
  } catch (error) {
    console.error('❌ Application launch failed:', error);
  }
}

main();