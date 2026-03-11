import type { z } from "zod";
import {
  insuranceClaimSchema,
  insuranceClaimWithPatientSchema,
  insuranceClaimCreateSchema,
  insuranceClaimUpdateSchema,
  insuranceClaimListParamsSchema,
  insuranceSummarySchema,
} from "./insurance.schema";

export type InsuranceClaim = z.infer<typeof insuranceClaimSchema>;
export type InsuranceClaimWithPatient = z.infer<typeof insuranceClaimWithPatientSchema>;
export type InsuranceClaimCreateInput = z.infer<typeof insuranceClaimCreateSchema>;
export type InsuranceClaimUpdateInput = z.infer<typeof insuranceClaimUpdateSchema>;
export type InsuranceClaimListParams = z.infer<typeof insuranceClaimListParamsSchema>;
export type InsuranceSummary = z.infer<typeof insuranceSummarySchema>;
