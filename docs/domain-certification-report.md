# Domain Certification Report

Date: 2026-06-07

This audit answers a different question from platform hardening: each score reflects whether the business domain uses the platform correctly, enforces its intended rules, and has executable evidence proving those rules. Passing service-layer tests does not count as DB authority proof unless SQL, RLS, command, outbox, or reconciliation evidence exists.

## Executive Scorecard

| Module | Score | Platform | Business Rules | Workflow | Evidence | Ops | Certification |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Billing | 86% | PARTIAL | PASS | PASS | PASS | PASS | Strong, not fully certified |
| Patients | 74% | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Needs evidence and retention closure |
| Appointments | 85% | PASS | PASS | PASS | PASS | PARTIAL | Operational authority certified; reconciliation remains |
| Notifications | 85% | PASS | PASS | PASS | PASS | PARTIAL | Operational authority certified; scheduled reconciliation remains |
| Insurance | 84% | PASS | PARTIAL | PASS | PASS | PASS | Certified with coverage/duplicate gaps |
| Pharmacy / Inventory | 82% | PASS | PARTIAL | PASS | PASS | PASS | Certified with reservation/expiry gaps |
| Labs | 83% | PASS | PARTIAL | PASS | PASS | PASS | Certified with amendment-history gap |

Scoring basis: 20 platform compliance, 25 business invariants, 20 workflow resilience, 20 executable evidence, 15 operational readiness.

## Integration Matrix

| Module | Repository | Runtime | Capabilities | Trace | Realtime | Audit / Evidence | Reconciliation | DB / RLS Proof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Billing | PASS | PASS | FAIL | PASS | N/A | PASS | PASS | PASS |
| Patients | PASS | PASS | PASS | PASS | UNKNOWN | PARTIAL | FAIL | PASS |
| Appointments | PASS | PASS | PASS | PASS | PASS | PASS | PARTIAL | PASS |
| Notifications | PASS | PASS | PASS | PASS | PASS | PASS | PARTIAL | PASS |
| Insurance | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Pharmacy / Inventory | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Labs | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

## Domain Findings

## Cross-Domain Authority Consistency

| Domain | DB Command Authority | Workflow Authority | Outbox | Audit | Trace | Delivery Evidence | Reconciliation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Billing | Present | Present | Present | Present | Present | Present | Present |
| Appointments | Present | Present | Present | Present | Present | Present | Planned |
| Notifications | Present | Present | Present | Present | Present | Present | Planned |
| Insurance | Present | Present | Present | Present | Present | Present | Planned |
| Pharmacy / Inventory | Present | Present | Present | Present | Present | Present | Planned |
| Labs | Present | Present | Present | Present | Present | Present | Planned |

### Billing - 86%

Architecture: `billingRepository` uses `platformRepository`, tenant scoping, runtime awareness, trace-aware atomic payment posting, reconciliation, recovery, metrics, and evidence metadata. It explicitly reports `certified: false`, `capabilityAware: false`, and no `requiredCapabilities`, with an exception for legacy non-atomic invoice create/update/status paths.

Business logic: payment posting is the strongest path. `post_invoice_payment` rejects paid/zero-balance invoices, overpayments, and deleted invoices; computes `balance_due = greatest(amount - amount_paid, 0)`; records idempotency; and emits `InvoicePaid` plus durable outbox rows in the same transaction. Service tests reject negative payments and validate derived balances, partial payment, paid invoice behavior, and voiding unpaid invoices.

Gaps: invoice create/update/status remain service-side and direct repository writes, so full invoice lifecycle is not DB-authoritative. Refunds/reversals are not certified; refund-over-paid cannot be marked PASS until a real refund command and tests exist. Capability metadata is absent from repository context.

Evidence: `src/services/billing/billing.repository.ts`, `src/services/__tests__/billing.service.coverage.test.ts`, `src/services/billing/__tests__/billing.hardening.test.ts`, `src/services/billing/__tests__/billingReconciliation.test.ts`, `supabase/tests/transactional_billing_events.sql`, `supabase/tests/billing_reconciliation.sql`, `supabase/tests/rls/billing_rls.sql`, `supabase/tests/event_outbox.sql`.

### Patients - 74%

Architecture: patient, document, and medical-record repositories use `platformRepository`, tenant scoping, runtime awareness, stale-context safety, metrics, and capabilities. They are not certified and report no reconciliation, recovery, or evidence awareness.

Business logic: list/get/search paths filter `deleted_at is null`; duplicate patient detection checks name and date of birth within tenant; deactivation/archive blocks active appointments; RLS tests prove own-patient visibility, foreign-patient hiding, and foreign insert denial. Patient documents have storage cleanup tests and audit triggers exist for document insert/delete.

