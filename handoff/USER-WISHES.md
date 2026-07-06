# User Wishes & Vision

## What I Want This For

I want a **ultra-fast Polymarket trading terminal** that gives me an edge. Specifically:

1. **BTC prediction markets** — The daily "Bitcoin above $X on [date]" markets are the most important to me. I want to see all of them at a glance with live odds, click into any one, see the chart updating in real-time, and place orders fast.

2. **Speed** — Everything should be instant. Viewing data, switching markets, seeing price changes. The proxy setup exists so I can route order execution through fast proxies if needed.

3. **5-Minute crypto markets** — Polymarket has these at `polymarket.com/crypto/5M` but they're NOT accessible through their public API (Gamma/CLOB). Figure out how to access them or scrape them. This is a high priority.

4. **Real-time everything** — Charts should update the moment a round resolves and transitions to the next one. Previous round decisions should be visible. Price changes should be reflected instantly.

5. **Clean, professional UI** — Dark theme, trading terminal feel. Not a website, a tool. Think Bloomberg Terminal or dYdX interface.

6. **Wallet connection** — I want to actually connect my own wallet and trade, not just use pre-configured API keys. The API keys are for server-side data fetching and order execution.

7. **Proxy management** — I have 10 Webshare proxies loaded by default. I want to be able to test them, see which are fast, and route trading through the best one. I should be able to add more proxies (including free proxy lists) and have the system test each one.

8. **Order chaining** — When a buy order fills, I want to automatically place a sell order at a target price (stop-loss or take-profit). This was in the original Rust code as "ChainOrchestrator" — port this to the Next.js version.

9. **Fully serverless and free** — I don't want to pay for servers. Vercel for the frontend/API, Railway free tier for the WS relay if needed.

## Priority Order

1. Get 5M BTC markets working (figure out the API)
2. Real-time chart updates on market resolution
3. Wallet connection flow
4. Order chaining
5. Proxy-routed order execution
6. Previous round history for BTC daily markets

## Style Preferences

- Dark theme (zinc-900/950 backgrounds)
- Emerald for BUY/YES, Red for SELL/NO
- Monospace numbers, tabular alignment
- Compact, information-dense layout
- No wasted space
- Professional, not playful