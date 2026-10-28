# Four systems, three apps: comparison

The same three apps ([apps.md](apps.md)) built in four systems, reviewed once, fixed once, then
rebuilt with the small amendments the builds asked for ([amendments.md](amendments.md)).

| System | Spec | Fixed build | Amended build |
| --- | --- | --- | --- |
| **A**: proposal-v2, fragments may do I/O | [proposal-v2.md](../proposal-v2.md) | [build-a-v2.md](build-a-v2.md) | [build-a-v2-amended.md](build-a-v2-amended.md) |
| **B**: locked-island split (trait / subroutine, no I/O) | [spec-b-locked-split.md](spec-b-locked-split.md) | [build-b-locked-split.md](build-b-locked-split.md) | [build-b-locked-split-amended.md](build-b-locked-split-amended.md) |
| **C**: one stateless fragment, modes in memory | [spec-c-single-fragment.md](spec-c-single-fragment.md) | [build-c-single-fragment.md](build-c-single-fragment.md) | [build-c-single-fragment-amended.md](build-c-single-fragment-amended.md) |
| **Baseline**: plain machines, no fragments | Machines.plan, Operations.plan | [build-baseline.md](build-baseline.md) | [build-baseline-amended.md](build-baseline-amended.md) |

Reviews of the fixed builds: [reviews/correctness.md](reviews/correctness.md) and
[reviews/principles.md](reviews/principles.md).

## Results

Code is non-blank, non-comment lines (fragments plus definitions, machines and components; stories
and operation code excluded), as each author recounted it. Counting differs slightly between
authors.

| | Fixed: code | Fixed: FAKED | Fixed: bugs | Amended: code | Amended: FAKED | Amended: bugs |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline | 1,099 | 17 | 1 | 1,022 | 7 | 0 |
| **B** | 1,219 | 15 | 0 (1 by workaround) | **1,135** | **1** | 0 |
| A | 1,417 | 19 | 1 | 1,285 | 7 | 0 |
| C | 1,710 | 31 | 2 | 1,505 | 11 | 0 |

## What it showed

1. **The plan amendments did most of the correctness work** (fenced host commits, outcome input,
   outstanding-call reads, a retry policy, shallow history, readable deadlines, event-armed timers).
   They help plain machines as much as fragments.
2. **With them, A's I/O fragment became unnecessary:** A's amended build deleted `CommitWithRetry`
   and moved toward B.
3. **B amended** has the fewest workarounds (1) and real reuse (`Field`, `Countdown`, selection,
   pagination). It needs `hostEvents` (F1), which its original spec had wrongly merged away.
4. **C** kept modes in memory and had the most bugs and workarounds; amendments helped, but the
   lockout and hold are still flags, and its dialog had to become a host state again.
5. **Open everywhere:** lists of fragment instances (B's last FAKED), immediate revert of an
   `unknown` optimistic value, an `abandoned` shape for host commits that names the outcome, port
   defaults for repeated fillings, and plan sentences for the drafts' ambiguous readings.

## Suggested direction

Plan amendments P1–P8 to Operations and Machines first, for every machine. Then B as amended (v2
without fragment I/O, with `hostEvents`) as the fragment design, with lists of fragment instances as
the next open question.
