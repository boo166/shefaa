# Patient data retention (operational baseline)

This document tracks **policy intent**; Supabase RLS and storage lifecycle jobs remain authoritative.

## Current product behavior

- **Patients**: soft-delete via `deleted_at` / archive flows; bulk delete marks rows deleted.
- **Patient documents**: metadata in `patient_documents` with `deleted_at`; storage objects removed on explicit delete; see `patientDocumentLifecycle` types in application code.
- **Medical records**: hard delete on service `remove` (confirm business requirement before enabling end-user delete in production).

## Recommended operational rules

1. Define a **minimum retention period** per jurisdiction (e.g. N years after last encounter).
2. **Purge** storage objects only after metadata tombstone + legal hold checks.
3. **Audit** document download (`patient_document_accessed`) for access reviews.
4. Run periodic **exports / legal discovery** procedures outside the app DB when required.

## Scheduled jobs (future)

- Nightly job: list tenants approaching retention cutoff, notify clinic admin.
- Quarantine bucket for uploaded files pending malware scan (if enabled).
