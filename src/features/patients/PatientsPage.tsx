import { useState, useEffect, useMemo } from "react";
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

const DEMO_PATIENTS: PatientRow[] = [
  { id: "1", full_name: "Mohammed Al-Rashid", patient_code: "PT-001", gender: "male", date_of_birth: "1985-03-15", blood_type: "A+", phone: "+966 50 123 4567", status: "active", email: null, address: null, insurance_provider: null, tenant_id: "demo", created_at: "", updated_at: "" },
  { id: "2", full_name: "Fatima Hassan", patient_code: "PT-002", gender: "female", date_of_birth: "1990-07-22", blood_type: "O-", phone: "+966 55 987 6543", status: "active", email: null, address: null, insurance_provider: null, tenant_id: "demo", created_at: "", updated_at: "" },
  { id: "3", full_name: "Ali Mansour", patient_code: "PT-003", gender: "male", date_of_birth: "1978-11-30", blood_type: "B+", phone: "+966 53 456 7890", status: "active", email: null, address: null, insurance_provider: null, tenant_id: "demo", created_at: "", updated_at: "" },
  { id: "4", full_name: "Noor Ibrahim", patient_code: "PT-004", gender: "female", date_of_birth: "1995-01-10", blood_type: "AB+", phone: "+966 54 321 0987", status: "inactive", email: null, address: null, insurance_provider: null, tenant_id: "demo", created_at: "", updated_at: "" },
];

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
  const isDemo = user?.tenantId === "demo";
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
    enabled: !!user?.tenantId && user?.tenantId !== "demo",
  });

  const livePatients = liveResult?.data ?? [];
  const totalPatients = liveResult?.count ?? 0;

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  const patients = isDemo ? DEMO_PATIENTS : livePatients;
  const demoFiltered = useMemo(() => {
    if (!isDemo) return patients;
    const q = searchTerm.trim().toLowerCase();
    return patients.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.patient_code?.toLowerCase().includes(q) ||
        p.full_name?.toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [patients, statusFilter, searchTerm, isDemo]);
  const pagedDemo = isDemo
    ? demoFiltered.slice((page - 1) * pageSize, page * pageSize)
    : patients;
  const total = isDemo ? demoFiltered.length : totalPatients;

  const handleBulkDelete = async (selectedIds: string[]) => {
    if (isDemo) {
      toast({ title: t("common.demoMode"), variant: "destructive" });
      return;
    }
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
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">{p.full_name.charAt(0)}</div>
          <span className="font-medium">{p.full_name}</span>
        </div>
      ),
    },
    { key: "gender", header: t("patients.gender"), render: (p) => p.gender ? t(`patients.${p.gender}`) : "—" },
    { key: "blood_type", header: t("patients.bloodType"), render: (p) => p.blood_type ?? "—" },
    { key: "phone", header: t("common.phone"), searchable: true, render: (p) => p.phone ?? "—" },
    {
      key: "status", header: t("common.status"),
      render: (p) => <StatusBadge variant={p.status === "active" ? "success" : "default"}>{t(`patients.${p.status}`)}</StatusBadge>,
    },
    {
      key: "actions", header: t("common.actions"), searchable: false,
      render: (p) => (
        <button onClick={() => navigate(`/tenant/${clinicSlug}/patients/${p.id}`)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("patients.title")}</h1>
        <div className="flex items-center gap-2">
          <PermissionGuard permission="manage_patients">
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" /> {t("patients.importCSV")}
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <UserPlus className="h-4 w-4" />{t("patients.addPatient")}
            </Button>
          </PermissionGuard>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={pagedDemo}
        keyExtractor={(p) => p.id}
        emptyMessage={t("common.noData")}
        searchable
        serverSearch
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        isLoading={!isDemo && isLoading}
        exportFileName="patients"
        pdfExport={{ title: "Patient List", subtitle: `Generated on ${new Date().toLocaleDateString()}` }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        bulkActions={canDelete && !isDemo ? [
          {
            label: t("common.delete"),
            icon: <Trash2 className="h-4 w-4 me-1" />,
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