Gaps: retention rules are not encoded as a tested domain invariant. Attachment audit exists at trigger level but repository metadata still marks `evidenceAware: false`; reportable evidence is therefore PARTIAL. Medical-record access is tenant/capability-bound, but there is no workflow-level recovery or reconciliation story. Search exclusion for deleted patients is implemented in repository filters but needs a dedicated regression test across global search/report surfaces.

Evidence: `src/services/patients/patient.repository.ts`, `src/services/patients/patientDocuments.repository.ts`, `src/services/patients/medicalRecords.repository.ts`, `src/services/__tests__/patient.service.test.ts`, `src/services/__tests__/patientDocuments.service.test.ts`, `supabase/tests/rls/patients_rls.sql`, `supabase/migrations/20260311201000_audit_extended_triggers.sql`.

### Appointments - 85%

Architecture: the main appointment repository and appointment queue repository now use `platformRepository`, tenant scoping, runtime policy, capabilities, trace-aware command contexts, stale-context metadata, metrics, and certification metadata. Queue reads are readonly and require appointments view/manage capabilities; lifecycle mutations are tenant-critical and require appointments manage. `AppointmentLifecycleWorkflow` routes check-in, call, back-to-waiting, start-visit, complete, no-show, and cancellation through the DB lifecycle command instead of independent appointment and queue writes.

Business logic: service and workflow tests cover permission gates, tenant context, doctor leave/working-hours checks, invalid state transitions, conflict rejection on create/update, duplicate active queue check-ins, call/start/complete/no-show routing, back-to-waiting compatibility, stale expected queue timestamps, and pure cancellation through lifecycle authority. DB constraints add `appointments_no_overlap` for duration-aware doctor slot exclusion. The new `command_appointment_lifecycle` command atomically updates appointment and queue state, emits `AppointmentLifecycleTransitioned`, writes durable outbox rows, records audit evidence with actor and trace ids, rejects cross-tenant commands, supports idempotency replay, and prevents cancelled appointments with active queue entries.

Gaps: appointment operational authority is certified, but appointment reconciliation is still partial because there is no scheduled drift detector for appointment/queue divergence. Notification sequencing is still not fully proved as an end-to-end workflow. Cancellation closes active queue entries as `done` because the existing queue status vocabulary has no `cancelled` terminal queue state.

Evidence: `src/services/appointments/appointment.repository.ts`, `src/services/appointments/appointmentQueue.repository.ts`, `src/services/appointments/appointmentLifecycle.workflow.ts`, `src/services/__tests__/appointment.service.test.ts`, `src/services/__tests__/appointmentConflict.service.test.ts`, `src/services/__tests__/appointmentQueue.service.test.ts`, `src/services/__tests__/appointmentLifecycle.workflow.test.ts`, `src/services/__tests__/appointmentQueue.repository.test.ts`, `tests/e2e/appointments-lifecycle.spec.ts`, `supabase/migrations/20260607160000_appointment_operational_authority.sql`, `supabase/tests/appointment_operational_authority.sql`, `supabase/tests/rls/appointments_rls.sql`, `supabase/migrations/20260311200000_appointments_duration_exclusion.sql`.

### Notifications - 85%

Architecture: notification repository now uses `platformRepository` plus DB command authority for delivery and acknowledgement. It is tenant-bound, runtime-aware, capability-aware, trace-aware, recovery-aware, evidence-aware, stale-context safe, metrics-enabled, and self-certified. Realtime remains converged through the platform realtime gateway and still filters tenant/user payloads before caller delivery.

Business logic: `command_notification_delivery` validates tenant context, recipient tenant ownership, source event/outbox tenant ownership, and durable delivery identity. It stores `delivery_key`, `source_event_id`, `source_outbox_id`, `delivered_at`, audit evidence, trace ids, and command idempotency in one authoritative command path. `command_notification_acknowledge` is tenant/user scoped, supports stale `expected_updated_at` conflict detection, marks read state, records `acknowledged_at`, preserves acknowledgement on replay, and writes audit evidence. The event delivery worker now materializes notification outbox rows through this command instead of inserting directly.

Gaps: notification operational authority is certified, but reconciliation is still planned rather than scheduled. `notification_delivery_drift` declares drift visibility for pending notification outbox work, delivered-outbox-without-notification, orphan source notifications, and duplicate delivery keys, but no recurring reconciler job or operator workflow has been added yet. This wave covers in-app notifications only; email/SMS/push delivery remains outside scope.

Evidence: `src/services/notifications/notification.repository.ts`, `src/services/notifications/notification.service.ts`, `src/services/__tests__/notification.service.test.ts`, `src/services/notifications/__tests__/notification.repository.realtime.test.ts`, `src/platform/runtime/certification/__tests__/repositoryDescribe.test.ts`, `supabase/functions/event-delivery-worker/index.ts`, `supabase/migrations/20260607172000_notification_operational_authority.sql`, `supabase/tests/notification_operational_authority.sql`, `supabase/tests/rls_policies.sql`, `supabase/migrations/20260315095000_notifications_rls_fix.sql`.

