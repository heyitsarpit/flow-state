---
review code-audit
status open 2026-11-21
---
# Audit of `packages/flow-state-v3/`: what to delete now, later, and what stays (2026-11-21)

**Bottom line:** the production code is lean. Only about 30 lines of `src/`, `tests/`, `fixtures/` and `bench/` are
dead today, plus about 30 `export` keywords nothing outside their own file uses. The real dead weight is
`prototypes/`: 161,037 tracked lines in 644 files that nothing imports and no current record cites. Delete them now.
The designs would later remove about 1,250 more code lines, most of them in the schedule issue seam, the test seam,
the CLI and the turn walk, and the 76,874 prototype lines the old Specs and designs still cite. Everything else
stays: about 99% of the package code.

Every item is a proposal. Nothing is decided. The user's decisions in @proposal.spec-handover and the answers in
@review.spec-cohesion-r2 section 6a are taken as given. This audit extends @review.algorithm-review section 5, which
looked only at the code the designs touch.

## Conventions

- Paths are under `packages/flow-state-v3/` unless they start with `tools/` or `wiki/`. `X:n` is line n.
- Design abbreviations are those of @review.spec-cohesion-r2 (SI, TP, FR, SR, RO, ET, SC, TT and others).
- "Importers" counts files outside the defining file across `src/`, `tests/`, `fixtures/`, `bench/` and
  `flow.config.ts`. The docs build reads only the frozen `packages/flow-state/`
  (`apps/docs/scripts/generate-api-reference.mjs:15-35`), so no v3 export is kept alive by the docs.
- Unused exports come from `knip --workspace packages/flow-state-v3` (`knip.json`, the repo's `report:unused`
  script), checked by hand with `rg`.

## Summary by area

Lines are today's totals. "Now" and "Later" are lines removed; keyword-only edits are noted separately.

| Area                                         | Lines   | Delete now          | Later     | Keep   |
| -------------------------------------------- | ------- | ------------------- | --------- | ------ |
| Core, `src/core/` (non-test)                 | 11,958  | 3, plus 12 keywords | about 395 | 11,560 |
| Core tests, `src/core/*.test.ts`, `test/`    | 2,687   | 0                   | 0         | 2,687  |
| Front end, `src/*.ts`, `src/test/`           | 4,925   | 13, plus 9 keywords | about 170 | 4,742  |
| Host, `src/host/` (no tests, testing or CLI) | 3,904   | 4, plus 4 keywords  | about 8   | 3,892  |
| Host tests and `src/host/test/`              | 5,300   | 0                   | 201       | 5,099  |
| Test tooling, `src/host/testing/`            | 4,894   | 2, plus 3 keywords  | about 215 | 4,677  |
| CLI, `src/host/cli/`                         | 277     | 0, plus 1 keyword   | about 137 | 140    |
| `tests/`                                     | 35,752  | 0 (8 titles edited) | 123       | 35,629 |
| `fixtures/`                                  | 18,398  | 10                  | 0         | 18,388 |
| `bench/`                                     | 3,359   | 0                   | 0         | 3,359  |
| `prototypes/` (tracked files)                | 237,911 | 161,037             | 76,874    | 0      |
| `tools/flow-state-lint/`                     | 2,873   | 0                   | 0         | 2,873  |

The "Later" figures for core, front end, test tooling and CLI are @review.algorithm-review section 5's
delete-or-rewrite column. The rest are counted here.

## 1. Delete now

Independent of any design. For tests the project rule is disable, not delete. No test is listed here, because none
checks deleted code.

