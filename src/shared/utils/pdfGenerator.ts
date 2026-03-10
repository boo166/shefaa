import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface TableColumn {
  header: string;
  dataKey: string;
}

interface PdfOptions {
  title: string;
  subtitle?: string;
  columns: TableColumn[];
  data: any[];
  filename: string;
}

export function generatePDF(options: PdfOptions) {
  const { title, subtitle, columns, data, filename } = options;
  const doc = new jsPDF();

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 20);

  // Subtitle
  if (subtitle) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(subtitle, 14, 28);
  }

  // Table
  autoTable(doc, {
    startY: subtitle ? 35 : 28,
    head: [columns.map((c) => c.header)],
    body: data.map((row) => columns.map((c) => row[c.dataKey] ?? "")),
    theme: "grid",
    headStyles: {
      fillColor: [41, 128, 115], // primary color
      textColor: 255,
      fontStyle: "bold",
    },
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  // Save
  doc.save(filename);
}

// Specific helpers
export function generateInvoicePDF(invoice: any, patient: { full_name: string }) {
  generatePDF({
    title: `Invoice ${invoice.invoice_code}`,
    subtitle: `Patient: ${patient.full_name} | Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`,
    columns: [
      { header: "Service", dataKey: "service" },
      { header: "Amount", dataKey: "amount" },
      { header: "Status", dataKey: "status" },
    ],
    data: [
      {
        service: invoice.service,
        amount: `$${Number(invoice.amount).toLocaleString()}`,
        status: invoice.status,
      },
    ],
    filename: `invoice-${invoice.invoice_code}.pdf`,
  });
}

export function generatePrescriptionPDF(prescription: any, patient: { full_name: string }, doctor: { full_name: string }) {
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Prescription", 14, 20);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Patient: ${patient.full_name}`, 14, 35);
  doc.text(`Doctor: ${doctor.full_name}`, 14, 42);
  doc.text(`Date: ${new Date(prescription.prescribed_date).toLocaleDateString()}`, 14, 49);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Medication", 14, 65);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(prescription.medication, 14, 73);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Dosage", 14, 87);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(prescription.dosage, 14, 95);

  doc.save(`prescription-${prescription.id}.pdf`);
}

type ReportLocale = "en" | "ar";

const labels: Record<ReportLocale, Record<string, string>> = {
  en: {
    title: "Patient Report",
    generatedOn: "Generated on",
    patientInfo: "Patient Information",
    name: "Name",
    dob: "Date of Birth",
    gender: "Gender",
    bloodType: "Blood Type",
    phone: "Phone",
    email: "Email",
    insurance: "Insurance",
    status: "Status",
    medicalHistory: "Medical History",
    date: "Date",
    type: "Type",
    diagnosis: "Diagnosis",
    doctor: "Doctor",
    notes: "Notes",
    prescriptions: "Prescriptions",
    medication: "Medication",
    dosage: "Dosage",
    labOrders: "Laboratory Orders",
    test: "Test",
    result: "Result",
    billing: "Billing & Invoices",
    invoice: "Invoice #",
    service: "Service",
    amount: "Amount",
    page: "Page",
    of: "of",
  },
  ar: {
    title: "تقرير المريض",
    generatedOn: "تاريخ الإنشاء",
    patientInfo: "معلومات المريض",
    name: "الاسم",
    dob: "تاريخ الميلاد",
    gender: "الجنس",
    bloodType: "فصيلة الدم",
    phone: "الهاتف",
    email: "البريد الإلكتروني",
    insurance: "التأمين",
    status: "الحالة",
    medicalHistory: "السجل الطبي",
    date: "التاريخ",
    type: "النوع",
    diagnosis: "التشخيص",
    doctor: "الطبيب",
    notes: "ملاحظات",
    prescriptions: "الوصفات الطبية",
    medication: "الدواء",
    dosage: "الجرعة",
    labOrders: "طلبات المختبر",
    test: "الفحص",
    result: "النتيجة",
    billing: "الفواتير والمدفوعات",
    invoice: "رقم الفاتورة",
    service: "الخدمة",
    amount: "المبلغ",
    page: "صفحة",
    of: "من",
  },
};

