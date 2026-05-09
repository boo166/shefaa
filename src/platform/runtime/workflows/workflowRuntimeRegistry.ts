/** Tracks workflows currently executing so the coordination kernel can abort them on transitions. */
const active = new Set<string>();

export const workflowRuntimeRegistry = {
  register(workflowId: string) {
    active.add(workflowId);
  },

  unregister(workflowId: string) {
    active.delete(workflowId);
  },

  listActive(): string[] {
    return [...active];
  },

  clearAll() {
    active.clear();
  },
};
