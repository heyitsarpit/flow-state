# Convergence 10: a test system whose green means something

Status: **everything here is proposed.** Inputs: `conformance-audit/bugs.md` (B), `assumptions.md` (A), `over-assumptions.md` (O), `under-specification.md` (U), `blind-derivation.md` (BD), `round-9/review-part-two.md` (R). All advice; the calls below are the builder's, under delegation, for Arpit to overrule. Decisions start at D129. No entities in this round.

## Every finding, by root cause

| Root cause | What it is | Findings |
| --- | --- | --- |
| **1. A verdict is not tied to what ran.** The check reads something other than the thing driven, or says nothing about whether it ran | Oracles on an undriven harness; `closed` on 1 state; compare with no exit; crash with no verdict; `fatal` silences oracles; tool sees one process; typo passes | B H1, H2, H3, H6, M1, M2, M6, Low (typo, one-way catalog, names cut at a space, unknown flag, plants), U 1, O F11 (`--swap` 54/703) |
| **2. Assertions choose what to look at.** Anything nobody named is free | 0/703 notice an extra request, key or field; named issues are a set; junk key mutant lives; oracle trusts runtime's evidence | U 2, 3 (A02, A07), B M1, M5, BD weak list |
| **3. The record of expected results can be rewritten.** The lock is a file and the hash is blind | Paste into lock; a removed newline deletes an oracle; lists outside the lock | B H4, H5, M7 |
| **4. Scoring is by a human reading a number.** | `reality/`, `bench/`, plants, mutants' INVALID | B M2, M7, Low; U 5; R M6 |
| **5. Oracles know a format, not a meaning.** | 40-44% fail on a format change; regex ranks user fields; text compare; evidence is an untyped contract | O F1, F2, F3, F9; B M3, M4 |
| **6. The fake is kinder than the world.** | bfcache and the lock; key expiry, 409, replayed 500, body mismatch; `freeze`; hidden timers; plain write behind strict; connection loss; `landLate`; power loss; duplicates | A 1-18; B M5; O F8 |
| **7. Rules have no clause-level pin.** | 5 mutants; M4, M5, M6; (p); `letgo-takes-all`; FRAG-08; rule 37 and uncited rules | U 3, 4, 6; R M4, M5, M6, (p) |
| **8. Runtime faults those hid.** | H1, H2, M3; `x/y`; `self`; `Symbol`; O(n²); bfcache gap; HIGH-03 | R; O F4, F5, F7; A 1; BD |
| **9. The design has fallen behind.** | Stale points; ordering rule | BD disagreements; R M1 |

Causes 1-4 and the small part of 8 are stage A. Causes 5-7, the rest of 8 and 9 are stage B.

## Design

One principle answers causes 1-4: **a green must be a claim about a run, and a broken run must be able to make it red.** So every verdict carries its evidence of having run, and a standing check runs every gate on runtimes known to be broken.

