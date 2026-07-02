import { permanentRedirect } from 'next/navigation';

// The Press Gallery used to live at /galerie-de-presse; it's now the home.
// This page only exists to 301 legacy URLs (external links, old indexed pages).
export default async function PressGalleryRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  permanentRedirect(`/${locale}`);
}
