import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { UserPlus, Search, Eye } from "lucide-react";

interface Patient {
  id: string;
  name: string;
  patientId: string;
  gender: string;
  dateOfBirth: string;
  bloodType: string;
  phone: string;
  status: "active" | "inactive";
  lastVisit: string;
}

const DEMO_PATIENTS: Patient[] = [
  { id: "1", name: "Mohammed Al-Rashid", patientId: "PT-001", gender: "male", dateOfBirth: "1985-03-15", bloodType: "A+", phone: "+966 50 123 4567", status: "active", lastVisit: "2026-03-05" },
  { id: "2", name: "Fatima Hassan", patientId: "PT-002", gender: "female", dateOfBirth: "1990-07-22", bloodType: "O-", phone: "+966 55 987 6543", status: "active", lastVisit: "2026-03-07" },
  { id: "3", name: "Ali Mansour", patientId: "PT-003", gender: "male", dateOfBirth: "1978-11-30", bloodType: "B+", phone: "+966 53 456 7890", status: "active", lastVisit: "2026-02-28" },
  { id: "4", name: "Noor Ibrahim", patientId: "PT-004", gender: "female", dateOfBirth: "1995-01-10", bloodType: "AB+", phone: "+966 54 321 0987", status: "inactive", lastVisit: "2026-01-15" },
  { id: "5", name: "Khalid Omar", patientId: "PT-005", gender: "male", dateOfBirth: "1982-06-18", bloodType: "O+", phone: "+966 56 789 0123", status: "active", lastVisit: "2026-03-06" },
  { id: "6", name: "Sara Al-Fahad", patientId: "PT-006", gender: "female", dateOfBirth: "1998-09-05", bloodType: "A-", phone: "+966 57 654 3210", status: "active", lastVisit: "2026-03-08" },
];

export const PatientsPage = () => {
  const { t } = useI18n();
  const [search, setSearch] = useState("");

  const filtered = DEMO_PATIENTS.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.patientId.toLowerCase().includes(search.toLowerCase())
  );

  const columns: Column<Patient>[] = [
    { key: "patientId", header: t("patients.patientId") },
    {
      key: "name",
      header: t("patients.fullName"),
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
            {p.name.charAt(0)}
          </div>
          <span className="font-medium">{p.name}</span>
        </div>
      ),
    },
    { key: "gender", header: t("patients.gender"), render: (p) => t(`patients.${p.gender}`) },
    { key: "bloodType", header: t("patients.bloodType") },
    { key: "phone", header: t("common.phone") },
    {
      key: "status",
      header: t("common.status"),
      render: (p) => (
        <StatusBadge variant={p.status === "active" ? "success" : "default"}>
          {t(`patients.${p.status}`)}
        </StatusBadge>
      ),
    },
    { key: "lastVisit", header: t("patients.lastVisit") },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("patients.title")}</h1>
        <PermissionGuard permission="manage_patients">
          <Button>
            <UserPlus className="h-4 w-4" />
            {t("patients.addPatient")}
          </Button>
        </PermissionGuard>
      </div>

      <div className="flex items-center gap-3 bg-card rounded-lg border px-4 py-2 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common.search")}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <DataTable columns={columns} data={filtered} keyExtractor={(p) => p.id} emptyMessage={t("common.noData")} />
    </div>
  );
};
