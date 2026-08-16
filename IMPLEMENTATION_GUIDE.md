# 🚀 Solana Forensic Guard V2 Implementation Complete

## Summary

Your two high-impact security features have been **fully implemented and integrated**:

### ✅ Feature 1: Funder Clustering (True Insider / Dev Holding %)
- Analyzes top 20 token holders
- Traces funding sources via Helius RPC
- Clusters wallets by parent funder
- Calculates aggregated percentages
- Flags clusters holding > 12% as **CRITICAL RISK**
- Persists cluster mapping to MySQL

### ✅ Feature 2: Live Cluster Outflow & Sell Trigger Pipeline
- Receives Helius webhook events (DEX_SWAP, TOKEN_BURN, TRANSFER, LIQUIDITY_REMOVAL)
- Checks if source wallet is in monitored cluster
- Logs incidents as **CRITICAL** status
- Sends Telegram alerts immediately
- Broadcasts real-time alerts via WebSocket to frontend
- UI displays red banner with audio alert

---

## 📂 Files Created & Modified

### Backend Services (NEW):
```
src/services/
  ├── heliusRpc.ts              # Helius API wrapper for transaction tracing
  ├── clusterAnalyzer.ts        # Cluster graph analysis & persistence
  └── threatLogger.ts           # Real-time threat event logging
```

### Database:
```
src/config/
  ├── schema-migration-v2.sql   # SQL schema with 5 new tables
  └── db.ts                      # Updated with cluster table initialization
```

### API Endpoints (NEW):
```
GET  /api/tokens/:mint/clusters         # Get cluster analysis
POST /api/tokens/:mint/subscribe        # Subscribe to insider alerts
POST /api/webhook/helius                # Helius webhook receiver
GET  /api/tokens/:mint/threats          # Get recent threats
GET  /api/threats/critical              # Dashboard critical threats
POST /api/webhooks/unsubscribe          # Stop monitoring
```

### Frontend Components (NEW):
```
dashboard/src/components/
  ├── ClusterAnalysisCard.tsx           # Cluster risk display card
  └── RealTimeThreatBanner.tsx          # Real-time threat alerts
```

### Updated Files:
```
src/indexer/evaluator.ts        # Integrated cluster analysis into token scoring
src/api/server.ts               # Added WebSocket server + new endpoints
dashboard/src/app/page.tsx      # Integrated new components
```

---

## 🔧 Installation & Setup

### 1. Install Dependencies
```bash
npm install ws  # For WebSocket support
cd dashboard && npm install
```

### 2. Database Setup
The new tables are created automatically on startup:
- `cluster_mapping` - Wallet relationships
- `cluster_holdings` - Aggregated percentages
- `realtime_threat_logs` - Webhook events
- `webhook_subscriptions` - Monitored wallets
- `audit_cluster_summary` - Per-token findings

### 3. Environment Variables
```bash
# Required for new features
HELIUS_API_KEY=your_helius_api_key
HELIUS_WEBHOOK_SECRET=your_webhook_secret_hmac

# Existing variables
SOLANA_RPC_URL=https://...helius...
DB_HOST=your_db_host
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=solana_forensics
PORT=3000
```

### 4. Helius Webhook Configuration
1. Log into Helius dashboard
2. Create new webhook with:
   - **Endpoint**: `https://your-api.com/api/webhook/helius`
   - **Events**: DEX_SWAP, TOKEN_BURN, TRANSFER, LIQUIDITY_REMOVAL
   - **Secret**: Copy to `HELIUS_WEBHOOK_SECRET` env var

---

## 💡 How to Use

### Perform Token Audit with Cluster Analysis
```bash
curl https://your-api.com/api/tokens/{mint_address}

# Response includes:
{
  "liveProfile": {
    "trueClustersHoldingPercentage": 15.2,
    "isClustersHighRisk": true,
    "clusterAnalysis": {
      "totalClusters": 3,
      "criticalRiskClusters": 1,
      "highestSingleClusterPercentage": 15.2,
      "clusters": [...]
    }
  }
}
```

### Subscribe Token to Insider Dump Alerts
```bash
curl -X POST https://your-api.com/api/tokens/{mint}/subscribe \
  -H "Content-Type: application/json" \
  -d '{"autoSubscribeTopHolders": true}'

# Result: All cluster wallets now monitored
```

