'use client';

import React, { useState, useCallback } from 'react';
import { History, X, ArrowUp, ArrowDown, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTradingStore, type FiveMinuteRound } from '@/stores/trading';

// ─── Helpers ─────────────────────────────────────────────────────────

function formatRoundTime(roundStart: number | null, roundEnd: number | null): string {
  if (!roundStart || !roundEnd) return '—';
  const start = new Date(roundStart * 1000);
  const end = new Date(roundEnd * 1000);
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatRelativeTime(roundEnd: number | null): string {
  if (!roundEnd) return '';
  const diff = Date.now() / 1000 - roundEnd;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Component ───────────────────────────────────────────────────────

export function PreviousRoundsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { selectedMarket, fiveMinuteHistory, fetchFiveMinuteHistory, selectMarket } =
    useTradingStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const asset = selectedMarket?.asset;
  const duration = selectedMarket?.durationMinutes;
  const historyKey = asset && duration ? `${asset}-${duration}` : null;
  const rounds = historyKey ? fiveMinuteHistory[historyKey] ?? [] : [];

  const handleRefresh = useCallback(async () => {
    if (!asset || !duration) return;
    setIsRefreshing(true);
    await fetchFiveMinuteHistory(asset, duration);
    setIsRefreshing(false);
  }, [asset, duration, fetchFiveMinuteHistory]);

  // Count win streaks for quick stats
  const upWins = rounds.filter((r) => r.winner === 'up').length;
  const downWins = rounds.filter((r) => r.winner === 'down').length;
  const unresolved = rounds.filter((r) => !r.winner).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100 p-0 gap-0 max-h-[85vh] flex flex-col">
        <DialogHeader className="px-4 py-3 border-b border-zinc-800 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <History className="size-4 text-zinc-400" />
            <DialogTitle className="text-sm font-semibold">
              Previous Rounds — {asset?.toUpperCase() ?? '—'} {duration ?? '—'}m
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
              <ArrowUp className="size-2.5 mr-0.5" />
              {upWins} UP
            </Badge>
            <Badge variant="outline" className="border-red-500/30 text-red-400 text-[10px]">
              <ArrowDown className="size-2.5 mr-0.5" />
              {downWins} DOWN
            </Badge>
            {unresolved > 0 && (
              <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">
                <Clock className="size-2.5 mr-0.5" />
                {unresolved} resolving
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 px-2"
              onClick={handleRefresh}
              disabled={isRefreshing || !asset || !duration}
            >
              {isRefreshing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <History className="size-3" />
              )}
              Refresh
            </Button>
          </div>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Last {rounds.length} resolved {asset?.toUpperCase()} {duration}m rounds. Click any round to view its full market details.
        </DialogDescription>

        <ScrollArea className="flex-1">
          <div className="px-2 py-2">
            {rounds.length === 0 ? (
              <div className="py-16 text-center text-sm text-zinc-600">
                {asset && duration
                  ? 'No history yet. Click Refresh to load.'
                  : 'Select a 5M market first to view its round history.'}
              </div>
            ) : (
              rounds.map((round, idx) => (
                <RoundRow
                  key={round.id ?? idx}
                  round={round}
                  index={idx}
                  onView={() => {
                    // Build a minimal Market object so the rest of the UI
                    // (header, chart, orderbook) can render the historical
                    // round without a separate fetch. Polling won't try to
                    // update it because the store's startPolling checks
                    // clobTokenIds length, and historical rounds have empty
                    // token arrays from the history endpoint.
                    selectMarket({
                      id: round.id,
                      question: round.question,
                      slug: round.slug,
                      outcomes: ['Up', 'Down'],
                      outcomePrices: round.outcomePrices,
                      volume: '0',
                      volume24hr: '0',
                      liquidity: '0',
                      liquidityNum: 0,
                      volumeNum: 0,
                      active: false,
                      closed: round.closed,
                      archived: false,
                      acceptingOrders: false,
                      acceptingOrderVolume: '',
                      endDate: round.endDate,
                      startDate: '',
                      image: '',
                      category: 'crypto',
                      tags: [],
                      groupItemTitle: null,
                      groupId: null,
                      clobTokenIds: [],
                      conditionId: '',
                      description: '',
                      asset: asset ?? null,
                      durationMinutes: duration ?? null,
                      roundStart: round.roundStart,
                      roundEnd: round.roundEnd,
                    });
                    onOpenChange(false);
                  }}
                />
              ))
            )}
          </div>
        </ScrollArea>

        <div className="px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-600 flex items-center justify-between">
          <span>
            Showing {rounds.length} most recent rounds
          </span>
          <span>
            {asset?.toUpperCase()}/{duration}m · auto-updated on round transitions
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────

function RoundRow({
  round,
  index,
  onView,
}: {
  round: FiveMinuteRound;
  index: number;
  onView: () => void;
}) {
  const isUp = round.winner === 'up';
  const isDown = round.winner === 'down';
  const isUnresolved = !round.winner;

  return (
    <button
      type="button"
      onClick={onView}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-zinc-800/40 transition-colors text-left group"
    >
      {/* Index / arrow */}
      <div
        className={`flex items-center justify-center size-7 rounded-md font-bold text-xs shrink-0 ${
          isUp
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
            : isDown
              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
              : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
        }`}
      >
        {isUp ? (
          <ArrowUp className="size-3.5" />
        ) : isDown ? (
          <ArrowDown className="size-3.5" />
        ) : (
          <Clock className="size-3.5" />
        )}
      </div>

      {/* Question */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-200 truncate">
          {round.question}
        </div>
        <div className="text-[10px] text-zinc-600 flex items-center gap-2">
          <span className="font-mono">{formatRoundTime(round.roundStart, round.roundEnd)}</span>
          <span>·</span>
          <span>{formatRelativeTime(round.roundEnd)}</span>
        </div>
      </div>

      {/* Outcome */}
      <div className="shrink-0 text-right">
        <div
          className={`text-xs font-bold ${
            isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-amber-400'
          }`}
        >
          {isUp ? 'UP' : isDown ? 'DOWN' : 'RESOLVING'}
        </div>
        <div className="text-[10px] text-zinc-600 font-mono">
          {round.outcomePrices[0] && round.outcomePrices[1]
            ? `${(parseFloat(round.outcomePrices[0]) * 100).toFixed(0)}¢ / ${(parseFloat(round.outcomePrices[1]) * 100).toFixed(0)}¢`
            : '—'}
        </div>
      </div>

      {/* View hint on hover */}
      <div className="shrink-0 text-[10px] text-zinc-700 group-hover:text-zinc-400 transition-colors">
        View →
      </div>
    </button>
  );
}
