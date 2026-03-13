import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { UserPlus, Eye, Trash2, Upload } from "lucide-react";
import { AddPatientModal } from "./AddPatientModal";
import { ImportPatientsModal } from "./ImportPatientsModal";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { patientService } from "@/services/patients/patient.service";
import { queryKeys } from "@/services/queryKeys";
import type { Patient } from "@/domain/patient/patient.types";

type PatientRow = Patient;

export const PatientsPage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { clinicSlug } = useParams();
  const { user, hasPermission, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 25;
  const canManage = hasPermission("manage_patients");
  const canDelete = hasRole("clinic_admin");

  useRealtimeSubscription(["patients"]);

  const { data: liveResult, isLoading } = useQuery<{ data: PatientRow[]; count: number }>({
    queryKey: queryKeys.patients.list({
      tenantId: user?.tenantId,
      page,
      pageSize,
      search: searchTerm || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
    }),
    queryFn: () =>
      patientService.listPaged({
        page,
        pageSize,
        search: searchTerm || undefined,
        filters: statusFilter ? { status: statusFilter } : undefined,
        sort: { column: "created_at", ascending: false },
      }),
    enabled: !!user?.tenantId,
  });

  const patients = liveResult?.data ?? [];
  const total = liveResult?.count ?? 0;

  useEffect(() => { setPage(1); }, [statusFilter, searchTerm]);

  const handleBulkDelete = async (selectedIds: string[]) => {
    if (!canDelete) {
      toast({ title: t("settings.noPermission"), variant: "destructive" });
      return;
    }
    try {
      await patientService.deleteBulk(selectedIds);
      toast({ title: `${selectedIds.length} patients deleted` });
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.root(user?.tenantId) });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err?.message ?? "Failed to delete patients", variant: "destructive" });
    }
  };

  const columns: Column<PatientRow>[] = [
    { key: "patient_code", header: t("patients.patientId"), searchable: true },
    {
      key: "full_name", header: t("patients.fullName"), searchable: true,
      render: (p) => (
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">{p.full_name.charAt(0)}</div>
          <span className="font-medium text-sm">{p.full_name}</span>
        </div>
      ),
    },
    { key: "gender", header: t("patients.gender"), render: (p) => <span className="text-muted-foreground">{p.gender ? t(`patients.${p.gender}`) : "—"}</span> },
    { key: "blood_type", header: t("patients.bloodType"), render: (p) => <span className="text-muted-foreground">{p.blood_type ?? "—"}</span> },
    { key: "phone", header: t("common.phone"), searchable: true, render: (p) => <span className="text-muted-foreground tabular-nums">{p.phone ?? "—"}</span> },
    {
      key: "status", header: t("common.status"),
      render: (p) => <StatusBadge variant={p.status === "active" ? "success" : "default"} dot>{t(`patients.${p.status}`)}</StatusBadge>,
    },
    {
      key: "actions", header: "", searchable: false,
      render: (p) => (
        <button onClick={() => navigate(`/tenant/${clinicSlug}/patients/${p.id}`)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("patients.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} total patients</p>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGuard permission="manage_patients">
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" /> {t("patients.importCSV")}
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" />{t("patients.addPatient")}
            </Button>
          </PermissionGuard>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={patients}
        keyExtractor={(p) => p.id}
        emptyMessage={t("common.noData")}
        searchable
        serverSearch
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        isLoading={isLoading}
        exportFileName="patients"
        pdfExport={{ title: "Patient List", subtitle: `Generated on ${new Date().toLocaleDateString()}` }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        bulkActions={canDelete ? [
          {
            label: t("common.delete"),
            icon: <Trash2 className="h-3.5 w-3.5 me-1" />,
            variant: "destructive",
            action: handleBulkDelete,
          },
        ] : undefined}
        filterSlot={
          <StatusFilter
            options={[{ value: "active", label: t("patients.active") }, { value: "inactive", label: t("patients.inactive") }]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />

      <AddPatientModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: queryKeys.patients.root(user?.tenantId) })}
      />
      <ImportPatientsModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: queryKeys.patients.root(user?.tenantId) })}
      />
    </div>
  );
};
