import { selectEffectiveTenantId, useAuth } from "@/core/auth/authStore";
import { authorize } from "@/platform/authorization/authorize";
import { buildTracePayload } from "@/platform/observability/traceContext";
import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";
import { emitCoordinationMetric } from "@/platform/runtime/coordination/coordinationTelemetry";
import { runtimeMutationGate } from "@/platform/runtime/coordination/runtimeMutationGate";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { resolveRuntimePolicy } from "@/platform/runtime/policy";
import { ServiceError } from "@/services/supabase/errors";
import type {
  PlatformRepositoryContext,
  RepositoryOperationClassification,
} from "./platformRepository.context";

export type PlatformRepositoryDispatch = (
  tableOrFn: string,
  args?: Record<string, unknown>,
) => unknown | Promise<unknown>;

export type PlatformRepositoryMiddleware = (
  ctx: PlatformRepositoryContext,
  next: PlatformRepositoryDispatch,
) => PlatformRepositoryDispatch;

export const RETRYABLE_CLASSES: ReadonlySet<RepositoryOperationClassification> =
  new Set(["eventual", "readonly"]);

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ServiceError("Operation aborted", { code: "ABORTED", status: 499 });
  }
}

export const traceMiddleware: PlatformRepositoryMiddleware = (ctx, next) => {
  const state = useAuth.getState();
  ctx.runtimeEpoch = runtimeEpochManager.getCurrentEpoch();
  ctx.trace = buildTracePayload({
    tenantId: ctx.tenantId ?? undefined,
    actorId: state.user?.id ?? undefined,
    sessionVersion: state.sessionVersion,
    ...ctx.trace,
  });
  return (tableOrFn, args) => next(tableOrFn, args);
};

export const authBoundaryMiddleware: PlatformRepositoryMiddleware = (ctx, next) => {
  return (tableOrFn, args) => {
    throwIfAborted(ctx.signal);
    if (ctx.tenantScoped && ctx.tenantId) {
      const state = useAuth.getState();
      const effective = selectEffectiveTenantId(state);
      if (effective !== ctx.tenantId) {
        emitPlatformMetric("stale_context_rejected", {
          action: ctx.action,
          expectedTenant: ctx.tenantId,
          effectiveTenant: effective ?? "",
        });
        throw new ServiceError("Stale tenant context — refresh or switch tenant", {
          code: "STALE_TENANT_CONTEXT",
        });
      }
      if (
        state.user?.tenantStatus &&
        state.user.tenantStatus !== "active" &&
        !state.user.globalRoles.includes("super_admin")
      ) {
        throw new ServiceError(`Clinic access is ${state.user.tenantStatus}`, {
          code: "TENANT_SUSPENDED",
        });
      }
    }
    return next(tableOrFn, args);
  };
};

function envFlag(name: string): boolean {
  const v = (import.meta as any)?.env?.[name] ?? (typeof process !== "undefined" ? process.env[name] : undefined);
  return v === "1" || v === "true";
}

export const capabilityEnforcementMiddleware: PlatformRepositoryMiddleware = (ctx, next) => {
  const enforce = envFlag("VITE_RUNTIME_CAPABILITY_ENFORCE");
  return (tableOrFn, args) => {
    const required = ctx.requiredCapabilities ?? [];
    if (required.length === 0) return next(tableOrFn, args);

    const result = authorize({
      anyOfCapabilities: required,
      context: { resourceTenantId: ctx.tenantScoped ? ctx.tenantId ?? null : null },
    });

    if (!result.ok) {
      const metric =
        result.code === "assurance_requirement_failed"
          ? "policy.assurance_requirement_failed"
          : "policy.capability_denied";
      emitPlatformMetric(metric, {
        action: ctx.action,
        capability: required.join(","),
        code: result.code,
      });
      if (enforce) {
        throw new ServiceError("Policy blocked: capability denied", { code: "CAPABILITY_DENIED", status: 403 });
      }
    }

    return next(tableOrFn, args);
  };
};

export const runtimePolicyMiddleware: PlatformRepositoryMiddleware = (ctx, next) => {
  const enforce = envFlag("VITE_RUNTIME_POLICY_ENFORCE");
  return (tableOrFn, args) => {
    const snap = runtimeModeController.getSnapshot();
    const runtimeState = snap.effective;
    const operationClass = ctx.classification ?? "readonly";
    const authState = useAuth.getState();

    const policy = resolveRuntimePolicy({
      operation: ctx.operation ?? ctx.action,
      operationClass,
      capability: ctx.requiredCapabilities?.[0],
      assuranceLevel: authState.privilegedAuth?.currentLevel ?? null,
      runtimeState,
      tenantTier: undefined,
      tenantStatus: authState.user?.tenantStatus ?? null,
    });

    ctx.runtimePolicy = policy;
    ctx.policyContextVersion = runtimeState.version;

    const isWrite = operationClass !== "readonly" && operationClass !== "eventual";
    if (isWrite && !policy.writeAllowed) {
      emitPlatformMetric("policy.runtime_blocked", {
        action: ctx.action,
        mode: runtimeState.effectiveMode,
        classification: operationClass,
        decisionId: policy.decisionId,
      });
      if (enforce) {
        throw new ServiceError("Policy blocked: runtime mode disallows writes", {
          code: "RUNTIME_MODE_BLOCKED",
          status: 503,
        });
      }
    }

    if (ctx.subsystem && runtimeState.freezes?.[ctx.subsystem]) {
      const freeze = runtimeState.freezes[ctx.subsystem]!;
      if (isWrite && freeze.writes === false) {
        emitPlatformMetric("policy.runtime_blocked", {
          action: ctx.action,
          subsystem: ctx.subsystem,
          mode: runtimeState.effectiveMode,
          decisionId: policy.decisionId,
        });
        if (enforce) {
          throw new ServiceError("Policy blocked: subsystem frozen", {
            code: "SUBSYSTEM_FROZEN",
            status: 503,
          });
        }
      }
    }

    return next(tableOrFn, args);
  };
};

