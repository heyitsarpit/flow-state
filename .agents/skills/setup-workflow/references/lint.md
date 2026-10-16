# Lint and formatting

## Commands

Linter and formatter not configured yet. Install them in this repository, then run
/setup-workflow again to configure the commands. Until configured, this gate is blocked.

## Procedure

1. Run the formatter. Apply required formatting if it only checks; inspect the diff.
2. Run lint. Fix every error and warning within the assigned write scope.
3. Rerun formatting and lint after repairs. Return commands, output, and snapshot identity.

Pass requires successful formatting and zero lint errors and warnings. Inspect output, not only
exit status. Do not suppress diagnostics or weaken rules. Return out-of-scope failures to the
caller.
Checkers assess final receipts; rerun only read-only commands. Return mutating checks to the
implementer.
