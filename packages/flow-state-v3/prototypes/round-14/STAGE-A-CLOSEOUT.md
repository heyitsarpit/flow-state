# Stage A close-out: completion audit of phases 0 and 1

Auditor: an independent Opus agent that did none of this work, with four read-only Haiku sidecars at effort high. Audited at HEAD
`eb746c9e` (branch `flow-rewrite`) on 2026-11-09. Nothing was committed, and the runtime, suite, design and plans were not edited.

Paths: D = `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`, P = `workflow/roadmaps/v3-production/progress.md`,
S = `packages/flow-state-v3/prototypes/round-14/STATUS.md`, R = `workflow/plans/flow/references/proposals/revisit.md`,
C = `packages/flow-state-v3/prototypes/conformance/`, RT = `packages/flow-state-v3/prototypes/round-14/`.

## Verdict: FAIL, on five blocking items

The work is real and nothing was rubber-stamped. Gates pass at HEAD: 25/25 in 532 s. Every area was adversarially audited, and its
survivors were either closed by a case or carried to phase 3 by name. H1, H2 and `listen.load` hold. `fragstore.row` does not (B5).

Five items block phase 2:
- two places where the design and the prototype still disagree (B1, B2);
- design rules that have no prototype check and are not listed as carried (B3);
- the user's-read list was not kept up after 2026-11-08 (B4);
- `fragstore.row` fails at depth 7 at HEAD, a regression since entities round 1 that the gate's depth-4 run hides (B5).

Amendment 11 takes the user's stop out of phase 2, so that list is now the user's only control. B1-B4 are each a few hours' work for the runner. B5 needs a diagnosis first. After the fixes, re-check B1-B5, and run the gates again if
the runtime or an oracle changes.

## Item table

