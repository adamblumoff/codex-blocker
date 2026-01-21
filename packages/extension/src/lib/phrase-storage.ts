import { BASE_PHRASES, ROAST_PHRASES } from "./phrases.js";

export const PHRASE_STORAGE_KEYS = {
  base: "basePhrases",
  roast: "roastPhrases",
} as const;

export type PhraseSet = {
  base: string[];
  roast: string[];
};

export function sanitizePhrases(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    sanitized.push(value);
  }
  return sanitized;
}

export function resolvePhraseSet(rawBase: unknown, rawRoast: unknown): PhraseSet {
  const base = sanitizePhrases(rawBase);
  const roast = sanitizePhrases(rawRoast);
  return {
    base: base.length > 0 ? base : [...BASE_PHRASES],
    roast: roast.length > 0 ? roast : [...ROAST_PHRASES],
  };
}

export function loadStoredPhrases(): Promise<PhraseSet> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      [PHRASE_STORAGE_KEYS.base, PHRASE_STORAGE_KEYS.roast],
      (result) => {
        resolve(
          resolvePhraseSet(
            result[PHRASE_STORAGE_KEYS.base],
            result[PHRASE_STORAGE_KEYS.roast]
          )
        );
      }
    );
  });
}
