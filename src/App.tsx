import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { ClinicLayout } from "./layouts/ClinicLayout";
import { ProtectedRoute } from "./core/auth/ProtectedRoute";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { PatientsPage } from "./features/patients/PatientsPage";
import { PatientDetailPage } from "./features/patients/PatientDetailPage";
import { AppointmentsPage } from "./features/appointments/AppointmentsPage";
import { DoctorsPage } from "./features/doctors/DoctorsPage";
import { BillingPage } from "./features/billing/BillingPage";
import { PharmacyPage } from "./features/pharmacy/PharmacyPage";
import { LaboratoryPage } from "./features/laboratory/LaboratoryPage";
import { InsurancePage } from "./features/insurance/InsurancePage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          <Route
            path="/tenant/:clinicSlug"
            element={
              <ProtectedRoute>
                <ClinicLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="patients" element={<PatientsPage />} />
            <Route path="patients/:patientId" element={<PatientDetailPage />} />
            <Route path="appointments" element={<AppointmentsPage />} />
            <Route path="doctors" element={<DoctorsPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="pharmacy" element={<PharmacyPage />} />
            <Route path="laboratory" element={<LaboratoryPage />} />
            <Route path="insurance" element={<InsurancePage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
