import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  // Per-brand: read the deployment's own logo (Zone Nordiques / Zone Expos).
  const rel = (process.env.NEXT_PUBLIC_BRAND_LOGO_PNG || '/images/zonenordiques.png').replace(/^\/+/, '');
  const logoData = readFileSync(join(process.cwd(), 'public', rel));
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'white',
          borderRadius: 36,
        }}
      >
        <img src={logoSrc} width={150} height={150} />
      </div>
    ),
    { ...size },
  );
}
