import mysql from 'mysql2/promise'; 
import dotenv from 'dotenv'; 

dotenv.config(); 

export const pool = mysql.createPool({ 
  host: process.env.DB_HOST || 'localhost', 
  user: process.env.DB_USER || 'root', 
  password: process.env.DB_PASSWORD || '', 
  database: process.env.DB_NAME || 'solana_forensics', 
  port: Number(process.env.DB_PORT) || 3306, 
  waitForConnections: true, 
  connectionLimit: 10, 
  queueLimit: 0, 
}); 

export async function initDatabase(): Promise<void> { 
  // 1. Create tokens table
  const createTokensTable = `
    CREATE TABLE IF NOT EXISTS tokens (
      mint_address VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255),
      symbol VARCHAR(50),
      decimals INT,
      mint_authority VARCHAR(255),
      freeze_authority VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // 2. Create risk_logs table
  const createRiskLogsTable = ` 
    CREATE TABLE IF NOT EXISTS risk_logs ( 
      id INT AUTO_INCREMENT PRIMARY KEY, 
      signature VARCHAR(128) NOT NULL, 
      mint_address VARCHAR(88) NOT NULL, 
      event_type VARCHAR(50) NOT NULL, 
      risk_score INT DEFAULT 0, 
      flagged_reasons TEXT, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
    ); 
  `; 

  // 3. Create cluster_mapping table
  const createClusterMappingTable = `
    CREATE TABLE IF NOT EXISTS cluster_mapping (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mint_address VARCHAR(255) NOT NULL,
      cluster_id VARCHAR(255) NOT NULL,
      parent_funder VARCHAR(255) NOT NULL,
      child_wallet VARCHAR(255) NOT NULL,
      relationship_type VARCHAR(50) NOT NULL COMMENT 'direct_funder, dev_holding, related_wallet',
      earliest_funding_tx VARCHAR(255),
      funding_timestamp TIMESTAMP,
      confidence_score DECIMAL(5, 2) DEFAULT 100.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_relation (mint_address, parent_funder, child_wallet),
      INDEX idx_mint (mint_address),
      INDEX idx_cluster (cluster_id),
      INDEX idx_funder (parent_funder)
    );
  `;

  // 4. Create cluster_holdings table
  const createClusterHoldingsTable = `
    CREATE TABLE IF NOT EXISTS cluster_holdings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mint_address VARCHAR(255) NOT NULL,
      cluster_id VARCHAR(255) NOT NULL,
      aggregated_balance BIGINT NOT NULL,
      percentage_of_supply DECIMAL(10, 4) NOT NULL,
      wallet_count INT DEFAULT 0,
      is_critical_risk BOOLEAN DEFAULT FALSE COMMENT 'TRUE if > 12% supply',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_cluster_holding (mint_address, cluster_id),
      INDEX idx_mint (mint_address),
      INDEX idx_risk (is_critical_risk)
    );
  `;

  // 5. Create realtime_threat_logs table
  const createThreatLogsTable = `
    CREATE TABLE IF NOT EXISTS realtime_threat_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mint_address VARCHAR(255) NOT NULL,
      cluster_id VARCHAR(255) NOT NULL,
      threat_wallet VARCHAR(255) NOT NULL,
      event_type VARCHAR(50) NOT NULL COMMENT 'DEX_SWAP, TOKEN_BURN, TRANSFER, LIQUIDITY_REMOVAL',
      transaction_hash VARCHAR(255) NOT NULL,
      transaction_amount BIGINT,
      transaction_type VARCHAR(50),
      threat_status VARCHAR(50) DEFAULT 'CRITICAL' COMMENT 'CRITICAL, HIGH, MEDIUM',
      webhook_received_at TIMESTAMP,
      logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mint (mint_address),
      INDEX idx_cluster (cluster_id),
      INDEX idx_wallet (threat_wallet),
      INDEX idx_status (threat_status),
      INDEX idx_created (logged_at)
    );
  `;

  // 6. Create webhook_subscriptions table
  const createWebhookSubscriptionsTable = `
    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mint_address VARCHAR(255) NOT NULL,
      cluster_id VARCHAR(255),
      monitored_wallet VARCHAR(255) NOT NULL,
      subscription_status VARCHAR(50) DEFAULT 'ACTIVE',
      webhook_endpoint VARCHAR(255),
      last_webhook_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_sub (mint_address, monitored_wallet),
      INDEX idx_mint (mint_address),
      INDEX idx_status (subscription_status)
    );
  `;

  // 7. Create audit_cluster_summary table
  const createAuditClusterSummaryTable = `
    CREATE TABLE IF NOT EXISTS audit_cluster_summary (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mint_address VARCHAR(255) NOT NULL UNIQUE,
      audit_signature VARCHAR(255),
      total_clusters INT DEFAULT 0,
      critical_risk_clusters INT DEFAULT 0,
      highest_single_cluster_percentage DECIMAL(10, 4),
      dev_entity_holding_percentage DECIMAL(10, 4),
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_mint (mint_address)
    );
  `;

  await pool.query(createTokensTable);
  await pool.query(createRiskLogsTable);
  await pool.query(createClusterMappingTable);
  await pool.query(createClusterHoldingsTable);
  await pool.query(createThreatLogsTable);
  await pool.query(createWebhookSubscriptionsTable);
  await pool.query(createAuditClusterSummaryTable);

  // 8. Ensure flagged_reasons column exists if table was created previously without it
  try {
    await pool.query(`
      ALTER TABLE risk_logs ADD COLUMN flagged_reasons TEXT;
    `);
  } catch (err: any) {
    // Ignore error if column already exists
  }

  console.log('✅ Connected to MySQL & verified schema (tokens, risk_logs, cluster & threat tables).'); 
}
