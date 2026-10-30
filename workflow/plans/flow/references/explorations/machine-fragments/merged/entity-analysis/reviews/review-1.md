# Review 1: correctness (merge 5, after acceptance)

Status: a condensed record of the correctness review of [proposal.md](../proposal.md) as accepted (commit
`9f212ffd`, decisions M5-D1 to M5-D4), and what the revision did with each finding. M5-D1 to M5-D4 are unchanged. "P"
is the accepted proposal's line numbers; section numbers are the revised proposal's. The main session verified H1 in
the spike before the revision (`flow.ts:313`: any absent input argument made the whole leaf true). The choices the
fixes forced beyond the decisions are listed for the owner in the proposal's section 9.2.

The spike after the revision: `tsc -p .` 0 errors (23 `@ts-expect-error` lines hold), `bun main.ts` **ALL PASS, 64
checks**, 61/61 conformance rows ([spike/output.txt](../spike/output.txt)).

## High

| # | Finding | Done |
| --- | --- | --- |
| H1 | `between`/`overlaps` with one absent bound made the whole leaf true; ED:393-394 and P:95 say only that bound drops. The spike never evaluated `between`, `overlaps`, `oneOf`, `contains`, `gte`, `lte`. | **Fixed.** The evaluator drops only the absent bound (`flow.ts` `holds`); other comparison leaves drop as before; `when`, `not` and `or` are no longer treated as leaves. Rule A3 says so. Conformance rows cover each operator, both one-bound cases for each, both absent, and Dates. The calendar entries in `extras.ts` test it through a domain. |
| H2 | No rule for a condition that cannot be evaluated: `lt` on `{}`/Infinity/NaN threw, `eq` on a missing field threw, `isNull(undefined)` was false, `holds` had no catch. | **Fixed.** Table 3.1 has a "field not carried, or a bad value" column. Rule A12: not carried or failed to evaluate means *matches* (conservative; ED:523 extended). The evaluator returns `{ matches, why }` with `notCarried` or `failed`; a record field read as absent throws `NotCarried` before any operator sees it, so `not(isNull(x))` over an absent `x` matches rather than turning false. Rows for each case. |
| H3 | Rule A7 could leave a stale field: a skipped prediction with no pending mark, a response that omits it, and no confirming read (EDP:96-100, ED:613-630). A7 ignored a throwing `opaque` body; `visible()` aborted the whole replay on one bad field. | **Fixed.** A skipped field keeps the value beneath, still reads `predicted`, and counts as predicted at settlement, so an omitted one is unconfirmed and gets its confirming read (rule A7). A throwing body is an evaluation failure. `replay` catches per field and goes on; `settle` reports unconfirmed fields. Tests: a beneath field not held, a throwing opaque body, a non-finite sum, and the skipped field unconfirmed at settlement. For the owner: 9.2 item 1. |
| H4 | `eq`, `oneOf`, `contains`, `isNull`, `coalesce` undefined on Dates (equal Dates gave `eq` false); Dates not a `Scalar` in the spike; invalid Dates not covered. | **Fixed.** Values include `Date`; equality is `getTime()` equality; a Date never equals a non-Date; an invalid Date (and NaN, ±Infinity) is an evaluation failure, so matches (rules A2, A12). Date constants are recorded as their time. Rows for `eq`, `oneOf`, `lt`, `between` on Dates and invalid Dates; a predicted Date field in (c). |
| H5 | M5-D2 to M5-D4 not carried into sections 3–9: "none is decided" (P:566); no conformance table (M5-D3); "ED 4.4 unchanged" (P:479) though the null-pair skip changes ED:405-410 and EDP's order sentence; M5-D2's finiteness check and `Order.Date` in no amendment and raw `<` in the spike; stale "open question N" (P:129, 266, 556), "when the owner accepts" (P:5-6, 458); prior-art.md recommendation 3's "any server adapter must pass". | **Fixed.** 9.1 records M5-D4 as decided; 9.2 holds only the review's new choices. The conformance table is section 3.2, printed by the spike from `conformance.ts`. Rule A13 and an ED 4.4 (ED:405-412) and EDP O1 (EDP:37-41) amendment state the null-pair skip; the spike's `checkOrder` implements it. Rule A4 and the EDP/ED amendments name `Order.Number` after a finiteness check and `Order.Date`; the evaluator and the order check use Effect's `Order` (no raw `<` remains). The stale mentions and phrases are gone. prior-art.md recommendation 3 now says the evaluator's own test. |
| H6 | "Recorded once" contradicts unamended text: M4:74 and M4:624 ("with the real input"), ED:1164, SEA:352, and P:307-308 against CLP:96-97 ("without running application callbacks"). | **Fixed.** 6.4 amends M4:74, M4:624-625, ED:1164, SEA:351-353, and rewords CLP O5 (CLP:96-97) to name the recorded positions App construction calls. Section 1 states the contradiction. |
| H7 | Array keys (`User.patch(input.keys, …)`, ED:443-444) make the record count a value, breaking rule 34 (M4:606) and queue joins (EDP:112); the spike could not express them; types allowed `when` in a key. | **Fixed.** Array keys are kept: evaluated at start, each record once, each queue once, and never rule 34's default lane key, even with one element; whether a key is an array is read from the input Schema, so the default is static (rule A5, 3.4, M4 rule 34 amendment). A key is parameter reads and constants: parameter reads carry a type brand, so `when`, arithmetic or `opaque` in a key is a type error (`types.ts`). Spike tests bulk archive with a duplicate, a one-element array, and a single key. For the owner: 9.2 item 3. |

