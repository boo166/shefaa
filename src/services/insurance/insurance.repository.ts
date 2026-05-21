import type {
  InsuranceClaim,
  InsuranceClaimCreateInput,
  InsuranceAssignableOwner,
  InsuranceClaimListParams,
  InsuranceClaimUpdateInput,
  InsuranceClaimWithPatient,
  InsuranceOperationsSummary,
  InsuranceSummary,
} from "@/domain/insurance/insurance.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const CLAIM_COLUMNS =
  "id, tenant_id, patient_id, provider, service, amount, claim_date, status, submitted_at, processing_started_at, approved_at, reimbursed_at, payer_reference, denial_reason, assigned_to_user_id, internal_notes, payer_notes, last_follow_up_at, next_follow_up_at, resubmission_count, deleted_at, deleted_by, created_at, updated_at";
const CLAIM_WITH_PATIENT_COLUMNS = `${CLAIM_COLUMNS}, patients(full_name), assigned_profile:profiles!insurance_claims_assigned_to_user_id_fkey(full_name)`;

const SEARCH_COLUMNS = ["provider", "service", "status", "denial_reason", "payer_notes", "internal_notes"];
const SEARCH_COLUMNS_WITH_RELATIONS = [...SEARCH_COLUMNS, "patients.full_name"];
const SORTABLE_COLUMNS = new Set([
  "claim_date",
  "created_at",
  "updated_at",
  "status",
  "submitted_at",
  "processing_started_at",
  "next_follow_up_at",
  "last_follow_up_at",
]);

const OPEN_CLAIM_STATUSES = ["submitted", "processing", "approved"];

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

function applyQueueFilter(query: any, queue: unknown) {
  const nowIso = new Date().toISOString();
  const agedOpenCutoffDate = new Date(Date.now() - (15 * 86400000)).toISOString().slice(0, 10);
  const stalledProcessingCutoffIso = new Date(Date.now() - (7 * 86400000)).toISOString();

  if (queue === "denied_follow_up") {
    return query.eq("status", "denied");
  }

  if (queue === "aged_open") {
    return query
      .in("status", OPEN_CLAIM_STATUSES)
      .or(`submitted_at.lte.${agedOpenCutoffDate},and(submitted_at.is.null,claim_date.lte.${agedOpenCutoffDate})`);
  }

  if (queue === "stalled_processing") {
    return query
      .eq("status", "processing")
      .not("processing_started_at", "is", null)
      .lte("processing_started_at", stalledProcessingCutoffIso);
  }

  if (queue === "follow_up_due") {
    return query
      .neq("status", "reimbursed")
      .not("next_follow_up_at", "is", null)
      .lte("next_follow_up_at", nowIso);
  }

  if (queue === "unassigned_open") {
    return query
      .in("status", OPEN_CLAIM_STATUSES)
      .is("assigned_to_user_id", null);
  }

  return query;
}

export interface InsuranceRepository {
  listPaged(params: InsuranceClaimListParams, tenantId: string): Promise<PagedResult<InsuranceClaim>>;
  listPagedWithRelations(params: InsuranceClaimListParams, tenantId: string): Promise<PagedResult<InsuranceClaimWithPatient>>;
  getSummary(tenantId: string): Promise<InsuranceSummary>;
  getOperationsSummary(tenantId: string): Promise<InsuranceOperationsSummary>;
  listAssignableOwners(tenantId: string): Promise<InsuranceAssignableOwner[]>;
  isAssignableOwner(userId: string, tenantId: string): Promise<boolean>;
  getById(id: string, tenantId: string): Promise<InsuranceClaim>;
  create(input: InsuranceClaimCreateInput, tenantId: string): Promise<InsuranceClaim>;
  update(id: string, input: InsuranceClaimUpdateInput, tenantId: string, expectedUpdatedAt?: string): Promise<InsuranceClaim | null>;
  transitionStatus(
    id: string,
    input: InsuranceClaimUpdateInput,
    tenantId: string,
    userId: string | null,
    expectedUpdatedAt?: string,
    trace?: PlatformRepositoryContext["trace"],
  ): Promise<InsuranceClaim | null>;
  archive(id: string, tenantId: string, userId: string): Promise<InsuranceClaim>;
  restore(id: string, tenantId: string): Promise<InsuranceClaim>;
  describe?(): {
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
}

function insuranceCtx(
  tenantId: string,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "tenant-critical",
  trace?: PlatformRepositoryContext["trace"],
): PlatformRepositoryContext {
  return {
    action,
    classification,
    tenantScoped: true,
    tenantId,
    requiredCapabilities: [Capabilities.billing.manage],
    trace,
  };
}

export const insuranceRepository: InsuranceRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = platformRepository
      .from("insurance_claims", insuranceCtx(tenantId, "insurance.listPaged", "readonly"))
      .select(CLAIM_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.patient_id === "string" && filters.patient_id.length > 0) {
      query = query.eq("patient_id", filters.patient_id);
    }
    if (typeof filters.assigned_to_user_id === "string" && filters.assigned_to_user_id.length > 0) {
      query = query.eq("assigned_to_user_id", filters.assigned_to_user_id);
    }
    query = applyQueueFilter(query, filters.queue);

