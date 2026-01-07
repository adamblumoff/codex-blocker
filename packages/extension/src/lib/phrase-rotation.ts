type PhraseRotationConfig = {
  phrases: string[];
  intervalMs: number;
  onPhrase: (phrase: string) => void;
};

export function startPhraseRotation(config: PhraseRotationConfig): () => void {
  const { phrases, intervalMs, onPhrase } = config;
  if (!phrases.length || intervalMs <= 0) {
    return () => {};
  }

  let index = 0;
  onPhrase(phrases[index]);
  const intervalId = window.setInterval(() => {
    index = (index + 1) % phrases.length;
    onPhrase(phrases[index]);
  }, intervalMs);

  return () => window.clearInterval(intervalId);
}
