import { useAuth } from "@/core/auth/authStore";
import { platformRepository } from "@/platform/data/platformRepository";
import { buildTracePayload } from "@/platform/observability/traceContext";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";

export interface JobRepository {
  enqueue(functionName: string, payload: Record<string, unknown>): Promise<void>;
  invoke(functionName: string, payload: Record<string, unknown>): Promise<void>;
}

async function enqueueJob(functionName: string, payload: Record<string, unknown>) {
  const { tenantId, userId } = getTenantContext();
  const { user, sessionVersion } = useAuth.getState();
  const resolvedTenantId =
    (payload as { tenant_id?: string; tenantId?: string })?.tenant_id ??
    (payload as { tenantId?: string })?.tenantId ??
    tenantId;
  const initiatedAs = user?.globalRoles?.includes("super_admin") ? "super_admin" : "tenant_user";

  const trace = buildTracePayload({
    tenantId: resolvedTenantId,
    actorId: userId,
    sessionVersion,
  });
  const payloadWithTrace = {
    ...payload,
    _platform_trace: trace,
  };

  const { data, error } = await platformRepository
    .from("jobs", {
      action: `jobs.enqueue.${functionName}`,
      tenantScoped: true,
      tenantId: resolvedTenantId,
      trace: buildTracePayload({
        tenantId: resolvedTenantId,
        actorId: userId,
        sessionVersion,
      }),
    })
    .insert({
      tenant_id: resolvedTenantId,
      type: functionName,
      payload: payloadWithTrace,
      initiated_by: userId,
      initiated_as: initiatedAs,
    })
    .select("id")
    .single();

  if (error) {
    throw new ServiceError(error.message ?? "Failed to enqueue job", { code: error.code, details: error });
  }

  if (data?.id) {
    const { error: invokeError } = await supabase.functions.invoke("job-worker", {
      body: { job_id: data.id },
    });
    if (invokeError) {
      // Keep the job in the queue; worker can pick it up later.
      throw new ServiceError(invokeError.message ?? "Failed to trigger job worker", {
        code: invokeError.code,
        details: invokeError,
      });
    }
  }
}

export const jobRepository: JobRepository = {
  enqueue: enqueueJob,
  invoke: enqueueJob,
};
