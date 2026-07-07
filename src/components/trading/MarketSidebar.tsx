'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, TrendingUp, Wifi, WifiOff, Clock, X, Bitcoin, Coins, Timer, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useTradingStore, type Market } from '@/stores/trading';

// ─── Helpers ─────────────────────────────────────────────────────────

function formatCompactVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

function isResolvingSoon(endDate: string): boolean {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  return end > now && end - now <= 5 * 60 * 1000;
}

function getTimeRemaining(endDate: string): string {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return 'Ended';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Live MM:SS countdown for short markets (5M / 15M). Updates every second. */
function useLiveCountdown(roundEndSeconds: number | null | undefined): string {
  const [text, setText] = useState('--:--');
  useEffect(() => {
    if (!roundEndSeconds) {
      setText('--:--');
      return;
    }
    const tick = () => {
      const remaining = roundEndSeconds * 1000 - Date.now();
      if (remaining <= 0) {
        setText('Resolving…');
        return;
      }
      const totalSec = Math.floor(remaining / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      setText(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [roundEndSeconds]);
  return text;
}

const ASSET_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  btc: { label: 'BTC', icon: <Bitcoin className="size-3" />, color: 'text-orange-400' },
  eth: { label: 'ETH', icon: <Coins className="size-3" />, color: 'text-indigo-300' },
  sol: { label: 'SOL', icon: <Coins className="size-3" />, color: 'text-emerald-400' },
};

// ─── Component ───────────────────────────────────────────────────────

export function MarketSidebar() {
  const {
    popularMarkets,
    cryptoMarkets,
    btcMarkets,
    fiveMinuteMarkets,
    searchResults,
    selectedMarket,
    searchQuery,
    isLoadingMarkets,
    marketCategory,
    wsConnected,
    selectMarket,
    setSearchQuery,
    setMarketCategory,
    setSearchResults,
    setIsLoadingMarkets,
    fetchFiveMinuteHistory,
  } = useTradingStore();

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync local query with store
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalQuery(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!value.trim()) {
        setSearchQuery('');
        setSearchResults([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setSearchQuery(value);
        setMarketCategory('search');
        setIsLoadingMarkets(true);
        try {
          const res = await fetch(`/api/polymarket/search?q=${encodeURIComponent(value)}`);
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data.markets ?? data);
          }
        } catch (err) {
          console.error('[MarketSidebar] Search failed', err);
        } finally {
          setIsLoadingMarkets(false);
        }
      }, 500);
    },
    [setSearchQuery, setMarketCategory, setSearchResults, setIsLoadingMarkets],
  );

  // Clear search
  const clearSearch = useCallback(() => {
    setLocalQuery('');
    setSearchQuery('');
    setSearchResults([]);
    setMarketCategory('5m');
  }, [setSearchQuery, setSearchResults, setMarketCategory]);

  // Select market — orderbook fetching and WS subscription handled by main page
  const handleSelectMarket = useCallback(
    (market: Market) => {
      selectMarket(market);
      // For 5M markets, kick off history-strip fetch (the store does this too,
      // but doing it here gives the user immediate visual feedback)
      if (market.asset && market.durationMinutes) {
        fetchFiveMinuteHistory(market.asset, market.durationMinutes);
      }
    },
    [selectMarket, fetchFiveMinuteHistory],
  );

  const isSearching = searchQuery.trim().length > 0;
  const displayMarkets = isSearching
    ? searchResults
    : marketCategory === '5m'
      ? fiveMinuteMarkets
      : marketCategory === 'btc'
        ? btcMarkets
        : marketCategory === 'crypto'
          ? cryptoMarkets
          : popularMarkets;

  // ─── 5M Market Card (special — shows live countdown + last round outcome) ──
  function FiveMinuteMarketCard({ market }: { market: Market }) {
    const isSelected = selectedMarket?.id === market.id;
    const yesPrice = parseFloat(market.outcomePrices?.[0] ?? '0');
    const noPrice = parseFloat(market.outcomePrices?.[1] ?? '0');
    const vol = market.volumeNum ?? parseFloat(market.volume24hr ?? market.volume ?? '0');
    const countdown = useLiveCountdown(market.roundEnd);
    const asset = market.asset ?? 'btc';
    const meta = ASSET_META[asset] ?? ASSET_META.btc;
    const duration = market.durationMinutes ?? 5;
    const secondsLeft = market.roundEnd ? market.roundEnd * 1000 - Date.now() : 0;
    const isUrgent = secondsLeft > 0 && secondsLeft <= 60_000; // last minute
    const isVeryUrgent = secondsLeft > 0 && secondsLeft <= 15_000; // last 15s

    // Subscribe to history updates for this asset+duration
    const historyKey = `${asset}-${duration}`;
    const history = useTradingStore((s) => s.fiveMinuteHistory[historyKey]) ?? [];
    const lastRound = history[0];

    return (
      <button
        type="button"
        onClick={() => handleSelectMarket(market)}
        className={`
          w-full text-left rounded-lg border p-3 transition-all duration-150
          hover:bg-zinc-800/60
          ${isSelected ? 'border-emerald-500/60 bg-zinc-800/70 shadow-[0_0_12px_rgba(16,185,129,0.08)]' : 'border-zinc-800 bg-zinc-900/50'}
        `}
      >
        {/* Top: asset + duration + countdown */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`flex items-center gap-1 font-semibold text-xs ${meta.color}`}>
              {meta.icon}
              {meta.label}
            </span>
            <Badge
              variant="outline"
              className="shrink-0 border-zinc-700 bg-zinc-900 text-zinc-400 text-[10px] px-1.5 py-0 font-mono"
            >
              {duration}m
            </Badge>
            <span className="text-[10px] text-zinc-600 truncate">Up or Down</span>
          </div>
          <div
            className={`font-mono tabular-nums text-sm font-bold ${
              isVeryUrgent
                ? 'text-red-400 animate-pulse'
                : isUrgent
                  ? 'text-amber-400'
                  : 'text-zinc-200'
            }`}
          >
            {countdown}
          </div>
        </div>

        {/* Prices */}
        <div className="mt-2 flex items-center gap-2">
          <Badge
            className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-mono"
            variant="outline"
          >
            <ArrowUp className="size-2.5 mr-0.5" />
            UP {(yesPrice * 100).toFixed(1)}¢
          </Badge>
          <Badge
            className="bg-red-500/15 text-red-400 border-red-500/30 text-xs font-mono"
            variant="outline"
          >
            <ArrowDown className="size-2.5 mr-0.5" />
            DN {(noPrice * 100).toFixed(1)}¢
          </Badge>
        </div>

        {/* Footer: last round outcome + volume */}
        <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            {lastRound?.winner ? (
              <>
                <span className="text-zinc-600">Last:</span>
                {lastRound.winner === 'up' ? (
                  <span className="text-emerald-400 flex items-center">
                    <ArrowUp className="size-2.5" />UP
                  </span>
                ) : (
                  <span className="text-red-400 flex items-center">
                    <ArrowDown className="size-2.5" />DN
                  </span>
                )}
              </>
            ) : (
              <span className="text-zinc-600">New round</span>
            )}
          </span>
          <span>
            Vol: <span className="text-zinc-400">{formatCompactVolume(vol)}</span>
          </span>
        </div>
      </button>
    );
  }

  // ─── Standard Market Card (BTC daily / Crypto / Hot) ──────────────
  function MarketCard({ market }: { market: Market }) {
    const isSelected = selectedMarket?.id === market.id;
    const resolvingSoon = isResolvingSoon(market.endDate);
    const yesPrice = parseFloat(market.outcomePrices?.[0] ?? '0');
    const noPrice = parseFloat(market.outcomePrices?.[1] ?? '0');
    const vol = market.volumeNum ?? parseFloat(market.volume24hr ?? market.volume ?? '0');

    return (
      <button
        type="button"
        onClick={() => handleSelectMarket(market)}
        className={`
          w-full text-left rounded-lg border p-3 transition-all duration-150
          hover:bg-zinc-800/60
          ${isSelected ? 'border-emerald-500/60 bg-zinc-800/70 shadow-[0_0_12px_rgba(16,185,129,0.08)]' : 'border-zinc-800 bg-zinc-900/50'}
        `}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-zinc-100 line-clamp-2 leading-tight flex-1">
            {market.question}
          </p>
          {resolvingSoon && (
            <Badge
              variant="outline"
              className="shrink-0 border-amber-500/50 bg-amber-500/10 text-amber-400 text-[10px] px-1.5 py-0"
            >
              <Clock className="size-2.5 mr-0.5" />
              Soon
            </Badge>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Badge
            className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-mono"
            variant="outline"
          >
            {market.outcomes?.[0] ?? 'Yes'} {(yesPrice * 100).toFixed(1)}¢
          </Badge>
          <Badge
            className="bg-red-500/15 text-red-400 border-red-500/30 text-xs font-mono"
            variant="outline"
          >
            {market.outcomes?.[1] ?? 'No'} {(noPrice * 100).toFixed(1)}¢
          </Badge>
        </div>

        <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-500">
          <span>
            Vol 24h: <span className="text-zinc-400">{formatCompactVolume(vol)}</span>
          </span>
          {market.endDate && (
            <span className="text-zinc-600">
              {getTimeRemaining(market.endDate)}
            </span>
          )}
        </div>
      </button>
    );
  }

  // ─── Skeleton Loader ────────────────────────────────────────────
  function MarketSkeleton() {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <Skeleton className="mb-2 h-4 w-3/4 bg-zinc-800" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 bg-zinc-800" />
          <Skeleton className="h-5 w-16 bg-zinc-800" />
        </div>
        <Skeleton className="mt-2 h-3 w-20 bg-zinc-800" />
      </div>
    );
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-zinc-800 bg-zinc-950/80 lg:w-[350px]">
      {/* Search */}
      <div className="relative px-3 pt-3 pb-2">
        <Search className="absolute left-6 top-[18px] size-4 text-zinc-500" />
        <Input
          value={localQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search markets..."
          className="h-9 pl-9 pr-8 rounded-lg border-zinc-800 bg-zinc-900/80 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-700 focus-visible:ring-zinc-700/30"
        />
        {localQuery && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-5 top-[18px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Category Tabs or Search indicator */}
      <div className="px-3 pb-2">
        {isSearching ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Search className="size-3.5" />
            <span>
              {isLoadingMarkets ? 'Searching...' : `${searchResults.length} results for "${searchQuery}"`}
            </span>
          </div>
        ) : (
          <Tabs
            value={marketCategory}
            onValueChange={(v) => setMarketCategory(v as '5m' | 'popular' | 'crypto' | 'btc' | 'search')}
          >
            <TabsList className="h-8 w-full bg-zinc-900 border border-zinc-800 rounded-lg">
              <TabsTrigger
                value="5m"
                className="flex-1 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400 rounded-md gap-1"
              >
                <Timer className="size-3" />
                5M
              </TabsTrigger>
              <TabsTrigger
                value="btc"
                className="flex-1 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-orange-400 rounded-md gap-1"
              >
                <Bitcoin className="size-3" />
                BTC
              </TabsTrigger>
              <TabsTrigger
                value="crypto"
                className="flex-1 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 rounded-md gap-1"
              >
                <Coins className="size-3" />
                Crypto
              </TabsTrigger>
              <TabsTrigger
                value="popular"
                className="flex-1 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 rounded-md gap-1"
              >
                <TrendingUp className="size-3" />
                Hot
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      <Separator className="bg-zinc-800" />

      {/* Market List */}
      <ScrollArea className="flex-1 px-3 py-2" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        <div className="flex flex-col gap-1.5 pb-4">
          {isLoadingMarkets && displayMarkets.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <MarketSkeleton key={i} />
            ))
          ) : displayMarkets.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-600">
              {marketCategory === '5m'
                ? 'Loading live 5M rounds…'
                : isSearching
                  ? 'No markets found'
                  : 'No markets available'}
            </div>
          ) : marketCategory === '5m' ? (
            displayMarkets.map((market) => (
              <FiveMinuteMarketCard key={market.id} market={market} />
            ))
          ) : (
            displayMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Bottom: Connection Status */}
      <Separator className="bg-zinc-800" />
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div
          className={`size-2 rounded-full ${
            wsConnected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.3)]'
          }`}
        />
        <span className="text-xs text-zinc-400">
          {wsConnected ? 'WebSocket Live' : marketCategory === '5m' ? 'REST Polling (1s)' : 'REST Polling (3s)'}
        </span>
        {wsConnected ? (
          <Wifi className="ml-auto size-3.5 text-emerald-500" />
        ) : (
          <WifiOff className="ml-auto size-3.5 text-amber-500/60" />
        )}
      </div>
    </aside>
  );
}
