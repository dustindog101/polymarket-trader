import { NextRequest, NextResponse } from 'next/server';
import { getPrices, getMidpoint, getSpread } from '@/lib/polymarket';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tokenIdsParam = searchParams.get('token_ids');

  if (!tokenIdsParam) {
    return NextResponse.json({ error: 'token_ids is required' }, { status: 400 });
  }

  const tokenIds = tokenIdsParam.split(',').filter(Boolean);

  try {
    const [prices, midpoints, spreads] = await Promise.all([
      getPrices(tokenIds),
      getMidpoint(tokenIds),
      getSpread(tokenIds),
    ]);
    return NextResponse.json({ prices, midpoints, spreads });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}