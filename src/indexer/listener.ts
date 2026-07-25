import { Connection, PublicKey } from '@solana/web3.js';
import { pool } from '../config/db';

export class SolanaListener {
  private connection: Connection;

  constructor(rpcUrl: string, wsUrl: string) {
    this.connection = new Connection(rpcUrl, { wsEndpoint: wsUrl, commitment: 'confirmed' });
  }

  public async startListening(programIdStr: string): Promise<void> {
    const programId = new PublicKey(programIdStr);

    console.log(`📡 WebSocket connected. Listening for program: ${programIdStr}...`);

    this.connection.onLogs(
      programId,
      async (logs) => {
        if (logs.err) return;

        const signature = logs.signature;

        // Check logs for specific risk keywords
        const isRiskPattern = logs.logs.some(
          (log) => log.includes('SetAuthority') || log.includes('MintTo') || log.includes('FreezeAccount')
        );

        if (isRiskPattern) {
          console.warn(`🚨 Risk trigger detected in Tx: ${signature}`);
          await this.logRiskEvent(
            signature,
            programIdStr,
            'AUTHORITY_CHANGE',
            80,
            JSON.stringify(logs.logs)
          );
        }
      },
      'confirmed'
    );
  }

  private async logRiskEvent(
    signature: string,
    mintAddress: string,
    eventType: string,
    riskScore: number,
    details: string
  ): Promise<void> {
    const query = `
      INSERT INTO risk_logs (signature, mint_address, event_type, risk_score, details)
      VALUES (?, ?, ?, ?, ?)
    `;
    await pool.execute(query, [signature, mintAddress, eventType, riskScore, details]);
    console.log(`💾 Saved risk record to database for Tx: ${signature.slice(0, 8)}...`);
  }
}