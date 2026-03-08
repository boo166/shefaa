import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FileText, Pill, Activity, Stethoscope,
  Calendar, Phone, Mail, Droplets, User,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";

type Tab = "overview" | "history" | "prescriptions" | "notes" | "documents";

const PATIENT = {
  id: "PT-001", name: "Mohammed Al-Rashid", dob: "1985-03-15", gender: "Male",
  blood: "A+", phone: "+966 50 123 4567", email: "m.rashid@email.com",
  address: "123 King Fahd Rd, Riyadh", insurance: "National Health Co.", status: "active" as const,
};

const MEDICAL_HISTORY = [
  { date: "2026-03-05", diagnosis: "Hypertension - Stage 1", doctor: "Dr. Sarah Ahmed", notes: "BP 145/92. Started Lisinopril 10mg daily." },
  { date: "2026-02-10", diagnosis: "Type 2 Diabetes - Controlled", doctor: "Dr. Sarah Ahmed", notes: "HbA1c 6.8%. Continue Metformin 500mg BID." },
  { date: "2025-11-20", diagnosis: "Upper Respiratory Infection", doctor: "Dr. John Smith", notes: "Prescribed Amoxicillin 500mg TID for 7 days." },
  { date: "2025-08-15", diagnosis: "Annual Physical - Normal", doctor: "Dr. Sarah Ahmed", notes: "All labs within normal limits. BMI 27.2." },
];

const PRESCRIPTIONS = [
  { id: "RX-001", medication: "Lisinopril 10mg", dosage: "1 tablet daily", prescribed: "2026-03-05", doctor: "Dr. Sarah Ahmed", status: "active" as const },
  { id: "RX-002", medication: "Metformin 500mg", dosage: "1 tablet twice daily", prescribed: "2026-02-10", doctor: "Dr. Sarah Ahmed", status: "active" as const },
  { id: "RX-003", medication: "Amoxicillin 500mg", dosage: "1 capsule 3x daily", prescribed: "2025-11-20", doctor: "Dr. John Smith", status: "completed" as const },
];

const CLINICAL_NOTES = [
  { date: "2026-03-05", doctor: "Dr. Sarah Ahmed", type: "Progress Note", content: "Patient reports occasional headaches. BP elevated at 145/92. Starting antihypertensive therapy. Follow-up in 2 weeks." },
  { date: "2026-02-10", doctor: "Dr. Sarah Ahmed", type: "Lab Review", content: "HbA1c improved from 7.2% to 6.8%. Continue current diabetes management. Recheck in 3 months." },
  { date: "2025-11-20", doctor: "Dr. John Smith", type: "Acute Visit", content: "Patient presents with cough, sore throat, mild fever x 3 days. Lungs clear. Diagnosed URI. Prescribed antibiotics." },
];

const tabs: { key: Tab; icon: any; labelKey: string }[] = [
  { key: "overview", icon: User, labelKey: "Overview" },
  { key: "history", icon: Activity, labelKey: "Medical History" },
  { key: "prescriptions", icon: Pill, labelKey: "Prescriptions" },
  { key: "notes", icon: FileText, labelKey: "Clinical Notes" },
  { key: "documents", icon: FileText, labelKey: "Documents" },
];

export const PatientDetailPage = () => {
  const { t } = useI18n();
  const { clinicSlug } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(`/tenant/${clinicSlug}/patients`)} className="p-2 rounded-md hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="page-title">{PATIENT.name}</h1>
            <StatusBadge variant="success">Active</StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground">{PATIENT.id} · {PATIENT.gender} · DOB: {PATIENT.dob}</p>
        </div>
        <Button variant="outline"><Calendar className="h-4 w-4" /> Book Appointment</Button>
      </div>

      {/* Patient Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Droplets, label: "Blood Type", value: PATIENT.blood },
          { icon: Phone, label: "Phone", value: PATIENT.phone },
          { icon: Mail, label: "Email", value: PATIENT.email },
          { icon: Stethoscope, label: "Insurance", value: PATIENT.insurance },
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
            {tab.labelKey}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">Recent Diagnoses</h3>
            <div className="space-y-3">
              {MEDICAL_HISTORY.slice(0, 3).map((h, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{h.diagnosis}</p>
                    <p className="text-xs text-muted-foreground">{h.date} · {h.doctor}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">Active Prescriptions</h3>
            <div className="space-y-3">
              {PRESCRIPTIONS.filter((p) => p.status === "active").map((rx) => (
                <div key={rx.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Pill className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{rx.medication}</p>
                    <p className="text-xs text-muted-foreground">{rx.dosage}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="data-table">
            <thead><tr className="bg-muted/50">
              <th>Date</th><th>Diagnosis</th><th>Doctor</th><th>Notes</th>
            </tr></thead>
            <tbody>
              {MEDICAL_HISTORY.map((h, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="text-muted-foreground whitespace-nowrap">{h.date}</td>
                  <td className="font-medium">{h.diagnosis}</td>
                  <td>{h.doctor}</td>
                  <td className="text-sm text-muted-foreground max-w-xs truncate">{h.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "prescriptions" && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="data-table">
            <thead><tr className="bg-muted/50">
              <th>ID</th><th>Medication</th><th>Dosage</th><th>Doctor</th><th>Date</th><th>Status</th>
            </tr></thead>
            <tbody>
              {PRESCRIPTIONS.map((rx) => (
                <tr key={rx.id} className="hover:bg-muted/30 transition-colors">
                  <td className="text-muted-foreground">{rx.id}</td>
                  <td className="font-medium">{rx.medication}</td>
                  <td>{rx.dosage}</td>
                  <td>{rx.doctor}</td>
                  <td className="text-muted-foreground">{rx.prescribed}</td>
                  <td><StatusBadge variant={rx.status === "active" ? "success" : "default"}>{rx.status}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "notes" && (
        <div className="space-y-4">
          {CLINICAL_NOTES.map((note, i) => (
            <div key={i} className="bg-card rounded-lg border p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <StatusBadge variant="info">{note.type}</StatusBadge>
                  <span className="text-sm text-muted-foreground ms-3">{note.doctor}</span>
                </div>
                <span className="text-sm text-muted-foreground">{note.date}</span>
              </div>
              <p className="text-sm leading-relaxed">{note.content}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === "documents" && (
        <div className="bg-card rounded-lg border p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No documents uploaded yet</p>
          <Button variant="outline" className="mt-4">Upload Document</Button>
        </div>
      )}
    </div>
  );
};
