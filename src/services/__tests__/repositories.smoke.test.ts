import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResponse = { data?: any; error?: any; count?: number };

const mockState = vi.hoisted(() => ({
  response: { data: [], error: null, count: 2 } as MockResponse,
  responseSingle: { data: {}, error: null } as MockResponse,
  responseRpc: { data: [], error: null } as MockResponse,
  responseAuth: {
    data: {
      user: { id: "user-1", email: "user@example.com", created_at: "2026-03-01T00:00:00.000Z" },
      session: {
        user: { id: "user-1", email: "user@example.com", created_at: "2026-03-01T00:00:00.000Z" },
        expires_at: 1_800_000_000,
        created_at: "2026-03-01T00:00:00.000Z",
      },
    },
    error: null,
  } as MockResponse,
  responseFunctions: { data: {}, error: null } as MockResponse,
  responseStorage: { data: { signedUrl: "https://example.com/file" }, error: null } as MockResponse,
  realtimeStatusCallback: null as null | ((status: string) => void),
}));

function createQueryBuilder() {
  let useSingle = false;
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    or: () => builder,
    order: () => builder,
    range: () => builder,
    in: () => builder,
    gte: () => builder,
    lte: () => builder,
    lt: () => builder,
    gt: () => builder,
    neq: () => builder,
    ilike: () => builder,
    update: () => builder,
    insert: () => builder,
    upsert: () => builder,
    delete: () => builder,
    single: () => {
      useSingle = true;
      return builder;
    },
    maybeSingle: () => {
      useSingle = true;
      return builder;
    },
    then: (resolve: (value: MockResponse) => unknown, reject: (reason?: any) => unknown) => {
      const result = useSingle ? mockState.responseSingle : mockState.response;
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

const mockTenant = vi.hoisted(() => ({
  tenantId: "00000000-0000-0000-0000-000000000111",
  userId: "00000000-0000-0000-0000-000000000222",
}));

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(() => createQueryBuilder()),
  rpc: vi.fn(async (fn: string) => {
    if (fn === "command_medication" || fn === "adjust_medication_stock") {
      return {
        data: [{
          result_code: "OK",
          medication: {
            id: "00000000-0000-0000-0000-000000000333",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            name: "Medication",
            category: "General",
            stock: 10,
            unit: "tabs",
            price: 1,
            status: "in_stock",
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        }],
        error: null,
      };
    }
    if (fn === "command_supplier") {
      return {
        data: [{
          result_code: "OK",
          supplier: {
            id: "00000000-0000-0000-0000-000000000333",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            name: "Supplier",
            contact_name: "Contact",
            phone: "+201000000000",
            email: "supplier@example.com",
            address: "Main warehouse",
            status: "active",
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        }],
        error: null,
      };
    }
    if (fn === "command_purchase_order") {
      return {
        data: [{
          result_code: "OK",
          purchase_order: {
            id: "00000000-0000-0000-0000-000000000333",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            supplier_id: "00000000-0000-0000-0000-000000000333",
            status: "submitted",
            order_date: "2026-03-10",
            total_amount: 90,
            notes: "replenishment",
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        }],
        error: null,
      };
    }
    if (fn === "receive_procurement_stock") {
      return {
        data: [{
          result_code: "OK",
          purchase_order: {
            id: "00000000-0000-0000-0000-000000000333",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            supplier_id: "00000000-0000-0000-0000-000000000333",
            status: "received",
            order_date: "2026-03-10",
            total_amount: 90,
            notes: "replenishment",
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
          stock_receipt: {
            id: "00000000-0000-0000-0000-000000000444",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            purchase_order_id: "00000000-0000-0000-0000-000000000333",
            received_at: "2026-03-10T00:00:00.000Z",
            received_by: "00000000-0000-0000-0000-000000000222",
            notes: "received",
            created_at: "2026-03-10T00:00:00.000Z",
          },
          medication_batch: {
            id: "00000000-0000-0000-0000-000000000555",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            medication_id: "00000000-0000-0000-0000-000000000333",
            supplier_id: "00000000-0000-0000-0000-000000000333",
            lot_number: "LOT-1",
            expiry_date: "2027-01-01",
            quantity: 12,
            cost_price: 7.5,
            received_at: "2026-03-10T00:00:00.000Z",
            created_at: "2026-03-10T00:00:00.000Z",
          },
          inventory_movement: {
            id: "00000000-0000-0000-0000-000000000666",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            medication_id: "00000000-0000-0000-0000-000000000333",
            batch_id: "00000000-0000-0000-0000-000000000555",
            movement_type: "receipt",
            quantity: 12,
            source_reference: "purchase_order:po:item:item:receipt:receipt",
            created_at: "2026-03-10T00:00:00.000Z",
          },
          medication: {},
        }],
        error: null,
      };
    }
    if (fn === "command_insurance_claim" || fn === "transition_insurance_claim") {
      return {
        data: [{
          result_code: "OK",
          claim: {
            id: "00000000-0000-0000-0000-000000000333",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            patient_id: "00000000-0000-0000-0000-000000000333",
            provider: "Provider",
            service: "Service",
            amount: 100,
            claim_date: "2026-03-10",
            status: "draft",
            submitted_at: null,
            processing_started_at: null,
            approved_at: null,
            reimbursed_at: null,
            payer_reference: null,
            denial_reason: null,
            assigned_to_user_id: null,
            internal_notes: null,
            payer_notes: null,
            last_follow_up_at: null,
            next_follow_up_at: null,
            resubmission_count: 0,
            deleted_at: null,
            deleted_by: null,
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        }],
        error: null,
      };
    }
    if (fn === "command_lab_order" || fn === "finalize_lab_result") {
      return {
        data: [{
          result_code: "OK",
          lab_order: {
            id: "00000000-0000-0000-0000-000000000333",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            patient_id: "00000000-0000-0000-0000-000000000333",
            doctor_id: "00000000-0000-0000-0000-000000000333",
            test_name: "CBC",
            order_date: "2026-03-10",
            status: "pending",
            result: null,
            result_value: null,
            result_unit: null,
            reference_range: null,
            abnormal_flag: null,
            result_notes: null,
            resulted_at: null,
            deleted_at: null,
            deleted_by: null,
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        }],
        error: null,
      };
    }
    if (fn === "command_appointment_lifecycle") {
      return {
        data: [{
          result_code: "OK",
          retryable: false,
          idempotency_replay: false,
          message: null,
          appointment: {
            id: "00000000-0000-0000-0000-000000000333",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            status: "scheduled",
          },
          queue_entry: {
            id: "00000000-0000-0000-0000-000000000444",
            appointment_id: "00000000-0000-0000-0000-000000000333",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            check_in_at: "2026-03-14T09:55:00.000Z",
            position: null,
            status: "waiting",
            called_at: null,
            completed_at: null,
            created_at: "2026-03-14T09:55:00.000Z",
            updated_at: "2026-03-14T09:55:00.000Z",
          },
        }],
        error: null,
      };
    }
    if (fn === "command_notification_delivery" || fn === "command_notification_acknowledge") {
      return {
        data: [{
          result_code: "OK",
          retryable: false,
          idempotency_replay: false,
          message: null,
          notification: {
            id: "00000000-0000-0000-0000-000000000333",
            tenant_id: "00000000-0000-0000-0000-000000000111",
            user_id: "00000000-0000-0000-0000-000000000222",
            title: "Hello",
            body: null,
            type: "system",
            read: fn === "command_notification_acknowledge",
            created_at: "2026-03-01T00:00:00.000Z",
            delivery_key: "manual:smoke",
            source_event_id: null,
            source_outbox_id: null,
            delivered_at: "2026-03-01T00:00:00.000Z",
            acknowledged_at: fn === "command_notification_acknowledge" ? "2026-03-01T00:00:00.000Z" : null,
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        }],
        error: null,
      };
    }
    return mockState.responseRpc;
  }),
  auth: {
    signInWithPassword: vi.fn(async () => mockState.responseAuth),
    signOut: vi.fn(async () => ({ error: null })),
    getSession: vi.fn(async () => mockState.responseAuth),
    refreshSession: vi.fn(async () => ({ data: mockState.responseAuth.data, error: null })),
    onAuthStateChange: vi.fn((callback: (event: string, session: any) => void) => {
      callback("SIGNED_IN", mockState.responseAuth.data?.session ?? null);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({
        data: { currentLevel: "aal1", nextLevel: "aal1" },
        error: null,
      })),
      listFactors: vi.fn(async () => ({
        data: { totp: [], phone: [], webauthn: [] },
        error: null,
      })),
      enroll: vi.fn(async () => ({ data: { id: "factor-1", type: "totp" }, error: null })),
      challenge: vi.fn(async () => ({ data: { id: "challenge-1" }, error: null })),
      verify: vi.fn(async () => ({ data: {}, error: null })),
      unenroll: vi.fn(async () => ({ data: {}, error: null })),
    },
  },
  functions: {
    invoke: vi.fn(async () => mockState.responseFunctions),
  },
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(async () => ({ error: null })),
      createSignedUrl: vi.fn(async () => mockState.responseStorage),
      remove: vi.fn(async () => ({ error: null })),
    })),
  },
  channel: vi.fn(() => {
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback?: (status: string) => void) => {
        mockState.realtimeStatusCallback = callback ?? null;
        return channel;
      }),
    };
    return channel;
  }),
  removeChannel: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/services/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/core/auth/authStore", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/core/auth/authStore")>();
  const smokeState = () => ({
    user: {
      id: mockTenant.userId,
      tenantId: mockTenant.tenantId,
      globalRoles: [] as const,
      tenantRoles: ["clinic_admin"] as const,
      tenantStatus: "active" as const,
    },
    tenantOverride: null,
    sessionVersion: "smoke-test",
    hasPermission: () => true,
  });
  Object.assign(mod.useAuth, {
    getState: () => smokeState(),
  });
  return mod;
});
vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({ tenantId: mockTenant.tenantId, userId: mockTenant.userId }),
}));

