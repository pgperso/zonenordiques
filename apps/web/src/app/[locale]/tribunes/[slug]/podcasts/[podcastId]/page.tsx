import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { setRequestLocale } from 'next-intl/server';
import { displayCommunityName } from '@arena/shared';
import { PodcastPlayer } from '@/components/podcast/PodcastPlayer';
import { BRAND } from '@/lib/brand';
import { translatedField } from '@/lib/contentTranslation';

export const revalidate = 300;

interface PodcastPageProps {
  params: Promise<{ locale: string; slug: string; podcastId: string }>;
}

export async function generateMetadata({ params }: PodcastPageProps) {
  const { locale, podcastId, slug } = await params;
  const id = parseInt(podcastId, 10);
  if (isNaN(id)) return { title: 'Podcast introuvable' };

  const supabase = await createClient();

  const { data: podcast } = await supabase
    .from('podcasts')
    .select('title, description, audio_url, cover_image_url, source_lang, title_translated, description_translated')
    .eq('id', id)
    .eq('is_published', true)
    .single();

  if (!podcast) return { title: 'Podcast introuvable' };

  const praw = podcast as unknown as {
    title: string; description: string | null; audio_url: string; cover_image_url: string | null;
    source_lang: string | null; title_translated: string | null; description_translated: string | null;
  };
  const title = translatedField(praw.source_lang, locale, praw.title, praw.title_translated);
  const description = translatedField(praw.source_lang, locale, praw.description, praw.description_translated);
  const audio_url = praw.audio_url;
  const cover_image_url = praw.cover_image_url;
  const desc = description ?? `${title} — Podcast sportif sur ${BRAND.name}. Écoutez maintenant !`;
  const url = `${BRAND.url}/${locale}/tribunes/${slug}/podcasts/${podcastId}`;

  return {
    title: `${title} | ${BRAND.name}`,
    description: desc,
    keywords: [title, 'podcast sportif', BRAND.name, 'hockey', 'sports', 'audio'],
    openGraph: {
      title: `${title} | ${BRAND.name}`,
      description: desc,
      type: 'music.song',
      audio: audio_url,
      url,
      siteName: BRAND.name,
      locale: locale === 'fr' ? 'fr_CA' : 'en_CA',
      images: cover_image_url
        ? [{ url: cover_image_url, alt: title, width: 1200, height: 630 }]
        : [{ url: BRAND.logoUrl, alt: BRAND.name, width: BRAND.logoWidth, height: BRAND.logoHeight }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${BRAND.name}`,
      description: desc,
      images: cover_image_url ? [cover_image_url] : [BRAND.logoUrl],
      site: BRAND.twitterHandle,
    },
    alternates: {
      canonical: url,
      languages: {
        'fr-CA': `${BRAND.url}/fr/tribunes/${slug}/podcasts/${podcastId}`,
        'en-CA': `${BRAND.url}/en/tribunes/${slug}/podcasts/${podcastId}`,
      },
    },
    robots: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  };
}

export default async function PodcastPage({ params }: PodcastPageProps) {
  const { locale, slug, podcastId } = await params;
  setRequestLocale(locale);
  const id = parseInt(podcastId, 10);
  if (isNaN(id)) notFound();

  const supabase = await createClient();

  // Verify community exists
  const { data: communityData } = await supabase
    .from('communities')
    .select('id, slug, name, name_en')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  const community = communityData as { id: number; slug: string; name: string; name_en: string | null } | null;
  if (!community) notFound();
  const communityDisplayName = displayCommunityName(community, locale);

  // Load podcast with publisher info
  const { data: podcastData } = await supabase
    .from('podcasts')
    .select('id, community_id, published_by, title, description, source_lang, title_translated, description_translated, audio_url, cover_image_url, duration_seconds, like_count, is_published, is_removed, created_at, members:members!podcasts_published_by_fkey(username, avatar_url)')
    .eq('id', id)
    .eq('community_id', community.id)
    .eq('is_published', true)
    .single();

  if (!podcastData) notFound();

  const podcast = podcastData as unknown as {
    id: number;
    title: string;
    description: string | null;
    source_lang: string | null;
    title_translated: string | null;
    description_translated: string | null;
    audio_url: string;
    cover_image_url: string | null;
    duration_seconds: number | null;
    like_count: number;
    created_at: string;
    published_by: string | null;
    members: { username: string; avatar_url: string | null } | null;
  };

  const publisher = podcast.members;

  // Show the machine translation when the reader's locale differs from the
  // language the podcast was written in.
  const displayTitle = translatedField(podcast.source_lang, locale, podcast.title, podcast.title_translated);
  const displayDescription = translatedField(podcast.source_lang, locale, podcast.description, podcast.description_translated);

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const podcastUrl = `${BRAND.url}/${locale}/tribunes/${slug}/podcasts/${podcast.id}`;

  const podcastJsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'PodcastEpisode',
      '@id': podcastUrl,
      name: displayTitle,
      description: displayDescription ?? `${displayTitle} — Podcast sportif sur ${BRAND.name}`,
      url: podcastUrl,
      datePublished: podcast.created_at,
      inLanguage: locale === 'fr' ? 'fr-CA' : 'en-CA',
      duration: podcast.duration_seconds ? `PT${Math.floor(podcast.duration_seconds / 60)}M${podcast.duration_seconds % 60}S` : undefined,
      associatedMedia: {
        '@type': 'MediaObject',
        contentUrl: podcast.audio_url,
        encodingFormat: 'audio/mpeg',
      },
      image: podcast.cover_image_url ?? BRAND.logoUrl,
      author: publisher ? { '@type': 'Person', name: publisher.username } : undefined,
      partOfSeries: {
        '@type': 'PodcastSeries',
        name: BRAND.name,
        url: BRAND.url,
      },
      publisher: {
        '@type': 'Organization',
        name: BRAND.name,
        url: BRAND.url,
        logo: { '@type': 'ImageObject', url: BRAND.logoUrl },
      },
      isAccessibleForFree: true,
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: podcast.like_count,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: locale === 'fr' ? 'Accueil' : 'Home', item: `${BRAND.url}/${locale}` },
        { '@type': 'ListItem', position: 2, name: communityDisplayName, item: `${BRAND.url}/${locale}/tribunes/${slug}` },
        { '@type': 'ListItem', position: 3, name: displayTitle },
      ],
    },
  ];

  return (
    <div className="overflow-y-auto bg-white dark:bg-[#1e1e1e]" style={{ height: 'calc(100dvh - 4rem)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(podcastJsonLd).replace(/</g, '\\u003c') }}
      />
      <PodcastPlayer
        podcast={{ ...podcast, title: displayTitle, description: displayDescription, publisher }}
        communitySlug={slug}
        userId={user?.id ?? null}
      />
    </div>
  );
}
