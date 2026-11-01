# Proposal: statically analysable entity domains (merge 5)

Status: **merged into machine-design.md on 2026-10-30; kept as the record behind it.** It was merge 5 into
[machine-design.md](../../machine-design.md) (section 2.8's predicted-field wording, rules 34 and 35, C18, the Package O1
row, a pointer in section 5, decisions M5-D1–M5-D10; plan: [merge-plan-4-5.md](../../merge-plan-4-5.md)); its rules
A1–A12 are for `references/design/entity-domain.md` section 9. Where this record and the design differ, the design
wins. Its `M4:` citations are line numbers of merge 4 before it was merged; in
[merged/entities.md](../entities.md) they are two lines later.

History: **accepted in full by the owner on 2026-10-31 (section 10, M5-D10); first accepted 2026-10-30; revised twice: after correctness review 1
([reviews/review-1.md](reviews/review-1.md)) and, simplified, after three reviews and the owner's decisions M5-D5 to
M5-D9 ([reviews/review-2.md](reviews/review-2.md)), then hardened against review 3's probes
([reviews/review-3.md](reviews/review-3.md)), review 4's ([reviews/review-4.md](reviews/review-4.md)) and review
5's, the final round ([reviews/review-5.md](reviews/review-5.md)); merges after merge 4.** It answers [brief.md](brief.md). Nothing
here edits a `.plan` file or another merge; section 6 lists the amendments to apply when it merges. The spike in
[spike/](spike/) checks sections 3.1–3.9 (`tsc -p .` with the root `node_modules/.bin/tsc`, then `bun main.ts`;
output in [spike/output.txt](spike/output.txt)).

**What revision 2 removed** (M5-D5 to M5-D7): value expressions (`add`, `sub`, `opaque`, `when`, `coalesce`), the
three phantom flags and the key brand, the source-versus-recording agreement check (`DomainSourceMismatch`,
`unreadable-domain`), four lint rules, fix-it kinds, and the `opaque` Model/runtime split. Rule A12's "counts as
matching" and the restrictions on `or`/`not` became one three-valued evaluator and one join rule (M5-D8). Named
concepts fell from about 40 to about 23 (review-2.md, "Concept count"); the rules from 13 to 11.

**What review 3 added**, all for one invariant, *never miss a needed refetch*: the join has an existence side
(creates, deletes, first sightings) and matches nested paths by prefix; an absent input takes its Schema default
first; settlement is per record; field functions are checked for purity and mutation in development, and author
defects are reported, not skipped; the lint became an allowlist grammar. Rules: 11 to 12.

**What review 4 changed.** The lint finds recorded callbacks by position (receivers, computed names, zero- and
`any`-parameter and named callbacks included). Store records and inputs are frozen in every environment, and a write to
them is a prediction fault; the purity check is a Runtime option, `checkReplays`, on in Stories and `propertyTest`.
Inputs are the Type side (Effect has no `optional` default; defaults are `withDecodingDefaultKey` and apply when an
Encoded input is decoded once). A side of a delta is the store's merged base with the fields it holds. Paths are
segment arrays with arrays atomic; settlement confirms only whole values and is fed by the replay. The ESLint rule
cannot be built as specified: the editor path is an owner item (9.8). Every fix of reviews 3 and 4 is shown by a
spike check that fails when the fix is reverted (`spike/mutations.py`, 20 of 20).

**What review 5 changed.** Carried fields are segment paths (holding `author` as `{ name }` does not carry
`author.userId`); `oneOf` and `contains` check each element; an inverted `between` and a wrong-kind `eq` are maybe; a
recorded callback takes exactly one parameter, with no default or rest anywhere; constants are value facts resolved
through the checker; library calls must return recorded values; frozen Dates, Maps and Sets have throwing mutators;
the caller's objects are copied before freezing; a field function that throws only on its second call is a fault; a
prediction no carrier can confirm whole ends. `mutations.py` now reverts 38 fixes, and every one makes the spike
fail.

Sources and the short names used for citations:

| Short name | File (under `workflow/plans/flow/` unless marked) |
| --- | --- |
| BR | `references/explorations/machine-fragments/merged/entity-analysis/brief.md` |
| PA | `references/explorations/machine-fragments/merged/entity-analysis/prior-art.md` |
| ED | `references/design/entity-domain.md` |
| EDX | `references/design/entity-domain-examples.md` |
| SEA | `references/design/sync-engine-adapter.md` |
| EDP | `EntityDomains.plan` |
| CLP | `CommandLine.plan` |
| INS | `Inspection.plan` |
| M4 | `references/explorations/machine-fragments/merged/entities.md` |
| M6 | `references/explorations/machine-fragments/merged/streams/proposal.md` |
| MT | `references/design/multi-tab.md` (MT 8.1: each tab is its own Runtime and store) |
| DD | `references/dispatch-desk/features/Tickets/ticket.domain.ts` |
| EO | `node_modules/effect/src/Order.ts` (Effect 4.0.5, at the repository root) |
| TSE | TanStack DB `packages/db/src/query/compiler/evaluators.ts` at `main` commit `bea84cd4` (read for this proposal; not in the repository) |
| SPK | `merged/entity-analysis/spike/` |

## 1. The problem

A domain's declarations are recorded by calling each recorded function once, at construction, with recording proxies
(ED:330-345, EDP:49-52). That has five gaps (BR:9-18):

1. **Logic in a recorded position records one branch, silently.** `?:`, `&&`, `||` and `if` are "not detectable by
   the proxy or the types" (ED:477). The spike reproduces each: `a || b` records `a`, `a && b` records `b`, and
   `input.status ? … : …` records the first branch, because a proxy is always truthy. The only guard is a `flow check`
   scan whose shape is unspecified (ED:477, ED:1016).
2. **Runtime functions are opaque** (ED:339, ED:440-445, ED:464-466): predicted field values and `.as` mappings.
3. **Server behaviour cannot be seen** (ED:148-154). Out of scope (BR:20).
4. **Machine and domain are analysed apart** (M4 finding A-L2, M4:892-895; accepted as a display, M4:658).
5. **"Static" constructs the App** (BR:18). **Half wrong:** all of Flow's static analysis loads the App's modules
   (INS:12-13, CLP:31-33, CLP:125-126); only deny codes come from the compiler (INS:158-161). What differs is that a
   domain's construction **calls author callbacks**, while CLP:96-97 says `flow check` runs "without running
   application callbacks". This proposal keeps those calls, has the lint check them, and amends CLP:96-97 (6.4).

Gap 2 is answered by **not** reading runtime functions: nothing reads a predicted value. Joins, repairs, queues and
lane keys read only the entity, the key and the field names (ED:609, M4:614-616), which is the same reason `.as`
stays a runtime function (3.5, M5-D4). Recording keeps capturing structure; the values stay code (M5-D5).

## 2. Where the data comes from

