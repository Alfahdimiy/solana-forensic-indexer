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
  const query = `
    CREATE TABLE IF NOT EXISTS risk_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      signature VARCHAR(128) NOT NULL,
      mint_address VARCHAR(88) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      risk_score INT DEFAULT 0,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(query);
  console.log('✅ Connected to MySQL & verified risk_logs table.');
}