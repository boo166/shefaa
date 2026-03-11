import { describe, expect, it, vi, beforeEach } from "vitest";
import { appointmentService } from "@/services/appointments/appointment.service";
import { appointmentRepository } from "@/services/appointments/appointment.repository";

vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({ tenantId: "00000000-0000-0000-0000-000000000111", userId: "00000000-0000-0000-0000-000000000222" }),
}));

vi.mock("@/services/appointments/appointment.repository", () => ({
  appointmentRepository: {
    hasConflict: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getById: vi.fn(),
  },
}));

const repo = vi.mocked(appointmentRepository, true);

describe("appointmentService conflict checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects creating an appointment when a conflict exists", async () => {
    repo.hasConflict.mockResolvedValue(true);

    await expect(
      appointmentService.create({
        patient_id: "00000000-0000-0000-0000-000000000aaa",
        doctor_id: "00000000-0000-0000-0000-000000000bbb",
        appointment_date: "2026-03-11T09:00:00Z",
        type: "checkup",
      }),
    ).rejects.toThrow("Appointment conflict detected");

    expect(repo.hasConflict).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000bbb",
      "2026-03-11T09:00:00Z",
      "00000000-0000-0000-0000-000000000111",
      undefined,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rejects updating an appointment when the new slot conflicts", async () => {
    repo.getById.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000999",
      tenant_id: "00000000-0000-0000-0000-000000000111",
      patient_id: "00000000-0000-0000-0000-000000000aaa",
      doctor_id: "00000000-0000-0000-0000-000000000bbb",
      appointment_date: "2026-03-11T09:00:00Z",
      type: "checkup",
      status: "scheduled",
      notes: null,
      created_at: "2026-03-11T08:00:00Z",
      updated_at: "2026-03-11T08:00:00Z",
    } as any);
    repo.hasConflict.mockResolvedValue(true);

    await expect(
      appointmentService.update("00000000-0000-0000-0000-000000000999", {
        appointment_date: "2026-03-11T10:00:00Z",
      }),
    ).rejects.toThrow("Appointment conflict detected");

    expect(repo.getById).toHaveBeenCalled();
    expect(repo.hasConflict).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000bbb",
      "2026-03-11T10:00:00Z",
      "00000000-0000-0000-0000-000000000111",
      "00000000-0000-0000-0000-000000000999",
    );
    expect(repo.update).not.toHaveBeenCalled();
  });
});
