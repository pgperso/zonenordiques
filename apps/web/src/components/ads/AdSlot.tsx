'use client';

import { useEffect, useRef, useState } from 'react';
import { ADSENSE_CLIENT_ID } from '@arena/shared';

export type AdFormat =
  | 'rectangle'
  | 'leaderboard'
  | 'skyscraper'
  | 'anchor'
  | 'half-page'
  | 'large-rectangle'
  | 'large-mobile-banner'
  | 'in-feed'
  | 'in-article';

interface AdSlotProps {
  slotId: string;
  format?: AdFormat;
  className?: string;
  layoutKey?: string;
}

const FORMAT_SIZES: Record<string, { width: string; height: string }> = {
  rectangle: { width: '300px', height: '250px' },
  leaderboard: { width: '728px', height: '90px' },
  skyscraper: { width: '160px', height: '600px' },
  anchor: { width: '100%', height: '100px' },
  'half-page': { width: '300px', height: '600px' },
  'large-rectangle': { width: '336px', height: '280px' },
  'large-mobile-banner': { width: '320px', height: '100px' },
  'in-feed': { width: '100%', height: '250px' },
  'in-article': { width: '100%', height: '250px' },
};

// Map human-readable slot names to real AdSense slot IDs
const SLOT_MAP: Record<string, string> = {
  'article-in-content': '2277466168',
  'article-end': '4193183068',
  'article-sidebar': '1974213839',
  'home-mid-banner': '6787556814',
  'home-bottom': '7034968820',
  'mobile-anchor': '5474475141',
  'sidebar-left': '6899237458',
  'sidebar-right': '5586155788',
  'about-sidebar': '2684863538',
  'contact-bottom': '3958416756',
  'terms-bottom': '2645335081',
  'podcast-below-description': '6723241541',
  'press-hero-banner': '3236362029',
  'press-sidebar': '3787026366',
};

// Feed ads all use the same slot
function resolveSlotId(slotId: string): string {
  if (slotId.startsWith('feed-ad-press-')) return '8049705004';
  if (slotId.startsWith('feed-ad-') || slotId.startsWith('content-feed-')) return '5095404454';
  return SLOT_MAP[slotId] || slotId;
}

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

const isDev = process.env.NODE_ENV === 'development';

/**
 * AdSense ad slot with IntersectionObserver lazy loading.
 * In development, automatically renders a placeholder.
 */
export function AdSlot({ slotId, format = 'rectangle', className = '', layoutKey }: AdSlotProps) {
  if (isDev) {
    return <AdSlotPlaceholder format={format} label={`${format} (${slotId})`} className={className} />;
  }

  return <AdSlotLive slotId={slotId} format={format} className={className} layoutKey={layoutKey} />;
}

function AdSlotLive({ slotId, format = 'rectangle', className = '', layoutKey }: AdSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);
  const [visible, setVisible] = useState(false);
  const size = FORMAT_SIZES[format];
  const isFluid = format === 'in-feed' || format === 'in-article';
  const isInArticle = format === 'in-article';

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || pushed.current) return;
    pushed.current = true;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense not loaded (ad blocker)
    }
  }, [visible]);

  // Container: fluid ads need flexible height, display ads need min-height only
  const containerStyle = isFluid
    ? { minHeight: '100px', width: '100%' }
    : { minHeight: size.height, maxWidth: '100%', width: '100%' };

  // Ins style: fluid = block, display = block responsive (no fixed dimensions)
  const insStyle = isFluid
    ? isInArticle
      ? { display: 'block', textAlign: 'center' as const }
      : { display: 'block' }
    : { display: 'block' };

  return (
    <div
      ref={containerRef}
      className={`flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1e1e] ${className}`}
      style={containerStyle}
    >
      {visible ? (
        <ins
          className="adsbygoogle"
          style={insStyle}
          data-ad-client={ADSENSE_CLIENT_ID}
          data-ad-slot={resolveSlotId(slotId)}
          data-ad-format={isFluid ? 'fluid' : 'auto'}
          data-ad-layout={isInArticle ? 'in-article' : undefined}
          data-ad-layout-key={format === 'in-feed' && layoutKey ? layoutKey : undefined}
          data-full-width-responsive="true"
        />
      ) : (
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Publicité</p>
      )}
    </div>
  );
}

/**
 * Placeholder ad slot for development and preview.
 */
export function AdSlotPlaceholder({
  format = 'rectangle',
  label,
  className = '',
}: {
  format?: AdFormat;
  label?: string;
  className?: string;
}) {
  const size = FORMAT_SIZES[format];
  const isFluid = format === 'in-feed' || format === 'in-article';

  return (
    <div
      className={`flex items-center justify-center rounded-lg border border-dashed border-ad-border bg-ad-bg ${className}`}
      style={
        isFluid
          ? { width: '100%', minHeight: '100px', maxWidth: '100%' }
          : { width: size.width, height: size.height, maxWidth: '100%' }
      }
    >
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Publicité</p>
        {label && <p className="mt-0.5 text-[10px] text-gray-300">{label}</p>}
      </div>
    </div>
  );
}