1. **Uncited prototype rounds: 161,037 lines, 644 files.** These are `prototypes/round-1` to `round-7`, `round-10`
   to `round-13`, `codec`, `s1-wait-graph`, `s2-completion`, `t54-skeleton` and the 16 top-level `.md` files
   (`HANDOFF.md`, `README.md`, `SCENARIOS.md`, `convergence-1.md` to `convergence-13.md`).
   - Evidence: `rg -n prototypes src tests bench fixtures flow.config.ts` finds nothing. No record outside a `.log`
     cites these paths (`rg 'prototypes/(round-(1[0-3]|[1-7])/|codec|s1-wait|s2-comp|t54|HANDOFF|SCENARIOS|convergence)'
     wiki tools AGENTS.md`). The prototype rounds ended, and production is built test-first. 107 groups of
     byte-identical files repeat across rounds. For example, `mutants-r5.ts` appears in 11 rounds.
   - Risk: low. Logs that name these paths become history. Name the deleting commit in
     `wiki/plans/flow/references/README.md`, as for `20986677`.
2. **Thirteen dead type re-exports: `src/definition.ts:98` (`EventToken`) and `:100-121`.** The names are
   `Handler`, `KeyedConfig`, `KeyedSchedule`, `ReadHandle`, `RootToken`, `ScheduleConfig`, `ScheduleEntry`,
   `ScheduleKey`, `ScheduleMetadata`, `StateRead`, `StateTokens` and `WriteHandle`. Removes 13 lines.
   - Evidence: knip lists all 13. An import grep for each name from `definition` finds 0 files, and the others on the
     same lines have 1 to 3 importers. `flow.ts` and `compile-schedules.ts` import these names from `tokens.ts`.
   - Risk: none. `src/index.ts:17,23` re-exports only `definition`, `Definition` and `Machine` from it.
3. **Four dead re-exports in `src/host/runtime.ts:52,55,57,58`** (`MachineOf`, `ServicesLayer`, `noStore`,
   `servicesFailed` from `setup.ts`). Removes 4 lines.
   - Evidence: knip, and `runtime.ts:61-71` imports the same names again for its own use.
4. **Over-exports: drop the `export` keyword (0 lines).** Each name is used in its file and nowhere else (knip,
   then `rg -cw` in the file).
   - Core: `identity.ts:42` `nameOfValue`, `schedule-plan.ts:37` `schedulesOf`, `schedule-plan.ts:172` `Due`,
     `compiled.ts` `UpdateInput`, `CommitContext`, `ContextSlot:446` and `Reaction`, `evidence.ts:83` `Who`,
     `record.ts:70` `RecordKind`, `world.ts:315` `Ended`, `world.ts:386` `Queued` and `world.ts:590` `Chain`.
   - Front end: `events.ts:43` `payloadOf`, `flow.ts:88` `readerOf`, `event-tokens.ts:11` `EventToken`,
     `contract.ts:41` `FailureTag`, `contract.ts:84` `FailureOf`, `definition.ts:202` `ProvidedBy`,
     `machine.ts:86` `MachineBody`, `tokens.ts:413` `ValueOfRead` and `tokens.ts:479` `ChangeSpec`. After item 2
     lands, also `tokens.ts` `WriteHandle`, `ReadHandle`, `Handler`, `ScheduleConfig` and `ScheduleEntry`.
   - Host: `owners/owners.ts:53` `judge`, `:80` `Hear` and `:382` `releaseScope`, `context-refs.ts:7`
     `ProviderOf`, `cli/discover.ts:11` `ConfigLoadFailed`, `testing/seam.ts:187` `sameAttempt`,
     `testing/select.ts:88` `NamedEvidence` and `testing/story.ts:112` `Steps`.
   - Risk: low. Run `nub run check` after removing them: a name in an exported signature may need to stay exported.
5. **Duplicate helpers: 5 lines.**
   - `src/core/boundary.ts:444-445` `reasonOf` is the same body as the exported `src/core/record-format.ts:25-28`.
     Import the second copy.
   - `src/core/turn.ts:349` and `src/core/schedule-plan.ts:32` both declare `NO_SCHEDULES`. Keep one.
   - `src/host/testing/run.ts:143` and `src/host/testing/story.ts:117` both wrap `actorIdOf` (`src/host/refs.ts:68`)
     as `actorOf`, each used once. Call `actorIdOf` directly. Risk: if `ActorRef<D>` does not widen to `ActorRef`,
     `tsc` fails and the wrappers stay.
