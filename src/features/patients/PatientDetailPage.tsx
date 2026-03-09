import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FileText, Pill, Activity, Stethoscope,
  Calendar, Phone, Mail, Droplets, User, Loader2,
  FlaskConical, Receipt, CalendarDays, Clock, CheckCircle2, XCircle,
  Printer,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatDate, formatCurrency } from "@/shared/utils/formatDate";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PatientDocuments } from "./PatientDocuments";

type Tab = "overview" | "history" | "prescriptions" | "notes" | "lab_orders" | "invoices" | "appointments" | "documents";

const DEMO_PATIENT = {
  id: "PT-001", full_name: "Mohammed Al-Rashid", date_of_birth: "1985-03-15", gender: "male",
  blood_type: "A+", phone: "+966 50 123 4567", email: "m.rashid@email.com",
  address: "123 King Fahd Rd, Riyadh", insurance_provider: "National Health Co.", status: "active",
};

const DEMO_MEDICAL_HISTORY = [
  { id: "1", record_date: "2026-03-05", diagnosis: "Hypertension - Stage 1", doctors: { full_name: "Dr. Sarah Ahmed" }, notes: "BP 145/92. Started Lisinopril 10mg daily.", record_type: "progress_note" },
  { id: "2", record_date: "2026-02-10", diagnosis: "Type 2 Diabetes - Controlled", doctors: { full_name: "Dr. Sarah Ahmed" }, notes: "HbA1c 6.8%. Continue Metformin 500mg BID.", record_type: "lab_review" },
];

const DEMO_PRESCRIPTIONS = [
  { id: "RX-001", medication: "Lisinopril 10mg", dosage: "1 tablet daily", prescribed_date: "2026-03-05", doctors: { full_name: "Dr. Sarah Ahmed" }, status: "active" },
  { id: "RX-002", medication: "Metformin 500mg", dosage: "1 tablet twice daily", prescribed_date: "2026-02-10", doctors: { full_name: "Dr. Sarah Ahmed" }, status: "active" },
];

const DEMO_LAB_ORDERS = [
  { id: "LB-001", test_name: "Complete Blood Count (CBC)", doctors: { full_name: "Dr. Sarah Ahmed" }, order_date: "2026-03-05", status: "completed", result: "Normal ranges. WBC 6.5, RBC 4.8, HGB 14.2." },
  { id: "LB-002", test_name: "HbA1c", doctors: { full_name: "Dr. Sarah Ahmed" }, order_date: "2026-02-10", status: "completed", result: "6.8% — Controlled." },
  { id: "LB-003", test_name: "Lipid Panel", doctors: { full_name: "Dr. Sarah Ahmed" }, order_date: "2026-03-08", status: "processing", result: null },
];

const DEMO_INVOICES = [
  { id: "INV-001", invoice_code: "INV-001", service: "Cardiology Consultation", amount: 350, invoice_date: "2026-03-08", status: "paid" },
  { id: "INV-002", invoice_code: "INV-002", service: "Lab Work — CBC & HbA1c", amount: 180, invoice_date: "2026-02-10", status: "paid" },
  { id: "INV-003", invoice_code: "INV-003", service: "Follow-up Visit", amount: 120, invoice_date: "2026-03-06", status: "pending" },
];

const DEMO_APPOINTMENTS = [
  { id: "APT-001", appointment_date: "2026-03-15T10:00:00", type: "checkup", status: "scheduled", doctors: { full_name: "Dr. Sarah Ahmed" }, notes: "Regular blood pressure follow-up." },
  { id: "APT-002", appointment_date: "2026-03-05T09:30:00", type: "consultation", status: "completed", doctors: { full_name: "Dr. Sarah Ahmed" }, notes: "Reviewed HbA1c results and adjusted medication." },
  { id: "APT-003", appointment_date: "2026-02-10T11:00:00", type: "lab_review", status: "completed", doctors: { full_name: "Dr. Sarah Ahmed" }, notes: "Lab results reviewed. All within normal range." },
  { id: "APT-004", appointment_date: "2026-01-20T14:00:00", type: "checkup", status: "completed", doctors: { full_name: "Dr. Sarah Ahmed" }, notes: "Routine checkup. No concerns." },
  { id: "APT-005", appointment_date: "2026-03-22T10:30:00", type: "follow_up", status: "scheduled", doctors: { full_name: "Dr. Sarah Ahmed" }, notes: null },
];

