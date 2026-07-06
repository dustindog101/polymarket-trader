import { NextRequest, NextResponse } from 'next/server';
import { getOpenOrders, cancelOrder, cancelAllOrders, placeOrder } from '@/lib/polymarket';

// GET /api/polymarket/orders — list open orders
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get('market') || undefined;
  try {
    const orders = await getOpenOrders(market);
    return NextResponse.json({ orders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/polymarket/orders — place a new order
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.token_id || !body.price || !body.size || !body.side) {
      return NextResponse.json({ error: 'token_id, price, size, and side are required' }, { status: 400 });
    }
    const result = await placeOrder(body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/polymarket/orders — cancel all or specific
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('order_id');
  const market = searchParams.get('market') || undefined;

  try {
    if (orderId) {
      const result = await cancelOrder(orderId);
      return NextResponse.json(result);
    }
    const result = await cancelAllOrders(market);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}