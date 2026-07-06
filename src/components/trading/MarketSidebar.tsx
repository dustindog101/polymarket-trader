'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, TrendingUp, Wifi, WifiOff, Clock, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

// ─── Component ───────────────────────────────────────────────────────

export function MarketSidebar() {
  const {
    popularMarkets,
    cryptoMarkets,
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
    setPopularMarkets,
    setCryptoMarkets,
  } = useTradingStore();

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync local query with store
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  // Markets are loaded by the main page into the store — no duplicate fetch here.

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
    setMarketCategory('popular');
  }, [setSearchQuery, setSearchResults, setMarketCategory]);

  // Select market — orderbook fetching and WS subscription handled by main page
  const handleSelectMarket = useCallback(
    (market: Market) => {
      selectMarket(market);
    },
    [selectMarket],
  );

  const isSearching = searchQuery.trim().length > 0;
  const displayMarkets = isSearching
    ? searchResults
    : marketCategory === 'crypto'
      ? cryptoMarkets
      : popularMarkets;

  // ─── Market Card ─────────────────────────────────────────────────
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

        <div className="mt-1.5 text-xs text-zinc-500">
          Vol 24h: <span className="text-zinc-400">{formatCompactVolume(vol)}</span>
        </div>
      </button>
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
            onValueChange={(v) => setMarketCategory(v as 'popular' | 'crypto')}
          >
            <TabsList className="h-8 w-full bg-zinc-900 border border-zinc-800 rounded-lg">
              <TabsTrigger
                value="popular"
                className="flex-1 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 rounded-md"
              >
                <TrendingUp className="size-3 mr-1" />
                Popular
              </TabsTrigger>
              <TabsTrigger
                value="crypto"
                className="flex-1 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 rounded-md"
              >
                Crypto
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
              <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <Skeleton className="mb-2 h-4 w-3/4 bg-zinc-800" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16 bg-zinc-800" />
                  <Skeleton className="h-5 w-16 bg-zinc-800" />
                </div>
                <Skeleton className="mt-2 h-3 w-20 bg-zinc-800" />
              </div>
            ))
          ) : displayMarkets.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-600">
              {isSearching ? 'No markets found' : 'No markets available'}
            </div>
          ) : (
            displayMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Bottom: Wallet Status */}
      <Separator className="bg-zinc-800" />
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div
          className={`size-2 rounded-full ${wsConnected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-zinc-600'}`}
        />
        <span className="text-xs text-zinc-400">
          {wsConnected ? 'Wallet Connected' : 'Disconnected'}
        </span>
        {wsConnected ? (
          <Wifi className="ml-auto size-3.5 text-emerald-500" />
        ) : (
          <WifiOff className="ml-auto size-3.5 text-zinc-600" />
        )}
      </div>
    </aside>
  );
}