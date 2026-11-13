# Review: T45 fix round, 4d7e0f5d to 823f118f (2026-11-12)

Verdict: **not done; K1 is still blocking, and K3 is only partly fixed though logged as fixed.** K4, S1, S2 and S4
are fixed; S6 and S7 are partial; K2 is in progress (not judged as done). No catch was lost against the 56ef0856
sweep, and `lie.no-incarnated`'s new catch is earned. The step-5 checkpoint (d50d54ea) computes expectations from
the oracles alone, but its kill count can count mutants that never ran, and its regressions do not keep the
Invariant they failed. Nothing here is a guarantee change or a Flow public API change.

**Reviewed:** `git diff 4d7e0f5d 823f118f` (22 commits, including 25bf2244 and d50d54ea; the working tree was not
read), against code:wiki/plans/flow/references/proposals/t45-step3-review-2026-11-12.md,
code:wiki/plans/flow/references/proposals/t45-expect-half-2026-11-11.md, @task.V3.T45's comments, @spec.Actors
R7 to R9, R20, R21, I10, I14, I37, @spec.WriteLanes R8, R9. Paths are under `packages/flow-state-v3/conformance/`
at 823f118f. Nothing was run but read-only `git` and a sweep diff.

## Blocking

### K1 (still open). A reported end the suite owes is matched, but an unowed one is still applied

Owing is now real: an `Ensured` owes an incarnation (`dsl/expect.ts:174-181`), a surely free actor owes its end
after 100 ms of `Advanced` (:191-235), and an owed one never heard is I14 or I37 (:321-337). But `endHeard`
(`dsl/compare.ts:166-180`) still applies any unowed `Finished` of a live actor the suite holds no use of, so the
record goes to `grace`, the next `Ensured` adopts (`dsl/expect.ts:139-160`), and the adoption owes every Held
head's restore (`dsl/lifecycle.ts:520-545`). A runtime that reports `Incarnated`, then, after `Released`, a
`Finished` with no `Advanced` between, breaks Actors I10 for certain (the suite drives the only clock), is not
refused, and creates restore obligations: K1's second half, unchanged. A Held head makes `surelyFree` false
(`dsl/expect.ts:204`), so this is exactly the case K1 named.

**Fix:** carry each live actor's upper bound on free time (clock since its incarnation or its last use's release,
which the suite knows), and refuse a `Finished` below the grace as I10. Only an end the suite cannot bound stays a
stated limit. T45's comment "K1 fixed" should say partial.

## Should fix

- **K3 is partial, logged as fixed.** Done: a lost leaf is checked against the leaves the lost turns reached
  (`turn/anchor.ts:332-361`, `turn/judge.ts:110-122`), a `Fresh` actor starts at the fixture's initial leaf, keys
  come from folds wherever fields are carried (`turn/selection.ts:190-191`), and an unconsumed driven credit is
  refused at the step's end (`turn/credits.ts:21-46`). Not done: `event: turn.event` (`turn/selection.ts:169`),
  so the report still picks which driven event ran and `chosenRow` follows it; an `Unanchored` actor with nothing
  lost (`reachable` empty, `turn/judge.ts:117`) and an undeclared machine (:107-108) take the report's `from`; the
  key fallback has no limits row the liar gate counts. Also, `trail` records `turn.to` when the judge has no leaf
  (`turn/selection.ts:154`), so a report can widen a later kill's allowed set.
- **S6 is partial.** `owedResends` excludes heads now `Gone` (`write-lanes/lane-queue.ts:94-97`), but
  `DisposalStarts` and a refused capture move `Resending` to `Held` (`dsl/lifecycle-rules.ts:118, 155`), not
  `Gone`. WriteLanes R8 exempts both, so a correct runtime disposing in a step that lands is still WriteLanes I26.
  Exclude heads whose phase left `Resending` by those moves. Unverified by a run.
