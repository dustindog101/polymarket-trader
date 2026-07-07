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
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useTradingStore, type ProxyEntry } from '@/stores/trading';

const COUNTRY_FLAGS: Record<string, string> = {
  GB: '🇬🇧', US: '🇺🇸', ES: '🇪🇸', JP: '🇯🇵', DE: '🇩🇪', FR: '🇫🇷',
  NL: '🇳🇱', CA: '🇨🇦', AU: '🇦🇺', SG: '🇸🇬', CH: '🇨🇭',
};

// ─── Component ───────────────────────────────────────────────────────

export function ProxyPanel() {
  const {
    proxies,
    setProxies,
    selectedProxyId,
    setSelectedProxyId,
  } = useTradingStore();
  const [testingAll, setTestingAll] = useState(false);
  const [newHost, setNewHost] = useState('');
  const [newPort, setNewPort] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');

  const workingCount = proxies.filter((p) => p.status === 'working').length;
  const fastestProxy = proxies
    .filter((p) => p.status === 'working' && p.latency)
    .sort((a, b) => (a.latency ?? 0) - (b.latency ?? 0))[0];

  // Test a single proxy
  const testProxy = useCallback(
    async (proxy: ProxyEntry) => {
      setProxies(proxies.map((p) => (p.id === proxy.id ? { ...p, status: 'testing' as const } : p)));

      try {
        const res = await fetch('/api/polymarket/proxy-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proxy: { host: proxy.host, port: proxy.port, username: proxy.username, password: proxy.password },
          }),
        });
        const data = await res.json();

        setProxies(
          proxies.map((p) =>
            p.id === proxy.id
              ? {
                  ...p,
                  status: data.working ? ('working' as const) : ('failed' as const),
                  latency: data.totalMs,
                  lastTested: Date.now(),
                }
              : p,
          ),
        );
      } catch {
        setProxies(
          proxies.map((p) =>
            p.id === proxy.id
              ? { ...p, status: 'failed' as const, latency: 0, lastTested: Date.now() }
              : p,
          ),
        );
      }
    },
    [proxies, setProxies],
  );

  // Test all proxies — run them with limited concurrency (3 at a time) so we
  // don't overwhelm the test endpoint or hit Webshare rate limits.
  const testAll = useCallback(async () => {
    setTestingAll(true);
    const concurrency = 3;
    const queue = [...proxies];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const proxy = queue.shift();
        if (proxy) await testProxy(proxy);
      }
    });
    await Promise.all(workers);
    setTestingAll(false);
  }, [proxies, testProxy]);

  // Add a new proxy
  const addProxy = useCallback(() => {
    if (!newHost || !newPort) return;
    const newProxy: ProxyEntry = {
      id: `p-custom-${Date.now()}`,
      host: newHost,
      port: parseInt(newPort),
      username: newUser,
      password: newPass,
      status: 'unknown',
    };
    setProxies([...proxies, newProxy]);
    setNewHost('');
    setNewPort('');
    setNewUser('');
    setNewPass('');
  }, [newHost, newPort, newUser, newPass, proxies, setProxies]);

  // Remove a proxy
  const removeProxy = useCallback(
    (id: string) => {
      setProxies(proxies.filter((p) => p.id !== id));
      if (selectedProxyId === id) setSelectedProxyId(null);
    },
    [proxies, setProxies, selectedProxyId, setSelectedProxyId],
  );

  return (
    <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-blue-400" />
          <span className="text-xs font-medium text-zinc-300">Proxy Management</span>
          {selectedProxyId && (
            <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400">
              <Target className="size-2.5 mr-1" />
              Active for orders
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-[10px] ${workingCount > 0 ? 'border-emerald-500/40 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}
          >
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

      {/* Fastest proxy quick-select */}
      {fastestProxy && (
        <div className="px-3 py-1.5 border-b border-zinc-800/60 flex items-center gap-2 bg-emerald-500/5">
          <Zap className="size-3 text-emerald-400" />
          <span className="text-[10px] text-zinc-400">Fastest:</span>
          <span className="text-[10px] font-mono text-emerald-400">{fastestProxy.host}:{fastestProxy.port}</span>
          <span className="text-[10px] text-zinc-500">({fastestProxy.latency}ms)</span>
          <button
            type="button"
            onClick={() => setSelectedProxyId(fastestProxy.id)}
            className={`ml-auto text-[10px] px-2 py-0.5 rounded transition-colors ${
              selectedProxyId === fastestProxy.id
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200'
            }`}
          >
            {selectedProxyId === fastestProxy.id ? '✓ Selected' : 'Use for orders'}
          </button>
        </div>
      )}

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
      <div className="grid grid-cols-[24px_1fr_50px_50px_40px_70px_32px] gap-1 px-2 py-1.5 border-b border-zinc-800/40 text-[9px] uppercase tracking-wider text-zinc-600 font-medium">
        <span></span>
        <span>Proxy</span>
        <span>Location</span>
        <span>Latency</span>
        <span>Status</span>
        <span>For Orders</span>
        <span></span>
      </div>

      {/* Proxy list */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-1 flex flex-col gap-0.5">
          {proxies.map((proxy) => {
            const isSelectedForOrders = selectedProxyId === proxy.id;
            const canUseForOrders = proxy.status === 'working';
            return (
              <div
                key={proxy.id}
                className={`grid grid-cols-[24px_1fr_50px_50px_40px_70px_32px] gap-1 items-center rounded-md px-1 py-1.5 transition-colors group ${
                  isSelectedForOrders ? 'bg-emerald-500/8 ring-1 ring-emerald-500/30' : 'hover:bg-zinc-800/40'
                }`}
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
                    <span
                      className={
                        proxy.latency < 2000
                          ? 'text-emerald-400'
                          : proxy.latency < 5000
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }
                    >
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

                {/* Use-for-orders toggle */}
                <div className="flex justify-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setSelectedProxyId(isSelectedForOrders ? null : proxy.id)}
                        disabled={!canUseForOrders && !isSelectedForOrders}
                        className={`size-6 rounded flex items-center justify-center transition-colors ${
                          isSelectedForOrders
                            ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50'
                            : canUseForOrders
                              ? 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-emerald-400 hover:border-emerald-500/40'
                              : 'bg-zinc-900 text-zinc-700 border border-zinc-800 cursor-not-allowed'
                        }`}
                      >
                        <Target className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-zinc-300 text-xs">
                      {isSelectedForOrders
                        ? 'Currently routing orders through this proxy. Click to disable.'
                        : canUseForOrders
                          ? 'Route orders through this proxy'
                          : 'Test the proxy first — only working proxies can be used for orders'}
                    </TooltipContent>
                  </Tooltip>
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
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer with selected-proxy summary */}
      <Separator className="bg-zinc-800/60" />
      <div className="px-3 py-2 flex items-center justify-between text-[10px]">
        <span className="text-zinc-500">
          {selectedProxyId
            ? (() => {
                const p = proxies.find((x) => x.id === selectedProxyId);
                return p ? (
                  <>
                    Orders via <span className="text-emerald-400 font-mono">{p.host}:{p.port}</span>
                  </>
                ) : (
                  'Direct (no proxy)'
                );
              })()
            : <span className="text-zinc-500">Direct connection (no proxy)</span>}
        </span>
        {selectedProxyId && (
          <button
            type="button"
            onClick={() => setSelectedProxyId(null)}
            className="text-zinc-500 hover:text-zinc-300 underline"
          >
            Disable
          </button>
        )}
      </div>
    </div>
  );
}
