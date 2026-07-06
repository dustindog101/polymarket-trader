'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { Activity, Wallet, RefreshCw, ChevronLeft, ChevronRight, Zap, DollarSign } from 'lucide-react';
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

export default function Home() {
  const {
    selectedMarket,
    wsConnected,
    balance,
    connectWs,
    setPopularMarkets,
    setCryptoMarkets,
    setIsLoadingMarkets,
    setBalance,
    setSelectedTokenId,
    subscribeAsset,
    updateOrderbook,
  } = useTradingStore();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [balanceDisplay, setBalanceDisplay] = useState<string | null>(null);

  // Fetch markets on mount
  const fetchMarkets = useCallback(async () => {
    setIsLoadingMarkets(true);
    try {
      const res = await fetch('/api/polymarket/markets');
      const data = await res.json();
      if (data.popular) setPopularMarkets(data.popular);
      if (data.crypto) setCryptoMarkets(data.crypto);
    } catch (e) {
      console.error('Failed to fetch markets:', e);
    } finally {
      setIsLoadingMarkets(false);
    }
  }, [setPopularMarkets, setCryptoMarkets, setIsLoadingMarkets]);

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
    connectWs();
  }, [fetchMarkets, fetchBalance, connectWs]);

  // When market is selected, set token ID, subscribe WS, fetch orderbook
  useEffect(() => {
    if (!selectedMarket?.clobTokenIds?.length) return;

    const firstTokenId = selectedMarket.clobTokenIds[0];
    setSelectedTokenId(firstTokenId);

    // Subscribe to all tokens via WebSocket
    selectedMarket.clobTokenIds.forEach((tid) => subscribeAsset(tid));

    // Fetch orderbook for the selected token
    async function fetchOrderbooks() {
      for (const tokenId of selectedMarket.clobTokenIds) {
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
    fetchOrderbooks();
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
        {/* Top Bar */}
        <header className="h-12 flex items-center justify-between px-4 border-b border-border/50 bg-zinc-950/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold text-sm tracking-tight">
                Polymarket Trader
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${
                  wsConnected
                    ? 'border-emerald-500/40 text-emerald-400'
                    : 'border-red-500/40 text-red-400'
                }`}
              >
                <Activity className="h-2.5 w-2.5 mr-1" />
                {wsConnected ? 'LIVE' : 'OFFLINE'}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={fetchBalance}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  <span className="font-mono">
                    {balanceDisplay
                      ? `${parseFloat(balanceDisplay).toFixed(2)} USDC`
                      : 'Loading...'}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Wallet Balance (pUSD)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={fetchMarkets}
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload Markets</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Market Header (only when a market is selected) */}
        {selectedMarket ? (
          <MarketHeader />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
                <DollarSign className="h-8 w-8 text-zinc-500" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-300">
                Select a Market
              </h2>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Browse popular or crypto markets in the sidebar, or search for
                a specific market to start trading. BTC 5-minute and 15-minute
                prediction markets update in real-time.
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                {!sidebarOpen && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSidebarOpen(true)}
                  >
                    <ChevronRight className="h-4 w-4 mr-1" />
                    Open Market List
                  </Button>
                )}
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
      </div>
    </div>
  );
}