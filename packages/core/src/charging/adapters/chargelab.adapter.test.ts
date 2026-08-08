import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChargingProviderError } from '../provider';
import { ChargeLabAdapter } from './chargelab.adapter';

const CONFIG = {
  baseUrl: 'https://api.chargelab.test',
  apiKey: 'test-api-key',
  webhookSecret: 'test-webhook-secret',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('ChargeLabAdapter', () => {
  it('throws at construction time without a baseUrl or apiKey', () => {
    expect(() => new ChargeLabAdapter({ ...CONFIG, baseUrl: '' })).toThrow();
    expect(() => new ChargeLabAdapter({ ...CONFIG, apiKey: '' })).toThrow();
  });

  describe('status mapping', () => {
    const cases: Array<[string, string]> = [
      ['AVAILABLE', 'available'],
      ['PREPARING', 'occupied'],
      ['CHARGING', 'occupied'],
      ['SUSPENDED_EV', 'occupied'],
      ['SUSPENDED_EVSE', 'occupied'],
      ['FINISHING', 'occupied'],
      ['RESERVED', 'reserved'],
      ['UNAVAILABLE', 'offline'],
      ['OFFLINE', 'offline'],
      ['FAULTED', 'faulted'],
    ];

    it.each(cases)('maps provider status %s -> domain status %s', async (providerStatus, expected) => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'c1', status: providerStatus }));
      const adapter = new ChargeLabAdapter({ ...CONFIG, fetchImpl });
      const status = await adapter.getConnectorStatus('c1');
      expect(status).toBe(expected);
    });

    it('maps an unknown/unrecognised provider status to "offline"', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'c1', status: 'SOME_NEW_STATE' }));
      const adapter = new ChargeLabAdapter({ ...CONFIG, fetchImpl });
      expect(await adapter.getConnectorStatus('c1')).toBe('offline');
    });

    it('maps a missing status field to "offline"', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'c1' }));
      const adapter = new ChargeLabAdapter({ ...CONFIG, fetchImpl });
      expect(await adapter.getConnectorStatus('c1')).toBe('offline');
    });
  });

  describe('error retryability', () => {
    const retryableStatuses = [429, 500, 502, 503, 504];
    const nonRetryableStatuses = [400, 401, 404];

    it.each(retryableStatuses)('marks HTTP %d as retryable', async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response('server trouble', { status }),
      );
      const adapter = new ChargeLabAdapter({ ...CONFIG, fetchImpl });

      await expect(adapter.getConnectorStatus('c1')).rejects.toMatchObject({
        name: 'ChargingProviderError',
        options: expect.objectContaining({ retryable: true, status }),
      });
    });

    it.each(nonRetryableStatuses)('marks HTTP %d as not retryable', async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('bad request', { status }));
      const adapter = new ChargeLabAdapter({ ...CONFIG, fetchImpl });

      await expect(adapter.getConnectorStatus('c1')).rejects.toMatchObject({
        name: 'ChargingProviderError',
        options: expect.objectContaining({ retryable: false, status }),
      });
    });

    it('turns a network-level throw into a retryable ChargingProviderError', async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      const adapter = new ChargeLabAdapter({ ...CONFIG, fetchImpl });

      await expect(adapter.getConnectorStatus('c1')).rejects.toBeInstanceOf(ChargingProviderError);
      await expect(adapter.getConnectorStatus('c1')).rejects.toMatchObject({
        options: expect.objectContaining({ retryable: true }),
      });
    });

    it('surfaces malformed JSON as a non-retryable error', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response('not json{{{', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      const adapter = new ChargeLabAdapter({ ...CONFIG, fetchImpl });

      await expect(adapter.getConnectorStatus('c1')).rejects.toMatchObject({
        options: expect.objectContaining({ retryable: false }),
      });
    });
  });

  describe('startCharging', () => {
    it('sends an idempotency-key header equal to the session id', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse(200, { id: 'txn-123', startedAt: '2026-01-01T00:00:00.000Z' }),
      );
      const adapter = new ChargeLabAdapter({ ...CONFIG, fetchImpl });

      const ref = await adapter.startCharging('conn-1', {
        sessionId: 'evrute-session-abc',
        userId: 'user-1',
        connectorId: 'conn-1',
      });

      expect(ref.providerSessionId).toBe('txn-123');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['idempotency-key']).toBe('evrute-session-abc');

      const body = JSON.parse(init.body as string);
      expect(body.externalReference).toBe('evrute-session-abc');
      expect(body.connectorId).toBe('conn-1');
    });

    it('bubbles up a non-retryable error for a 401', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }));
      const adapter = new ChargeLabAdapter({ ...CONFIG, fetchImpl });

      await expect(
        adapter.startCharging('conn-1', { sessionId: 's1', userId: 'u1', connectorId: 'conn-1' }),
      ).rejects.toMatchObject({ options: expect.objectContaining({ retryable: false }) });
    });
  });

  describe('verifyWebhookSignature', () => {
    let adapter: ChargeLabAdapter;
    const body = JSON.stringify({ id: 'evt-1', type: 'charging.started' });

    beforeEach(() => {
      adapter = new ChargeLabAdapter(CONFIG);
    });

    it('accepts a correct HMAC signature', () => {
      const signature = sign(CONFIG.webhookSecret, body);
      expect(adapter.verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('accepts the "sha256=" prefixed form', () => {
      const signature = `sha256=${sign(CONFIG.webhookSecret, body)}`;
      expect(adapter.verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('rejects a wrong signature', () => {
      const wrongSignature = sign('a-completely-different-secret', body);
      expect(adapter.verifyWebhookSignature(body, wrongSignature)).toBe(false);
    });

    it('rejects a signature computed over a tampered body', () => {
      const signature = sign(CONFIG.webhookSecret, body);
      const tamperedBody = JSON.stringify({ id: 'evt-1', type: 'charging.stopped' });
      expect(adapter.verifyWebhookSignature(tamperedBody, signature)).toBe(false);
    });

    it('rejects a null signature', () => {
      expect(adapter.verifyWebhookSignature(body, null)).toBe(false);
    });

    it('rejects a length-mismatched value without throwing', () => {
      expect(adapter.verifyWebhookSignature(body, 'deadbeef')).toBe(false);
    });

    it('rejects an empty string signature', () => {
      expect(adapter.verifyWebhookSignature(body, '')).toBe(false);
    });

    it('rejects when the webhook secret is empty', () => {
      const noSecretAdapter = new ChargeLabAdapter({ ...CONFIG, webhookSecret: '' });
      const signature = sign(CONFIG.webhookSecret, body);
      expect(noSecretAdapter.verifyWebhookSignature(body, signature)).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    let adapter: ChargeLabAdapter;
    beforeEach(() => {
      adapter = new ChargeLabAdapter(CONFIG);
    });

    const eventCases: Array<[string, string]> = [
      ['charging.started', 'charging_started'],
      ['charging.stopped', 'charging_stopped'],
      ['charging.failed', 'charging_failed'],
      ['meter.values', 'meter_values'],
      ['connector.online', 'connector_online'],
      ['connector.offline', 'connector_offline'],
      ['charger.fault', 'fault_detected'],
      ['reservation.expired', 'reservation_expired'],
      ['firmware.updated', 'firmware_updated'],
      ['payment.required', 'payment_required'],
    ];

    it.each(eventCases)('maps vendor event "%s" to internal type "%s"', (vendorType, internalType) => {
      const parsed = adapter.parseWebhookEvent({
        id: 'evt-1',
        type: vendorType,
        occurredAt: '2026-01-01T00:00:00.000Z',
        data: { transactionId: 'txn-1', connectorId: 'conn-1' },
      });
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe(internalType);
      expect(parsed?.eventId).toBe('evt-1');
      expect(parsed?.providerSessionId).toBe('txn-1');
      expect(parsed?.providerConnectorId).toBe('conn-1');
    });

    it('returns null for an unknown event name', () => {
      expect(adapter.parseWebhookEvent({ id: 'evt-1', type: 'something.unheard.of' })).toBeNull();
    });

    it('returns null for malformed payloads: non-object, null, missing id', () => {
      expect(adapter.parseWebhookEvent(null)).toBeNull();
      expect(adapter.parseWebhookEvent(undefined)).toBeNull();
      expect(adapter.parseWebhookEvent('a string')).toBeNull();
      expect(adapter.parseWebhookEvent(42)).toBeNull();
      expect(adapter.parseWebhookEvent({ type: 'charging.started' })).toBeNull(); // no id
    });

    it('carries meter values through when present', () => {
      const parsed = adapter.parseWebhookEvent({
        id: 'evt-2',
        type: 'meter.values',
        data: { transactionId: 'txn-1', meterValue: { timestamp: '2026-01-01T00:00:00.000Z', energyKwh: 4.2 } },
      });
      expect(parsed?.meterValue?.energyKwh).toBe(4.2);
    });

    it('defaults occurredAt when the vendor omits it', () => {
      const before = Date.now();
      const parsed = adapter.parseWebhookEvent({ id: 'evt-3', type: 'connector.online' });
      const after = Date.now();
      expect(parsed).not.toBeNull();
      const occurredAtMs = new Date(parsed!.occurredAt).getTime();
      expect(occurredAtMs).toBeGreaterThanOrEqual(before);
      expect(occurredAtMs).toBeLessThanOrEqual(after);
    });
  });
});
