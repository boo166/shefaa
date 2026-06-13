import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentLifecycleWorkflow } from "@/services/appointments/appointmentLifecycle.workflow";
import { appointmentQueueRepository } from "@/services/appointments/appointmentQueue.repository";
import { notificationRepository } from "@/services/notifications/notification.repository";

vi.mock("@/services/appointments/appointmentQueue.repository", () => ({
  appointmentQueueRepository: {
    commandLifecycle: vi.fn(),
    getByAppointmentId: vi.fn(),
  },
}));

vi.mock("@/services/notifications/notification.repository", () => ({
  notificationRepository: {
    listDeliveryAuditByWorkflowTraceId: vi.fn(),
  },
}));

describe("appointment notification trace (service layer)", () => {
  const tenantId = "70000000-0000-0000-0000-000000000001";
  const appointmentId = "76000000-0000-0000-0000-000000000001";
  const queueId = "77000000-0000-0000-0000-000000000001";
  const workflowTraceId = "wf-appt-notif-trace";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propagates workflow trace ids through lifecycle commands for delivery correlation", async () => {
    const queueRepo = vi.mocked(appointmentQueueRepository, true);
    queueRepo.commandLifecycle.mockResolvedValue({
      result_code: "OK",
      retryable: false,
      idempotency_replay: false,
      message: "Checked in",
      appointment: { id: appointmentId, status: "scheduled" },
      queue_entry: { id: queueId, status: "waiting" },
    });

    await appointmentLifecycleWorkflow.checkIn(appointmentId, tenantId, "user-1", {
      requestTraceId: "req-1",
      operationTraceId: "op-1",
      workflowTraceId,
    });

    expect(queueRepo.commandLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "check_in",
        appointmentId,
        tenantId,
        trace: expect.objectContaining({ workflowTraceId }),
      }),
    );

    vi.mocked(notificationRepository, true).listDeliveryAuditByWorkflowTraceId.mockResolvedValue([
      {
        id: "audit-1",
        tenant_id: tenantId,
        action: "notification_delivered",
        created_at: new Date().toISOString(),
        details: {
          workflowTraceId,
          source_event_id: "event-1",
          source_outbox_id: "outbox-1",
        },
      },
    ]);

    const auditRows = await notificationRepository.listDeliveryAuditByWorkflowTraceId(tenantId, workflowTraceId);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.details?.workflowTraceId).toBe(workflowTraceId);
    expect(auditRows[0]?.details?.source_outbox_id).toBe("outbox-1");
  });
});
