import { useAuth } from "@/core/auth/authStore";
import { ServiceError } from "./errors";

export function getTenantContext() {
  const { user } = useAuth.getState();
  if (!user?.tenantId || !user?.id) {
    throw new ServiceError("Missing tenant context");
  }
  return { tenantId: user.tenantId, userId: user.id };
}
