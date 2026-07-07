import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime for reliable fetch + caching behavior
export const runtime = 'nodejs';
// Cache for 5 seconds on the server — spot prices don't change faster than that
// and we don't want to hammer Binance.
export const revalidate = 5;

// ─── Helpers ─────────────────────────────────────────────────────────

const BINANCE_BASE = 'https://api.binance.com';

const SYMBOL_MAP: Record<string, string> = {
  btc: 'BTCUSDT',
  eth: 'ETHUSDT',
  sol: 'SOLUSDT',
};

const FALLBACK_PRICES: Record<string, number> = {
  // Used if Binance is down or rate-limits us — keeps the UI from breaking
  btc: 63000,
  eth: 1700,
  sol: 80,
};

interface PriceResponse {
  asset: string;
  symbol: string;
  spot: number;
  /** Price at the requested timestamp (for 5M target/strike). null if
   *  historical fetch failed or no timestamp was requested. */
  historical: number | null;
  /** The timestamp the historical price was requested for. */
  historicalTimestamp: number | null;
  source: 'binance' | 'fallback';
  fetchedAt: number;
}

/** Fetch the current spot price for an asset from Binance. */
async function fetchSpot(asset: string): Promise<{ price: number; source: 'binance' | 'fallback' }> {
  const symbol = SYMBOL_MAP[asset];
  if (!symbol) {
    return { price: FALLBACK_PRICES[asset] ?? 0, source: 'fallback' };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${BINANCE_BASE}/api/v3/ticker/price?symbol=${symbol}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'polymarket-trader/2.3' },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Binance spot ${res.status}`);
    const data = await res.json();
    return { price: parseFloat(data.price), source: 'binance' };
  } catch {
    return { price: FALLBACK_PRICES[asset] ?? 0, source: 'fallback' };
  }
}

/** Fetch the historical price at a specific Unix-ms timestamp.
 *  Uses 1m klines — finds the kline whose openTime <= timestamp and returns
 *  its close price (the price at the end of that 1-minute candle, which is
 *  the closest approximation to the price at `timestamp`). */
async function fetchHistorical(asset: string, timestampMs: number): Promise<number | null> {
  const symbol = SYMBOL_MAP[asset];
  if (!symbol) return null;

  // Binance klines: fetch the candle that contains `timestampMs`.
  // We query with startTime = timestampMs - 60000 (1 min before) and limit=1
  // to get the candle that was open at that moment, then use its open price
  // as the best approximation of the price AT that timestamp.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const url = `${BINANCE_BASE}/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${
      timestampMs - 60000
    }&limit=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'polymarket-trader/2.3' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    // Kline format: [openTime, open, high, low, close, volume, closeTime, ...]
    // The OPEN price of the candle whose openTime is closest to (but <=) our
    // target timestamp is the best approximation of the price at that moment.
    const kline = data[0];
    const openTime = kline[0];
    const openPrice = parseFloat(kline[1]);
    // If the candle's openTime is more than 1 minute after our target, the
    // data is wrong — return null.
    if (Math.abs(openTime - timestampMs) > 120000) return null;
    return openPrice;
  } catch {
    return null;
  }
}

// GET /api/polymarket/price?asset=btc
// GET /api/polymarket/price?asset=btc&at=1783383900  (unix seconds — fetches historical price too)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asset = (searchParams.get('asset') || 'btc').toLowerCase();
  const atParam = searchParams.get('at'); // unix seconds

  if (!SYMBOL_MAP[asset]) {
    return NextResponse.json(
      { error: 'asset must be btc, eth, or sol' },
      { status: 400 },
    );
  }

  const [spotResult, historical] = await Promise.all([
    fetchSpot(asset),
    atParam ? fetchHistorical(asset, parseInt(atParam, 10) * 1000) : Promise.resolve(null),
  ]);

  const response: PriceResponse = {
    asset,
    symbol: SYMBOL_MAP[asset],
    spot: spotResult.price,
    historical,
    historicalTimestamp: atParam ? parseInt(atParam, 10) : null,
    source: spotResult.source,
    fetchedAt: Date.now(),
  };

  return NextResponse.json(response);
}
