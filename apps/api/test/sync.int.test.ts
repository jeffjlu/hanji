import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findStoredEvents, findUserByEmail, findUserById } from '@hanji/db';
import {
  FIXTURE,
  id,
  id7,
  insertContentFixture,
  installLastSeqFailure,
  removeLastSeqFailure,
  resetTables,
} from '@hanji/db/testing';
import { createTestApp, type TestApp } from './app.js';
import { TestClient } from './test-client.js';
import type { ReviewEventIn } from '@hanji/schemas';
import { type InjectOptions } from 'fastify';

const SYNC_URL = '/api/v1/sync';
const DEVICE_ID = id(800);
const NOW = new Date('2026-03-01T12:00:00.000Z');
const FIVE_MIN = 5 * 60_000;

export const plus = (d: Date, ms: number) => new Date(d.getTime() + ms).toISOString();

export const makeEvent = (n: number, o: Record<string, unknown> = {}) =>
  ({
    id: id7(n),
    cardId: FIXTURE.recognitionCardId,
    reviewedAt: '2026-03-01T11:00:00.000Z',
    tz: 'UTC',
    retention: 0.9,
    rating: 3,
    responseMs: 5000,
    correct: true,
    hintUsed: false,
    ...o,
  }) satisfies Record<string, unknown> as ReviewEventIn;

