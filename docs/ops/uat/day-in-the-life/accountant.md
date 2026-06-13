# Accountant — Day In The Life

**Role:** `accountant` (billing staff)  
**Goal:** Complete billing lifecycle for one patient visit.

Reference: [billing-lifecycle-smoke-test.md](../../billing-lifecycle-smoke-test.md)

## Morning Setup

- [ ] Log in as accountant on staging.
- [ ] Billing module is accessible.
- [ ] Accountant cannot access clinic admin settings (expected denial).

## 1. Create Invoice

1. Open **Billing**.
2. Create invoice for an existing patient (from receptionist/doctor UAT).
3. Enter service, amount, and due date.

Expected:
- [ ] Invoice shows `Pending` status.
- [ ] Balance equals full amount.
- [ ] Paid = 0.

## 2. Collect Partial Payment

1. Open the invoice → **Post payment**.
2. Enter amount less than balance (e.g. cash).

Expected:
- [ ] Status becomes `Partially paid`.
- [ ] Balance decreases correctly.
- [ ] Payment appears in payment history.

## 3. Collect Final Payment

1. Post remaining balance.

Expected:
- [ ] Status becomes `Paid`.
- [ ] Balance = 0.
- [ ] No duplicate payment on refresh/retry.

## 4. Refund

1. On the paid invoice, initiate a **Refund** for a partial amount.

Expected:
- [ ] Refund recorded in payment history.
- [ ] Balance and paid amounts update correctly.
- [ ] Refund over paid amount is rejected.

## 5. Write-Off (unpaid invoice)

1. Create a second small unpaid invoice.
2. Apply **Write-off** with reason.

Expected:
- [ ] Invoice no longer appears as active receivable.
- [ ] Write-off reason is preserved.
- [ ] Billing reconciliation (Runtime Ops dry run) shows zero critical findings.

## End of Day

- [ ] Run dry billing reconciliation from Runtime Ops (`/admin/ops/runtime`).
- [ ] Export or view billing report for today — data matches posted transactions.
- [ ] No developer intervention required.

## Blockers (record if any)

| Step | Issue | Severity |
|------|-------|----------|
| | | critical / major / minor |
