export type RepositoryDescribe = {
  certified: boolean;
  tenantBound: boolean;
  retryAware: boolean;
  staleContextSafe: boolean;
  metricsEnabled: boolean;
  requiredCapabilities: string[];
  exceptions?: string[];
};

export function assertRepositoryDescribe(value: unknown): asserts value is RepositoryDescribe {
  if (!value || typeof value !== "object") throw new Error("Missing repository.describe() metadata");
  const v = value as any;
  const boolFields = ["certified", "tenantBound", "retryAware", "staleContextSafe", "metricsEnabled"];
  for (const f of boolFields) {
    if (typeof v[f] !== "boolean") throw new Error(`repository.describe().${f} must be boolean`);
  }
  if (!Array.isArray(v.requiredCapabilities) || !v.requiredCapabilities.every((x: any) => typeof x === "string")) {
    throw new Error("repository.describe().requiredCapabilities must be string[]");
  }
  if (v.exceptions !== undefined && (!Array.isArray(v.exceptions) || !v.exceptions.every((x: any) => typeof x === "string"))) {
    throw new Error("repository.describe().exceptions must be string[] when provided");
  }
}
