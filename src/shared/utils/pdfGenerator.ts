import { jsPDF } from "jspdf";
import "jspdf-autotable";

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
  (doc as any).autoTable({
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
  const pageCount = (doc as any).internal.getNumberOfPages();
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
}

export function generatePatientReportPDF(data: PatientReportData) {
  const { patient, medicalRecords, prescriptions, labOrders, invoices } = data;
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

  // ── Title ──
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryColor);
  doc.text("Patient Report", 14, y + 6);
  y += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, y + 4);
  y += 10;

  // ── Patient Info ──
  addSectionTitle("Patient Information");
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50);
  const info = [
    ["Name", patient.full_name],
    ["Date of Birth", patient.date_of_birth ? new Date(patient.date_of_birth + "T00:00:00").toLocaleDateString() : "—"],
    ["Gender", patient.gender ?? "—"],
    ["Blood Type", patient.blood_type ?? "—"],
    ["Phone", patient.phone ?? "—"],
    ["Email", patient.email ?? "—"],
    ["Insurance", patient.insurance_provider ?? "—"],
    ["Status", patient.status ?? "—"],
  ];
  info.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 55, y);
    y += 6;
  });

  // ── Medical History ──
  if (medicalRecords.length > 0) {
    addSectionTitle("Medical History");
    (doc as any).autoTable({
      startY: y,
      head: [["Date", "Type", "Diagnosis", "Doctor", "Notes"]],
      body: medicalRecords.map((r) => [
        new Date(r.record_date + "T00:00:00").toLocaleDateString(),
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
    addSectionTitle("Prescriptions");
    (doc as any).autoTable({
      startY: y,
      head: [["Medication", "Dosage", "Date", "Doctor", "Status"]],
      body: prescriptions.map((rx) => [
        rx.medication,
        rx.dosage,
        new Date(rx.prescribed_date + "T00:00:00").toLocaleDateString(),
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
    addSectionTitle("Laboratory Orders");
    (doc as any).autoTable({
      startY: y,
      head: [["Test", "Date", "Doctor", "Status", "Result"]],
      body: labOrders.map((l) => [
        l.test_name,
        new Date(l.order_date + "T00:00:00").toLocaleDateString(),
        l.doctors?.full_name ?? "—",
        l.status,
        (l.result ?? "—").substring(0, 50),
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
    addSectionTitle("Billing & Invoices");
    (doc as any).autoTable({
      startY: y,
      head: [["Invoice #", "Service", "Amount", "Date", "Status"]],
      body: invoices.map((inv) => [
        inv.invoice_code,
        inv.service,
        `$${Number(inv.amount).toLocaleString()}`,
        new Date(inv.invoice_date + "T00:00:00").toLocaleDateString(),
        inv.status,
      ]),
      theme: "grid",
      headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
  }

  // ── Page numbers ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  doc.save(`patient-report-${patient.full_name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
