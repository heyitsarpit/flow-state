# V3 execution slices

**What it is:** the pre-decided list of execution slices for the V3 Tasks built from the v3 Specs. A slice is a
group of Tasks run through one loop together: one requirements phase with a whole-slice state inventory, one
requirements review, one build, one build review. The Tasks stay the unit of acceptance and bookkeeping; the slice is
the unit of execution, so the seams between sibling Tasks sit inside one model's work instead of between models.

**Status:** proposed (the orchestrator, 2026-11-22, at the user's request). The orchestrator may change a slice when
the work shows it should: merge, split or reorder, with the reason in a V3 log note.

## How a slice is drawn

- Tasks that share one Spec or one state owner go together.
- A slice fits one builder run inside one 5-hour usage window. If it does not, it splits along its state owners;
  that is the only time the Task split decides execution.
- The failure limit counts per slice. A slice review covers the seams between its own Tasks.
- Slices run in the order below; the host track runs beside P4 once slice 4 lands.

## P4

| Slice                     | Tasks                  | What they share                                                        |
| ------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| 1 Foundations             | T131, T120             | Doors and the declared-schedule runtime: what every later piece calls  |
| 2 Schedules               | T118                   | @spec.Schedules and its sequence test; already partly built            |
| 3 Types                   | T113                   | @spec.Types: `derive.ts`, body capture, compile-time indexes           |
| 4 Turn core               | T119                   | @spec.Changes: the applier, alarms and `tick`, the index layer         |
| 5 Records codec and fates | T92, T56               | @spec.Records: one judge, one format plan                              |
| 6 Operations              | T121, T122, T123, T124 | @spec.Operations: rows, entries, placements, releases and their alarms |
| 7 Fragments               | T109, T110             | @spec.Changes: instances and `reconcile`, then subroutines             |
| 8 Boundary channels       | T127, T76, T128, T78   | @spec.Changes and @spec.Host: emits and props                          |
| 9 UI primitives           | T129, T130, T73        | Toaster, menu, combobox on the channels                                |
| 10 Errors and the CLI     | T100, T22, T23         | @spec.Operations' catalog, @spec.Types' construction value, the CLI    |
| Host A                    | T112, T111             | @spec.Host: fakes and the mutation applier, then the binding           |
| Host B                    | T97, T117              | @spec.Host: Story helpers and coverage runs                            |

## P5

Grouped the same way when P5 starts. First draft: T132 with T114 and T106 (intake, host rules, turns rules); T125
with T126 (entity records and claims); T48 with T115 (lazy adoption and hydrate); T27 with T30 (the lock and
channels); T25 alone (streams, which needs its design first).
