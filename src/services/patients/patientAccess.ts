import { authorize, type AuthorizeResult } from "@/platform/authorization/authorize";
import { AuthorizationError } from "@/services/supabase/errors";

function authzToServiceError(result: Extract<AuthorizeResult, { ok: false }>): AuthorizationError {
  const base = { details: { authorizationCode: result.code } };
  switch (result.code) {
    case "tenant_mismatch":
      return new AuthorizationError("Resource tenant does not match active clinic context", {
        code: "PATIENT_TENANT_MISMATCH",
        ...base,
      });
    case "tenant_suspended":
      return new AuthorizationError("Clinic access suspended", { code: "TENANT_SUSPENDED", ...base });
    case "unauthenticated":
      return new AuthorizationError("Authentication required", { code: "UNAUTHENTICATED", ...base });
    case "assurance_requirement_failed":
      return new AuthorizationError("Additional verification required", {
        code: "ASSURANCE_REQUIRED",
        ...base,
      });
    default:
      return new AuthorizationError("Insufficient permission for this patient operation", {
        code: "PATIENT_CAPABILITY_DENIED",
        ...base,
      });
  }
}

/** Capability-style gate with explicit tenant binding (middleware + RLS remain authoritative). */
export function requirePatientAccess(input: { tenantId: string; anyOfCapabilities: string[] }): void {
  const r = authorize({
    anyOfCapabilities: input.anyOfCapabilities,
    context: { resourceTenantId: input.tenantId },
  });
  if (!r.ok) throw authzToServiceError(r);
}