6. **Dead fixture Stories: `fixtures/lanes/stories/load.ts:80-89`** (`stressCrowd256` and `stressCrowd16`). Removes
   10 lines.
   - Evidence: `rg -nw 'stressCrowd256|stressCrowd16'` finds only the definitions. `crowdOf(n)` (`load.ts:77`) replaced
     them for the bench's world-size series, from the commit `9b368338d` that added them. `fixtures/lanes/index.ts:8`
     imports `crowdOf`.
7. **Stale temporary ids in names and comments: 8 lines edited, none removed.**
   - "Pending D9": `tests/restore/store-provision.test.ts:40-41` and `tests/types/persistence.test-d.ts:43`.
     `wiki/plans/flow/Pending.plan` goes from D8 to D10, so the item no longer exists.
   - "Safari D1" and "Safari D3" are rows of a prototype record (`prototypes/safari/RESULTS.md:113-115`). They appear
     at `src/host/platform/indexeddb.test.ts:58,75,76` and `tests/browser/store.browser.test.ts:37,145`. Cite the
     WriteAhead rule instead, or the UH Spec once it exists.
   - `src/core/context.ts:45` cites a bare "(R19)". Write it as `Compile R19` (M17).
   - `src/host/cli/main.ts:105` says "The `flow` bin calls it", but the package has no `bin` (`package.json`).
8. **Checked and found clean, so nothing to remove:**
   - Skips: every skip sits behind a named switch (`tests/switches.ts`). The one exception,
     `tests/browser/hide.browser.test.ts:129`, is a runtime skip on display state.
   - Faults: all 18 `tests/*-faults.ts` files are imported by `tests/faults.ts`.
   - Lint rules: every rule in `tools/flow-state-lint/` targets paths and symbols that exist.
   - Leftovers of settled decisions: no Firefox target anywhere (`rg -i 'firefox|gecko'` finds 0). The 11
     `Flow.keyed` sites must wait for their Task (item L3).
   - Unreachable code: `noUnusedLocals` is on, and no statement follows a `return` or `throw`. The `impossible`
     arms (`src/core/lane-moves.ts:375-401`, `src/core/cells.ts:262-310`) are the table's ruled-out cells.

## 2. Possibly delete later

Each item is deletable only once its trigger lands. All of them stay proposed until the Specs are written and
reviewed.

1. **L1. Stored schedule issues (SI, @task.V3.T118): about 98 lines.**
   - Code: `src/core/schedule-decision.ts:121-152` (`isScheduleSource`, `checkSlotsOf`, `armingSlotsOf`,
     `sourceKeyOf`, `issueKeyOf`), `:153-169` (`plannedOf`, `plannedTrack`), `:202` (`Pass.ran`), `:208-214`
     (`ran`) and `:443-470` (`issuesAfter`); `src/core/world.ts:287-301` (`withIssuesOf`); and the call sites at
     `src/core/schedules.ts:16,43,278,341`.
   - Replaced by derived issues in one `issues-of.ts` (M7).
   - Tests: five faults (`check-issue-never-cleared`, `check-issue-cleared-unrun`, `last-issue-wins`,
     `firing-clears-every-key`, `firing-keeps-own-issue` in `tests/schedule-faults.ts`) edit
     `schedule-decision.ts:452-466`. They need new targets, not deletion. `tests/turn/schedule-sequences-wrong.ts`
     (118 lines, 365 inverted rows) empties as T118 closes rows; delete it when it is empty.
   - Trigger: T118 green.
2. **L2. The other stored issues (ET:12 and :228-230; RO 8.1 under "Derived issues").**
   - Code: `IssueSource.Creation` (`src/core/world.ts:234,257`; `src/core/incarnations.ts:42,184`), then the
     `Incarnation.issues` field (`world.ts:214`) once `StoredIssue` is `never`.
   - Trigger: ET's and RO's issue Tasks.