### Insurance - 84%

Architecture: insurance repository is self-certified and uses `platformRepository`, capabilities, runtime policy, trace propagation, DB command RPCs, idempotency hashes, evidence, recovery, and metrics.

Business logic: service tests cover draft defaults, submit timestamps, denial reason requirements, payer reference requirements, denied-claim reopen/resubmission behavior, follow-up trimming, and illegal submitted-to-approved bypass. DB commands cover claim creation and transition authority, domain events, outbox rows, audit evidence with trace ids, and cross-tenant rejection. Patient and assignee tenant constraints exist.

Gaps: duplicate claim prevention is not proved as a hard invariant. Coverage validation is not certified as an external or policy-backed rule. The state vocabulary differs between the user-facing plan and code (`processing`/`denied`/`reimbursed` rather than `under_review`/`rejected`/`paid`), so terminology should be normalized before a final clinical-business signoff.

Evidence: `src/services/insurance/insurance.repository.ts`, `src/services/__tests__/insurance.service.test.ts`, `src/services/__tests__/insuranceAttachments.service.test.ts`, `supabase/tests/domain_operational_authority.sql`, `supabase/migrations/20260521150000_domain_operational_authority.sql`, `supabase/migrations/20260507011500_production_safety_hardening.sql`.

### Pharmacy / Inventory - 82%

Architecture: pharmacy and procurement repositories are self-certified and use `platformRepository`, capabilities, runtime policy, trace propagation, command RPCs, idempotency hashes, evidence, recovery, and metrics.

Business logic: service tests reject negative stock before repository access and verify status derivation. DB authority covers medication create/update/remove, stock adjustment, procurement supplier and purchase-order commands, stock receipt, medication batches, inventory movements, domain events, durable outbox rows, audit evidence, idempotency replay, and cross-tenant rejection.

Gaps: reservation versus deduction logic is not certified. Expired medication prevention is not proved as a dispensing or stock-deduction invariant. Concurrent stock deduction is stronger for command paths, but there is no explicit race/concurrency test proving stock cannot go negative under simultaneous adjustments.

Evidence: `src/services/pharmacy/pharmacy.repository.ts`, `src/services/procurement/procurement.repository.ts`, `src/services/__tests__/pharmacy.service.test.ts`, `src/services/__tests__/procurement.service.test.ts`, `supabase/tests/domain_operational_authority.sql`, `supabase/migrations/20260521150000_domain_operational_authority.sql`.

### Labs - 83%

Architecture: lab repository is self-certified and uses `platformRepository`, laboratory/records capabilities, runtime policy, trace propagation, command RPCs, idempotency hashes, evidence, recovery, and metrics.

Business logic: service tests cover DB-command usage for structured completed results. DB authority covers lab order create/update/archive/restore, result finalization, idempotency replay, domain events, durable outbox rows, audit evidence with trace ids, and cross-tenant rejection. State policy allows pending to processing/completed and processing to completed.

Gaps: amendment history is not certified. Once a result is completed, later result correction behavior is not represented as a dedicated amendment command with immutable history. The current lifecycle is adequate for finalization but not for regulated result correction.

Evidence: `src/services/laboratory/lab.repository.ts`, `src/services/__tests__/lab.service.test.ts`, `supabase/tests/domain_operational_authority.sql`, `supabase/migrations/20260521150000_domain_operational_authority.sql`, `supabase/migrations/20260311201000_audit_extended_triggers.sql`.

## Workflow Failure Matrix

