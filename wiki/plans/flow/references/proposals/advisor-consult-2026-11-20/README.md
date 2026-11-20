# Advisor consult, 2026-11-20 evening (copied for consideration, not merged)

**Bottom line:** the user's advisor consult from the `advisor-consult` branch (commits 9a797039, ed83f1bd), copied here
as prior art because it is partly outdated by the concept designs written the same night. Nothing here is merged into
the Plans or Tasks; each file still says which recommendations the user accepted that evening.

- `body-types-2026-11-20.md`: `const B` checked against `B & Exact<B, MachineBody<D>>`, spiked on a copy of the
  package; conflicts with `../spec-typed-machine-2026-11-20.md`, which found body capture failing. Settle by a spike.
- `fragment-lifetimes-2026-11-20.md`: one address per incarnation, two holders (incarnation: reads, lookups, sessions,
  schedules; subject: write lanes), a fragment Owner per incarnation with work.
- `machine-calls-2026-11-20.md`: no timing or retry option in Flow; every call's input decoded once at admission.
- `raw-throws-2026-11-20.md`: one gated constructor, a `Made` brand by `Symbol.for`, T98 before T106 and T109.
- `saved-records-2026-11-20.md`: record Schemas built from Compiled; strict envelope, per-entry collections.
- `advisor-holes-2026-11-20.md`: a second adversarial pass over the five answers.
- `plan-and-task-changes.patch`: the branch's edits to `Rules.plan` (`turn(...)`, `Machine<D, Names>`) and its Task
  comments (T98 first; fragment lifetimes with `resetOn` as the subject part), not applied.
