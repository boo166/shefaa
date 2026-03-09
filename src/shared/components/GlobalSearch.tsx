import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { Tables } from "@/integrations/supabase/types";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Users, CalendarDays, Stethoscope, Receipt, Search } from "lucide-react";

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { clinicSlug } = useParams();
  const isDemo = user?.tenantId === "demo";

  const { data: patients = [] } = useSupabaseTable<Tables<"patients">>("patients");
  const { data: doctors = [] } = useSupabaseTable<Tables<"doctors">>("doctors");
  const { data: appointments = [] } = useSupabaseTable<Tables<"appointments">>("appointments");
  const { data: invoices = [] } = useSupabaseTable<Tables<"invoices">>("invoices");

  // Keyboard shortcut
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
        className="hidden sm:flex items-center gap-2 bg-muted rounded-md px-3 py-1.5 hover:bg-muted/80 transition-colors"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground w-48 text-start">{t("common.search")}</span>
        <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t("common.search")} />
        <CommandList>
          <CommandEmpty>{t("common.noData")}</CommandEmpty>

          {patients.length > 0 && (
            <CommandGroup heading={t("common.patients")}>
              {patients.slice(0, 8).map((p) => (
                <CommandItem key={p.id} onSelect={() => go(`patients/${p.id}`)} className="gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{p.full_name}</span>
                  <span className="text-xs text-muted-foreground ms-auto">{p.patient_code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {doctors.length > 0 && (
            <CommandGroup heading={t("common.doctors")}>
              {doctors.slice(0, 5).map((d) => (
                <CommandItem key={d.id} onSelect={() => go("doctors")} className="gap-2">
                  <Stethoscope className="h-4 w-4 text-muted-foreground" />
                  <span>{d.full_name}</span>
                  <span className="text-xs text-muted-foreground ms-auto">{d.specialty}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {invoices.length > 0 && (
            <CommandGroup heading={t("common.billing")}>
              {invoices.slice(0, 5).map((inv) => (
                <CommandItem key={inv.id} onSelect={() => go("billing")} className="gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <span>{inv.invoice_code}</span>
                  <span className="text-xs text-muted-foreground ms-auto">{inv.service}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};
