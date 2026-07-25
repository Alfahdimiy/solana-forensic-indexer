import { Telegraf } from 'telegraf';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

const bot = botToken ? new Telegraf(botToken) : null;

export async function sendTelegramRiskAlert(data: {
  mintAddress: string;
  eventType: string;
  riskScore: number;
  reasons: string[];
  signature: string;
}): Promise<void> {
  if (!bot || !chatId) {
    return; // Silently skip if bot token/chat ID aren't configured in .env
  }

  const badge = data.riskScore >= 80 ? '🚨 CRITICAL RUG RISK' : '⚠️ HIGH RISK DETECTED';
  
  const message = `
${badge}

• Mint: \`${data.mintAddress}\`
• Event: *${data.eventType}*
• Score: *${data.riskScore}/100*
• Tx: [View Explorer](https://solana.fm/tx/${data.signature})

*Flagged Reasons:*
${data.reasons.map((r) => `• ${r}`).join('\n')}
  `.trim();

  try {
    await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log(`📱 Telegram alert dispatched for ${data.mintAddress.slice(0, 8)}...`);
  } catch (err: any) {
    console.error(`❌ Failed to send Telegram alert:`, err.message);
  }
}