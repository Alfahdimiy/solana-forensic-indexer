import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const DASHBOARD_URL = process.env.FRONTEND_URL || 'https://ndexer.vercel.app';

// Initialize bot with polling mode (or webhook mode)
export const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Solana base58 address validation (32 to 44 characters)
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Replace this with a direct call to your internal audit function
 * or keep it fetching your local Express endpoint.
 */
async function auditToken(mintAddress: string) {
  const localPort = process.env.PORT || 3000;
  const res = await fetch(`http://localhost:${localPort}/api/tokens/${mintAddress}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export function initTelegramCommands() {
  console.log('🤖 Telegram interactive bot listener initialized.');

  // /start and /help command
  bot.onText(/\/start|\/help/, (msg) => {
    const chatId = msg.chat.id;
    const text = `
🛡️ *SOLANA FORENSIC GUARD BOT*
Automated On-Chain Threat Telemetry & Audit

*Commands:*
• \`/scan <mint_address>\` - Run immediate forensic audit on any SPL token.
• \`/help\` - View available commands.
    `.trim();

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  });

  // /scan <mint> command
  bot.onText(/\/scan(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const inputAddress = match?.[1]?.trim();

    if (!inputAddress) {
      return bot.sendMessage(
        chatId,
        '⚠️ *Missing Address*\nUsage: `/scan <mint_address>`',
        { parse_mode: 'Markdown' }
      );
    }

    if (!SOLANA_ADDRESS_REGEX.test(inputAddress)) {
      return bot.sendMessage(
        chatId,
        '❌ *Invalid Solana Mint Address*\nPlease provide a valid Base58 public key (32-44 characters).',
        { parse_mode: 'Markdown' }
      );
    }

    const waitMsg = await bot.sendMessage(
      chatId,
      `🔍 *Analyzing on-chain metrics for:* \`${inputAddress.slice(0, 6)}...${inputAddress.slice(-4)}\`\n_Querying Helius RPC & checking risk telemetry..._`,
      { parse_mode: 'Markdown' }
    );

    try {
      const data = await auditToken(inputAddress);

      if (!data.success) {
        return bot.editMessageText(
          `❌ *Audit Failed:* ${data.error || 'Token not found or RPC error.'}`,
          { chat_id: chatId, message_id: waitMsg.message_id, parse_mode: 'Markdown' }
        );
      }

      const { liveProfile, token } = data;

      // Extract risk parameters[span_0](start_span)[span_0](end_span)[span_1](start_span)[span_1](end_span)[span_2](start_span)[span_2](end_span)
      const mintAuthText = token?.mint_authority ? 'ACTIVE ⚠️' : 'REVOKED ✅'; //[span_3](start_span)[span_3](end_span)[span_4](start_span)[span_4](end_span)
      const freezeAuthText = token?.freeze_authority ? 'ACTIVE 🚨' : 'DISABLED ✅'; //[span_5](start_span)[span_5](end_span)[span_6](start_span)[span_6](end_span)
      const lpText = liveProfile?.isLpBurnedOrLocked ? 'BURNED / LOCKED ✅' : 'UNLOCKED ⚠️'; //[span_7](start_span)[span_7](end_span)
      const topHolders = liveProfile?.topHolderPercentage !== undefined ? `${liveProfile.topHolderPercentage}%` : 'N/A'; //[span_8](start_span)[span_8](end_span)
      const liquidity = liveProfile?.liquidityUsd ? `$${Number(liveProfile.liquidityUsd).toLocaleString()} USD` : 'N/A'; //[span_9](start_span)[span_9](end_span)[span_10](start_span)[span_10](end_span)
      const market = liveProfile?.tradedMarket || 'Raydium / DEX'; //[span_11](start_span)[span_11](end_span)[span_12](start_span)[span_12](end_span)

      // Format audit response matching dashboard aesthetics[span_13](start_span)[span_13](end_span)[span_14](start_span)[span_14](end_span)
      const response = `
🛡️ *SOLANA FORENSIC AUDIT REPORT*
━━━━━━━━━━━━━━━━━━━━━━
🪙 *Token:* ${liveProfile?.name || 'Unknown'} (\`$${liveProfile?.symbol || 'N/A'}\`)
📍 *Market:* \`${market}\`
💧 *Liquidity:* \`${liquidity}\`

*On-Chain Security Controls:*
• *Mint Authority:* ${mintAuthText}
• *Freeze Authority:* ${freezeAuthText}
• *LP Status:* ${lpText}
• *Top 10 Holders:* \`${topHolders}\`
• *Decimals:* \`${token?.decimals ?? 6}\`

*Creator:* \`${liveProfile?.creatorWallet || 'UNKNOWN / REVOKED'}\`

📄 [Download PDF Certificate](${DASHBOARD_URL}/api/tokens/${token?.mint_address || inputAddress}/report)
🌐 [View on Solana.fm](https://solana.fm/address/${token?.mint_address || inputAddress})
      `.trim(); //[span_15](start_span)[span_15](end_span)[span_16](start_span)[span_16](end_span)

      await bot.editMessageText(response, {
        chat_id: chatId,
        message_id: waitMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });

    } catch (err: any) {
      bot.editMessageText(
        `🚨 *Audit Error:* Could not process token scan. (${err.message || 'Internal error'})`,
        { chat_id: chatId, message_id: waitMsg.message_id, parse_mode: 'Markdown' }
      );
    }
  });
}

