# Review 3: probes against revision 2 (merge 5)

Status: a condensed record of review round 1 on revision 2 (commit `eabb56fa`), and what the revision did with each
finding. The invariant: **never miss a needed refetch**; extra refetches are acceptable, an unbounded cliff is not.
Two reviewers wrote probes and five real domains; the ones that matter are now spike fixtures
(`spike/domains/kanban.ts`, `mail.ts`, `docs.ts`, `cal.ts`, `tenant.ts`, `holes.ts`, `helperlib.ts`, first line marks
them). The main session verified that `joins` had no existence handling and compared paths by exact string. The owner's
four open items (proposal 9.1–9.4) are untouched; three choices this revision made are listed for the owner as 9.5–9.7.

Spike after the revision: `tsc -p .` 0 errors (14 expected errors in `types.ts`, 4 in the probe files), `bun main.ts`
**ALL PASS, 84 checks**, 58/58 conformance rows ([spike/output.txt](../spike/output.txt)).

## High

| # | Finding | Done |
| --- | --- | --- |
| 1 | No existence side in the join: a create into "all issues" was yes/yes, a list with no `.where` never repaired, deletes were not modelled; ED 2.3 and ED:525 (first sighting) were lost. | **Fixed.** A side is a record, `none` (before a create, after a delete: a definite no) or `unknown` (a first sighting: no for a list, maybe for a derived answer, ED:523-526). An existence change repairs whatever the condition reads (rule A5, `membership`/`joins`). Checks: create into "all issues", create outside, delete, no `.where` (create repairs, update does not), first sighting for a list and for a derived answer. ED 5.2's amendment keeps the first-sighting sentence. |
| 2 | Nested paths: `meta.owner` against a change reported as `meta` never matched. | **Fixed.** Dot paths match when one is a prefix of the other at a segment boundary, in both directions; the rule states this granularity. Checks: `meta`, `meta.owner`, and `metadata` (no match). Conformance rows for a nested read and a nested field not carried. |
| 3 | Settlement and retirement by field name across records: a transfer whose response carries only A dropped B's prediction, and A's confirmation retired B's. Same for `many` writes. | **Fixed.** Predictions are keyed by (entity, key, field) in A9 and in `settle`/`replay` (`retired` is per slot). Checks: the transfer (B unconfirmed; an older write's prediction on B still shows while A's is retired), a bulk write (u2 unconfirmed). |
| 4 | The lint was a denylist and leaked (`if`, `switch`, `typeof`, `in`, spreads, `JSON.stringify`, `any`/generic helpers, `as any` then `?:`, nested arrows, imported or aliased clocks, consts computed at load). | **Replaced by an allowlist grammar** (3.6, rule A10, `source.ts`), type-aware: library calls resolved by the checker to the library module; reads on the callback's own parameters; literal-typed constants (`const NOW = Date.now()` is `number`, so rejected); `new Date(<literal>)` and pure `Math` over literals (the two false positives are gone); same-file helpers whose parameters are recorded or primitive and whose body meets the grammar. **Factories:** decided that a factory's parameters may be used when their type is a string, number or boolean (fixed before recording, cannot be a recorded value); Date and object parameters may not; a factory branches outside its callbacks (9.5). Root `input`/`record` proxies are branded in the types, and `has`, `ownKeys`, `getOwnPropertyDescriptor` and `toJSON` traps make spread, `in`, `Object.keys` and `JSON.stringify` construction errors. Checks: 21 of the 22 holes in `holes.ts` are errors; the one left, `e22` (`String(Date.now())` inside a field function), is not a recorded position and is the development double call's job, which cannot see two clock reads in one millisecond (stated). |
| 5 | Field functions: (a) `beneath` should be `DeepReadonly` and frozen in development, since mutation corrupts the base and compounds on replay; (b) a development double call should flag impurity. | (a) `DeepReadonly` in the type (`m.labels.push` is a type error, in `types.ts` and `mail.ts`). **Deviation:** instead of freezing, development calls the function on fresh copies and compares each copy with the record beneath, because a write to a frozen object throws a `TypeError` that looks like a missing nested field and would be skipped by A9 (9.7). (b) Each function is called twice per replay; two results or a changed copy is a defect. Checks: `Math.random` and `labels.push` are defects. Stated: field functions must be pure and deterministic. |
| 6 | The sealed-session error was swallowed by A9's skip. | **Fixed.** `RecordingError` and `FlowDefect` (mutation, two results) are defects: reported in `defects`, never `skipped`. Ordinary failures still skip. Stated: the seal cannot catch a captured proxy used only for truthiness; with the grammar, any use of the `.predicts` parameters inside a field function is a `closure` error. |
| 7 | Absent-input defaults: `eq(record.archived, input.includeArchived)` dropped for an absent input while the server filters `archived = false`. | **Fixed.** An answer's input is decoded through the operation's input Schema first (`decodeInput`; the spike's operation lists its defaults), so a declared default fills an absent field; only an optional input without a default drops (rule A3, 3.1). Checks: kanban archiving misses the refetch without decoding and repairs with it; `mineOnly` default false keeps a reassigned card; `mineOnly: true` repairs. The mail probe's `unreadOnly` has no default and needs none. |

## Medium

| Finding | Done |
| --- | --- |
| The `serverMatches` field list is a claim; a wrong list misses repairs (docs: `visibility → private`). | Kept, documented as a claim like `.alsoChanges` (3.3, ED 2.4 amendment), checked only by audit mode and `propertyTest`; the lint emits an info `claim` finding at each field list. Checks: the docs case does not repair (the claim at work); the fieldless form does. |
| Tenant factories: duplicate domain id, entity id or an operation in two domains must be construction errors; a constant entity id in a factory merges tenants. | `app()` makes all three `InvalidConfiguration` (rule A12, 3.8, EDP amendment). Found: two tenants that share operations are an error under EDP's one-domain rule, so a factory parameterises its operations too, or the tenant goes in one domain's keys (9.6). A constant entity id inside a factory called twice is caught as two entity objects with one id. |
| `derivedFrom` fields and `.where` state one dependency twice. | Derived, not linted: a derived answer's fields are its declared fields plus its condition's (ED:128-129 already says condition fields always repair); the classifier takes the union, so they cannot disagree. Check: the mail unread count repairs on `folder` and `read`, not `subject`. |
| Error messages should name both types in `eq` and drop the `__flowError` noise. | `Msg<S>` is now a type whose required property *is* the sentence, so the compiler prints "Property '<sentence>' is missing"; `eq` adds `left` and `right` types (messages below). |
| Stale or vacuous spike checks: (b)'s inline re-implementation of revision 1's rule; j2's "unread fields never repair" ignores ED 2.3's other reasons; "Rule A6" should be A9. | The inline revision-1 check is removed (the counterexample is described in 3.3). The unread-field claim is restricted to membership, and ED 2.3's ordered, ranked and derived reasons are modelled (`impact`) and checked. The label is A9. |
| The `extras.ts` comment "never overlaps" contradicted the table. | Now "maybe on its end term". |

## Low

| Finding | Done |
| --- | --- |
| `keyText` depended on key order | canonical, sorted keys; check: `{ b, a }` and `{ a, b }` are one queue |
| Precedence when both sides are maybe | failed, then not carried, then server, inside `and`/`or` too; check: argument order does not change the cause |
| The sealed message should name the callback kind | "input was read after its `.predicts` callback returned" (each recorded method names itself) |
| `.each` never mentioned | 3.7: each copy's subscription is its own answer; nothing else connects them |
| A `many` write falls to lane `{}` | 3.4: one lane for the whole transaction, so `reject`/`latest` act per transaction; a cost, not a correctness problem |

## Rules after review 3

Revision 2's A1–A11 become A1–A12: A3 gains Schema decoding; A5 gains existence, paths, precedence and ED 2.3's
other reasons; A7 gains canonical keys and enumeration traps; A8 gains purity and the double call; A9 becomes per
record, with defects; A10 becomes the allowlist grammar; A12 (identities) is new.

## Type error messages (TS 7.0.2)

| Stated reason | Message |
| --- | --- |
| ordering a string | Property 'gt, gte, lt, lte, between and overlaps order numbers and Dates; a string's order is the server's collation: use serverMatches' is missing in type 'Expr<string>' |
| a wrong constant | `"archived"` not assignable to `Msg<"eq compares two values of one type"> & { left: TicketStatus; right: "archived" }` |
| a Date against a string | the same, with `left: Date; right: "2026-01-01"` |
| `isNull` on a non-null field | Property 'isNull needs a nullable field' is missing in type 'Expr<string>' |
| mutating the record beneath | Property 'push' does not exist on type 'readonly { … }[]' |
| the others | as in review-2.md (a Date against a number, `+`, a sort key, `.where` booleans, a condition as a key, a field function's result and input, a closure, `.predicts` returning a boolean) |
