import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arena/supabase-client';
import { podcastSchema } from '@arena/shared';
import { announcePodcast, announceLive } from './botService';
import { BRAND } from '@/lib/brand';

interface PodcastData {
  communityId: number;
  publishedBy: string;
  title: string;
  description: string | null;
  audioUrl: string | null;
  coverImageUrl: string | null;
  durationSeconds: number | null;
  youtubeVideoId?: string | null;
  isLive?: boolean;
  isPublished?: boolean;
}

export async function createPodcast(
  supabase: SupabaseClient<Database>,
  data: PodcastData,
) {
  const validated = podcastSchema.parse({
    title: data.title,
    audioUrl: data.audioUrl,
    description: data.description,
    coverImageUrl: data.coverImageUrl,
    durationSeconds: data.durationSeconds,
    youtubeVideoId: data.youtubeVideoId,
    isLive: data.isLive,
  });

  const result = await supabase.from('podcasts').insert({
    community_id: data.communityId,
    published_by: data.publishedBy,
    title: validated.title,
    description: validated.description ?? null,
    audio_url: validated.audioUrl ?? '',
    cover_image_url: validated.coverImageUrl ?? null,
    duration_seconds: validated.durationSeconds ?? null,
    is_published: data.isPublished ?? true,
    youtube_video_id: validated.youtubeVideoId ?? null,
    is_live: validated.isLive ?? false,
  });

  // Bot announcements when published (fire-and-forget)
  if (!result.error && data.isPublished !== false) {
    const [{ data: publisher }, { data: community }] = await Promise.all([
      supabase.from('members').select('username').eq('id', data.publishedBy).single(),
      supabase.from('communities').select('name, slug').eq('id', data.communityId).single(),
    ]);
    if (publisher && community) {
      const username = (publisher as { username: string }).username;
      const communityName = (community as { name: string }).name;
      const communitySlug = (community as { slug: string }).slug;
      if (validated.isLive && validated.youtubeVideoId) {
        announceLive(supabase, data.communityId, communityName, validated.title);
      } else {
        const podcastUrl = `${BRAND.url}/fr/tribunes/${communitySlug}/podcasts/${result.data ? (result.data as unknown as { id: number }).id : ''}`;
        announcePodcast(supabase, data.communityId, username, communityName, validated.title, podcastUrl);
      }
    }
  }

  return result;
}

export async function updatePodcast(
  supabase: SupabaseClient<Database>,
  podcastId: number,
  data: Omit<PodcastData, 'communityId' | 'publishedBy'>,
) {
  const validated = podcastSchema.parse({
    title: data.title,
    audioUrl: data.audioUrl,
    description: data.description,
    coverImageUrl: data.coverImageUrl,
    durationSeconds: data.durationSeconds,
    youtubeVideoId: data.youtubeVideoId,
    isLive: data.isLive,
  });

  return supabase.from('podcasts').update({
    title: validated.title,
    description: validated.description ?? null,
    audio_url: validated.audioUrl ?? '',
    cover_image_url: validated.coverImageUrl ?? null,
    duration_seconds: validated.durationSeconds ?? null,
    is_published: data.isPublished ?? true,
    youtube_video_id: validated.youtubeVideoId ?? null,
    is_live: validated.isLive ?? false,
    updated_at: new Date().toISOString(),
  }).eq('id', podcastId);
}

export async function removePodcast(
  supabase: SupabaseClient<Database>,
  podcastId: number,
) {
  const { data: podcast } = await supabase
    .from('podcasts')
    .select('audio_url, cover_image_url')
    .eq('id', podcastId)
    .single();

  const result = await supabase
    .from('podcasts')
    .delete()
    .eq('id', podcastId);

  if (podcast) {
    const audioPath = extractStoragePath(podcast.audio_url, 'podcast-audio');
    const coverPath = extractStoragePath(podcast.cover_image_url, 'article-covers');

    if (audioPath) {
      supabase.storage.from('podcast-audio').remove([audioPath]);
    }
    if (coverPath) {
      supabase.storage.from('article-covers').remove([coverPath]);
    }
  }

  return result;
}

function extractStoragePath(url: string | null, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export async function fetchPodcastsByPublisher(
  supabase: SupabaseClient<Database>,
  publishedBy: string,
  communityId: number,
) {
  return supabase
    .from('podcasts')
    .select('id, title, description, audio_url, cover_image_url, duration_seconds, youtube_video_id, is_live, is_published, created_at, updated_at, like_count, is_removed')
    .eq('published_by', publishedBy)
    .eq('community_id', communityId)
    .or('is_removed.eq.false,is_removed.is.null')
    .order('created_at', { ascending: false })
    .limit(100);
}
