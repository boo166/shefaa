# Runtime Enforcement Baseline

Existing convergence gaps temporarily tolerated during Wave 1. CI fails on any new entry not listed here.

## Raw Supabase Usage

- src/services/admin/adminImpersonation.service.ts
- src/services/appointments/appointmentQueue.repository.ts
- src/services/auth/auth.repository.ts
- src/services/auth/privilegedStepUp.service.ts
- src/services/doctors/doctor.repository.ts
- src/services/doctors/doctorSchedule.repository.ts
- src/services/events/domainEvent.repository.ts
- src/services/featureFlags/featureFlag.repository.ts
- src/services/insurance/insurance.repository.ts
- src/services/insurance/insuranceAttachments.repository.ts
- src/services/laboratory/lab.repository.ts
- src/services/observability/clientErrorLog.repository.ts
- src/services/pharmacy/pharmacy.repository.ts
- src/services/portal/portal.repository.ts
- src/services/prescriptions/prescription.repository.ts
- src/services/pricing/pricing.repository.ts
- src/services/realtime/realtime.repository.ts
- src/services/security/rateLimit.repository.ts
- src/services/settings/notification.repository.ts
- src/services/settings/profile.repository.ts
- src/services/settings/security.repository.ts
- src/services/settings/tenant.repository.ts
- src/services/settings/userPreferences.repository.ts
- src/services/settings/users.repository.ts
- src/services/subscription/subscription.repository.ts

## Runtime Internal Imports

## Direct Trace Generation

- src/services/billing/billing.service.ts
- src/services/billing/billingPostPayment.workflow.ts
- src/services/jobs/job.repository.ts

## Raw Realtime Access

- src/hooks/useRealtimeSubscription.ts
- src/services/realtime/realtime.service.ts

## Raw Runtime Policy Reads

- src/services/billing/billingPostPayment.workflow.ts

## Missing Certification Metadata

- src/services/appointments/appointmentQueue.repository.ts
- src/services/auth/auth.repository.ts
- src/services/auth/clinicSlug.repository.ts
- src/services/doctors/doctor.repository.ts
- src/services/doctors/doctorSchedule.repository.ts
- src/services/events/domainEvent.repository.ts
- src/services/featureFlags/featureFlag.repository.ts
- src/services/insurance/insurance.repository.ts
- src/services/insurance/insuranceAttachments.repository.ts
- src/services/insurance/insuranceAttachments.storage.repository.ts
- src/services/jobs/job.repository.ts
- src/services/laboratory/lab.repository.ts
- src/services/patients/patientDocuments.storage.repository.ts
- src/services/pharmacy/pharmacy.repository.ts
- src/services/prescriptions/prescription.repository.ts
- src/services/pricing/pricing.repository.ts
- src/services/realtime/realtime.repository.ts
- src/services/security/rateLimit.repository.ts
- src/services/settings/notification.repository.ts
- src/services/settings/profile.repository.ts
- src/services/settings/profile.storage.repository.ts
- src/services/settings/security.repository.ts
- src/services/settings/tenant.repository.ts
- src/services/settings/userInvite.repository.ts
- src/services/settings/userPreferences.repository.ts
- src/services/settings/users.repository.ts
- src/services/subscription/subscription.repository.ts
- src/services/telemedicine/telemedicine.repository.ts
