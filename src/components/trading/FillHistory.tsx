'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTradingStore, type PricePoint } from '@/stores/trading';

// ─── Helpers ─────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatSize(size?: number): string {
  if (size === undefined || size === null) return '—';
  if (size >= 1000) return (size / 1000).toFixed(1) + 'K';
  if (size >= 1) return size.toFixed(0);
  return size.toFixed(2);
}

const MAX_TRADES = 50;

// ─── Component ───────────────────────────────────────────────────────

export function FillHistory() {
  const { priceHistory, selectedTokenId, selectedMarket } = useTradingStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  // Collect all trade entries from all tokens, or just the selected token
  const trades: PricePoint[] = useMemo(() => {
    if (!selectedMarket) return [];

    // If a token is selected, show trades for that token
    if (selectedTokenId) {
      const points = priceHistory[selectedTokenId] ?? [];
      return points.filter((p) => p.side === 'trade');
    }

    // Otherwise, aggregate trades from all tokens
    const allPoints: PricePoint[] = [];
    for (const tokenId of selectedMarket.clobTokenIds ?? []) {
      const points = priceHistory[tokenId] ?? [];
      for (const p of points) {
        if (p.side === 'trade') {
          allPoints.push({ ...p });
        }
      }
    }

    // Sort by timestamp descending
    allPoints.sort((a, b) => b.timestamp - a.timestamp);
    return allPoints.slice(0, MAX_TRADES);
  }, [priceHistory, selectedTokenId, selectedMarket]);

  // Most recent trades (for selected token, already chronological;
  // for aggregated, reverse to get chronological)
  const displayTrades = useMemo(() => {
    const list = selectedTokenId ? [...trades].slice(-MAX_TRADES) : trades;
    return list;
  }, [trades, selectedTokenId]);

  // Auto-scroll to bottom
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM has updated
    const raf = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [displayTrades.length]);

  // Determine outcome name
  const outcomeName = selectedMarket?.tokens?.find(
    (t) => t.token_id === selectedTokenId,
  )?.outcome;

  return (
    <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-300">
          Recent Trades
          {trades.length > 0 && (
            <span className="ml-1.5 text-zinc-500">({trades.length})</span>
          )}
        </span>
        {outcomeName && (
          <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
            {outcomeName}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className="flex items-center border-b border-zinc-800/60 px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
        <span className="w-16 shrink-0">Time</span>
        <span className="w-16 text-right shrink-0">Price</span>
        <span className="w-14 text-right shrink-0">Size</span>
        <span className="w-10 text-right shrink-0">Side</span>
      </div>

      {/* Trade list */}
      <ScrollArea className="flex-1">
        {displayTrades.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-zinc-600">
            No recent trades
          </div>
        ) : (
          <div ref={scrollViewportRef}>
            {displayTrades.map((trade, i) => {
              // Determine visual side based on price movement
              // If no explicit buy/sell, infer from comparison with previous trade
              let displaySide: 'BUY' | 'SELL' = 'BUY';
              if (i > 0 && displayTrades[i - 1]) {
                const prevPrice = displayTrades[i - 1].price;
                displaySide = trade.price >= prevPrice ? 'BUY' : 'SELL';
              }

              return (
                <div
                  key={`${trade.timestamp}-${i}`}
                  className="flex items-center px-3 py-[3px] text-xs font-mono tabular-nums hover:bg-zinc-800/30 transition-colors"
                >
                  <span className="w-16 shrink-0 text-zinc-500">
                    {formatTime(trade.timestamp)}
                  </span>
                  <span className="w-16 text-right shrink-0 text-zinc-200">
                    {(trade.price * 100).toFixed(1)}¢
                  </span>
                  <span className="w-14 text-right shrink-0 text-zinc-400">
                    {formatSize(trade.size)}
                  </span>
                  <span
                    className={`w-10 text-right shrink-0 font-medium ${
                      displaySide === 'BUY' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {displaySide === 'BUY' ? 'B' : 'S'}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}