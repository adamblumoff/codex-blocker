export type BlockInputs = {
  serverConnected: boolean;
  sessions: number;
  working: number;
  waitingForInput: number;
};

export function computeShouldBlock({
  serverConnected,
  sessions,
  working,
  waitingForInput,
}: BlockInputs): boolean {
  const hasActiveSession = sessions > 0;
  const hasWaitingForInput = waitingForInput > 0;
  const isIdle = working === 0;
  return !serverConnected || hasWaitingForInput || (hasActiveSession && isIdle);
}
