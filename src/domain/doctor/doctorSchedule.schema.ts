import { z } from "zod";
import { dateTimeStringSchema } from "../shared/date.schema";
import { uuidSchema } from "../shared/identifiers.schema";

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
  message: "Invalid time",
});

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number.parseInt(part, 10));
  return hour * 60 + minute;
}

function scheduleTimeRefinement(data: { start_time: string; end_time: string }, ctx: z.RefinementCtx) {
  if (timeToMinutes(data.end_time) <= timeToMinutes(data.start_time)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Schedule end_time must be after start_time",
      path: ["end_time"],
    });
  }
}

const doctorScheduleBaseSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  doctor_id: uuidSchema,
  day_of_week: z.number().int().min(0).max(6),
  start_time: timeStringSchema,
  end_time: timeStringSchema,
  is_active: z.boolean(),
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const doctorScheduleSchema = doctorScheduleBaseSchema.superRefine(scheduleTimeRefinement);

const doctorScheduleUpsertBaseSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: timeStringSchema,
  end_time: timeStringSchema,
  is_active: z.boolean(),
});

export const doctorScheduleUpsertSchema = doctorScheduleUpsertBaseSchema.superRefine(scheduleTimeRefinement);
