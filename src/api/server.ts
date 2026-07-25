import express, { Request, Response } from 'express';
import cors from 'cors';
import PDFDocument from 'pdfkit';
import { pool } from '../config/db.js';
import { TokenEvaluator } from '../indexer/evaluator.js';
import { sendTelegramRiskAlert } from '../services/notifier.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Enable explicit CORS for Vercel cross-origin requests
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize Evaluator for On-Demand Requests
const evaluator = new TokenEvaluator(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

// 1. Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Solana Forensic Indexer API' });
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

export function startApiServer(): void {
  app.listen(PORT, () => {
    console.log(`🚀 REST API Server running on http://localhost:${PORT}`);
  });
}
