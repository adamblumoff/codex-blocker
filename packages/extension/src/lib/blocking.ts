export type BlockInputs = {
  bypassActive: boolean;
  serverConnected: boolean;
  sessions: number;
  working: number;
  waitingForInput: number;
};

export function computeShouldBlock({
  bypassActive,
  serverConnected,
  sessions,
  working,
  waitingForInput,
}: BlockInputs): boolean {
  const hasActiveSession = sessions > 0;
  const isIdle = working === 0 && waitingForInput === 0;
  return !bypassActive && (!serverConnected || (hasActiveSession && isIdle));
}

export function applyOverrides(
  baseBlocked: boolean,
  forceOpen: boolean,
  forceBlock: boolean
): boolean {
  const cancelOverride = forceBlock && forceOpen;
  if (cancelOverride) return baseBlocked;
  if (forceOpen) return false;
  if (forceBlock) return true;
  return baseBlocked;
}
