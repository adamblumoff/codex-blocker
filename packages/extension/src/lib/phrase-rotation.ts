type PhraseRotationConfig = {
  phrases: string[];
  intervalMs: number;
  onPhrase: (phrase: string) => void;
  startAtMs?: number;
  now?: () => number;
};

export function startPhraseRotation(config: PhraseRotationConfig): () => void {
  const { phrases, intervalMs, onPhrase, startAtMs, now } = config;
  if (!phrases.length || intervalMs <= 0) {
    return () => {};
  }

  const nowFn = now ?? (() => Date.now());
  const startAt = startAtMs ?? nowFn();
  let lastIndex: number | null = null;
  let intervalId: number | null = null;
  let timeoutId: number | null = null;

  const updatePhrase = () => {
    const elapsed = Math.max(0, nowFn() - startAt);
    const index = Math.floor(elapsed / intervalMs) % phrases.length;
    if (index !== lastIndex) {
      lastIndex = index;
      onPhrase(phrases[index]);
    }
  };

  updatePhrase();
  const elapsed = Math.max(0, nowFn() - startAt);
  const remainder = elapsed % intervalMs;
  const delay = remainder === 0 ? intervalMs : intervalMs - remainder;
  timeoutId = window.setTimeout(() => {
    updatePhrase();
    intervalId = window.setInterval(updatePhrase, intervalMs);
  }, delay);

  return () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
  };
}
