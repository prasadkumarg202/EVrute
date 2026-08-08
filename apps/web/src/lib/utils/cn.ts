import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with correct precedence.
 * `clsx` handles conditionals; `twMerge` resolves conflicts so a caller's
 * `px-6` actually overrides a component's default `px-4`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
