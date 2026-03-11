import type { z } from "zod";
import { profileSchema, profileUpdateSchema, profileWithRolesSchema } from "./profile.schema";

export type Profile = z.infer<typeof profileSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type ProfileWithRoles = z.infer<typeof profileWithRolesSchema>;
