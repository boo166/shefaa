import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";
import { RUNTIME_QUERY_SCOPE_MARKER } from "@/services/query/runtimeQueryConvergence";

type TenantListArgs = { tenantId?: string; [key: string]: unknown };

/**
 * Tenant-scoped keys include the current runtime epoch so cache partitions cannot serve
 * data hydrated under an obsolete causality boundary after epoch advances.
 * @see RuntimeEpochQueryBridge — ensures React re-evaluates keys after bumps.
 */
const tenantKey = (domain: string, tenantId?: string) =>
  [domain, RUNTIME_QUERY_SCOPE_MARKER, runtimeEpochManager.getCurrentEpoch(), tenantId] as const;
const listKey = (domain: string, args?: TenantListArgs) =>
  [...tenantKey(domain, args?.tenantId), "list", args] as const;

export const queryKeys = {
  auth: {
    session: () => ["auth", "session"] as const,
    user: (id?: string) => ["auth", "user", id] as const,
  },
  patients: {
    root: (tenantId?: string) => tenantKey("patients", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown>; sort?: { column: string; ascending?: boolean } }) =>
      listKey("patients", args),
    detail: (id: string, tenantId?: string) => [...tenantKey("patients", tenantId), "detail", id] as const,
    documents: (patientId: string, tenantId?: string) => [...tenantKey("patients", tenantId), "documents", patientId] as const,
    medicalRecords: (patientId: string, tenantId?: string) =>
      [...tenantKey("patients", tenantId), "medicalRecords", patientId] as const,
  },
  doctors: {
    root: (tenantId?: string) => tenantKey("doctors", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; sort?: { column: string; ascending?: boolean } }) =>
      listKey("doctors", args),
    detail: (id: string, tenantId?: string) => [...tenantKey("doctors", tenantId), "detail", id] as const,
    schedules: (doctorId: string, tenantId?: string) => [...tenantKey("doctors", tenantId), "schedules", doctorId] as const,
  },
  appointments: {
    root: (tenantId?: string) => tenantKey("appointments", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown>; sort?: { column: string; ascending?: boolean } }) =>
      listKey("appointments", args),
    calendar: (args?: { tenantId?: string; start?: string; end?: string }) =>
      [...tenantKey("appointments", args?.tenantId), "calendar", args] as const,
    statusCounts: (tenantId?: string) => [...tenantKey("appointments", tenantId), "statusCounts"] as const,
    queue: (args?: { tenantId?: string; dayKey?: string }) =>
      [...tenantKey("appointments", args?.tenantId), "queue", args] as const,
  },
  billing: {
    root: (tenantId?: string) => tenantKey("billing", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown>; sort?: { column: string; ascending?: boolean } }) =>
      listKey("billing", args),
    range: (args?: { tenantId?: string; start?: string; end?: string }) =>
      [...tenantKey("billing", args?.tenantId), "range", args] as const,
    summary: (tenantId?: string) => [...tenantKey("billing", tenantId), "summary"] as const,
    monthCount: (tenantId?: string, monthKey?: string) => [...tenantKey("billing", tenantId), "monthCount", monthKey] as const,
    payments: (invoiceId: string, tenantId?: string) => [...tenantKey("billing", tenantId), "payments", invoiceId] as const,
  },
  insurance: {
    root: (tenantId?: string) => tenantKey("insurance", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown>; sort?: { column: string; ascending?: boolean } }) =>
      listKey("insurance", args),
    summary: (tenantId?: string) => [...tenantKey("insurance", tenantId), "summary"] as const,
    operations: (tenantId?: string) => [...tenantKey("insurance", tenantId), "operations"] as const,
    owners: (tenantId?: string) => [...tenantKey("insurance", tenantId), "owners"] as const,
    attachments: (claimId: string, tenantId?: string) => [...tenantKey("insurance", tenantId), "attachments", claimId] as const,
  },
  laboratory: {
    root: (tenantId?: string) => tenantKey("laboratory", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown>; sort?: { column: string; ascending?: boolean } }) =>
      listKey("laboratory", args),
    summary: (tenantId?: string) => [...tenantKey("laboratory", tenantId), "summary"] as const,
  },
  pharmacy: {
    root: (tenantId?: string) => tenantKey("pharmacy", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown>; sort?: { column: string; ascending?: boolean } }) =>
      listKey("pharmacy", args),
    summary: (tenantId?: string) => [...tenantKey("pharmacy", tenantId), "summary"] as const,
  },
  prescriptions: {
    root: (tenantId?: string) => tenantKey("prescriptions", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown>; sort?: { column: string; ascending?: boolean } }) =>
      listKey("prescriptions", args),
  },
  notifications: {
    list: (userId: string) => ["notifications", userId, "list"] as const,
  },
  profiles: {
    byUser: (userId: string) => ["profiles", "byUser", userId] as const,
  },
  admin: {
    tenants: (args?: {
      page?: number;
      pageSize?: number;
      search?: string;
      plan?: string;
      sort?: { column: string; direction?: "asc" | "desc" };
    }) =>
      ["admin", "tenants", args] as const,
    profiles: (args?: {
      page?: number;
      pageSize?: number;
      search?: string;
      sort?: { column: string; direction?: "asc" | "desc" };
    }) =>
      ["admin", "profiles", args] as const,
    subscriptions: (args?: {
      page?: number;
      pageSize?: number;
      search?: string;
      plan?: string;
      status?: string;
      sort?: { column: string; direction?: "asc" | "desc" };
    }) =>
      ["admin", "subscriptions", args] as const,
    pricingPlans: () => ["admin", "pricingPlans"] as const,
    featureFlags: (tenantId: string) => ["admin", "featureFlags", tenantId] as const,
    subscriptionStats: () => ["admin", "subscriptionStats"] as const,
    operationsAlerts: () => ["admin", "operationsAlerts"] as const,
    operationsDashboard: (tenantId?: string) => ["admin", "operationsDashboard", tenantId ?? "all"] as const,
    activity: (tenantId?: string) => ["admin", "activity", tenantId ?? "all"] as const,
    tenantUsage: (tenantId: string) => ["admin", "tenantUsage", tenantId] as const,
  },
  pricing: {
    public: () => ["pricing", "public"] as const,
  },
  reports: {
    root: (tenantId?: string) => tenantKey("reports", tenantId),
    access: (tenantId?: string) => [...tenantKey("reports", tenantId), "access"] as const,
    refreshStatus: (tenantId?: string) => [...tenantKey("reports", tenantId), "refreshStatus"] as const,
    overview: (tenantId?: string) => [...tenantKey("reports", tenantId), "overview"] as const,
    revenueByMonth: (tenantId?: string) => [...tenantKey("reports", tenantId), "revenueByMonth"] as const,
    patientGrowth: (tenantId?: string) => [...tenantKey("reports", tenantId), "patientGrowth"] as const,
    appointmentTypes: (tenantId?: string) => [...tenantKey("reports", tenantId), "appointmentTypes"] as const,
    appointmentStatuses: (tenantId?: string) => [...tenantKey("reports", tenantId), "appointmentStatuses"] as const,
    revenueByService: (tenantId?: string) => [...tenantKey("reports", tenantId), "revenueByService"] as const,
    doctorPerformance: (tenantId?: string) => [...tenantKey("reports", tenantId), "doctorPerformance"] as const,
  },
  featureFlags: {
    list: (tenantId?: string) => [...tenantKey("featureFlags", tenantId), "list"] as const,
  },
  globalSearch: {
    query: (term: string, tenantId?: string) => [...tenantKey("globalSearch", tenantId), "query", term] as const,
  },
  settings: {
    tenant: (tenantId?: string) => [...tenantKey("settings", tenantId), "tenant"] as const,
    profiles: (args?: {
      tenantId?: string;
      page?: number;
      pageSize?: number;
      search?: string;
      sort?: { column: string; direction?: "asc" | "desc" };
    }) =>
      [...tenantKey("settings", args?.tenantId), "profiles", args] as const,
    notifications: (userId: string, tenantId?: string) => [...tenantKey("settings", tenantId), "notifications", userId] as const,
    audit: (args?: { tenantId?: string; page?: number; pageSize?: number }) =>
      [...tenantKey("settings", args?.tenantId), "audit", args] as const,
  },
} as const;
