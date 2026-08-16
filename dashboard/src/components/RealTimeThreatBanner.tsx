'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Volume2, X } from 'lucide-react';

interface Threat {
  threatId: number;
  mint: string;
  wallet: string;
  eventType: string;
  transactionHash: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  timestamp: string;
}

interface RealTimeThreatBannerProps {
  apiUrl: string;
}

export function RealTimeThreatBanner({ apiUrl }: RealTimeThreatBannerProps) {
  const [threats, setThreats] = useState<Threat[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Play alert sound
  const playAlertSound = () => {
    if (!audioEnabled) return;
    // Create a simple beep sound using Web Audio API
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gain.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (err) {
      console.error('Audio context error:', err);
    }
  };

  useEffect(() => {
    // Connect to WebSocket for real-time threats
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = apiUrl.replace(/^https?:/, protocol).replace(/\/api$/, '');

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('🔌 Connected to threat monitoring WebSocket');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'THREAT_ALERT') {
            const newThreat = data.data as Threat;
            setThreats((prev) => [newThreat, ...prev].slice(0, 5)); // Keep last 5 threats
            playAlertSound();

            // Auto-dismiss after 30 seconds
            setTimeout(() => {
              setThreats((prev) => prev.filter((t) => t.threatId !== newThreat.threatId));
            }, 30000);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('🔌 Disconnected from threat monitoring');
        setIsConnected(false);
      };

      return () => {
        ws.close();
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
    }
  }, [apiUrl]);

  if (threats.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 text-slate-400 text-xs p-2">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span>{isConnected ? 'Monitoring threats...' : 'Threat monitoring offline'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {threats.map((threat) => (
        <div
          key={threat.threatId}
          className="bg-gradient-to-r from-red-600/20 to-orange-600/20 border border-red-500/50 rounded-lg p-3 animate-pulse"
          style={{ animation: 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-red-400 text-sm flex items-center gap-2">
                  🚨 INSIDER DUMP IN PROGRESS
                  <span className="text-xs bg-red-500/30 px-2 py-0.5 rounded">
                    {threat.severity}
                  </span>
                </div>
                <p className="text-slate-300 text-xs mt-1 break-words">
                  {threat.message}
                </p>
                <div className="text-slate-400 text-xs mt-2 space-y-1">
                  <div>
                    <strong>Event:</strong> {threat.eventType} from{' '}
                    <span className="font-mono bg-slate-800/50 px-1 rounded">
                      {threat.wallet.slice(0, 8)}...
                    </span>
                  </div>
                  <div>
                    <strong>TX:</strong>{' '}
                    <a
                      href={`https://solscan.io/tx/${threat.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline font-mono"
                    >
                      {threat.transactionHash.slice(0, 20)}...
                    </a>
                  </div>
                  <div className="text-slate-500 text-[10px]">
                    {new Date(threat.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${
                  audioEnabled ? 'text-yellow-400' : 'text-slate-500'
                }`}
                title={audioEnabled ? 'Mute alerts' : 'Unmute alerts'}
              >
                <Volume2 className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  setThreats((prev) => prev.filter((t) => t.threatId !== threat.threatId))
                }
                className="p-1.5 rounded hover:bg-slate-700 transition-colors text-slate-400"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
