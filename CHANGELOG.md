# Changelog

## [2.0.0] — 2026-07-06 — Complete Serverless Rebuild

### Breaking Changes
- **Full architecture pivot**: Replaced Rust binary backend with Next.js 16 serverless app
- Old Rust code preserved in `polymarket-trader/` directory for reference
- All API routes now server-side Next.js handlers (no separate backend process needed)
- WebSocket relay runs as a mini-service on port 3003 via socket.io

### New Features
- **Live market browser**: Popular and Crypto tabs with 25+ popular markets, 30+ crypto markets (BTC, ETH daily/weekly predictions)
- **Real-time orderbook**: 15-level bid/ask display with depth bars, spread indicator, and flash animation on updates
- **Price chart**: Recharts AreaChart with dark theme, auto-scrolling, custom tooltip (requires WebSocket data feed)
- **Order placement**: BUY/SELL toggle, GTC/GTD/FOK/FAK order types, post-only option, outcome selector, live total cost
- **Open orders table**: Auto-refreshing every 10s, per-order cancel, cancel-all, matched/total display
- **Market search**: Client-side search across 200+ events with intelligent text matching and scoring
- **Wallet integration**: Pre-configured Polymarket CLOB V2 API credentials (server-side only, never exposed to browser)
- **Market header**: Live YES/NO prices with colored boxes, volume, liquidity, end-date countdown timer
- **Resolution tracking**: "RESOLVED" badge, "Resolving soon" amber indicator for markets ending within 5 minutes
- **Dark trading terminal theme**: Professional dark UI with zinc-900 backgrounds, emerald/red for buy/sell
- **Responsive layout**: Collapsible sidebar, mobile-friendly design

### Architecture
- **API Routes** (server-side, credentials never reach browser):
  - `GET /api/polymarket/markets` — Popular + Crypto market lists
  - `GET /api/polymarket/search?q=...` — Search across 200+ events
  - `GET /api/polymarket/orderbook?token_id=...` — Live orderbook
  - `GET /api/polymarket/prices?token_ids=...` — Current prices, midpoints, spreads
  - `GET /api/polymarket/balance` — Account balance (pUSD)
  - `GET /api/polymarket/orders` — Open orders
  - `POST /api/polymarket/orders` — Place order
  - `DELETE /api/polymarket/orders` — Cancel order(s)
  - `GET /api/polymarket/resolve?slug=...` — Market resolution info

- **WebSocket Mini-Service** (port 3003):
  - Relay server connecting to Polymarket WS (`wss://ws-subscriptions-clob.polymarket.com/ws/market`)
  - Forwards orderbook snapshots and price changes to browser clients via socket.io
  - Auto-reconnect with 3s backoff, keepalive pings every 10s
  - Per-asset subscription management

### Tech Stack
- Next.js 16 (App Router, Turbopack)
- TypeScript 5
- Tailwind CSS 4 + shadcn/ui (New York style)
- Zustand (client state) + TanStack Query
- Recharts (price charts)
- socket.io / socket.io-client (real-time relay)
- Polymarket Gamma API + CLOB V2 API

### Bug Fixes
- Fixed Gamma API response normalization: `outcomes`, `outcomePrices`, `clobTokenIds` are JSON strings, not arrays
- Built `normalizeMarket()` to handle both string-encoded and native array formats
- Crypto markets now fetched via events API (not broken tag search)
- Search uses local text matching over 200+ events (Gamma text search returns unrelated results)
- `selectedTokenId` properly set on market selection with WebSocket subscription