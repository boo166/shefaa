import type { RuntimeTransitionKind } from "./types";

export type TransitionJournalStatus = "started" | "completed" | "failed" | "rolled_back";

export type TransitionJournalEntry = {
  transitionId: string;
  runtimeEpoch: number;
  transitionType: RuntimeTransitionKind | string;
  tenantId: string | null;
  actorId: string | null;
  startedAt: number;
  completedAt?: number;
  failedAt?: number;
  rollbackTriggered: boolean;
  traceId: string;
  runtimeTransitionTraceId: string;
  status: TransitionJournalStatus;
};

const MAX = 100;
const ring: TransitionJournalEntry[] = [];

export const transitionJournal = {
  append(entry: TransitionJournalEntry) {
    ring.push(entry);
    while (ring.length > MAX) ring.shift();
  },

  update(transitionId: string, patch: Partial<TransitionJournalEntry>) {
    const i = ring.findIndex((e) => e.transitionId === transitionId);
    if (i >= 0) ring[i] = { ...ring[i]!, ...patch };
  },

  getRecent(): readonly TransitionJournalEntry[] {
    return [...ring];
  },

  getLastIncomplete(): TransitionJournalEntry | undefined {
    for (let i = ring.length - 1; i >= 0; i--) {
      const e = ring[i]!;
      if (e.status === "started") return e;
    }
    return undefined;
  },
};
