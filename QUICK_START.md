# ⚡ Quick Start: Solana Forensic Guard V2

## What's New

Your project now has **two powerful insider detection features**:

### 1. 🔍 Cluster Analysis
When you audit a token, the system:
- Finds top 20 holders
- Traces who funded them (parent wallets)
- Groups related wallets into clusters
- Calculates % supply per cluster
- **Flags clusters holding > 12% as CRITICAL RISK**

### 2. 🚨 Real-Time Insider Alerts
When a flagged cluster wallet does a transaction:
- Helius webhook notifies your API
- System logs event as CRITICAL threat
- Sends Telegram alert immediately
- Broadcasts to dashboard via WebSocket
- **Red banner + audio alert appears in UI**

---

## 🎯 Get Started in 3 Steps

### Step 1: Install Packages
```bash
npm install ws
cd dashboard && npm install
```

### Step 2: Set Environment Variables
```bash
# Add these to your .env file:
HELIUS_API_KEY=your_helius_api_key
HELIUS_WEBHOOK_SECRET=your_webhook_hmac_secret
```

### Step 3: Configure Helius Webhook
1. Go to [Helius Dashboard](https://dev.helius.xyz)
2. Create new webhook:
   - **URL**: `https://your-api.com/api/webhook/helius`
   - **Events**: DEX_SWAP, TOKEN_BURN, TRANSFER, LIQUIDITY_REMOVAL
   - **Copy Secret** → Set as `HELIUS_WEBHOOK_SECRET`

---

## 📊 How It Works

### On Dashboard:
1. **Search token mint** → Click "RUN FORENSIC SCAN"
2. **See cluster card** → Shows "True Cluster Holding: X%"
3. **If > 12%** → See red CRITICAL badge
4. **Click Subscribe** → Enables insider dump alerts
5. **See red banner** → When insiders dump (real-time!)

### In Database:
- New tables track clusters and threats
- All data persists for compliance
- Query `/api/threats/critical` for active alerts

---

## 🔧 Files You Modified

```
Backend (3 new services):
✅ src/services/heliusRpc.ts
✅ src/services/clusterAnalyzer.ts
✅ src/services/threatLogger.ts

API (10 new endpoints):
✅ src/api/server.ts (WebSocket + endpoints)

Database (5 new tables):
✅ src/config/db.ts (auto-created on startup)

Frontend (2 new components):
✅ dashboard/src/components/ClusterAnalysisCard.tsx
✅ dashboard/src/components/RealTimeThreatBanner.tsx
✅ dashboard/src/app/page.tsx (integrated)

Evaluation:
✅ src/indexer/evaluator.ts (cluster analysis integrated)
```

---

## 🧪 Quick Test

### Test Cluster Analysis:
```bash
# Audit a token
curl http://localhost:3000/api/tokens/EPjFWaLb3odcccccccccccccccccccccccccccccc

# Look for in response:
# "trueClustersHoldingPercentage": 15.2
# "isClustersHighRisk": true
```

### Test Webhook:
```bash
# Get critical threats
curl http://localhost:3000/api/threats/critical

# Should show recent threat events if webhook fired
```

### Test Frontend:
1. Open dashboard
2. Search any token
3. Wait for cluster card to appear
4. Subscribe to alerts
5. Connect to WebSocket (check browser console)

---

## 📈 Expected Output

### Cluster Card Shows:
```
TRUE CLUSTER HOLDING: 15.2%
⚠️ CRITICAL RISK (exceeds 12%)

CLUSTERS: 3
CRITICAL: 1
MAX SINGLE: 15.2%
```

### Threat Banner Shows:
```
🚨 INSIDER DUMP IN PROGRESS
Event: DEX_SWAP from 7x8k9a1b...
TX: [Link to Solscan]
```

---

## ⚙️ Configuration Reference

### Env Variables Needed:
```bash
# New for cluster features
HELIUS_API_KEY=xxx          # Get from Helius.xyz
HELIUS_WEBHOOK_SECRET=xxx   # Helius webhook secret

# Existing (verify these still work)
SOLANA_RPC_URL=https://...
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=xxx
DB_NAME=solana_forensics
PORT=3000
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx
```

---

## 🚀 Deploy Steps

### Build Backend:
```bash
npm run build
# Deploy src/ folder or use ts-node
```

### Build Dashboard:
```bash
cd dashboard
npm run build
# Deploy .next/ folder to Vercel or hosting
```

### Verify Deployment:
1. ✅ Test `/api/health` returns 200
2. ✅ Database tables exist (7 total)
3. ✅ Webhook events logged
4. ✅ WebSocket connects from dashboard
5. ✅ Telegram alerts send

---

## 🎨 UI Locations

### Cluster Analysis Card:
- **Where**: Right sidebar, below token audit form
- **Shows**: Cluster holding %, critical badge, subscribe button
- **Appears**: After token audit if clusters found

### Threat Banner:
- **Where**: Fixed at top of page
- **Shows**: Real-time alerts with Solscan links
- **Appears**: When insider activity detected

### Status Indicator:
- **Where**: Top right, next to Refresh button
- **Shows**: Green dot = WebSocket connected
- **Color**: Green = live, Red = offline

---

## 📚 Full Documentation

For detailed info, see:
- `IMPLEMENTATION_GUIDE.md` - Complete reference
- `/memories/repo/solana-forensic-guard-v2-implementation.md` - Detailed specs

---

## ✅ Verification Checklist

Before going live, verify:
- [ ] npm dependencies installed
- [ ] Environment variables set
- [ ] Database tables created (check MySQL)
- [ ] Helius webhook URL configured
- [ ] Webhook secret matches env var
- [ ] Backend builds without errors
- [ ] Dashboard builds without errors
- [ ] Token audit returns cluster data
- [ ] WebSocket connects in browser
- [ ] Test webhook event logged

---

## 🆘 Troubleshooting

**No cluster data appearing?**
- Check Helius API key is valid
- Verify database tables exist: `SHOW TABLES;`
- Check backend logs for errors

**Webhook not working?**
- Verify webhook URL is publicly accessible
- Check webhook secret matches `HELIUS_WEBHOOK_SECRET`
- Review Helius webhook delivery logs

**WebSocket not connecting?**
- Check browser console for errors
- Verify backend on same domain/port
- Check firewall allows WebSocket (ws://)

**No Telegram alerts?**
- Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` set
- Check Telegram bot is member of chat
- Review backend logs for alert errors

---

## 🎯 What's Ready to Use

✅ Cluster analysis on every token audit  
✅ Insider holding % calculation  
✅ Risk scoring with cluster factor  
✅ Real-time threat detection  
✅ WebSocket alert broadcasting  
✅ Dashboard UI integration  
✅ Database persistence  
✅ Telegram notifications  

---

**Your Solana Forensic Guard V2 is ready! 🛡️**

Start by running: `npm run dev` and testing the cluster analysis on any token.
