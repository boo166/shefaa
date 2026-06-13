import { assertSlo, createLoadCertClient, resolveActorUserId, resolveTenantId } from "./shared.mjs";

const DEDUCTIONS = Number.parseInt(process.env.DEDUCTION_COUNT ?? "200", 10);

async function main() {
  const client = createLoadCertClient();
  const tenantId = await resolveTenantId(client);
  const actorUserId = await resolveActorUserId(client, tenantId);

  const { data: medication } = await client.from("medications").select("id, stock").eq("tenant_id", tenantId).limit(1).maybeSingle();
  const { data: batch } = await client.from("medication_batches").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle();
  const { data: patient } = await client.from("patients").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle();
  if (!medication?.id || !batch?.id || !patient?.id) throw new Error("Missing inventory fixtures for load cert.");

  if ((medication.stock ?? 0) < DEDUCTIONS) {
    await client.from("medications").update({ stock: DEDUCTIONS + 50 }).eq("id", medication.id);
  }

  for (let i = 1; i <= DEDUCTIONS; i += 1) {
    const { data: reserveData, error: reserveError } = await client.rpc("command_medication_reserve", {
      p_medication_id: medication.id,
      p_tenant_id: tenantId,
      p_quantity: 1,
      p_patient_id: patient.id,
      p_idempotency_key: `load-ded-res-${i}`,
      p_request_hash: `hash-res-${i}`,
      p_user_id: actorUserId,
    });
    if (reserveError || reserveData?.[0]?.result_code !== "OK") throw reserveError ?? new Error(`Reserve ${i} failed`);

    const reservationId = reserveData[0].reservation?.id ?? reserveData[0].reservation_id;
    const { data: dispenseData, error: dispenseError } = await client.rpc("command_medication_dispense", {
      p_medication_id: medication.id,
      p_batch_id: batch.id,
      p_tenant_id: tenantId,
      p_reservation_id: reservationId,
      p_quantity: 1,
      p_idempotency_key: `load-ded-disp-${i}`,
      p_request_hash: `hash-disp-${i}`,
      p_user_id: actorUserId,
    });
    if (dispenseError || dispenseData?.[0]?.result_code !== "OK") throw dispenseError ?? new Error(`Dispense ${i} failed`);
  }

  const { data: medAfter } = await client.from("medications").select("stock").eq("id", medication.id).single();
  assertSlo("non_negative_stock", (medAfter?.stock ?? -1) >= 0, `stock=${medAfter?.stock}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
