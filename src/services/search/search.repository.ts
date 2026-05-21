import type { SearchResult } from "@/domain/search/search.types";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

function searchCtx(tenantId: string): PlatformRepositoryContext {
  return {
    action: "search.global",
    classification: "readonly",
    tenantScoped: true,
    tenantId,
  };
}

export interface SearchRepository {
  searchGlobal(tenantId: string, term: string, limit?: number): Promise<SearchResult[]>;
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
  };
}

export const searchRepository: SearchRepository = {
  async searchGlobal(tenantId, term, limit = 8) {
    const { data, error } = await platformRepository.rpc(
      "search_global",
      { _term: term, _limit: limit, _tenant_id: tenantId },
      searchCtx(tenantId),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to search", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? []) as SearchResult[];
  },
  describe() {
    return {
      certified: false,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: false,
      reconciliationAware: false,
      recoveryAware: false,
      evidenceAware: false,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [],
      exceptions: [
        "Global search uses platformRepository but does not yet declare capability metadata.",
      ],
    };
  },
};
