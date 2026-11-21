import { toHiragana, toRomaji } from 'wanakana';

// Readings are short; anything longer is not a plausible answer (and overflows wanakana's stack).
const MAX_INPUT_LENGTH = 128;
const VOWEL_KANA = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' } as const;

export function checkReading(input: string, expected: string): boolean {
  const a = processForCheck(input);
  return a !== '' && a === processForCheck(expected);
}

function processForCheck(input: string): string {
  const compact = input.replace(/\s+/g, '').toLowerCase();
  if (compact.length > MAX_INPUT_LENGTH) return '';
  const hira = toHiragana(compact.replace(/m(?=[bmp])/g, 'n').replace(/nn(?![aiueoy])/g, 'n'), {
    convertLongVowelMark: false,
  }).replace(/を/g, 'お');
  return expandLongVowelMarks(hira);
}

/** Replace each ー with the vowel kana of the preceding kana (コー → こお, ヒー → ひい). */
function expandLongVowelMarks(hira: string): string {
  let out = '';
  for (const ch of hira) {
    if (ch === 'ー' && out) {
      const vowel = toRomaji(out.slice(-1)).slice(-1) as keyof typeof VOWEL_KANA;
      out += VOWEL_KANA[vowel] ?? ch;
    } else {
      out += ch;
    }
  }
  return out;
}