## Medium

| # | Finding | Done |
| --- | --- | --- |
| M1 | `PredictionNeverShown` has false positives: the write's own `.one` response carries the field, and `Issue.get` with `pick` reads it; it ignores domains adopted later. | **Fixed.** Renamed `PredictionNotRetained`: the field is shown while predicted but dropped at settlement. Carriers counted: the write's own response places, every read entry, every `.byKey` loader (EDP:15-16). `Issue.get` readers are not carriers: they see the prediction, then the dropped field, which is what the warning says. Computed over the complete declared graph, lazy entries included; not issued if the graph is incomplete (3.8, rule A11). For the owner: 9.2 item 5. |
| M2 | The reader rejects module constants and enums, `as const`, casts, `!`, `input["a"]`, single-parameter callbacks; crashes on nested destructuring; barrels and `import * as f` give a false `unknown-call`; `endsWith("flow.ts")` is too loose; factories and dynamic ids give a false mismatch; the "stale build" claim covers more than recorded positions. | **Fixed.** The reader accepts each form (3.6 lists them); `domains/variants.ts` and `domains/lib.ts` write every one, and source and recording agree with no findings. The library is matched by exact specifier (the resolved file in the spike). Factories and computed ids are `unreadable-domain`, an error, and are not compared. Rule A10 and 3.6 restrict the agreement claim to recorded positions; 3.7 adds "that the running body is the one in the source" to what `opaque` cannot promise. |
| M3 | The `||` fix-it emits an optional input under `or`, breaking A3. | **Fixed.** Fix-its carry a kind: `mechanical`, or `starting point` when they introduce `or`, `not`, `when` or `coalesce`, where A3/A4 apply and the types decide. The `||` fix-it is marked a starting point and the check tests the kind. |
| M4 | Two-valued null disagreements: `not(lt(x,5))` true while `gte(x,5)` false at null; `eq(f, input.x)` with a present `null` constrains `f`, while `coalesce` treats null as absent; `serverMatches` under `not` is false for every record. | **Fixed.** A fourth phantom flag marks an ordering of a nullable value; `not` and `when`'s condition reject it unless coalesced (rule A4; two `types.ts` errors; a coalesced row in the table). `serverMatches` is typed "only directly under `and`" like an optional input (two `types.ts` errors). 3.1 documents the null-input case, and the table has both the present-`null` and the absent rows. "Unless guarded" by an `isNull` test is not expressible in the types; the proposal offers `coalesce` or the explicit complement instead. For the owner: 9.2 item 4. |
| M5 | "The development-time check cannot exist" is overstated (INS:174-176 restricts the library, not a separate tool); the "new" conversion hook already exists at ED:475; a second description from source needs an Inspection D1 amendment (INS:155-157). | **Fixed.** 6.3 calls the removal a choice (M5-D4) and says such a tool would be possible. Section 5 credits ED:475 for the hook. 6.4 amends Inspection D1: the source reading is a check of the Model, compared and discarded, never printed or saved. |
| M6 | Weak checks: the nullable-arithmetic error failed for a string; the `and(`/`or(` checks passed on message text; the `?:` predicted-value check was the `+` finding; agreement held by construction (no mismatch on a lint-clean declaration). Not modelled: retirement and confirmation, A7, delete predictions, two patches to one record, Dates, restore, multiple `.where`, the input rule, the join and the warning. | **Fixed where it can be modelled.** The nullable test uses `number \| null` (the message names `Ref<number \| null>`). The fix-it checks compare the full fix-it text and its kind. `legacy-flags.setLike` is a `?:`-only predicted value (`when(input.liked, true, false)`). `domains/stale.ts` against its previous build is a real `DomainSourceMismatch` on lint-clean code. Added: settlement and retirement, A7, a predicted delete and retraction, two patches to one record, Dates, two `.where` calls (recorded as `and`, read the same way), array keys, the order check. Still not modelled, and listed in section 5: restore and uncertain endings, the input rule, the join, the warning, confirming-read scheduling beyond reporting unconfirmed fields. |