- **Unowed incarnations are still applied.** `incarnationHeard` (`dsl/compare.ts:146-155`) opens a woken
  incarnation, an `Adopt` with restores when the record is in grace, for a step that reloaded, disposes or drove
  the actor. The doc calls it a stated limit; no limits row exists. Note that Actors R9 makes a send to a
  persisted identity owe the return, so the `Drove` case can become owed rather than allowed.
- **d50d54ea's kill count counts non-catches.** `kills` marks a mutant killed when any row is not `green`
  (`runner/modes.ts:190`), which includes `not applied` and `no verdict` (`runner/falsify.ts:295, 300`) and `time`
  (`runner/matrix.ts:16`). The hand baseline cannot have `not applied` rows (their case id is `-`, outside the
  area), so the comparison is skewed toward the generators. Count only `caught` and `red` rows; compare the same
  mutants, not two totals (:209). The logged "11 of 37" was measured under this rule.
- **A shrunk regression does not keep its Invariant.** The shrinker keeps a step out only while the signature
  (oracles plus Invariant ids) is equal (`runner/modes.ts:219-252`), which holds the Invariant during shrinking for
  oracle findings. But a thrown defect or `Unreadable` has no oracle (`runner/run.ts:29-41`), so every such failure
  has the signature `" "` and any other defect passes as the same. The JSON saves no signature
  (`regressions/GEN-*.json`, `generated.ts:101-104`), and replay is pass or fail only. Save `by` in the file and
  check it on replay.
