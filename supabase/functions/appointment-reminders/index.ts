import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getAllowedOriginsFromEnv } from "../_shared/cors.ts";
import { initSentry } from "../_shared/sentry.ts";
import { logError, logInfo, persistSystemLog } from "../_shared/logger.ts";
import { createRequestId } from "../_shared/request.ts";

const allowedOrigins = getAllowedOriginsFromEnv();

interface AppointmentRow {
  id: string;
  appointment_date: string;
  tenant_id: string;
  patient_id: string;
  patients:
    | { full_name: string | null; email: string | null; phone: string | null }
    | Array<{ full_name: string | null; email: string | null; phone: string | null }>
    | null;
  doctors:
    | { full_name: string | null; user_id: string | null }
    | Array<{ full_name: string | null; user_id: string | null }>
    | null;
}

type ContactPrefs = {
  email: string | null;
  phone_e164: string | null;
  whatsapp_opt_in: boolean;
};

const WINDOW_DAYS = 7;
const MAX_BATCH = 100;
const MAX_ATTEMPTS = 3;

async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string,
) {
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  return res.ok;
}

async function deliverInAppReminderNotification(
  supabase: ReturnType<typeof createClient>,
  input: {
    tenantId: string;
    appointmentId: string;
    doctorUserId: string;
    bodyText: string;
    requestId: string;
  },
) {
  const deliveryKey = `appointment-reminder:${input.tenantId}:${input.appointmentId}:${input.doctorUserId}:in_app`;
  const { error } = await supabase.rpc("command_notification_delivery", {
    p_tenant_id: input.tenantId,
    p_user_id: input.doctorUserId,
    p_title: "Upcoming Appointment Reminder",
    p_body: input.bodyText,
    p_type: "appointment_reminder",
    p_delivery_key: deliveryKey,
    p_source_event_id: null,
    p_source_outbox_id: null,
    p_read: false,
    p_idempotency_key: deliveryKey,
    p_request_hash: JSON.stringify({
      type: "appointment_reminder",
      appointment_id: input.appointmentId,
      user_id: input.doctorUserId,
      channel: "in_app",
    }),
    p_actor_user_id: input.doctorUserId,
    p_request_trace_id: input.requestId,
    p_operation_trace_id: "appointment-reminders",
    p_workflow_trace_id: "appointment-reminder-delivery",
  });

  if (error) {
    throw new Error(error.message ?? "Failed to persist appointment reminder notification evidence");
  }
}

