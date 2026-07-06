import { NextRequest, NextResponse } from 'next/server';

// Test a single proxy by connecting through it to Polymarket CLOB
export async function POST(req: NextRequest) {
  const { proxy } = await req.json();

  if (!proxy?.host || !proxy?.port) {
    return NextResponse.json({ error: 'host and port required' }, { status: 400 });
  }

  const { host, port, username, password } = proxy;
  const start = Date.now();

  try {
    const proxyUrl = username && password
      ? `http://${username}:${password}@${host}:${port}`
      : `http://${host}:${port}`;

    // Test 1: Connect to Polymarket CLOB through the proxy
    const clobController = new AbortController();
    const clobTimeout = setTimeout(() => clobController.abort(), 8000);

    let clobOk = false;
    let clobMs = 0;
    try {
      const clobStart = Date.now();
      const res = await fetch('https://clob.polymarket.com/time', {
        signal: clobController.signal,
        // @ts-expect-error Node fetch proxy
        proxy: proxyUrl,
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
      const res = await fetch('https://gamma-api.polymarket.com/events?limit=1&closed=false', {
        signal: gammaController.signal,
        // @ts-expect-error Node fetch proxy
        proxy: proxyUrl,
      });
      gammaMs = Date.now() - gammaStart;
      gammaOk = res.ok;
    } catch {
      gammaMs = Date.now() - start;
    } finally {
      clearTimeout(gammaTimeout);
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
  } catch (err: any) {
    return NextResponse.json({
      working: false,
      totalMs: Date.now() - start,
      error: err.message,
      tests: { clob: { ok: false, ms: 0 }, gamma: { ok: false, ms: 0 } },
    });
  }
}

// Batch test all proxies
export async function PUT(req: NextRequest) {
  const { proxies } = await req.json();

  if (!Array.isArray(proxies)) {
    return NextResponse.json({ error: 'proxies array required' }, { status: 400 });
  }

  const results = await Promise.allSettled(
    proxies.map(async (proxy: any) => {
      const { host, port, username, password } = proxy;
      const proxyUrl = username && password
        ? `http://${username}:${password}@${host}:${port}`
        : `http://${host}:${port}`;

      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch('https://clob.polymarket.com/time', {
          signal: controller.signal,
          // @ts-expect-error Node fetch proxy
          proxy: proxyUrl,
        });
        clearTimeout(timeout);
        return { host, port, working: res.ok, ms: Date.now() - start };
      } catch {
        return { host, port, working: false, ms: Date.now() - start, error: 'timeout' };
      }
    }),
  );

  return NextResponse.json({
    results: results.map(r => r.status === 'fulfilled' ? r.value : { error: 'failed' }),
  });
}