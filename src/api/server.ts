import express, { Request, Response } from 'express';
import cors from 'cors';
import { pool } from '../config/db.js';
import { TokenEvaluator } from '../indexer/evaluator.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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

    // If not in database, execute live on-chain evaluation!
    if (tokenRows.length === 0) {
      console.log(`🔎 Token ${mint.slice(0, 8)}... not in DB. Evaluating on-chain live...`);
      
      const profile = await evaluator.evaluateToken(mint);
      await evaluator.saveTokenProfile(profile, 'api_on_demand_search');

      // Fetch newly created record
      const [newRows]: [any[], any] = await pool.query(
        'SELECT * FROM tokens WHERE mint_address = ?',
        [mint]
      );
      tokenRows = newRows;
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
    res.status(400).json({ 
      success: false, 
      error: `Failed to evaluate token address: ${error.message}` 
    });
  }
});

export function startApiServer(): void {
  app.listen(PORT, () => {
    console.log(`🚀 REST API Server running on http://localhost:${PORT}`);
  });
}