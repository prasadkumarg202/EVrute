'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/index';
import { useToast } from '@/components/ui/toast';

export function CopyReferralButton({ code }: { readonly code: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.push({ tone: 'danger', title: 'Could not copy', description: 'Copy the code manually instead.' });
    }
  }

  return (
    <Button variant="secondary" onClick={() => void handleCopy()}>
      {copied ? 'Copied!' : 'Copy code'}
    </Button>
  );
}
