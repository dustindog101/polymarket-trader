import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

// ─── Types ─────────────────────────────────────────────────────────

export interface Market {
  id: string;
  question: string;
  slug: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  volume24hr: string;
  liquidity: string;
  liquidityNum: number;
  volumeNum: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  acceptingOrders: boolean;
  endDate: string;
  startDate: string;
  image: string;
  category: string;
  tags: string[];
  groupItemTitle: string | null;
  groupId: string | null;
  clobTokenIds: string[];
  conditionId: string;
  description: string;
  tokens: Array<{ token_id: string; outcome: string; price: number; winner?: boolean | null }>;
  // 5M / 15M "Up or Down" market metadata (only present for minute markets)
  asset?: 'btc' | 'eth' | 'sol' | null;
  durationMinutes?: number | null;
  roundStart?: number | null;  // unix seconds
  roundEnd?: number | null;    // unix seconds
}

/** Compact representation of a resolved 5M round for the history strip. */
export interface FiveMinuteRound {
  id: string;
  question: string;
  slug: string;
  endDate: string;
  roundStart: number | null;
  roundEnd: number | null;
  outcomePrices: string[];
  winner: 'up' | 'down' | null;
  closed: boolean;
}

/** A proxy definition. Stored in localStorage so user-added proxies persist. */
export interface ProxyEntry {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  country?: string;
  city?: string;
  status: 'unknown' | 'testing' | 'working' | 'failed';
  latency?: number;
  lastTested?: number;
}

/** The 10 default Webshare proxies — same list previously hardcoded in ProxyPanel. */
export const DEFAULT_PROXIES: ProxyEntry[] = [
  { id: 'p1', host: '31.59.20.176', port: 6754, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'GB', city: 'London', status: 'unknown' },
  { id: 'p2', host: '31.56.127.193', port: 7684, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'US', city: 'Seattle', status: 'unknown' },
  { id: 'p3', host: '45.38.107.97', port: 6014, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'GB', city: 'London', status: 'unknown' },
  { id: 'p4', host: '198.105.121.200', port: 6462, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'GB', city: 'London', status: 'unknown' },
  { id: 'p5', host: '64.137.96.74', port: 6641, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'ES', city: 'Madrid', status: 'unknown' },
  { id: 'p6', host: '198.23.243.226', port: 6361, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'US', city: 'Los Angeles', status: 'unknown' },
  { id: 'p7', host: '2.57.21.2', port: 7239, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'US', city: 'NYC', status: 'unknown' },
  { id: 'p8', host: '38.154.185.97', port: 6370, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'US', city: 'Piscataway', status: 'unknown' },
  { id: 'p9', host: '142.111.67.146', port: 5611, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'JP', city: 'Tokyo', status: 'unknown' },
  { id: 'p10', host: '191.96.254.138', port: 6185, username: 'zbmaeavo', password: 'wzd3slu8ahvs', country: 'US', city: 'Los Angeles', status: 'unknown' },
];

const PROXIES_STORAGE_KEY = 'pmt-proxies-v1';
const SELECTED_PROXY_STORAGE_KEY = 'pmt-selected-proxy-v1';

/** Load saved proxies from localStorage on module init (client-side only).
 * Falls back to DEFAULT_PROXIES if nothing saved or if running on server. */
function loadProxiesFromStorage(): ProxyEntry[] {
  if (typeof window === 'undefined') return DEFAULT_PROXIES;
  try {
    const raw = window.localStorage.getItem(PROXIES_STORAGE_KEY);
    if (!raw) return DEFAULT_PROXIES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_PROXIES;
  } catch {
    return DEFAULT_PROXIES;
  }
}

function loadSelectedProxyFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SELECTED_PROXY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface OrderbookData {
  bids: BookLevel[];
  asks: BookLevel[];
  timestamp: number;
}

export interface PricePoint {
  price: number;
  timestamp: number;
  side: 'bid' | 'ask' | 'trade';
  size?: number;
}