| Phase | Done when | Result | Evidence |
| --- | --- | --- | --- |
| 0 | Every decision in machine-design.md has prototype cases that pass | **PASS-WITH-LIMITS** (fails for B1, B3) | Sidecar 1 mapped 53 of the 55 C162-C216 rows to cases (C/scenarios/round15, fixpass, phase1h, phase1e, phase1s, phase1m). Without a case: rule 13's `ModuleDisabled` and `Abandoned` (D:672 against C/compile/operations.ts:219), "`byReason` keys must be Flow's reasons" (D:674 against operations.ts:251-252, which refuses only never-unknown reasons) and `GoneWithoutKey` (D:1017 and C209 D:8755; not in RT/cli or C/compile). C207 is contradicted (B1). Older design items are not built and are stated only in S: LIFE-19, 20, 25, 26, J, `ScheduleLeadsToWrite`, the restored quiet mark's fields (D:1026, D:9771) and the context half of `ConflictingActorRef` (S:44) |
| 0 | Every prototype decision is in machine-design.md, or listed as a conflict for the user | **PASS-WITH-LIMITS** (fails for B2) | Missing from both the design and revisit.md: two write operations over one contract get two lanes (S:1700-1701; B2). The design is stale in places: the `dropAt` registration rule and `dropAt` being persisted are built (S:1654, 1664) but D:9808-9811 still says "owed to the builder"; the 2.5 normative step D:1526-1529 still carries the cancel exemption that OD50 R1 dropped (D:710) |
| 0 | The review finds no remaining disagreement, area by area | **FAIL** | B1 (repair asks), B2 (lane per contract) and B3 (compile refusals). This audit is that review |
| 0 | Gates pass at the final commit | **PASS** | Gate table below: 25/25 at `eb746c9e` |
| 1 | Entities (OD52), streams (OD53), migration (OD54), H1 and H2 settled and recorded with plan rows | **PASS** | OD51 C178-C186 (H1 is C184; H2 by U17, C174/C181); OD52 C185-C200; OD53 C201-C209; OD54 C210-C216 (D:8706-8762, D:9620-9972) |
| 1 | ...listed for the user's read | **FAIL** (B4) | "Calls for the user's read" (P:144-211) ends at the CP1 relock of 2026-11-08. No call since OD49 is in it, Q17-Q20 and the per-record reset included; they appear only in log lines (P:461, P:463) |
| 1 | Each area's slice passes and was adversarially audited, survivors closed or carried | **PASS** | Entities: audits 2, 1b, 3 and 3b; every survivor is red by assertion (S:1180-1310), or one of the seven combination survivors carried to phase 3 by name (S:1312-1329). Streams: S1's 16 survivors are closed by cases (S:1423-1446); S1b's 8 survivors and 3 lies are closed, and two fixture gaps are carried (S:1330-1335). Migration: M1's 12 survivors and 2 breaks are closed (S:1692-1725); M2's 8 survivors, 4 breaks and weak kill are closed (S:1765-1801). Nothing was waved through; details in the sidecar 3 log |
| 1 | `listen.load` and `fragstore.row` pass | **FAIL** (B5) | Green in the falsify search gate, which runs them at depth 4 only (C/falsify.ts:119-121). At depth 7 (round 14's own depth): `listen.version` completed (110,726 states); `listen.none` was inconclusive at the 200,000-state budget (no failure); `fragstore.row` **failed** at 25,932 states (B5) |
| 1 | H1 and H2 fixed and pinned | **PASS** | H1 is `ImpureDefault` (C/scenarios/phase1h.scenario.ts:81-107). H2 is round 13's exact case (phase1h:301-322). Both are in the lifetime gate |
| 1 | M5 settled, or listed for the user | **PASS-WITH-LIMITS** | Settled in substance as a harness bug: oracle (h) now accepts a self-release only when the cancel's own cell is in the step (S:695, S:780, S:802). R15Late's `Unsure` does a key-less cancel in its own handler (C/typed/round15.ts:31). The lies `lie.held-released-unguarded` and `lie.self-release-faked` stand (C/falsify.ts:299, 310). But no record names round 13's M5 as settled (minor m5) |
| 1 | One path per area from a real source | **PASS-WITH-LIMITS** | Entities: a supabase-js PostgREST response shape (S:909). Streams: a browser-shaped EventSource and WebSocket (S:1362, S:1464). Migration: a release 1 to release 2 record path (S:1586), whose source is Flow's own persisted record in the fake store, not a real storage API shape (an IndexedDB structured clone, or a `localStorage` string). Acceptable for a runtime-only prototype; phase 3 should run migration against a real store adapter |
| all | Calls for the user's read cover every agent-judged ruling that changes public API or a guarantee | **FAIL** (B4) | See B4 and the sidecar 4 log |
| all | No lead accepted sidecar work without its own re-check | **PASS** (minor m9) | Every sidecar log in S records evidence per row (S:805-814, 886-892, 962-967, 1002-1007, 1162-1169, 1258-1264, 1400-1405, 1499-1506, 1566-1571, 1634-1639, 1679-1683, 1716-1720, 1759-1763, 1822-1826) |

## Blocking findings (fix before phase 2)

**B1. The repair bound: the design and the prototype disagree, and the suite pins the superseded text.**
- C207 (D:8753) and OD53 (8) (D:953-955) say a doubt gets at most 3 asks in total; after `RepairOverdue`, nothing asks again until a
  release or a reload.
- The runtime resets the count at `RepairOverdue`: RT/entities.ts:231-233 returns `asks: 0`, commented "the next news asks again".
  `answered` (entities.ts:242) also resets it.
- SURV case C/scenarios/review.scenario.ts:642-652 asserts a fourth ask after overdue. It cites the superseded C190.
- The builder recorded the question at S:995-996 ("The design should say which"). OD53 answered it, but neither the runtime nor the case
  followed.

Either align the runtime and that case to C207, or reverse C207 and say so for the user's read.

Abstractly, C207 as written is poor for long-lived screens: a dashboard, a map of live objects, or a kiosk open for days keeps a record
doubted and never asks again until a reload. I recommend reversing C207, as the runtime already behaves: one bounded round of 3 asks per
new doubt-raising event. Which events count as "news" must then be defined. Also state that a re-send's `StillUnknown` is a new doubt,
which the SURV case already assumes.

**B2. Lane identity with two write operations over one contract.**
- 2.7.15 and C214 (D:8760) define a lane as (identity with its version, contract id, key).
- The runtime keys lanes by operation name, so two write operations over one contract in one machine get two lanes (S:1700-1701, M1
  finding 1).
- No closure, no carry and no revisit.md entry (sidecar 3, verified).

This affects correctness in ordinary apps: two buttons that both call `updateTicket` (rename, archive) would send two concurrent writes for
one server record and key with no serialization, and each lane's `concurrency` policy would be bypassed.

Rule one of these: the runtime keys lanes by contract, or compile refuses two write operations over one contract in a machine (an
upfront contract, simplest), or the design states the split. Then add a case.

**B3. Design rules with no prototype check, not listed as carried.**
- Rule 13's reserved set in compile omits `ModuleDisabled` and `Abandoned` (C/compile/operations.ts:219, against D:672). The runtime emits
  `ModuleDisabled` (RT/hooks.ts:185, 197) and `Abandoned` (RT/step.ts:157), so an author's `ModuleDisabled` failure tag compiles today.
- "`byReason` keys must be Flow's reasons" (D:674-675, OD50) is not enforced. Only never-unknown reasons are refused
  (operations.ts:251-252, with the comment at :221 admitting it), so `byReason: { Busy: ... }` compiles.
- `GoneWithoutKey` (D:1017, C209) has no check and no fixture.

Either build them (a few lines plus front-check pins) or list them as gaps carried to phase 3. Otherwise a plan merge that treats the
prototype as the main truth (amendment 11) may drop them.

**B4. The user's-read list is stale.**
The roadmap requires every agent-judged ruling under "Calls for the user's read" with its reason, evidence and reversibility, and the cost
of a late overrule ("Stops and the review queue"; amendment 9). P:150-211 stops at 2026-11-08. Every call since OD49 lives only in log
lines, mostly without reversibility or cost (sidecar 4 counted 46 items and 22 proposed names; I checked the section's end and the log
lines myself).

Add one entry each, at least for:
- **Q17**: lane = (identity, contract, key); an old identity's lane re-keyed to `key#identityTag`.
- **Q18**: the per-record reset (OD54 (8)). This departs from the user's own Q1 wording, "that definition's saved memory and state are
  discarded" (P:458, D:9885). It should be the first entry, flagged as a change to a user decision, not a small call.
- **Q19**: the upfront structural rule, with its data-loss consequence. A harmless validation change (`minLength(1)` to `minLength(2)`)
  resets every record of a definition, so an offline notes app loses unsent drafts held in memory. Note too that the prototype stamps
  computed fields against the ruling (R:21).
- **Q20**: a field drop is applied at its boot.
- OD54 (2), (3), (4), (6), (11), (12), (13), (14).
- The OD49 to OD51 rulings: R1-R10, the persist placement the user asked about (P:413, P:415), and `forget`'s semantics.
- The OD52 rulings: D3 as built and its price, the timer removal (S:924-929 listed it as "Decisions needed, for the user"; the runner ruled
  at P:421), the 4,096 cap, `ModuleDisabled` failing closed, and the judge.
- The OD53 rulings: `emit.fail`, select each turn, `dropAt`, the default backoff, `Feed.callback`'s bound, and Q2 A, which S calls the
  runner's call.
- The proposed names in OD49-OD54 as one batch (sidecar 4 table B).

**B5. `fragstore.row` fails at depth 7 at HEAD: a regression hidden by the gate's depth.**
- Command, from `C`: `bun search/run.ts --which fragstore.row --runtime ../../round-14/adapter.ts --depth 7 --states 200000 --expect completed`
- Result: `failed`, 25,932 states, after 35 s.
- Failure: "silently wrong: shows {id a, v 0, revision 1}, server {id a, v 1, revision 2}", on the trace
  `Go ack GiveUp GiveUp repair.start repair.start put.ok`.
- Round 14 recorded this search as completing at depth 7 (43,508 states; S:566, P:405).

Bisected with `git archive` copies in the scratchpad:

| Commit | What it is | Result |
| --- | --- | --- |
| `64ee7807` | round 14 done | completed, 43,508 states |
| `e6b0db23` | area H | completed |
| `19b6ab2e` | entities round 1: D3's send-time join, U10/rule 32's two mark levels | failed, same trace |
| `380b3f62`, `3ce7da6c`, `1819a851` | later commits | failed, same trace |

The gate runs this search at depth 4 (`C/falsify.ts:121`), where the failure cannot be reached, so every gate since has been green over it.

Two readings, and I did not decide between them:
- Harness. The oracle (`C/search/fragstore.search.ts:100`) knows only `predicted` and `uncertain`. It predates round 1's quiet
  `unconfirmed` level, so it may call a row marked `unconfirmed` silent.
- Runtime. After the original write's `put.ok`, which lands following two give-ups, the store keeps the stale row. That would break "never
  silently wrong".

To close B5:
- Diagnose the trace.
- If the oracle is wrong, make it read `unconfirmed` the way the like drain does, and add a lie that keeps a stale row unmarked.
- If the runtime is wrong, fix it and add a case.
- Either way, pin `fragstore.row` (and `listen.version`) at depth 7 in a gate, or record why depth 4 is enough.

## Minor findings (the runner fixes inline)

- m1. D:1526-1529, the normative "Late turns" step of 2.5, still says "less the queues of lanes the transition cancels key-less". OD50 R1
  (D:710) removed that exemption, and RT/turn.ts implements none.
- m2. D:9808-9811 and C205: state that a registration ends the not-live period and that `dropAt` is kept with a `latest` bookmark (S:1664),
  and delete "owed to the builder" (built, S:1654).
- m3. D:9774 points to a revisit.md entry for the `GuardContradicted` CI probe that does not exist. Add the entry.
- m4. D:694, rule 15's "`flow check` errors on a late handler with no alternative that stays put", is wider than the built check: writes
  under `serialize`/`latest`, own lane only (RT/cli/check.ts:173). R8's limit (D:720) names the own-lane part. Add that a late read's handler
  is not checked.
- m5. Record round 13's M5 as settled (a harness bug in oracle (h); the evidence is in the M5 row above) in P and in the user's-read list.
- m6. Stale records:
  - S:1339-1341 still asks whether `Released` frees a never-re-sent unknown. P:440 ruled it, and D:955 and C189 say so.
  - RESULTS.md's gate table and its `listen.load`/`fragstore.row` rows still show round 14's "known to fail" state.
  - P's Resume block (P:5, P:77-80) and Phases checklist (P:118-119) say phase 1 is "not started".
  - Q19's log wording "computed fields unstamped" (P:461) does not say the prototype stamps them (R:21).
- m7. Collect the not-built design items into one phase-3 carry list (in revisit.md or a phase 3 input), so the plan merge marks them
  unproven: LIFE-19, 20, 25, 26, J, `ScheduleLeadsToWrite`, the context half of `ConflictingActorRef`, the restored quiet mark's `fields`,
  and the B3 items if not built.
- m8. Coverage gaps to carry to the phase 3 suite (the rule exists; the case is weak):
  - C202 eviction by last write is not told apart from creation order (C/scenarios/phase1s.scenario.ts:252-266, 517-534).
  - C168's restore after a crash before the removal ack has no case.
  - C166's live-admission throw is tested on the reload path only (fixpass:202-214).
  - C184's assertion checks only a non-empty message (phase1h:98-99).
  - Jitter determinism is checked only through replay.
  - Rule 70's wait per operation (S:1330-1335; S:287 tests bookmarks only).
  - M2 item 16 and M1 finding 6: harness excuses that work per actor, not per lane.
- m9. Two sidecar logs (S:1046, S:1343) are single paragraphs without an accepted, changed or rejected label per item. The runner probe at
  S:1007 was "accepted" with no recorded re-run by the lead. These are format slips; the content shows the checks were made.
- m10. lifetime-falsify took 276.6 s against its 290 s limit in my run (282 s in P:462). Split it before phase 3 adds load, or it will go
  unknown by time.

## Gate table (run once at HEAD `eb746c9e`)

Command, from `packages/flow-state-v3/prototypes/conformance/`:
`perl -e 'alarm 590; exec @ARGV' -- bun gates.ts --runtime ../round-14/adapter.ts --round 14 --budget 580`
(8 slots, 16 GB cap, load average 9 at the start from outside work). Exit 0: **GATES 25/25 ok, 0 BAD, 0 unknown, in 532 s**.

| Gate | Result | Seconds (measured alone) | Peak MB |
| --- | --- | --- | --- |
| suite | ok, 2163 pass | 34.6 (19) | 1290 |
| suite canon | ok, 2163 | 50.8 (30) | 1408 |
| suite copies | ok, 2163 | 61.4 (43) | 1284 |
| mutate-one | ok, 13 | 52.7 (55) | 2768 |
| graph-gate | ok, 1081 | 26.1 (16) | 1254 |
| falsify suite1 / suite2 / suite3 | ok, 5 / 4 / 3 | 43.6 / 96.9 / 31.3 | 1358 / 2265 / 1627 |
| falsify tamper | ok, 13 | 6.8 | 452 |
| falsify mutants | ok, 15 | 105.3 | 1349 |
| falsify search | ok, 51 (flagged to re-measure, under load) | 104.3 (40) | 415 |
| falsify lies 1/4, 2/4, 3/4, 4/4 | ok, 21 each | 89.8 / 77.5 / 58.7 / 89.9 | about 1330-1430 |
| lifetime-falsify | ok, 401 | 276.6 (210), limit 290 | 2278 |
| checks: front, mailq, score, search-vacuity, story, types | ok, 1 each | 0.1-0.8 | 37-363 |
| typed tsc | ok | 0.3 | 310 |
| cli pins | ok, 66 | 6.4 | 151 |
| verdict plants | ok, 73 | 9.3 | 1495 |
| Extra, mine: `search/run.ts --depth 7 --states 200000 --expect completed` | fragstore.row **FAILED** (35 s, 25,932 states); listen.version completed (159 s, 110,726 states); listen.none inconclusive at the budget (251 s, 200,000 states) | | 370 (fragstore.row) |

The per-job outputs are in the session scratchpad
(`/private/tmp/claude-501/-Users-arpit-Developer-flow-state/7c804465-a799-49f4-a9d6-e0e809037e27/scratchpad/gates-out`).

## Does the settled design work for very different apps?

- **Offline money writes** (the shop, the smart home): sound. Holds, unknowns, the version judge, business keys and `previous` cover a
  release across an unsure payment. The open risk is Q17's no-exit hold (R:18): if the old identity's ending never comes, it is reported
  at every boot forever with no user action available. Name a `forget` path for it before release.
- **Long-lived live screens** (mission control, the auction): B1's bound strands a doubt until a reload. Streams' `dropAt`, the bounded
  bookmark (256 per operation) and multiplexing hold up. The callback bound counts the queue only (C206), which is right.
- **Offline-first documents** (notes, agent console): Q18 and Q19 reset local memory on any structural Schema change, a validation tweak
  included. Writes in flight are kept, so the server is safe, but unsent drafts held in memory are lost. That is a product decision for the
  user (B4), not a correctness bug.
- **CRUD apps with several actions on one resource**: B2 is the real hazard.
- **Apps on table-versioned sources** (Zero, TanStack DB): the per-record copy is a stated limit (R:27). Fine for now.

## Sidecar log

Four Haiku agents (effort high, read-only, no gates). I read the cited lines for every finding I used, and re-checked each one.

**Sidecar 1: design to prototype.** 53 C rows mapped, 13 gaps reported.
- Accepted:
  - gap 1, C207 against entities.ts:231-233. I read both, plus the SURV case it missed (review.scenario.ts:642-652). This became B1.
  - gaps 2, 3 and 11, the reserved reasons, `byReason` and `GoneWithoutKey`. I read operations.ts:219-252, D:668-676, D:1012-1018, and
    confirmed by grep that the name is absent from RT and C. These became B3.
  - gap 5, the stale 2.5 text. I read D:1526-1529 against D:710. This became m1.
  - gaps 6, 7, 8, 9, 10 and 12, as coverage carries in m8. I read phase1s:252-266 and 517-557 for gaps 9 and 10.
- Changed:
  - gap 4, the rule 15 scope, kept as minor m4 only: R8's stated limit (D:720) covers the own-lane part.
  - gap 10, jitter: replay determinism would catch `Math.random`, so it is a coverage note, not a hole.
- Rejected:
  - gap 13's "guarded not built" (S:946, 952): those are dated round notes, not current claims.

**Sidecar 2: prototype to design.**
- Accepted:
  - the two-lanes-per-contract finding. I read S:1700-1701, D:8760 and D:9876-9900, and confirmed by grep that R and D have no entry. This
    became B2.
  - the `dropAt` registration rule. I read S:1650-1665 and D:9804-9811. This became m2.
  - the `GuardContradicted` dangling pointer. I read D:9770-9776 and grepped R. This became m3.
  - the `Released` question still open in S. I read S:1339-1341 against P:440 and D:955. This became m6.
- Changed:
  - the C207 conflict, merged into B1.
  - the not-built list (`ConflictingActorRef` context, the exhaustive tag check, `cancel` on a predicting write, context providers), folded
    into m7.
- Rejected:
  - M4 call 2 "open": D:1107 matches the build, and R14R 5 ruled that the design stands (P:178).
  - the re-created evicted entry's `filled` rule (S:1481): the design states it and S carries it. A known carry, not a conflict.
  - the `HoldWithoutRecord` lane-record case: a refinement, covered by quarantine per lane.
  - the missing names `IgnoreForbidden`, `IgnoredUnknown`, `Rule15LateLeaves`, `Rule20NotSent`, `ParkedForgotten` and
    `RecordQuarantined`: these are check rule ids and evidence kinds internal to the prototype, not public names the design must carry.
    Minor at most.
  - C1 errno: harness only.

**Sidecar 3: audit closure.**
- Accepted:
  - M1 finding 1 has no closure. Verified; part of B2.
  - M2 item 16 and M1 finding 6 have no carry. Harness only; folded into m8.
  - the S1b carry is not closed by S:287. I read the case, which checks bookmarks only; kept as a carry in m8.
- Changed:
  - M2 item 11 (`rename-any-op-kind`, red only by oracle (j)): a kill by a standing oracle is a real kill. I read S:1786-1797 and judged it
    not waved through.
  - Q18 "contradicts the user's words": moved to B4 as the first entry for the user's read, not an audit closure issue.
- Rejected:
  - the four 3b wrong runtimes "not cited" (`released-entry-stays`, `holds-any-record-settled`, `asked-again-settles`, `mint-ghost-queue`)
    and the uncited S1 and M1 wrong runtimes: they were killed during the audits. P:439 counts 6 survivors for 3b; the 2 reached ones are
    closed (S:1299-1302) and the 4 others are carried by name (S:1314-1322).
  - the deleted `forget-gone-op-hold-silent`: the re-auditor ordered it deleted as vacuous (AUDIT-GAPS-2.md:54).
  - the rebuilt harness items with no lie, and the `disabled` excuse on the runtime's `ModuleDefect`: the first is throwaway harness, the
    second is a stated limit in D:9775, and both are carried to the phase 3 rewrite by policy (P:402).

**Sidecar 4: calls for the user's read and public API.**
- Accepted:
  - Q17-Q20 and the per-record reset are not in the list section, only in P:461 and P:463. I read P:144-211 and P:440-463. This became B4.
  - the list section was not updated after P:211.
  - the timer decision was listed "for the user" in S:924-929 and ruled by the runner.
  - the persist question was closed by the runner.
  - every row of table A is an item for B4.
- Changed:
  - Q19's "conflict": the design and revisit.md record the prototype's stamping as a stated limit, so the problem is the log's wording
    (m6), not a design conflict.
  - Q18 "contradicts the user's words": the "words" in P:458 are the runner's paraphrase of the user's "A without optional manual
    version". Still the first B4 entry, since it narrows a user decision.
- Rejected: none.
