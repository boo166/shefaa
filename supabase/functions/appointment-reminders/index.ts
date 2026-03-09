import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get appointments happening in the next 24 hours that are scheduled
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: upcomingAppointments, error } = await supabase
      .from("appointments")
      .select("id, appointment_date, tenant_id, patient_id, patients(full_name, user_id), doctors(full_name)")
      .eq("status", "scheduled")
      .gte("appointment_date", now.toISOString())
      .lte("appointment_date", tomorrow.toISOString());

    if (error) {
      throw error;
    }

    let notificationsCreated = 0;

    for (const appt of upcomingAppointments ?? []) {
      const patient = appt.patients as any;
      const doctor = appt.doctors as any;

      if (!patient?.user_id) continue;

      // Check if notification already exists for this appointment
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", patient.user_id)
        .eq("type", "appointment_reminder")
        .like("body", `%${appt.id}%`)
        .maybeSingle();

      if (existing) continue;

      // Create notification
      const appointmentTime = new Date(appt.appointment_date).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      const { error: notifError } = await supabase.from("notifications").insert({
        tenant_id: appt.tenant_id,
        user_id: patient.user_id,
        title: "Upcoming Appointment Reminder",
        body: `You have an appointment with ${doctor?.full_name ?? "your doctor"} scheduled for ${appointmentTime}. Appointment ID: ${appt.id}`,
        type: "appointment_reminder",
        read: false,
      });

      if (!notifError) {
        notificationsCreated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: upcomingAppointments?.length ?? 0,
        notificationsCreated,
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