export interface OpenOrder {
  id: string;
  market: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  original_size: string;
  size_matched: string;
  price: string;
  status: string;
  outcome: string;
  created_at: string;
  type: string;
}

// ─── Store ─────────────────────────────────────────────────────────

interface TradingStore {
  // Markets
  popularMarkets: Market[];
  cryptoMarkets: Market[];
  btcMarkets: Market[];
  fiveMinuteMarkets: Market[];        // current live 5M/15M rounds (BTC/ETH/SOL × 5/15min)
  fiveMinuteHistory: Record<string, FiveMinuteRound[]>;  // key = `${asset}-${duration}`
  searchResults: Market[];
  selectedMarket: Market | null;
  searchQuery: string;
  isLoadingMarkets: boolean;
  marketCategory: 'popular' | 'crypto' | 'btc' | '5m' | 'search';

  // Orderbook
  orderbooks: Record<string, OrderbookData>;
  selectedTokenId: string | null;

  // Price history (for charts)
  priceHistory: Record<string, PricePoint[]>;

  // Orders
  openOrders: OpenOrder[];
  isLoadingOrders: boolean;

  // Balance
  balance: string;
  allowance: string;

  // Connection
  wsConnected: boolean;
  socket: Socket | null;
  pollingInterval: ReturnType<typeof setInterval> | null;
  fiveMinuteRefreshInterval: ReturnType<typeof setInterval> | null;

  // UI
  showOrderTicket: boolean;
  orderSide: 'BUY' | 'SELL';
  orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK';
  /** Prefilled price/size for the order ticket — set when user clicks an
   * orderbook row. The OrderTicket reads this on open and clears it after
   * applying. Lets users click a level → ticket opens already filled in. */
  orderPrefill: { price?: number; size?: number; tokenId?: string; side?: 'BUY' | 'SELL' } | null;

  // Proxies — shared between ProxyPanel and OrderTicket so the user can
  // pick a working proxy to route the order through. Persisted to localStorage.
  proxies: ProxyEntry[];
  selectedProxyId: string | null; // null = direct (no proxy)

  // Actions
  setPopularMarkets: (markets: Market[]) => void;
  setCryptoMarkets: (markets: Market[]) => void;
  setBtcMarkets: (markets: Market[]) => void;
  setFiveMinuteMarkets: (markets: Market[]) => void;
  setFiveMinuteHistory: (key: string, rounds: FiveMinuteRound[]) => void;
  setSearchResults: (markets: Market[]) => void;
  selectMarket: (market: Market) => void;
  setSearchQuery: (q: string) => void;
  setIsLoadingMarkets: (loading: boolean) => void;
  setMarketCategory: (cat: 'popular' | 'crypto' | 'btc' | '5m' | 'search') => void;
  updateOrderbook: (assetId: string, data: OrderbookData) => void;
  addPricePoint: (assetId: string, point: PricePoint) => void;
  setPriceHistory: (assetId: string, points: PricePoint[]) => void;
  setOpenOrders: (orders: OpenOrder[]) => void;
  setIsLoadingOrders: (loading: boolean) => void;
  setBalance: (balance: string, allowance: string) => void;
  setWsConnected: (connected: boolean) => void;
  connectWs: () => void;
  subscribeAsset: (assetId: string) => void;
  unsubscribeAsset: (assetId: string) => void;
  setSelectedTokenId: (id: string | null) => void;
  setShowOrderTicket: (show: boolean) => void;
  setOrderSide: (side: 'BUY' | 'SELL') => void;
  setOrderType: (type: 'GTC' | 'GTD' | 'FOK' | 'FAK') => void;
  setOrderPrefill: (p: { price?: number; size?: number; tokenId?: string; side?: 'BUY' | 'SELL' } | null) => void;
  /** Convenience: open the order ticket with everything pre-filled in one call. */
  quickOpenTicket: (p: { price?: number; size?: number; tokenId?: string; side?: 'BUY' | 'SELL' }) => void;