### Stage A decisions

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D129** | **`watch.ts` measures and kills the tree.** Child in its own process group; each poll reads the whole process table and follows parents; peak is the tree's sum; a kill and a normal exit both end every descendant ever seen and the group. Leftovers are reported. Limit: a poll is 40 ms, so a spike between polls is unseen; a process that left by `setsid` before the first poll that saw it is unseen | A `ps` per poll | `watch.ts`, `falsify.ts` |
| **D130** | **End-of-case oracles run on every harness a case made.** The runner tracks `make()`, so no scenario edit is needed. Named issues are one list per case, shared by every `Ctx` in it. Runs inside a `try`; a crash is that case's verdict | Some cases fail: traced below | `main.ts`, `ctx.ts` |
| **D131** | **`closed` and `completed` need evidence.** Every action must change the state hash on at least one edge, or the search names it in `idleAllowed` with a reason. Otherwise the verdict is `vacuous`, exit 1. A throw anywhere in a search is `failed`, not a crash | A search states what it cannot move | `engine.ts`, `run.ts` |
| **D132** | **Every gate must fail on a broken runtime: `conformance/falsify.ts`,** standing, a member of the lock. Null runtime, and the real runtime with a constant hash, a lying `fatal`, no evidence, no waits, a junk disk key, a lying replay: each gate run on each must be red. Mutate counts a parsed mutant that crashes as killed by `crash`. `--only` of nothing fails. Catalog is checked both ways. `compare.ts` exits 1 on any difference not on its stated list. Null implements the whole `Instance` contract, so it fails by expectation, not `TypeError` | About a minute | `falsify.ts`, `null-adapter.ts`, `mutate*.ts`, `main.ts`, `typed/compare.ts` |
| **D133** | **`fatal` must be named.** A fatal a case did not name in `namedIssues` is a failure, at each step. It no longer turns oracles off silently. Fatal without its `Fatal` issue is itself a failure | | `ctx.ts` |
| **D134** | **Whole output is the default assertion.** For each case and each harness, the runner reduces every read to an output: request sequence, issues with counts and origin presence, disk by class, each actor's state and memory, evidence kinds with counts, frames, waits, truth, distinct state hashes. It is compared with `expected-output.txt`, one line per case. A case states what it does not care about in the scenario: `outputAllow: { sections, why }`. Each output is in the lock under `output:<case>`, so a change needs its own log line. Only the plain pass compares: `--swap` and the 5 s gate have other outputs by design. **A mutant killed only by output says `killedBy: "output"`,** apart from named oracles, since a snapshot kills anything that changes and proves nothing about correctness | A change detector, not a proof: it says what changed, a person says if that is right. Each behaviour change means log lines per case | `main.ts`, `output.ts`, `mutate-one.ts` |
| **D135** | **Lock and log.** A hash reads tokens: a TS file or function through the transpiler (comments and format free, strings and code not), others by bytes. **The lock can no longer launder:** for each id, the current hash must be the id's frozen baseline, or the hash on its last log line, whose reason is non-empty and not bulk. A pasted hash has no line. `main.ts` pins the baseline file's digest. **The limit, stated:** a hand can still write a log line with a poor reason, and can edit the baseline and `main.ts` together. Prevention would need a signature no local file can give; the check is that the reason is required per id, that it is reviewable in `git diff`, and that review reads it | Log lines | `main.ts`, `expected.baseline` |
| **D136** | **The bill runs from the last yield,** and a yield's task starts a new chain. **One notify per task:** the first pump end in a task notifies; later ones in the task coalesce into one in the next task. Review H1, H2, M3 | A publish past the first in a task is not heard in its own stack | `driver.ts` |
| **D137** | **An actor key names one machine.** `ensure` on a live key with another machine refuses, named: `ActorMachineMismatch`. The harness's key escapes the id, so `M` + `x/y` and `M/x` + `y` are two actors. | | `step.ts` or `turn.ts`, `drive.ts`, `ctx.ts` |
| **D138** | **A state may not be named `self` or `__proto__`:** `ReservedStateName` at seal, a wiring error like `DuplicateMachine`. Changing the data format's `"self"` to a sentinel would be the alternative; refusing is one line and the name has no use | A name is lost | `gate.ts` |
| **D139** | **A value with no form is refused the same way, whatever it is.** A `Symbol` anywhere joins function, Map and Set: `UnencodableValue`, not `Fatal`, not silently dropped. `NaN` and `Infinity` cannot be carried: they get a stable name (D119 stands) and no carried form, rather than coming back as strings | A machine with `NaN` in memory now keeps its last capture, named | `gate.ts` |
| **D140** | **Mail is a queue, not an array copied per send.** Persistent for a linear use: a shared buffer and a window, copied only when a branch writes. Bursts go linear. Pin: 100,000 sends in a stated time budget in the driver, without the adapter's log | One small type | `world.ts`, sites |
| **D141** | **The hash and replay see values, not the JSON they happen to make.** `canon` tags `Date`, `Map`, `Set`, `NaN`. Wall clock offset joins the fake's text (B M3, review M3) | A few more states | `adapter.ts`, `fake-world.ts` |

### Stage B, outline (fixed when reached)

Oracles ask `Instance` for meaning (`headsOnDisk`, `parkedOnDisk`), not disk bytes. `normalise` by path, not regex. `Ctx.eq` a canonical deep compare. The fake gets `leave`/`return`, a `freeze` that stops everything, hidden throttling, plain writes queued behind strict, connection loss, a stricter server. `reality/` and `bench/` score and exit. Pins for the survivors. Decisions there: the bfcache host contract, the hidden-tab spin, HIGH-03.

