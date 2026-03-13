import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { realtimeService } from "@/services/realtime/realtime.service";
import type { RealtimeTable } from "@/services/realtime/realtime.repository";
import { useAuth } from "@/core/auth/authStore";
import { queryKeys } from "@/services/queryKeys";

const reportKeyFactories: Array<(tenantId: string) => readonly unknown[]> = [
  (tenantId) => queryKeys.reports.overview(tenantId),
  (tenantId) => queryKeys.reports.revenueByMonth(tenantId),
  (tenantId) => queryKeys.reports.patientGrowth(tenantId),
  (tenantId) => queryKeys.reports.appointmentTypes(tenantId),
  (tenantId) => queryKeys.reports.appointmentStatuses(tenantId),
  (tenantId) => queryKeys.reports.revenueByService(tenantId),
  (tenantId) => queryKeys.reports.doctorPerformance(tenantId),
];

const INVALIDATION_MAP: Record<RealtimeTable, Array<(tenantId: string) => readonly unknown[]>> = {
  patients: [
    (tenantId) => queryKeys.patients.list({ tenantId }),
    (tenantId) => [...queryKeys.patients.root(tenantId), "detail"],
    ...reportKeyFactories,
  ],
  doctors: [
    (tenantId) => queryKeys.doctors.list({ tenantId }),
    (tenantId) => [...queryKeys.doctors.root(tenantId), "detail"],
    (tenantId) => [...queryKeys.doctors.root(tenantId), "schedules"],
    ...reportKeyFactories,
  ],
  appointments: [
    (tenantId) => queryKeys.appointments.list({ tenantId }),
    (tenantId) => queryKeys.appointments.calendar({ tenantId }),
    (tenantId) => queryKeys.appointments.statusCounts(tenantId),
    ...reportKeyFactories,
  ],
  invoices: [
    (tenantId) => queryKeys.billing.list({ tenantId }),
    (tenantId) => queryKeys.billing.summary(tenantId),
    (tenantId) => queryKeys.billing.range({ tenantId }),
    (tenantId) => [...queryKeys.billing.root(tenantId), "monthCount"],
    ...reportKeyFactories,
  ],
  medications: [
    (tenantId) => queryKeys.pharmacy.list({ tenantId }),
    (tenantId) => queryKeys.pharmacy.summary(tenantId),
  ],
  lab_orders: [
    (tenantId) => queryKeys.laboratory.list({ tenantId }),
    (tenantId) => queryKeys.laboratory.summary(tenantId),
  ],
  insurance_claims: [
    (tenantId) => queryKeys.insurance.list({ tenantId }),
    (tenantId) => queryKeys.insurance.summary(tenantId),
  ],
};

export function useRealtimeSubscription(tables: RealtimeTable[]) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const tablesKey = [...new Set(tables)].sort().join("|");

  useEffect(() => {
    if (!tenantId) return;

    const watchedTables = tablesKey.split("|").filter(Boolean) as RealtimeTable[];
    if (watchedTables.length === 0) return;

    const subscription = realtimeService.subscribeToTenantTables(
      tenantId,
      watchedTables,
      () => {
        const keys: Array<readonly unknown[]> = [];
        for (const table of watchedTables) {
          const factories = INVALIDATION_MAP[table] ?? [];
          for (const factory of factories) {
            keys.push(factory(tenantId));
          }
        }

        const unique = new Map<string, readonly unknown[]>();
        for (const key of keys) {
          const hash = JSON.stringify(key);
          if (!unique.has(hash)) {
            unique.set(hash, key);
          }
        }

        unique.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [tenantId, tablesKey, queryClient]);
}
