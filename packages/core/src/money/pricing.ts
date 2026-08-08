/**
 * Money and pricing arithmetic.
 *
 * All amounts are INR with 2 decimal places. JavaScript numbers are binary
 * floats, so 0.1 + 0.2 !== 0.3 — every arithmetic result here is routed
 * through {@link toPaise}/{@link fromPaise} so rounding happens exactly
 * once, at a defined boundary, using the same half-up rule the Postgres
 * `compute_session_cost` function uses.
 *
 * The database is the source of truth for what a customer is charged.
 * These functions exist so the UI can show a live running cost and a
 * pre-charge estimate that match it to the paisa.
 */

/** Smallest INR unit. Razorpay and Cashfree both take amounts in paise. */
export const PAISE_PER_RUPEE = 100;

/**
 * Round half-away-from-zero to 2dp, matching Postgres `round(numeric, 2)`.
 * `Math.round` rounds half-up toward +Infinity, which is wrong for negatives,
 * and naive `* 100` introduces float error for values like 1.005.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`cannot round non-finite amount: ${value}`);
  }
  const scaled = value * PAISE_PER_RUPEE;
  // Nudge by an epsilon proportional to magnitude to correct representation
  // error before rounding (e.g. 37802.000000000004 -> 37802).
  const corrected = scaled + (scaled >= 0 ? 1 : -1) * Number.EPSILON * Math.abs(scaled);
  const rounded = Math.sign(corrected) * Math.round(Math.abs(corrected));
  return rounded / PAISE_PER_RUPEE;
}

export function toPaise(rupees: number): number {
  return Math.round(roundMoney(rupees) * PAISE_PER_RUPEE);
}

export function fromPaise(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

export interface TariffSnapshot {
  readonly pricePerKwh: number;
  readonly sessionFee: number;
  readonly idleFeePerMin: number;
  readonly taxPct: number;
  readonly minBalanceToStart: number;
}

export interface CostBreakdown {
  readonly energyCost: number;
  readonly idleCost: number;
  readonly subtotal: number;
  readonly discountAmount: number;
  readonly taxAmount: number;
  readonly totalCost: number;
}

export interface CostInput {
  readonly energyKwh: number;
  readonly idleMinutes?: number;
  readonly discount?: number;
}

/**
 * Mirror of the SQL `public.compute_session_cost`. Kept deliberately
 * identical, including the order of rounding, so the figure shown on the
 * live-session screen equals the figure on the invoice.
 *
 * Order matters: energy and idle are each rounded before summing, the
 * discount is capped at the gross (never produces a credit), and tax is
 * computed on the post-discount amount.
 */
export function computeSessionCost(
  tariff: TariffSnapshot,
  input: CostInput,
): CostBreakdown {
  const energyKwh = Math.max(input.energyKwh, 0);
  const idleMinutes = Math.max(input.idleMinutes ?? 0, 0);

  const energyCost = roundMoney(energyKwh * tariff.pricePerKwh);
  const idleCost = roundMoney(idleMinutes * tariff.idleFeePerMin);
  const subtotal = roundMoney(energyCost + idleCost + tariff.sessionFee);

  const discountAmount = Math.min(roundMoney(Math.max(input.discount ?? 0, 0)), subtotal);
  const net = roundMoney(subtotal - discountAmount);
  const taxAmount = roundMoney((net * tariff.taxPct) / 100);
  const totalCost = roundMoney(net + taxAmount);

  return { energyCost, idleCost, subtotal, discountAmount, taxAmount, totalCost };
}

/**
 * Energy a wallet balance can buy, used to render "you can add about X kWh"
 * before the user commits. Returns 0 rather than a negative when the tariff
 * fixed costs already exceed the balance.
 */
export function affordableEnergyKwh(tariff: TariffSnapshot, spendable: number): number {
  const taxMultiplier = 1 + tariff.taxPct / 100;
  const fixed = tariff.sessionFee * taxMultiplier;
  const perKwh = tariff.pricePerKwh * taxMultiplier;
  if (perKwh <= 0) return 0;
  return Math.max(roundMoney((spendable - fixed) / perKwh), 0);
}

/** Minutes to add `energyKwh` at a given delivered power. */
export function estimateMinutes(energyKwh: number, powerKw: number): number {
  if (powerKw <= 0) return 0;
  return Math.max(Math.round((energyKwh / powerKw) * 60), 0);
}

/**
 * Charge time to a target state of charge, derated because EV charging
 * tapers sharply above ~80% SoC. A linear estimate is optimistic enough to
 * be a support ticket; this is the shape real batteries follow.
 */
export function estimateChargeMinutes(params: {
  readonly batteryCapacityKwh: number;
  readonly fromSocPct: number;
  readonly toSocPct: number;
  readonly powerKw: number;
}): number {
  const { batteryCapacityKwh, fromSocPct, toSocPct, powerKw } = params;
  if (powerKw <= 0 || toSocPct <= fromSocPct) return 0;

  const segment = (lo: number, hi: number, derate: number): number => {
    const overlapLo = Math.max(lo, fromSocPct);
    const overlapHi = Math.min(hi, toSocPct);
    if (overlapHi <= overlapLo) return 0;
    const kwh = (batteryCapacityKwh * (overlapHi - overlapLo)) / 100;
    return (kwh / (powerKw * derate)) * 60;
  };

  // Full rate to 80%, half rate 80-95%, quarter rate above 95%.
  const minutes = segment(0, 80, 1) + segment(80, 95, 0.5) + segment(95, 100, 0.25);
  return Math.round(minutes);
}

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INR_COMPACT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatINR(amount: number, compact = false): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return compact ? INR_COMPACT.format(value) : INR.format(value);
}

export function formatKwh(kwh: number, digits = 2): string {
  const value = Number.isFinite(kwh) ? kwh : 0;
  return `${value.toFixed(digits)} kWh`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(Math.floor(seconds), 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** CO2 avoided vs a petrol car, for the rewards screen. */
export const CO2_KG_AVOIDED_PER_KWH = 0.71;

export function carbonSavedKg(totalKwh: number): number {
  return roundMoney(Math.max(totalKwh, 0) * CO2_KG_AVOIDED_PER_KWH);
}
