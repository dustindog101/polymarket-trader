# Changelog

## [2.2.0] — 2026-07-07 — 5M / 15M "Up or Down" Crypto Markets

### Key Changes
- **5M markets now work end-to-end.** The previous release's note that "Polymarket does NOT have 5-minute or 15-minute BTC markets" was incorrect — they exist and are accessible via deterministic timestamp-based slugs. With this release, all 6 live rounds (BTC/ETH/SOL × 5m/15m) are now browsable, selectable, and tradeable in the terminal.
- **New "5M" tab is the default landing tab** — these are Polymarket's fastest-resolving markets (5-minute rounds) and the user's stated #1 priority.
- **Real CLOB orderbooks for 5M markets.** Unlike the daily "Bitcoin above $X" markets (which have empty books and rely on Gamma re-fetch), the 5M markets have real bid/ask depth on the CLOB — so the orderbook panel and chart midpoint derivation both work natively.
- **Round-transition automation.** A 20-second refresh loop re-fetches the 6 live rounds. When the currently-selected 5M market resolves and the next round becomes available, the new round is auto-selected for the same asset/duration so the user sees a seamless transition. The previous round's outcome (Up/Down) immediately appears in the history strip.
- **10-round history strip.** The market header for any 5M market shows the last 10 resolved rounds as compact ↑/↓ pills with tooltips — giving instant context on the asset's recent directional momentum.
- **Faster polling for 5M markets.** The REST polling cadence is 1.5s (vs the 3s default) when a 5M/15M market is selected, because rounds resolve in 5 minutes and price discovery is intense near the end of each round.

### How It Works
- Polymarket mints each 5M/15M round with a deterministic slug pattern: `{asset}-updown-{duration}m-{unixTimestampRoundedToInterval}`. Example: `btc-updown-5m-1783383900` for the BTC 5M round starting at Unix timestamp 1783383900.
- Fetching `/events/slug/{slug}` from the Gamma API returns the full market record (clobTokenIds, outcomePrices, endDate, etc.) directly — bypassing the indexing latency that breaks the standard search/pagination endpoints for these short-lived markets.
- Previous rounds are fetched by subtracting `i * interval` from the current rounded timestamp. Resolved rounds have binary `outcomePrices` (`["1","0"]` = Up won, `["0","1"]` = Down won).

### New API Endpoints
- `GET /api/polymarket/5m` — Returns the 6 current live 5M/15M rounds (BTC/ETH/SOL × 5m/15m)
- `GET /api/polymarket/5m/history?asset=btc&duration=5&count=10` — Returns the previous N resolved rounds for a single asset/duration, with derived `winner: "up" | "down" | null`
- `GET /api/polymarket/markets` — Now also returns `fiveMinute` array alongside `popular`/`crypto`/`btc`

### Files Changed
- `src/lib/polymarket.ts` — Added `buildUpdownSlug()`, `getUpdownRound()`, `get5mMarkets()`, `get5mHistory()`, `CryptoAsset` type. Extended `GammaMarket` interface with `asset`, `durationMinutes`, `roundStart`, `roundEnd` fields and optional `winner` on tokens.
- `src/app/api/polymarket/markets/route.ts` — Returns `fiveMinute` array
- `src/app/api/polymarket/5m/route.ts` (NEW) — Current 5M markets + history mode
- `src/app/api/polymarket/5m/history/route.ts` (NEW) — Dedicated history endpoint
- `src/stores/trading.ts` — Added `fiveMinuteMarkets`, `fiveMinuteHistory`, `FiveMinuteRound` type, `'5m'` category. Added `startFiveMinuteRefresh`/`stopFiveMinuteRefresh` (20s round-transition watcher), `fetchFiveMinuteHistory`, `refreshSelectedFiveMinuteMarket`. Polling uses 1.5s for 5M markets. Default tab is now `'5m'`.
- `src/components/trading/MarketSidebar.tsx` — New "5M" tab (leftmost, default). New `FiveMinuteMarketCard` with live MM:SS countdown (amber <60s, red+pulse <15s), asset icon, duration badge, UP/DN prices, last-round outcome.
- `src/components/trading/MarketHeader.tsx` — For 5M markets: prominent "Round ends in MM:SS" panel with urgency colors, 10-round ↑↓ history strip with tooltips, asset+duration badge, UP/DN labels with arrow icons.
- `src/app/page.tsx` — Fetches `fiveMinute` array on mount, starts the 20s 5M refresh loop (cleared on unmount).

### Important Notes
- The previous handoff doc's claim that 5M markets were "NOT accessible via API" was wrong. The discovery pattern (deterministic Unix-timestamp slugs) was independently documented by [handiko/Polymarket-Market-Finder](https://github.com/handiko/Polymarket-Market-Finder).
- The 5M markets tab works fully serverless on Vercel — no WebSocket relay required. The 20s auto-refresh handles round transitions, and the 1.5s polling handles within-round price updates.
- Order placement for 5M markets uses the same CLOB V2 API as other markets — no special handling needed.

## [2.1.0] — 2026-07-07 — Serverless Polling + BTC Daily Markets

### Key Changes
- **Fully works on Vercel without WebSocket relay**: Added REST polling fallback (3s interval) for orderbook and chart data. No persistent server process needed.
- **BTC Daily Markets tab**: New default "BTC" tab showing Bitcoin daily "above $X" markets — Polymarket's fastest-moving markets (resolve every day). 33+ daily BTC markets with live odds.
- **Connection status**: Sidebar now shows "REST Polling (3s)" when WS is unavailable, "WebSocket Live" when connected.

### Fixes
- **Market click now loads data**: Previously depended on WS relay (not available on Vercel). Now uses REST polling that works everywhere.
- **BTC market timezone fix**: Previous slug-based approach failed due to UTC vs local time. Now uses Gamma search API which is timezone-independent.
- **Chart price derivation**: CLOB `/prices` and `/midpoint` APIs return errors for many tokens. Chart now derives price from orderbook best bid/ask midpoint.
- **Chart loading state**: Shows current market price while waiting for polling data to accumulate.

### Important Notes
- **Polymarket does NOT have 5-minute or 15-minute BTC markets.** The fastest BTC prediction markets on Polymarket are daily ("Bitcoin above $X on July 7?"). These resolve once per day.
- The WebSocket relay (`mini-services/polymarket-ws/`) is still available for local dev but is NOT required for the app to function.
- For real-time WS data on Vercel, the relay would need to be deployed to Railway or similar (free tier available).

### Files Changed
- `src/lib/polymarket.ts` — Added `getBtcDailyMarkets()`, `getTokenPrices()`, improved `getCryptoMarkets()`
- `src/stores/trading.ts` — Added polling system (`startPolling`/`stopPolling`), BTC markets state, graceful WS failure handling
- `src/app/page.tsx` — Uses polling, shows "POLLING" badge, initial orderbook fetch on market select
- `src/components/trading/MarketSidebar.tsx` — Added BTC tab (default), time remaining, improved loading states
- `src/components/trading/PriceChart.tsx` — Shows current price while loading
- `src/app/api/polymarket/markets/route.ts` — Returns `btc` array alongside `popular` and `crypto`

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