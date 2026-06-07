import { beforeEach, describe, expect, it, vi } from "vitest";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import { appointmentQueueRepository } from "@/services/appointments/appointmentQueue.repository";

const queryBuilder = vi.hoisted(() => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return builder;
});

vi.mock("@/platform/data/platformRepository", () => ({
  platformRepository: {
    from: vi.fn(() => queryBuilder),
    rpc: vi.fn(() => Promise.resolve({
      data: [{
        result_code: "OK",
        retryable: false,
        idempotency_replay: false,
        message: null,
        appointment: { id: "00000000-0000-0000-0000-000000000333", status: "scheduled" },
        queue_entry: {
          id: "00000000-0000-0000-0000-000000000444",
          appointment_id: "00000000-0000-0000-0000-000000000333",
          tenant_id: "00000000-0000-0000-0000-000000000111",
          status: "waiting",
          check_in_at: "2026-03-14T09:55:00Z",
          position: null,
          called_at: null,
          completed_at: null,
          created_at: "2026-03-14T09:55:00Z",
          updated_at: "2026-03-14T09:55:00Z",
        },
      }],
      error: null,
    })),
  },
}));

describe("appointmentQueueRepository platform certification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("describes platform-aware queue authority metadata", () => {
    const meta = appointmentQueueRepository.describe?.();

    expect(meta).toEqual(expect.objectContaining({
      certified: true,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [Capabilities.appointments.view, Capabilities.appointments.manage],
    }));
  });

  it("uses platformRepository with readonly queue capabilities for reads", async () => {
    await appointmentQueueRepository.listByCheckInRange(
      "2026-03-14T00:00:00Z",
      "2026-03-15T00:00:00Z",
      "00000000-0000-0000-0000-000000000111",
    );

    expect(platformRepository.from).toHaveBeenCalledWith(
      "appointment_queue",
      expect.objectContaining({
        action: "appointments.queue.listByCheckInRange",
        classification: "readonly",
        tenantScoped: true,
        tenantId: "00000000-0000-0000-0000-000000000111",
        requiredCapabilities: [Capabilities.appointments.view, Capabilities.appointments.manage],
      }),
    );
  });

  it("calls the DB lifecycle command with mutation capabilities and trace ids", async () => {
    const result = await appointmentQueueRepository.commandLifecycle({
      operation: "call",
      queueId: "00000000-0000-0000-0000-000000000444",
      tenantId: "00000000-0000-0000-0000-000000000111",
      userId: "00000000-0000-0000-0000-000000000222",
      expectedUpdatedAt: "2026-03-14T09:55:00Z",
      requestHash: "hash-1",
      trace: {
        requestTraceId: "req-1",
        operationTraceId: "op-1",
        workflowTraceId: "wf-1",
      },
    });

    expect(result.result_code).toBe("OK");
    expect(platformRepository.rpc).toHaveBeenCalledWith(
      "command_appointment_lifecycle",
      expect.objectContaining({
        p_operation: "call",
        p_queue_id: "00000000-0000-0000-0000-000000000444",
        p_tenant_id: "00000000-0000-0000-0000-000000000111",
        p_expected_updated_at: "2026-03-14T09:55:00Z",
        p_request_hash: "hash-1",
        p_request_trace_id: "req-1",
        p_operation_trace_id: "op-1",
        p_workflow_trace_id: "wf-1",
      }),
      expect.objectContaining({
        action: "appointments.lifecycle.call",
        classification: "tenant-critical",
        requiredCapabilities: [Capabilities.appointments.manage],
      }),
    );
  });
});
