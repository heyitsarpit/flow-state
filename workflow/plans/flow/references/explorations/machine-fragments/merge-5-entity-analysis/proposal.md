# Proposal: statically analysable entity domains (merge 5)

Status: **accepted by the owner on 2026-10-30 (section 10); revised twice: after correctness review 1
([reviews/review-1.md](reviews/review-1.md)) and, simplified, after three reviews and the owner's decisions M5-D5 to
M5-D9 ([reviews/review-2.md](reviews/review-2.md)); merges after merge 4.** It answers [brief.md](brief.md). Nothing
here edits a `.plan` file or another merge; section 6 lists the amendments to apply when it merges. The spike in
[spike/](spike/) checks sections 3.1–3.7 (`tsc -p .` with the root `node_modules/.bin/tsc`, then `bun main.ts`;
output in [spike/output.txt](spike/output.txt)).

**What revision 2 removed** (M5-D5 to M5-D7): value expressions (`add`, `sub`, `opaque`, `when`, `coalesce`), the
three phantom flags and the key brand, the source-versus-recording agreement check (`DomainSourceMismatch`,
`unreadable-domain`), four lint rules, fix-it kinds, and the `opaque` Model/runtime split. Rule A12's "counts as
matching" and the restrictions on `or`/`not` became one three-valued evaluator and one join rule (M5-D8). Named
concepts fell from about 40 to about 23 (review-2.md, "Concept count"); the rules from 13 to 11.

Sources and the short names used for citations:

| Short name | File (under `workflow/plans/flow/` unless marked) |
| --- | --- |
| BR | `references/explorations/machine-fragments/merge-5-entity-analysis/brief.md` |
| PA | `references/explorations/machine-fragments/merge-5-entity-analysis/prior-art.md` |
| ED | `references/design/entity-domain.md` |
| EDX | `references/design/entity-domain-examples.md` |
| SEA | `references/design/sync-engine-adapter.md` |
| EDP | `EntityDomains.plan` |
| CLP | `CommandLine.plan` |
| INS | `Inspection.plan` |
| M4 | `references/explorations/machine-fragments/merge-4-entities/proposal.md` |
| M6 | `references/explorations/machine-fragments/merge-6-streams/proposal.md` |
| DD | `references/dispatch-desk/features/Tickets/ticket.domain.ts` |
| EO | `node_modules/effect/src/Order.ts` (Effect 4.0.5, at the repository root) |
| TSE | TanStack DB `packages/db/src/query/compiler/evaluators.ts` at `main` commit `bea84cd4` (read for this proposal; not in the repository) |
| SPK | `merge-5-entity-analysis/spike/` |

## 1. The problem

A domain's declarations are recorded by calling each recorded function once, at construction, with recording proxies
(ED:330-345, EDP:49-52). That has five gaps (BR:9-18):

1. **Logic in a recorded position records one branch, silently.** `?:`, `&&`, `||` and `if` are "not detectable by
   the proxy or the types" (ED:477). The spike reproduces each: `a || b` records `a`, `a && b` records `b`, and
   `input.status ? … : …` records the first branch, because a proxy is always truthy. The only guard is a `flow check`
   scan whose shape is unspecified (ED:477, ED:1016).
2. **Runtime functions are opaque** (ED:339, ED:440-445, ED:464-466): predicted field values and `.as` mappings.
3. **Server behaviour cannot be seen** (ED:148-154). Out of scope (BR:20).
4. **Machine and domain are analysed apart** (M4 finding A-L2, M4:884-887; accepted as a display, M4:650).
5. **"Static" constructs the App** (BR:18). **Half wrong:** all of Flow's static analysis loads the App's modules
   (INS:12-13, CLP:31-33, CLP:125-126); only deny codes come from the compiler (INS:158-161). What differs is that a
   domain's construction **calls author callbacks**, while CLP:96-97 says `flow check` runs "without running
   application callbacks". This proposal keeps those calls, has the lint check them, and amends CLP:96-97 (6.4).

Gap 2 is answered by **not** reading runtime functions: nothing reads a predicted value. Joins, repairs, queues and
lane keys read only the entity, the key and the field names (ED:609, M4:606-608), which is the same reason `.as`
stays a runtime function (3.5, M5-D4). Recording keeps capturing structure; the values stay code (M5-D5).

## 2. Where the data comes from

