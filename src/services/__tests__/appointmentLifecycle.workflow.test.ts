import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentLifecycleWorkflow } from "@/services/appointments/appointmentLifecycle.workflow";
import { appointmentQueueRepository } from "@/services/appointments/appointmentQueue.repository";

vi.mock("@/services/appointments/appointmentQueue.repository", () => ({
  appointmentQueueRepository: {
    commandLifecycle: vi.fn(),
  },
}));

const queueRepo = vi.mocked(appointmentQueueRepository, true);

const queueEntry = {
  id: "00000000-0000-0000-0000-000000000444",
  appointment_id: "00000000-0000-0000-0000-000000000333",
  tenant_id: "00000000-0000-0000-0000-000000000111",
  check_in_at: "2026-03-14T09:55:00Z",
  position: null,
  status: "waiting",
  called_at: null,
  completed_at: null,
  created_at: "2026-03-14T09:55:00Z",
  updated_at: "2026-03-14T09:55:00Z",
};

describe("appointmentLifecycleWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueRepo.commandLifecycle.mockResolvedValue({
      result_code: "OK",
      retryable: false,
      idempotency_replay: false,
      message: null,
      appointment: { id: queueEntry.appointment_id, status: "scheduled" },
      queue_entry: queueEntry as any,
    });
  });

  it("checks in through the DB lifecycle command with trace ids", async () => {
    const result = await appointmentLifecycleWorkflow.checkIn(
      queueEntry.appointment_id,
      queueEntry.tenant_id,
      "00000000-0000-0000-0000-000000000222",
    );

    expect(result.status).toBe("waiting");
    expect(queueRepo.commandLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      operation: "check_in",
      appointmentId: queueEntry.appointment_id,
      tenantId: queueEntry.tenant_id,
      userId: "00000000-0000-0000-0000-000000000222",
      requestHash: expect.stringContaining("check_in"),
      trace: expect.objectContaining({
        tenantId: queueEntry.tenant_id,
        actorId: "00000000-0000-0000-0000-000000000222",
      }),
    }));
  });

  it("maps queue statuses to lifecycle operations", async () => {
    await appointmentLifecycleWorkflow.updateQueueStatus(queueEntry.id, "called", queueEntry.tenant_id);
    await appointmentLifecycleWorkflow.updateQueueStatus(queueEntry.id, "waiting", queueEntry.tenant_id);
    await appointmentLifecycleWorkflow.updateQueueStatus(queueEntry.id, "in_service", queueEntry.tenant_id);
    await appointmentLifecycleWorkflow.updateQueueStatus(queueEntry.id, "done", queueEntry.tenant_id);
    await appointmentLifecycleWorkflow.updateQueueStatus(queueEntry.id, "no_show", queueEntry.tenant_id);

    expect(queueRepo.commandLifecycle).toHaveBeenNthCalledWith(1, expect.objectContaining({ operation: "call" }));
    expect(queueRepo.commandLifecycle).toHaveBeenNthCalledWith(2, expect.objectContaining({ operation: "wait" }));
    expect(queueRepo.commandLifecycle).toHaveBeenNthCalledWith(3, expect.objectContaining({ operation: "start" }));
    expect(queueRepo.commandLifecycle).toHaveBeenNthCalledWith(4, expect.objectContaining({ operation: "complete" }));
    expect(queueRepo.commandLifecycle).toHaveBeenNthCalledWith(5, expect.objectContaining({ operation: "no_show" }));
  });

  it("passes stale expected timestamps to queue commands", async () => {
    await appointmentLifecycleWorkflow.updateQueueStatus(
      queueEntry.id,
      "in_service",
      queueEntry.tenant_id,
      "00000000-0000-0000-0000-000000000222",
      queueEntry.updated_at,
    );

    expect(queueRepo.commandLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      operation: "start",
      expectedUpdatedAt: queueEntry.updated_at,
    }));
  });

  it("surfaces command conflicts as workflow conflicts", async () => {
    queueRepo.commandLifecycle.mockResolvedValueOnce({
      result_code: "CONFLICT",
      retryable: true,
      idempotency_replay: false,
      message: "Appointment lifecycle state changed",
      appointment: null,
      queue_entry: null,
    });

    await expect(
      appointmentLifecycleWorkflow.updateQueueStatus(queueEntry.id, "done", queueEntry.tenant_id),
    ).rejects.toThrow("Appointment lifecycle state changed");
  });
});
