import { describe, expect, it } from 'vitest';
import {
  reviewEventInSchema,
  syncRequestSchema,
  userCardStateSchema,
  syncResponseSchema,
  CARD_STATES,
} from './sync.js';
import {
  MAX_RATING,
  MAX_RESPONSE_MS,
  MAX_RETENTION,
  MIN_RATING,
  MIN_RETENTION,
} from './constants.js';

const baseEvent = {
  id: '0192705a-3b36-7b7a-8f3e-4f3b2c1d8e9a',
  cardId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  reviewedAt: '2024-01-01T12:00:00Z',
  tz: 'America/New_York',
  retention: 0.85,
  rating: 3,
  responseMs: 1200,
  correct: true,
  hintUsed: false,
};

const baseRequest = {
  deviceId: 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6',
  sinceSeq: 0,
};

function makeEvent(overrides: Record<string, unknown>) {
  return { ...baseEvent, ...overrides };
}

const validCases = [
  { name: 'valid event', input: baseEvent },
  {
    name: 'offset timestamp accepted',
    input: makeEvent({ reviewedAt: '2024-01-01T12:00:00+05:30' }),
  },
  {
    name: 'rating 1 accepted when correct is false',
    input: makeEvent({ rating: 1, correct: false }),
  },
  {
    name: 'rating 4 accepted when correct is true',
    input: makeEvent({ rating: 4, correct: true }),
  },
  { name: 'retention min boundary accepted', input: makeEvent({ retention: MIN_RETENTION }) },
  { name: 'retention max boundary accepted', input: makeEvent({ retention: MAX_RETENTION }) },
  { name: 'responseMs 0 accepted', input: makeEvent({ responseMs: 0 }) },
  { name: 'responseMs max boundary accepted', input: makeEvent({ responseMs: MAX_RESPONSE_MS }) },
] as const;

const invalidCases = [
  {
    name: 'UUID v4 id rejected',
    input: makeEvent({ id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }),
    path: 'id',
  },
  {
    name: 'timestamp without offset rejected',
    input: makeEvent({ reviewedAt: '2024-01-01T12:00:00' }),
    path: 'reviewedAt',
  },
  { name: 'invalid time zone rejected', input: makeEvent({ tz: 'Mars/Olympus' }), path: 'tz' },
  {
    name: 'rating below min rejected',
    input: makeEvent({ rating: MIN_RATING - 1 }),
    path: 'rating',
  },
  {
    name: 'rating above max rejected',
    input: makeEvent({ rating: MAX_RATING + 1 }),
    path: 'rating',
  },
  {
    name: 'retention below min rejected',
    input: makeEvent({ retention: MIN_RETENTION - 0.01 }),
    path: 'retention',
  },
  {
    name: 'retention above max rejected',
    input: makeEvent({ retention: MAX_RETENTION + 0.01 }),
    path: 'retention',
  },
  {
    name: 'negative responseMs rejected',
    input: makeEvent({ responseMs: -1 }),
    path: 'responseMs',
  },
  {
    name: 'oversized responseMs rejected',
    input: makeEvent({ responseMs: MAX_RESPONSE_MS + 1 }),
    path: 'responseMs',
  },
  {
    name: 'rating 1 with correct true rejected',
    input: makeEvent({ rating: 1, correct: true }),
    path: undefined,
  },
  {
    name: 'rating 2 with correct false rejected',
    input: makeEvent({ rating: 2, correct: false }),
    path: undefined,
  },
] as const;

describe('reviewEventInSchema', () => {
  it.each(validCases)('accepts $name', ({ input }) => {
    expect(reviewEventInSchema.safeParse(input).success).toBe(true);
    const result = syncRequestSchema.safeParse({ ...baseRequest, events: [baseEvent] });
    expect(result.data?.events[0]).toEqual(baseEvent);
  });

  it.each(invalidCases)('rejects $name', ({ input, path }) => {
    const result = reviewEventInSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(path);
  });
});

describe('syncRequestSchema events limit', () => {
  const deviceId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const baseRequest = { deviceId, sinceSeq: 0, events: [baseEvent] };

  it('accepts a request with 500 events', () => {
    const events = Array.from({ length: 500 }, () => baseEvent);
    expect(syncRequestSchema.safeParse({ ...baseRequest, events }).success).toBe(true);
  });

  it('rejects a request with 501 events', () => {
    const events = Array.from({ length: 501 }, () => baseEvent);
    expect(syncRequestSchema.safeParse({ ...baseRequest, events }).success).toBe(false);
  });
});