    if (searchTerm) {
      const escaped = escapeSearchTerm(searchTerm);
      const orFilter = SEARCH_COLUMNS
        .map((col) => `${col}.ilike.%${escaped}%`)
        .join(",");
      query = query.or(orFilter);
    }

    const sortColumn = params.sort?.column && SORTABLE_COLUMNS.has(params.sort.column)
      ? params.sort.column
      : "claim_date";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load insurance claims", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as InsuranceClaim[], count: count ?? 0 };
  },
  async listPagedWithRelations(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = platformRepository
      .from("insurance_claims", insuranceCtx(tenantId, "insurance.listPagedWithRelations", "readonly"))
      .select(CLAIM_WITH_PATIENT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.patient_id === "string" && filters.patient_id.length > 0) {
      query = query.eq("patient_id", filters.patient_id);
    }
    if (typeof filters.assigned_to_user_id === "string" && filters.assigned_to_user_id.length > 0) {
      query = query.eq("assigned_to_user_id", filters.assigned_to_user_id);
    }
    query = applyQueueFilter(query, filters.queue);

    if (searchTerm) {
      const escaped = escapeSearchTerm(searchTerm);
      const orFilter = SEARCH_COLUMNS_WITH_RELATIONS
        .map((col) => `${col}.ilike.%${escaped}%`)
        .join(",");
      query = query.or(orFilter);
    }

    const sortColumn = params.sort?.column && SORTABLE_COLUMNS.has(params.sort.column)
      ? params.sort.column
      : "claim_date";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load insurance claims", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as InsuranceClaimWithPatient[], count: count ?? 0 };
  },
  async getSummary(tenantId) {
    const { data, error } = await platformRepository.rpc(
      "get_insurance_summary",
      {},
      insuranceCtx(tenantId, "insurance.getSummary", "readonly"),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load insurance summary", {
        code: error.code,
        details: error,
      });
    }

    return ((data as any)?.[0] ?? {
      total_count: 0,
      draft_count: 0,
      submitted_count: 0,
      processing_count: 0,
      approved_count: 0,
      denied_count: 0,
      reimbursed_count: 0,
      providers_count: 0,
    }) as InsuranceSummary;
  },
  async getOperationsSummary(tenantId) {
    const { data, error } = await platformRepository.rpc(
      "get_insurance_operations_summary",
      {},
      insuranceCtx(tenantId, "insurance.getOperationsSummary", "readonly"),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load insurance operations summary", {
        code: error.code,
        details: error,
      });
    }

    return ((data as any)?.[0] ?? {
      open_claims_count: 0,
      aged_0_7_count: 0,
      aged_8_14_count: 0,
      aged_15_plus_count: 0,
      oldest_open_claim_days: 0,
      denied_follow_up_count: 0,
      follow_up_due_count: 0,
      unassigned_open_count: 0,
      stalled_processing_count: 0,
    }) as InsuranceOperationsSummary;
  },
  async listAssignableOwners(tenantId) {
    const { data: profiles, error: profilesError } = await platformRepository
      .from("profiles", insuranceCtx(tenantId, "insurance.listAssignableOwners.profiles", "readonly"))
      .select("user_id, full_name")
      .eq("tenant_id", tenantId)
      .order("full_name", { ascending: true });

    if (profilesError) {
      throw new ServiceError(profilesError.message ?? "Failed to load insurance claim owners", {
        code: profilesError.code,
        details: profilesError,
      });
    }

    if (!profiles?.length) return [];

    const { data: roles, error: rolesError } = await platformRepository
      .from("user_roles", insuranceCtx(tenantId, "insurance.listAssignableOwners.roles", "readonly"))
      .select("user_id, role")
      .in("user_id", profiles.map((profile) => profile.user_id));

    if (rolesError) {
      throw new ServiceError(rolesError.message ?? "Failed to load insurance claim owner roles", {
        code: rolesError.code,
        details: rolesError,
      });
    }

    const allowedRoles = new Set(["clinic_admin", "accountant"]);
    const roleByUserId = new Map<string, string>();
    for (const role of roles ?? []) {
      if (allowedRoles.has(role.role)) {
        roleByUserId.set(role.user_id, role.role);
      }
    }

    return profiles
      .map((profile) => {
        const role = roleByUserId.get(profile.user_id);
        if (!role) return null;
        return {
          user_id: profile.user_id,
          full_name: profile.full_name,
          role,
        } as InsuranceAssignableOwner;
      })
      .filter((profile): profile is InsuranceAssignableOwner => profile !== null);
  },
  async isAssignableOwner(userId, tenantId) {
    const { data: profile, error: profileError } = await platformRepository
      .from("profiles", insuranceCtx(tenantId, "insurance.isAssignableOwner.profile", "readonly"))
      .select("user_id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (profileError) {
      throw new ServiceError(profileError.message ?? "Failed to validate insurance assignee", {
        code: profileError.code,
        details: profileError,
      });
    }
    if (!profile) return false;

    const { data: roles, error: rolesError } = await platformRepository
      .from("user_roles", insuranceCtx(tenantId, "insurance.isAssignableOwner.roles", "readonly"))
      .select("role")
      .eq("user_id", userId);
    if (rolesError) {
      throw new ServiceError(rolesError.message ?? "Failed to validate insurance assignee role", {
        code: rolesError.code,
        details: rolesError,
      });
    }
    const allowedRoles = new Set(["clinic_admin", "accountant"]);
    return (roles ?? []).some((r) => allowedRoles.has(r.role));
  },
  async getById(id, tenantId) {
    const result = await platformRepository
      .from("insurance_claims", insuranceCtx(tenantId, "insurance.getById", "readonly"))
      .select(CLAIM_COLUMNS)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .single();
    return assertOk(result) as InsuranceClaim;
  },
  async create(input, tenantId) {
    const { data, error } = await platformRepository.rpc("command_insurance_claim", {
      p_operation: "create",
      p_claim_id: null,
      p_tenant_id: tenantId,
      p_payload: input,
      p_expected_updated_at: null,
      p_idempotency_key: null,
      p_request_hash: ["create", tenantId, input.patient_id, input.provider, input.service, input.amount].join("|"),
      p_user_id: null,
      p_request_trace_id: null,
      p_operation_trace_id: null,
      p_workflow_trace_id: null,
    }, insuranceCtx(tenantId, "insurance.create", "critical"));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to create insurance claim", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row?.claim) {
      throw new ServiceError("Insurance claim command returned no result", { code: "INSURANCE_CLAIM_COMMAND_EMPTY_RESULT" });
    }
    return row.claim as InsuranceClaim;
  },
  async update(id, input, tenantId, expectedUpdatedAt) {
    const payload: Record<string, unknown> = {};

    if (input.patient_id !== undefined) payload.patient_id = input.patient_id;
    if (input.provider !== undefined) payload.provider = input.provider;
    if (input.service !== undefined) payload.service = input.service;
    if (input.amount !== undefined) payload.amount = input.amount;
    if (input.claim_date !== undefined) payload.claim_date = input.claim_date;
    if (input.status !== undefined) payload.status = input.status;
    if (input.submitted_at !== undefined) payload.submitted_at = input.submitted_at;
    if (input.processing_started_at !== undefined) payload.processing_started_at = input.processing_started_at;
    if (input.approved_at !== undefined) payload.approved_at = input.approved_at;
    if (input.reimbursed_at !== undefined) payload.reimbursed_at = input.reimbursed_at;
    if (input.payer_reference !== undefined) payload.payer_reference = input.payer_reference;
    if (input.denial_reason !== undefined) payload.denial_reason = input.denial_reason;
    if (input.assigned_to_user_id !== undefined) payload.assigned_to_user_id = input.assigned_to_user_id;
    if (input.internal_notes !== undefined) payload.internal_notes = input.internal_notes;
    if (input.payer_notes !== undefined) payload.payer_notes = input.payer_notes;
    if (input.last_follow_up_at !== undefined) payload.last_follow_up_at = input.last_follow_up_at;
    if (input.next_follow_up_at !== undefined) payload.next_follow_up_at = input.next_follow_up_at;
    if (input.resubmission_count !== undefined) payload.resubmission_count = input.resubmission_count;

    if (Object.keys(payload).length === 0) {
      const result = await platformRepository
        .from("insurance_claims", insuranceCtx(tenantId, "insurance.getForUpdate", "readonly"))
        .select(CLAIM_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .single();
      return assertOk(result) as InsuranceClaim;
    }

    const { data, error } = await platformRepository.rpc("command_insurance_claim", {
      p_operation: "update",
      p_claim_id: id,
      p_tenant_id: tenantId,
      p_payload: payload,
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_idempotency_key: null,
      p_request_hash: ["update", id, tenantId, JSON.stringify(payload), expectedUpdatedAt ?? ""].join("|"),
      p_user_id: null,
      p_request_trace_id: null,
      p_operation_trace_id: null,
      p_workflow_trace_id: null,
    }, insuranceCtx(tenantId, "insurance.update", "critical"));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update insurance claim", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row) {
      throw new ServiceError("Insurance claim command returned no result", { code: "INSURANCE_CLAIM_COMMAND_EMPTY_RESULT" });
    }
    if (row.result_code === "CONFLICT") return null;
    return (row.claim ?? null) as InsuranceClaim | null;
  },
  async transitionStatus(id, input, tenantId, userId, expectedUpdatedAt, trace) {
    const requestHash = [
      id,
      tenantId,
      input.status ?? "",
      input.denial_reason ?? "",
      input.payer_reference ?? "",
      input.assigned_to_user_id ?? "",
      input.internal_notes ?? "",
      input.payer_notes ?? "",
      input.next_follow_up_at ?? "",
      expectedUpdatedAt ?? "",
    ].join("|");
    const { data, error } = await platformRepository.rpc("transition_insurance_claim", {
      p_claim_id: id,
      p_tenant_id: tenantId,
      p_next_status: input.status,
      p_denial_reason: input.denial_reason ?? null,
      p_payer_reference: input.payer_reference ?? null,
      p_assigned_to_user_id: input.assigned_to_user_id ?? null,
      p_internal_notes: input.internal_notes ?? null,
      p_payer_notes: input.payer_notes ?? null,
      p_next_follow_up_at: input.next_follow_up_at ?? null,
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_idempotency_key: null,
      p_request_hash: requestHash,
      p_user_id: userId ?? null,
      p_request_trace_id: null,
      p_operation_trace_id: null,
      p_workflow_trace_id: null,
    }, insuranceCtx(tenantId, "insurance.claim.transition", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to transition insurance claim", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row) {
      throw new ServiceError("Insurance transition command returned no result", { code: "INSURANCE_TRANSITION_COMMAND_EMPTY_RESULT" });
    }
    if (row.result_code === "CONFLICT") return null;
    return (row.claim ?? null) as InsuranceClaim | null;
  },
  async archive(id, tenantId, userId) {
    const { data, error } = await platformRepository.rpc("command_insurance_claim", {
      p_operation: "archive",
      p_claim_id: id,
      p_tenant_id: tenantId,
      p_payload: {},
      p_expected_updated_at: null,
      p_idempotency_key: null,
      p_request_hash: ["archive", id, tenantId].join("|"),
      p_user_id: userId,
      p_request_trace_id: null,
      p_operation_trace_id: null,
      p_workflow_trace_id: null,
    }, insuranceCtx(tenantId, "insurance.archive", "critical"));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to archive insurance claim", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row?.claim) {
      throw new ServiceError("Insurance claim command returned no result", { code: "INSURANCE_CLAIM_COMMAND_EMPTY_RESULT" });
    }
    return row.claim as InsuranceClaim;
  },
  async restore(id, tenantId) {
    const { data, error } = await platformRepository.rpc("command_insurance_claim", {
      p_operation: "restore",
      p_claim_id: id,
      p_tenant_id: tenantId,
      p_payload: {},
      p_expected_updated_at: null,
      p_idempotency_key: null,
      p_request_hash: ["restore", id, tenantId].join("|"),
      p_user_id: null,
      p_request_trace_id: null,
      p_operation_trace_id: null,
      p_workflow_trace_id: null,
    }, insuranceCtx(tenantId, "insurance.restore", "critical"));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to restore insurance claim", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row?.claim) {
      throw new ServiceError("Insurance claim command returned no result", { code: "INSURANCE_CLAIM_COMMAND_EMPTY_RESULT" });
    }
    return row.claim as InsuranceClaim;
  },
  describe() {
    return {
      certified: true,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: true,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [Capabilities.billing.manage],
    };
  },
};
