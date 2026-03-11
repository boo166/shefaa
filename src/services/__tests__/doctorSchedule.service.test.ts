import { describe, expect, it, vi, beforeEach } from "vitest";
import { doctorScheduleService } from "@/services/doctors/doctorSchedule.service";
import { doctorScheduleRepository } from "@/services/doctors/doctorSchedule.repository";

vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({ tenantId: "00000000-0000-0000-0000-000000000111", userId: "00000000-0000-0000-0000-000000000222" }),
}));

vi.mock("@/services/doctors/doctorSchedule.repository", () => ({
  doctorScheduleRepository: {
    upsertMany: vi.fn(),
    listByDoctor: vi.fn(),
  },
}));

const repo = vi.mocked(doctorScheduleRepository, true);

describe("doctorScheduleService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects overlapping active schedules on the same day", async () => {
    const doctorId = "00000000-0000-0000-0000-000000000010";
    await expect(
      doctorScheduleService.save(doctorId, [
        { day_of_week: 1, start_time: "09:00", end_time: "12:00", is_active: true },
        { day_of_week: 1, start_time: "11:00", end_time: "14:00", is_active: true },
      ]),
    ).rejects.toThrow("Schedule overlap detected");
  });

  it("saves schedules and normalizes time output", async () => {
    const doctorId = "00000000-0000-0000-0000-000000000010";
    repo.upsertMany.mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000999",
        tenant_id: "00000000-0000-0000-0000-000000000111",
        doctor_id: doctorId,
        day_of_week: 2,
        start_time: "09:00:00",
        end_time: "17:00:00",
        is_active: true,
        created_at: "2026-03-11T09:00:00Z",
        updated_at: "2026-03-11T09:00:00Z",
      },
    ]);

    const result = await doctorScheduleService.save(doctorId, [
      { day_of_week: 2, start_time: "09:00", end_time: "17:00", is_active: true },
    ]);

    expect(repo.upsertMany).toHaveBeenCalledWith(
      doctorId,
      [{ day_of_week: 2, start_time: "09:00", end_time: "17:00", is_active: true }],
      "00000000-0000-0000-0000-000000000111",
    );
    expect(result[0]?.start_time).toBe("09:00");
    expect(result[0]?.end_time).toBe("17:00");
  });
});
