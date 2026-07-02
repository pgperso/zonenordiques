'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'notif_sound_enabled';
// Notification types that warrant an audible cue. Likes / dislikes are
// deliberately excluded — chat tribunes can produce many per minute and
// the sound would become noise instead of signal.
const AUDIBLE_TYPES = new Set([
  'chat_reply',
  'comment_reply',
  'comment_reply_thread',
  'comment_on_article',
  'mention',
]);

function readPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writePref(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* storage unavailable — preference doesn't persist, runtime is enough */
  }
}

/**
 * Short two-tone ping generated with Web Audio so we don't ship an asset.
 * Wrapped in try/catch — autoplay policies may block playback before the
 * user has interacted with the page; silent failure is the desired UX.
 */
function playPing(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    function tone(freq: number, start: number, dur: number) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.15, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    }

    tone(880, 0, 0.12);
    tone(1320, 0.08, 0.18);
    setTimeout(() => { void ctx.close(); }, 400);
  } catch {
    /* audio context unavailable or blocked — silent failure */
  }
}

/**
 * Subscribes to a per-user audible cue for incoming notifications. The
 * preference is stored in localStorage and defaults to off, so visitors
 * never get an unexpected sound on first load.
 *
 * Returns `{ enabled, setEnabled, play }`. The bell calls `play(type)`
 * from its realtime handler; `play` is a no-op when sound is disabled,
 * the type is not audible, or the tab is hidden.
 */
export function useNotificationSound() {
  const [enabled, setEnabledState] = useState<boolean>(false);
  const enabledRef = useRef(false);

  // Initial sync (after mount — localStorage is client-only).
  useEffect(() => {
    const initial = readPref();
    setEnabledState(initial);
    enabledRef.current = initial;
  }, []);

  // Keep the preference in sync across tabs.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        const v = e.newValue === 'true';
        setEnabledState(v);
        enabledRef.current = v;
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    enabledRef.current = next;
    writePref(next);
  }, []);

  const play = useCallback((type: string | undefined) => {
    if (!enabledRef.current) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!type || !AUDIBLE_TYPES.has(type)) return;
    playPing();
  }, []);

  return { enabled, setEnabled, play };
}
