# Lab Technician — Day In The Life

**Role:** `lab_technician`  
**Goal:** Process lab orders from receipt through result amendment.

## Morning Setup

- [ ] Log in as lab technician on staging.
- [ ] Laboratory module is accessible.
- [ ] Lab tech cannot post billing payments (expected denial).

## 1. Receive Lab Order

1. Open **Laboratory** / pending orders.
2. Locate order created by doctor UAT.

Expected:
- [ ] Order visible with patient and test details.
- [ ] Only tenant-scoped orders appear.

## 2. Process Order

1. Move order to **Processing** (if workflow requires).
2. Enter preliminary values if supported.

Expected:
- [ ] Status transitions are valid (no illegal skips).
- [ ] Order remains linked to correct patient.

## 3. Complete Result

1. Enter final result values.
2. **Finalize** / **Complete** the result.

Expected:
- [ ] Order status becomes `Completed`.
- [ ] Result is visible on patient chart (verify with doctor account read-only).
- [ ] Completion is idempotent on refresh (no duplicate finalization).

## 4. Amend Result

1. On the completed result, initiate an **Amendment**.
2. Enter corrected values with amendment reason.

Expected:
- [ ] Amendment is recorded (history preserved if UI exposes it).
- [ ] Original result is not silently overwritten without trace.
- [ ] Doctor can see amended result on patient chart.

## 5. Reconciliation Check

1. Open Runtime Ops → lab/appointment reconciliation panels if available.
2. Run dry reconciliation for today's window.

Expected:
- [ ] Zero critical findings related to lab orders processed today.

## End of Day

- [ ] All orders started today are in terminal state (completed or cancelled).
- [ ] No developer intervention required.

## Blockers (record if any)

| Step | Issue | Severity |
|------|-------|----------|
| | | critical / major / minor |
