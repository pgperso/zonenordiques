'use client';

import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm'];
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB — matches the bucket file_size_limit
const EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

/** Read the clip duration client-side (best-effort; null if unreadable). */
function detectDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const d = isFinite(audio.duration) ? Math.round(audio.duration) : null;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

export interface ChatAudioUpload {
  uploading: boolean;
  error: string | null;
  validate: (file: File) => string | null;
  upload: (file: File, communityId: number, memberId: string) => Promise<{ url: string; durationSeconds: number | null } | null>;
}

/**
 * Uploads a chat audio attachment to the public `chat-audio` bucket under
 * {communityId}/{memberId}/{timestamp}.{ext} (matches the bucket's own-file
 * delete policy in migration 00092).
 */
export function useChatAudioUpload(): ChatAudioUpload {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) return 'Format audio non supporté (MP3, M4A, AAC, OGG ou WebM).';
    if (file.size > MAX_SIZE) return 'Le fichier audio ne doit pas dépasser 25 Mo.';
    return null;
  }, []);

  const upload = useCallback(
    async (file: File, communityId: number, memberId: string) => {
      const validationError = validate(file);
      if (validationError) {
        setError(validationError);
        return null;
      }
      setUploading(true);
      setError(null);
      try {
        const durationSeconds = await detectDuration(file);
        const ext = EXT[file.type] ?? 'mp3';
        const path = `${communityId}/${memberId}/${Date.now()}.${ext}`;
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from('chat-audio')
          .upload(path, file, { contentType: file.type });
        if (uploadError) {
          setError(uploadError.message);
          return null;
        }
        const { data } = supabase.storage.from('chat-audio').getPublicUrl(path);
        return { url: data.publicUrl, durationSeconds };
      } finally {
        setUploading(false);
      }
    },
    [validate],
  );

  return { uploading, error, validate, upload };
}
