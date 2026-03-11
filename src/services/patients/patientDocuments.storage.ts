import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

const BUCKET = "patient-documents";

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .replace(/[\\/]+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .trim();
  return cleaned.length > 0 ? cleaned : "document";
}

function assertTenantPath(tenantId: string, filePath: string) {
  if (!filePath.startsWith(`${tenantId}/`)) {
    throw new ServiceError("Invalid document path for tenant");
  }
}

export async function uploadPatientDocument(options: {
  tenantId: string;
  patientId: string;
  file: File;
}) {
  const safeName = sanitizeFileName(options.file.name);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "");
  const filePath = `${options.tenantId}/patients/${options.patientId}/${timestamp}-${safeName}`;

  const { error } = await supabase
    .storage
    .from(BUCKET)
    .upload(filePath, options.file, {
      contentType: options.file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw new ServiceError(error.message ?? "Failed to upload document", {
      code: error.code,
      details: error,
    });
  }

  return {
    filePath,
    fileName: options.file.name,
    fileSize: options.file.size,
    fileType: options.file.type || "application/octet-stream",
  };
}

export async function downloadPatientDocument(tenantId: string, filePath: string) {
  assertTenantPath(tenantId, filePath);
  const { data, error } = await supabase.storage.from(BUCKET).download(filePath);
  if (error || !data) {
    throw new ServiceError(error?.message ?? "Failed to download document", {
      code: error?.code,
      details: error,
    });
  }
  return data;
}

export async function removePatientDocument(tenantId: string, filePath: string) {
  assertTenantPath(tenantId, filePath);
  const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
  if (error) {
    throw new ServiceError(error.message ?? "Failed to delete document", {
      code: error.code,
      details: error,
    });
  }
}
