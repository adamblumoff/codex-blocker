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

type RandomPhraseRotationConfig = {
  phrases: string[];
  intervalMs: number;
  onPhrase: (phrase: string) => void;
  seed: number;
  now?: () => number;
};

export function startRandomPhraseRotation(
  config: RandomPhraseRotationConfig,
): () => void {
  const { phrases, intervalMs, onPhrase, seed, now } = config;
  if (!phrases.length || intervalMs <= 0) {
    return () => {};
  }

  const nowFn = now ?? (() => Date.now());
  let intervalId: number | null = null;
  let timeoutId: number | null = null;

  const makeRng = (initialSeed: number) => {
    let t = (initialSeed >>> 0) || 1;
    return () => {
      t += 0x6d2b79f5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  };

  const buildOrder = () => {
    const order = Array.from({ length: phrases.length }, (_, idx) => idx);
    if (phrases.length <= 1) return order;

    const rand = makeRng(seed);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    return order;
  };

  const order = buildOrder();

  const pickIndex = (slot: number) => {
    if (order.length === 1) return order[0]!;
    return order[slot % order.length]!;
  };

  const updatePhrase = () => {
    const slot = Math.floor(nowFn() / intervalMs);
    const index = pickIndex(slot);
    onPhrase(phrases[index]);
  };

  updatePhrase();
  const remainder = nowFn() % intervalMs;
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