import { adminRepository } from "@/services/admin/admin.repository";
import { appointmentRepository } from "@/services/appointments/appointment.repository";
import { appointmentQueueRepository } from "@/services/appointments/appointmentQueue.repository";
import { authRepository } from "@/services/auth/auth.repository";
import { clinicSlugRepository } from "@/services/auth/clinicSlug.repository";
import { billingRepository } from "@/services/billing/billing.repository";
import { doctorRepository } from "@/services/doctors/doctor.repository";
import { doctorScheduleRepository } from "@/services/doctors/doctorSchedule.repository";
import { featureFlagRepository } from "@/services/featureFlags/featureFlag.repository";
import { insuranceRepository } from "@/services/insurance/insurance.repository";
import { jobRepository } from "@/services/jobs/job.repository";
import { labRepository } from "@/services/laboratory/lab.repository";
import { notificationRepository } from "@/services/notifications/notification.repository";
import { clientErrorLogRepository } from "@/services/observability/clientErrorLog.repository";
import { medicalRecordsRepository } from "@/services/patients/medicalRecords.repository";
import { patientRepository } from "@/services/patients/patient.repository";
import { patientDocumentsRepository } from "@/services/patients/patientDocuments.repository";
import { patientDocumentsStorageRepository } from "@/services/patients/patientDocuments.storage.repository";
import { pharmacyRepository } from "@/services/pharmacy/pharmacy.repository";
import { procurementRepository } from "@/services/procurement/procurement.repository";
import { prescriptionRepository } from "@/services/prescriptions/prescription.repository";
import { realtimeRepository } from "@/services/realtime/realtime.repository";
import { reportRepository } from "@/services/reports/report.repository";
import { searchRepository } from "@/services/search/search.repository";
import { rateLimitRepository } from "@/services/security/rateLimit.repository";
import { auditLogRepository } from "@/services/settings/audit.repository";
import { notificationPreferencesRepository } from "@/services/settings/notification.repository";
import { profileRepository } from "@/services/settings/profile.repository";
import { profileStorageRepository } from "@/services/settings/profile.storage.repository";
import { securityRepository } from "@/services/settings/security.repository";
import { tenantRepository } from "@/services/settings/tenant.repository";
import { userInviteRepository } from "@/services/settings/userInvite.repository";
import { userPreferencesRepository } from "@/services/settings/userPreferences.repository";
import { settingsUsersRepository } from "@/services/settings/users.repository";
import { subscriptionRepository } from "@/services/subscription/subscription.repository";
import { STORAGE_SIGNED_URL_TTLS } from "@/services/storage/signedUrlPolicy";

