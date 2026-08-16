import { Connection, PublicKey } from '@solana/web3.js';
import { pool } from '../config/db.js';
import { heliusRPC } from './heliusRpc.js';

export interface WalletCluster {
  clusterId: string;
  parentFunder: string;
  childWallets: string[];
  aggregatedBalance: bigint;
  percentageOfSupply: number;
  walletCount: number;
  isCriticalRisk: boolean;
}

export interface ClusterAnalysisResult {
  mintAddress: string;
  totalClusters: number;
  clusters: WalletCluster[];
  criticalRiskClusters: number;
  highestSingleClusterPercentage: number;
  devEntityHoldingPercentage: number;
}

/**
 * Cluster Analyzer Service
 * Analyzes top token holders and traces their funding sources to identify insider/dev clusters
 */
export class ClusterAnalyzer {
  private connection: Connection;
  private rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Main entry point: Analyze token for holder clustering
   * 1. Fetch top 20 holders
   * 2. Trace funding sources for each
   * 3. Cluster wallets by origin
   * 4. Calculate aggregated percentages
   * 5. Persist to database
   */
  async analyzeTokenClustering(mintAddressStr: string): Promise<ClusterAnalysisResult> {
    console.log(`🔍 Starting cluster analysis for token ${mintAddressStr.slice(0, 8)}...`);

    try {
      const mintPubkey = new PublicKey(mintAddressStr);

      // 1. Fetch top 20 holder accounts
      const topHolders = await this.fetchTopHolders(mintPubkey, 20);
      if (topHolders.length === 0) {
        console.warn('⚠️  No top holders found');
        return {
          mintAddress: mintAddressStr,
          totalClusters: 0,
          clusters: [],
          criticalRiskClusters: 0,
          highestSingleClusterPercentage: 0,
          devEntityHoldingPercentage: 0,
        };
      }

      // 2. Trace funding sources and build cluster map
      const clusterMap = new Map<string, WalletCluster>();
      const walletToCluster = new Map<string, string>();

      for (const holder of topHolders) {
        const parentInfo = await heliusRPC.findEarliestIncomingTransfer(holder.address);

        if (parentInfo.parentFunder) {
          const clusterId = `cluster_${parentInfo.parentFunder.slice(0, 8)}`;

          if (!clusterMap.has(clusterId)) {
            clusterMap.set(clusterId, {
              clusterId,
              parentFunder: parentInfo.parentFunder,
              childWallets: [],
              aggregatedBalance: 0n,
              percentageOfSupply: 0,
              walletCount: 0,
              isCriticalRisk: false,
            });
          }

          const cluster = clusterMap.get(clusterId)!;
          cluster.childWallets.push(holder.address);
          cluster.aggregatedBalance += BigInt(holder.amount);
          cluster.walletCount += 1;
          walletToCluster.set(holder.address, clusterId);

          // Persist cluster mapping to database
          await this.persistClusterMapping(
            mintAddressStr,
            clusterId,
            parentInfo.parentFunder,
            holder.address,
            parentInfo.earliestTx || '',
            parentInfo.timestamp
          );
        }
      }

      // 3. Calculate total supply and percentages
      const totalSupply = topHolders.reduce((sum, h) => sum + BigInt(h.amount), 0n);

      for (const cluster of clusterMap.values()) {
        cluster.percentageOfSupply = totalSupply > 0n ? Number((cluster.aggregatedBalance * 10000n) / totalSupply) / 100 : 0;
        cluster.isCriticalRisk = cluster.percentageOfSupply > 12; // Flag if > 12% supply

        // Persist cluster holdings
        await this.persistClusterHolding(mintAddressStr, cluster);
      }

      // 4. Prepare result
      const criticalClusters = Array.from(clusterMap.values()).filter((c) => c.isCriticalRisk).length;
      const highestPercentage = Math.max(...Array.from(clusterMap.values()).map((c) => c.percentageOfSupply), 0);

      const result: ClusterAnalysisResult = {
        mintAddress: mintAddressStr,
        totalClusters: clusterMap.size,
        clusters: Array.from(clusterMap.values()),
        criticalRiskClusters: criticalClusters,
        highestSingleClusterPercentage: highestPercentage,
        devEntityHoldingPercentage: highestPercentage, // Main risk metric
      };

      // 5. Persist audit summary
      await this.persistAuditSummary(result);

      console.log(`✅ Cluster analysis complete. Found ${result.totalClusters} clusters, ${criticalClusters} flagged as CRITICAL`);
      return result;
    } catch (error) {
      console.error(`❌ Error during cluster analysis:`, error);
      throw error;
    }
  }

  /**
   * Fetch top N holder accounts for a token
   */
  private async fetchTopHolders(
    mintPubkey: PublicKey,
    limit: number = 20
  ): Promise<Array<{ address: string; amount: bigint }>> {
    try {
      const largestAccounts = await this.connection.getTokenLargestAccounts(mintPubkey, 'confirmed');
      const accounts = largestAccounts.value || [];

      return accounts.slice(0, limit).map((acc) => ({
        address: acc.address.toBase58(),
        amount: BigInt(acc.amount),
      }));
    } catch (error) {
      console.error(`❌ Error fetching top holders:`, error);
      return [];
    }
  }

