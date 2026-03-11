import type { z } from "zod";
import {
  prescriptionSchema,
  prescriptionWithDoctorSchema,
  prescriptionCreateSchema,
  prescriptionUpdateSchema,
  prescriptionListParamsSchema,
} from "./prescription.schema";

export type Prescription = z.infer<typeof prescriptionSchema>;
export type PrescriptionWithDoctor = z.infer<typeof prescriptionWithDoctorSchema>;
export type PrescriptionCreateInput = z.infer<typeof prescriptionCreateSchema>;
export type PrescriptionUpdateInput = z.infer<typeof prescriptionUpdateSchema>;
export type PrescriptionListParams = z.infer<typeof prescriptionListParamsSchema>;
