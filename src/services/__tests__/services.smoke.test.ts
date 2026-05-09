import { beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date().toISOString();
const tenantId = "00000000-0000-0000-0000-000000000111";
const userId = "00000000-0000-0000-0000-000000000222";
const recordId = "00000000-0000-0000-0000-000000000333";

const adminRepository = vi.hoisted(() => ({
  listTenantsPaged: vi.fn(),
  createTenant: vi.fn(),
  updateTenant: vi.fn(),
  updateTenantStatus: vi.fn(),
  listProfilesWithRolesPaged: vi.fn(),
  listSubscriptionsPaged: vi.fn(),
  listPricingPlans: vi.fn(),
  createPricingPlan: vi.fn(),
  updatePricingPlan: vi.fn(),
  deletePricingPlan: vi.fn(),
  getSubscriptionStats: vi.fn(),
  getOperationsAlertSummary: vi.fn(),
  getRecentJobActivity: vi.fn(),
  getRecentActivity: vi.fn(),
  getRecentSystemErrors: vi.fn(),
  getClientErrorTrend: vi.fn(),
  getAuthMetricTrend: vi.fn(),
  updateSubscription: vi.fn(),
  getTenantUsage: vi.fn(),
  retryJobs: vi.fn(),
}));

const clinicSlugRepository = vi.hoisted(() => ({ checkSlug: vi.fn() }));
const notificationRepository = vi.hoisted(() => ({
  listByUserPaged: vi.fn(),
  markRead: vi.fn(),
  markManyRead: vi.fn(),
  create: vi.fn(),
  subscribeToUser: vi.fn(),
}));
const medicalRecordsRepository = vi.hoisted(() => ({
  listByPatient: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
const tenantRepository = vi.hoisted(() => ({ getById: vi.fn(), update: vi.fn() }));
const profileRepository = vi.hoisted(() => ({ updateByUserId: vi.fn() }));
const notificationPreferencesRepository = vi.hoisted(() => ({ getByUserId: vi.fn(), upsert: vi.fn() }));
const auditLogRepository = vi.hoisted(() => ({ listPaged: vi.fn(), logEvent: vi.fn() }));
const securityRepository = vi.hoisted(() => ({ updatePassword: vi.fn() }));
const userInviteRepository = vi.hoisted(() => ({ inviteStaff: vi.fn() }));
const userPreferencesRepository = vi.hoisted(() => ({ getByUserId: vi.fn(), upsert: vi.fn() }));
const settingsUsersRepository = vi.hoisted(() => ({ listProfilesWithRolesPaged: vi.fn() }));
const subscriptionRepository = vi.hoisted(() => ({ getByTenant: vi.fn() }));
const clientErrorLogRepository = vi.hoisted(() => ({ insert: vi.fn() }));
const realtimeRepository = vi.hoisted(() => ({ subscribeToTenantTables: vi.fn() }));
const jobRepository = vi.hoisted(() => ({ invoke: vi.fn(), enqueue: vi.fn() }));
const privilegedAccessService = vi.hoisted(() => ({ assertAction: vi.fn() }));

vi.mock("@/core/env/env", () => ({
  env: {
    VITE_SUPABASE_URL: "http://localhost",
    VITE_SUPABASE_PUBLISHABLE_KEY: "key",
    VITE_SUPABASE_PROJECT_ID: "",
    VITE_CAPTCHA_SITE_KEY: "",
    VITE_SENTRY_DSN: "",
    VITE_APP_VERSION: "",
  },
}));

vi.mock("@/core/auth/authStore", () => ({
  useAuth: {
    getState: () => ({
      hasPermission: () => true,
      sessionVersion: "smoke-test",
      tenantOverride: { id: tenantId, slug: "smoke", name: "Smoke clinic" },
      user: {
        id: userId,
        globalRoles: ["super_admin"],
        tenantRoles: [],
        tenantId: null,
        tenantStatus: "active",
      },
      privilegedAuth: {
        currentLevel: null,
        nextLevel: null,
        verifiedFactorCount: 0,
        unverifiedFactorCount: 0,
        loadedAt: new Date().toISOString(),
      },
      lastVerifiedAt: new Date().toISOString(),
    }),
  },
  selectEffectiveTenantId: (s: { tenantOverride?: { id: string } | null; user?: { tenantId?: string | null } }) =>
    s.tenantOverride?.id ?? s.user?.tenantId ?? null,
}));

vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({ tenantId, userId }),
}));

vi.mock("@/core/events", () => ({ emitDomainEvent: vi.fn() }));

vi.mock("@/services/admin/admin.repository", () => ({ adminRepository }));
vi.mock("@/services/auth/clinicSlug.repository", () => ({ clinicSlugRepository }));
vi.mock("@/services/notifications/notification.repository", () => ({ notificationRepository }));
vi.mock("@/services/patients/medicalRecords.repository", () => ({ medicalRecordsRepository }));
vi.mock("@/services/settings/tenant.repository", () => ({ tenantRepository }));
vi.mock("@/services/settings/profile.repository", () => ({ profileRepository }));
vi.mock("@/services/settings/notification.repository", () => ({ notificationPreferencesRepository }));
vi.mock("@/services/settings/audit.repository", () => ({ auditLogRepository }));
vi.mock("@/services/settings/security.repository", () => ({ securityRepository }));
vi.mock("@/services/settings/userInvite.repository", () => ({ userInviteRepository }));
vi.mock("@/services/settings/userPreferences.repository", () => ({ userPreferencesRepository }));
vi.mock("@/services/settings/users.repository", () => ({ settingsUsersRepository }));
vi.mock("@/services/subscription/subscription.repository", () => ({ subscriptionRepository }));
vi.mock("@/services/observability/clientErrorLog.repository", () => ({ clientErrorLogRepository }));
vi.mock("@/services/realtime/realtime.repository", () => ({ realtimeRepository }));
vi.mock("@/services/jobs/job.repository", () => ({ jobRepository }));
vi.mock("@/services/admin/adminSecurity.service", () => ({
  adminSecurityService: {
    assertAccess: vi.fn(async () => ({ stepUpGrantId: null })),
  },
}));
vi.mock("@/services/auth/privilegedAccess.service", () => ({ privilegedAccessService }));

import { adminService } from "@/services/admin/admin.service";
import { clinicSlugService } from "@/services/auth/clinicSlug.service";
import { notificationService } from "@/services/notifications/notification.service";
import { medicalRecordsService } from "@/services/patients/medicalRecords.service";
import { tenantService } from "@/services/settings/tenant.service";
import { profileService } from "@/services/settings/profile.service";
import { notificationPreferencesService } from "@/services/settings/notification.service";
import { auditLogService } from "@/services/settings/audit.service";
import { securityService } from "@/services/settings/security.service";
import { userInviteService } from "@/services/settings/userInvite.service";
import { userPreferencesService } from "@/services/settings/userPreferences.service";
import { settingsUsersService } from "@/services/settings/users.service";
import { subscriptionService } from "@/services/subscription/subscription.service";
import { clientErrorLogService } from "@/services/observability/clientErrorLog.service";
import { realtimeService } from "@/services/realtime/realtime.service";
import { jobService } from "@/services/jobs/job.service";
import { queryKeys } from "@/services/queryKeys";
import * as servicesIndex from "@/services";

describe("services smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    privilegedAccessService.assertAction.mockResolvedValue({ stepUpGrantId: null });
    adminRepository.listTenantsPaged.mockResolvedValue({ data: [], count: 0 });
    adminRepository.createTenant.mockResolvedValue({
      id: recordId,
      name: "Clinic Demo",
      slug: "clinic-demo",
      email: "ops@example.com",
      phone: null,
      address: null,
      pending_owner_email: "owner@example.com",
      created_at: now,
      tenant_status: "active",
      status_reason: null,
      status_changed_at: now,
      plan: "free",
      status: "active",
    });
    adminRepository.updateTenant.mockResolvedValue({
      id: recordId,
      name: "Clinic Demo Updated",
      slug: "clinic-demo",
      email: "ops@example.com",
      phone: null,
      address: "Main st",
      pending_owner_email: "owner@example.com",
      created_at: now,
      tenant_status: "active",
      status_reason: null,
      status_changed_at: now,
      plan: "free",
      status: "active",
    });
    adminRepository.updateTenantStatus.mockResolvedValue({
      id: recordId,
      name: "Clinic Demo Updated",
      slug: "clinic-demo",
      email: "ops@example.com",
      phone: null,
      address: "Main st",
      pending_owner_email: "owner@example.com",
      created_at: now,
      tenant_status: "suspended",
      status_reason: "Compliance review",
      status_changed_at: now,
      plan: "free",
      status: "active",
    });
    adminRepository.listProfilesWithRolesPaged.mockResolvedValue({ data: [], count: 0 });
    adminRepository.listSubscriptionsPaged.mockResolvedValue({ data: [], count: 0 });
    adminRepository.listPricingPlans.mockResolvedValue([]);
    adminRepository.createPricingPlan.mockResolvedValue({});
    adminRepository.updatePricingPlan.mockResolvedValue({});
    adminRepository.deletePricingPlan.mockResolvedValue(undefined);
    adminRepository.getSubscriptionStats.mockResolvedValue({
      active_count: 0,
      total_revenue: 0,
      plan_counts: { free: 0, starter: 0, pro: 0, enterprise: 0 },
    });
    adminRepository.getOperationsAlertSummary.mockResolvedValue({
      pending_jobs_count: 0,
      processing_jobs_count: 0,
      retrying_jobs_count: 0,
      dead_letter_jobs_count: 0,
      stale_processing_jobs_count: 0,
      recent_job_failures_count: 0,
      recent_edge_failures_count: 0,
      recent_client_errors_count: 0,
      last_job_failure_at: null,
      last_edge_failure_at: null,
      last_client_error_at: null,
    });
    adminRepository.getRecentJobActivity.mockResolvedValue([]);
    adminRepository.getRecentActivity.mockResolvedValue([]);
    adminRepository.getRecentSystemErrors.mockResolvedValue([]);
    adminRepository.getClientErrorTrend.mockResolvedValue([]);
    adminRepository.getAuthMetricTrend.mockResolvedValue([]);
    adminRepository.updateSubscription.mockResolvedValue({
      id: recordId,
      tenant_id: tenantId,
      plan: "pro",
      status: "active",
      amount: 0,
      currency: "USD",
      billing_cycle: "monthly",
      expires_at: null,
      created_at: now,
      tenants: { name: "Clinic", slug: "clinic" },
    });
    adminRepository.getTenantUsage.mockResolvedValue({
      tenant_id: tenantId,
      patients_count: 0,
      staff_count: 0,
      storage_bytes: 0,
      api_requests_30d: 0,
      jobs_pending_count: 0,
      jobs_failed_count: 0,
    });
    adminRepository.retryJobs.mockResolvedValue([]);
    clinicSlugRepository.checkSlug.mockResolvedValue({ available: true, slug: "clinic", suggestions: [] });
    notificationRepository.listByUserPaged.mockResolvedValue({ data: [], count: 0 });
    notificationRepository.markRead.mockResolvedValue(undefined);
    notificationRepository.markManyRead.mockResolvedValue(undefined);
    notificationRepository.create.mockResolvedValue({
      id: recordId,
      tenant_id: tenantId,
      user_id: userId,
      title: "Hello",
      body: null,
      type: "system",
      read: false,
      created_at: now,
    });
    notificationRepository.subscribeToUser.mockReturnValue({ unsubscribe: vi.fn() });
    medicalRecordsRepository.listByPatient.mockResolvedValue([]);
    medicalRecordsRepository.create.mockResolvedValue({
      id: recordId,
      tenant_id: tenantId,
      patient_id: recordId,
      doctor_id: recordId,
      record_date: "2026-03-14",
      diagnosis: null,
      notes: null,
      record_type: "progress_note",
      created_at: now,
      doctors: { full_name: "Dr Test" },
    });
    medicalRecordsRepository.update.mockResolvedValue({
      id: recordId,
      tenant_id: tenantId,
      patient_id: recordId,
      doctor_id: recordId,
      record_date: "2026-03-14",
      diagnosis: "Updated",
      notes: "Note",
      record_type: "progress_note",
      created_at: now,
      doctors: { full_name: "Dr Test" },
    });
    medicalRecordsRepository.remove.mockResolvedValue({
      id: recordId,
      tenant_id: tenantId,
      patient_id: recordId,
      doctor_id: recordId,
      record_date: "2026-03-14",
      diagnosis: null,
      notes: null,
      record_type: "progress_note",
      created_at: now,
    });
    tenantRepository.getById.mockResolvedValue({
      id: tenantId,
      slug: "clinic",
      name: "Clinic",
      phone: null,
      email: "clinic@example.com",
      address: "Street 1",
      logo_url: null,
      pending_owner_email: null,
      status: "active",
      status_reason: null,
      status_changed_at: now,
      created_at: now,
      updated_at: now,
    });
    tenantRepository.update.mockResolvedValue({
      id: tenantId,
      slug: "clinic",
      name: "Clinic Updated",
      phone: null,
      email: "clinic@example.com",
      address: "Street 1",
      logo_url: null,
      pending_owner_email: null,
      status: "active",
      status_reason: null,
      status_changed_at: now,
      created_at: now,
      updated_at: now,
    });
    profileRepository.updateByUserId.mockResolvedValue({
      id: recordId,
      user_id: userId,
      tenant_id: tenantId,
      full_name: "Test User",
      avatar_url: null,
      created_at: now,
      updated_at: now,
    });
    notificationPreferencesRepository.getByUserId.mockResolvedValue(null);
    notificationPreferencesRepository.upsert.mockResolvedValue({
      id: recordId,
      user_id: userId,
      tenant_id: tenantId,
      appointment_reminders: true,
      lab_results_ready: true,
      billing_alerts: true,
      system_updates: false,
      created_at: now,
      updated_at: now,
    });
    auditLogRepository.listPaged.mockResolvedValue({ data: [], count: 0 });
    auditLogRepository.logEvent.mockResolvedValue(undefined);
    securityRepository.updatePassword.mockResolvedValue(undefined);
    userInviteRepository.inviteStaff.mockResolvedValue(undefined);
    userPreferencesRepository.getByUserId.mockResolvedValue({
      id: recordId,
      user_id: userId,
      dark_mode: false,
      created_at: now,
      updated_at: now,
    });
    userPreferencesRepository.upsert.mockResolvedValue({
      id: recordId,
      user_id: userId,
      dark_mode: true,
      created_at: now,
      updated_at: now,
    });
    settingsUsersRepository.listProfilesWithRolesPaged.mockResolvedValue({ data: [], count: 0 });
    subscriptionRepository.getByTenant.mockResolvedValue({
      id: recordId,
      tenant_id: tenantId,
      plan: "pro",
      status: "active",
      amount: 0,
      currency: "USD",
      billing_cycle: "monthly",
      started_at: now,
      expires_at: null,
    });
    clientErrorLogRepository.insert.mockResolvedValue(undefined);
    realtimeRepository.subscribeToTenantTables.mockReturnValue({ unsubscribe: vi.fn() });
    jobRepository.invoke.mockResolvedValue(undefined);
    jobRepository.enqueue.mockResolvedValue(undefined);
  });

  it("executes key service flows", async () => {
    await adminService.listTenantsPaged({ page: 1, pageSize: 10, search: "clinic", plan: "pro" });
    await adminService.createTenant({ name: "Clinic Demo", slug: "clinic-demo", pending_owner_email: "owner@example.com" });
    await adminService.updateTenant(recordId, { address: "Main st" });
    await adminService.updateTenantStatus(recordId, { status: "suspended", status_reason: "Compliance review" });
    await adminService.listProfilesWithRolesPaged({ page: 1, pageSize: 10, search: "john" });
    await adminService.listSubscriptionsPaged({ page: 1, pageSize: 10, search: "clinic", plan: "pro", status: "active" });
    await adminService.listPricingPlans();
    await adminService.getSubscriptionStats();
    await adminService.getOperationsAlerts();
    await adminService.getOperationsDashboard();
    await adminService.updateSubscription(recordId, { plan: "pro" });

    await clinicSlugService.checkSlug({ clinicName: "Clinic", customSlug: "clinic" });

    await notificationService.listRecent(userId);
    await notificationService.listPaged(userId, { page: 1, pageSize: 10 });
    await notificationService.markRead(userId, recordId);
    await notificationService.markAllRead(userId, [recordId]);
    await notificationService.create({
      tenant_id: tenantId,
      user_id: userId,
      title: "Hello",
      body: null,
      type: "system",
      read: false,
    });
    const notifSub = notificationService.subscribe(userId, () => undefined);
    notifSub.unsubscribe();

    await medicalRecordsService.listByPatient(recordId, { limit: 10, offset: 0 });
    await medicalRecordsService.create({
      patient_id: recordId,
      doctor_id: recordId,
      record_type: "progress_note",
      record_date: "2026-03-14",
    });
    await medicalRecordsService.update(recordId, { notes: "Note" });
    await medicalRecordsService.remove(recordId);

    await tenantService.getCurrentTenant();
    await tenantService.updateCurrentTenant({ name: "Clinic Updated" });

    await profileService.updateProfile(userId, { full_name: "Test User" });

    const prefs = await notificationPreferencesService.getCurrentUserPreferences(userId);
    expect(prefs).toBeDefined();
    await notificationPreferencesService.saveCurrentUserPreferences(userId, { appointment_reminders: true });

    await auditLogService.listPaged({ page: 1, pageSize: 10 });
    await auditLogService.logEvent({
      tenant_id: tenantId,
      user_id: userId,
      action: "test",
      entity_type: "test",
    });

    await securityService.updatePassword("password123");
    await userInviteService.inviteStaff({ email: "new@example.com", full_name: "Nurse One", role: "nurse" });

    await userPreferencesService.getByUserId(userId);
    await userPreferencesService.upsert({ user_id: userId, dark_mode: true });
    await userPreferencesService.setDarkMode(userId, false);

    await settingsUsersService.listProfilesWithRolesPaged({ page: 1, pageSize: 10, search: "john" });

    await subscriptionService.getByTenant(tenantId);

    await clientErrorLogService.log({
      tenant_id: tenantId,
      user_id: userId,
      message: "Error",
      request_id: null,
      action_type: null,
      resource_type: null,
    });

    const sub = realtimeService.subscribeToTenantTables(
      { tenantId, sessionVersion: "test-sv", userId },
      ["patients"],
      () => undefined,
    );
    sub.unsubscribe();

    await jobService.invoke("refresh-materialized-views", { tenantId });

    const patientRoot = queryKeys.patients.root(tenantId);
    expect(patientRoot[0]).toBe("patients");
    expect(patientRoot[1]).toBe("rt");
    expect(typeof patientRoot[2]).toBe("number");
    expect(patientRoot[3]).toBe(tenantId);
    expect(queryKeys.admin.operationsAlerts()).toEqual(["admin", "operationsAlerts"]);
    expect(queryKeys.admin.operationsDashboard()).toEqual(["admin", "operationsDashboard", "all"]);
    expect(queryKeys.admin.pricingPlans()).toEqual(["admin", "pricingPlans"]);
    expect(servicesIndex.authService).toBeDefined();
  });
});
