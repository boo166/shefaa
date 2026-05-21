import { supabase } from "@/services/supabase/client";
import {
  PLATFORM_REPOSITORY_MIDDLEWARE,
  type PlatformRepositoryDispatch,
} from "./platformRepository.middleware";
import type { PlatformRepositoryContext } from "./platformRepository.context";
import { buildRpcPolicyContext } from "@/platform/runtime/policy/policyContext";

export type { PlatformRepositoryContext } from "./platformRepository.context";

function composeDispatch(
  ctx: PlatformRepositoryContext,
  dispatch: PlatformRepositoryDispatch,
): PlatformRepositoryDispatch {
  return PLATFORM_REPOSITORY_MIDDLEWARE.reduceRight(
    (next, middleware) => middleware(ctx, next),
    dispatch,
  );
}

export function from(table: string, ctx: PlatformRepositoryContext) {
  const dispatch = composeDispatch(ctx, (tableName) => supabase.from(tableName as never));
  return dispatch(table) as ReturnType<typeof supabase.from>;
}

export async function rpc(
  fn: string,
  args: Record<string, unknown>,
  ctx: PlatformRepositoryContext,
) {
  const dispatch = composeDispatch(ctx, (fnName, fnArgs) =>
    (supabase.rpc as any)(fnName, withTraceArgs(fnArgs ?? {}, ctx)),
  );
  return dispatch(fn, args) as ReturnType<typeof supabase.rpc>;
}

function withTraceArgs(
  args: Record<string, unknown>,
  ctx: PlatformRepositoryContext,
): Record<string, unknown> {
  const trace = ctx.trace;
  if (!trace) return args;
  const next = { ...args };
  if ("p_request_trace_id" in next) {
    next.p_request_trace_id = next.p_request_trace_id ?? trace.requestTraceId ?? null;
  }
  if ("p_operation_trace_id" in next) {
    next.p_operation_trace_id = next.p_operation_trace_id ?? trace.operationTraceId ?? null;
  }
  if ("p_workflow_trace_id" in next) {
    next.p_workflow_trace_id = next.p_workflow_trace_id ?? trace.workflowTraceId ?? null;
  }
  return next;
}

/**
 * RPC call with explicit policy context envelope.
 * Use only for RPCs that accept an optional `_policy_context` argument.
 */
export async function rpcWithPolicy(
  fn: string,
  args: Record<string, unknown>,
  ctx: PlatformRepositoryContext,
) {
  const envelope = buildRpcPolicyContext(ctx);
  return rpc(fn, { ...args, _policy_context: envelope }, ctx);
}

export const platformRepository = {
  from,
  rpc,
  rpcWithPolicy,
};
