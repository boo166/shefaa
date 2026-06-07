import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentQueueService } from "@/services/appointments/appointmentQueue.service";
import { appointmentLifecycleWorkflow } from "@/services/appointments/appointmentLifecycle.workflow";

vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({ tenantId: "00000000-0000-0000-0000-000000000111", userId: "00000000-0000-0000-0000-000000000222" }),
}));

vi.mock("@/core/auth/authStore", () => ({
  useAuth: {
    getState: () => ({
      hasPermission: () => true,
    }),
  },
}));

vi.mock("@/services/appointments/appointmentLifecycle.workflow", () => ({
  appointmentLifecycleWorkflow: {
    checkIn: vi.fn(),
    updateQueueStatus: vi.fn(),
  },
}));

const workflow = vi.mocked(appointmentLifecycleWorkflow, true);

describe("appointmentQueueService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks in a scheduled appointment", async () => {
    workflow.checkIn.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000444",
      appointment_id: "00000000-0000-0000-0000-000000000333",
      tenant_id: "00000000-0000-0000-0000-000000000111",
      check_in_at: "2026-03-14T09:55:00Z",
      position: null,
      status: "waiting",
      called_at: null,
      completed_at: null,
      created_at: "2026-03-14T09:55:00Z",
    } as any);

    const result = await appointmentQueueService.checkIn("00000000-0000-0000-0000-000000000333");

    expect(result.status).toBe("waiting");
    expect(workflow.checkIn).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000333",
      "00000000-0000-0000-0000-000000000111",
      "00000000-0000-0000-0000-000000000222",
    );
  });

  it("rejects duplicate active check-ins", async () => {
    workflow.checkIn.mockRejectedValue(new Error("Appointment is already checked in"));

    await expect(
      appointmentQueueService.checkIn("00000000-0000-0000-0000-000000000333"),
    ).rejects.toThrow("Appointment is already checked in");
  });

  it("marks the appointment no-show when the queue is closed as no-show", async () => {
    workflow.updateQueueStatus.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000444",
      appointment_id: "00000000-0000-0000-0000-000000000333",
      tenant_id: "00000000-0000-0000-0000-000000000111",
      check_in_at: "2026-03-14T09:55:00Z",
      position: null,
      status: "no_show",
      called_at: null,
      completed_at: "2026-03-14T10:20:00Z",
      created_at: "2026-03-14T09:55:00Z",
    } as any);

    await appointmentQueueService.updateStatus("00000000-0000-0000-0000-000000000444", "no_show");

    expect(workflow.updateQueueStatus).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000444",
      "no_show",
      "00000000-0000-0000-0000-000000000111",
      "00000000-0000-0000-0000-000000000222",
    );
  });

  it("keeps the back-to-waiting action on the lifecycle path", async () => {
    workflow.updateQueueStatus.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000444",
      appointment_id: "00000000-0000-0000-0000-000000000333",
      tenant_id: "00000000-0000-0000-0000-000000000111",
      check_in_at: "2026-03-14T09:55:00Z",
      position: null,
      status: "waiting",
      called_at: null,
      completed_at: null,
      created_at: "2026-03-14T09:55:00Z",
      updated_at: "2026-03-14T10:05:00Z",
    } as any);

    await appointmentQueueService.updateStatus("00000000-0000-0000-0000-000000000444", "waiting");

    expect(workflow.updateQueueStatus).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000444",
      "waiting",
      "00000000-0000-0000-0000-000000000111",
      "00000000-0000-0000-0000-000000000222",
    );
  });
});
