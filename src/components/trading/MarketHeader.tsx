'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Clock,
  BarChart3,
  Droplets,
  ShoppingCart,
  ChevronRight,
  CheckCircle2,
  Timer,
  Bitcoin,
  Coins,
  History,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useTradingStore } from '@/stores/trading';
import { PreviousRoundsDialog } from '@/components/trading/PreviousRoundsDialog';

// ─── Helpers ─────────────────────────────────────────────────────────

function formatCompactValue(val: number | string): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatCountdown(endDate: string): { text: string; expired: boolean } {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const diff = end - now;

  if (diff <= 0) return { text: 'Ended', expired: true };

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) return { text: `${days}d ${hours}h`, expired: false };
  if (hours > 0) return { text: `${hours}h ${minutes}m`, expired: false };
  return { text: `${minutes}m ${seconds}s`, expired: false };
}

function formatEndDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Live MM:SS countdown that ticks every second. */
function useLiveCountdown(roundEndSeconds: number | null | undefined) {
  const [state, setState] = useState({ text: '--:--', secondsLeft: 0, expired: false });
  useEffect(() => {
    if (!roundEndSeconds) {
      setState({ text: '--:--', secondsLeft: 0, expired: false });
      return;
    }
    const tick = () => {
      const remaining = roundEndSeconds * 1000 - Date.now();
      if (remaining <= 0) {
        setState({ text: 'Resolving…', secondsLeft: 0, expired: true });
        return;
      }
      const totalSec = Math.floor(remaining / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      setState({ text: `${m}:${s.toString().padStart(2, '0')}`, secondsLeft: totalSec, expired: false });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [roundEndSeconds]);
  return state;
}

const ASSET_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  btc: { label: 'BTC', icon: <Bitcoin className="size-4" />, color: 'text-orange-400' },
  eth: { label: 'ETH', icon: <Coins className="size-4" />, color: 'text-indigo-300' },
  sol: { label: 'SOL', icon: <Coins className="size-4" />, color: 'text-emerald-400' },
};

/**
 * Compute the live midpoint price for a token from its orderbook.
 * Returns null if the orderbook is empty.
 *
 * The orderbook updates every 500ms (for 5M markets) via the polling loop,
 * so this gives us real-time prices — unlike `selectedMarket.outcomePrices`
 * which only updates every 10s via the 5M market-list refresh.
 */
function useLivePrice(tokenId: string | null | undefined): number | null {
  const orderbooks = useTradingStore((s) => s.orderbooks);
  if (!tokenId) return null;
  const book = orderbooks[tokenId];
  if (!book || (book.bids.length === 0 && book.asks.length === 0)) return null;
  const bestBid = book.bids.length > 0 ? Math.max(...book.bids.map((b) => b.price)) : 0;
  const bestAsk = book.asks.length > 0 ? Math.min(...book.asks.map((a) => a.price)) : 0;
  if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
  if (bestBid > 0) return bestBid;
  if (bestAsk > 0) return bestAsk;
  return null;
}

/** Fetch live BTC/ETH/SOL spot + target price. Shared with PriceChart.
 *  Polls spot every 2s (was 3s — user wants every millisecond to count). */
function useAssetPrice(asset: string | null | undefined, roundStart: number | null | undefined) {
  const [data, setData] = useState<{ spot: number; historical: number | null } | null>(null);

  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    async function fetchTarget() {
      if (!asset) return;
      try {
        const url = roundStart
          ? `/api/polymarket/price?asset=${asset}&at=${roundStart}`
          : `/api/polymarket/price?asset=${asset}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData({ spot: json.spot, historical: json.historical });
      } catch {
        // silent
      }
    }
    fetchTarget();
    return () => { cancelled = true; };
  }, [asset, roundStart]);

  useEffect(() => {
    if (!asset) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/polymarket/price?asset=${asset}`);
        if (!res.ok) return;
        const json = await res.json();
        setData((prev) => ({ spot: json.spot, historical: prev?.historical ?? json.historical }));
      } catch {
        // silent
      }
    };
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [asset]);

  return data;
}

