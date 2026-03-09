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
