import { ZodError } from "zod";

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

export class ValidationError extends ServiceError {
  constructor(message = "Validation failed", options?: { details?: unknown }) {
    super(message, { code: "VALIDATION_ERROR", status: 400, details: options?.details });
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends ServiceError {
  constructor(message = "Not authorized", options?: { code?: string; details?: unknown }) {
    super(message, { code: options?.code ?? "NOT_AUTHORIZED", status: 403, details: options?.details });
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = "Not found", options?: { code?: string; details?: unknown }) {
    super(message, { code: options?.code ?? "NOT_FOUND", status: 404, details: options?.details });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ServiceError {
  constructor(message = "Conflict", options?: { code?: string; details?: unknown }) {
    super(message, { code: options?.code ?? "CONFLICT", status: 409, details: options?.details });
    this.name = "ConflictError";
  }
}

export class BusinessRuleError extends ServiceError {
  constructor(message = "Business rule violation", options?: { code?: string; details?: unknown }) {
    super(message, { code: options?.code ?? "BUSINESS_RULE", status: 422, details: options?.details });
    this.name = "BusinessRuleError";
  }
}

function mapServiceError(err: ServiceError) {
  if (err.code === "23505") return new ConflictError(err.message, { code: err.code, details: err.details });
  if (err.code === "23P01") return new ConflictError(err.message, { code: err.code, details: err.details });
  if (
    err.message.toLowerCase().includes("recent password authentication is required")
    || err.message.toLowerCase().includes("privileged step-up grant required")
  ) {
    return new AuthorizationError(err.message, { code: "FRESH_AUTH_REQUIRED", details: err.details });
  }
  if (err.code === "42501" || err.code === "PGRST301") {
    if (err.message.toLowerCase().includes("recent password authentication")) {
      return new AuthorizationError(err.message, { code: "FRESH_AUTH_REQUIRED", details: err.details });
    }
    return new AuthorizationError(err.message, { code: err.code, details: err.details });
  }
  if (err.code === "PGRST116") return new NotFoundError(err.message, { code: err.code, details: err.details });
  return err;
}

export function toServiceError(err: unknown, fallbackMessage = "Unexpected service error") {
  if (err instanceof ServiceError) return mapServiceError(err);
  if (err instanceof ZodError) return new ValidationError("Validation failed", { details: err.flatten() });
  if (err instanceof Error) return new ServiceError(err.message);
  return new ServiceError(fallbackMessage, { details: err });
}
