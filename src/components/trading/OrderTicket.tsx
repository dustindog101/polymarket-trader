'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { X, Loader2, Info, Clock, Zap, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useTradingStore } from '@/stores/trading';
import { toast } from '@/hooks/use-toast';

// ─── Types ───────────────────────────────────────────────────────────

type OrderSide = 'BUY' | 'SELL';
type OrderMode = 'LIMIT' | 'MARKET';
type OrderType = 'GTC' | 'GTD' | 'FOK' | 'FAK';

interface OrderForm {
  side: OrderSide;
  mode: OrderMode;
  type: OrderType;
  tokenId: string;
  price: string;
  size: string;
  postOnly: boolean;
  expiration: string; // ISO datetime-local string for GTD
}

// ─── Order type metadata ─────────────────────────────────────────────

const ORDER_TYPES: Array<{
  value: OrderType;
  label: string;
  short: string;
  description: string;
  requiresPrice: boolean;
  allowedModes: OrderMode[];
}> = [
  {
    value: 'GTC',
    label: 'Good Till Cancel',
    short: 'GTC',
    description: 'Stays open on the book until filled or manually cancelled. The standard limit order.',
    requiresPrice: true,
    allowedModes: ['LIMIT'],
  },
  {
    value: 'GTD',
    label: 'Good Till Date',
    short: 'GTD',
    description: 'Limit order that auto-cancels at a specified time. Useful for 5M markets where you want the order to expire before the round ends.',
    requiresPrice: true,
    allowedModes: ['LIMIT'],
  },
  {
    value: 'FOK',
    label: 'Fill or Kill',
    short: 'FOK',
    description: 'Must fill the entire size immediately at the specified price or better, or be cancelled entirely. No partial fills.',
    requiresPrice: true,
    allowedModes: ['LIMIT', 'MARKET'],
  },
  {
    value: 'FAK',
    label: 'Fill and Kill (IOC)',
    short: 'FAK',
    description: 'Fill as much as possible immediately, cancel the rest. Also known as Immediate-or-Cancel. Market orders use this.',
    requiresPrice: true,
    allowedModes: ['LIMIT', 'MARKET'],
  },
];

// ─── Component ───────────────────────────────────────────────────────

