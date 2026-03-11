# RLS Policy Review (2026-03-11)

## Scope
Reviewed RLS coverage for all public tables and storage buckets in this repository. Focused on tenant isolation for patient data and explicit `WITH CHECK` constraints on UPDATE policies.

## Patient Data Tables
| Table | RLS | SELECT | INSERT | UPDATE | DELETE | Notes |
|---|---|---|---|---|---|---|
| `patients` | Yes | Tenant + role | Tenant + role | Tenant + role + WITH CHECK | Admin only | PHI gated; receptionist/clinical staff only. |
| `doctors` | Yes | Tenant | Admin only | Admin only + WITH CHECK | Admin only | Updated to add WITH CHECK. |
| `appointments` | Yes | Tenant | Tenant + role | Tenant + role + WITH CHECK | None | Overlap prevention via `duration_minutes` + exclusion constraint. |
| `medical_records` | Yes | Tenant + clinical staff | Tenant + doctor/admin | Tenant + doctor/admin + WITH CHECK | None | Update policy added; deletes denied. |
| `prescriptions` | Yes | Tenant + clinical staff | Tenant + doctor/admin | Tenant + doctor/admin + WITH CHECK | None | Update policy added. |
| `invoices` | Yes | Tenant + billing staff | Tenant + billing staff | Tenant + billing staff + WITH CHECK | None | Billing staff only. |
| `medications` | Yes | Tenant | Admin only | Admin only + WITH CHECK | Admin only | Inventory data. |
| `lab_orders` | Yes | Tenant + clinical staff | Tenant + admin | Tenant + admin + WITH CHECK | None | Updates restricted to admin. |
| `insurance_claims` | Yes | Tenant + billing staff | Tenant + billing staff | Tenant + billing staff + WITH CHECK | None | Billing staff only. |
| `patient_documents` | Yes | Tenant + clinical staff | Tenant + clinical staff | None | Admin only | Metadata protected; storage path RLS enforced. |
| `doctor_schedules` | Yes | Tenant + admin | Admin only | Admin only + WITH CHECK | Admin only | Unique index + lookup index. |

## System Tables
| Table | RLS | Notes |
|---|---|---|
| `tenants` | Yes | Tenant scoped; super_admin overrides exist. |
| `profiles` | Yes | Users can view tenant profiles; update limited to self. |
| `user_roles` | Yes | Admin manage; super_admin overrides exist. |
| `subscriptions` | Yes | Tenant can view; super_admin manages. |
| `notifications` | Yes | User-owned; update policy now enforces WITH CHECK. |
| `notification_preferences` | Yes | User-owned; update policy now enforces WITH CHECK. |
| `user_preferences` | Yes | User-owned; update policy now enforces WITH CHECK. |
| `user_invites` | Yes | No direct access (RPC/edge only). |
| `appointment_reminder_log` | Yes | No direct access (job-only). |
| `rate_limits` | Yes | Access via security-definer function only. |
| `client_error_logs` | Yes | Insert scoped to user + tenant; admin view only. |
| `audit_logs` | Yes | Admin read-only; writes via `log_audit_event`. |

## Storage Buckets
| Bucket | Public | Policies |
|---|---|---|
| `avatars` | No | Private bucket; tenant-scoped read via profile ownership. |
| `patient-documents` | No | Tenant path enforced via `(storage.foldername(name))[1] = tenant_id` for select/insert/delete. |

## Notes and Gaps
- DELETE operations remain intentionally denied for most patient data tables. If soft-delete is desired, add a `deleted_at` column and update policies accordingly.
- Appointment overlap protection uses `duration_minutes` + exclusion constraint. Ensure UI captures duration when variable lengths are required.
- Audit logging currently covers patients, appointments, and invoices. Consider extending to documents, prescriptions, lab orders, and insurance changes.
- Security-definer RPCs are tenant-scoped using `get_user_tenant_id(auth.uid())` and do not accept `tenant_id` from clients.
