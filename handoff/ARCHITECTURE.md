# Polymarket Ultra-Fast Trader — Handoff Document

## Quick Start for Next Agent

```bash
git clone https://github.com/dustindog101/polymarket-trader.git
cd polymarket-trader
npm install  # or bun install
# Set env vars from encrypted-secrets.json (see DECRYPTION-KEY.txt)
npx next dev
# Visit http://localhost:3000
```

**Production URL**: https://my-project-beta-seven-52.vercel.app

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   VERCEL (Serverless)                │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Next.js  │  │ API Routes   │  │ Static Assets │  │
│  │ Frontend │──│ /api/poly-*  │  │ (CSS/JS/HTML) │  │
│  │ (React)  │  │              │  │               │  │
│  └────┬─────┘  └──────┬───────┘  └───────────────┘  │
│       │               │                              │
│       │    ┌──────────┴──────────┐                   │
│       │    │  Polymarket APIs    │                   │
│       │    │  (Gamma + CLOB)    │                   │
│       │    └─────────────────────┘                   │
│       │                                               │
│  ┌────┴─────────────────────────────────────────┐   │
│  │         Client-Side Zustand Store             │   │
│  │  • REST Polling (3s) when no WS available     │   │
│  │  • WebSocket (socket.io) when relay available  │   │
│  │  • Market state, orderbook, price history     │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

┌──────────────────────────────┐
│  RAILWAY (Planned/Optional)  │
│  ┌────────────────────────┐  │
│  │  WS Relay (port 3003)  │  │
│  │  Socket.IO → Poly WS   │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

## Key Design Decisions

1. **Fully serverless on Vercel** — No persistent server process. All API routes are Next.js serverless functions.
2. **REST polling fallback** — Since Vercel can't run WebSocket servers, the client polls `/api/polymarket/refresh` every 3 seconds for price data. Orderbook data also polled via `/api/polymarket/orderbook`.
3. **Dual price source** — Markets with real CLOB orderbooks (popular, crypto) get prices from orderbook midpoint. BTC daily "above $X" markets have empty orderbooks, so prices come from Gamma API re-fetch.
4. **Proxy management** — 10 Webshare proxies pre-loaded. UI panel at bottom of screen (click "Proxies" button). Individual and batch testing via `/api/polymarket/proxy-test`.
5. **No 5-minute markets** — Polymarket's crypto/5M page (polymarket.com/crypto/5M) uses a separate system NOT accessible via the Gamma/CLOB API. The fastest API-accessible markets are BTC daily "above $X" markets.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| State | Zustand 5 |
| Charts | Recharts 2 |
| WS | socket.io (relay only, optional) |
| Markets API | Gamma API (public) |
| Trading API | CLOB V2 (authenticated) |
| Deploy | Vercel (serverless) |
| Legacy | Rust backend in `polymarket-trader/` (inactive) |

## File Map — What Each File Does

### API Routes (`src/app/api/polymarket/`)

| File | Purpose |
|------|---------|
| `markets/route.ts` | GET — Returns `{popular, crypto, btc}` market arrays |
| `search/route.ts` | GET — Local text scoring over 200 events |
| `orderbook/route.ts` | GET — Proxies to CLOB `/book?token_id=` (public, no auth) |
| `prices/route.ts` | GET — Proxies to CLOB `/prices`, `/midpoint`, `/spread` (unreliable for many tokens) |
| `refresh/route.ts` | GET — Re-fetches market from Gamma for fresh `outcomePrices` (key for BTC daily markets) |
| `orders/route.ts` | GET/POST/DELETE — List, place, cancel orders (authed) |
| `balance/route.ts` | GET — Account pUSD balance (authed) |
| `resolve/route.ts` | GET — Market + resolution data |
| `proxy-test/route.ts` | POST/PUT — Test proxy connectivity to Polymarket |

### Core Logic (`src/lib/`)

| File | Purpose |
|------|---------|
| `polymarket.ts` | **CORE** — Gamma + CLOB API client, `normalizeMarket()`, `getBtcDailyMarkets()`, `getCryptoMarkets()`, `getPopularMarkets()`, auth headers |

### State (`src/stores/`)

| File | Purpose |
|------|---------|
| `trading.ts` | Zustand store — all app state, WS connection, REST polling, market/orderbook/price history management |

### Components (`src/components/trading/`)