export function OrderTicket() {
  const {
    selectedMarket,
    showOrderTicket,
    setShowOrderTicket,
    orderSide,
    setOrderSide,
    orderType,
    setOrderType,
    selectedTokenId,
    balance,
    orderPrefill,
    setOrderPrefill,
    proxies,
    selectedProxyId,
    setSelectedProxyId,
    orderbooks,
  } = useTradingStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<OrderForm>({
    side: orderSide,
    mode: 'LIMIT',
    type: orderType,
    tokenId: selectedTokenId ?? '',
    price: '',
    size: '',
    postOnly: false,
    expiration: '',
  });

  // Apply prefill whenever the ticket opens with a prefill payload (from
  // clicking an orderbook level or a quick-trade button). Clears the prefill
  // after applying so it doesn't re-apply on subsequent opens.
  React.useEffect(() => {
    if (!showOrderTicket || !orderPrefill) return;
    setForm((f) => ({
      ...f,
      price: orderPrefill.price !== undefined ? orderPrefill.price.toFixed(1) : f.price,
      size: orderPrefill.size !== undefined ? String(orderPrefill.size) : f.size,
      tokenId: orderPrefill.tokenId ?? f.tokenId,
      side: orderPrefill.side ?? f.side,
      // Prefill from orderbook click = always a limit order at that price
      mode: orderPrefill.price !== undefined ? 'LIMIT' : f.mode,
    }));
    if (orderPrefill.side) setOrderSide(orderPrefill.side);
    setOrderPrefill(null);
  }, [showOrderTicket, orderPrefill, setOrderPrefill, setOrderSide]);

  // Sync store values
  const tokens = useMemo(() => {
    if (!selectedMarket?.tokens?.length) return [];
    return selectedMarket.tokens.map((t) => ({
      id: t.token_id,
      label: t.outcome,
      price: t.price,
    }));
  }, [selectedMarket?.tokens]);

  // Auto-set token ID if market changes
  React.useEffect(() => {
    if (selectedTokenId) {
      setForm((f) => ({ ...f, tokenId: selectedTokenId }));
    } else if (tokens.length > 0) {
      setForm((f) => ({ ...f, tokenId: tokens[0].id }));
    }
  }, [selectedTokenId, tokens]);

  // Sync side/type from store
  React.useEffect(() => {
    setForm((f) => ({ ...f, side: orderSide, type: orderType }));
  }, [orderSide, orderType]);

  // When mode switches to MARKET, force type to FAK (the standard market order
  // type). When switching back to LIMIT, restore GTC.
  const handleModeChange = useCallback(
    (mode: OrderMode) => {
      setForm((f) => ({
        ...f,
        mode,
        type: mode === 'MARKET' ? 'FAK' : 'GTC',
        postOnly: mode === 'MARKET' ? false : f.postOnly,
      }));
      if (mode === 'MARKET') setOrderType('FAK');
      else setOrderType('GTC');
    },
    [setOrderType],
  );

  // For MARKET orders, estimate the fill price from the orderbook.
  // BUY = take asks (lowest ask price), SELL = take bids (highest bid price).
  const estimatedMarketPrice = useMemo(() => {
    if (form.mode !== 'MARKET' || !form.tokenId) return null;
    const book = orderbooks[form.tokenId];
    if (!book) return null;
    if (form.side === 'BUY' && book.asks.length > 0) {
      const bestAsk = Math.min(...book.asks.map((a) => a.price));
      return bestAsk;
    }
    if (form.side === 'SELL' && book.bids.length > 0) {
      const bestBid = Math.max(...book.bids.map((b) => b.price));
      return bestBid;
    }
    return null;
  }, [form.mode, form.tokenId, form.side, orderbooks]);

  const totalCost = useMemo(() => {
    const size = parseFloat(form.size);
    if (isNaN(size) || size <= 0) return 0;
    if (form.mode === 'MARKET') {
      if (!estimatedMarketPrice) return 0;
      return estimatedMarketPrice * size;
    }
    const price = parseFloat(form.price) / 100; // cents to decimal
    if (isNaN(price) || price <= 0) return 0;
    return price * size;
  }, [form.price, form.size, form.mode, estimatedMarketPrice]);

  const isFormValid = useMemo(() => {
    const size = parseFloat(form.size);
    if (isNaN(size) || size <= 0 || isSubmitting) return false;
    if (form.tokenId === '') return false;
    if (form.mode === 'LIMIT') {
      const price = parseFloat(form.price);
      if (isNaN(price) || price < 0 || price > 100) return false;
      // Post-only can't be FOK/FAK
      if (form.postOnly && (form.type === 'FOK' || form.type === 'FAK')) return false;
    }
    // GTD requires an expiration
    if (form.type === 'GTD' && !form.expiration) return false;
    return true;
  }, [form, isSubmitting]);

  const handleSubmit = useCallback(async () => {
    if (!isFormValid || !selectedMarket) return;

    setIsSubmitting(true);

    try {
      const selectedProxy = selectedProxyId
        ? proxies.find((p) => p.id === selectedProxyId)
        : null;

      // Determine the price to send
      let priceDecimal: number;
      if (form.mode === 'MARKET') {
        // Market order: use estimated price from orderbook, or 0.99/0.01 as fallback
        // (CLOB V2 doesn't have a true "market" type — FAK at the best opposite price
        // simulates it)
        if (estimatedMarketPrice) {
          priceDecimal = estimatedMarketPrice;
        } else {
          // Fallback: 0.99 for BUY, 0.01 for SELL (aggressive enough to cross)
          priceDecimal = form.side === 'BUY' ? 0.99 : 0.01;
        }
      } else {
        priceDecimal = parseFloat(form.price) / 100;
      }

      const payload: Record<string, any> = {
        token_id: form.tokenId,
        side: form.side,
        type: form.type,
        price: priceDecimal,
        size: parseFloat(form.size),
        post_only: form.mode === 'LIMIT' ? form.postOnly : false,
        market: selectedMarket.conditionId,
      };

      // GTD: convert datetime-local to Unix seconds
      if (form.type === 'GTD' && form.expiration) {
        const expDate = new Date(form.expiration);
        payload.expiration = Math.floor(expDate.getTime() / 1000);
      }

      // 5M markets use neg_risk and tick_size=0.001
      if (selectedMarket.durationMinutes && selectedMarket.durationMinutes <= 15) {
        payload.neg_risk = true;
        payload.tick_size = 0.001;
      }

      if (selectedProxy) {
        payload.proxy = {
          host: selectedProxy.host,
          port: selectedProxy.port,
          username: selectedProxy.username,
          password: selectedProxy.password,
        };
      }

      const res = await fetch('/api/polymarket/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? data.message ?? 'Order failed');
      }

      const priceLabel =
        form.mode === 'MARKET'
          ? `~${(estimatedMarketPrice ? estimatedMarketPrice * 100 : 0).toFixed(1)}¢ (market)`
          : `${parseFloat(form.price).toFixed(1)}¢`;

      toast({
        title: `${form.side} ${form.mode.toLowerCase()} order placed`,
        description: `${form.side} ${parseFloat(form.size)} shares @ ${priceLabel} (${form.type})${
          selectedProxy ? ` via ${selectedProxy.host}:${selectedProxy.port}` : ''
        }`,
      });

      // Reset form
      setForm((f) => ({ ...f, price: '', size: '' }));
      setShowOrderTicket(false);
    } catch (err: any) {
      toast({
        title: 'Order failed',
        description: err.message ?? 'An error occurred placing your order',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isFormValid,
    form,
    selectedMarket,
    setShowOrderTicket,
    selectedProxyId,
    proxies,
    estimatedMarketPrice,
  ]);

  const handleSideChange = (side: OrderSide) => {
    setOrderSide(side);
    setForm((f) => ({ ...f, side }));
  };

  const handleTypeChange = (type: OrderType) => {
    setOrderType(type);
    setForm((f) => ({ ...f, type }));
  };

  if (!showOrderTicket || !selectedMarket) return null;

  const isBuy = form.side === 'BUY';
  const availableTypes = ORDER_TYPES.filter((t) => t.allowedModes.includes(form.mode));
  const selectedTypeMeta = ORDER_TYPES.find((t) => t.value === form.type);

  // Default expiration for GTD: 1 hour from now, or the round end (for 5M), whichever is sooner
  const defaultGtdExpiration = useMemo(() => {
    const now = new Date();
    const oneHour = new Date(now.getTime() + 60 * 60 * 1000);
    if (selectedMarket?.roundEnd) {
      const roundEnd = new Date(selectedMarket.roundEnd * 1000);
      return roundEnd < oneHour ? roundEnd : oneHour;
    }
    return oneHour;
  }, [selectedMarket?.roundEnd]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end lg:items-stretch lg:justify-end">
      {/* Backdrop (mobile) */}
      <div
        className="absolute inset-0 bg-black/40 lg:hidden"
        onClick={() => setShowOrderTicket(false)}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm border-l border-zinc-800 bg-zinc-950 flex flex-col shadow-2xl lg:w-[340px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">Place Order</span>
            {form.mode === 'MARKET' && (
              <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400">
                <Zap className="size-2.5 mr-0.5" />
                MARKET
              </Badge>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowOrderTicket(false)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3.5">
          {/* Mode toggle: LIMIT vs MARKET */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('LIMIT')}
              className={`
                h-9 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-1.5
                ${form.mode === 'LIMIT'
                  ? 'bg-zinc-700 text-zinc-100 border border-zinc-600'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                }
              `}
            >
              <Calendar className="size-3.5" />
              LIMIT
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('MARKET')}
              className={`
                h-9 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-1.5
                ${form.mode === 'MARKET'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                }
              `}
            >
              <Zap className="size-3.5" />
              MARKET
            </button>
          </div>

          {/* Side toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSideChange('BUY')}
              className={`
                h-10 rounded-lg text-sm font-semibold transition-all duration-150
                ${isBuy
                  ? 'bg-emerald-600 text-white shadow-[0_0_16px_rgba(16,185,129,0.25)]'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                }
              `}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => handleSideChange('SELL')}
              className={`
                h-10 rounded-lg text-sm font-semibold transition-all duration-150
                ${!isBuy
                  ? 'bg-red-600 text-white shadow-[0_0_16px_rgba(239,68,68,0.25)]'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                }
              `}
            >
              SELL
            </button>
          </div>

          {/* Outcome selector */}
          {tokens.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Outcome</Label>
              <Select
                value={form.tokenId}
                onValueChange={(v) => setForm((f) => ({ ...f, tokenId: v }))}
              >
                <SelectTrigger className="w-full border-zinc-800 bg-zinc-900/80 text-zinc-100 text-sm">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {tokens.map((t) => (
                    <SelectItem
                      key={t.id}
                      value={t.id}
                      className="text-zinc-100 focus:bg-zinc-800 focus:text-zinc-100"
                    >
                      {t.label} — {(t.price * 100).toFixed(1)}¢
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Order type — only shown for LIMIT (MARKET is always FAK) */}
          {form.mode === 'LIMIT' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Time in Force</Label>
              <Select
                value={form.type}
                onValueChange={(v) => handleTypeChange(v as OrderType)}
              >
                <SelectTrigger className="w-full border-zinc-800 bg-zinc-900/80 text-zinc-100 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {availableTypes.map((t) => (
                    <SelectItem
                      key={t.value}
                      value={t.value}
                      className="text-zinc-100 focus:bg-zinc-800 focus:text-zinc-100"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-zinc-500">{t.short}</span>
                        <span>{t.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTypeMeta && (
                <p className="text-[10px] text-zinc-600 leading-tight">{selectedTypeMeta.description}</p>
              )}
            </div>
          )}

          {/* GTD expiration picker */}
          {form.type === 'GTD' && form.mode === 'LIMIT' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400 flex items-center gap-1.5">
                <Clock className="size-3" />
                Expires At
              </Label>
              <Input
                type="datetime-local"
                value={form.expiration || (() => {
                  const d = defaultGtdExpiration;
                  const off = d.getTimezoneOffset();
                  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
                })()}
                onChange={(e) => setForm((f) => ({ ...f, expiration: e.target.value }))}
                className="border-zinc-800 bg-zinc-900/80 text-zinc-100 text-sm"
              />
              <div className="flex gap-1">
                {[
                  { label: '5m', ms: 5 * 60 * 1000 },
                  { label: '15m', ms: 15 * 60 * 1000 },
                  { label: '1h', ms: 60 * 60 * 1000 },
                  { label: 'Round end', ms: -1 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      let target: Date;
                      if (preset.ms === -1 && selectedMarket?.roundEnd) {
                        target = new Date(selectedMarket.roundEnd * 1000);
                      } else {
                        target = new Date(Date.now() + preset.ms);
                      }
                      const off = target.getTimezoneOffset();
                      const local = new Date(target.getTime() - off * 60000)
                        .toISOString()
                        .slice(0, 16);
                      setForm((f) => ({ ...f, expiration: local }));
                    }}
                    className="flex-1 h-6 rounded text-[10px] bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {selectedMarket?.roundEnd && (
                <p className="text-[10px] text-amber-400/70">
                  Round ends at {new Date(selectedMarket.roundEnd * 1000).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}

          {/* Price — hidden for MARKET mode */}
          {form.mode === 'LIMIT' ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-400">Price (cents)</Label>
                <span className="text-[10px] text-zinc-600">0 – 100</span>
              </div>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="0.0"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="border-zinc-800 bg-zinc-900/80 text-zinc-100 font-mono text-sm"
              />
              {/* Quick price adjust — ±1¢ / ±5¢ from current */}
              <div className="flex gap-1">
                {[-5, -1, +1, +5].map((delta) => {
                  const current = parseFloat(form.price) || 0;
                  const next = Math.max(0, Math.min(100, current + delta));
                  return (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, price: next.toFixed(1) }))}
                      className="flex-1 h-7 rounded text-[11px] font-mono bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
                    >
                      {delta > 0 ? `+${delta}` : delta}¢
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* MARKET mode — show estimated fill price from orderbook */
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Estimated Fill Price</Label>
              <div className="h-9 rounded-md border border-zinc-800 bg-zinc-900/80 px-3 flex items-center justify-between">
                {estimatedMarketPrice ? (
                  <>
                    <span className="text-sm font-mono text-amber-400 font-semibold">
                      ¢{(estimatedMarketPrice * 100).toFixed(1)}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      best {form.side === 'BUY' ? 'ask' : 'bid'}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-zinc-600">
                    Loading orderbook… (will fill at best available price)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-600 leading-tight">
                Market orders execute immediately at the best available price. Uses FAK
                (Fill and Kill) — fills as much as possible, cancels the rest.
              </p>
            </div>
          )}

          {/* Size */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Size (shares)</Label>
            <Input
              type="number"
              step="1"
              min="1"
              placeholder="0"
              value={form.size}
              onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
              className="border-zinc-800 bg-zinc-900/80 text-zinc-100 font-mono text-sm"
            />
            {/* Quick-size presets */}
            <div className="flex gap-1">
              {[5, 10, 25, 50, 100].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, size: String(s) }))}
                  className={`flex-1 h-7 rounded text-[11px] font-mono transition-colors ${
                    form.size === String(s)
                      ? 'bg-zinc-700 text-zinc-100 border border-zinc-600'
                      : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Post-only — only for LIMIT + GTC/GTD (can't post-only a FOK/FAK) */}
          {form.mode === 'LIMIT' && (form.type === 'GTC' || form.type === 'GTD') && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="post-only"
                checked={form.postOnly}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, postOnly: checked === true }))
                }
                className="border-zinc-700 data-[state=checked]:bg-zinc-600 data-[state=checked]:border-zinc-600"
              />
              <label
                htmlFor="post-only"
                className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer"
              >
                Post-only (maker only)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3 text-zinc-600" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="bg-zinc-900 border-zinc-700 text-zinc-300 text-xs max-w-[220px]"
                  >
                    Order will only rest on the book as a maker. If it would cross
                    the spread (take liquidity), it will be rejected. Earns maker fees.
                  </TooltipContent>
                </Tooltip>
              </label>
            </div>
          )}

          {/* Post-only warning for FOK/FAK */}
          {form.mode === 'LIMIT' && form.postOnly && (form.type === 'FOK' || form.type === 'FAK') && (
            <p className="text-[10px] text-amber-400">
              Post-only is disabled for {form.type} orders (they execute immediately, can't rest on the book).
            </p>
          )}

          <Separator className="bg-zinc-800" />

          {/* Total */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              {form.mode === 'MARKET' ? 'Est. Total' : 'Total Cost'}
            </span>
            <span className="text-sm font-mono font-semibold text-zinc-100">
              ${totalCost.toFixed(2)}
            </span>
          </div>

          {/* Balance info */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Available Balance</span>
            <span className="text-xs font-mono text-zinc-400">
              ${parseFloat(balance).toFixed(2)}
            </span>
          </div>

          {/* Proxy selector — shows current route + lets user switch */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500 shrink-0">Order route:</span>
            <Select
              value={selectedProxyId ?? 'direct'}
              onValueChange={(v) => setSelectedProxyId(v === 'direct' ? null : v)}
            >
              <SelectTrigger className="flex-1 h-8 border-zinc-800 bg-zinc-900/80 text-zinc-300 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                <SelectItem value="direct" className="text-zinc-300 focus:bg-zinc-800">
                  Direct (no proxy)
                </SelectItem>
                {proxies
                  .filter((p) => p.status === 'working')
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-zinc-300 focus:bg-zinc-800">
                      {p.host}:{p.port} ({p.latency}ms)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProxyId &&
            !proxies.find((p) => p.id === selectedProxyId && p.status === 'working') && (
              <div className="text-[10px] text-amber-400">
                Selected proxy is no longer marked working — test it again or pick another.
              </div>
            )}
        </div>

        {/* Submit */}
        <div className="border-t border-zinc-800 p-4">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid}
            className={`
              w-full h-11 text-sm font-semibold transition-all
              ${isBuy
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-600/30 disabled:text-emerald-400/50'
                : 'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-600/30 disabled:text-red-400/50'
              }
            `}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Placing Order...
              </>
            ) : (
              <>
                {form.side} {form.mode} {form.size || '0'}
                {form.mode === 'LIMIT' ? ` @ ${form.price || '0.0'}¢` : ' (market)'}
                <span className="ml-1.5 text-[10px] opacity-70">{form.type}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
