import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface AppointmentRow {
  id: string;
  appointment_date: string;
  tenant_id: string;
  patients:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null;
  doctors:
    | { full_name: string | null; user_id: string | null }
    | Array<{ full_name: string | null; user_id: string | null }>
    | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
    const incomingSecret = req.headers.get("x-cron-secret");
    if (!cronSecret || incomingSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: upcomingAppointments, error } = await supabase
      .from("appointments")
      .select("id, appointment_date, tenant_id, patients(full_name, email), doctors(full_name, user_id)")
      .eq("status", "scheduled")
      .gte("appointment_date", now.toISOString())
      .lte("appointment_date", tomorrow.toISOString());

    if (error) {
      throw error;
    }

    const preferenceCache = new Map<string, boolean>();
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    let notificationsCreated = 0;
    let emailsSent = 0;

    const appointments = (upcomingAppointments ?? []) as AppointmentRow[];

    for (const appt of appointments) {
      const patient = Array.isArray(appt.patients) ? appt.patients[0] : appt.patients;
      const doctor = Array.isArray(appt.doctors) ? appt.doctors[0] : appt.doctors;

      const appointmentTime = new Date(appt.appointment_date).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const bodyText = `You have an appointment with ${doctor?.full_name ?? "your patient"} scheduled for ${appointmentTime}. Appointment ID: ${appt.id}`;

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
            const { error: notifError } = await supabase.from("notifications").insert({
              tenant_id: appt.tenant_id,
              user_id: doctorUserId,
              title: "Upcoming Appointment Reminder",
              body: bodyText,
              type: "appointment_reminder",
              read: false,
            });

            if (!notifError) {
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

      const normalizedEmail = patient?.email?.trim().toLowerCase() ?? null;
      if (!normalizedEmail || !resendApiKey) {
        continue;
      }

      const { data: existingEmailLog } = await supabase
        .from("appointment_reminder_log")
        .select("id")
        .eq("appointment_id", appt.id)
        .eq("channel", "email")
        .eq("patient_email", normalizedEmail)
        .maybeSingle();

      if (existingEmailLog) {
        continue;
      }

      try {
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
          console.error("Resend API error:", await res.text());
          continue;
        }

        await supabase.from("appointment_reminder_log").insert({
          appointment_id: appt.id,
          tenant_id: appt.tenant_id,
          patient_email: normalizedEmail,
          channel: "email",
        });
        emailsSent++;
      } catch (err) {
        console.error("Failed to send email via Resend:", err);
      }
    }

    return new Response(
        JSON.stringify({
          success: true,
          checked: appointments.length,
          notificationsCreated,
          emailsSent,
        }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
