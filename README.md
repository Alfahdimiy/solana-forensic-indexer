# 🛡️ Solana Forensic Guard Engine & Threat Indexer
> **Automated On-Chain Threat Telemetry, Token Forensics & Anti-Rugpull Signal Pipeline for Solana Mainnet.**
> solana-forensic-indexer is a full-stack, real-time forensic monitoring and auditing system designed to track token mints, evaluate security profiles, identify high-risk authority anomalies (active mint/freeze authorities, holder concentration), dispatch instant Telegram alerts, generate downloadable PDF audit certificates, and present live telemetry on a Next.js cyber dashboard.

## 📑 Table of Contents
 * Architecture Overview
 * Key Features
 * Tech Stack
 * Project Structure
 * Prerequisites
 * Environment Variables Setup
 * Database Setup (MySQL)
 * Installation & Running Locally
 * REST API Documentation
 * Telegram Alert Pipeline
 * PDF Forensic Audit Engine
 * License

## 🏗️ Architecture Overview

               ┌────────────────────────────────────────────────────────┐
                                     Solana Mainnet / Helius                 
               └───────────────────────────┬────────────────────────────┘
                                            DAS / Web3 RPC
                                                
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
                                  Backend Indexer & Engine                                             
                                                                                                
    ┌────────────────────┐     ┌─────────────────────┐     ┌──────────────────┐      
       On-Chain Listener       ──►      Token Evaluator       ──►   MySQL Database                
      (Program Logs/TX)               (Risk Scoring/DAS)            (tokens / risks)              
    └────────────────────┘     └──────────┬──────────┘     └──────────────────┘      
                                                │                                                     
                                                ├──► Telegram Bot Notifier (Telegraf)                
                                                └──► PDFKit Report Generator                         
└─────────────────────────────────────────┬───────────────────────────────────────┘
                                          REST API (Express)
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
                                      Next.js Cyber UI Dashboard                               
              - Realtime Event Stream     - On-Demand Scanner      - Creator Wallet Copy    
└─────────────────────────────────────────────────────────────────────────────────┘


## ✨ Key Features
 * **Real-time Threat Telemetry:** Listens to live Solana program transactions and logs token events in real time.
 * **On-Demand Forensic Audit:** Scan any SPL Token or Token-2022 mint address to immediately evaluate risk score (0 - 100).
 * **Authority Checks:** Detects active **Mint Authority** (unlimited token printing risk) and **Freeze Authority** (transfer restriction risk).
 * **Top 10 Holder Concentration:** Evaluates top wallet holder percentage using native RPC and Helius DAS fallback parsers.
 * **Metadata & DEX Liquidity Aggregation:** Resolves Token Name, Symbol, Creator Wallet, Traded Market (PumpSwap/Raydium/Meteora), Live USD Liquidity, and Launch Timestamp via Helius and DexScreener APIs.
 * **Multi-Fallback Creator Wallet Extraction:** Resolves creator wallets across DAS creators, authorities, ownership records, and DEX pair metadata.
 * **Telegram Risk Alerts:** Sends dynamic alerts to a Telegram chat formatted with risk badges (🚨 CRITICAL RUG RISK, ⚠️ HIGH RISK, ✅ CLEAN ALPHA TOKEN).
 * **Official PDF Audit Certificates:** Dynamically generates downloadable, signed PDF forensic reports (PDFKit) that combine live on-chain evaluation with historical MySQL risk logs.
 * **Interactive Next.js Dashboard:** Built with Next.js, Tailwind CSS, and Lucide React featuring severity filters (CRITICAL, HIGH, SAFE) and click-to-copy utility for creator wallet addresses.

## 🛠️ Tech Stack
### **Backend & Engine**
 * **Runtime:** Node.js, TypeScript (tsx)
 * **Framework:** Express.js
 * **Blockchain SDKs:** @solana/web3.js, @solana/spl-token, Helius DAS RPC
 * **Database:** MySQL (mysql2 connection pooling)
 * **Telegram Integration:** Telegraf (Telegram Bot API)
 * **PDF Exporter:** PDFKit
### **Frontend Dashboard**
 * **Framework:** Next.js 14 / React 18 (App Router)
 * **Styling:** Tailwind CSS, Cyber/Dark Mode Matrix UI
 * **Icons:** Lucide React

## 📁 Project Structure

solana-forensic-indexer/
├── dashboard/                   # Next.js Frontend Dashboard
│   ├── src/
│   │   └── app/
│   │       ├── layout.tsx
│   │       └── page.tsx         # Realtime Threat Stream & Audit UI
│   ├── public/
│   └── package.json
├── src/                         # Express REST API & Indexer Engine
│   ├── config/
│   │   └── db.ts                # MySQL Connection Pool
│   ├── indexer/
│   │   ├── evaluator.ts         # Token Risk Scoring & DAS Parser
│   │   └── listener.ts          # On-Chain Log Subscription
│   ├── services/
│   │   └── notifier.ts          # Telegram Bot Dispatcher
│   ├── api/
│   │   └── server.ts            # Express REST Routes & PDF Generator
│   └── index.ts                 # Main Entry Point
├── .env.example
├── package.json
├── tsconfig.json
└── README.md

