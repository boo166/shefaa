import { ServiceError } from "./errors";

export function assertOk<T>(result: { data: T | null; error: any }) {
  if (result.error) {
    throw new ServiceError(result.error.message ?? "Supabase error", {
      code: result.error.code,
      details: result.error,
    });
  }
  return result.data as T;
}
