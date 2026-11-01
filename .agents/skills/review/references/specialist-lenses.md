# Select specialist coverage

Add a reviewer only when a consequential question needs focused inspection.
Every reviewer still checks intent and documented standards; return evidence to the lead.

| Trigger | Inspect | Required evidence |
|---|---|---|
| State or concurrency | Invariants, lifetimes, races, recovery | Sequence and outcome |
| Trust boundaries | Authority, validation, secrets | Reachable misuse and consequence |
| Protocols or migration | Consumers and transition states | Actual callers and transition states |
| Performance claims | Workload, baseline, bottleneck | Revision-bound comparison |
| UI parity claims | Agreed states and conditions | Comparable captures and differences |

Use the existing relevant principle or method owner; do not invent a separate specialist procedure.
A lens without a credible path to inspect adds no coverage. State unavailable expertise or tools.
