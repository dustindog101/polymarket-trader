import { NextResponse } from 'next/server';
import { getPopularMarkets, getCryptoMarkets, getBtcDailyMarkets, get5mMarkets } from '@/lib/polymarket';

export async function GET() {
  try {
    const [popular, crypto, btc, fiveMinute] = await Promise.all([
      getPopularMarkets(25),
      getCryptoMarkets(30),
      getBtcDailyMarkets(),
      get5mMarkets(),
    ]);
    return NextResponse.json({ popular, crypto, btc, fiveMinute });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
