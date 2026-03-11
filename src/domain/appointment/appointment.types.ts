import type { z } from "zod";
import {
  appointmentSchema,
  appointmentWithDoctorSchema,
  appointmentWithPatientDoctorSchema,
  appointmentCreateSchema,
  appointmentUpdateSchema,
  appointmentListParamsSchema,
} from "./appointment.schema";

export type Appointment = z.infer<typeof appointmentSchema>;
export type AppointmentWithDoctor = z.infer<typeof appointmentWithDoctorSchema>;
export type AppointmentWithPatientDoctor = z.infer<typeof appointmentWithPatientDoctorSchema>;
export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateSchema>;
export type AppointmentListParams = z.infer<typeof appointmentListParamsSchema>;
