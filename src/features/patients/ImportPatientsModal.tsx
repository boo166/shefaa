import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, AlertTriangle, CheckCircle2, X, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportResult {
  success: number;
  errors: { row: number; message: string }[];
}

export const ImportPatientsModal = ({ open, onClose, onSuccess }: Props) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === "text/csv") {
      setFile(selected);
      setResult(null);
    } else {
      toast({ title: t("common.error"), description: "Please select a CSV file", variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (!file || !user) return;

    setImporting(true);
    setResult(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

      // Expected headers: full_name, date_of_birth, gender, blood_type, phone, email, address, insurance_provider
      const requiredHeaders = ["full_name"];
      const missing = requiredHeaders.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        toast({
          title: t("common.error"),
          description: `Missing required columns: ${missing.join(", ")}`,
          variant: "destructive",
        });
        setImporting(false);
        return;
      }

      const errors: { row: number; message: string }[] = [];
      let success = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        const row: any = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || null;
        });

        if (!row.full_name) {
          errors.push({ row: i + 1, message: "Missing full_name" });
          continue;
        }

        // Generate patient code
        const count = await supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", user.tenantId);
        const patientCode = `PT-${String((count.count ?? 0) + 1 + success).padStart(3, "0")}`;

        const { error } = await supabase.from("patients").insert({
          tenant_id: user.tenantId,
          patient_code: patientCode,
          full_name: row.full_name,
          date_of_birth: row.date_of_birth || null,
          gender: row.gender || null,
          blood_type: row.blood_type || null,
          phone: row.phone || null,
          email: row.email || null,
          address: row.address || null,
          insurance_provider: row.insurance_provider || null,
          status: "active",
        });

        if (error) {
          errors.push({ row: i + 1, message: error.message });
        } else {
          success++;
        }
      }

      setResult({ success, errors });

      if (success > 0) {
        onSuccess();
        toast({ title: `${success} patients imported successfully` });
      }
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csv = "full_name,date_of_birth,gender,blood_type,phone,email,address,insurance_provider\nJohn Doe,1985-03-15,male,A+,+1234567890,john@example.com,123 Main St,Insurance Co";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "patients-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("patients.importPatients")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>
              {t("patients.importDescription")}
            </AlertDescription>
          </Alert>

          <Button variant="outline" onClick={handleDownloadTemplate} className="w-full">
            <Download className="h-4 w-4" /> {t("patients.downloadTemplate")}
          </Button>

          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">
                {file ? file.name : t("patients.selectCSVFile")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("patients.clickToSelectFile")}
              </p>
            </label>
          </div>

          {result && (
            <Alert variant={result.errors.length > 0 ? "destructive" : "default"}>
              {result.success > 0 && <CheckCircle2 className="h-4 w-4" />}
              {result.errors.length > 0 && <AlertTriangle className="h-4 w-4" />}
              <AlertDescription>
                <p className="font-medium">
                  {result.success > 0 && `✓ ${result.success} patients imported successfully`}
                </p>
                {result.errors.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="font-medium">Errors:</p>
                    {result.errors.slice(0, 5).map((err, i) => (
                      <p key={i}>
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                    {result.errors.length > 5 && (
                      <p>... and {result.errors.length - 5} more errors</p>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.close")}
            </Button>
            <Button onClick={handleImport} disabled={!file || importing}>
              {importing ? t("common.loading") : t("patients.import")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
