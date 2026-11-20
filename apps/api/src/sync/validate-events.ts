import {
  MAX_FUTURE_SKEW,
  reviewEventInSchema,
  type Rejected,
  type ReviewEventIn,
  type SyncEnvelope,
} from '@hanji/schemas';

export type ValidatedEvent = { event: ReviewEventIn; at: Date };

export type ValidationResult = { rejected: Rejected; valid: ValidatedEvent[] };

export function validateEvents(envelope: SyncEnvelope, now: Date): ValidationResult {
  const cutoff = now.getTime() + MAX_FUTURE_SKEW;
  const rejected: Rejected = [];
  const valid: ValidatedEvent[] = [];
  const seen = new Set<string>();

  for (const raw of envelope.events) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);

    const parsed = reviewEventInSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ id: raw.id, reason: 'invalid' });
      continue;
    }

    const at = new Date(parsed.data.reviewedAt);
    if (at.getTime() > cutoff) {
      rejected.push({ id: raw.id, reason: 'future' });
      continue;
    }

    valid.push({ event: parsed.data, at });
  }
  return { rejected, valid };
}
