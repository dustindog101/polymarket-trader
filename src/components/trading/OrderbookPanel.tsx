'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
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
//
// The flash logic compares the current size against the previous size
// FOR THE SAME PRICE LEVEL. We use a ref keyed by price that's updated
// synchronously during render (not in useEffect) so the comparison is
// always against the immediately-previous value.
//
// Flash rules:
//   - Size increased → green flash (bid) / red flash (ask)
//   - Size decreased → subtle dim flash
//   - New level (no previous) → no flash (just appears)
//   - Removed level → handled by parent (not rendered)
//
// This avoids the constant flashing caused by the old approach which
// re-flashed on every orderbook update regardless of whether the size
// at this price actually changed.

function BookRow({
  level,
  maxSize,
  side,
  prevSizesRef,
  onClick,
}: {
  level: BookLevel;
  maxSize: number;
  side: 'bid' | 'ask';
  prevSizesRef: React.MutableRefObject<Map<number, number>>;
  onClick: () => void;
}) {
  const prevSize = prevSizesRef.current.get(level.price);
  const sizeChanged = prevSize !== undefined && prevSize !== level.size;
  const sizeIncreased = prevSize !== undefined && level.size > prevSize;

  // Update the ref synchronously so the NEXT render compares against this one
  prevSizesRef.current.set(level.price, level.size);

  // Flash state — only triggers when size actually changed
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (!sizeChanged) return;
    setFlash(sizeIncreased ? 'up' : 'down');
    const t = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.price, level.size]);

  const pct = maxSize > 0 ? (level.size / maxSize) * 100 : 0;
  const isBest = side === 'bid';

  const flashBg =
    flash === 'up'
      ? side === 'bid'
        ? 'bg-emerald-500/25'
        : 'bg-red-500/25'
      : flash === 'down'
        ? side === 'bid'
          ? 'bg-emerald-500/10'
          : 'bg-red-500/10'
        : '';

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Click to ${side === 'bid' ? 'sell at' : 'buy at'} ${cents(level.price)}¢`}
      className={`
        relative w-full flex items-center justify-between px-2 py-[3px] text-xs font-mono tabular-nums transition-colors cursor-pointer
        ${flashBg ? flashBg : 'hover:bg-zinc-800/60'}
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

  const bidPrevRef = useRef<Map<number, number>>(new Map());
  const askPrevRef = useRef<Map<number, number>>(new Map());

  const book: OrderbookData | undefined = selectedTokenId
    ? orderbooks[selectedTokenId]
    : undefined;

  // Track whether we've EVER had data for this token, so we can show a
  // "Loading..." state instead of "No bids" when the book is briefly empty
  // during a round transition or API hiccup.
  const everHadDataRef = useRef<Set<string>>(new Set());
  const [showEmptyState, setShowEmptyState] = useState(false);

  useEffect(() => {
    if (!selectedTokenId) return;
    const hasData = !!(book && (book.bids.length > 0 || book.asks.length > 0));
    if (hasData) {
      everHadDataRef.current.add(selectedTokenId);
    }
    // Debounce the empty-state: only show "No bids/asks" if we've been empty
    // for >500ms. This prevents flicker during rapid updates where the book
    // is briefly empty between API responses.
    if (hasData) {
      setShowEmptyState(false);
      return;
    }
    const hadBefore = everHadDataRef.current.has(selectedTokenId);
    if (!hadBefore) {
      // Never had data — show loading, not "empty"
      setShowEmptyState(false);
      return;
    }
    const t = setTimeout(() => setShowEmptyState(true), 500);
    return () => clearTimeout(t);
  }, [book?.bids.length, book?.asks.length, selectedTokenId, book]);

  // Clear prev-size refs when token changes so we don't carry over stale data
  useEffect(() => {
    bidPrevRef.current = new Map();
    askPrevRef.current = new Map();
  }, [selectedTokenId]);

  // Sorted + sliced bids/asks. Memoized on the book's bids/asks arrays only
  // (NOT on flashCounter — that was causing unnecessary re-renders).
  const bids = useMemo(() => {
    if (!book?.bids) return [];
    const sorted = [...book.bids].sort((a, b) => b.price - a.price);
    return sorted.slice(0, MAX_LEVELS);
  }, [book?.bids]);

  const asks = useMemo(() => {
    if (!book?.asks) return [];
    const sorted = [...book.asks].sort((a, b) => a.price - b.price);
    return sorted.slice(0, MAX_LEVELS);
  }, [book?.asks]);

  const maxBidSize = useMemo(() => Math.max(...bids.map((b) => b.size), 1), [bids]);
  const maxAskSize = useMemo(() => Math.max(...asks.map((a) => a.size), 1), [asks]);

  // Clean up stale entries from prev-size refs — remove prices that are no
  // longer in the book so the Map doesn't grow unbounded.
  useEffect(() => {
    const currentBidPrices = new Set(bids.map((b) => b.price));
    for (const key of bidPrevRef.current.keys()) {
      if (!currentBidPrices.has(key)) bidPrevRef.current.delete(key);
    }
    const currentAskPrices = new Set(asks.map((a) => a.price));
    for (const key of askPrevRef.current.keys()) {
      if (!currentAskPrices.has(key)) askPrevRef.current.delete(key);
    }
  }, [bids, asks]);

  const bestBid = bids.length > 0 ? bids[0] : null;
  const bestAsk = asks.length > 0 ? asks[0] : null;
  const spread = bestBid && bestAsk ? bestAsk.price - bestBid.price : null;
  const spreadPct = spread !== null && bestAsk ? (spread / bestAsk.price) * 100 : null;

  const outcomeName =
    selectedMarket?.tokens?.find((t) => t.token_id === selectedTokenId)?.outcome ?? 'YES';

  if (!selectedTokenId || !book) {
    return (
      <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40">
        <div className="flex h-full items-center justify-center text-sm text-zinc-600">
          {selectedMarket ? 'Loading orderbook…' : 'Select a market to view orderbook'}
        </div>
      </div>
    );
  }

  const isLoading = !showEmptyState && bids.length === 0 && asks.length === 0;

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
              {isLoading ? 'Loading…' : showEmptyState ? 'No bids' : ''}
            </div>
          ) : (
            <div>
              {bids.map((level, i) => (
                <div key={`bid-${level.price}`}>
                  <BookRow
                    level={level}
                    maxSize={maxBidSize}
                    side="bid"
                    prevSizesRef={bidPrevRef}
                    onClick={() =>
                      quickOpenTicket({
                        price: level.price * 100,
                        tokenId: selectedTokenId ?? undefined,
                        side: 'SELL',
                      })
                    }
                  />
                  {i === 0 && <div className="h-[1px] bg-emerald-500/20 mx-2" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asks */}
        <div className="overflow-y-auto custom-scrollbar">
          {asks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-zinc-700">
              {isLoading ? 'Loading…' : showEmptyState ? 'No asks' : ''}
            </div>
          ) : (
            <div>
              {asks.map((level, i) => (
                <div key={`ask-${level.price}`}>
                  <BookRow
                    level={level}
                    maxSize={maxAskSize}
                    side="ask"
                    prevSizesRef={askPrevRef}
                    onClick={() =>
                      quickOpenTicket({
                        price: level.price * 100,
                        tokenId: selectedTokenId ?? undefined,
                        side: 'BUY',
                      })
                    }
                  />
                  {i === 0 && <div className="h-[1px] bg-red-500/20 mx-2" />}
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
