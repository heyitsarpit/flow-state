# Review 2: soundness, authors, system fit (merge 5, revision 2)

Status: a condensed record of three independent reviews of [proposal.md](../proposal.md) after revision 1, the owner's
decisions on them, and what revision 2 did with each point. The reviews themselves reached this revision through the
coordinator's summary; their wording is not reproduced. The owner's instruction: simplify, remove things for broad
correctness, fewer concepts over completeness, keep M5-D1, record new decisions as M5-D5 onward and mark what they
supersede. The main session verified fixes 1 and 2 before the revision.

The spike after the revision: `tsc -p .` 0 errors (13 expected errors hold), `bun main.ts` **ALL PASS, 52 checks**,
56/56 conformance rows ([spike/output.txt](../spike/output.txt)).

## The owner's decisions

| Question | Decision | Done |
| --- | --- | --- |
| Q1. Recorded value expressions, or runtime functions? | **Runtime functions** `(beneath, input) => value`; recording keeps structure. Nothing reads a predicted value (the reviewer's point, and the proposal's own reason for `.as`). | M5-D5. Removed `add`, `sub`, `opaque`, value `when`/`coalesce`, the value-only flag, the `opaque` Model/runtime split, revision 1's A9, the `opaque-closure` and `outer-value` rules. Kept replay (now A8) and the skip (now A9) for plain functions. `flow explain` prints `likes ← <runtime>`. Added a sealed recording session so a function that closes over the recording `input` fails with the fix in the message (9.3 for the owner). |
| Q2. Agreement check, or lint only? | **Lint only**, type-aware, also as an ESLint rule; one source-and-type-facts layer with Inspection D2, failing closed; weigh the `typescript/unstable/async` risk. | M5-D6. Removed the description-building reader, `DomainSourceMismatch`, `unreadable-domain`, the stale-build fixtures. The lint (`spike/source.ts`) recognises recorded values by a type brand and recorded callbacks by their parameter type, so it follows values into helpers and factories (both allowed now). The risk is weighed in 3.6 and 9.4. |
| Q3. `when` and `coalesce` in conditions? | **No.** | M5-D7. Conditions keep `eq`, `oneOf`, `contains`, `between`, `overlaps`, `gt`/`gte`/`lt`/`lte`, `isNull`, `and`, `or`, `not`, `serverMatches`. |

## The fixes

