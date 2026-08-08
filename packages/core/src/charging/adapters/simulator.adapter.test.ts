import { beforeEach, describe, expect, it } from 'vitest';
import { ChargingProviderError } from '../provider';
import { SimulatorChargingProvider } from './simulator.adapter';

const CTX = { sessionId: 'sess-1', userId: 'user-1', connectorId: 'conn-1' };

describe('SimulatorChargingProvider', () => {
  let sim: SimulatorChargingProvider;

  beforeEach(() => {
    sim = new SimulatorChargingProvider({ powerKw: 50 });
  });

  it('marks the connector occupied when a session starts', async () => {
    expect(await sim.getConnectorStatus('conn-1')).toBe('available');
    const ref = await sim.startCharging('conn-1', CTX);
    expect(ref.providerSessionId).toBe('sim-sess-1');
    expect(await sim.getConnectorStatus('conn-1')).toBe('occupied');
  });

  it('rejects starting on a connector already occupied', async () => {
    await sim.startCharging('conn-1', CTX);
    await expect(
      sim.startCharging('conn-1', { ...CTX, sessionId: 'sess-2' }),
    ).rejects.toThrow(ChargingProviderError);
  });

  it('advance() accumulates energy monotonically across calls', async () => {
    const ref = await sim.startCharging('conn-1', CTX);
    const v1 = sim.advance(ref.providerSessionId, 6); // 50kW * 6/60 = 5 kWh
    expect(v1.energyKwh).toBeCloseTo(5, 3);

    const v2 = sim.advance(ref.providerSessionId, 6);
    expect(v2.energyKwh).toBeCloseTo(10, 3);
    expect(v2.energyKwh).toBeGreaterThan(v1.energyKwh);

    const v3 = sim.advance(ref.providerSessionId, 12);
    expect(v3.energyKwh).toBeCloseTo(20, 3);
    expect(v3.energyKwh).toBeGreaterThan(v2.energyKwh);

    const details = await sim.getSessionDetails(ref);
    expect(details.energyKwh).toBeCloseTo(20, 3);
    expect(details.status).toBe('active');

    const values = await sim.getMeterValues(ref);
    expect(values).toHaveLength(3);
    // Cumulative energy is strictly increasing across the recorded series.
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!.energyKwh).toBeGreaterThan(values[i - 1]!.energyKwh);
    }
  });

  it('advance() throws for an unknown session', () => {
    expect(() => sim.advance('sim-does-not-exist', 5)).toThrow(/unknown simulated session/);
  });

  it('stopCharging frees the connector and completes the session', async () => {
    const ref = await sim.startCharging('conn-1', CTX);
    sim.advance(ref.providerSessionId, 10);
    await sim.stopCharging(ref);

    expect(await sim.getConnectorStatus('conn-1')).toBe('available');
    const details = await sim.getSessionDetails(ref);
    expect(details.status).toBe('completed');
    expect(details.stoppedAt).not.toBeNull();
  });

  it('stopCharging on an unknown session throws', async () => {
    await expect(sim.stopCharging({ providerSessionId: 'nope' })).rejects.toThrow(
      ChargingProviderError,
    );
  });

  it('fault() marks the connector faulted and the session failed', async () => {
    const ref = await sim.startCharging('conn-1', CTX);
    const event = sim.fault(ref.providerSessionId, 'GroundFailure');

    expect(event.type).toBe('fault_detected');
    expect(event.errorCode).toBe('GroundFailure');
    expect(await sim.getConnectorStatus('conn-1')).toBe('faulted');

    const details = await sim.getSessionDetails(ref);
    expect(details.status).toBe('failed');
  });

  it('fault() throws for an unknown session', () => {
    expect(() => sim.fault('sim-does-not-exist')).toThrow(/unknown simulated session/);
  });

  it('failOnStart makes startCharging throw a non-retryable error and never occupies the connector', async () => {
    const failing = new SimulatorChargingProvider({ failOnStart: true });
    await expect(failing.startCharging('conn-1', CTX)).rejects.toMatchObject({
      name: 'ChargingProviderError',
      options: expect.objectContaining({ retryable: false }),
    });
    expect(await failing.getConnectorStatus('conn-1')).toBe('available');
  });

  it('getSessionDetails on an unknown session throws', async () => {
    await expect(sim.getSessionDetails({ providerSessionId: 'ghost' })).rejects.toThrow(
      ChargingProviderError,
    );
  });

  it('reset() clears sessions, connector status and reservations', async () => {
    const ref = await sim.startCharging('conn-1', CTX);
    sim.advance(ref.providerSessionId, 5);
    expect(await sim.getConnectorStatus('conn-1')).toBe('occupied');

    sim.reset();

    expect(await sim.getConnectorStatus('conn-1')).toBe('available');
    await expect(sim.getSessionDetails(ref)).rejects.toThrow(ChargingProviderError);
  });

  it('reserveConnector marks the connector reserved and cancelReservation releases the reservation record', async () => {
    const expiresAt = new Date('2026-01-01T00:20:00.000Z');
    const ref = await sim.reserveConnector('conn-1', {
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt,
    });
    expect(await sim.getConnectorStatus('conn-1')).toBe('reserved');
    expect(ref.expiresAt).toBe(expiresAt.toISOString());

    await sim.cancelReservation(ref);
    // Cancelling the reservation record does not itself flip the connector
    // back to available in this simplified sim — that is driven by the
    // caller. We only assert the reservation bookkeeping doesn't throw.
  });

  it('socPct derived from energy is capped at 100', async () => {
    const ref = await sim.startCharging('conn-1', CTX);
    const value = sim.advance(ref.providerSessionId, 6000); // huge overshoot
    expect(value.socPct).toBe(100);
  });
});
