# Review: T13 part 2 (StaticCli) and convergence step 2 (Port), 2026-11-11

**Verdict: accept both ranges with fixes.** One High: the graph gate passes on a renamed edge that no case takes
(planted and run: suite 84/84). Step 2 matches v2. Its only deviation is `MemberTarget.Nothing`, which the lead logged.
It keeps suite and null byte-identical, and its one sweep change is logged.
T13 part 2's CLI cases cite the Spec and each of its eleven mutants is caught for its own reason. But the coverage
record counts five StaticCli Invariants as whole when only part of each is checked. This is the third review in a row
to find that class, so it now meets the convergence threshold.

Ranges: `facb1c33..c1427047` (T13 part 2) and `829b8e4c..cc0763b3` (convergence step 2). Nothing after `cc0763b3`
was reviewed, except to check whether step 2 was logged.

## Gates I ran (git archive copies in my scratchpad, `node_modules` and `codebases/effect-v4` linked)

| Commit     | suite | null | falsify | coverage          | other                        |
| ---------- | ----- | ---- | ------- | ----------------- | ---------------------------- |
| `c1427047` | 84/84 | 0/84 | 68/68   | 33 of 186, 0 gaps | suite 3.2 s, 158 MB peak RSS |
| `829b8e4c` | 84/84 | 0/84 | 68/68   | not run           | sweep baseline               |
| `cc0763b3` | 84/84 | 0/84 | 68/68   | 33 of 186, 0 gaps | `nub run check` passes       |

- `suite --json` and `suite --runtime null --json`: byte-identical between `829b8e4c` and `cc0763b3`.
- Sweep (`falsify --sweep --parallel 6`), keyed by mutant: only `lane.held-auto-resend` differs. `PAY-18` is now red,
  and `PAY-09/ack-stored-confirmation-lost` is now red by its own oracle. The builder's STATUS entry (added at
  `b772e7d7`, after this range) gives this exact difference and its cause, the key at mint (Conformance R11).
- Falsify's first line failed in a bare archive copy because `workflow show` cannot resolve `codebases/effect-v4`.
  That is an environment artefact: with the folder linked, coverage passes as the builder reports.

## Findings, by severity

### H1. The graph gate passes on renamed edges that no case takes

