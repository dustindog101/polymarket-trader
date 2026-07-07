'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { Wallet, RefreshCw, ChevronLeft, ChevronRight, Zap, Shield, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useTradingStore } from '@/stores/trading';
import { MarketSidebar } from '@/components/trading/MarketSidebar';
import { MarketHeader } from '@/components/trading/MarketHeader';
import { OrderbookPanel } from '@/components/trading/OrderbookPanel';
import { PriceChart } from '@/components/trading/PriceChart';
import { OrderTicket } from '@/components/trading/OrderTicket';
import { OpenOrders } from '@/components/trading/OpenOrders';
import { FillHistory } from '@/components/trading/FillHistory';
import { ProxyPanel } from '@/components/trading/ProxyPanel';
import { KeyboardShortcuts } from '@/components/trading/KeyboardShortcuts';
import { SettingsDialog } from '@/components/trading/SettingsDialog';

export default function Home() {
  const {
    selectedMarket,
    wsConnected,
    balance,
    connectWs,
    setPopularMarkets,
    setCryptoMarkets,
    setBtcMarkets,
    setFiveMinuteMarkets,
    setIsLoadingMarkets,
    setBalance,
    setSelectedTokenId,
    subscribeAsset,
    updateOrderbook,
    startPolling,
    stopPolling,
    startFiveMinuteRefresh,
    stopFiveMinuteRefresh,
  } = useTradingStore();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showProxies, setShowProxies] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [balanceDisplay, setBalanceDisplay] = useState<string | null>(null);

  // Fetch markets on mount
  const fetchMarkets = useCallback(async () => {
    setIsLoadingMarkets(true);
    try {
      const res = await fetch('/api/polymarket/markets');
      const data = await res.json();
      if (data.popular) setPopularMarkets(data.popular);
      if (data.crypto) setCryptoMarkets(data.crypto);
      if (data.btc) setBtcMarkets(data.btc);
      if (data.fiveMinute) setFiveMinuteMarkets(data.fiveMinute);
    } catch (e) {
      console.error('Failed to fetch markets:', e);
    } finally {
      setIsLoadingMarkets(false);
    }
  }, [setPopularMarkets, setCryptoMarkets, setBtcMarkets, setFiveMinuteMarkets, setIsLoadingMarkets]);

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/polymarket/balance');
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance || '0', data.allowance || '0');
        setBalanceDisplay(data.balance || '0');
      }
    } catch (e) {
      // Balance fetch may fail if credentials are wrong — non-critical
      console.error('Balance fetch failed:', e);
    }
  }, [setBalance]);

  useEffect(() => {
    fetchMarkets();
    fetchBalance();
    // Try WS connection (will gracefully fail on Vercel, triggering polling)
    connectWs();
    // Start the 5M round-transition watcher. It re-fetches the 6 live
    // rounds every 20s and auto-selects the new round when the currently-
    // selected 5M market resolves. Stays running for the whole session —
    // cheap (6 slug lookups per tick) and means the user always sees the
    // current live round without manual refreshes.
    startFiveMinuteRefresh();
    return () => {
      stopFiveMinuteRefresh();
    };
  }, [fetchMarkets, fetchBalance, connectWs, startFiveMinuteRefresh, stopFiveMinuteRefresh]);

  // When market is selected, set token ID, subscribe WS, start polling
  useEffect(() => {
    if (!selectedMarket?.clobTokenIds?.length) {
      stopPolling();
      return;
    }

    const firstTokenId = selectedMarket.clobTokenIds[0];
    setSelectedTokenId(firstTokenId);

    const tokenIds = selectedMarket.clobTokenIds;

    // Try WS subscription (no-op if not connected)
    tokenIds.forEach((tid) => subscribeAsset(tid));

    // Initial REST orderbook fetch (always, even with WS)
    async function fetchInitialOrderbooks() {
      for (const tokenId of tokenIds) {
        try {
          const res = await fetch(
            `/api/polymarket/orderbook?token_id=${encodeURIComponent(tokenId)}`,
          );
          if (res.ok) {
            const data = await res.json();
            updateOrderbook(tokenId, {
              bids: (data.bids || []).map((b: any) => ({
                price: parseFloat(b.price),
                size: parseFloat(b.size),
              })),
              asks: (data.asks || []).map((a: any) => ({
                price: parseFloat(a.price),
                size: parseFloat(a.size),
              })),
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          console.error('Failed to fetch orderbook:', err);
        }
      }
    }
    fetchInitialOrderbooks();

    // Start REST polling (will be a no-op if WS is connected)
    // Small delay to let initial fetch complete
    const pollTimer = setTimeout(() => {
      startPolling(tokenIds);
    }, 1000);

    return () => {
      clearTimeout(pollTimer);
      stopPolling();
    };
  }, [selectedMarket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ─── Sidebar ─────────────────────────────────────────────── */}
      <div
        className={`${
          sidebarOpen ? 'w-[340px] min-w-[340px]' : 'w-0 min-w-0'
        } transition-all duration-300 ease-in-out overflow-hidden border-r border-border/50 bg-zinc-950/50 flex-shrink-0`}
      >
        <MarketSidebar />
      </div>

      {/* ─── Main Content ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar — trading terminal style */}
        <header className="h-11 flex items-center justify-between px-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-emerald-500" fill="currentColor" />
                <span className="font-bold text-sm tracking-tight text-zinc-100">
                  POLY<span className="text-emerald-500">TERMINAL</span>
                </span>
              </div>
              <div className="h-4 w-px bg-zinc-800" />
              <div className="flex items-center gap-1.5">
                <div className={`size-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 pulse-live' : 'bg-amber-500'}`} />
                <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${wsConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {wsConnected ? 'LIVE' : 'POLLING'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-zinc-400 hover:text-zinc-200"
                  onClick={fetchBalance}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  <span className="font-mono tabular-nums">
                    {balanceDisplay
                      ? `${parseFloat(balanceDisplay).toFixed(2)}`
                      : '—'}
                  </span>
                  <span className="text-zinc-600 text-[10px]">USDC</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Wallet Balance (pUSD)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 text-xs gap-1.5 ${showProxies ? 'text-blue-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                  onClick={() => setShowProxies(!showProxies)}
                  title="Proxy Management"
                >
                  <Shield className="h-3.5 w-3.5" />
                  Proxies
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Proxy Management (P)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
                  onClick={fetchMarkets}
                  title="Reload Markets"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reload Markets (R)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                >
                  <SettingsIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Settings — polling speed (,)</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Market Header (only when a market is selected) */}
        {selectedMarket ? (
          <MarketHeader />
        ) : (
          <div className="flex-1 flex items-center justify-center chart-grid-bg">
            <div className="text-center space-y-4 max-w-md px-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-zinc-800/50 border border-emerald-500/20 flex items-center justify-center">
                <Zap className="h-8 w-8 text-emerald-500" fill="currentColor" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-zinc-200 tracking-tight">
                  Polymarket Trading Terminal
                </h2>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Real-time 5M/15M crypto markets with live orderbooks, BTC spot
                  prices, and sub-second updates. Select a market to start.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                {!sidebarOpen && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSidebarOpen(true)}
                    className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600"
                  >
                    <ChevronRight className="h-4 w-4 mr-1" />
                    Open Market List
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-center gap-3 pt-3 text-[10px] text-zinc-700">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono">B</kbd>
                  Buy
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono">S</kbd>
                  Sell
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono">,</kbd>
                  Settings
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Trading Panels (only when market selected) */}
        {selectedMarket && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Chart + Orders/History */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {/* Chart */}
              <div className="flex-1 min-h-0 p-2">
                <PriceChart />
              </div>

              <Separator className="bg-border/50" />

              {/* Bottom tabs: Open Orders / Fill History */}
              <div className="h-[220px] flex-shrink-0 flex flex-col">
                <OpenOrders />
              </div>
            </div>

            <Separator orientation="vertical" className="bg-border/50" />

            {/* Right: Orderbook */}
            <div className="w-[280px] min-w-[280px] flex-shrink-0 p-2">
              <OrderbookPanel />
            </div>
          </div>
        )}

        {/* Order Ticket (floating dialog) */}
        {selectedMarket && useTradingStore.getState().showOrderTicket && (
          <OrderTicket />
        )}

        {/* Proxy Panel (bottom overlay) */}
        {showProxies && (
          <div className="absolute bottom-0 left-0 right-0 h-[320px] border-t border-blue-500/30 bg-zinc-950/95 backdrop-blur-sm z-50">
            <ProxyPanel />
          </div>
        )}
      </div>

      {/* Global keyboard shortcuts — no UI, just side effects */}
      <KeyboardShortcuts />

      {/* Settings dialog — polling speed + future prefs */}
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}