const labStatusVariant: Record<string, "default" | "warning" | "success"> = {
  pending: "default", processing: "warning", completed: "success",
};
const invoiceStatusVariant: Record<string, "success" | "warning" | "destructive"> = {
  paid: "success", pending: "warning", overdue: "destructive",
};
const apptStatusVariant: Record<string, "default" | "warning" | "success" | "destructive"> = {
  scheduled: "warning", completed: "success", cancelled: "destructive", in_progress: "default",
};

export const PatientDetailPage = () => {
  const { t, locale, calendarType } = useI18n();
  const { clinicSlug, patientId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const isDemo = user?.tenantId === "demo";

  const tabs: { key: Tab; icon: any; label: string }[] = [
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
    queryKey: ["patient", patientId],
    queryFn: async () => {
      if (isDemo) return DEMO_PATIENT as any;
      const { data, error } = await supabase.from("patients").select("*").eq("id", patientId ?? "").single();
      if (error) throw error;
      return data;
    },
    enabled: !!patientId,
  });

  const { data: medicalRecords = [] } = useQuery({
    queryKey: ["medical_records", patientId],
    queryFn: async () => {
      if (isDemo) return DEMO_MEDICAL_HISTORY as any[];
      const { data, error } = await supabase
        .from("medical_records")
        .select("*, doctors(full_name)")
        .eq("patient_id", patientId ?? "")
        .order("record_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!patientId,
  });

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["prescriptions", patientId],
    queryFn: async () => {
      if (isDemo) return DEMO_PRESCRIPTIONS as any[];
      const { data, error } = await supabase
        .from("prescriptions")
        .select("*, doctors(full_name)")
        .eq("patient_id", patientId ?? "")
        .order("prescribed_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!patientId,
  });

  const { data: labOrders = [] } = useQuery({
    queryKey: ["lab_orders", patientId],
    queryFn: async () => {
      if (isDemo) return DEMO_LAB_ORDERS as any[];
      const { data, error } = await supabase
        .from("lab_orders")
        .select("*, doctors(full_name)")
        .eq("patient_id", patientId ?? "")
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!patientId,
  });

  const { data: patientAppointments = [] } = useQuery({
    queryKey: ["patient_appointments", patientId],
    queryFn: async () => {
      if (isDemo) return DEMO_APPOINTMENTS as any[];
      const { data, error } = await supabase
        .from("appointments")
        .select("*, doctors(full_name)")
        .eq("patient_id", patientId ?? "")
        .order("appointment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!patientId,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["patient_invoices", patientId],
    queryFn: async () => {
      if (isDemo) return DEMO_INVOICES as any[];
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("patient_id", patientId ?? "")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!patientId,
  });

  const getLabStatusLabel = (s: string) =>
    s === "pending" ? t("billing.pending") : s === "processing" ? t("laboratory.processing") : t("appointments.completed");

  const getInvoiceStatusLabel = (s: string) =>
    s === "paid" ? t("billing.paid") : s === "overdue" ? t("billing.overdue") : t("billing.pending");

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

  const totalBilled = invoices.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + Number(i.amount), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(`/tenant/${clinicSlug}/patients`)} className="p-2 rounded-md hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="page-title">{patient.full_name}</h1>
            <StatusBadge variant={patient.status === "active" ? "success" : "default"}>
              {patient.status === "active" ? t("patients.active") : t("patients.inactive")}
            </StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground capitalize">
            {patient.gender ? t(`patients.${patient.gender}`) : ""} · {patient.date_of_birth ? `${t("patients.dateOfBirth")}: ${formatDate(patient.date_of_birth, locale, "date", calendarType)}` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/tenant/${clinicSlug}/appointments`)}>
          <Calendar className="h-4 w-4" /> {t("patients.bookAppointment")}
        </Button>
      </div>

      {/* Patient Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Droplets, label: t("patients.bloodType"), value: patient.blood_type ?? "—" },
          { icon: Phone, label: t("common.phone"), value: patient.phone ?? "—" },
          { icon: Mail, label: t("common.email"), value: patient.email ?? "—" },
          { icon: Stethoscope, label: t("patients.insuranceProvider"), value: patient.insurance_provider ?? "—" },
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
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

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
                          <p className="text-xs text-muted-foreground">{formatDate(h.record_date, locale, "date", calendarType)} · {h.doctors?.full_name ?? "—"}</p>
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
                        <p className="text-xs text-muted-foreground">{rx.dosage}</p>
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

        const AppointmentRow = ({ a }: { a: any }) => (
          <tr className="hover:bg-muted/30 transition-colors">
            <td className="whitespace-nowrap text-muted-foreground">{formatDate(a.appointment_date, locale, "datetime", calendarType)}</td>
            <td className="font-medium capitalize">{a.type?.replace("_", " ") ?? "—"}</td>
            <td>{a.doctors?.full_name ?? "—"}</td>
            <td>
              <StatusBadge variant={apptStatusVariant[a.status] ?? "default"}>
                {getApptStatusLabel(a.status)}
              </StatusBadge>
            </td>
            <td className="text-sm text-muted-foreground max-w-xs truncate">{a.notes ?? "—"}</td>
          </tr>
        );

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
              <div className="bg-card rounded-lg border overflow-hidden">
                {upcoming.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">{t("appointments.noUpcomingAppointments")}</div>
                ) : (
                  <table className="data-table">
                    <thead><tr className="bg-muted/50">
                      <th>{t("common.date")}</th>
                      <th>{t("appointments.type")}</th>
                      <th>{t("appointments.doctor")}</th>
                      <th>{t("common.status")}</th>
                      <th>{t("appointments.notes")}</th>
                    </tr></thead>
                    <tbody>{upcoming.map((a: any) => <AppointmentRow key={a.id} a={a} />)}</tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Past */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                {t("appointments.pastAppointments")} ({past.length})
              </h3>
              <div className="bg-card rounded-lg border overflow-hidden">
                {past.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">{t("appointments.noPastAppointments")}</div>
                ) : (
                  <table className="data-table">
                    <thead><tr className="bg-muted/50">
                      <th>{t("common.date")}</th>
                      <th>{t("appointments.type")}</th>
                      <th>{t("appointments.doctor")}</th>
                      <th>{t("common.status")}</th>
                      <th>{t("appointments.notes")}</th>
                    </tr></thead>
                    <tbody>{past.map((a: any) => <AppointmentRow key={a.id} a={a} />)}</tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── MEDICAL HISTORY ── */}
      {activeTab === "history" && (
        <div className="bg-card rounded-lg border overflow-hidden">
          {medicalRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">{t("patients.noMedicalHistoryFound")}</div>
          ) : (
            <table className="data-table">
              <thead><tr className="bg-muted/50">
                <th>{t("common.date")}</th>
                <th>{t("common.result")}</th>
                <th>{t("appointments.doctor")}</th>
                <th>{t("appointments.notes")}</th>
              </tr></thead>
              <tbody>
                {medicalRecords.map((h: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="text-muted-foreground whitespace-nowrap">{formatDate(h.record_date, locale, "date", calendarType)}</td>
                    <td className="font-medium">{h.diagnosis ?? "—"}</td>
                    <td>{h.doctors?.full_name ?? "—"}</td>
                    <td className="text-sm text-muted-foreground max-w-xs truncate">{h.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── PRESCRIPTIONS ── */}
      {activeTab === "prescriptions" && (
        <div className="space-y-4">
          {prescriptions.length > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => {
                const printWin = window.open("", "_blank");
                if (!printWin) return;
                const rows = prescriptions.map((rx: any) =>
                  `<tr><td style="padding:8px;border:1px solid #ddd">${rx.medication}</td><td style="padding:8px;border:1px solid #ddd">${rx.dosage}</td><td style="padding:8px;border:1px solid #ddd">${rx.doctors?.full_name ?? "—"}</td><td style="padding:8px;border:1px solid #ddd">${formatDate(rx.prescribed_date, locale, "date", calendarType)}</td><td style="padding:8px;border:1px solid #ddd">${rx.status}</td></tr>`
                ).join("");
                printWin.document.write(`<html><head><title>Prescriptions — ${patient.full_name}</title><style>body{font-family:system-ui;padding:20px}table{width:100%;border-collapse:collapse}th{padding:8px;border:1px solid #ddd;background:#f5f5f5;text-align:start}</style></head><body><h2>${patient.full_name} — ${t("patients.prescriptions")}</h2><table><tr><th>${t("pharmacy.medication")}</th><th>Dosage</th><th>${t("appointments.doctor")}</th><th>${t("common.date")}</th><th>${t("common.status")}</th></tr>${rows}</table></body></html>`);
                printWin.document.close();
                printWin.print();
              }}>
                <Printer className="h-4 w-4" />
                {t("common.print")}
              </Button>
            </div>
          )}
          <div className="bg-card rounded-lg border overflow-hidden">
          {prescriptions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">{t("patients.noPrescriptionsFound")}</div>
          ) : (
            <table className="data-table">
              <thead><tr className="bg-muted/50">
                <th>{t("pharmacy.medication")}</th>
                <th>{t("laboratory.test")}</th>
                <th>{t("appointments.doctor")}</th>
                <th>{t("common.date")}</th>
                <th>{t("common.status")}</th>
              </tr></thead>
              <tbody>
                {prescriptions.map((rx: any) => (
                  <tr key={rx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="font-medium">{rx.medication}</td>
                    <td>{rx.dosage}</td>
                    <td>{rx.doctors?.full_name ?? "—"}</td>
                    <td className="text-muted-foreground">{formatDate(rx.prescribed_date, locale, "date", calendarType)}</td>
                    <td>
                      <StatusBadge variant={rx.status === "active" ? "success" : "default"}>
                        {rx.status === "active" ? t("patients.active") : t("patients.inactive")}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>
      )}

      {/* ── CLINICAL NOTES ── */}
      {activeTab === "notes" && (
        <div className="space-y-4">
          {medicalRecords.length === 0 ? (
            <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground">{t("patients.noClinicalNotesFound")}</div>
          ) : (
            medicalRecords.map((note: any, i: number) => (
              <div key={i} className="bg-card rounded-lg border p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <StatusBadge variant="info">{note.record_type?.replace("_", " ") ?? "Note"}</StatusBadge>
                    <span className="text-sm text-muted-foreground ms-3">{note.doctors?.full_name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{formatDate(note.record_date, locale, "date", calendarType)}</span>
                </div>
                <p className="text-sm leading-relaxed">{note.notes}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── LAB ORDERS ── */}
      {activeTab === "lab_orders" && (
        <div className="space-y-4">
          {/* summary strip */}
          <div className="grid grid-cols-3 gap-4">
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

          <div className="bg-card rounded-lg border overflow-hidden">
            {labOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-3">
                <FlaskConical className="h-10 w-10 opacity-30" />
                {t("patients.noLabOrders")}
              </div>
            ) : (
              <table className="data-table">
                <thead><tr className="bg-muted/50">
                  <th>{t("laboratory.test")}</th>
                  <th>{t("laboratory.orderedBy")}</th>
                  <th>{t("common.date")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.result")}</th>
                </tr></thead>
                <tbody>
                  {labOrders.map((l: any) => (
                    <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                      <td className="font-medium">{l.test_name}</td>
                      <td>{l.doctors?.full_name ?? "—"}</td>
                      <td className="text-muted-foreground whitespace-nowrap">{formatDate(l.order_date, locale, "date", calendarType)}</td>
                      <td>
                        <StatusBadge variant={labStatusVariant[l.status] ?? "default"}>
                          {getLabStatusLabel(l.status)}
                        </StatusBadge>
                      </td>
                      <td className="text-sm max-w-xs">
                        {l.result
                          ? <span>{l.result}</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── INVOICES ── */}
      {activeTab === "invoices" && (
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
              <p className="text-xs text-muted-foreground mt-1">{t("billing.paid")}</p>
            </div>
          </div>

          <div className="bg-card rounded-lg border overflow-hidden">
            {invoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-3">
                <Receipt className="h-10 w-10 opacity-30" />
                {t("patients.noInvoices")}
              </div>
            ) : (
              <table className="data-table">
                <thead><tr className="bg-muted/50">
                  <th>{t("billing.invoiceNumber")}</th>
                  <th>{t("common.service")}</th>
                  <th>{t("common.amount")}</th>
                  <th>{t("common.date")}</th>
                  <th>{t("common.status")}</th>
                </tr></thead>
                <tbody>
                  {invoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="font-medium">{inv.invoice_code}</td>
                      <td>{inv.service}</td>
                      <td className="font-semibold">{formatCurrency(Number(inv.amount), locale)}</td>
                      <td className="text-muted-foreground whitespace-nowrap">{formatDate(inv.invoice_date, locale, "date", calendarType)}</td>
                      <td>
                        <StatusBadge variant={invoiceStatusVariant[inv.status] ?? "default"}>
                          {getInvoiceStatusLabel(inv.status)}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── DOCUMENTS ── */}
      {activeTab === "documents" && (
        <div className="bg-card rounded-lg border p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{t("patients.noDocuments")}</p>
          <Button variant="outline" className="mt-4">{t("patients.uploadDocument")}</Button>
        </div>
      )}
    </div>
  );
};
