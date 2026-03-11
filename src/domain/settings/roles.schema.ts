import { z } from "zod";

export const appRoleEnum = z.enum([
  "clinic_admin",
  "doctor",
  "receptionist",
  "nurse",
  "accountant",
]);
