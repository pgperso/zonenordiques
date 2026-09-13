import { meterOgImage, OG_SIZE } from '@/lib/meterOgImage';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Exposmètre';

export default function Image() {
  return meterOgImage('exposmetre');
}
