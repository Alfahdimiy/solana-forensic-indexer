'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, Search, Activity, AlertTriangle, 
  ExternalLink, RefreshCw, FileText, Cpu, Database, Radio, Filter,
  Copy, Check
} from 'lucide-react';

interface RiskLog {
  mint_address: string;
  decimals: number;
  mint_authority: string | null;
  freeze_authority: string | null;
  signature: string;
  event_type: string;
  risk_score: number;
  flagged_reasons: string[] | string;
  created_at: string;
}

export default function Dashboard() {
  const [logs, setLogs] = useState<RiskLog[]>([]);
  const [searchMint, setSearchMint] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingLogs, setFetchingLogs] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'SAFE'>('ALL');
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);

  const API_BASE = 'http://localhost:3000/api';

  // Copy helper function
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedWallet(label);
    setTimeout(() => setCopiedWallet(null), 2000);
  };

  // Fetch live risk feed from Express API
  const fetchRiskFeed = async () => {
    setFetchingLogs(true);
    try {
      const res = await fetch(`${API_BASE}/tokens/risks`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch risk feed:', err);
    } finally {
      setFetchingLogs(false);
    }
  };

  useEffect(() => {
    fetchRiskFeed();
  }, []);

  // Search specific mint address
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchMint.trim() || loading) return;
    setLoading(true);
    setSearchResult(null);

    try {
      const res = await fetch(`${API_BASE}/tokens/${searchMint.trim()}`);
      const json = await res.json();
      if (json.success) {
        setSearchResult(json);
      } else {
        setSearchResult({ error: 'Token mint not found in indexer database.' });
      }
    } catch (err) {
      setSearchResult({ error: 'Failed to connect to indexer API.' });
    } finally {
      setLoading(false);
    }
  };

  const getRiskBadge = (score: number) => {
    if (score >= 80) return <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-0.5 rounded text-[10px] font-mono tracking-wider font-bold">CRITICAL // {score}</span>;
    if (score >= 50) return <span className="bg-orange-500/10 text-orange-400 border border-orange-500/30 px-2.5 py-0.5 rounded text-[10px] font-mono tracking-wider font-bold">HIGH // {score}</span>;
    if (score >= 25) return <span className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-2.5 py-0.5 rounded text-[10px] font-mono tracking-wider font-bold">MEDIUM // {score}</span>;
    return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded text-[10px] font-mono tracking-wider font-bold">PASS // {score}</span>;
  };

  const filteredLogs = logs.filter((log) => {
    if (filterSeverity === 'CRITICAL') return log.risk_score >= 80;
    if (filterSeverity === 'HIGH') return log.risk_score >= 50 && log.risk_score < 80;
    if (filterSeverity === 'SAFE') return log.risk_score < 50;
    return true;
  });

  const highRiskCount = logs.filter((l) => l.risk_score >= 50).length;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200 p-4 md:p-8 font-mono relative overflow-hidden">
      {/* Visual Ambient Cyber Grids */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a15_1px,transparent_1px),linear-gradient(to_bottom,#0f172a15_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Header Bar */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-cyan-900/40 gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShieldAlert className="w-8 h-8 text-cyan-400 animate-pulse" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black tracking-widest bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 bg-clip-text text-transparent uppercase">
                  SOLANA FORENSIC GUARD
                </h1>
                <span className="bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] px-2 py-0.5 rounded font-bold">
                  v2.4
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-0.5 tracking-tight font-sans">
                Automated On-Chain Threat Telemetry & Anti-Rugpull Signal Pipeline
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded text-xs">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-slate-400">STATUS:</span>
            <span className="text-emerald-400 font-bold">LIVE_PIPELINE</span>
          </div>

          <button 
            onClick={fetchRiskFeed}
            className="flex items-center gap-2 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-700/50 text-cyan-300 px-3.5 py-1.5 rounded text-xs transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchingLogs ? 'animate-spin' : ''}`} />
            REFETCH
          </button>
        </div>
      </header>

      {/* Telemetry Stats Bar */}
      <section className="max-w-7xl mx-auto mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
        <div className="bg-slate-900/70 border border-cyan-900/30 p-3.5 rounded-lg">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>INDEXED EVENTS</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-1">{logs.length}</div>
        </div>

        <div className="bg-slate-900/70 border border-red-900/30 p-3.5 rounded-lg">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>HIGH RISK FLAGS</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold text-red-400 mt-1">{highRiskCount}</div>
        </div>

        <div className="bg-slate-900/70 border border-cyan-900/30 p-3.5 rounded-lg">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>NETWORK NODE</span>
            <Cpu className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-xs font-bold text-teal-400 mt-2 truncate">HELIUS_MAINNET</div>
        </div>

        <div className="bg-slate-900/70 border border-cyan-900/30 p-3.5 rounded-lg">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>STORAGE BACKEND</span>
            <Database className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xs font-bold text-blue-400 mt-2 truncate">MySQL // CONNECTED</div>
        </div>
      </section>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        
        {/* Left Section: Filterable Forensic Event Stream */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold tracking-wider text-slate-300">REALTIME THREAT LOGS</span>
            </div>

            {/* Severity Filter Controls */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <Filter className="w-3 h-3 text-slate-500 mr-1" />
              {(['ALL', 'CRITICAL', 'HIGH', 'SAFE'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setFilterSeverity(sev)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all ${
                    filterSeverity === sev
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                      : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredLogs.length === 0 && !fetchingLogs ? (
              <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-8 text-center text-xs text-slate-600 font-mono">
                [SYSTEM_IDLE] No events matching current severity filter...
              </div>
            ) : (
              filteredLogs.map((item, index) => {
                const reasons = typeof item.flagged_reasons === 'string' 
                  ? JSON.parse(item.flagged_reasons) 
                  : item.flagged_reasons || [];

                return (
                  <div key={index} className="bg-slate-900/80 border border-slate-800/90 rounded-lg p-4 hover:border-cyan-800/60 transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-cyan-300">
                            {item.mint_address.slice(0, 10)}...{item.mint_address.slice(-6)}
                          </span>
                          {getRiskBadge(item.risk_score)}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          EVENT: <span className="text-slate-300">{item.event_type}</span> | TX: {item.signature.slice(0, 12)}...
                        </p>
                      </div>

                      <a 
                        href={`https://solana.fm/address/${item.mint_address}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-slate-600 hover:text-cyan-400 transition-colors p-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* Forensic Reasons Banner */}
                    {reasons.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1">
                        {reasons.map((r: string, rIdx: number) => (
                          <div key={rIdx} className="flex items-center gap-2 text-[11px] text-amber-400/90">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Section: Interactive Forensic Audit Scanner */}
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
              <Search className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold tracking-wider text-slate-300">ON-DEMAND MINT AUDIT</span>
            </div>

            <form onSubmit={handleSearch} className="space-y-3">
              <input
                type="text"
                placeholder="Paste Token Mint Address..."
                value={searchMint}
                onChange={(e) => setSearchMint(e.target.value)}
                className="w-full bg-[#050811] border border-slate-800 rounded px-3 py-2 text-xs font-mono text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-600"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold py-2 rounded text-xs tracking-wider transition-all disabled:opacity-50"
              >
                {loading ? 'ANALYZING ON-CHAIN DATA...' : 'RUN FORENSIC SCAN'}
              </button>
            </form>

            {/* Audit Output Result Card */}
            {searchResult && (
              <div className="mt-5 pt-4 border-t border-slate-800 space-y-3">
                {searchResult.error ? (
                  <p className="text-xs text-red-400 font-mono">[SCAN_ERROR] {searchResult.error}</p>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {/* Extended On-Chain Identity Metrics */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">TOKEN NAME:</span>
                      <span className="font-bold text-cyan-300">
                        {searchResult.liveProfile?.name || 'Unknown'} (${searchResult.liveProfile?.symbol || 'N/A'})
                      </span>
                    </div>

                    {/* CREATOR WALLET WITH CLICK-TO-COPY */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">CREATOR WALLET:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-300">
                          {searchResult.liveProfile?.creatorWallet 
                            ? `${searchResult.liveProfile.creatorWallet.slice(0, 6)}...${searchResult.liveProfile.creatorWallet.slice(-4)}`
                            : 'UNKNOWN / REVOKED'}
                        </span>
                        {searchResult.liveProfile?.creatorWallet && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(searchResult.liveProfile.creatorWallet, 'creator')}
                            title="Copy Creator Wallet Address"
                            className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
                          >
                            {copiedWallet === 'creator' ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-[9px] text-emerald-400 font-bold">COPIED</span>
                              </>
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">PRIMARY MARKET:</span>
                      <span className="font-bold text-teal-400">{searchResult.liveProfile?.tradedMarket || 'Raydium / DEX'}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">POOL LIQUIDITY:</span>
                      <span className="font-bold text-emerald-400">
                        ${(searchResult.liveProfile?.liquidityUsd || 0).toLocaleString()} USD
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">LAUNCH TIME:</span>
                      <span className="text-slate-300">
                        {searchResult.liveProfile?.launchTimestamp 
                          ? new Date(searchResult.liveProfile.launchTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Aged On-Chain'}
                      </span>
                    </div>

                    <div className="my-2 border-t border-slate-800/80" />

                    {/* Authority & Security Controls */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">MINT AUTH:</span>
                      <span className={`font-bold ${searchResult.token?.mint_authority ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {searchResult.token?.mint_authority ? 'ACTIVE ⚠️' : 'REVOKED ✅'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">FREEZE AUTH:</span>
                      <span className={`font-bold ${searchResult.token?.freeze_authority ? 'text-red-400' : 'text-emerald-400'}`}>
                        {searchResult.token?.freeze_authority ? 'ACTIVE 🚨' : 'DISABLED ✅'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">TOP 10 HOLDERS:</span>
                      <span className={`font-bold ${searchResult.liveProfile?.topHolderPercentage > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {searchResult.liveProfile ? `${searchResult.liveProfile.topHolderPercentage}%` : 'N/A'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">LP STATUS:</span>
                      <span className="font-bold text-emerald-400">
                        {searchResult.liveProfile?.isLpBurnedOrLocked ? 'BURNED / LOCKED ✅' : 'UNLOCKED ⚠️'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">DECIMALS:</span>
                      <span className="text-slate-200">{searchResult.token?.decimals}</span>
                    </div>

                    {/* PDF Export Action */}
                    <a
                      href={`${API_BASE}/tokens/${searchResult.token?.mint_address}/report`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 flex items-center justify-center gap-2 w-full bg-slate-950 hover:bg-slate-800 text-cyan-400 font-bold py-2 rounded text-xs border border-cyan-900/60 transition-all"
                    >
                      <FileText className="w-3.5 h-3.5 text-cyan-400" />
                      EXPORT CERTIFICATE (PDF)
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}