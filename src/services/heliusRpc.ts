import fetch from 'node-fetch';

export interface HeliusTransaction {
  signature: string;
  type: string;
  timestamp: number;
  source?: string;
  destination?: string;
  tokenTransfers?: any[];
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: bigint;
  }>;
  actions?: Array<{
    type: string;
    program: string;
    info?: any;
  }>;
}

export interface HeliusWebhookEvent {
  webhookID: string;
  type: string;
  timestamp: number;
  transactionDetails: {
    signature: string;
    type: string;
    source: string;
    description: string;
    tokenTransfers?: Array<{
      fromTokenAccount: string;
      toTokenAccount: string;
      fromUserAccount: string;
      toUserAccount: string;
      tokenMint: string;
      tokenStandard: string;
      amount: string;
    }>;
    nativeTransfers?: Array<{
      fromUserAccount: string;
      toUserAccount: string;
      amount: string;
    }>;
  };
}

/**
 * HeliusRPC Service - Enhanced transaction history and webhook parsing
 * Uses Helius API key to query transaction history and parse webhook events
 */
export class HeliusRPC {
  private heliusApiKey: string;
  private heliusUrl: string;

  constructor(apiKey: string = process.env.HELIUS_API_KEY || '') {
    if (!apiKey) {
      console.warn('⚠️  HELIUS_API_KEY not provided - some features may be limited');
    }
    this.heliusApiKey = apiKey;
    this.heliusUrl = `https://api.helius.xyz/v0`;
  }

  /**
   * Fetch earliest incoming SOL transfer to identify parent funder
   * Traces back to find the origin funding source
   */
  async findEarliestIncomingTransfer(walletAddress: string): Promise<{
    earliestTx: string | null;
    parentFunder: string | null;
    timestamp: number | null;
  }> {
    try {
      const endpoint = `${this.heliusUrl}/addresses/${walletAddress}/transactions?api-key=${this.heliusApiKey}`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.statusText}`);
      }

      const transactions = (await response.json()) as HeliusTransaction[];

      // Filter for native SOL incoming transfers only
      const incomingTransfers = transactions
        .filter((tx) => {
          const nativeTransfers = tx.nativeTransfers || [];
          return nativeTransfers.some((t) => t.toUserAccount === walletAddress);
        })
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      if (incomingTransfers.length === 0) {
        return { earliestTx: null, parentFunder: null, timestamp: null };
      }

      const earliestTx = incomingTransfers[0];
      const nativeTransfer = (earliestTx.nativeTransfers || []).find((t) => t.toUserAccount === walletAddress);

      return {
        earliestTx: earliestTx.signature,
        parentFunder: nativeTransfer?.fromUserAccount || null,
        timestamp: earliestTx.timestamp || null,
      };
    } catch (error) {
      console.error(`❌ Error fetching earliest transfer for ${walletAddress}:`, error);
      return { earliestTx: null, parentFunder: null, timestamp: null };
    }
  }

  /**
   * Get transaction history with detailed token transfer information
   */
  async getTransactionHistory(
    walletAddress: string,
    limit: number = 50
  ): Promise<HeliusTransaction[]> {
    try {
      const endpoint = `${this.heliusUrl}/addresses/${walletAddress}/transactions?api-key=${this.heliusApiKey}&limit=${limit}`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.statusText}`);
      }

      return (await response.json()) as HeliusTransaction[];
    } catch (error) {
      console.error(`❌ Error fetching transaction history for ${walletAddress}:`, error);
      return [];
    }
  }

  /**
   * Parse incoming webhook event from Helius
   * Extracts relevant transaction details for threat detection
   */
  parseWebhookEvent(event: any): {
    signature: string;
    source: string;
    eventType: string;
    tokenMint?: string;
    amount?: string;
    timestamp: number;
  } | null {
    try {
      const details = event.transactionDetails || {};

      // Identify event type based on transaction structure
      let eventType = 'UNKNOWN';
      let tokenMint: string | undefined;
      let amount: string | undefined;

      // Check for token transfers (DEX swap, transfers)
      if (details.tokenTransfers && details.tokenTransfers.length > 0) {
        const transfer = details.tokenTransfers[0];
        tokenMint = transfer.tokenMint;
        amount = transfer.amount;

        // Classify based on program type
        if (details.type === 'SWAP') {
          eventType = 'DEX_SWAP';
        } else if (details.type === 'TOKEN_BURN' || details.description.includes('burn')) {
          eventType = 'TOKEN_BURN';
        } else {
          eventType = 'TRANSFER';
        }
      }

      // Check for liquidity removal
      if (details.description && details.description.toLowerCase().includes('remove')) {
        eventType = 'LIQUIDITY_REMOVAL';
      }

      return {
        signature: details.signature || '',
        source: details.source || '',
        eventType,
        tokenMint,
        amount,
        timestamp: event.timestamp || Date.now(),
      };
    } catch (error) {
      console.error('❌ Error parsing webhook event:', error);
      return null;
    }
  }

  /**
   * Validate webhook signature (HMAC)
   * Helius sends X-HELIUS-SECRET header with HMAC-SHA256 signature
   */
  validateWebhookSignature(payload: string, signature: string, secret: string = process.env.HELIUS_WEBHOOK_SECRET || ''): boolean {
    try {
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const digest = hmac.digest('hex');
      return digest === signature;
    } catch (error) {
      console.error('❌ Error validating webhook signature:', error);
      return false;
    }
  }

  /**
   * Fetch account info including balance and token accounts
   */
  async getAccountInfo(walletAddress: string): Promise<{ balance: number; tokenAccounts: number } | null> {
    try {
      const endpoint = `${this.heliusUrl}/accounts/${walletAddress}?api-key=${this.heliusApiKey}`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as any;
      return {
        balance: data.solBalance || 0,
        tokenAccounts: data.tokens?.length || 0,
      };
    } catch (error) {
      console.error(`❌ Error fetching account info for ${walletAddress}:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const heliusRPC = new HeliusRPC();
