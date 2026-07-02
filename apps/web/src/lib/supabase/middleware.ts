import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export type RouteKind = 'protected' | 'auth-page' | 'update-password' | 'public';

// Hard ceiling for the Supabase auth call. Vercel's Edge runtime kills
// middleware invocations around 25–30s; anything close to that surfaces
// to users as a 504 MIDDLEWARE_INVOCATION_TIMEOUT. We race getUser()
// against this timeout and treat a timeout as "no user", so a Supabase
// hiccup never takes down the whole site.
const AUTH_TIMEOUT_MS = 3000;

type AuthResult = { user: { id: string } | null; timedOut: boolean };

// Minimal structural type — getUserWithTimeout only ever calls auth.getUser().
type SupabaseAuthLike = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

async function getUserWithTimeout(
  supabase: SupabaseAuthLike,
): Promise<AuthResult> {
  const authPromise: Promise<AuthResult> = supabase.auth.getUser().then(
    ({ data }: { data: { user: { id: string } | null } }) => ({
      user: data.user,
      timedOut: false,
    }),
    () => ({ user: null, timedOut: false }),
  );

  const timeoutPromise = new Promise<AuthResult>((resolve) => {
    setTimeout(() => resolve({ user: null, timedOut: true }), AUTH_TIMEOUT_MS);
  });

  return Promise.race([authPromise, timeoutPromise]);
}

/**
 * Runs the Supabase session refresh and enforces route-level auth rules.
 * Only invoke this from middleware.ts when the caller has already decided
 * the route actually needs an auth decision (protected/auth-page) or that
 * the visitor has a Supabase session cookie worth refreshing. Anonymous
 * visitors on public pages should bypass this entirely so a Supabase
 * outage cannot stall every render.
 */
export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers,
  routeKind: RouteKind,
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { user } = await getUserWithTimeout(supabase);

  // Fail closed on protected routes: a timed-out or missing user is
  // treated as anonymous and bounced to /login. The original path is
  // preserved in ?redirect= so the user lands back where they wanted.
  if (routeKind === 'protected' && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect already-authenticated users away from /login, /register,
  // /reset-password. If getUser timed out we have no opinion and let
  // the page render — better a logged-in user sees the login form
  // briefly than a 504 for everyone when Supabase blips.
  if (routeKind === 'auth-page' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // /update-password is always allowed through regardless of auth state
  // (the recovery flow lands here with a one-time token).
  return supabaseResponse;
}
