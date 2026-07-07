'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useTradingStore, type BookLevel, type OrderbookData } from '@/stores/trading';

// ─── Helpers ─────────────────────────────────────────────────────────

function cents(price: number): string {
  return (price * 100).toFixed(1);
}

function formatSize(size: number): string {
  if (size >= 1000) return (size / 1000).toFixed(1) + 'K';
  if (size >= 1) return size.toFixed(0);
  return size.toFixed(2);
}

const MAX_LEVELS = 15;

// ─── Row with flash animation ─────────────────────────────────────

function BookRow({
  level,
  maxSize,
  side,
  prevPriceRef,
  flashKey,
  onClick,
}: {
  level: BookLevel;
  maxSize: number;
  side: 'bid' | 'ask';
  prevPriceRef: React.MutableRefObject<Map<number, number>>;
  flashKey: number;
  onClick: () => void;
}) {
  const [flash, setFlash] = useState(false);
  const prevPrice = prevPriceRef.current.get(level.price);

  useEffect(() => {
    if (prevPrice !== undefined && prevPrice !== level.size) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 300);
      return () => clearTimeout(t);
    }
  }, [flashKey, level.size, prevPrice]);

  const pct = maxSize > 0 ? (level.size / maxSize) * 100 : 0;
  const isBest = side === 'bid';

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Click to ${side === 'bid' ? 'sell at' : 'buy at'} ${cents(level.price)}¢`}
      className={`
        relative w-full flex items-center justify-between px-2 py-[3px] text-xs font-mono tabular-nums transition-colors cursor-pointer
        ${flash ? (side === 'bid' ? 'bg-emerald-500/20' : 'bg-red-500/20') : 'hover:bg-zinc-800/60'}
        ${isBest ? 'text-emerald-300' : 'text-zinc-400'}
      `}
    >
      {/* Depth bar */}
      <div
        className={`
          absolute inset-y-0 right-0 transition-all duration-200 pointer-events-none
          ${side === 'bid' ? 'bg-emerald-500/8' : 'bg-red-500/8'}
        `}
        style={{ width: `${pct}%` }}
      />
      <span className="relative z-10">{cents(level.price)}¢</span>
      <span className="relative z-10 text-zinc-500">{formatSize(level.size)}</span>
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────

export function OrderbookPanel() {
  const { orderbooks, selectedTokenId, selectedMarket, quickOpenTicket, setSelectedTokenId } = useTradingStore();
  const flashCounter = useRef(0);
  const bidPrevRef = useRef<Map<number, number>>(new Map());
  const askPrevRef = useRef<Map<number, number>>(new Map());

  const book: OrderbookData | undefined = selectedTokenId
    ? orderbooks[selectedTokenId]
    : undefined;

  // Flash trigger on orderbook update
  const [, forceUpdate] = useState(0);
  const prevTimestampRef = useRef(0);

  useEffect(() => {
    if (book?.timestamp && book.timestamp !== prevTimestampRef.current) {
      prevTimestampRef.current = book.timestamp;
      flashCounter.current += 1;
      forceUpdate((n) => n + 1);
    }
  }, [book?.timestamp]);

  const bids = useMemo(() => {
    if (!book) return [];
    const sorted = [...book.bids].sort((a, b) => b.price - a.price);
    return sorted.slice(0, MAX_LEVELS);
  }, [book?.bids, flashCounter.current]);

  const asks = useMemo(() => {
    if (!book) return [];
    const sorted = [...book.asks].sort((a, b) => a.price - b.price);
    return sorted.slice(0, MAX_LEVELS);
  }, [book?.asks, flashCounter.current]);

  const maxBidSize = useMemo(
    () => Math.max(...bids.map((b) => b.size), 1),
    [bids],
  );
  const maxAskSize = useMemo(
    () => Math.max(...asks.map((a) => a.size), 1),
    [asks],
  );

  // Update prev refs for flash detection
  useEffect(() => {
    bidPrevRef.current = new Map(bids.map((b) => [b.price, b.size]));
    askPrevRef.current = new Map(asks.map((a) => [a.price, a.size]));
  }, [bids, asks]);

  const bestBid = bids.length > 0 ? bids[0] : null;
  const bestAsk = asks.length > 0 ? asks[0] : null;
  const spread =
    bestBid && bestAsk ? bestAsk.price - bestBid.price : null;
  const spreadPct =
    spread !== null && bestAsk ? (spread / bestAsk.price) * 100 : null;

  const outcomeName =
    selectedMarket?.tokens?.find((t) => t.token_id === selectedTokenId)?.outcome ??
    'YES';

  if (!selectedTokenId || !book) {
    return (
      <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40">
        <div className="flex h-full items-center justify-center text-sm text-zinc-600">
          {selectedMarket
            ? 'Select an outcome to view orderbook'
            : 'Select a market to view orderbook'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-300">Orderbook</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
          {outcomeName}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-2 border-b border-zinc-800/60">
        <div className="flex items-center justify-between px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
          <span>Price</span>
          <span>Size</span>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
          <span>Price</span>
          <span>Size</span>
        </div>
      </div>

      {/* Spread */}
      {spread !== null && spreadPct !== null && (
        <div className="grid grid-cols-2 border-b border-zinc-800/40">
          <div />
          <div className="flex items-center justify-center gap-1.5 py-1.5">
            <span className="text-[10px] text-zinc-600 uppercase">Spread</span>
            <span className="text-xs font-mono text-amber-400 font-medium">
              {cents(spread)}¢
            </span>
            <span className="text-[10px] text-zinc-600">({spreadPct.toFixed(1)}%)</span>
          </div>
        </div>
      )}

      {/* Book body */}
      <div className="grid grid-cols-2 flex-1 overflow-hidden">
        {/* Bids */}
        <div className="overflow-y-auto border-r border-zinc-800/40 custom-scrollbar">
          {bids.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-zinc-700">
              No bids
            </div>
          ) : (
            <div>
              {bids.map((level, i) => (
                <div key={`bid-${level.price}`}>
                  <BookRow
                    level={level}
                    maxSize={maxBidSize}
                    side="bid"
                    prevPriceRef={bidPrevRef}
                    flashKey={flashCounter.current}
                    onClick={() =>
                      quickOpenTicket({
                        price: level.price * 100,
                        tokenId: selectedTokenId ?? undefined,
                        side: 'SELL',
                      })
                    }
                  />
                  {i === 0 && (
                    <div className="h-[1px] bg-emerald-500/20 mx-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asks */}
        <div className="overflow-y-auto custom-scrollbar">
          {asks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-zinc-700">
              No asks
            </div>
          ) : (
            <div>
              {asks.map((level, i) => (
                <div key={`ask-${level.price}`}>
                  <BookRow
                    level={level}
                    maxSize={maxAskSize}
                    side="ask"
                    prevPriceRef={askPrevRef}
                    flashKey={flashCounter.current}
                    onClick={() =>
                      quickOpenTicket({
                        price: level.price * 100,
                        tokenId: selectedTokenId ?? undefined,
                        side: 'BUY',
                      })
                    }
                  />
                  {i === 0 && (
                    <div className="h-[1px] bg-red-500/20 mx-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Outcome switcher + click hint */}
      {selectedMarket?.tokens && selectedMarket.tokens.length > 1 && (
        <div className="border-t border-zinc-800/60 p-1.5 flex items-center gap-1">
          {selectedMarket.tokens.map((t) => (
            <button
              key={t.token_id}
              type="button"
              onClick={() => setSelectedTokenId(t.token_id)}
              className={`
                flex-1 h-7 rounded text-[10px] font-medium uppercase tracking-wider transition-colors
                ${selectedTokenId === t.token_id
                  ? (t.outcome?.toLowerCase().includes('up') || t.outcome?.toLowerCase().includes('yes')
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/15 text-red-400 border border-red-500/30')
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
                }
              `}
            >
              {t.outcome}
            </button>
          ))}
        </div>
      )}
      <div className="border-t border-zinc-800/40 px-2 py-1 text-[9px] text-zinc-600 text-center">
        Click any level to prefill order ticket
      </div>
    </div>
  );
}