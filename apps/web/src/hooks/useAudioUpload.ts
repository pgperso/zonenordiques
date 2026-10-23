'use client';

import { useState, useCallback } from 'react';

const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm'];
const MAX_SIZE = 100 * 1024 * 1024; // 100 MB — matches PODCAST_AUDIO_MAX_BYTES in lib/mediaStorage

interface UseAudioUploadReturn {
  uploading: boolean;
  progress: number;
  error: string | null;
  upload: (file: File, communityId: number) => Promise<{ url: string; durationSeconds: number | null } | null>;
  validateFile: (file: File) => string | null;
}

function detectDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.preload = 'metadata';

    audio.onloadedmetadata = () => {
      const duration = isFinite(audio.duration) ? Math.round(audio.duration) : null;
      URL.revokeObjectURL(url);
      resolve(duration);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    audio.src = url;
  });
}

/**
 * POST the raw file to /api/podcasts/audio (stored on the VPS, see
 * lib/mediaStorage). XHR rather than fetch: it is the only browser API that
 * reports upload progress, which matters for files up to 100 MB.
 */
function sendAudio(
  file: File,
  communityId: number,
  onProgress: (fraction: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/podcasts/audio?communityId=${communityId}`);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { url?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page (e.g. a proxy limit) — fall through to the status
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url) resolve(body.url);
      else reject(new Error(body.error ?? `Échec de l'envoi (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Échec de l'envoi : connexion interrompue"));
    xhr.send(file);
  });
}

export function useAudioUpload(): UseAudioUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Format non supporté. Utilisez MP3, M4A, OGG ou WebM.';
    }
    if (file.size > MAX_SIZE) {
      return 'Le fichier ne doit pas dépasser 100 Mo.';
    }
    return null;
  }, []);

  const upload = useCallback(async (file: File, communityId: number) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return null;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    const durationSeconds = await detectDuration(file);
    setProgress(10);

    try {
      const url = await sendAudio(file, communityId, (f) => setProgress(10 + Math.round(f * 85)));
      setProgress(100);
      return { url, durationSeconds };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi");
      return null;
    } finally {
      setUploading(false);
    }
  }, [validateFile]);

  return { uploading, progress, error, upload, validateFile };
}
