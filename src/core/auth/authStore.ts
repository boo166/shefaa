import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupaUser } from "@supabase/supabase-js";
import { profileStorage } from "@/services/settings/profile.storage";

export type Role = "super_admin" | "clinic_admin" | "doctor" | "receptionist" | "nurse" | "accountant";

export type Permission =
  | "manage_clinic" | "manage_users" | "view_dashboard"
  | "manage_patients" | "view_patients"
  | "manage_appointments" | "view_appointments"
  | "manage_medical_records" | "view_medical_records"
  | "manage_billing" | "view_billing"
  | "manage_pharmacy" | "manage_laboratory" | "view_reports"
  | "super_admin";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    "super_admin",
    "manage_clinic", "manage_users", "view_dashboard",
    "manage_patients", "view_patients", "manage_appointments", "view_appointments",
    "manage_medical_records", "view_medical_records",
    "manage_billing", "view_billing",
    "manage_pharmacy", "manage_laboratory", "view_reports",
  ],
  clinic_admin: [
    "manage_clinic", "manage_users", "view_dashboard",
    "manage_patients", "view_patients", "manage_appointments", "view_appointments",
    "manage_medical_records", "view_medical_records",
    "manage_billing", "view_billing",
    "manage_pharmacy", "manage_laboratory", "view_reports",
  ],
  doctor: [
    "view_dashboard", "view_patients", "manage_medical_records", "view_medical_records",
    "view_appointments", "manage_appointments",
  ],
  receptionist: [
    "view_dashboard", "view_patients", "manage_patients",
    "manage_appointments", "view_appointments",
  ],
  nurse: [
    "view_dashboard", "view_patients", "view_medical_records", "view_appointments",
  ],
  accountant: [
    "view_dashboard", "manage_billing", "view_billing", "view_reports",
  ],
};

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  avatar?: string;
}

interface AuthState {
  user: AppUser | null;
  supabaseUser: SupaUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: AppUser | null, supabaseUser?: SupaUser | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  hasRole: (role: Role) => boolean;
  initialize: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      supabaseUser: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: (user, supabaseUser) => set({
        user,
        supabaseUser: supabaseUser ?? null,
        isAuthenticated: !!user,
        isLoading: false,
      }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: async () => {
        await supabase.auth.signOut();
        set({ user: null, supabaseUser: null, isAuthenticated: false });
      },
      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;
        return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
      },
      hasRole: (role) => get().user?.role === role,
      initialize: async () => {
        set({ isLoading: true });
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Auth timeout")), 8000)
        );
        try {
          const sessionResult = await Promise.race([
            supabase.auth.getSession(),
            timeout,
          ]);
          const session = (sessionResult as any).data?.session;
          if (session?.user) {
            await Promise.race([
              loadUserProfile(session.user, set),
              timeout,
            ]);
          } else {
            set({ user: null, supabaseUser: null, isAuthenticated: false });
          }
        } catch {
          set({ user: null, supabaseUser: null, isAuthenticated: false });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: "medflow-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

async function loadUserProfile(
  supaUser: SupaUser,
  set: (partial: Partial<AuthState>) => void
) {
  // Get profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, user_id, tenant_id, full_name, avatar_url, tenants:tenant_id(name, slug)")
    .eq("user_id", supaUser.id)
    .single();

  // Get role
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", supaUser.id)
    .single();

  if (profile && roleData) {
    const tenant = profile.tenants as any;
    let avatarUrl: string | undefined = profile.avatar_url ?? undefined;

    if (avatarUrl && !avatarUrl.startsWith("http")) {
      try {
        avatarUrl = await profileStorage.getSignedAvatarUrl(avatarUrl);
      } catch {
        avatarUrl = undefined;
      }
    }

    set({
      user: {
        id: supaUser.id,
        name: profile.full_name,
        email: supaUser.email ?? "",
        role: roleData.role as Role,
        tenantId: profile.tenant_id,
        tenantSlug: tenant?.slug ?? "default",
        tenantName: tenant?.name ?? "Clinic",
        avatar: avatarUrl,
      },
      supabaseUser: supaUser,
      isAuthenticated: true,
    });
  } else {
    set({ user: null, supabaseUser: null, isAuthenticated: false });
  }
}

// Listen for auth changes
supabase.auth.onAuthStateChange(async (event, session) => {
  const { setUser, setLoading } = useAuth.getState();
  if (event === "SIGNED_IN" && session?.user) {
    setLoading(true);
    await loadUserProfile(session.user, (partial) => {
      if (partial.user) {
        setUser(partial.user, partial.supabaseUser);
      } else {
        setUser(null);
      }
    });
    setLoading(false);
  } else if (event === "SIGNED_OUT") {
    setUser(null);
  }
});
