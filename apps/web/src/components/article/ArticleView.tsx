'use client';

import { useCallback } from 'react';
import { formatTime } from '@arena/shared';
import { FeedLikeButton } from '@/components/feed/FeedLikeButton';
import { AdSlot } from '@/components/ads/AdSlot';
import { AdInArticle } from '@/components/ads/AdInArticle';
import { Avatar } from '@/components/ui/Avatar';
import { ArticleComments } from '@/components/press/ArticleComments';
import { getContentAuthor } from '@/lib/contentAuthors';
import Image from 'next/image';
import { Link, useRouter } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { BRAND } from '@/lib/brand';
import { ShareButton } from '@/components/ui/ShareButton';

interface ArticleViewProps {
  article: {
    id: number;
    slug: string;
    title: string;
    body: string;
    excerpt: string | null;
    cover_image_url: string | null;
    cover_position_y?: number | null;
    like_count: number;
    view_count: number;
    published_at: string | null;
    created_at: string;
    is_ai_generated?: boolean;
    author: {
      id: string;
      // Display name shown in the byline (may be a persona override).
      username: string;
      // URL slug for /auteurs/[slug]. Null when the article uses a
      // persona override without a backing member, so the byline stays
      // plain text instead of a broken link.
      slug: string | null;
      avatar_url: string | null;
    };
  };
  communitySlug: string;
  // Locale-aware tribune name surfaced above the title and in the
  // "continue the discussion" CTA at the bottom. Resolved server-side
  // so SSR HTML carries the right language without a client flicker.
  communityName: string;
  userId: string | null;
  canModerate?: boolean;
  focusCommentId?: number | null;
  // Ads are suppressed on noindex articles (imports, short originals).
  // Google's AdSense reviewer crawls internal links and treats ads on
  // thin/duplicate pages as "low value content", which causes rejection.
  showAds?: boolean;
  // Article body, sanitized AND split server-side (in page.tsx) so the prose
  // is present in the SSR HTML. It used to be sanitized here with
  // isomorphic-dompurify, but that pulls jsdom into a client component whose
  // server render isn't traced with jsdom on Vercel — the render threw, React
  // fell back to client-only rendering, and crawlers (incl. AdSense's) saw an
  // empty article. Sanitizing upstream keeps this component jsdom-free.
  sanitizedBody: string;
  // [before-ad, after-ad] halves, or null when the body is too short to split.
  bodyParts: [string, string] | null;
  // Server-rendered related-articles block (passed in from page.tsx).
  // Rendered between the article body and the comments so readers see
  // a "what to read next" exit before they hit the comments section.
  relatedSlot?: React.ReactNode;
}

