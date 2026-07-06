import { BRAND } from '@/lib/brand';

// Professional fallback cover for content with no image (e.g. the imported
// Zone Nordiques archive, which had no cover field). Instead of a flat gray
// box, render an on-brand Nordiques-blue gradient with the piece's initial as
// a faint watermark. The gradient + initial are derived deterministically from
// a seed so the gallery gets subtle variety instead of a wall of identical
// tiles, while staying inside the brand palette.

const PALETTE: [string, string][] = [
  ['#003E7E', '#0B4E90'],
  ['#00284F', '#1969B4'],
  ['#0A4F86', '#4E93C9'],
  ['#002B57', '#0B4870'],
  ['#013B74', '#2C7DBE'],
  ['#00325F', '#3A86C4'],
];

function variantFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  return { colors: PALETTE[h % PALETTE.length], angle: 110 + (h % 60) };
}

interface Props {
  title: string;
  /** Stable seed for the gradient/letter variant (defaults to the title).
   *  Accepts a number (e.g. article id) — coerced to string. */
  seed?: string | number;
}

export function ArticleCoverPlaceholder({ title, seed }: Props) {
  const { colors, angle } = variantFor(String(seed ?? title ?? BRAND.name));
  const initial = (title.trim()[0] || BRAND.shortName[0] || 'Z').toUpperCase();
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ backgroundImage: `linear-gradient(${angle}deg, ${colors[0]}, ${colors[1]})` }}
      aria-hidden="true"
    >
      <span className="select-none text-6xl font-black leading-none text-white/10 sm:text-7xl">
        {initial}
      </span>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
    </div>
  );
}
