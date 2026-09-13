import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { BRAND } from '@/lib/brand';
import { METER_CONFIGS, type MeterKey } from '@/lib/meterConfig';

export const OG_SIZE = { width: 1200, height: 630 };

// Branded 1200x630 social card for a meter page: the dial gauge on the left, the
// live confidence index (big %) + verdict on the right, over the meter's colour
// gradient. Shared by /nordiquometre and /exposmetre.
export async function meterOgImage(meter: MeterKey) {
  const cfg = METER_CONFIGS[meter];

  const dial = readFileSync(join(process.cwd(), 'public', cfg.image.replace(/^\/+/, '')));
  const dialSrc = `data:image/png;base64,${dial.toString('base64')}`;
  const logoBytes = readFileSync(join(process.cwd(), 'public', BRAND.logoPngPath.replace(/^\/+/, '')));
  const logoSrc = `data:image/png;base64,${logoBytes.toString('base64')}`;

  // Live index — best-effort; a card must still render if the query fails.
  let avg = 0;
  let total = 0;
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await db.from(`${meter}_votes`).select('vote');
    const votes = (data as { vote: number }[] | null) ?? [];
    total = votes.length;
    if (total > 0) avg = Math.round(votes.reduce((a, v) => a + v.vote, 0) / total);
  } catch {
    /* keep the zeroed defaults */
  }
  const verdict = cfg.verdict(avg).text;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          backgroundImage: `linear-gradient(135deg, ${cfg.gradientFrom} 0%, ${cfg.gradientTo} 100%)`,
        }}
      >
        {/* Dial */}
        <div style={{ display: 'flex', width: 500, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dialSrc} width={440} height={440} alt="" />
        </div>

        {/* Text column */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, paddingRight: 72 }}>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>
            {cfg.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 4 }}>
            <span style={{ fontSize: 150, fontWeight: 800, lineHeight: 1 }}>{avg}</span>
            <span style={{ fontSize: 80, fontWeight: 800 }}>%</span>
          </div>
          <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
            de confiance · {total} vote{total !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 34, fontWeight: 600, marginTop: 26, maxWidth: 560, lineHeight: 1.15 }}>{verdict}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 34, fontSize: 28 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} width={48} height={48} alt="" />
            <span style={{ fontWeight: 700 }}>{BRAND.name}</span>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
