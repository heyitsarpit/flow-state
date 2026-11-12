# Review of the core-runtime Task briefs (T54, T18, T55, T19, T20), 2026-11-12

Status: **review log** (agent). Four Haiku sidecars (effort high) read the briefs; every finding below was checked
against the files by the lead. A = accepted (fixed), C = changed (fixed differently), R = rejected, O = open for the
orchestrator or the user (not fixed here).

## Fidelity

- R: five questions written as "Decided (orchestrator, 2026-11-12)" (value encoding, tagged result after T20, final
  write one try, no creation-order keys, field `queue`). The source leaves them to the user, but
  `workflow/tasks/V3/log.task` note 2026-11-12T10:30:10Z records them as orchestrator decisions. The briefs follow
  the log and say "orchestrator", not "the user". The user has not confirmed them (O: confirm or reverse).
- R: Rules block drops "below" twice and adds the Names bullet: the Rules sit in a comment apart from the sections
  they point to; no fact changes. "Call the test apps ..." is applied (Rules, "All fixtures are central").
- R: "Read first" twice (original plus "Read first (added)"); the record's own text is kept verbatim as asked.
- R: in-place edits of two stale record lines (T18 Why now "I28 moves here"; T19 comment `PART-transfers-stress-12`).
  Both are corrections of facts the source names under Record differences; the old text stays readable in them.
- R: T20 goal still says "delivered at boot", T19 and T18 goals not from the source: original record text kept; each
  brief's Record differences state the correction.
- A (changed): T20 trap "Restore I9 and I19 have no Spec case yet" is false: Restore T14 [@I9] and T5 [@I19] exist.
  Now "have Spec tests (T14, T5) but no oracle or case yet". This departs from the source's verbatim text.

## Blind reader

- R: contradictions it found are original record comments the brief's Record differences already override (S08 cost
  baseline, "five pending cases", T18 comment 07:04:28Z), or source text (lane-id vs record-key order; steps without
  Check lines; `Wrong: none` for B-8 and L-18, which explain their red).
- R: Rules block repeated five times is what the source asks ("Prepend to every brief").
- O: `store.splits-batch` is the Wrong name of both A-15 (T54) and W-9 (T19), verbatim in the source. Two mutants with
  one name will collide in the registry; the orchestrator renames one.
- O: T18 declares code `ad`, which is not in `MODEL_CODES` (`conformance/parts/codes.ts`); no T18 step adds it.
- O: T55 B-8 needs `World` opaque and branded; `src/core/world.ts:247` is a plain type and no brief step brands it.
  T54 decisions brand `Ledger`, `Life`, `Report` only.
- O: T10, T7 and T11 are done in the records while T19, T18 and T20 say they absorb them; `not-yet.ts` still owes the
  rows. Original record text, not the briefs'.
- O: T19 "today's five flag combinations in `edge.ts`": `src/host/edge.ts` has `Scope { dirty, tickets, out, due }`,
  no five-flag set. The builder derives the cells from the code, per the step's table test.

## Citations

- A: none needed for the 95 rule ids, about 40 code paths and the Task links: all resolve and say what is claimed.
- R: `persist.ts:134` is 135 (T18 original comment); `driver.ts` lines 195 to 212 end at 214; "W1 Q2 B" label. All
  original record text or source, off by a line or a label, not misleading.
- O: T18 comment cites WriteLanes I25 for the StillUnknown remainder; the rule is R2 and I3 (L-16 cites R2). The same
  label is in `conformance/write-lanes/remainders.ts:44-46`. WriteLanes I4's remainder is T17's there, T18's in L-10.
- O: T20 R-1 cites Restore R1 for "reads bytes, never memory"; R1 does not say it in those words.
- O: `@plan.X.On` links do not resolve through `workflow show`; `workflow check` accepts them.

## Wording pass (commit 86b952fa)

- A: stray short wrap lines at `P13.task` (T58 description, "React binding and") and `epic.task` (preview cut,
  "close; streams,"). Reflowed.
- C: T58 acceptance "a payment is committed" now covers every fixture, including sign-in. Reads "a write is committed
  (Pay's a payment)".
- R: T58 May change "a browser app for the fixtures" and False pass "Fixtures ... that render but write nothing"
  read correctly; T58 Read first still lists `Pay.tsx` as a pointer to one fixture.
- R: the T58 decision comment of 08:12:10Z, "Checkout stays only as the type-error count", is the user's dated words.
  It agrees with "Pay and Cells as parts" there and with the briefs' extra role for the type-error count; left as is.
- R: the glossary line "The Pay path" in `epic.task` keeps its name (a defined term) with its new meaning.
- R: remaining Pay or checkout mentions (152 checked): history, case ids, paths, the type-error count, Pay's own
  conversion (T52), or "Pay-shaped"/"only the Pay machine" in T56 and T17 describing a shape or a skeleton fact. None
  stands in as the test of behaviour. Borderline kept: T47 "about 70 of 112 hand cases use one application
  (checkout Pay)" states the problem T47 fixes.
- R: stray one-word wrap lines in the Rules block of the five briefs: lines stay at most 120 characters; cosmetic.

## Spec problems for the orchestrator (not edited)

1. WriteAhead R9 (`workflow/specs/core/WriteAhead.spec:112-113`) says the record format is "1 to 4"; Codec R5 and T20's
   decision are one number, 1.
2. `sentBefore` (WriteLanes I36, the T54 A-11 check) is named in no Spec; I36 states the rule in words.
3. Restore I19 (a changed reset runs first after restore) is owned by T20 in `conformance/not-yet.ts` but resets are
   T56's since the split; Restore I9 and I19 have Spec tests T14 and T5.
4. Lane order at Start is "lane-id order" (T54) and "record-key order" (Restore R3, T20); the Specs should say they
   are one order.

## Also done

The three comment-ready lines from the source were added as comments on T24 (`P5.task`), T21 and T17 (`P13.task`),
each marked "from core-task-briefs-2026-11-12.md".
