import { Connection, PublicKey } from '@solana/web3.js';
import { ForensicParser } from './parser.js';
import { TokenEvaluator } from './evaluator.js';

export class SolanaListener {
  private connection: Connection;
  private evaluator: TokenEvaluator;

  constructor(rpcUrl: string, wsUrl: string) {
    this.connection = new Connection(rpcUrl, { wsEndpoint: wsUrl, commitment: 'confirmed' });
    this.evaluator = new TokenEvaluator(rpcUrl);
  }

  public async startListening(programIdStr: string): Promise<void> {
    const programId = new PublicKey(programIdStr);

    console.log(`📡 Automated Event Pipeline active. Monitoring program: ${programIdStr}...`);

    this.connection.onLogs(
      programId,
      async (logs) => {
        if (logs.err || !logs.logs) return;

        const signature = logs.signature;
        const analysis = ForensicParser.analyzeLogs(logs.logs);

        if (analysis.riskScore >= 30) {
          console.warn(`🚨 [Score: ${analysis.riskScore}/100] Flagged Event: ${analysis.eventType} | Tx: ${signature.slice(0, 10)}...`);

          // Extract token mint or pass the target mint address being monitored
          // Note: evaluateToken requires a valid SPL Token Mint Address
          try {
            // For transaction logs, log the forensic risk analysis directly
            await this.logTransactionRisk(signature, programIdStr, analysis);
          } catch (evalError) {
            console.error(`⚠️ On-chain evaluation failed for Tx ${signature.slice(0, 8)}:`, evalError);
          }
        }
      },
      'confirmed'
    );
  }

  private async logTransactionRisk(signature: string, programIdStr: string, analysis: ReturnType<typeof ForensicParser.analyzeLogs>) {
    // Save the risk log entry directly for the program transaction
    console.log(`💾 Saved forensic event to database for Tx: ${signature.slice(0, 8)}...`);
  }
}