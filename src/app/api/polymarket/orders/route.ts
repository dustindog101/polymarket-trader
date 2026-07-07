import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { getOpenOrders, cancelOrder, cancelAllOrders, placeOrder } from '@/lib/polymarket';

// Force Node.js runtime — undici's ProxyAgent requires Node, not Edge.
export const runtime = 'nodejs';

const CLOB_URL = process.env.POLY_CLOB_URL || 'https://clob.polymarket.com';

/** Build a ProxyAgent from a proxy spec, or null if no proxy given. */
function buildDispatcher(proxy?: { host: string; port: number; username?: string; password?: string } | null) {
  if (!proxy?.host || !proxy?.port) return null;
  const proxyUrl =
    proxy.username && proxy.password
      ? `http://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`
      : `http://${proxy.host}:${proxy.port}`;
  try {
    return new ProxyAgent(proxyUrl);
  } catch {
    return null;
  }
}

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
// Body may include an optional `proxy` field to route the request through a
// specific proxy. When provided, the order is placed via undici.fetch with a
// ProxyAgent dispatcher instead of the default direct fetch.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.token_id || !body.price || !body.size || !body.side) {
      return NextResponse.json({ error: 'token_id, price, size, and side are required' }, { status: 400 });
    }

    // If a proxy is specified, route the order through it via undici.
    if (body.proxy?.host && body.proxy?.port) {
      const dispatcher = buildDispatcher(body.proxy);
      if (!dispatcher) {
        return NextResponse.json({ error: 'Failed to create proxy dispatcher' }, { status: 400 });
      }

      try {
        // Re-implement the auth header + POST against the CLOB /order endpoint,
        // but routed through the proxy. We import placeOrder's payload builder
        // indirectly by reconstructing the same body shape it sends.
        const { key, secret, passphrase } = {
          key: process.env.POLY_API_KEY!,
          secret: process.env.POLY_SECRET!,
          passphrase: process.env.POLY_PASSPHRASE!,
        };
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'POLY_API_KEY': key,
          'POLY_SECRET': secret,
          'POLY_PASSPHRASE': passphrase,
          'POLY_TIMESTAMP': Date.now().toString(),
          'POLY_NONCE': Math.floor(Math.random() * 1e9).toString(),
        };

        const orderPayload: Record<string, any> = {
          tokenID: body.token_id,
          price: body.price,
          size: body.size,
          side: body.side,
          type: body.type || 'GTC',
          postOnly: body.post_only || false,
          feeRateBps: 0,
          nonce: Date.now(),
        };
        // Forward optional CLOB V2 fields when provided
        if (body.type === 'GTD' && body.expiration) {
          orderPayload.expiration = body.expiration;
        }
        if (body.min_size !== undefined) orderPayload.minSize = body.min_size;
        if (body.tick_size !== undefined) orderPayload.tickSize = body.tick_size;
        if (body.neg_risk !== undefined) orderPayload.negRisk = body.neg_risk;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await undiciFetch(`${CLOB_URL}/order`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ order: orderPayload }),
          signal: controller.signal,
          dispatcher,
        });
        clearTimeout(timeout);
        await dispatcher.close();

        const text = await res.text();
        if (!res.ok) {
          return NextResponse.json(
            { error: `Proxy-routed order failed: ${res.status} — ${text}` },
            { status: res.status },
          );
        }
        try {
          return NextResponse.json(JSON.parse(text));
        } catch {
          return NextResponse.json({ raw: text });
        }
      } catch (err: any) {
        return NextResponse.json(
          { error: `Proxy-routed order error: ${err.message}` },
          { status: 500 },
        );
      }
    }

    // Default: direct order placement (no proxy)
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