| Fact | Kept in | Written by | When | Read by |
| --- | --- | --- | --- | --- |
| A recorded position's description: conditions, sort keys, places, keys, predicted entities and field names | the App's Model, plain data (INS:15-20, ED:827-832) | recording proxies calling the position once (ED:341-345) | App construction | the runtime's join, response check and order check; `inspect`, `render`, `flow graph`, `flow explain` |
| Whether a key is an array | the Model, `many` on the change | recording, from the operation's input Schema (M5-D9) | App construction | merge 4 rule 34's default lane key; queue joins |
| A predicted field's function, a `.as` mapping, a commit select | the runtime's live description; the Model holds `{ runtime: true }` | the author | — | the runtime only; `flow explain` shows `likes ← <runtime>` |
| A predicted value | a live prediction in the store (EDP:64-65) | the field's function, called with the record beneath and the real input (rule A8) | at write start and at every replay | views, the store |
| A skipped predicted value | the store (the field reads `predicted`, with the value beneath); the trace's `prediction` event, `skipped` | the store (rule A9) | start or replay | views; settlement, which schedules its confirming read |
| A condition's verdict: yes, no or maybe with its cause | not kept; computed per delta | the evaluator (rule A2) | each join, response check, order check | the join; repair evidence (`repair` gains `why`, 6.4) |
| Source and type facts | `flow check`'s and the ESLint rule's memory; never saved | one adapter over the TypeScript 7 API, shared with Inspection D2 (rule A10) | each run | the lint; deny codes |
| The machine-to-domain join | `flow explain` and `flow check` output | the CLI, over the Model and the impact classifier (ED:836-838) | each invocation | people and agents |

Nothing here reads server behaviour or a view's selector: neither is in the Model.

## 3. Design

### 3.1 Conditions: one evaluator, three answers

A condition is one expression of parameter reads, constants and these operators. They live in a neutral module,
`Condition` (exported from `flow-state`), not named after domains, so guards could later share the evaluator. One
evaluator runs them all, the one the runtime uses (SPK `flow.ts:268-440`).

**Three answers (Kleene logic, M5-D8).** Every condition answers **yes**, **no** or **maybe**. Maybe has one of three
causes: **not carried** (the record, as the delta holds it, lacks the field; ED:523), **failed** (a value the
operator cannot use: NaN, ±Infinity, an invalid Date, the wrong kind of value), or **server** (the answer depends on
the server: `serverMatches`, the place of `null` in an order, an empty `oneOf` list, a present `null` input, an
absent input outside `and`, a Date tie). `and` is no if any argument is no, yes if all are yes, else maybe; `or` is the
dual; `not` keeps maybe. So the two-valued trap the first review found (`not(lt(x, 5))` true where `gte(x, 5)` is
false at `x = null`) cannot happen: both are maybe, and no type rule is needed for it.

| Operator | yes / no | maybe | An absent optional input |
| --- | --- | --- | --- |
| `eq(a, b)` | strings by code unit, finite numbers by value, booleans, `null` equal to `null` (a constant); a Date never equals a non-Date | not carried; a bad value; a present `null` input; two Dates equal at the millisecond | drops the leaf (rule A3) |
| `oneOf(a, values)` | some element `eq` `a` | an empty list; as `eq` | drops |
| `contains(arrayField, v)` | some element `eq` `v` | a field that is not an array (failed) | drops |
| `gt`, `gte`, `lt`, `lte` | numbers by `Order.Number`, Dates by `Order.Date` (EO:183, EO:650; M5-D2), after the finiteness and validity check | `null` (the server places it); a Date tie; a Date against a number (failed) | drops |
| `between(a, from, to)` | `from ≤ a < to`, numbers and Dates; each bound is its own term | as `gt`; `from > to` gives no | drops **only its bound**; the other stays (ED:393-394) |
| `overlaps(s, e, from, to)` | `s < to` and `e > from`; a null `s` or `e` affects only its own term | as `gt`; `from > to` (APIs differ: empty, or an error) | drops only its bound |
| `isNull(a)` | `a === null`; a nullable field only (a type error otherwise) | not carried | — |
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
`main.ts` runs each and prints this table, and 56 of 56 give their expected result. `r` is the record, `i` the input.

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

A delta (the record before, after, and the fields it changed) can change an answer's membership only through a field
the condition reads. So (rule A5, SPK `flow.ts:445`):

> **An answer repairs when a field its condition reads changed, unless the condition gives the same definite answer
> before and after.**