| File | Purpose |
|------|---------|
| `MarketSidebar.tsx` | Left sidebar — search, BTC/Crypto/Hot tabs, market cards with live odds |
| `MarketHeader.tsx` | Selected market — YES/NO prices, volume, liquidity, countdown timer |
| `OrderbookPanel.tsx` | Split bid/ask orderbook with depth bars, flash animation |
| `PriceChart.tsx` | Recharts AreaChart, dual YES/NO lines |
| `OrderTicket.tsx` | Slide-out order form (BUY/SELL, GTC/GTD/FOK/FAK) |
| `OpenOrders.tsx` | Orders table with cancel, auto-refresh 10s |
| `FillHistory.tsx` | Recent trades from WS events |
| `ProxyPanel.tsx` | Proxy list, test individual/batch, add/remove proxies |

### Mini-Services (`mini-services/`)

| File | Purpose |
|------|---------|
| `polymarket-ws/index.ts` | Socket.IO relay server (port 3003) — connects to Polymarket WS, forwards to browser clients. Deploy to Railway for real-time data on Vercel. |

## Environment Variables (Server-Side Only)

| Variable | Value | Where |
|----------|-------|-------|
| `POLY_API_KEY` | See `encrypted-secrets.json` | Vercel env (all envs) |
| `POLY_SECRET` | See `encrypted-secrets.json` | Vercel env (all envs) |
| `POLY_PASSPHRASE` | See `encrypted-secrets.json` | Vercel env (all envs) |
| `POLY_CLOB_URL` | `https://clob.polymarket.com` | Vercel env |
| `POLY_GAMMA_URL` | `https://gamma-api.polymarket.com` | Vercel env |

## Known Issues & TODOs

1. **Chart only updates every 3 seconds** — This is the polling interval. Deploy the WS relay to Railway for real-time updates.
2. **CLOB `/prices` and `/midpoint` API return errors** for many tokens — We use Gamma re-fetch instead (via `/api/polymarket/refresh`).
3. **BTC daily markets have empty CLOB orderbooks** — These markets may use an AMM or different pricing system. Only Gamma prices are available.
4. **5M crypto markets not accessible via API** — Polymarket's `/crypto/5M` page uses a proprietary system. These are NOT on the Gamma or CLOB APIs.
5. **Proxy testing uses Node's `fetch` proxy option** — This only works in Node.js (server-side). Browser-side proxy testing would need a different approach (e.g., CORS proxy).
6. **Railway WS relay not yet deployed** — Service code is ready in `mini-services/polymarket-ws/`. Needs: `npm install socket.io`, deploy to Railway, then update client to connect to Railway URL instead of `/?XTransformPort=3003`.
7. **No wallet connection UI** — The Polymarket API credentials are pre-configured server-side. A proper wallet connect flow (MetaMask, etc.) has not been implemented.
8. **Prisma/SQLite unused** — `prisma/schema.prisma` has boilerplate User/Post models. Can be removed or repurposed.

## Deployment

### Vercel (Current)
```bash
npx vercel deploy --prod --token $VERCEL_TOKEN
```

### Railway WS Relay (Planned)
1. Create new Railway project: `polymarket-ws-relay`
2. Push `mini-services/polymarket-ws/` to its own GitHub repo
3. Connect Railway to that repo
4. Set env: `POLY_WS_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market`
5. Expose port 3003
6. Update client `connectWs()` in `stores/trading.ts` to use Railway URL
7. When WS connects, polling stops automatically (see store logic)

## Polymarket API Notes

### Gamma API (Public, No Auth)
- `GET /markets?query=...&limit=N&order=volume24hr&ascending=false&closed=false`
- `GET /markets/{id}`
- `GET /events?slug=...&closed=false`
- Returns JSON-encoded strings for `outcomes`, `outcomePrices`, `clobTokenIds` — must `JSON.parse()`
- `revalidate: 30` for caching

### CLOB API (Public Read / Authenticated Write)
- Public: `GET /book?token_id=X`, `GET /time`
- Auth headers: `POLY_API_KEY`, `POLY_SECRET`, `POLY_PASSPHRASE`, `POLY_TIMESTAMP`, `POLY_NONCE`
- `/prices` and `/midpoint` endpoints return "Invalid token id" for many tokens — unreliable
- Orderbook (`/book`) is empty for BTC daily "above $X" markets

### WebSocket
- URL: `wss://ws-subscriptions-clob.polymarket.com/ws/market`
- Subscribe: `{"type":"subscribe","channel":"market","assets_ids":["token_id_1","token_id_2"]}`
- Events: `book` (full snapshot), `price_change`, `trade`
- Keep-alive: send `"ping"` every 10s