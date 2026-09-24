import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { BRAND } from '@/lib/brand';
import { isBrandCommunity } from '@/lib/brandScope';
import { cleanArticleTitle } from '@/lib/articleText';

// Branded 1200x630 social card for an article: the cover full-bleed with a
// dark scrim when it's a social-safe JPG/PNG, otherwise a brand gradient, plus
// the headline and the brand signature. Always a PNG, so every article
// — cover or not — has a card X/Twitter/Facebook render reliably.

export const alt = BRAND.name;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function ArticleOgImage({
  params,
}: {
  params: Promise<{ slug: string; articleSlug: string }>;
}) {
  const { slug, articleSlug } = await params;

  const logoData = readFileSync(join(process.cwd(), 'public', BRAND.logoPngPath.replace(/^\/+/, '')));
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`;

  let title: string = BRAND.name;
  let cover: string | null = null;
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  // Same two gates as the page itself. An image route is a public endpoint in
  // its own right: without them this returned 200 for another brand's article
  // (rendered in THIS brand's colours and logo) and for unpublished drafts,
  // leaking their headlines. It degrades to the plain brand card, never 404s,
  // so a legitimate card is never broken by a race with publication.
  const { data: community } = await db.from('communities').select('id').eq('slug', slug).single();
  if (community && (await isBrandCommunity(db as never, (community as { id: number }).id))) {
    const { data } = await db
      .from('articles')
      .select('title, cover_image_url')
      .eq('community_id', (community as { id: number }).id)
      .eq('slug', articleSlug)
      .eq('is_published', true)
      .eq('is_removed', false)
      .single();
    if (data) {
      title = cleanArticleTitle((data as { title: string | null }).title, null, BRAND.name);
      cover = (data as { cover_image_url: string | null }).cover_image_url;
    }
  }
  // Satori can only embed JPG/PNG — WebP covers fall back to the brand gradient.
  const embeddable = !!cover && /\.(jpe?g|png)(\?|$)/i.test(cover);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: BRAND.colors.blue,
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        {embeddable && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover!}
            alt=""
            width={1200}
            height={630}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: embeddable
              ? 'linear-gradient(0deg, rgba(0,18,42,0.95) 8%, rgba(0,18,42,0.45) 45%, rgba(0,18,42,0.10) 100%)'
              : `linear-gradient(135deg, ${BRAND.colors.blueDark} 0%, ${BRAND.colors.blue} 100%)`,
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 64,
            width: '100%',
          }}
        >
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, maxWidth: 1040 }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, marginTop: 28 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" width={54} height={54} />
            <span style={{ fontWeight: 700 }}>{BRAND.name}</span>
            <span style={{ opacity: 0.6 }}>· {BRAND.tagline}</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
