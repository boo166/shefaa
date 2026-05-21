export type RepositoryDescribe = {
  certified: boolean;
  tenantBound: boolean;
  traceAware: boolean;
  runtimeAware: boolean;
  capabilityAware: boolean;
  reconciliationAware: boolean;
  recoveryAware: boolean;
  evidenceAware: boolean;
  retryAware: boolean;
  staleContextSafe: boolean;
  metricsEnabled: boolean;
  requiredCapabilities: string[];
  exceptions?: string[];
};

const REQUIRED_BOOL_FIELDS = [
  "certified",
  "tenantBound",
  "traceAware",
  "runtimeAware",
  "capabilityAware",
  "reconciliationAware",
  "recoveryAware",
  "evidenceAware",
  "retryAware",
  "staleContextSafe",
  "metricsEnabled",
] as const;

const CERTIFIED_TRUE_FIELDS = [
  "tenantBound",
  "traceAware",
  "runtimeAware",
  "capabilityAware",
  "evidenceAware",
  "retryAware",
  "staleContextSafe",
  "metricsEnabled",
] as const;

export function assertRepositoryDescribe(value: unknown): asserts value is RepositoryDescribe {
  if (!value || typeof value !== "object") throw new Error("Missing repository.describe() metadata");
  const v = value as any;
  for (const f of REQUIRED_BOOL_FIELDS) {
    if (typeof v[f] !== "boolean") throw new Error(`repository.describe().${f} must be boolean`);
  }
  if (!Array.isArray(v.requiredCapabilities) || !v.requiredCapabilities.every((x: any) => typeof x === "string")) {
    throw new Error("repository.describe().requiredCapabilities must be string[]");
  }
  if (v.exceptions !== undefined && (!Array.isArray(v.exceptions) || !v.exceptions.every((x: any) => typeof x === "string"))) {
    throw new Error("repository.describe().exceptions must be string[] when provided");
  }
}

export function assertCertifiedRepositoryDescribe(value: unknown): asserts value is RepositoryDescribe & { certified: true } {
  assertRepositoryDescribe(value);
  if (!value.certified) throw new Error("repository.describe().certified must be true");
  for (const f of CERTIFIED_TRUE_FIELDS) {
    if (!value[f]) throw new Error(`certified repository must set ${f}=true`);
  }
  if (value.requiredCapabilities.length === 0) {
    throw new Error("certified repository must declare requiredCapabilities");
  }
}
