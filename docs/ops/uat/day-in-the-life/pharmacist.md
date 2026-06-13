# Pharmacist — Day In The Life

**Role:** `pharmacist`  
**Goal:** Dispense medication and manage inventory reservation lifecycle.

## Morning Setup

- [ ] Log in as pharmacist on staging.
- [ ] Pharmacy / inventory module is accessible.
- [ ] Pharmacist cannot create invoices or modify appointments (expected denial).

## 1. Review Stock

1. Open **Pharmacy** / **Medications**.
2. Review current stock levels.

Expected:
- [ ] Medication list loads for tenant only.
- [ ] Stock quantities are visible.
- [ ] Low-stock items are identifiable.

## 2. Reserve Medication

1. Select a medication with available stock.
2. Create a **Reservation** for a patient (from doctor UAT prescription or manual).

Expected:
- [ ] Available stock decreases or reserved quantity increases.
- [ ] Reservation is linked to the correct patient.
- [ ] Cannot reserve more than available stock.

## 3. Dispense Medication

1. Complete **Dispense** against the reservation.
2. Confirm batch and quantity.

Expected:
- [ ] Stock decreases by dispensed quantity.
- [ ] Stock never goes negative.
- [ ] Dispense record appears in inventory history.

## 4. Release Reservation

1. Create a second reservation.
2. **Release** (cancel) the reservation without dispensing.

Expected:
- [ ] Reserved quantity returns to available stock.
- [ ] No phantom stock deduction.
- [ ] Released reservation no longer blocks dispense.

## 5. Concurrent Safety Check

1. Note current stock for one medication.
2. (Optional) Ask a second tester to dispense simultaneously on staging.

Expected:
- [ ] Only one dispense succeeds if stock = 1.
- [ ] Second attempt fails gracefully with clear message.

## End of Day

- [ ] Inventory report matches physical stock adjustments made today.
- [ ] No developer intervention required.

## Blockers (record if any)

| Step | Issue | Severity |
|------|-------|----------|
| | | critical / major / minor |
