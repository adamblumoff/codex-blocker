export function shouldTrustDiscoveredInstance(
  savedInstanceId: string | null,
  discoveredInstanceId: string
): boolean {
  if (!savedInstanceId) return true;
  return savedInstanceId === discoveredInstanceId;
}
