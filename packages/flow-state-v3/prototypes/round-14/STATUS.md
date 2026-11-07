# Round 14 status

Prototype, for evidence; never production code.

## Checkpoint 1: area 1, lifetime (OD31) done

- Suite `--round 14 --runtime ../round-14/adapter.ts --no-search`: 800/800, locked, nothing unlogged, exit 0.
- `lifetime-falsify.ts`: control 48/48; 27 wrong runtimes all red; every LIFE case red on at least one.
- Not built: LIFE-19, 20 (Hydrate, dehydrate), 25 (records cliff), 26 (context providers); the ending phase
  (`stopped` input) and `NotAdopted` (no lazy entries).

## Checkpoint 2: area 2, identity (OD30) done

- `compile/ref.ts`: `actorRef` from a value or a literal name, `ensureArgs`; type pins in `typed/type-tests.ts` (tsc clean).
- Runtime: a record keeps the fields a value ref named it by; `OldVersionActor` at boot; `ConflictingActorRef`.
- R14-ID-01..03; 805/805 locked; falsify: 32 wrong runtimes red, every case red on one.

## Checkpoint 3: area 3, `Flow.ignore` and P1 (OD28) done

- Compiler: `Flow.ignore` in any operation mapping, D220's check skips it, `IgnoreForbidden` on stream keys and listen entries (front-check, 7 pins).
- Runtime: an ignored ending is admitted with no turn; its cell applies; an unknown is released (cancel in Held); never parked.
- `flow check`: `IgnoredUnknown` info. R14-IGN-01..03; 815/815 locked; 35 wrong runtimes red, every case red on one.

## Checkpoint 4: areas 4 and 5 (OD29 F, E step 2, target, G) done

- F: an absent `resetOn` value places nothing; present, the filling reads `key`; R14-F-01 (M8 impossible, the "A, none, A" walk).
- E step 2 and the optional target: type pins (no `signal` in contexts was already so). G: `Effect.catchTag` in `typed/lab.ts`, `typed/pay.ts`.
- J: not built (the prototype has no typed entity API). 818/818 locked; 38 wrong runtimes red.

## Checkpoint 5: the independent review at 48d1dc46, fixed or stated

