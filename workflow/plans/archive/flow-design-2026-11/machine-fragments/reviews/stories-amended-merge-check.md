# Check: amended Stories and Fake merge into machine-design.md

Reviewed 2026-11-01. Scope: `5a5ea0f8` against `5a5ea0f8^` (`700c2b4d`), using
[merged/story-checks/merge-plan.md](../../../../flow/references/explorations/machine-fragments/merged/story-checks/merge-plan.md) (AE1–AE26, AE-C rows, MX1–MX10),
[stories-amended.md](../../../../flow/references/explorations/machine-fragments/merged/story-checks/stories-amended.md) (SA), [fakes-v2.md](../../../../flow/references/explorations/machine-fragments/merged/story-checks/fakes-v2.md) and
[decisions.md](../../../../flow/references/explorations/machine-fragments/merged/story-checks/decisions.md). Method as in [fragments-merge-check.md](fragments-merge-check.md). Line numbers
are of `machine-design.md` at HEAD (`3cee5255`), whose text equals `5a5ea0f8`. Only this file was written.

This file has its own name because `reviews/stories-merge-check.md` is the committed check of merge 3 (`0ca7d93b`).

**Applied 2026-11-01.** All four Medium and six Low fixes below are applied to `machine-design.md` and `merged/story-checks/merge-plan.md` (Low 6, by the backticks), and those carried from it to `merged/story-checks/stories-amended.md` (Medium 2, 3, 4 and Low 5's C82). Medium 3 marks the cuts owner-confirmed by W42 and W43. Line numbers below are from before the fixes.

## Verdict

**Merged correctly. No High finding.** No decision or rule was changed. There are 4 Medium defects and 6 Low ones.
Medium 1 and Low 1–3 are the merge's own slips, from removing code marks. Medium 2 is a plan item not applied. Medium 3 and 4
were carried word for word from SA.

Mechanical results:

- **Rules 11, 61–66:** word-for-word equal to SA section 2 under MX1's labels.
- **2.10 against SA section 3:** a word diff with MX1's labels normalised leaves only the planned edits (the new intro, MX3's pointers, MX4's
  sentence, the "merged table" and "Before" wording), plus the removed code marks, and the items below. All tables match cell by cell, including 2.10.17's.
- **C rows:** C69–C73, C75, C77, C81–C84 equal SA section 4. C16, C63, C74 and C79 carry AE15, AE16, AE-C74 and AE-C79. "C-new" is folded into C79 (MX2).
- **3.6:** both rows equal SA section 7.
- **Examples:** 2.7.11, 3.1 and 3.2 carry SA section 8's code, except Low 4.
- **Decisions:** all 48 rows (SC1–SC5, W1–W43) equal decisions.md, with only C*n* → SC*n* and link paths changed. Each is marked owner-confirmed.
- **Unplanned changes:** none. Each of the 37 hunks outside 2.10 traces to an AE edit. C76, C78, C80, C83 and C85 are untouched.
- **Stale words:** every remaining `Story.make`, `.expect`, `Story.records`, `Story.inspection`, `Story.entity`, `Story.attempt`, `Story.now`,
  `Story.property`, `process()`, `StoryExpectationFailed`, `AmbiguousAttempt`, `latency`, `run({ signal`, `storyTest`, `@flow-state/vitest`, `Fake/Lost`,
  `run.calls`, `checkpoint.exit`, `story.machine` and `Domain.propertySteps` is in a before block, a removed list, a dropped-word table, a rename note, item 22's
  statement of what is unconverted, or history (change log, F7, T3, T5, T6, the W rows, "Also rejected", older C rows). `cut.read` at 4762 is
  a user-named parameter. `expect(fake` has no hits.
- **References:** every `2.10.x` cited exists. Every cited C row is at or below C85, and the one "rule 67" is the note about merge 6's numbering. The record's "section 10 item 13" and
  "section 11 item 9" exist. No unprefixed RV, MDL or C1–C5 label is left in 2.10. Bare T*n* in 2.10 are all in stream text, as its intro says; C77's T1 and C81's T2 are tooling rows, correctly.
- **MX4's sentence (4866):** 77 invariants, 92 of 95 mutants (72 + 20) and the 200,000 cap match the model's RESULTS.md.
- **Links:** every link in the design, the record, `merge-6-streams/proposal-v3.md`, `requirements-v3.md`, `trials/desk/RESULTS.md`, README, NEXT, revisit and open-items resolves, except Low 6.

## High

None.

## Medium

**1. Line 4766–4768: the only statement of `propertyTest`'s defaults was removed with the code marks.**
SA 1253–1255 carried "seed, required", "runs (default 50)" and "length (default 40, Testing O6's "steps")" after the `existing:` mark. MX5 removes marks, not facts,
and neither the design's prose nor C73 states these. Fix:

