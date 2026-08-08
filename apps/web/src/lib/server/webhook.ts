import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@evrute/db/types';

type AdminClient = SupabaseClient<Database>;

/** Mirrors the `webhook_events.source` check constraint in `0008_ops.sql`. */
export type WebhookSource = 'charging_provider' | 'razorpay' | 'cashfree';

export interface RecordWebhookEventInput {
  readonly source: WebhookSource;
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly signature: string | null;
}

export interface WebhookRecord {
  readonly id: string;
  readonly alreadyProcessed: boolean;
}

/**
 * Returns the exact request bytes, unparsed.
 *
 * Signature verification MUST run over the raw body: re-serialising a
 * parsed JSON object changes key order and whitespace and silently breaks
 * every HMAC comparison. Call this before `request.json()` anywhere near a
 * webhook route.
 */
export async function readRawBody(request: Request): Promise<string> {
  return request.text();
}

/**
 * Record-then-process idempotency for inbound webhooks.
 *
 * Must be called AFTER the signature has been verified and BEFORE any
 * side-effecting work starts. The unique `(source, event_id)` index on
 * `webhook_events` is what turns a provider redelivery into a no-op instead
 * of a double-credit or a double-stop; the caller just needs to check
 * `alreadyProcessed` and skip processing (while still returning 200).
 */
export async function recordWebhookEvent(
  admin: AdminClient,
  input: RecordWebhookEventInput,
): Promise<WebhookRecord> {
  const { data: existing, error: selectError } = await admin
    .from('webhook_events')
    .select('id, processed_at, attempts')
    .eq('source', input.source)
    .eq('event_id', input.eventId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`failed to look up webhook_events: ${selectError.message}`);
  }

  if (existing) {
    await admin
      .from('webhook_events')
      .update({ attempts: existing.attempts + 1 })
      .eq('id', existing.id);
    return { id: existing.id, alreadyProcessed: existing.processed_at !== null };
  }

  const { data: inserted, error: insertError } = await admin
    .from('webhook_events')
    .insert({
      source: input.source,
      event_id: input.eventId,
      event_type: input.eventType,
      payload: input.payload as Json,
      signature: input.signature,
      attempts: 1,
    })
    .select('id')
    .single();

  if (insertError) {
    // A concurrent redelivery can race us between the select and the
    // insert; the unique (source, event_id) index turns that into a 23505
    // here. Treat it exactly like "already recorded" rather than a 500.
    if (insertError.code === '23505') {
      const { data: raced, error: racedError } = await admin
        .from('webhook_events')
        .select('id, processed_at')
        .eq('source', input.source)
        .eq('event_id', input.eventId)
        .single();
      if (racedError || !raced) {
        throw new Error(
          `failed to resolve concurrent webhook insert: ${racedError?.message ?? 'row not found'}`,
        );
      }
      return { id: raced.id, alreadyProcessed: raced.processed_at !== null };
    }
    throw new Error(`failed to record webhook event: ${insertError.message}`);
  }

  return { id: inserted.id, alreadyProcessed: false };
}

export async function markWebhookProcessed(admin: AdminClient, id: string): Promise<void> {
  const { error } = await admin
    .from('webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    throw new Error(`failed to mark webhook event processed: ${error.message}`);
  }
}

export async function markWebhookFailed(
  admin: AdminClient,
  id: string,
  message: string,
): Promise<void> {
  const { error } = await admin
    .from('webhook_events')
    .update({ last_error: message.slice(0, 2000) })
    .eq('id', id);
  if (error) {
    // Best-effort bookkeeping only; never let a failure to record the
    // failure mask the original processing error from the caller's logs.
    console.error('failed to record webhook processing failure', { id, error: error.message });
  }
}