| Fact | Kept in | Written by | When | Read by |
| --- | --- | --- | --- | --- |
| A recorded position's description: conditions, sort keys, places, keys, predicted entities and field names | the App's Model, plain data (INS:15-20, ED:827-832) | recording proxies calling the position once (ED:341-345) | App construction | the runtime's join, response check and order check; `inspect`, `render`, `flow graph`, `flow explain` |
| Whether a key is an array | the Model, `many` on the change | recording, from the operation's input Schema (M5-D9) | App construction | merge 4 rule 34's default lane key; queue joins |
| A predicted field's function, a `.as` mapping, a commit select | the runtime's live description; the Model holds `{ runtime: true }` | the author | — | the runtime only; `flow explain` shows `likes ← <runtime>` |
| A predicted value | a live prediction in the store (EDP:64-65) | the field's function, called with the record beneath and the real input (rule A8) | at write start and at every replay | views, the store |
| An uncomputed predicted value | the store (the record reads `predicted`; the field shows the value beneath); the trace's `prediction` event, `uncomputed` | the store (rule A9) | start or replay | views; settlement, which schedules its confirming read |
| An answer's input | the answer | the machine's input, on the Schema's **Type side**, never decoded again; an Encoded input (hydration, a route parameter, persisted actor input) is decoded once at that boundary, where a decoding default fills a missing key (rule A3) | the answer's creation | the evaluator; its refetch sends the same value |
| The literal default of an input field | the Model | flow check, from `withDecodingDefaultKey(Effect.succeed(<literal>))`; any other default makes the field non-extractable (rule A3) | App construction | `flow explain`; the Encoded-boundary decode |
| A condition's verdict: yes, no or maybe with its cause | not kept; computed per delta | the evaluator (rule A2), over the store's merged base before and after, with the set of fields the store holds for the record; a record that does not exist on one side is a definite no (rule A5) | each join, response check, order check | the join; repair evidence (the `repair` event's existing `matched` field, 6.4) |
| A prediction fault | the trace (`predictionFault`, an Inspection O4 and ED 7.4 event kind) | the store (rule A9) | start or replay | Stories (a Story fails on one), `flow trace summarize` |
| Source and type facts | `flow check`'s memory (and its `--watch` session, 9.8); never saved | one adapter over the TypeScript 7 API, shared with Inspection D2 (rule A10) | each run | the lint; deny codes |
| The machine-to-domain join | `flow explain` and `flow check` output | the CLI, over the Model and the impact classifier (ED:836-838) | each invocation | people and agents |

Nothing here reads server behaviour or a view's selector: neither is in the Model.

## 3. Design

### 3.1 Conditions: one evaluator, three answers

A condition is one expression of parameter reads, constants and these operators. They live in a neutral module,
`Condition` (exported from `flow-state`), not named after domains, so guards could later share the evaluator. One
evaluator runs them all, the one the runtime uses (SPK `flow.ts:285-455`).

**Three answers (Kleene logic, M5-D8).** Every condition answers **yes**, **no** or **maybe**. Maybe has one of three
causes: **not carried** (the record, as the delta holds it, lacks the field; ED:523), **failed** (a value the
operator cannot use: NaN, ±Infinity, an invalid Date, the wrong kind of value), or **server** (the answer depends on
the server: `serverMatches`, the place of `null` in an order, an empty `oneOf` list, a present `null` input, an
absent input outside `and`, a Date tie). `and` is no if any argument is no, yes if all are yes, else maybe; `or` is the
dual; `not` keeps maybe. So the two-valued trap the first review found (`not(lt(x, 5))` true where `gte(x, 5)` is
false at `x = null`) cannot happen: both are maybe, and no type rule is needed for it.

| Operator | yes / no | maybe | An absent optional input (after Schema defaults, A3) |
| --- | --- | --- | --- |
| `eq(a, b)` | strings by code unit, finite numbers by value, booleans, `null` equal to `null` (a constant); a Date never equals a non-Date | not carried; a bad value; a present `null` input; two Dates equal at the millisecond; two values of different kinds (`\"1\"` against `1`, a Date against a number: failed) | drops the leaf (rule A3) |
| `oneOf(a, values)` | some element `eq` `a`; each element is checked like an argument | an empty list; a present `null` input element; a NaN or invalid Date element; as `eq` | drops; an absent input element is dropped at the top, maybe elsewhere |
| `contains(arrayField, v)` | some element `eq` `v` | a field that is not an array, or an element that is NaN or an invalid Date (failed) | drops |
| `gt`, `gte`, `lt`, `lte` | numbers by `Order.Number`, Dates by `Order.Date` (EO:183, EO:650; M5-D2), after the finiteness and validity check | `null` (the server places it); a Date tie; a Date against a number (failed) | drops |
| `between(a, from, to)` | `from ≤ a < to`, numbers and Dates; each bound is its own term | as `gt`; `from > to` (APIs differ, as for `overlaps`) | drops **only its bound**; the other stays (ED:393-394) |
| `overlaps(s, e, from, to)` | `s < to` and `e > from`; a null `s` or `e` affects only its own term | as `gt`; `from > to` (APIs differ: empty, or an error) | drops only its bound |
| `isNull(a)` | `a === null`; a nullable field only (a type error otherwise) | not carried; a held field whose value is absent (the server may omit a null) | — |
| `and`, `or`, `not` | Kleene | — | `and` from the top is the only place an absent input drops a constraint |
| `serverMatches(input, …fields)` | never | always (server), on the fields it names; with none, on every field (ED:144) | — |
| `asc(f)`, `desc(f)` | a sort key; `f` is a record field | a `null`, bad or tied-Date key: the pair is skipped (rule A6) | — |

`serverMatches` is maybe for every record, so it is legal anywhere: under `or` it is conservative (the join repairs
when a field it names changes), under `not` it stays maybe. The restriction revision 1 placed on it is gone.

**Left out.** `when` and `coalesce` (M5-D7): a condition needs neither; an absent input already drops its constraint
under `and`, and an alternative is `or(and(c, a), and(not(c), b))`. Arithmetic: the server may add in base ten where
the client adds doubles, so a computed bound could disagree; compute it in the machine and pass it as an input. From
TanStack DB, which evaluates in JavaScript with SQL's three-valued logic (TSE:303-306, TSE:428-441): `upper`/`lower`
(JavaScript case folding is not a collation, TSE:516-523), `like`/`ilike` (TSE:717-727), `concat`/`length` (UTF-16
length, TSE:526-555), date formatting (time zones, TSE:633-660) and `caseWhen` (truthy numbers, TSE:687-700). String
order is the server's collation (ED:408-409). Each is `serverMatches`.

**Inputs, absence and defaults** (reviews 3 and 4). The evaluator sees an answer's input on its Schema's **Type side**,
as the machine passed it, and never decodes it again (decoding twice is wrong for `Date` or `NumberFromString`).
Effect 4.0.5's `Schema.optional` takes no default (`node_modules/effect/src/Schema.ts:2460`); a default is
`Schema.withDecodingDefaultKey(Effect.succeed(false))` (`Schema.ts:6009`), which makes the key optional on the Encoded
side and **required on the Type side**. So:

- a field with a decoding default is never absent where the evaluator looks: the machine must pass it, and kanban's
  `includeArchived` is `false` unless the machine says otherwise, so archiving a card repairs the column;
- an input that arrives **Encoded** (hydration, a route parameter, a persisted actor's input) is decoded once, at that
  boundary, and the default fills the missing key there;
- only a Type-side optional field with **no default** is absent, and drops its constraint. If the server applies a
  default the Schema does not declare, the domain's claim is wrong and `flow check` cannot see it: the input Schema is
  the contract, as a `serverMatches` field list is (3.3);
- the Model records each default `flow check` can extract statically: `Effect.succeed` of a literal, keyed by its
  **segment path** (an inner default applies only when its parent is present). `Effect.sync(() => …)` is also allowed
  and recorded as `dynamic`; any other Effect (a service, an async step) on a domain read's input is an error. The
  fingerprint covers the Model (INS D3), so it covers the defaults; on version skew (a hydrated answer from a server
  build with other defaults), the answer carries its decoded Type-side input, so no default is applied again;
- a `dynamic` default is decoded once, when the answer is created; the answer keeps the decoded value as its key, so
  its refetch sends the same value;
- a JavaScript caller that omits a key the Type side requires (a defaulted key) gets `InputMissingRequiredKey` when
  the answer is created, instead of the key silently dropping a constraint;
- a decode failure at the boundary makes the answer's condition maybe (server) and reports `InputDecodeFailed`; it is
  never thrown;
- a predicted field's function receives the write's Type-side input, as the machine passed it, not decoded again.

**Carried paths and absent fields.** The store knows which paths it holds whole for each record, as segment paths:
holding `author` as `{ name }` is the path `[author, name]`. A read is **carried** only if a held path is a prefix of it
or equals it, so `record.author.userId` over that record is **not carried** (maybe), never a definite no. A carried
read whose value is absent (an optional field the server left out) is an **absent value**: `eq` is no, order is
maybe, and `isNull` is maybe (a nullable field the server may omit). Inferring "not carried" from `undefined` would
make an absent optional field maybe forever. **Restored records** carry exactly the paths their persisted shapes hold,
and a record whose shape is unknown carries none.

**The null split** (the author review). With `input.assignee` **absent**, `eq(record.assignee, input.assignee)` drops
its constraint: every assignee. With `input.assignee` **present and `null`**, it is **maybe**: some APIs read `null` as
"any", others as "unassigned". An API that means "unassigned" is declared with `isNull(record.assignee)` in a separate
read entry, or by the machine sending a sentinel the API defines.

**Dates.** Dates are compared at millisecond precision, the precision of a JavaScript `Date` and of ISO strings on the
wire. A server may hold finer times, so two Dates equal at the millisecond are **maybe**, for `eq` and for order; a
difference of a millisecond or more is decided.

**Exactness and what the domain still claims** (M5-D1). The client's verdict is exact by this table; whether the
*server* filters that way is the domain's claim. The response check catches a definite contradiction, audit mode an
omission (ED:1027-1028), and `propertyTest` checks every answer against the fixture's own read (ED:998-1004), which is
where a condition the server evaluates differently shows up. A string `eq` is right only where the server compares
exactly; a case-insensitive match is `serverMatches` (DD's search key is already normalised that way,
`ticket.operations.ts:18`).

### 3.2 The conformance table

M5-D3: the evaluator's own test, CEL-style, not a client/server agreement suite. Every row is in `spike/conformance.ts`;
`main.ts` runs each and prints this table, and 67 of 67 give their expected result. Existence (a record that does not
exist on one side) is the join's concern, not a row here: 3.3. `r` is the record, `i` the input.

| operator | written | given | result |
| --- | --- | --- | --- |
| `eq` | `eq(r.s, "a")` | s = "a" | yes |
| `eq` | `eq(r.s, "a")` | s = "A" | no |
| `eq` | `eq(r.n, null)` | n = null | yes |
| `eq` | `eq(r.n, i.x)` | n = "a", x absent | yes |
| `eq` | `eq(r.n, i.x)` | n = null, x = null (present) | maybe: server |
| `eq` | `eq(r.s, "a")` | s not carried | maybe: not carried |
| `eq` | `eq(r.n, 1)` | n = NaN | maybe: failed |
| `eq` | `eq(r.t, i.t)` | equal at the millisecond | maybe: server |
| `eq` | `eq(r.t, i.t)` | a day apart | no |
| `eq` | `eq(r.t, i.t)` | t = invalid Date | maybe: failed |
| `eq` | `eq(r.meta.owner, "ana")` | meta = { owner: "ana" } | yes |
| `eq` | `eq(r.meta.owner, "ana")` | meta not carried | maybe: not carried |
| `eq` | `eq(r.nick, "x")` | nick held by the store, value absent (carried) | no |
| `isNull` | `isNull(r.nick)` | nick held, value absent (the server may mean null) | maybe: server |
| `eq` | `eq(r.author.userId, "u")` | the store holds author as { name } only (path [author, name]) | maybe: not carried |
| `eq` | `eq(r.author.userId, "u")` | author held whole, userId absent | no |
| `eq` | `eq(r.n, 1)` | n = "1" (the wrong kind) | maybe: failed |
| `oneOf` | `oneOf(r.s, [i.a, i.b])` | a = "x", b = null (present) | maybe: server |
| `oneOf` | `oneOf(r.s, [i.a, i.b])` | a = "z", b absent (dropped at the top) | yes |
| `contains` | `contains(r.t, 5)` | t = [NaN] | maybe: failed |
| `between` | `between(r.n, 10, 1)` | from after to, n = 5 | maybe: server |
| `oneOf` | `oneOf(r.s, i.xs)` | s = "b", xs = ["a", "b"] | yes |
| `oneOf` | `oneOf(r.s, i.xs)` | s = "c", xs = ["a", "b"] | no |
| `oneOf` | `oneOf(r.s, i.xs)` | xs = [] | maybe: server |
| `oneOf` | `oneOf(r.s, i.xs)` | xs absent | yes |
| `contains` | `contains(r.tags, "x")` | tags = ["x"] | yes |
| `contains` | `contains(r.tags, "x")` | tags = [] | no |
| `contains` | `contains(r.tags, "x")` | tags = null | maybe: failed |
| `lt` | `lt(r.n, 5)` | n = 3 | yes |
| `gte` | `gte(r.n, 5)` | n = 5 | yes |
| `lte` | `lte(r.n, 5)` | n = 6 | no |
| `lt` | `lt(r.n, 5)` | n = null | maybe: server |
| `not` | `not(lt(r.n, 5))` | n = null (the two-valued trap is gone) | maybe: server |
| `gt` | `gt(r.n, 5)` | n = Infinity | maybe: failed |
| `gt` | `gt(r.n, 5)` | n = {} (bad data) | maybe: failed |
| `lt` | `lt(r.n, i.x)` | x absent | yes |
| `lt` | `lt(r.t, i.t)` | a month earlier | yes |
| `lt` | `lt(r.t, i.t)` | equal at the millisecond | maybe: server |
| `lt` | `lt(r.t, 5)` | a Date against a number | maybe: failed |
| `between` | `between(r.n, 1, 3)` | n = 1 | yes |
| `between` | `between(r.n, 1, 3)` | n = 3 | no |
| `between` | `between(r.n, i.from, i.to)` | from absent, to = 3, n = -100 | yes |
| `between` | `between(r.n, i.from, i.to)` | from absent, to = 3, n = 5 | no |
| `between` | `between(r.n, 1, 3)` | n = null | maybe: server |
| `overlaps` | `overlaps(r.s, r.e, 2, 5)` | [1, 3) | yes |
| `overlaps` | `overlaps(r.s, r.e, 2, 5)` | [1, 2) | no |
| `overlaps` | `overlaps(r.s, r.e, i.from, i.to)` | to absent, from = 2, [10, 11) | yes |
| `overlaps` | `overlaps(r.s, r.e, i.from, i.to)` | to absent, from = 2, [0, 1) | no |
| `overlaps` | `overlaps(r.s, r.e, 2, 5)` | s = 1, e = null | maybe: server |
| `overlaps` | `overlaps(r.s, r.e, 2, 5)` | s = 6, e = null (the start term decides) | no |
| `overlaps` | `overlaps(r.s, r.e, i.from, i.to)` | e = null, from absent, s = 1, to = 5 | yes |
| `overlaps` | `overlaps(r.s, r.e, 5, 2)` | from after to | maybe: server |
| `isNull` | `isNull(r.a)` | a = null | yes |
| `isNull` | `isNull(r.a)` | a = "x" | no |
| `isNull` | `isNull(r.a)` | a not carried | maybe: not carried |
| `not` | `not(isNull(r.a))` | a not carried | maybe: not carried |
| `not` | `not(eq(r.s, "a"))` | s = "b" | yes |
| `or` | `or(isNull(r.a), eq(r.a, i.me))` | a = null | yes |
| `or` | `or(isNull(r.a), eq(r.a, i.me))` | a = "bo", me = "ana" | no |
| `or` | `or(eq(r.team, i.t), eq(r.status, "open"))` | team not carried, status = "open" | yes |
| `or` | `or(eq(r.team, i.t), eq(r.status, "open"))` | team not carried, status = "closed" | maybe: not carried |
| `or` | `or(eq(r.s, i.s), isNull(r.a))` | s absent (outside `and`), a = "x" | maybe: server |
| `and` | `and(eq(r.w, i.w), serverMatches(i.q, r.title))` | w equal | maybe: server |
| `and` | `and(eq(r.w, i.w), serverMatches(i.q, r.title))` | w differs | no |
| `or` | `or(eq(r.a, i.me), serverMatches(i.q, r.title))` | a = me | yes |
| `or` | `or(eq(r.a, i.me), serverMatches(i.q, r.title))` | a = someone else | maybe: server |
| `not` | `not(serverMatches(i.q, r.title))` | any record | maybe: server |

### 3.3 The join rule

A delta's two sides are **the store's merged base** for the record before and after the change (not the delta's own
fields), each with **the set of fields the store holds**. Either side may be **none**: before a create, after a delete.
For each answer the join asks whether the record is in the condition on each side (rule A5, SPK `membership`, `joins`):

- a side that is **none** is a definite **no**;
- a record the client sees for the first time is **no** before, for a list (every record an active list holds is
  held, ED:523-524), and **maybe** before, for a derived answer (it may have counted; ED:525-526). "First time" is
  **per Runtime**: each tab's store sees a record for the first time on its own (multiplicity audit, MT 8.1);
- otherwise the condition is evaluated over the merged base and the held fields (yes, no or maybe).

> **An answer repairs when the record's existence changed, or a path its condition reads changed, unless the
> condition gives the same definite answer before and after.**

**Paths** are segment arrays (`["meta", "owner"]`), not dotted strings, so a field named `a.b` is not the path `[a, b]`.
Two paths match when one is a prefix of the other: a read of `[meta, owner]` matches a change to `[meta]` (the object
was replaced) and to `[meta, owner, id]`; `[metadata]` is not `[meta]`. **Arrays are atomic**: a read through an index
(`record.tags[0]`) reads `[tags]`, and a change anywhere inside an array is the array's path, so an insert at the
front cannot slip past a condition on the first element.

The repair carries its reason in the `repair` event's existing `matched` field (ED:907): `entered` or `left` for a
definite change, or the maybe's cause (`notCarried`, `failed`, `server`). When both sides are maybe, the cause follows a
fixed precedence (failed, then not carried, then server), so it does not depend on argument order.

**The counterexample, under merged bases.** With `or(eq(record.team, input.t), eq(record.status, "open"))`, a store that
has never held `team` for the record (its list shape omits it), and a change of `status` from open to closed: before is
yes (status open), after is maybe (team not carried), `status` is read and changed, and yes then maybe is not the same
definite answer, so the answer repairs (`notCarried`). Revision 1 read true then true and missed it. Had the store held
`team`, the merged base would carry it and the verdict would be definite.

**Existence.** A create into "all issues" (an absent `projectId`, so every leaf drops) is none then yes: `entered`. A
delete is yes then none: `left`. A list with no `.where` repairs on every create and delete and on no update. A first
sighting refetches a derived answer once (ED:525-526).

**Bounded.** A change to a path the condition does not read never changes membership, even when both sides are maybe
(a `serverMatches` list is not refetched when an unnamed field changes), and two definite equal answers never repair.

**Membership is one of ED 2.3's reasons.** For a record in the answer (yes or maybe on either side), section 2.3's
other reasons still apply: an order field of an ordered list, any field of a server-ranked list except `unaffectedBy`,
and a derived answer's fields, which are **its declared fields plus the paths its condition reads** (ED:128-129), so
`.derivedFrom` and `.where` cannot disagree (SPK `impact`).

**The `serverMatches` field list is a claim**, like `.alsoChanges`: `serverMatches(input.viewer, record.acl)` says the
server's match reads only `acl`, so making a document private (`visibility`) does not repair that list. If the server
also reads `visibility`, the declaration is wrong and repairs are missed (ED:148-154); audit mode and `propertyTest`
are the only checks, and `flow check` says so with an info finding wherever a field list is given.

### 3.4 Predicted values are runtime functions

A predicted field is a recorded read or constant (`liked: input.liked`, `status: "assigned"`), or a **function of the
record beneath and the input** (M5-D5). Recording captures the entity, the key and the field names; the function is
called with the real input at write start and again at every replay.

```ts
// merge 4's Issues.setLike (M4:128-131), ported. One line changes: the input is a parameter.
setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, {
  liked: input.liked,                                                                   // a recorded read
  likes: (i, input) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),   // ← NEW: (beneath, input)
})),
// entity-domain-examples' transfer (EDX:98-101) and reaction (EDX:50-55): ordinary functions.
Account.patch(input.from, { balance: (a, input) => a.balance - input.amount }),
Message.patch(input.key, { reactions: (m, input) => addReaction(m.reactions, input.emoji) }),
// A bulk write (EDX:185): the input Schema says keys is an array.
archive: write(archiveUsers).predicts(({ input }) => User.patch(input.keys, { status: "archived" })),
```

- **"`.predicts` runs twice" ends** (ED:440-445, ED:1172-1174, EDP:51-52): the callback runs once, for structure.
- **The function is typed** by the record beneath and the write's input (the input type is inferred from where the
  change is returned; SPK `types.ts`). Naming the second parameter `input` shadows the recording one.
- **Field functions must be pure and deterministic, and must not write to their arguments.** The record beneath and
  the input are **deeply frozen in every environment**: store records, like snapshots, are frozen plain data
  (Machines O8), and the input is the request body. A write to either throws a `TypeError` in strict code (and is a
  no-op in sloppy JavaScript, so the base is never corrupted). Freezing does not stop a `Date`'s `set*` or a `Map`'s
  or `Set`'s mutators, so before freezing the store gives Dates, Maps and Sets own mutator methods that throw, a
  fault even for a write that changes nothing; `DeepReadonly` types a Date as its getters only and Maps and Sets as
  `ReadonlyMap` and `ReadonlySet`. `ArrayBuffer` views (`Uint8Array`) cannot be frozen and are left as they are;
  freezing never throws out of a replay or a view, and never fails a write's start. The caller's objects are copied
  before they are frozen: a shared input object, or a module array a function returns, is never frozen in place.
  Private class fields (`#n`) are outside freezing; a method that changes one is not detected. The store classifies a `TypeError` by calling the
  function again on unfrozen copies (made through the entity's and the input's Schemas, so `Schema.Class`, `Option`,
  `Data`, `Map`, `Set`, `Date` and `bigint` survive): if a copy changed, the function wrote to it, a **prediction
  fault**; otherwise the `TypeError` (a missing nested field) is an ordinary failure, uncomputed. A copy that cannot be
  made is a fault too. This replaces revision 3's development-only copies (9.7).
- **`checkReplays`** is a Runtime option, like audit mode: when on, each field function is called twice per replay,
  each call with its own outcome, and two different outcomes (a value and a throw, or two results that differ
  structurally (compared by a total canonical form: `bigint`, `Map`, `Set`, `NaN`, cycles and
  prototypes included)) are a fault. It is **on by default in Stories and `propertyTest`**, where replays are
  exercised, and off in production. It cannot see a cached clock read (the same value twice); settlement corrects
  such a value, and review must catch it.
- **A field's function is called only over a record the store holds** (multiplicity audit F12; merge 4 rule 30 as
  revised, E18). A patch over an absent record (never held, or deleted beneath it) shows nothing, stays with its
  Attempt for its queue and settlement, and is called when a base arrives. Existence is explicit (design rule N3): a
  record read of such a record is `undefined`, never a default.
