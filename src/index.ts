import dotenv from 'dotenv';
import { initDatabase } from './config/db';
import { SolanaListener } from './indexer/listener';

dotenv.config();

// Example: Raydium Liquidity Pool V4 Program
const TARGET_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

async function main() {
  try {
    await initDatabase();

    const listener = new SolanaListener(
      process.env.SOLANA_RPC_URL!,
      process.env.SOLANA_WS_URL!
    );

    await listener.startListening(TARGET_PROGRAM_ID);
  } catch (error) {
    console.error('❌ Indexer initialization failed:', error);
  }
}

main();