The repair carries its reason as evidence: `entered` or `left` for a definite change, or the maybe's cause (`not
carried`, `failed`, `server`). This fixes the missed refetch the main session verified. With `or(eq(record.team,
input.t), eq(record.status, "open"))` and a delta that carries only `status`:

```text
before { status: "open" }    revision 1: true (team "counts as met")   now: yes
after  { status: "closed" }  revision 1: true                          now: maybe (team not carried)
revision 1: true → true, no transition, no refetch, although the ticket (on the blue team) left the list
now: status is read and changed, and yes → maybe is not the same definite answer: repair, why = not carried
```

The rule also removes revision 1's cliff, where any failure made a condition "match" on both sides: a change to a
field the condition does not read never repairs it, and two definite equal answers never do. The spike checks both,
plus a definite `left`, `serverMatches` under `or` (a title change repairs, a status change does not), a fieldless
`serverMatches` (any change repairs) and `isNull` (`output.txt`, section (b)). Section 2.3's other repair reasons
(order fields, server-ranked lists, derived fields) are unchanged; "a record in the condition" means yes or maybe.

### 3.4 Predicted values are runtime functions

A predicted field is a recorded read or constant (`liked: input.liked`, `status: "assigned"`), or a **function of the
record beneath and the input** (M5-D5). Recording captures the entity, the key and the field names; the function is
called with the real input at write start and again at every replay.

```ts
// merge 4's Issues.setLike (M4:125-128), ported. One line changes: the input is a parameter.
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
- **The recording `input` is sealed** after its callback returns: a function that closed over it instead fails on its
  first read with "input.liked was read after construction: a predicted value's function receives the input as its
  second parameter" (SPK `flow.ts:43-55`). Merge 4's original `setLike` hits exactly this (`output.txt`, section (c)),
  the types reject its `input.liked === i.liked` (TS2367, no overlap), and the lint names it (3.6).
- **Keys** are recorded reads and constants. An **array key** (the input Schema says the path is an array) is recorded
  as `many` (M5-D9): it is read at start, predicts each listed record once, joins each queue once, and **never takes
  merge 4 rule 34's default lane key**, even with one element (M4:606-608: "exactly one record"). An empty array
  predicts nothing.
- **Replay** (rule A8, ED:507-510): live predictions apply in start order, a write's patches in written order, every
  field of one patch over the same record beneath. The spike runs merge 4's like scenario (base `liked false, likes 5`;
  like A `6`; unlike B behind it `5`; a push to `liked true, likes 9` replays to `liked false, likes 8`; A retracted,
  still `8`), settlement and retirement (ED:511-513), a transfer over a pushed base, a delete, two patches to one
  record (`5 → 6 → 7`) and array keys.
