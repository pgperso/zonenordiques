'use client';

import { useState, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import imageCompression from 'browser-image-compression';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

interface UseCoverUploadReturn {
  coverPreview: string | null;
  coverFile: File | null;
  coverPositionY: number;
  setCoverPositionY: (y: number) => void;
  handleCoverChange: (e: React.ChangeEvent<HTMLInputElement>) => string | null;
  removeCover: () => void;
  uploadCover: () => Promise<string | null>;
}

export function useCoverUpload(
  supabase: SupabaseClient,
  communityId: number,
  existingUrl: string | null = null,
  suffix = '',
  initialPositionY = 50,
): UseCoverUploadReturn {
  const [coverPreview, setCoverPreview] = useState<string | null>(existingUrl);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPositionY, setCoverPositionY] = useState(initialPositionY);

  const handleCoverChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): string | null => {
    const file = e.target.files?.[0];
    if (!file) return null;

    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Type de fichier non supporté. Utilisez JPG, PNG, WebP ou GIF.';
    }
    if (file.size > MAX_SIZE) {
      return "L'image ne doit pas dépasser 5 Mo.";
    }

    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    return null;
  }, []);

  const uploadCover = useCallback(async (): Promise<string | null> => {
    if (!coverFile) return coverPreview;

    const compressed = await imageCompression(coverFile, {
      maxSizeMB: 1.0,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      fileType: 'image/webp',
    });

    const path = `article-covers/${communityId}/${Date.now()}${suffix}.webp`;

    const { error } = await supabase.storage
      .from('article-covers')
      .upload(path, compressed, { contentType: 'image/webp', cacheControl: '31536000' });

    if (error) return coverPreview;

    const { data: urlData } = supabase.storage.from('article-covers').getPublicUrl(path);
    return urlData.publicUrl;
  }, [coverFile, coverPreview, communityId, suffix, supabase]);

  const removeCover = useCallback(() => {
    setCoverPreview(null);
    setCoverFile(null);
  }, []);

  return { coverPreview, coverFile, coverPositionY, setCoverPositionY, handleCoverChange, removeCover, uploadCover };
}
