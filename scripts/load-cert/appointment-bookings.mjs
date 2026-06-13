import { assertSlo, createLoadCertClient, resolveTenantId } from "./shared.mjs";

const ATTEMPTS = Number.parseInt(process.env.BOOKING_ATTEMPTS ?? "500", 10);

async function main() {
  const client = createLoadCertClient();
  const tenantId = await resolveTenantId(client);

  const [{ data: patient }, { data: doctor }] = await Promise.all([
    client.from("patients").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle(),
    client.from("doctors").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle(),
  ]);
  if (!patient?.id || !doctor?.id) throw new Error("Missing patient or doctor for booking load cert.");

  const slot = new Date(Date.now() + 7 * 86_400_000);
  slot.setMinutes(0, 0, 0);
  const slotEnd = new Date(slot.getTime() + 30 * 60_000);

  let winners = 0;
  let conflicts = 0;

  for (let i = 0; i < ATTEMPTS; i += 1) {
    const { error } = await client.from("appointments").insert({
      tenant_id: tenantId,
      patient_id: patient.id,
      doctor_id: doctor.id,
      appointment_date: slot.toISOString(),
      appointment_range: `[${slot.toISOString()},${slotEnd.toISOString()}]`,
      status: "scheduled",
      type: "checkup",
    });
    if (error?.code === "23P01") conflicts += 1;
    else if (error) throw error;
    else winners += 1;
  }

  assertSlo("single_booking_winner", winners === 1, `winners=${winners}`);
  assertSlo("expected_conflicts", conflicts === ATTEMPTS - 1, `conflicts=${conflicts}/${ATTEMPTS - 1}`);
  assertSlo("zero_overlap_violations", winners + conflicts === ATTEMPTS, `attempts=${ATTEMPTS}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
