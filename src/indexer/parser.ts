export interface RiskAnalysis {
  eventType: string;
  riskScore: number;
  flaggedReasons: string[];
}

export class ForensicParser {
  /**
   * Analyzes raw Solana transaction logs for forensic risk signals.
   */
  public static analyzeLogs(logs: string[]): RiskAnalysis {
    let riskScore = 0;
    const flaggedReasons: string[] = [];
    let eventType = 'UNKNOWN_INSTRUCTION';

    for (const log of logs) {
      // 1. Freeze Authority Trigger
      if (log.includes('FreezeAccount') || (log.includes('SetAuthority') && log.includes('FreezeAuthority'))) {
        riskScore += 40;
        flaggedReasons.push('Token retains or executes freeze authority');
        eventType = 'FREEZE_RISK';
      }

      // 2. Minting New Tokens
      if (log.includes('MintTo') || log.includes('MintToChecked')) {
        riskScore += 30;
        flaggedReasons.push('Active token minting detected');
        if (eventType === 'UNKNOWN_INSTRUCTION') eventType = 'TOKEN_MINT';
      }

      // 3. Transfer Fee / Tax Modification
      if (log.includes('SetTransferFee') || log.includes('TransferFeeExtension')) {
        riskScore += 35;
        flaggedReasons.push('Transfer fee structure mutated');
        eventType = 'TAX_MUTATION';
      }

      // 4. Liquidity Removal
      if (log.includes('WithdrawLiquidity') || log.includes('RemoveLiquidity')) {
        riskScore += 50;
        flaggedReasons.push('Liquidity pool withdrawal executed');
        eventType = 'LIQUIDITY_DRAIN';
      }
    }

    // Cap maximum risk score at 100
    riskScore = Math.min(riskScore, 100);

    return {
      eventType: eventType !== 'UNKNOWN_INSTRUCTION' ? eventType : 'GENERAL_INSTRUCTION',
      riskScore,
      flaggedReasons,
    };
  }
}