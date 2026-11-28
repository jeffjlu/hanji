import { createHash } from 'node:crypto';

/**
 * Namespace for every content id. Generated once with `crypto.randomUUID()` and
 * frozen: changing it changes every unit, entry, kanji and card id, which would
 * orphan every review event. Treat it like a migration you can never undo.
 */
export const CONTENT_ID_NAMESPACE = '882d493c-b84c-4abf-9968-14e8eb717655';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 9562 UUID version 5 (SHA-1, name-based). */
export function uuidV5(name: string, namespace: string): string {
  if (!UUID_PATTERN.test(namespace)) throw new Error(`Invalid namespace UUID: ${namespace}`);

  const bytes = createHash('sha1')
    .update(Buffer.from(namespace.replaceAll('-', ''), 'hex'))
    .update(name, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 9562 variant

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Natural keys. An id is a pure function of its natural key, so reseeding never
 * changes the id of a card that review events reference.
 *
 * Changing an entry's script or reading, or a unit's slug, creates a new row
 * with a new id; the old row stays (the loader never deletes) and is reported.
 * Glosses, titles, ranks and positions can change freely.
 */
export const contentKeys = {
  unit: (slug: string) => `unit:${slug}`,
  entry: (language: string, script: string, reading: string) =>
    `entry:${language}:${script}|${reading}`,
  kanji: (language: string, glyph: string) => `kanji:${language}:${glyph}`,
  card: (kind: string, targetKey: string) => `card:${kind}:${targetKey}`,
} as const;

export const contentId = (naturalKey: string): string => uuidV5(naturalKey, CONTENT_ID_NAMESPACE);
