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
  tokens: Array<{ token_id: string; outcome: string; price: number }>;
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
  searchResults: Market[];
  selectedMarket: Market | null;
  searchQuery: string;
  isLoadingMarkets: boolean;
  marketCategory: 'popular' | 'crypto' | 'btc' | 'search';

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

  // UI
  showOrderTicket: boolean;
  orderSide: 'BUY' | 'SELL';
  orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK';

  // Actions
  setPopularMarkets: (markets: Market[]) => void;
  setCryptoMarkets: (markets: Market[]) => void;
  setBtcMarkets: (markets: Market[]) => void;
  setSearchResults: (markets: Market[]) => void;
  selectMarket: (market: Market) => void;
  setSearchQuery: (q: string) => void;
  setIsLoadingMarkets: (loading: boolean) => void;
  setMarketCategory: (cat: 'popular' | 'crypto' | 'btc' | 'search') => void;
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
  startPolling: (tokenIds: string[]) => void;
  stopPolling: () => void;
}

export const useTradingStore = create<TradingStore>((set, get) => ({
  popularMarkets: [],
  cryptoMarkets: [],
  btcMarkets: [],
  searchResults: [],
  selectedMarket: null,
  searchQuery: '',
  isLoadingMarkets: false,
  marketCategory: 'btc', // Default to BTC tab
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
  showOrderTicket: false,
  orderSide: 'BUY',
  orderType: 'GTC',

  setPopularMarkets: (markets) => set({ popularMarkets: markets }),
  setCryptoMarkets: (markets) => set({ cryptoMarkets: markets }),
  setBtcMarkets: (markets) => set({ btcMarkets: markets }),
  setSearchResults: (markets) => set({ searchResults: markets }),
  selectMarket: (market) => {
    const prev = get().selectedMarket;
    // Stop old polling if market changed
    if (prev?.id !== market.id) {
      get().stopPolling();
    }
    set({ selectedMarket: market, showOrderTicket: false, priceHistory: {} });
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

  // REST polling fallback — works without WS relay (Vercel serverless)
  startPolling: (tokenIds: string[]) => {
    // Don't poll if WS is connected
    if (get().wsConnected) return;
    if (tokenIds.length === 0) return;

    // Clear existing polling
    const existing = get().pollingInterval;
    if (existing) clearInterval(existing);

    // Initial fetch
    fetchPollingData(tokenIds);

    // Poll every 3 seconds
    const interval = setInterval(() => {
      // Re-check token IDs from current market selection
      const market = get().selectedMarket;
      if (!market?.clobTokenIds?.length) {
        get().stopPolling();
        return;
      }
      fetchPollingData(market.clobTokenIds);
    }, 3000);

    set({ pollingInterval: interval });
  },

  stopPolling: () => {
    const existing = get().pollingInterval;
    if (existing) {
      clearInterval(existing);
      set({ pollingInterval: null });
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