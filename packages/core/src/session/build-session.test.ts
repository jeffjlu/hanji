import { describe, expect, it } from 'vitest';
import { type CardDto } from '@hanji/schemas';
import { type CardState } from '../fsrs/card-state.js';
import { buildSession } from './build-session.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TZ = 'America/Los_Angeles';
// 13:00 PDT on 8 March 2026. The DST change happened at 10:00Z, so local
// midnight starting 8 March is 08:00Z (PST), which the cap tests use.
const NOW = new Date('2026-03-08T20:00:00.000Z');
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const ahead = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

/** A word: one entry with a recognition and a production card. */
function word(n: number, freqRank = n): { recognition: CardDto; production: CardDto } {
  const entry = {
    id: uuid(100 + n),
    script: `語${n}`,
    reading: 'ご',
    gloss: [`word ${n}`],
    pos: 'noun',
    freqRank,
  };
  return {
    recognition: {
      id: uuid(1000 + n),
      kind: 'recognition',
      position: n * 2 - 1,
      entry,
      kanji: null,
    },
    production: { id: uuid(2000 + n), kind: 'production', position: n * 2, entry, kanji: null },
  };
}

function kanjiCard(n: number, freqRank = n): CardDto {
  return {
    id: uuid(3000 + n),
    kind: 'kanji',
    position: 1000 + n,
    entry: null,
    kanji: {
      id: uuid(50_000 + n),
      glyph: String.fromCodePoint(0x4e00 + n),
      onReadings: [],
      kunReadings: [],
      gloss: [`kanji ${n}`],
      freqRank,
    },
  };
}

/** A reviewed card that is due yesterday by default. */
function state(card: CardDto, o: Partial<CardState> = {}): CardState {
  return {
    cardId: card.id,
    state: 'Review',
    due: ago(DAY),
    stability: 5,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    lastReview: ago(5 * DAY),
    correctReps: 3,
    firstReview: ago(10 * DAY),
    scheduledDays: 4,
    learningStep: 0,
    ...o,
  };
}

type Input = Parameters<typeof buildSession>[0];

function build(over: Partial<Input> = {}) {
  return buildSession({
    now: NOW,
    tz: TZ,
    seed: 1,
    content: [],
    userCards: [],
    newPerDay: 12,
    ...over,
  });
}

type Result = ReturnType<typeof build>;
const ids = (r: Result) => r.queue.map((i) => i.cardId);
const newIds = (r: Result) => r.queue.filter((i) => i.isNew).map((i) => i.cardId);
const dueIds = (r: Result) => r.queue.filter((i) => !i.isNew).map((i) => i.cardId);
const sorted = (xs: string[]) => [...xs].sort();

/** `count` kanji cards, each overdue by a different number of minutes. */
function overdue(count: number) {
  const cards = Array.from({ length: count }, (_, i) => kanjiCard(i + 1));
  const userCards = cards.map((c, i) => state(c, { due: ago((i + 1) * MIN) }));
  return { cards, userCards };
}

const freshKanji = (count: number) => Array.from({ length: count }, (_, i) => kanjiCard(900 + i));

// ---------------------------------------------------------------------------
// Due reviews
// ---------------------------------------------------------------------------

