import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BRAND } from '@/lib/brand';

export const alt = `${BRAND.name} - Tribunes sportives en direct`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function TwitterImage() {
  const logoData = readFileSync(join(process.cwd(), 'public/images/fanstribune.png'));
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BRAND.colors.blue,
          color: BRAND.colors.white,
        }}
      >
        <img src={logoSrc} width={160} height={160} style={{ marginBottom: 40 }} />
        <div style={{ fontSize: 56, fontWeight: 700, marginBottom: 16 }}>
          {BRAND.name}
        </div>
        <div style={{ fontSize: 28, opacity: 0.85 }}>
          {BRAND.tagline}
        </div>
      </div>
    ),
    { ...size },
  );
}