interface PatientReportData {
  patient: {
    full_name: string;
    date_of_birth?: string | null;
    gender?: string | null;
    blood_type?: string | null;
    phone?: string | null;
    email?: string | null;
    insurance_provider?: string | null;
    status?: string;
  };
  medicalRecords: Array<{ record_date: string; diagnosis?: string | null; record_type: string; notes?: string | null; doctors?: { full_name: string } | null }>;
  prescriptions: Array<{ medication: string; dosage: string; prescribed_date: string; status: string; doctors?: { full_name: string } | null }>;
  labOrders: Array<{ test_name: string; order_date: string; status: string; result?: string | null; doctors?: { full_name: string } | null }>;
  invoices: Array<{ invoice_code: string; service: string; amount: number; invoice_date: string; status: string }>;
  clinic?: { name: string; logoUrl?: string | null };
  locale?: ReportLocale;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generatePatientReportPDF(data: PatientReportData) {
  const { patient, medicalRecords, prescriptions, labOrders, invoices, clinic, locale: lang = "en" } = data;
  const l = labels[lang];
  const doc = new jsPDF();
  const primaryColor: [number, number, number] = [41, 128, 115];
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 14;

  const addSectionTitle = (title: string) => {
    if (y > 250) { doc.addPage(); y = 20; }
    y += 6;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text(title, 14, y);
    y += 2;
    doc.setDrawColor(...primaryColor);
    doc.line(14, y, pageWidth - 14, y);
    y += 6;
    doc.setTextColor(0);
  };

  // ── Clinic Header with Logo ──
  if (clinic) {
    let logoLoaded = false;
    if (clinic.logoUrl) {
      const base64 = await loadImageAsBase64(clinic.logoUrl);
      if (base64) {
        try {
          doc.addImage(base64, "PNG", 14, y, 18, 18);
          logoLoaded = true;
        } catch { /* skip logo */ }
      }
    }
    const textX = logoLoaded ? 36 : 14;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text(clinic.name, textX, y + 8);
    doc.setDrawColor(220, 220, 220);
    y += 22;
    doc.line(14, y, pageWidth - 14, y);
    y += 6;
  }

  // ── Title ──
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryColor);
  doc.text(l.title, 14, y + 6);
  y += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`${l.generatedOn} ${new Date().toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}`, 14, y + 4);
  y += 10;

  // ── Patient Info ──
  addSectionTitle(l.patientInfo);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50);
  const info: [string, string][] = [
    [l.name, patient.full_name],
    [l.dob, patient.date_of_birth ? new Date(patient.date_of_birth + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US") : "—"],
    [l.gender, patient.gender ?? "—"],
    [l.bloodType, patient.blood_type ?? "—"],
    [l.phone, patient.phone ?? "—"],
    [l.email, patient.email ?? "—"],
    [l.insurance, patient.insurance_provider ?? "—"],
    [l.status, patient.status ?? "—"],
  ];
  info.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 60, y);
    y += 6;
  });

  // ── Medical History ──
  if (medicalRecords.length > 0) {
    addSectionTitle(l.medicalHistory);
    const table = autoTable(doc, {
      startY: y,
      head: [[l.date, l.type, l.diagnosis, l.doctor, l.notes]],
      body: medicalRecords.map((r) => [
        new Date(r.record_date + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US"),
        r.record_type?.replace("_", " ") ?? "—",
        r.diagnosis ?? "—",
        r.doctors?.full_name ?? "—",
        (r.notes ?? "—").substring(0, 60),
      ]),
      theme: "grid",
      headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ── Prescriptions ──
  if (prescriptions.length > 0) {
    addSectionTitle(l.prescriptions);
    autoTable(doc, {
      startY: y,
      head: [[l.medication, l.dosage, l.date, l.doctor, l.status]],
      body: prescriptions.map((rx) => [
        rx.medication,
        rx.dosage,
        new Date(rx.prescribed_date + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US"),
        rx.doctors?.full_name ?? "—",
        rx.status,
      ]),
      theme: "grid",
      headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ── Lab Orders ──
  if (labOrders.length > 0) {
    addSectionTitle(l.labOrders);
    autoTable(doc, {
      startY: y,
      head: [[l.test, l.date, l.doctor, l.status, l.result]],
      body: labOrders.map((lo) => [
        lo.test_name,
        new Date(lo.order_date + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US"),
        lo.doctors?.full_name ?? "—",
        lo.status,
        (lo.result ?? "—").substring(0, 50),
      ]),
      theme: "grid",
      headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ── Invoices ──
  if (invoices.length > 0) {
    addSectionTitle(l.billing);
    autoTable(doc, {
      startY: y,
      head: [[l.invoice, l.service, l.amount, l.date, l.status]],
      body: invoices.map((inv) => [
        inv.invoice_code,
        inv.service,
        `$${Number(inv.amount).toLocaleString()}`,
        new Date(inv.invoice_date + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US"),
        inv.status,
      ]),
      theme: "grid",
      headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
  }

  // ── Page numbers ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `${l.page} ${i} ${l.of} ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  doc.save(`patient-report-${patient.full_name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
