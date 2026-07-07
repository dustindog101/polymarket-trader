# Current State — What Works & What Doesn't

## Working

- [x] **5M / 15M "Up or Down" crypto markets** — BTC/ETH/SOL × 5m/15m rounds, live prices, real CLOB orderbooks, 1.5s polling, 20s auto-refresh for round transitions, 10-round history strip. New "5M" tab is the default landing tab. (Added v2.2.0)
- [x] Live market data: 25 popular + 30 crypto + 40 BTC daily markets + 6 5M/15M markets fetched from Gamma API
- [x] Market browser with 4 tabs: **5M (default)**, BTC, Crypto, Hot
- [x] Search across markets (debounced 500ms)
- [x] REST polling: orderbook + prices every 3 seconds (1.5s for 5M markets) — works without WS relay
- [x] Orderbook panel: shows bids/asks with depth bars, flash animation
- [x] Price chart: Recharts AreaChart, dual YES/NO lines, derives price from orderbook midpoint OR Gamma re-fetch
- [x] Market header: YES/NO prices, volume, liquidity, countdown timer, 5M round countdown + 10-round history strip
- [x] Order ticket: BUY/SELL, GTC/GTD/FOK/FAK, post-only
- [x] Open orders table: auto-refresh, per-order cancel
- [x] Proxy panel: 10 pre-loaded Webshare proxies, test individual, test all, add/remove
- [x] Proxy test API: POST single test, PUT batch test
- [x] Balance display from Polymarket CLOB
- [x] Vercel deployment: fully serverless, production URL works
- [x] GitHub: pushed to dustindog101/polymarket-trader with CHANGELOG

## Partially Working

- [~] Chart updates — Works but only every 3 seconds (1.5s for 5M markets, polling). Needs WS relay for true real-time.
- [~] Orderbook for BTC daily markets — Empty because these markets don't use CLOB orderbooks. Prices come from Gamma API instead. (5M/15M markets DO have real orderbooks.)
- [~] Proxy testing — Server-side test works in theory, but Vercel serverless may not support Node.js `fetch` proxy option. Needs testing.

## Not Working / Not Built

- [ ] WebSocket real-time data — Relay code exists in `mini-services/polymarket-ws/` but not deployed. Needs Railway.
- [ ] Wallet connection — No MetaMask/wallet connect flow. Only server-side API keys.
- [ ] Order chaining — Was in Rust code (ChainOrchestrator), not ported to Next.js.
- [ ] Proxy-routed execution — Proxies are listed and testable, but not wired into order execution.
- [ ] Fill history — Component exists but only receives data from WS (not from REST).

## 5M Markets — How They Were Solved

The previous release (v2.1.0) incorrectly stated "Polymarket does NOT have 5-minute or 15-minute BTC markets." They do — they're just not discoverable via the standard Gamma search/pagination APIs due to indexing latency between on-chain creation and API availability.

**The fix:** Each 5M/15M round has a deterministic slug based on the current Unix timestamp rounded down to the round interval:

```
slug = "{asset}-updown-{duration}m-{roundedTimestamp}"
e.g. btc-updown-5m-1783383900
```

Fetching `/events/slug/{slug}` from the Gamma API returns the full market record directly. This pattern was independently discovered by [handiko/Polymarket-Market-Finder](https://github.com/handiko/Polymarket-Market-Finder).

Implementation files:
- `src/lib/polymarket.ts` — `buildUpdownSlug()`, `getUpdownRound()`, `get5mMarkets()`, `get5mHistory()`
- `src/app/api/polymarket/5m/route.ts` — GET current live 5M markets
- `src/app/api/polymarket/5m/history/route.ts` — GET previous N resolved rounds
- `src/stores/trading.ts` — `fiveMinuteMarkets` state, 20s round-transition auto-refresh, 1.5s polling cadence
- `src/components/trading/MarketSidebar.tsx` — "5M" tab with live countdown cards
- `src/components/trading/MarketHeader.tsx` — Round countdown panel + 10-round ↑↓ history strip

## Deployment Status

| Service | Platform | Status | URL |
|---------|----------|--------|-----|
| Frontend + API | Vercel (prod) | ✅ Live | https://my-project-beta-seven-52.vercel.app |
| WS Relay | Railway | ❌ Not deployed | — |
| GitHub | GitHub | ✅ Pushed | https://github.com/dustindog101/polymarket-trader |

## Vercel Environment Variables (Set)

| Variable | Production | Preview | Development |
|----------|-----------|---------|-------------|
| POLY_API_KEY | ✅ | ❌ | ✅ |
| POLY_SECRET | ✅ | ❌ | ✅ |
| POLY_PASSPHRASE | ✅ | ❌ | ✅ |
| POLY_CLOB_URL | ✅ | ❌ | ✅ |
| POLY_GAMMA_URL | ✅ | ❌ | ✅ |

Note: Preview env vars failed to set due to interactive `Git branch?` prompt. Fix with `npx vercel env add VAR preview --token TOKEN` and pipe empty string for branch.