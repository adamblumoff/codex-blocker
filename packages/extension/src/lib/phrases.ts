export const BASE_PHRASES = [
  "Back to Codex!",
  "Time to focus.",
  "Let's do the thing.",
  "This tab can wait.",
  "Stay on task.",
];

export const ROAST_PHRASES = [
  "Sorry for cutting off your Twitter reply, I know it was contributing to human society in a positive way.",
  "Those scrolling skills are quite impressive. Mouse or arrow keys?",
  "This extension is no match for Insta reels.",
  "LinkedIn? Really? Has it really come to this.",
  "That Amazon cart is looking nicey, do you mind sending it to me?",
];

export function getPhrasesForMode(roastMode: boolean): string[] {
  return roastMode ? ROAST_PHRASES : BASE_PHRASES;
}
