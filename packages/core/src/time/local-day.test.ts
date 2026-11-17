import { describe, it, expect } from 'vitest';
import { localDay } from './local-day.js';

const LA = 'America/Los_Angeles';

describe('localDay', () => {
  it('computes an instant giving different days in two zones', () => {
    const instant = new Date('2026-03-08T01:00:00Z');
    expect(localDay(instant, LA)).toBe('2026-03-07');
    expect(localDay(instant, 'UTC')).toBe('2026-03-08');
  });
});
describe('localDay across DST transitions', () => {
  it.each([
    // Spring forward: PST (UTC-8) until 10:00Z, then PDT (UTC-7)
    { name: 'last second of Mar 7 (PST)', iso: '2026-03-08T07:59:59Z', day: '2026-03-07' },
    { name: 'midnight starting Mar 8 (PST)', iso: '2026-03-08T08:00:00Z', day: '2026-03-08' },
    { name: 'just before the gap (01:59 PST)', iso: '2026-03-08T09:59:59Z', day: '2026-03-08' },
    { name: 'just after the gap (03:00 PDT)', iso: '2026-03-08T10:00:00Z', day: '2026-03-08' },
    { name: 'last second of Mar 8 (PDT)', iso: '2026-03-09T06:59:59Z', day: '2026-03-08' },
    { name: 'midnight starting Mar 9 (PDT)', iso: '2026-03-09T07:00:00Z', day: '2026-03-09' },

    // Fall back: PDT (UTC-7) until 09:00Z, then PST (UTC-8)
    { name: 'midnight starting Nov 1 (PDT)', iso: '2026-11-01T07:00:00Z', day: '2026-11-01' },
    { name: 'first 01:30 (PDT)', iso: '2026-11-01T08:30:00Z', day: '2026-11-01' },
    { name: 'repeated 01:30 (PST)', iso: '2026-11-01T09:30:00Z', day: '2026-11-01' },
    { name: 'last second of Nov 1 (PST)', iso: '2026-11-02T07:59:59Z', day: '2026-11-01' },
    { name: 'midnight starting Nov 2 (PST)', iso: '2026-11-02T08:00:00Z', day: '2026-11-02' },
  ])('$name', ({ iso, day }) => {
    expect(localDay(new Date(iso), LA)).toBe(day);
  });
});
