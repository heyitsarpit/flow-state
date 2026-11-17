# Bench

**Bottom line:** never sit blocked on a bench. Iterate with `--dev` (seconds). Every longer run (quick, `--stress`,
`--full`) is capped and runs in the background while you keep working. Choose the run by the work: `--dev` for
everyday changes, quick every couple of hours, `--stress` and `--full` (one concern at a time) when the task is
performance work.

## Which run, when

| Command                           | Takes        | Records | Use it for                                          |
| --------------------------------- | ------------ | ------- | --------------------------------------------------- |
| `nub run bench --only <id> --dev` | seconds      | no      | iterating; add `--compare HEAD` for before/after    |
| `nub run bench --dev --max-n <n>` | seconds      | no      | scaling work: iterate small, check the large end once |
| `nub run bench` (quick)           | about 40 s   | yes     | every couple of hours, or at the end of perf work   |
| `nub run bench --stress`          | about 90 s   | yes     | perf work, or with quick when large Stories matter  |
| `nub run bench <concern> --full`  | minutes each | yes     | perf work: one concern, baseline before, check after |

- **Don't block.** Start any run longer than `--dev` in the background and keep working; read its result when it
  finishes. Never sleep or poll for it. In performance work, iterate with `--dev`, `--only` and `--max-n`, and run
  `--full` for the concern you are changing once before and once at the end.
- **Every run is capped.** `--max-time` defaults to 240 s and every bench has its own timeout; a run that hits either
  exits non-zero with what finished, and no child process outlives it. Never raise the cap to make a run fit; narrow
  it with `--only`, a concern, or `--max-n`.
- **Reading results.** `nub run bench --summary` gives one line per concern. A change counts only beyond its noise
  band, and rows are compared only within one tier, runtime and power state.
- **What counts as a finding:** a change beyond noise with no named cause, a series slope over its bound, or a breach
  of a budget the user approved (from P8). Each is routed to an owner; none blocks unless it hangs or breaches an
  approved budget.
- **Recording.** A recording refuses under load from other processes; battery is fine, and each row records the
  power state. Only the CSVs in `packages/flow-state-v3/bench/history/` are committed; raw samples stay local, for
  one investigation.
- **Adding a bench.** A Story worth timing gets a line in its fixture's manifest's `bench.stories`: `benchTurn`, or
  `benchPoint` with its series and size, wrapped in `benchStress` when it is a stress Story. A whole series is
  `benchSeries({ series, unit, growth, sizes, stressFrom }, (n) => story)`: one point per size, the points from
  `stressFrom` up marked stress. `bench.persist` names the Story whose writes the persist bench times (some exactly
  when a machine of the app persists), and `bench.probe(n)` the actor the memory benches fill a Runtime with.
  Startup, memory and value benches are derived from each manifest's app. `bench/` never names a fixture.
- **Comparing.** `--compare <commit>` checks the commit out in a scratch worktree, with this bench's code copied over
  it, and alternates its workers with ours; each side loads its own fixtures and runtime. `--benches <module>` is for
  the bench's own tests and refuses `--record` and `--compare`.