- **Where:** `packages/flow-state-v3/conformance/static-cli/graph-names.ts:11-24` at `c1427047`.
- **Rule:** StaticCli I2 ("Every edge name in graph equals the name the Runtime's turn record uses") and T4 ("for each
  edge ... run a Story or scenario that takes it"); Conformance R12, since coverage reports I2 as checked.
- **Evidence:**
  - The oracle checks one direction only: each turn part's name must be in the graph. An edge that no turn takes is
    never compared.
  - On `pay`, the runtime cases take 30 distinct alternatives. `flow graph typed-pay` prints 51 edges, so 21 are
    never compared. Among them: `states.STUCK.on.CheckAgain[0]`, `states.PAID.on.Done[0]`, `on.Busy[0]` and
    `states.WAITING.on.RetryNow[1]`.
  - I planted a graph that names `states.STUCK.on.CheckAgain[0]` as `states.STUCK.on.Again[0]`
    (`prototypes/conformance/graph.ts:108`). The suite stayed at 84/84 with no failures.
  - Both registered mutants rename every edge (`graph-names.mutants.ts:20-37`), so neither can detect this.
  - STATUS "T13 part 2" says only that the gate judges `pay`. Nothing owes the edges no case takes: not not-yet.ts, and
    not T22's comment.
- **Root cause:** class A, below.
- **Fix, proposed:** add a static check that the edge names of `flow graph` equal the Compiled's alternative places,
  in both directions. Then the turn-side gate only needs to hold for the alternatives cases take. Or owe "every edge
  taken" (T4) as a row under T22, and state the 30 of 51 in STATUS. Add a mutant that renames one untaken edge.

### M1. StaticCli Invariants counted as checked when only part of each is checked (class A, third occurrence)

- **Where:** `static-cli/cli.cases.ts:318-327` (`cliCovered`) and `not-yet.ts:63-67` at `c1427047`; the T22 comment in
  `workflow/tasks/V3/P4.task`.
- **Rule:** Conformance R12 and I37/I38 (coverage states what is checked). This is the class of the T41/T13 review's
  M1 and M3.
- **Evidence:** coverage reports each of these as "checked". Their remaining parts are owed only in the prose of T22's
  comment, which the gate cannot see:
  - **I1:** reads the CLI's own `callbacksRun`. A CLI that runs unpoisoned closures and reports 0 passes. T1 asks for
    spies.
  - **I4:** compares text and JSON for `check` only, and not against R7's envelope (version, status, data).
  - **I6:** no case for 130 or 143 (R8, T6).
  - **I8:** covers 4 of R10's 11 rules. `REFERENCE_APPS` (`cli.cases.ts:64-77`) is defined as the fixtures that have no
    error, so the "no reference app" half is chosen from the CLI's own output. `desk` and `desk-listen` are excluded
    because they report errors.
  - **I12:** no `--app` case (R3).
- **Root cause, class A:** coverage is binary per Invariant, and the gate rejects a row that lists a checked Invariant
  as Stale. So a partial check can only be recorded as whole. Three reviews in a row found this, which meets the
  policy-convergence threshold.
- **Fix, proposed:** one change to the coverage model, not per-case patches. Add a `partial` standing whose row names
  the unchecked half and its owning Task. The gate then reports it, and T15's audit reads it.

### M2. R10's late-handler rule can be checked on round-14 but is listed as lacking

- **Where:** T22's comment (P4.task); STATUS "T13 part 2" bottom line ("every static Invariant round-14 can make is
  checked").
- **Rule:** the orchestrator's 2026-11-10 decision that T13 closes on everything round-14 can make; the T41/T13
  review's M2, the same class.
- **Evidence:**
  - Round-14's `check broken --json` reports `error Rule20Late states.W` twice, which is R10's "late handler with no
    alternative that stays put".
  - `prototypes/round-14/cli/check.ts:168` (`Rule20Late`) and `:174` (`Rule15LateLeaves`) emit it.
  - `prototypes/round-14/cli/main.ts:34` pins it.
  - Yet T22's comment lists "late handler" among the rules round-14 lacks, and CLI-06 has no row for it.
- **Root cause, class B:** whether round-14 can make a result was judged without running round-14 or grepping its pins.
- **Fix:** add a CLI-06 row (the `broken` fixture, or a fixture that breaks only this rule) and a mutant that drops
  `Rule20Late`. Then rerun the "round-14 can make" sweep over every owed static row using round-14's pins.

### M3. Step 2 silently disabled two old-suite mutants

- **Where:** `prototypes/round-14/lane.ts:277` at `cc0763b3`, the decline's `noteEnding`, which now carries `actor`.
- **Rule:** P3's exit criterion "it kills every mutant the old suite kills"; README carry list item 3 (the old suite's
  `mutants-*.ts` become suite mutants).
- **Evidence:**
  - `pay16.decline-not-delivered` (`mutants-lifetime-pay16.ts:5`) and `lost.decline.mail` (`mutants-lost.ts:59-60`)
    look for the old line text, so they no longer apply. I checked every round-14 `mutants-*.ts` before and after the
    change: exactly these two stopped applying (also `pay16.decline-not-delivered` re-exported by
    `mutants-lifetime.ts`).
  - `mutants.ts:371-372` (`stillApplies`) drops mutants that no longer apply without saying so.
  - v2 names only `d123.delivered-silent-at-boot` (change 5) as needing a new anchor, and this break is not logged.
  - The new suite has no port of either mutant.
- **Root cause, class C:** mutants that find their target by text, on a prototype that is now being edited.
- **Fix:** re-anchor both mutants, or log them as owed to the old-suite comparison.
- **Before any later round-14 edit:** run the applicability diff. The script is in this review's scratchpad
  (`tools/applies.ts`). Rewrite it into the repository if it is kept.

### Low

