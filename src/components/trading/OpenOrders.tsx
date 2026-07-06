'use client';

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Trash2, RefreshCw, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTradingStore, type OpenOrder } from '@/stores/trading';
import { toast } from '@/hooks/use-toast';

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return dateStr;
  }
}

function formatMatched(original: string, matched: string): string {
  const o = parseFloat(original);
  const m = parseFloat(matched);
  if (isNaN(o) || isNaN(m)) return '0/0';
  return `${m.toFixed(0)}/${o.toFixed(0)}`;
}

// ─── Component ───────────────────────────────────────────────────────

export function OpenOrders() {
  const { selectedMarket, openOrders, isLoadingOrders, setOpenOrders, setIsLoadingOrders } =
    useTradingStore();

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancellingAll, setCancellingAll] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      const params = selectedMarket
        ? `?market=${encodeURIComponent(selectedMarket.conditionId)}`
        : '';
      const res = await fetch(`/api/polymarket/orders${params}`);
      if (res.ok) {
        const data = await res.json();
        setOpenOrders(data.orders ?? data);
      }
    } catch (err) {
      console.error('[OpenOrders] Fetch failed', err);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [selectedMarket, setOpenOrders, setIsLoadingOrders]);

  // Fetch on mount and when market changes
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    intervalRef.current = setInterval(fetchOrders, 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchOrders]);

  // Cancel single order
  const cancelOrder = useCallback(
    async (orderId: string) => {
      setCancellingId(orderId);
      try {
        const res = await fetch(`/api/polymarket/orders?order_id=${encodeURIComponent(orderId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Cancel failed');
        }
        toast({
          title: 'Order cancelled',
          description: `Order ${orderId.slice(0, 8)}... has been cancelled`,
        });
        fetchOrders();
      } catch (err: any) {
        toast({
          title: 'Cancel failed',
          description: err.message ?? 'Failed to cancel order',
          variant: 'destructive',
        });
      } finally {
        setCancellingId(null);
      }
    },
    [fetchOrders],
  );

  // Cancel all orders
  const cancelAll = useCallback(async () => {
    if (openOrders.length === 0) return;
    setCancellingAll(true);
    try {
      await Promise.all(
        openOrders.map((order) =>
          fetch(`/api/polymarket/orders?order_id=${encodeURIComponent(order.id)}`, {
            method: 'DELETE',
          }),
        ),
      );
      toast({
        title: 'All orders cancelled',
        description: `${openOrders.length} order(s) have been cancelled`,
      });
      fetchOrders();
    } catch (err: any) {
      toast({
        title: 'Cancel all failed',
        description: err.message ?? 'Failed to cancel some orders',
        variant: 'destructive',
      });
    } finally {
      setCancellingAll(false);
    }
  }, [openOrders, fetchOrders]);

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col border border-zinc-800 rounded-lg bg-zinc-900/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-300">
          Open Orders
          {openOrders.length > 0 && (
            <span className="ml-1.5 text-zinc-500">({openOrders.length})</span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchOrders}
            disabled={isLoadingOrders}
            className="h-7 px-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw className={`size-3 ${isLoadingOrders ? 'animate-spin' : ''}`} />
          </Button>
          {openOrders.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelAll}
              disabled={cancellingAll}
              className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="size-3 mr-1" />
              Cancel All
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1">
        {isLoadingOrders && openOrders.length === 0 ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-5 w-12 bg-zinc-800" />
                <Skeleton className="h-5 w-16 bg-zinc-800" />
                <Skeleton className="h-5 w-12 bg-zinc-800" />
                <Skeleton className="h-5 w-20 bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : openOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
            <Inbox className="size-8 mb-2 text-zinc-700" />
            <span className="text-sm">No open orders</span>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-[10px] text-zinc-500 uppercase tracking-wider h-8 px-2">
                  Side
                </TableHead>
                <TableHead className="text-[10px] text-zinc-500 uppercase tracking-wider h-8 px-2">
                  Outcome
                </TableHead>
                <TableHead className="text-[10px] text-zinc-500 uppercase tracking-wider h-8 px-2 text-right">
                  Price
                </TableHead>
                <TableHead className="text-[10px] text-zinc-500 uppercase tracking-wider h-8 px-2 text-right">
                  Matched
                </TableHead>
                <TableHead className="text-[10px] text-zinc-500 uppercase tracking-wider h-8 px-2">
                  Status
                </TableHead>
                <TableHead className="text-[10px] text-zinc-500 uppercase tracking-wider h-8 px-2 hidden sm:table-cell">
                  Created
                </TableHead>
                <TableHead className="text-[10px] text-zinc-500 uppercase tracking-wider h-8 px-2 w-10">
                  {/* Actions */}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openOrders.map((order) => (
                <TableRow
                  key={order.id}
                  className="border-zinc-800/60 hover:bg-zinc-800/30"
                >
                  <TableCell className="px-2 py-1.5">
                    <Badge
                      variant="outline"
                      className={`
                        text-[10px] font-semibold px-1.5 py-0
                        ${order.side === 'BUY'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border-red-500/30 bg-red-500/10 text-red-400'
                        }
                      `}
                    >
                      {order.side}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-zinc-300">
                    {order.outcome}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-right font-mono text-zinc-200 tabular-nums">
                    {(parseFloat(order.price) * 100).toFixed(1)}¢
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-right font-mono text-zinc-400 tabular-nums">
                    {formatMatched(order.original_size, order.size_matched)}
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <Badge
                      variant="outline"
                      className="text-[10px] border-zinc-700 text-zinc-400 bg-zinc-800/50 px-1.5 py-0"
                    >
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-zinc-500 hidden sm:table-cell">
                    {formatDate(order.created_at)}
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => cancelOrder(order.id)}
                      disabled={cancellingId === order.id}
                      className="text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
    </div>
  );
}