export const retryClassificationMiddleware: PlatformRepositoryMiddleware = (
  ctx,
  next,
) => {
  const classification = ctx.classification ?? "readonly";
  return (tableOrFn, args) => {
    emitPlatformMetric("repository_retry_classification", {
      action: ctx.action,
      classification,
      retryableClass: RETRYABLE_CLASSES.has(classification),
    });
    return next(tableOrFn, args);
  };
};

export const metricsMiddleware: PlatformRepositoryMiddleware = (ctx, next) => {
  const classification = ctx.classification ?? "readonly";
  return (tableOrFn, args) => {
    emitPlatformMetric("repository_access_start", {
      action: ctx.action,
      classification,
      tenantScoped: Boolean(ctx.tenantScoped),
    });
    try {
      const result = next(tableOrFn, args);
      if (result instanceof Promise) {
        return result
          .then((value) => {
            emitPlatformMetric("repository_access_success", {
              action: ctx.action,
              classification,
            });
            return value;
          })
          .catch((err) => {
            emitPlatformMetric("repository_access_failure", {
              action: ctx.action,
              classification,
              code: err instanceof ServiceError ? err.code ?? "" : "unknown",
            });
            throw err;
          });
      }
      emitPlatformMetric("repository_access_success", {
        action: ctx.action,
        classification,
      });
      return result;
    } catch (err) {
      emitPlatformMetric("repository_access_failure", {
        action: ctx.action,
        classification,
        code: err instanceof ServiceError ? err.code ?? "" : "unknown",
      });
      throw err;
    }
  };
};

export const invariantMiddleware: PlatformRepositoryMiddleware = (_ctx, next) => {
  return (tableOrFn, args) => next(tableOrFn, args);
};

/** Blocks writes while the coordination kernel has frozen mutations (e.g. tenant switch). */
export const mutationFreezeMiddleware: PlatformRepositoryMiddleware = (ctx, next) => {
  const enforce = envFlag("VITE_RUNTIME_MUTATION_FREEZE_ENFORCE");
  return (tableOrFn, args) => {
    const operationClass = ctx.classification ?? "readonly";
    const isWrite = operationClass !== "readonly" && operationClass !== "eventual";
    if (isWrite && runtimeMutationGate.isWritesFrozen()) {
      emitCoordinationMetric("coordination.write_blocked_freeze", {
        action: ctx.action,
        reason: runtimeMutationGate.getFreezeReason() ?? "",
      });
      if (enforce) {
        throw new ServiceError("Runtime mutation freeze — transition in progress", {
          code: "RUNTIME_MUTATION_FROZEN",
          status: 503,
        });
      }
    }
    return next(tableOrFn, args);
  };
};

/** Last guard before dispatch: reject writes if runtime epoch advanced during the call chain. */
export const coordinationEpochCommitMiddleware: PlatformRepositoryMiddleware = (ctx, next) => {
  return (tableOrFn, args) => {
    const enforce = envFlag("VITE_RUNTIME_EPOCH_ENFORCE");
    const opEpoch = ctx.runtimeEpoch ?? runtimeEpochManager.getCurrentEpoch();
    const current = runtimeEpochManager.getCurrentEpoch();
    const operationClass = ctx.classification ?? "readonly";
    const isWrite = operationClass !== "readonly" && operationClass !== "eventual";
    if (isWrite && opEpoch !== current) {
      emitCoordinationMetric("coordination.stale_epoch_rejected", {
        operationEpoch: opEpoch,
        currentEpoch: current,
        action: ctx.action,
      });
      if (enforce) {
        throw new ServiceError("Stale runtime epoch — refresh or retry", {
          code: "STALE_RUNTIME_EPOCH",
          status: 409,
        });
      }
    }
    return next(tableOrFn, args);
  };
};

export const PLATFORM_REPOSITORY_MIDDLEWARE: readonly PlatformRepositoryMiddleware[] =
  [
    traceMiddleware,
    authBoundaryMiddleware,
    capabilityEnforcementMiddleware,
    runtimePolicyMiddleware,
    mutationFreezeMiddleware,
    retryClassificationMiddleware,
    metricsMiddleware,
    invariantMiddleware,
    coordinationEpochCommitMiddleware,
  ];