- **L1. `cliCovered` has drifted from the cases' `cites`.** `cli.cases.ts:322` lists I6 for CLI-04 only, but CLI-08
  cites I6 (`:291`, `:302`), so the table restates a fact and has already drifted (AGENTS "each fact lives in one
  place", class E). Fix: derive `cliCovered` from `cites`.
- **L2. Port change 6 is checked in the Case, not at the boundary.**
  - The check runs in the Case's `judge`: `dsl/case.ts:56-77`.
  - It skips the key when two fixtures declare the operation name, because `operationNamed` returns None
    (`fixtures/reference.ts:110-119`).
  - It reports a non-JSON key as "has no key" (`prototype-observations.ts:216`).
  - It ends as a `threw:` Fail, not a defect (Conformance I25; Q11 is already open).
  - `Minted.actor` stays an `Option` (`port.ts:228`) although the Port calls it required.
- **L3. The adapter writes the graph's naming convention into the turn record.** It rewrites round-14's `implicit` to
  `trigger:<node>:<event>` (`prototype-observations.ts`, `IMPLICIT`). So for schedule triggers the gate compares the
  adapter's copy of the convention with the graph's own (`prototypes/conformance/graph.ts`). The case is latent (no
  CLI fixture has one) and STATUS states it (class E).
- **L4. `MemberTarget.Nothing` is outside v2's change 1.** The lead logged it as their own call, which is allowed. No
  v2 table reads it, so v2 requirement 6 ("each distinction ... is read") must be settled at step 9: read it in a
  cell, or merge it.
- **L5. One closed variant is written three times.** `turn.ts:110`, the adapter's `Target` (a `Schema.Union`, not a
  `TaggedUnion`) and `port.ts` `MemberTarget`. `targetOf` (`prototype-observations.ts:47-53`) ends in a catch-all
  ternary (STYLE.md total handlers, class E).
- **L6. A Port field leaks a round-14 internal.** `EndingRef.attempt` can carry round-14's synthetic read id
  `read/<actor>/<inc>/<op>` (`turn.ts:459-469`, which reaches `:1237` and `:1309`): an incarnation id in an Attempt
  field (Conformance R1, class D). It is reached only by a refused or unmapped parked read's ending. `Ended.attempt`
  had the same leak before this range.
- **L7. Doc comments on non-exported constants, and one doc that disagrees with the code.**
  - Non-exported constants with doc comments: `cli.cases.ts:42-44`, `:64-67`, `:81-84`; `prototype-static.ts:270-273`;
    `prototype-observations.ts` `IMPLICIT`.
  - `surface.ts` says `cli` runs "the `flow` binary"; it runs `bun cli/flow.ts`.
  - `static-cli/graph.ts:5-12` decodes `from`, `event`, `target` and `status`, and nothing reads them.
- **L8. `namesOf` keeps the last graph when two share a machine id.** `graph-names.ts:8-9` keys graphs by machine id,
  and a space joins each name. This is carried by the builder and latent while only `pay` is graphed.
- **L9. Spec revisions: wording only, with two notes for the user's read.**
  - Q5, Q11, Q12 and Q14 are open-question bookkeeping. No Invariant changed.
  - Compile R17's first decision fixes an observable: the refusal code is `InvalidConfiguration`. It settles something
    the Spec left open, not a guarantee change, but the user should see it.
  - Q14's "round-14 can make results for 17" has been stale since `829b8e4c` reopened Compile I7, I8, I13 and I14, and
    M2 adds the late-handler rule.
- **L10. R10 has no warning form, but round-14 emits one.** Round-14 emits `UnresolvedHold` as a warning when a member
  exists but cannot be reached (`check.ts:242`), and `pay`, a reference app, reports 8 of them. The Spec has no warning
  form for an R10 rule. This is a Spec gap for T22, which already asks about desk's `UnresolvedHold` errors.

## Answers to the brief's checks

