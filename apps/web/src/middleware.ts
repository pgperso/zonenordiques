import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { updateSession, type RouteKind } from '@/lib/supabase/middleware';
import { routing } from '@/i18n/routing';
import legacyRedirects from '@/lib/legacyRedirects.json';

const intlMiddleware = createIntlMiddleware(routing);

// Zone Nordiques is a single-community site; legacy PHP URLs all map to it.
const ZN_LOCALE = 'fr';
const ZN_TRIBUNE = 'zone-nordiques';

// 301-redirect the old site's PHP URLs (still indexed by Google) to their
// new pages, preserving SEO. Runs BEFORE next-intl so "/chroniques.php" isn't
// first bounced to "/fr/chroniques.php" (a 307 we'd return early on). Unknown
// or since-removed content lands softly on the gallery / tribune instead of 404.
function legacyPhpRedirect(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== '/chroniques.php' && pathname !== '/podcasts.php') return null;

  const url = request.nextUrl.clone();
  url.search = '';

  if (pathname === '/chroniques.php') {
    const no = searchParams.get('no_chronique');
    const slug = no ? (legacyRedirects.articles as Record<string, string>)[no] : undefined;
    url.pathname = slug
      ? `/${ZN_LOCALE}/tribunes/${ZN_TRIBUNE}/articles/${slug}`
      : `/${ZN_LOCALE}`;
  } else {
    const no = searchParams.get('no_podcast');
    const pid = no ? (legacyRedirects.podcasts as Record<string, number>)[no] : undefined;
    url.pathname = pid
      ? `/${ZN_LOCALE}/tribunes/${ZN_TRIBUNE}/podcasts/${pid}`
      : `/${ZN_LOCALE}/tribunes/${ZN_TRIBUNE}`;
  }
  return NextResponse.redirect(url, 301);
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // microphone=(self) enables the voice-dictation feature for the chat
  // input while keeping the capability locked down for embeds and
  // third-party scripts. The two were `camera=(), microphone=()` —
  // i.e. blocked for everyone including the page itself — which made
  // every getUserMedia call reject with a Permissions-Policy violation
  // before the browser even checked user-level permissions.
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), autoplay=(self)',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://pagead2.googlesyndication.com https://www.googletagservices.com https://adservice.google.com https://www.google.com https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://pagead2.googlesyndication.com https://*.google.com https://*.doubleclick.net https://*.adtrafficquality.google https://*.google-analytics.com",
    "font-src 'self'",
    "media-src 'self' https://*.supabase.co",
    "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://*.adtrafficquality.google https://www.youtube.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://pagead2.googlesyndication.com https://*.google.com https://*.doubleclick.net https://*.googlesyndication.com https://*.adtrafficquality.google https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function applySecurityHeaders(response: NextResponse, nonce: string) {
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
}

function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/(fr|en)(\/.*)?$/);
  return match ? match[2] || '/' : pathname;
}

function classifyRoute(cleanPath: string): RouteKind {
  if (cleanPath.startsWith('/vestiaire') || cleanPath.startsWith('/admin')) {
    return 'protected';
  }
  if (
    cleanPath.startsWith('/login') ||
    cleanPath.startsWith('/register') ||
    cleanPath.startsWith('/reset-password')
  ) {
    return 'auth-page';
  }
  if (cleanPath.startsWith('/update-password')) {
    return 'update-password';
  }
  return 'public';
}

// Supabase SSR stores its session under cookies whose name follows the
// pattern sb-<project-ref>-auth-token, optionally split into chunks
// (.0, .1, ...) when the JWT is large. Presence of *any* such cookie is
// our signal that this request is from a (probably) logged-in visitor
// whose session needs refreshing; absence means we can skip Supabase
// entirely and serve public pages without a network round-trip.
function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));
}

export async function middleware(request: NextRequest) {
  // Legacy PHP URL redirects run first — they need no locale/auth handling.
  const legacy = legacyPhpRedirect(request);
  if (legacy) return legacy;

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // i18n handles locale negotiation and may issue a redirect. Those
  // redirects don't need an auth decision, so return early.
  const intlResponse = intlMiddleware(request);
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    applySecurityHeaders(intlResponse, nonce);
    return intlResponse;
  }

  const cleanPath = stripLocale(request.nextUrl.pathname);
  const routeKind = classifyRoute(cleanPath);

  // Anonymous visitors on public pages take the fast path: no Supabase
  // call, no failure mode tied to Supabase availability. This is the
  // overwhelming majority of traffic (home, /tribunes/*, articles).
  const needsSupabase = routeKind !== 'public' || hasSupabaseAuthCookie(request);

  const response = needsSupabase
    ? await updateSession(request, requestHeaders, routeKind)
    : NextResponse.next({ request: { headers: requestHeaders } });

  applySecurityHeaders(response, nonce);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|images/|api/|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|xml|ico)$).*)',
  ],
};
