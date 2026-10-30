# Review 4: round 2 on revision 3 (merge 5)

Status: a condensed record of review round 2 on commit `e5e10b9f` (two reviews, folded together), the coordinator's
addition from the multiplicity audit (`../../audit-multiplicity.md` section 4, commit `ff012751`), and what this
revision did with each. The invariant: never miss a needed refetch; extra refetches are fine, an unbounded cliff is
not. The owner's open items 9.1–9.4 are untouched; new owner items are 9.8–9.11, and 9.7 is re-decided.

Spike after the revision: `tsc -p .` 0 errors (14 expected errors in `types.ts`, 4 in the probe files), `bun main.ts`
**ALL PASS, 102 checks**, 60/60 conformance rows, and `python3 mutations.py`: **20 of 20 fixes, each reverted, make at
least one check fail** (output at the end of [spike/output.txt](../spike/output.txt)). The reviewers' probes are
`spike/domains/p.ts` and checks in `main.ts`.

## High

| # | Finding | Done | Reverted, fails |
| --- | --- | --- | --- |
| 1 | The lint let branches through in a receiver, a computed property name, a zero-parameter callback, and an `any`-typed callback passed by name. | Recorded callbacks are found **by position**: every function passed to a library recorded position, inline or by a same-file name, whatever its parameter types; a name the lint cannot follow is an error. Receivers are checked; computed names are errors; a block body is allowed only as one `return`. | receiver, computed names, named callbacks, zero-parameter callbacks: each fails the review 4 probe check |
| 2 | Production handed field functions the live record; the double call was off in production. | Records and inputs are **deeply frozen in every environment**; a `TypeError` is classified by re-running the function on Schema-made copies (prototype-, `Map`-, `Set`-, `bigint`-preserving in the spike): a changed copy is a prediction fault, otherwise an ordinary failure. 9.7 re-decided to this. | freeze everywhere (3 checks fail) |
| 3 | An ESLint rule cannot be built as specified (synchronous rules, an asynchronous reader). | 3.6 compares `flow check --watch`, a TypeScript language-service plugin and a bridge; recommends `--watch` now, the plugin later, no ESLint rule. It changes M5-D6, so it is owner item 9.8. | — (design) |
| 4 | "Development" was undefined; Stories and `propertyTest` run production runtimes. | `checkReplays` is a Runtime option like audit mode, on by default in Stories and `propertyTest` (owner item 9.9). A fault is a `predictionFault` event (Inspection O4, ED 7.4); a Story fails on it. | checkReplays (1 fails); and a check shows it off finds nothing |
| 5 | Vacuous checks: no bare computed `NOW` or import; `metadata` versus `meta` was yes→yes regardless; no server-maybe→server-maybe on an unread field; `settle` never read the replay; the react check asserted nothing about faults. | Added holes `e24` (`LOADED = Date.now()`, bare) and `e25` (an imported computed value, bare); `metadata` is tested against a maybe→maybe `serverMatches` on `meta`; a `serverMatches` list with an unread field changed; `settle` takes the replay's slots; the react check asserts every slot shown and no fault. | literal-type constants; unread-field bound (4 fail); prefix paths; settle reads uncomputed slots (3 fail) |
| 6 | Schema defaults used an API that does not exist (`Schema.optional` takes no options). | 3.1: the evaluator sees the Type side; `withDecodingDefaultKey` makes a defaulted key required there; Encoded inputs are decoded once at their boundary; only static `Effect.succeed` literal defaults are allowed and recorded in the Model; a function default is decoded once and its refetch sends the same value; a decode failure is maybe plus `InputDecodeFailed`; a field function's input is not decoded again; never double-decode. Spike: `fromEncoded`, `DECODE_FAILED`. | decode failure is maybe |

## Medium

| Finding | Done |
| --- | --- |
| "Not carried" inferred from `undefined` | Evaluation takes the store's carried-field set; a held field with an absent value is a value. A delta side is the store's merged base; 3.3's counterexample re-checked (it holds when the store never held `team`). Reverted: carried fields fails 2 checks. |
| The double-call harness failed silently (prototypes, bigint, Map, Set, NaN, a mutated input) | A prototype-keeping copy and a total canonical form; the input is frozen, so `i.xs.sort()` is a fault and the body is unchanged; a copy failure is a fault. Checks: class instance, bigint field, input sort. |
| A bigint or circular key crashed replay | `canonical` is total; key matching is inside `try`; keys decode through the primary key's Schema (`"12"` = `12`). Reverted: canonical bigint, key decode each fail. |
| "Defects are never skipped" contradicted the code | Reworded: a prediction fault behaves as uncomputed for display and settlement, is reported, and is never thrown out of a replay or view. |
| Change paths | Paths are segment arrays; arrays are atomic on both sides. Reverted: arrays atomic fails (an insert reported at `[tags, 1]`). |
| Nested settlement | A response confirms a predicted field only if it carries the whole value. Reverted: whole-value confirmation fails. |
| Static `flow explain` needs a record and input | `mayRepair`: field-level, counting predicted fields, response shapes and `.alsoChanges`. 3.7's example now reads "may, through the response". |
| `PredictionNotRetained` with `listen` | `listen` dropped from the carriers (EDP:15-16, 99-100). |
| Where the lint finds sources | The project's program; a `tsconfig` field in `defineConfig` (CLP O6 amendment); disable comments ignored; `@ts-nocheck` and JavaScript files with recorded positions are errors. Reverted: ts-nocheck fails. |
| Name collisions | `why` → the `repair` event's existing `matched`; `skipped` → `uncomputed`; "defect" → prediction fault (`predictionFault`); `predicted` stays per record (merge 4 E16), per field `unconfirmed`; ED 8.2's C5 amended. |
| `many` has no bound | Related to merge 4 rule 35's queues; the array bound (4,096, INS O2) is owner item 9.11. |
| Amendment drift | EDP:32-33 cited; A12 and its EDP amendment say "construction or lazy adoption"; two entries of one domain on one operation: an error, owner item 9.10 (the spike's `app` implements it). |

## Low

| Finding | Done |
| --- | --- |
| A cached clock | documented (`checkReplays` cannot see it; settlement corrects it), with a check that it is not detected |
| Prefix `!` | stated: always an error in a recorded expression |
| `function` declarations as helpers | documented: not followed as helpers; write `const f = (…) => …` |

## The multiplicity audit (section 4)

| Item | Done |
| --- | --- |
| A field function runs only over a held record; a patch over an absent one shows nothing, stays with its Attempt, runs when a base arrives (F12) | 3.4, A8, the EDP:64-70 amendment; spike check |
| `flow explain` prints a lane's cardinality and key (N2) | 3.7, A11 |
| A retried `many` write needs a per-call key and `reject` (N2) | 3.4 and the merge 4 rule 34 amendment |
| First sighting is per Runtime | 3.3, A5 |
| Eight M4 citations | re-pointed as listed (`M4:75`, `M4:128-131`, `M4:130`, `M4:306-309`, `M4:614-616`, `M4:632-633`, `M4:658`, `M4:892-895`) |
| N1–N3, `s.calls` (D18), E17–E18 | merge 5 had no `pending`/`retryCount` reads on commit values; `retry`, `retryCount` and `progress` are cited per N2; existence is `undefined` (N3) in 3.4; 3.9's migration re-checked against E17 |

## New owner items

9.8 the editor path (changes M5-D6); 9.9 `checkReplays` defaults; 9.10 two entries of one domain on one operation;
9.11 the `many` array bound. 9.7 is re-decided to "freeze everywhere, classify by copies".
