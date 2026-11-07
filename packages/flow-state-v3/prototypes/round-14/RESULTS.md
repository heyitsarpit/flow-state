# Round 14 results

Prototype, for evidence; never production code. A copy of round-14x (itself round 13 plus an earlier lifetime experiment), built to the
merged `machine-design.md` (OD28, OD29, OD30, OD31), then to the independent review's findings and the user's corrections D1-D7.
Expected results come from the design text, by hand; each new case was seen red on a deliberately wrong runtime (`mutants-lifetime.ts`,
run by `conformance/lifetime-falsify.ts`). Marks: [ran] for what was run on the final tree.

## Gates on the final tree [ran]

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

The fragstore failure changed: `dispose` is now `disposeActor` (the record goes, D6 keeps endings on the lane), and an ending restored at
the next boot for an identity with no record is not paid by the ledger. Not resolved: it may be a ledger gap or a runtime gap in D6's
"with no record at all, evidence only" at a boot.

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
6. T3 (Runtime disposal) parks `unknown { Interrupted }` for an interruptible commit (Runtime O6 interrupts the wire); REV5-M1's two
   variants now expect that, where proposal-v5 said "unchanged".
7. `k.ghost-life` is retired: with `disposeActor` removing the record and no implicit end meeting an InFlight lane, no ending reaches an
   actor that is only a record.
8. Output and Story records leave out the invariants' bookkeeping evidence (`incarnation`, `fired`).

## Not built

LIFE-19 and 20 (Hydrate, dehydrate), 25 (records cliff), 26 (context providers); the ending phase and `NotAdopted`; `ScheduleLeadsToWrite`;
J (no typed entity API); the rest is listed in STATUS.md's checkpoint 5.
