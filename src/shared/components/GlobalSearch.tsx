import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "@/core/i18n/i18nStore";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/core/auth/authStore";
import { searchService } from "@/services";
import { queryKeys } from "@/services/queryKeys";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Users, Stethoscope, Receipt, Search } from "lucide-react";

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { t } = useI18n();
  const navigate = useNavigate();
  const { clinicSlug } = useParams();
  const { user } = useAuth();
  const tenantId = user?.tenantId;

  const debouncedQuery = useDebouncedValue(query, 300);

  const { data: results = [] } = useQuery({
    queryKey: queryKeys.globalSearch.query(debouncedQuery, tenantId),
    queryFn: async () => searchService.globalSearch({ term: debouncedQuery, limit: 8 }),
    enabled: !!tenantId && debouncedQuery.trim().length >= 2,
  });

  const effectiveResults = query.trim().length < 2 ? [] : results;

  const grouped = useMemo(() => {
    return {
      patients: effectiveResults.filter((r) => r.entity_type === "patient"),
      doctors: effectiveResults.filter((r) => r.entity_type === "doctor"),
      invoices: effectiveResults.filter((r) => r.entity_type === "invoice"),
    };
  }, [effectiveResults]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = useCallback(
    (path: string) => {
      navigate(`/tenant/${clinicSlug}/${path}`);
      setOpen(false);
    },
    [navigate, clinicSlug]
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 bg-background border rounded-lg px-3 py-1.5 hover:border-ring/50 transition-colors group"
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground w-40 text-start">{t("common.search")}</span>
        <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder={t("common.search")}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>{query.trim().length < 2 ? t("common.search") : t("common.noData")}</CommandEmpty>

          {grouped.patients.length > 0 && (
            <CommandGroup heading={t("common.patients")}>
              {grouped.patients.map((p) => (
                <CommandItem key={p.entity_id} onSelect={() => go(`patients/${p.entity_id}`)} className="gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{p.label}</span>
                  <span className="text-xs text-muted-foreground ms-auto">{p.sublabel ?? ""}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {grouped.doctors.length > 0 && (
            <CommandGroup heading={t("common.doctors")}>
              {grouped.doctors.map((d) => (
                <CommandItem key={d.entity_id} onSelect={() => go("doctors")} className="gap-2">
                  <Stethoscope className="h-4 w-4 text-muted-foreground" />
                  <span>{d.label}</span>
                  <span className="text-xs text-muted-foreground ms-auto">{d.sublabel ?? ""}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {grouped.invoices.length > 0 && (
            <CommandGroup heading={t("common.billing")}>
              {grouped.invoices.map((inv) => (
                <CommandItem key={inv.entity_id} onSelect={() => go("billing")} className="gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <span>{inv.label}</span>
                  <span className="text-xs text-muted-foreground ms-auto">{inv.sublabel ?? ""}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};
