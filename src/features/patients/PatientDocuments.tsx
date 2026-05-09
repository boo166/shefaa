import { useRef, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { toast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives/Button";
import { FileUpload } from "@/components/primitives/FileUpload";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { DataTable, Column } from "@/shared/components/DataTable";
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Loader2,
  File,
  Image,
  FileSpreadsheet,
} from "lucide-react";
import { formatDate, formatNumber } from "@/shared/utils/formatDate";
import { patientDocumentsService } from "@/services/patients/patientDocuments.service";
import { queryKeys } from "@/services/queryKeys";
import type { PatientDocument } from "@/domain/patient/patient.types";

interface Props {
  patientId: string;
}

const FILE_ICONS: Record<string, typeof FileText> = {
  "application/pdf": FileText,
  "image/jpeg": Image,
  "image/png": Image,
  "image/webp": Image,
  "text/csv": FileSpreadsheet,
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const PatientDocuments = ({ patientId }: Props) => {
  const { t, locale, calendarType } = useI18n(["patients", "common"]);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: documents = [], isLoading } = useQuery<PatientDocument[]>({
    queryKey: queryKeys.patients.documents(patientId, user?.tenantId),
    queryFn: () => patientDocumentsService.listByPatient(patientId),
    enabled: !!patientId && !!user?.tenantId,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > MAX_SIZE) {
      toast({
        title: t("common.error"),
        description: t("patients.documentsSection.fileTooLarge"),
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      await patientDocumentsService.upload({
        patient_id: patientId,
        file,
      });
      toast({ title: t("common.saved") });
      queryClient.invalidateQueries({
        queryKey: queryKeys.patients.documents(patientId, user?.tenantId),
      });
    } catch (err: any) {
      toast({
        title: t("common.error"),
        description: err?.message ?? t("patients.documentsSection.uploadFailed"),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDownload = async (doc: PatientDocument) => {
    try {
      const blob = await patientDocumentsService.download({
        file_path: doc.file_path,
        id: doc.id,
        patient_id: doc.patient_id,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = doc.file_name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: t("common.error"),
        description: err?.message ?? t("patients.documentsSection.downloadFailed"),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);

    try {
      const result = await patientDocumentsService.remove(deleteId);
      queryClient.invalidateQueries({
        queryKey: queryKeys.patients.documents(patientId, user?.tenantId),
      });
      toast({ title: t("patients.documentsSection.deleteSuccess") });

      if (result?.storageError) {
        toast({
          title: t("common.error"),
          description: t("patients.documentsSection.deletePartialCleanup", {
            error: result.storageError,
          }),
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: t("common.error"),
        description: err?.message ?? t("patients.documentsSection.deleteFailed"),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${formatNumber(bytes, locale)} B`;
    if (bytes < 1024 * 1024) {
      return `${formatNumber(bytes / 1024, locale, { maximumFractionDigits: 1 })} KB`;
    }
    return `${formatNumber(bytes / (1024 * 1024), locale, { maximumFractionDigits: 1 })} MB`;
  };

  const columns: Column<PatientDocument>[] = [
    {
      key: "file_name",
      header: t("common.name"),
      searchable: true,
      render: (doc) => {
        const Icon = FILE_ICONS[doc.file_type] || File;
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="max-w-[200px] truncate font-medium">{doc.file_name}</span>
          </div>
        );
      },
    },
    {
      key: "created_at",
      header: t("common.date"),
      render: (doc) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(doc.created_at, locale, "datetime", calendarType)}
        </span>
      ),
    },
    {
      key: "file_size",
      header: t("common.size"),
      render: (doc) => (
        <span className="text-muted-foreground">{formatSize(doc.file_size)}</span>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      searchable: false,
      render: (doc) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleDownload(doc)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("common.download")}
            title={t("common.download")}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDeleteId(doc.id)}
            className="text-muted-foreground hover:text-destructive"
            aria-label={t("common.delete")}
            title={t("common.delete")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {t("patients.documents")} ({documents.length})
        </h3>
        <FileUpload
          variant="button"
          inputRef={fileRef}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.doc,.docx,.xls,.xlsx"
          onChange={handleUpload}
          disabled={uploading}
          loading={uploading}
          buttonLabel={t("patients.uploadDocument")}
          icon={<Upload className="h-4 w-4" />}
          className="shrink-0"
        />
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">{t("patients.noDocuments")}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => fileRef.current?.click()}
          >
            {t("patients.uploadDocument")}
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={documents}
          keyExtractor={(doc) => doc.id}
          searchable
          searchPlaceholder={t("common.search")}
          exportFileName={t("patients.documentsSection.exportFileName")}
          tableLabel={t("patients.documents")}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        title={t("common.delete")}
        message={t("patients.documentsSection.deleteConfirm")}
        confirmLabel={t("common.delete")}
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};
