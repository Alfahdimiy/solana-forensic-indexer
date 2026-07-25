import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { pool } from '../config/db';

export interface TokenSecurityProfile {
  mintAddress: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  decimals: number;
  programId: string;
  riskScore: number;
  flaggedReasons: string[];
}

export class TokenEvaluator {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Evaluates on-chain security parameters for a newly detected token mint.
   */
  public async evaluateToken(mintAddressStr: string): Promise<TokenSecurityProfile> {
    const mintPublicKey = new PublicKey(mintAddressStr);
    
    // Fetch raw account info to determine whether it's standard SPL or Token-2022
    const accountInfo = await this.connection.getAccountInfo(mintPublicKey);
    if (!accountInfo) {
      throw new Error(`Account data not found for mint: ${mintAddressStr}`);
    }

    const isToken2022 = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
    const targetProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    // Unpack mint layout data
    const mintData = await getMint(this.connection, mintPublicKey, 'confirmed', targetProgramId);

    const mintAuthority = mintData.mintAuthority ? mintData.mintAuthority.toBase58() : null;
    const freezeAuthority = mintData.freezeAuthority ? mintData.freezeAuthority.toBase58() : null;

    // Compute Security Risk Score
    let riskScore = 0;
    const flaggedReasons: string[] = [];

    if (freezeAuthority) {
      riskScore += 50;
      flaggedReasons.push('FREEZE_AUTHORITY_ACTIVE: Creator can halt transfers/trading');
    }

    if (mintAuthority) {
      riskScore += 35;
      flaggedReasons.push('MINT_AUTHORITY_ACTIVE: Creator can print additional supply');
    }

    if (isToken2022) {
      flaggedReasons.push('TOKEN_2022_EXTENSIONS: Advanced token hooks active');
    }

    return {
      mintAddress: mintAddressStr,
      mintAuthority,
      freezeAuthority,
      decimals: mintData.decimals,
      programId: targetProgramId.toBase58(),
      riskScore: Math.min(riskScore, 100),
      flaggedReasons,
    };
  }

  /**
   * Persists evaluated security flags to MySQL (`tokens` & `risk_logs` tables).
   */
  public async saveTokenProfile(profile: TokenSecurityProfile, signature: string): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Insert or update Token record
      const tokenQuery = `
        INSERT INTO tokens (mint_address, decimals, mint_authority, freeze_authority, program_id)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          mint_authority = VALUES(mint_authority),
          freeze_authority = VALUES(freeze_authority);
      `;
      await connection.execute(tokenQuery, [
        profile.mintAddress,
        profile.decimals,
        profile.mintAuthority,
        profile.freezeAuthority,
        profile.programId,
      ]);

      // 2. Insert Risk Signal entry if risk is detected
      if (profile.riskScore > 0) {
        const riskQuery = `
          INSERT INTO risk_logs (mint_address, signature, event_type, risk_score, flagged_reasons)
          VALUES (?, ?, ?, ?, ?);
        `;
        
        const eventType = profile.freezeAuthority ? 'FREEZE_TRIGGERED' : 'AUTHORITY_CHANGE';

        await connection.execute(riskQuery, [
          profile.mintAddress,
          signature,
          eventType,
          profile.riskScore,
          JSON.stringify(profile.flaggedReasons),
        ]);
      }

      await connection.commit();
      console.log(`💾 Persisted security card for token: ${profile.mintAddress.slice(0, 8)}... (Score: ${profile.riskScore}/100)`);
    } catch (error) {
      await connection.rollback();
      console.error(`❌ Failed to save token evaluation for ${profile.mintAddress}:`, error);
    } finally {
      connection.release();
    }
  }
}