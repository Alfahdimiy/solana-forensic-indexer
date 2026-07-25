import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, Mint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { pool } from '../config/db.js';

export interface SecurityProfile {
  mintAddress: string;
  name: string;
  symbol: string;
  creatorWallet: string | null;
  launchTimestamp: string | null;
  tradedMarket: string;
  liquidityUsd: number;
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
  private rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  private async fetchHeliusMetadata(mintStr: string) {
    try {
      const res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-asset',
          method: 'getAsset',
          params: { id: mintStr },
        }),
      });
      const json = await res.json();
      const result = json.result;

      const name = result?.content?.metadata?.name || 'Unknown Token';
      const symbol = result?.content?.metadata?.symbol || 'UNKNOWN';

      // Multi-fallback creator address extraction
      let creator: string | null = null;

      // 1. Try DAS creators array
      if (result?.creators && result.creators.length > 0) {
        creator = result.creators[0].address;
      }

      // 2. Try DAS authorities array
      if (!creator && result?.authorities && result.authorities.length > 0) {
        creator = result.authorities[0].address;
      }

      // 3. Try ownership / royalty owner record
      if (!creator && result?.ownership?.owner) {
        creator = result.ownership.owner;
      }

      return { name, symbol, creator };
    } catch {
      return { name: 'Unknown Token', symbol: 'UNKNOWN', creator: null };
    }
  }

  private async fetchMarketData(mintStr: string) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintStr}`);
      const json = await res.json();
      const pair = json.pairs?.[0];

      if (!pair) {
        return { market: 'Unknown / Unlisted DEX', liquidityUsd: 0, createdAt: null, creator: null };
      }

      // Extract creator address if provided in DexScreener pair info
      const creator = pair.info?.socials?.[0]?.url?.includes('pump.fun')
        ? pair.info?.socials?.[0]?.url.split('/').pop()
        : null;

      return {
        market: pair.dexId ? pair.dexId.toUpperCase() : 'RAYDIUM / PUMP.FUN',
        liquidityUsd: pair.liquidity?.usd || 0,
        createdAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
        creator,
      };
    } catch {
      return { market: 'Raydium / DEX', liquidityUsd: 0, createdAt: null, creator: null };
    }
  }

  private async fetchTopHolderConcentration(mintPubkey: PublicKey, totalSupply: bigint): Promise<number> {
    try {
      if (totalSupply === 0n) return 0;

      // 1. Primary Attempt: Native Solana RPC
      const largestAccounts = await this.connection.getTokenLargestAccounts(mintPubkey, 'confirmed');
      const accounts = largestAccounts.value || [];

      if (accounts.length > 0) {
        let top10Supply = 0n;
        for (const acc of accounts.slice(0, 10)) {
          top10Supply += BigInt(acc.amount);
        }
        const percentage = (Number(top10Supply) / Number(totalSupply)) * 100;
        return Number(percentage.toFixed(2));
      }

      // 2. Fallback Attempt: Helius RPC DAS parser for newly launched / Pump.fun tokens
      const res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-holders',
          method: 'getTokenAccounts',
          params: { mint: mintPubkey.toBase58(), limit: 10 },
        }),
      });

      const json = await res.json();
      const tokenAccounts = json.result?.token_accounts || [];

      if (tokenAccounts.length > 0) {
        let top10Supply = 0n;
        for (const acc of tokenAccounts) {
          top10Supply += BigInt(acc.amount || 0);
        }
        const percentage = (Number(top10Supply) / Number(totalSupply)) * 100;
        return Number(percentage.toFixed(2));
      }

      return 0;
    } catch {
      return 0;
    }
  }

  public async evaluateToken(mintAddressStr: string): Promise<SecurityProfile> {
    const mintPubkey = new PublicKey(mintAddressStr);

    // 1. Fetch metadata & market info in parallel
    const [meta, marketData] = await Promise.all([
      this.fetchHeliusMetadata(mintAddressStr),
      this.fetchMarketData(mintAddressStr),
    ]);

    // 2. Fetch mint info on-chain
    let mintInfo: Mint;
    try {
      mintInfo = await getMint(this.connection, mintPubkey, 'confirmed', TOKEN_PROGRAM_ID);
    } catch {
      mintInfo = await getMint(this.connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    }

    // Resolve creator wallet with fallback hierarchy
    const resolvedCreator = meta.creator || marketData.creator || (mintInfo.mintAuthority ? mintInfo.mintAuthority.toBase58() : null);

    // 3. Compute top 10 holders concentration percentage
    const topHolderPercentage = await this.fetchTopHolderConcentration(mintPubkey, mintInfo.supply);

    let riskScore = 0;
    const flaggedReasons: string[] = [];

    const freezeAuth = mintInfo.freezeAuthority ? mintInfo.freezeAuthority.toBase58() : null;
    if (freezeAuth) {
      riskScore += 40;
      flaggedReasons.push('FREEZE_AUTHORITY_ACTIVE: Creator can halt transfers');
    }

    const mintAuth = mintInfo.mintAuthority ? mintInfo.mintAuthority.toBase58() : null;
    if (mintAuth) {
      riskScore += 35;
      flaggedReasons.push('MINT_AUTHORITY_ACTIVE: Creator can print supply');
    }

    if (topHolderPercentage > 40) {
      riskScore += 20;
      flaggedReasons.push(`HIGH_HOLDER_CONCENTRATION: Top 10 wallets hold ${topHolderPercentage}% of supply`);
    }

    return {
      mintAddress: mintAddressStr,
      name: meta.name,
      symbol: meta.symbol,
      creatorWallet: resolvedCreator,
      launchTimestamp: marketData.createdAt,
      tradedMarket: marketData.market,
      liquidityUsd: marketData.liquidityUsd,
      decimals: mintInfo.decimals,
      mintAuthority: mintAuth,
      freezeAuthority: freezeAuth,
      riskScore: Math.min(riskScore, 100),
      flaggedReasons,
      topHolderPercentage,
      isLpBurnedOrLocked: true,
    };
  }

  /**
   * Persists security profiles and flagged risk logs into MySQL database
   */
  public async saveTokenProfile(profile: SecurityProfile, source: string): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO tokens (mint_address, decimals, mint_authority, freeze_authority)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           decimals = VALUES(decimals),
           mint_authority = VALUES(mint_authority),
           freeze_authority = VALUES(freeze_authority)`,
        [
          profile.mintAddress,
          profile.decimals,
          profile.mintAuthority,
          profile.freezeAuthority,
        ]
      );

      if (profile.riskScore > 0) {
        await connection.query(
          `INSERT INTO risk_logs (mint_address, signature, event_type, risk_score, flagged_reasons)
           VALUES (?, ?, 'SECURITY_AUDIT', ?, ?)
           ON DUPLICATE KEY UPDATE risk_score = VALUES(risk_score)`,
          [
            profile.mintAddress,
            source,
            profile.riskScore,
            JSON.stringify(profile.flaggedReasons),
          ]
        );
      }

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