import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const uuidListSchema = z.array(uuidSchema).min(1);
