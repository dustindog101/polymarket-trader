import { NextResponse } from 'next/server';
import { getPopularMarkets, getCryptoMarkets } from '@/lib/polymarket';

export async function GET() {
  try {
    const [popular, crypto] = await Promise.all([
      getPopularMarkets(25),
      getCryptoMarkets(30),
    ]);
    return NextResponse.json({ popular, crypto });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}