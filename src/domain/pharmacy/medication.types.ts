import type { z } from "zod";
import {
  medicationSchema,
  medicationCreateSchema,
  medicationUpdateSchema,
  medicationListParamsSchema,
  medicationSummarySchema,
} from "./medication.schema";

export type Medication = z.infer<typeof medicationSchema>;
export type MedicationCreateInput = z.infer<typeof medicationCreateSchema>;
export type MedicationUpdateInput = z.infer<typeof medicationUpdateSchema>;
export type MedicationListParams = z.infer<typeof medicationListParamsSchema>;
export type MedicationSummary = z.infer<typeof medicationSummarySchema>;