- **A model change on an open Spec question.** d50d54ea stops the boot owing a Held head's restore for a
  `disposeActor` record (`dsl/lifecycle.ts:388-390`) while a `forget` record still owes one at boot with cause
  `forget`. Actors R20 and R21 give both the same rule (unbound until an adopting ensure or the owner's cancel),
  and the T45 comment says this R20/R22 question awaits the orchestrator. The change agrees with production and
  makes round-14 the odd one. It is not shown to come from a runtime, but it was made in the commit whose finding it
  settles. **The orchestrator's or the user's call:** rule on R20 and R21's boot restore, then make both records
  follow it.

## Minor

- S2: the writer is real (`fixtures/pay.ts:257`, guard :273-274, labels from the suite's own answer, :181-186), but
  no per-field fold mutation was recorded, as the step-3 review asked.
- S7: no doc cites `limits.ts` now; the `Disposal` exit is still read for presence only (deferred, logged).
- S3 and S5 were not claimed and are unchanged: `least` is still taken at the second reported `Turn`
  (`dsl/lifecycle-step.ts:28-30`), and `predictedFrom` still predicts from the report in the unit tests.
- `answeredChannel` (`turn/selection.ts:345-365`) keeps the reported channel for `Fail`, `FailButLanded`, `Never`
  and `Die`; part of K2's remainder.
- d50d54ea: P4's comment says 1077 scripts; the code gives 676 + 300 + 100 + 5 = 1081 (`generated.ts:113-116`).
  `shrink` prints the count of distinct signatures as "scripts failed" (`runner/modes.ts:301`) and ignores
  timeouts. `dsl/generate.ts:84-106` (`shrunk`) is unused. A script's `answer` step does nothing unless the runtime
  opened a request (`dsl/script.ts:87-88`); owed sends still catch a runtime that never sends.
- The five regressions run only with `--generated` or `--only` (`runner/main.ts:89-92`), so they do not gate.
  Fine while they await the orchestrator; say so in the gate file.

## Checks against the brief

- **Claimed fixes.** K4 fixed: `OldVersion` needs an older release's mint, `Unencodable` the fixture's label
  (`dsl/lifecycle-lanes.ts:351-362`); `NoPersistence` and `ModuleDisabled` are refused because no case boots
  without persistence and modules are phase 5, which is design section 4's row. S1 fixed: KeyRequired is thrown as
  a fixture defect (`dsl/lifecycle-owed.ts:65-110`). S4 fixed in compare: the answer fixes the ending in `Unsent`,
  `OnWire` and `Resending` (`dsl/compare.ts:186, 268-275`). Boundary minor and the `predictedOf` minor fixed
  (`dsl/compare.ts:42-44` now throws `Unpredicted`).
- **New report-chosen obligations.** The unowed `Finished` and `Incarnated` paths above, and `trail`'s `turn.to`.
- **Tautologies.** None found; `kills` reads its baseline from the sweep file, not from generated runs.
- **Cases edited to pass.** None. The K4 traces were rewritten from the facts with refusing twins; two
  `lifecycle-step.test.ts` examples gained a `Released` that I10 now needs; the `Maybe` cells in
  `dsl/lifecycle-lives.traces.ts` follow 25bf2244's rule that a life saved mid-delivery is `Maybe`, which is the
  design's "what every prefix agrees on" (B4).
- **Expected results from a runtime or round-14.** None, apart from the open `disposeActor` question above.
  Generated scripts carry no case expectations (`dsl/script.ts:99-115`); the oracles judge them.
- **`lie.no-incarnated`.** Earned. `catch-matrix.prototype.tsv` moved from `delivered-once WriteLanes I15` to
  `disposal Actors I14`; the incarnation is owed by the suite's `Ensured` while running and not live, and its
  absence is refused at the step's end. I10, I14 and I37 were added to `disposal`'s guarantee
  (`actors/disposal.ts:19-29`).
- **Lost catches.** Sweep 4d7e0f5d (equal to 56ef0856) against 823f118f: 0 caught to not caught, 0 not green to
  green, 94 gained, same 17,493 rows.
- **Style.** The core stays plain TypeScript; thrown errors are fixture or suite defects.

## Sidecars

Two Haiku sidecars (effort high): (1) each claimed fix against its finding; (2) d50d54ea's generators, shrinker and
regressions. Each finding was re-read at 823f118f.

| Sidecar finding                                       | Outcome                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| 1 K1 partial, unowed Finished and Incarnated applied  | accepted; Finished raised to blocking, Incarnated should fix   |
| 1 K3 from, event, keys, credits                       | accepted; `trail` widening added                               |
| 1 K4 NoPersistence, ModuleDisabled a latent false red | rejected: design section 4 refuses them until a fact           |
| 1 S1, S2, S7                                          | accepted                                                       |
| 1 S4 partial (Minted from report, anchor's Fail)      | changed: compare fixed; the anchor part is K2 (minor)          |
| 1 S6 partial, disposal moves to Held                  | accepted; refused capture added                                |
| 1 Released inserted into two unit examples            | accepted as an input change I10 requires, not an edit to pass  |
| 1 Maybe cells unsourced                               | rejected: follows B4's prefix agreement (design lines 134-139) |
| 1 lie.no-incarnated earned                            | accepted; sweep counts re-run myself (94 gained, 0 lost)       |
| 2.1 defects share one signature                       | accepted                                                       |
| 2.2 regression JSON has no Invariant                  | accepted                                                       |
| 2.3 regressions not gated                             | changed: minor; they are open findings                         |
| 2.4 `shrunk` unused                                   | accepted (minor)                                               |
| 2.5 1077 claim                                        | changed: 1081 with regressions                                 |
| 2.6 kill inflation                                    | accepted                                                       |
| 2.7 round-14 reds left out of the kill set            | rejected: a mutant needs a green control; standard             |
| 2.8 disposeActor boot-restore change                  | accepted, raised to the orchestrator's or user's call          |
| 2.9 report-driven moves in the step walk              | changed: K1, S3 and K2 cover them                              |
| 2.10 `answer` is a no-op without a request            | changed: minor; owed sends still catch a silent runtime        |
| 2.11 timeouts and the "failed" count                  | accepted (minor)                                               |
| 2.12, 2.13 draws reproduce, no tautology              | accepted                                                       |
