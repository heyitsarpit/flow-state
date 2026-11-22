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

1. **Walks and enumerations in checks are derived from the Spec, not from the code's own traversal** [proposed]. Why:
   the slice T89 blocker passed every test because the test walked a structure the same way the code did.
2. **A migration or deletion of a public form gets two independent inventories plus one mechanical pass before its
   requirements** [proposed]. Why: one inventory missed 28 of about 130 sites in slice T89.
3. **Mid-slice design changes reconcile the reds and re-review only what changed** [proposed]. Why: three design
   decisions landed during slice T89; reconciling then a scoped re-review kept the build honest without restarting.
4. **A slice costs about 6% of the weekly limit** with two requirements reviews, one build, a close review and a fix
   round [proposed, as a planning figure]. Why: measured on slice T89 (55% to 61%).
5. **An acceptance item stated as an absence gets a grep in the builder's close gates** [proposed]. Why: slice T118's
   builder reported "no `it.fails` left", one was, and a whole close review and fix round went on it; `rg` would have
   caught it in a second.
6. **The requirements brief names the fixtures-first variety rule and the extend-first rule up front** [proposed]. Why:
   slice T118's requirements lead built one app, was sent back for two more, then all three were folded into existing
   machines: about an hour of rework.
7. **Fix rounds carry blockers and the user's decisions; other routed items go to their owners unless they change the
   same state** [proposed]. Why: slice T118's first fix round grew to six items around a one-line blocker.
8. **A slice can still run long when its catalog step is large** [proposed, as a planning figure]: slice T118 took
   about 61% to 70% of the weekly limit (9%), with three review rounds after the build. Why: the requirements rework
   and two post-PASS rulings each added a round.

9. **A ruling that changes how fixtures or user code look comes with a before/after snippet** [proposed]. Why: in
   slice T142 a one-line ruling ("share the plain config object") came back as a generic factory the user rejected.
10. **A decision the user doubts gets a fresh spike before a ruling** [proposed]. Why: slice T142's re-spike of body
   exactness found the capture costs about 14 to 27% check time, not the prohibitive cost Q19 assumed, and the user
   reversed Q19.
11. **The user's fixture taste goes into every build brief that touches fixtures** [proposed]. Why: three mid-build
   corrections in slice T142 (variants, `payBody`, `byRepo`) came from diffs the user read while the build ran.

## Already merged

- The requirements lead runs at high effort; other leads stay medium (Epic, the user, 2026-11-22). Check over the
  next slices that it cuts fold-in rounds.
- Builder decisions tagged and reversible, Specs not kept in step; logs only via `wk log add`; mid-build design
  validated (Epic, commit `afac37e9`).
- Lint-driven refactors: temporary lint rules with their own tests as the mechanical pass for migrations and
  deletions, then deleted or promoted (Epic "Building a Task", the user, 2026-11-22).