describe('POST /api/v1/sync', () => {
  let ctx: TestApp;
  let client: TestClient;
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestApp({ now: () => NOW });
  });
  afterAll(async () => {
    await ctx.dispose();
  });

  beforeEach(async () => {
    await resetTables(ctx.sql);
    await insertContentFixture(ctx.db);

    client = new TestClient(ctx.app, ctx.config.WEB_ORIGIN);
    await client.registerAndLogin({
      email: 'a@example.com',
      password: 'correct horse battery staple',
      inviteCode: ctx.config.REGISTRATION_CODE,
    });
    userId = (await findUserByEmail(ctx.db, 'a@example.com'))!.id;
  });

  const post = (
    client: TestClient,
    body: InjectOptions['body'],
    extra: { origin?: string | null } = {}
  ) => client.request({ method: 'POST', url: SYNC_URL, body, ...extra });

  const sync = (events: unknown[], sinceSeq = 0, c: TestClient = client) =>
    post(c, { deviceId: DEVICE_ID, sinceSeq, events });

  const lastSeq = async () => {
    return (await findUserById(ctx.db, userId))!.lastSeq;
  };

  describe('request gating', () => {
    it('returns 401 when signed out', async () => {
      const anonymous = new TestClient(ctx.app, ctx.config.WEB_ORIGIN);
      const res = await sync([makeEvent(1)], 0, anonymous);
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for a wrong origin and stores nothing', async () => {
      const res = await post(
        client,
        { deviceId: DEVICE_ID, sinceSeq: 0, events: [makeEvent(1)] },
        { origin: 'https://evil.example' }
      );
      expect(res.statusCode).toBe(403);
      expect(await findStoredEvents(ctx.db, userId)).toHaveLength(0);
    });

    it('returns 403 when the origin header is omitted', async () => {
      const res = await post(
        client,
        { deviceId: DEVICE_ID, sinceSeq: 0, events: [] },
        { origin: null }
      );
      expect(res.statusCode).toBe(403);
    });

    it.each([
      { name: 'missing deviceId', body: { sinceSeq: 0, events: [] } },
      { name: 'negative sinceSeq', body: { deviceId: DEVICE_ID, sinceSeq: -1, events: [] } },
      { name: 'events not an array', body: { deviceId: DEVICE_ID, sinceSeq: 0, events: {} } },
      {
        name: 'event without a string id',
        body: { deviceId: DEVICE_ID, sinceSeq: 0, events: [{ id: 5 }] },
      },
      { name: 'non-object event', body: { deviceId: DEVICE_ID, sinceSeq: 0, events: ['x'] } },
    ])('returns problem+json 400 for $name', async ({ body }) => {
      const res = await post(client, body);
      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('accepts 500 events and rejects 501', async () => {
      const make = (n: number) => Array.from({ length: n }, (_, i) => makeEvent(i + 1));
      expect((await sync(make(500))).statusCode).toBe(200);
      expect((await sync(make(501), 500)).statusCode).toBe(400);
    });

    it('rejects an oversized body with 413', async () => {
      const big = {
        deviceId: DEVICE_ID,
        sinceSeq: 0,
        events: [],
        pad: 'x'.repeat(10 * 1024 * 1024),
      };
      expect((await post(client, big)).statusCode).toBe(413);
    });
  });

  describe('per-event rejection', () => {
    it.each([
      { name: 'UUID v4 id', override: { id: id(1) } },
      { name: 'unknown time zone', override: { tz: 'Mars/Olympus' } },
      { name: 'rating 5', override: { rating: 5 } },
      { name: 'retention 0.5', override: { retention: 0.5 } },
      { name: 'rating 1 with correct true', override: { rating: 1, correct: true } },
      { name: 'timestamp without offset', override: { reviewedAt: '2026-03-01T11:00:00' } },
    ])('rejects $name as invalid and still stores the valid event', async ({ override }) => {
      const bad = makeEvent(1, override);
      const good = makeEvent(2);
      const res = await sync([bad, good]);
      expect(res.statusCode).toBe(200);
      expect(res.json().accepted).toEqual([good.id]);
      expect(res.json().rejected).toEqual([{ id: bad.id, reason: 'invalid' }]);
      expect((await findStoredEvents(ctx.db, userId)).map((e) => e.id)).toEqual([good.id]);
    });

    it('accepts exactly 5 minutes ahead and rejects 5 minutes + 1s as future', async () => {
      const ok = makeEvent(1, { reviewedAt: plus(NOW, FIVE_MIN) });
      const bad = makeEvent(2, { reviewedAt: plus(NOW, FIVE_MIN + 1000) });
      const res = await sync([ok, bad]);
      expect(res.json().accepted).toEqual([ok.id]);
      expect(res.json().rejected).toEqual([{ id: bad.id, reason: 'future' }]);
    });

    it('rejects an event for an unknown card', async () => {
      const bad = makeEvent(1, { cardId: id(999) });
      const res = await sync([bad]);
      expect(res.json().rejected).toEqual([{ id: bad.id, reason: 'unknown_card' }]);
      expect(await findStoredEvents(ctx.db, userId)).toHaveLength(0);
    });

    it('stores only the valid event of a mixed batch and consumes no seq for rejects', async () => {
      const valid = makeEvent(1);
      const invalid = makeEvent(2, { rating: 0 });
      const future = makeEvent(3, { reviewedAt: plus(NOW, 60 * 60_000) });
      const unknownCard = makeEvent(4, { cardId: id(999) });
      const valid2 = makeEvent(5);
      const res = await sync([valid, invalid, future, unknownCard, valid2]);
      expect(res.json().accepted).toEqual([valid.id, valid2.id]);
      expect(res.json().rejected).toHaveLength(3);
      expect((await findStoredEvents(ctx.db, userId)).map((e) => e.userSeq)).toEqual([1, 2]);
      expect(await lastSeq()).toBe(2);
    });
  });

  describe('storing events', () => {
    it('assigns gap-free user_seq in request order and updates last_seq', async () => {
      const events = [makeEvent(1), makeEvent(2), makeEvent(3)];
      const res = await sync(events);
      expect(res.statusCode).toBe(200);
      expect(res.json().accepted).toEqual(events.map((e) => e.id));
      expect(res.json().serverSeq).toBe(3);
      expect(res.json().cardStates).toEqual([]); // changes in P1-05
      expect((await findStoredEvents(ctx.db, userId)).map((e) => [e.id, e.userSeq])).toEqual(
        events.map((e, i) => [e.id, i + 1])
      );
      expect(await lastSeq()).toBe(3);
    });

    it('continues the sequence across requests', async () => {
      await sync([makeEvent(1), makeEvent(2)]);
      const res = await sync([makeEvent(3)], 2);
      expect(res.json().serverSeq).toBe(3);
      expect((await findStoredEvents(ctx.db, userId)).map((e) => e.userSeq)).toEqual([1, 2, 3]);
    });

    it('computes local_day from the event time zone and sets received_at and device_id', async () => {
      // 2026-02-28T23:30Z is already 12:30 on 1 March in Auckland.
      const e = makeEvent(1, { reviewedAt: '2026-02-28T23:30:00.000Z', tz: 'Pacific/Auckland' });
      await sync([e]);
      const [row] = await findStoredEvents(ctx.db, userId);
      expect(row?.localDay).toBe('2026-03-01');
      expect(row?.receivedAt).toBeInstanceOf(Date);
      expect(row?.deviceId).toBe(DEVICE_ID);
    });

    it('accepts a two-year-old event', async () => {
      const old = makeEvent(1, { reviewedAt: '2024-03-01T12:00:00.000Z' });
      const res = await sync([old]);
      expect(res.json().accepted).toEqual([old.id]);
    });
  });

  describe('idempotency and duplicates', () => {
    it('re-sending stores nothing new and returns the same accepted', async () => {
      const events = [makeEvent(1), makeEvent(2)];
      const first = await sync(events);
      const second = await sync(events);
      expect(second.json().accepted).toEqual(first.json().accepted);
      expect(await findStoredEvents(ctx.db, userId)).toHaveLength(2);
      expect(await lastSeq()).toBe(2);
    });

    it('handles partial overlap without gaps', async () => {
      const old = [makeEvent(1), makeEvent(2)];
      await sync(old);
      const mixed = [...old, makeEvent(3), makeEvent(4), makeEvent(5)];
      const res = await sync(mixed);
      expect(res.json().accepted).toHaveLength(5);
      expect((await findStoredEvents(ctx.db, userId)).map((e) => e.userSeq)).toEqual([
        1, 2, 3, 4, 5,
      ]);
    });

    it('stores an id repeated within one request once', async () => {
      const e = makeEvent(1);
      const res = await sync([e, e]);
      expect(res.json().accepted).toEqual([e.id]);
      expect(await findStoredEvents(ctx.db, userId)).toHaveLength(1);
      expect(await lastSeq()).toBe(1);
    });

    it('rejects an id held by another user and leaves their row untouched', async () => {
      const other = new TestClient(ctx.app, ctx.config.WEB_ORIGIN);
      await other.registerAndLogin({
        email: 'b@example.com',
        password: 'another long passphrase',
        inviteCode: ctx.config.REGISTRATION_CODE,
      });
      const shared = makeEvent(1);
      await sync([shared], 0, other);

      const res = await sync([shared]);
      expect(res.json().accepted).toEqual([]);
      expect(res.json().rejected).toEqual([{ id: shared.id, reason: 'invalid' }]);
      expect(await findStoredEvents(ctx.db, userId)).toHaveLength(0);
    });
  });

  describe('concurrency and rollback', () => {
    it('keeps user_seq unique and gap-free under concurrent syncs', async () => {
      const batches = Array.from({ length: 5 }, (_, b) =>
        Array.from({ length: 20 }, (_, i) => makeEvent(b * 100 + i + 1))
      );
      const responses = await Promise.all(batches.map((events) => sync(events)));
      expect(responses.every((r) => r.statusCode === 200)).toBe(true);
      expect((await findStoredEvents(ctx.db, userId)).map((e) => e.userSeq)).toEqual(
        Array.from({ length: 100 }, (_, i) => i + 1)
      );
      expect(await lastSeq()).toBe(100);
    });

    it('stores each id once when concurrent requests overlap', async () => {
      const shared = Array.from({ length: 10 }, (_, i) => makeEvent(i + 1));
      await Promise.all([
        sync([...shared, makeEvent(101)]),
        sync([...shared, makeEvent(102)]),
        sync([...shared, makeEvent(103)]),
      ]);
      const rows = await findStoredEvents(ctx.db, userId);
      expect(rows).toHaveLength(13);
      expect(rows.map((r) => r.userSeq)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
      expect(await lastSeq()).toBe(13);
    });

    it('rolls back everything when a failure occurs after the insert', async () => {
      await installLastSeqFailure(ctx.db);
      try {
        const res = await sync([makeEvent(1), makeEvent(2)]);
        expect(res.statusCode).toBe(500);
        expect(await findStoredEvents(ctx.db, userId)).toHaveLength(0);
        expect(await lastSeq()).toBe(0);
      } finally {
        await removeLastSeqFailure(ctx.db);
      }
      const retry = await sync([makeEvent(1), makeEvent(2)]);
      expect(retry.statusCode).toBe(200);
      expect(await lastSeq()).toBe(2);
    });
  });
});
