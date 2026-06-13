import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataTable, Column } from "@/shared/components/DataTable";
import { Button } from "@/components/primitives/Button";
import { Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/Inputs";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageContainer } from "@/components/layout/AppLayout";
import {
  ArrowLeft, FileText, Pill, Activity, Stethoscope,
  Calendar, Phone, Mail, Droplets, User, Loader2,
  FlaskConical, Receipt, CalendarDays, Clock, CheckCircle2, XCircle,
  Printer, Pencil, Trash2, Plus, History,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatDate, formatCurrency } from "@/shared/utils/formatDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PatientDocuments } from "./PatientDocuments";
import { PrescriptionManagementSection } from "./PrescriptionManagementSection";
import { PatientTimeline } from "./PatientTimeline";
import { generatePatientReportPDF } from "@/shared/utils/pdfGenerator";
import { patientService } from "@/services/patients/patient.service";
import { medicalRecordsService } from "@/services/patients/medicalRecords.service";
import { queryKeys } from "@/services/queryKeys";
import { appointmentService } from "@/services/appointments/appointment.service";
import { labService } from "@/services/laboratory/lab.service";
import { billingService } from "@/services/billing/billing.service";
import { prescriptionService } from "@/services/prescriptions/prescription.service";
import { tenantService } from "@/services/settings/tenant.service";
import { doctorService } from "@/services/doctors/doctor.service";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { formatPrescriptionSig } from "@/shared/utils/prescription";
import { toast } from "@/hooks/use-toast";

type Tab = "timeline" | "overview" | "history" | "prescriptions" | "notes" | "lab_orders" | "invoices" | "appointments" | "documents";


const labStatusVariant: Record<string, "default" | "warning" | "success"> = {
  pending: "default", processing: "warning", completed: "success",
};
const invoiceStatusVariant: Record<string, "success" | "warning" | "destructive"> = {
  paid: "success", pending: "warning", overdue: "destructive", partially_paid: "warning", void: "destructive",
};
const apptStatusVariant: Record<string, "default" | "warning" | "success" | "destructive"> = {
  scheduled: "warning", completed: "success", cancelled: "destructive", in_progress: "default",
};

export const PatientDetailPage = () => {
  const { t, locale, calendarType, dir } = useI18n([
    "patients",
    "appointments",
    "billing",
    "laboratory",
    "pharmacy",
    "common",
  ]);
  const { clinicSlug, patientId } = useParams();
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("timeline");
  const canManageRecords = hasPermission("manage_medical_records");
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [recordMode, setRecordMode] = useState<"create" | "edit">("create");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState({
    doctor_id: "",
    record_date: new Date().toISOString().slice(0, 10),
    record_type: "progress_note",
    diagnosis: "",
    notes: "",
  });
  const [doctorSearch, setDoctorSearch] = useState("");
  const debouncedDoctorSearch = useDebouncedValue(doctorSearch, 300);
  const [savingRecord, setSavingRecord] = useState(false);
  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null);
  const [deletingRecord, setDeletingRecord] = useState(false);

  const { data: tenant } = useQuery({
    queryKey: queryKeys.settings.tenant(user?.tenantId),
    queryFn: () => tenantService.getCurrentTenant(),
    enabled: !!user?.tenantId,
  });

  const tabs: { key: Tab; icon: any; label: string }[] = [
    { key: "timeline", icon: History, label: t("patients.timeline.title") },
    { key: "overview", icon: User, label: t("patients.overview") },
    { key: "appointments", icon: CalendarDays, label: t("common.appointments") },
    { key: "history", icon: Activity, label: t("patients.medicalHistory") },
    { key: "prescriptions", icon: Pill, label: t("patients.prescriptions") },
    { key: "notes", icon: FileText, label: t("patients.clinicalNotes") },
    { key: "lab_orders", icon: FlaskConical, label: t("common.laboratory") },
    { key: "invoices", icon: Receipt, label: t("common.billing") },
    { key: "documents", icon: FileText, label: t("patients.documents") },
  ];

  const { data: patient, isLoading: loadingPatient } = useQuery({
    queryKey: queryKeys.patients.detail(patientId ?? "", user?.tenantId),
    queryFn: async () => {
      if (!patientId) return null;
      return patientService.getById(patientId);
    },
    enabled: !!patientId && !!user?.tenantId,
  });

  const { data: medicalRecords = [] } = useQuery({
    queryKey: queryKeys.patients.medicalRecords(patientId ?? "", user?.tenantId),
    queryFn: async () => {
      if (!patientId) return [];
      return medicalRecordsService.listByPatient(patientId);
    },
    enabled: !!patientId && !!user?.tenantId,
  });

  const { data: doctorPage } = useQuery({
    queryKey: queryKeys.doctors.list({
      tenantId: user?.tenantId,
      page: 1,
      pageSize: 10,
      search: debouncedDoctorSearch.trim() || undefined,
    }),
    queryFn: async () =>
      doctorService.listForMedicalRecords({
        page: 1,
        pageSize: 10,
        search: debouncedDoctorSearch.trim() || undefined,
      }),
    enabled: recordModalOpen && !!user?.tenantId,
  });

  const doctors = useMemo(() => doctorPage?.data ?? [], [doctorPage?.data]);

  useEffect(() => {
    if (!recordModalOpen || recordMode !== "create") return;
    if (recordForm.doctor_id || !user?.id) return;
    const match = doctors.find((d: any) => d.user_id === user.id);
    if (match?.id) {
      setRecordForm((prev) => ({ ...prev, doctor_id: match.id }));
    }
  }, [recordModalOpen, recordMode, recordForm.doctor_id, doctors, user?.id]);

  const recordTypeOptions = useMemo(
    () => [
      { value: "progress_note", label: t("patients.recordTypes.progress_note") },
      { value: "lab_review", label: t("patients.recordTypes.lab_review") },
      { value: "acute_visit", label: t("patients.recordTypes.acute_visit") },
      { value: "annual_physical", label: t("patients.recordTypes.annual_physical") },
    ],
    [t],
  );
  const editingRecord = useMemo(
    () => medicalRecords.find((record: any) => record.id === editingRecordId),
    [medicalRecords, editingRecordId],
  );
  const getRecordTypeLabel = (value?: string) => {
    if (!value) return "-";
    return recordTypeOptions.find((option) => option.value === value)?.label ?? value.replace("_", " ");
  };

  const { data: prescriptions = [] } = useQuery({
    queryKey: queryKeys.prescriptions.list({ tenantId: user?.tenantId, filters: { patient_id: patientId } }),
    queryFn: async () => {
      if (!patientId) return [];
      return prescriptionService.listByPatient(patientId);
    },
    enabled: !!patientId && !!user?.tenantId,
  });

  const { data: labOrders = [] } = useQuery({
    queryKey: queryKeys.laboratory.list({ tenantId: user?.tenantId, filters: { patient_id: patientId } }),
    queryFn: async () => {
      if (!patientId) return [];
      return labService.listByPatient(patientId);
    },
    enabled: !!patientId && !!user?.tenantId,
  });

  const { data: patientAppointments = [] } = useQuery({
    queryKey: queryKeys.appointments.list({ tenantId: user?.tenantId, filters: { patient_id: patientId } }),
    queryFn: async () => {
      if (!patientId) return [];
      return appointmentService.listByPatient(patientId);
    },
    enabled: !!patientId && !!user?.tenantId,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: queryKeys.billing.list({ tenantId: user?.tenantId, filters: { patient_id: patientId } }),
    queryFn: async () => {
      if (!patientId) return [];
      return billingService.listByPatient(patientId);
    },
    enabled: !!patientId && !!user?.tenantId,
  });

  const openCreateRecord = () => {
    setRecordMode("create");
    setEditingRecordId(null);
    setRecordForm({
      doctor_id: "",
      record_date: new Date().toISOString().slice(0, 10),
      record_type: "progress_note",
      diagnosis: "",
      notes: "",
    });
    setDoctorSearch("");
    setRecordModalOpen(true);
  };

  const openEditRecord = (record: any) => {
    setRecordMode("edit");
    setEditingRecordId(record.id);
    setRecordForm({
      doctor_id: record.doctor_id ?? "",
      record_date: record.record_date ?? new Date().toISOString().slice(0, 10),
      record_type: record.record_type ?? "progress_note",
      diagnosis: record.diagnosis ?? "",
      notes: record.notes ?? "",
    });
    setDoctorSearch("");
    setRecordModalOpen(true);
  };

  const handleSaveRecord = async () => {
    if (!patientId) return;
    if (recordMode === "create" && !recordForm.doctor_id) {
      toast({
        title: t("common.missingFields"),
        description: t("common.pleaseFillAllRequiredFields"),
        variant: "destructive",
      });
      return;
    }
    setSavingRecord(true);
    try {
      if (recordMode === "create") {
        await medicalRecordsService.create({
          patient_id: patientId,
          doctor_id: recordForm.doctor_id,
          record_date: recordForm.record_date || undefined,
          record_type: recordForm.record_type as any,
          diagnosis: recordForm.diagnosis || null,
          notes: recordForm.notes || null,
        });
        toast({ title: t("common.saved") });
      } else if (editingRecordId) {
        await medicalRecordsService.update(editingRecordId, {
          record_date: recordForm.record_date || undefined,
          record_type: recordForm.record_type as any,
          diagnosis: recordForm.diagnosis || null,
          notes: recordForm.notes || null,
        });
        toast({ title: t("common.saved") });
      }
      setRecordModalOpen(false);
      setEditingRecordId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.medicalRecords(patientId, user?.tenantId) });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setSavingRecord(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!patientId || !deleteRecordId) return;
    setDeletingRecord(true);
    try {
      await medicalRecordsService.remove(deleteRecordId);
      toast({ title: t("common.deleted") });
      setDeleteRecordId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.medicalRecords(patientId, user?.tenantId) });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setDeletingRecord(false);
    }
  };

  const getLabStatusLabel = (s: string) =>
    s === "pending" ? t("billing.pending") : s === "processing" ? t("laboratory.processing") : t("appointments.completed");

  const getInvoiceStatusLabel = (s: string) =>
    s === "paid"
      ? t("billing.paid")
      : s === "overdue"
        ? t("billing.overdue")
        : s === "partially_paid"
          ? t("patients.billingSection.partiallyPaid")
          : s === "void"
            ? t("patients.billingSection.void")
            : t("billing.pending");

  if (loadingPatient) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">{t("patients.patientNotFound")}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(`/tenant/${clinicSlug}/patients`)}>
          {t("patients.backToPatients")}
        </Button>
      </div>
    );
  }

  const totalBilled = invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.amount), 0);
  const totalPaid = invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.amount_paid ?? 0), 0);
  const totalOutstanding = invoices
    .filter((invoice: any) => invoice.status !== "void")
    .reduce((sum: number, invoice: any) => sum + Number(invoice.balance_due ?? 0), 0);

  return (
    <PageContainer className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/tenant/${clinicSlug}/patients`)}
          className="hover:bg-muted"
          aria-label={t("common.back")}
          title={t("common.back")}
        >
          <ArrowLeft className={cn("h-5 w-5", dir === "rtl" && "rotate-180")} />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{patient.full_name}</h1>
            <StatusBadge variant={patient.status === "active" ? "success" : "default"}>
              {patient.status === "active" ? t("patients.active") : t("patients.inactive")}
            </StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground capitalize">
            {patient.gender ? t(`patients.${patient.gender}`) : ""} · {patient.date_of_birth ? `${t("patients.dateOfBirth")}: ${formatDate(patient.date_of_birth, locale, "date", calendarType)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => generatePatientReportPDF({
            patient, medicalRecords, prescriptions, labOrders, invoices,
            clinic: tenant ? { name: tenant.name, logoUrl: tenant.logo_url } : undefined,
            locale: locale as "en" | "ar",
          })}>
            <Printer className="h-4 w-4" /> {t("patients.printReport")}
          </Button>
          <Button variant="outline" onClick={() => navigate(`/tenant/${clinicSlug}/appointments`)}>
            <Calendar className="h-4 w-4" /> {t("patients.bookAppointment")}
          </Button>
        </div>
      </div>

      {/* Patient Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Droplets, label: t("patients.bloodType"), value: patient.blood_type ?? "-" },
          { icon: Phone, label: t("common.phone"), value: patient.phone ?? "-" },
          { icon: Mail, label: t("common.email"), value: patient.email ?? "-" },
          { icon: Stethoscope, label: t("patients.insuranceProvider"), value: patient.insurance_provider ?? "-" },
        ].map((item, i) => (
          <div key={i} className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
            <p className="text-sm font-medium truncate">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            className={cn(
              "h-auto rounded-none flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* ── TIMELINE ── */}
      {activeTab === "timeline" && patientId && (
        <div className="bg-card rounded-lg border p-5">
          <PatientTimeline patientId={patientId} tenantId={user?.tenantId} />
        </div>
      )}

      {/* ── OVERVIEW ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border p-5">
              <h3 className="font-semibold mb-4">{t("patients.recentDiagnoses")}</h3>
              {medicalRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("patients.noMedicalRecordsYet")}</p>
              ) : (
                <div className="space-y-3">
                    {medicalRecords.slice(0, 3).map((h: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{h.diagnosis ?? t("patients.noDiagnosis")}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(h.record_date, locale, "date", calendarType)} · {h.doctors?.full_name ?? "-"}</p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="bg-card rounded-lg border p-5">
              <h3 className="font-semibold mb-4">{t("patients.activePrescriptions")}</h3>
              {prescriptions.filter((p: any) => p.status === "active").length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("patients.noActivePrescriptions")}</p>
              ) : (
                <div className="space-y-3">
                  {prescriptions.filter((p: any) => p.status === "active").map((rx: any) => (
                    <div key={rx.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <Pill className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{rx.medication}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatPrescriptionSig(rx) || rx.dosage}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick summary: lab + billing */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("patients.labOrdersCount")}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{labOrders.length}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("patients.totalBilled")}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalBilled, locale)}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-success" />
                <span className="text-xs text-muted-foreground">{t("patients.totalPaid")}</span>
              </div>
              <p className="text-2xl font-bold text-success">{formatCurrency(totalPaid, locale)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── APPOINTMENTS ── */}
      {activeTab === "appointments" && (() => {
        const now = new Date();
        const upcoming = patientAppointments.filter((a: any) => new Date(a.appointment_date) >= now && a.status !== "cancelled");
        const past = patientAppointments.filter((a: any) => new Date(a.appointment_date) < now || a.status === "completed" || a.status === "cancelled");

        const getApptStatusLabel = (s: string) =>
          s === "scheduled" ? t("appointments.scheduled") :
          s === "completed" ? t("appointments.completed") :
          s === "cancelled" ? t("appointments.cancelled") : s;

        const appointmentColumns: Column<any>[] = [
          {
            key: "appointment_date",
            header: t("common.date"),
            render: (a) => (
              <span className="whitespace-nowrap text-muted-foreground">
                {formatDate(a.appointment_date, locale, "datetime", calendarType)}
              </span>
            ),
          },
          {
            key: "type",
            header: t("appointments.type"),
            render: (a) => <span className="font-medium capitalize">{a.type?.replace("_", " ") ?? "-"}</span>,
          },
          {
            key: "doctor",
            header: t("appointments.doctor"),
            render: (a) => a.doctors?.full_name ?? "-",
          },
          {
            key: "status",
            header: t("common.status"),
            render: (a) => (
              <StatusBadge variant={apptStatusVariant[a.status] ?? "default"}>
                {getApptStatusLabel(a.status)}
              </StatusBadge>
            ),
          },
          {
            key: "notes",
            header: t("appointments.notes"),
            render: (a) => <span className="text-sm text-muted-foreground max-w-xs truncate">{a.notes ?? "-"}</span>,
          },
        ];

        return (
          <div className="space-y-6">
            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { icon: CalendarDays, label: t("common.appointments"), count: patientAppointments.length, cls: "text-primary" },
                { icon: Clock, label: t("appointments.scheduled"), count: patientAppointments.filter((a: any) => a.status === "scheduled").length, cls: "text-yellow-500" },
                { icon: CheckCircle2, label: t("appointments.completed"), count: patientAppointments.filter((a: any) => a.status === "completed").length, cls: "text-success" },
                { icon: XCircle, label: t("appointments.cancelled"), count: patientAppointments.filter((a: any) => a.status === "cancelled").length, cls: "text-destructive" },
              ].map((s, i) => (
                <div key={i} className="stat-card text-center">
                  <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.cls}`} />
                  <p className="text-2xl font-bold">{s.count}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Upcoming */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                {t("appointments.upcomingAppointments")} ({upcoming.length})
              </h3>
              <DataTable
                columns={appointmentColumns}
                data={upcoming}
                keyExtractor={(a) => a.id}
                emptyMessage={t("appointments.noUpcomingAppointments")}
                tableLabel={t("appointments.upcomingAppointments")}
              />
            </div>

            {/* Past */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                {t("appointments.pastAppointments")} ({past.length})
              </h3>
              <DataTable
                columns={appointmentColumns}
                data={past}
                keyExtractor={(a) => a.id}
                emptyMessage={t("appointments.noPastAppointments")}
                tableLabel={t("appointments.pastAppointments")}
              />
            </div>
          </div>
        );
      })()}

      {/* ── MEDICAL HISTORY ── */}
      {activeTab === "history" && (() => {
        const historyColumns: Column<any>[] = [
          {
            key: "record_date",
            header: t("common.date"),
            render: (h) => (
              <span className="text-muted-foreground whitespace-nowrap">
                {formatDate(h.record_date, locale, "date", calendarType)}
              </span>
            ),
          },
          { key: "record_type", header: t("patients.recordType"), render: (h) => <span className="text-sm font-medium">{getRecordTypeLabel(h.record_type)}</span> },
          { key: "diagnosis", header: t("patients.diagnosis"), render: (h) => <span className="font-medium">{h.diagnosis ?? "-"}</span> },
          { key: "doctor", header: t("appointments.doctor"), render: (h) => h.doctors?.full_name ?? "-" },
          { key: "notes", header: t("appointments.notes"), render: (h) => <span className="text-sm text-muted-foreground max-w-xs truncate">{h.notes ?? "-"}</span> },
        ];

        if (canManageRecords) {
          historyColumns.push({
            key: "actions",
            header: t("common.actions"),
            render: (h) => (
              <div className="inline-flex items-center gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="hover:bg-muted"
                  onClick={() => openEditRecord(h)}
                  aria-label={t("common.edit")}
                  title={t("common.edit")}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteRecordId(h.id)}
                  aria-label={t("common.delete")}
                  title={t("common.delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ),
          });
        }

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t("patients.medicalHistory")}</h3>
              {canManageRecords && (
                <Button size="sm" onClick={openCreateRecord} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("common.add")}
                </Button>
              )}
            </div>
            {medicalRecords.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground space-y-3">
                <p>{t("patients.noMedicalHistoryFound")}</p>
                {canManageRecords && (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs text-muted-foreground">{t("patients.medicalHistoryEmptyCta")}</p>
                    <Button variant="outline" size="sm" onClick={openCreateRecord} className="gap-2">
                      <Plus className="h-4 w-4" />
                      {t("patients.addMedicalRecord")}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <DataTable
                columns={historyColumns}
                data={medicalRecords}
                keyExtractor={(h) => h.id}
                tableLabel={t("patients.medicalHistory")}
              />
            )}
          </div>
        );
      })()}

      {/* ── PRESCRIPTIONS ── */}
      {activeTab === "prescriptions" && (
        <PrescriptionManagementSection
          patientId={patientId ?? ""}
          patientName={patient.full_name}
          prescriptions={prescriptions as any}
          canManageRecords={canManageRecords}
        />
      )}

      {/* ── CLINICAL NOTES ── */}
      {activeTab === "notes" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("patients.clinicalNotes")}</h3>
            {canManageRecords && (
              <Button size="sm" onClick={openCreateRecord} className="gap-2">
                <Plus className="h-4 w-4" />
                {t("common.add")}
              </Button>
            )}
          </div>
          {medicalRecords.length === 0 ? (
            <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground space-y-3">
              <p>{t("patients.noClinicalNotesFound")}</p>
              {canManageRecords && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-muted-foreground">{t("patients.clinicalNotesEmptyCta")}</p>
                  <Button variant="outline" size="sm" onClick={openCreateRecord} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t("patients.addMedicalRecord")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            medicalRecords.map((note: any) => (
              <div key={note.id} className="bg-card rounded-lg border p-5">
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div>
                    <StatusBadge variant="info">{getRecordTypeLabel(note.record_type)}</StatusBadge>
                    <span className="text-sm text-muted-foreground ms-3">{note.doctors?.full_name ?? "-"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{formatDate(note.record_date, locale, "date", calendarType)}</span>
                    {canManageRecords && (
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="hover:bg-muted"
                          onClick={() => openEditRecord(note)}
                          aria-label={t("common.edit")}
                          title={t("common.edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteRecordId(note.id)}
                          aria-label={t("common.delete")}
                          title={t("common.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-sm leading-relaxed">{note.notes ?? "-"}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── LAB ORDERS ── */}
      {activeTab === "lab_orders" && (() => {
        const labColumns: Column<any>[] = [
          { key: "test_name", header: t("laboratory.test"), render: (l) => <span className="font-medium">{l.test_name}</span> },
          { key: "doctor", header: t("laboratory.orderedBy"), render: (l) => l.doctors?.full_name ?? "-" },
          { key: "order_date", header: t("common.date"), render: (l) => <span className="text-muted-foreground whitespace-nowrap">{formatDate(l.order_date, locale, "date", calendarType)}</span> },
          {
            key: "status",
            header: t("common.status"),
            render: (l) => (
              <StatusBadge variant={labStatusVariant[l.status] ?? "default"}>
                {getLabStatusLabel(l.status)}
              </StatusBadge>
            ),
          },
          {
            key: "result",
            header: t("common.result"),
            render: (l) => (
              l.result
                ? <span className="text-sm">{l.result}</span>
                : <span className="text-muted-foreground">-</span>
            ),
          },
        ];

        return (
          <div className="space-y-4">
            {/* summary strip */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: t("laboratory.pendingOrders"), count: labOrders.filter((l: any) => l.status === "pending").length, variant: "default" },
                { label: t("laboratory.processing"), count: labOrders.filter((l: any) => l.status === "processing").length, variant: "warning" },
                { label: t("appointments.completed"), count: labOrders.filter((l: any) => l.status === "completed").length, variant: "success" },
              ].map((s, i) => (
                <div key={i} className="stat-card text-center">
                  <p className="text-2xl font-bold">{s.count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {labOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-3">
                <FlaskConical className="h-10 w-10 opacity-30" />
                {t("patients.noLabOrders")}
              </div>
            ) : (
              <DataTable
                columns={labColumns}
                data={labOrders}
                keyExtractor={(l) => l.id}
                tableLabel={t("patients.labOrdersCount")}
              />
            )}
          </div>
        );
      })()}

      {/* ── INVOICES ── */}
      {activeTab === "invoices" && (() => {
        const invoiceColumns: Column<any>[] = [
          { key: "invoice_code", header: t("billing.invoiceNumber"), render: (inv) => <span className="font-medium">{inv.invoice_code}</span> },
          { key: "service", header: t("common.service"), render: (inv) => inv.service },
          { key: "amount", header: t("common.amount"), render: (inv) => <span className="font-semibold">{formatCurrency(Number(inv.amount), locale)}</span> },
          {
            key: "amount_paid",
            header: t("patients.billingSection.paidAmount"),
            render: (inv) => <span className="text-success">{formatCurrency(Number(inv.amount_paid ?? 0), locale)}</span>,
          },
          {
            key: "balance_due",
            header: t("patients.billingSection.balanceDue"),
            render: (inv) => <span>{formatCurrency(Number(inv.balance_due ?? 0), locale)}</span>,
          },
          { key: "invoice_date", header: t("common.date"), render: (inv) => <span className="text-muted-foreground whitespace-nowrap">{formatDate(inv.invoice_date, locale, "date", calendarType)}</span> },
          {
            key: "status",
            header: t("common.status"),
            render: (inv) => (
              <StatusBadge variant={invoiceStatusVariant[inv.status] ?? "default"}>
                {getInvoiceStatusLabel(inv.status)}
              </StatusBadge>
            ),
          },
        ];

        return (
          <div className="space-y-4">
            {/* billing summary strip */}
            <div className="grid grid-cols-3 gap-4">
              <div className="stat-card text-center">
                <p className="text-2xl font-bold">{invoices.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("billing.invoicesThisMonth")}</p>
              </div>
              <div className="stat-card text-center">
                <p className="text-2xl font-bold">{formatCurrency(totalBilled, locale)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("patients.totalBilled")}</p>
              </div>
                <div className="stat-card text-center">
                  <p className="text-2xl font-bold text-success">{formatCurrency(totalPaid, locale)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("patients.billingSection.collected")}</p>
                </div>
                <div className="stat-card text-center">
                  <p className="text-2xl font-bold">{formatCurrency(totalOutstanding, locale)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("patients.billingSection.outstanding")}</p>
                </div>
            </div>

            {invoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-3">
                <Receipt className="h-10 w-10 opacity-30" />
                {t("patients.noInvoices")}
              </div>
            ) : (
              <DataTable
                columns={invoiceColumns}
                data={invoices}
                keyExtractor={(inv) => inv.id}
                tableLabel={t("patients.invoices")}
              />
            )}
          </div>
        );
      })()}

      {/* ── DOCUMENTS ── */}
      {activeTab === "documents" && (
        <PatientDocuments patientId={patientId ?? ""} />
      )}
      <Dialog open={recordModalOpen} onOpenChange={(open) => !open && setRecordModalOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {recordMode === "create" ? t("patients.addMedicalRecord") : t("patients.editMedicalRecord")}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {recordMode === "create" ? t("patients.addMedicalRecord") : t("patients.editMedicalRecord")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {recordMode === "create" ? (
              <div className="space-y-2">
                <Label>{t("appointments.doctor")} *</Label>
                <Input
                  value={doctorSearch}
                  onChange={(e) => setDoctorSearch(e.target.value)}
                  placeholder={t("common.search")}
                />
                <Select
                  value={recordForm.doctor_id}
                  onValueChange={(value) => setRecordForm((prev) => ({ ...prev, doctor_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("appointments.selectDoctor")} />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((doctor: any) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        {doctor.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{t("appointments.doctor")}</Label>
                <Input value={editingRecord?.doctors?.full_name ?? "-"} disabled />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={recordForm.record_date}
                  onChange={(e) => setRecordForm((prev) => ({ ...prev, record_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("patients.recordType")}</Label>
                <Select
                  value={recordForm.record_type}
                  onValueChange={(value) => setRecordForm((prev) => ({ ...prev, record_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("patients.recordType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {recordTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("patients.diagnosis")}</Label>
              <Input
                value={recordForm.diagnosis}
                onChange={(e) => setRecordForm((prev) => ({ ...prev, diagnosis: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("appointments.notes")}</Label>
              <Textarea
                value={recordForm.notes}
                onChange={(e) => setRecordForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveRecord} disabled={savingRecord}>
              {savingRecord ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleteRecordId}
        title={t("patients.deleteMedicalRecordTitle")}
        message={t("patients.deleteMedicalRecordMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        loading={deletingRecord}
        onConfirm={handleDeleteRecord}
        onCancel={() => setDeleteRecordId(null)}
      />
    </PageContainer>
  );
};




