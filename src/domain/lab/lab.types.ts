import type { z } from "zod";
import {
  labResultSchema,
  labOrderWithDoctorSchema,
  labOrderWithPatientDoctorSchema,
  labResultCreateSchema,
  labResultUpdateSchema,
  labResultListParamsSchema,
} from "./lab.schema";

export type LabResult = z.infer<typeof labResultSchema>;
export type LabOrderWithDoctor = z.infer<typeof labOrderWithDoctorSchema>;
export type LabOrderWithPatientDoctor = z.infer<typeof labOrderWithPatientDoctorSchema>;
export type LabResultCreateInput = z.infer<typeof labResultCreateSchema>;
export type LabResultUpdateInput = z.infer<typeof labResultUpdateSchema>;
export type LabResultListParams = z.infer<typeof labResultListParamsSchema>;
