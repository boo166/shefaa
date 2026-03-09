import { useState, useRef } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { FileText, Upload, Trash2, Download, Loader2, File, Image, FileSpreadsheet } from "lucide-react";
import { formatDate } from "@/shared/utils/formatDate";

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

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["patient_documents", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_documents" as any)
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!patientId && !isDemo,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || isDemo) return;

    if (file.size > MAX_SIZE) {
      toast({ title: t("common.error"), description: "File must be under 10 MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.tenantId}/${patientId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("patient-documents")
      .upload(path, file);

    if (uploadErr) {
      toast({ title: t("common.error"), description: uploadErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { error: insertErr } = await supabase.from("patient_documents" as any).insert({
      patient_id: patientId,
      tenant_id: user.tenantId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      file_type: file.type,
      uploaded_by: user.id,
    });

    if (insertErr) {
      toast({ title: t("common.error"), description: insertErr.message, variant: "destructive" });
    } else {
      toast({ title: t("common.saved") });
      queryClient.invalidateQueries({ queryKey: ["patient_documents", patientId] });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDownload = async (doc: any) => {
    const { data, error } = await supabase.storage
      .from("patient-documents")
      .download(doc.file_path);
    if (error || !data) {
      toast({ title: t("common.error"), description: error?.message, variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const doc = documents.find((d: any) => d.id === deleteId);
    if (doc) {
      await supabase.storage.from("patient-documents").remove([(doc as any).file_path]);
      await supabase.from("patient_documents" as any).delete().eq("id", deleteId);
      queryClient.invalidateQueries({ queryKey: ["patient_documents", patientId] });
      toast({ title: t("common.saved") });
    }
    setDeleting(false);
    setDeleteId(null);
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
              {documents.map((doc: any) => {
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
