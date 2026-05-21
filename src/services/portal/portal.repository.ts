import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

const ACCOUNT_COLUMNS = "id, tenant_id, patient_id, status, auth_user_id, patients(full_name), tenants:tenant_id(name, slug, status, status_reason)";

export const portalRepository = {
  async getLoginMetadata(clinicSlug: string, email: string) {
    const { data, error } = await supabase.rpc("get_portal_login_metadata", {
      _slug: clinicSlug,
      _email: email,
    });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load portal login metadata", {
        code: error.code,
        details: error,
      });
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row ?? null;
  },
  async sendMagicLink(email: string, redirectTo: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to send magic link", {
        code: error.code,
        details: error,
      });
    }
  },
  async getAccountByAuthUserId(userId: string) {
    const { data, error } = await supabase
      .from("patient_accounts")
      .select(ACCOUNT_COLUMNS)
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load portal account", {
        code: error.code,
        details: error,
      });
    }
    return data;
  },
  async listAppointments(patientId: string) {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, appointment_date, status, type, doctors(full_name)")
      .eq("patient_id", patientId)
      .order("appointment_date", { ascending: false });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load appointments", { code: error.code, details: error });
    }
    return data ?? [];
  },
  async listPrescriptions(patientId: string) {
    const { data, error } = await supabase
      .from("prescriptions")
      .select("id, medication, dosage, route, frequency, quantity, refills, status, prescribed_date, created_at")
      .eq("patient_id", patientId)
      .order("prescribed_date", { ascending: false });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load prescriptions", { code: error.code, details: error });
    }
    return data ?? [];
  },
  async listLabOrders(patientId: string) {
    const { data, error } = await supabase
      .from("lab_orders")
      .select("id, test_name, status, result, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load lab results", { code: error.code, details: error });
    }
    return data ?? [];
  },
  async listDocuments(patientId: string) {
    const { data, error } = await supabase
      .from("patient_documents")
      .select("id, file_name, file_type, file_size, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load documents", { code: error.code, details: error });
    }
    return data ?? [];
  },
  async listInvoices(patientId: string) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_code, service, amount, amount_paid, balance_due, due_date, paid_at, voided_at, void_reason, status, invoice_date")
      .eq("patient_id", patientId)
      .order("invoice_date", { ascending: false });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load invoices", { code: error.code, details: error });
    }
    return data ?? [];
  },
  describe() {
    return {
      certified: false,
      tenantBound: false,
      traceAware: false,
      runtimeAware: false,
      capabilityAware: false,
      reconciliationAware: false,
      recoveryAware: false,
      evidenceAware: false,
      retryAware: false,
      staleContextSafe: false,
      metricsEnabled: false,
      requiredCapabilities: [],
      exceptions: [
        "Portal repository still uses direct Supabase auth and patient-scoped reads pending portal convergence.",
      ],
    };
  },
};
