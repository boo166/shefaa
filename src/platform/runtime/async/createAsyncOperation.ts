import { newOperationTraceId, type PlatformTraceIds } from "@/platform/observability/traceContext";
import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import {
  ASYNC_POLICY_PROFILES,
  type AsyncPolicyProfile,
} from "@/platform/runtime/policy";
import { runtimeMutationGate } from "@/platform/runtime/coordination/runtimeMutationGate";
import { ServiceError } from "@/services/supabase/errors";

export type AsyncOperationContext = {
  operationTraceId: string;
  signal: AbortSignal;
  attempt: number;
};

export type CreateAsyncOperationOptions = {
  profile?: AsyncPolicyProfile;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  /** When false, no retry. Default: transient/network-ish errors. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRollback?: () => Promise<void>;
  /** Correlate async retries with an upstream request / workflow trace (metrics only). */
  parentTrace?: Partial<PlatformTraceIds>;
};

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ServiceError("Operation aborted", { code: "ABORTED", status: 499 }));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new ServiceError("Operation aborted", { code: "ABORTED", status: 499 }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function defaultShouldRetry(err: unknown): boolean {
  if (!(err instanceof ServiceError)) return false;
  const code = err.code ?? "";
  const msg = err.message.toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("timeout") ||
    code === "PGRST301" ||
    code === "" && msg.includes("failed")
  );
}

function mergeSignal(user?: AbortSignal, timeoutMs?: number): { signal: AbortSignal; cleanup: () => void } {
  const ctrl = new AbortController();
  const onUserAbort = () => ctrl.abort();
  user?.addEventListener("abort", onUserAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs != null && timeoutMs > 0) {
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
  }
  return {
    signal: ctrl.signal,
    cleanup: () => {
      user?.removeEventListener("abort", onUserAbort);
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * Standardized async execution: trace id, cancellation, bounded retries, optional rollback on failure after partial work.
 */
export async function createAsyncOperation<T>(
  operationId: string,
  run: (ctx: AsyncOperationContext) => Promise<T>,
  options: CreateAsyncOperationOptions = {},
): Promise<T> {
  const operationTraceId = newOperationTraceId();
  const profile = options.profile
    ? ASYNC_POLICY_PROFILES[options.profile]
    : undefined;
  const maxRetries = options.maxRetries ?? profile?.maxRetries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? profile?.retryDelayMs ?? 400;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
  const { signal, cleanup } = mergeSignal(
    options.signal,
    options.timeoutMs ?? profile?.timeoutMs,
  );

  const traceFields = options.parentTrace ?? {};
  emitPlatformMetric("async_operation_start", { operationId, operationTraceId, ...traceFields });

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) {
      cleanup();
      emitPlatformMetric("async_operation_aborted", { operationId, operationTraceId, attempt, ...traceFields });
      throw new ServiceError("Operation aborted", { code: "ABORTED", status: 499 });
    }
    if (runtimeMutationGate.isWritesFrozen()) {
      cleanup();
      throw new ServiceError("Runtime mutation freeze active", {
        code: "RUNTIME_MUTATION_FROZEN",
        status: 503,
      });
    }
    try {
      const result = await run({ operationTraceId, signal, attempt });
      cleanup();
      emitPlatformMetric("async_operation_success", { operationId, operationTraceId, attempt, ...traceFields });
      return result;
    } catch (err) {
      lastError = err;
      const retry = attempt < maxRetries && shouldRetry(err, attempt);
      emitPlatformMetric("async_operation_failure", {
        operationId,
        operationTraceId,
        attempt,
        retry,
        code: err instanceof ServiceError ? err.code ?? "" : "unknown",
        ...traceFields,
      });
      if (!retry) {
        if (options.onRollback) {
          try {
            await options.onRollback();
          } catch {
            /* rollback best-effort */
          }
        }
        cleanup();
        throw err;
      }
      await sleep(retryDelayMs * (attempt + 1), signal);
    }
  }

  cleanup();
  throw lastError instanceof Error ? lastError : new ServiceError("Async operation failed");
}
