'use client';

import { useEffect, useRef } from 'react';

/**
 * Accessibility wiring for a modal dialog: moves focus into the dialog on
 * open, keeps Tab / Shift+Tab cycling within it, and restores focus to the
 * triggering element on close. Escape handling is left to the caller — some
 * modals want Escape to step back a level before closing.
 *
 * Attach the returned ref to the dialog container and give it
 * role="dialog" aria-modal="true".
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>() {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    function focusables(): HTMLElement[] {
      if (!container) return [];
      return Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
    }

    // Move focus inside the dialog so keyboard / screen-reader users land
    // there rather than behind it.
    focusables()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  return containerRef;
}
