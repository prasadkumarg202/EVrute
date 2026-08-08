'use server';

import { revalidatePath } from 'next/cache';
import { tariffSchema } from '@/lib/validation/tariff';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { fieldErrorsFromIssues, type EntityActionState } from '@/lib/entity-action-state';

/**
 * Adds a new tariff version for a station (optionally scoped to one
 * connector type). Tariffs are append-only: the currently open row for the
 * same (station, connector_type) bucket has its `effective_to` closed at
 * the new row's `effective_from` first, then the new row is inserted — in
 * that order, so the exclusion constraint never sees an overlap.
 */
export async function createTariffAction(
  stationId: string,
  _prevState: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  await requireRole('owner', 'admin');

  const rawConnectorType = formData.get('connectorType');
  const parsed = tariffSchema.safeParse({
    connectorType: rawConnectorType,
    pricePerKwh: formData.get('pricePerKwh'),
    sessionFee: formData.get('sessionFee'),
    idleFeePerMin: formData.get('idleFeePerMin'),
    minBalanceToStart: formData.get('minBalanceToStart'),
    taxPct: formData.get('taxPct'),
    effectiveFrom: formData.get('effectiveFrom'),
  });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  }

  const v = parsed.data;
  const connectorType = v.connectorType === '' ? null : v.connectorType;
  const effectiveFromIso = new Date(v.effectiveFrom).toISOString();
  const supabase = await createSupabaseServerClient();

  // Close the currently-open tariff in the same bucket, if any.
  let openQuery = supabase
    .from('tariffs')
    .update({ effective_to: effectiveFromIso })
    .eq('station_id', stationId)
    .is('effective_to', null);
  openQuery = connectorType ? openQuery.eq('connector_type', connectorType) : openQuery.is('connector_type', null);
  const { error: closeError } = await openQuery;

  if (closeError) {
    return { status: 'error', fieldErrors: {}, formError: closeError.message };
  }

  const { error: insertError } = await supabase.from('tariffs').insert({
    station_id: stationId,
    connector_type: connectorType,
    price_per_kwh: v.pricePerKwh,
    session_fee: v.sessionFee,
    idle_fee_per_min: v.idleFeePerMin,
    min_balance_to_start: v.minBalanceToStart,
    tax_pct: v.taxPct,
    effective_from: effectiveFromIso,
  });

  if (insertError) {
    if (insertError.code === '23P01') {
      return {
        status: 'error',
        fieldErrors: {},
        formError:
          'This pricing window overlaps an existing one for the same connector type. Choose a later start time.',
      };
    }
    return { status: 'error', fieldErrors: {}, formError: insertError.message };
  }

  revalidatePath(`/owner/stations/${stationId}/pricing`);
  return { status: 'success', fieldErrors: {} };
}
