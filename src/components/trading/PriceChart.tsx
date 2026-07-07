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
import { TrendingUp, TrendingDown, Target } from 'lucide-react';
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
  historical: number | null; // target/strike price at round start
  source: 'binance' | 'fallback';
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
    <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-lg min-w-[180px]">
      {/* Timestamp */}
      <div className="text-[10px] text-zinc-500 mb-1.5 font-mono">
        {formatTimeFull(label)}
      </div>

      {/* Outcome price (YES/NO shares) */}
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs mb-0.5">
          <div
            className="size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-zinc-400 capitalize w-8">{entry.dataKey}:</span>
          <span className="font-mono text-zinc-100 font-medium ml-auto">
            {(entry.value * 100).toFixed(1)}¢
          </span>
        </div>
      ))}

      {/* Trade size if available */}
      {point?.size !== undefined && point.size > 0 && (
        <div className="text-[10px] text-zinc-500 mt-0.5">
          Size: {point.size.toFixed(2)}
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-zinc-800 my-1.5" />

      {/* Live BTC/ETH/SOL spot price */}
      {assetPrice && assetPrice.spot > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <TrendingUp className="size-3 text-emerald-400" />
          <span className="text-zinc-400">{assetSymbol} now:</span>
          <span className="font-mono text-emerald-400 font-semibold ml-auto">
            {formatUsd(assetPrice.spot)}
          </span>
        </div>
      )}

      {/* Target/strike price (BTC price at round start) */}
      {assetPrice?.historical && assetPrice.historical > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <Target className="size-3 text-amber-400" />
          <span className="text-zinc-400">Target:</span>
          <span className="font-mono text-amber-400 font-semibold ml-auto">
            {formatUsd(assetPrice.historical)}
          </span>
        </div>
      )}

      {/* Delta from target */}
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

// ─── Hook: poll asset spot price + fetch historical target ───────────

function useAssetPrice(asset: string | null | undefined, roundStart: number | null | undefined) {
  const [data, setData] = useState<AssetPriceData | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch the historical target price ONCE when the round starts
  // (or when asset/roundStart changes). This doesn't change during the round.
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
          setData({
            spot: json.spot,
            historical: json.historical,
            source: json.source,
          });
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTarget();
    return () => {
      cancelled = true;
    };
  }, [asset, roundStart]);

  // Poll the SPOT price every 3 seconds (it changes continuously).
  // The historical target price is already set from the effect above and
  // doesn't need re-fetching.
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

    // Poll every 3s — spot price doesn't need sub-second updates in the
    // tooltip (the user sees it when they hover, and 3s is fresh enough)
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [asset]);

  return { data, loading };
}

// ─── Component ───────────────────────────────────────────────────────

export function PriceChart() {
  const { priceHistory, selectedTokenId, selectedMarket } = useTradingStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch the underlying asset (BTC/ETH/SOL) spot + target price
  const { data: assetPrice, loading: assetPriceLoading } = useAssetPrice(
    selectedMarket?.asset,
    selectedMarket?.roundStart,
  );

  const history: PricePoint[] = selectedTokenId
    ? priceHistory[selectedTokenId] ?? []
    : [];

  // Build chart data — dual line if we have the complementary token
  const { chartData, hasDual } = useMemo(() => {
    if (!selectedMarket || history.length === 0) {
      return { chartData: [], hasDual: false };
    }

    const otherTokenId = selectedMarket.clobTokenIds?.find(
      (id) => id !== selectedTokenId,
    );
    const otherHistory = otherTokenId
      ? priceHistory[otherTokenId] ?? []
      : [];

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

  // Determine if the current asset price is above or below target
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
    const currentPrice = selectedMarket?.tokens?.find(
      (t) => t.token_id === selectedTokenId,
    )?.price ?? parseFloat(selectedMarket?.outcomePrices?.[0] ?? '0');

    return (
      <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40">
        <ChartHeader
          outcomeName={outcomeName}
          assetPrice={assetPrice}
          assetSymbol={selectedMarket?.asset?.toUpperCase()}
          spotVsTarget={spotVsTarget}
          loading={assetPriceLoading}
        />
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
          <div className="flex flex-col items-center gap-2">
            <div className="size-6 rounded-full border-2 border-zinc-700 border-t-emerald-500 animate-spin" />
            <span>Loading price data...</span>
            {currentPrice > 0 && (
              <span className="text-lg font-mono text-emerald-400 font-bold">
                ¢{(currentPrice * 100).toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40 overflow-hidden" ref={scrollRef}>
      <ChartHeader
        outcomeName={outcomeName}
        assetPrice={assetPrice}
        assetSymbol={selectedMarket?.asset?.toUpperCase()}
        spotVsTarget={spotVsTarget}
        loading={assetPriceLoading}
      />

      {/* Chart */}
      <div className="flex-1 min-h-0 px-1 py-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={displayData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="noGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="2 4"
              stroke="#27272a"
              vertical={false}
            />

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
              content={<CustomTooltip assetPrice={assetPrice} assetSymbol={selectedMarket?.asset?.toUpperCase()} />}
              cursor={{
                stroke: '#3f3f46',
                strokeDasharray: '4 4',
              }}
            />

            {/* 50¢ reference line (50/50 odds) */}
            <ReferenceLine y={0.5} stroke="#3f3f46" strokeDasharray="2 2" />

            {/* YES line (primary) */}
            <Area
              type="monotone"
              dataKey="yes"
              stroke="#10b981"
              strokeWidth={1.5}
              fill="url(#yesGradient)"
              isAnimationActive={false}
              dot={false}
              activeDot={{
                r: 3,
                stroke: '#10b981',
                strokeWidth: 2,
                fill: '#0a0a0a',
              }}
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
                activeDot={{
                  r: 3,
                  stroke: '#ef4444',
                  strokeWidth: 2,
                  fill: '#0a0a0a',
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Chart Header with live asset price ticker ───────────────────────

function ChartHeader({
  outcomeName,
  assetPrice,
  assetSymbol,
  spotVsTarget,
  loading,
}: {
  outcomeName: string;
  assetPrice: AssetPriceData | null;
  assetSymbol?: string;
  spotVsTarget: 'up' | 'down' | null;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-medium text-zinc-300">Price Chart</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
          {outcomeName}
        </span>
      </div>
      {/* Live asset price ticker */}
      {assetSymbol && (
        <div className="flex items-center gap-2 text-[10px] shrink-0">
          {assetPrice?.spot && assetPrice.spot > 0 ? (
            <>
              <span className="text-zinc-500">{assetSymbol}:</span>
              <span
                className={`font-mono font-semibold ${
                  spotVsTarget === 'up' ? 'text-emerald-400' : spotVsTarget === 'down' ? 'text-red-400' : 'text-zinc-300'
                }`}
              >
                {formatUsd(assetPrice.spot)}
              </span>
              {assetPrice.historical && (
                <span className="text-zinc-600 hidden sm:inline">
                  tgt {formatUsd(assetPrice.historical)}
                </span>
              )}
              {spotVsTarget && (
                <span className={`flex items-center gap-0.5 ${spotVsTarget === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {spotVsTarget === 'up' ? (
                    <TrendingUp className="size-2.5" />
                  ) : (
                    <TrendingDown className="size-2.5" />
                  )}
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
