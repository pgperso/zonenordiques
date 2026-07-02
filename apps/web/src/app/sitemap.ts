import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';
import { ORIGINAL_CONTENT_CUTOFF, MIN_QUALITY_WORD_COUNT, countWords } from '@arena/shared';
import { BRAND } from '@/lib/brand';
import { CONTENT_AUTHORS } from '@/lib/contentAuthors';

export const revalidate = 3600;

const BASE_URL = BRAND.url;

function withAlternates(path: string) {
  return {
    url: `${BASE_URL}${path}`,
    alternates: {
      languages: {
        'fr-CA': `${BASE_URL}/fr${path}`,
        'en-CA': `${BASE_URL}/en${path}`,
        'x-default': `${BASE_URL}/fr${path}`,
      },
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  const entries: MetadataRoute.Sitemap = [
    { ...withAlternates('/'), lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
    { ...withAlternates('/a-propos'), lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.5 },
    { ...withAlternates('/contact'), lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.4 },
    { ...withAlternates('/conditions-utilisation'), lastModified: new Date(), changeFrequency: 'yearly' as const, priority: 0.3 },
    { ...withAlternates('/politique-confidentialite'), lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { ...withAlternates('/mentions-legales'), lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { ...withAlternates('/normes-editoriales'), lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { ...withAlternates('/nordiquometre'), lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { ...withAlternates('/exposmetre'), lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
  ];

  // Sport category hubs (/sport/hockey, /sport/baseball, ...). These are
  // crawl-relevant topic pages that link out to all tribunes + recent
  // articles in the category — strong internal-linking surface.
  const { data: cats } = await supabase
    .from('categories')
    .select('slug')
    .order('sort_order');
  if (cats) {
    for (const c of cats as { slug: string }[]) {
      entries.push({
        ...withAlternates(`/sport/${c.slug}`),
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
  }

  // Public community hubs: one entry per active community that has at least
  // one published article or podcast. The page lists those items + join CTA,
  // indexable as CollectionPage.
  const { data: communities } = await supabase
    .from('communities')
    .select('slug, updated_at')
    .eq('is_active', true)
    .limit(500);

  if (communities) {
    // Identify which communities actually have published content
    const [{ data: articleCommunities }, { data: podcastCommunities }] = await Promise.all([
      supabase
        .from('articles')
        .select('community_id, communities!inner(slug)')
        .eq('is_published', true)
        .eq('is_removed', false),
      supabase
        .from('podcasts')
        .select('community_id, communities!inner(slug)')
        .eq('is_published', true),
    ]);

    const slugsWithContent = new Set<string>();
    for (const row of (articleCommunities ?? []) as { communities: { slug: string } | null }[]) {
      if (row.communities?.slug) slugsWithContent.add(row.communities.slug);
    }
    for (const row of (podcastCommunities ?? []) as { communities: { slug: string } | null }[]) {
      if (row.communities?.slug) slugsWithContent.add(row.communities.slug);
    }

    for (const c of communities as { slug: string; updated_at: string | null }[]) {
      if (!slugsWithContent.has(c.slug)) continue;
      entries.push({
        ...withAlternates(`/tribunes/${c.slug}`),
        lastModified: c.updated_at ? new Date(c.updated_at) : new Date(),
        changeFrequency: 'daily',
        priority: 0.8,
      });
    }
  }

  // Articles — only original AND substantial content.
  // - Excludes articles imported from the legacy Zone Nordiques archive
  //   (duplicates of content already indexed at zonenordiques.com).
  // - Excludes short originals (< MIN_QUALITY_WORD_COUNT words) because
  //   Google files those under "Crawled, currently not indexed", which
  //   hurts the site's overall quality ratio in AdSense's eyes.
  const { data: articles } = await supabase
    .from('articles')
    .select('slug, community_id, updated_at, body, communities!inner(slug)')
    .eq('is_published', true)
    .eq('is_removed', false)
    .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
    .limit(5000);

  if (articles) {
    for (const a of articles as (typeof articles)[number][]) {
      if (countWords((a as { body?: string }).body) < MIN_QUALITY_WORD_COUNT) continue;
      const communitySlug = (a as Record<string, unknown>).communities as { slug: string } | null;
      if (communitySlug) {
        entries.push({
          ...withAlternates(`/tribunes/${communitySlug.slug}/articles/${a.slug}`),
          lastModified: a.updated_at ? new Date(a.updated_at) : new Date(),
          changeFrequency: 'weekly',
          priority: 0.9,
        });
      }
    }
  }

  // Authors with at least one indexable article. The author page itself
  // is a crawl hub that links out to a dozen articles, so it's strong
  // internal-linking surface for SEO.
  const { data: authorRows } = await supabase
    .from('articles')
    .select('author_id, author_name_override, members!articles_author_id_fkey(username)')
    .eq('is_published', true)
    .eq('is_removed', false)
    .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
    .limit(5000);

  if (authorRows) {
    const seenMembers = new Set<string>();
    const overrides = new Set<string>();
    for (const row of authorRows as unknown as { author_id: string; author_name_override: string | null; members: { username: string } | null }[]) {
      // Persona byline takes precedence: an article written under "Rex Paquette"
      // counts toward the persona page, not the underlying member's page.
      if (row.author_name_override) {
        overrides.add(row.author_name_override);
        continue;
      }
      const username = row.members?.username;
      if (!username || seenMembers.has(username)) continue;
      seenMembers.add(username);
      entries.push({
        ...withAlternates(`/auteurs/${username}`),
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }

    for (const persona of CONTENT_AUTHORS) {
      if (!overrides.has(persona.name)) continue;
      entries.push({
        ...withAlternates(`/auteurs/${persona.slug}`),
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
  }

  // Podcasts
  const { data: podcasts } = await supabase
    .from('podcasts')
    .select('id, updated_at, communities!inner(slug)')
    .eq('is_published', true)
    .limit(5000);

  if (podcasts) {
    for (const p of podcasts as (typeof podcasts)[number][]) {
      const communitySlug = (p as Record<string, unknown>).communities as { slug: string } | null;
      if (communitySlug) {
        entries.push({
          ...withAlternates(`/tribunes/${communitySlug.slug}/podcasts/${p.id}`),
          lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
          changeFrequency: 'monthly',
          priority: 0.6,
        });
      }
    }
  }

  return entries;
}
