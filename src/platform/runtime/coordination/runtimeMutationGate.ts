import { emitCoordinationMetric } from "./coordinationTelemetry";

let frozen = false;
let freezeReason: string | null = null;

export const runtimeMutationGate = {
  isWritesFrozen(): boolean {
    return frozen;
  },

  freezeWrites(reason: string) {
    frozen = true;
    freezeReason = reason;
    emitCoordinationMetric("coordination.mutation_freeze", { phase: "on", reason });
  },

  unfreezeWrites() {
    frozen = false;
    freezeReason = null;
    emitCoordinationMetric("coordination.mutation_freeze", { phase: "off" });
  },

  getFreezeReason(): string | null {
    return freezeReason;
  },
};
