/**
 * Profanity filter hook. The default implementation masks a small word list (English +
 * Vietnamese) with light leetspeak normalisation. Swap in a better service with
 * setTextFilter() — e.g. a moderation API — without touching the chat code.
 */
export interface TextFilter {
  /** Return the text to broadcast (masked), or null to drop the message entirely. */
  clean(text: string): string | null;
}

const WORDS = [
  // English
  'fuck',
  'fucking',
  'fucker',
  'motherfucker',
  'shit',
  'bullshit',
  'bitch',
  'cunt',
  'asshole',
  'dick',
  'bastard',
  'slut',
  'whore',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'wanker',
  // Vietnamese
  'địt',
  'đụ',
  'lồn',
  'cặc',
  'đéo',
  'đĩ',
  'dcm',
  'dmm',
  'đcm',
  'đmm',
  'vcl',
  'vkl',
  'clgt',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

function normaliseChar(ch: string): string {
  const lower = ch.toLowerCase();
  return LEET[lower] ?? lower;
}

export class WordListFilter implements TextFilter {
  private readonly pattern: RegExp;

  constructor(words: readonly string[] = WORDS) {
    const escaped = words
      .map((w) =>
        w
          .normalize('NFC')
          .toLowerCase()
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .sort((a, b) => b.length - a.length);
    // Whole words only, using Unicode letter boundaries (so "class" doesn't match "ass").
    this.pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{N}])`,
      'gu',
    );
  }

  clean(text: string): string {
    const chars = [...text];
    const norm = chars.map(normaliseChar);
    // Map normalised code-point offsets back onto the original characters.
    const joined = norm.join('');
    const starts: number[] = [];
    let off = 0;
    for (const n of norm) {
      starts.push(off);
      off += n.length;
    }
    let changed = false;
    for (const m of joined.matchAll(this.pattern)) {
      const begin = m.index;
      const end = begin + m[0].length;
      for (let i = 0; i < chars.length; i++) {
        const s = starts[i]!;
        if (s > begin && s < end) {
          chars[i] = '*';
          changed = true;
        }
      }
    }
    return changed ? chars.join('') : text;
  }
}

let active: TextFilter = new WordListFilter();

export function setTextFilter(filter: TextFilter): void {
  active = filter;
}

export function textFilter(): TextFilter {
  return active;
}
