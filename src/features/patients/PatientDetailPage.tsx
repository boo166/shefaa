import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FileText, Pill, Activity, Stethoscope,
  Calendar, Phone, Mail, Droplets, User, Loader2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

type Tab = "overview" | "history" | "prescriptions" | "notes" | "documents";

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

const tabs: { key: Tab; icon: any; label: string }[] = [
  { key: "overview", icon: User, label: "Overview" },
  { key: "history", icon: Activity, label: "Medical History" },
  { key: "prescriptions", icon: Pill, label: "Prescriptions" },
  { key: "notes", icon: FileText, label: "Clinical Notes" },
  { key: "documents", icon: FileText, label: "Documents" },
];

export const PatientDetailPage = () => {
  const { t } = useI18n();
  const { clinicSlug, patientId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const isDemo = user?.tenantId === "demo";

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
        <p className="text-muted-foreground">Patient not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(`/tenant/${clinicSlug}/patients`)}>
          Back to Patients
        </Button>
      </div>
    );
  }

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
              {patient.status}
            </StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground capitalize">
            {patient.gender} · {patient.date_of_birth ? `DOB: ${patient.date_of_birth}` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/tenant/${clinicSlug}/appointments`)}>
          <Calendar className="h-4 w-4" /> Book Appointment
        </Button>
      </div>

      {/* Patient Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Droplets, label: "Blood Type", value: patient.blood_type ?? "—" },
          { icon: Phone, label: "Phone", value: patient.phone ?? "—" },
          { icon: Mail, label: "Email", value: patient.email ?? "—" },
          { icon: Stethoscope, label: "Insurance", value: patient.insurance_provider ?? "—" },
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

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">Recent Diagnoses</h3>
            {medicalRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No medical records yet</p>
            ) : (
              <div className="space-y-3">
                {medicalRecords.slice(0, 3).map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{h.diagnosis ?? "No diagnosis"}</p>
                      <p className="text-xs text-muted-foreground">{h.record_date} · {h.doctors?.full_name ?? "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">Active Prescriptions</h3>
            {prescriptions.filter((p: any) => p.status === "active").length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No active prescriptions</p>
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
      )}

      {activeTab === "history" && (
        <div className="bg-card rounded-lg border overflow-hidden">
          {medicalRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No medical history found</div>
          ) : (
            <table className="data-table">
              <thead><tr className="bg-muted/50">
                <th>Date</th><th>Diagnosis</th><th>Doctor</th><th>Notes</th>
              </tr></thead>
              <tbody>
                {medicalRecords.map((h: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="text-muted-foreground whitespace-nowrap">{h.record_date}</td>
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

      {activeTab === "prescriptions" && (
        <div className="bg-card rounded-lg border overflow-hidden">
          {prescriptions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No prescriptions found</div>
          ) : (
            <table className="data-table">
              <thead><tr className="bg-muted/50">
                <th>Medication</th><th>Dosage</th><th>Doctor</th><th>Date</th><th>Status</th>
              </tr></thead>
              <tbody>
                {prescriptions.map((rx: any) => (
                  <tr key={rx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="font-medium">{rx.medication}</td>
                    <td>{rx.dosage}</td>
                    <td>{rx.doctors?.full_name ?? "—"}</td>
                    <td className="text-muted-foreground">{rx.prescribed_date}</td>
                    <td><StatusBadge variant={rx.status === "active" ? "success" : "default"}>{rx.status}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "notes" && (
        <div className="space-y-4">
          {medicalRecords.length === 0 ? (
            <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground">No clinical notes found</div>
          ) : (
            medicalRecords.map((note: any, i: number) => (
              <div key={i} className="bg-card rounded-lg border p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <StatusBadge variant="info">{note.record_type?.replace("_", " ") ?? "Note"}</StatusBadge>
                    <span className="text-sm text-muted-foreground ms-3">{note.doctors?.full_name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{note.record_date}</span>
                </div>
                <p className="text-sm leading-relaxed">{note.notes}</p>
              </div>
            ))
          )}
        </div>
      )}

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
