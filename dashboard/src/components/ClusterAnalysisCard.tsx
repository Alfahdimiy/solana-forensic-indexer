'use client';

import React from 'react';
import { AlertTriangle, TrendingDown, Users, Zap, Target } from 'lucide-react';

interface Cluster {
  clusterId: string;
  parentFunder: string;
  percentageOfSupply: number;
  walletCount: number;
  isCriticalRisk: boolean;
}

interface ClusterAnalysisCardProps {
  analysis: {
    totalClusters: number;
    clusters: Cluster[];
    criticalRiskClusters: number;
    highestSingleClusterPercentage: number;
    devEntityHoldingPercentage: number;
  };
  onSubscribe?: (clusterIds: string[]) => void;
}

export function ClusterAnalysisCard({ analysis, onSubscribe }: ClusterAnalysisCardProps) {
  const criticalRiskLevel = analysis.devEntityHoldingPercentage > 12;

  return (
    <div className="w-full bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" />
          Insider/Dev Cluster Analysis
        </h3>
        {criticalRiskLevel && (
          <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            CRITICAL RISK
          </span>
        )}
      </div>

      {/* Main Metric: True Cluster Holding % */}
      <div className={`p-4 rounded-lg border ${
        criticalRiskLevel 
          ? 'bg-red-500/5 border-red-500/30' 
          : 'bg-emerald-500/5 border-emerald-500/30'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-orange-400" />
            <span className="text-slate-300 text-sm font-medium">True Cluster Holding</span>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${
              criticalRiskLevel ? 'text-red-400' : 'text-emerald-400'
            }`}>
              {analysis.devEntityHoldingPercentage.toFixed(2)}%
            </div>
            {criticalRiskLevel && (
              <div className="text-xs text-red-400 mt-1">
                ⚠️ Exceeds 12% threshold
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cluster Summary Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded p-3">
          <div className="text-slate-400 text-xs font-mono mb-1">CLUSTERS</div>
          <div className="text-xl font-bold text-blue-400">{analysis.totalClusters}</div>
        </div>
        <div className={`border rounded p-3 ${
          analysis.criticalRiskClusters > 0 
            ? 'bg-red-500/5 border-red-500/30' 
            : 'bg-slate-800/50 border-slate-700'
        }`}>
          <div className="text-slate-400 text-xs font-mono mb-1">CRITICAL</div>
          <div className={`text-xl font-bold ${
            analysis.criticalRiskClusters > 0 ? 'text-red-400' : 'text-slate-400'
          }`}>
            {analysis.criticalRiskClusters}
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded p-3">
          <div className="text-slate-400 text-xs font-mono mb-1">MAX SINGLE</div>
          <div className="text-xl font-bold text-purple-400">
            {analysis.highestSingleClusterPercentage.toFixed(2)}%
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded p-3">
          <div className="text-slate-400 text-xs font-mono mb-1">THRESHHOLD</div>
          <div className="text-xl font-bold text-orange-400">12%</div>
        </div>
      </div>

      {/* Cluster Details */}
      {analysis.clusters.length > 0 && (
        <div className="border-t border-slate-700 pt-4">
          <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            Cluster Breakdown
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {analysis.clusters.map((cluster, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded border text-xs space-y-1 ${
                  cluster.isCriticalRisk
                    ? 'bg-red-500/5 border-red-500/30'
                    : 'bg-slate-800/30 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-slate-400">
                    {cluster.clusterId.slice(0, 16)}...
                  </span>
                  <span className={`font-bold ${
                    cluster.isCriticalRisk ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {cluster.percentageOfSupply.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Funder: {cluster.parentFunder.slice(0, 8)}...</span>
                  <span>{cluster.walletCount} wallets</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {onSubscribe && (
        <div className="border-t border-slate-700 pt-4">
          <button
            onClick={() => onSubscribe(analysis.clusters.map(c => c.clusterId))}
            className={`w-full py-2 px-3 rounded font-medium text-sm transition-all flex items-center justify-center gap-2 ${
              criticalRiskLevel
                ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/40'
                : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/40'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            Subscribe to Insider Dump Alerts
          </button>
        </div>
      )}
    </div>
  );
}
