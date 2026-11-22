import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyReview,
  buildSchedulers,
  createRng,
  toFsrsCard,
  type CardState,
  type Scheduler,
} from '@hanji/core';
import { Rating, type ReviewEventIn } from '@hanji/schemas';

// ---------------------------------------------------------------------------
// Parameters. Every one of these is echoed into the generated document.
// ---------------------------------------------------------------------------
export const PARAMS = {
  seed: 20261121,
  days: 365,
  retention: 0.9,
  newPerDayOptions: [5, 8, 12, 16, 20, 30],
  secondsPerReview: 8,
  lateWindowDays: 90, // average over the final N days
  comfortMinutes: 30,
  sessionStartHourUtc: 8,
  startDate: '2027-01-01T00:00:00.000Z', // fixed, so output never depends on the real clock
} as const;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Retrievability from the scheduler's own forgetting curve.
// ---------------------------------------------------------------------------
export function retrievability(scheduler: Scheduler, state: CardState, now: Date): number {
  const card = toFsrsCard(state);
  if (card.lastReviewAt === null) return 1;
  const elapsedDays = scheduler.chrono.difference(card.lastReviewAt, now);
  return scheduler.model.forgettingCurve(card, elapsedDays);
}

// ---------------------------------------------------------------------------
// Synthetic review event. applyReview does not validate ids, so a counter is fine.
// ---------------------------------------------------------------------------
function makeEvent(cardId: string, eventNo: number, at: Date, recalled: boolean): ReviewEventIn {
  return {
    id: `sim-${eventNo}`,
    cardId,
    reviewedAt: at.toISOString(),
    tz: 'UTC',
    retention: PARAMS.retention,
    rating: recalled ? Rating.Good : Rating.Again,
    responseMs: PARAMS.secondsPerReview * 1000,
    correct: recalled,
    hintUsed: false,
  };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
export type DayStats = { reviews: number; newCards: number };

export async function simulate(newPerDay: number): Promise<DayStats[]> {
  const rng = createRng(PARAMS.seed + newPerDay); // independent stream per setting
  const getScheduler = await buildSchedulers([PARAMS.retention]);
  const scheduler = getScheduler(PARAMS.retention);

  const cards = new Map<string, CardState>(); // only cards that have been reviewed
  const stats: DayStats[] = [];
  let nextCardId = 0;
  let eventNo = 0;
  const startMs = Date.parse(PARAMS.startDate);

  for (let day = 0; day < PARAMS.days; day++) {
    const dayStart = startMs + day * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    let clock = dayStart + PARAMS.sessionStartHourUtc * HOUR_MS;
    let reviews = 0;
    let newRemaining = newPerDay;

    // Cards due before the end of today, including overdue ones.
    // Cards rescheduled later today are appended as the session goes.
    const today: string[] = [];
    for (const [id, state] of cards) {
      if (Date.parse(state.due) < dayEnd) today.push(id);
    }

    const review = (id: string) => {
      const prev = cards.get(id) ?? null;
      const at = new Date(clock);
      // A card's first review counts as recalled (see assumptions).
      const p = prev ? retrievability(scheduler, prev, at) : 1;
      const recalled = rng() < p;
      const next = applyReview(prev, makeEvent(id, eventNo++, at, recalled), getScheduler);
      cards.set(id, next);
      clock += PARAMS.secondsPerReview * 1000;
      reviews++;
      // Learning and relearning steps can fall due again within the same session.
      if (Date.parse(next.due) < dayEnd) today.push(id);
    };

    for (;;) {
      // 1. Most overdue card that is due now (ties broken by id for determinism).
      let pickIndex = -1;
      let pickDue = Infinity;
      let pickId = '';
      for (let i = 0; i < today.length; i++) {
        const id = today[i]!;
        const due = Date.parse(cards.get(id)!.due);
        if (due <= clock && (due < pickDue || (due === pickDue && id < pickId))) {
          pickIndex = i;
          pickDue = due;
          pickId = id;
        }
      }
      if (pickIndex >= 0) {
        today[pickIndex] = today[today.length - 1]!; // swap-remove
        today.pop();
        review(pickId);
        continue;
      }

      // 2. Nothing due: introduce a new card.
      if (newRemaining > 0) {
        newRemaining--;
        review(`card-${nextCardId++}`);
        continue;
      }

      // 3. Only learning cards that fall due later today remain: wait for the earliest.
      if (today.length > 0) {
        let earliest = Infinity;
        for (const id of today) earliest = Math.min(earliest, Date.parse(cards.get(id)!.due));
        if (earliest >= dayEnd) break;
        clock = Math.max(clock, earliest);
        continue;
      }

      break;
    }

    stats.push({ reviews, newCards: newPerDay - newRemaining });
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
export type Row = {
  newPerDay: number;
  avgReviews: number;
  peakReviews: number;
  avgMinutes: number;
  peakMinutes: number;
};

export function summarise(newPerDay: number, stats: DayStats[]): Row {
  const tail = stats.slice(-PARAMS.lateWindowDays);
  const avgReviews = tail.reduce((sum, d) => sum + d.reviews, 0) / tail.length;
  const peakReviews = Math.max(...tail.map((d) => d.reviews));
  return {
    newPerDay,
    avgReviews,
    peakReviews,
    avgMinutes: (avgReviews * PARAMS.secondsPerReview) / 60,
    peakMinutes: (peakReviews * PARAMS.secondsPerReview) / 60,
  };
}

export function candidateDefault(rows: Row[]): Row {
  const fits = rows.filter((r) => r.avgMinutes <= PARAMS.comfortMinutes);
  return fits.length > 0 ? fits[fits.length - 1]! : rows[0]!;
}

// ---------------------------------------------------------------------------
// Document (no timestamp, so identical input gives identical output)
// ---------------------------------------------------------------------------
export function renderMarkdown(rows: Row[]): string {
  const f = (n: number, digits = 1) => n.toFixed(digits);
  const candidate = candidateDefault(rows);
  return [
    '# Review-load simulation',
    '',
    '> **This is a simulation, not a finding.** It shows how daily workload scales with the',
    '> new-card cap under the assumptions below. It was not measured on a real learner.',
    '',
    `Generated by \`pnpm sim:review-load\`. Do not edit by hand.`,
    '',
    `## Results (mean and peak over the last ${PARAMS.lateWindowDays} of ${PARAMS.days} simulated days)`,
    '',
    '| New cards/day | Avg reviews/day | Peak reviews/day | Avg minutes/day | Peak minutes/day |',
    '|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.newPerDay} | ${f(r.avgReviews)} | ${r.peakReviews} | ${f(r.avgMinutes)} | ${f(r.peakMinutes)} |`
    ),
    '',
    '## Assumptions',
    '',
    `- **Scheduler.** Core's \`applyReview\` (ts-fsrs, FSRS-6, library-default parameters, fuzz off). The script does not reimplement scheduling.`,
    `- **Target retention.** ${PARAMS.retention}, constant for the whole run.`,
    `- **Recall model.** At each review, recall is a seeded Bernoulli draw with probability equal to the scheduler's retrievability at that moment. Recalled gives Good; not recalled gives Again. Hard and Easy are never used.`,
    `- **First review.** A new card's first review counts as recalled (Good).`,
    `- **Randomness.** Seeded mulberry32, base seed ${PARAMS.seed}, offset by the new-card count so each setting has its own stream.`,
    `- **Seconds per review.** **${PARAMS.secondsPerReview} s, a placeholder.** Replace it with measured data from your own sessions. Minutes scale linearly with it.`,
    `- **Horizon.** ${PARAMS.days} days from ${PARAMS.startDate.slice(0, 10)}. Load is still creeping up slowly at the end of a year, so the late-window average approximates steady state and slightly understates the long-run load.`,
    `- **Session.** One session per day starting at ${String(PARAMS.sessionStartHourUtc).padStart(2, '0')}:00 UTC. The learner reviews everything due, including cards that come due again within the session, then adds the day's new cards. The backlog guard never fires.`,
    `- **No missed days.** Real use has gaps, and gaps build backlog.`,
    `- **Card mix.** Every card is one kind. There is no production-card gating, so the three-cards-per-word effect is not modelled.`,
    `- **Uniform cost.** Every review takes the same time. Real time varies by card kind, hints and typing.`,
    `- **No content limit.** There is always another new card to introduce.`,
    '',
    '## Candidate default',
    '',
    `The largest option whose average load stays at or under ${PARAMS.comfortMinutes} minutes is **${candidate.newPerDay} new cards/day** (${f(candidate.avgMinutes)} min average, ${f(candidate.peakMinutes)} min peak).`,
    `The plan's goal is 15 to 30 minutes a day. Staying at or under ${PARAMS.comfortMinutes} on average leaves room for backlog after a missed day and for real reviews being slower than the placeholder.`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function runAll(): Promise<{ rows: Row[]; markdown: string }> {
  const rows: Row[] = [];
  for (const n of PARAMS.newPerDayOptions) {
    rows.push(summarise(n, await simulate(n)));
  }
  return { rows, markdown: renderMarkdown(rows) };
}

async function main() {
  const { rows, markdown } = await runAll();
  const out = fileURLToPath(new URL('../../../docs/simulations/review-load.md', import.meta.url));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, markdown);
  console.table(
    rows.map((r) => ({
      'new/day': r.newPerDay,
      'avg reviews': Number(r.avgReviews.toFixed(1)),
      'peak reviews': r.peakReviews,
      'avg min': Number(r.avgMinutes.toFixed(1)),
      'peak min': Number(r.peakMinutes.toFixed(1)),
    }))
  );
  console.log(`Wrote ${out}`);
}

// Run only when executed directly, so tests can import the functions.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
