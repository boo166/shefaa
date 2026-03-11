import { z } from "zod";
import {
  patientDocumentCreateSchema,
  patientDocumentSchema,
  patientDocumentUploadSchema,
} from "@/domain/patient/patient.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import type { PatientDocumentCreateInput, PatientDocumentUploadInput } from "@/domain/patient/patient.types";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { patientDocumentsRepository } from "./patientDocuments.repository";
import {
  downloadPatientDocument,
  removePatientDocument,
  uploadPatientDocument,
} from "./patientDocuments.storage";

export const patientDocumentsService = {
  async upload(input: PatientDocumentUploadInput) {
    try {
      const parsed = patientDocumentUploadSchema.parse(input);
      const { tenantId, userId } = getTenantContext();
      const uploadResult = await uploadPatientDocument({
        tenantId,
        patientId: parsed.patient_id,
        file: parsed.file,
      });

      try {
        const metadata: PatientDocumentCreateInput = {
          patient_id: parsed.patient_id,
          file_name: uploadResult.fileName,
          file_path: uploadResult.filePath,
          file_size: uploadResult.fileSize,
          file_type: uploadResult.fileType,
          uploaded_by: userId,
          notes: parsed.notes ?? null,
        };
        const validated = patientDocumentCreateSchema.parse(metadata);
        const created = await patientDocumentsRepository.createMetadata(validated, tenantId);
        return patientDocumentSchema.parse(created);
      } catch (err) {
        await removePatientDocument(tenantId, uploadResult.filePath).catch(() => undefined);
        throw err;
      }
    } catch (err) {
      throw toServiceError(err, "Failed to upload patient document");
    }
  },
  async listByPatient(patientId: string) {
    try {
      const parsedId = uuidSchema.parse(patientId);
      const { tenantId } = getTenantContext();
      const docs = await patientDocumentsRepository.listByPatient(parsedId, tenantId);
      return z.array(patientDocumentSchema).parse(docs);
    } catch (err) {
      throw toServiceError(err, "Failed to load patient documents");
    }
  },
  async download(document: { file_path: string }) {
    try {
      const parsed = patientDocumentSchema.pick({ file_path: true }).parse(document);
      const { tenantId } = getTenantContext();
      return await downloadPatientDocument(tenantId, parsed.file_path);
    } catch (err) {
      throw toServiceError(err, "Failed to download patient document");
    }
  },
  async remove(documentId: string) {
    try {
      const parsedId = uuidSchema.parse(documentId);
      const { tenantId } = getTenantContext();
      const deleted = await patientDocumentsRepository.remove(parsedId, tenantId);
      const parsedDeleted = deleted
        ? patientDocumentSchema.pick({ file_path: true }).parse(deleted)
        : null;
      if (parsedDeleted?.file_path) {
        try {
          await removePatientDocument(tenantId, parsedDeleted.file_path);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Storage cleanup failed";
          return { storageError: message };
        }
      }
      return {};
    } catch (err) {
      throw toServiceError(err, "Failed to delete patient document");
    }
  },
};
