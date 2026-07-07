import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

// Force Node.js runtime — undici's ProxyAgent requires Node, not Edge.
export const runtime = 'nodejs';

// Test a single proxy by connecting through it to Polymarket CLOB.
//
// IMPORTANT: This previously used `fetch(url, { proxy: proxyUrl })` which is
// NOT a standard fetch option and silently did nothing on Vercel serverless
// (which uses undici under the hood). The correct modern approach is to use
// undici's ProxyAgent with the `dispatcher` option, which we do here.
export async function POST(req: NextRequest) {
  const { proxy } = await req.json();

  if (!proxy?.host || !proxy?.port) {
    return NextResponse.json({ error: 'host and port required' }, { status: 400 });
  }

  const { host, port, username, password } = proxy;
  const start = Date.now();

  const proxyUrl =
    username && password
      ? `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`
      : `http://${host}:${port}`;

  let dispatcher: ProxyAgent;
  try {
    dispatcher = new ProxyAgent(proxyUrl);
  } catch (err: any) {
    return NextResponse.json({
      working: false,
      totalMs: Date.now() - start,
      error: `Failed to create ProxyAgent: ${err.message}`,
      tests: { clob: { ok: false, ms: 0 }, gamma: { ok: false, ms: 0 } },
    });
  }

  // Test 1: Connect to Polymarket CLOB through the proxy
  const clobController = new AbortController();
  const clobTimeout = setTimeout(() => clobController.abort(), 8000);

  let clobOk = false;
  let clobMs = 0;
  try {
    const clobStart = Date.now();
    const res = await undiciFetch('https://clob.polymarket.com/time', {
      signal: clobController.signal,
      dispatcher,
    });
    clobMs = Date.now() - clobStart;
    clobOk = res.ok;
  } catch {
    clobMs = Date.now() - start;
  } finally {
    clearTimeout(clobTimeout);
  }

  // Test 2: Connect to Gamma API through the proxy
  const gammaController = new AbortController();
  const gammaTimeout = setTimeout(() => gammaController.abort(), 8000);

  let gammaOk = false;
  let gammaMs = 0;
  try {
    const gammaStart = Date.now();
    const res = await undiciFetch('https://gamma-api.polymarket.com/events?limit=1&closed=false', {
      signal: gammaController.signal,
      dispatcher,
    });
    gammaMs = Date.now() - gammaStart;
    gammaOk = res.ok;
  } catch {
    gammaMs = Date.now() - start;
  } finally {
    clearTimeout(gammaTimeout);
  }

  // Close the dispatcher to free the underlying connection pool
  try {
    await dispatcher.close();
  } catch {
    // ignore
  }

  const totalMs = Date.now() - start;
  const working = clobOk || gammaOk;

  return NextResponse.json({
    working,
    totalMs,
    tests: {
      clob: { ok: clobOk, ms: clobMs },
      gamma: { ok: gammaOk, ms: gammaMs },
    },
  });
}

// Batch test all proxies (parallel for speed)
export async function PUT(req: NextRequest) {
  const { proxies } = await req.json();

  if (!Array.isArray(proxies)) {
    return NextResponse.json({ error: 'proxies array required' }, { status: 400 });
  }

  const results = await Promise.all(
    proxies.map(async (proxy: any) => {
      const { host, port, username, password } = proxy;
      const proxyUrl =
        username && password
          ? `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`
          : `http://${host}:${port}`;

      const start = Date.now();
      let dispatcher: ProxyAgent | null = null;
      try {
        dispatcher = new ProxyAgent(proxyUrl);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await undiciFetch('https://clob.polymarket.com/time', {
          signal: controller.signal,
          dispatcher,
        });
        clearTimeout(timeout);
        return { host, port, working: res.ok, ms: Date.now() - start };
      } catch (err: any) {
        return {
          host,
          port,
          working: false,
          ms: Date.now() - start,
          error: err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'failed'),
        };
      } finally {
        try {
          if (dispatcher) await dispatcher.close();
        } catch {
          // ignore
        }
      }
    }),
  );

  return NextResponse.json({ results });
}
