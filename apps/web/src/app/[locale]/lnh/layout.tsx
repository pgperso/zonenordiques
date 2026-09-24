import { notFound } from 'next/navigation';
import { SITE } from '@/lib/siteConfig';

/**
 * Everything under /lnh is NHL-specific: the pool and the game pages.
 *
 * All brands deploy the same codebase, so without this gate those routes
 * answered on the baseball and football domains too — indexable, with that
 * domain's canonical tag, describing a hockey pool. Gating the segment
 * rather than each page means a new sub-route cannot be forgotten.
 */
export default function LnhLayout({ children }: { children: React.ReactNode }) {
  if (SITE.category !== 'hockey') notFound();
  return <>{children}</>;
}
