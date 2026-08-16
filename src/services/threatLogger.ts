import { pool } from '../config/db.js';
import { sendTelegramRiskAlert } from './notifier.js';

export interface ThreatLogEntry {
  mintAddress: string;
  clusterId: string;
  threatWallet: string;
  eventType: 'DEX_SWAP' | 'TOKEN_BURN' | 'TRANSFER' | 'LIQUIDITY_REMOVAL';
  transactionHash: string;
  transactionAmount?: bigint;
  transactionType?: string;
  threatStatus: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  webhookReceivedAt?: Date;
}

export interface ThreatAlert {
  threatId: number;
  mintAddress: string;
  clusterId: string;
  threatWallet: string;
  eventType: string;
  transactionHash: string;
  threatStatus: string;
  loggedAt: Date;
  requiresImmediateAction: boolean;
}

/**
 * Threat Logger Service
 * Logs real-time threat events from webhook monitoring
 * Coordinates alerts and persistence
 */
export class ThreatLogger {
  /**
   * Log incoming threat event from webhook
   * Persists to database and triggers immediate alerts
   */
  async logThreat(entry: ThreatLogEntry): Promise<number> {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. Insert threat log
      const [result] = await connection.query(
        `INSERT INTO realtime_threat_logs (
          mint_address, cluster_id, threat_wallet, event_type, 
          transaction_hash, transaction_amount, transaction_type, 
          threat_status, webhook_received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.mintAddress,
          entry.clusterId,
          entry.threatWallet,
          entry.eventType,
          entry.transactionHash,
          entry.transactionAmount ? entry.transactionAmount.toString() : null,
          entry.transactionType || null,
          entry.threatStatus,
          entry.webhookReceivedAt || new Date(),
        ]
      );

      const threatId = (result as any).insertId;

      // 2. Check if this threat requires immediate escalation
      if (entry.threatStatus === 'CRITICAL') {
        await this.escalateThreat(connection, threatId, entry);
      }

      await connection.commit();
      console.log(`📝 Threat logged: ${entry.eventType} from ${entry.threatWallet.slice(0, 8)}... on ${entry.mintAddress.slice(0, 8)}...`);

      return threatId;
    } catch (error) {
      await connection.rollback();
      console.error(`❌ Error logging threat:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Escalate critical threat with immediate alerts
   */
  private async escalateThreat(connection: any, threatId: number, entry: ThreatLogEntry): Promise<void> {
    try {
      // 1. Update threat record as escalated
      await connection.query(
        `UPDATE realtime_threat_logs SET threat_status = 'CRITICAL' WHERE id = ?`,
        [threatId]
      );

      // 2. Send immediate Telegram alert
      await sendTelegramRiskAlert({
        mintAddress: entry.mintAddress,
        name: 'INSIDER ACTIVITY DETECTED',
        symbol: entry.eventType,
        eventType: 'REALTIME_THREAT',
        riskScore: 100,
        reasons: [
          `🚨 INSIDER DUMP IN PROGRESS: ${entry.eventType}`,
          `Threatening Wallet: ${entry.threatWallet}`,
          `Cluster ID: ${entry.clusterId}`,
          `Transaction: ${entry.transactionHash}`,
          `Amount: ${entry.transactionAmount ? (Number(entry.transactionAmount) / 1e9).toFixed(4) + ' units' : 'N/A'}`,
        ],
        signature: entry.transactionHash,
      });

      console.log(`🚨 CRITICAL THREAT ESCALATED: Telegram alert sent for threat #${threatId}`);
    } catch (error) {
      console.error(`❌ Error escalating threat:`, error);
      // Don't throw - continue processing even if alert fails
    }
  }

  /**
   * Get recent threats for a specific token
   */
  async getRecentThreats(mintAddress: string, hoursBack: number = 24): Promise<ThreatAlert[]> {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM realtime_threat_logs 
         WHERE mint_address = ? AND logged_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
         ORDER BY logged_at DESC`,
        [mintAddress, hoursBack]
      );

      return (rows as any[]).map((row: any) => ({
        threatId: row.id,
        mintAddress: row.mint_address,
        clusterId: row.cluster_id,
        threatWallet: row.threat_wallet,
        eventType: row.event_type,
        transactionHash: row.transaction_hash,
        threatStatus: row.threat_status,
        loggedAt: row.logged_at,
        requiresImmediateAction: row.threat_status === 'CRITICAL',
      }));
    } catch (error) {
      console.error(`❌ Error fetching recent threats:`, error);
      return [];
    }
  }

  /**
   * Get threats by cluster
   */
  async getThreatsByCluster(clusterId: string, hoursBack: number = 24): Promise<ThreatAlert[]> {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM realtime_threat_logs 
         WHERE cluster_id = ? AND logged_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
         ORDER BY logged_at DESC`,
        [clusterId, hoursBack]
      );

      return (rows as any[]).map((row: any) => ({
        threatId: row.id,
        mintAddress: row.mint_address,
        clusterId: row.cluster_id,
        threatWallet: row.threat_wallet,
        eventType: row.event_type,
        transactionHash: row.transaction_hash,
        threatStatus: row.threat_status,
        loggedAt: row.logged_at,
        requiresImmediateAction: row.threat_status === 'CRITICAL',
      }));
    } catch (error) {
      console.error(`❌ Error fetching threats by cluster:`, error);
      return [];
    }
  }