- **The recording `input` is sealed** after its callback returns, and enumerating it (a spread, `in`, `Object.keys`,
  `JSON.stringify`) is a construction error. A function that closed over it fails on its first read with "input was
  read after its `.predicts` callback returned: a predicted field's function receives the input as its second
  parameter", a prediction fault. A captured proxy used only for its truthiness cannot be trapped by a proxy; the lint
  makes any use of the callback's parameters inside a field function an error (3.6).
- **Keys** are recorded reads and constants. An **array key** (the input Schema says the path is an array) is recorded
  as `many` (M5-D9): it is read at start, predicts each listed record once, joins each queue once, and **never takes
  merge 4 rule 34's default lane key**, even with one element (M4:614-616: "exactly one record"). It keeps its
  declared key or `{}`; with `{}` every start of that transaction shares one lane in the actor, so `reject` and
  `latest` act on the whole transaction, not per record (a cost, not a correctness problem). An empty array predicts nothing. Its length is bounded by the record queues: each listed record joins its queue
  (at most 64 waiting, merge 4 rule 35), and a write past any bound ends `NotSent { why: "Overloaded" }` with no
  partial join; the array itself is bounded by the codec's 4,096 items (INS O2), an owner item (9.11). Under design
  rule N2, `retry` and a lane row's `retryCount` and `progress` exist only where the lane has one addressable Attempt
  (`reject`, `latest`, `cancel`); with `allow` or `serialize` they are type errors, so a bulk write that must be
  retried declares a per-call key (a batch id) and `reject`. Keys are
  decoded through the entity's primary-key Schema (`"12"` and `12` are one record when the key is a number) and
  compared by a total canonical form, computed once per live prediction (a bulk write is not O(K²) across replays), so `{ a, b }` and `{ b, a }` are one record and a `bigint` or circular key
  cannot crash a replay.
- **Settlement is per record and fed by the replay** (rule A9): every prediction is kept per (entity, key, field), and
  settlement takes the slots the replay reports, shown, uncomputed or faulted. A response confirms a field only on the
  records it carries, and only if it carries that field's **whole value**: a response holding `meta.color` alone
  confirms neither `meta` nor `meta.owner`. A carrier counts only if its shape holds the whole predicted path; if no
  carrier does, the prediction ends at settlement (the no-carrier rule, EDP:99-100) and `PredictionNotRetained`
  fires, and a confirming read that still does not confirm the field ends it too: a bound, never a loop. A restored
  write's Encoded input is decoded once; a decode failure drops its prediction and forces the repair. Each predicted field it does not confirm is unconfirmed and gets its
  confirming read; a confirmed field retires older predictions of that field **on that record only** (ED:511-513). A transfer whose response carries only account A leaves B's balance unconfirmed, and A's confirmation
  does not retire an older prediction on B; a bulk `many` write whose response carries some users leaves the rest
  unconfirmed. Revision 2 keyed this by field name across records and silently dropped B.
