import { Telegraf } from 'telegraf';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

const bot = botToken ? new Telegraf(botToken) : null;

export async function sendTelegramRiskAlert(data: {
  mintAddress: string;
  name?: string;
  symbol?: string;
  eventType: string;
  riskScore: number;
  reasons: string[];
  signature: string;
}): Promise<void> {
  if (!bot || !chatId) {
    return; // Silently skip if bot token/chat ID aren't configured in .env
  }

  // Dynamic status badges
  let badge = '⚠️ HIGH RISK DETECTED';
  if (data.riskScore >= 80) {
    badge = '🚨 CRITICAL RUG RISK';
  } else if (data.riskScore === 0) {
    badge = '✅ CLEAN ALPHA TOKEN / PASSED AUDIT';
  }

  const isClean = data.riskScore === 0;
  const tokenLabel = data.name && data.symbol ? `*${data.name}* (\`$${data.symbol}\`)` : '`' + data.mintAddress + '`';

  const message = `
${badge}

• Token: ${tokenLabel}
• Mint: \`${data.mintAddress}\`
• Event: *${data.eventType}*
• Risk Score: *${data.riskScore}/100*
• Mint Auth: *${isClean ? 'REVOKED ✅' : 'CHECK REQUIRED'}*
• Freeze Auth: *${isClean ? 'DISABLED ✅' : 'CHECK REQUIRED'}*
• Explorer: [View Transaction](https://solana.fm/tx/${data.signature})

${
  data.reasons.length > 0
    ? `*Flagged Reasons:*\n${data.reasons.map((r) => `• ${r}`).join('\n')}`
    : `*Verification Details:*\n• Passed all on-chain safety & holder concentration checks.`
}
  `.trim();

  try {
    await bot.telegram.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true } 
    });
    console.log(`📱 Telegram notification dispatched for ${data.mintAddress.slice(0, 8)}...`);
  } catch (err: any) {
    console.error(`❌ Failed to send Telegram alert:`, err.message);
  }
}