import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { defaultLandingFor, safeNextPath } from '@/lib/auth/landing';

/**
 * OAuth (Google) redirect target. Exchanges the PKCE `code` Supabase Auth
 * appends after the provider round trip for a session, then sends the
 * browser on to wherever the login flow started from — or, when it started
 * from nowhere in particular, to the surface this user's role actually uses.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const requested = safeNextPath(url.searchParams.get('next'));

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Expired or replayed code. Send them back to sign in rather than to a
      // page that will bounce them straight out again.
      const login = new URL('/login', url.origin);
      login.searchParams.set('error', 'oauth_failed');
      return NextResponse.redirect(login);
    }
  }

  if (requested) return NextResponse.redirect(new URL(requested, url.origin));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let destination = '/';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    destination = defaultLandingFor(profile?.role ?? null);
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
