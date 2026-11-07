# Review of VERDICTS-PROPOSAL.md (round 1)

2026-11-08. One Opus adversarial review and four Haiku sidecars (coverage, check strength, determinism and bounds,
runner and speed). Opus verdict: **accept with changes**. The one rule is sound. The runner checked the sidecars'
code claims it relies on below. This is the input to the one revision, `VERDICTS-PROPOSAL-2.md`.

## Required changes

| # | Severity | Change | Why (the run the proposal gets wrong) | From |
| --- | --- | --- | --- | --- |
| 1 | High | One work bound per `do` that counts settle steps **and timers fired** across `advanceWith` (`fake-world.ts:815-830`), with a plant | A mutant that re-arms a timer at `now()` makes each `settle` quiesce while `advanceWith` loops forever. That is a time kill, unknown forever, a real mutant class never scored. | Opus, determinism sidecar |
| 2 | High | Typed item kinds from main.ts (case, output, lock, recipients, catalog). mutate-one derives `suite` from named-oracle cases only and `output` from output cases, and ignores recipients and the lock in copies, as today (D134) | Deriving `suite` from every item makes a moved RECIPIENTS line (expected on a mutant, main.ts:497-504) a kill with no oracle red. The known lock red would fail every control. | Opus |
| 3 | High | Load the runtime under test inside `stated`, so a throw at module load is `threw`, which is a fail, so a crash is killed (D132). Drop E17. | A mutant that throws at load prints no VERDICT and would be unknown forever. Today it is killed by crash. Both the check-strength sidecar and Opus found this. | Opus, check-strength sidecar |
| 4 | High | A global time budget for the whole gate run and a stated worst case. An alone rerun gets a shorter limit sized from the job's measured time. Correct the "about 70 s per unknown" claim | An alone attempt runs to the job's full watchdog (about 290 s), one after another, so each unknown costs about 5 min. The 10-min target is not bounded. | runner sidecar |
| 5 | High | A measured state budget for **every** search caller: search/run.ts defaults, `round-14/checks/search-vacuity-check.ts`, mutate-one's searches, falsify's search part, FRAG-15, SEARCH-ODD-SMALL. Each budget at a third of its watchdog or less, measured alone. Say what `--seconds` means after deadlines go | With deadlines removed, any search past its watchdog alone is unknown forever. mutate-one's 3000/8000/6000-state searches have never been sized against its 240 s watchdog. | Opus, determinism sidecar |
| 6 | Medium | `expect` carries the failing case names into `detail`, so `killers` survive | `mutants.json` killers become null, and the D33 citation coverage in `report.ts:210` falls to 0. | Opus, coverage sidecar |
| 7 | Medium | No exit-agreement check for `contract: "exit"` | tsc exits 2 on type errors, which reads as disagree, then unknown forever, never BAD. | Opus |
| 8 | Medium | Outcome: fail if any item fails, else unknown if any, else pass. Attribution is the first fail in gate order | "First non-pass" makes exits depend on sort order, and `[unknown, fail]` reads unknown although a finished gate stated a kill. | Opus, check-strength sidecar |
| 9 | Medium | Overflow is evidence only: keep the head plus the last 1 MB of each stream | A mutant writing 16 MB of warnings finished stating and should be read, not unknown. | Opus, check-strength sidecar |
| 10 | Medium | Memory kills: memory depends on the program, not on load. A memory kill well above the measured control peak is a **fail** (killed). Only a kill near the limit (within a stated margin) is unknown and rerun alone. Name the E-rows this changes (E5, E10) | Making every memory kill unknown lets a mutant that allocates 4 GB escape being counted. | check-strength sidecar |
| 11 | Medium | A search reaching its budget (`inconclusive`) is its own outcome. The case asserts the verdict it reaches; a budget hit where the case expects completed is a fail | `inconclusive` read as pass stays green forever, deterministically. | determinism and check-strength sidecars |
| 12 | Medium | Survivors judged against each mutant's claimed `kills`, not "every survivor fails" | A mutant with no claim goes red. | check-strength sidecar |
| 13 | Medium | Load plants and the S3 repeat-run check run once at landing, not in the 2-slot `plants` job | Running them "beside 7 suite copies" inside a 2000 MB job breaks packing and trips the job's own limit. | Opus |
| 14 | Medium | Memory declarations consistent between the runner inside mutate-one and the scheduler's row | `runner({ slots: 6, mb: 6 * SUITE.mb })` is about 12 GB inside a row declared 5000 MB / 4 slots. | runner sidecar |
| 15 | Medium | Every planted failure has a black-box form that runs against the old commit, and is shown red there where the old code was wrong | Most P-rows import modules that don't exist on the old commit, so "red on the old code" can't be shown. | coverage sidecar |
| 16 | Medium | Plants for the child breaking its own contract: exit 0 with no VERDICT, a verdict that disagrees with the exit, garbled or duplicate VERDICT lines, VERDICT on stderr, a signal | R2 has no plant. | coverage, runner sidecars |
| 17 | Low | Decide a kill by "the watchdog decided before the child exited", not by a SIGKILL code (sh exits 137 itself); state where `exitedBeforeKill` comes from | Kill race; `sh -c` shapes. | Opus, runner sidecar |
| 18 | Low | `read` checks `verdict.gate === spec.name`. Reject a second VERDICT line. Match only at line start | A grandchild's VERDICT can stand in for the child's; fail-then-pass reads pass. | Opus, runner sidecar |
| 19 | Low | Separate a program under test (the `flow` CLI that `cli/main.ts` pins by its stdout) from a gate child in S1. Exempt `Report.ms`, `ending` and `process.memoryUsage` in engine.ts, or move them into the evidence | S1 cannot pass as written. | Opus, determinism sidecar |
| 20 | Low | A not-scored field for invalid mutants (D113) instead of `pass` items | "pass" would mean both killed and not scored. | Opus |
| 21 | Low | Keep `checks/*` before `gate` in mutate-one, as today | Changes `killedBy` attribution. | Opus |
| 22 | Low | Errno throws under load (EMFILE, ENOSPC) map to unknown, not `threw` | R2 again. | Opus |
| 23 | Low | A SIGINT handler in `stated` that kills the detached trees and removes scratch directories; one runner per process; a machine-wide lock file for alone attempts | Ctrl-C leaves trees running; "alone" across two top-level processes. | Opus, runner sidecar |
| 24 | Low | `mutate-one` run by hand gets bounds on its own spawns (the checks, `started`) | Unbounded `spawnSync`. | runner sidecar |
| 25 | Low | No PASS-line `ms` in any item's `why`, so repeated runs are byte-identical | S3 would fail on timing text. | Opus |
| 26 | Low | U1 (a CPU loop inside one step): keep it unknown, but list such mutants in a reviewed not-scored section of the mutant list rather than dropping them | Don't erase a real hang from the record. | Opus |
| 27 | — | A complete E list, including: the recipients, lock and output handling (if #2 changes it); the `checks/*` order; MUTANT 2000 → 2500 MB and lifetime 1500 → 2000 MB. E14 and E16 are not corrections; say so | Requirement 11. | Opus |

## Resolved well (keep)

- C1, top-only alone reruns, with the `events()` proof.
- C3, one VERDICT line after every human line, with `--out` and the CLI pins untouched.
- `read`'s order (killed, signal, overflow, verdict, exit agreement), slot release in `finally`, `Unstarted` for open throws, a single top-level rerun.
- U5 (an allow-list of known reds) deferred to the user.
