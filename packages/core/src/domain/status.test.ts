import { describe, expect, it } from 'vitest';
import {
  CHARGER_STATUS,
  CONNECTOR_STATUS,
  CONNECTOR_TYPE_LABELS,
  PAYMENT_STATUS,
  SESSION_STATUS,
  SETTLEMENT_STATUS,
  STATION_STATUS,
  TICKET_STATUS,
  connectorTypeLabel,
  presentStatus,
  type StatusPresentation,
} from './status';

const ALL_MAPS: Record<string, Record<string, StatusPresentation>> = {
  CONNECTOR_STATUS,
  CHARGER_STATUS,
  STATION_STATUS,
  SESSION_STATUS,
  SETTLEMENT_STATUS,
  PAYMENT_STATUS,
  TICKET_STATUS,
};

const VALID_TONES = new Set(['success', 'warning', 'danger', 'info', 'neutral']);

describe('status presentation maps', () => {
  for (const [mapName, map] of Object.entries(ALL_MAPS)) {
    describe(mapName, () => {
      it('every entry has a non-empty label AND a valid tone (never colour alone)', () => {
        for (const [key, presentation] of Object.entries(map)) {
          expect(presentation.label, `${mapName}.${key}.label`).toBeTruthy();
          expect(typeof presentation.label).toBe('string');
          expect(VALID_TONES.has(presentation.tone), `${mapName}.${key}.tone`).toBe(true);
        }
      });

      it('every entry has a screen-reader hint distinct from a bare colour name', () => {
        for (const [key, presentation] of Object.entries(map)) {
          expect(presentation.srHint, `${mapName}.${key}.srHint`).toBeTruthy();
          expect(VALID_TONES.has(presentation.srHint)).toBe(false);
        }
      });
    });
  }

  it('CONNECTOR_STATUS covers every ConnectorLiveStatus value used by adapters', () => {
    for (const status of ['available', 'occupied', 'reserved', 'offline', 'faulted']) {
      expect(CONNECTOR_STATUS[status]).toBeDefined();
    }
  });
});

describe('presentStatus', () => {
  it('resolves a known status from the given map', () => {
    const result = presentStatus(CONNECTOR_STATUS, 'available');
    expect(result).toEqual({
      label: 'Available',
      tone: 'success',
      srHint: 'Connector is free to use',
    });
  });

  it('falls back to a humanised label with neutral tone for an unknown status', () => {
    const result = presentStatus(CONNECTOR_STATUS, 'quantum_tunnelling');
    expect(result.tone).toBe('neutral');
    expect(result.label).toBe('Quantum tunnelling');
    expect(result.srHint).toBe('Quantum tunnelling');
  });

  it('falls back to the generic "Unknown" presentation for null/undefined/empty status', () => {
    for (const value of [null, undefined, '']) {
      const result = presentStatus(CONNECTOR_STATUS, value);
      expect(result.label).toBe('Unknown');
      expect(result.tone).toBe('neutral');
      expect(result.srHint).toBe('Status unknown');
    }
  });

  it('humanises snake_case and kebab-case unknown statuses', () => {
    expect(presentStatus(SESSION_STATUS, 'weirdly_named-status').label).toBe(
      'Weirdly named status',
    );
  });
});

describe('connectorTypeLabel', () => {
  it('maps a known connector type to its display label', () => {
    expect(connectorTypeLabel('CCS2')).toBe('CCS2');
    expect(connectorTypeLabel('TYPE2')).toBe('Type 2');
    expect(connectorTypeLabel('GBT')).toBe('GB/T');
    expect(connectorTypeLabel('CHADEMO')).toBe('CHAdeMO');
    expect(connectorTypeLabel('AC_3PIN')).toBe('3-pin AC');
  });

  it('handles null and undefined gracefully, returning "Unknown"', () => {
    expect(connectorTypeLabel(null)).toBe('Unknown');
    expect(connectorTypeLabel(undefined)).toBe('Unknown');
  });

  it('passes through an unrecognised type verbatim rather than throwing', () => {
    expect(connectorTypeLabel('SOME_NEW_VENDOR_TYPE')).toBe('SOME_NEW_VENDOR_TYPE');
  });

  it('every declared connector type label is a non-empty string', () => {
    for (const [key, label] of Object.entries(CONNECTOR_TYPE_LABELS)) {
      expect(label, key).toBeTruthy();
    }
  });
});