  /**
   * Persist individual cluster mapping to database
   */
  private async persistClusterMapping(
    mintAddress: string,
    clusterId: string,
    parentFunder: string,
    childWallet: string,
    earliestTx: string,
    timestamp: number | null
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO cluster_mapping (mint_address, cluster_id, parent_funder, child_wallet, relationship_type, earliest_funding_tx, funding_timestamp, confidence_score)
         VALUES (?, ?, ?, ?, 'direct_funder', ?, FROM_UNIXTIME(?), 100)
         ON DUPLICATE KEY UPDATE
           relationship_type = VALUES(relationship_type),
           earliest_funding_tx = VALUES(earliest_funding_tx),
           funding_timestamp = VALUES(funding_timestamp)`,
        [mintAddress, clusterId, parentFunder, childWallet, earliestTx, timestamp ? Math.floor(timestamp / 1000) : null]
      );
    } catch (error) {
      console.error(`❌ Error persisting cluster mapping:`, error);
    }
  }

  /**
   * Persist cluster holding aggregates to database
   */
  private async persistClusterHolding(mintAddress: string, cluster: WalletCluster): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO cluster_holdings (mint_address, cluster_id, aggregated_balance, percentage_of_supply, wallet_count, is_critical_risk)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           aggregated_balance = VALUES(aggregated_balance),
           percentage_of_supply = VALUES(percentage_of_supply),
           wallet_count = VALUES(wallet_count),
           is_critical_risk = VALUES(is_critical_risk)`,
        [
          mintAddress,
          cluster.clusterId,
          cluster.aggregatedBalance.toString(),
          cluster.percentageOfSupply,
          cluster.walletCount,
          cluster.isCriticalRisk ? 1 : 0,
        ]
      );
    } catch (error) {
      console.error(`❌ Error persisting cluster holding:`, error);
    }
  }

  /**
   * Persist audit summary for token
   */
  private async persistAuditSummary(result: ClusterAnalysisResult): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO audit_cluster_summary (mint_address, total_clusters, critical_risk_clusters, highest_single_cluster_percentage, dev_entity_holding_percentage)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           total_clusters = VALUES(total_clusters),
           critical_risk_clusters = VALUES(critical_risk_clusters),
           highest_single_cluster_percentage = VALUES(highest_single_cluster_percentage),
           dev_entity_holding_percentage = VALUES(dev_entity_holding_percentage)`,
        [
          result.mintAddress,
          result.totalClusters,
          result.criticalRiskClusters,
          result.highestSingleClusterPercentage,
          result.devEntityHoldingPercentage,
        ]
      );
    } catch (error) {
      console.error(`❌ Error persisting audit summary:`, error);
    }
  }

  /**
   * Get cached cluster analysis for a token
   */
  async getClusterAnalysis(mintAddress: string): Promise<ClusterAnalysisResult | null> {
    try {
      const [summaryRows] = await pool.query('SELECT * FROM audit_cluster_summary WHERE mint_address = ?', [mintAddress]);

      if ((summaryRows as any[]).length === 0) {
        return null;
      }

      const summary = (summaryRows as any[])[0];

      const [clusterRows] = await pool.query('SELECT * FROM cluster_holdings WHERE mint_address = ?', [mintAddress]);

      const clusters: WalletCluster[] = (clusterRows as any[]).map((row: any) => ({
        clusterId: row.cluster_id,
        parentFunder: '', // Would need separate query to get parent funder
        childWallets: [], // Would need separate query
        aggregatedBalance: BigInt(row.aggregated_balance),
        percentageOfSupply: Number(row.percentage_of_supply),
        walletCount: row.wallet_count,
        isCriticalRisk: Boolean(row.is_critical_risk),
      }));

      return {
        mintAddress,
        totalClusters: summary.total_clusters,
        clusters,
        criticalRiskClusters: summary.critical_risk_clusters,
        highestSingleClusterPercentage: Number(summary.highest_single_cluster_percentage),
        devEntityHoldingPercentage: Number(summary.dev_entity_holding_percentage),
      };
    } catch (error) {
      console.error(`❌ Error retrieving cluster analysis:`, error);
      return null;
    }
  }

  /**
   * Subscribe cluster wallets to threat monitoring
   */
  async subscribeClusterToMonitoring(
    mintAddress: string,
    clusterId: string,
    wallets: string[],
    webhookEndpoint?: string
  ): Promise<void> {
    try {
      for (const wallet of wallets) {
        await pool.query(
          `INSERT INTO webhook_subscriptions (mint_address, cluster_id, monitored_wallet, subscription_status, webhook_endpoint)
           VALUES (?, ?, ?, 'ACTIVE', ?)
           ON DUPLICATE KEY UPDATE subscription_status = 'ACTIVE'`,
          [mintAddress, clusterId, wallet, webhookEndpoint || null]
        );
      }
      console.log(`✅ Subscribed ${wallets.length} wallets from cluster ${clusterId} to monitoring`);
    } catch (error) {
      console.error(`❌ Error subscribing cluster to monitoring:`, error);
    }
  }
}

// Export singleton instance
export const clusterAnalyzer = new ClusterAnalyzer(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
