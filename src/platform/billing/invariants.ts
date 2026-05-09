import { assertRuntimeInvariant } from "@/platform/runtime/invariants";
import { BusinessRuleError } from "@/services/supabase/errors";

/** Ensures operation tenant matches resource row tenant (fail-closed). */
export function assertInvoiceTenantScope(rowTenantId: string, operationTenantId: string): void {
  assertRuntimeInvariant({
    domain: "billing",
    invariant: "invoice_tenant_match",
    expected: operationTenantId,
    actual: rowTenantId,
    message: "Invoice tenant_id must match scoped operation tenant",
  });
}

/**
 * Ledger discipline: monetary amounts exposed to RPCs must be finite and non-negative.
 * Corrections go through void/compensating flows, not negative inserts.
 */
export function assertBillingMoneyNonNegative(amount: number, field: string): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new BusinessRuleError(`${field} must be a non-negative finite amount`, {
      code: "BILLING_INVALID_AMOUNT",
      details: { field, amount },
    });
  }
}
