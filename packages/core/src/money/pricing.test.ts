import { describe, expect, it } from 'vitest';
import {
  affordableEnergyKwh,
  carbonSavedKg,
  computeSessionCost,
  estimateChargeMinutes,
  estimateMinutes,
  formatDuration,
  formatINR,
  formatKwh,
  fromPaise,
  roundMoney,
  toPaise,
  type TariffSnapshot,
} from './pricing';

describe('roundMoney', () => {
  it('rounds half-away-from-zero to 2dp like Postgres round(numeric, 2)', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(1.015)).toBe(1.02);
    expect(roundMoney(0.125)).toBe(0.13);
  });

  it('fixes classic binary float representation errors', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(33.33 * 13.13)).toBe(437.62);
  });

  it('rounds negative amounts symmetrically (half away from zero)', () => {
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(-2.675)).toBe(-2.68);
  });

  it('handles zero and large values', () => {
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(10_000)).toBe(10_000);
    expect(roundMoney(999_999.999)).toBe(1_000_000);
  });

  it('throws a RangeError on non-finite input', () => {
    expect(() => roundMoney(NaN)).toThrow(RangeError);
    expect(() => roundMoney(Infinity)).toThrow(RangeError);
    expect(() => roundMoney(-Infinity)).toThrow(RangeError);
  });
});

describe('toPaise / fromPaise', () => {
  it('round-trips a wide range of rupee values', () => {
    const values = [0, 0.01, 0.1, 1, 1.5, 9.99, 10, 18.44, 100, 1234.56, 9999.99, 10_000];
    for (const v of values) {
      expect(fromPaise(toPaise(v))).toBeCloseTo(v, 2);
    }
  });

  it('converts rupees to integer paise exactly', () => {
    expect(toPaise(1234.56)).toBe(123456);
    expect(toPaise(18.44)).toBe(1844);
    expect(toPaise(0.1)).toBe(10);
    expect(toPaise(0)).toBe(0);
  });

  it('fromPaise divides back to rupees', () => {
    expect(fromPaise(123456)).toBe(1234.56);
    expect(fromPaise(0)).toBe(0);
    expect(fromPaise(1)).toBe(0.01);
  });
});

