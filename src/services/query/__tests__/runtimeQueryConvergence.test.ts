import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { removeStaleRuntimeQueryScopes, RUNTIME_QUERY_SCOPE_MARKER } from "../runtimeQueryConvergence";

describe("removeStaleRuntimeQueryScopes", () => {
  it("removes queries whose rt epoch is behind the given epoch", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const staleKey = ["patients", RUNTIME_QUERY_SCOPE_MARKER, 1, "t1"] as const;
    const freshKey = ["patients", RUNTIME_QUERY_SCOPE_MARKER, 99, "t1"] as const;
    client.setQueryData(staleKey, { a: 1 });
    client.setQueryData(freshKey, { b: 2 });

    removeStaleRuntimeQueryScopes(client, 50);

    expect(client.getQueryData(staleKey)).toBeUndefined();
    expect(client.getQueryData(freshKey)).toEqual({ b: 2 });
  });

  it("ignores keys without rt scope marker", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const otherKey = ["admin", "tenants", {}] as const;
    client.setQueryData(otherKey, { x: 1 });
    removeStaleRuntimeQueryScopes(client, 999);
    expect(client.getQueryData(otherKey)).toEqual({ x: 1 });
  });
});
