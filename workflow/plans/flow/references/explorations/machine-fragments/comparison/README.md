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

**Proposal v3** ([../proposal-v3.md](../proposal-v3.md)) writes up B as amended. A fresh author built
the three apps from v3 alone: [build-v3.md](build-v3.md), reviewed in
[reviews/v3-build-correctness.md](reviews/v3-build-correctness.md) and
[reviews/v3-build-principles.md](reviews/v3-build-principles.md).

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
| **v3** (fresh author, from the document alone) | – | – | – | 1,031 | 8 | 0 (3 stated deviations) |

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

## The fresh v3 build

The most correct build so far, with the smallest shared fragments (144 lines). It ties the amended
baseline on size; fragments win on structure (named lifetimes, keyed lists, `resetOn`), not lines.
The builder logged 19 UNCLEAR items: 4 are real gaps (whether a raised event arms `armOn`; host
fallthrough inside a subroutine; what raise mappers read; no guard on list Add/Remove), the rest
missing syntax or plan contradictions. Both reviews end with ranked v3 changes.
