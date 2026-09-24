import { notFound } from 'next/navigation';
import { SITE } from '@/lib/siteConfig';

/**
 * The fantasy pool is opt-in per deployment (NEXT_PUBLIC_SITE_POOL), on top
 * of the hockey-only gate in the parent layout. A brand that has turned the
 * pool off should not merely hide the menu link — the pages must not answer.
 */
export default function PoolLayout({ children }: { children: React.ReactNode }) {
  if (!SITE.showPool) notFound();
  return <>{children}</>;
}
