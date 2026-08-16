import express, { Request, Response } from 'express';
import cors from 'cors';
import PDFDocument from 'pdfkit';
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { pool } from '../config/db.js';
import { TokenEvaluator } from '../indexer/evaluator.js';
import { sendTelegramRiskAlert } from '../services/notifier.js';
import { clusterAnalyzer } from '../services/clusterAnalyzer.js';
import { threatLogger } from '../services/threatLogger.js';
import { heliusRPC } from '../services/heliusRpc.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for WebSocket support
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store active WebSocket connections
const connectedClients = new Set<WebSocket>();

// Enable explicit CORS for Vercel cross-origin requests
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize Evaluator for On-Demand Requests
const evaluator = new TokenEvaluator(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

// ==========================================
// WebSocket Connection Handler
// ==========================================
wss.on('connection', (ws: WebSocket) => {
  console.log('🔌 WebSocket client connected');
  connectedClients.add(ws);

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
    connectedClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    connectedClients.delete(ws);
  });
});

// ==========================================
// Broadcast function for real-time threats
// ==========================================
function broadcastThreatAlert(alert: any): void {
  const message = JSON.stringify({ type: 'THREAT_ALERT', data: alert });
  connectedClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 1. Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Solana Forensic Indexer API', wsConnected: connectedClients.size });
});

