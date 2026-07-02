'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { formatTime, formatDuration } from '@arena/shared';
import type { FeedPodcast } from '@arena/shared';
import { FeedLikeButton } from './FeedLikeButton';
import { FeedLivePlayer } from './FeedLivePlayer';
import { useSupabase } from '@/hooks/useSupabase';
import { removePodcast } from '@/services/podcastService';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';

interface FeedPodcastCardProps {
  podcast: FeedPodcast;
  communitySlug: string;
  userId: string | null;
  canModerate?: boolean;
}

export function FeedPodcastCard({ podcast, communitySlug, userId, canModerate }: FeedPodcastCardProps) {
  const t = useTranslations('tribune');
  const tc = useTranslations('common');
  const supabase = useSupabase();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [removed, setRemoved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const isOwn = !!(userId && podcast.publisher?.id === userId);
  const canRemove = isOwn || !!canModerate;
  const isYouTube = !!podcast.youtubeVideoId;

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
  }

  function handleEnded() {
    setPlaying(false);
    setProgress(0);
  }

  async function handleEndLive() {
    await supabase.from('podcasts').update({ is_live: false }).eq('id', podcast.id);
    window.location.reload();
  }

  async function handleDelete() {
    const { error } = await removePodcast(supabase, podcast.id);
    if (error) {
      return;
    }
    setRemoved(true);
  }

  async function handleRemoveFromFeed() {
    await supabase
      .from('podcasts')
      .update({ is_published: false })
      .eq('id', podcast.id);
    setRemoved(true);
  }

  if (removed) return null;

  // YouTube Live / Replay
  if (isYouTube) {
    return (
      <div className="px-4 py-3">
        <div className="max-w-md overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <FeedLivePlayer videoId={podcast.youtubeVideoId!} isLive={podcast.isLive} />

          <div className="bg-white dark:bg-[#1e1e1e] p-3">
            <div className="mb-1 flex items-center gap-2">
              {podcast.isLive ? (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                  {t('liveNow')}
                </span>
              ) : (
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('replay')}
                </span>
              )}
              <span className="text-xs text-gray-400">{formatTime(podcast.createdAt)}</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">{podcast.title}</h3>
            {podcast.description && (
              <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{podcast.description}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-1 flex items-center gap-1 pl-1">
          {!isOwn && (
            <FeedLikeButton
              targetType="podcast"
              targetId={podcast.id}
              initialLikeCount={podcast.likeCount}
              userId={userId}
            />
          )}
          {isOwn && podcast.likeCount > 0 && (
            <span className="px-2 py-1 text-xs text-gray-300">{podcast.likeCount} ♥</span>
          )}
          {canRemove && (
            <div className="ml-auto flex items-center gap-1">
              {podcast.isLive && (
                <button
                  onClick={handleEndLive}
                  className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-red-700"
                >
                  {t('endLive')}
                </button>
              )}
              {!podcast.isLive && (
                <button
                  onClick={handleRemoveFromFeed}
                  className="rounded-full px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400"
                >
                  {tc('remove')}
                </button>
              )}
              {confirmDelete ? (
                <span className="flex items-center gap-1.5 text-xs">
                  <button onClick={handleDelete} className="font-semibold text-red-500 hover:text-red-700">{tc('delete')}</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400">{tc('cancel')}</button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-full px-2 py-1 text-xs text-gray-400 transition hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-500"
                >
                  {tc('delete')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Audio podcast (existing behavior)
  return (
    <div className="px-4 py-3">
      <div className="max-w-md overflow-hidden rounded-xl bg-gray-950 p-4">
        {podcast.audioUrl && (
          <audio
            ref={audioRef}
            src={podcast.audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            preload="none"
          />
        )}

        <div className="flex gap-3">
          <button
            onClick={togglePlay}
            className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-800"
            aria-label={playing ? 'Mettre en pause' : 'Lire'}
          >
            {podcast.coverImageUrl ? (
              <Image
                src={podcast.coverImageUrl}
                alt={podcast.title}
                width={56}
                height={56}
                className="h-14 w-14 object-cover"
                sizes="56px"
              />
            ) : (
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition hover:bg-black/30">
              {playing ? (
                <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </div>
          </button>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-brand-blue/20 px-2 py-0.5 text-xs font-medium text-brand-blue-light">
                {t('podcast')}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{formatTime(podcast.createdAt)}</span>
              {podcast.durationSeconds && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDuration(podcast.durationSeconds)}
                </span>
              )}
            </div>
            <Link
              href={`/tribunes/${communitySlug}/podcasts/${podcast.id}`}
              className="text-sm font-semibold text-white hover:text-brand-blue-light line-clamp-1"
            >
              {podcast.title}
            </Link>
            {podcast.description && (
              <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{podcast.description}</p>
            )}
          </div>
        </div>

        {podcast.audioUrl && (
          <div
            className="mt-3 h-1.5 cursor-pointer rounded-full bg-gray-700"
            onClick={handleSeek}
          >
            <div
              className="h-full rounded-full bg-brand-blue transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="mt-1 flex items-center gap-1 pl-1">
        {!isOwn && (
          <FeedLikeButton
            targetType="podcast"
            targetId={podcast.id}
            initialLikeCount={podcast.likeCount}
            userId={userId}
          />
        )}
        {isOwn && podcast.likeCount > 0 && (
          <span className="px-2 py-1 text-xs text-gray-300">{podcast.likeCount} ♥</span>
        )}
        {canRemove && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={handleRemoveFromFeed}
              className="rounded-full px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400"
            >
              {tc('remove')}
            </button>
            {confirmDelete ? (
              <span className="flex items-center gap-1.5 text-xs">
                <button onClick={handleDelete} className="font-semibold text-red-500 hover:text-red-700">{tc('delete')}</button>
                <button onClick={() => setConfirmDelete(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400">{tc('cancel')}</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-full px-2 py-1 text-xs text-gray-400 transition hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-500"
              >
                {tc('delete')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