const tenantId = mockTenant.tenantId;
const userId = mockTenant.userId;
const recordId = "00000000-0000-0000-0000-000000000333";

describe("repositories smoke", () => {
  beforeEach(() => {
    mockState.response = { data: [], error: null, count: 2 };
    mockState.responseSingle = { data: {}, error: null };
    mockState.responseRpc = { data: [], error: null };
    mockState.responseAuth = {
      data: {
        user: { id: userId, email: "user@example.com", created_at: "2026-03-01T00:00:00.000Z" },
        session: {
          user: { id: userId, email: "user@example.com", created_at: "2026-03-01T00:00:00.000Z" },
          expires_at: 1_800_000_000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      },
      error: null,
    };
    mockState.responseFunctions = { data: {}, error: null };
    mockState.responseStorage = { data: { signedUrl: "https://example.com/file" }, error: null };
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(["test"]),
    });
  });

  it("executes repository methods without throwing", async () => {
    await adminRepository.listTenantsPaged({ limit: 10, offset: 0, search: "clinic", plan: "pro" });
    await adminRepository.createTenant({
      name: "Clinic Demo",
      slug: "clinic-demo",
      email: "ops@example.com",
      phone: "+201000000000",
      address: "Main st",
      pending_owner_email: "owner@example.com",
    });
    await adminRepository.updateTenant(recordId, {
      name: "Clinic Demo Updated",
      slug: "clinic-demo-updated",
      email: "updated@example.com",
    });
    await adminRepository.updateTenantStatus(recordId, { status: "suspended", status_reason: "Compliance review" });
    await adminRepository.listProfilesWithRolesPaged({ limit: 10, offset: 0, search: "john" });
    await adminRepository.listSubscriptionsPaged({ limit: 10, offset: 0, search: "clinic", plan: "starter", status: "active" });
    await adminRepository.listPricingPlans();
    await adminRepository.createPricingPlan({
      plan_code: "pro",
      name: "Professional",
      description: "Advanced operations",
      doctor_limit_label: "Up to 20 doctors",
      features: ["Reports", "Insurance"],
      monthly_price: 799,
      annual_price: 7990,
      currency: "EGP",
      default_billing_cycle: "monthly",
      is_popular: true,
      is_public: true,
      is_enterprise_contact: false,
      display_order: 2,
    });
    await adminRepository.updatePricingPlan(recordId, { monthly_price: 899, annual_price: 8990 });
    await adminRepository.deletePricingPlan(recordId);
    await adminRepository.getSubscriptionStats();
    await adminRepository.getOperationsAlertSummary();
    await adminRepository.getRecentJobActivity();
    await adminRepository.getRecentActivity();
    await adminRepository.getRecentSystemErrors();
    await adminRepository.getClientErrorTrend();
    await adminRepository.getAuthMetricTrend();
    await adminRepository.updateSubscription(recordId, { plan: "pro" });
    await adminRepository.listTenantsPaged({ limit: 5, offset: 0 });
    await adminRepository.listTenantsPaged({ limit: 5, offset: 0, plan: "pro" });
    await adminRepository.listProfilesWithRolesPaged({ limit: 5, offset: 0 });
    await adminRepository.listSubscriptionsPaged({ limit: 5, offset: 0 });
    await adminRepository.listSubscriptionsPaged({ limit: 5, offset: 0, plan: "starter", status: "canceled" });

    await authRepository.signInWithPassword("user@example.com", "password");
    await authRepository.signOut();
    await authRepository.getSession();
    const unsubscribe = authRepository.onAuthStateChange(() => undefined);
    unsubscribe();
    await authRepository.resetPasswordForEmail("user@example.com", "http://localhost/reset");
    await authRepository.updatePassword("password123");
    await authRepository.getProfileByUserId(userId);
    await authRepository.getRolesByUserId(userId);
    await authRepository.registerClinic({ name: "Clinic" });

    await clinicSlugRepository.checkSlug({ clinicName: "My Clinic", customSlug: "my-clinic" });

    await appointmentRepository.listPaged({
      page: 1,
      pageSize: 10,
      search: "follow",
      filters: {
        status: "scheduled",
        doctor_id: recordId,
        patient_id: recordId,
        date_from: "2026-03-01T00:00:00Z",
        date_to: "2026-03-31T23:59:59Z",
      },
      sort: { column: "created_at", ascending: true },
    }, tenantId);
    await appointmentRepository.listPaged({ page: 1, pageSize: 5 }, tenantId);
    await appointmentRepository.listPaged({
      page: 1,
      pageSize: 5,
      sort: { column: "invalid" as any },
    } as any, tenantId);
    await appointmentRepository.listPagedWithRelations({
      page: 1,
      pageSize: 10,
      search: "doc",
      filters: { status: "scheduled" },
      sort: { column: "appointment_date", ascending: false },
    }, tenantId);
    await appointmentRepository.listPagedWithRelations({ page: 1, pageSize: 5 }, tenantId);
    await appointmentRepository.listByDateRange("2026-03-01T00:00:00Z", "2026-03-31T23:59:59Z", tenantId, { limit: 5, offset: 0 });
    await appointmentRepository.listByPatient(recordId, tenantId, { limit: 5, offset: 0 });
    await appointmentRepository.countByStatus(tenantId);
    await appointmentRepository.getById(recordId, tenantId);
    await appointmentRepository.hasConflict(recordId, "2026-03-14T10:00:00Z", tenantId, recordId);
    await appointmentRepository.hasConflict(recordId, "2026-03-14T10:00:00Z", tenantId);
    await appointmentRepository.create({
      patient_id: recordId,
      doctor_id: recordId,
      appointment_date: "2026-03-14T10:00:00Z",
      type: "checkup",
      status: "scheduled",
      duration_minutes: 30,
    }, tenantId);
    await appointmentRepository.create({
      patient_id: recordId,
      doctor_id: recordId,
      appointment_date: "2026-03-14T11:00:00Z",
      type: "follow_up",
      status: "scheduled",
      duration_minutes: 20,
      notes: "Follow-up note",
    }, tenantId);
    await appointmentRepository.create({
      patient_id: recordId,
      doctor_id: recordId,
      appointment_date: "2026-03-14T12:00:00Z",
      type: "checkup",
    }, tenantId);
    await appointmentRepository.update(recordId, {}, tenantId);
    await appointmentRepository.update(recordId, { status: "cancelled" }, tenantId);
    await appointmentRepository.update(recordId, {
      patient_id: recordId,
      doctor_id: recordId,
      appointment_date: "2026-03-14T13:00:00Z",
      duration_minutes: 25,
      type: "consultation",
      status: "completed",
      notes: "Updated",
    }, tenantId);
    await appointmentRepository.archive(recordId, tenantId, userId);
    await appointmentRepository.restore(recordId, tenantId);

    await appointmentQueueRepository.listByCheckInRange("2026-03-14T00:00:00Z", "2026-03-15T00:00:00Z", tenantId);
    await appointmentQueueRepository.getById(recordId, tenantId);
    await appointmentQueueRepository.getByAppointmentId(recordId, tenantId);
    await appointmentQueueRepository.create({ appointment_id: recordId, status: "waiting" }, tenantId);
    await appointmentQueueRepository.update(recordId, { status: "called", called_at: "2026-03-14T10:00:00.000Z" }, tenantId);
    await appointmentQueueRepository.commandLifecycle({
      operation: "call",
      queueId: recordId,
      tenantId,
      userId,
      expectedUpdatedAt: "2026-03-14T09:55:00.000Z",
      requestHash: "appointment-lifecycle-smoke",
      trace: {
        requestTraceId: "req-smoke",
        operationTraceId: "op-smoke",
        workflowTraceId: "wf-smoke",
      },
    });

    await billingRepository.listPaged({
      page: 1,
      pageSize: 10,
      search: "INV",
      filters: { status: "paid", patient_id: recordId },
      sort: { column: "invoice_date", ascending: true },
    }, tenantId);
    await billingRepository.listPaged({ page: 1, pageSize: 5 }, tenantId);
    await billingRepository.listPagedWithRelations({
      page: 1,
      pageSize: 10,
      search: "Service",
      filters: { status: "pending" },
    }, tenantId);
    await billingRepository.listPagedWithRelations({ page: 1, pageSize: 5 }, tenantId);
    await billingRepository.getSummary(tenantId);
    await billingRepository.countInRange("2026-03-01", "2026-04-01", tenantId);
    await billingRepository.listByDateRange("2026-03-01", "2026-04-01", tenantId, { limit: 5, offset: 0 });
    await billingRepository.listByPatient(recordId, tenantId, { limit: 5, offset: 0 });
    await billingRepository.create({
      patient_id: recordId,
      invoice_code: "INV-1",
      service: "Consult",
      amount: 100,
      status: "paid",
    }, tenantId);
    await billingRepository.create({
      patient_id: recordId,
      invoice_code: "INV-2",
      service: "Follow-up",
      amount: 150,
      status: "pending",
      invoice_date: "2026-03-15",
    }, tenantId);
    await billingRepository.create({
      patient_id: recordId,
      invoice_code: "INV-3",
      service: "Exam",
      amount: 200,
    }, tenantId);
    await billingRepository.update(recordId, {}, tenantId);
    await billingRepository.update(recordId, { status: "overdue" }, tenantId);
    await billingRepository.update(recordId, {
      patient_id: recordId,
      invoice_code: "INV-4",
      service: "Updated",
      amount: 250,
      invoice_date: "2026-03-16",
      status: "paid",
    }, tenantId);
    await billingRepository.archive(recordId, tenantId, userId);
    await billingRepository.restore(recordId, tenantId);

    await doctorRepository.listPaged({
      page: 1,
      pageSize: 10,
      search: "Dr",
      filters: { status: "available", specialty: "general" },
      sort: { column: "full_name", ascending: true },
    }, tenantId);
    await doctorRepository.listPaged({ page: 1, pageSize: 5 }, tenantId);
    await doctorRepository.create({ full_name: "Dr Test", specialty: "general", status: "available" }, tenantId);
    await doctorRepository.create({
      full_name: "Dr Optional",
      specialty: "surgery",
      phone: "123",
      email: "doc@example.com",
      rating: 4.5,
      status: "busy",
    }, tenantId);
    await doctorRepository.update(recordId, {}, tenantId);
    await doctorRepository.update(recordId, { status: "on_leave" }, tenantId);
    await doctorRepository.update(recordId, {
      full_name: "Dr Updated",
      specialty: "cardiology",
      phone: "555",
      email: "updated@example.com",
      rating: 4.7,
      status: "available",
    }, tenantId);
    await doctorRepository.archive(recordId, tenantId, userId);
    await doctorRepository.restore(recordId, tenantId);
    await doctorRepository.remove(recordId, tenantId, userId);

    await doctorScheduleRepository.listByDoctor(recordId, tenantId);
    await doctorScheduleRepository.upsertMany(recordId, [
      {
        day_of_week: 1,
        start_time: "09:00",
        end_time: "12:00",
        is_active: true,
      },
    ], tenantId);

    await featureFlagRepository.listByTenant(tenantId);
    await featureFlagRepository.get(tenantId, "lab_module");
    await featureFlagRepository.upsert(tenantId, {
      feature_key: "lab_module",
      enabled: true,
    });

    await insuranceRepository.listPaged({
      page: 1,
      pageSize: 10,
      search: "claim",
      filters: { status: "draft", patient_id: recordId },
      sort: { column: "claim_date", ascending: true } as any,
    }, tenantId);
    await insuranceRepository.listPaged({ page: 1, pageSize: 5 }, tenantId);
    await insuranceRepository.listPagedWithRelations({
      page: 1,
      pageSize: 10,
      search: "claim",
      filters: { status: "approved" },
    }, tenantId);
    await insuranceRepository.listPagedWithRelations({ page: 1, pageSize: 5 }, tenantId);
    await insuranceRepository.getSummary(tenantId);
    await insuranceRepository.create({
      patient_id: recordId,
      provider: "Provider",
      service: "Service",
      amount: 100,
      claim_date: "2026-03-10",
      status: "draft",
    }, tenantId);
    await insuranceRepository.create({
      patient_id: recordId,
      provider: "Provider Two",
      service: "Follow-up",
      amount: 120,
      claim_date: "2026-03-12",
      status: "approved",
    }, tenantId);
    await insuranceRepository.create({
      patient_id: recordId,
      provider: "Provider Three",
      service: "Exam",
      amount: 80,
    }, tenantId);
    await insuranceRepository.update(recordId, {}, tenantId);
    await insuranceRepository.update(recordId, { status: "approved" }, tenantId);
    await insuranceRepository.update(recordId, {
      patient_id: recordId,
      provider: "Updated Provider",
      service: "Updated Service",
      amount: 140,
      claim_date: "2026-03-18",
      status: "denied",
    }, tenantId);
    await insuranceRepository.archive(recordId, tenantId, userId);
    await insuranceRepository.restore(recordId, tenantId);

    await jobRepository.invoke("refresh-materialized-views", { tenantId });

    await labRepository.listPaged({
      page: 1,
      pageSize: 10,
      search: "lab",
      filters: { status: "pending", patient_id: recordId },
      sort: { column: "order_date", ascending: true } as any,
    }, tenantId);
    await labRepository.listPaged({ page: 1, pageSize: 5 }, tenantId);
    await labRepository.listPagedWithRelations({
      page: 1,
      pageSize: 10,
      search: "lab",
      filters: { status: "pending", patient_id: recordId, doctor_id: recordId },
      sort: { column: "order_date", ascending: true } as any,
    }, tenantId);
    await labRepository.listPagedWithRelations({ page: 1, pageSize: 5 }, tenantId);
    await labRepository.listByPatient(recordId, tenantId, { limit: 5, offset: 0 });
    await labRepository.countByStatus(tenantId);
    await labRepository.create({
      patient_id: recordId,
      doctor_id: recordId,
      order_date: "2026-03-10",
      test_name: "CBC",
      status: "pending",
    }, tenantId);
    await labRepository.create({
      patient_id: recordId,
      doctor_id: recordId,
      test_name: "BMP",
      order_date: "2026-03-11",
      status: "processing",
      result: "Pending",
    } as any, tenantId);
    await labRepository.create({
      patient_id: recordId,
      doctor_id: recordId,
      test_name: "XR",
    } as any, tenantId);
    await labRepository.update(recordId, {}, tenantId);
    await labRepository.update(recordId, { status: "completed" }, tenantId);
    await labRepository.update(recordId, {
      patient_id: recordId,
      doctor_id: recordId,
      test_name: "Updated",
      order_date: "2026-03-12",
      status: "completed",
      result: "Normal",
    } as any, tenantId);
    await labRepository.archive(recordId, tenantId, userId);
    await labRepository.restore(recordId, tenantId);

    await notificationRepository.listByUserPaged(tenantId, userId, 10, 0);
    await notificationRepository.markRead(recordId, tenantId, userId);
    await notificationRepository.markManyRead([recordId], tenantId, userId);
    await notificationRepository.create({
      tenant_id: tenantId,
      user_id: userId,
      title: "Hello",
      body: null,
      type: "system",
      read: false,
    });
    const channelCallsBeforeNotificationSubscribe = mockSupabase.channel.mock.calls.length;
    const notificationSub = notificationRepository.subscribeToUser(tenantId, userId, () => undefined);
    notificationSub.unsubscribe();
    expect(mockSupabase.channel.mock.calls.slice(channelCallsBeforeNotificationSubscribe)).not.toContainEqual([
      `user-notifications:${userId}`,
    ]);

    await clientErrorLogRepository.insert({
      tenant_id: tenantId,
      user_id: userId,
      message: "Error",
      request_id: null,
      action_type: null,
      resource_type: null,
      stack: null,
      component_stack: null,
      url: null,
      user_agent: null,
    });

    await medicalRecordsRepository.listByPatient(recordId, tenantId, { limit: 5, offset: 0 });

    await patientRepository.listPaged({
      page: 1,
      pageSize: 10,
      search: "Jane",
      filters: { status: "in_stock" },
      sort: { column: "full_name", ascending: true },
    }, tenantId);
    await patientRepository.listPaged({ page: 1, pageSize: 5 }, tenantId);
    await patientRepository.getById(recordId, tenantId);
    await patientRepository.create({ full_name: "Jane Doe", status: "active" }, tenantId);
    await patientRepository.create({
      full_name: "John Doe",
      date_of_birth: "1990-01-01",
      gender: "male",
      blood_type: "A+",
      phone: "555-1234",
      email: "john@example.com",
      address: "Street",
      insurance_provider: "InsureCo",
      status: "inactive",
    } as any, tenantId);
    await patientRepository.update(recordId, {}, tenantId);
    await patientRepository.update(recordId, { status: "inactive" }, tenantId);
    await patientRepository.update(recordId, {
      full_name: "Updated Name",
      date_of_birth: "1991-01-01",
      gender: "female",
      blood_type: "B+",
      phone: "555-5678",
      email: "updated@example.com",
      address: "New Street",
      insurance_provider: "NewInsurer",
      status: "active",
    } as any, tenantId);
    await patientRepository.archive(recordId, tenantId, userId);
    await patientRepository.restore(recordId, tenantId);
    await patientRepository.deleteBulk([], tenantId, userId);
    await patientRepository.deleteBulk([recordId], tenantId, userId);

    await patientDocumentsRepository.createMetadata({
      patient_id: recordId,
      file_path: `${tenantId}/patients/${recordId}/file.pdf`,
      file_name: "file.pdf",
      file_type: "application/pdf",
      file_size: 100,
      uploaded_by: userId,
    }, tenantId);
    await patientDocumentsRepository.listByPatient(recordId, tenantId, { limit: 5, offset: 0 });
    await patientDocumentsRepository.archive(recordId, tenantId, userId);
    await patientDocumentsRepository.restore(recordId, tenantId);

    const file = new File(["test"], "doc.pdf", { type: "application/pdf" });
    await patientDocumentsStorageRepository.upload(`${tenantId}/patients/${recordId}/doc.pdf`, file, "application/pdf");
    await patientDocumentsStorageRepository.download(`${tenantId}/patients/${recordId}/doc.pdf`);
    await patientDocumentsStorageRepository.remove(`${tenantId}/patients/${recordId}/doc.pdf`);

    await pharmacyRepository.listPaged({
      page: 1,
      pageSize: 10,
      search: "med",
      filters: { status: "in_stock" },
      sort: { column: "name", ascending: true } as any,
    }, tenantId);
    await pharmacyRepository.listPaged({ page: 1, pageSize: 5 }, tenantId);
    await pharmacyRepository.getSummary(tenantId);
    await pharmacyRepository.create({ name: "Test Med", stock: 10, status: "in_stock" }, tenantId);
    await pharmacyRepository.create({
      name: "Optional Med",
      category: "pain",
      stock: 5,
      unit: "mg",
      price: 10,
      status: "out_of_stock",
    }, tenantId);
    await pharmacyRepository.create({ name: "Minimal Med" }, tenantId);
    await pharmacyRepository.update(recordId, {}, tenantId);
    await pharmacyRepository.update(recordId, { status: "low_stock" }, tenantId);
    await pharmacyRepository.update(recordId, {
      name: "Updated Med",
      category: "antibiotic",
      stock: 20,
      unit: "ml",
      price: 25,
      status: "in_stock",
    }, tenantId);
    await pharmacyRepository.remove(recordId, tenantId);

    await procurementRepository.listSuppliers({
      page: 1,
      pageSize: 10,
      search: "supplier",
      filters: { status: "active" },
      sort: { column: "name", ascending: true } as any,
    }, tenantId);
    await procurementRepository.createSupplier({ name: "Supplier", email: "supplier@example.com" }, tenantId);
    await procurementRepository.updateSupplier(recordId, { phone: "+201111111111" }, tenantId);
    await procurementRepository.archiveSupplier(recordId, tenantId, userId);
    await procurementRepository.restoreSupplier(recordId, tenantId);
    await procurementRepository.listPurchaseOrders({
      page: 1,
      pageSize: 10,
      filters: { status: "submitted", supplier_id: recordId },
      sort: { column: "order_date", ascending: false } as any,
    }, tenantId);
    await procurementRepository.createPurchaseOrder({
      supplier_id: recordId,
      status: "submitted",
      items: [{ medication_id: recordId, quantity: 12, unit_cost: 7.5 }],
    }, tenantId);
    await procurementRepository.updatePurchaseOrder(recordId, { notes: "updated" }, tenantId);
    await procurementRepository.submitPurchaseOrder(recordId, tenantId);
    await procurementRepository.cancelPurchaseOrder(recordId, tenantId);
    await procurementRepository.receiveStock({
      purchase_order_id: recordId,
      purchase_order_item_id: recordId,
      quantity: 12,
      lot_number: "LOT-1",
      expiry_date: "2027-01-01",
      received_at: "2026-03-10T00:00:00.000Z",
      notes: "received",
    }, tenantId, userId);

    await prescriptionRepository.listPaged({
      page: 1,
      pageSize: 10,
      search: "rx",
      filters: { status: "active", patient_id: recordId, doctor_id: recordId },
      sort: { column: "prescribed_date", ascending: true } as any,
    }, tenantId);
    await prescriptionRepository.listPaged({ page: 1, pageSize: 5 }, tenantId);
    await prescriptionRepository.listByPatient(recordId, tenantId, { limit: 5, offset: 0 });
    await prescriptionRepository.create({
      patient_id: recordId,
      doctor_id: recordId,
      prescribed_date: "2026-03-10",
      medication: "Test",
      dosage: "500 mg",
      route: "Oral",
      frequency: "Daily",
      quantity: 30,
      status: "active",
    }, tenantId);
    await prescriptionRepository.create({
      patient_id: recordId,
      doctor_id: recordId,
      medication: "Optional",
      dosage: "250 mg",
      route: "Oral",
      frequency: "Twice daily",
      quantity: 14,
      status: "completed",
      prescribed_date: "2026-03-11",
    }, tenantId);
    await prescriptionRepository.create({
      patient_id: recordId,
      doctor_id: recordId,
      medication: "Minimal",
      dosage: "5 mg",
      route: "Oral",
      frequency: "Nightly",
      quantity: 7,
    }, tenantId);
    await prescriptionRepository.update(recordId, {}, tenantId);
    await prescriptionRepository.update(recordId, { status: "completed" }, tenantId);
    await prescriptionRepository.update(recordId, {
      patient_id: recordId,
      doctor_id: recordId,
      medication: "Updated",
      dosage: "3x",
      status: "completed",
      prescribed_date: "2026-03-12",
    }, tenantId);
    await prescriptionRepository.archive(recordId, tenantId, userId);
    await prescriptionRepository.restore(recordId, tenantId);

    const sub = realtimeRepository.subscribeToTenantTables(
      { tenantId, sessionVersion: "test-sv", userId },
      ["patients", "appointments"],
      () => undefined,
    );
    sub.unsubscribe();

    await reportRepository.assertAccess(tenantId);
    await reportRepository.getRefreshStatus(tenantId);
    await reportRepository.getOverview(tenantId);
    await reportRepository.getRevenueByMonth(tenantId, 6);
    await reportRepository.getPatientGrowth(tenantId, 6);
    await reportRepository.getAppointmentTypes(tenantId);
    await reportRepository.getAppointmentStatuses(tenantId);
    await reportRepository.getRevenueByService(tenantId, 5);
    await reportRepository.getDoctorPerformance(tenantId);

    await searchRepository.searchGlobal(tenantId, "term", 10);

    await rateLimitRepository.check("login:user@example.com", 5, 60);

    await auditLogRepository.listPaged(tenantId, 10, 0);
    await auditLogRepository.logEvent({
      tenant_id: tenantId,
      user_id: userId,
      action: "test",
      action_type: "test",
      entity_type: "test",
      entity_id: recordId,
      request_id: null,
      resource_type: null,
      details: {},
    });

    await notificationPreferencesRepository.getByUserId(userId, tenantId);
    await notificationPreferencesRepository.upsert(userId, tenantId, {
      appointment_reminders: true,
      lab_results_ready: true,
      billing_alerts: true,
      system_updates: false,
    });

    await profileRepository.updateByUserId(userId, tenantId, { full_name: "Test User" });

    const avatarFile = new File(["avatar"], "avatar.png", { type: "image/png" });
    await profileStorageRepository.upload(`${userId}/avatar.png`, avatarFile);
    await profileStorageRepository.createSignedUrl(`${userId}/avatar.png`, STORAGE_SIGNED_URL_TTLS.AVATAR);
    await profileStorageRepository.remove([`${userId}/avatar.png`]);

    await securityRepository.updatePassword("password123");

    await tenantRepository.getById(tenantId);
    await tenantRepository.update(tenantId, { name: "Clinic" });

    await userInviteRepository.inviteStaff({ email: "new@example.com", full_name: "Nurse", role: "nurse" });

    await userPreferencesRepository.getByUserId(userId);
    await userPreferencesRepository.upsert({ user_id: userId, dark_mode: false });

    await settingsUsersRepository.listProfilesWithRolesPaged(tenantId, { limit: 10, offset: 0, search: "john" });

    await subscriptionRepository.getByTenant(tenantId);

    expect(mockSupabase.from).toHaveBeenCalled();
  });

  it("covers admin role mapping branch", async () => {
    mockState.response = {
      data: [{ id: recordId, user_id: userId, role: "nurse" }],
      error: null,
      count: 1,
    };

    await adminRepository.listProfilesWithRolesPaged({ limit: 5, offset: 0, search: "Nurse" });
  });

  it("throws on repository errors", async () => {
    const error = { message: "boom", code: "ERR" };
    mockState.response = { data: null, error };
    mockState.responseSingle = { data: null, error };
    mockState.responseRpc = { data: null, error };

    await expect(appointmentRepository.listPaged({ page: 1, pageSize: 5 }, tenantId)).rejects.toThrow("boom");
    await expect(appointmentRepository.listByDateRange("2026-03-01", "2026-03-02", tenantId)).rejects.toThrow("boom");
    await expect(appointmentRepository.getById(recordId, tenantId)).rejects.toThrow("boom");

    await expect(billingRepository.listPaged({ page: 1, pageSize: 5 }, tenantId)).rejects.toThrow("boom");
    await expect(billingRepository.getSummary(tenantId)).rejects.toThrow("boom");

    await expect(insuranceRepository.listPaged({ page: 1, pageSize: 5 }, tenantId)).rejects.toThrow("boom");
    await expect(insuranceRepository.getSummary(tenantId)).rejects.toThrow("boom");

    await expect(labRepository.listPaged({ page: 1, pageSize: 5 }, tenantId)).rejects.toThrow("boom");

    await expect(patientRepository.listPaged({ page: 1, pageSize: 5 }, tenantId)).rejects.toThrow("boom");

    await expect(doctorRepository.listPaged({ page: 1, pageSize: 5 }, tenantId)).rejects.toThrow("boom");

    await expect(pharmacyRepository.listPaged({ page: 1, pageSize: 5 }, tenantId)).rejects.toThrow("boom");
    await expect(pharmacyRepository.getSummary(tenantId)).rejects.toThrow("boom");

    await expect(prescriptionRepository.listPaged({ page: 1, pageSize: 5 }, tenantId)).rejects.toThrow("boom");

    await expect(reportRepository.getOverview(tenantId)).rejects.toThrow("boom");
    await expect(rateLimitRepository.check("login:user@example.com", 5, 60)).rejects.toThrow("boom");
    await expect(adminRepository.getSubscriptionStats()).rejects.toThrow("boom");
  });
});
