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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useTradingStore } from '@/stores/trading';

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

// ─── Component ───────────────────────────────────────────────────────

export function MarketHeader() {
  const { selectedMarket, setShowOrderTicket, priceHistory, selectedTokenId, fiveMinuteHistory } =
    useTradingStore();

  const [countdown, setCountdown] = useState({ text: '', expired: false });
  const isFiveMinute = !!(selectedMarket?.asset && selectedMarket?.durationMinutes);
  const liveCountdown = useLiveCountdown(selectedMarket?.roundEnd);

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

  const yesPrice = parseFloat(selectedMarket.outcomePrices?.[0] ?? '0');
  const noPrice = parseFloat(selectedMarket.outcomePrices?.[1] ?? '0');
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

        <Button
          onClick={() => setShowOrderTicket(true)}
          className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          size="sm"
        >
          <ShoppingCart className="size-4 mr-1.5" />
          Place Order
          <ChevronRight className="size-3.5 ml-0.5" />
        </Button>
      </div>

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
    </header>
  );
}