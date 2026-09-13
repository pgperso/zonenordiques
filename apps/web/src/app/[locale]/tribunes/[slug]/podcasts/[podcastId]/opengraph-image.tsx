import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { BRAND } from '@/lib/brand';
import { plainText } from '@/lib/articleText';

// Branded 1200x630 social card for a podcast episode: the cover (when it's a
// social-safe JPG/PNG) full-bleed with a dark scrim, otherwise a brand gradient,
// plus the podcast badge, the episode title and the brand signature.
// Always a PNG, so X/Twitter/Facebook all render it.

export const alt = `${BRAND.podcastLabel} — ${BRAND.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function PodcastOgImage({
  params,
}: {
  params: Promise<{ podcastId: string }>;
}) {
  const { podcastId } = await params;
  const id = Number(podcastId);

  const logoData = readFileSync(join(process.cwd(), 'public', BRAND.logoPngPath.replace(/^\/+/, '')));
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`;

  let title = BRAND.podcastLabel;
  let cover: string | null = null;
  if (Number.isFinite(id)) {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await db.from('podcasts').select('title, cover_image_url').eq('id', id).single();
    if (data) {
      title = plainText((data as { title: string }).title) || title;
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
              ? 'linear-gradient(90deg, rgba(0,18,42,0.94) 0%, rgba(0,18,42,0.62) 52%, rgba(0,18,42,0.22) 100%)'
              : `linear-gradient(135deg, ${BRAND.colors.blueDark} 0%, ${BRAND.colors.blue} 100%)`,
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 64,
            width: '100%',
          }}
        >
          <div style={{ display: 'flex' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: BRAND.colors.orange,
                color: '#ffffff',
                borderRadius: 999,
                padding: '12px 28px',
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              {BRAND.podcastLabel.toUpperCase()}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.04, maxWidth: 960 }}>{title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt="" width={54} height={54} />
              <span style={{ fontWeight: 700 }}>{BRAND.name}</span>
              <span style={{ opacity: 0.6 }}>· {BRAND.domain}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
