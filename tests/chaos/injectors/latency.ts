/** Artificial delay for chaos / soak scenarios. */
export async function withLatency<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  await new Promise((r) => setTimeout(r, Math.max(0, ms)));
  return fn();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}