function formatUsd(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(2)}`;
}

// ─── Component ───────────────────────────────────────────────────────

export function MarketHeader() {
  const { selectedMarket, setShowOrderTicket, priceHistory, selectedTokenId, fiveMinuteHistory, quickOpenTicket } =
    useTradingStore();

  const [countdown, setCountdown] = useState({ text: '', expired: false });
  const [showHistory, setShowHistory] = useState(false);
  const isFiveMinute = !!(selectedMarket?.asset && selectedMarket?.durationMinutes);
  const liveCountdown = useLiveCountdown(selectedMarket?.roundEnd);

  // ─── LIVE PRICES from orderbook midpoints (updates every 500ms) ──
  // This is the key fix: previously prices came from selectedMarket.outcomePrices
  // which only updates every 10s. Now we compute from the orderbook which
  // polls at 500ms for 5M markets — so UP/DOWN prices tick in real-time.
  const liveUpPrice = useLivePrice(selectedMarket?.clobTokenIds?.[0]);
  const liveDownPrice = useLivePrice(selectedMarket?.clobTokenIds?.[1]);
  // Fallback to selectedMarket.outcomePrices if orderbook is empty (e.g. BTC daily markets)
  const yesPrice = liveUpPrice ?? parseFloat(selectedMarket?.outcomePrices?.[0] ?? '0');
  const noPrice = liveDownPrice ?? parseFloat(selectedMarket?.outcomePrices?.[1] ?? '0');

  // ─── LIVE BTC/ETH/SOL spot + target price ──
  const assetPrice = useAssetPrice(selectedMarket?.asset, selectedMarket?.roundStart);
  const spotVsTarget =
    assetPrice?.spot && assetPrice?.historical
      ? assetPrice.spot >= assetPrice.historical
        ? 'up'
        : 'down'
      : null;

  useEffect(() => {
    if (!selectedMarket?.endDate) return;

    const update = () => {
      setCountdown(formatCountdown(selectedMarket.endDate));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [selectedMarket?.endDate]);

  // Derive price change
  const pricePoints = selectedTokenId ? priceHistory[selectedTokenId] : null;
  const [changePercent, setChangePercent] = useState<number | null>(null);
  const [changeDirection, setChangeDirection] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (!pricePoints || pricePoints.length < 2) {
      setChangePercent(null);
      setChangeDirection(null);
      return;
    }

    const first = pricePoints[0].price;
    const last = pricePoints[pricePoints.length - 1].price;
    if (first === 0) return;

    const pct = ((last - first) / first) * 100;
    setChangePercent(pct);
    setChangeDirection(pct >= 0 ? 'up' : 'down');
  }, [pricePoints]);

  // ─── Empty state ───────────────────────────────────────────────
  if (!selectedMarket) {
    return (
      <header className="flex h-16 items-center border-b border-zinc-800 bg-zinc-950/80 px-4">
        <div className="flex items-center gap-3 text-zinc-600">
          <BarChart3 className="size-5" />
          <span className="text-sm">Select a market to start trading</span>
        </div>
      </header>
    );
  }

  const isResolved = selectedMarket.closed || !selectedMarket.active;

  // 5M-specific metadata
  const assetMeta = selectedMarket.asset ? ASSET_META[selectedMarket.asset] : null;
  const historyKey = selectedMarket.asset && selectedMarket.durationMinutes
    ? `${selectedMarket.asset}-${selectedMarket.durationMinutes}`
    : null;
  const history = historyKey ? (fiveMinuteHistory[historyKey] ?? []) : [];
  const secondsLeft = liveCountdown.secondsLeft;
  const isUrgent = isFiveMinute && secondsLeft > 0 && secondsLeft <= 60;
  const isVeryUrgent = isFiveMinute && secondsLeft > 0 && secondsLeft <= 15;

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 lg:px-6">
      {/* Top row: title + place order */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {assetMeta && (
              <Badge
                variant="outline"
                className={`shrink-0 border-zinc-700 bg-zinc-900 ${assetMeta.color} text-xs gap-1`}
              >
                {assetMeta.icon}
                {assetMeta.label}
                {selectedMarket.durationMinutes && (
                  <span className="text-zinc-500 ml-1">{selectedMarket.durationMinutes}m</span>
                )}
              </Badge>
            )}
            <h1 className="text-base font-semibold text-zinc-100 truncate max-w-[600px]">
              {selectedMarket.question}
            </h1>
            {isResolved && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shrink-0">
                <CheckCircle2 className="size-3 mr-1" />
                RESOLVED
              </Badge>
            )}
          </div>

          {/* Tags */}
          {selectedMarket.tags?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {selectedMarket.tags.slice(0, 4).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="border-zinc-700 text-zinc-400 text-[10px] px-1.5 py-0 bg-zinc-900/50"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isFiveMinute && (
            <Button
              onClick={() => setShowHistory(true)}
              variant="outline"
              size="sm"
              className="h-8 border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600"
            >
              <History className="size-3.5 mr-1.5" />
              Previous Rounds
            </Button>
          )}
          <Button
            onClick={() => setShowOrderTicket(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            size="sm"
          >
            <ShoppingCart className="size-4 mr-1.5" />
            Place Order
            <ChevronRight className="size-3.5 ml-0.5" />
          </Button>
        </div>
      </div>

      {/* Quick-trade row for 5M markets — 1-click BUY UP / BUY DOWN at best ask */}
      {isFiveMinute && selectedMarket.clobTokenIds?.length >= 2 && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium pr-1">Quick:</span>
          <button
            type="button"
            onClick={() =>
              quickOpenTicket({
                tokenId: selectedMarket.clobTokenIds![0],
                side: 'BUY',
                price: yesPrice * 100,
                size: 10,
              })
            }
            className="
              h-8 px-3 rounded-md bg-emerald-500/15 border border-emerald-500/30
              text-emerald-400 text-xs font-semibold flex items-center gap-1
              hover:bg-emerald-500/25 hover:border-emerald-500/50 transition-colors
            "
          >
            <ArrowUp className="size-3.5" />
            BUY UP @ {(yesPrice * 100).toFixed(1)}¢
          </button>
          <button
            type="button"
            onClick={() =>
              quickOpenTicket({
                tokenId: selectedMarket.clobTokenIds![1],
                side: 'BUY',
                price: noPrice * 100,
                size: 10,
              })
            }
            className="
              h-8 px-3 rounded-md bg-red-500/15 border border-red-500/30
              text-red-400 text-xs font-semibold flex items-center gap-1
              hover:bg-red-500/25 hover:border-red-500/50 transition-colors
            "
          >
            <ArrowDown className="size-3.5" />
            BUY DOWN @ {(noPrice * 100).toFixed(1)}¢
          </button>
          <span className="text-[10px] text-zinc-600 ml-1">
            Size 10 shares pre-set — adjust in ticket
          </span>
        </div>
      )}

      {/* BTC/ETH/SOL spot vs target panel for 5M markets — the "price to beat" */}
      {isFiveMinute && assetPrice && assetPrice.spot > 0 && (
        <div className="mt-2.5 flex items-stretch gap-2">
          {/* Live spot price */}
          <div className="flex-1 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-medium mb-0.5">
              {selectedMarket.asset?.toUpperCase()} Spot (live)
            </div>
            <div className={`text-xl font-bold font-mono tabular-nums leading-tight ${
              spotVsTarget === 'up' ? 'text-emerald-400' : spotVsTarget === 'down' ? 'text-red-400' : 'text-zinc-200'
            }`}>
              {formatUsd(assetPrice.spot)}
            </div>
          </div>
          {/* Target/strike price (price to beat) */}
          <div className="flex-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-amber-500/80 font-medium mb-0.5">
              Target (price to beat)
            </div>
            <div className="text-xl font-bold font-mono tabular-nums leading-tight text-amber-400">
              {assetPrice.historical ? formatUsd(assetPrice.historical) : '—'}
            </div>
          </div>
          {/* Delta */}
          {assetPrice.historical && (
            <div className={`flex-1 rounded-md border px-3 py-2 ${
              spotVsTarget === 'up'
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-red-500/30 bg-red-500/5'
            }`}>
              <div className={`text-[9px] uppercase tracking-wider font-medium mb-0.5 ${
                spotVsTarget === 'up' ? 'text-emerald-500/80' : 'text-red-500/80'
              }`}>
                {spotVsTarget === 'up' ? 'UP is winning' : 'DOWN is winning'}
              </div>
              <div className={`text-xl font-bold font-mono tabular-nums leading-tight ${
                spotVsTarget === 'up' ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {assetPrice.spot >= assetPrice.historical ? '+' : ''}
                {formatUsd(assetPrice.spot - assetPrice.historical)}
                <span className="text-xs ml-1 opacity-70">
                  ({((assetPrice.spot - assetPrice.historical) / assetPrice.historical * 100).toFixed(2)}%)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Price + Meta row */}
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        {/* YES / UP price */}
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-emerald-500/15 px-3 py-1.5 border border-emerald-500/20">
            <div className="text-[10px] uppercase tracking-wider text-emerald-500/80 font-medium flex items-center gap-1">
              {isFiveMinute ? <ArrowUp className="size-2.5" /> : null}
              {selectedMarket.outcomes?.[0] ?? 'Yes'}
            </div>
            <div className="text-lg font-bold text-emerald-400 font-mono tabular-nums leading-tight">
              ¢{(yesPrice * 100).toFixed(1)}
            </div>
          </div>
          {changeDirection && changePercent !== null && (
            <div
              className={`flex items-center gap-0.5 text-xs font-medium ${
                changeDirection === 'up' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {changeDirection === 'up' ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              )}
              {Math.abs(changePercent).toFixed(1)}%
            </div>
          )}
        </div>

        {/* NO / DOWN price */}
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-red-500/15 px-3 py-1.5 border border-red-500/20">
            <div className="text-[10px] uppercase tracking-wider text-red-500/80 font-medium flex items-center gap-1">
              {isFiveMinute ? <ArrowDown className="size-2.5" /> : null}
              {selectedMarket.outcomes?.[1] ?? 'No'}
            </div>
            <div className="text-lg font-bold text-red-400 font-mono tabular-nums leading-tight">
              ¢{(noPrice * 100).toFixed(1)}
            </div>
          </div>
        </div>

        {/* 5M round countdown — prominent when on a 5M market */}
        {isFiveMinute && (
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${
              isVeryUrgent
                ? 'border-red-500/40 bg-red-500/10 animate-pulse'
                : isUrgent
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : 'border-zinc-700 bg-zinc-900/60'
            }`}
          >
            <Timer className={`size-3.5 ${isVeryUrgent ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-zinc-400'}`} />
            <div className="flex flex-col">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                Round ends in
              </div>
              <div
                className={`text-lg font-bold font-mono tabular-nums leading-tight ${
                  isVeryUrgent
                    ? 'text-red-400'
                    : isUrgent
                      ? 'text-amber-400'
                      : 'text-zinc-100'
                }`}
              >
                {liveCountdown.text}
              </div>
            </div>
          </div>
        )}

        <Separator orientation="vertical" className="h-10 bg-zinc-800 hidden sm:block" />

        {/* Volume */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <BarChart3 className="size-3.5" />
              <span>Vol:</span>
              <span className="text-zinc-300 font-medium">
                {formatCompactValue(selectedMarket.volumeNum ?? selectedMarket.volume24hr ?? selectedMarket.volume ?? '0')}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-700 text-zinc-300 text-xs">
            {isFiveMinute ? 'Round volume' : '24h trading volume'}
          </TooltipContent>
        </Tooltip>

        {/* Liquidity */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Droplets className="size-3.5" />
              <span>Liq:</span>
              <span className="text-zinc-300 font-medium">
                {formatCompactValue(selectedMarket.liquidityNum ?? selectedMarket.liquidity ?? '0')}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-700 text-zinc-300 text-xs">
            Current liquidity depth
          </TooltipContent>
        </Tooltip>

        {/* End date + countdown (non-5M markets) */}
        {!isFiveMinute && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Clock className="size-3.5" />
                <span>{formatEndDate(selectedMarket.endDate)}</span>
                {!countdown.expired && countdown.text && (
                  <>
                    <Separator orientation="vertical" className="h-3 bg-zinc-700 mx-0.5" />
                    <span
                      className={`font-mono tabular-nums ${
                        countdown.text.includes('m') && !countdown.text.includes('d') && !countdown.text.includes('h')
                          ? 'text-amber-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {countdown.text}
                    </span>
                  </>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-700 text-zinc-300 text-xs">
              Market end date
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* 5M round history strip — last 10 outcomes as compact ↑↓ badges */}
      {isFiveMinute && history.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="uppercase tracking-wider text-[10px]">Last {history.length}:</span>
          <div className="flex items-center gap-0.5">
            {history.slice(0, 10).map((round, i) => (
              <Tooltip key={round.id ?? i}>
                <TooltipTrigger asChild>
                  <span
                    className={`inline-flex items-center justify-center size-5 rounded text-[10px] font-bold ${
                      round.winner === 'up'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : round.winner === 'down'
                          ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                          : 'bg-zinc-800 text-zinc-600 border border-zinc-700'
                    }`}
                  >
                    {round.winner === 'up' ? (
                      <ArrowUp className="size-2.5" />
                    ) : round.winner === 'down' ? (
                      <ArrowDown className="size-2.5" />
                    ) : (
                      '?'
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-700 text-zinc-300 text-xs">
                  {round.question}<br />
                  Resolved: {round.winner === 'up' ? 'Up' : round.winner === 'down' ? 'Down' : 'Unknown'}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      <PreviousRoundsDialog open={showHistory} onOpenChange={setShowHistory} />
    </header>
  );
}