import { describe, expect, it } from 'vitest';
import { CONTENT_ID_NAMESPACE, contentId, contentKeys, uuidV5 } from './ids.js';

const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('uuidV5', () => {
  it('matches the RFC 9562 test vector', () => {
    expect(uuidV5('www.example.com', DNS_NAMESPACE)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('sets the version and variant bits', () => {
    expect(contentId('anything')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('is deterministic and distinguishes keys', () => {
    expect(contentId('unit:a')).toBe(contentId('unit:a'));
    expect(contentId('unit:a')).not.toBe(contentId('unit:b'));
  });

  it('rejects a malformed namespace', () => {
    expect(() => uuidV5('x', 'not-a-uuid')).toThrow(/Invalid namespace/);
  });
});

describe('content ids', () => {
  // Review events reference these ids. If this test fails, the namespace or a
  // natural-key format changed, and every stored review would be orphaned.
  it('are pinned for the namespace and key formats', () => {
    expect(CONTENT_ID_NAMESPACE).toBe('882d493c-b84c-4abf-9968-14e8eb717655');
    expect({
      unit: contentId(contentKeys.unit('food-and-drink')),
      entry: contentId(contentKeys.entry('ja', '水', 'みず')),
      kanji: contentId(contentKeys.kanji('ja', '水')),
      card: contentId(contentKeys.card('recognition', contentKeys.entry('ja', '水', 'みず'))),
    }).toMatchInlineSnapshot(`
      {
        "card": "17c1683c-4cf6-590a-915f-8743335336b8",
        "entry": "ba718f7f-6a38-58bd-b954-9bfd82c1504d",
        "kanji": "42d25d95-48df-5fb8-83af-628fa288439f",
        "unit": "3628a539-f12f-5e87-bc10-d8056261f9e6",
      }
    `);
  });
});