```ts
    seed: 11,  // required
    runs: 200,  // default 50
    length: 30,  // default 40; Testing O6's "steps"
```

**2. Line 4482: a mark outside the design's scheme, and plan 1.3 not applied.**
It reads `**[proposed in decisions.md, not yet decided]**`. Plan 1.3 says this item is carried as [P]. 2.10's intro defines no such mark, and the bare `decisions.md` names no file from the design. The Proposed block
(7382–7387) omits it. Fix: replace with `**[P]**`, and at line 7387 add before "the rows of C69–C84": `` `checkpoint(name, { at })` keeps its word; ``.

**3. Lines 3754, 3806, 4072, 6536, 7387: W42 and W43 are owner-confirmed, but the text marks those cuts as proposed or cites no decision.**
2.10's intro says [P] means proposed. Fix:

- 3754: `` `run`'s `signal` and `frames` (W22; P, SA RV2 section 8) `` → `` `run`'s `signal` (W43) and `frames` (W22; SA RV2 section 8) ``
- 3806: "It takes no `signal`: a run" → "It takes no `signal` (W43): a run"
- 4072: `[P, SA RV1 M1; main session's cut]` → `[W42; SA RV1 M1]`
- 6536: "**O8's cancellation goes with `signal`**:" → "**O8's cancellation goes with `signal`** (W43):"
- 7386–7387: delete "removing `latency`, `response` as an Effect and `signal` (W42, W43 confirm those two cuts; the rest of `run`'s surface is proposed);", since those cuts are not proposed. Add "the rest of `run`'s surface;".

**4. Line 6536 (C75): the error list disagrees with 2.10, and C83 inherits it ("The error names of C75").**
`NoConnection` sits outside the `StoryInvalidCommand` list, but 3888 and 4168 make it a reason of `StoryInvalidCommand`. `FramesTruncated` is missing, though the old C75 had it, 4349 throws it, and C73 and 4803 use it as a reason. It is not in `Testing.plan`, so the owed Testing and Diagnostics edits would miss it. Fix:
"`StoryInvalidCommand` (`ActorAbsent`, `AlreadyEntered`, `NotEntered`, `TabOpen`, `TabClosed`, `NothingHeld`, `NoDeadline`, `NoConnection`), `HostTimeWait`, `FramesTruncated`, `PropertyTestFailed`, …".

## Low

**1. Lines 5082, 5091, 5092, 5094, 5587, 5592: citations removed, though MX5 says citations stay.** Fix the trailing comments:

- 5082 `// camelCase [SC5]`
- 5091 `// [SC1]`
- 5092 `// not nullable (SA RV1 M4)`
- 5094 `// [W23]  // user-defined: Tickets (a Fake.server, as 2.10.4's Stripe)`
- 5587 `// [W7]`
- 5592 `// the delivery record (SA RV1 L2)`

**2. Line 3993: a comment left empty by mark removal.** `// or: refuse: 4403  // refuse` → `// or: refuse: 4403  // replaces accept`. Same cause at line 5586: restore "a network loss": `// a network loss; a stream control is a wire step [W37]`.

**3. Line 4016: a comment-only line was deleted rather than stripped.** SA 294's `// NEW: socket.close(where, code, reason?)` went. Its signature is in the prose at 4520, so nothing is lost, but the sibling `socket.frames` and `socket.end` comments stayed. Add after 4016: `        // socket.close(where, code, reason?)`.

**4. Line 6160: AE12 changed the test's title.** The plan says SA 2.10.18.5's test, and 5496 has `"a subroutine's exit, alone"`, but 3.2 has `"yes confirms"`. The same Story is named two ways. Fix: `test("a subroutine's exit, alone", async () => {`.

**5. Marks and citations.** Each is small.

- 4464: `[fakes-v2; P, SA RV1 L2]` dropped SA's "RENAMED from `frame`", which plan 2.4(d) does not list, while 4408's "RENAMED from `AmbiguousAttempt`" stays. Fix: `[fakes-v2; renamed from `frame`, P, SA RV1 L2]`.
- 6543 (C82): "no test-runner adapter package (SC4)": SC4 is about matchers, and decisions.md lists the adapter as proposed. Fix: "(proposed; follows from SC2–SC4)".
- 6543 (C82): "the error classes `PropertyTestFailed` and `Fake.Lost`", while 4154 and C71 make `Fake.Refused` and `Fake.Closed` the same kind. Fix: add both.

**6. merge-plan.md lines 109, 114, 118, 125: four links do not resolve from the plan's folder.** They are "After" text quoted from the design, so they are design-relative. M2 did not cover them. Fix: none needed; if wanted, wrap the quoted links in backticks.
