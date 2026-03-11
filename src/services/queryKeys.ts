type TenantListArgs = { tenantId?: string; [key: string]: unknown };

const tenantKey = (domain: string, tenantId?: string) => [domain, tenantId] as const;
const listKey = (domain: string, args?: TenantListArgs) =>
  [...tenantKey(domain, args?.tenantId), "list", args] as const;

export const queryKeys = {
  auth: {
    session: () => ["auth", "session"] as const,
    user: (id?: string) => ["auth", "user", id] as const,
  },
  patients: {
    root: (tenantId?: string) => tenantKey("patients", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown> }) =>
      listKey("patients", args),
    detail: (id: string, tenantId?: string) => [...tenantKey("patients", tenantId), "detail", id] as const,
    documents: (patientId: string, tenantId?: string) => [...tenantKey("patients", tenantId), "documents", patientId] as const,
    medicalRecords: (patientId: string, tenantId?: string) =>
      [...tenantKey("patients", tenantId), "medicalRecords", patientId] as const,
  },
  doctors: {
    root: (tenantId?: string) => tenantKey("doctors", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string }) =>
      listKey("doctors", args),
    detail: (id: string, tenantId?: string) => [...tenantKey("doctors", tenantId), "detail", id] as const,
    schedules: (doctorId: string, tenantId?: string) => [...tenantKey("doctors", tenantId), "schedules", doctorId] as const,
  },
  appointments: {
    root: (tenantId?: string) => tenantKey("appointments", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown> }) =>
      listKey("appointments", args),
    calendar: (args?: { tenantId?: string; start?: string; end?: string }) =>
      [...tenantKey("appointments", args?.tenantId), "calendar", args] as const,
    statusCounts: (tenantId?: string) => [...tenantKey("appointments", tenantId), "statusCounts"] as const,
  },
  billing: {
    root: (tenantId?: string) => tenantKey("billing", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown> }) =>
      listKey("billing", args),
    summary: (tenantId?: string) => [...tenantKey("billing", tenantId), "summary"] as const,
    monthCount: (tenantId?: string, monthKey?: string) => [...tenantKey("billing", tenantId), "monthCount", monthKey] as const,
  },
  insurance: {
    root: (tenantId?: string) => tenantKey("insurance", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown> }) =>
      listKey("insurance", args),
    summary: (tenantId?: string) => [...tenantKey("insurance", tenantId), "summary"] as const,
  },
  laboratory: {
    root: (tenantId?: string) => tenantKey("laboratory", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown> }) =>
      listKey("laboratory", args),
    summary: (tenantId?: string) => [...tenantKey("laboratory", tenantId), "summary"] as const,
  },
  pharmacy: {
    root: (tenantId?: string) => tenantKey("pharmacy", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown> }) =>
      listKey("pharmacy", args),
    summary: (tenantId?: string) => [...tenantKey("pharmacy", tenantId), "summary"] as const,
  },
  prescriptions: {
    root: (tenantId?: string) => tenantKey("prescriptions", tenantId),
    list: (args?: { tenantId?: string; page?: number; pageSize?: number; search?: string; filters?: Record<string, unknown> }) =>
      listKey("prescriptions", args),
  },
  notifications: {
    list: (userId: string) => ["notifications", userId, "list"] as const,
  },
  profiles: {
    byUser: (userId: string) => ["profiles", "byUser", userId] as const,
  },
  admin: {
    tenants: () => ["admin", "tenants"] as const,
    profiles: () => ["admin", "profiles"] as const,
    subscriptions: () => ["admin", "subscriptions"] as const,
  },
  reports: {
    overview: (tenantId?: string) => [...tenantKey("reports", tenantId), "overview"] as const,
    revenueByMonth: (tenantId?: string) => [...tenantKey("reports", tenantId), "revenueByMonth"] as const,
    patientGrowth: (tenantId?: string) => [...tenantKey("reports", tenantId), "patientGrowth"] as const,
    appointmentTypes: (tenantId?: string) => [...tenantKey("reports", tenantId), "appointmentTypes"] as const,
    appointmentStatuses: (tenantId?: string) => [...tenantKey("reports", tenantId), "appointmentStatuses"] as const,
    revenueByService: (tenantId?: string) => [...tenantKey("reports", tenantId), "revenueByService"] as const,
    doctorPerformance: (tenantId?: string) => [...tenantKey("reports", tenantId), "doctorPerformance"] as const,
  },
  globalSearch: {
    query: (term: string, tenantId?: string) => [...tenantKey("globalSearch", tenantId), "query", term] as const,
  },
  settings: {
    tenant: (tenantId?: string) => [...tenantKey("settings", tenantId), "tenant"] as const,
    profiles: (tenantId?: string) => [...tenantKey("settings", tenantId), "profiles"] as const,
    notifications: (userId: string, tenantId?: string) => [...tenantKey("settings", tenantId), "notifications", userId] as const,
    audit: (tenantId?: string) => [...tenantKey("settings", tenantId), "audit"] as const,
  },
} as const;
