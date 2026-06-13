import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { RuntimeEpochQueryBridge } from "@/components/providers/RuntimeEpochQueryBridge";
import { queryClient } from "@/services/query/queryClient.instance";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SessionTimeout } from "./features/auth/SessionTimeout";
import { ReauthDialog } from "./features/auth/ReauthDialog";
import { ProtectedRoute } from "./core/auth/ProtectedRoute";
import { PortalProtectedRoute } from "./core/auth/PortalProtectedRoute";
import { SubscriptionProvider } from "./core/subscription/SubscriptionContext";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";
import { ensureNamespaces, translatePath, type TranslationNamespace } from "./core/i18n/config";

function lazyPage<TModule>(
  loader: () => Promise<TModule>,
  selector: (module: TModule) => React.ComponentType,
  namespaces: readonly TranslationNamespace[],
) {
  return lazy(async () => {
    await ensureNamespaces(namespaces);
    const module = await loader();
    return { default: selector(module) };
  });
}

const LandingPage = lazyPage(() => import("./pages/LandingPage"), (m) => m.LandingPage, ["common", "landing", "auth"]);
const AdminDashboardPage = lazyPage(() => import("./features/admin/AdminDashboardPage"), (m) => m.AdminDashboardPage, ["common", "admin"]);
const RuntimeOpsPage = lazyPage(() => import("./features/admin/RuntimeOpsPage"), (m) => m.RuntimeOpsPage, ["common", "admin"]);
const LoginPage = lazyPage(() => import("./pages/LoginPage"), (m) => m.LoginPage, ["common", "auth"]);
const MfaPage = lazyPage(() => import("./pages/MfaPage"), (m) => m.MfaPage, ["common", "auth"]);
const ForgotPasswordPage = lazyPage(() => import("./pages/ForgotPasswordPage"), (m) => m.ForgotPasswordPage, ["common", "auth"]);
const ResetPasswordPage = lazyPage(() => import("./pages/ResetPasswordPage"), (m) => m.ResetPasswordPage, ["common", "auth"]);
const PrivilegedSecurityPage = lazyPage(() => import("./pages/PrivilegedSecurityPage"), (m) => m.PrivilegedSecurityPage, ["common", "auth", "settings"]);
const TutorialPage = lazyPage(() => import("./pages/TutorialPage"), (m) => m.TutorialPage, ["common", "tutorial"]);
const PricingPage = lazyPage(() => import("./pages/PricingPage"), (m) => m.PricingPage, ["common", "landing"]);
const ClinicLayout = lazyPage(() => import("./layouts/ClinicLayout"), (m) => m.ClinicLayout, ["common", "auth"]);
const PortalLayout = lazyPage(() => import("./features/portal/PortalLayout"), (m) => m.PortalLayout, ["common", "portal"]);
const PortalLoginPage = lazyPage(() => import("./pages/PortalLoginPage"), (m) => m.PortalLoginPage, ["common", "auth", "portal"]);
const PortalDashboardPage = lazyPage(() => import("./features/portal/PortalDashboardPage"), (m) => m.PortalDashboardPage, ["common", "portal"]);
const PortalAppointmentsPage = lazyPage(() => import("./features/portal/PortalPages"), (m) => m.PortalAppointmentsPage, ["common", "portal", "appointments"]);
const PortalPrescriptionsPage = lazyPage(() => import("./features/portal/PortalPages"), (m) => m.PortalPrescriptionsPage, ["common", "portal", "patients"]);
const PortalLabResultsPage = lazyPage(() => import("./features/portal/PortalPages"), (m) => m.PortalLabResultsPage, ["common", "portal", "laboratory"]);
const PortalDocumentsPage = lazyPage(() => import("./features/portal/PortalPages"), (m) => m.PortalDocumentsPage, ["common", "portal", "patients"]);
const PortalInvoicesPage = lazyPage(() => import("./features/portal/PortalPages"), (m) => m.PortalInvoicesPage, ["common", "portal", "billing"]);
const DashboardPage = lazyPage(() => import("./features/dashboard/DashboardPage"), (m) => m.DashboardPage, ["common", "dashboard"]);
const PatientsPage = lazyPage(() => import("./features/patients/PatientsPage"), (m) => m.PatientsPage, ["common", "patients"]);
const PatientDetailPage = lazyPage(() => import("./features/patients/PatientDetailPage"), (m) => m.PatientDetailPage, ["common", "patients", "appointments", "billing", "laboratory"]);
const AppointmentsPage = lazyPage(() => import("./features/appointments/AppointmentsPage"), (m) => m.AppointmentsPage, ["common", "appointments", "patients", "doctors"]);
const DoctorsPage = lazyPage(() => import("./features/doctors/DoctorsPage"), (m) => m.DoctorsPage, ["common", "doctors"]);
const BillingPage = lazyPage(() => import("./features/billing/BillingPage"), (m) => m.BillingPage, ["common", "billing", "patients"]);
const PharmacyPage = lazyPage(() => import("./features/pharmacy/PharmacyPage"), (m) => m.PharmacyPage, ["common", "pharmacy"]);
const LaboratoryPage = lazyPage(() => import("./features/laboratory/LaboratoryPage"), (m) => m.LaboratoryPage, ["common", "laboratory", "patients", "doctors"]);
const InsurancePage = lazyPage(() => import("./features/insurance/InsurancePage"), (m) => m.InsurancePage, ["common", "insurance", "patients", "billing"]);
const ReportsPage = lazyPage(() => import("./features/reports/ReportsPage"), (m) => m.ReportsPage, ["common", "reports"]);
const ClinicMissionControlPage = lazyPage(() => import("./features/ops/ClinicMissionControlPage"), (m) => m.ClinicMissionControlPage, ["common", "ops"]);
const SecurityCenterPage = lazyPage(() => import("./features/security/SecurityCenterPage"), (m) => m.SecurityCenterPage, ["common", "auth", "settings", "security"]);
const SettingsPage = lazyPage(() => import("./features/settings/SettingsPage"), (m) => m.SettingsPage, ["common", "settings", "auth"]);
const TelemedicineCallPage = lazyPage(() => import("./features/telemedicine/TelemedicineCallPage"), (m) => m.TelemedicineCallPage, ["common", "appointments"]);
const NotFound = lazy(() => import("./pages/NotFound"));

