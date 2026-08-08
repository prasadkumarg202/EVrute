'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';

type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'evrute-theme';

const OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/**
 * Theme control.
 *
 * The design tokens have supported dark mode from the start and
 * `ThemeScript` applies the stored choice before first paint — but nothing
 * ever wrote to that key, so dark mode was unreachable unless a user's OS
 * happened to prefer it. This is the missing writer.
 *
 * "System" removes the key rather than storing a resolved value, so the app
 * keeps following the OS if the user later changes it.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setChoice(stored === 'light' || stored === 'dark' ? stored : 'system');
    setMounted(true);
  }, []);

  // Keep following the OS while "system" is selected.
  useEffect(() => {
    if (choice !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [choice]);

  function select(next: ThemeChoice) {
    setChoice(next);
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY);
      document.documentElement.classList.toggle(
        'dark',
        window.matchMedia('(prefers-color-scheme: dark)').matches,
      );
      return;
    }
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex rounded-xl border border-[var(--border-strong)] bg-[var(--surface-sunken)] p-1"
    >
      {OPTIONS.map((option) => {
        // Before mount we cannot know the stored value without risking a
        // hydration mismatch, so nothing is marked selected until then.
        const selected = mounted && choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => select(option.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
              selected
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
