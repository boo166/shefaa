import type { z } from "zod";
import {
  patientSchema,
  patientCreateSchema,
  patientUpdateSchema,
  patientListParamsSchema,
  medicalRecordSchema,
  medicalRecordWithDoctorSchema,
  patientDocumentSchema,
  patientDocumentCreateSchema,
  patientDocumentUploadSchema,
} from "./patient.schema";

export type Patient = z.infer<typeof patientSchema>;
export type PatientCreateInput = z.infer<typeof patientCreateSchema>;
export type PatientUpdateInput = z.infer<typeof patientUpdateSchema>;
export type PatientListParams = z.infer<typeof patientListParamsSchema>;
export type MedicalRecord = z.infer<typeof medicalRecordSchema>;
export type MedicalRecordWithDoctor = z.infer<typeof medicalRecordWithDoctorSchema>;
export type PatientDocument = z.infer<typeof patientDocumentSchema>;
export type PatientDocumentCreateInput = z.infer<typeof patientDocumentCreateSchema>;
export type PatientDocumentUploadInput = z.infer<typeof patientDocumentUploadSchema>;
