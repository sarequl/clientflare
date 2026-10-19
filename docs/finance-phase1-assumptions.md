# Finance module: Phase 1 assumptions

The detailed finance spec ("CRM Finance Module: Income, Expenses & Set-Asides") is referenced by the plan but is not in this repo yet. Phase 1 was built on the assumptions below. Reconcile against the spec when it lands.

## Model

- **Incomes and expenses belong to the workspace.** Any member can see and add them. `incomes.invoice_id` exists but is unused until invoices ship.
- **Set-aside rules belong to the user.** "Put 20% of every income I record into Tax." Rules are private to their owner, which is how giving funds stay personal.
- **Allocations are created when an income is recorded**, one per active rule of the person recording it, with the percent snapshotted. Changing a rule later never rewrites past allocations. Editing an income's amount rescales its allocations using the snapshotted percent.
- **Payouts** are money taken out of a bucket (tax paid, donation made). Bucket balance = sum(allocations) − sum(payouts), tracked per currency. No FX conversion in Phase 1.
- **Active rules may not exceed 100 %.** Enforced server-side.
- **Money is integer minor units.** Currency on every row. Workspace has a base currency; user has a personal base currency for the set-aside screens.

## Not in Phase 1

- Profit basis for set-asides (currently gross income).
- Imports (CSV, email forwarding, SMS).
- Zakat calculator.
- Recurring income or expense.

## Open

- Should allocations also run when a *teammate* records income in a shared workspace? Currently no. Only the recorder's rules apply.
