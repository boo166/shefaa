import { z } from "zod";
import {
  patientCreateSchema,
  patientListParamsSchema,
  patientSchema,
  patientUpdateSchema,
} from "@/domain/patient/patient.schema";
import { uuidListSchema, uuidSchema } from "@/domain/shared/identifiers.schema";
import type { PatientCreateInput, PatientListParams, PatientUpdateInput } from "@/domain/patient/patient.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { BusinessRuleError, ConflictError, NotFoundError, toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { withAuthStaleGuard } from "@/services/auth/authContextSnapshot";
import { patientRepository } from "./patient.repository";
import { requirePatientAccess } from "./patientAccess";

const PATIENT_READ = [Capabilities.patients.view, Capabilities.patients.manage];
const PATIENT_WRITE = [Capabilities.patients.manage];

export const patientService = {
  async listPaged(params: PatientListParams) {
    try {
      const parsed = patientListParamsSchema.parse(params);
      const { tenantId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...PATIENT_READ] });
      const result = await patientRepository.listPaged(parsed, tenantId);
      const data = z.array(patientSchema).parse(result.data);
      const count = z.number().int().nonnegative().parse(result.count);
      return { data, count };
    } catch (err) {
      throw toServiceError(err, "Failed to load patients");
    }
  },
  async getById(id: string) {
    try {
      const parsedId = uuidSchema.parse(id);
      const { tenantId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...PATIENT_READ] });
      const result = await patientRepository.getById(parsedId, tenantId);
      return patientSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load patient");
    }
  },
  async create(input: PatientCreateInput) {
    try {
      const parsed = patientCreateSchema.parse(input);
      const { tenantId, userId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...PATIENT_WRITE] });
      return await withAuthStaleGuard(async () => {
      if (parsed.full_name && parsed.date_of_birth) {
        const duplicates = await patientRepository.findByNameAndDOB(
          parsed.full_name,
          parsed.date_of_birth,
          tenantId,
        );
        if (duplicates.length > 0) {
          throw new ConflictError(
            `Patient "${parsed.full_name}" born on ${parsed.date_of_birth} already exists`,
            {
              code: "DUPLICATE_PATIENT",
              details: {
                possibleDuplicates: duplicates.map((item) => ({
                  id: item.id,
                  patient_code: item.patient_code,
                  full_name: item.full_name,
                  date_of_birth: item.date_of_birth,
                })),
              },
            },
          );
        }
      }
      const result = await patientRepository.create(parsed, tenantId, userId);
      const patient = patientSchema.parse(result);
      return patient;
      });
    } catch (err) {
      throw toServiceError(err, "Failed to create patient");
    }
  },
  async update(id: string, input: PatientUpdateInput) {
    try {
      const parsedId = uuidSchema.parse(id);
      const parsed = patientUpdateSchema.parse(input);
      const { tenantId, userId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...PATIENT_WRITE] });
      return await withAuthStaleGuard(async () => {
      if (parsed.status === "inactive") {
        const hasActive = await patientRepository.hasActiveAppointments(parsedId, tenantId);
        if (hasActive) {
          throw new BusinessRuleError("Cannot deactivate patient with active appointments", {
            code: "PATIENT_HAS_ACTIVE_APPOINTMENTS",
          });
        }
      }
      const { expected_updated_at, ...updates } = parsed;
      const result = await patientRepository.update(parsedId, updates, tenantId, expected_updated_at, userId);
      if (!result) {
        if (expected_updated_at) {
          throw new ConflictError("Patient was modified by another user", {
            code: "CONCURRENT_UPDATE",
          });
        }
        throw new NotFoundError("Patient not found");
      }
      return patientSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to update patient");
    }
  },
  async deleteBulk(ids: string[]) {
    try {
      const parsed = uuidListSchema.parse(ids);
      const { tenantId, userId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...PATIENT_WRITE] });
      return await withAuthStaleGuard(async () => patientRepository.deleteBulk(parsed, tenantId, userId));
    } catch (err) {
      throw toServiceError(err, "Failed to delete patients");
    }
  },
  async archive(id: string) {
    try {
      const parsedId = uuidSchema.parse(id);
      const { tenantId, userId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...PATIENT_WRITE] });
      return await withAuthStaleGuard(async () => {
      const hasActive = await patientRepository.hasActiveAppointments(parsedId, tenantId);
      if (hasActive) {
        throw new BusinessRuleError("Cannot archive patient with active appointments", {
          code: "PATIENT_HAS_ACTIVE_APPOINTMENTS",
        });
      }
      const result = await patientRepository.archive(parsedId, tenantId, userId);
      return patientSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to archive patient");
    }
  },
  async restore(id: string) {
    try {
      const parsedId = uuidSchema.parse(id);
      const { tenantId, userId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...PATIENT_WRITE] });
      return await withAuthStaleGuard(async () => {
      const result = await patientRepository.restore(parsedId, tenantId, userId);
      return patientSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to restore patient");
    }
  },
};