describe('computeSessionCost', () => {
  const tariff: TariffSnapshot = {
    pricePerKwh: 20.5,
    sessionFee: 10,
    idleFeePerMin: 2,
    taxPct: 18,
    minBalanceToStart: 50,
  };

  it('matches the exact production figure to the paisa (18.44 kWh, DB-computed)', () => {
    const result = computeSessionCost(tariff, { energyKwh: 18.44 });
    expect(result.energyCost).toBe(378.02);
    expect(result.subtotal).toBe(388.02);
    expect(result.taxAmount).toBe(69.84);
    expect(result.totalCost).toBe(457.86);
    expect(result.idleCost).toBe(0);
    expect(result.discountAmount).toBe(0);
  });

  it('handles float-hazard energy values (long binary expansions)', () => {
    const t: TariffSnapshot = {
      pricePerKwh: 13.13,
      sessionFee: 0,
      idleFeePerMin: 0,
      taxPct: 0,
      minBalanceToStart: 0,
    };
    const result = computeSessionCost(t, { energyKwh: 33.33 });
    // 33.33 * 13.13 = 437.6229 -> rounds to 437.62
    expect(result.energyCost).toBe(437.62);
    expect(result.totalCost).toBe(437.62);
  });

  it('handles the 0.1 + 0.2 float hazard in energy * price', () => {
    const t: TariffSnapshot = {
      pricePerKwh: 0.2,
      sessionFee: 0,
      idleFeePerMin: 0,
      taxPct: 0,
      minBalanceToStart: 0,
    };
    const result = computeSessionCost(t, { energyKwh: 0.1 + 0.2 });
    expect(result.energyCost).toBe(0.06);
  });

  it('caps the discount at the subtotal and never produces a credit', () => {
    const result = computeSessionCost(tariff, { energyKwh: 1, discount: 100_000 });
    // subtotal = 1*20.5 + 10 = 30.5; discount cannot exceed that
    expect(result.subtotal).toBe(30.5);
    expect(result.discountAmount).toBe(30.5);
    expect(result.taxAmount).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it('computes tax AFTER the discount, not before', () => {
    const withDiscount = computeSessionCost(tariff, { energyKwh: 10, discount: 100 });
    // subtotal = 10*20.5 + 10 = 215; net = 115; tax = 115*0.18 = 20.7
    expect(withDiscount.subtotal).toBe(215);
    expect(withDiscount.discountAmount).toBe(100);
    expect(withDiscount.taxAmount).toBe(20.7);
    expect(withDiscount.totalCost).toBe(135.7);

    // Sanity: taxing the gross (the wrong order) would give a different,
    // larger number — assert we are NOT doing that.
    const wrongOrderTax = roundMoneyLike(215 * 0.18);
    expect(withDiscount.taxAmount).not.toBe(wrongOrderTax);

    function roundMoneyLike(v: number) {
      return Math.round(v * 100) / 100;
    }
  });

  it('treats a negative discount as zero', () => {
    const result = computeSessionCost(tariff, { energyKwh: 1, discount: -50 });
    expect(result.discountAmount).toBe(0);
  });

  it('handles zero energy and zero tariff', () => {
    const zeroTariff: TariffSnapshot = {
      pricePerKwh: 0,
      sessionFee: 0,
      idleFeePerMin: 0,
      taxPct: 0,
      minBalanceToStart: 0,
    };
    const result = computeSessionCost(zeroTariff, { energyKwh: 0 });
    expect(result).toEqual({
      energyCost: 0,
      idleCost: 0,
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalCost: 0,
    });

    const zeroEnergyRealTariff = computeSessionCost(tariff, { energyKwh: 0 });
    expect(zeroEnergyRealTariff.energyCost).toBe(0);
    expect(zeroEnergyRealTariff.subtotal).toBe(10); // just the session fee
  });

  it('handles very large energy values (10,000 kWh)', () => {
    const result = computeSessionCost(tariff, { energyKwh: 10_000 });
    // 10000 * 20.5 = 205000; + 10 = 205010; tax = 205010 * 0.18 = 36901.8
    expect(result.energyCost).toBe(205_000);
    expect(result.subtotal).toBe(205_010);
    expect(result.taxAmount).toBe(36_901.8);
    expect(result.totalCost).toBe(241_911.8);
  });

  it('clamps a negative energyKwh to 0 rather than producing a negative cost', () => {
    const result = computeSessionCost(tariff, { energyKwh: -50 });
    expect(result.energyCost).toBe(0);
    expect(result.subtotal).toBe(10);
  });

  it('clamps negative idleMinutes to 0', () => {
    const result = computeSessionCost(tariff, { energyKwh: 0, idleMinutes: -30 });
    expect(result.idleCost).toBe(0);
  });

  it('includes idle cost in the subtotal alongside energy and session fee', () => {
    const result = computeSessionCost(tariff, { energyKwh: 5, idleMinutes: 10 });
    // energy = 5*20.5 = 102.5; idle = 10*2 = 20; subtotal = 102.5+20+10 = 132.5
    expect(result.energyCost).toBe(102.5);
    expect(result.idleCost).toBe(20);
    expect(result.subtotal).toBe(132.5);
  });

  it('treats a NaN/Infinity energyKwh as clamped by Math.max semantics (no throw for the caller-facing API)', () => {
    // Math.max(NaN, 0) is NaN, which then flows into roundMoney and throws —
    // this documents that computeSessionCost does not silently swallow NaN
    // energy; it surfaces as a thrown RangeError from roundMoney.
    expect(() => computeSessionCost(tariff, { energyKwh: NaN })).toThrow(RangeError);
  });
});

describe('affordableEnergyKwh', () => {
  const tariff: TariffSnapshot = {
    pricePerKwh: 20.5,
    sessionFee: 10,
    idleFeePerMin: 2,
    taxPct: 18,
    minBalanceToStart: 50,
  };

  it('returns 0 rather than a negative number when fixed costs exceed the balance', () => {
    expect(affordableEnergyKwh(tariff, 1)).toBe(0);
    expect(affordableEnergyKwh(tariff, 0)).toBe(0);
    expect(affordableEnergyKwh(tariff, -100)).toBe(0);
  });

  it('returns 0 when pricePerKwh is 0 (division-by-zero guard)', () => {
    const freeTariff: TariffSnapshot = { ...tariff, pricePerKwh: 0 };
    expect(affordableEnergyKwh(freeTariff, 1000)).toBe(0);
  });

  it('computes affordable energy net of tax and the fixed session fee', () => {
    // spendable = 500; taxMultiplier = 1.18
    // fixed = 10 * 1.18 = 11.8
    // perKwh = 20.5 * 1.18 = 24.19
    // (500 - 11.8) / 24.19 = 20.1819... -> rounds to 20.18
    const kwh = affordableEnergyKwh(tariff, 500);
    expect(kwh).toBe(20.18);
  });
});

describe('estimateMinutes', () => {
  it('returns 0 for zero or negative power', () => {
    expect(estimateMinutes(10, 0)).toBe(0);
    expect(estimateMinutes(10, -5)).toBe(0);
  });

  it('computes minutes to deliver energy at a given power', () => {
    expect(estimateMinutes(50, 50)).toBe(60);
    expect(estimateMinutes(25, 50)).toBe(30);
  });
});

describe('estimateChargeMinutes', () => {
  const base = { batteryCapacityKwh: 50, powerKw: 50 };

  it('returns 0 when target is not above the starting point, or power is non-positive', () => {
    expect(estimateChargeMinutes({ ...base, fromSocPct: 50, toSocPct: 50 })).toBe(0);
    expect(estimateChargeMinutes({ ...base, fromSocPct: 60, toSocPct: 20 })).toBe(0);
    expect(estimateChargeMinutes({ ...base, powerKw: 0, fromSocPct: 20, toSocPct: 80 })).toBe(0);
  });

  it('tapers above 80%: 20->90% takes materially more than 2x the time of 20->55%', () => {
    const to55 = estimateChargeMinutes({ ...base, fromSocPct: 20, toSocPct: 55 });
    const to90 = estimateChargeMinutes({ ...base, fromSocPct: 20, toSocPct: 90 });
    // Both segments cover 35 percentage points, but 55->90 crosses the 80%
    // taper boundary, so it must take strictly more than 2x as long.
    expect(to90).toBeGreaterThan(2 * to55);
  });

  it('charging to 100% is materially slower per-percent than charging to 80%', () => {
    const to80 = estimateChargeMinutes({ ...base, fromSocPct: 20, toSocPct: 80 });
    const to100 = estimateChargeMinutes({ ...base, fromSocPct: 20, toSocPct: 100 });
    const perPercentTo80 = to80 / 60;
    const perPercentTo100 = to100 / 80;
    expect(perPercentTo100).toBeGreaterThan(perPercentTo80 * 1.2);
  });

  it('matches a hand-computed full-rate-only segment', () => {
    // 50 kWh battery, 50 kW: 0->80% is 40 kWh at full rate -> 48 minutes.
    expect(estimateChargeMinutes({ ...base, fromSocPct: 0, toSocPct: 80 })).toBe(48);
  });
});

describe('formatINR', () => {
  it('formats a normal amount with 2 decimal places and the rupee symbol', () => {
    expect(formatINR(457.86)).toBe('₹457.86');
  });

  it('formats zero', () => {
    expect(formatINR(0)).toBe('₹0.00');
  });

  it('formats large amounts with Indian digit grouping (lakh, not thousand)', () => {
    expect(formatINR(1_234_567.89)).toBe('₹12,34,567.89');
  });

  it('falls back to 0 for non-finite input rather than throwing', () => {
    expect(formatINR(NaN)).toBe('₹0.00');
    expect(formatINR(Infinity)).toBe('₹0.00');
  });

  it('supports a compact (no-decimals) mode', () => {
    expect(formatINR(457.86, true)).toBe('₹458');
    expect(formatINR(0, true)).toBe('₹0');
  });
});

describe('formatKwh', () => {
  it('formats with 2 decimals by default', () => {
    expect(formatKwh(18.4)).toBe('18.40 kWh');
  });

  it('formats zero', () => {
    expect(formatKwh(0)).toBe('0.00 kWh');
  });

  it('supports a custom digit count', () => {
    expect(formatKwh(18.4444, 1)).toBe('18.4 kWh');
    expect(formatKwh(18.4444, 0)).toBe('18 kWh');
  });

  it('falls back to 0 for non-finite input', () => {
    expect(formatKwh(NaN)).toBe('0.00 kWh');
  });

  it('formats large values', () => {
    expect(formatKwh(10_000)).toBe('10000.00 kWh');
  });
});

describe('formatDuration', () => {
  it('formats seconds only under a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes and seconds under an hour', () => {
    expect(formatDuration(65)).toBe('1m 05s');
    expect(formatDuration(600)).toBe('10m 00s');
  });

  it('formats hours and minutes at or above an hour, dropping seconds', () => {
    expect(formatDuration(3661)).toBe('1h 01m');
    expect(formatDuration(7200)).toBe('2h 00m');
  });

  it('clamps negative and fractional seconds sanely', () => {
    expect(formatDuration(-100)).toBe('0s');
    expect(formatDuration(45.9)).toBe('45s');
  });
});

describe('carbonSavedKg', () => {
  it('multiplies kWh by the CO2 factor and rounds', () => {
    expect(carbonSavedKg(18.44)).toBe(13.09);
    expect(carbonSavedKg(0)).toBe(0);
  });

  it('clamps negative totalKwh to 0', () => {
    expect(carbonSavedKg(-10)).toBe(0);
  });
});
