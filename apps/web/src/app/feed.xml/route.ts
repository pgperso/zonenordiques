import { createClient } from '@/lib/supabase/server';
import { ORIGINAL_CONTENT_CUTOFF } from '@arena/shared';
import { BRAND } from '@/lib/brand';

export const revalidate = 3600;

export async function GET() {
  const supabase = await createClient();
  const BASE_URL = BRAND.url;

  // Imported legacy articles are noindex and excluded from the public RSS
  // feed so crawlers / aggregators don't surface duplicates of content
  // already published at zonenordiques.com.
  const { data: articles } = await supabase
    .from('articles')
    .select('title, slug, excerpt, published_at, cover_image_url, communities!inner(slug, name)')
    .eq('is_published', true)
    .eq('is_removed', false)
    .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
    .order('published_at', { ascending: false })
    .limit(50);

  const { data: podcasts } = await supabase
    .from('podcasts')
    .select('id, title, description, created_at, audio_url, cover_image_url, communities!inner(slug, name)')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(50);

  type ArticleRow = { title: string; slug: string; excerpt: string | null; published_at: string | null; cover_image_url: string | null; communities: { slug: string; name: string } };
  type PodcastRow = { id: number; title: string; description: string | null; created_at: string; audio_url: string; cover_image_url: string | null; communities: { slug: string; name: string } };

  const items: string[] = [];

  for (const a of (articles ?? []) as ArticleRow[]) {
    items.push(`    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${BASE_URL}/fr/tribunes/${a.communities.slug}/articles/${a.slug}</link>
      <description><![CDATA[${a.excerpt ?? a.title}]]></description>
      <pubDate>${new Date(a.published_at ?? Date.now()).toUTCString()}</pubDate>
      <category>${a.communities.name}</category>
      <guid isPermaLink="true">${BASE_URL}/fr/tribunes/${a.communities.slug}/articles/${a.slug}</guid>
    </item>`);
  }

  for (const p of (podcasts ?? []) as PodcastRow[]) {
    items.push(`    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${BASE_URL}/fr/tribunes/${p.communities.slug}/podcasts/${p.id}</link>
      <description><![CDATA[${p.description ?? p.title}]]></description>
      <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
      <category>${p.communities.name}</category>
      <enclosure url="${p.audio_url}" type="audio/mpeg" />
      <guid isPermaLink="true">${BASE_URL}/fr/tribunes/${p.communities.slug}/podcasts/${p.id}</guid>
    </item>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${BRAND.name}</title>
    <link>${BASE_URL}</link>
    <description>Articles et podcasts sportifs — ${BRAND.name}</description>
    <language>fr-ca</language>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
