import { useState, useRef } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { toast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { FileText, Upload, Trash2, Download, Loader2, File, Image, FileSpreadsheet } from "lucide-react";
import { formatDate } from "@/shared/utils/formatDate";
import { patientDocumentsService } from "@/services/patients/patientDocuments.service";
import { queryKeys } from "@/services/queryKeys";
import type { PatientDocument } from "@/domain/patient/patient.types";

interface Props {
  patientId: string;
  isDemo: boolean;
}

const FILE_ICONS: Record<string, typeof FileText> = {
  "application/pdf": FileText,
  "image/jpeg": Image,
  "image/png": Image,
  "image/webp": Image,
  "text/csv": FileSpreadsheet,
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const PatientDocuments = ({ patientId, isDemo }: Props) => {
  const { t, locale, calendarType } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: documents = [], isLoading } = useQuery<PatientDocument[]>({
    queryKey: queryKeys.patients.documents(patientId, user?.tenantId),
    queryFn: () => patientDocumentsService.listByPatient(patientId),
    enabled: !!patientId && !!user?.tenantId && !isDemo,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || isDemo) return;

    if (file.size > MAX_SIZE) {
      toast({ title: t("common.error"), description: "File must be under 10 MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      await patientDocumentsService.upload({
        patient_id: patientId,
        file,
      });
      toast({ title: t("common.saved") });
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.documents(patientId, user?.tenantId) });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err?.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDownload = async (doc: PatientDocument) => {
    try {
      const blob = await patientDocumentsService.download(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: t("common.error"), description: err?.message ?? "Download failed", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);

    try {
      const result = await patientDocumentsService.remove(deleteId);
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.documents(patientId, user?.tenantId) });
      toast({ title: t("common.saved") });
      if (result?.storageError) {
        toast({
          title: t("common.error"),
          description: `Document record deleted, but file cleanup failed: ${result.storageError}`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: t("common.error"), description: err?.message ?? "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isDemo) {
    return (
      <div className="bg-card rounded-lg border p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">{t("patients.noDocuments")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t("patients.documents")} ({documents.length})</h3>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {t("patients.uploadDocument")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.doc,.docx,.xls,.xlsx"
          onChange={handleUpload}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-card rounded-lg border p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{t("patients.noDocuments")}</p>
          <Button variant="outline" className="mt-4" onClick={() => fileRef.current?.click()}>
            {t("patients.uploadDocument")}
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="data-table">
            <thead>
              <tr className="bg-muted/50">
                <th>{t("common.name")}</th>
                <th>{t("common.date")}</th>
                <th>Size</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc: PatientDocument) => {
                const Icon = FILE_ICONS[doc.file_type] || File;
                return (
                  <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                    <td>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate max-w-[200px]">{doc.file_name}</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground whitespace-nowrap">
                      {formatDate(doc.created_at, locale, "datetime", calendarType)}
                    </td>
                    <td className="text-muted-foreground">{formatSize(doc.file_size)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(doc.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          title={t("common.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title={t("common.delete")}
        message="Are you sure you want to delete this document?"
        confirmLabel={t("common.delete")}
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};
