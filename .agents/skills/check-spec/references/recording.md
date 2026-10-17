# Spec recording criteria

Check the recorded meaning as well as read-only CLI diagnostics. Keep the reviewed Spec unchanged.

## Requirements and coverage

- Requirements state independently verifiable behavior with `source` and `must`.
- Every requirement has a coverage row with exactly one lane: `proven_by` local test declarations,
  or `open_by` local Q/FB/RK obligations while proposed.
- `proven_by` identifies a corresponding executable check. A declaration does not establish a
  passing run; actual results belong in Task evidence.
- `enforced_by` cites a relevant invariant or known enforcing public boundary. When enforcement is
  unknown, the text says so and retains an `open_by` obligation. Do not demand an invented mechanism.

## Lifecycle and lineage

- Behavioral or required verification obligations keep status proposed. Accepted status requires
  granted authority, required review, and resolved coverage. Acceptance establishes neither runtime
  proof nor human approval of agent-proposed guarantees.
- Superseded requirements retain historical coverage and local `supersedes` lineage. Whole-Spec
  replacement links its successor in existing prose rather than invented metadata.
- Incoming references are reconciled before resolved questions are removed. Surviving IDs remain
  stable. Existing implementation sections are not expanded or migrated without an assignment.