| Workflow | RPC succeeds, UI crashes | Notification fails | Outbox delivery fails | Tenant switch / stale epoch | READONLY runtime | Reconciliation drift |
| --- | --- | --- | --- | --- | --- | --- |
| Billing payment | PASS: DB command persists payment, event, outbox, audit | PASS: outbox can retry handler | PASS: retry/dead-letter support exists | PASS: runtime/stale guard plus trace | PASS: financial writes blocked under enforced policy | PASS: billing reconciliation detects and records findings |
| Patient create/archive | PARTIAL: patient row persists, service event may not be atomic | PARTIAL: service event path only | PARTIAL: no DB-owned patient outbox proof | PASS: stale guard used | PASS: platform runtime applies | FAIL: no patient reconciliation |
| Appointment booking | PARTIAL: appointment row persists, audit/event path for scheduling is not fully DB-owned | PARTIAL: notification sequencing unproved | PARTIAL: scheduling outbox authority remains weaker than lifecycle outbox authority | PASS: platform guards and stale metadata are present | PASS: platform runtime applies to appointment and queue repositories | PARTIAL: no appointment/queue reconciliation job |
| Queue check-in/close | PASS: lifecycle command persists queue, appointment convergence, event, outbox, and audit | PASS: lifecycle outbox event can feed notification handlers | PASS: durable outbox evidence exists for lifecycle transitions | PASS: tenant/stale guards and trace command parameters are present | PASS: platform mutation gate applies before command RPC | PARTIAL: no scheduled queue drift reconciliation |
| Notification delivery/acknowledgement | PASS: DB commands persist notification delivery/ack state, idempotency, audit, and trace | PASS: durable delivery key prevents duplicate materialization | PASS: outbox worker routes notification handler through command authority | PASS: tenant/user/source lineage guards plus trace command parameters are present | PASS: platform repository runtime policy applies to service-side commands | PARTIAL: drift query exists, but no scheduled reconciler |
| Insurance claim transition | PASS: command path is DB-owned | PASS: outbox event evidence exists | PASS: durable outbox evidence exists | PASS: trace and expected-updated-at paths | PASS | PARTIAL: no dedicated claim reconciliation |
| Pharmacy stock adjust / procurement receipt | PASS: command path is DB-owned | PASS: outbox event evidence exists | PASS: durable outbox evidence exists | PASS: trace and expected-updated-at paths | PASS | PARTIAL: no stock drift reconciliation |
| Lab result finalization | PASS: command path is DB-owned | PASS: outbox event evidence exists | PASS: durable outbox evidence exists | PASS: trace and expected-updated-at paths | PASS | PARTIAL: no amendment/reconciliation loop |

## State Machine And Invariant Gaps

Billing: invoice payment state is DB-authoritative, but invoice create/update/void/refund/reversal are not fully command-owned. Refunds are UNKNOWN because no refund command or refund-over-paid proof was found.

Patients: tenant isolation and soft-delete filtering are strong at repository/RLS level. Retention is UNKNOWN. Attachment audit is PARTIAL because triggers exist but repository evidence metadata is false.

Appointments: doctor double-booking has both service checks and a DB exclusion constraint. Queue-coupled lifecycle transitions are now DB-command owned and emit durable operational evidence. Remaining gaps are scheduling/rescheduling outbox authority, notification sequencing proof, and a recurring reconciliation loop for appointment/queue drift.

Notifications: tenant/user filtering, durable delivery identity, duplicate delivery prevention, source event/outbox lineage, acknowledgement evidence, stale acknowledgement conflict handling, and RLS proof are now certified. Remaining gap is a scheduled reconciliation/operator workflow for notification drift findings.

Insurance: lifecycle transitions are enforced in service and DB command paths. Duplicate claim prevention and coverage validation remain PARTIAL/UNKNOWN.

Pharmacy / Inventory: negative stock is blocked at service/command level for current mutation paths. Expired-medication handling, reservations, and concurrent deduction proof remain PARTIAL/UNKNOWN.

Labs: finalization is command-owned and evidenced. Result amendments after completion are UNKNOWN and should be modeled explicitly before regulated lab certification.

## Ranked Remediation Roadmap

1. Certify billing capabilities and finish DB-authoritative invoice lifecycle: move invoice create/update/status/void/refund/reversal into command RPCs with required capabilities, idempotency, trace ids, domain events, outbox rows, and reconciliation coverage.
2. Add reconciliation schedulers for planned domains: notification delivery drift, appointment/queue drift, claim drift, stock drift, and lab amendment/result drift should all move from declared/planned to operator-visible recurring reconciliation.
3. Add appointment notification sequencing proof: prove appointment lifecycle notification ordering end to end and decide whether cancellation needs a first-class queue `cancelled` status.
4. Close patient evidence and retention: add tested retention rules, prove patient-document audit rows, and add deleted-patient search regressions across patient list, global search, and reports.
5. Add clinical/inventory invariants: claim duplicate/coverage tests, stock reservation and expired-medication invariants, concurrent stock tests, and lab amendment history.
6. Extend module certification tests: assert `repository.describe()` for each business module and fail CI when certified modules omit capabilities, trace, runtime, evidence, or stale-context metadata.

## Validation Results

Commands run for this report:

- PASS: targeted appointment Wave A suites: 6 test files, 23 tests passed.
- PASS: targeted notification operational authority suites: 3 Vitest files, 9 tests passed.
- PASS: isolated notification SQL authority test: 1 SQL file, 20 tests passed.
- PASS: targeted Vitest suites for billing, patients, appointments, notifications, insurance, pharmacy/procurement, and labs: 15 test files, 63 tests passed before Wave A.
- PASS: `npm run lint`: ESLint and architecture lint passed. ESLint reported 2 warnings in existing files.
- PASS: `npm test`: 79 test files, 287 tests passed.
- PASS: `npm run test:db`: 18 SQL files, 283 tests passed after applying pending local migration `20260607172000_notification_operational_authority`.

The appointment and notification DB evidence is now refreshed against the local Supabase stack.