- **Replay** (rule A8, ED:507-510): live predictions apply in start order, a write's patches in written order, every
  field of one patch over the same record beneath. The spike runs merge 4's like scenario (base `liked false, likes 5`;
  like A `6`; unlike B behind it `5`; a push to `liked true, likes 9` replays to `liked false, likes 8`; A retracted,
  still `8`), settlement and retirement (ED:511-513), a transfer over a pushed base, a delete, two patches to one
  record (`5 → 6 → 7`) and array keys.
- **A value that cannot be computed for this record is uncomputed** (rule A9, M5-D4; revision 3 said "skipped", which
  collides with the `skip` event): the function throws, or returns a value the field's Schema rejects (the spike's
  `likes` over a record without `likes` gives NaN). A **prediction fault** (a sealed read, a write to a frozen
  argument, two results, an uncopyable value; named so as not to collide with merge 4's `Defect` reason) behaves the
  same for display and settlement, and is also reported as a `predictionFault` trace event (Inspection O4, ED 7.4),
  on which a Story fails. Neither is ever thrown out of a replay or a view. The record read's `predicted` stays per
  record (merge 4, E16); per field, an uncomputed field shows the value beneath and, after settlement, is listed in
  `unconfirmed`. ED 8.2's C5 ("every displayed unconfirmed value is a live prediction") gains "or the value beneath an
  uncomputed one". The field keeps the value beneath and
  still reads `predicted`; the other fields go on; the write is still sent; and at settlement the field counts as
  predicted, so if the response omits it a confirming read is scheduled (EDP:92-100, ED:613-630). Without that last
  step an uncomputed field would never be confirmed and could stay stale.
- **Inspection** (fix 7): a function body is not in the Model, so it is not in the fingerprint (INS D3 covers the
  Model), exactly as `.as` mappings and selects are not. Revision 1's problem of fingerprinting `opaque` bodies goes
  with `opaque`; nothing replaces it.

### 3.5 `.as` mappings stay runtime functions

```ts
// DD:81-88: unchanged. A runtime position, shown as a runtime mapping (ED:853).
events: listen(ticketEvents).as([Ticket], (event) =>
  event._tag === "TicketSaved" ? Ticket.save(event.ticket) : Ticket.delete({ … }, { version: event.revision })),
```

The join reads the delta a mapping produced (ED:502), never the mapping, and its result is checked against the listed
entities (ED:464-466, ED:1021). M5-D4 keeps it a function; the lint does not look inside runtime functions.

### 3.6 The lint: an allowlist grammar

A proxy cannot see truthiness, so `?:`, `if`, `&&`, `||` and `typeof` on a recorded value always record one branch, a
missed-refetch class; **only the source can be sound**. Revision 2's lint was a denylist and review 3's probes found
22 ways past it (`if`, `switch`, `typeof`, `in`, spreads, `JSON.stringify`, `any` and generic helper
parameters, `as any`, nested arrows, imported or aliased clocks, consts computed at load). So `flow check`, and an editor host (9.8), check a **grammar** instead (rule A10, SPK `source.ts`):

> **A recorded callback's body is one expression made only of library operator calls; property reads on the
> callback's own parameters; literals, `new Date(<literal>)` and pure `Math` functions over literals; identifiers and
> property reads whose type is a literal (a module `const`, an `as const` member, an enum member); reads of an
> enclosing factory's parameters whose type is a string, number or boolean; calls to a same-file helper whose
> parameters are recorded values or primitives and whose body meets the grammar; and parentheses, `as`, `!`,
> `satisfies`, arrays and objects of these, without spreads.** Anything else is an error, "not a recorded expression:
> …".

- **Found by position** (review 4). A recorded callback is any function passed to a library recorded position
  (`.where`, `.orderBy`, `.byKey`, `.pagedBy`, a place, `.derivedFrom`, `.predicts`), whatever its own parameter types:
  a zero-parameter callback (`.where(() => Date.now() % 2 ? a : b)`) and one with an `any` parameter passed by name
  (`.where(w)`) are checked like any other. A callback passed by a name the lint cannot follow (an import) is an error:
  write it inline or as a `const` in the same file. A block body is allowed only as a single `return`.
- **Receivers and names are part of the expression.** A library call's receiver is checked
  (`(input.x ? Card : Card2).patch(…)` is an error), and a computed property name (`{ [input.x ? "a" : "b"]: v }`) is
  an error.
- **Parameters.** A recorded callback takes exactly one parameter; no parameter of a callback or a helper has a default
  or a rest element anywhere in its binding tree (`({ record }, now = Date.now()) => …` would record a stale constant).
- **Constants are value facts, not only type facts.** An identifier or property read counts as a constant only if its
  type is a literal **and** the checker resolves it (`getSymbolAtLocation`, through aliases) to a single, non-ambient
  `const` whose initializer is itself a literal, an enum member with a literal (or no) initializer, or a property of a
  literal object. `const NOW = Date.now() as 1`, `declare const BUILD: "prod"`, a getter and a computed enum member
  are not; `let`, `var` and names passed by text are not followed, and a callback passed by name is followed only to
  a single same-file `const` the checker resolves it to (a parameter that shadows it is an error).
- **Library results.** A library call must return a recorded value, a sort key or a change: `contradicts(…)` and
  `canonical(…)` are declared in the library but return plain values, so they are errors; an optional call (`eq?.(…)`)
  is an error.
- **Type-aware.** Library operators are recognised by the checker resolving them to the library module (through
  imports, aliases, namespaces and re-exports); recorded callbacks by their parameter's type; literal constants by
  their literal type. `const NOW = Date.now()` has type `number`, so it is not a constant; an `any` or generic helper
  parameter is neither recorded nor primitive, so it is an error.
- **Predicted fields.** A field's value is in the grammar, or a runtime function; a runtime function may not use the
  `.predicts` callback's parameters (rule "closure"). Its body is otherwise not linted: purity there is the
  `checkReplays`' job (3.4), which is the one probe of review 3 the lint does not catch (`e22`,
  `String(Date.now())` inside a field function).
- **Factories** (decided here, not by the owner; 9.5). A factory's recorded callbacks meet the grammar like any
  others. A factory's **parameters** may be used as values when their type is a string, number or boolean (a tenant id,
  a flag's value), because the value is fixed when the factory runs, before recording, so recording sees one value and
  records it as a constant, and a primitive cannot be a recorded value. A Date or object parameter is not allowed (a
  time passed in is stale). A factory **branches outside** its callbacks: `opts.strict ? eq(…) : eq(…)` inside one is an
  error, and the fix is `.where(opts.strict ? (c) => … : (c) => …)`, choosing the callback.
- **No false positives on pure constants.** `new Date("2024-01-01T00:00:00Z")` and `Math.max(1, 2)` are allowed. Known
  limits, stated: prefix `!` is always an error in a recorded expression (`not(…)` is the operator); a same-file
  `function` declaration is not followed as a helper (write `const f = (…) => …`).
- **Sources.** The lint reads the project's TypeScript program (its `tsconfig`, named by a new `tsconfig` field of
  `defineConfig`, CommandLine O6), not a file list. It ignores disable comments, and a file it cannot analyse
  (JavaScript, or `@ts-nocheck`) that holds recorded positions is an error, not a pass.
