'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Browsers expose the Web Speech API under two names: Chrome / Edge / Safari
// ship `webkitSpeechRecognition`, the unprefixed `SpeechRecognition` only lands
// behind flags in some builds. Firefox has neither — those users see no mic
// button at all (see the `supported` flag).
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceDictationTranscript {
  // Full transcript for the *current* dictation session: every finalized
  // segment so far concatenated with the in-progress interim. The consumer
  // displays this verbatim — no accumulation logic on their side.
  text: string;
}

// Distinct error codes the consumer can map to user-facing copy. We avoid
// surfacing raw DOMException names because they vary across browsers.
export type VoiceDictationError =
  | 'unsupported'
  | 'insecure-context'
  | 'no-device'
  | 'device-busy'
  | 'not-allowed'
  | 'service-unavailable'
  | 'recognition-failed'
  | 'unknown';

interface UseVoiceDictationOptions {
  lang: string;
  onTranscript: (transcript: VoiceDictationTranscript) => void;
}

interface UseVoiceDictationResult {
  supported: boolean;
  listening: boolean;
  error: VoiceDictationError | null;
  start: () => void;
  stop: () => void;
}

export function useVoiceDictation({ lang, onTranscript }: UseVoiceDictationOptions): UseVoiceDictationResult {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<VoiceDictationError | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Running concatenation of all finalized segments since the current
  // start() call. Reset on every start() so a stopped-then-restarted
  // dictation session doesn't carry text over from the previous one.
  const sessionFinalRef = useRef('');

  // Keep the callback in a ref so the recognition instance — which is built
  // once per session — always invokes the latest closure instead of a stale one.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  const start = useCallback(async () => {
    setError(null);

    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('unsupported');
      return;
    }

    // getUserMedia is required to surface the native permission prompt
    // reliably (Chromium occasionally fires `not-allowed` on
    // SpeechRecognition.start() without showing a dialog at all).
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('insecure-context');
      return;
    }

    // Probe permission state for diagnostics only — never use it to bail
    // out. The Permissions API can return a stale or inaccurate state
    // (Chromium has a long-standing pattern where it caches 'denied'
    // even after the user re-grants the permission), so we always trust
    // the result of the actual getUserMedia call below.
    let permissionState: PermissionState | 'unknown' = 'unknown';
    try {
      const perms = (navigator as Navigator & { permissions?: { query: (q: { name: string }) => Promise<PermissionStatus> } }).permissions;
      if (perms?.query) {
        const status = await perms.query({ name: 'microphone' });
        permissionState = status.state;
      }
    } catch {
      // Older Safari throws on { name: 'microphone' } — falls through.
    }

    console.info('[voice-dictation] start', {
      permissionState,
      userAgent: navigator.userAgent,
      isSecureContext: window.isSecureContext,
      lang,
    });

    // Request mic access — this triggers the native prompt when state is
    // 'prompt', resolves immediately when state is 'granted', and rejects
    // with NotAllowedError when truly blocked. We release the captured
    // tracks immediately so the SpeechRecognition engine can open its own
    // internal stream without contention.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      const message = e instanceof Error ? e.message : String(e);
      console.warn('[voice-dictation] getUserMedia failed', { name, message, permissionState });

      if (name === 'NotAllowedError' || name === 'SecurityError') {
        // We can't reliably tell apart "browser denied" from "OS denied"
        // at this layer — the Permissions API lies often enough that
        // dispatching on its state hurts more than it helps. Surface a
        // single message that walks the user through BOTH layers.
        setError('not-allowed');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('no-device');
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        setError('device-busy');
      } else {
        setError('unknown');
      }
      return;
    }

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    sessionFinalRef.current = '';

    recognition.onresult = (event) => {
      // event.results is cumulative across the whole session. event.resultIndex
      // tells us which index changed, so we only process new segments. New
      // final segments get appended to sessionFinalRef; the interim portion
      // is rebuilt fresh each event from the still-in-progress results.
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) sessionFinalRef.current += transcript;
        else interim += transcript;
      }
      onTranscriptRef.current({ text: sessionFinalRef.current + interim });
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      console.warn('[voice-dictation] recognition error', { code: event.error, permissionState });
      if (event.error === 'not-allowed') {
        setError('not-allowed');
      } else if (event.error === 'service-not-allowed' || event.error === 'network') {
        // Distinct from a permission denial — Chrome's speech backend
        // (Google's cloud) is unreachable: network, region, or policy.
        setError('service-unavailable');
      } else if (event.error === 'audio-capture') {
        setError('no-device');
      } else {
        setError('recognition-failed');
      }
      setListening(false);
    };

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      // InvalidStateError fires if start() is called twice in a row.
      setError(e instanceof Error && e.name === 'InvalidStateError' ? 'device-busy' : 'recognition-failed');
      recognitionRef.current = null;
    }
  }, [lang]);

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    // Detach the result handler before issuing stop(): SpeechRecognition can
    // emit one more onresult between stop() and onend, and that trailing
    // event would otherwise reach the consumer after they had cleared the
    // input on send — re-populating it with the just-sent message. Also
    // wipe the session accumulator so a restarted session begins blank.
    r.onresult = null;
    r.onerror = null;
    sessionFinalRef.current = '';
    r.stop();
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return { supported, listening, error, start, stop };
}
