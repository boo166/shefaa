import { useAuth } from "@/core/auth/authStore";
import { newRequestTraceId } from "@/platform/observability/traceContext";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { coordinationDiagnostics } from "./coordinationDiagnostics";
import { shouldRejectStaleCoordinationEvent } from "./coordinationReplay";
import { emitCoordinationMetric } from "./coordinationTelemetry";
import { isDuplicateCoordinationEventId } from "./eventDedup";
import { runtimeEpochManager } from "./runtimeEpochManager";
import type { RuntimeCoordinationEvent, RuntimeCoordinationEventType, RuntimeEpochBumpReason } from "./types";

type Handler = (event: RuntimeCoordinationEvent) => void;

const wildcard = new Set<Handler>();
const byType = new Map<RuntimeCoordinationEventType, Set<Handler>>();

function listenersFor(type: RuntimeCoordinationEventType): Set<Handler> {
  let set = byType.get(type);
  if (!set) {
    set = new Set();
    byType.set(type, set);
  }
  return set;
}

const EPOCH_BUMP_TYPES = new Set<RuntimeCoordinationEventType>([
  "AUTH_BOUNDARY_CHANGED",
  "TENANT_CONTEXT_CHANGED",
  "RUNTIME_MODE_CHANGED",
  "POLICY_ENFORCEMENT_CHANGED",
  "WORKFLOW_ABORTED",
  "INCIDENT_MODE_ENTERED",
]);

function bumpReasonForEvent(type: RuntimeCoordinationEventType): RuntimeEpochBumpReason {
  switch (type) {
    case "TENANT_CONTEXT_CHANGED":
      return "tenant_switch";
    case "RUNTIME_MODE_CHANGED":
      return "runtime_mode";
    case "AUTH_BOUNDARY_CHANGED":
      return "auth_boundary";
    case "INCIDENT_MODE_ENTERED":
      return "incident";
    case "WORKFLOW_ABORTED":
      return "workflow_invalidation";
    case "POLICY_ENFORCEMENT_CHANGED":
      return "policy_enforcement";
    default:
      return "manual";
  }
}

export type RuntimeEventBusPublishInput = Omit<
  RuntimeCoordinationEvent,
  "epoch" | "occurredAt" | "issuedAt" | "eventId" | "envelopeVersion"
> &
  Partial<Pick<RuntimeCoordinationEvent, "epoch" | "issuedAt" | "eventId" | "envelopeVersion">>;

function newEventId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : newRequestTraceId();
}

export const runtimeEventBus = {
  subscribe(type: RuntimeCoordinationEventType | "*", handler: Handler) {
    if (type === "*") {
      wildcard.add(handler);
      return () => wildcard.delete(handler);
    }
    const set = listenersFor(type);
    set.add(handler);
    return () => set.delete(handler);
  },

  /**
   * Publish a coordination event after replay/dedup/mode-ordering guards.
   * @returns null if the event was rejected (stale, duplicate, or superseded mode version).
   */
  publish(partial: RuntimeEventBusPublishInput): RuntimeCoordinationEvent | null {
    const issuedAt = partial.issuedAt ?? Date.now();
    if (shouldRejectStaleCoordinationEvent(issuedAt)) {
      coordinationDiagnostics.recordRejection("stale_event_age");
      emitCoordinationMetric("coordination.event.rejected", { reason: "stale_event_age" });
      return null;
    }

    const eventId = partial.eventId ?? newEventId();
    if (isDuplicateCoordinationEventId(eventId)) {
      coordinationDiagnostics.recordRejection("duplicate_event_id");
      emitCoordinationMetric("coordination.event.rejected", { reason: "duplicate_event_id" });
      return null;
    }

    if (partial.type === "RUNTIME_MODE_CHANGED" || partial.type === "INCIDENT_MODE_ENTERED") {
      const v = partial.payload?.runtimeModeVersion;
      if (typeof v === "number") {
        const cur = runtimeModeController.getSnapshot().effective.version;
        if (v < cur) {
          coordinationDiagnostics.recordRejection("stale_runtime_mode_version", `${v}<${cur}`);
          emitCoordinationMetric("coordination.event.rejected", { reason: "stale_runtime_mode_version" });
          return null;
        }
      }
    }

    const auth = useAuth.getState();

    let nextEpoch: number;
    if (partial.epoch !== undefined && partial.epoch !== null) {
      nextEpoch = runtimeEpochManager.adoptIfNewer(partial.epoch, "manual");
    } else if (EPOCH_BUMP_TYPES.has(partial.type)) {
      nextEpoch = runtimeEpochManager.bump(bumpReasonForEvent(partial.type), { type: partial.type });
    } else {
      nextEpoch = runtimeEpochManager.getCurrentEpoch();
    }

    const event: RuntimeCoordinationEvent = {
      ...partial,
      eventId,
      envelopeVersion: partial.envelopeVersion ?? 1,
      epoch: nextEpoch,
      issuedAt,
      occurredAt: issuedAt,
      tenantId: partial.tenantId ?? auth.user?.tenantId ?? null,
      actorId: partial.actorId ?? auth.user?.id ?? null,
    };

    emitCoordinationMetric("coordination.event_published", {
      type: event.type,
      epoch: event.epoch,
    });

    for (const h of wildcard) {
      try {
        h(event);
      } catch {
        /* ignore subscriber errors */
      }
    }
    const set = byType.get(event.type);
    if (set) {
      for (const h of set) {
        try {
          h(event);
        } catch {
          /* ignore */
        }
      }
    }
    return event;
  },
};