- **A value that cannot be computed is skipped** (rule A9, M5-D4): the function throws, or returns a value the field's
  Schema rejects (the spike's `likes` over a record without `likes` gives NaN). The field keeps the value beneath and
  still reads `predicted`; the other fields go on; the write is still sent; and at settlement the field counts as
  predicted, so if the response omits it a confirming read is scheduled (EDP:92-100, ED:613-630). Without that last
  step a skipped field would never be confirmed and could stay stale.
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

### 3.6 The lint

`flow check`, and an ESLint rule built on the same code so mistakes show in the editor, flag in recorded positions
(M5-D6):

- **logic over a recorded value**: `?:`, `&&`, `||`, `??`, `!`, `===`/`!==` and arithmetic whose operand is recorded;
- **impure calls** in a recorded callback: `Date`, `Math`, `crypto`, `performance`, `new Date()`. This list is a
  best effort; anything else that varies at construction is for review to catch.

**Type-aware, not syntactic.** A recorded value is recognised by its type (Flow's recorded types carry a brand), and a
recorded callback by its parameter's type. So the lint follows recorded values into helpers and factories, and both
are allowed (M5-D6 supersedes M5-D4's "no helpers"); a domain built by a factory with a computed id needs nothing
special. A recorded value used inside a runtime function, which is not one of its parameters, is reported as a
closure over the recording input (merge 4's `setLike`). The spike's `domains/variants.ts` (a helper, a factory, a
namespace import, consts, enums, casts, `!`, element access, single-parameter and nested callbacks) gives no findings.

**A fix-it is code only when it type-checks.** `&&` and `||` over conditions become `and(…)` and `or(…)`, `===` over two
recorded values of one type becomes `eq(…)`, `!` over a condition `not(…)`. Anything else gets an instruction in
words: `?:` has no operator to become (`when` is gone), so its fix is "write the alternatives as `or(and(…), and(…))`,
make two read entries, or use `serverMatches`"; a closure gets "a predicted value's function receives the input as its
second parameter". The spike compiles its two code fix-its in `types.ts` and checks the lint's text is identical.

```text
$ flow check
domains/legacy.ts:15 error logic   a recorded value inside a runtime function: `?:` on a recorded value …
    instruction: a predicted value's function receives the input as its second parameter, (beneath, input) => …
domains/legacy.ts:23 error logic   `||` records only its first operand
    fix-it: or(eq(record.status, "open"), eq(record.assignee, input.assignee))
domains/legacy.ts:27 error logic   `?:` on a recorded value records only one branch (a proxy is always truthy)
    instruction: a recorded position cannot branch: … or(and(…), and(…)) …, two read entries, or serverMatches
domains/legacy.ts:35 error impure  `Date.now()` runs once, at construction, and is recorded as a constant
```

**Type errors name the cause and the fix** (fix 3). Operator parameters carry sentences:
`gt(record.title, "m")` reports "gt, gte, lt, lte, between and overlaps order numbers and Dates; a string's order is the
server's collation: use serverMatches"; `eq(record.status, "archived")` reports "eq compares two values of one type";
`isNull(record.title)` reports "isNull needs a nullable field" (SPK `types.ts`, review-2.md lists all 13 messages).

**One layer of source and type facts** (M5-D6). Inspection D2 already reads deny codes from types and fails closed
with `TypeFactsUnavailable` (INS:158-161). The lint uses the same adapter, and fails the same way: a file the facts do
not cover is an error, never a pass. **The dependency risk.** The adapter talks to TypeScript 7 through
`typescript/unstable/async` (7.0.2; the `unstable/sync` client fails under bun), an API its name marks as unstable,
and typescript-eslint's type information is built on the older JavaScript compiler API. So: one adapter module is the
only code that imports it; the CLI pins the TypeScript version it supports; the ESLint rule gets its facts from the
same adapter (one extra compiler session per lint run), not from typescript-eslint; and if the API changes, the
adapter fails closed. oxlint's type-aware mode, which runs on TypeScript 7 already, is a possible second host for the
same rule.

### 3.7 The machine and the domain, joined

`flow explain` for a machine event (CLP:22-25) and `flow check` follow a commit to the domain entry its operation is
registered in (ED:33-35), through the recorded `.predicts` and `.alsoChanges` to every read on that entity, classified
by the runtime's impact classifier (ED:836-838), and to the activities that subscribe those reads.

```text
$ flow explain Issues/List READY Toggle
Toggle      READY → READY; updateMemory likeUnsure; commits Issues.setLike (select: <runtime>)
  setLike   writes one Issue; one at a time per record; lane key input.key (rule 34)
    at start  liked ← input.liked; likes ← <runtime>
    repairs   Issues.list: no (liked, likes are neither condition nor order fields)
    retained  by the write's own response (.one(Issue)) and Issues.list
    shown in  Issues.list, subscribed by Issues/List READY.activities.issues
  endings   success → Settled; failure.Gone → IssueGone, Refused | NotSent → Failed; unknown → LikeUnsure
```

- **Computed from the Model alone**, with the action-to-operation edge added to INS O1 (6.4). No machine callback,
  adapter or Layer runs.
- **Where it stops.** At subscribing activities and at `listen` entries (M6), which are sources of deltas, not
  readers. Views (`useView`, `Issue.get` in a component, M4:303-306) are not in the Model, so "the views that read
  them" (BR:36) cannot be joined.
- **`PredictionNotRetained`** (a warning). A predicted field with no carrier is dropped at settlement unless the
  response carries it (EDP:99-100): it shows while the write is in flight, then disappears until a reader fetches it.
  Carriers (EDP:15-16): the write's own response places, every read entry and `.byKey` loader on the entity, and every
  `listen` entry that lists the entity (fix 4; a push carries whole records), across the complete declared graph, lazy
  entries included (CLP:96). It is issued only for a complete graph; a failed lazy entry already fails the load
  (CLP:108-109).

### 3.8 Migration, line by line

| Domain | Line | Before | After |
| --- | --- | --- | --- |
| dispatch-desk tickets (DD) | all | conditions, order, paging, predictions of inputs and constants, `.as` | unchanged |
| merge 4 `Issues` (M4:127) | 127 | `likes: (i) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),` | `likes: (i, input) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),` |
| entity-domain-examples (EDX) | 53 | `reactions: (m) => addReaction(m.reactions, input.emoji),` | `reactions: (m, input) => addReaction(m.reactions, input.emoji),` |
| | 99-100 | `balance: (a) => a.balance - input.amount` / `+` | `balance: (a, input) => a.balance - input.amount` / `+` |
| | 185 | `User.patch(input.keys, …)` | unchanged; recorded as `many`, never rule 34's default |
| ED notes app, EDX `.as` | — | `.as` with `?:` | unchanged |

The only change anywhere is that a predicted value's function takes the input as its second parameter.

## 4. Rules

Numbered A1–A11, for `entity-domain.md` section 9. Revision 1's A1–A13 are mapped in review-2.md.

- **A1. Recorded and runtime positions.** Recorded: conditions, sort keys, places, keys, paging, derived fields, and
  predicted fields written as a read or a constant. Runtime: a predicted field's function, a `.as` mapping, a select.
  The Model holds the first as data and marks the second `runtime`.
- **A2. Conditions are three-valued.** Every condition operator answers yes, no or maybe over decoded values, by
  table 3.1 and the conformance table (3.2); `and`, `or`, `not` are Kleene. Maybe has a cause: not carried, failed or
  server. No arithmetic, string order or string transform appears in a condition; those are `serverMatches`.
- **A3. An absent optional input drops a constraint only directly under `and`, or as the whole condition.** A
  comparison leaf that reads it is yes; `between` and `overlaps` drop only that bound. Elsewhere it is maybe. A present
  `null` input is maybe. (Amends ED:391-395.)
- **A4. Order is Effect's.** Ordering operators and the order check compare numbers with `Order.Number` after a
  finiteness check and Dates with `Order.Date` after a validity check (M5-D2), at millisecond precision; `null` and a
  Date tie are maybe; ordering a string is a type error with a sentence.
- **A5. The join rule.** An answer repairs when a field its condition reads changed, unless the condition gives the
  same definite answer before and after (a fieldless `serverMatches` reads every field). The repair's evidence names
  `entered`, `left` or the maybe's cause. (Replaces ED:521-523's "counts as meeting the condition".)
- **A6. The response check and the order check.** A returned record contradicts its condition only when the answer is
  no. A response pair whose sort key is maybe for the client (null, bad, a Date tie) is skipped, never `HiddenOrder`
  (M5-D4).
- **A7. A write's structure is recorded; its values are code.** `.predicts` runs once, for the entity, the key and the
  field names. A key is recorded reads and constants. An array key is recorded as `many` from the input Schema, read at
  start, predicts each listed record once, and never takes merge 4 rule 34's default lane key. A recording parameter
  is sealed after its callback returns.
- **A8. Replay.** A predicted field's function is called with the record beneath and the real input at write start and
  at every base change; live predictions apply in start order, a write's patches in written order, all fields of one
  patch over the same record beneath.
- **A9. A value that cannot be computed is skipped and still predicted.** A function that throws or returns a value
  its field's Schema rejects: the field keeps the value beneath and reads `predicted`, the rest go on, the write is
  sent, the `prediction` event records `skipped`, and at settlement an omitted field is unconfirmed and gets its
  confirming read.
- **A10. The lint.** `flow check` and an ESLint rule flag JavaScript logic over a recorded value and best-effort
  impure calls in a recorded callback, by type, wherever they occur; a fix-it is code only when it type-checks. Both
  read one source-and-type-facts adapter shared with Inspection D2, which fails closed.
- **A11. The join display.** `flow explain` and `flow check` join actions to operations, domain entries, predicted
  fields, impact rows and subscribing activities. A predicted field no carrier holds (the write's response, a read
  entry, a loader, a `listen` entry) is `PredictionNotRetained`, over a complete graph only.

Unchanged: repair reasons other than membership (ED:109-129), the ordering rule and contests (ED:592-602), write
endings (ED:604-611), record queues (ED:639-654) and merge 4 rules 26-38 (with rule 34's array-key sentence).

## 5. How it is implemented, and the spike

One runtime: the store's evaluator is the only code that gives a condition a verdict; the CLI prints and classifies.
The `Condition` module holds the operators, the evaluator and the order comparators. Recording is as today, plus the
sealed session. The lint is one module over the facts adapter, hosted by `flow check` and by the ESLint rule.

**The spike** (SPK, about 1,350 lines; `output.txt`): a stand-in library (`flow.ts`: condition operators with sentence
type errors, sealed recording, entries, the three-valued evaluator, the join rule, the response and order checks,
start, replay, settle), the two reference domains ported (`domains/tickets.ts` unchanged, `domains/issues.ts` one line),
extras (`domains/extras.ts`: two `.where` calls, `or` with `serverMatches`, a calendar over Dates, a transfer, a list
edit, two patches to one record, a bulk archive), lint-clean variants (`domains/variants.ts`), legacy declarations
(`domains/legacy.ts`), the conformance rows (`conformance.ts`), the lint (`source.ts`) and the checks (`types.ts`,
`main.ts`). Result: **ALL PASS, 52 checks**; `tsc` 0 errors with 13 expected errors holding.

| Item | Result |
| --- | --- |
| (a) conditions type, record and evaluate three-valued | **pass.** 56/56 conformance rows; reference, queue and calendar conditions (`overlaps` with a null end, one bound absent; `between` with one bound and a Date tie); the response check; the order check (Order, a null pair skipped); recording alone reproduces the four silent failures |
| (b) the join rule | **pass.** The team/status counterexample: revision 1's rule fires nothing, the new rule repairs with `not carried`; an unread field never repairs; definite equal answers never do; `left` as evidence; `serverMatches` under `or`; a fieldless `serverMatches`; `isNull` |
| (c) predictions as runtime functions | **pass.** The Model holds names and `{ runtime: true }`; the rule-34 lane key; merge 4's like scenario; settlement and retirement; a skipped field (NaN, a throwing function) unconfirmed at settlement; a list edit over a moved base; a transfer; a delete; two patches to one record; array keys (`many`, deduplicated, no lane key with one element); merge 4's original `setLike` fails on the sealed input with the fix in the message; a factory records |
| (d) the type-aware lint | **pass.** No findings on the reference domains, extras and variants; `||` and `&&` give code fix-its that compile in `types.ts`, byte for byte; `?:` gives an instruction; `Date.now()`; the closure in merge 4's `setLike` (two findings); a helper's `?:` found by type, not reported as a closure; `?:` in a recorded field |

Not modelled: Effect Schema (the spike's Schema check is "defined and finite"; the input Schema's array paths are a
list on the operation), the store, the join over many answers and its indexes, confirming-read scheduling beyond
reporting unconfirmed fields, uncertain endings and restore, the input rule (ED:136-141), `.alsoChanges`, paging,
the ESLint host, the join display and `PredictionNotRetained`.

## 6. Changes

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| `or`, `not`, `gt`, `gte`, `lt`, `lte`, `isNull` | condition operators | table 3.1 |
| yes / no / maybe, with a cause | condition semantics | rule A2 (M5-D8) |
| The join rule and repair evidence `why` | runtime rule | rule A5 |
| The conformance table | test | 3.2 (M5-D3) |
| A predicted field's function `(beneath, input) => value` | authoring | rules A7–A9 (M5-D5) |
| `many` on a recorded change | Model | rule A7 (M5-D9) |
| The sealed recording session | recording | rule A7 |
| `skipped` on the `prediction` trace event | evidence | rule A9 |
| The lint, in `flow check` and as an ESLint rule | tooling | rule A10 (M5-D6) |
| `PredictionNotRetained` | `flow check` warning | rule A11 |
| The machine-to-domain chain in `flow explain` | tooling | 3.7 |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| `.predicts` | recorded, then run again at write start (EDP:51-52, ED:440-445) | recorded once for structure; field functions called with the real input (A7, A8) |
| A predicted field's function | `(record) => …`, closing over the input (ED:443-444) | `(beneath, input) => …` |
| Condition logic | two-valued, `and` only for conditions (ED:375-383) | three-valued, with `or` and `not` (A2) |
| Absent optional inputs | drop the constraint "for every operator" (ED:391-395) | only directly under `and` or as the whole condition; per bound for `between`/`overlaps`; else maybe (A3) |
| `between`, `overlaps` | any field type | numbers and Dates (A4) |
| Matching a delta (ED:521-523) | old or new value meets the condition; a field not carried counts as meeting it | rule A5 |
| A response pair with a `null` sort key | compared (ED:408-412) | skipped (A6, M5-D4) |
| The `?:`/`&&` check | "a mandatory flow check rule … also run at construction in development" (ED:477, ED:1016) | a type-aware lint in `flow check` and ESLint (A10) |
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
| O1 (EDP:29-31) | "Conditions use where (eq, oneOf, contains, between, overlaps, and)" becomes "Conditions use eq, oneOf, contains, between, overlaps, gt, gte, lt, lte, isNull, and, or, not and serverMatches. Each answers yes, no or maybe (Kleene); maybe means a field not carried, a value the operator cannot use, or an answer the server decides (serverMatches, null order, an empty list, a present null input, an absent input outside and, a Date tie at the millisecond). Ordering takes numbers and Dates, compared with Effect's Order.Number after a finiteness check and Order.Date." "An absent optional input drops its constraint" gains "directly under and or as the whole condition, and only its own bound for between and overlaps; elsewhere it is maybe" |
| O1 (EDP:37-41) | the order check "compares with Effect's Order; a pair whose sort key is null, non-finite, an invalid Date or a Date tie is skipped, never HiddenOrder" |
| O1 (EDP:49-52) | "Declarations are recorded once at construction. … predicts runs again at write start with the real input." becomes "Declarations are recorded once at construction; predicts records its entities, keys and field names, and a field's function is called with the record beneath and the real input at write start and on each replay. A recording parameter read after its callback returns is an error. flow check and an ESLint rule reject JavaScript logic over a recorded value and impure calls in a recorded callback." |
| O1 (EDP:54) | patch fields "are recorded reads, constants or functions (beneath, input) => value; a key is recorded reads and constants; an array key (from the input Schema) is recorded as many and predicts each listed record once" |
| O1 (EDP:64-70) | replay "calls each field's function over the record beneath, a write's patches in written order, all fields of one patch over the same record; a value that throws or that its Schema rejects is skipped: the field keeps its value beneath and still reads predicted" |
| O1 (EDP:73-74) | "on its old or new values; a missing condition field matches" becomes "an answer repairs when a field its condition reads changed, unless the condition gives the same definite answer before and after" |
| O1 (EDP:92-100) | "Predicted fields the response omits" includes skipped ones |
| O1 (new sentence, with merge 4 rule 34) | "A write whose key is recorded as many never takes the default lane key" |
| V1 (EDP:197-199) | "source check rejects conditionals and impurity" becomes "the conformance table passes as the evaluator's golden test; the join rule's counterexamples (a field not carried, an unread field, a definite transition) each have a test; lint goldens with code fix-its that type-check and instructions otherwise" |

**`references/design/entity-domain.md`**

| Where | Amendment |
| --- | --- |
| 2.1 (ED:93, ED:96) | `.predicts`: "fields are reads, constants or (beneath, input) => value"; conditions row lists the new operators |
| 4.1 (ED:336-339) | runtime row: "`.as` mappings and predicted fields' functions, called on each event, and at write start and each replay with the record beneath and the input" |
| 4.3 (ED:375-395) | the table becomes table 3.1 with the conformance table; rules A2, A3, A4; the null split; Dates |
| 4.4 (ED:405-412) | rules A4 and A6 for the order check |
| 4.6 (ED:440-445) | replaced by 3.4 |
| 4.7 (ED:468-483) | the `?:` row reads "flagged by the type-aware lint"; the construction-time check goes; the sealed session is added |
| 5.1 (ED:507-510) | "keeps its value or function" becomes "keeps its value or function, called again over each new base"; rule A9 |
| 5.2 (ED:521-526) | matching becomes rule A5; conditions with `or` or `not` are scanned, never indexed (ED:557-559) |
| 5.5 (ED:613-630) | a skipped field needs its confirming read like any predicted field |
| 7.2 (ED:850-853) | predicted fields print as `title ← input.title` or `likes ← <runtime>` |
| 7.4 (ED:907, ED:910) | `repair` gains `why` (`entered`, `left`, `notCarried`, `failed`, `server`) and a detail, so a Story can assert why a list refetched; `prediction` gains `skipped` |
| 8.3 (ED:998-1004) | name the oracle as where condition exactness meets server truth |
| 9 (ED:1016) | rules A1–A11 |
| 14 (ED:1122) | add TSE and Effect `Order` (PA) |
| 15.1 (ED:1164, ED:1168, ED:1172-1174) | annotate: superseded by merge 5 |

**`CommandLine.plan`**

| Where | Amendment |
| --- | --- |
| O1 (CLP:22-25) | static explain of a machine event "also shows, for a commit to a domain write, its predicted entity, key and field names, the reads they can repair, their carriers and the activities that subscribe them" |
| O5 (CLP:96-97) | "without running application callbacks" becomes "without running application callbacks other than entity domain recorded positions, which App construction calls once with recording proxies" |
| O5 (CLP:95-110) | add: "flow check lints entity domain recorded positions by type: JavaScript logic over a recorded value and impure calls in a recorded callback are errors, with a fix-it that type-checks or an instruction. Over a complete graph it warns on a predicted field no carrier retains (PredictionNotRetained). The same rule ships for ESLint." |
| Q1 (CLP:137-139) | "static-analysis implementation" is decided for domains: one source-and-type-facts adapter, shared with Inspection D2 |

**`Inspection.plan`**

| Where | Amendment |
| --- | --- |
| O1 (INS:16-19) | "actions" gains "each naming the operation it commits or reads"; "each entity domain as recorded" holds predicted field names, `runtime` markers and `many`, never functions |
| D2 (INS:158-161) | the type-facts reader is one adapter, also used by the domain lint, and fails closed for both |

**`references/design/sync-engine-adapter.md`**: SEA:351-353's "by the same recording the entity domain uses for
`.predicts`" becomes "by recording `apply`'s collection set at construction, as entity domains record `.predicts`
structure; both functions then run for real (`apply` inside `tx.mutate`, a domain's field functions at write start)".

**`machine-design.md`**: no change.

**merge 4** (accepted; for when it merges): 3.1 (M4:127) takes the ported `likes` line; M4:74's "the domain's
`.predicts`, with the real input" becomes "the domain's predicted fields' functions, with the real input"; M4:624-625's
"runs `.predicts` with the real input" becomes "calls its predicted fields' functions with the real input"; rule 34
(M4:606-608) gains "A write whose key the Model records as `many` (an array, from the input Schema) never takes the
default"; 6.1 (M4:650) reads "the commit node shows its domain entry's predicted entity, key and field names,
`.alsoChanges` targets and the reads they reach (merge 5, 3.7)".

## 7. Coverage

| Brief item or question | Answer |
| --- | --- |
| Gap 1, logic records one branch (BR:10-11) | the lint (3.6, A10); the types for `===` in `.where` and arithmetic |
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
| Q: migration (BR:68) | 3.8 |
| Hint: `field("likes")` (BR:30); arithmetic (BR:25) | not taken: values are functions |
| Hint: views (BR:36) | not reachable (3.7) |
| Reviews 1 and 2 | [review-1.md](reviews/review-1.md), [review-2.md](reviews/review-2.md) |

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
4. **The TypeScript 7 API dependency** (3.6). *Recommendation:* one adapter, pinned, failing closed, with the ESLint
   rule using it rather than typescript-eslint's parser services; revisit when TypeScript 7's API is stable.

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
  `.as` stays a runtime function; an unevaluable prediction is not shown, the write is still sent, and `skipped` is
  recorded; a sort pair with a `null` key is skipped rather than raising `HiddenOrder` (`nullsFirst`/`nullsLast` later,
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
- **M5-D6 Lint only.** *Choice:* a type-aware lint for `?:`, `&&`, `||` and impure calls in recorded positions, in
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

## New keywords

| Keyword | Meaning |
| --- | --- |
| `or`, `not` | Kleene disjunction and negation |
| `gt`, `gte`, `lt`, `lte` | number and Date order through Effect's `Order`; `null` and a Date tie are maybe |
| `isNull` | the field holds `null`; nullable fields only |
| yes / no / maybe | a condition's three answers; maybe's causes are not carried, failed, server |
| the join rule | repair when a read field changed, unless the same definite answer before and after (A5) |
| record beneath | the visible record under a prediction: base plus older live predictions, in start order |
| `(beneath, input) => value` | a predicted field's runtime function |
| `many` | a recorded array key (A7) |
| sealed session | a recording parameter read after its callback returns is an error |
| skipped (prediction) | a value its function could not give: the value beneath, still predicted (A9) |
| conformance table | the evaluator's golden rows (3.2, M5-D3) |
| the lint | `flow check`'s and the ESLint rule's type-aware check of recorded positions (A10) |
| `PredictionNotRetained` | a predicted field no carrier holds after settlement (warning) |
