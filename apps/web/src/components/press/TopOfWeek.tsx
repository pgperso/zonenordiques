import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { cleanArticleTitle } from '@/lib/articleText';
import { ORIGINAL_CONTENT_CUTOFF, displayCommunityName } from '@arena/shared';

interface TopOfWeekProps {
  locale: string;
}

type TopArticleRow = {
  id: number;
  slug: string;
  title: string;
  view_count: number;
  published_at: string | null;
  communities: { slug: string; name: string; name_en: string | null };
};

/**
 * Server-rendered "Top de la semaine" sidebar widget. Lists the five
 * most-read indexable articles from the past 7 days, with their rank.
 *
 * Why a server component: the list needs to render in SSR HTML so it
 * counts as crawlable internal links (each card is a deep link into an
 * article). Doing this on the client would hide the signal from Google.
 *
 * Why 7 days specifically: short enough to feel "this week's news",
 * long enough that even a slow-traffic site can fill the slot most of
 * the time. The fallback to all-time most-read kicks in if the 7-day
 * pool is empty, so the widget never renders an awkward placeholder.
 */
export async function TopOfWeek({ locale }: TopOfWeekProps) {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Primary: articles published in the last 7 days, ordered by views.
  const select =
    'id, slug, title, view_count, published_at, communities!inner(slug, name, name_en)';

  const { data: weekData } = await supabase
    .from('articles')
    .select(select)
    .eq('is_published', true)
    .eq('is_removed', false)
    .gte('published_at', sevenDaysAgo)
    .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
    .order('view_count', { ascending: false })
    .limit(5);

  let articles = (weekData ?? []) as unknown as TopArticleRow[];

  // Fallback to all-time top if the 7-day window doesn't yield 5 hits.
  // Better to show something useful than an empty widget the day after
  // launch.
  if (articles.length < 5) {
    const { data: fallbackData } = await supabase
      .from('articles')
      .select(select)
      .eq('is_published', true)
      .eq('is_removed', false)
      .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
      .order('view_count', { ascending: false })
      .limit(5);
    articles = (fallbackData ?? []) as unknown as TopArticleRow[];
  }

  if (articles.length === 0) return null;

  const heading = locale === 'fr' ? 'Top de la semaine' : 'Top of the week';

  return (
    <aside
      aria-label={heading}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-4"
    >
      <div className="mb-3 flex items-center gap-1.5">
        <svg className="h-4 w-4 text-brand-red" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z" clipRule="evenodd" />
        </svg>
        <h2 className="text-sm font-bold uppercase tracking-wider text-brand-red">
          {heading}
        </h2>
      </div>
      <ol className="space-y-3">
        {articles.map((a, idx) => {
          const communityName = displayCommunityName(
            { name: a.communities.name, name_en: a.communities.name_en },
            locale,
          );
          return (
            <li key={a.id} className="flex gap-3">
              <span className="shrink-0 text-2xl font-extrabold tabular-nums leading-none text-gray-200 dark:text-gray-700">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/tribunes/${a.communities.slug}/articles/${a.slug}`}
                  className="block text-sm font-semibold leading-snug text-gray-900 hover:text-brand-blue dark:text-gray-100"
                >
                  <span className="line-clamp-3">{cleanArticleTitle(a.title, null, 'Article')}</span>
                </Link>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-400">
                  {communityName}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
