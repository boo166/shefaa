import type { WorkflowCheckpoint } from "./types";

const store = new Map<string, WorkflowCheckpoint>();

export const inMemoryWorkflowStore = {
  async get(workflowId: string): Promise<WorkflowCheckpoint | null> {
    return store.get(workflowId) ?? null;
  },
  async put(checkpoint: WorkflowCheckpoint): Promise<void> {
    store.set(checkpoint.workflowId, checkpoint);
  },
  async clear(workflowId: string): Promise<void> {
    store.delete(workflowId);
  },

  listWorkflowIds(): string[] {
    return [...store.keys()];
  },
};

