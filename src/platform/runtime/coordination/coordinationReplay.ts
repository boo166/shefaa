/** Stale coordination events beyond this age are rejected (aligned with auth replay window). */
export const COORD_EVENT_MAX_AGE_MS = 30_000;

export function shouldRejectStaleCoordinationEvent(issuedAt: number): boolean {
  return Date.now() - issuedAt > COORD_EVENT_MAX_AGE_MS;
}
