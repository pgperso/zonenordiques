import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

// Per-brand favicon. Each deployment renders its OWN logo (Zone Nordiques → ZN,
// Zone Expos → ZE) from the brand PNG, so every domain shows its own tab icon.
// Env-driven via NEXT_PUBLIC_BRAND_LOGO_PNG (same value that feeds BRAND.logoUrl).
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  const rel = (process.env.NEXT_PUBLIC_BRAND_LOGO_PNG || '/images/zonenordiques.png').replace(/^\/+/, '');
  const logoData = readFileSync(join(process.cwd(), 'public', rel));
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={512} height={512} alt="" />
      </div>
    ),
    { ...size },
  );
}
