import { NextRequest, NextResponse } from 'next/server';
import { getMarketByConditionId, normalizeMarket } from '@/lib/polymarket';

const GAMMA_URL = process.env.POLY_GAMMA_URL || 'https://gamma-api.polymarket.com';

// Re-fetch fresh prices for a market from Gamma API
// BTC daily "above $X" markets have empty CLOB orderbooks, so we poll Gamma instead
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conditionId = searchParams.get('condition_id');
  const marketId = searchParams.get('market_id');
  const slug = searchParams.get('slug');

  if (!conditionId && !marketId && !slug) {
    return NextResponse.json({ error: 'condition_id, market_id, or slug required' }, { status: 400 });
  }

  try {
    let market = null;

    if (conditionId) {
      market = await getMarketByConditionId(conditionId);
    }

    if (!market && marketId) {
      const res = await fetch(`${GAMMA_URL}/markets/${marketId}`, { cache: 'no-store' });
      if (res.ok) market = normalizeMarket(await res.json());
    }

    // For slug, try both markets/{slug} and events?slug={slug} approaches
    if (!market && slug) {
      // Individual markets don't always resolve by slug in Gamma
      // Use the market ID approach or condition ID
      const res = await fetch(`${GAMMA_URL}/markets?slug=${slug}&closed=false&limit=1`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        if (arr.length > 0) market = normalizeMarket(arr[0]);
      }
    }

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: market.id,
      conditionId: market.conditionId,
      slug: market.slug,
      outcomePrices: market.outcomePrices,
      clobTokenIds: market.clobTokenIds,
      active: market.active,
      closed: market.closed,
      acceptingOrders: market.acceptingOrders,
      volume24hr: market.volume24hr,
      volume: market.volume,
      liquidity: market.liquidity,
      tokens: market.tokens,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}