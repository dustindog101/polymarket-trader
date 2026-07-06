import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer();
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const POLY_WS_URL = process.env.POLY_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

// Track active subscriptions per client
interface ClientSubs {
  assetIds: Set<string>;
}
const clientSubs = new Map<string, ClientSubs>();

// Map asset_id -> Set of socket ids
const assetSubscribers = new Map<string, Set<string>>();

// Store latest price data per asset
interface PricePoint {
  price: number;
  timestamp: number;
  side: 'bid' | 'ask' | 'trade';
  size?: number;
}
const latestPrices = new Map<string, PricePoint[]>();
const MAX_HISTORY = 500;

// Store latest orderbook snapshots
interface BookSnapshot {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  timestamp: number;
}
const latestBooks = new Map<string, BookSnapshot>();

// Connection to Polymarket WS
let polyWs: WebSocket | null = null;
let polyReconnectTimer: ReturnType<typeof setTimeout> | null = null;
const subscribedAssets = new Set<string>();

function connectPolyWs() {
  if (polyWs && (polyWs.readyState === WebSocket.OPEN || polyWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  console.log('[PolyWS] Connecting to', POLY_WS_URL);
  polyWs = new WebSocket(POLY_WS_URL);

  polyWs.onopen = () => {
    console.log('[PolyWS] Connected');
    // Re-subscribe to all tracked assets
    if (subscribedAssets.size > 0) {
      const msg = JSON.stringify({
        type: 'subscribe',
        channel: 'market',
        assets_ids: Array.from(subscribedAssets),
      });
      polyWs!.send(msg);
    }
  };

  polyWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.event_type === 'book' && data.asset_id) {
        // Orderbook snapshot
        const bids = (data.bids || []).map((b: any) => ({
          price: parseFloat(b.price),
          size: parseFloat(b.size),
        }));
        const asks = (data.asks || []).map((a: any) => ({
          price: parseFloat(a.price),
          size: parseFloat(a.size),
        }));
        latestBooks.set(data.asset_id, { bids, asks, timestamp: Date.now() });

        // Forward to all subscribers of this asset
        const subs = assetSubscribers.get(data.asset_id);
        if (subs) {
          const payload = {
            type: 'book',
            asset_id: data.asset_id,
            bids,
            asks,
            timestamp: Date.now(),
          };
          subs.forEach(socketId => {
            io.to(socketId).emit('book', payload);
          });
        }
      }

      if (data.event_type === 'price_change' && data.asset_id) {
        const price = parseFloat(data.price || '0');
        const point: PricePoint = {
          price,
          timestamp: Date.now(),
          side: data.side || 'trade',
          size: data.size ? parseFloat(data.size) : undefined,
        };

        // Store in history
        let history = latestPrices.get(data.asset_id);
        if (!history) {
          history = [];
          latestPrices.set(data.asset_id, history);
        }
        history.push(point);
        if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

        // Forward
        const subs = assetSubscribers.get(data.asset_id);
        if (subs) {
          subs.forEach(socketId => {
            io.to(socketId).emit('price', {
              type: 'price',
              asset_id: data.asset_id,
              price,
              timestamp: Date.now(),
              side: data.side,
              size: data.size ? parseFloat(data.size) : undefined,
            });
          });
        }
      }

      if (data.event_type === 'trade' && data.asset_id) {
        const subs = assetSubscribers.get(data.asset_id);
        if (subs) {
          subs.forEach(socketId => {
            io.to(socketId).emit('trade', {
              type: 'trade',
              asset_id: data.asset_id,
              price: parseFloat(data.price || '0'),
              size: parseFloat(data.size || '0'),
              side: data.side,
              timestamp: Date.now(),
            });
          });
        }
      }
    } catch (e) {
      // Ignore parse errors for non-JSON frames (pings, etc.)
    }
  };

  polyWs.onclose = () => {
    console.log('[PolyWS] Disconnected, reconnecting in 3s...');
    polyWs = null;
    polyReconnectTimer = setTimeout(connectPolyWs, 3000);
  };

  polyWs.onerror = (err) => {
    console.error('[PolyWS] Error', err.message);
    polyWs?.close();
  };

  // Keep-alive ping
  const pingInterval = setInterval(() => {
    if (polyWs && polyWs.readyState === WebSocket.OPEN) {
      polyWs.send('ping');
    } else {
      clearInterval(pingInterval);
    }
  }, 10000);
}

