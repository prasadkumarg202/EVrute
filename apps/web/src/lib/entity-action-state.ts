/**
 * Shared shape for server-action results driving `useActionState` in small
 * create/edit forms (chargers, connectors, tariffs, coupons, ...).
 *
 * Lives outside any `'use server'` file: a file with that directive may
 * only export async functions, not plain constants/types.
 */

export interface EntityActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly fieldErrors: Record<string, string>;
  readonly formError?: string;
}

export const INITIAL_ENTITY_STATE: EntityActionState = { status: 'idle', fieldErrors: {} };

export function fieldErrorsFromIssues(
  issues: readonly { path: (string | number)[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in errors)) errors[key] = issue.message;
  }
  return errors;
}
