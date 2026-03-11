import type { z } from "zod";
import { doctorScheduleSchema, doctorScheduleUpsertSchema } from "./doctorSchedule.schema";

export type DoctorSchedule = z.infer<typeof doctorScheduleSchema>;
export type DoctorScheduleUpsertInput = z.infer<typeof doctorScheduleUpsertSchema>;
