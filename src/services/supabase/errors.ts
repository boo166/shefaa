export class ServiceError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, options?: { code?: string; status?: number; details?: unknown }) {
    super(message);
    this.name = "ServiceError";
    this.code = options?.code;
    this.status = options?.status;
    this.details = options?.details;
  }
}

export function toServiceError(err: unknown, fallbackMessage = "Unexpected service error") {
  if (err instanceof ServiceError) return err;
  if (err instanceof Error) return new ServiceError(err.message);
  return new ServiceError(fallbackMessage, { details: err });
}
