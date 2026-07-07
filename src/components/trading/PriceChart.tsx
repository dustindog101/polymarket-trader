'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Target, Crosshair } from 'lucide-react';
import { useTradingStore, type PricePoint } from '@/stores/trading';

// ─── Helpers ─────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatTimeFull(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  });
}

function formatUsd(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(2)}`;
}

// ─── Types ───────────────────────────────────────────────────────────

interface AssetPriceData {
  spot: number;
  historical: number | null;
  source: 'binance' | 'fallback';
}

// ─── Hook: live price from orderbook midpoint ────────────────────────

/** Compute the live midpoint price for a token from its orderbook.
 *  Updates every 500ms for 5M markets (the polling cadence). */
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

// ─── Hook: poll asset spot price + fetch historical target ───────────

function useAssetPrice(asset: string | null | undefined, roundStart: number | null | undefined) {
  const [data, setData] = useState<AssetPriceData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    async function fetchTarget() {
      if (!asset) return;
      setLoading(true);
      try {
        const url = roundStart
          ? `/api/polymarket/price?asset=${asset}&at=${roundStart}`
          : `/api/polymarket/price?asset=${asset}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setData({ spot: json.spot, historical: json.historical, source: json.source });
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
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
        setData((prev) => ({
          spot: json.spot,
          historical: prev?.historical ?? json.historical,
          source: json.source,
        }));
      } catch {
        // silent
      }
    };
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [asset]);

  return { data, loading };
}

