import { describe, expect, it, vi } from "vitest";
import { Capabilities } from "@/platform/authorization/capabilities";

const subscribeEntity = vi.hoisted(() => vi.fn(() => ({ unsubscribe: vi.fn() })));
const rpc = vi.hoisted(() => vi.fn(() => Promise.resolve({
  data: [{
    result_code: "OK",
    retryable: false,
    idempotency_replay: false,
    message: null,
    notification: {
      id: "00000000-0000-0000-0000-000000000444",
      tenant_id: "00000000-0000-0000-0000-000000000111",
      user_id: "00000000-0000-0000-0000-000000000222",
      title: "Ready",
      body: null,
      type: "system",
      read: false,
      created_at: "2026-05-21T10:00:00.000Z",
      delivery_key: "manual:test",
      source_event_id: null,
      source_outbox_id: null,
      delivered_at: "2026-05-21T10:00:00.000Z",
      acknowledged_at: null,
      updated_at: "2026-05-21T10:00:00.000Z",
    },
  }],
  error: null,
})));

vi.mock("@/platform/sdk", () => ({
  platform: {
    realtime: {
      subscribeEntity,
    },
  },
}));

vi.mock("@/platform/data/platformRepository", () => ({
  platformRepository: {
    from: vi.fn(),
    rpc,
  },
}));

import { notificationRepository } from "../notification.repository";

describe("notificationRepository realtime convergence", () => {
  it("describes certified notification operational authority metadata", () => {
    const meta = notificationRepository.describe?.();

    expect(meta).toEqual(expect.objectContaining({
      certified: true,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: true,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [Capabilities.notifications.read, Capabilities.notifications.write],
    }));
  });

  it("delivers notifications through DB command authority with trace ids", async () => {
    const result = await notificationRepository.commandDelivery({
      tenantId: "00000000-0000-0000-0000-000000000111",
      userId: "00000000-0000-0000-0000-000000000222",
      title: "Ready",
      body: null,
      type: "system",
      deliveryKey: "notifications:tenant:outbox",
      sourceEventId: "00000000-0000-0000-0000-000000000333",
      sourceOutboxId: "00000000-0000-0000-0000-000000000444",
      trace: {
        requestTraceId: "req-1",
        operationTraceId: "op-1",
        workflowTraceId: "wf-1",
      },
    });

    expect(result.result_code).toBe("OK");
    expect(rpc).toHaveBeenCalledWith(
      "command_notification_delivery",
      expect.objectContaining({
        p_tenant_id: "00000000-0000-0000-0000-000000000111",
        p_user_id: "00000000-0000-0000-0000-000000000222",
        p_delivery_key: "notifications:tenant:outbox",
        p_source_event_id: "00000000-0000-0000-0000-000000000333",
        p_source_outbox_id: "00000000-0000-0000-0000-000000000444",
        p_request_trace_id: "req-1",
        p_operation_trace_id: "op-1",
        p_workflow_trace_id: "wf-1",
      }),
      expect.objectContaining({
        action: "notifications.commandDelivery",
        classification: "tenant-critical",
        requiredCapabilities: [Capabilities.notifications.write],
      }),
    );
  });

  it("acknowledges notifications through DB command authority", async () => {
    await notificationRepository.markRead(
      "00000000-0000-0000-0000-000000000444",
      "00000000-0000-0000-0000-000000000111",
      "00000000-0000-0000-0000-000000000222",
    );

    expect(rpc).toHaveBeenCalledWith(
      "command_notification_acknowledge",
      expect.objectContaining({
        p_notification_id: "00000000-0000-0000-0000-000000000444",
        p_tenant_id: "00000000-0000-0000-0000-000000000111",
        p_user_id: "00000000-0000-0000-0000-000000000222",
        p_idempotency_key: "notification_ack:00000000-0000-0000-0000-000000000444:00000000-0000-0000-0000-000000000222",
      }),
      expect.objectContaining({
        action: "notifications.commandAcknowledge",
        classification: "tenant-critical",
        requiredCapabilities: [Capabilities.notifications.write],
      }),
    );
  });

  it("subscribes through the platform realtime gateway and filters recipient payloads", () => {
    const onInsert = vi.fn();
    const sub = notificationRepository.subscribeToUser("tenant-1", "user-1", onInsert);

    expect(subscribeEntity).toHaveBeenCalledWith(expect.objectContaining({
      ctx: { tenantId: "tenant-1", userId: "user-1", sessionVersion: null },
      tables: ["notifications"],
      onPayload: expect.any(Function),
    }));

    const onPayload = subscribeEntity.mock.calls[0][0].onPayload;
    onPayload({
      type: "INSERT",
      table: "notifications",
      row: {
        id: "n-1",
        tenant_id: "tenant-1",
        user_id: "user-1",
        title: "Ready",
        body: null,
        type: "system",
        read: false,
        created_at: "2026-05-21T10:00:00.000Z",
      },
    });
    onPayload({
      type: "INSERT",
      table: "notifications",
      row: {
        id: "n-2",
        tenant_id: "tenant-1",
        user_id: "user-2",
        title: "Wrong user",
        body: null,
        type: "system",
        read: false,
        created_at: "2026-05-21T10:00:00.000Z",
      },
    });
    onPayload({
      type: "UPDATE",
      table: "notifications",
      row: {
        id: "n-3",
        tenant_id: "tenant-1",
        user_id: "user-1",
      },
    });

    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ id: "n-1" }));
    sub.unsubscribe();
  });
});