3. **L3. `Flow.keyed` (Declared-schedules Task; @review.algorithm-review 1.7).**
   - Code: `src/flow.ts:308-313`, `src/tokens.ts:320,347`, `src/config.ts:224-236,462` and
     `src/compile-body.ts:325-327`.
   - Call sites to rewrite (11): `fixtures/home/machines/room.ts:147`, `fixtures/home/stories/structure.ts:119`,
     `tests/home/schedules.test.ts:407`, `tests/turn/schedule-table.test.ts:178`,
     `tests/turn/schedule-keys-table.test.ts:67,533`, `tests/turn/schedule-sequences.test.ts:79,91`,
     `tests/compile/schedules.test.ts:111` and `tests/types/schedules.test-d.ts:38,77`.
   - Net about -70/+65 lines (algorithm review 1.7). The dead `KeyedConfig` and `KeyedSchedule` re-exports go now
     (item 2).
   - Trigger: the Declared-schedules Task, after T118.
4. **L4. `~` marks replaced by `Made` (6a Q4 B; ET's T98a).**
   - Code: 86 lines of `"~flow"`, `"~token"`, `"~owner"` and `"~path"` in 12 front-end files (`src/config.ts` 21,
     `tokens.ts` 15, `definition.ts` 14, `flow.ts` 13 and others). They change rather than go.
   - Six `no-mark-probe` disables go: `src/config.ts:34`, `src/construction.ts:146`, `src/compile-names.ts:57`,
     `src/machine.ts:272`, `src/host/testing/run.ts:487,494`.
   - Keep the lint rule, but its message (`tools/flow-state-lint/rules/no-mark-probe.ts:22-31`) recommends a
     WeakSet or WeakMap, which Q4 rejected. Reword it.
   - Trigger: T98a.
5. **L5. `CleanupOverdue` (M8, @review.spec-cohesion-r2 6b): about 8 lines** at `src/host/close.ts:181,196,253-258`.
   The `cleanups.test.ts:313-368` assertions move to `ReleaseOverdue`.
   - Open conflict: RO:324 keeps it for the Runtime close, while 6b deletes it. Settle this in the RO Spec.
   - Trigger: RO's `ReleaseOverdue` lands.
6. **L6. `checked(run)` and `lenient` (6a Q10 A; TT:184-185).**
   - Code: `tests/rules/rules.ts:574-578` and its 177 calls in 44 test files. The 21 rules in that file move to
     `flow.config.ts`; they are not deleted.
   - `lenient` sits at `src/host/testing/run.ts:215-218,634`; its one use is `generate.ts:847`.
   - Trigger: TT's verdict Task.
7. **L7. The test seam (TT, @task.V3.T97).**
   - Code: `src/host/testing/seam.ts` (211 lines, 10 importers: 9 `src/host/*.test.ts` files and
     `src/host/test/cleanups.ts`).
   - With it goes `src/host/test/cleanups.ts` (201 lines). Its only importer is `src/host/cleanups.test.ts`, and it
     is a third test-helper home besides `src/host/testing/` and `src/test/`.
   - Trigger: T97 ports the host tests onto Story.
8. **L8. CLI (6a Q11 A; SC): about 137 of 277 lines.**
   - Code: `src/host/cli/main.ts:128-136` (exit mapping, `Cause.pretty` at `:135`, against ET PD4) and the loader in
     `discover.ts`, which imports test tooling (`testing/config.ts`, `run.ts`, `steps.ts`, `story.ts`).
   - SC's new `Outcome` collides with `src/flow.ts:355` (public, `src/index.ts:33`).
   - Trigger: SC's CLI Task.
9. **L9. Turn walk and front end (TP, FR, ET, SR; @review.algorithm-review section 5).**
   - Turn: about 110 lines, for example `Act.Emitted` in `src/core/serve.ts` (TP:391).
   - Incarnations: 25. Records: 75. World: 25. Boundary (`admitted`): 70. Compile: 70. Trust surface: 100 (ET:167
     drops `invalid(path, reason: string)`).
   - Trigger: each design's Task.
10. **L10. Prototypes still cited: 76,874 lines, 395 files.**
    - Directories: `round-14`, `round-14x`, `round-9`, `round-8`, `safari` and `s5-session`.
    - Cited by six old core Specs (`wiki/specs/core/Turn.spec`, `WriteLanes.spec`, `WriteAhead.spec`,
      `Restore.spec`, `StaticCli.spec`, `Actors.spec`), four designs (TP, FR, DL, UH) and `revisit.md`.
    - Trigger: the new Specs cite code (M16) and the old ones are superseded ("Code over old Specs"). Then delete,
      naming the commit.

## 3. Keep

- **Core (about 11,560 lines):** lanes and ledger (the table is unchanged), cells, codec, frozen, same, tree,
  persist, actor-record, life and disposal. Every export has an importer or is in item 4.
- **Core tests (2,687):** each cites a Spec id. The overlap between `src/core/ledger.test.ts:281` and
  `src/host/ledger.test.ts:325` checks the same rule at two levels; keep both.
- **Front end (about 4,742):** compile, construction and tokens, with only the L3 and L4 edits.
- **Host (about 3,892):** driver, runtime, edge, close, snapshot, inspect, owners and platform. `trace.ts:181`
  `renderers` has one entry, but @plan.CommandLine requires JSON output, so it stays.
- **Test tooling (about 4,677)** and **host tests (5,099).**
- **`tests/` (35,629):** 23 `it.fails` lines are known-wrong claims that flip when fixed. Six switches
  (`FLOW_TWIN_RUNS`, `FLOW_BENCH_LIMITS`, `FLOW_EVERY_RELOAD`, `FLOW_REPLAY_SWEEP`, `FLOW_EVERY_STORY_CLI`,
  `FLOW_SEEDS`) gate the cut runs as the disable rule requires.
- **`fixtures/` (18,388):** all 187 files are reached from tests or the bench. The seven unreferenced `*Http` live
  adapters (for example `fixtures/sign-in/adapters/auth.ts:12`) are required by `wiki/conventions/fixtures.md:59`.
  The "retired link" Stories (`fixtures/sign-in/stories/edges.ts:28` and others) test today's `Retired` handling.
  53 fixture exports are used only in their own file; dropping their `export` is optional tidying.
- **`bench/` (3,359):** all 26 files are reachable from `bench/run.ts` and the registry. `bench/history/samples/`
  is gitignored (`.gitignore:32`).
- **`tools/flow-state-lint/` (2,873):** all 13 rules are registered and live, with only the L4 message edit.

## 4. Implicit state machines and duplicated state seen in passing

Named only. No fixes are designed here.

- **Implicit state machines as flag sets:**
  - `src/host/edge.ts:61-65`: `marked`, `tickets`, `again`, `out` and `wake`. Only `wake` is a tagged state; the
    "batch out" and "marked" phases are booleans.
  - `src/host/testing/sweep.ts:186-190`: `given`, `fired`, `stood`, `replayed` and `refusedBefore`, a phase sequence
    kept as flags.
  - `src/host/testing/generate.ts:501-506`: `offlineLeft`, `offline`, `online` and `quieted`, an offline span's
    lifecycle kept as flags.
- **Stored derived state:** `Incarnation.issues` (`src/core/world.ts:214`; L1 and L2). `paused` writes `Tracked.run`
  (`src/core/schedule-decision.ts:405`; algorithm review D2).
- **One name, two things:**
  - `Quarantine`: `src/core/world.ts:524` (unreadable record) and `src/host/driver.ts:79` (failed cleanup).
  - `Due`: `src/core/world.ts:751` and `src/core/schedule-plan.ts:172`.
  - `trackedOf`: `src/core/schedules.ts:210` and `src/core/schedule-restore.ts:98`.
  - `Verdict`: `src/core/turn.ts:131` and `src/core/life.ts:35`.
  - `Timer`: `src/core/world.ts:453`, which SI's `Tracked` to `Timer` rename collides with.
  - `settle`: four definitions (M13).
- **One concept, two definitions:** `PhaseTag` (`src/host/inspect.ts:64`) is declared again at
  `tests/generated/pairs.ts:7`. `Who = ActorId` (`src/core/evidence.ts:83`) is a second name for one type.
  `dataView` has two routes (`src/host/inspect.ts:215` and `src/core/data-view.ts`).
- **Four test-helper homes:** `src/host/testing/`, `src/host/test/`, `src/test/loose.ts` and `src/core/test/ids.ts`.
- **For the user to judge:** 52 lines in 17 test files cite `wiki/conventions/fixtures.md`, a file outside the
  package (for example `tests/player/rooms.test.ts:15`). It is a durable convention, not a dated record.

## Sidecar log

Four Haiku sidecars, effort high, read-only. Each finding below was re-checked with `rg`, knip or a read.

- **1. Core dead code.**
  - Accepted: the 13 `definition.ts` re-exports (import grep), the `reasonOf` and `NO_SCHEDULES` duplicates (read),
    the "(R19)" cite, and `nameOfValue`, `schedulesOf`, `payloadOf` and `readerOf` (knip agrees).
  - Changed: `Chain` is mentioned in `serve.test.ts:244` only in a comment, so it is an over-export, not test-only.
    The test-only exports (`Table`, `Origin`, `Closed`, `Trigger`, `registrationOf`) are kept, because tests are
    consumers.
  - Rejected: `Services`, `ServiceIds`, `KeyFields`, `KeyRecord`, `OptionalField`, `Reader`, `Kind`, `SendEvent`,
    `Reads`, `TurnInput` and `Plain` as over-exports. knip does not flag them, so leave them to the item 4 check. The
    two `trusted` casts (`events.ts:24`, `contract.ts:244`) are not duplicates: each holds its own SAFETY reason at
    its boundary.
- **2. Host and CLI dead code.**
  - Accepted: the over-exports in item 4, `actorOf` (with the `tsc` caveat), the "Pending D9" and "Safari D" titles
    (`Pending.plan` read), and the missing `bin`.
  - Changed: `src/host/test/cleanups.ts` moved to L7 rather than delete-now, because it is live test tooling.
  - Rejected:
    - The single-entry `renderers`, which @plan.CommandLine needs for JSON.
    - The `story run` overlap with `trace`: both are kept commands.
    - The barrel-only type re-exports: a public testing route.
    - `StoreWrite`, part of the persistence route's `Store` API.
    - The `fixtures.md` cites, moved to section 4 for the user.
- **3. Tests, fixtures, bench, prototypes.**
  - Accepted: `stressCrowd256`/`16` (rg), the skip and switch inventory (re-run), the 18 fault files (count
    re-run), prototype import absence and sizes (recounted over tracked files: 161,037 and 76,874), and the lint
    targets.
  - Rejected:
    - The `*Http` adapters (required by `wiki/conventions/fixtures.md:59`).
    - The retired-link Stories (current behaviour).
    - The duplicate `Compile R4` null-handler tests in `tests/sign-in/trusted-device.test.ts:198` and
      `tests/transfers/standing-order.test.ts:224`, which are per-app fixture coverage.
    - The `tests/limits.ts:28,30` timings, which are data, not dead code.
- **4. Design-superseded symbols.**
  - Accepted: the L1 symbols and spans (re-read: 98 lines), the 11 `Flow.keyed` sites, `CleanupOverdue` and its
    conflict (RO:324 against 6b), the seam's 10 importers, the CLI split, and the 86 mark lines (recounted per file).
  - Added by the owner: the five faults on `issuesAfter`, found by mapping each `find` string to its line.
  - Rejected:
    - "ET drops `inert` and `raise`": ET:24 keeps `raise`, and ET:95 keeps `registrationOf`.
    - `propsBaselines`: no code has it (zero hits), so there is nothing to delete.
