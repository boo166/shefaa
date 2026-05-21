import { describe, expect, it, vi } from "vitest";

const subscribeEntity = vi.hoisted(() => vi.fn(() => ({ unsubscribe: vi.fn() })));

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
  },
}));

import { notificationRepository } from "../notification.repository";

describe("notificationRepository realtime convergence", () => {
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
