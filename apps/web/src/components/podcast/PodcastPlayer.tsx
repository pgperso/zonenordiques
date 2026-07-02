'use client';

import { useState, useRef, useEffect } from 'react';
import { formatDuration } from '@arena/shared';
import { FeedLikeButton } from '@/components/feed/FeedLikeButton';
import { AdSlot } from '@/components/ads/AdSlot';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { BRAND } from '@/lib/brand';

interface PodcastPlayerProps {
  podcast: {
    id: number;
    title: string;
    description: string | null;
    audio_url: string;
    cover_image_url: string | null;
    duration_seconds: number | null;
    like_count: number;
    created_at: string;
    publisher: {
      username: string;
      avatar_url: string | null;
    } | null;
  };
  communitySlug: string;
  userId: string | null;
}

export function PodcastPlayer({ podcast, communitySlug, userId }: PodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(podcast.duration_seconds ?? 0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);

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
    if (!audio) return;
    setCurrentTime(audio.currentTime);
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  function cyclePlaybackRate() {
    const rates = [1, 1.25, 1.5, 1.75, 2, 0.75];
    const currentIdx = rates.indexOf(playbackRate);
    const next = rates[(currentIdx + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  function skip(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  }

  function handleEnded() {
    setPlaying(false);
    setCurrentTime(0);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <audio
        ref={audioRef}
        src={podcast.audio_url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* Back link */}
      <Link
        href={`/tribunes/${communitySlug}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 dark:text-gray-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Retour au feed
      </Link>

      {/* Cover & info */}
      <div className="mb-6 flex flex-col items-center">
        <div className="relative mb-4 h-48 w-48 overflow-hidden rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 shadow-lg">
          {podcast.cover_image_url ? (
            <Image src={podcast.cover_image_url} alt={podcast.title} fill className="object-cover" sizes="192px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg className="h-16 w-16 text-orange-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            </div>
          )}
        </div>
        <h1 className="mb-1 text-center text-xl font-bold text-gray-900 dark:text-gray-100">{podcast.title}</h1>
        {podcast.publisher && (
          <p className="text-sm text-gray-500 dark:text-gray-400">par {podcast.publisher.username}</p>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div
          className="h-2 cursor-pointer rounded-full bg-gray-200"
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full bg-orange-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>{formatDuration(Math.floor(currentTime))}</span>
          <span>{formatDuration(Math.floor(duration))}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-6 flex items-center justify-center gap-4">
        {/* Skip back 15s */}
        <button
          onClick={() => skip(-15)}
          className="rounded-full p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-700 dark:hover:text-gray-300 dark:text-gray-300"
          title="-15s"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition hover:bg-orange-600"
        >
          {playing ? (
            <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="h-7 w-7 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Skip forward 30s */}
        <button
          onClick={() => skip(30)}
          className="rounded-full p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-700 dark:hover:text-gray-300 dark:text-gray-300"
          title="+30s"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
          </svg>
        </button>
      </div>

      {/* Secondary controls */}
      <div className="mb-6 flex items-center justify-center gap-6">
        {/* Playback rate */}
        <button
          onClick={cyclePlaybackRate}
          className="rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e]"
        >
          {playbackRate}x
        </button>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolumeChange}
            className="h-1 w-20 cursor-pointer accent-orange-500"
          />
        </div>
      </div>

      {/* Description */}
      {podcast.description && (
        <div className="mb-6 rounded-xl bg-gray-50 dark:bg-[#1e1e1e] p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Description</h3>
          <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{podcast.description}</p>
        </div>
      )}

      {/* Ad */}
      <div className="mb-6 flex justify-center">
        <AdSlot slotId="podcast-below-description" format="rectangle" />
      </div>

      {/* Like + Share */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <FeedLikeButton
          targetType="podcast"
          targetId={podcast.id}
          initialLikeCount={podcast.like_count}
          userId={userId}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Partager</span>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${BRAND.url}/fr/tribunes/${communitySlug}/podcasts/${podcast.id}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600"
            title="Facebook"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          </a>
          <a
            href={`https://x.com/intent/tweet?url=${encodeURIComponent(`${BRAND.url}/fr/tribunes/${communitySlug}/podcasts/${podcast.id}`)}&text=${encodeURIComponent(podcast.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-900 dark:text-gray-100"
            title="X"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
