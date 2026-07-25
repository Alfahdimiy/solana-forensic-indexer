import { Connection, PublicKey } from '@solana/web3.js';
import { ForensicParser } from './parser.js';
import { TokenEvaluator } from './evaluator.js';
import { pool } from '../config/db.js';
import { sendTelegramRiskAlert } from '../services/notifier.js';

export class SolanaListener {
  private connection: Connection;
  private evaluator: TokenEvaluator;
  private isListening: boolean = false;

  constructor(rpcUrl: string, wsUrl: string) {
    this.connection = new Connection(rpcUrl, { 
      wsEndpoint: wsUrl, 
      commitment: 'confirmed' 
    });
    this.evaluator = new TokenEvaluator(rpcUrl);
  }

  /**
   * Starts listening to on-chain program logs via WebSocket stream
   */
  public async startListening(programIdStr: string): Promise<void> {
    if (this.isListening) {
      console.log('⚠️ Listener is already running.');
      return;
    }

    const programId = new PublicKey(programIdStr);
    console.log(`📡 Automated Event Pipeline active. Monitoring program: ${programIdStr}...`);

    try {
      this.isListening = true;

      this.connection.onLogs(
        programId,
        async (logs) => {
          if (logs.err || !logs.logs || logs.logs.length === 0) return;

          const signature = logs.signature;
          const analysis = ForensicParser.analyzeLogs(logs.logs);

          // Flag events meeting or exceeding risk threshold
          if (analysis.riskScore >= 30) {
            console.warn(
              `🚨 [Score: ${analysis.riskScore}/100] Flagged Event: ${analysis.eventType} | Tx: ${signature.slice(0, 10)}...`
            );

            try {
              // 1. Persist risk log into MySQL database
              await this.logTransactionRisk(signature, programIdStr, analysis);

              // 2. Dispatch Telegram alert if risk score is HIGH or CRITICAL (>= 50)
              if (analysis.riskScore >= 50) {
                await sendTelegramRiskAlert({
                  mintAddress: programIdStr,
                  eventType: analysis.eventType,
                  riskScore: analysis.riskScore,
                  reasons: analysis.flaggedReasons,
                  signature,
                });
              }
            } catch (evalError: any) {
              console.error(`⚠️ Failed to process risk log for Tx ${signature.slice(0, 8)}:`, evalError.message);
            }
          }
        },
        'confirmed'
      );
    } catch (err: any) {
      this.isListening = false;
      console.error(`❌ WebSocket connection error: ${err.message}. Retrying in 5s...`);
      setTimeout(() => this.startListening(programIdStr), 5000);
    }
  }

  /**
   * Persists flagged forensic risks directly into MySQL risk_logs
   */
  private async logTransactionRisk(
    signature: string, 
    mintAddressStr: string, 
    analysis: ReturnType<typeof ForensicParser.analyzeLogs>
  ): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Ensure dummy/tracked token entry exists so Foreign Key constraints match
      await connection.query(
        `INSERT INTO tokens (mint_address, decimals, mint_authority, freeze_authority)
         VALUES (?, 6, NULL, NULL)
         ON DUPLICATE KEY UPDATE mint_address = VALUES(mint_address)`,
        [mintAddressStr]
      );

      // Log forensic risk event
      await connection.query(
        `INSERT INTO risk_logs (mint_address, signature, event_type, risk_score, flagged_reasons)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE risk_score = VALUES(risk_score)`,
        [
          mintAddressStr,
          signature,
          analysis.eventType,
          analysis.riskScore,
          JSON.stringify(analysis.flaggedReasons),
        ]
      );

      await connection.commit();
      console.log(`💾 Saved forensic event to database for Tx: ${signature.slice(0, 8)}...`);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}