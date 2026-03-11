import { z } from "zod";
import { dateStringSchema, dateTimeStringSchema } from "../shared/date.schema";
import { listParamsSchema } from "../shared/pagination.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const patientGenderEnum = z.enum(["male", "female"]);
export const patientStatusEnum = z.enum(["active", "inactive"]);
export const bloodTypeEnum = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);

const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(20)
  .regex(/^[0-9+().\-\s]+$/)
  .optional()
  .nullable();

const emailSchema = z.string().trim().email().optional().nullable();

export const patientSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  patient_code: z.string().min(1),
  full_name: z.string().trim().min(2).max(120),
  date_of_birth: dateStringSchema.optional().nullable(),
  gender: patientGenderEnum.optional().nullable(),
  blood_type: bloodTypeEnum.optional().nullable(),
  phone: phoneSchema,
  email: emailSchema,
  address: z.string().trim().max(255).optional().nullable(),
  insurance_provider: z.string().trim().max(120).optional().nullable(),
  status: patientStatusEnum,
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const patientCreateSchema = patientSchema
  .omit({
    id: true,
    tenant_id: true,
    patient_code: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    status: patientStatusEnum.optional(),
  });

export const patientUpdateSchema = patientCreateSchema.partial();

export const patientListParamsSchema = listParamsSchema;

export const medicalRecordTypeEnum = z.enum([
  "progress_note",
  "lab_review",
  "acute_visit",
  "annual_physical",
]);

export const medicalRecordSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  patient_id: uuidSchema,
  doctor_id: uuidSchema,
  record_date: dateStringSchema,
  diagnosis: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  record_type: medicalRecordTypeEnum,
  created_at: dateTimeStringSchema,
});

export const medicalRecordWithDoctorSchema = medicalRecordSchema.extend({
  doctors: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
});

const fileSchema = z.custom<File>((value) => {
  if (typeof File === "undefined") return false;
  return value instanceof File;
});

export const patientDocumentSchema = z.object({
  id: uuidSchema,
  patient_id: uuidSchema,
  tenant_id: uuidSchema,
  file_name: z.string().trim().min(1).max(255),
  file_path: z.string().trim().min(1),
  file_size: z.number().int().min(0),
  file_type: z.string().trim().min(1).max(120),
  uploaded_by: uuidSchema,
  notes: z.string().trim().max(500).optional().nullable(),
  created_at: dateTimeStringSchema,
});

export const patientDocumentCreateSchema = patientDocumentSchema.omit({
  id: true,
  tenant_id: true,
  created_at: true,
});

export const patientDocumentUploadSchema = z.object({
  patient_id: uuidSchema,
  file: fileSchema,
  notes: z.string().trim().max(500).optional().nullable(),
});
