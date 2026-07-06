'use client';

import React, { useState, useCallback } from 'react';
import {
  Shield,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Globe,
  Plus,
  Trash2,
  Zap,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useTradingStore } from '@/stores/trading';

// ─── Types ─────────────────────────────────────────────────────────

export interface Proxy {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  country?: string;
  city?: string;
  status: 'unknown' | 'testing' | 'working' | 'failed';
  latency?: number;
  lastTested?: number;
}

// ─── Default proxies (from Webshare) ────────────────────────────────

const DEFAULT_PROXIES: Proxy[] = [
  { id: 'p1', host: '31.59.20.176', port: 6754, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'GB', city: 'London', status: 'unknown' },
  { id: 'p2', host: '31.56.127.193', port: 7684, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'US', city: 'Seattle', status: 'unknown' },
  { id: 'p3', host: '45.38.107.97', port: 6014, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'GB', city: 'London', status: 'unknown' },
  { id: 'p4', host: '198.105.121.200', port: 6462, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'GB', city: 'London', status: 'unknown' },
  { id: 'p5', host: '64.137.96.74', port: 6641, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'ES', city: 'Madrid', status: 'unknown' },
  { id: 'p6', host: '198.23.243.226', port: 6361, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'US', city: 'Los Angeles', status: 'unknown' },
  { id: 'p7', host: '2.57.21.2', port: 7239, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'US', city: 'NYC', status: 'unknown' },
  { id: 'p8', host: '38.154.185.97', port: 6370, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'US', city: 'Piscataway', status: 'unknown' },
  { id: 'p9', host: '142.111.67.146', port: 5611, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'JP', city: 'Tokyo', status: 'unknown' },
  { id: 'p10', host: '191.96.254.138', port: 6185, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'US', city: 'Los Angeles', status: 'unknown' },
];

const COUNTRY_FLAGS: Record<string, string> = {
  GB: '🇬🇧', US: '🇺🇸', ES: '🇪🇸', JP: '🇯🇵', DE: '🇩🇪', FR: '🇫🇷',
  NL: '🇳🇱', CA: '🇨🇦', AU: '🇦🇺', SG: '🇸🇬', CH: '🇨🇭',
};

// ─── Component ───────────────────────────────────────────────────────

