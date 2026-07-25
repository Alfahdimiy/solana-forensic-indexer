'use client';

import React, { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, Search, Activity, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

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

  const API_BASE = 'http://localhost:3000/api';

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
    if (!searchMint.trim()) return;
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
    if (score >= 80) return <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-full text-xs font-semibold">CRITICAL ({score})</span>;
    if (score >= 50) return <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-full text-xs font-semibold">HIGH ({score})</span>;
    if (score >= 25) return <span className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2.5 py-1 rounded-full text-xs font-semibold">MEDIUM ({score})</span>;
    return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-semibold">LOW ({score})</span>;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between pb-8 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-cyan-400" />
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Solana Forensic Guard Engine
            </h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">Real-time rug pull detection & on-chain token signal engine</p>
        </div>

        <button 
          onClick={fetchRiskFeed}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-4 py-2 rounded-lg text-sm text-slate-300 transition-all self-start md:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${fetchingLogs ? 'animate-spin' : ''}`} />
          Refresh Pipeline
        </button>
      </header>

      <main className="max-w-7xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left / Main Section: Live Risk Stream */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Live Flagged Risk Feed
            </h2>
            <span className="text-xs bg-slate-900 text-slate-400 border border-slate-800 px-3 py-1 rounded-full">
              {logs.length} Events Indexed
            </span>
          </div>

          <div className="space-y-4">
            {logs.length === 0 && !fetchingLogs ? (
              <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-8 text-center text-slate-500">
                No high-risk events indexed yet. The automated listener is monitoring mainnet streams...
              </div>
            ) : (
              logs.map((item, index) => {
                const reasons = typeof item.flagged_reasons === 'string' 
                  ? JSON.parse(item.flagged_reasons) 
                  : item.flagged_reasons || [];

                return (
                  <div key={index} className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-semibold text-slate-200">
                            {item.mint_address.slice(0, 8)}...{item.mint_address.slice(-6)}
                          </span>
                          {getRiskBadge(item.risk_score)}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-mono">
                          Event: <span className="text-slate-300">{item.event_type}</span> | Tx: {item.signature.slice(0, 10)}...
                        </p>
                      </div>

                      <a 
                        href={`https://solana.fm/address/${item.mint_address}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-slate-500 hover:text-cyan-400 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    {/* Flags */}
                    {reasons.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-800/60 space-y-1.5">
                        {reasons.map((r: string, rIdx: number) => (
                          <div key={rIdx} className="flex items-center gap-2 text-xs text-amber-400/90">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
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

        {/* Right Sidebar: Token Risk Scanner */}
        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-cyan-400" />
              On-Demand Mint Audit
            </h2>

            <form onSubmit={handleSearch} className="space-y-3">
              <input
                type="text"
                placeholder="Paste Token Mint Address..."
                value={searchMint}
                onChange={(e) => setSearchMint(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold py-2.5 rounded-lg text-sm transition-all disabled:opacity-50"
              >
                {loading ? 'Evaluating On-Chain...' : 'Analyze Token Security'}
              </button>
            </form>

            {/* Audit Output Result Card */}
            {searchResult && (
              <div className="mt-6 pt-6 border-t border-slate-800 space-y-4">
                {searchResult.error ? (
                  <p className="text-xs text-red-400">{searchResult.error}</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Mint Authority:</span>
                      <span className={`font-mono text-xs ${searchResult.token?.mint_authority ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {searchResult.token?.mint_authority ? 'ACTIVE ⚠️' : 'REVOKED ✅'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Freeze Authority:</span>
                      <span className={`font-mono text-xs ${searchResult.token?.freeze_authority ? 'text-red-400' : 'text-emerald-400'}`}>
                        {searchResult.token?.freeze_authority ? 'ACTIVE 🚨' : 'DISABLED ✅'}
                      </span>
                    </div>

                    {/* Top Holder Concentration */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Top 10 Holders:</span>
                      <span className={`font-mono text-xs ${searchResult.liveProfile?.topHolderPercentage > 40 ? 'text-amber-400 font-bold' : 'text-emerald-400'}`}>
                        {searchResult.liveProfile ? `${searchResult.liveProfile.topHolderPercentage}%` : 'N/A'} 
                        {searchResult.liveProfile?.topHolderPercentage > 40 ? ' ⚠️' : ' ✅'}
                      </span>
                    </div>

                    {/* LP Status */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">LP Status:</span>
                      <span className="font-mono text-xs text-emerald-400">
                        {searchResult.liveProfile?.isLpBurnedOrLocked ? 'BURNED / LOCKED ✅' : 'UNLOCKED ⚠️'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Decimals:</span>
                      <span className="font-mono text-slate-200">{searchResult.token?.decimals}</span>
                    </div>

                    {searchResult.riskHistory && searchResult.riskHistory.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-800/80">
                        <span className="text-xs text-slate-400 font-semibold block mb-2">Historical Risk Events:</span>
                        {searchResult.riskHistory.map((h: any, hIdx: number) => (
                          <div key={hIdx} className="bg-slate-950 p-2.5 rounded border border-slate-800 text-xs mb-2">
                            <div className="flex justify-between">
                              <span className="text-slate-300 font-semibold">{h.event_type}</span>
                              <span className="text-amber-400">Score: {h.risk_score}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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