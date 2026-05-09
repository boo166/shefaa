import { QueryClient } from "@tanstack/react-query";

/** Tenant-scoped keys include a runtime epoch segment; see {@link installRuntimeQueryConvergence} and {@link RuntimeEpochQueryBridge}. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
