import { ReactNode, forwardRef } from "react";
import { Permission } from "./authStore";
import { useAuth } from "./authStore";

interface PermissionGuardProps {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

export const PermissionGuard = forwardRef<HTMLDivElement, PermissionGuardProps>(
  ({ permission, children, fallback = null }, _ref) => {
    const hasPermission = useAuth((s) => s.hasPermission);
    return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
  }
);
PermissionGuard.displayName = "PermissionGuard";
