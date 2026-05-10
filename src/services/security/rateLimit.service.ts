import { BusinessRuleError, toServiceError } from "@/services/supabase/errors";
import { rateLimitRepository } from "./rateLimit.repository";

type RateLimitConfig = { maxHits: number; windowSeconds: number };

const LIMITS: Record<string, RateLimitConfig> = {
  login: { maxHits: 5, windowSeconds: 300 },
  password_reset: { maxHits: 3, windowSeconds: 3600 },
  lab_upload: { maxHits: 20, windowSeconds: 600 },
  document_upload: { maxHits: 10, windowSeconds: 600 },
  invoice_create: { maxHits: 20, windowSeconds: 600 },
  invoice_payment_post: { maxHits: 40, windowSeconds: 600 },
  super_admin_tenant_create: { maxHits: 5, windowSeconds: 3600 },
  super_admin_tenant_lifecycle: { maxHits: 15, windowSeconds: 3600 },
  super_admin_subscription_update: { maxHits: 20, windowSeconds: 3600 },
  super_admin_pricing_update: { maxHits: 20, windowSeconds: 3600 },
  super_admin_job_retry: { maxHits: 20, windowSeconds: 300 },
  super_admin_job_retry_bulk: { maxHits: 5, windowSeconds: 300 },
};

function buildKey(action: string, parts: Array<string | undefined>) {
  const normalized = parts.filter(Boolean).map((part) => String(part).toLowerCase().trim());
  return [action, ...normalized].join(":");
}

export const rateLimitService = {
  async assertAllowed(action: keyof typeof LIMITS, parts: Array<string | undefined>) {
    try {
      const config = LIMITS[action];
      const key = buildKey(action, parts);
      const allowed = await rateLimitRepository.check(key, config.maxHits, config.windowSeconds);
      if (!allowed) {
        throw new BusinessRuleError("Too many requests. Please try again later.", {
          code: "RATE_LIMIT",
          details: { action },
        });
      }
    } catch (err) {
      throw toServiceError(err, "Rate limit check failed");
    }
  },
};