function subscribeToAsset(assetId: string) {
  if (subscribedAssets.has(assetId)) return;
  subscribedAssets.add(assetId);

  if (polyWs && polyWs.readyState === WebSocket.OPEN) {
    const msg = JSON.stringify({
      type: 'subscribe',
      channel: 'market',
      assets_ids: [assetId],
    });
    polyWs.send(msg);
    console.log('[PolyWS] Subscribed to', assetId);
  }
}

function unsubscribeFromAsset(assetId: string) {
  const subs = assetSubscribers.get(assetId);
  if (subs && subs.size === 0) {
    subscribedAssets.delete(assetId);
    if (polyWs && polyWs.readyState === WebSocket.OPEN) {
      polyWs.send(JSON.stringify({
        type: 'unsubscribe',
        channel: 'market',
        assets_ids: [assetId],
      }));
    }
  }
}

// ─── Client Socket Handlers ──────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[Client] Connected: ${socket.id}`);
  clientSubs.set(socket.id, { assetIds: new Set() });

  socket.on('subscribe', (assetIds: string | string[]) => {
    const ids = Array.isArray(assetIds) ? assetIds : [assetIds];
    const client = clientSubs.get(socket.id);
    if (!client) return;

    ids.forEach((assetId) => {
      client.assetIds.add(assetId);
      subscribeToAsset(assetId);

      if (!assetSubscribers.has(assetId)) {
        assetSubscribers.set(assetId, new Set());
      }
      assetSubscribers.get(assetId)!.add(socket.id);

      // Send latest book if available
      const book = latestBooks.get(assetId);
      if (book) {
        socket.emit('book', {
          type: 'book',
          asset_id: assetId,
          ...book,
        });
      }

      // Send latest price history if available
      const history = latestPrices.get(assetId);
      if (history && history.length > 0) {
        socket.emit('history', {
          type: 'history',
          asset_id: assetId,
          points: history,
        });
      }
    });

    console.log(`[Client ${socket.id}] Subscribed to ${ids.join(', ')}`);
  });

  socket.on('unsubscribe', (assetIds: string | string[]) => {
    const ids = Array.isArray(assetIds) ? assetIds : [assetIds];
    const client = clientSubs.get(socket.id);
    if (!client) return;

    ids.forEach((assetId) => {
      client.assetIds.delete(assetId);
      const subs = assetSubscribers.get(assetId);
      if (subs) {
        subs.delete(socket.id);
        if (subs.size === 0) assetSubscribers.delete(assetId);
      }
      unsubscribeFromAsset(assetId);
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Client] Disconnected: ${socket.id}`);
    const client = clientSubs.get(socket.id);
    if (client) {
      client.assetIds.forEach((assetId) => {
        const subs = assetSubscribers.get(assetId);
        if (subs) {
          subs.delete(socket.id);
          if (subs.size === 0) assetSubscribers.delete(assetId);
        }
        unsubscribeFromAsset(assetId);
      });
      clientSubs.delete(socket.id);
    }
  });

  socket.on('error', (err) => {
    console.error(`[Client ${socket.id}] Error:`, err);
  });
});

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`Polymarket WS relay running on port ${PORT}`);
  connectPolyWs();
});

process.on('SIGTERM', () => {
  polyWs?.close();
  if (polyReconnectTimer) clearTimeout(polyReconnectTimer);
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  polyWs?.close();
  if (polyReconnectTimer) clearTimeout(polyReconnectTimer);
  httpServer.close(() => process.exit(0));
});