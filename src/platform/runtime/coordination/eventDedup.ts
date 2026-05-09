const DEDUP_TTL_MS = 60_000;
const MAX_KEYS = 512;

const seen = new Map<string, number>();

function prune() {
  const now = Date.now();
  for (const [k, t] of seen) {
    if (now - t > DEDUP_TTL_MS) seen.delete(k);
  }
  while (seen.size > MAX_KEYS) {
    const first = seen.keys().next().value;
    if (first === undefined) break;
    seen.delete(first);
  }
}

/** @returns true if duplicate (should skip processing / publishing fan-out) */
export function isDuplicateCoordinationEventId(eventId: string): boolean {
  prune();
  const now = Date.now();
  if (seen.has(eventId)) return true;
  seen.set(eventId, now);
  return false;
}

export function resetEventDedupForTests() {
  seen.clear();
}
