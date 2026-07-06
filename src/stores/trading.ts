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
  searchResults: Market[];
  selectedMarket: Market | null;
  searchQuery: string;
  isLoadingMarkets: boolean;
  marketCategory: 'popular' | 'crypto' | 'search';

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

  // UI
  showOrderTicket: boolean;
  orderSide: 'BUY' | 'SELL';
  orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK';

  // Actions
  setPopularMarkets: (markets: Market[]) => void;
  setCryptoMarkets: (markets: Market[]) => void;
  setSearchResults: (markets: Market[]) => void;
  selectMarket: (market: Market) => void;
  setSearchQuery: (q: string) => void;
  setIsLoadingMarkets: (loading: boolean) => void;
  setMarketCategory: (cat: 'popular' | 'crypto' | 'search') => void;
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
}

export const useTradingStore = create<TradingStore>((set, get) => ({
  popularMarkets: [],
  cryptoMarkets: [],
  searchResults: [],
  selectedMarket: null,
  searchQuery: '',
  isLoadingMarkets: false,
  marketCategory: 'popular',
  orderbooks: {},
  selectedTokenId: null,
  priceHistory: {},
  openOrders: [],
  isLoadingOrders: false,
  balance: '0',
  allowance: '0',
  wsConnected: false,
  socket: null,
  showOrderTicket: false,
  orderSide: 'BUY',
  orderType: 'GTC',

  setPopularMarkets: (markets) => set({ popularMarkets: markets }),
  setCryptoMarkets: (markets) => set({ cryptoMarkets: markets }),
  setSearchResults: (markets) => set({ searchResults: markets }),
  selectMarket: (market) => set({ selectedMarket: market, showOrderTicket: false }),
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

    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 15000,
    });

    socket.on('connect', () => {
      console.log('[Store] WS connected');
      set({ wsConnected: true, socket });

      // Re-subscribe to any selected market's tokens
      const market = get().selectedMarket;
      if (market?.clobTokenIds?.length) {
        socket.emit('subscribe', market.clobTokenIds);
      }
    });

    socket.on('disconnect', () => {
      console.log('[Store] WS disconnected');
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
}));