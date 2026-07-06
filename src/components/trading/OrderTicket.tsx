'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { X, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useTradingStore, type OpenOrder } from '@/stores/trading';
import { toast } from '@/hooks/use-toast';

// ─── Types ───────────────────────────────────────────────────────────

type OrderSide = 'BUY' | 'SELL';
type OrderType = 'GTC' | 'GTD' | 'FOK' | 'FAK';

interface OrderForm {
  side: OrderSide;
  type: OrderType;
  tokenId: string;
  price: string;
  size: string;
  postOnly: boolean;
}

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
  } = useTradingStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<OrderForm>({
    side: orderSide,
    type: orderType,
    tokenId: selectedTokenId ?? '',
    price: '',
    size: '',
    postOnly: false,
  });

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

  const totalCost = useMemo(() => {
    const price = parseFloat(form.price) / 100; // cents to decimal
    const size = parseFloat(form.size);
    if (isNaN(price) || isNaN(size) || price <= 0 || size <= 0) return 0;
    return price * size;
  }, [form.price, form.size]);

  const isFormValid = useMemo(() => {
    const price = parseFloat(form.price);
    const size = parseFloat(form.size);
    return (
      form.tokenId !== '' &&
      !isNaN(price) &&
      price >= 0 &&
      price <= 100 &&
      !isNaN(size) &&
      size > 0 &&
      !isSubmitting
    );
  }, [form, isSubmitting]);

  const handleSubmit = useCallback(async () => {
    if (!isFormValid || !selectedMarket) return;

    setIsSubmitting(true);

    try {
      const payload = {
        token_id: form.tokenId,
        side: form.side,
        type: form.type,
        price: parseFloat(form.price) / 100,
        size: parseFloat(form.size),
        post_only: form.postOnly,
        market: selectedMarket.conditionId,
      };

      const res = await fetch('/api/polymarket/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? data.message ?? 'Order failed');
      }

      toast({
        title: `${form.side} order placed`,
        description: `${form.side} ${parseFloat(form.size)} shares @ ${parseFloat(form.price).toFixed(1)}¢`,
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
  }, [isFormValid, form, selectedMarket, setShowOrderTicket]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end lg:items-stretch lg:justify-end">
      {/* Backdrop (mobile) */}
      <div
        className="absolute inset-0 bg-black/40 lg:hidden"
        onClick={() => setShowOrderTicket(false)}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm border-l border-zinc-800 bg-zinc-950 flex flex-col shadow-2xl lg:w-[320px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <span className="text-sm font-semibold text-zinc-100">Place Order</span>
          <button
            type="button"
            onClick={() => setShowOrderTicket(false)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
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

          {/* Order type */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Order Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => handleTypeChange(v as OrderType)}
            >
              <SelectTrigger className="w-full border-zinc-800 bg-zinc-900/80 text-zinc-100 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="GTC" className="text-zinc-100 focus:bg-zinc-800 focus:text-zinc-100">
                  Good Till Cancel
                </SelectItem>
                <SelectItem value="GTD" className="text-zinc-100 focus:bg-zinc-800 focus:text-zinc-100">
                  Good Till Date
                </SelectItem>
                <SelectItem value="FOK" className="text-zinc-100 focus:bg-zinc-800 focus:text-zinc-100">
                  Fill or Kill
                </SelectItem>
                <SelectItem value="FAK" className="text-zinc-100 focus:bg-zinc-800 focus:text-zinc-100">
                  Fill and Kill
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Price */}
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
          </div>

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
          </div>

          {/* Post-only */}
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
              Post-only
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3 text-zinc-600" />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="bg-zinc-900 border-zinc-700 text-zinc-300 text-xs max-w-[200px]"
                >
                  Order will only be placed as a maker order. If it would cross the
                  spread, it will be rejected.
                </TooltipContent>
              </Tooltip>
            </label>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Total */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Total Cost</span>
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
              `${form.side} ${form.size || '0'} @ ${form.price || '0.0'}¢`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}