| # | Finding | Done |
| --- | --- | --- |
| 1 | Make the evaluator three-valued (Kleene): not carried, failures, `serverMatches` and server-dependent cases give maybe; repair when old and new differ definitely, or a side is maybe on a changed field. Fixes the verified missed refetch: `or(eq(team, i.t), eq(status, "open"))` with only `status` carried read true/true (ED:521-523). Re-check A13 and the null-ordering rules; drop "only under `and`" for `serverMatches` if safe. | M5-D8, rules A2, A5, A6. **The rule as stated would still miss the counterexample**: before is yes, after is maybe because `team` is not carried, and `team` did not change, so "maybe on a field that changed" does not fire. Revision 2 uses the sound form: *repair when a field the condition reads changed, unless both sides are the same definite answer*. A change to an unread field never repairs (no cliff). The spike tests the counterexample against revision 1's rule (no transition) and the new rule (repair, `not carried`), plus five more cases. `serverMatches` is maybe everywhere, legal under `or`; the restriction, the nullable-negation ban and the optional-input flag go. A13 became A6: a sort key that is maybe for the client (null, bad, a Date tie) skips the pair. |
| 2 | `overlaps` returned false for a null start or end before checking absent bounds (spike `flow.ts:403`). | Each term is evaluated separately: `s < to` and `e > from`, each with its own absent bound and its own null. Rows: a null end with the start term deciding no; a null end whose term is dropped (yes); `from > to` maybe. |
| 3 | Type errors should name the cause and the fix; fix-its must never suggest a type error. | Sentence types (`Msg<"…">`) on ordering, `eq` and `isNull` (the messages below). A fix-it is code only when the lint has checked it type-checks (operands are conditions, or two recorded values of one type); otherwise an instruction. `?:` always gets an instruction. The spike compiles the two code fix-its in `types.ts` and checks the lint's text matches byte for byte. |
| 4 | Count `listen` entries (merge 6) as carriers; name `listen` in "where it stops". | 3.7 and A11: a `listen` entry listing the entity is a carrier for `PredictionNotRetained`; `listen` entries are where the join stops, as sources of deltas. |
| 5 | Put the evaluator's reason into repair evidence; name `propertyTest` as where exactness meets fixture truth. | `repair` gains `why` (`entered`, `left`, `notCarried`, `failed`, `server`) and a detail (6.4, ED 7.4); the spike's `joins` returns it. 3.1 and the ED 8.3 amendment name the oracle. |
| 6 | State the millisecond assumption for Dates; a boundary tie may be maybe. | 3.1: Dates compare at millisecond precision; a tie is maybe for `eq` and order (9.1 for the owner). Rows for both. |
| 7 | With functions, confirm the opaque-body fingerprint problem disappears; put operators in a neutral module. | 3.4: function bodies are outside the Model, so outside the fingerprint, like `.as` and selects; nothing replaces it. 3.1: the `Condition` module. |
| 8 | Record in the Model whether a key is an array; say so in the rule 34 amendment. | M5-D9, A7: `many` on the change, from the input Schema (the spike's operation lists its array paths); merge 4 amendment and EDP sentence. Tested: `many` recorded, one-element arrays take no lane key. |
| 9 | Document the null split; the impure list is incomplete; `overlaps` with `from > to` is silently empty. | 3.1 "The null split": absent drops, a present `null` is maybe (9.2 for the owner). The impure list is called a best effort, for review to catch. `overlaps` with `from > to` is maybe; `between` with `from > to` is no (empty by its own terms). |

## Concept count

Named concepts an author or tool-maker must learn, counted the same way for both revisions.

| Group | Revision 1 | Revision 2 |
| --- | --- | --- |
| New operators | 12: `or`, `not`, `gt`, `gte`, `lt`, `lte`, `isNull`, `when`, `coalesce`, `add`, `sub`, `opaque` | 7: `or`, `not`, `gt`, `gte`, `lt`, `lte`, `isNull` |
| Type facts | 4: the optional-input flag, the value-only flag, the nullable-negation flag, the key brand | 0 (sentence errors are messages, not concepts) |
| Semantics | 11: record beneath, simultaneous assignment, written order, skipped value, array keys, two-valued logic, absent input under `and`, the null input rule, "undecidable matches", the null-pair skip, Dates by time | 9: maybe and its causes, the join rule, record beneath, simultaneous assignment, written order, skipped value, `many`, absent input under `and`, the Date tie |
| Tooling | 13: the source description, the agreement check, `DomainSourceMismatch`, `unreadable-domain`, two fix-it kinds, six finding rules, `PredictionNotRetained` (plus the conformance table and the `opaque` split) | 7: the lint, code fix-it or instruction, two finding rules, `PredictionNotRetained`, the conformance table, the sealed session |
| **Total** | **about 40** | **about 23** |
| Rules | A1–A13 | A1–A11 |

Revision 1's rules in revision 2: A1 → A1; A2 → A2 (now three-valued); A3 → A3 (maybe instead of a type error); A4 →
A4; A5 → A7 (keys) with value expressions removed; A6 → A8; A7 → A9; A8 → A10; A9 removed; A10 removed; A11 → A11;
A12 → A5 (the join rule); A13 → A6.

## The 13 expected type errors and their messages

| Stated reason | Message (TS 7.0.2) |
| --- | --- |
| ordering a string | `Msg<"gt, gte, lt, lte, between and overlaps order numbers and Dates; a string's order is the server's collation: use serverMatches">` |
| a Date against a number | `number` not assignable to `Arg<Date>` |
| a wrong constant; a Date against a string | `Msg<"eq compares two values of one type (a Date with a Date, a string with a string)">` |
| `isNull` on a non-null field | `Msg<"isNull needs a nullable field">` |
| JavaScript `+` on a recorded value | TS2365 `+` cannot be applied to `Expr<number>` and `number` |
| arithmetic as a sort key | TS2362 / TS2559 `number` has no properties in common with `Expr<Value>` |
| a JavaScript boolean in `.where` | TS2559 `boolean` has no properties in common with `Condition` |
| a condition as a key | `Condition` not assignable to `string \| Expr<string>` |
| a runtime function's wrong result | not assignable to `Slot<number, IssueRow, { key; liked }>` |
| a runtime function's unknown input field | TS2339 `nope` does not exist on `{ key: IssueKey; liked: boolean }` |
| a closure over the recording input | TS2367 `Expr<boolean>` and `boolean` have no overlap |
| `.predicts` returning a boolean | `boolean` not assignable to `Change<…>` |

## Still for the owner

Proposal section 9: the Date tie as maybe, a present `null` input as maybe, the sealed recording session, and the
TypeScript 7 API dependency. Each has a recommendation written into the text.
