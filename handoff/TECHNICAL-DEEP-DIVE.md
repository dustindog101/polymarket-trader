# Technical Deep Dive

## Polymarket CLOB V2 Authentication

Every authenticated request needs these headers:
```
POLY_API_KEY: <key>
POLY_SECRET: <secret>
POLY_PASSPHRASE: <passphrase>
POLY_TIMESTAMP: <epoch_milliseconds>
POLY_NONCE: <random_number>
```

Note: The current implementation does NOT sign requests with EIP-712. It just sends the raw headers. This works for basic operations but may fail for order placement. The Rust code (`polymarket-trader/src/trading/clob.rs`) has a proper EIP-712 signing implementation that should be ported.

## Gamma API Quirks

1. **JSON-encoded strings**: Fields like `outcomes`, `outcomePrices`, `clobTokenIds` are returned as JSON strings (not arrays). Always `JSON.parse()` them. The `normalizeMarket()` function handles this.

2. **Cache headers**: Using `next: { revalidate: 30 }` for 30-second ISR cache. For real-time polling, use `cache: 'no-store'`.

3. **Data size**: Fetching 200 events returns ~16MB of JSON. Vercel's data cache rejects items >2MB. The broad fetch in `getBtcDailyMarkets()` may hit this limit.

4. **Slug vs ID**: Market slugs in Gamma don't always match what you'd expect. Use `condition_id` for reliable lookups.

## CLOB Orderbook Behavior

Markets fall into two categories:

### Type A: Real CLOB (Popular, Sports, Crypto events)
- Has real bids and asks
- `/book?token_id=X` returns 10-200+ levels
- Chart can derive price from orderbook midpoint
- Examples: World Cup, "Will X win presidency?"

### Type B: Empty CLOB (BTC daily "above $X", some crypto)
- `/book?token_id=X` returns `{bids: [], asks: []}`
- May use an AMM or different matching engine
- Prices only available from Gamma API `outcomePrices`
- Chart must poll Gamma `/api/polymarket/refresh`
- Examples: "Bitcoin above $64,000 on July 7?"

## Polling System Architecture

```
Client (Zustand Store)          Server (Vercel Functions)
       │                                  │
       ├── fetch /api/polymarket/    ────│──→ Proxy to Gamma CLOB /book
       │    orderbook?token_id=           │
       │                                  │
       ├── fetch /api/polymarket/    ────│──→ Proxy to Gamma /markets?condition_id=
       │    refresh?condition_id=         │
       │                                  │
       └── Every 3 seconds ──────────────┘
```

When the WebSocket relay connects (from Railway), polling stops automatically. When WS disconnects, polling resumes.

## Zustand Store Architecture

The store (`src/stores/trading.ts`) is the single source of truth:

```
State:
  markets: { popular[], crypto[], btc[], searchResults[] }
  selected: { market, tokenId, showOrderTicket, orderSide, orderType }
  data: { orderbooks{}, priceHistory{}, openOrders[] }
  connection: { wsConnected, socket, pollingInterval }
  ui: { isLoading, searchQuery, marketCategory }
```

Key actions:
- `selectMarket(market)` — Stops old polling, clears price history
- `startPolling(tokenIds)` — 3s interval, skips if WS connected
- `stopPolling()` — Clears interval
- `connectWs()` — Socket.IO with graceful failure
- `subscribeAsset(id)` / `unsubscribeAsset(id)` — WS subscriptions

## WebSocket Relay (`mini-services/polymarket-ws/`)

Single-file Socket.IO server:
- Connects to `wss://ws-subscriptions-clob.polymarket.com/ws/market`
- Browser clients connect via Socket.IO
- Per-asset subscription tracking
- Forwards: `book` (full snapshot), `price_change`, `trade`
- Maintains price history (max 500 points) per asset
- Auto-reconnects to Polymarket WS on disconnect (3s delay)
- Keep-alive ping every 10s

To deploy to Railway:
1. Push to a separate GitHub repo
2. Create Railway service connected to that repo
3. Expose port 3003
4. Update `stores/trading.ts` `connectWs()` to use Railway URL
5. Add `NEXT_PUBLIC_WS_URL` env var

## Proxy Testing

The proxy test endpoint (`/api/polymarket/proxy-test`) tries to connect through the proxy to `https://clob.polymarket.com/time`. However:

- Vercel serverless functions use a custom Node.js runtime that may not support the `proxy` option in `fetch()`
- Alternative: Use `undici` ProxyAgent or `https-proxy-agent` package
- Browser-side proxy testing is impossible due to CORS — must be server-side

To actually route order execution through a proxy, the order placement code in `polymarket.ts` would need to use an HTTP agent that routes through the selected proxy.