import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@evrute/db/types';
import { env, serverEnv } from '@/lib/env';

/**
 * Request-scoped Supabase client for Server Components, Server Actions and
 * Route Handlers. Runs as the signed-in user, so every query is subject to
 * RLS — the app cannot accidentally read another user's rows.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Middleware refreshes the
            // session on every request, so swallowing this is correct rather
            // than merely convenient.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only ever used from webhook handlers and scheduled jobs, where there is
 * no user to act as. Never import this into anything that renders, and
 * never derive the acting user from client input when using it.
 */
export function createSupabaseAdminClient() {
  // Must come from serverEnv(): `env` is the PUBLIC schema and does not
  // carry secrets, so reading the key off it silently yields undefined.
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. Webhook and job routes cannot run without it.',
    );
  }

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-evrute-client': 'service-role' } },
  });
}

export type AppRole = Database['public']['Enums']['app_role'];

export interface SessionUser {
  readonly id: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly fullName: string;
  readonly role: AppRole;
  readonly referralCode: string;
  readonly avatarUrl: string | null;
}

/**
 * The authenticated user plus their profile, or null.
 *
 * Uses `getUser()`, not `getSession()`: getSession reads the cookie without
 * verifying it against the auth server, so a forged cookie would pass. This
 * is the difference between an auth check and the appearance of one.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, phone, full_name, role, referral_code, avatar_url, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    email: profile.email,
    phone: profile.phone,
    fullName: profile.full_name,
    role: profile.role,
    referralCode: profile.referral_code,
    avatarUrl: profile.avatar_url,
  };
}

/** Throws unless the caller holds one of `roles`. Use at the top of any privileged action. */
export async function requireRole(...roles: readonly AppRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('unauthenticated');
  if (roles.length > 0 && !roles.includes(user.role)) throw new AuthError('forbidden');
  return user;
}

export class AuthError extends Error {
  constructor(readonly kind: 'unauthenticated' | 'forbidden') {
    super(kind === 'unauthenticated' ? 'Sign in to continue' : 'You do not have access to this');
    this.name = 'AuthError';
  }
}
