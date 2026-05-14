import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { STORAGE_SIGNED_URL_TTLS } from "@/services/storage/signedUrlPolicy";

const BUCKET = "patient-documents";

export interface PatientDocumentsStorageRepository {
  upload(filePath: string, file: File, contentType: string): Promise<void>;
  download(filePath: string): Promise<Blob>;
  remove(filePath: string): Promise<void>;
}

export const patientDocumentsStorageRepository: PatientDocumentsStorageRepository = {
  async upload(filePath, file, contentType) {
    const { error } = await supabase.storage.from(BUCKET).upload(filePath, file, {
      contentType,
      upsert: false,
    });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to upload document", {
        code: error.code,
        details: error,
      });
    }
  },
  async download(filePath) {
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, STORAGE_SIGNED_URL_TTLS.PATIENT_DOCUMENT);
    if (signError || !signed?.signedUrl) {
      throw new ServiceError(signError?.message ?? "Failed to create signed URL", {
        code: signError?.code,
        details: signError,
      });
    }

    const response = await fetch(signed.signedUrl);
    if (!response.ok) {
      throw new ServiceError("Failed to download document", {
        code: "download_failed",
        details: { status: response.status },
      });
    }
    return await response.blob();
  },
  async remove(filePath) {
    const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
    if (error) {
      throw new ServiceError(error.message ?? "Failed to delete document", {
        code: error.code,
        details: error,
      });
    }
  },
};