- **Fix-its are code only when they type-check**: `&&` and `||` over conditions become `and(…)` and `or(…)`, `===` over
  two recorded values `eq(…)`, `!` over a condition `not(…)`; everything else gets an instruction (`?:`: "write
  or(and(…), and(…)), make two read entries, choose the callback outside it, or use serverMatches"). The spike compiles
  its two code fix-its in `types.ts` and checks the lint's text is identical.
- **Claims.** Every `serverMatches` with a field list gets an info finding saying the list is a claim (3.3).

The spike lints the reference domains, extras, variants and review 3's kanban, docs, mail, calendar, tenant and
holes files: no errors on the correct ones; 23 of the 24 holes (review 3's 22 and review 4's `e24`, `e25`) are errors,
all but `e22`; 26 of review 5's 30 probes are errors, the other four being correct; `new Date()`, `new
Date(NOW)` and the `startOfToday()` helper are errors; the tenant factory's `?:` and `??` are errors and its `tenant`
parameter is not.

```text
$ flow check
domains/legacy.ts:15 error closure       a predicted field's function uses `input` from its `.predicts` callback
    instruction: a predicted field's function receives the input as its second parameter, (beneath, input) => …
domains/legacy.ts:23 error not-recorded  `eq(record.status, "open") || eq(record.assignee, input.assignee)`
    fix-it: or(eq(record.status, "open"), eq(record.assignee, input.assignee))
domains/holes.ts:20  error not-recorded  a block (`if`, `switch`, statements): a recorded callback is one expression
domains/cal.ts:17    error not-recorded  `new Date(NOW)` runs once, at construction (a Date constant is new Date("…literal…"))
domains/docs.ts:10   info  claim         `serverMatches(input.viewer, record.acl)` claims the server's match reads only these fields
```

**Type errors name the cause and the fix.** A sentence is a missing property, so the compiler prints it without noise:
`gt(record.title, "m")` reports "Property 'gt, gte, lt, lte, between and overlaps order numbers and Dates; a string's
order is the server's collation: use serverMatches' is missing"; `eq(record.status, "archived")` reports "eq compares
two values of one type" with `left: TicketStatus` and `right: "archived"`; `isNull(record.title)` reports "isNull needs
a nullable field" (SPK `types.ts`; review-3.md lists the messages).

**One layer of source and type facts** (M5-D6). Inspection D2 already reads deny codes from types and fails closed
with `TypeFactsUnavailable` (INS:158-161). The lint uses the same adapter, and fails the same way: a file the facts do
not cover is an error, never a pass. The adapter talks to TypeScript 7 through `typescript/unstable/async` (7.0.2; the
`unstable/sync` client needs Node's stream internals and fails under bun), an API its name marks as unstable; one
module is the only code that imports it, the CLI pins the TypeScript version, and an API change fails closed.

**The editor path** (review 4; 9.8). M5-D6 said the lint would also ship as an ESLint rule. That cannot be built as
specified: an ESLint rule runs synchronously, the pinned reader is asynchronous only, and typescript-eslint's type
information comes from the older JavaScript compiler API, not TypeScript 7. Three honest paths:

| Path | How | Cost |
| --- | --- | --- |
| `flow check --watch` | the CLI keeps one compiler session, re-lints changed files, and prints findings; editors show them through a problem matcher or the terminal | no in-editor squiggles without an extension; one more process |
| a TypeScript language-service plugin | tsserver plugins get synchronous access to the program and checker inside the editor's own TypeScript, and report diagnostics as squiggles | tied to the editor's TypeScript version, which may differ from the pinned one; TypeScript 7's plugin API is not yet settled |
| a named bridge | an ESLint rule that blocks on a synchronous channel to a resident `flow check` process | a second protocol to keep alive, and ESLint's caching assumptions break |

*Recommendation:* `flow check --watch` as the supported path now, because it reuses the one adapter unchanged and
fails closed; a language-service plugin later, once TypeScript 7's plugin API is stable, using the same lint module.
No ESLint rule. This changes M5-D6, so it is the owner's decision.

### 3.7 The machine and the domain, joined

`flow explain` for a machine event (CLP:22-25) and `flow check` follow a commit to the domain entry its operation is
registered in (ED:33-35), through the recorded `.predicts` and `.alsoChanges` to every read on that entity, classified
by the runtime's impact classifier (ED:836-838), and to the activities that subscribe those reads.

```text
$ flow explain Issues/List READY Toggle
Toggle      READY → READY; updateMemory likeUnsure; commits Issues.setLike (select: <runtime>)
  setLike   writes one Issue; one at a time per record; lane key input.key (rule 34); latest: one addressable Attempt per lane (retry exists, N2)
    at start  liked ← input.liked; likes ← <runtime>
    repairs   Issues.list: may, through the response (.one(Issue) can reveal a changed projectId or number); not through liked, likes
    retained  by the write's own response (.one(Issue)) and Issues.list
    shown in  Issues.list, subscribed by Issues/List READY.activities.issues
  endings   success → Settled; failure.Gone → IssueGone, Refused | NotSent → Failed; unknown → LikeUnsure
```

- **Computed from the Model alone**, with the action-to-operation edge added to INS O1 (6.4). No machine callback,
  adapter or Layer runs.
- **The lane's cardinality** comes from the transaction's `concurrency` (design rule 21, D18–D20): "one addressable
  Attempt per lane" under `reject`, `latest` and `cancel`, where `retry` and the `s.calls` row's `retryCount` and
  `progress` exist; "outstanding count only" under `allow` and `serialize`. The line also prints the lane key, so an
  agent sees whether `retry` exists before writing it.
- **A field-level, conservative mode.** Static explain has no record and no input, so it asks, per answer, whether any
  path the write can change touches what the answer depends on (its condition's paths, order fields, a derived
  answer's fields, any field of a ranked list). The write can change its predicted fields, **every field of the record
  shapes its response carries** (a response can reveal any of them) and its `.alsoChanges` targets. It prints "no" only
  when none touches (SPK `mayRepair`).
- **`.each` copies** subscribe like any activity: each copy's subscription is its own answer with its own input, and
  the join treats it like any other answer. Nothing else connects them.
- **Where it stops.** At subscribing activities and at `listen` entries (M6), which are sources of deltas, not
  readers. Views (`useView`, `Issue.get` in a component, M4:306-309) are not in the Model, so "the views that read
  them" (BR:36) cannot be joined.
- **`PredictionNotRetained`** (a warning). A predicted field with no carrier is dropped at settlement unless the
  response carries it (EDP:99-100): it shows while the write is in flight, then disappears until a reader fetches it.
  Carriers (EDP:15-16, "an active answer or loader whose shape holds a field"): the write's own response places, every
  read entry and every `.byKey` loader on the entity, across the complete declared graph, lazy entries included
  (CLP:96). A carrier counts only if its shape holds the **whole** predicted path. A `listen` entry is not a carrier
  under EDP:15-16 and EDP:99-100 (review 4 corrected revision 3). It is issued only for a complete graph; a failed lazy entry already fails the load
  (CLP:108-109).

### 3.8 One App: identities and factories

A domain factory is allowed (M5-D6), so the identity rules are errors for factories as for literal domains, **at App
construction or lazy adoption** (EDP:21-25, LazyFeatures O2; SPK `app`): two domains with one id, two entity objects
with one id, or one operation registered twice, in two domains or (9.10) in two entries of one domain, is
`InvalidConfiguration`. A factory therefore parameterises everything it creates (`entity({ id: tenant + "/Card" })`,
`domain(tenant + "-kanban", …)`) and its operations, because an operation belongs to one entry. The spike shows the
consequence for review 3's tenant factory: two tenants sharing operations is an error. The alternative is one domain
whose keys carry the tenant (`primaryKey: ["tenantId", "id"]`), as dispatch-desk's tickets carry `workspaceId`. A
constant entity id inside a factory called twice is caught as two entity objects with one id, so records never merge
across tenants silently.

### 3.9 Migration, line by line

| Domain | Line | Before | After |
| --- | --- | --- | --- |
| dispatch-desk tickets (DD) | all | conditions, order, paging, predictions of inputs and constants, `.as` | unchanged |
| merge 4 `Issues` (M4:130) | 127 | `likes: (i) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),` | `likes: (i, input) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),` |
| entity-domain-examples (EDX) | 53 | `reactions: (m) => addReaction(m.reactions, input.emoji),` | `reactions: (m, input) => addReaction(m.reactions, input.emoji),` |
| | 99-100 | `balance: (a) => a.balance - input.amount` / `+` | `balance: (a, input) => a.balance - input.amount` / `+` |
| | 185 | `User.patch(input.keys, …)` | unchanged; recorded as `many`, never rule 34's default |
| ED notes app, EDX `.as` | — | `.as` with `?:` | unchanged |

The only change anywhere is that a predicted value's function takes the input as its second parameter. Re-checked against merge 4 after the multiplicity audit: its `createIssue` is now `reject` and
`CreateFailed.draftId` is no longer nullable (E17); neither touches a domain declaration, so this still holds.

## 4. Rules

Numbered A1–A12, for `entity-domain.md` section 9. Earlier revisions' rules are mapped in review-2.md, review-3.md
and review-4.md.

- **A1. Recorded and runtime positions.** Recorded: conditions, sort keys, places, keys, paging, derived fields, and
  predicted fields written as a read or a constant. Runtime: a predicted field's function, a `.as` mapping, a select.
  The Model holds the first as data and marks the second `runtime`.
- **A2. Conditions are three-valued.** Every condition operator answers yes, no or maybe over decoded values, by
  table 3.1 and the conformance table (3.2); `and`, `or`, `not` are Kleene. Maybe has a cause: not carried, failed or
  server. Carried means a held segment path is a prefix of the read; a held field with an absent value is a value, not
  "not carried". Each `oneOf` and `contains` element is checked; values of two kinds, and an inverted `between` or
  `overlaps`, are maybe. No arithmetic, string order or
  string transform appears in a condition; those are `serverMatches`.
- **A3. Inputs are the Type side; an absent one drops a constraint only directly under `and`.** The evaluator sees an
  answer's input as the machine passed it, never decoded again; an Encoded input is decoded once at its boundary,
  where a decoding default (`withDecodingDefaultKey(Effect.succeed(<literal>))`, recorded in the Model) fills a
  missing key, and a failure makes the answer maybe with `InputDecodeFailed`. A Type-side optional field with no
  default, when absent, drops the constraint of a comparison leaf directly under `and` (or as the whole condition), and
  only its own bound for `between` and `overlaps`; elsewhere it is maybe. An `and` nested in an `and` from the root
  still drops; an `and` under `or` or `not` does not. An absent `oneOf` element drops the same way. A present `null`
  input is maybe. (Amends ED:391-395, EDP:32-33.)
- **A4. Order is Effect's.** Ordering operators and the order check compare numbers with `Order.Number` after a
  finiteness check and Dates with `Order.Date` after a validity check (M5-D2), at millisecond precision; `null` and a
  Date tie are maybe; ordering a string is a type error with a sentence.
- **A5. The join rule.** Each side of a delta is the store's merged base with the fields it holds, or none. A side that
  does not exist is a definite no; a first sighting (per Runtime) is no for a list and maybe for a derived answer. An
  answer repairs when the record's existence changed, or a path its condition reads changed, unless the condition
  gives the same definite answer before and after. Paths are segment arrays matched by prefix in either direction,
  arrays atomic; a fieldless `serverMatches` reads every field. When both sides are maybe the cause follows the
  precedence failed, not carried, server; it goes in the `repair` event's `matched` field. For a record in the answer
  (yes or maybe), ED 2.3's other reasons also apply, a derived answer's fields being its declared fields plus its
  condition's.
- **A6. The response check and the order check.** A returned record contradicts its condition only when the answer is
  no. A response pair whose sort key is maybe for the client (null, bad, a Date tie) is skipped, never `HiddenOrder`
  (M5-D4).
- **A7. A write's structure is recorded; its values are code.** `.predicts` runs once, for the entity, the key and the
  field names. A key is recorded reads and constants, decoded through the primary key's Schema and compared by a total
  canonical form (cached per live prediction). An array key is recorded as `many` from the input Schema, read at start, predicts each listed record
  once, never takes merge 4 rule 34's default lane key, and is bounded by the record queues. A recording parameter is
  sealed after its callback returns, and enumerating it is a construction error.
- **A8. Replay, with pure functions over frozen data.** A predicted field's function is called only over a record the
  store holds, with that record (`DeepReadonly`, frozen) and the real Type-side input (frozen), at write start and at
  every base change; live predictions apply in start order, a write's patches in written order, all fields of one
  patch over the same record beneath. It must be pure and deterministic and must not write to its arguments;
  Dates, Maps and Sets in them have throwing mutators, `ArrayBuffer` views are left unfrozen, and the caller's objects
  are copied before freezing. The Runtime option `checkReplays` (on in Stories and `propertyTest`) calls it twice per
  replay, each call with its own outcome; two different outcomes are a fault.
- **A9. Per record: uncomputed, fault, settle.** Predictions are kept per (entity, key, field). A value that cannot
  be computed for this record (the function throws an ordinary error, or its field's Schema rejects the result) is
  uncomputed: the field shows its value beneath, the record reads `predicted`, the rest go on, the write is sent, and
  `prediction` records `uncomputed`. A prediction fault (a sealed read, a write to a frozen argument, two results, an
  uncopyable value) behaves the same and is also reported as `predictionFault`, on which a Story fails; neither is
  thrown out of a replay or a view. Settlement takes the replay's slots: a field the response carries whole for that
  record is confirmed and retires older predictions of that field on that record only; any other predicted slot is
  unconfirmed and gets its confirming read, unless no carrier's shape holds the whole field, when the prediction
  ends (`PredictionNotRetained`); a confirming read that does not confirm ends it too.
- **A10. The lint is an allowlist grammar.** `flow check` (and its `--watch` mode, 9.8) requires every function passed
  to a library recorded position to take exactly one parameter, with no default or rest, and to be one expression in
  the grammar of 3.6, receivers and property names included, constants resolved through the checker as value facts,
  library calls returning recorded values,
  checked over the project's program with type facts from one adapter shared with Inspection D2, which fails closed; a
  file it cannot analyse is an error; a field function may not use its `.predicts` callback's parameters; a fix-it is
  code only when it type-checks; a `serverMatches` field list gets an info finding.
- **A11. The join display.** `flow explain` and `flow check` join actions to operations, domain entries, predicted
  fields, impact rows and subscribing activities, in a field-level conservative mode that counts response shapes and
  `.alsoChanges`, and print each lane's key and cardinality. A predicted field no carrier holds (the write's response,
  a read entry, a loader) is `PredictionNotRetained`, over a complete graph only.
- **A12. Identities are unique.** Two domains with one id, two entity objects with one id, or one operation
  registered twice (in two domains, or in two entries of one, 9.10) is `InvalidConfiguration` at App construction or
  lazy adoption, for factories as for literal domains.

Unchanged: the ordering rule and contests (ED:592-602), write endings (ED:604-611), record queues (ED:639-654) and
merge 4 rules 26-38 (with rule 34's array-key sentence).

## 5. How it is implemented, and the spike

One runtime: the store's evaluator is the only code that gives a condition a verdict; the CLI prints and classifies.
The `Condition` module holds the operators, the evaluator and the order comparators. Recording is as today, plus the
sealed session and the enumeration traps. Store records and inputs are frozen. The lint is one module over the facts
adapter, hosted by `flow check` (and `--watch`, 9.8).

**The spike** (SPK, about 2,450 lines; `output.txt`): a stand-in library (`flow.ts`: condition operators with sentence
type errors, sealed and enumeration-trapping recording, Type-side inputs with a once-only Encoded decode, the
three-valued evaluator with carried fields, the existence-aware join over segment paths and ED 2.3's classifier, the
static `mayRepair`, the response and order checks, start with key decoding, replay over frozen data with fault
classification and `checkReplays`, settlement fed by the replay, App identity checks), the two reference domains
ported, extras, lint-clean variants, legacy declarations, review 3's and review 4's probe domains (`domains/kanban.ts`,
`mail.ts`, `docs.ts`, `cal.ts`, `tenant.ts`, `holes.ts`, `helperlib.ts`, `p.ts`), the conformance rows, the lint
(`source.ts`), the checks (`types.ts`, `main.ts`) and `mutations.py`; review 5 added `domains/r3.ts` and `r3lib.ts`. Result: **ALL
PASS, 113 checks**; `tsc` 0 errors with 16 expected errors in `types.ts` and 8 in the probe files; **every one of the 38
fixes of reviews 3 to 5, reverted in turn, makes the spike fail** (37 by a failing check, one, the typed-array skip,
by the run crashing; `mutations.py`, its output at the end of `output.txt`).

| Item | Result |
| --- | --- |
| (a) conditions | **pass.** 67/67 conformance rows (nested paths, carried and partially carried fields, `oneOf` and `contains` elements, an inverted `between`, a wrong-kind `eq`, `isNull` of an absent field); reference, queue and calendar conditions; the response and order checks; recording alone reproduces the four silent failures |
| (b) the join | **pass.** The counterexample under merged bases; definite equal answers; server-maybe → server-maybe on an unread field; existence (create into "all issues", outside, delete, no `.where`, first sightings); segment paths (`meta`, `[meta, owner]`, `metadata` against a maybe condition, an array insert, a field named `a.b`); Type-side inputs, a once-only Encoded decode and a decode failure; `serverMatches` claim; ED 2.3's kinds; cause precedence; static `mayRepair` counting the response shape |
| (c) predictions | **pass.** Structure in the Model; the lane key; the like scenario; frozen records; a delete; a patch over an unheld record; two patches; a list edit with no fault; `checkReplays` on and off; a write to the frozen record and to the frozen input are faults; a missing nested field is uncomputed; a class instance and a bigint field; the cached-clock limit; the sealed read as a fault; bigint and circular keys; `"12"` and `12`; canonical keys; settlement fed by the replay (transfer, retirement on A only, bulk, uncomputed `likes`, whole-value `meta`); enumeration traps; identity errors, including two entries of one domain; **review 5:** idempotent Date, Map and Set writes are faults with `checkReplays` off; `Uint8Array` does not throw; a second-call throw is a fault; caller objects stay unfrozen; nested partial carriage repairs; a prediction no carrier holds whole ends; a nested default needs its parent; a missing Type-side key is reported |
| (d) the lint | **pass.** Over the project's program; no errors on correct domains; info claims; 23 of 24 holes (all but `e22`); review 4's receiver, computed name, zero-parameter and named `any` callbacks; `@ts-nocheck`; clocks and computed consts but not pure constants; the tenant factory; fix-its that compile; `?:` instructions; the closure; a helper's `?:`; **review 5's 30 probes: 26 errors, the 4 correct ones pass** (default and rest parameters, ambient and computed constants, getters, `let` and shadowed callbacks, imported and bound callbacks, optional calls, library calls returning plain values); a factory call's non-literal argument is an info finding |

Not modelled: Effect Schema itself (the spike's Schema check is "defined and finite"; array paths, literal defaults
and key types are lists on the operation and entity), the store, the join over many answers and its indexes,
confirming-read scheduling beyond reporting unconfirmed fields, uncertain endings and restore, the input rule
(ED:136-141), `.alsoChanges`, paging, the `--watch` host, cross-file helpers and named callbacks (the spike follows
same-file ones; the checker would resolve the rest), the join display and `PredictionNotRetained`.

## 6. Changes

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| `or`, `not`, `gt`, `gte`, `lt`, `lte`, `isNull` | condition operators | table 3.1 |
| yes / no / maybe, with a cause | condition semantics | rule A2 (M5-D8) |
| The join rule, its reason in the `repair` event's existing `matched` field | runtime rule | rule A5 |
| The conformance table | test | 3.2 (M5-D3) |
| A predicted field's function `(beneath, input) => value` | authoring | rules A7–A9 (M5-D5) |
| `many` on a recorded change | Model | rule A7 (M5-D9) |
| The sealed recording session | recording | rule A7 |
| `uncomputed` on the `prediction` trace event; the `predictionFault` event kind | evidence | rule A9 |
| The lint, in `flow check` and `flow check --watch` | tooling | rule A10 (M5-D6; 9.8) |
| `PredictionNotRetained` | `flow check` warning | rule A11 |
| The machine-to-domain chain in `flow explain` | tooling | 3.7 |
| The existence side of a delta (none, first sighting) and prefix path matching | join rule | rule A5 (review 3) |
| Input decoding through the input Schema before evaluation | runtime | rule A3 (review 3) |
| Frozen records and inputs; fault classification; the `checkReplays` Runtime option; `DeepReadonly` beneath | runtime | rules A8, A9 (reviews 3, 4) |
| Type-side inputs; literal defaults in the Model; `InputDecodeFailed` | runtime | rule A3 (review 4) |
| The store's carried-field set in evaluation; segment paths; whole-value confirmation | runtime | rules A2, A5, A9 (review 4) |
| A static, field-level `mayRepair` and lane cardinality in `flow explain` | tooling | rule A11 (review 4, audit) |
| A `tsconfig` field in `defineConfig` | configuration | rule A10 (review 4) |
| Carried segment paths; per-element checks in `oneOf`/`contains`; wrong-kind and inverted-range maybes | evaluator | rule A2 (review 5) |
| Throwing mutators on frozen Dates, Maps and Sets; copy before freezing; per-call outcomes under `checkReplays` | runtime | rule A8 (review 5) |
| One-parameter callbacks; checker-resolved constants; recorded-result library calls; factory-argument info findings | tooling | rule A10 (review 5) |
| Whole-path carriers; ending a prediction no carrier can confirm | settlement | rule A9 (review 5) |
| Per-record settlement and retirement | runtime | rule A9 (review 3) |
| The allowlist grammar, the `closure` rule, `claim` info findings | tooling | rule A10 (review 3) |
| Enumeration traps on recording proxies | recording | rule A7 (review 3) |
| Identity checks for factories | construction | rule A12 (review 3) |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| `.predicts` | recorded, then run again at write start (EDP:51-52, ED:440-445) | recorded once for structure; field functions called with the real input (A7, A8) |
| A predicted field's function | `(record) => …`, closing over the input (ED:443-444) | `(beneath, input) => …` |
| Condition logic | two-valued, `and` only for conditions (ED:375-383) | three-valued, with `or` and `not` (A2) |
| Absent optional inputs | drop the constraint "for every operator" (ED:391-395) | only directly under `and` or as the whole condition; per bound for `between`/`overlaps`; else maybe (A3) |
| `between`, `overlaps` | any field type | numbers and Dates (A4) |
| Matching a delta (ED:521-526) | old or new value meets the condition; a field not carried counts as meeting it; first sightings repair derived answers | rule A5: existence-aware, three-valued, prefix paths; first sightings kept |
| Settlement and retirement | by field (EDP:92-100, ED:511-513) | by (entity, key, field) (A9) |
| A response pair with a `null` sort key | compared (ED:408-412) | skipped (A6, M5-D4) |
| The `?:`/`&&` check | "a mandatory flow check rule … also run at construction in development" (ED:477, ED:1016) | an allowlist grammar with type facts in `flow check` and `flow check --watch` (A10, 9.8) |
| `flow explain` for a machine event | transitions, denials, fallthrough (CLP:23-25) | also the store-effect chain (3.7) |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| "`.predicts` runs twice" | ED:440-445, ED:1172-1174, EDP:51-52 | values are runtime functions taking the input (M5-D5) |
| The construction-time source check in development | ED:477, ED:1016 | a choice: the lint runs in `flow check` and the editor (M5-D6) |
| Revision 1's value expressions, flags, agreement check, `unreadable-domain`, fix-it kinds, four lint rules, `opaque` | revision 1 | M5-D5 to M5-D7; review-2.md |

### 6.4 Amendments by target

Applied when this proposal merges.

**`EntityDomains.plan`**

| Where | Amendment |
| --- | --- |
| O1 (EDP:29-31) | "Conditions use where (eq, oneOf, contains, between, overlaps, and)" becomes "Conditions use eq, oneOf, contains, between, overlaps, gt, gte, lt, lte, isNull, and, or, not and serverMatches. Each answers yes, no or maybe (Kleene); maybe means a field not carried, a value the operator cannot use, or an answer the server decides (serverMatches, null order, an empty list, a present null input, an absent input outside and, a Date tie at the millisecond). Ordering takes numbers and Dates, compared with Effect's Order.Number after a finiteness check and Order.Date." "An absent optional input drops its constraint" (EDP:32-33) becomes "An answer's input is the Type side the machine passed, never decoded again; an Encoded input is decoded once at its boundary, where a decoding default (Effect.succeed of a literal, recorded in the Model) fills a missing key, and a failure makes the answer maybe with InputDecodeFailed. A Type-side optional field with no default, when absent, drops its constraint directly under and or as the whole condition, and only its own bound for between and overlaps; elsewhere it is maybe. A read is carried only under a segment path the store holds whole, and a held field with an absent value is a value, not 'not carried' (isNull of it is maybe); each oneOf and contains element is checked; values of two kinds and an inverted between or overlaps are maybe" |
| O1 (EDP:37-41) | the order check "compares with Effect's Order; a pair whose sort key is null, non-finite, an invalid Date or a Date tie is skipped, never HiddenOrder" |
| O1 (EDP:49-52) | "Declarations are recorded once at construction. … predicts runs again at write start with the real input." becomes "Declarations are recorded once at construction; predicts records its entities, keys and field names, and a field's function is called with the record beneath and the real input at write start and on each replay. A recording parameter read after its callback returns, or enumerated, is an error. A field's function must be pure, deterministic and must not write to its arguments; store records and inputs are frozen, a write to them is a prediction fault, and the checkReplays Runtime option (on in Stories and propertyTest) calls it twice and compares. flow check requires each function passed to a recorded position to be one expression in the allowlist grammar." |
| O1 (EDP:54) | patch fields "are recorded reads, constants or functions (beneath, input) => value; a key is recorded reads and constants; an array key (from the input Schema) is recorded as many and predicts each listed record once" |
| O1 (EDP:64-70) | replay "calls each field's function over the record beneath, a write's patches in written order, all fields of one patch over the same record; a field's function is called only over a record the store holds, and a patch over an absent record shows nothing, stays with its Attempt and is called when a base arrives; a value that throws or that its Schema rejects is uncomputed: the field shows its value beneath and the record reads predicted; a prediction fault behaves the same and is reported. Predictions are kept per entity, key and field" |
| O1 (EDP:73-75) | "on its old or new values; a missing condition field matches" becomes "on each side, a record that does not exist is a definite no and a first sighting is no for a list and maybe for a derived answer; an answer repairs when the record's existence changed or a path its condition reads changed (segment arrays matched by prefix, arrays atomic, carried paths), unless the condition gives the same definite answer before and after"; the first-sighting sentence (EDP:74-75) stays |
| O1 (EDP:92-100) | "Predicted fields the response omits" becomes "a predicted slot, shown, uncomputed or faulted, whose whole value the response does not carry for that record"; retirement (EDP:70-71) is per record |
| O1 (EDP:21-25) | add: "at App construction or lazy adoption, for domains built by factories as for literal ones; an operation registered twice, in two domains or two entries of one, is an error; a factory parameterises its domain, entity and operation ids" |
| O1 (new sentence, with merge 4 rule 34) | "A write whose key is recorded as many never takes the default lane key" |
| V1 (EDP:197-199) | "source check rejects conditionals and impurity" becomes "the conformance table passes as the evaluator's golden test; the join rule's counterexamples (a field not carried, an unread field, a definite transition, a create, a delete, a first sighting, no condition, a nested path, a Schema default) each have a test; two-record settlement has a test; freezing everywhere (with Date, Map and Set mutators sealed) and checkReplays catch a mutation, Math.random and a second-call throw; lint goldens with code fix-its that type-check and instructions otherwise" |

**`references/design/entity-domain.md`**

| Where | Amendment |
| --- | --- |
| 2.1 (ED:93, ED:96) | `.predicts`: "fields are reads, constants or (beneath, input) => value"; conditions row lists the new operators |
| 4.1 (ED:336-339) | runtime row: "`.as` mappings and predicted fields' functions, called on each event, and at write start and each replay with the record beneath and the input" |
| 4.3 (ED:375-395) | the table becomes table 3.1 with the conformance table; rules A2, A3, A4; the null split; Dates |
| 4.4 (ED:405-412) | rules A4 and A6 for the order check |
| 4.6 (ED:440-445) | replaced by 3.4 |
| 2.3 (ED:109-129) | "a record enters or leaves the condition" is rule A5's existence-aware membership; a derived answer's fields are its declared fields plus its condition's (ED:128-129 already says condition fields repair) |
| 2.4 (ED:131-154) | add: the `serverMatches` field list is a claim, like a filter or an `.alsoChanges` target (rule 4) |
| 4.7 (ED:468-483) | the table becomes rule A10's grammar (one parameter, no defaults, checker-resolved constants, recorded-result calls); the construction-time check goes; the sealed session and the enumeration traps are added |
| 5.1 (ED:507-510) | "keeps its value or function" becomes "keeps its value or function, called again over each new base"; rule A9 |
| 5.2 (ED:521-526) | matching becomes rule A5, keeping the first-sighting sentence; conditions with `or` or `not` are scanned, never indexed (ED:557-559) |
| 5.5 (ED:604-611, ED:613-630) | settlement and retirement per record (A9) |
| 5.5 (ED:613-630) | an uncomputed or faulted field needs its confirming read like any predicted field; confirmation needs the whole value |
| 8.2 (ED:989) | C5 "every displayed unconfirmed value is a live prediction marked pending" gains "or the value beneath an uncomputed one, with the record marked predicted" |
| 7.2 (ED:850-853) | predicted fields print as `title ← input.title` or `likes ← <runtime>` |
| 7.4 (ED:907, ED:910) | `repair`'s existing `matched` field carries `entered`, `left` or the maybe's cause (`notCarried`, `failed`, `server`), so a Story can assert why a list refetched; a new `predictionFault` kind; `prediction` gains `uncomputed` |
| 8.3 (ED:998-1004) | name the oracle as where condition exactness meets server truth |
| 9 (ED:1016) | rules A1–A12 |
| 14 (ED:1122) | add TSE and Effect `Order` (PA) |
| 15.1 (ED:1164, ED:1168, ED:1172-1174) | annotate: superseded by merge 5 |

**`CommandLine.plan`**

| Where | Amendment |
| --- | --- |
| O1 (CLP:22-25) | static explain of a machine event "also shows, for a commit to a domain write, its predicted entity, key and field names, the reads they can repair, their carriers and the activities that subscribe them" |
| O5 (CLP:96-97) | "without running application callbacks" becomes "without running application callbacks other than entity domain recorded positions, which App construction calls once with recording proxies" |
| O5 (CLP:95-110) | add: "flow check requires each function passed to an entity domain recorded position (inline or by a same-file name, whatever its parameter types) to be one expression of library operators, reads on its own parameters, literal constants and a factory's primitive parameters (the allowlist grammar), checked with type facts; anything else is an error, with a fix-it that type-checks or an instruction. It reports each serverMatches field list, and each non-literal argument to a domain factory, as an info finding, and over a complete graph warns on a predicted field no carrier retains (PredictionNotRetained). flow check --watch keeps one compiler session and re-lints changed files (the editor path, pending the owner's 9.8)." |
| O6 (CLP:111-126) | `defineConfig` gains `tsconfig`, the program the lint reads (default `tsconfig.json` at the project root) |
| Q1 (CLP:137-139) | "static-analysis implementation" is decided for domains: one source-and-type-facts adapter, shared with Inspection D2 |

**`Inspection.plan`**

| Where | Amendment |
| --- | --- |
| O1 (INS:16-19) | "actions" gains "each naming the operation it commits or reads"; "each entity domain as recorded" holds predicted field names, `runtime` markers and `many`, never functions |
| D2 (INS:158-161) | the type-facts reader is one adapter, also used by the domain lint, and fails closed for both |
| D1 (INS:155-157) | add: "the lint's reading of source is a check, not a representation; it is never saved" |
| O4 (INS:86-90) | the event kinds gain `predictionFault` (a Story fails on it) |

**`references/design/sync-engine-adapter.md`**: SEA:351-353's "by the same recording the entity domain uses for
`.predicts`" becomes "by recording `apply`'s collection set at construction, as entity domains record `.predicts`
structure; both functions then run for real (`apply` inside `tx.mutate`, a domain's field functions at write start)".

**`machine-design.md`**: no change.

**merge 4** (accepted; for when it merges): 3.1 (M4:130) takes the ported `likes` line; M4:75's "the domain's
`.predicts`, with the real input" becomes "the domain's predicted fields' functions, with the real input"; M4:632-633's
"runs `.predicts` with the real input" becomes "calls its predicted fields' functions with the real input"; rule 34
(M4:614-616) gains "A write whose key the Model records as `many` (an array, from the input Schema) never takes the
default; such a write's lane key is declared or `{}`; with `allow` or `serialize`, `retry` is a type error (design rule N2), so a bulk write that must be retried declares a per-call key and `reject`"; 6.1 (M4:658) reads "the commit node shows its domain entry's predicted entity, key and field names,
`.alsoChanges` targets and the reads they reach (merge 5, 3.7)".

## 7. Coverage

| Brief item or question | Answer |
| --- | --- |
| Gap 1, logic records one branch (BR:10-11) | the allowlist lint (3.6, A10), sound because it accepts only what it can read; the types for `===` in `.where` and arithmetic; enumeration traps at construction |
| Gap 2, runtime functions opaque (BR:12-13) | kept as functions on purpose: nothing reads a value (section 1, M5-D5) |
| Gap 3, server behaviour (BR:14-15) | out of scope; maybe marks where the server decides |
| Gap 4, machine and domain apart (BR:16-17) | 3.7, A11 |
| Gap 5, static requires the App (BR:18) | corrected in section 1; CLP O5 amended |
| Scope 1, the operator set (BR:24-28) | 3.1, 3.2 |
| Scope 2, predicted values; `.as` (BR:29-32) | 3.4, 3.5; values are functions, `.as` unchanged |
| Scope 3, analysis from source (BR:33-34) | 3.6: a type-aware lint, no second description |
| Scope 4, the join (BR:35-36) | 3.7 |
| Scope 5, the spike (BR:37-38) | section 5 |
| Q: the operator list (BR:60-61) | 3.1 |
| Q: recording beside source analysis (BR:62-63) | recording stays; source analysis is the lint only; no agreement check (M5-D6) |
| Q: evaluation at start and replay (BR:64-65) | A7–A9; the join rule A5 is the one repair change |
| Q: what stays opaque (BR:66) | predicted field functions, `.as`, selects; shown as `<runtime>` |
| Q: the join (BR:67) | 3.7 |
| Q: migration (BR:68) | 3.9 |
| Hint: `field("likes")` (BR:30); arithmetic (BR:25) | not taken: values are functions |
| Hint: views (BR:36) | not reachable (3.7) |
| Reviews 1 to 5 | [review-1.md](reviews/review-1.md), [review-2.md](reviews/review-2.md), [review-3.md](reviews/review-3.md), [review-4.md](reviews/review-4.md), [review-5.md](reviews/review-5.md) |
| The multiplicity audit, section 4 | first sighting per Runtime (3.3); calls only over a held record (3.4, A8); lane cardinality in `flow explain` (3.7); the `many` retry sentence (3.4, merge 4 amendment); M4 citations re-pointed |

## 8. Alternatives considered

- **Recorded value expressions** (revision 1: `add`, `sub`, `when`, `coalesce`, `opaque`). Tools could print a value,
  but nothing reads one, and they cost five operators, three type flags, a second recording mode and two lint rules.
  Rejected (M5-D5).
- **Source analysis that builds a description and compares it with recording** (revision 1). Catches a stale build,
  but rejects factories, needs `unreadable-domain`, and duplicates the Model. Rejected for the lint (M5-D6).
- **Source analysis replacing recording.** The runtime would need a generated file (INS:155-157) or the compiler at
  runtime (INS:174-176). Rejected.
- **Two-valued conditions, with failures counting as matching** (revision 1, A12). Missed the team/status refetch,
  refetched on every change once any field failed, and needed type rules for `not`. Rejected for three values (M5-D8).
- **SQL's three-valued logic as TanStack DB has it** (UNKNOWN in WHERE is false, TSE:85). Hides repairs. Rejected:
  maybe repairs.
- **Forbidding array keys.** Bulk writes would need one write per record. Rejected for `many` (M5-D9).
- **A string `field("likes")`** (BR:30) and **recorded `.as` mappings**. Not needed once values are functions; `.as`
  stays a function (M5-D4).

## 9. Open questions

Revision 1's five owner questions are settled or gone: a skipped value still reads `predicted` and is confirmed (A9;
the alternative leaves a stale field); "undecidable counts as matching" became maybe and the join rule (M5-D8); array
keys stay, recorded as `many` (M5-D9); the restrictions on negated nullable order and `serverMatches` are gone under
three values; `PredictionNotRetained` stays, with `listen` carriers. Four judgements remain, each written into the text
with its recommendation:

1. **A Date tie at the millisecond is maybe** (3.1). The alternative, deciding ties as equal, would be wrong for a
   server with microsecond times. *Recommendation:* maybe; it costs only a refetch when a tied Date field changes.
2. **A present `null` input is maybe** (3.1). The alternative is to define it as "is null". *Recommendation:* maybe,
   because APIs differ; an author who means "unassigned" writes `isNull`.
3. **The sealed recording session** (A7) turns a closure over the recording input into an error with the fix, at the
   first replay. *Recommendation:* keep; without it the closure reads a proxy as truthy and predicts wrong values
   silently.
4. **The TypeScript 7 API dependency** (3.6; its ESLint clause pending 9.8). *Recommendation:* one adapter, pinned, failing closed, with the ESLint
   rule using it rather than typescript-eslint's parser services; revisit when TypeScript 7's API is stable.

Review 3 forced three more choices. Each is written into the text, and each is the owner's to confirm or reverse:

5. **A factory's primitive parameters are allowed in recorded expressions** (3.6); Date and object parameters are not,
   and a factory branches outside its callbacks. *Recommendation:* keep; tenant ids are what factories are for, and a
   caller passing a computed value into a primitive parameter (`makeDomain(Date.now())`) is a residue the lint now
   reports: each factory call whose argument is not literal gets an info finding, "fixed for the domain's life".
6. **A tenant factory must parameterise its operations too, or carry the tenant in keys** (3.8), because an operation
   belongs to one domain. *Recommendation:* keep the EDP rule and prefer one domain with the tenant in the key.
7. **Freezing, re-decided** (3.4, review 4). Revision 3 recommended development-only copies, because a frozen-object
   `TypeError` looked like a missing field. Review 4 showed production then hands functions the live record, so a
   write through `as any` or a JavaScript file corrupts the base for good. *Recommendation (changed):* freeze store
   records and inputs in every environment (snapshots already are, Machines O8), and classify a `TypeError` by
   re-running the function on Schema-made copies: a changed copy is a fault, an unchanged one an ordinary failure.

Review 4 forced four more:

8. **The editor path replaces the ESLint rule** (3.6; changes M5-D6). *Recommendation:* `flow check --watch` now, a
   TypeScript language-service plugin once TypeScript 7's plugin API is stable, no ESLint rule. If accepted, item 4's
   "the ESLint rule using it" clause falls away.
9. **`checkReplays` is on by default in Stories and `propertyTest`** (3.4), off in production. *Recommendation:* as
   written; production keeps freezing, which catches writes, but not impurity.
10. **An operation registered in two entries of one domain is an error** (3.8). Today EDP only forbids two domains.
    *Recommendation:* an error: two entries for one operation would give one request two meanings (two predictions,
    two conditions), and nothing needs it.
11. **The `many` array's length** (3.4). *Recommendation:* bounded by the codec's 4,096 items per array (INS O2) and by
    the record queues (64 waiting each, merge 4 rule 35); a larger array is `NotSent { why: "Overloaded" }`, never a
    partial join.

## 10. Decisions

Settled by the owner on 2026-10-30: the proposal is accepted as written, with these decisions.

- **M5-D1 Scope.** Entity domains are client coherence (one store across screens) plus honest optimistic writes, not a
  sync engine (sync engines plug in through `references/design/sync-engine-adapter.md`). The exact client semantics of
  condition operators stay: a condition the client evaluates differently could skip a refetch a list needed, so
  exactness protects coherence; it is kept because it is correct, not as a server-agreement guarantee.
- **M5-D2 Effect's comparators.** Client-side ordering uses Effect's `Order.Date`, `Order.Number` (after a finiteness
  check, since `Order.Number` ranks NaN below every number, `node_modules/effect/src/Order.ts:183-187`) and
  `Order.mapInput`, not hand-written comparators ([prior-art.md](prior-art.md)).
- **M5-D3 A conformance table** (operator, inputs, expected result, null rows included) is the client evaluator's own
  test, CEL-style; it is not a client/server agreement suite.
- **M5-D4 Open questions 1–7 take their recommendations:** ~~no new value operators until an app needs one~~
  (superseded by M5-D5: there are no value operators); ordering operators compare Schema `Date` fields by time and
  date strings by equality only; ~~no helper functions in version 1~~ (superseded by M5-D6: helpers are allowed);
  `.as` stays a runtime function; ~~an unevaluable prediction is not shown, the write is still sent, and `skipped` is
  recorded~~ (superseded by rule A9: an uncomputed field shows its value beneath, the record reads `predicted`, the
  write is sent, and `prediction` records `uncomputed`); a sort pair with a `null` key is skipped rather than raising `HiddenOrder` (`nullsFirst`/`nullsLast` later,
  separately); ~~the agreement check runs only in `flow check`~~ (superseded by M5-D6: there is no agreement check).
- **Rejected:** renaming the IR after TanStack DB's variants (cosmetic), and dropping the exact-semantics rule.

Settled by the owner after the second reviews (soundness, authors, system fit):

- **M5-D5 Predicted values are runtime functions.** *Choice:* a predicted field is a recorded read, a constant, or
  `(beneath, input) => value`, called with the real input at write start and on each replay; recording captures the
  entity, the key and the field names. *Reason:* nothing reads a predicted value: joins, repairs, queues and lane keys
  read names only, the same reason `.as` stays a function. *Consequence:* `add`, `sub`, `opaque`, value-position
  `when`/`coalesce`, the value-only type flag, the `opaque` Model/runtime split, revision 1's rule A9 (opaque purity) and the
  `opaque-closure` and `outer-value` lint rules go; "runs twice" still ends; rule 34's lane key still comes from the
  recorded key; `flow explain` shows `likes ← <runtime>`; A6 (replay, now A8) and A7 (skip, now A9) stay for plain
  functions. Supersedes M5-D4's first clause. *Rejected:* recorded value expressions (revision 1).
- **M5-D6 Lint only** (its ESLint clause pending 9.8). *Choice:* a type-aware lint for `?:`, `&&`, `||` and impure calls in recorded positions, in
  `flow check` and as an ESLint rule, over one source-and-type-facts layer shared with Inspection D2, failing closed;
  no source description and no agreement check. *Reason:* the comparison duplicated the Model, rejected correct
  factories, and caught only stale builds of recorded positions. *Consequence:* `DomainSourceMismatch` and
  `unreadable-domain` go; helpers and domain factories with computed ids are allowed; the `typescript/unstable/async`
  dependency sits behind one adapter (9.4). Supersedes M5-D4's "no helpers" and "agreement check" clauses.
  *Rejected:* the revision 1 agreement check.
- **M5-D7 No `when` or `coalesce` in conditions.** *Choice:* conditions keep `eq`, `oneOf`, `contains`, `between`,
  `overlaps`, `gt`/`gte`/`lt`/`lte`, `isNull`, `and`, `or`, `not` and `serverMatches`. *Reason:* fewer concepts; an
  absent input already drops its constraint under `and`, and an alternative is `or(and(…), and(…))`. *Consequence:*
  the `?:` fix-it is an instruction, never code. *Rejected:* `when`/`coalesce` as condition operators.
- **M5-D8 Three-valued conditions and the join rule.** *Choice:* every condition answers yes, no or maybe (Kleene),
  maybe with a cause; an answer repairs when a field its condition reads changed unless both sides are the same
  definite answer; the cause is repair evidence. *Reason:* revision 1's "an undecidable condition counts as matching"
  missed a refetch (`or(eq(team, …), eq(status, "open"))` with only `status` carried) and refetched on every change
  once a field failed. *Consequence:* revision 1's A12, the "only under `and`" rule for `serverMatches`, the ban on
  negating a nullable order and the optional-input type flag go; a null sort pair is a maybe pair, skipped (M5-D4
  kept). *Rejected:* two-valued logic; SQL's UNKNOWN-is-false.
- **M5-D9 Array keys in the Model.** *Choice:* a key whose input Schema is an array is recorded as `many`; it is read at
  start, predicts each listed record once, and never takes merge 4 rule 34's default lane key. *Reason:* the record
  count must be static for rule 34 and the queues. *Consequence:* rule 34 gains one sentence; bulk writes keep working.
  *Rejected:* forbidding array keys; deciding at start from the value.
- **M5-D10 Open items 9.1–9.11 take their recommendations** (owner, 2026-10-31). A Date tie at millisecond precision
  is maybe (9.1); a present `null` input is maybe (9.2); the recording session is sealed (9.3); one pinned TypeScript 7
  adapter that fails closed (9.4); a factory's primitive parameters may appear in recorded expressions, with an info
  finding for non-literal arguments (9.5); a tenant factory parameterises its operations or carries the tenant in keys
  (9.6); records and inputs are frozen everywhere and a write is a prediction fault (9.7); the editor path is
  `flow check --watch` now and a language-service plugin later, with no ESLint rule, superseding M5-D6's ESLint clause
  (9.8); `checkReplays` is on in Stories and `propertyTest`, off in production (9.9); one operation in two entries of a
  domain is an error (9.10); a `many` key array is capped at 4,096 items, overflow ending `Overloaded` (9.11).
  *Reason:* each recommendation chose the conservative, correct option; prior art and three review rounds agreed.
  The proposal is accepted in full; it merges after merge 4.

## New keywords

| Keyword | Meaning |
| --- | --- |
| `or`, `not` | Kleene disjunction and negation |
| `gt`, `gte`, `lt`, `lte` | number and Date order through Effect's `Order`; `null` and a Date tie are maybe |
| `isNull` | the field holds `null`; nullable fields only |
| yes / no / maybe | a condition's three answers; maybe's causes are not carried, failed, server |
| the join rule | repair when existence or a read field changed, unless the same definite answer before and after (A5) |
| none, first sighting | a side of a delta that does not exist (a definite no), and a record seen for the first time (A5) |
| prediction fault | an author's mistake in a field function or a recording read: displayed and settled as uncomputed, and reported (`predictionFault`) (A9) |
| `checkReplays` | a Runtime option: each field function called twice per replay, results compared (A8) |
| carried | the fields the store holds for a record; outside them a field is not carried (A2) |
| Type side | the decoded input the machine passes; Encoded inputs are decoded once, at their boundary (A3) |
| allowlist grammar | what a recorded callback may contain (3.6, A10) |
| record beneath | the visible record under a prediction: base plus older live predictions, in start order |
| `(beneath, input) => value` | a predicted field's runtime function |
| `many` | a recorded array key (A7) |
| sealed session | a recording parameter read after its callback returns is an error |
| carried path | a segment path the store holds whole for a record; a read is carried only under one (A2) |
| uncomputed (prediction) | a value its function could not give for this record: the value beneath, the record still predicted (A9) |
| conformance table | the evaluator's golden rows (3.2, M5-D3) |
| the lint | `flow check`'s allowlist check of every function passed to a recorded position, with type facts (A10) |
| `PredictionNotRetained` | a predicted field no carrier holds after settlement (warning) |