describe('due reviews', () => {
  it('queues reviewed cards due at or before now, and no others', () => {
    const early = kanjiCard(1);
    const exactlyNow = kanjiCard(2);
    const later = kanjiCard(3);
    const result = build({
      content: [early, exactlyNow, later],
      newPerDay: 0,
      userCards: [
        state(early, { due: ago(DAY) }),
        state(exactlyNow, { due: NOW.toISOString() }),
        state(later, { due: ahead(MIN) }),
      ],
    });
    expect(sorted(dueIds(result))).toEqual(sorted([early.id, exactlyNow.id]));
  });

  it.each(['Learning', 'Review', 'Relearning'] as const)('includes a due %s card', (s) => {
    const card = kanjiCard(1);
    const result = build({
      content: [card],
      newPerDay: 0,
      userCards: [state(card, { state: s, due: ago(MIN) })],
    });
    expect(dueIds(result)).toEqual([card.id]);
  });

  it('does not offer a reviewed card that is not yet due as a new card', () => {
    const card = kanjiCard(1);
    const result = build({
      content: [card],
      userCards: [state(card, { due: ahead(DAY) })],
    });
    expect(result.queue).toEqual([]);
  });

  it('reports the due count', () => {
    const { cards, userCards } = overdue(7);
    const result = build({ content: cards, userCards, newPerDay: 0 });
    expect(result.counts.due).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// New cards: selection and ordering
// ---------------------------------------------------------------------------

describe('new cards', () => {
  it('offers content cards that have no user state', () => {
    const cards = [kanjiCard(1), kanjiCard(2)];
    const result = build({ content: cards });
    expect(sorted(newIds(result))).toEqual(sorted(cards.map((c) => c.id)));
    expect(result.counts.newCards).toBe(2);
  });

  it('picks the lowest frequency ranks when the cap is smaller than the supply', () => {
    // freqRanks: 50, 10, 40, 20, 30, 60 -> the three lowest are cards 2, 4, 5
    const ranks = [50, 10, 40, 20, 30, 60];
    const content = ranks.map((r, i) => kanjiCard(i + 1, r));
    const result = build({ content, newPerDay: 3 });
    expect(sorted(newIds(result))).toEqual(sorted([2, 4, 5].map((n) => kanjiCard(n).id)));
  });

  it('breaks frequency ties by card position, not input order', () => {
    // cards 5 and 2 share rank 7; card 2 has the lower position (1002 < 1005)
    const content = [kanjiCard(5, 7), kanjiCard(2, 7), kanjiCard(9, 8)];
    const result = build({ content, newPerDay: 1 });
    expect(newIds(result)).toEqual([kanjiCard(2).id]);
  });

  it('lets a custom ordering replace frequency order (Travel mode seam)', () => {
    const content = [kanjiCard(1), kanjiCard(2), kanjiCard(3)];
    const result = build({
      content,
      newPerDay: 2,
      newCardOrder: (a: CardDto, b: CardDto) => b.position - a.position,
    });
    expect(sorted(newIds(result))).toEqual(sorted([kanjiCard(3).id, kanjiCard(2).id]));
  });

  describe('production cards', () => {
    const w = word(1);

    it.each([
      { name: 'its recognition card was never reviewed', userCards: [] as CardState[] },
      {
        name: 'its recognition card was only ever answered wrong',
        userCards: [
          state(w.recognition, {
            state: 'Learning',
            correctReps: 0,
            reps: 1,
            due: ahead(MIN),
          }),
        ],
      },
    ])('stay locked when $name', ({ userCards }) => {
      const result = build({ content: [w.recognition, w.production], userCards });
      expect(newIds(result)).not.toContain(w.production.id);
    });

    it('unlock once the recognition card has been answered correctly at least once', () => {
      const result = build({
        content: [w.recognition, w.production],
        userCards: [
          state(w.recognition, {
            state: 'Learning',
            correctReps: 1,
            reps: 1,
            due: ahead(MIN),
          }),
        ],
      });
      expect(newIds(result)).toEqual([w.production.id]);
    });

    it('do not unlock within the same build as their recognition card', () => {
      const result = build({ content: [w.recognition, w.production] });
      expect(newIds(result)).toEqual([w.recognition.id]);
    });

    it('do not use up the daily cap while locked', () => {
      const lockedWord = word(1, 1); // lowest rank, production locked
      const kanji = kanjiCard(5, 99);
      const result = build({
        content: [lockedWord.production, kanji],
        newPerDay: 1,
      });
      expect(newIds(result)).toEqual([kanji.id]);
    });
  });

  it('does not gate kanji cards', () => {
    const k = kanjiCard(1);
    expect(newIds(build({ content: [k] }))).toEqual([k.id]);
  });
});

// ---------------------------------------------------------------------------
// Daily cap
// ---------------------------------------------------------------------------

describe('daily new-card cap', () => {
  it('offers at most newPerDay new cards', () => {
    const result = build({ content: freshKanji(20), newPerDay: 5 });
    expect(newIds(result)).toHaveLength(5);
    expect(result.counts.newCards).toBe(5);
  });

  it('subtracts cards already introduced today', () => {
    const intro = [kanjiCard(1), kanjiCard(2), kanjiCard(3)];
    const userCards = intro.map((c) =>
      state(c, {
        state: 'Learning',
        due: ahead(10 * MIN),
        firstReview: ago(30 * MIN),
        correctReps: 1,
        reps: 1,
      })
    );
    const result = build({
      content: [...intro, ...freshKanji(10)],
      userCards,
      newPerDay: 5,
    });
    expect(newIds(result)).toHaveLength(2);
    expect(result.counts.introducedToday).toBe(3);
  });

  it.each([
    {
      name: 'exactly local midnight (08:00Z) counts as today',
      at: '2026-03-08T08:00:00.000Z',
      today: true,
    },
    {
      name: 'one second before local midnight is yesterday',
      at: '2026-03-08T07:59:59.000Z',
      today: false,
    },
    {
      name: 'a UTC-today instant that is still local yesterday does not count',
      at: '2026-03-08T05:00:00.000Z',
      today: false,
    },
  ])('uses the device time zone for "today": $name', ({ at, today }) => {
    const card = kanjiCard(1);
    const result = build({
      content: [card, ...freshKanji(5)],
      newPerDay: 3,
      userCards: [state(card, { firstReview: at, due: ahead(DAY) })],
    });
    expect(result.counts.introducedToday).toBe(today ? 1 : 0);
    expect(newIds(result)).toHaveLength(today ? 2 : 3);
  });

  it('does not count cards introduced on earlier days', () => {
    const card = kanjiCard(1);
    const result = build({
      content: [card, ...freshKanji(5)],
      newPerDay: 3,
      userCards: [state(card, { firstReview: ago(3 * DAY), due: ahead(DAY) })],
    });
    expect(newIds(result)).toHaveLength(3);
  });

  it('gives a second session the same day only the remainder', () => {
    const content = Array.from({ length: 8 }, (_, i) => kanjiCard(i + 1));
    const byId = new Map(content.map((c) => [c.id, c]));
    const introduce = (cardIds: string[]) =>
      cardIds.map((id) =>
        state(byId.get(id)!, {
          state: 'Learning',
          due: ahead(10 * MIN),
          firstReview: ago(30 * MIN),
          correctReps: 1,
          reps: 1,
        })
      );

    const first = build({ content, newPerDay: 5 });
    expect(newIds(first)).toHaveLength(5);

    // The learner gets through two of them, then builds another session.
    const done = newIds(first).slice(0, 2);
    const second = build({ content, newPerDay: 5, userCards: introduce(done) });
    expect(newIds(second)).toHaveLength(3);
    for (const id of done) expect(newIds(second)).not.toContain(id);

    // After all five are introduced the cap is spent.
    const all = build({ content, newPerDay: 5, userCards: introduce(newIds(first)) });
    expect(newIds(all)).toHaveLength(0);
    expect(all.blockedReason).toBe('cap');
  });

  it('never goes negative when more were introduced today than the cap allows', () => {
    const intro = [1, 2, 3, 4].map((n) => kanjiCard(n));
    const result = build({
      content: [...intro, ...freshKanji(3)],
      newPerDay: 2,
      userCards: intro.map((c) => state(c, { firstReview: ago(MIN), due: ahead(DAY) })),
    });
    expect(newIds(result)).toEqual([]);
    expect(result.blockedReason).toBe('cap');
  });

  it('offers nothing when newPerDay is 0', () => {
    const result = build({ content: freshKanji(3), newPerDay: 0 });
    expect(newIds(result)).toEqual([]);
    expect(result.blockedReason).toBe('cap');
  });

  it('reports no blocked reason when new cards are offered', () => {
    expect(build({ content: freshKanji(3) }).blockedReason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Backlog guard
// ---------------------------------------------------------------------------

describe('backlog guard', () => {
  it('still offers new cards at exactly 100 overdue reviews', () => {
    const { cards, userCards } = overdue(100);
    const result = build({ content: [...cards, ...freshKanji(3)], userCards });
    expect(newIds(result)).toHaveLength(3);
    expect(result.blockedReason).toBeNull();
  });

  it('blocks new cards at 101 overdue reviews, keeping every review', () => {
    const { cards, userCards } = overdue(101);
    const result = build({ content: [...cards, ...freshKanji(3)], userCards });
    expect(newIds(result)).toEqual([]);
    expect(dueIds(result)).toHaveLength(101);
    expect(result.blockedReason).toBe('backlog');
    expect(result.counts.newCards).toBe(0);
  });

  it('counts "overdue" as due strictly before now', () => {
    // 100 strictly overdue plus one due exactly now: 101 due, but only 100 overdue.
    const { cards, userCards } = overdue(100);
    const edge = kanjiCard(500);
    const result = build({
      content: [...cards, edge, ...freshKanji(3)],
      userCards: [...userCards, state(edge, { due: NOW.toISOString() })],
    });
    expect(dueIds(result)).toHaveLength(101);
    expect(newIds(result)).toHaveLength(3);
    expect(result.blockedReason).toBeNull();
  });

  it('reports backlog rather than cap when both apply', () => {
    // Decision: backlog is the more actionable reason, so it wins.
    const { cards, userCards } = overdue(101);
    const result = build({ content: [...cards, ...freshKanji(3)], userCards, newPerDay: 0 });
    expect(result.blockedReason).toBe('backlog');
  });
});

// ---------------------------------------------------------------------------
// Queue shape and determinism
// ---------------------------------------------------------------------------

describe('queue', () => {
  const { cards: dueCards, userCards } = overdue(15);
  const input = { content: [...dueCards, ...freshKanji(15)], userCards, newPerDay: 15 };

  it('gives the same queue for the same inputs and seed', () => {
    expect(build({ ...input, seed: 42 })).toEqual(build({ ...input, seed: 42 }));
  });

  it('gives a different order for a different seed, with the same cards', () => {
    const a = build({ ...input, seed: 1 });
    const b = build({ ...input, seed: 2 });
    expect(ids(a)).not.toEqual(ids(b));
    expect(sorted(ids(a))).toEqual(sorted(ids(b)));
  });

  it('contains each card at most once', () => {
    const queue = ids(build(input));
    expect(new Set(queue).size).toBe(queue.length);
    expect(queue).toHaveLength(30);
  });

  it('mixes due and new cards rather than listing one group first', () => {
    const queue = build(input).queue;
    expect(queue.slice(0, 15).some((i) => i.isNew)).toBe(true);
    expect(queue.slice(0, 15).some((i) => !i.isNew)).toBe(true);
  });

  it('does not mutate its inputs', () => {
    const snapshot = structuredClone(input);
    build(input);
    expect(input).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Empty queues
// ---------------------------------------------------------------------------

describe('empty queue', () => {
  it('returns a cap reason, not an error, when the cap is spent and nothing is due', () => {
    const card = kanjiCard(1);
    const result = build({
      content: [card, ...freshKanji(3)],
      newPerDay: 1,
      userCards: [state(card, { firstReview: ago(MIN), due: ahead(DAY) })],
    });
    expect(result.queue).toEqual([]);
    expect(result.blockedReason).toBe('cap');
  });

  it('returns an empty queue without throwing when there is no content', () => {
    const result = build();
    expect(result.queue).toEqual([]);
    expect(result.counts).toMatchObject({ due: 0, newCards: 0, introducedToday: 0 });
  });

  it('returns an empty queue when every card has been introduced and none is due', () => {
    const cards = [kanjiCard(1), kanjiCard(2)];
    const result = build({
      content: cards,
      userCards: cards.map((c) => state(c, { due: ahead(DAY) })),
    });
    expect(result.queue).toEqual([]);
    expect(result.blockedReason).toBeNull(); // nothing left to introduce, so neither guard applies
  });
});
