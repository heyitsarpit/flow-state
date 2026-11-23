---
proposal loop-findings
status proposed 2026-11-22
---
# Loop findings: what worked and what to change, gathered per slice

**What it is:** the orchestrator's running record of generally applicable lessons from each slice of @epic.V3: what
worked, and changes worth making to the loop for future slices. Only lessons that would apply to other slices go here;
a slice's own details stay in its Tasks. Every item is proposed until the user confirms it; confirmed items are merged
into the Epic (or a convention) and then deleted here, with the merging commit named in the Epic note.

## Worked (keep)

- **The requirements review is a real gate** (slice T89). Twice it caught a "wrong build passes" hole before any code:
  a missing state in the inventory, and an oracle that could not fail.
- **The close review catches what the tests share with the code** (slice T89). Its blocker was a check whose walk had
  the same blind spot as the code it checked.
- **Spec tables become red tests cleanly** (slice T89): where a Spec was specific, its rows mapped one to one to checks
  and planted faults.
- **A mechanical pass beside agent inventories** (slice T89): a draft lint rule cross-checked two independent
  inventories of a migration and found the cases both missed.
- **Rulings asked as two traces get fast, good answers** (slice T118): Q1 (A refuses and sits in LOADING for good, B
  commits with the timer Refused) took the user one line to decide.
- **The blind requirements sidecar keeps its value** (slice T118): its re-derivation of the expected values matched, and
  it found the order cells the Spec left open.

## Proposed changes

None open.

## Already merged

- Merged into the Epic's instructions (the user, 2026-11-23): every Requirement in range, not only Invariants (was 12);
  the variety and extend-first rules in the requirements brief (was 6); one agent inventory plus one mechanical pass
  before a migration's requirements (was 2); checks walk by the rule, not the code (was 1); a boundary's oracle
  derived from its writer (was 16); both sides of a mirrored fact checked (was 14); an `rg` gate for absence items
  (was 5); a fix round carries blockers and decisions only (was 7); before/after code with a ruling, pointing to
  AGENTS.md (was 9); a fresh spike for a doubted decision (was 10). Deleted as superseded by the 5 to 10% slice
  cost: 4, 8, 15. Dropped: 3 (re-review only what changed), since it could narrow review and miss new bug classes.
- The user's fixture taste is written in @convention.fixtures "How fixture code reads", which every fixture brief
  already cites (was 11; the user, 2026-11-23).

- Who runs each step: the requirements lead stops after its fix round, a fresh medium builder takes the build, and a
  fix round's review returns to the same reviewer (was item 13; Epic "Models and agents", the user, 2026-11-23).
- The requirements lead runs at high effort; other leads stay medium (Epic, the user, 2026-11-22). Check over the
  next slices that it cuts fold-in rounds.
- Builder decisions tagged and reversible, Specs not kept in step; logs only via `wk log add`; mid-build design
  validated (Epic, commit `afac37e9`).
- Lint-driven refactors: temporary lint rules with their own tests as the mechanical pass for migrations and
  deletions, then deleted or promoted (Epic "Building a Task", the user, 2026-11-22).
