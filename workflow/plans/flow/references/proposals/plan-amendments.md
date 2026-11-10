# Pending Plan amendments

Plan changes found while building wait here, unmerged, until building proves them right. Each entry names the Plan
record, the change, why, and the evidence that would prove it. Merge one into its Plan only once that evidence holds
and the user says yes; then mark it merged with the commit.

## Pending

- **@plan.Operations.O3: a cancel during a send** (2026-11-11, V3 T7). Change the phrase that says a cancel settles a
  call on the wire, to match WriteLanes R14 as revised: the call follows its own ending and stays Held. **Why:** the
  phrase came from the old design's `HeldThisTurn`, which is about the `cancel` concurrency policy (spec-log.md, R4
  entry). **Proven by:** P4's production lane passing the suite's cancel-on-wire cases (PAY-12, PAY-15, LANE-04).
