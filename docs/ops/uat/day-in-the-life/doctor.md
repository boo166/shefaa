# Doctor — Day In The Life

**Role:** `doctor`  
**Goal:** Complete clinical workflows for a checked-in patient.

## Morning Setup

- [ ] Log in as doctor on staging.
- [ ] Appointments and patient list are accessible.
- [ ] Doctor cannot access billing write actions (expected denial).

## 1. Open Patient Chart

1. From **Appointments** waiting room or **Patients**, open a patient with an active visit.
2. Navigate to patient detail / chart.

Expected:
- [ ] Patient demographics and history load.
- [ ] Only tenant-scoped patients are visible.
- [ ] No cross-tenant patient accessible by URL manipulation.

## 2. Write Medical Record

1. Open **Medical records** (or EMR section) for the patient.
2. Add a progress note with diagnosis and clinical notes.
3. Save.

Expected:
- [ ] Record appears in patient timeline.
- [ ] Record is attributed to the logged-in doctor.
- [ ] Record persists after page refresh.

## 3. Request Lab Order

1. From patient chart, create a **Lab order**.
2. Select test type and priority.
3. Submit.

Expected:
- [ ] Lab order appears in pending/processing state.
- [ ] Order is visible to lab technician role (coordinate with lab UAT).
- [ ] Doctor cannot finalize lab results (expected denial).

## 4. Complete Visit

1. Return to **Appointments** / waiting room.
2. **Start visit** → **Complete visit** for the patient.

Expected:
- [ ] Queue entry closes.
- [ ] Appointment status becomes `Completed`.
- [ ] Patient is no longer in active waiting room.

## 5. Prescribe Medication (if UI supports)

1. Add a prescription for the patient.
2. Save.

Expected:
- [ ] Prescription appears in patient medications.
- [ ] Pharmacist can see the prescription (coordinate with pharmacist UAT).

## End of Day

- [ ] Review today's completed visits in appointments history.
- [ ] No developer intervention required.

## Blockers (record if any)

| Step | Issue | Severity |
|------|-------|----------|
| | | critical / major / minor |