  // Proxy actions
  setProxies: (proxies: ProxyEntry[]) => void;
  setSelectedProxyId: (id: string | null) => void;
  startPolling: (tokenIds: string[]) => void;
  stopPolling: () => void;
  startFiveMinuteRefresh: () => void;
  stopFiveMinuteRefresh: () => void;
  fetchFiveMinuteHistory: (asset: 'btc' | 'eth' | 'sol', duration: number) => Promise<void>;
  refreshSelectedFiveMinuteMarket: () => Promise<void>;
}

export const useTradingStore = create<TradingStore>((set, get) => ({
  popularMarkets: [],
  cryptoMarkets: [],
  btcMarkets: [],
  fiveMinuteMarkets: [],
  fiveMinuteHistory: {},
  searchResults: [],
  selectedMarket: null,
  searchQuery: '',
  isLoadingMarkets: false,
  marketCategory: '5m', // Default to 5M tab — Polymarket's fastest, highest-priority markets
  orderbooks: {},
  selectedTokenId: null,
  priceHistory: {},
  openOrders: [],
  isLoadingOrders: false,
  balance: '0',
  allowance: '0',
  wsConnected: false,
  socket: null,
  pollingInterval: null,
  fiveMinuteRefreshInterval: null,
  showOrderTicket: false,
  orderSide: 'BUY',
  orderType: 'GTC',
  orderPrefill: null,

  // Default proxies from Webshare — same list that was previously hardcoded
  // in ProxyPanel. Now lives in the store so the OrderTicket can read it.
  // On the client, hydrate from localStorage so user-added proxies persist.
  proxies: loadProxiesFromStorage(),
  selectedProxyId: loadSelectedProxyFromStorage(),

  setPopularMarkets: (markets) => set({ popularMarkets: markets }),
  setCryptoMarkets: (markets) => set({ cryptoMarkets: markets }),
  setBtcMarkets: (markets) => set({ btcMarkets: markets }),
  setFiveMinuteMarkets: (markets) => set({ fiveMinuteMarkets: markets }),
  setFiveMinuteHistory: (key, rounds) =>
    set((s) => ({ fiveMinuteHistory: { ...s.fiveMinuteHistory, [key]: rounds } })),
  setSearchResults: (markets) => set({ searchResults: markets }),
  selectMarket: (market) => {
    const prev = get().selectedMarket;
    // Stop old polling if market changed
    if (prev?.id !== market.id) {
      get().stopPolling();
    }
    set({ selectedMarket: market, showOrderTicket: false, priceHistory: {} });

    // If selecting a 5M market, fetch its history strip immediately
    if (market.asset && market.durationMinutes) {
      get().fetchFiveMinuteHistory(market.asset, market.durationMinutes);
    }
  },
  setSearchQuery: (q) => set({ searchQuery: q }),
  setIsLoadingMarkets: (loading) => set({ isLoadingMarkets: loading }),
  setMarketCategory: (cat) => set({ marketCategory: cat }),
  updateOrderbook: (assetId, data) =>
    set((s) => ({
      orderbooks: { ...s.orderbooks, [assetId]: data },
    })),
  addPricePoint: (assetId, point) =>
    set((s) => {
      const history = [...(s.priceHistory[assetId] || []), point];
      if (history.length > 500) history.splice(0, history.length - 500);
      return { priceHistory: { ...s.priceHistory, [assetId]: history } };
    }),
  setPriceHistory: (assetId, points) =>
    set((s) => ({
      priceHistory: { ...s.priceHistory, [assetId]: points },
    })),
  setOpenOrders: (orders) => set({ openOrders: orders }),
  setIsLoadingOrders: (loading) => set({ isLoadingOrders: loading }),
  setBalance: (balance, allowance) => set({ balance, allowance }),
  setWsConnected: (connected) => set({ wsConnected: connected }),

  connectWs: () => {
    const existing = get().socket;
    if (existing?.connected) return;

    try {
      const socket = io('/?XTransformPort=3003', {
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
        timeout: 8000,
      });

      socket.on('connect', () => {
        console.log('[Store] WS connected');
        set({ wsConnected: true, socket });
        // Stop polling if WS connects — WS is faster
        get().stopPolling();

        // Re-subscribe to any selected market's tokens
        const market = get().selectedMarket;
        if (market?.clobTokenIds?.length) {
          socket.emit('subscribe', market.clobTokenIds);
        }
      });

      socket.on('disconnect', () => {
        console.log('[Store] WS disconnected');
        set({ wsConnected: false });
        // Start polling as fallback when WS drops
        const market = get().selectedMarket;
        if (market?.clobTokenIds?.length) {
          get().startPolling(market.clobTokenIds);
        }
      });

      socket.on('connect_error', () => {
        console.log('[Store] WS connection failed, using REST polling');
        set({ wsConnected: false });
      });

      socket.on('book', (data: any) => {
        get().updateOrderbook(data.asset_id, {
          bids: data.bids || [],
          asks: data.asks || [],
          timestamp: data.timestamp || Date.now(),
        });
      });

      socket.on('price', (data: any) => {
        get().addPricePoint(data.asset_id, {
          price: data.price,
          timestamp: data.timestamp,
          side: data.side || 'trade',
          size: data.size,
        });
      });

      socket.on('trade', (data: any) => {
        get().addPricePoint(data.asset_id, {
          price: data.price,
          timestamp: data.timestamp,
          side: data.side || 'trade',
          size: data.size,
        });
      });

      socket.on('history', (data: any) => {
        if (data.points?.length) {
          get().setPriceHistory(data.asset_id, data.points);
        }
      });

      set({ socket });
    } catch (e) {
      console.log('[Store] WS init failed, will use REST polling');
      set({ wsConnected: false });
    }
  },

  subscribeAsset: (assetId) => {
    const socket = get().socket;
    if (socket?.connected) {
      socket.emit('subscribe', [assetId]);
    }
  },

  unsubscribeAsset: (assetId) => {
    const socket = get().socket;
    if (socket?.connected) {
      socket.emit('unsubscribe', [assetId]);
    }
  },

  setSelectedTokenId: (id) => set({ selectedTokenId: id }),

  setShowOrderTicket: (show) => set({ showOrderTicket: show }),
  setOrderSide: (side) => set({ orderSide: side }),
  setOrderType: (type) => set({ orderType: type }),
  setOrderPrefill: (p) => set({ orderPrefill: p }),
  quickOpenTicket: (p) =>
    set({
      orderPrefill: p,
      showOrderTicket: true,
      ...(p.side ? { orderSide: p.side } : {}),
    }),

  // Proxy actions — persist to localStorage so user-added proxies survive
  // page reloads. setProxies replaces the whole list (used by add/remove
  // and by Test All which updates status). setSelectedProxyId controls
  // which proxy the OrderTicket routes the order through (null = direct).
  setProxies: (proxies) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(PROXIES_STORAGE_KEY, JSON.stringify(proxies));
      } catch {
        // ignore quota errors
      }
    }
    set({ proxies });
  },
  setSelectedProxyId: (id) => {
    if (typeof window !== 'undefined') {
      try {
        if (id) window.localStorage.setItem(SELECTED_PROXY_STORAGE_KEY, id);
        else window.localStorage.removeItem(SELECTED_PROXY_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    set({ selectedProxyId: id });
  },

  // REST polling fallback — works without WS relay (Vercel serverless)
  // For 5M/15M markets, polls every 1s because rounds resolve in 5 minutes
  // and the user is making real-time trading decisions. The orderbook panel
  // and chart both subscribe to these updates, so 1s = visibly live.
  // Other markets (daily, popular) keep the 3s cadence to be gentle on the API.
  startPolling: (tokenIds: string[]) => {
    // Don't poll if WS is connected
    if (get().wsConnected) return;
    if (tokenIds.length === 0) return;

    // Clear existing polling
    const existing = get().pollingInterval;
    if (existing) clearInterval(existing);

    const market = get().selectedMarket;
    const isFastMarket = !!(market?.durationMinutes && market.durationMinutes <= 15);
    const intervalMs = isFastMarket ? 1000 : 3000;

    // Initial fetch
    fetchPollingData(tokenIds);

    // Poll at the chosen cadence
    const interval = setInterval(() => {
      // Re-check token IDs from current market selection
      const m = get().selectedMarket;
      if (!m?.clobTokenIds?.length) {
        get().stopPolling();
        return;
      }
      fetchPollingData(m.clobTokenIds);
    }, intervalMs);

    set({ pollingInterval: interval });
  },

  stopPolling: () => {
    const existing = get().pollingInterval;
    if (existing) {
      clearInterval(existing);
      set({ pollingInterval: null });
    }
  },

  // Auto-refresh the 5M market list every 10 seconds so new rounds appear
  // as old ones resolve. The deterministic-slug approach means a brand-new
  // round may take ~30s to be indexed after its start time, but checking
  // every 10s means we catch it as soon as it's available. Cheap — only
  // 6 slug lookups per tick.
  startFiveMinuteRefresh: () => {
    const existing = get().fiveMinuteRefreshInterval;
    if (existing) return; // already running

    const tick = async () => {
      try {
        const res = await fetch('/api/polymarket/5m');
        if (!res.ok) return;
        const data = await res.json();
        const next: Market[] = data.fiveMinute || [];
        if (next.length === 0) return;

        set({ fiveMinuteMarkets: next });

        // If a 5M market is currently selected and its round just transitioned,
        // auto-select the new live round for the same asset/duration so the
        // user sees the next round seamlessly without manual clicks.
        const selected = get().selectedMarket;
        if (selected?.asset && selected?.durationMinutes) {
          const replacement = next.find(
            (m) => m.asset === selected.asset && m.durationMinutes === selected.durationMinutes,
          );
          if (replacement && replacement.id !== selected.id) {
            // Round transitioned — refresh history strip then swap selection
            get().fetchFiveMinuteHistory(selected.asset, selected.durationMinutes);
            get().selectMarket(replacement);
          } else if (replacement) {
            // Same round still live — update prices in-place without losing chart history
            set({
              selectedMarket: {
                ...selected,
                outcomePrices: replacement.outcomePrices,
                volume24hr: replacement.volume24hr,
                volume: replacement.volume,
                liquidity: replacement.liquidity,
                liquidityNum: replacement.liquidityNum,
                volumeNum: replacement.volumeNum,
              },
            });
          }
        }
      } catch (err) {
        // Silent — will retry next tick
      }
    };

    // Run immediately, then every 10s
    tick();
    const interval = setInterval(tick, 10000);
    set({ fiveMinuteRefreshInterval: interval });
  },

  stopFiveMinuteRefresh: () => {
    const existing = get().fiveMinuteRefreshInterval;
    if (existing) {
      clearInterval(existing);
      set({ fiveMinuteRefreshInterval: null });
    }
  },

  // Fetch the previous N resolved rounds for an asset/duration.
  // Stored in fiveMinuteHistory[`${asset}-${duration}`] for the header strip.
  fetchFiveMinuteHistory: async (asset, duration) => {
    try {
      const res = await fetch(
        `/api/polymarket/5m/history?asset=${asset}&duration=${duration}&count=10`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const rounds: FiveMinuteRound[] = (data.rounds || []).map((r: any) => ({
        id: r.id,
        question: r.question,
        slug: r.slug,
        endDate: r.endDate,
        roundStart: r.roundStart ?? null,
        roundEnd: r.roundEnd ?? null,
        outcomePrices: r.outcomePrices ?? [],
        winner: r.winner ?? null,
        closed: !!r.closed,
      }));
      get().setFiveMinuteHistory(`${asset}-${duration}`, rounds);
    } catch {
      // Silent
    }
  },

  // Re-fetch the currently-selected 5M market's fresh prices from Gamma
  // (used for the chart when the orderbook is thin and we need a fresher price).
  refreshSelectedFiveMinuteMarket: async () => {
    const m = get().selectedMarket;
    if (!m?.asset || !m?.durationMinutes || !m?.slug) return;
    try {
      const res = await fetch(`/api/polymarket/refresh?slug=${encodeURIComponent(m.slug)}`);
      if (!res.ok) return;
      const fresh = await res.json();
      if (fresh.outcomePrices && fresh.outcomePrices.length > 0) {
        set({
          selectedMarket: { ...m, outcomePrices: fresh.outcomePrices },
        });
      }
    } catch {
      // Silent
    }
  },
}));

// ─── Polling helper (outside store to avoid circular deps) ────────

async function fetchPollingData(tokenIds: string[]) {
  const store = useTradingStore.getState();

  // Fetch orderbooks
  for (const tokenId of tokenIds) {
    try {
      const res = await fetch(
        `/api/polymarket/orderbook?token_id=${encodeURIComponent(tokenId)}`,
      );
      if (res.ok) {
        const data = await res.json();
        store.updateOrderbook(tokenId, {
          bids: (data.bids || []).map((b: any) => ({
            price: parseFloat(b.price),
            size: parseFloat(b.size),
          })),
          asks: (data.asks || []).map((a: any) => ({
            price: parseFloat(a.price),
            size: parseFloat(a.size),
          })),
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      // Silently ignore — will retry on next poll
    }
  }

  // Get chart price data — use orderbook midpoint for markets with real books,
  // or re-fetch from Gamma API for markets with empty books (e.g. BTC daily "above $X")
  const now = Date.now();
  const market = store.selectedMarket;

  // Check if orderbooks have actual data
  const hasBookData = tokenIds.some(tid => {
    const book = store.orderbooks[tid];
    return book && (book.bids.length > 0 || book.asks.length > 0);
  });

  if (hasBookData) {
    // Use orderbook midpoint (works for popular/crypto markets with real CLOB books)
    for (const tokenId of tokenIds) {
      const book = store.orderbooks[tokenId];
      if (!book) continue;
      const bestBid = book.bids.length > 0 ? Math.max(...book.bids.map(b => b.price)) : 0;
      const bestAsk = book.asks.length > 0 ? Math.min(...book.asks.map(a => a.price)) : 0;
      let price = 0;
      if (bestBid > 0 && bestAsk > 0) price = (bestBid + bestAsk) / 2;
      else if (bestBid > 0) price = bestBid;
      else if (bestAsk > 0) price = bestAsk;
      if (price > 0) {
        store.addPricePoint(tokenId, { price, timestamp: now, side: 'trade' });
      }
    }
  } else if (market?.conditionId) {
    // BTC daily markets have empty CLOB books — poll Gamma for fresh prices
    try {
      const res = await fetch(`/api/polymarket/refresh?condition_id=${encodeURIComponent(market.conditionId)}`);
      if (res.ok) {
        const fresh = await res.json();
        const prices = fresh.outcomePrices || [];
        for (let i = 0; i < tokenIds.length && i < prices.length; i++) {
          const price = parseFloat(prices[i]);
          if (price > 0) {
            store.addPricePoint(tokenIds[i], { price, timestamp: now, side: 'trade' });
          }
        }
        // Update the market's stored prices too
        if (fresh.outcomePrices && market) {
          useTradingStore.setState({
            selectedMarket: { ...market, outcomePrices: fresh.outcomePrices },
          });
        }
      }
    } catch {
      // Silently ignore
    }
  }
}