Deno.serve(async (req) => {
  initSentry();
  const { corsHeaders, errorResponse } = enforceCors(req, {
    allowedOrigins,
    allowNoOrigin: true,
  });
  const requestId = createRequestId(req);
  const baseHeaders = { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId };

  if (errorResponse) {
    return errorResponse;
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: baseHeaders,
    });
  }

  try {
    logInfo("appointment_reminders_request", {
      request_id: requestId,
      action_type: "appointment_reminders",
      resource_type: "appointment",
    });
    const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
    const incomingSecret = req.headers.get("x-cron-secret");
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: "REMINDER_CRON_SECRET is not configured" }), {
        status: 500,
        headers: baseHeaders,
      });
    }
    if (incomingSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: baseHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const windowEnd = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const { data: upcomingAppointments, error } = await supabase
      .from("appointments")
      .select("id, appointment_date, tenant_id, patient_id, patients(full_name, email, phone), doctors(full_name, user_id)")
      .eq("status", "scheduled")
      .gte("appointment_date", now.toISOString())
      .lte("appointment_date", windowEnd.toISOString());

    if (error) {
      throw error;
    }

    const appointments = (upcomingAppointments ?? []) as AppointmentRow[];
    const preferenceCache = new Map<string, boolean>();
    const contactCache = new Map<string, ContactPrefs>();
    const configCache = new Map<string, { offsets: number[]; email_enabled: boolean; whatsapp_enabled: boolean }>();

    // Schedule reminders into the queue
    for (const appt of appointments) {
      const config = configCache.get(appt.tenant_id) ??
        (await (async () => {
          const { data } = await supabase
            .from("appointment_reminder_config")
            .select("offsets, email_enabled, whatsapp_enabled")
            .eq("tenant_id", appt.tenant_id)
            .maybeSingle();
          const normalized = {
            offsets: (data?.offsets ?? [1440, 120]) as number[],
            email_enabled: data?.email_enabled ?? true,
            whatsapp_enabled: data?.whatsapp_enabled ?? false,
          };
          configCache.set(appt.tenant_id, normalized);
          return normalized;
        })());

      const offsets = Array.isArray(config.offsets) ? config.offsets : [1440];
      const appointmentDate = new Date(appt.appointment_date);

      for (const offsetMinutes of offsets) {
        const sendAt = new Date(appointmentDate.getTime() - offsetMinutes * 60 * 1000);
        if (sendAt <= now) continue;

        const queuePayloads: Array<{ channel: string; send_at: string }> = [];
        if (config.email_enabled) queuePayloads.push({ channel: "email", send_at: sendAt.toISOString() });
        if (config.whatsapp_enabled) queuePayloads.push({ channel: "whatsapp", send_at: sendAt.toISOString() });
        queuePayloads.push({ channel: "in_app", send_at: sendAt.toISOString() });

        for (const payload of queuePayloads) {
          await supabase
            .from("reminder_queue")
            .upsert({
              tenant_id: appt.tenant_id,
              appointment_id: appt.id,
              patient_id: appt.patient_id,
              channel: payload.channel,
              send_at: payload.send_at,
            }, { onConflict: "appointment_id,channel,send_at" });
        }
      }
    }

    // Process due reminders
    const { data: dueReminders, error: dueError } = await supabase
      .from("reminder_queue")
      .select("id, tenant_id, appointment_id, patient_id, channel, send_at, attempts")
      .eq("status", "pending")
      .lte("send_at", now.toISOString())
      .or("next_attempt_at.is.null,next_attempt_at.lte." + now.toISOString())
      .limit(MAX_BATCH);

    if (dueError) {
      throw dueError;
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const whatsappToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const whatsappPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    let notificationsCreated = 0;
    let emailsSent = 0;
    let whatsappSent = 0;

    for (const reminder of dueReminders ?? []) {
      const { data: appointment } = await supabase
        .from("appointments")
        .select("id, appointment_date, tenant_id, patients(full_name, email, phone), doctors(full_name, user_id)")
        .eq("id", reminder.appointment_id)
        .maybeSingle();

      if (!appointment) {
        await supabase.from("reminder_queue").update({ status: "failed", error_message: "Appointment not found" }).eq("id", reminder.id);
        continue;
      }

      const appt = appointment as AppointmentRow;
      const patient = Array.isArray(appt.patients) ? appt.patients[0] : appt.patients;
      const doctor = Array.isArray(appt.doctors) ? appt.doctors[0] : appt.doctors;

      let prefs = contactCache.get(appt.patient_id);
      if (!prefs) {
        const { data: prefData } = await supabase
          .from("patient_contact_preferences")
          .select("email, phone_e164, whatsapp_opt_in")
          .eq("patient_id", appt.patient_id)
          .maybeSingle();
        prefs = {
          email: prefData?.email ?? patient?.email ?? null,
          phone_e164: prefData?.phone_e164 ?? null,
          whatsapp_opt_in: prefData?.whatsapp_opt_in ?? false,
        };
        contactCache.set(appt.patient_id, prefs);
      }

      const appointmentTime = new Date(appt.appointment_date).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const bodyText = `You have an appointment scheduled for ${appointmentTime}. Appointment ID: ${appt.id}`;

      try {
        if (reminder.channel === "email") {
          const normalizedEmail = prefs.email?.trim().toLowerCase() ?? null;
          if (!normalizedEmail || !resendApiKey) {
            throw new Error("Email not available or RESEND_API_KEY missing");
          }

          const { data: existingEmailLog } = await supabase
            .from("appointment_reminder_log")
            .select("id")
            .eq("appointment_id", appt.id)
            .eq("channel", "email")
            .eq("patient_email", normalizedEmail)
            .maybeSingle();

          if (!existingEmailLog) {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from: "Clinic Notifications <onboarding@resend.dev>",
                to: [normalizedEmail],
                subject: "Upcoming Appointment Reminder",
                html: `<p>${bodyText}</p>`,
              }),
            });

            if (!res.ok) {
              throw new Error(await res.text());
            }

            await supabase.from("appointment_reminder_log").insert({
              appointment_id: appt.id,
              tenant_id: appt.tenant_id,
              patient_email: normalizedEmail,
              channel: "email",
            });
            emailsSent++;
          }
        }

        if (reminder.channel === "whatsapp") {
          if (!prefs.phone_e164 || !prefs.whatsapp_opt_in || !whatsappToken || !whatsappPhoneNumberId) {
            throw new Error("WhatsApp not configured or patient not opted in");
          }

          const sent = await sendWhatsAppMessage(whatsappPhoneNumberId, whatsappToken, prefs.phone_e164, bodyText);
          if (!sent) {
            throw new Error("WhatsApp send failed");
          }

          await supabase.from("appointment_reminder_log").insert({
            appointment_id: appt.id,
            tenant_id: appt.tenant_id,
            patient_phone: prefs.phone_e164,
            channel: "whatsapp",
          });
          whatsappSent++;
        }

        if (reminder.channel === "in_app") {
          const doctorUserId = doctor?.user_id ?? null;
          if (doctorUserId) {
            let allowInApp = preferenceCache.get(doctorUserId);
            if (allowInApp === undefined) {
              const { data: prefData } = await supabase
                .from("notification_preferences")
                .select("appointment_reminders")
                .eq("user_id", doctorUserId)
                .maybeSingle();
              allowInApp = prefData?.appointment_reminders ?? true;
              preferenceCache.set(doctorUserId, allowInApp);
            }

            if (allowInApp) {
              const { data: existingInAppLog } = await supabase
                .from("appointment_reminder_log")
                .select("id")
                .eq("appointment_id", appt.id)
                .eq("channel", "in_app")
                .eq("notified_user_id", doctorUserId)
                .maybeSingle();

              if (!existingInAppLog) {
                await deliverInAppReminderNotification(supabase, {
                  tenantId: appt.tenant_id,
                  appointmentId: appt.id,
                  doctorUserId,
                  bodyText,
                  requestId,
                });

                await supabase.from("appointment_reminder_log").insert({
                  appointment_id: appt.id,
                  tenant_id: appt.tenant_id,
                  notified_user_id: doctorUserId,
                  channel: "in_app",
                });
                notificationsCreated++;
              }
            }
          }
        }

        await supabase
          .from("reminder_queue")
          .update({ status: "sent", error_message: null, next_attempt_at: null })
          .eq("id", reminder.id);
      } catch (err) {
        const attempts = (reminder.attempts ?? 0) + 1;
        const nextAttemptAt = new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString();
        const isDead = attempts >= MAX_ATTEMPTS;
        await supabase
          .from("reminder_queue")
          .update({
            attempts,
            status: isDead ? "failed" : "pending",
            error_message: err instanceof Error ? err.message : String(err),
            next_attempt_at: isDead ? null : nextAttemptAt,
          })
          .eq("id", reminder.id);

        if (isDead) {
          await persistSystemLog(supabase, "appointment-reminders", "error", "appointment_reminder_dead_letter", {
            request_id: requestId,
            tenant_id: reminder.tenant_id,
            action_type: "appointment_reminders",
            resource_type: "appointment",
            metadata: {
              appointment_id: reminder.appointment_id,
              channel: reminder.channel,
              attempts,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: appointments.length,
        notificationsCreated,
        emailsSent,
        whatsappSent,
      }),
      {
        status: 200,
        headers: baseHeaders,
      },
    );
  } catch (err) {
    logError("appointment_reminders_failed", {
      request_id: requestId,
      action_type: "appointment_reminders",
      resource_type: "appointment",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      await persistSystemLog(supabase, "appointment-reminders", "error", "appointment_reminders_failed", {
        request_id: requestId,
        action_type: "appointment_reminders",
        resource_type: "appointment",
        metadata: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: baseHeaders,
      },
    );
  }
});
