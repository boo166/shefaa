import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { RuntimeMode, type RuntimeFreeze, type RuntimeState } from "@/platform/runtime/policy";
import type { RuntimeModeRecord } from "./runtimeModeTypes";

const MODE_COLUMNS =
  "runtime_scope, scope_id, mode, freezes, version, updated_at, updated_by, reason, expires_at, propagation_strategy, mode_source";

function ctx(action: string): PlatformRepositoryContext {
  return { action, classification: "readonly", tenantScoped: false };
}

function parseRuntimeState(row: Pick<RuntimeModeRecord, "mode" | "freezes" | "version">): RuntimeState {
  return {
    effectiveMode: row.mode ?? RuntimeMode.NORMAL,
    version: row.version ?? 0,
    freezes: (row.freezes ?? undefined) as RuntimeFreeze | undefined,
  };
}

export const runtimeModeRepository = {
  async getGlobal(): Promise<RuntimeState | null> {
    const result = await platformRepository
      .from("platform_runtime_modes", ctx("runtimeMode.getGlobal"))
      .select(MODE_COLUMNS)
      .eq("runtime_scope", "global")
      .is("expires_at", null)
      .order("version", { ascending: false })
      .maybeSingle();
    if ((result as any).error) return null;
    const row = (result as any).data as RuntimeModeRecord | null;
    return row ? parseRuntimeState(row) : null;
  },

  async getTenant(tenantId: string): Promise<RuntimeState | null> {
    const result = await platformRepository
      .from("platform_runtime_modes", ctx("runtimeMode.getTenant"))
      .select(MODE_COLUMNS)
      .eq("runtime_scope", "tenant")
      .eq("scope_id", tenantId)
      .is("expires_at", null)
      .order("version", { ascending: false })
      .maybeSingle();
    if ((result as any).error) return null;
    const row = (result as any).data as RuntimeModeRecord | null;
    return row ? parseRuntimeState(row) : null;
  },
};

