# Round 14 results

Prototype, for evidence; never production code. A copy of round-14x (itself round 13 plus an earlier lifetime experiment), built to the
merged `machine-design.md` (OD28, OD29, OD30, OD31), then to the independent review's findings and the user's corrections D1-D7.
Expected results come from the design text, by hand; each new case was seen red on a deliberately wrong runtime (`mutants-lifetime.ts`,
run by `conformance/lifetime-falsify.ts`). Marks: [ran] for what was run on the final tree.

## Gates on the final tree [ran]

*Stage A close-out (2026-11-09, m6):* this table and the search table below are round 14's own record and are stale. The gates now run as
one `conformance/gates.ts` run (26 jobs and the lifetime coverage row); the current results are in STATUS.md's "Stage A close-out fixes". `listen.load` and `fragstore.row`
pass: `fragstore.row` completes at depth 7 (48,833 states) and the falsify search gate runs it there; `listen.version` completes at depth 7
(110,726 states, the audit's run) and the gate runs it at depth 4.

From `packages/flow-state-v3/prototypes/conformance/`, `R=../round-14/adapter.ts`:

| Gate | Command | Result |
| --- | --- | --- |
| Suite, no search | `bun main.ts --round 14 --runtime $R --no-search` (then `--lock`) | 822/822; output alone 0; unlogged none; removed none; stale lock 0; catalog none |
| Suite with its searches | `bun watch.ts --seconds 580 -- bun main.ts --round 14 --runtime $R` | exit 0, peak 1.63 GB |
| Lifetime falsify | `bun lifetime-falsify.ts --runtime $R` | control green; 46 wrong runtimes all red; every LIFE, R14-ID, R14-IGN, R14-F case red on one |
| mutate-one control | `bun mutate-one.ts --runtime $R` | `{"killedBy":null}` (suite, swap, compares, date check, CLI pins, every `checks/*.ts`, the 5 s gate) |
| falsify | `bun falsify.ts --runtime $R --part suite1/suite2/suite3/mutants` | each "every gate fails on what it should" |
| Lies, targeted | `bun falsify.ts --runtime $R --part lies --parallel 4` | 74 of 74 red; `k.ghost-life` retired as unreachable (below) |
| Graph gate | `bun graph-gate.ts --runtime $R` | GRAPH PASS, 822 cases, 0 disagreements |
| Checks | `bun ../round-14/checks/*.ts` | front 74 pins, story 53, types 25 directives, mailq, score, search vacuity: all pass |
| CLI pins | `bun ../round-14/cli/main.ts` | all pass (two new: IgnoredUnknown, no UnresolvedHold) |
| Type tests | `tsc -p round-14/typed/tsconfig.json` | clean |

Searches `listen.load` and `fragstore.row` (`bun search/run.ts --which … --runtime ../../<round>/adapter.ts --seconds 300`), known to fail:

| Search | round 13 | round-14x (before) | round 14 (after) |
| --- | --- | --- | --- |
| listen.load | failed, 1026 states, "silently wrong" (the entity store) | threw at 0 states | failed, 1026 states, the same "silently wrong" |
| fragstore.row | failed, 22531 states, rule 17 "delivered once, still parked" | vacuous (every action dead) | failed, 5698 states: "(j) an ending reached nobody: put … on Go ack GiveUp Resend dispose reload" |

Corrected by the fix pass (below): the explanation above was wrong. In `Go ack GiveUp Resend dispose reload`, a pending capture means the
dispose's record removal never reached disk (D80); the stale live record is restored at the boot, its lane is Held, so it stays a record
at ready, and the head's `unknown { Restored }` went into that record's boot mail with no evidence, so the ledger's debt was never paid.

## Fix pass after the independent final review [ran]

| Item | Fix | Case | Wrong runtime (red) |
| --- | --- | --- | --- |
| H-A | Runtime disposal interrupts nothing; a commit settles within `disposeMs` and is parked; a settled head is not left Held | REV5-M1, LIFE-28 (back to Runtime O6), PAY-16 (new bound variant), SURV-08 | `o6.dispose-interrupts-wire`, `o6.settled-in-bound-stays-held`, `o6.no-bound` |
| fragstore.row | boot mail of a record kept at ready is said (`parked`, `record: true`), listed as a wait, unparked at the return; a dispose parks it on the lane (D6); the ledger moves it to `parkedOwed` only at a boot that kept that record | R14-FIX-01 (three variants) | `boot.mail-unsaid`, `boot.mail-lost-at-dispose` |
| M1 | D1 on every return path, the woken-at-ready one included; `stopped` decoded by a Schema | LIFE-13 (after a reload; woken at ready) | `d1.woken-drops-stopped`, `d1.reload-drops-stopped` |
| M2 | D3 guarded | R14-FIX-03 (three ends, three ids) | `d3.return-keeps-old-id` |
| M4 | a Held head's waiting commits are not owed; the actor stays a record | R14-FIX-02 | `m4.held-w-owed`; no earlier verdict changed |
| M3 | `disposeActor` clears `refPersist` | R14-ID-03 (other order; after dispose) | `m3.persist-survives-dispose` |
| M5 | the 12 outputs: round 14's return from a record at ready touched the record, a needless capture (one more timer, merged states, one `UnencodableValue` lost). Fixed; each output logged on its own; the other 64 differ from ed3e1a29 only by `recordAtReady`, `returned` and one frame per return (checked) | R14-FIX-01/a-return-from-ready-writes-nothing | `m5.return-from-ready-writes` |
| M6 | `k.ghost-life` restored: an ending does reach a record-only identity (the boot's restore of an ended record's lanes) | R14-FIX-01, R14-FIX-02 | the lie, red by "not woken" |
| L1 | identity version = each field's encoded Schema by structure, annotations left out | R14-ID-02 (String to NumberFromString is no new version; a check on the encoded side is one) | `l1.version-by-type-side`, `l1.version-by-printed-name` |
| L2 | `warned` and `soon` (time left) are in the state hash | outputs' state counts | none (hash only) |

The fragstore.row search, re-run after the fix: the boot-mail failure is gone, and so are two ledger findings it hid (the store's forced
repair counted as the actor's work in flight: it is the record queue's, 2.8; the dispose of a record at ready). It now fails at depth 7,
95084 states, by rule 17's "delivered once, and still parked on disk ... restored again at this boot" on `Go ack GiveUp Resend Away refuse
t30s reload`: round 13's class, not diagnosed in this pass.

## What was built, by area

See STATUS.md for each checkpoint. Commits on `worktree-agent-acee8f40b71d961fd`: c2164405 (lifetime), 6a6f8865 (identity),
8a945e7a (Flow.ignore, P1), 48d1dc46 (F, E step 2, target, G), dcff157b (review fixes), and the D1-D7 commit after it.

## Decisions I made where the design was under-specified

1. A Story `ensure` attaches one use each call; a reload re-attaches the Story's uses as subscriptions (restore a record, create nothing), so a
   record quarantined at boot stays absent until a case ensures it.
2. W's `NotSent { Restored }` behind a Held head counts as owed at ready (it wakes the actor); the design names only InFlight-at-capture lanes.
3. A record kept at ready keeps its root id when it returns (the boot's incarnation); a return after an end mints a new id (D3).
4. The end is atomic in this runtime (no `stopped` input), so the send table's "ending" rows and `NotAdopted` cannot occur.
5. `RecordUndecodable` at an ensure is evidence, not an issue, so the twelve REV4-H3 quarantine cases need no new named issue.
6. Withdrawn by the fix pass (H-A): Runtime O6 lets an invoked commit settle within the bound; nothing interrupts the wire.
7. Withdrawn by the fix pass (M6): `k.ghost-life` is back, and R14-FIX-01 and 02 catch it.
8. Output and Story records leave out the invariants' bookkeeping evidence (`incarnation`, `fired`).

## Not built

LIFE-19 and 20 (Hydrate, dehydrate), 25 (records cliff), 26 (context providers); the ending phase and `NotAdopted`; `ScheduleLeadsToWrite`;
J (no typed entity API); the rest is listed in STATUS.md's checkpoint 5.