- **Does each CLI case test the Spec, not round-14?** Mostly.
  - The expectations cite R7 to R11 and I1 to I12.
  - These values are pins, each harmless:
    - the decoded JSON shape (not R7's envelope);
    - the text counts regex;
    - `"Checkout/Pay"` in CLI-08;
    - exit 2 for an unknown `--state`;
    - the `REFERENCE_APPS` list.
  - The pins that matter are in M1.
- **Is each mutant caught for its reason?** Yes, all 11: 9 CLI mutants and 2 graph mutants.
  - Each catch text names the expected Invariant and label.
  - `cli.text-miscounts`: text gives 4 errors, JSON gives 3 errors and 1 warning.
  - `cli.check-runs-callbacks` really calls the closures (`callbacksRun` 97). Because the count comes from the CLI's
    own poisoned copy, it proves I1 only as far as M1 says.
- **Can the graph gate pass on renamed edges?** Yes, for any edge no case takes (H1).
- **Is each Spec revision a wording change?** Yes (L9).
- **Does step 2 match v2 and keep the sweep byte-identical?** Yes, with logged deviations.
  - Changes 1, 3, 4, 6 and 7 match v2, plus the logged `Nothing` variant.
  - No part of change 2 or change 5 landed early.
  - The round-14 edits only add observations.
  - The sweep is byte-identical with the key withheld (the builder's check). With the key, it differs in one mutant,
    and the builder logged it. I reproduced that difference exactly.
- **The builder's log.**
  - The T13 part 2 entry is honest about its stated limits. It overclaims "every static Invariant round-14 can make is
    checked" (M2, H1).
  - The step 2 entry is accurate. It landed after the range, at `b772e7d7`, so for about an hour step 2 was recorded
    only in its commit message.

## Root-cause classes

- **A. Coverage is binary per Invariant:** H1, M1. Converge once: add a partial standing.
- **B. Whether round-14 can make a result is judged without running it:** M2, and the T41/T13 review's M2.
- **C. Text-anchored mutants on an edited prototype:** M3.
- **D. Prototype internals cross the Port:** L6.
- **E. A fact restated in a second place:** L1, L3, L5.

## Sidecar log (four Haiku sidecars, effort high, read-only)

Accepted:

- H1: from (c) Q3, confirmed by my plant and edge count.
- M1: from (a) 3 and (c) Q4.
- L1: from (a) 1 and (b) 7.
- L2: from (b) 3 and 6, and (d) C6.
- L3: from (a) 13.
- L5: from (a) 10 and (b) 4.
- L6: from (d) Q5.
- L7: from (a) 6 and 8, and (b) 8 and 11.
- L8: from (a) 5 and (b) 5.

Changed:

- (d) Q3: "the sweep may shift". It did shift, by one mutant, and that shift was logged. The real problem is the two
  dead old-suite mutants (M3), which I confirmed with an applicability diff.
- (a) 12: "the prototype is frozen". The adopted v2 requires round-14 to report these fields, and the edits only add
  observations (suite and null byte-identical). So the edits are accepted, and the finding is M3 only.
- (c) Q1, CLI-06: "late handler absent". `Rule20Late` exists and `broken` fires it, which became M2.

Rejected:

- (a) 2: "Option.none on both sides passes". CLI-02 asserts `isSome` first (`cli.cases.ts:154`), and a missing text
  match fails against `Some`.
- (c): "`cli.text-miscounts` may survive". It is caught.
- (c): "`cli.notsent-off` may survive via Rule20Read". It is caught. The predicate is broad, but the builder already
  carries that.
- (a) 11: "members, Incarnated and Finished are unread". This is v2's step order: the Port lands before its readers.
- (d): "the key-less retry conflicts with WriteLanes R9". `check` refuses such a program (KeyRequired), so `Nothing` is
  only the runtime's fallback.
- (b) 1 and 2: "`spawnSync` with a timeout, and null stdout". The runner is bun itself, and a timeout gives a partial
  string and code -1, which fails the case. This was noted, not filed.

## Process note

My mutant-applicability probe first imported `j-named.ts`, whose main ran an old-suite search. I killed my own
processes, after checking their parent chain, and deleted their temp folder. Nothing in the builder's tree was
touched.