export function ArticleView({ article, communitySlug, communityName, userId, canModerate = false, focusCommentId = null, showAds = true, sanitizedBody, bodyParts, relatedSlot }: ArticleViewProps) {
  const locale = useLocale();
  const router = useRouter();
  const handleBack = useCallback(() => {
    // For visitors arriving from external links (social, search) there's
    // no previous history; fall back to the press gallery (home), which
    // is the public entry point — not the community hub, which feels
    // like landing inside a forum if they came for a single article.
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }, [router]);

  return (
    <div className="flex justify-center gap-8 px-4 py-6">
      {/* Main article content */}
      <article className="w-full min-w-0 flex-1 overflow-hidden">
        {/* Back button — returns to previous page (gallery or tribune) */}
        <button
          onClick={handleBack}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Retour
        </button>

        {/* Cover image */}
        {article.cover_image_url && (
          <div className="relative mb-6 h-64 overflow-hidden rounded-xl">
            <Image
              src={article.cover_image_url}
              alt={article.title}
              fill
              className="object-cover"
              style={{ objectPosition: `center ${article.cover_position_y ?? 50}%` }}
              sizes="(max-width: 768px) 100vw, 720px"
              priority
            />
          </div>
        )}

        {/* Tribune context — discrete, link-only, so readers know which
            sport/team this article belongs to without feeling like they're
            on a forum landing page. */}
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {locale === 'fr' ? 'Dans la tribune' : 'In the tribune'}{' '}
          <Link
            href={`/tribunes/${communitySlug}`}
            className="text-brand-blue hover:underline"
          >
            {communityName}
          </Link>
        </p>

        {/* Title */}
        <h1 className="mb-3 text-3xl font-bold text-gray-900 dark:text-gray-100">{article.title}</h1>

        {/* Author & meta */}
        <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4">
          {(() => {
            const ca = getContentAuthor(article.author.username);
            const avatarNode = ca ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: ca.color }}>{ca.initials}</span>
            ) : (
              <Avatar url={article.author.avatar_url} name={article.author.username} size="lg" />
            );
            return article.author.slug ? (
              <Link href={`/auteurs/${article.author.slug}`} aria-label={article.author.username} className="shrink-0">
                {avatarNode}
              </Link>
            ) : (
              avatarNode
            );
          })()}
          <div>
            {article.author.slug ? (
              <Link
                href={`/auteurs/${article.author.slug}`}
                className="text-sm font-semibold text-gray-900 hover:text-brand-blue dark:text-gray-100"
              >
                {article.author.username}
              </Link>
            ) : (
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{article.author.username}</p>
            )}
            <p className="text-xs text-gray-400">
              {formatTime(article.published_at ?? article.created_at)}
              {article.view_count > 0 && ` · ${article.view_count} vue${article.view_count > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {/* Article body with in-article ad */}
        {bodyParts && showAds ? (
          <>
            <div
              className="prose max-w-none prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-a:text-brand-blue prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-img:max-w-full prose-img:rounded-xl prose-img:h-auto"
              dangerouslySetInnerHTML={{ __html: bodyParts[0] }}
            />
            <AdInArticle />
            <div
              className="prose max-w-none prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-a:text-brand-blue prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-img:max-w-full prose-img:rounded-xl prose-img:h-auto"
              dangerouslySetInnerHTML={{ __html: bodyParts[1] }}
            />
          </>
        ) : (
          <div
            className="prose max-w-none prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-a:text-brand-blue prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-img:max-w-full prose-img:rounded-xl prose-img:h-auto"
            dangerouslySetInnerHTML={{ __html: sanitizedBody }}
          />
        )}

        {/* End-of-article ad — suppressed on noindex pages (see showAds prop) */}
        {showAds && (
          <div className="my-6 flex justify-center">
            <AdSlot slotId="article-end" format="large-rectangle" />
          </div>
        )}

        {/* Like + Share */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <FeedLikeButton
            targetType="article"
            targetId={article.id}
            initialLikeCount={article.like_count}
            userId={userId}
          />
          <ShareButton
            url={`${BRAND.url}/${locale}/tribunes/${communitySlug}/articles/${article.slug}`}
            title={article.title}
            label
          />
        </div>

        {/* Related articles — server-rendered exit ramp before comments */}
        {relatedSlot}

        {/* Continue the discussion — invites engaged readers to join the
            tribune. Placed AFTER related articles so casual news readers
            have already had their "what to read next" exit, and ONLY
            engaged readers (the ones who scrolled to comments) see the
            community CTA. */}
        <aside
          aria-label={locale === 'fr' ? 'Rejoindre la tribune' : 'Join the tribune'}
          className="my-10 rounded-xl border border-brand-blue/20 bg-gradient-to-br from-brand-blue/5 to-transparent p-5 md:p-6"
        >
          <h2 className="mb-1 text-base font-bold text-gray-900 dark:text-gray-100 md:text-lg">
            {locale === 'fr'
              ? `Poursuivez la discussion dans la tribune ${communityName}`
              : `Continue the discussion in the ${communityName} tribune`}
          </h2>
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
            {locale === 'fr'
              ? 'Chat en direct, analyses et débats entre partisans — tous les jours.'
              : 'Live chat, analysis and fan debates — every day.'}
          </p>
          <Link
            href={`/tribunes/${communitySlug}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
          >
            {locale === 'fr' ? 'Voir la tribune' : 'Visit the tribune'}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </aside>

        {/* Comments */}
        <ArticleComments
          articleId={article.id}
          userId={userId}
          canModerate={canModerate}
          focusCommentId={focusCommentId}
        />
      </article>

      {/* Sticky sidebar ad - desktop only, suppressed on noindex pages */}
      {showAds && (
        <aside className="hidden w-[320px] flex-shrink-0 lg:block">
          <div className="sticky top-20">
            <AdSlot slotId="article-sidebar" format="half-page" />
          </div>
        </aside>
      )}
    </div>
  );
}