## 📋 Prerequisites
 * **Node.js:** v18.x or higher
 * **npm:** v9.x or higher
 * **MySQL Database:** v8.0 or higher (Local or Remote)
 * **Helius RPC URL:** Mainnet RPC key from Helius.dev
 * **Telegram Bot Token & Chat ID:** Obtained via @BotFather

## 🔑 Environment Variables Setup
Create a .env file in the root directory:

env
# Server Configuration
PORT=3000
NODE_ENV=development

# Solana RPC Endpoint
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY

# MySQL Database Configuration
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=solana_forensic_db

# Telegram Alert Bot Configuration
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyZ
TELEGRAM_CHAT_ID=-1001234567890

## 🗄️ Database Setup (MySQL)
Initialize your MySQL database and create the required schema:

sql
CREATE DATABASE IF NOT EXISTS solana_forensic_db;
USE solana_forensic_db;

-- Tokens Registry Table
CREATE TABLE IF NOT EXISTS tokens (
  mint_address VARCHAR(88) PRIMARY KEY,
  decimals INT NOT NULL DEFAULT 6,
  mint_authority VARCHAR(88) NULL,
  freeze_authority VARCHAR(88) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Security Risk Logs Table
CREATE TABLE IF NOT EXISTS risk_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mint_address VARCHAR(88) NOT NULL,
  signature VARCHAR(128) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  risk_score INT NOT NULL DEFAULT 0,
  flagged_reasons JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mint_address) REFERENCES tokens(mint_address) ON DELETE CASCADE
);

## 🚀 Installation & Running Locally
### 1. Clone the Repository

bash
git clone https://github.com/your-username/solana-forensic-indexer.git
cd solana-forensic-indexer

### 2. Install Backend Dependencies & Start Engine

bash
npm install
npm run dev

The REST API server will start on http://localhost:3000.

### 3. Install & Start Next.js Dashboard UI
Open a new terminal window:

bash
cd dashboard
npm install
npm run dev

The Next.js Cyber UI Dashboard will open on http://localhost:3001.

## 📡 REST API Documentation
### **1. Health Check**
 * **GET** /api/health
 * **Response:**
   ```json
   { "status": "ok", "service": "Solana Forensic Indexer API" }
   
### **2. Fetch Live Flagged Threat Logs**
 * **GET** /api/tokens/risks
 * **Response:** Returns the 50 most recent indexed security risk logs.
### **3. On-Demand Token Mint Audit**
 * **GET** /api/tokens/:mint
 * **Params:** mint — Solana token mint address
 * **Description:** Live-evaluates token metrics on-chain, updates MySQL cache, and triggers Telegram alert if Score === 0 or Score >= 50.
 * **Response Example:**
   ```json
   {
     "success": true,
     "token": {
       "mint_address": "42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump",
       "decimals": 6,
       "mint_authority": null,
       "freeze_authority": null
     },
     "liveProfile": {
       "mintAddress": "42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump",
       "name": "The Bitcoin Bull",
       "symbol": "TBB",
       "creatorWallet": "ATP2cipw8TgLVGWQXGyV3pURUDfg6sVkVEkvPxRnB8BM",
       "launchTimestamp": "2026-01-20T18:59:31.000Z",
       "tradedMarket": "PUMPSWAP",
       "liquidityUsd": 483280.44,
       "riskScore": 0,
       "topHolderPercentage": 34.79,
       "flaggedReasons": []
     }
   }
   
### **4. Export PDF Forensic Audit Certificate**
 * **GET** /api/tokens/:mint/report
 * **Response:** Streams an official PDF audit certificate attachment (Forensic_Audit_<mint>.pdf).
 * **Synchronization Logic:** Aggregates live on-chain evaluation and historical MySQL risk_logs to ensure complete accuracy.
## 📱 Telegram Alert Pipeline
When a token audit is run or an event is flagged on-chain, the bot formats a structured Markdown message dispatched via Telegraf:
```text
✅ CLEAN ALPHA TOKEN / PASSED AUDIT

• Token: The Bitcoin Bull ($TBB)
• Mint: 42cXQvAAr7hcPBPWAS4ocVtDyeJ4Fa6gRR2uG4gppump
• Event: ON_DEMAND_AUDIT
• Risk Score: 0/100
• Mint Auth: REVOKED ✅
• Freeze Auth: DISABLED ✅
• Explorer: View Transaction

*Verification Details:*
• Passed all on-chain safety & holder concentration checks.

## 📜 PDF Forensic Audit Engine
PDFKit dynamically renders:
 1. **Official Engine Header:** Title, timestamp, and audit metadata signature.
 2. **Token Profile & DEX Market Data:** Name, Symbol, Mint Address, Creator Wallet, Primary DEX Market, Live Liquidity USD, Launch Timestamp.
 3. **Authority Checks:** Real-time state of Mint Authority, Freeze Authority, and Top 10 Holder Concentration Share.
 4. **Security Status & Risk Factors:** Color-coded status badge (PASSED, MODERATE RISK, HIGH RISK) and consolidated list of flagged reasons pulled from backend database risk logs.
## 📄 License
Distributed under the **MIT License**. See LICENSE for more details.