### View Real-Time Threats
```bash
# Get critical threats (last hour)
curl https://your-api.com/api/threats/critical

# Get threats for specific token
curl https://your-api.com/api/tokens/{mint}/threats?hours=24
```

### Dashboard Access
- Navigate to dashboard
- Search token mint address
- View cluster analysis card showing:
  - True Cluster Holding %
  - Critical risk badge
  - Cluster breakdown
  - Subscribe button
- Red threat banner appears when events occur

---

## 🎯 Risk Metrics

| Metric | Threshold | Action |
|--------|-----------|--------|
| Single Cluster Holding | > 12% | CRITICAL_RISK badge |
| Dev Entity Concentration | > 12% | +30 risk score |
| Mint Authority Active | Yes | +35 risk score |
| Freeze Authority Active | Yes | +40 risk score |
| Insider Dump Event | Any | Immediate alert |

---

## 🔍 Testing

### Test Cluster Analysis:
1. Audit a token: `curl /api/tokens/{mint}`
2. Should return cluster data if top holders exist
3. Check MySQL: `SELECT * FROM audit_cluster_summary WHERE mint_address = '{mint}'`

### Test Webhook:
1. Configure Helius webhook
2. Perform a swap with monitored wallet
3. Should log to `realtime_threat_logs` table
4. Should broadcast to WebSocket clients
5. Should send Telegram alert

### Test Frontend:
1. Open dashboard
2. Search token with clusters
3. See ClusterAnalysisCard render
4. Connect to WebSocket (check browser console)
5. Trigger webhook event
6. See red banner appear with audio alert

---

## 📊 Database Tables Reference

### cluster_mapping
Tracks wallet relationships and funding sources
```
cluster_id, parent_funder, child_wallet, relationship_type, 
earliest_funding_tx, funding_timestamp, confidence_score
```

### cluster_holdings
Aggregated percentages per cluster
```
mint_address, cluster_id, aggregated_balance, 
percentage_of_supply, wallet_count, is_critical_risk
```

### realtime_threat_logs
Webhook events from insider activity
```
mint_address, cluster_id, threat_wallet, event_type, 
transaction_hash, threat_status, logged_at
```

### webhook_subscriptions
Tracks monitored wallets
```
mint_address, cluster_id, monitored_wallet, 
subscription_status, last_webhook_at
```

### audit_cluster_summary
Summary of findings for each token
```
mint_address, total_clusters, critical_risk_clusters,
highest_single_cluster_percentage, dev_entity_holding_percentage
```

---

## 🚨 Critical Flow

```
1. User audits token → evaluator.evaluateToken()
   ↓
2. Cluster analysis runs → clusterAnalyzer.analyzeTokenClustering()
   ↓
3. Results persist to cluster_* tables
   ↓
4. If > 12% cluster holding → CRITICAL_RISK badge in UI
   ↓
5. User clicks "Subscribe to Insider Dump Alerts"
   ↓
6. Wallets added to webhook_subscriptions
   ↓
7. Helius webhook sends event → /api/webhook/helius
   ↓
8. Validates signature & checks if wallet monitored
   ↓
9. Logs as CRITICAL + sends Telegram alert
   ↓
10. Broadcasts to WebSocket clients
   ↓
11. Frontend red banner + audio alert appears
```

---

## 📝 Production Checklist

- [ ] Environment variables configured
- [ ] Database tables verified
- [ ] Helius webhook endpoint configured
- [ ] Webhook secret set correctly
- [ ] npm packages installed
- [ ] Backend built and deployed
- [ ] Dashboard built and deployed
- [ ] WebSocket connectivity tested
- [ ] Telegram bot token verified
- [ ] Test alert sent successfully

---

## 🎓 Next Steps

1. **Immediate**: Install dependencies & verify database tables
2. **Configure**: Set Helius webhook in environment
3. **Test**: Perform token audit and verify cluster data
4. **Deploy**: Build and deploy both backend and dashboard
5. **Monitor**: Check logs for webhook events

---

## 💬 Questions?

Refer to the detailed implementation guide in `/memories/repo/solana-forensic-guard-v2-implementation.md` for:
- Complete API reference
- Database schema details
- Environment setup guide
- Troubleshooting tips

**Your Solana Forensic Guard is now enhanced with insider detection AI!** 🛡️
