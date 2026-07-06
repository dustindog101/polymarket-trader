import { NextResponse } from 'next/server';
import { getBalance } from '@/lib/polymarket';

export async function GET() {
  try {
    const balance = await getBalance();
    return NextResponse.json(balance);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}