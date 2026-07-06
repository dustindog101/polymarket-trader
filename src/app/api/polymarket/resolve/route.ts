import { NextRequest, NextResponse } from 'next/server';
import { getMarketBySlug, getMarketByConditionId } from '@/lib/polymarket';

// GET /api/polymarket/resolve?slug=... or ?condition_id=...
// Returns full market data including resolution history
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const conditionId = searchParams.get('condition_id');

  try {
    let market = null;
    if (slug) {
      market = await getMarketBySlug(slug);
    } else if (conditionId) {
      market = await getMarketByConditionId(conditionId);
    }

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 });
    }

    // Parse resolution info from market data
    const resolutionData = {
      resolved: market.closed,
      endDate: market.endDate,
      outcomes: market.outcomes,
      outcomePrices: market.outcomePrices,
      clobTokenIds: market.clobTokenIds,
      description: market.description,
    };

    return NextResponse.json({ market, resolution: resolutionData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}