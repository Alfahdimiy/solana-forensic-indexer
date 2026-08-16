-- ==========================================
-- Solana Forensic Guard V2: Cluster Analysis & Threat Detection
-- ==========================================

-- Table 1: Cluster Mapping (tracks which wallets share funding sources)
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

-- Table 2: Cluster Holdings (aggregated percentages per cluster)
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

-- Table 3: Realtime Threat Logs (webhook events from insider activity detection)
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

-- Table 4: Webhook Subscriptions (track what to monitor)
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

-- Table 5: Audit Cluster Summary (for each token audit, store cluster findings)
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
