import { NextRequest, NextResponse } from 'next/server';
import { getOrderbook } from '@/lib/polymarket';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tokenId = searchParams.get('token_id');

  if (!tokenId) {
    return NextResponse.json({ error: 'token_id is required' }, { status: 400 });
  }

  try {
    const book = await getOrderbook(tokenId);
    return NextResponse.json(book);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}