'use client';

import { useRouter } from 'next/navigation';
import { defaultLandingFor } from '@/lib/auth/landing';
import { useEffect, useState } from 'react';
import { Button, Field } from '@/components/ui/index';
import { useToast } from '@/components/ui/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';

type Method = 'phone' | 'email';
type EmailMode = 'signin' | 'signup';

export function LoginClient({
  next,
  forbidden,
}: {
  readonly next: string | null;
  readonly forbidden: boolean;
}) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const toast = useToast();

  const [method, setMethod] = useState<Method>('phone');
  const [emailMode, setEmailMode] = useState<EmailMode>('signin');

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [signupSent, setSignupSent] = useState(false);

  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (forbidden) {
      toast.push({
        tone: 'warning',
        title: "You don't have access to that page",
        description: 'Signed in, but with a different role.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Route after a successful sign-in.
   *
   * An explicit `?next=` always wins — it means the user was deep-linking to
   * a page and got bounced through login. Otherwise land them on the surface
   * their role actually uses: an owner on /owner, staff on /admin.
   */
  async function goNext() {
    if (next) {
      router.replace(next);
      router.refresh();
      return;
    }

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

    router.replace(destination);
    router.refresh();
  }

  async function handleSendOtp() {
    setPhoneError(null);
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
      setPhoneError('Enter your number with country code, e.g. +919876543210');
      return;
    }
    setPhoneBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setPhoneBusy(false);
    if (error) {
      setPhoneError(error.message);
      return;
    }
    setOtpSent(true);
  }

  async function handleVerifyOtp() {
    setPhoneError(null);
    setPhoneBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    setPhoneBusy(false);
    if (error) {
      setPhoneError(error.message);
      return;
    }
    void goNext();
  }

  async function handleEmailSubmit() {
    setEmailError(null);
    setEmailBusy(true);

    if (emailMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setEmailBusy(false);
      if (error) {
        setEmailError(error.message);
        return;
      }
      if (!data.session) {
        // Email confirmation is required before a session exists.
        setSignupSent(true);
        return;
      }
      void goNext();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setEmailBusy(false);
    if (error) {
      setEmailError(error.message);
      return;
    }
    void goNext();
  }

  async function handleGoogle() {
    setGoogleBusy(true);
    // Omit `next` entirely when the user didn't ask for a page — the
    // callback then routes by role rather than defaulting to the map.
    const redirectTo = next
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) {
      setGoogleBusy(false);
      toast.push({ tone: 'danger', title: 'Could not start Google sign-in', description: error.message });
    }
    // On success the browser navigates away to Google; nothing else to do here.
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Welcome to EVRute</h1>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Sign in to start charging.</p>

        <div className="mt-6 flex rounded-xl bg-[var(--surface-sunken)] p-1" role="tablist" aria-label="Sign-in method">
          {(['phone', 'email'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              onClick={() => setMethod(m)}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors',
                method === m
                  ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)]',
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {method === 'phone' && (
          <div className="mt-5 space-y-3">
            <Field
              label="Phone number"
              type="tel"
              placeholder="+919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={otpSent}
              {...(phoneError ? { error: phoneError } : {})}
            />
            {otpSent && (
              <Field
                label="One-time code"
                inputMode="numeric"
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            )}
            {otpSent ? (
              <Button fullWidth loading={phoneBusy} onClick={() => void handleVerifyOtp()} disabled={otp.length < 4}>
                Verify code
              </Button>
            ) : (
              <Button fullWidth loading={phoneBusy} onClick={() => void handleSendOtp()}>
                Send code
              </Button>
            )}
            {otpSent && (
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtp('');
                }}
                className="text-xs font-medium text-[var(--accent)]"
              >
                Use a different number
              </button>
            )}
          </div>
        )}

        {method === 'email' && (
          <div className="mt-5 space-y-3">
            {signupSent ? (
              <p className="rounded-lg bg-success-50 px-3 py-2.5 text-sm text-success-700 dark:bg-success-700/20 dark:text-success-500">
                Check {email} for a confirmation link to finish creating your account.
              </p>
            ) : (
              <>
                {emailMode === 'signup' && (
                  <Field label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                )}
                <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Field
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  {...(emailError ? { error: emailError } : {})}
                  {...(emailMode === 'signup' ? { hint: 'At least 8 characters' } : {})}
                />
                <Button
                  fullWidth
                  loading={emailBusy}
                  disabled={!email || password.length < 6}
                  onClick={() => void handleEmailSubmit()}
                >
                  {emailMode === 'signin' ? 'Sign in' : 'Create account'}
                </Button>
                <button
                  type="button"
                  onClick={() => setEmailMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                  className="text-xs font-medium text-[var(--accent)]"
                >
                  {emailMode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </button>
              </>
            )}
          </div>
        )}

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--border-subtle)]" />
          <span className="text-xs text-[var(--text-muted)]">or</span>
          <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        </div>
        <Button variant="secondary" fullWidth loading={googleBusy} onClick={() => void handleGoogle()}>
          Continue with Google
        </Button>
      </div>
    </div>
  );
}
