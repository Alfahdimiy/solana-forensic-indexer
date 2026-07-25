import express, { Request, Response } from 'express';
import cors from 'cors';
import { pool } from '../config/db';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 1. Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Solana Forensic Indexer API' });
});

// 2. Fetch all flagged tokens with high risk scores
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

// 3. Query specific token security profile by mint address
app.get('/api/tokens/:mint', async (req: Request, res: Response) => {
  const { mint } = req.params;
  try {
    const [tokenRows]: [any[], any] = await pool.query(
      'SELECT * FROM tokens WHERE mint_address = ?',
      [mint]
    );

    if (tokenRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Token mint not indexed.' });
    }

    const [riskRows] = await pool.query(
      'SELECT * FROM risk_logs WHERE mint_address = ? ORDER BY created_at DESC',
      [mint]
    );

    res.json({
      success: true,
      token: tokenRows[0],
      riskHistory: riskRows,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export function startApiServer(): void {
  app.listen(PORT, () => {
    console.log(`🚀 REST API Server running on http://localhost:${PORT}`);
  });
}