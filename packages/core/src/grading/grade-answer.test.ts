import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MAX_RESPONSE_MS, Rating } from '@hanji/schemas';
import {
  gradeAnswer,
  MIN_SAMPLES_FOR_SLOWNESS,
  SLOW_FACTOR,
  type GradeInput,
} from './grade-answer.js';

const MEDIAN_MS = 4000;
const SLOW_THRESHOLD_MS = SLOW_FACTOR * MEDIAN_MS;

/** A correct, unhinted, on-median answer with just enough samples for the speed rule. */
const base: GradeInput = {
  correct: true,
  hintUsed: false,
  easyChosen: false,
  responseMs: MEDIAN_MS,
  medianMs: MEDIAN_MS,
  sampleCount: MIN_SAMPLES_FOR_SLOWNESS,
};

function grade(overrides: Partial<GradeInput> = {}) {
  return gradeAnswer({ ...base, ...overrides });
}

describe('gradeAnswer: wrong answers', () => {
  it.each([
    { name: 'plain wrong answer', override: {} },
    { name: 'wrong after a hint', override: { hintUsed: true } },
    { name: 'wrong and slow', override: { responseMs: SLOW_THRESHOLD_MS * 3 } },
    {
      name: 'wrong with Easy flag set (Easy only follows a correct answer)',
      override: { easyChosen: true },
    },
  ])('$name → Again', ({ override }) => {
    expect(grade({ correct: false, ...override })).toBe(Rating.Again);
  });
});

describe('gradeAnswer: correct answers', () => {
  it('on-median → Good', () => {
    expect(grade()).toBe(Rating.Good);
  });

  it('very fast → still Good (speed never promotes to Easy)', () => {
    expect(grade({ responseMs: 100 })).toBe(Rating.Good);
  });

  it('after a hint → Hard, even when fast', () => {
    expect(grade({ hintUsed: true, responseMs: 100 })).toBe(Rating.Hard);
  });

  it('after a hint and slow → Hard (not worse)', () => {
    expect(grade({ hintUsed: true, responseMs: SLOW_THRESHOLD_MS * 3 })).toBe(Rating.Hard);
  });
});

describe('gradeAnswer: slowness rule', () => {
  it('exactly twice the median → Good (boundary is "slower than")', () => {
    expect(grade({ responseMs: SLOW_THRESHOLD_MS })).toBe(Rating.Good);
  });

  it('1 ms over twice the median → Hard', () => {
    expect(grade({ responseMs: SLOW_THRESHOLD_MS + 1 })).toBe(Rating.Hard);
  });

  it(`applies at exactly ${MIN_SAMPLES_FOR_SLOWNESS} samples`, () => {
    expect(
      grade({ responseMs: SLOW_THRESHOLD_MS + 1, sampleCount: MIN_SAMPLES_FOR_SLOWNESS })
    ).toBe(Rating.Hard);
  });

  it(`does not apply below ${MIN_SAMPLES_FOR_SLOWNESS} samples`, () => {
    expect(
      grade({ responseMs: SLOW_THRESHOLD_MS * 10, sampleCount: MIN_SAMPLES_FOR_SLOWNESS - 1 })
    ).toBe(Rating.Good);
  });

  it('does not apply with no median at all', () => {
    expect(grade({ medianMs: null, sampleCount: 0, responseMs: MAX_RESPONSE_MS })).toBe(
      Rating.Good
    );
  });

  it('does not apply with a non-positive median', () => {
    expect(grade({ medianMs: 0, sampleCount: MIN_SAMPLES_FOR_SLOWNESS })).toBe(Rating.Good);
    expect(grade({ medianMs: -1, responseMs: 1 })).toBe(Rating.Good);
  });
});

describe('gradeAnswer: Easy', () => {
  it('explicit Easy on a correct answer → Easy', () => {
    expect(grade({ easyChosen: true })).toBe(Rating.Easy);
  });

  it('Easy wins over the speed rule', () => {
    expect(grade({ easyChosen: true, responseMs: SLOW_THRESHOLD_MS * 3 })).toBe(Rating.Easy);
  });

  it('Easy still works below the sample minimum', () => {
    expect(grade({ easyChosen: true, sampleCount: 0, medianMs: null })).toBe(Rating.Easy);
  });

  it('Easy is unavailable after a hint: the flag is ignored and the result is Hard', () => {
    expect(grade({ easyChosen: true, hintUsed: true })).toBe(Rating.Hard);
  });
});

describe('gradeAnswer: properties', () => {
  const inputArb: fc.Arbitrary<GradeInput> = fc.record({
    correct: fc.boolean(),
    hintUsed: fc.boolean(),
    easyChosen: fc.boolean(),
    responseMs: fc.integer({ min: 0, max: MAX_RESPONSE_MS }),
    medianMs: fc.option(fc.integer({ min: 1, max: 60_000 }), { nil: null }),
    sampleCount: fc.integer({ min: 0, max: 20 }),
  });

  const run = (check: (input: GradeInput, rating: Rating) => void) =>
    fc.assert(
      fc.property(inputArb, (input) => check(input, gradeAnswer(input))),
      { numRuns: 200 }
    );

  it('always returns a valid rating, and correct ⇔ rating ≠ Again (matches reviewEventInSchema)', () => {
    run((input, rating) => {
      expect([1, 2, 3, 4]).toContain(rating);
      expect(input.correct).toBe(rating !== Rating.Again);
    });
  });

  it('a hint never yields Good or Easy', () => {
    run((input, rating) => {
      if (input.hintUsed) expect(rating).toBeLessThanOrEqual(Rating.Hard);
    });
  });

  it('a correct, unhinted Easy choice always yields Easy', () => {
    run((input, rating) => {
      if (input.correct && !input.hintUsed && input.easyChosen) expect(rating).toBe(Rating.Easy);
    });
  });

  it('without Easy or a hint, below the sample minimum a correct answer is always Good', () => {
    run((input, rating) => {
      if (
        input.correct &&
        !input.hintUsed &&
        !input.easyChosen &&
        input.sampleCount < MIN_SAMPLES_FOR_SLOWNESS
      )
        expect(rating).toBe(Rating.Good);
    });
  });
});
