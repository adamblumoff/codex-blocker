export const BASE_PHRASES = [
  "Back to Codex!",
  "Time to focus.",
  "Let's do the thing.",
  "This tab can wait.",
  "Stay on task.",
];

export const ROAST_PHRASES = [
  "Sorry for cutting off your Twitter reply, I know it was contributing to our society in a positive way.",
  "Those scrolling skills are quite impressive. Mouse or arrow keys?",
  "This extension is no match for phone and Insta reels.",
  "LinkedIn? Really?",
  "Wow, look at that Amazon cart. I know, you're \"just looking.\"",
  "That new LTT video was pretty interesting, wasn't it?", 
  "Nobody's gonna buy your shitty table off Facebook marketplace.", 
  "Wow you just gave them a lot of gifted subs, Twitch surely appreciates it.", 
  "Damn, left on read again, gotta step up your game.",
  "You finally blocked TikTok, that one hurts, doesn't it?"
];

export function getPhrasesForMode(roastMode: boolean): string[] {
  return roastMode ? ROAST_PHRASES : BASE_PHRASES;
}
