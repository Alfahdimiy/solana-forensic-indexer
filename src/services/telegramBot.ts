import TelegramBot from 'node-telegram-bot-api';
import { pool } from '../config/db.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://ndexer.vercel.app').replace(/\/$/, '');
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

let botInstance: any = null;

export function initTelegramBot(evaluator: any): void {
  if (!TELEGRAM_BOT_TOKEN) {
      console.warn('⚠️ TELEGRAM_BOT_TOKEN is not configured. Telegram bot listener skipped.');
          return;
            }

              if (botInstance) return;

                // Resolves TS2351: "This expression is not constructable"
                  const BotConstructor: any = (TelegramBot as any).default || TelegramBot;
                    botInstance = new BotConstructor(TELEGRAM_BOT_TOKEN, { polling: true });

                      console.log('🤖 Telegram interactive bot listener active.');

                        // /start & /help commands
                          botInstance.onText(/\/start|\/help/, (msg: any) => {
                              const text = `
                              🛡️ *SOLANA FORENSIC GUARD BOT*
                              Live On-Chain Threat Telemetry & Security Engine

                              *Available Commands:*
                              • \`/scan <mint_address>\` — Run an immediate forensic audit.
                              • \`/help\` — Display this menu.
                                  `.trim();

                                      botInstance.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
                                        });

                                          // /scan <mint_address> command
                                            botInstance.onText(/\/scan(?:\s+(.+))?/, async (msg: any, match: any) => {
                                                const chatId = msg.chat.id;
                                                    const rawMint = match?.[1]?.trim();

                                                        if (!rawMint) {
                                                              return botInstance.sendMessage(
                                                                      chatId,
                                                                              '⚠️ *Missing Address*\nUsage: `/scan <mint_address>`',
                                                                                      { parse_mode: 'Markdown' }
                                                                                            );
                                                                                                }

                                                                                                    if (!SOLANA_ADDRESS_REGEX.test(rawMint)) {
                                                                                                          return botInstance.sendMessage(
                                                                                                                  chatId,
                                                                                                                          '❌ *Invalid Solana Mint Address*\nPlease provide a valid Base58 public key (32–44 characters).',
                                                                                                                                  { parse_mode: 'Markdown' }
                                                                                                                                        );
                                                                                                                                            }

                                                                                                                                                const waitMsg = await botInstance.sendMessage(
                                                                                                                                                      chatId,
                                                                                                                                                            `🔍 *Forensic Scan Initiated*\nTarget: \`${rawMint.slice(0, 6)}...${rawMint.slice(-4)}\`\n_Querying Helius RPC & evaluating risk factors..._`,
                                                                                                                                                                  { parse_mode: 'Markdown' }
                                                                                                                                                                      );

                                                                                                                                                                          try {
                                                                                                                                                                                const liveProfile = await evaluator.evaluateToken(rawMint);
                                                                                                                                                                                      await evaluator.saveTokenProfile(liveProfile, 'telegram_scan');

                                                                                                                                                                                            const [tokenRows]: [any[], any] = await pool.query(
                                                                                                                                                                                                    'SELECT * FROM tokens WHERE mint_address = ?',
                                                                                                                                                                                                            [rawMint]
                                                                                                                                                                                                                  );
                                                                                                                                                                                                                        const token = tokenRows[0] || {};

                                                                                                                                                                                                                              const mintAuth = token.mint_authority ? 'ACTIVE ⚠️' : 'REVOKED ✅';
                                                                                                                                                                                                                                    const freezeAuth = token.freeze_authority ? 'ACTIVE 🚨' : 'DISABLED ✅';
                                                                                                                                                                                                                                          const lpStatus = liveProfile.isLpBurnedOrLocked ? 'BURNED / LOCKED ✅' : 'UNLOCKED ⚠️';
                                                                                                                                                                                                                                                const liquidity = liveProfile.liquidityUsd ? `$${Number(liveProfile.liquidityUsd).toLocaleString()} USD` : 'N/A';
                                                                                                                                                                                                                                                      const topHolders = liveProfile.topHolderPercentage !== undefined ? `${liveProfile.topHolderPercentage}%` : 'N/A';

                                                                                                                                                                                                                                                            let riskVerdict = '🟢 PASSED // LOW RISK';
                                                                                                                                                                                                                                                                  if (liveProfile.riskScore >= 80) riskVerdict = '🔴 CRITICAL RISK';
                                                                                                                                                                                                                                                                        else if (liveProfile.riskScore >= 50) riskVerdict = '🟠 HIGH RISK';
                                                                                                                                                                                                                                                                              else if (liveProfile.riskScore > 0) riskVerdict = '🟡 MODERATE RISK';

                                                                                                                                                                                                                                                                                    const report = `
                                                                                                                                                                                                                                                                                    🛡️ *SOLANA FORENSIC AUDIT*
                                                                                                                                                                                                                                                                                    ━━━━━━━━━━━━━━━━━━━━━━
                                                                                                                                                                                                                                                                                    🪙 *Token:* ${liveProfile.name || 'Unknown'} (\`$${liveProfile.symbol || 'N/A'}\`)
                                                                                                                                                                                                                                                                                    📊 *Risk Score:* ${riskVerdict} (\`${liveProfile.riskScore}/100\`)
                                                                                                                                                                                                                                                                                    📍 *Market:* \`${liveProfile.tradedMarket || 'Raydium / DEX'}\`
                                                                                                                                                                                                                                                                                    💧 *Liquidity:* \`${liquidity}\`

                                                                                                                                                                                                                                                                                    *On-Chain Controls:*
                                                                                                                                                                                                                                                                                    • *Mint Authority:* ${mintAuth}
                                                                                                                                                                                                                                                                                    • *Freeze Authority:* ${freezeAuth}
                                                                                                                                                                                                                                                                                    • *LP Status:* ${lpStatus}
                                                                                                                                                                                                                                                                                    • *Top 10 Holders:* \`${topHolders}\`
                                                                                                                                                                                                                                                                                    • *Decimals:* \`${token.decimals ?? 6}\`

                                                                                                                                                                                                                                                                                    *Creator:* \`${liveProfile.creatorWallet || 'UNKNOWN / REVOKED'}\`

                                                                                                                                                                                                                                                                                    📄 [Download PDF Certificate](${FRONTEND_URL}/api/tokens/${rawMint}/report)
                                                                                                                                                                                                                                                                                    🌐 [View on Solana.fm](https://solana.fm/address/${rawMint})
                                                                                                                                                                                                                                                                                          `.trim();

                                                                                                                                                                                                                                                                                                if (waitMsg) {
                                                                                                                                                                                                                                                                                                        await botInstance.editMessageText(report, {
                                                                                                                                                                                                                                                                                                                  chat_id: chatId,
                                                                                                                                                                                                                                                                                                                            message_id: waitMsg.message_id,
                                                                                                                                                                                                                                                                                                                                      parse_mode: 'Markdown',
                                                                                                                                                                                                                                                                                                                                                disable_web_page_preview: true,
                                                                                                                                                                                                                                                                                                                                                        });
                                                                                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                                                                                  } catch (err: any) {
                                                                                                                                                                                                                                                                                                                                                                        console.error('Telegram audit error:', err);
                                                                                                                                                                                                                                                                                                                                                                              if (waitMsg) {
                                                                                                                                                                                                                                                                                                                                                                                      await botInstance.editMessageText(
                                                                                                                                                                                                                                                                                                                                                                                                `🚨 *Scan Error:* Failed to evaluate token mint. (${err.message || 'RPC timeout'})`,
                                                                                                                                                                                                                                                                                                                                                                                                          { chat_id: chatId, message_id: waitMsg.message_id, parse_mode: 'Markdown' }
                                                                                                                                                                                                                                                                                                                                                                                                                  );
                                                                                                                                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                                                                                                                                                              });
                                                                                                                                                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                                                                                                                                              