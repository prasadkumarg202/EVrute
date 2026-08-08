'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, Sheet } from '@/components/ui/index';
import { signOutAction } from '@/lib/actions/auth';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" fullWidth loading={pending}>
      Sign out
    </Button>
  );
}

/**
 * Sign out, behind a confirmation.
 *
 * Not because signing out is destructive, but because on a phone this
 * control sits a thumb-width from the rest of the account screen, and an
 * accidental tap mid-charge means fumbling a password back in while the
 * car is plugged in.
 */
export function SignOutButton() {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button variant="secondary" fullWidth onClick={() => setConfirming(true)}>
        Sign out
      </Button>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Sign out?"
        footer={
          <form action={signOutAction} className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <SubmitButton />
          </form>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          You will need to sign in again on this device. Any charging session already
          running will continue — it is not cancelled by signing out.
        </p>
      </Sheet>
    </>
  );
}