// ─── Custom Tooltip ──────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: any[];
  label?: number;
  assetPrice?: AssetPriceData | null;
  assetSymbol?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, assetPrice, assetSymbol }: TooltipProps) {
  if (!active || !payload?.length || !label) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const point = payload[0]?.payload as (PricePoint & { timeStr?: string }) | undefined;

  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900/95 backdrop-blur-sm px-3 py-2 shadow-xl min-w-[200px]">
      <div className="text-[10px] text-zinc-500 mb-1.5 font-mono">{formatTimeFull(label)}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs mb-0.5">
          <div className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-zinc-400 capitalize w-8">{entry.dataKey}:</span>
          <span className="font-mono text-zinc-100 font-medium ml-auto">
            {(entry.value * 100).toFixed(1)}¢
          </span>
        </div>
      ))}
      {point?.size !== undefined && point.size > 0 && (
        <div className="text-[10px] text-zinc-500 mt-0.5">Size: {point.size.toFixed(2)}</div>
      )}
      <div className="h-px bg-zinc-800 my-1.5" />
      {assetPrice && assetPrice.spot > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <TrendingUp className="size-3 text-emerald-400" />
          <span className="text-zinc-400">{assetSymbol} now:</span>
          <span className="font-mono text-emerald-400 font-semibold ml-auto">
            {formatUsd(assetPrice.spot)}
          </span>
        </div>
      )}
      {assetPrice?.historical && assetPrice.historical > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <Target className="size-3 text-amber-400" />
          <span className="text-zinc-400">Target:</span>
          <span className="font-mono text-amber-400 font-semibold ml-auto">
            {formatUsd(assetPrice.historical)}
          </span>
        </div>
      )}
      {assetPrice?.spot && assetPrice?.historical && (
        <div className="flex items-center gap-2 text-[10px] mt-0.5">
          <span className="text-zinc-600">Δ:</span>
          <span
            className={`font-mono font-semibold ml-auto ${
              assetPrice.spot >= assetPrice.historical ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {assetPrice.spot >= assetPrice.historical ? '+' : ''}
            {formatUsd(assetPrice.spot - assetPrice.historical)} (
            {((assetPrice.spot - assetPrice.historical) / assetPrice.historical * 100).toFixed(2)}%)
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────

export function PriceChart() {
  const { priceHistory, selectedTokenId, selectedMarket } = useTradingStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: assetPrice, loading: assetPriceLoading } = useAssetPrice(
    selectedMarket?.asset,
    selectedMarket?.roundStart,
  );

  // Live UP price from orderbook (updates every 500ms)
  const liveUpPrice = useLivePrice(selectedMarket?.clobTokenIds?.[0]);
  const liveDownPrice = useLivePrice(selectedMarket?.clobTokenIds?.[1]);
  const fallbackUp = parseFloat(selectedMarket?.outcomePrices?.[0] ?? '0');
  const fallbackDown = parseFloat(selectedMarket?.outcomePrices?.[1] ?? '0');
  const currentUpPrice = liveUpPrice ?? fallbackUp;
  const currentDownPrice = liveDownPrice ?? fallbackDown;

  const history: PricePoint[] = selectedTokenId
    ? priceHistory[selectedTokenId] ?? []
    : [];

  const { chartData, hasDual } = useMemo(() => {
    if (!selectedMarket || history.length === 0) {
      return { chartData: [], hasDual: false };
    }
    const otherTokenId = selectedMarket.clobTokenIds?.find((id) => id !== selectedTokenId);
    const otherHistory = otherTokenId ? priceHistory[otherTokenId] ?? [] : [];
    if (otherHistory.length === 0 || !otherTokenId) {
      const data = history.map((p) => ({
        time: p.timestamp,
        timeStr: formatTime(p.timestamp),
        yes: p.price,
        no: undefined as number | undefined,
        size: p.size,
        side: p.side,
      }));
      return { chartData: data, hasDual: false };
    }
    const otherMap = new Map(otherHistory.map((p) => [p.timestamp, p.price]));
    const data = history.map((p) => ({
      time: p.timestamp,
      timeStr: formatTime(p.timestamp),
      yes: p.price,
      no: otherMap.get(p.timestamp) ?? 1 - p.price,
      size: p.size,
      side: p.side,
    }));
    return { chartData: data, hasDual: true };
  }, [history, selectedMarket, selectedTokenId, priceHistory]);

  const displayData = useMemo(() => {
    if (chartData.length <= 200) return chartData;
    return chartData.slice(-200);
  }, [chartData]);

  const outcomeName = selectedMarket?.tokens?.find(
    (t) => t.token_id === selectedTokenId,
  )?.outcome ?? 'YES';

  const spotVsTarget =
    assetPrice?.spot && assetPrice?.historical
      ? assetPrice.spot >= assetPrice.historical
        ? 'up'
        : 'down'
      : null;

  if (!selectedTokenId) {
    return (
      <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40">
        <div className="flex h-full items-center justify-center text-sm text-zinc-600">
          Select a market to view chart
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40">
        <ChartHeader
          outcomeName={outcomeName}
          upPrice={currentUpPrice}
          downPrice={currentDownPrice}
          assetPrice={assetPrice}
          assetSymbol={selectedMarket?.asset?.toUpperCase()}
          spotVsTarget={spotVsTarget}
          loading={assetPriceLoading}
          isFiveMinute={!!selectedMarket?.durationMinutes && selectedMarket.durationMinutes <= 15}
        />
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
          <div className="flex flex-col items-center gap-2">
            <div className="size-6 rounded-full border-2 border-zinc-700 border-t-emerald-500 animate-spin" />
            <span>Loading price data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40 overflow-hidden" ref={scrollRef}>
      <ChartHeader
        outcomeName={outcomeName}
        upPrice={currentUpPrice}
        downPrice={currentDownPrice}
        assetPrice={assetPrice}
        assetSymbol={selectedMarket?.asset?.toUpperCase()}
        spotVsTarget={spotVsTarget}
        loading={assetPriceLoading}
        isFiveMinute={!!selectedMarket?.durationMinutes && selectedMarket.durationMinutes <= 15}
      />

      {/* Chart body with live price overlay */}
      <div className="flex-1 min-h-0 relative">
        {/* Big live price overlay — top-left, like Polymarket */}
        <div className="absolute top-2 left-3 z-10 pointer-events-none">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums leading-none ${
                currentUpPrice >= 0.5 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {(currentUpPrice * 100).toFixed(1)}¢
            </span>
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
              {selectedMarket?.outcomes?.[0] ?? 'YES'}
            </span>
          </div>
          {hasDual && (
            <div className="flex items-baseline gap-2 mt-0.5">
              <span
                className={`text-sm font-mono tabular-nums leading-none ${
                  currentDownPrice >= 0.5 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {(currentDownPrice * 100).toFixed(1)}¢
              </span>
              <span className="text-[9px] text-zinc-600 uppercase tracking-wider">
                {selectedMarket?.outcomes?.[1] ?? 'NO'}
              </span>
            </div>
          )}
        </div>

        {/* BTC spot vs target overlay — top-right */}
        {assetPrice && assetPrice.spot > 0 && (
          <div className="absolute top-2 right-3 z-10 pointer-events-none text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-[9px] text-zinc-600 uppercase tracking-wider">
                {selectedMarket?.asset?.toUpperCase()}
              </span>
              <span
                className={`text-sm font-bold font-mono tabular-nums ${
                  spotVsTarget === 'up' ? 'text-emerald-400' : spotVsTarget === 'down' ? 'text-red-400' : 'text-zinc-300'
                }`}
              >
                {formatUsd(assetPrice.spot)}
              </span>
              {spotVsTarget && (
                <span className={spotVsTarget === 'up' ? 'text-emerald-400' : 'text-red-400'}>
                  {spotVsTarget === 'up' ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                </span>
              )}
            </div>
            {assetPrice.historical && (
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <Target className="size-2.5 text-amber-400" />
                <span className="text-[9px] text-zinc-600 uppercase tracking-wider">target</span>
                <span className="text-xs font-mono tabular-nums text-amber-400 font-semibold">
                  {formatUsd(assetPrice.historical)}
                </span>
              </div>
            )}
          </div>
        )}

        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={displayData} margin={{ top: 50, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="noGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="2 4" stroke="#27272a" vertical={false} />

            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              tick={{ fill: '#52525b', fontSize: 10 }}
              axisLine={{ stroke: '#27272a' }}
              tickLine={false}
              minTickGap={40}
            />

            <YAxis
              domain={[0, 1]}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}¢`}
              tick={{ fill: '#52525b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />

            <RechartsTooltip
              content={
                <CustomTooltip
                  assetPrice={assetPrice}
                  assetSymbol={selectedMarket?.asset?.toUpperCase()}
                />
              }
              cursor={{ stroke: '#3f3f46', strokeDasharray: '4 4' }}
            />

            {/* 50¢ reference line (50/50 odds) */}
            <ReferenceLine y={0.5} stroke="#3f3f46" strokeDasharray="2 2" />

            {/* Current price reference line — shows where the live price is */}
            {currentUpPrice > 0 && currentUpPrice < 1 && (
              <ReferenceLine
                y={currentUpPrice}
                stroke={currentUpPrice >= 0.5 ? '#10b981' : '#ef4444'}
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            )}

            {/* YES line (primary) */}
            <Area
              type="monotone"
              dataKey="yes"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#yesGradient)"
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, stroke: '#10b981', strokeWidth: 2, fill: '#0a0a0a' }}
            />

            {/* NO line (if dual) */}
            {hasDual && (
              <Area
                type="monotone"
                dataKey="no"
                stroke="#ef4444"
                strokeWidth={1.5}
                fill="url(#noGradient)"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4, stroke: '#ef4444', strokeWidth: 2, fill: '#0a0a0a' }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Chart Header ────────────────────────────────────────────────────

function ChartHeader({
  outcomeName,
  upPrice,
  downPrice,
  assetPrice,
  assetSymbol,
  spotVsTarget,
  loading,
  isFiveMinute,
}: {
  outcomeName: string;
  upPrice: number;
  downPrice: number;
  assetPrice: AssetPriceData | null;
  assetSymbol?: string;
  spotVsTarget: 'up' | 'down' | null;
  loading: boolean;
  isFiveMinute: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
          {outcomeName}
        </span>
        {/* Live UP/DOWN odds inline */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-emerald-400 font-mono font-bold tabular-nums">
            {(upPrice * 100).toFixed(1)}¢
          </span>
          <span className="text-zinc-700">/</span>
          <span className="text-red-400 font-mono font-bold tabular-nums">
            {(downPrice * 100).toFixed(1)}¢
          </span>
        </div>
      </div>
      {/* Live asset price ticker */}
      {assetSymbol && isFiveMinute && (
        <div className="flex items-center gap-2 text-[10px] shrink-0">
          {assetPrice?.spot && assetPrice.spot > 0 ? (
            <>
              <span className="text-zinc-500">{assetSymbol}:</span>
              <span
                className={`font-mono font-bold ${
                  spotVsTarget === 'up' ? 'text-emerald-400' : spotVsTarget === 'down' ? 'text-red-400' : 'text-zinc-300'
                }`}
              >
                {formatUsd(assetPrice.spot)}
              </span>
              {assetPrice.historical && (
                <span className="text-amber-400/80 hidden sm:inline font-mono">
                  tgt {formatUsd(assetPrice.historical)}
                </span>
              )}
            </>
          ) : loading ? (
            <span className="text-zinc-600">Loading {assetSymbol}…</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
