'use client';

import { useEffect } from 'react';
import { useTradingStore } from '@/stores/trading';

/**
 * Global keyboard shortcuts for the trading terminal.
 *
 * Mount this once near the top of the page. Shortcuts:
 *   1, 2, 3, 4    — switch tabs (5M / BTC / Crypto / Hot)
 *   B             — open order ticket as BUY
 *   S             — open order ticket as SELL
 *   Esc           — close order ticket
 *   /             — focus the search input
 *   R             — refresh markets
 *   P             — toggle proxy panel
 *   H             — open Previous Rounds dialog (when a 5M market is selected)
 *
 * Modifiers (Cmd/Ctrl/Alt) are intentionally ignored — shortcuts only fire
 * on bare key presses so they don't conflict with browser shortcuts or text
 * input. We bail out if the active element is an input/textarea/select.
 */
export function KeyboardShortcuts() {
  const {
    setMarketCategory,
    setOrderSide,
    setShowOrderTicket,
    marketCategory,
  } = useTradingStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if any modifier is held — let browser/OS shortcuts win
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Ignore if the user is typing in an input/textarea/select/contenteditable
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (target?.isContentEditable) return;

      switch (e.key) {
        case '1':
          setMarketCategory('5m');
          break;
        case '2':
          setMarketCategory('btc');
          break;
        case '3':
          setMarketCategory('crypto');
          break;
        case '4':
          setMarketCategory('popular');
          break;
        case 'b':
        case 'B':
          setOrderSide('BUY');
          setShowOrderTicket(true);
          break;
        case 's':
        case 'S':
          setOrderSide('SELL');
          setShowOrderTicket(true);
          break;
        case 'Escape':
          // OrderTicket itself handles closing on Esc via the dialog,
          // but this catches the case where focus is elsewhere.
          setShowOrderTicket(false);
          break;
        case '/':
          e.preventDefault();
          document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus();
          break;
        case 'r':
        case 'R':
          // The Refresh button is in the top bar — dispatch a click
          document.querySelector<HTMLButtonElement>('button[title="Reload Markets"]')?.click();
          break;
        case 'p':
        case 'P':
          // The Proxies button has the Shield icon — find by its tooltip
          document.querySelector<HTMLButtonElement>('button[title="Proxy Management"]')?.click();
          break;
        case 'h':
        case 'H':
          // Previous Rounds — find the button by its text content
          document
            .querySelectorAll<HTMLButtonElement>('button')
            .forEach((btn) => {
              if (btn.textContent?.includes('Previous Rounds')) btn.click();
            });
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setMarketCategory, setOrderSide, setShowOrderTicket, marketCategory]);

  return null;
}