// 2. Fetch all flagged token risks
app.get('/api/tokens/risks', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        t.mint_address,
        t.decimals,
        t.mint_authority,
        t.freeze_authority,
        r.signature,
        r.event_type,
        r.risk_score,
        r.flagged_reasons,
        r.created_at
      FROM risk_logs r
      JOIN tokens t ON r.mint_address = t.mint_address
      ORDER BY r.created_at DESC
      LIMIT 50;
    `);
    res.json({ success: true, count: (rows as any[]).length, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Query or Live-Evaluate Token Security Profile by Mint Address
app.get('/api/tokens/:mint', async (req: Request, res: Response) => {
  const mint = req.params.mint as string;

  try {
    // Check if token exists in MySQL
    let [tokenRows]: [any[], any] = await pool.query(
      'SELECT * FROM tokens WHERE mint_address = ?',
      [mint]
    );

    let liveProfile = null;

    if (tokenRows.length === 0) {
      console.log(`🔎 Token ${mint.slice(0, 8)}... not in DB. Evaluating on-chain live...`);
      
      liveProfile = await evaluator.evaluateToken(mint);
      await evaluator.saveTokenProfile(liveProfile, 'api_on_demand_search');

      const [newRows]: [any[], any] = await pool.query(
        'SELECT * FROM tokens WHERE mint_address = ?',
        [mint]
      );
      tokenRows = newRows;
    } else {
      console.log(`⚡ Token ${mint.slice(0, 8)}... retrieved from MySQL cache.`);
      liveProfile = await evaluator.evaluateToken(mint);
    }

    const [riskRows] = await pool.query(
      'SELECT * FROM risk_logs WHERE mint_address = ? ORDER BY created_at DESC',
      [mint]
    );

    // 📡 TRIGGER TELEGRAM ALERT: Dispatch with Token Name & Symbol
    if (liveProfile) {
      if (liveProfile.riskScore === 0 || liveProfile.riskScore >= 50) {
        await sendTelegramRiskAlert({
          mintAddress: liveProfile.mintAddress,
          name: liveProfile.name,
          symbol: liveProfile.symbol,
          eventType: 'ON_DEMAND_AUDIT',
          riskScore: liveProfile.riskScore,
          reasons: liveProfile.flaggedReasons,
          signature: 'api_on_demand_search',
        });
      }
    }

    res.json({
      success: true,
      token: tokenRows[0],
      liveProfile,
      riskHistory: riskRows,
    });
  } catch (error: any) {
    res.status(400).json({ 
      success: false, 
      error: `Failed to evaluate token address: ${error.message}` 
    });
  }
});

// 4. Downloadable PDF Forensic Audit Report Endpoint (Synchronized with MySQL Risk Engine & Live Profile)
app.get('/api/tokens/:mint/report', async (req: Request, res: Response) => {
  const mint = req.params.mint as string;

  try {
    const [rows]: [any[], any] = await pool.query(
      'SELECT * FROM tokens WHERE mint_address = ?',
      [mint]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Token not found in indexer database.' });
    }

    const token = rows[0];

    // 1. Live on-chain evaluation for real-time holder share, liquidity & market metadata
    const liveProfile = await evaluator.evaluateToken(mint);

    // 2. Fetch all recorded risk events from MySQL database engine
    const [riskRows]: [any[], any] = await pool.query(
      'SELECT * FROM risk_logs WHERE mint_address = ? ORDER BY risk_score DESC',
      [mint]
    );

    // 3. Aggregate highest risk score between live calculation and indexed DB logs
    const highestDbScore = riskRows.length > 0 ? riskRows[0].risk_score : 0;
    const finalRiskScore = Math.max(liveProfile.riskScore, highestDbScore);

    // 4. Consolidate and deduplicate flagged reasons from both sources
    const dbReasons: string[] = [];
    riskRows.forEach((r: any) => {
      try {
        const parsed = typeof r.flagged_reasons === 'string' ? JSON.parse(r.flagged_reasons) : r.flagged_reasons;
        if (Array.isArray(parsed)) dbReasons.push(...parsed);
      } catch {}
    });

    const allFlaggedReasons = Array.from(new Set([...liveProfile.flaggedReasons, ...dbReasons]));

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Forensic_Audit_${mint.slice(0, 8)}.pdf"`);

    doc.pipe(res);

    // Title & Header
    doc.fontSize(20).fillColor('#0f172a').text('SOLANA FORENSIC GUARD ENGINE', { align: 'center' });
    doc.fontSize(10).fillColor('#64748b').text('Official On-Chain Security Audit & Metadata Certificate', { align: 'center' });
    doc.moveDown(1.5);

    // Section 1: Token Identity & Market Profile
    doc.fontSize(12).fillColor('#0f172a').text('Token Profile & Market Metadata', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Token Name: ${liveProfile.name || 'Unknown'} ($${liveProfile.symbol || 'UNKNOWN'})`);
    doc.text(`Mint Address: ${token.mint_address}`);
    doc.text(`Creator Wallet: ${liveProfile.creatorWallet || 'UNKNOWN / DECENTRALIZED'}`);
    doc.text(`Traded DEX / Market: ${liveProfile.tradedMarket || 'Raydium / Pump.fun'}`);
    doc.text(`Live Pool Liquidity: $${(liveProfile.liquidityUsd || 0).toLocaleString()} USD`);
    doc.text(`Launch Timestamp: ${liveProfile.launchTimestamp || 'Aged On-Chain'}`);
    doc.text(`Decimals: ${token.decimals}`);
    doc.moveDown(1.5);

    // Section 2: Authority & Holder Distribution
    doc.fontSize(12).fillColor('#0f172a').text('On-Chain Authority & Concentration Checks', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Mint Authority: ${token.mint_authority ? 'ACTIVE [FLAGGED]' : 'REVOKED [SAFE]'}`);
    doc.text(`Freeze Authority: ${token.freeze_authority ? 'ACTIVE [FLAGGED]' : 'DISABLED [SAFE]'}`);
    doc.text(`Top 10 Holders Share: ${liveProfile.topHolderPercentage}% ${liveProfile.topHolderPercentage > 40 ? '[HIGH CONCENTRATION]' : '[HEALTHY]'}`);
    doc.moveDown(1.5);

    // Section 3: Status Verification & Risk Classification
    doc.fontSize(12).fillColor('#0f172a').text('Security Verification Status', { underline: true });
    doc.moveDown(0.5);

    if (finalRiskScore >= 50) {
      doc.fontSize(12).fillColor('#dc2626').text(`STATUS: HIGH RISK // FLAGGED (Score: ${finalRiskScore}/100)`);
    } else if (finalRiskScore > 0) {
      doc.fontSize(12).fillColor('#d97706').text(`STATUS: MODERATE RISK // WARNINGS DETECTED (Score: ${finalRiskScore}/100)`);
    } else {
      doc.fontSize(12).fillColor('#059669').text(`STATUS: PASSED // LOW RISK (Score: ${finalRiskScore}/100)`);
    }

    doc.moveDown(0.5);

    // Section 4: Consolidated Risk Listing
    if (allFlaggedReasons.length > 0) {
      doc.fontSize(10).fillColor('#0f172a').text('Risk Factors Identified by Backend Engine:');
      doc.moveDown(0.3);
      allFlaggedReasons.forEach((reason) => {
        doc.fontSize(9).fillColor('#b45309').text(`• ${reason}`);
      });
    } else {
      doc.fontSize(9).fillColor('#334155').text('No active mint/freeze authorities or holder concentration anomalies detected on-chain.');
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#94a3b8').text(`Generated: ${new Date().toISOString()}`, { align: 'right' });

    doc.end();
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// NEW ENDPOINTS: Feature 1 - Cluster Analysis
// ==========================================

// 5. Get cluster analysis for a token (Funder Clustering)
app.get('/api/tokens/:mint/clusters', async (req: Request, res: Response) => {
  const mint = req.params.mint as string;

  try {
    let analysis = await clusterAnalyzer.getClusterAnalysis(mint);

    // If not cached, run analysis now
    if (!analysis) {
      analysis = await clusterAnalyzer.analyzeTokenClustering(mint);
    }

    // Fetch threat summary
    const [threatRows] = await pool.query(
      `SELECT COUNT(*) as threat_count, threat_status FROM realtime_threat_logs 
       WHERE mint_address = ? AND logged_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
       GROUP BY threat_status`,
      [mint]
    );

    res.json({
      success: true,
      clusters: analysis,
      recentThreats: threatRows,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Subscribe token clusters to webhook monitoring (Feature 2)
app.post('/api/tokens/:mint/subscribe', async (req: Request, res: Response) => {
  const mint = req.params.mint as string;
  const { clusterIds, autoSubscribeTopHolders } = req.body;

  try {
    const analysis = await clusterAnalyzer.getClusterAnalysis(mint);

    if (!analysis) {
      return res.status(404).json({ success: false, error: 'Cluster analysis not found for token' });
    }

    let subscribedWallets: string[] = [];

    // Subscribe specified clusters
    if (clusterIds && Array.isArray(clusterIds)) {
      for (const cluster of analysis.clusters) {
        if (clusterIds.includes(cluster.clusterId)) {
          await clusterAnalyzer.subscribeClusterToMonitoring(mint, cluster.clusterId, cluster.childWallets);
          subscribedWallets.push(...cluster.childWallets);
        }
      }
    }

    // Auto-subscribe top holders if requested
    if (autoSubscribeTopHolders) {
      for (const cluster of analysis.clusters) {
        await clusterAnalyzer.subscribeClusterToMonitoring(mint, cluster.clusterId, cluster.childWallets);
        subscribedWallets.push(...cluster.childWallets);
      }
    }

    res.json({
      success: true,
      subscribed: subscribedWallets.length,
      wallets: subscribedWallets,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// NEW ENDPOINTS: Feature 2 - Threat Detection
// ==========================================

// 7. Helius Webhook Receiver (Insider Activity Detection)
app.post('/api/webhook/helius', async (req: Request, res: Response) => {
  try {
    // Validate webhook signature
    const signature = req.headers['x-helius-signature'] as string;
    const payload = JSON.stringify(req.body);

    if (signature && !heliusRPC.validateWebhookSignature(payload, signature)) {
      console.warn('⚠️  Invalid webhook signature');
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    const event = req.body;
    const details = heliusRPC.parseWebhookEvent(event);

    if (!details) {
      return res.status(400).json({ success: false, error: 'Invalid event format' });
    }

    console.log(`📨 Webhook received: ${details.eventType} from ${details.source.slice(0, 8)}...`);

    // 1. Check if source wallet is being monitored
    const monitoringInfo = await threatLogger.getWalletMonitoringInfo(details.source);

    if (monitoringInfo.isMonitored) {
      // 2. Log as critical threat
      const threatId = await threatLogger.logThreat({
        mintAddress: monitoringInfo.tokens[0] || '',
        clusterId: monitoringInfo.clusters[0] || 'unknown',
        threatWallet: details.source,
        eventType: details.eventType as any,
        transactionHash: details.signature,
        transactionAmount: details.amount ? BigInt(details.amount) : undefined,
        transactionType: 'INSIDER_ACTIVITY',
        threatStatus: 'CRITICAL',
        webhookReceivedAt: new Date(),
      });

      // 3. Broadcast real-time alert to WebSocket clients
      broadcastThreatAlert({
        threatId,
        mint: monitoringInfo.tokens[0],
        wallet: details.source,
        eventType: details.eventType,
        transactionHash: details.signature,
        message: `🚨 INSIDER DUMP DETECTED: ${details.eventType} from monitored wallet`,
        severity: 'CRITICAL',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true, received: true });
  } catch (error: any) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Get real-time threats for a token
app.get('/api/tokens/:mint/threats', async (req: Request, res: Response) => {
  const mint = req.params.mint as string;
  const { hours = '24' } = req.query;

  try {
    const threats = await threatLogger.getRecentThreats(mint, parseInt(hours as string));

    res.json({
      success: true,
      count: threats.length,
      threats,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Get active critical threats (dashboard)
app.get('/api/threats/critical', async (req: Request, res: Response) => {
  try {
    const threats = await threatLogger.getActiveCriticalThreats();

    res.json({
      success: true,
      criticalCount: threats.length,
      threats,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Unsubscribe wallet from monitoring
app.post('/api/webhooks/unsubscribe', async (req: Request, res: Response) => {
  const { walletAddress } = req.body;

  try {
    await threatLogger.unsubscribeWallet(walletAddress);

    res.json({
      success: true,
      message: `${walletAddress.slice(0, 8)}... unsubscribed from monitoring`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export function startApiServer(): void {
  server.listen(PORT, () => {
    console.log(`🚀 REST API Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket server ready at ws://localhost:${PORT}`);
  });
}
