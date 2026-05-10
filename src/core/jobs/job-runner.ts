import { logInfo, logWarn, reportError } from "@/core/observability/logger";
import type { JobDefinition, JobName } from "./job-types";
import { jobService } from "@/services/jobs/job.service";

const JOB_FUNCTIONS: Record<JobName, string> = {
  SendAppointmentNotifications: "send-appointment-notifications",
  GenerateMonthlyReports: "generate-monthly-reports",
  RefreshMaterializedViews: "refresh-materialized-views",
  ProcessInsuranceClaims: "process-insurance-claims",
  SendInvoiceEmails: "send-invoice-emails",
};

export async function runJob(def: JobDefinition) {
  try {
    logInfo("Enqueueing job", { action: def.name });
    await jobService.invoke(JOB_FUNCTIONS[def.name], def.payload ?? {});
    logInfo("Job queued", { action: def.name });
  } catch (err) {
    logWarn("Job enqueue failed", { action: def.name, metadata: { error: String(err) } });
    await reportError(err, { action: "job_enqueue_failed", resourceType: def.name });
    throw err;
  }
}

export function enqueueJob(def: JobDefinition) {
  void runJob(def).catch(() => undefined);
}