- H1 fixed: an ignored unknown counts as mapped; no `UnresolvedHold` for it (CLI pins: `IgnoredUnknown`, removeFile, ignore.ts's send and put).
- H3 fixed: the end encodes the record with `record.ts`'s codec; the test-only `codec` input is gone; LIFE-22 poisons memory with a bigint.
- M1 fixed: arming or disarming a schedule key drops its waiting deadline; an ended activation's waiting deadline goes; LIFE-14 re-arm variant.
- M2 fixed: a return after an end mints a new root id (an old ending is adopted, current from the active leaf: my call, rule 14's adopted row);
  a record kept at ready keeps its id, as a live restore does. The same-incarnation invariant covers kept reads and endings owed at ready.
- M3 fixed: identity fields encode by their Schemas to strings; the version is field set plus each field's Schema (type and encoded side).
- Item 7: LIFE-13 kept, with a comment naming the design hole.
- M5 and the rest, stated, not built:
  - `ScheduleLeadsToWrite` (flow check) is not built.
  - Story `detach` and `dispose` exist in the suite's harness steps only, not in `round-14/story/story.ts` (no app Story there).
  - `EndedWithWork` and the end's record list schedules and reads, never activities or sessions.
  - Inspection's `uses.busy` lists write lanes, kept reads and owed endings; not mailbox depth, waiting deadlines or the unencodable block.
  - `IdentityFieldOptional`, the read-only input pin (OD30 Q5), `InputIgnored`, and `ConflictingActorRef`'s persist and context half are not built.
  - G: `typed/lab.ts` and `typed/pay.ts` call `catchTag` through an `as never` each (a generic error type); the hand `fixtures/*.compiled.ts` are unchanged.
  - E step 2 is pinned for a commit's context only.
  - `soon` and `warned` are out of the state hash (diagnostics only).

## Checkpoint 6: the user's corrections D1-D7 done; final gates in RESULTS.md

- D1: an end parks `failure { Interrupted }` per stopped read; the return hears it after its restored deliveries; LIFE-13 flipped.
- D2, D3: as M1, M2 above. D4: the ref form is fixed per machine in the types; `ConflictingActorRef` only for persist mismatches.
- D5: a local remount within the grace reuses the actor (LIFE-27). D6: a disposed identity's ending waits on its lane (LIFE-23).
- D7: an undecodable identity reads "quarantined"; an ensure starts fresh and reports `RecordUndecodable` (evidence).

## Checkpoint 7: the fix pass after the independent final review (RESULTS.md has the table)

- H-A, fragstore.row, M1-M6, L1, L2 fixed, each with a case and a wrong runtime (57 in `mutants-lifetime.ts`). 834/834 locked.
- For the design, open (the user decides later):
  - **M4, call 2.** Built as rule 73 is merged: a `Held` lane, with or without waiting commits, keeps nothing, so a Held offline write is
    not woken at ready and its waiting commits' `NotSent { Restored }` are not owed (R14-FIX-02). The design may change this.
  - **M3, persist order.** The design does not say which `persist` wins across a `disposeActor`. The runtime forgets the first ref's
    `persist` at `disposeActor`, so the next ref to ensure the identity is the first again (R14-ID-03).
  - **L4.** `RestoreDiscarded` and `RecordUndecodable` name one event from two sides (a record this release cannot read, discarded at an
    ensure). The design should keep one name.
  - **L1, stated limit.** A check on the encoded side is seen only as there or not: its kind lives in annotations, so `minLength(1)` and
    `minLength(2)` read as one version.
  - **M1, stated limit.** The woken-at-ready D1 case edits the disk (LIFE-28's walk with the end landed): no step of the fixture reaches
    an ended record that is also owed a parked ending.
- Ledger changes (`drive.ts`): a park into a record kept at ready pays `told` into `parkedOwed` only at a boot that kept that record; the
  store's forced repair wait (`store: true`) is not the actor's work in flight.
- Not done: the fragstore.row search's remaining rule 17 failure (round 13's class).

## Hand-off (2026-11-08)

Items (commits on `worktree-agent-acee8f40b71d961fd`):

| Item | State | Commit | Case | Wrong runtime |
| --- | --- | --- | --- | --- |
| H-A Runtime disposal | done | 0dd9e9f3 | REV5-M1, LIFE-28, PAY-16 (+ bound variant), SURV-08 | `o6.dispose-interrupts-wire`, `o6.settled-in-bound-stays-held`, `o6.no-bound` |
| fragstore.row diagnosis | done (search still fails, at a later class) | 76e65e3e | R14-FIX-01 (named-at-ready; dispose-at-ready; ended-then-disposed) | `boot.mail-unsaid`, `boot.mail-lost-at-dispose` |
| M1 D1 on every return | done | 76e65e3e | LIFE-13 (after a reload; woken at ready, disk edited) | `d1.woken-drops-stopped`, `d1.reload-drops-stopped` |
| M2 D3 | done | 76e65e3e | R14-FIX-03 | `d3.return-keeps-old-id` |
| M4 call 2 | done, no earlier verdict changed | 76e65e3e | R14-FIX-02 | `m4.held-w-owed` |
| M3 persist order | done | 8b737bdc | R14-ID-03 (other order; after dispose) | `m3.persist-survives-dispose` |
| M5 templated reasons | done: the 12 were one regression (a return from ready captured), fixed, each logged | 8b737bdc | R14-FIX-01/a-return-from-ready-writes-nothing | `m5.return-from-ready-writes` |
| M6 k.ghost-life | done: lie restored, mark "not woken" | 8b737bdc | R14-FIX-01, R14-FIX-02 (`lie-cases/k.ghost-life.json`) | the lie |
| Low L1, L2, L4 | done (L4 noted above, for the design) | 8b737bdc | R14-ID-02 (L1) | `l1.version-by-type-side`, `l1.version-by-printed-name`; L2 none |

Gates:
- Ran on 8b737bdc: suite `--no-search` and `--lock` (834/834, nothing unlogged, removed none, stale 0, catalog none); suite with its searches
  through `watch.ts` (834/834, exit 0, peak 1744 MB); `lifetime-falsify.ts` (control 119 pass, all 57 wrong runtimes red, every case red on
  one); `bun ../round-14/checks/*.ts` (all pass); `bun ../round-14/cli/main.ts` (all pass); `tsc -p round-14/typed/tsconfig.json` (clean);
  `falsify.ts --part lies --lie k.ghost-life` (red, targeted); fragstore.row search (failed at depth 7, rule 17).
- Still to run, in this order (they were started and stopped at the hand-off, no result): `bun mutate-one.ts --runtime ../round-14/adapter.ts`;
  `bun graph-gate.ts --runtime ../round-14/adapter.ts`; `bun falsify.ts --runtime ../round-14/adapter.ts --part suite1`, then `suite2`,
  `suite3`, `mutants`; `bun falsify.ts --runtime ../round-14/adapter.ts --part lies --parallel 4`; the listen.load search. Then update
  RESULTS.md's gate table (it still shows the pre-fix numbers).

Uncommitted or experimental work: none. Scratch scripts only, outside the repo (the session's scratchpad: `trace.ts` replays a fragstore
walk, `cmp.py` diffs outputs against ed3e1a29).

For the next builder:
- The lock's log allows one reason on at most 3 lines; every output change needs its own reason.
- `lifetime-falsify.ts --mutants a,b` runs only the named wrong runtimes (a prefix matches); a mutant whose edit breaks the syntax shows as
  "0 red", not as an error.
- A record kept at ready (`fromBoot`) is not the same as a record that ended before the reload (`v.retired` on disk): only the first
  has boot mail; the second's restored endings park on the lane in the turn (`turn.ts`, `!a`).
- `git stash` in a worktree shares the main checkout's stash list. On a clean tree `git stash; git stash pop` pops the user's
  `stash@{0}` ("preserve pre-integration lint edits"); that happened once here, was undone in this worktree only, and the stash is
  still kept. Do not use stash.

## Speed pass (2026-11-08)

Baseline (serial, 12 cores / 24 GB): suite `--no-search` 67 s wall, 1745 MB peak, 834/834; REV9-BURST/300-rows 44.9 s of it.

| Fix | State | Commit | Before | After | Sameness shown by |
| --- | --- | --- | --- | --- | --- |
| 1 ledger memo, linear `viewOf`, placements hoisted; `bindingIn` stops at its first match | done | 0806c7de | suite 67 s; rows probe N=120 body 2284 ms; 300-rows case 44.9 s | suite 27.7 s; N=120 555 ms; 300-rows 5.9 s | 834/834, every output compared equal, RECIPIENTS line identical; a temporary differential run recomputed every memo hit (186075) and compared copies, resets and the Slot-path tape: 0 differences |
| 2 canon: ancestor `Set` with add/delete; replay compares pairs of plain subtrees, memoised; `ranked()` by a Map | done | 546634af | suite 27.7 s; DRV-01 2.6 s, FRAG-15 4.7 s, R10 listener 3.2 s, 300-sends 2.3 s | suite 19.7 s; 1.6 s, 3.7 s, 2.3 s, 1.2 s | 834/834, outputs and RECIPIENTS identical; `FLOW_CANON_CHECK=1` (kept) recomputes the old whole-text comparison on every replayed step: 205650 steps, 0 differ; `FLOW_DEEP_FREEZE=1` suite 834/834 |
| 3 no per-step `stateHash` unless output is compared or collected | done | (this commit) | `--no-output` suite about 17-19 s | `--no-output` 13.1 s; plain 17.0 s | `rec.hashes` is read only by `output.ts` (`hashes: t.hashes.size`); `stateHash` reads only (fake `stateText`, `mayHave`, `truth`, `edge.text`, `normalise`), so skipping it changes nothing else; 834/834, RECIPIENTS identical with and without `--no-output` |
| extra: `pathOfId` without a path array per node; per-case `Bun.gc(true)` when the JSC heap (not RSS) passes 500 MB; `stateText` keeps its last answer per (world, now, outside text) | done | (this commit) | 300-sends 1.25 s in the suite (0.9 s of it hashing), rows 4.2 s | 300-sends 1.25 s, rows 3.2 s; plain suite 18.1 s to 17.0 s | equal value and order (`pathOfId`); GC timing decides no result (nothing weak in the suite or runtime); `normalise` is a pure function of its three inputs and the world is never written in place; 834/834, outputs, RECIPIENTS identical |

Findings:
- Fix 2 departs from "cache canonical text per subtree": a text cache still pays the root's concatenation every step (most of
  the text built was the root tuple and the world object). The replay instead walks the replayed and the logged step side by side
  over plain arrays and objects (what `FLOW_DEEP_FREEZE` freezes) and keeps each pair found equal, so an unchanged subtree costs one
  lookup. Equal exactly when the two `JSON.stringify(canon(...))` texts are: JSON texts are self-delimiting and an object's key order
  is a function of its key set; leaves, and anything not plain (MailQ, Map, Set, Date), are compared by their canon text. A cycle
  seen anywhere switches that replay to whole texts. canon itself keeps its lines (the `d141.date-collapses` and `d143.user-ranked`
  mutants still apply), and returns the same values.
- No logged world is written in place: the suite passes 834/834 under `FLOW_DEEP_FREEZE=1`, which freezes every logged step's input
  and output (plain objects and arrays) so an in-place write throws and is Fatal.
- `slotRuns` does count the reference model's `resetOn` runs: `compiled` is wrapped (`wrap` in drive.ts) before `new Reference(compiled)`,
  so `Reference.copies` runs the wrapped Slot, which pushes to `slotRuns` and spends an armed `throwIn` (frag.scenario.ts arms
  `traits.check.resetOn`). The memo keeps both: a miss records the Slot paths it ran; a hit pushes the same paths (when not replaying)
  and is skipped while any of them is armed; an entry whose run threw is not kept.
- The lock blocks a clean exit for this whole task. D113 hashes every harness file (`file:drive.ts`, `file:harness.ts`,
  `file:reference/model.ts`, `round:adapter.ts`, and later main.ts, mutate*.ts), so any edit shows as "unlogged expectation changes"
  and the suite exits 1 although 834/834 pass and no output or RECIPIENTS changes. Logging and `--lock` were not allowed in this task
  (the brief keeps `expected.lock` and `expected-changes.log` untouched; the permission check refused a `--lock` run). The user
  decides: log one line per changed file and relock, or not. `bun main.ts ... --no-search --hashes` prints the lines needed.