  /**
   * Get all active critical threats across all monitored tokens
   */
  async getActiveCriticalThreats(): Promise<ThreatAlert[]> {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM realtime_threat_logs 
         WHERE threat_status = 'CRITICAL' AND logged_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
         ORDER BY logged_at DESC`
      );

      return (rows as any[]).map((row: any) => ({
        threatId: row.id,
        mintAddress: row.mint_address,
        clusterId: row.cluster_id,
        threatWallet: row.threat_wallet,
        eventType: row.event_type,
        transactionHash: row.transaction_hash,
        threatStatus: row.threat_status,
        loggedAt: row.logged_at,
        requiresImmediateAction: true,
      }));
    } catch (error) {
      console.error(`❌ Error fetching critical threats:`, error);
      return [];
    }
  }

  /**
   * Check if wallet is under monitoring
   */
  async isWalletMonitored(walletAddress: string): Promise<boolean> {
    try {
      const [rows] = await pool.query(
        `SELECT id FROM webhook_subscriptions 
         WHERE monitored_wallet = ? AND subscription_status = 'ACTIVE'`,
        [walletAddress]
      );

      return (rows as any[]).length > 0;
    } catch (error) {
      console.error(`❌ Error checking monitored wallet:`, error);
      return false;
    }
  }

  /**
   * Get monitoring info for a wallet
   */
  async getWalletMonitoringInfo(walletAddress: string): Promise<{
    isMonitored: boolean;
    clusters: string[];
    tokens: string[];
  }> {
    try {
      const [rows] = await pool.query(
        `SELECT DISTINCT mint_address, cluster_id FROM webhook_subscriptions 
         WHERE monitored_wallet = ? AND subscription_status = 'ACTIVE'`,
        [walletAddress]
      );

      const clusters = new Set<string>();
      const tokens = new Set<string>();

      for (const row of rows as any[]) {
        tokens.add(row.mint_address);
        if (row.cluster_id) {
          clusters.add(row.cluster_id);
        }
      }

      return {
        isMonitored: (rows as any[]).length > 0,
        clusters: Array.from(clusters),
        tokens: Array.from(tokens),
      };
    } catch (error) {
      console.error(`❌ Error fetching wallet monitoring info:`, error);
      return { isMonitored: false, clusters: [], tokens: [] };
    }
  }

  /**
   * Unsubscribe wallet from monitoring
   */
  async unsubscribeWallet(walletAddress: string): Promise<void> {
    try {
      await pool.query('UPDATE webhook_subscriptions SET subscription_status = ? WHERE monitored_wallet = ?', [
        'INACTIVE',
        walletAddress,
      ]);
      console.log(`✅ Unsubscribed ${walletAddress.slice(0, 8)}... from monitoring`);
    } catch (error) {
      console.error(`❌ Error unsubscribing wallet:`, error);
    }
  }
}

// Export singleton instance
export const threatLogger = new ThreatLogger();
