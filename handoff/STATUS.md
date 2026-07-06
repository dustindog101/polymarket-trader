# Current State — What Works & What Doesn't

## Working

- [x] Live market data: 25 popular + 30 crypto + 40 BTC daily markets fetched from Gamma API
- [x] Market browser with 3 tabs: BTC (default), Crypto, Hot
- [x] Search across markets (debounced 500ms)
- [x] REST polling: orderbook + prices every 3 seconds (works without WS relay)
- [x] Orderbook panel: shows bids/asks with depth bars, flash animation
- [x] Price chart: Recharts AreaChart, dual YES/NO lines, derives price from orderbook midpoint OR Gamma re-fetch
- [x] Market header: YES/NO prices, volume, liquidity, countdown timer
- [x] Order ticket: BUY/SELL, GTC/GTD/FOK/FAK, post-only
- [x] Open orders table: auto-refresh, per-order cancel
- [x] Proxy panel: 10 pre-loaded Webshare proxies, test individual, test all, add/remove
- [x] Proxy test API: POST single test, PUT batch test
- [x] Balance display from Polymarket CLOB
- [x] Vercel deployment: fully serverless, production URL works
- [x] GitHub: pushed to dustindog101/polymarket-trader with CHANGELOG

## Partially Working

- [~] Chart updates — Works but only every 3 seconds (polling). Needs WS relay for true real-time.
- [~] Orderbook for BTC daily markets — Empty because these markets don't use CLOB orderbooks. Prices come from Gamma API instead.
- [~] Proxy testing — Server-side test works in theory, but Vercel serverless may not support Node.js `fetch` proxy option. Needs testing.

## Not Working / Not Built

- [ ] 5M crypto markets — Polymarket's `/crypto/5M` page is a separate system, not on Gamma/CLOB API. Would need reverse engineering or scraping.
- [ ] WebSocket real-time data — Relay code exists in `mini-services/polymarket-ws/` but not deployed. Needs Railway.
- [ ] Wallet connection — No MetaMask/wallet connect flow. Only server-side API keys.
- [ ] Order chaining — Was in Rust code (ChainOrchestrator), not ported to Next.js.
- [ ] Proxy-routed execution — Proxies are listed and testable, but not wired into order execution.
- [ ] Previous round history for BTC daily markets — No resolution history display.
- [ ] Market resolution detection — No auto-detection of market resolution and transition.
- [ ] Fill history — Component exists but only receives data from WS (not from REST).

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