const App = () => (
  <QueryClientProvider client={queryClient}>
    <RuntimeEpochQueryBridge>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SessionTimeout />
      <ReauthDialog />
      <SubscriptionProvider>
        <ErrorBoundary>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Suspense fallback={<div className="min-h-screen grid place-items-center text-sm text-muted-foreground">{translatePath("common.loading")}</div>}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/mfa" element={<MfaPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/security/privileged" element={<ProtectedRoute><PrivilegedSecurityPage /></ProtectedRoute>} />
                <Route path="/tutorial" element={<TutorialPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/" element={<LandingPage />} />
                <Route path="/portal/:clinicSlug/login" element={<PortalLoginPage />} />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requiredPermission="super_admin" requiredPrivilegedRole="super_admin">
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/ops/runtime"
                  element={
                    <ProtectedRoute requiredPermission="super_admin" requiredPrivilegedRole="super_admin">
                      <RuntimeOpsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/tenant/:clinicSlug"
                  element={
                    <ProtectedRoute>
                      <ClinicLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<ProtectedRoute requiredPermission="view_dashboard"><DashboardPage /></ProtectedRoute>} />
                  <Route path="patients" element={<ProtectedRoute requiredPermission="view_patients"><PatientsPage /></ProtectedRoute>} />
                  <Route path="patients/:patientId" element={<ProtectedRoute requiredPermission="view_patients"><PatientDetailPage /></ProtectedRoute>} />
                  <Route path="appointments" element={<ProtectedRoute requiredPermission="view_appointments" requiredFeature="appointments"><AppointmentsPage /></ProtectedRoute>} />
                  <Route path="appointments/:appointmentId/video" element={<ProtectedRoute requiredPermission="view_appointments" requiredFeature="appointments"><TelemedicineCallPage /></ProtectedRoute>} />
                  <Route path="doctors" element={<ProtectedRoute requiredPermission="view_dashboard"><DoctorsPage /></ProtectedRoute>} />
                  <Route path="billing" element={<ProtectedRoute requiredPermission="view_billing" requiredFeature="billing"><BillingPage /></ProtectedRoute>} />
                  <Route path="pharmacy" element={<ProtectedRoute requiredPermission="manage_pharmacy" requiredFeature="pharmacy"><PharmacyPage /></ProtectedRoute>} />
                  <Route path="laboratory" element={<ProtectedRoute requiredPermission="manage_laboratory" requiredFeature="laboratory"><LaboratoryPage /></ProtectedRoute>} />
                  <Route path="insurance" element={<ProtectedRoute requiredPermission="view_billing" requiredFeature="insurance"><InsurancePage /></ProtectedRoute>} />
                  <Route path="reports" element={<ProtectedRoute requiredPermission="view_reports" requiredFeature="reports"><ReportsPage /></ProtectedRoute>} />
                  <Route path="ops" element={<ProtectedRoute requiredAnyPermission={["manage_clinic", "view_billing", "manage_billing"]}><ClinicMissionControlPage /></ProtectedRoute>} />
                  <Route path="security" element={<ProtectedRoute requiredPermission="manage_clinic"><SecurityCenterPage /></ProtectedRoute>} />
                  <Route path="settings" element={<ProtectedRoute requiredPermission="manage_clinic"><SettingsPage /></ProtectedRoute>} />
                </Route>

                <Route
                  path="/portal/:clinicSlug"
                  element={
                    <PortalProtectedRoute>
                      <PortalLayout />
                    </PortalProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<PortalDashboardPage />} />
                  <Route path="appointments" element={<PortalAppointmentsPage />} />
                  <Route path="prescriptions" element={<PortalPrescriptionsPage />} />
                  <Route path="lab-results" element={<PortalLabResultsPage />} />
                  <Route path="documents" element={<PortalDocumentsPage />} />
                  <Route path="invoices" element={<PortalInvoicesPage />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ErrorBoundary>
      </SubscriptionProvider>
    </TooltipProvider>
    </RuntimeEpochQueryBridge>
  </QueryClientProvider>
);

export default App;
