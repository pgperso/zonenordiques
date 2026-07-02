'use client';

import { useState, useCallback, useRef } from 'react';
import { useSupabase } from './useSupabase';

const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm'];
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

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

export function useAudioUpload(): UseAudioUploadReturn {
  const supabase = useSupabase();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Format non supporté. Utilisez MP3, M4A, OGG ou WebM.';
    }
    if (file.size > MAX_SIZE) {
      return 'Le fichier ne doit pas dépasser 25 Mo.';
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

    const extMap: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
    };
    const ext = extMap[file.type] ?? 'mp3';
    const path = `podcast-audio/${communityId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('podcast-audio')
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return null;
    }

    setProgress(90);
    const { data: urlData } = supabase.storage.from('podcast-audio').getPublicUrl(path);

    setProgress(100);
    setUploading(false);

    return { url: urlData.publicUrl, durationSeconds };
  }, [supabase, validateFile]);

  return { uploading, progress, error, upload, validateFile };
}
