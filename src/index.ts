import dotenv from 'dotenv';
import { initDatabase } from './config/db';
import { TokenEvaluator } from './indexer/evaluator';

dotenv.config();

async function main() {
  try {
    await initDatabase();

    const evaluator = new TokenEvaluator(process.env.SOLANA_RPC_URL!);

    // Example Test: Evaluate official USDC Mint
    const testMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; 
    console.log(`🔍 Evaluating token security flags for: ${testMint}...`);

    const profile = await evaluator.evaluateToken(testMint);
    console.log('📊 Security Profile Result:', profile);

    await evaluator.saveTokenProfile(profile, 'test_signature_initialization');
  } catch (error) {
    console.error('❌ Failed to run token evaluator:', error);
  }
}

main();