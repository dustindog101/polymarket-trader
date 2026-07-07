import { NextResponse } from 'next/server';
import { get5mHistory, type CryptoAsset } from '@/lib/polymarket';

// GET /api/polymarket/5m/history?asset=btc&duration=5&count=10
// Returns the previous N resolved rounds for a single asset/duration,
// newest first. Each round includes the winner ("up" or "down") so the
// client can render a compact ↑↓ strip without re-deriving it.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const asset = (url.searchParams.get('asset') || 'btc') as CryptoAsset;
    const durationParam = url.searchParams.get('duration');
    const duration = durationParam ? parseInt(durationParam, 10) : 5;
    const countParam = url.searchParams.get('count');
    const count = countParam ? parseInt(countParam, 10) : 10;

    if (!['btc', 'eth', 'sol'].includes(asset)) {
      return NextResponse.json({ error: 'asset must be btc, eth, or sol' }, { status: 400 });
    }
    if (![5, 15].includes(duration)) {
      return NextResponse.json({ error: 'duration must be 5 or 15' }, { status: 400 });
    }
    const safeCount = Math.min(Math.max(count, 1), 30);

    const rounds = await get5mHistory(asset, duration, safeCount);
    return NextResponse.json({
      asset,
      duration,
      rounds: rounds.map((m) => {
        const up = parseFloat(m.outcomePrices[0] ?? '0');
        const down = parseFloat(m.outcomePrices[1] ?? '0');
        // Winner is only meaningful for fully-resolved rounds (closed + binary prices).
        // The most recent round may have ended but not yet resolved — its prices
        // still show the last traded odds, not the outcome.
        const isBinary = (up === 1 && down === 0) || (up === 0 && down === 1);
        const winner = m.closed && isBinary ? (up === 1 ? 'up' : 'down') : null;
        return {
          id: m.id,
          question: m.question,
          slug: m.slug,
          conditionId: m.conditionId,
          outcomes: m.outcomes,
          outcomePrices: m.outcomePrices,
          closed: m.closed,
          endDate: m.endDate,
          roundStart: m.roundStart,
          roundEnd: m.roundEnd,
          winner,
        };
      }),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
