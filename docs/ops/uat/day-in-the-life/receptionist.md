# Receptionist — Day In The Life

**Role:** `receptionist`  
**Goal:** Complete front-desk workflows for one patient in a single session.

## Morning Setup

- [ ] Log in to staging clinic app.
- [ ] Dashboard loads without errors.
- [ ] Patients list loads within acceptable time (< 3s with volume data).

## 1. Create Patient

1. Open **Patients** → **Add patient**.
2. Enter full name, date of birth, gender, phone.
3. Save.

Expected:
- [ ] Patient appears in active list.
- [ ] Patient code is assigned automatically.
- [ ] No duplicate-patient warning for unique record.

## 2. Book Appointment

1. Open **Appointments** → **New appointment**.
2. Select the patient created above.
3. Select an available doctor and time slot (30+ minutes in the future).
4. Save.

Expected:
- [ ] Appointment appears in list view with `Scheduled` status.
- [ ] Double-booking the same doctor/slot fails with a clear conflict message.

## 3. Check In

1. On appointment day (or use today's slot), open **Appointments**.
2. Switch to list view and click **Check in** on the appointment.

Expected:
- [ ] Patient moves to **Waiting room** queue.
- [ ] Appointment status reflects check-in.
- [ ] No duplicate active queue entry for the same appointment.

## 4. Reschedule

1. Create a second appointment for the same patient (different slot).
2. Open the appointment and **Reschedule** to a new valid slot.

Expected:
- [ ] Original slot is freed.
- [ ] New slot shows the appointment.
- [ ] Conflict rules still apply on the new slot.

## 5. Cancel

1. Open a scheduled (not in-progress) appointment.
2. Cancel with a reason.

Expected:
- [ ] Appointment status becomes `Cancelled`.
- [ ] Patient is removed from waiting room if previously checked in.
- [ ] Cancelled appointment does not block the doctor slot for new bookings.

## End of Day

- [ ] Log out cleanly.
- [ ] Re-login: session restores, tenant context is correct.
- [ ] No developer intervention required during the session.

## Blockers (record if any)

| Step | Issue | Severity |
|------|-------|----------|
| | | critical / major / minor |
