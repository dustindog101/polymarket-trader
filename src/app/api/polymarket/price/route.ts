import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime for reliable fetch + caching behavior
export const runtime = 'nodejs';
// Cache for 5 seconds on the server — spot prices don't change faster than that
// and we don't want to hammer Binance.
export const revalidate = 5;

// ─── Helpers ─────────────────────────────────────────────────────────

// Binance.com geo-blocks US-based servers (Vercel is US-based). Binance.US
// is the US-legal exchange and works from Vercel. We try Binance.US first,
// then Binance.com, then fall back to hardcoded prices.
const BINANCE_ENDPOINTS = [
  'https://api.binance.us',
  'https://api.binance.com',
];

const SYMBOL_MAP: Record<string, string> = {
  btc: 'BTCUSDT',
  eth: 'ETHUSDT',
  sol: 'SOLUSDT',
};

const FALLBACK_PRICES: Record<string, number> = {
  // Used if all Binance endpoints fail — keeps the UI from breaking
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

/** Try each Binance endpoint until one works. Returns the JSON response
 *  or null if all fail. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFromBinance(path: string): Promise<any | null> {
  for (const base of BINANCE_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${base}${path}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'polymarket-trader/2.3' },
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      return await res.json();
    } catch {
      // try next endpoint
    }
  }
  return null;
}

/** Fetch the current spot price for an asset from Binance. */
async function fetchSpot(asset: string): Promise<{ price: number; source: 'binance' | 'fallback' }> {
  const symbol = SYMBOL_MAP[asset];
  if (!symbol) {
    return { price: FALLBACK_PRICES[asset] ?? 0, source: 'fallback' };
  }
  const data = await fetchFromBinance(`/api/v3/ticker/price?symbol=${symbol}`);
  if (data && typeof data.price === 'string') {
    return { price: parseFloat(data.price), source: 'binance' };
  }
  return { price: FALLBACK_PRICES[asset] ?? 0, source: 'fallback' };
}

/** Fetch the historical price at a specific Unix-ms timestamp.
 *  Uses 1m klines — finds the kline whose openTime <= timestamp and returns
 *  its open price as the best approximation of the price at `timestamp`. */
async function fetchHistorical(asset: string, timestampMs: number): Promise<number | null> {
  const symbol = SYMBOL_MAP[asset];
  if (!symbol) return null;

  // Query the 1m candle that contains `timestampMs`. We fetch starting 1 min
  // before the target so we get the candle that was OPEN at that moment.
  const startTime = timestampMs - 60000;
  for (const base of BINANCE_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `${base}/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startTime}&limit=1`,
        {
          signal: controller.signal,
          headers: { 'User-Agent': 'polymarket-trader/2.3' },
        },
      );
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      // Kline format: [openTime, open, high, low, close, volume, closeTime, ...]
      const kline = data[0];
      const openTime = kline[0];
      const openPrice = parseFloat(kline[1]);
      // Sanity check: the candle's openTime should be within 2 min of our target
      if (Math.abs(openTime - timestampMs) > 120000) continue;
      return openPrice;
    } catch {
      // try next endpoint
    }
  }
  return null;
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
