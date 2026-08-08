import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware does two jobs on every request:
 *
 * 1. Refreshes the Supabase session. Access tokens are short-lived; without
 *    this, a user is silently signed out mid-charge.
 * 2. Gates routes by role, reading the role from the database rather than a
 *    JWT claim that could be stale after a demotion.
 *
 * This is a convenience boundary, not the security boundary. RLS is. A
 * request that slips past middleware still cannot read another tenant's
 * rows, which is what makes the whole design safe.
 */

const ROLE_PREFIXES = [
  { prefix: '/owner', roles: ['owner', 'admin'] },
  { prefix: '/admin', roles: ['admin', 'employee'] },
] as const;

const AUTH_REQUIRED_PREFIXES = ['/wallet', '/history', '/vehicles', '/rewards', '/session', '/account'];

const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|js|css|woff2?)$/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_FILE.test(pathname) || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // A response that sets an auth cookie must never be cached by a
          // CDN or reverse proxy — one user's session token would then be
          // served to the next visitor. @supabase/ssr 0.7 does not pass
          // these headers to setAll (a later version does), so we set them
          // ourselves rather than relying on the library.
          response.headers.set(
            'Cache-Control',
            'private, no-cache, no-store, must-revalidate, max-age=0',
          );
          response.headers.set('Expires', '0');
          response.headers.set('Pragma', 'no-cache');
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth =
    AUTH_REQUIRED_PREFIXES.some((p) => pathname.startsWith(p)) ||
    ROLE_PREFIXES.some((r) => pathname.startsWith(r.prefix));

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const roleGate = ROLE_PREFIXES.find((r) => pathname.startsWith(r.prefix));
  if (roleGate && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    const role = profile?.role;
    if (!profile?.is_active || !role || !roleGate.roles.includes(role as never)) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('error', 'forbidden');
      return NextResponse.redirect(url);
    }
  }

  // Signed-in users have no business on the login screen.
  if (pathname === '/login' && user) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.searchParams.get('next') ?? '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the service worker and the webhook
     * routes. Webhooks authenticate with an HMAC signature, not a cookie —
     * running session refresh on them would be pure latency.
     */
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|api/webhooks|api/cron|icons/).*)',
  ],
};
