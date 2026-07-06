import { NextRequest, NextResponse } from 'next/server';

const GAMMA_URL = process.env.POLY_GAMMA_URL || 'https://gamma-api.polymarket.com';

function parseJSONField<T>(val: any): T {
  if (Array.isArray(val)) return val as T;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return [] as unknown as T; }
  }
  return [] as unknown as T;
}

function normalizeMarket(raw: any) {
  const outcomes = parseJSONField<string[]>(raw.outcomes);
  const outcomePrices = parseJSONField<string[]>(raw.outcomePrices);
  const clobTokenIds = parseJSONField<string[]>(raw.clobTokenIds);
  const tokens = outcomes.map((outcome, i) => ({
    token_id: clobTokenIds[i] || '',
    outcome,
    price: parseFloat(outcomePrices[i] || '0'),
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
  };
}

// Cache events for 60 seconds to avoid hammering the API
let eventsCache: { data: any[]; ts: number } = { data: [], ts: 0 };

async function getTopEvents(): Promise<any[]> {
  const now = Date.now();
  if (eventsCache.data.length > 0 && now - eventsCache.ts < 60_000) {
    return eventsCache.data;
  }
  const res = await fetch(
    `${GAMMA_URL}/events?closed=false&limit=200&order=volume24hr&ascending=false`,
  );
  if (!res.ok) return eventsCache.data;
  const events = await res.json();
  eventsCache = { data: events || [], ts: now };
  return eventsCache.data;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('q') || '').trim().toLowerCase();
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  if (!query) {
    return NextResponse.json({ markets: [] });
  }

  try {
    const events = await getTopEvents();
    const qWords = query.split(/\s+/);

    // Score each market by how well it matches the query
    type ScoredMarket = { market: any; score: number };
    const scored: ScoredMarket[] = [];

    for (const event of events) {
      const eventTitle = (event.title || '').toLowerCase();
      const eventSlug = (event.slug || '').toLowerCase();

      // Quick check: does the event itself match?
      const eventMatches = qWords.some(
        (w) => eventTitle.includes(w) || eventSlug.includes(w),
      );

      for (const raw of event.markets || []) {
        const q = (raw.question || '').toLowerCase();
        const s = (raw.slug || '').toLowerCase();
        const titleMatch = qWords.every((w) => q.includes(w) || s.includes(w));
        const eventMatch = eventMatches;

        if (titleMatch || eventMatch) {
          const market = normalizeMarket(raw);
          if (market.active && !market.closed) {
            // Higher score for title match
            const score = titleMatch ? 100 : 50;
            scored.push({ market, score });
          }
        }
      }
    }

    // Sort by score desc, then by volume desc
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.market.volumeNum - a.market.volumeNum;
    });

    // Deduplicate by id
    const seen = new Set<string>();
    const unique = scored.filter((s) => {
      if (seen.has(s.market.id)) return false;
      seen.add(s.market.id);
      return true;
    });

    return NextResponse.json({
      markets: unique.slice(0, limit).map((s) => s.market),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}