'use client';

import React, { useState, useCallback } from 'react';
import { Settings, RotateCcw, Save, Zap, Clock, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useTradingStore,
  DEFAULT_POLLING_SETTINGS,
  type PollingSettings,
} from '@/stores/trading';

// ─── Presets ─────────────────────────────────────────────────────────

const PRESETS: Array<{
  name: string;
  description: string;
  settings: PollingSettings;
  badge?: string;
}> = [
  {
    name: 'Ultra-Fast',
    description: '250ms on 5M markets. Most aggressive — ~4 API calls/sec per token.',
    settings: { fastMarketMs: 250, normalMarketMs: 2000, fiveMinuteRefreshMs: 5000 },
    badge: 'Aggressive',
  },
  {
    name: 'Fast (default)',
    description: '500ms on 5M markets. The sweet spot for real-time trading.',
    settings: { ...DEFAULT_POLLING_SETTINGS },
    badge: 'Recommended',
  },
  {
    name: 'Balanced',
    description: '1s on 5M markets. Less API load, still feels live.',
    settings: { fastMarketMs: 1000, normalMarketMs: 3000, fiveMinuteRefreshMs: 10000 },
  },
  {
    name: 'Gentle',
    description: '2s on 5M markets. Use if you hit rate limits or want to save bandwidth.',
    settings: { fastMarketMs: 2000, normalMarketMs: 5000, fiveMinuteRefreshMs: 20000 },
  },
];

// ─── Component ───────────────────────────────────────────────────────

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pollingSettings, setPollingSettings } = useTradingStore();
  const [draft, setDraft] = useState<PollingSettings>(pollingSettings);

  // Reset draft to current settings whenever the dialog opens
  React.useEffect(() => {
    if (open) setDraft(pollingSettings);
  }, [open, pollingSettings]);

  const handleSave = useCallback(() => {
    // Clamp to sane min/max
    const clamped: PollingSettings = {
      fastMarketMs: Math.max(100, Math.min(10000, draft.fastMarketMs)),
      normalMarketMs: Math.max(500, Math.min(30000, draft.normalMarketMs)),
      fiveMinuteRefreshMs: Math.max(2000, Math.min(60000, draft.fiveMinuteRefreshMs)),
    };
    setPollingSettings(clamped);
    onOpenChange(false);
  }, [draft, setPollingSettings, onOpenChange]);

  const handleReset = useCallback(() => {
    setDraft({ ...DEFAULT_POLLING_SETTINGS });
  }, []);

  const applyPreset = useCallback((settings: PollingSettings) => {
    setDraft({ ...settings });
  }, []);

  const isDirty =
    draft.fastMarketMs !== pollingSettings.fastMarketMs ||
    draft.normalMarketMs !== pollingSettings.normalMarketMs ||
    draft.fiveMinuteRefreshMs !== pollingSettings.fiveMinuteRefreshMs;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800 text-zinc-100 p-0 gap-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="px-4 py-3 border-b border-zinc-800 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Settings className="size-4 text-zinc-400" />
            <DialogTitle className="text-sm font-semibold">Settings</DialogTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleReset}
            title="Reset to defaults"
          >
            <RotateCcw className="size-3" />
            Reset
          </Button>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Configure polling intervals for market data updates. Faster intervals give more
          real-time data but use more API calls.
        </DialogDescription>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {/* Presets */}
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400 uppercase tracking-wider">Presets</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => {
                const isActive =
                  draft.fastMarketMs === preset.settings.fastMarketMs &&
                  draft.normalMarketMs === preset.settings.normalMarketMs &&
                  draft.fiveMinuteRefreshMs === preset.settings.fiveMinuteRefreshMs;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset.settings)}
                    className={`text-left p-2.5 rounded-md border transition-colors ${
                      isActive
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold text-zinc-200">{preset.name}</span>
                      {preset.badge && (
                        <Badge
                          variant="outline"
                          className={`text-[8px] px-1 py-0 ${
                            preset.badge === 'Recommended'
                              ? 'border-emerald-500/40 text-emerald-400'
                              : 'border-amber-500/40 text-amber-400'
                          }`}
                        >
                          {preset.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-tight">{preset.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Custom intervals */}
          <div className="space-y-3">
            <Label className="text-xs text-zinc-400 uppercase tracking-wider">Custom Intervals</Label>

            {/* Fast market (5M) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-300 flex items-center gap-1.5">
                  <Zap className="size-3 text-emerald-400" />
                  5M / 15M markets
                </Label>
                <span className="text-[10px] text-zinc-600">
                  {draft.fastMarketMs < 500
                    ? 'Very aggressive'
                    : draft.fastMarketMs <= 1000
                      ? 'Real-time'
                      : 'Relaxed'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="100"
                  max="10000"
                  step="50"
                  value={draft.fastMarketMs}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, fastMarketMs: parseInt(e.target.value) || 500 }))
                  }
                  className="border-zinc-800 bg-zinc-900/80 text-zinc-100 font-mono text-sm w-24"
                />
                <span className="text-xs text-zinc-500">ms</span>
                <span className="text-[10px] text-zinc-600 ml-auto">
                  ≈ {(1000 / draft.fastMarketMs).toFixed(1)} updates/sec
                </span>
              </div>
              <p className="text-[10px] text-zinc-600">
                Polling cadence for 5M/15M "Up or Down" markets. Lower = more real-time but more API calls.
              </p>
            </div>

            {/* Normal market */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-300 flex items-center gap-1.5">
                  <Clock className="size-3 text-blue-400" />
                  Other markets (BTC daily, Crypto, Hot)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="500"
                  max="30000"
                  step="500"
                  value={draft.normalMarketMs}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, normalMarketMs: parseInt(e.target.value) || 3000 }))
                  }
                  className="border-zinc-800 bg-zinc-900/80 text-zinc-100 font-mono text-sm w-24"
                />
                <span className="text-xs text-zinc-500">ms</span>
              </div>
              <p className="text-[10px] text-zinc-600">
                Polling cadence for non-5M markets. These resolve slower so 3s is plenty.
              </p>
            </div>

            {/* 5M list refresh */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-300 flex items-center gap-1.5">
                  <Gauge className="size-3 text-amber-400" />
                  5M round-transition scan
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="2000"
                  max="60000"
                  step="1000"
                  value={draft.fiveMinuteRefreshMs}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      fiveMinuteRefreshMs: parseInt(e.target.value) || 10000,
                    }))
                  }
                  className="border-zinc-800 bg-zinc-900/80 text-zinc-100 font-mono text-sm w-24"
                />
                <span className="text-xs text-zinc-500">ms</span>
              </div>
              <p className="text-[10px] text-zinc-600">
                How often to scan for new 5M rounds. Lower = catches new rounds faster but more API calls.
              </p>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Live preview */}
          <div className="rounded-md bg-zinc-900/60 border border-zinc-800 p-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
              Current Settings
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] text-zinc-600">5M poll</div>
                <div className="text-sm font-mono font-bold text-emerald-400">
                  {pollingSettings.fastMarketMs}ms
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-600">Other poll</div>
                <div className="text-sm font-mono font-bold text-blue-400">
                  {pollingSettings.normalMarketMs}ms
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-600">5M scan</div>
                <div className="text-sm font-mono font-bold text-amber-400">
                  {pollingSettings.fiveMinuteRefreshMs}ms
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t border-zinc-800 flex-row justify-between items-center">
          <span className="text-[10px] text-zinc-600">
            {isDirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSave}
              disabled={!isDirty}
            >
              <Save className="size-3.5" />
              Save & Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
