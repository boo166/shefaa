export async function initEventHandlers() {
  // Domain event side effects are delivered by the durable outbox worker.
  // Keep this initializer as a compatibility hook for app bootstrap.
}

export { emitDomainEvent } from "./event-bus";
export type { DomainEventName, DomainEvent } from "./event-types";
