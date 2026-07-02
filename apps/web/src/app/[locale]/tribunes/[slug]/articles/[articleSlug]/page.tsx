import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { setRequestLocale } from 'next-intl/server';
import { isIndexableArticle, displayCommunityName, ARTICLE_AD_WORD_THRESHOLD } from '@arena/shared';
import { sanitizeArticleBody } from '@/lib/sanitizeBodyServer';
import { splitHtmlAtParagraph } from '@/lib/articleBody';
import { BRAND } from '@/lib/brand';
import { translatedField } from '@/lib/contentTranslation';
import { cleanArticleTitle, decodeEntities } from '@/lib/articleText';
import { ArticleView } from '@/components/article/ArticleView';
import { RelatedArticles } from '@/components/article/RelatedArticles';
import { getContentAuthor } from '@/lib/contentAuthors';

export const revalidate = 300;

interface ArticlePageProps {
  params: Promise<{ locale: string; slug: string; articleSlug: string }>;
}

export async function generateMetadata({ params }: ArticlePageProps) {
  const { slug, articleSlug } = await params;
  const supabase = await createClient();

  const { data: community } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!community) return { title: 'Article introuvable' };

  const { data: article } = await supabase
    .from('articles')
    .select('title, excerpt, cover_image_url, published_at, body, source_lang, title_translated, excerpt_translated, body_translated')
    .eq('community_id', (community as { id: number }).id)
    .eq('slug', articleSlug)
    .eq('is_published', true)
    .eq('is_removed', false)
    .single();

  if (!article) return { title: 'Article introuvable' };

  const { locale: loc } = await params;
  const raw = article as unknown as {
    title: string; excerpt: string | null; cover_image_url: string | null;
    published_at: string | null; body: string; source_lang: string | null;
    title_translated: string | null; excerpt_translated: string | null; body_translated: string | null;
  };
  const body = translatedField(raw.source_lang, loc, raw.body, raw.body_translated);
  const title = cleanArticleTitle(translatedField(raw.source_lang, loc, raw.title, raw.title_translated), body, 'Article');
  const excerpt = decodeEntities(translatedField(raw.source_lang, loc, raw.excerpt, raw.excerpt_translated)) || null;
  const cover_image_url = raw.cover_image_url;
  const published_at = raw.published_at;
  const desc = excerpt ?? `${title} — Article sportif sur ${BRAND.name}. Opinions, analyses et débats.`;
  const url = `${BRAND.url}/${loc}/tribunes/${slug}/articles/${articleSlug}`;
  const communityRow = (await supabase.from('communities').select('name, name_en').eq('slug', slug).single()).data as { name: string; name_en: string | null } | null;
  const communityName = communityRow ? displayCommunityName(communityRow, loc) : null;

  return {
    title: `${title} | ${communityName ?? 'Tribune'}`,
    description: desc,
    keywords: [
      title,
      communityName,
      `${communityName ?? ''} fans`,
      'article sportif', 'chronique sport', 'opinion sport',
      'tribune sportive', BRAND.name, BRAND.domain.split('.')[0],
      'analyse sport', 'débat sportif',
    ].filter(Boolean) as string[],
    openGraph: {
      title: `${title} | ${BRAND.name}`,
      description: desc,
      type: 'article',
      publishedTime: published_at ?? undefined,
      section: 'Sports',
      tags: [communityName ?? 'Sports', 'Opinion', 'Tribune'],
      url,
      siteName: BRAND.name,
      locale: loc === 'fr' ? 'fr_CA' : 'en_CA',
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
        'fr-CA': `${BRAND.url}/fr/tribunes/${slug}/articles/${articleSlug}`,
        'en-CA': `${BRAND.url}/en/tribunes/${slug}/articles/${articleSlug}`,
      },
    },
    robots: {
      index: isIndexableArticle(published_at, body),
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  };
}

interface ArticlePageSearchParams {
  searchParams?: Promise<{ commentId?: string }>;
}

