import { NextResponse } from 'next/server';
import { getPopularMarkets, getCryptoMarkets, getBtcDailyMarkets } from '@/lib/polymarket';

export async function GET() {
  try {
    const [popular, crypto, btc] = await Promise.all([
      getPopularMarkets(25),
      getCryptoMarkets(30),
      getBtcDailyMarkets(),
    ]);
    return NextResponse.json({ popular, crypto, btc });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}