describe('reviewEventInSchema boundary, time zone and timestamp cases', () => {
  const validCases = [
    { name: 'UTC time zone accepted', input: makeEvent({ tz: 'UTC' }) },
    { name: 'lowercase time zone accepted', input: makeEvent({ tz: 'america/new_york' }) },
    {
      name: 'fractional seconds accepted',
      input: makeEvent({ reviewedAt: '2024-01-01T12:00:00.123Z' }),
    },
  ] as const;

  const invalidCases = [
    { name: 'fractional rating rejected', input: makeEvent({ rating: 2.5 }), path: 'rating' },
    { name: 'missing field rejected', input: makeEvent({ tz: undefined }), path: 'tz' },
    { name: 'empty time zone rejected', input: makeEvent({ tz: '' }), path: 'tz' },
    { name: 'overlong time zone rejected', input: makeEvent({ tz: 'A'.repeat(65) }), path: 'tz' },
    { name: 'malformed time zone rejected', input: makeEvent({ tz: 'Not/A.Zone' }), path: 'tz' },
    {
      name: 'offset without colon rejected',
      input: makeEvent({ reviewedAt: '2024-01-01T12:00:00+0530' }),
      path: 'reviewedAt',
    },
    {
      name: 'impossible date rejected',
      input: makeEvent({ reviewedAt: '2024-02-30T12:00:00Z' }),
      path: 'reviewedAt',
    },
  ] as const;

  it.each(validCases)('accepts $name', ({ input }) => {
    expect(reviewEventInSchema.safeParse(input).success).toBe(true);
  });

  it.each(invalidCases)('rejects $name', ({ input, path }) => {
    const result = reviewEventInSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(path);
  });
});

describe('syncRequestSchema envelope fields', () => {
  const invalidCases = [
    {
      name: 'invalid deviceId rejected',
      input: { ...baseRequest, deviceId: 'not-a-uuid' },
      path: 'deviceId',
    },
    {
      name: 'negative sinceSeq rejected',
      input: { ...baseRequest, sinceSeq: -1 },
      path: 'sinceSeq',
    },
    {
      name: 'fractional sinceSeq rejected',
      input: { ...baseRequest, sinceSeq: 2.5 },
      path: 'sinceSeq',
    },
  ] as const;

  it.each(invalidCases)('rejects $name', ({ input, path }) => {
    const result = syncRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(path);
  });
});

const baseCardState = {
  cardId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  state: 'New',
  due: '2024-06-01T12:00:00Z',
  stabilityFast: 10.5,
  stability: 10.5,
  difficulty: 2.5,
  reps: 3,
  lapses: 1,
  lastReview: '2024-06-01T12:00:00Z',
  lastSeq: 5,
  correctReps: 2,
  firstReview: '2024-05-01T12:00:00Z',
  scheduledDays: 4,
  learningStep: 0,
};

function makeCardState(overrides: Record<string, unknown>) {
  return { ...baseCardState, ...overrides };
}

describe('userCardStateSchema', () => {
  const validCases = CARD_STATES.map((state) => ({
    name: `state ${state} accepted`,
    input: makeCardState({ state }),
  }));

  const counterFields = [
    'reps',
    'lapses',
    'correctReps',
    'learningStep',
    'lastSeq',
    'scheduledDays',
  ] as const;

  const invalidCases = [
    { name: 'unknown state rejected', input: makeCardState({ state: 'Archived' }), path: 'state' },
    ...counterFields.flatMap((field) => [
      { name: `${field} fraction rejected`, input: makeCardState({ [field]: 1.5 }), path: field },
      { name: `${field} negative rejected`, input: makeCardState({ [field]: -1 }), path: field },
    ]),
    {
      name: 'difficulty below min rejected',
      input: makeCardState({ difficulty: 0 }),
      path: 'difficulty',
    },
    {
      name: 'difficulty above max rejected',
      input: makeCardState({ difficulty: 11 }),
      path: 'difficulty',
    },
  ];

  it.each(validCases)('accepts $name', ({ input }) => {
    expect(userCardStateSchema.safeParse(input).success).toBe(true);
  });

  it.each(invalidCases)('rejects $name', ({ input, path }) => {
    const result = userCardStateSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(path);
  });
});

describe('syncResponseSchema', () => {
  const baseResponse = {
    accepted: ['0192705a-3b36-7b7a-8f3e-4f3b2c1d8e9a'],
    rejected: [{ id: 'arbitrary-id-string', reason: 'invalid' }],
    cardStates: [],
    serverSeq: 0,
  };

  const validCases = [
    { name: 'rejected entry with arbitrary id and valid reason parses', input: baseResponse },
    ...['future', 'unknown_card', 'invalid'].map((reason) => ({
      name: `rejected reason ${reason} accepted`,
      input: { ...baseResponse, rejected: [{ id: 'any-id-at-all', reason }] },
    })),
    {
      name: 'valid card state accepted',
      input: { ...baseResponse, cardStates: [makeCardState({})] },
    },
  ];

  const invalidCases = [
    {
      name: 'unknown rejected reason fails',
      input: { ...baseResponse, rejected: [{ id: 'x', reason: 'nope' }] },
      path: 'rejected',
    },
    {
      name: 'invalid card state fails',
      input: { ...baseResponse, cardStates: [makeCardState({ state: 'Archived' })] },
      path: 'cardStates',
    },
  ];

  it.each(validCases)('accepts $name', ({ input }) => {
    expect(syncResponseSchema.safeParse(input).success).toBe(true);
  });

  it.each(invalidCases)('rejects $name', ({ input, path }) => {
    const result = syncResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(path);
  });
});
