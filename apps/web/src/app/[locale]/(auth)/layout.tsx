import type { Metadata } from 'next';

/**
 * Nothing under /(auth) belongs in a search index.
 *
 * /login and /register each declared `robots: { index: false }` themselves,
 * but /reset-password and /update-password are `'use client'` pages with no
 * metadata at all — so they inherited the root layout's `index: true` AND
 * its `alternates.canonical: BRAND.url`. A crawler saw an indexable
 * password-reset form claiming to be the home page.
 *
 * Declaring it on the segment covers the two that were missing it and any
 * auth page added later; a page that exports its own metadata still wins.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
