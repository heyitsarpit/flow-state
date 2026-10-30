# Review 5: round 3, the final round (merge 5)

Status: a condensed record of review round 3 on commit `be3ceb05`, its probes, and what this revision did with each
finding. The owner items in proposal 9.x are not decided; no new owner item was needed (9.5's wording changed).

Probes now in the spike: `domains/r3.ts` and `r3lib.ts` (30 lint probes), the runtime probes of `run-rt.ts`,
`probe.ts` and `fix.ts` as checks in `main.ts` and rows in `conformance.ts`. `r3j.ts` (a JSON import) was not
copied: the spike's tsconfig has no `resolveJsonModule`, and a JSON value's type is `number`, which the grammar already
rejects.

Spike: `tsc -p .` 0 errors (16 expected errors in `types.ts`, 8 in the probe files), `bun main.ts` **ALL PASS, 113
checks**, 67/67 conformance rows; `python3 mutations.py`: **38 of 38 fixes of reviews 3 to 5, reverted in turn, make
the spike fail** (37 through a failing check, one, the typed-array skip with its try/catch, through a crash).

## High

| # | Finding | Done | Reverted |
| --- | --- | --- | --- |
| 1 | Carried was per top-level field: `author` held as `{ name }` gave a definite no for `author.userId`. | Carried is a set of segment paths; a read is carried only if a held path is its prefix or equals it. Restored records carry exactly their persisted shape paths; an unknown shape carries none. Rows: partial and whole `author`; a join check. | fails 2 |
| 2 | `oneOf(r.s, [input.a, input.b])` saw raw null/absent symbols. | Each element goes through `usable()`: a present null is maybe (server), an absent element drops at the top and is maybe elsewhere, NaN or an invalid Date fails. Rows for both. | fails 1 |
| 3 | A default parameter records a stale constant. | A recorded callback takes exactly one parameter; no parameter of a callback or helper has a default or rest anywhere in its binding tree. Probes `a11`, `a11b`, `a12`, `b2`, `b3` are errors. | fails 2 |
| 4 | Frozen Dates, Maps and Sets can still be mutated; `DeepReadonly` allowed it. | `deepFreeze` gives Dates (`set*`), Maps (`set`, `delete`, `clear`) and Sets (`add`, `delete`, `clear`) own throwing methods before freezing; the `FrozenWrite` is a fault even when the write changes nothing. `DeepReadonly<Date>` is getters only; Maps and Sets are `ReadonlyMap`/`ReadonlySet` (two `types.ts` errors). Other `TypeError`s are classified on watched copies that record any write, idempotent ones included. | fails 1 |

## Medium

| Finding | Done |
| --- | --- |
| A whole-value confirmation could leave a prediction that never settles | A carrier counts only if its shape holds the whole predicted path; otherwise the prediction ends (EDP:99-100) and `PredictionNotRetained` fires; a confirming read that does not confirm ends it. `settle` returns `ended`; checked; reverting fails. |
| `between` with `from > to` was no | maybe (server); row; reverting fails. |
| Array elements and wrong-kind scalars | `contains` checks elements; `eq` of two kinds is maybe (failed); rows; each revert fails. |
| Restore | 3.1 and 3.4: restored carried paths; a restored write's Encoded input is decoded once, and a failure drops the prediction and forces the repair (text; the spike does not model restore). |
| Literal types are type facts, not value facts | `isConstant`: literal type **and** a checker-resolved single, non-ambient `const` with a literal initializer, an enum member with a literal initializer, or a literal object's property. Probes `a7` (getter), `a8` (computed enum), `a9` (`declare const`), `a10` (`Date.now() as 1`) are errors; reverting to type facts fails. |
| Names resolved by text | Callbacks passed by name are followed through `getSymbolAtLocation` to a single same-file `const`; `let` (`b1`), an import (`a1`), `.bind` (`a3`) and a shadowing parameter (`s1`) are errors; reverting fails. |
| Typed arrays made freezing throw | `ArrayBuffer` views are skipped and freezing is inside try/catch; neither replay nor start throws; checked (reverting both crashes the run). |
| A function that throws only on its second call | Under `checkReplays`, each call has its own outcome; differing outcomes are a fault; checked; reverting fails. |
| Nested input defaults | Keyed by segment path in the Model; an inner default applies only when its parent is present; the fingerprint covers the Model, so it covers defaults, and on skew a hydrated answer carries its decoded input. Checked; reverting fails. |
| `deepFreeze` froze the caller's objects | Inputs and returned values are copied before freezing; a shared input object and a module array stay unfrozen; reverting fails. |
| Stale text | M5-D4's unevaluable-prediction clause struck through and superseded by A9; section 7 points migration at 3.9 and the status line at 3.1–3.9; "22 ways" and "23 of the 24 holes" agree; the "an an editor host" typo; 6.4 V1 says freezing and `checkReplays`; the EDP O1 row says segment arrays; M5-D6 and 9.4 are tagged "ESLint clause pending 9.8"; MT added to the short names. |

## Low

| Finding | Done |
| --- | --- |
| `isNull` of an absent optional field | maybe (server); row; reverting fails |
| A3 and nested `and` | one sentence: an `and` in an `and` from the root drops, one under `or` or `not` does not |
| A JavaScript caller omitting a defaulted key | `typeSideInput` reports `InputMissingRequiredKey` at answer creation; checked |
| Function-valued defaults | "a transport that would re-decode" dropped; `Effect.sync` is allowed and recorded `dynamic`, any other Effect is an error; the answer keeps its decoded value as its key |
| The allowlist was "declared in flow.ts" | a library call must return a recorded value, a sort key or a change; `contradicts` (`b5`) and `canonical` (`b8`) are errors; optional calls (`a6`) too; reverting fails |
| Replay cost O(K²) | key texts cached per live prediction |
| 9.5 and `makeDomain(Date.now())` | an info finding at each factory call whose argument is not literal ("fixed for the domain's life"); 9.5's "one residue" wording corrected; checked; reverting fails |

## Residues, stated

A private class field (`#n`) changed by a method on a frozen record is not detected (freezing does not reach it). A
cached clock read is still invisible to `checkReplays`. Restore is described, not modelled.
