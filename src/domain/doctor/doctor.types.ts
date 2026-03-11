import type { z } from "zod";
import {
  doctorSchema,
  doctorCreateSchema,
  doctorUpdateSchema,
  doctorListParamsSchema,
} from "./doctor.schema";

export type Doctor = z.infer<typeof doctorSchema>;
export type DoctorCreateInput = z.infer<typeof doctorCreateSchema>;
export type DoctorUpdateInput = z.infer<typeof doctorUpdateSchema>;
export type DoctorListParams = z.infer<typeof doctorListParamsSchema>;
