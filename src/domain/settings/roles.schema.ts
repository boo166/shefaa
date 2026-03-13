import { z } from "zod";

export const appRoleEnum = z.enum([
  "super_admin",
  "clinic_admin",
  "doctor",
  "receptionist",
  "nurse",
  "accountant",
]);
