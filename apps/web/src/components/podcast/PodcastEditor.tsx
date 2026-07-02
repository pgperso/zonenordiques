'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSupabase } from '@/hooks/useSupabase';
import { useAudioUpload } from '@/hooks/useAudioUpload';
import { useCoverUpload } from '@/hooks/useCoverUpload';
import { createPodcast, updatePodcast } from '@/services/podcastService';

interface ExistingPodcast {
  id: number;
  title: string;
  description: string | null;
  audio_url: string | null;
  cover_image_url: string | null;
  duration_seconds: number | null;
  is_published: boolean;
  youtube_video_id?: string | null;
  is_live?: boolean;
}

type PodcastMode = 'audio' | 'youtube';

interface PodcastEditorProps {
  communityId: number;
  userId: string;
  existingPodcast?: ExistingPodcast;
  onSaved: () => void;
  onCancel: () => void;
}

export function PodcastEditor({
  communityId,
  userId,
  existingPodcast,
  onSaved,
  onCancel,
}: PodcastEditorProps) {
  const isEditMode = !!existingPodcast;
  const supabase = useSupabase();
  const t = useTranslations('editor');
  const tc = useTranslations('common');
  const { uploading, progress, error: uploadError, upload, validateFile } = useAudioUpload();

  const initialMode: PodcastMode = existingPodcast?.youtube_video_id ? 'youtube' : 'audio';

  const [mode, setMode] = useState<PodcastMode>(initialMode);
  const [title, setTitle] = useState(existingPodcast?.title ?? '');
  const [description, setDescription] = useState(existingPodcast?.description ?? '');
  const [audioUrl, setAudioUrl] = useState(existingPodcast?.audio_url ?? '');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(existingPodcast?.duration_seconds ?? null);
  const [youtubeVideoId, setYoutubeVideoId] = useState(existingPodcast?.youtube_video_id ?? '');
  const [isLive, setIsLive] = useState(existingPodcast?.is_live ?? false);
  const { coverPreview, handleCoverChange: onCoverChange, removeCover, uploadCover } = useCoverUpload(
    supabase, communityId, existingPodcast?.cover_image_url ?? null, '-pod',
  );
  const [useExternalUrl, setUseExternalUrl] = useState(isEditMode && !!existingPodcast?.audio_url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAudioFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationErr = validateFile(file);
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setAudioFile(file);
    setAudioUrl('');
    setError(null);
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const err = onCoverChange(e);
    if (err) setError(err);
  }

  /** Extract YouTube video ID from URL or raw ID */
  function parseYoutubeId(input: string): string {
    const trimmed = input.trim();
    // Already a bare ID (11 chars, alphanumeric + dash/underscore)
    if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
    // Full URL patterns
    const match = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return match?.[1] ?? trimmed;
  }

  const handleSave = useCallback(async (publish: boolean) => {
    if (!title.trim()) {
      setError(t('titleRequired'));
      return;
    }

    if (mode === 'youtube') {
      const vid = parseYoutubeId(youtubeVideoId);
      if (!vid) {
        setError(t('youtubeRequired'));
        return;
      }
      setSaving(true);
      setError(null);
      const coverImageUrl = await uploadCover();

      const data = {
        communityId,
        publishedBy: userId,
        title: title.trim(),
        description: description.trim() || null,
        audioUrl: null,
        coverImageUrl,
        durationSeconds: null,
        youtubeVideoId: vid,
        isLive,
        isPublished: publish,
      };

      const { error: err } = isEditMode
        ? await updatePodcast(supabase, existingPodcast.id, data)
        : await createPodcast(supabase, data);

      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      onSaved();
      return;
    }

    // Audio mode
    setSaving(true);
    setError(null);

    let finalAudioUrl = audioUrl;
    let finalDuration = durationSeconds;
    if (audioFile) {
      const result = await upload(audioFile, communityId);
      if (!result) {
        setSaving(false);
        return;
      }
      finalAudioUrl = result.url;
      finalDuration = result.durationSeconds;
    }

    if (!finalAudioUrl) {
      setError(t('audioRequired'));
      setSaving(false);
      return;
    }

    const coverImageUrl = await uploadCover();

    const data = {
      communityId,
      publishedBy: userId,
      title: title.trim(),
      description: description.trim() || null,
      audioUrl: finalAudioUrl,
      coverImageUrl,
      durationSeconds: finalDuration,
      youtubeVideoId: null,
      isLive: false,
      isPublished: publish,
    };

    const { error: err } = isEditMode
      ? await updatePodcast(supabase, existingPodcast.id, data)
      : await createPodcast(supabase, data);

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
  }, [title, description, mode, audioUrl, audioFile, durationSeconds, youtubeVideoId, isLive, uploadCover, communityId, userId, supabase, upload, isEditMode, existingPodcast, onSaved, t]);

  const isBusy = saving || uploading;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {isEditMode ? t('editPodcast') : t('newPodcast')}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e]"
          >
            {tc('cancel')}
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={isBusy}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e] disabled:opacity-50"
          >
            {tc('draft')}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={isBusy}
            className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
          >
            {isBusy ? tc('saving') : isEditMode ? t('update') : tc('publish')}
          </button>
        </div>
      </div>

      {(error || uploadError) && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || uploadError}
        </div>
      )}

      {/* Mode toggle: Audio vs YouTube */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('type')}</label>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('audio')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              mode === 'audio' ? 'bg-brand-blue text-white' : 'bg-gray-100 dark:bg-[#1e1e1e] text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            {t('typePodcast')}
          </button>
          <button
            onClick={() => setMode('youtube')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              mode === 'youtube' ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e1e] text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            {t('typeYoutube')}
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('title')}</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={mode === 'youtube' ? t('liveTitlePlaceholder') : t('titlePlaceholder')}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-brand-blue focus:ring-1 focus:ring-brand-blue focus:outline-none"
          maxLength={500}
        />
      </div>

      {/* Description */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('description')}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('descriptionPlaceholder')}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-brand-blue focus:ring-1 focus:ring-brand-blue focus:outline-none"
          rows={3}
          maxLength={5000}
        />
      </div>

      {/* YouTube mode */}
      {mode === 'youtube' && (
        <div className="mb-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('youtubeUrl')}</label>
            <input
              type="text"
              value={youtubeVideoId}
              onChange={(e) => setYoutubeVideoId(e.target.value)}
              placeholder={t('youtubeUrlPlaceholder')}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-brand-blue focus:ring-1 focus:ring-brand-blue focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">
              {t('youtubeHelp')} ({t('youtubeExampleId')})
            </p>
          </div>

          {/* Live toggle */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isLive}
              onChange={(e) => setIsLive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('isLive')}</span>
              <p className="text-xs text-gray-400">{t('isLiveHelp')}</p>
            </div>
          </label>

          {/* Preview */}
          {youtubeVideoId && (
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute inset-0 h-full w-full"
                  src={`https://www.youtube.com/embed/${parseYoutubeId(youtubeVideoId)}?rel=0`}
                  title={t('preview')}
                  allow="encrypted-media"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audio mode */}
      {mode === 'audio' && (
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('audioSource')}</label>
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setUseExternalUrl(false)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                !useExternalUrl ? 'bg-brand-blue text-white' : 'bg-gray-100 dark:bg-[#1e1e1e] text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {t('audioFile')}
            </button>
            <button
              onClick={() => setUseExternalUrl(true)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                useExternalUrl ? 'bg-brand-blue text-white' : 'bg-gray-100 dark:bg-[#1e1e1e] text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {t('externalUrl')}
            </button>
          </div>

          {useExternalUrl ? (
            <input
              type="url"
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://example.com/podcast.mp3"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-brand-blue focus:ring-1 focus:ring-brand-blue focus:outline-none"
            />
          ) : (
            <div>
              {audioFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <svg className="h-5 w-5 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">{audioFile.name}</span>
                  <button
                    onClick={() => setAudioFile(null)}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400"
                  >
                    {t('change')}
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 px-4 py-6 transition hover:border-gray-400">
                  <div className="text-center text-sm text-gray-400">
                    <svg className="mx-auto mb-1 h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                    </svg>
                    {t('selectAudio')}
                  </div>
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp4,audio/ogg,audio/webm"
                    className="hidden"
                    onChange={handleAudioFileChange}
                  />
                </label>
              )}
              {uploading && (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-brand-blue transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{t('uploadProgress', { progress })}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cover image */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('coverImage')}</label>
        {coverPreview ? (
          <div className="relative">
            <img src={coverPreview} alt={t('coverAlt')} className="h-36 w-full rounded-lg object-cover" />
            <button
              onClick={removeCover}
              className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <label className="flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 transition hover:border-gray-400">
            <div className="text-center text-xs text-gray-400">
              <svg className="mx-auto mb-1 h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
              {t('addCover')}
            </div>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleCoverChange} />
          </label>
        )}
      </div>
    </div>
  );
}
