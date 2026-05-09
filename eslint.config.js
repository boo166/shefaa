import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "design-system", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/integrations/supabase/client",
              message: "Supabase client imports are restricted. Use repositories/services instead.",
            },
            {
              name: "@/services/supabase/client",
              message: "Supabase client imports are restricted. Use repositories/services instead.",
            },
            {
              name: "@supabase/supabase-js",
              message: "Supabase SDK should only be instantiated in services/supabase/client.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/pages/LoginPage.tsx",
      "src/pages/ForgotPasswordPage.tsx",
      "src/pages/ResetPasswordPage.tsx",
      "src/features/auth/ClinicNameField.tsx",
      "src/shared/components/DataTable.tsx",
      "src/shared/components/ErrorBoundary.tsx",
      "src/shared/components/GlobalSearch.tsx",
      "src/shared/components/StatCard.tsx",
      "src/features/patients/AddPatientModal.tsx",
      "src/features/patients/PatientsPage.tsx",
      "src/features/patients/PatientDetailPage.tsx",
      "src/features/patients/PatientDocuments.tsx",
      "src/features/patients/ImportPatientsModal.tsx",
      "src/features/patients/PrescriptionManagementSection.tsx",
      "src/features/appointments/NewAppointmentModal.tsx",
      "src/features/appointments/AppointmentCalendar.tsx",
      "src/features/billing/NewInvoiceModal.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXText[value=/[A-Za-z\\u0600-\\u06FF]/]",
          message: "Raw JSX text is restricted on migrated i18n surfaces. Use translation keys instead.",
        },
      ],
    },
  },
  {
    files: [
      "src/services/**/*.{ts,tsx}",
      "src/services/**/*repository.{ts,tsx}",
      "src/services/supabase/**/*.{ts,tsx}",
      "src/integrations/supabase/**/*.{ts,tsx}",
      "src/platform/data/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },
);
