'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
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

// ─── Custom Tooltip ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: number;
}) {
  if (!active || !payload?.length || !label) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const point = payload[0]?.payload as (PricePoint & { timeStr?: string }) | undefined;

  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-lg">
      <div className="text-[10px] text-zinc-500 mb-1">
        {formatTimeFull(label)}
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
          <div
            className="size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-zinc-400 capitalize">{entry.dataKey}:</span>
          <span className="font-mono text-zinc-100 font-medium">
            {(entry.value * 100).toFixed(1)}¢
          </span>
        </div>
      ))}
      {point?.size !== undefined && (
        <div className="text-[10px] text-zinc-500 mt-0.5">
          Size: {point.size.toFixed(2)}
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────

export function PriceChart() {
  const { priceHistory, selectedTokenId, selectedMarket } = useTradingStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const history: PricePoint[] = selectedTokenId
    ? priceHistory[selectedTokenId] ?? []
    : [];

  // Build chart data — dual line if we have the complementary token
  const { chartData, hasDual } = useMemo(() => {
    if (!selectedMarket || history.length === 0) {
      return { chartData: [], hasDual: false };
    }

    // If we have both token IDs, we can show both lines
    const otherTokenId = selectedMarket.clobTokenIds?.find(
      (id) => id !== selectedTokenId,
    );
    const otherHistory = otherTokenId
      ? priceHistory[otherTokenId] ?? []
      : [];

    if (otherHistory.length === 0 || !otherTokenId) {
      // Single line
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

    // Dual line — align by timestamp
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

  // Auto-scroll to latest (recharts handles this via ResponsiveContainer,
  // but we can limit displayed points for perf)
  const displayData = useMemo(() => {
    if (chartData.length <= 200) return chartData;
    return chartData.slice(-200);
  }, [chartData]);

  // Determine outcome name for axis label
  const outcomeName = selectedMarket?.tokens?.find(
    (t) => t.token_id === selectedTokenId,
  )?.outcome ?? 'YES';

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
    // Show current price from market data while waiting for polling data
    const currentPrice = selectedMarket?.tokens?.find(
      (t) => t.token_id === selectedTokenId,
    )?.price ?? parseFloat(selectedMarket?.outcomePrices?.[0] ?? '0');

    return (
      <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
          <span className="text-xs font-medium text-zinc-300">Price Chart</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
            {outcomeName}
          </span>
        </div>
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
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-300">Price Chart</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
          {outcomeName}
        </span>
      </div>

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
              content={<CustomTooltip />}
              cursor={{
                stroke: '#3f3f46',
                strokeDasharray: '4 4',
              }}
            />

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