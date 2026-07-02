import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { formatTime, ORIGINAL_CONTENT_CUTOFF, displayCommunityName } from '@arena/shared';
import { translatedField } from '@/lib/contentTranslation';
import { cleanArticleTitle } from '@/lib/articleText';

interface RelatedArticlesProps {
  // The article we're currently viewing — exclude it from the list.
  currentArticleId: number;
  communityId: number;
  communitySlug: string;
  authorId: string | null;
  locale: string;
}

type RelatedArticle = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  source_lang: string | null;
  title_translated: string | null;
  cover_image_url: string | null;
  cover_position_y: number | null;
  published_at: string | null;
  view_count: number;
  author_name_override: string | null;
  author_id: string;
  communities: { name: string; name_en: string | null; slug: string };
  members: { username: string; first_name: string | null; last_name: string | null } | null;
};

/**
 * Server-rendered related-articles block displayed at the bottom of every
 * article page. Picks up to 6 candidates split between same tribune and
 * same author, deduplicated. Only original, indexable articles are
 * surfaced (same gate as the sitemap), so we never link readers into
 * legacy imports or thin content.
 *
 * Crawl-wise this is the single biggest SEO upgrade: it turns every
 * article from a dead end into a hub that points to ~3-6 other pages,
 * which is what makes a small site look like a real publication.
 */
export async function RelatedArticles({
  currentArticleId,
  communityId,
  communitySlug,
  authorId,
  locale,
}: RelatedArticlesProps) {
  const supabase = await createClient();
  const select =
    'id, slug, title, excerpt, source_lang, title_translated, cover_image_url, cover_position_y, published_at, view_count, author_name_override, author_id, communities!inner(name, name_en, slug), members:members!articles_author_id_fkey(username, first_name, last_name)';

  // Same-tribune candidates (most recent first), excluding the current one.
  const sameTribunePromise = supabase
    .from('articles')
    .select(select)
    .eq('community_id', communityId)
    .eq('is_published', true)
    .eq('is_removed', false)
    .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
    .neq('id', currentArticleId)
    .order('published_at', { ascending: false })
    .limit(6);

  // Same-author candidates across all tribunes, if author is set.
  const sameAuthorPromise = authorId
    ? supabase
        .from('articles')
        .select(select)
        .eq('author_id', authorId)
        .eq('is_published', true)
        .eq('is_removed', false)
        .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
        .neq('id', currentArticleId)
        .order('published_at', { ascending: false })
        .limit(3)
    : Promise.resolve({ data: [] as RelatedArticle[] });

  const [sameTribuneRes, sameAuthorRes] = await Promise.all([sameTribunePromise, sameAuthorPromise]);
  const sameTribune = (sameTribuneRes.data ?? []) as unknown as RelatedArticle[];
  const sameAuthor = (sameAuthorRes.data ?? []) as unknown as RelatedArticle[];

  // Merge: prefer same-tribune first, fill remaining slots with same-author,
  // dedup by id, cap at 4 to keep the section visually contained.
  const seen = new Set<number>();
  const merged: RelatedArticle[] = [];
  for (const row of [...sameTribune, ...sameAuthor]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
    if (merged.length >= 4) break;
  }

  if (merged.length === 0) return null;

  const isFr = locale === 'fr';
  const heading = isFr ? 'À lire aussi' : 'Related articles';

  return (
    <section
      aria-label={heading}
      className="mt-10 border-t border-gray-200 dark:border-gray-700 pt-8"
    >
      <h2 className="mb-5 text-lg font-bold text-gray-900 dark:text-gray-100">{heading}</h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {merged.map((a) => {
          const authorName =
            a.author_name_override ||
            (a.members?.first_name && a.members?.last_name
              ? `${a.members.first_name} ${a.members.last_name}`
              : null) ||
            a.members?.username ||
            'Inconnu';
          const title = cleanArticleTitle(translatedField(a.source_lang, locale, a.title, a.title_translated), null, 'Article');
          const href = `/tribunes/${a.communities.slug}/articles/${a.slug}`;
          const isOtherTribune = a.communities.slug !== communitySlug;
          const communityName = displayCommunityName(
            { name: a.communities.name, name_en: a.communities.name_en },
            locale,
          );
          return (
            <li key={a.id}>
              <Link
                href={href}
                className="group flex gap-3 rounded-lg p-2 transition hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {a.cover_image_url ? (
                  <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={a.cover_image_url}
                      alt={title}
                      fill
                      className="object-cover"
                      style={{ objectPosition: `center ${a.cover_position_y ?? 50}%` }}
                      sizes="112px"
                    />
                  </div>
                ) : (
                  <div className="h-20 w-28 shrink-0 rounded-md bg-gray-200 dark:bg-gray-700" />
                )}
                <div className="min-w-0 flex-1">
                  {isOtherTribune && (
                    <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                      {communityName}
                    </p>
                  )}
                  <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 group-hover:text-brand-blue dark:text-gray-100">
                    {title}
                  </h3>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {authorName} · {formatTime(a.published_at ?? new Date().toISOString())}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