export function ProxyPanel() {
  const [proxies, setProxies] = useState<Proxy[]>(DEFAULT_PROXIES);
  const [testingAll, setTestingAll] = useState(false);
  const [newHost, setNewHost] = useState('');
  const [newPort, setNewPort] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');

  const workingCount = proxies.filter(p => p.status === 'working').length;

  // Test a single proxy
  const testProxy = useCallback(async (proxy: Proxy) => {
    setProxies(prev => prev.map(p => p.id === proxy.id ? { ...p, status: 'testing' as const } : p));

    try {
      const res = await fetch('/api/polymarket/proxy-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: { host: proxy.host, port: proxy.port, username: proxy.username, password: proxy.password } }),
      });
      const data = await res.json();

      setProxies(prev => prev.map(p => p.id === proxy.id ? {
        ...p,
        status: data.working ? 'working' : 'failed',
        latency: data.totalMs,
        lastTested: Date.now(),
      } : p));
    } catch {
      setProxies(prev => prev.map(p => p.id === proxy.id ? { ...p, status: 'failed' as const, latency: 0, lastTested: Date.now() } : p));
    }
  }, []);

  // Test all proxies sequentially
  const testAll = useCallback(async () => {
    setTestingAll(true);
    for (const proxy of proxies) {
      await testProxy(proxy);
    }
    setTestingAll(false);
  }, [proxies, testProxy]);

  // Add a new proxy
  const addProxy = useCallback(() => {
    if (!newHost || !newPort) return;
    const newProxy: Proxy = {
      id: `p-custom-${Date.now()}`,
      host: newHost,
      port: parseInt(newPort),
      username: newUser,
      password: newPass,
      status: 'unknown',
    };
    setProxies(prev => [...prev, newProxy]);
    setNewHost('');
    setNewPort('');
    setNewUser('');
    setNewPass('');
  }, [newHost, newPort, newUser, newPass]);

  // Remove a proxy
  const removeProxy = useCallback((id: string) => {
    setProxies(prev => prev.filter(p => p.id !== id));
  }, []);

  return (
    <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-blue-400" />
          <span className="text-xs font-medium text-zinc-300">Proxy Management</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${workingCount > 0 ? 'border-emerald-500/40 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}>
            <Zap className="size-2.5 mr-1" />
            {workingCount}/{proxies.length} working
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={testAll}
            disabled={testingAll}
          >
            {testingAll ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            Test All
          </Button>
        </div>
      </div>

      {/* Add proxy form */}
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-zinc-800/60">
        <Input
          value={newHost}
          onChange={(e) => setNewHost(e.target.value)}
          placeholder="Host IP"
          className="h-7 text-[11px] px-2 flex-1 min-w-0 border-zinc-800 bg-zinc-900/80"
        />
        <Input
          value={newPort}
          onChange={(e) => setNewPort(e.target.value)}
          placeholder="Port"
          className="h-7 text-[11px] px-2 w-16 border-zinc-800 bg-zinc-900/80"
        />
        <Input
          value={newUser}
          onChange={(e) => setNewUser(e.target.value)}
          placeholder="User"
          className="h-7 text-[11px] px-2 w-20 border-zinc-800 bg-zinc-900/80"
        />
        <Input
          value={newPass}
          onChange={(e) => setNewPass(e.target.value)}
          placeholder="Pass"
          type="password"
          className="h-7 text-[11px] px-2 w-20 border-zinc-800 bg-zinc-900/80"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
          onClick={addProxy}
          disabled={!newHost || !newPort}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[24px_1fr_50px_60px_50px_32px] gap-1 px-2 py-1.5 border-b border-zinc-800/40 text-[9px] uppercase tracking-wider text-zinc-600 font-medium">
        <span></span>
        <span>Proxy</span>
        <span>Location</span>
        <span>Latency</span>
        <span>Status</span>
        <span></span>
      </div>

      {/* Proxy list */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-1 flex flex-col gap-0.5">
          {proxies.map((proxy) => (
            <div
              key={proxy.id}
              className="grid grid-cols-[24px_1fr_50px_60px_50px_32px] gap-1 items-center rounded-md px-1 py-1.5 hover:bg-zinc-800/40 transition-colors group"
            >
              {/* Status icon */}
              <div className="flex justify-center">
                {proxy.status === 'testing' ? (
                  <Loader2 className="size-3.5 text-amber-400 animate-spin" />
                ) : proxy.status === 'working' ? (
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                ) : proxy.status === 'failed' ? (
                  <XCircle className="size-3.5 text-red-400" />
                ) : (
                  <Globe className="size-3.5 text-zinc-600" />
                )}
              </div>

              {/* Proxy address */}
              <div className="text-[11px] font-mono text-zinc-300 truncate">
                {proxy.host}:{proxy.port}
              </div>

              {/* Location */}
              <div className="text-[10px] text-zinc-500 truncate">
                {proxy.country && COUNTRY_FLAGS[proxy.country]} {proxy.city || proxy.country || '—'}
              </div>

              {/* Latency */}
              <div className="text-[10px] font-mono">
                {proxy.latency ? (
                  <span className={proxy.latency < 2000 ? 'text-emerald-400' : proxy.latency < 5000 ? 'text-amber-400' : 'text-red-400'}>
                    {proxy.latency}ms
                  </span>
                ) : (
                  <span className="text-zinc-700">—</span>
                )}
              </div>

              {/* Status badge */}
              <div>
                {proxy.status === 'working' && (
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px] px-1.5 py-0">
                    OK
                  </Badge>
                )}
                {proxy.status === 'failed' && (
                  <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[9px] px-1.5 py-0">
                    FAIL
                  </Badge>
                )}
                {proxy.status === 'testing' && (
                  <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[9px] px-1.5 py-0">
                    ...
                  </Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => testProxy(proxy)}
                  className="p-0.5 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Test proxy"
                >
                  <RefreshCw className="size-3" />
                </button>
                <button
                  onClick={() => removeProxy(proxy.id)}
                  className="p-0.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                  title="Remove proxy"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}