export default async function ArticlePage({ params, searchParams }: ArticlePageProps & ArticlePageSearchParams) {
  const { locale, slug, articleSlug } = await params;
  const resolvedSearch = (await searchParams) ?? {};
  const focusCommentId = resolvedSearch.commentId ? parseInt(resolvedSearch.commentId, 10) : null;
  setRequestLocale(locale);
  const supabase = await createClient();

  // Load community
  const { data: communityData } = await supabase
    .from('communities')
    .select('id, slug, name, name_en')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  const community = communityData as { id: number; slug: string; name: string; name_en: string | null } | null;
  if (!community) notFound();
  const communityDisplayName = displayCommunityName(community, locale);

  // Load article with author
  const { data: articleData } = await supabase
    .from('articles')
    .select('id, slug, title, body, excerpt, source_lang, title_translated, excerpt_translated, body_translated, cover_image_url, cover_position_y, like_count, view_count, published_at, created_at, author_name_override, is_ai_generated, members:members!articles_author_id_fkey(id, username, first_name, last_name, avatar_url, creator_display_name, creator_avatar_url)')
    .eq('community_id', community.id)
    .eq('slug', articleSlug)
    .eq('is_published', true)
    .eq('is_removed', false)
    .single();

  if (!articleData) notFound();

  const article = articleData as unknown as {
    id: number;
    slug: string;
    title: string;
    body: string;
    excerpt: string | null;
    source_lang: string | null;
    title_translated: string | null;
    excerpt_translated: string | null;
    body_translated: string | null;
    cover_image_url: string | null;
    cover_position_y: number | null;
    like_count: number;
    view_count: number;
    published_at: string | null;
    created_at: string;
    author_name_override: string | null;
    is_ai_generated: boolean;
    members: { id: string; username: string; first_name: string | null; last_name: string | null; avatar_url: string | null; creator_display_name: string | null; creator_avatar_url: string | null } | null;
  };

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check if the viewer can moderate comments in this article's community
  // (owner / admin / moderator). This gates the "delete any comment" UI.
  let canModerate = false;
  if (user) {
    const { data: modRows } = await supabase
      .from('community_member_roles')
      .select('role_id, roles!inner(code)')
      .eq('community_id', community.id)
      .eq('member_id', user.id);
    const codes = ((modRows ?? []) as { roles: { code: string } | null }[])
      .map((r) => r.roles?.code)
      .filter(Boolean);
    canModerate = codes.some((c) => c === 'owner' || c === 'admin' || c === 'moderator');

    if (!canModerate) {
      // Global owners can moderate anywhere
      const { data: globalOwner } = await supabase
        .from('community_member_roles')
        .select('id, roles!inner(code)')
        .eq('member_id', user.id)
        .eq('roles.code', 'owner')
        .limit(1);
      canModerate = ((globalOwner as unknown[] | null)?.length ?? 0) > 0;
    }
  }

  // Increment view count (fire and forget)
  void (async () => { try { await supabase.rpc('increment_article_views' as never, { p_article_id: article.id } as never); } catch { /* ignore */ } })();

  const m = article.members;
  const authorDisplayName = article.author_name_override || (m?.first_name && m?.last_name ? `${m.first_name} ${m.last_name}` : null) || m?.username || 'Inconnu';
  const articleUrl = `${BRAND.url}/${locale}/tribunes/${slug}/articles/${articleSlug}`;

  // Show the machine translation when the reader's locale differs from the
  // language the article was written in (see /api/translate-pending).
  const displayBody = translatedField(article.source_lang, locale, article.body, article.body_translated);
  const displayTitle = cleanArticleTitle(translatedField(article.source_lang, locale, article.title, article.title_translated), displayBody, 'Article');
  const displayExcerpt = decodeEntities(translatedField(article.source_lang, locale, article.excerpt, article.excerpt_translated)) || null;

  // Sanitize + split the body HERE (server component) so the prose is part of
  // the SSR HTML. This used to happen inside the client ArticleView via
  // isomorphic-dompurify, but that pulls jsdom into a client component whose
  // server render isn't traced with jsdom on Vercel — so ArticleView threw
  // during SSR, React fell back to client-only rendering, and crawlers
  // (including AdSense's reviewer) received an empty article shell.
  const sanitizedBody = sanitizeArticleBody(displayBody);
  const bodyParts = splitHtmlAtParagraph(sanitizedBody, ARTICLE_AD_WORD_THRESHOLD);

  const wordCount = displayBody.replace(/<[^>]*>/g, '').split(/\s+/).length;
  const lang = locale === 'fr' ? 'fr-CA' : 'en-CA';

  const articleJsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      '@id': articleUrl,
      headline: displayTitle,
      description: displayExcerpt ?? `${displayTitle} — article sportif sur ${BRAND.name}`,
      image: article.cover_image_url ?? BRAND.logoUrl,
      datePublished: article.published_at ?? article.created_at,
      dateModified: article.published_at ?? article.created_at,
      url: articleUrl,
      mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
      wordCount,
      articleSection: 'Sports',
      inLanguage: lang,
      publisher: {
        '@type': 'Organization',
        name: BRAND.name,
        url: BRAND.url,
        logo: { '@type': 'ImageObject', url: BRAND.logoUrl, width: BRAND.logoWidth, height: BRAND.logoHeight },
      },
      author: {
        '@type': 'Person',
        name: authorDisplayName,
      },
      isAccessibleForFree: true,
      interactionStatistic: [
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: article.like_count },
        { '@type': 'InteractionCounter', interactionType: 'https://schema.org/ReadAction', userInteractionCount: article.view_count },
      ],
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
    <div className="mx-auto w-full max-w-6xl overflow-y-auto bg-white dark:bg-[#1e1e1e]" style={{ height: 'calc(100dvh - 4rem)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd).replace(/</g, '\\u003c') }}
      />
      <ArticleView
        article={{
          ...article,
          title: displayTitle,
          excerpt: displayExcerpt,
          body: displayBody,
          is_ai_generated: article.is_ai_generated,
          author: article.members ? {
            id: article.members.id,
            username: article.author_name_override || (article.members.first_name && article.members.last_name ? `${article.members.first_name} ${article.members.last_name}` : null) || article.members.username,
            // Persona overrides route to /auteurs/[persona-slug] when the
            // byline matches one of our recurring fictional contributors;
            // otherwise the link points at the real member's username.
            slug: article.author_name_override
              ? (getContentAuthor(article.author_name_override)?.slug ?? null)
              : article.members.username,
            avatar_url: article.author_name_override ? null : article.members.avatar_url,
          } : {
            id: '',
            username: article.author_name_override || 'Inconnu',
            slug: article.author_name_override ? (getContentAuthor(article.author_name_override)?.slug ?? null) : null,
            avatar_url: null,
          },
        }}
        communitySlug={slug}
        communityName={communityDisplayName}
        userId={user?.id ?? null}
        canModerate={canModerate}
        focusCommentId={focusCommentId}
        showAds={isIndexableArticle(article.published_at, displayBody)}
        sanitizedBody={sanitizedBody}
        bodyParts={bodyParts}
        relatedSlot={
          <RelatedArticles
            currentArticleId={article.id}
            communityId={community.id}
            communitySlug={community.slug}
            authorId={article.members?.id ?? null}
            locale={locale}
          />
        }
      />
    </div>
  );
}
