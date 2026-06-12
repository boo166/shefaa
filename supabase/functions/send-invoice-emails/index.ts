import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getAllowedOriginsFromEnv } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { initSentry } from "../_shared/sentry.ts";
import { logError, logInfo, persistSystemLog } from "../_shared/logger.ts";
import { createRequestId } from "../_shared/request.ts";

const allowedOrigins = getAllowedOriginsFromEnv();
const MAX_BATCH = 25;
const ELIGIBLE_STATUSES = ["pending", "overdue", "partially_paid"];

type InvoiceRow = {
  id: string;
  tenant_id: string;
  patient_id: string;
  invoice_code: string;
  service: string;
  amount: number;
  balance_due: number;
  due_date: string | null;
  status: string;
  invoice_date: string;
  patients:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null;
};

type DeliveryLogStatus = "pending" | "sent" | "failed" | "skipped";

function normalizeRecipientEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function buildInvoiceEmailHtml(invoice: InvoiceRow, tenantName: string, patientName: string) {
  const dueLine = invoice.due_date
    ? `<p><strong>Due date:</strong> ${new Date(invoice.due_date).toLocaleDateString("en-US")}</p>`
    : "";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">Invoice from ${tenantName}</h2>
      <p>Dear ${patientName},</p>
      <p>Your invoice <strong>${invoice.invoice_code}</strong> is currently <strong>${invoice.status.replace("_", " ")}</strong>.</p>
      <p><strong>Service:</strong> ${invoice.service}</p>
      <p><strong>Outstanding balance:</strong> ${formatCurrency(Number(invoice.balance_due ?? invoice.amount ?? 0))}</p>
      ${dueLine}
      <p>Please contact the clinic billing desk if you have already settled this balance or need an updated statement.</p>
    </div>
  `;
}

async function upsertDeliveryLog(
  serviceClient: ReturnType<typeof createClient>,
  payload: {
    tenant_id: string;
    invoice_id: string;
    patient_id: string;
    recipient_email: string;
    status: DeliveryLogStatus;
    attempts: number;
    requested_by_user_id: string;
    provider?: string | null;
    provider_message_id?: string | null;
    last_attempt_at?: string | null;
    sent_at?: string | null;
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await serviceClient.from("invoice_email_delivery_log").upsert({
    tenant_id: payload.tenant_id,
    invoice_id: payload.invoice_id,
    patient_id: payload.patient_id,
    recipient_email: payload.recipient_email,
    status: payload.status,
    attempts: payload.attempts,
    provider: payload.provider ?? null,
    provider_message_id: payload.provider_message_id ?? null,
    requested_by_user_id: payload.requested_by_user_id,
    last_attempt_at: payload.last_attempt_at ?? null,
    sent_at: payload.sent_at ?? null,
    error_message: payload.error_message ?? null,
    metadata: payload.metadata ?? {},
  }, {
    onConflict: "invoice_id,recipient_email",
  });

  if (error) {
    throw error;
  }
}

async function deliverJobNotification(
  adminClient: ReturnType<typeof createClient>,
  input: {
    tenantId: string;
    userId: string;
    title: string;
    body: string;
    requestId: string;
    sent: number;
    failed: number;
    skipped: number;
  },
) {
  const deliveryKey = `billing-email-job:${input.tenantId}:${input.requestId}:${input.userId}`;
  const { error } = await adminClient.rpc("command_notification_delivery", {
    p_tenant_id: input.tenantId,
    p_user_id: input.userId,
    p_title: input.title,
    p_body: input.body,
    p_type: "billing_email_job",
    p_delivery_key: deliveryKey,
    p_source_event_id: null,
    p_source_outbox_id: null,
    p_read: false,
    p_idempotency_key: deliveryKey,
    p_request_hash: JSON.stringify({
      type: "billing_email_job",
      sent: input.sent,
      failed: input.failed,
      skipped: input.skipped,
    }),
    p_actor_user_id: input.userId,
    p_request_trace_id: input.requestId,
    p_operation_trace_id: "send-invoice-emails",
    p_workflow_trace_id: "billing-email-delivery",
  });

  if (error) {
    throw new Error(error.message ?? "Failed to persist invoice email notification evidence");
  }
}

Deno.serve(async (req) => {
  initSentry();
  const { corsHeaders, errorResponse } = enforceCors(req, { allowedOrigins });
  const requestId = createRequestId(req);
  const baseHeaders = { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId };
  if (errorResponse) return errorResponse;

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: baseHeaders,
    });
  }

  const auth = await requireAdmin(req);
  if ("error" in auth) {
    return new Response(auth.error.body, {
      status: auth.error.status,
      headers: baseHeaders,
    });
  }

  const { adminClient, tenantId, userId } = auth;
  logInfo("send_invoice_emails_request", {
    request_id: requestId,
    tenant_id: tenantId,
    user_id: userId,
    action_type: "send_invoice_emails",
    resource_type: "job",
  });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("INVOICE_EMAIL_FROM") ?? "Clinic Billing <onboarding@resend.dev>";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Invoice email delivery is not configured" }), {
      status: 500,
      headers: baseHeaders,
    });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const invoiceIds = Array.isArray(body?.invoice_ids)
      ? body.invoice_ids.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    let query = serviceClient
      .from("invoices")
      .select("id, tenant_id, patient_id, invoice_code, service, amount, balance_due, due_date, status, invoice_date, patients(full_name, email)")
      .eq("tenant_id", tenantId)
      .in("status", ELIGIBLE_STATUSES)
      .order("invoice_date", { ascending: false })
      .limit(MAX_BATCH);

    if (invoiceIds.length > 0) {
      query = query.in("id", invoiceIds);
    }

    const [{ data: invoices, error: invoiceError }, { data: tenant }] = await Promise.all([
      query,
      serviceClient
        .from("tenants")
        .select("name")
        .eq("id", tenantId)
        .maybeSingle(),
    ]);

    if (invoiceError) {
      throw invoiceError;
    }

    const tenantName = tenant?.name ?? "Your clinic";

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of (invoices ?? []) as InvoiceRow[]) {
      const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;
      const recipientEmail = normalizeRecipientEmail(patient?.email);
      const existingLog = recipientEmail
        ? await serviceClient
          .from("invoice_email_delivery_log")
          .select("attempts, status")
          .eq("invoice_id", row.id)
          .eq("recipient_email", recipientEmail)
          .maybeSingle()
        : { data: null, error: null };

      if (existingLog.error) {
        throw existingLog.error;
      }

      const attempts = Number(existingLog.data?.attempts ?? 0) + 1;
      const lastAttemptAt = new Date().toISOString();

      if (!recipientEmail) {
        skipped += 1;
        await upsertDeliveryLog(serviceClient, {
          tenant_id: row.tenant_id,
          invoice_id: row.id,
          patient_id: row.patient_id,
          recipient_email: `missing-email:${row.patient_id}`,
          status: "skipped",
          attempts,
          requested_by_user_id: userId,
          last_attempt_at: lastAttemptAt,
          error_message: "Patient email not available",
          metadata: {
            invoice_code: row.invoice_code,
            status: row.status,
            reason: "patient_email_missing",
          },
        });
        continue;
      }

      if (existingLog.data?.status === "sent") {
        skipped += 1;
        continue;
      }

      if (!resendApiKey) {
        failed += 1;
        await upsertDeliveryLog(serviceClient, {
          tenant_id: row.tenant_id,
          invoice_id: row.id,
          patient_id: row.patient_id,
          recipient_email: recipientEmail,
          status: "failed",
          attempts,
          requested_by_user_id: userId,
          provider: "resend",
          last_attempt_at: lastAttemptAt,
          error_message: "RESEND_API_KEY missing",
          metadata: {
            invoice_code: row.invoice_code,
            status: row.status,
            reason: "resend_not_configured",
          },
        });
        continue;
      }

      try {
        const patientName = patient?.full_name?.trim() || "Patient";
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [recipientEmail],
            subject: `Invoice ${row.invoice_code} from ${tenantName}`,
            html: buildInvoiceEmailHtml(row, tenantName, patientName),
          }),
        });

        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(responseBody?.message ?? "Invoice email provider request failed");
        }

        sent += 1;
        await upsertDeliveryLog(serviceClient, {
          tenant_id: row.tenant_id,
          invoice_id: row.id,
          patient_id: row.patient_id,
          recipient_email: recipientEmail,
          status: "sent",
          attempts,
          requested_by_user_id: userId,
          provider: "resend",
          provider_message_id: responseBody?.id ?? null,
          last_attempt_at: lastAttemptAt,
          sent_at: lastAttemptAt,
          error_message: null,
          metadata: {
            invoice_code: row.invoice_code,
            service: row.service,
            invoice_status: row.status,
            balance_due: row.balance_due,
          },
        });
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        await upsertDeliveryLog(serviceClient, {
          tenant_id: row.tenant_id,
          invoice_id: row.id,
          patient_id: row.patient_id,
          recipient_email: recipientEmail,
          status: "failed",
          attempts,
          requested_by_user_id: userId,
          provider: "resend",
          last_attempt_at: lastAttemptAt,
          error_message: message,
          metadata: {
            invoice_code: row.invoice_code,
            status: row.status,
          },
        });
      }
    }

    await deliverJobNotification(adminClient, {
      tenantId,
      userId,
      title: "Invoice email delivery completed",
      body: `Sent ${sent}, failed ${failed}, skipped ${skipped}.`,
      requestId,
      sent,
      failed,
      skipped,
    });

    await adminClient.rpc("log_audit_event", {
      _tenant_id: tenantId,
      _user_id: userId,
      _action: "job_send_invoice_emails",
      _entity_type: "job",
      _entity_id: null,
      _details: {
        status: failed > 0 ? "partial_success" : "success",
        sent,
        failed,
        skipped,
        requested_invoice_count: invoiceIds.length || null,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      sent,
      failed,
      skipped,
      total: sent + failed + skipped,
    }), {
      status: 200,
      headers: baseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send invoice emails";
    logError("send_invoice_emails_failed", {
      request_id: requestId,
      tenant_id: tenantId,
      user_id: userId,
      action_type: "send_invoice_emails",
      resource_type: "job",
      metadata: { error: message },
    });
    await persistSystemLog(adminClient, "send-invoice-emails", "error", "send_invoice_emails_failed", {
      request_id: requestId,
      tenant_id: tenantId,
      user_id: userId,
      action_type: "send_invoice_emails",
      resource_type: "job",
      metadata: { error: message },
    });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: baseHeaders,
    });
  }
});
