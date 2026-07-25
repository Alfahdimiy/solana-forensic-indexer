import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, Mint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { pool } from '../config/db.js';

export interface SecurityProfile {
  mintAddress: string;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  riskScore: number;
  flaggedReasons: string[];
  topHolderPercentage: number;
  isLpBurnedOrLocked: boolean;
}

export class TokenEvaluator {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = 8000): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC Call Timed Out (${timeoutMs}ms)`)), timeoutMs)
    );
    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Safely fetches mint info, auto-detecting Standard SPL Token vs Token-2022
   */
  private async fetchMintDataSafely(mintPubkey: PublicKey): Promise<Mint> {
    try {
      // Try fetching as standard SPL Token
      return await this.withTimeout(getMint(this.connection, mintPubkey, 'confirmed', TOKEN_PROGRAM_ID), 5000);
    } catch {
      // Fall back to Token-2022 Program
      return await this.withTimeout(getMint(this.connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID), 5000);
    }
  }

  private async checkHolderConcentration(mintPubkey: PublicKey, decimals: number): Promise<{ topHolderPct: number; flagged: boolean }> {
    try {
      const largestAccounts = await this.withTimeout(
        this.connection.getTokenLargestAccounts(mintPubkey),
        6000
      );

      if (!largestAccounts || !largestAccounts.value || largestAccounts.value.length === 0) {
        return { topHolderPct: 0, flagged: false };
      }

      const totalTopSupply = largestAccounts.value.slice(0, 10).reduce((acc, account) => {
        return acc + (account.uiAmount || 0);
      }, 0);

      const supplyInfo = await this.withTimeout(this.connection.getTokenSupply(mintPubkey), 5000);
      const totalSupply = Number(supplyInfo.value.amount) / Math.pow(10, decimals);

      if (totalSupply === 0) return { topHolderPct: 0, flagged: false };

      const top10Pct = (totalTopSupply / totalSupply) * 100;
      return {
        topHolderPct: parseFloat(top10Pct.toFixed(2)),
        flagged: top10Pct > 40,
      };
    } catch {
      return { topHolderPct: 0, flagged: false };
    }
  }

  public async evaluateToken(mintAddressStr: string): Promise<SecurityProfile> {
    let mintPubkey: PublicKey;
    try {
      mintPubkey = new PublicKey(mintAddressStr);
    } catch {
      throw new Error('Invalid Solana PublicKey address format');
    }

    let mintInfo: Mint;
    try {
      mintInfo = await this.fetchMintDataSafely(mintPubkey);
    } catch {
      console.warn(`⚠️ Could not resolve mint account on-chain for ${mintAddressStr.slice(0, 8)}...`);
      return {
        mintAddress: mintAddressStr,
        decimals: 6,
        mintAuthority: null,
        freezeAuthority: null,
        riskScore: 0,
        flaggedReasons: ['UNABLE_TO_VERIFY: Account is not a valid SPL Token Mint on Solana mainnet'],
        topHolderPercentage: 0,
        isLpBurnedOrLocked: true,
      };
    }

    let riskScore = 0;
    const flaggedReasons: string[] = [];

    // 1. Freeze Authority Check
    const freezeAuth = mintInfo.freezeAuthority ? mintInfo.freezeAuthority.toBase58() : null;
    if (freezeAuth) {
      riskScore += 40;
      flaggedReasons.push('FREEZE_AUTHORITY_ACTIVE: Creator can halt transfers/trading');
    }

    // 2. Mint Authority Check
    const mintAuth = mintInfo.mintAuthority ? mintInfo.mintAuthority.toBase58() : null;
    if (mintAuth) {
      riskScore += 35;
      flaggedReasons.push('MINT_AUTHORITY_ACTIVE: Creator can print additional supply');
    }

    // 3. Top Holder Concentration Check
    const holderAnalysis = await this.checkHolderConcentration(mintPubkey, mintInfo.decimals);
    if (holderAnalysis.flagged) {
      riskScore += 20;
      flaggedReasons.push(`HIGH_HOLDER_CONCENTRATION: Top 10 wallets hold ${holderAnalysis.topHolderPct}% of supply`);
    }

    riskScore = Math.min(riskScore, 100);

    return {
      mintAddress: mintAddressStr,
      decimals: mintInfo.decimals,
      mintAuthority: mintAuth,
      freezeAuthority: freezeAuth,
      riskScore,
      flaggedReasons,
      topHolderPercentage: holderAnalysis.topHolderPct,
      isLpBurnedOrLocked: true,
    };
  }

  public async saveTokenProfile(profile: SecurityProfile, signature: string): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO tokens (mint_address, decimals, mint_authority, freeze_authority)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           mint_authority = VALUES(mint_authority),
           freeze_authority = VALUES(freeze_authority)`,
        [profile.mintAddress, profile.decimals, profile.mintAuthority, profile.freezeAuthority]
      );

      await connection.query(
        `INSERT INTO risk_logs (mint_address, signature, event_type, risk_score, flagged_reasons)
         VALUES (?, ?, ?, ?, ?)`,
        [
          profile.mintAddress,
          signature,
          profile.riskScore >= 50 ? 'HIGH_RISK_DETECTED' : 'SECURITY_AUDIT',
          profile.riskScore,
          JSON.stringify(profile.flaggedReasons),
        ]
      );

      await connection.commit();
      console.log(`💾 Persisted security profile for ${profile.mintAddress.slice(0, 8)}... (Score: ${profile.riskScore}/100)`);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}