## Low

| Finding | Done |
| --- | --- |
| P:407 says four exact-type assertions; there were five | section 5 now says five (and three allowed forms) |
| `opaque` lives in a WeakMap, but the Model holds no closures (INS:19-20) | sections 2, 5 and 6.4 say the runtime keeps the function in its live description; the Model holds the dependency list |
| A3 omits the single top-level leaf case | rule A3: "directly under `and`, or as the whole condition" |
| The join uses commit-to-operation edges INS:16-18 does not list | 6.4 amends INS O1: each action names the operation it commits or reads |

## The 23 expected type errors and their messages

Each `@ts-expect-error` in `spike/types.ts` was removed in turn; the compiler's message shows it fails for its stated
reason (the phantom flags print as `Expr<V, O, A, N>`: O only under `and`, A value-only, N nullable ordering).

| Stated reason | Message (TS 7.0.2) |
| --- | --- |
| optional input under `or` / `not` / `when`'s condition | `Cond<boolean, false>` not assignable to `Expr<boolean, false, false, …>` (O) |
| `serverMatches` under `or` / `not` | `Cond<true, false>` not assignable (O) |
| nullable ordering under `not` / as `when`'s condition | `Cond<false, boolean>` not assignable to `Expr<boolean, false, false, false>` (N) |
| arithmetic in a condition; opaque in a condition | `Expr<number, false, true, false>` not assignable to `Arg<number>` (A) |
| ordering a string | `Ref<string, false>` not assignable to `Expr<Ordered, …>` |
| a Date against a number | `number` not assignable to `Arg<Date>` |
| wrong constant | `"archived"` not assignable to `Arg<TicketStatus>` |
| `isNull` on a non-null field | `Ref<string, false>` not assignable to `"isNull needs a nullable field"` |
| arithmetic over a nullable number | `Ref<number \| null, false>` not assignable to `NumArg` |
| JavaScript `+` | TS2365 operator `+` cannot be applied to `Ref<number, false>` and `number` |
| `when` around changes | `Expr<Change, …>` not assignable to `Change \| readonly Change[]` |
| `when` in a key | `Expr<string, …>` not assignable to `string \| PathRef<string>` |
| wrong predicted value type; wrong per-field result | not assignable to `Slot<string, IssueRow>` / `Slot<number, IssueRow>` |
| opaque dependency type | `(n: string) => string` not assignable to `(values_0: number) => string` |
| a JavaScript boolean in `.where` | TS2559 `boolean` has no properties in common with `AnyCond` |
| arithmetic as a sort key | `Expr<number, false, true, false>` not assignable to `Expr<Value, false, false, false>` |
| the `?:` starting-point fix-it | `Ref<TicketStatus, true>` not assignable to `Expr<boolean, false, false, false>` |
