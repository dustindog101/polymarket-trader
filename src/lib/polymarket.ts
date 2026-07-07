// Polymarket CLOB V2 API Client — server-side only
// Handles auth, market search, orderbook, orders, and balance

const CLOB_URL = process.env.POLY_CLOB_URL || 'https://clob.polymarket.com';
const GAMMA_URL = process.env.POLY_GAMMA_URL || 'https://gamma-api.polymarket.com';

function getApiCreds() {
  const key = process.env.POLY_API_KEY;
  const secret = process.env.POLY_SECRET;
  const passphrase = process.env.POLY_PASSPHRASE;
  if (!key || !secret || !passphrase) {
    throw new Error('Missing Polymarket API credentials in env');
  }
  return { key, secret, passphrase };
}

function polyHeaders(method: string, path: string): Record<string, string> {
  const { key, secret, passphrase } = getApiCreds();
  const timestamp = Date.now().toString();
  return {
    'Content-Type': 'application/json',
    'POLY_API_KEY': key,
    'POLY_SECRET': secret,
    'POLY_PASSPHRASE': passphrase,
    'POLY_TIMESTAMP': timestamp,
    'POLY_NONCE': Math.floor(Math.random() * 1e9).toString(),
  };
}

// ─── Normalize Gamma API response ────────────────────────────────
// Gamma returns JSON-encoded strings for array fields; parse them.

function parseJSONField<T>(val: any): T {
  if (Array.isArray(val)) return val as T;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return [] as unknown as T; }
  }
  return [] as unknown as T;
}

export function normalizeMarket(raw: any): GammaMarket {
  const outcomes = parseJSONField<string[]>(raw.outcomes);
  const outcomePrices = parseJSONField<string[]>(raw.outcomePrices);
  const clobTokenIds = parseJSONField<string[]>(raw.clobTokenIds);

  // Build tokens array from outcomes + outcomePrices + clobTokenIds
  const tokens = outcomes.map((outcome, i) => ({
    token_id: clobTokenIds[i] || '',
    outcome,
    price: parseFloat(outcomePrices[i] || '0'),
    winner: typeof raw.tokens?.[i]?.winner === 'boolean' ? raw.tokens[i].winner : null,
  }));

  return {
    id: String(raw.id ?? ''),
    question: raw.question ?? '',
    slug: raw.slug ?? '',
    outcomes,
    outcomePrices,
    volume: String(raw.volume ?? raw.volumeClob ?? '0'),
    volume24hr: String(raw.volume24hr ?? raw.volume24hrClob ?? '0'),
    liquidity: String(raw.liquidity ?? raw.liquidityClob ?? '0'),
    liquidityNum: raw.liquidityNum ?? parseFloat(raw.liquidity ?? '0'),
    volumeNum: raw.volumeNum ?? parseFloat(raw.volume ?? '0'),
    active: raw.active ?? false,
    closed: raw.closed ?? false,
    archived: raw.archived ?? false,
    acceptingOrders: raw.acceptingOrders ?? false,
    acceptingOrderVolume: raw.acceptingOrderVolume ?? '',
    endDate: raw.endDate ?? '',
    startDate: raw.startDate ?? '',
    createdAt: raw.createdAt ?? '',
    image: raw.image ?? '',
    category: raw.category ?? '',
    tags: parseJSONField<string[]>(raw.tags),
    groupItemTitle: raw.groupItemTitle ?? null,
    groupId: raw.groupId ?? null,
    clobTokenIds,
    conditionId: raw.conditionId ?? '',
    tokens,
    resolutionSource: raw.resolutionSource ?? null,
    description: raw.description ?? '',
    // 5M / 15M "Up or Down" market metadata (populated by get5mMarkets/get5mHistory)
    asset: raw.asset ?? null,
    durationMinutes: raw.durationMinutes ?? null,
    roundStart: raw.roundStart ?? null,
    roundEnd: raw.roundEnd ?? null,
  };
}

// ─── Gamma API (public, no auth) ────────────────────────────────────

export interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  volume24hr: string;
  liquidity: string;
  liquidityNum: number;
  volumeNum: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  acceptingOrders: boolean;
  acceptingOrderVolume: string;
  endDate: string;
  startDate: string;
  createdAt: string;
  image: string;
  category: string;
  tags: string[];
  groupItemTitle: string | null;
  groupId: string | null;
  clobTokenIds: string[];
  conditionId: string;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
    winner?: boolean | null;
  }>;
  resolutionSource: string | null;
  description: string;
  // 5M / 15M "Up or Down" market metadata (only present for minute markets)
  asset?: 'btc' | 'eth' | 'sol' | null;
  durationMinutes?: number | null;
  roundStart?: number | null;  // unix seconds
  roundEnd?: number | null;    // unix seconds
}

export async function searchMarkets(query: string, limit = 20): Promise<GammaMarket[]> {
  const params = new URLSearchParams({
    closed: 'false',
    limit: limit.toString(),
    order: 'volume24hr',
    ascending: 'false',
    archived: 'false',
  });
  if (query) params.set('query', query);

  const res = await fetch(`${GAMMA_URL}/markets?${params}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`Gamma search failed: ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data) ? data : data?.data || data?.markets || [];
  return raw.map(normalizeMarket);
}

export async function getMarketBySlug(slug: string): Promise<GammaMarket | null> {
  const res = await fetch(`${GAMMA_URL}/markets/${slug}`, {
    next: { revalidate: 15 },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  return normalizeMarket(raw);
}

export async function getMarketByConditionId(conditionId: string): Promise<GammaMarket | null> {
  const res = await fetch(`${GAMMA_URL}/markets?condition_id=${conditionId}`, {
    next: { revalidate: 15 },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [];
  return arr.length > 0 ? normalizeMarket(arr[0]) : null;
}

export async function getPopularMarkets(limit = 30): Promise<GammaMarket[]> {
  return searchMarkets('', limit);
}

// Fetch live prices for multiple tokens (for polling)
export async function getTokenPrices(tokenIds: string[]): Promise<Record<string, { price: string; midpoint: string; spread: string }>> {
  if (tokenIds.length === 0) return {};
  const ids = tokenIds.join(',');
  const [pricesRes, midRes, spreadRes] = await Promise.allSettled([
    fetch(`${CLOB_URL}/prices?token_ids=${ids}`),
    fetch(`${CLOB_URL}/midpoint?token_ids=${ids}`),
    fetch(`${CLOB_URL}/spread?token_ids=${ids}`),
  ]);

  const result: Record<string, { price: string; midpoint: string; spread: string }> = {};

  if (pricesRes.status === 'fulfilled' && pricesRes.value.ok) {
    const prices = await pricesRes.value.json();
    for (const [k, v] of Object.entries(prices)) {
      if (!result[k]) result[k] = { price: '0', midpoint: '0', spread: '0' };
      result[k].price = String(v);
    }
  }
  if (midRes.status === 'fulfilled' && midRes.value.ok) {
    const mids = await midRes.value.json();
    for (const [k, v] of Object.entries(mids)) {
      if (!result[k]) result[k] = { price: '0', midpoint: '0', spread: '0' };
      result[k].midpoint = String(v);
    }
  }
  if (spreadRes.status === 'fulfilled' && spreadRes.value.ok) {
    const spreads = await spreadRes.value.json();
    for (const [k, v] of Object.entries(spreads)) {
      if (!result[k]) result[k] = { price: '0', midpoint: '0', spread: '0' };
      result[k].spread = String(v);
    }
  }

  return result;
}

// Fetch markets from a specific event slug (e.g., "bitcoin-above-on-july-6-2026")
export async function getMarketsByEventSlug(slug: string): Promise<GammaMarket[]> {
  const res = await fetch(`${GAMMA_URL}/events?slug=${slug}&closed=false`, {
    next: { revalidate: 15 },
  });
  if (!res.ok) return [];
  const events = await res.json();
  if (!Array.isArray(events) || events.length === 0) return [];
  const markets = events[0]?.markets || [];
  return markets.map(normalizeMarket);
}

// Fetch all crypto-related events and their markets
export async function getCryptoMarkets(limit = 30): Promise<GammaMarket[]> {
  const res = await fetch(
    `${GAMMA_URL}/events?closed=false&limit=100&order=volume24hr&ascending=false`,
    { next: { revalidate: 30 } },
  );
  if (!res.ok) return [];

  const events: any[] = await res.json();
  const cryptoEvents = events.filter(
    (e) => {
      const t = (e.title || '').toLowerCase();
      const s = (e.slug || '').toLowerCase();
      return (
        t.includes('bitcoin') || t.includes('btc') ||
        t.includes('ethereum') || t.includes('eth') ||
        t.includes('solana') || t.includes('sol') ||
        s.includes('bitcoin') || s.includes('ethereum') || s.includes('solana')
      );
    },
  );

  // Collect markets from all crypto events
  const allMarkets: GammaMarket[] = [];
  const seen = new Set<string>();

  for (const event of cryptoEvents) {
    const rawMarkets: any[] = event.markets || [];
    for (const raw of rawMarkets) {
      const m = normalizeMarket(raw);
      if (!seen.has(m.id) && m.active && !m.closed) {
        seen.add(m.id);
        allMarkets.push(m);
      }
    }
    if (allMarkets.length >= limit) break;
  }

  return allMarkets.slice(0, limit);
}

// Fetch BTC daily "above $X" and other fast-moving BTC markets
// Polymarket's fastest BTC markets resolve daily (e.g. "Bitcoin above $56,000 on July 7?")
export async function getBtcDailyMarkets(): Promise<GammaMarket[]> {
  const allMarkets: GammaMarket[] = [];
  const seen = new Set<string>();

  // Strategy: Use Gamma search API to find BTC events directly
  // Search for "bitcoin above" which matches the daily "Bitcoin above ___ on [date]" events
  const searches = [
    'bitcoin above',       // Daily "above $X" markets (fastest)
    'bitcoin price',       // Price range markets
    'bitcoin hit',         // "Will Bitcoin reach $X" markets
    'bitcoin reach',       // Same pattern
    'bitcoin dip',         // Downside markets
  ];

  // Run all searches in parallel (each returns up to 20 markets)
  const results = await Promise.allSettled(
    searches.map((q) =>
      fetch(
        `${GAMMA_URL}/markets?closed=false&limit=20&order=volume24hr&ascending=false&query=${encodeURIComponent(q)}`,
      ).then((r) => (r.ok ? r.json() : [])),
    ),
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const markets: any[] = Array.isArray(result.value) ? result.value : [];
    for (const raw of markets) {
      const m = normalizeMarket(raw);
      if (!seen.has(m.id) && m.active && !m.closed) {
        seen.add(m.id);
        allMarkets.push(m);
      }
    }
  }

  // Also fetch from events endpoint for markets that only appear in events
  const eventRes = await fetch(
    `${GAMMA_URL}/events?closed=false&limit=100&order=volume24hr&ascending=false`,
    { next: { revalidate: 30 } },
  );
  if (eventRes.ok) {
    const events: any[] = await eventRes.json();
    for (const event of events) {
      const t = (event.title || '').toLowerCase();
      const s = (event.slug || '').toLowerCase();
      if (t.includes('bitcoin') || t.includes('btc') || s.includes('bitcoin')) {
        for (const raw of event.markets || []) {
          const m = normalizeMarket(raw);
          if (!seen.has(m.id) && m.active && !m.closed) {
            seen.add(m.id);
            allMarkets.push(m);
          }
        }
      }
    }
  }

  // Sort by volume24hr descending, daily "above" markets first
  allMarkets.sort((a, b) => {
    const aDaily = a.question.toLowerCase().includes('above');
    const bDaily = b.question.toLowerCase().includes('above');
    if (aDaily && !bDaily) return -1;
    if (!aDaily && bDaily) return 1;
    return (b.volumeNum || 0) - (a.volumeNum || 0);
  });

  return allMarkets.slice(0, 40);
}

// ─── 5M / 15M "Up or Down" crypto markets ────────────────────────────
//
// Polymarket's fastest markets — BTC/ETH/SOL "Up or Down" prediction rounds
// that resolve every 5 or 15 minutes. These are NOT discoverable via the
// standard Gamma search/pagination APIs because there's indexing latency
// between on-chain creation and API availability.
//
// The trick (discovered via handiko/Polymarket-Market-Finder): the slug
// pattern is deterministic from the current Unix timestamp rounded down
// to the round interval:
//
//   slug = "{asset}-updown-{duration}m-{roundedTimestamp}"
//
// So we can fetch the live round directly via:
//   GET /events/slug/{slug}
//
// These markets have REAL CLOB orderbooks (unlike the daily "above $X"
// markets which have empty books) — so orderbook polling works for charts.

export type CryptoAsset = 'btc' | 'eth' | 'sol';
export const FIVE_MINUTE_ASSETS: CryptoAsset[] = ['btc', 'eth', 'sol'];
export const FIVE_MINUTE_DURATIONS = [5, 15] as const;

/** Build the deterministic slug for a 5M/15M "Up or Down" round. */
export function buildUpdownSlug(
  asset: CryptoAsset,
  durationMinutes: number,
  atTimeSeconds: number,
): string {
  const interval = durationMinutes * 60;
  const rounded = Math.floor(atTimeSeconds / interval) * interval;
  return `${asset}-updown-${durationMinutes}m-${rounded}`;
}

/** Fetch a single 5M/15M round by slug. Returns null if the round doesn't exist yet. */
export async function getUpdownRound(
  asset: CryptoAsset,
  durationMinutes: number,
  atTimeSeconds: number = Math.floor(Date.now() / 1000),
): Promise<GammaMarket | null> {
  const slug = buildUpdownSlug(asset, durationMinutes, atTimeSeconds);
  const interval = durationMinutes * 60;
  const rounded = Math.floor(atTimeSeconds / interval) * interval;

  const res = await fetch(`${GAMMA_URL}/events/slug/${slug}`, {
    headers: {
      'User-Agent': 'polymarket-trader/2.2 (+https://polymarket.com)',
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  const rawMarkets: any[] = data?.markets ?? [];
  if (rawMarkets.length === 0) return null;
  const market = normalizeMarket(rawMarkets[0]);
  // Stamp the 5M metadata so the client can render countdown / detect round transitions
  market.asset = asset;
  market.durationMinutes = durationMinutes;
  market.roundStart = rounded;
  market.roundEnd = rounded + interval;
  return market;
}

/**
 * Fetch the current live 5M/15M rounds for all assets × durations.
 * Returns a flat array (typically 6 markets: 3 assets × 2 durations).
 * If a round hasn't been indexed yet (rare race), it's silently dropped.
 */
export async function get5mMarkets(): Promise<GammaMarket[]> {
  const tasks: Promise<GammaMarket | null>[] = [];
  for (const asset of FIVE_MINUTE_ASSETS) {
    for (const duration of FIVE_MINUTE_DURATIONS) {
      tasks.push(getUpdownRound(asset, duration));
    }
  }
  const results = await Promise.allSettled(tasks);
  const markets: GammaMarket[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) markets.push(r.value);
  }
  // Sort: 5m first (faster = more interesting), then BTC > ETH > SOL
  const assetOrder: Record<CryptoAsset, number> = { btc: 0, eth: 1, sol: 2 };
  markets.sort((a, b) => {
    const da = a.durationMinutes ?? 99;
    const db = b.durationMinutes ?? 99;
    if (da !== db) return da - db;
    return (assetOrder[a.asset ?? 'btc'] ?? 99) - (assetOrder[b.asset ?? 'btc'] ?? 99);
  });
  return markets;
}

/**
 * Fetch the previous N resolved rounds for an asset/duration.
 * Each entry has `closed: true` and `outcomePrices` like ["1","0"] (Up won)
 * or ["0","1"] (Down won).
 *
 * `count` rounds are fetched backwards from the round immediately before
 * the current live round. Returns newest-first.
 */
export async function get5mHistory(
  asset: CryptoAsset,
  durationMinutes: number,
  count = 10,
): Promise<GammaMarket[]> {
  const interval = durationMinutes * 60;
  const now = Math.floor(Date.now() / 1000);
  const currentRoundStart = Math.floor(now / interval) * interval;

  const tasks: Promise<GammaMarket | null>[] = [];
  for (let i = 1; i <= count; i++) {
    const roundStart = currentRoundStart - i * interval;
    tasks.push(getUpdownRound(asset, durationMinutes, roundStart + interval / 2));
  }

  const results = await Promise.allSettled(tasks);
  const history: GammaMarket[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) history.push(r.value);
  }
  return history; // newest first (i=1, then i=2, ...)
}

// ─── CLOB API (public read endpoints) ───────────────────────────────

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface OrderbookResponse {
  market: string;
  asset_id: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  hash: string;
  sequence: number;
}

export async function getOrderbook(tokenId: string): Promise<OrderbookResponse> {
  const res = await fetch(`${CLOB_URL}/book?token_id=${tokenId}`);
  if (!res.ok) throw new Error(`Orderbook fetch failed: ${res.status}`);
  return res.json();
}

export async function getPrices(tokenIds: string[]): Promise<Record<string, string>> {
  if (tokenIds.length === 0) return {};
  const ids = tokenIds.join(',');
  const res = await fetch(`${CLOB_URL}/prices?token_ids=${ids}`);
  if (!res.ok) throw new Error(`Prices fetch failed: ${res.status}`);
  return res.json();
}

export async function getMidpoint(tokenIds: string[]): Promise<Record<string, string>> {
  if (tokenIds.length === 0) return {};
  const ids = tokenIds.join(',');
  const res = await fetch(`${CLOB_URL}/midpoint?token_ids=${ids}`);
  if (!res.ok) throw new Error(`Midpoint fetch failed: ${res.status}`);
  return res.json();
}

export async function getSpread(tokenIds: string[]): Promise<Record<string, string>> {
  if (tokenIds.length === 0) return {};
  const ids = tokenIds.join(',');
  const res = await fetch(`${CLOB_URL}/spread?token_ids=${ids}`);
  if (!res.ok) throw new Error(`Spread fetch failed: ${res.status}`);
  return res.json();
}

// ─── CLOB API (authenticated endpoints) ─────────────────────────────

export interface OpenOrder {
  id: string;
  market: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  original_size: string;
  size_matched: string;
  price: string;
  status: string;
  outcome: string;
  created_at: string;
  type: string;
}

export async function getOpenOrders(market?: string): Promise<OpenOrder[]> {
  const headers = polyHeaders('GET', '/orders');
  let url = `${CLOB_URL}/orders`;
  if (market) url += `?market=${market}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Get orders failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data?.data || [];
}

export async function cancelOrder(orderId: string): Promise<{ success: boolean }> {
  const headers = polyHeaders('DELETE', '/order');
  const res = await fetch(`${CLOB_URL}/order/${orderId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`Cancel order failed: ${res.status}`);
  return { success: true };
}

export async function cancelAllOrders(market?: string): Promise<{ success: boolean; cancelled: number }> {
  const headers = polyHeaders('DELETE', '/orders');
  let url = `${CLOB_URL}/orders`;
  const body: Record<string, string> = {};
  if (market) {
    body.market = market;
    url += `?market=${market}`;
  }
  const res = await fetch(url, {
    method: 'DELETE',
    headers,
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Cancel all orders failed: ${res.status}`);
  const data = await res.json();
  return { success: true, cancelled: data?.cancelled_count || 0 };
}

export interface BalanceResponse {
  balance: string;
  allowance: string;
}

export async function getBalance(): Promise<BalanceResponse> {
  const headers = polyHeaders('GET', '/balance');
  const res = await fetch(`${CLOB_URL}/balance`, { headers });
  if (!res.ok) throw new Error(`Balance fetch failed: ${res.status}`);
  return res.json();
}

export interface PlaceOrderRequest {
  token_id: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  type?: 'GTC' | 'GTD' | 'FOK' | 'FAK';
  post_only?: boolean;
}

export async function placeOrder(req: PlaceOrderRequest): Promise<{ orderID: string; status: string }> {
  const headers = polyHeaders('POST', '/order');

  const orderPayload = {
    tokenID: req.token_id,
    price: req.price,
    size: req.size,
    side: req.side,
    type: req.type || 'GTC',
    postOnly: req.post_only || false,
    feeRateBps: 0,
    nonce: Date.now(),
  };

  const body = {
    order: orderPayload,
  };

  const res = await fetch(`${CLOB_URL}/order`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Place order failed: ${res.status} — ${err}`);
  }
  return res.json();
}