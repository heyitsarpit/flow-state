# Round 13: run costs, measured

Every number is from `watch.ts`'s own report (wall seconds, peak RSS of the whole process tree). "Alongside" counts the other runs going at the same time, of mine; the machine had other load too (load average about 10 before the 16-20 batch, from work that was not mine). Nothing here is estimated; what was not measured says so. All from `packages/flow-state-v3/prototypes`.

**The sleep:** the laptop slept from 15:16 to 15:56 (battery at 1%). The one run across it, lie slices 19-21 of 32, reported 2507.5 s and was killed: void, rerun. The 40 minutes are sleep, not run time.

## Single runs

| Run | Command | Commit | Wall | Peak RSS | Alongside |
| --- | --- | --- | --- | --- | --- |
| Suite, no searches | `conformance/main.ts --round 13 --runtime ../round-13/adapter.ts --no-search` | 0d3c1137 | 59.6-63.0 s (six runs) | 911-952 MB | 0 |
| Suite, with catalog and searches | `conformance/main.ts --round 13 --runtime ../round-13/adapter.ts` | 42a1f4e8 | 63.1 s | 931 MB | 0 |
| | | 3cce106b | 84.6 s | 919 MB | 5 |
| `mutate-one` control | `conformance/mutate-one.ts --runtime ../round-13/adapter.ts` | 0d3c1137 | 194.4 s | 1,633 MB | 0 |
| | | 42a1f4e8 | 193.4 s | 1,640 MB | 0 |
| | | 3cce106b | 227.1 s | 1,640 MB | 4 |
| Graph gate, with searches | `conformance/graph-gate.ts --runtime ../round-13/adapter.ts` | 1ee5e5f7 | 62.6 s | 1,584 MB | 0 |
| | | 42a1f4e8 | 63.4 s | 1,583 MB | 0 |
| | | 3cce106b | 86.2 s | 1,575 MB | 5 |
| `checks/front-check.ts` | `bun round-13/checks/front-check.ts` | 3cce106b | 0.4 s | 102 MB | 6 |
| `checks/types-check.ts` | | 3cce106b | 0.9 s | 296 MB | 6 |
| `checks/story-check.ts` | | 3cce106b | 0.3 s | 83 MB | 6 |
| `checks/mailq-check.ts` | | 3cce106b | 0.1 s | 0 MB | 6 |
| `checks/score-check.ts` | | 3cce106b | 0.1 s | 0 MB | 6 |
| `checks/search-vacuity-check.ts` | | 3cce106b | 0.5 s | 123 MB | 6 |
| CLI pins | `bun round-13/cli/main.ts` | 3cce106b | 4.8 s | 78 MB | 5 |

The checks' and the CLI pins' figures are `watch.ts`'s as printed; their children are short-lived `bun` processes, which the 0.1 s sampling may miss, so the RSS is a floor. Earlier runs of the checks were bounded by `perl alarm`, not timed: **not measured**.

## Falsify parts

| Part | 0d3c1137, alone | 42a1f4e8, alone | 3cce106b, in parallel |
| --- | --- | --- | --- |
| `watch` | 1.2 s, 446 MB | 1.2 s, 420 MB | 1.3 s, 449 MB (alongside 4) |
| `tamper` | 3.9 s, 306 MB | 3.9 s, 307 MB | 4.8 s, 318 MB (4) |
| `search` | 61.6 s, 333 MB | 62.3 s, 329 MB | 87.4 s, 338 MB (5) |
| `suite1` | 73.1 s, 761 MB | 73.2 s, 782 MB | 94.7 s, 781 MB (5) |
| `suite2` | 224.0 s, 995 MB | 217.6 s, 1,017 MB | 248.5 s, 979 MB (4) |
| `suite3` | 105.5 s, 839 MB | 101.0 s, 876 MB | 124.7 s, 870 MB (5) |
| `mutants` | 268.6 s, 1,502 MB | 258.9 s, 1,488 MB | 290.7 s, 1,488 MB (4) |

## The lie gate

**Full, by `--slice i/32`, one lie at a time per process (42a1f4e8):**

| Slices | At once | Wall per slice | Peak RSS per slice | Command wall |
| --- | --- | --- | --- | --- |
| 1, 2, 3, 4, 5 | 1 (one after another) | 183.6, 190.3, 185.4, 185.4, 186.8 s | 1,476-1,498 MB | 931.5 s in all |
| 6-9 | 4 | 212.3, 215.9, 200.7, 223.4 s | 759-1,498 MB | 223.4 s |
| 10-15 | 6 | 272.3, 284.1, 199.0, 200.5, 184.3, 149.5 s | 1,419-1,483 MB | 284.1 s |
| 16-20 | 5 | all killed at 295 s (time) | 912-1,476 MB | void: load from elsewhere (load average about 10); rerun |
| 16-18 | 3 | 244.2, 249.5, 252.0 s | 1,470-1,477 MB | 252.0 s |
| 19-21 | 3 | 2,507.5 s, killed | | void: the sleep; rerun |
| 19-22 | 4 | 254.0, 257.7, 257.6, 254.1 s | 1,479-1,494 MB | 257.7 s |
| 23-26 | 4 | 156.4, 153.7, 152.5, 153.9 s | 1,482-1,498 MB | 156.4 s |
| 27-32 | 6 | 183.0, 188.6, 185.2, 189.1, 187.3, 191.7 s | 722-1,494 MB | 191.7 s |

Sum of the valid commands' walls: **2,296.8 s**. On 0d3c1137, slices 1-3 alone took 190.2, 198.1 and 190.9 s (then the plan changed).

**Full, `--full --slice i/48 --parallel 2`, four slices at once, 8 suites (b9539ddc and its record-per-lie edit, committed as 3cce106b):** the command walls were 129.9, 138.3, 137.1, 125.0, 134.5, 141.5, 108.4, 81.7, 80.0, 83.2, 86.6, 87.6 s; peak RSS per slice 723-2,925 MB (two suites each); swapouts 25,780,059 to 25,790,043 across the twelve. Sum: **1,333.8 s**. A first try at `--slice i/16 --parallel 2` × 4 was killed at 295 s with 4 lies of each slice done: void.

**Targeted, one process, `--parallel 8`:** 67.6 s, 4,364 MB, alone (the tree of 3cce106b, before its commit); **64.9 s, 4,198 MB** at 3cce106b, alongside 6 checks. 75 of 75 lies red on their recorded cases, none fell back to the whole suite.

**The stale-record check:** `lie.released` with its record pointed at `PAY-01`: 67.5 s, 1,479 MB; it fell back to the whole suite and went red there.

| Lie gate | Wall | Measured? |
| --- | --- | --- |
| Full, sequential, all 32 slices | | **not measured** as a whole; 5 of 32 slices alone: 183.6-190.3 s each |
| Full, mixed 1-6 at once (`/32`) | 2,296.8 s | yes, the sum of commands |
| Full, 8 suites at once (`/48`, `--parallel 2` × 4) | 1,333.8 s | yes |
| Targeted, `--parallel 8` | 64.9 s | yes |

## What the bounds showed

- With other load on the machine, 5 lie slices at once all ran past 295 s, and 3 at once did not: the 5-minute bound held each one, and `watch.ts` reported no leftovers.
- Killing the outer `watch.ts` of a falsify run by its pid left its inner suites running (each is its own `watched` tree): I killed 4 by exact pid. A targeted run's output was lost that way once; it was rerun.
