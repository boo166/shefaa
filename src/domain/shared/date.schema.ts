import { z } from "zod";

export const dateStringSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Invalid date",
});

export const dateTimeStringSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Invalid datetime",
});