## Design edits owed at merge

`machine-design.md` is not edited in this round. Owed:

1. Rule 30, 2.8.5, 2.8.6 E7, rule 31: a retry does not rejoin the queue (LIB-02, D3, D40). Recheck rule 32's limit wording.
2. Rule 25: a carve-out or a new rule for the repair's own 30 s bound (STORE-07, D40).
3. Rule 8, 2.5: a turn refused twice stays with what owes it (REV9-EDGE, D109, D118, D123).
4. `machine-design.md:1115`, `:3865`, the ordering rule (R M1), the four lines: follow-ups first and global, up to the bound; else one mail from the next actor in rota, oldest first within that actor; an actor joins the rota at its first mail and goes to the back after each; nothing orders two actors' turns unless a turn links them.
5. Rule 37 and 27: a read mapper's throw (HIGH-03). Decision in stage B.

## Traces of the failures D130 exposes

Twelve failed once the checks reached the driven harness. **None is a runtime bug.** All 12 traced by printing the first difference (`FLOW_REPLAY_TRACE=1`).

| Cases | What it was | Answer |
| --- | --- | --- |
| REV6-H5 (2) | Replay limit. The case changes a key closure between lives (`rel.v = 2`), and replay ran the first life under the second closure: `{"key":"a"}` against `{"k":"a"}` | **`Harness.release(now, before)`:** the program changing is a step. S11 replays each life under the program it ran. No exemption. REV6-M8 made the same move, and passed by luck |
| REV8-KEPT (1), REV9-KEPT (3), REV9-EDGE (3) | The same limit. `__healed`, a release that fixes a closure, flipped outside the harness, so a replay's turn refused where the live one committed | Same step. S11 is now pinned for kept endings and for a release that changes a key |
| PAY-11/refused-after-members | Expected issue, never named: the check never reached the second harness | Named |
| REV9-LOOP/a-commit-that-throws… | Same: `Defect` | Named |
| REV5-H2/a-module-value… | Same, already named by its inner `Ctx`. The runner read another list | One list per case |

Also `PAY-17/core-throw-is-fatal`, new with D133: it named `Fatal` after the fatal. Moved. And a fault armed in one life and spent in the next would replay wrongly; none does today, but the replay now starts each life from what was armed when it booted.

## What the new checks found (stage A)

- **D140's cause was not where the audit put it.** The array copy was half. `durable.ts` flush walks all mail each step to find restored endings (profiled: most of the time). `MailQ` keeps a count of them. 100,000 sends in the driver: 85 s on round 9, **0.24 s** now; 10,000: 986 ms, 42 ms (`bench/burst.ts`, scored).
- **The token hash first hashed every scenario body as nothing:** the transpiler drops an unused pure expression, so all bodies matched. Seen only because `--hashes` listed too few ids. Held by an assignment now. `falsify.ts` tampers a scenario body and the lock, so this cannot come back quietly.
- **`--swap`, the 5 s gate, CLI pins, date check:** unchanged. 5 s gate: 29 failed, 29 expected.

## Limits stated

- **Whole output is a change detector.** It was captured from the runtime, so it says "this changed", never "this is right". Mutation scores count it apart (`killedBy: "output"`).
- `REV9-LOOP`, `R10-RUNTIME` allow away requests, actors, evidence, frames, hashes, outside, waits: how far a spin gets in a step is the work clock's count. Their named assertions and truth, issues, disk, fatal stay.
- `SEARCH-ODD-*` keep their own oracle, untracked. Three cases boot nothing, since the seal refuses. `falsify.ts` lists them, so a fourth is noticed.
- `outputs` read disk by key prefix, so a format change moves every line. Stage B's job (cause 5).
- Search floors: a `closed` needs every action to have moved or an `idle` reason. A search cut off by depth or budget needs half. So a search of a real runtime with half its actions dead by a bug would read as green at low depth. A named limit, not a proof.
- A log line can still say something poor: D135.
- The older mutant lists (`mutants-r9b.ts`' `d122.mail-fifo`, and any quoting `enqueue`, `takeMail`, the pump's `mark`) no longer apply to round 10's text. They were not rewritten; `mutate.ts` refuses a stale edit by name. Stage B's sweep.
- Bench, `reality/`: still not scored, except `bench/burst.ts`. Stage B.
