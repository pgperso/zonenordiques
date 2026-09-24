import { notFound } from 'next/navigation';
import { SITE } from '@/lib/siteConfig';

/** MLB game pages exist only on the baseball brand. See lnh/layout.tsx. */
export default function MlbLayout({ children }: { children: React.ReactNode }) {
  if (SITE.category !== 'baseball') notFound();
  return <>{children}</>;
}
