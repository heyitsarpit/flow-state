# Proposal: statically analysable entity domains (merge 5)

Status: **accepted by the owner on 2026-10-30, with the decisions in section 10; revised after correctness review 1
([reviews/review-1.md](reviews/review-1.md)); merges after merge 4.** The revision keeps M5-D1 to M5-D4 and carries
them into sections 3–9; the choices the review forced that the decisions do not already settle are listed in section
9 for the owner. It answers [brief.md](brief.md) (items 1–5 and its questions). Nothing here edits a `.plan` file,
`merge-3-stories/` or `merge-4-entities/`; section 6 lists the amendments to apply when it merges. The spike in
[spike/](spike/) checks sections 3.1–3.8 (`tsc -p .` with the root `node_modules/.bin/tsc`, then `bun main.ts`;
output in [spike/output.txt](spike/output.txt)).

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
| MD | `references/explorations/machine-fragments/machine-design.md` |
| M4 | `references/explorations/machine-fragments/merge-4-entities/proposal.md` |
| DD | `references/dispatch-desk/features/Tickets/ticket.domain.ts` |
| EO | `node_modules/effect/src/Order.ts` (Effect 4.0.5, at the repository root) |
| TSE | TanStack DB `packages/db/src/query/compiler/evaluators.ts` at `main` commit `bea84cd4` (read for this proposal; not in the repository) |
| TSIR, TSRP | TanStack DB `packages/db/src/query/ir.ts`, `packages/db/src/query/builder/ref-proxy.ts`, same commit |
| SPK | `merge-5-entity-analysis/spike/` (this proposal's spike) |

## 1. The problem

A domain's declarations are recorded by calling each recorded function once, at construction, with recording proxies
(ED:330-345, EDP:49-52). Recording gives the runtime its description and gives tools what they print, but it has five
gaps (BR:9-18):

1. **Logic in a recorded position records one branch, silently.** `?:`, `&&`, `||` and `if` are "not detectable by
   the proxy or the types" (ED:477). The spike reproduces each: `a || b` records `a`, `a && b` records `b`, and
   `input.status ? … : …` records the first branch, because a proxy is always truthy (SPK `output.txt`, section (a),
   "recording without the source reader"). The only guard is a mandatory `flow check` scan whose shape is unspecified
   (ED:477, ED:1016).
2. **Runtime functions are opaque.** A predicted field's value (`likes: (i) => i.likes + …`, M4:125-128) and a
   `.as` mapping run as JavaScript (ED:339, ED:440-445, ED:464-466); tools see only the entity and field names.
3. **Server behaviour cannot be seen** (ED:148-154). Out of scope (BR:20).
4. **Machine and domain are analysed apart.** `flow check` follows event → commit → ending → handler; the store
   effects of the commit are not on that path (M4 finding A-L2, M4:884-887; accepted as a display, M4:650).
5. **"Static" constructs the App.** The brief says this is "unlike the rest of Flow's analysis" (BR:18, and "like the
   rest of Flow", BR:33). **That hint is half wrong.** All of Flow's static analysis loads the App's modules:
   `inspect(app)` "compiles the App" (INS:12-13), `flow check`, `flow graph` and static `explain` "may load
   declarations" (CLP:31-33), and loading "trusts that code with host authority" (CLP:125-126). Only deny codes are
   read with the compiler (INS:158-161). What *is* unlike the rest is that a domain's construction **calls author
   callbacks**, while the machine Model is built "without running any machine callback" (INS:12-14), and `flow check`
   claims to run "without running application callbacks" (CLP:96-97), which domain construction already contradicts.
   This proposal keeps those calls, makes them pure by rule A8, makes them readable without calling them, and amends
   CLP:96-97 to say what runs (6.4). It does not remove module loading from `flow check`, which machines need too.

A further point surfaced while working the gaps: **arithmetic has nowhere honest to go.** ED:475 sends arithmetic to
"a predicted field's function", which is gap 2.

## 2. Where the data comes from

| Fact | Kept in | Written by | When | Read by |
| --- | --- | --- | --- | --- |
| A recorded position's description (conditions, orders, places, keys, predicted changes and their values) | the App's Model, as plain data (INS:15-20, ED:827-832) | recording proxies calling the position once (ED:341-345) | App construction | the runtime's join, response check and prediction evaluator; `inspect`, `render`, `flow graph`, `flow explain` |
| An opaque value's function | the runtime's live description, beside its Model node; never in the Model, which holds no closures (INS:19-20) | `opaque(...)` at construction | App construction | the evaluator only |
| The same description read from source | `flow check`'s memory only; never saved or printed (6.4, Inspection D1) | the source reader, through `typescript/unstable/async` (root `node_modules/typescript` 7.0.2) | each `flow check` | `flow check`: the lint, and the agreement check against the Model |
| Source positions (file, line) | `flow check` findings | the source reader | each `flow check` | people and agents fixing a finding |
| A predicted value | a live prediction in the store (EDP:64-65) | the one evaluator, from the recorded value, the write's real input and the record beneath (rule A6) | at write start, and again at every replay over a new base | views (`Issue.get`, M4:88), the store |
| A skipped predicted value | the store: the field reads `predicted`, with the value beneath; the trace's `prediction` event, `skipped` with a reason | the evaluator (rule A7) | start or replay | views; settlement, which schedules its confirming read |
| An opaque value's dependencies | the Model, as `opaque(prior.reactions, input.emoji)` | recording | construction | tools; the evaluator, which passes the dependencies' values to the function |
| A `.as` mapping, a commit select | the code | the author | — | the runtime; tools show the entity list or "select: opaque" |
| The machine-to-domain join | `flow explain` and `flow check` output | the CLI, joining the Model's commit-to-operation edges (amended into INS O1, 6.4) with the domains' recorded entries and the impact classifier (ED:836-838) | each invocation | people and agents |

Nothing here reads server behaviour or a view's selector: neither is in the Model.

## 3. Design

### 3.1 One expression language, three positions

Every recorded position is one expression of parameter reads, constants and library operators (ED:480-481, kept). An
expression appears in one of three positions, and the position decides which operators it may use:

- a **condition** (`.where`, `Entity.where`, `.derivedFrom` bindings, ED:338): the client evaluates it in the join
  (ED:521-526) and in the response check (ED:1027), and decides repairs from it, so every operator in it must give
  exactly the value its definition states (M5-D1: exactness protects coherence; it is not a server-agreement
  guarantee);
- a **sort key** (`.orderBy`): a record field only, as today (ED:405-406);
- a **predicted value** (a field of `Entity.patch`): the client evaluates it to show something before the server
  answers; it is a guess, corrected by confirmation (ED:613-630), so it may compute.

The operators and their client semantics. One evaluator runs all of them, the one the runtime uses (SPK
`flow.ts:331-490`). Values are the decoded field values: strings, finite numbers, booleans, `null`, and `Date` for a
field whose Schema decodes to `Date` (M5-D4). "Not carried" means the record (the delta) does not hold the field
(ED:523); rule A12 makes such a condition, and any condition that fails to evaluate, **match**.

| Operator | Client semantics | `null` | An absent optional input | A field not carried, or a bad value | Condition | Predicted value | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eq(a, b)` | strings by code unit, finite numbers by value, booleans; Dates by `getTime()`; a Date never equals a non-Date | `null` equals `null` only; a *present* `null` input constrains the field to `null` | drops the leaf (rule A3) | matches (A12); NaN, ±Infinity or an invalid Date is a failure: matches | yes | yes | existing (ED:377); Date rule **new** |
| `oneOf(a, values)` | some element equals `a`, by `eq` | as `eq` | drops the leaf | matches; a non-array list is a failure | yes | yes | existing |
| `contains(arrayField, v)` | some element equals `v`, by `eq` | an element may be `null`; a `null` field is a failure | drops the leaf | matches | yes | yes | existing |
| `gt`, `gte`, `lt`, `lte` | numbers by `Order.Number`, Dates by `Order.Date` (EO:183, EO:650), after the finiteness and validity check (M5-D2) | `null` is unordered: false; never under `not` (rule A4) | drops the leaf | matches; ordering a Date against a number is a failure | yes | yes | **new** |
| `between(a, from, to)` | `from ≤ a < to`, numbers and Dates | a `null` `a` is false | **drops only the absent bound**; the other stays (ED:393-394) | matches | yes | yes | existing; **restricted** to numbers and Dates (rule A4) |
| `overlaps(s, e, from, to)` | `s < to` and `e > from`, numbers and Dates | a `null` `s` or `e` is false | **drops only the absent bound** | matches | yes | yes | existing; restricted likewise |
| `isNull(a)` | `a === null`; on a nullable field only | — | — | matches | yes | yes | **new** |
| `and(c, …)` | all hold | — | the only place a leaf may hold an optional input (or the whole condition) | — | yes | yes | existing |
| `or(c, …)`, `not(c)` | two-valued | — | type error: use `coalesce` | — | yes | yes | **new** |
| `when(c, a, b)` | `a` if `c` is `true`, else `b`; lazy; `c` is a boolean, never a truthy number | `c` may not order a nullable value | type error in `c` | — | yes | yes | **new** |
| `coalesce(a, b)` | `a` unless it is `null` or absent, else `b` (so a present `null` input takes the default too) | gives a nullable value a default, which also makes it negatable | the way to use an optional input under `or`, `not`, `when` | — | yes | yes | **new** |
| `serverMatches(input, …fields)` | may hold for any record | — | drops | — | **only directly under `and`** (rule A3) | no | existing (ED:383); restricted |
| `add(a, b)`, `sub(a, b)` | IEEE double arithmetic on finite non-null numbers | type error: `coalesce` first | — | a non-finite result, or a beneath field not held, is a failure: skipped (A7) | **no** | yes | **new** |
| `opaque([deps], fn)` | `fn` called with the dependencies' values; its result checked against the field's Schema | — | — | a throw or a Schema mismatch is a failure: skipped (A7) | **no** | yes | **new** |
| `asc(f)`, `desc(f)` | a sort key; `f` is a record field | a pair with a `null` key is skipped (rule A13) | — | a non-finite or invalid key: skipped | order only | no | existing |

**The null-input case.** A field with `input.assignee` *absent* is unconstrained; with `input.assignee` present and
`null`, `eq(record.assignee, input.assignee)` holds only for unassigned records. `coalesce(input.assignee, d)` treats
both alike and yields `d`. An API that sends `null` to mean "any" must be declared with `coalesce` or by leaving the
field absent; the conformance table has both rows.

**Why arithmetic is not in conditions.** The server may add integers exactly, or decimals in base ten, where the
client adds doubles; `0.1 + 0.2` differs between them, so `gt(add(record.price, input.tax), 10)` could hold on the
server and not on the client, and the join would miss a repair. No reference domain needs it. Conditions compare;
predicted values compute. A comparison against a constant or an input stays exact.

**Two-valued, not SQL's three-valued logic.** TanStack DB evaluates `eq`, `gt` and `not` in SQL's three-valued logic:
any comparison with `null` is UNKNOWN (TSE:303-306, TSE:318-321), `not(UNKNOWN)` is UNKNOWN (TSE:428-441), and a WHERE
treats UNKNOWN as false (TSE:85). Flow's conditions describe an API's membership and must answer yes or no for the
join and the response check. Two-valued logic has one trap, which the review found: at `x = null`, `not(lt(x, 5))` is
true while `gte(x, 5)` is false. So an ordering operator on a nullable value may not be negated, by `not` or as
`when`'s condition (a type error, rule A4); `not(lt(coalesce(x, 0), 5))` or `or(isNull(x), gte(x, 5))` says which
answer is meant. `serverMatches` under `not` would exclude every record, and under `or` would swallow its siblings, so
it stands only directly under `and`.

**Left out, with the reason** (each was a candidate from TanStack DB, which evaluates them in JavaScript):

| Candidate | Why not in conditions | Why not in predicted values |
| --- | --- | --- |
| `upper`, `lower` | `toUpperCase`/`toLowerCase` (TSE:516, TSE:523) are not a server collation's folding (`ß`, Turkish `i`) | no reference needs them; a predicted string is an input or a constant |
| `like`, `ilike` | pattern rules and case folding are the server's (TSE:717-727); this is `serverMatches` | — |
| `concat`, `length` | `String(arg ?? "")` and UTF-16 length (TSE:526-555) differ from server strings | `opaque` covers the rare case |
| `date`, `datetime`, `strftime` | time zones and formats (TSE:633-660) | — |
| `caseWhen` | conditions are truthy numbers there (TSE:687-700); `when` takes a boolean only | — |
| `mul`, `divide` | arithmetic is never in conditions | rounding and division by zero (TSE:623-632 returns `null`); none until an app needs one (M5-D4) |
| `isUndefined` | an absent field is the join's case (rule A12), not a value | — |
| string `gt`/`lt` | collation is the server's (ED:408-409 already refuses to check string order) | — |

**Exactness and what the domain still claims.** Each condition operator's semantics is exact on the client. Whether
the *server* filters that way is the domain's claim, as today: the response check catches a returned record that
contradicts it, and audit mode an omission (ED:1027-1028). Two preconditions are stated, not checked: a string `eq`
is right only where the server compares strings exactly (a case-insensitive collation is `serverMatches`; DD's search
key is already normalised that way, `ticket.operations.ts:18`); and number comparisons are right only for numbers
that survive JSON as doubles (a decimal beyond about 15 digits is sent as a string, and strings are not ordered).
Both already hold for `eq` and `between` today.

### 3.2 The conformance table

M5-D3: the client evaluator's own test, CEL-style (PA rows "CEL"), not a client/server agreement suite. Every row is a
row of `spike/conformance.ts`; `main.ts` runs each through the evaluator and prints this table, and 61 of 61 give
their expected result (`output.txt`, section (a)). Conditions are evaluated as the join evaluates them (`matches`);
`r` is the record, `i` the input, `p` the record beneath a prediction. The implementation's suite keeps this table as
its golden file (EDP V1, 6.4).

| operator | written | given | result |
| --- | --- | --- | --- |
| `eq` | `eq(r.s, "a")` | s = "a" | true |
| `eq` | `eq(r.s, "a")` | s = "A" | false |
| `eq` | `eq(r.n, null)` | n = null | true |
| `eq` | `eq(r.n, i.x)` | n = null, x = null (present) | true |
| `eq` | `eq(r.n, i.x)` | n = "a", x = null (present) | false |
| `eq` | `eq(r.n, i.x)` | n = "a", x absent | true |
| `eq` | `eq(r.s, "a")` | s not carried | matches: not carried |
| `eq` | `eq(r.n, 1)` | n = NaN | matches: failed |
| `eq` | `eq(r.t, i.t)` | equal times, two Date objects | true |
| `eq` | `eq(r.t, i.t)` | t = invalid Date | matches: failed |
| `eq` | `eq(r.t, 0)` | t = a Date, against a number | false |
| `oneOf` | `oneOf(r.s, i.xs)` | s = "b", xs = ["a", "b"] | true |
| `oneOf` | `oneOf(r.s, i.xs)` | s = "b", xs = [] | false |
| `oneOf` | `oneOf(r.s, i.xs)` | xs absent | true |
| `oneOf` | `oneOf(r.t, [i.t])` | t equal by time | true |
| `contains` | `contains(r.tags, "x")` | tags = ["x"] | true |
| `contains` | `contains(r.tags, "x")` | tags = [] | false |
| `contains` | `contains(r.tags, i.tag)` | tag absent | true |
| `contains` | `contains(r.tags, "x")` | tags = null | matches: failed |
| `lt` | `lt(r.n, 5)` | n = 3 | true |
| `lt` | `lt(r.n, 5)` | n = null | false |
| `gte` | `gte(r.n, 5)` | n = 5 | true |
| `gte` | `gte(r.n, 5)` | n = null | false |
| `lte` | `lte(r.n, 5)` | n = 6 | false |
| `gt` | `gt(r.n, 5)` | n = Infinity | matches: failed |
| `gt` | `gt(r.n, 5)` | n = {} (bad data) | matches: failed |
| `lt` | `lt(r.n, i.x)` | x absent | true |
| `lt` | `lt(r.t, i.t)` | t earlier (Dates) | true |
| `lt` | `lt(r.t, i.t)` | t = invalid Date | matches: failed |
| `lt` | `lt(r.t, 5)` | a Date against a number | matches: failed |
| `between` | `between(r.n, 1, 3)` | n = 1 | true |
| `between` | `between(r.n, 1, 3)` | n = 3 | false |
| `between` | `between(r.n, i.from, i.to)` | from absent, to = 3, n = -100 | true |
| `between` | `between(r.n, i.from, i.to)` | from absent, to = 3, n = 5 | false |
| `between` | `between(r.n, i.from, i.to)` | both absent, n = null | true |
| `between` | `between(r.n, 1, 3)` | n = null | false |
| `between` | `between(r.t, i.from, i.to)` | Dates, inside | true |
| `overlaps` | `overlaps(r.s, r.e, 2, 5)` | [1, 3) | true |
| `overlaps` | `overlaps(r.s, r.e, 2, 5)` | [1, 2) | false |
| `overlaps` | `overlaps(r.s, r.e, i.from, i.to)` | to absent, from = 2, [10, 11) | true |
| `overlaps` | `overlaps(r.s, r.e, i.from, i.to)` | to absent, from = 2, [0, 1) | false |
| `overlaps` | `overlaps(r.s, r.e, 2, 5)` | e = null | false |
| `isNull` | `isNull(r.a)` | a = null | true |
| `isNull` | `isNull(r.a)` | a = "x" | false |
| `isNull` | `isNull(r.a)` | a not carried | matches: not carried |
| `not` | `not(isNull(r.a))` | a not carried | matches: not carried |
| `not` | `not(eq(r.s, "a"))` | s = "b" | true |
| `not` | `not(lt(coalesce(r.n, 0), 5))` | n = null (coalesce guards it) | false |
| `or` | `or(isNull(r.a), eq(r.a, i.me))` | a = null | true |
| `or` | `or(isNull(r.a), eq(r.a, i.me))` | a = "bo", me = "ana" | false |
| `when` | `when(isNull(r.a), true, eq(r.a, "x"))` | a = null | true |
| `coalesce` | `eq(r.s, coalesce(i.s, "open"))` | s = "open", input s absent | true |
| `coalesce` | `eq(r.s, coalesce(i.s, "open"))` | s = "open", input s = null (present) | true |
| `and` | `and(eq(r.w, i.w), serverMatches(i.q, r.title))` | any title | true |
| `add` | `add(p.n, 1)` | n = 2 | value 3 |
| `add` | `add(p.n, 1)` | n not held | fails (skipped, rule A7) |
| `add` | `add(p.n, p.n)` | n = 1e308 (overflow) | fails (skipped, rule A7) |
| `sub` | `sub(p.n, i.k)` | n = 10, k = 3 | value 7 |
| `when` | `when(i.b, 1, add(p.missing, 1))` | b = true (the other branch is not evaluated) | value 1 |
| `coalesce` | `coalesce(p.n, 0)` | n = null | value 0 |
| `opaque` | `opaque([p.n], throws)` | the function throws | fails (skipped, rule A7) |

### 3.3 Conditions

```ts
// dispatch-desk (DD:32-39): unchanged; every position was already operator syntax.
.where(({ input, record }) =>
  and(
    eq(record.workspaceId, input.workspaceId),
    eq(record.status, input.status),           // absent status: no constraint (directly under `and`)
    eq(record.assignee, input.assignee),       // a null assignee equals no input value
    serverMatches(input.search, record.title), // only directly under `and`
  ))

// A queue of mine or nobody's, updated before a time the machine supplies:   // ← NEW
.where(({ input, record }) => eq(record.workspaceId, input.workspaceId))
.where(({ input, record }) =>                                    // several .where calls: and(first, second)
  and(
    or(isNull(record.assignee), eq(record.assignee, input.me)),  // ← NEW: or, isNull
    lt(record.updatedAt, input.before),                          // ← NEW: lt on a number
  ))

// Dates: an absent bound is no bound, and the other bound stays:   // ← NEW
.where(({ input, record }) =>
  and(eq(record.calendarId, input.calendarId), overlaps(record.startsAt, record.endsAt, input.from, input.to)))

// An optional input under `or`, `not` or `when` is a type error; say what absent means:
eq(record.status, coalesce(input.status, "open"))                  // ← NEW: absent (or null) means "open"
// or(eq(record.status, input.status), …)   ✗ an optional input under or
// not(lt(record.dueAt, input.day))          ✗ dueAt is nullable: write or(isNull(record.dueAt), gte(record.dueAt, input.day))
```

The join, the `Entity.where` overlap rule (ED:456-458, "anything else counts as overlapping") and the indexes
(ED:557-559, equality and range only) need no change: `or`, `not` and `when` count as overlapping and are scanned.
`flow explain` prints `or` and `not` as words, `isNull` as "has no assignee".

### 3.4 Predicted values

A predicted field's value is an expression over `input` and the **record beneath** the prediction, which the
per-field function's parameter names. The function is still the author's shape (EDX:53, EDX:99, M4:127); its body is
now an operator expression, recorded once like every other position:

```ts
// merge 4's Issues.setLike (M4:125-128), ported. One line changes.
setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, {
  liked: input.liked,
  likes: (i) => add(i.likes, when(eq(input.liked, i.liked), 0, when(input.liked, 1, -1))),   // ← NEW
  //  was: (i) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1)
})),

// entity-domain-examples' transfer (EDX:98-101): two records, each value over its own record beneath.
transfer: write(transfer).predicts(({ input }) => [
  Account.patch(input.from, { balance: (a) => sub(a.balance, input.amount) }),   // ← NEW: was a.balance - input.amount
  Account.patch(input.to,   { balance: (a) => add(a.balance, input.amount) }),
]),

// Real data work stays a function, but declares what it reads (EDX:50-55):
react: write(react).one(Message).predicts(({ input }) => Message.patch(input.key, {
  reactions: (m) => opaque([m.reactions, input.emoji], (rs, emoji) => addReaction(rs, emoji)),   // ← NEW
})),

// A bulk write (ED:444-445): an array key predicts each listed record.
archive: write(archiveUsers).predicts(({ input }) => User.patch(input.keys, { status: "archived" })),
```

- **Recorded once, evaluated by one evaluator.** `.predicts` no longer "runs twice" (ED:440-445, ED:1172-1174,
  EDP:51-52). Its single run at construction records the changes, entities, keys, field names *and* values. At write
  start the evaluator computes each key from the real input and each value over the record beneath; at every base
  change it evaluates the values again (rule A6).
- **Keys are reads, not computations.** A key is parameter reads and constants: `when`, arithmetic or `opaque` in a
  key is a type error (SPK `types.ts`, "`when` in a key"). So which records a write predicts depends only on its
  input's shape, not on a condition.
- **Array keys.** `User.patch(input.keys, …)` is a key whose Schema is an array. It is evaluated at start: each listed
  record is predicted once (duplicates are one record), and the write joins each record's queue once (EDP:112-114).
  Because the count is known only at start, such a write **never takes merge 4 rule 34's default lane key**
  (M4:606-608: "predicts exactly one record"), even when the array has one element; whether a key is an array is read
  from the operation's input Schema, so the default is decided statically. It keeps its declared key or `{}`, as
  rule 34 already says for multi-record writes. An empty array predicts nothing and joins no queue.
- **Two patches to one record** apply in written order, the second over the first, and join that record's queue once.
- **Why `opaque` takes its dependencies.** The callback runs once, at construction, so `input` inside it is a
  recording proxy; today's design works around that by running `.predicts` twice (ED:1172-1174). An opaque function
  that receives its values as arguments needs no second run, is typed by its dependency list, and tells tools what it
  reads. A body that closes over `input` instead is a `flow check` error with a fix-it (rule A9).
- **The set of changes is structure.** `when` and arithmetic appear inside a field's value, never around a change: a
  type error says so (SPK `types.ts`, "`when` around changes").
- **Replay** (ED:507-510) is unchanged in kind: the values are recomputed over each new base in start order. The spike
  runs merge 4's like scenario (base `liked false, likes 5`; like A shows `6`; unlike B queued behind shows `5`; a
  push sets `liked true, likes 9` and the replay shows `liked false, likes 8`; A fails, B alone still `8`; B fails, the
  base `9` shows), and the operator form equals the JavaScript function it replaces in all 186 base × sequence cases.
- **A value that cannot be evaluated** (a beneath field the store does not hold, a non-finite sum, an opaque body that
  throws or returns a value its Schema rejects) is **skipped**, rule A7: the field keeps the value beneath but still
  reads `predicted`, the other fields are unaffected, the write is still sent, and at settlement the field counts as
  predicted, so if the response omits it, it is unconfirmed and a confirming read is scheduled (EDP:92-100,
  ED:613-630). Without that last step a skipped field would never be confirmed and could show a stale value; the
  spike tests it (`output.txt`, section (c), "the skipped field is unconfirmed").

### 3.5 `.as` mappings stay runtime functions

```ts
// DD:81-88: unchanged. A runtime position: ordinary code, shown as an opaque mapping (ED:853).
events: listen(ticketEvents).as([Ticket], (event) =>
  event._tag === "TicketSaved" ? Ticket.save(event.ticket) : Ticket.delete({ … }, { version: event.revision })),
```

A stream event is a tagged union; `when(eq(event._tag, "TicketSaved"), Ticket.save(event.ticket), …)` would not type,
because `event.ticket` exists only on one member, so a recorded mapping needs a `match` operator: a new concept. The
gain would be display only: the join never reads the mapping (it reads the delta the mapping produced, ED:502), and
its result is already checked against the listed entities (ED:464-466, ED:1021). M5-D4 keeps `.as` a runtime
function; `?:` inside it is allowed and the source reader does not lint it.

### 3.6 Two readers, one description

Recording stays: it is how the runtime gets its description (the join, the response check, the evaluator), and Flow
keeps one runtime. **Source reading is added as a checker, not a second representation**: what it builds lives in
`flow check`'s memory, is compared with the Model and discarded, and nothing prints or saves it (an Inspection D1
amendment says so, 6.4, since INS:155-157 makes the Model "the only structural representation"). `flow check` reads
every domain declaration through the TypeScript compiler API into the same description, and:

1. **lints** every recorded position: anything that is not a parameter read, a constant or a library operator is an
   error naming the file, line and entry, with a fix-it in operator syntax (rule A8);
2. **compares** the source description with the recorded one in the Model, entry by entry, and reports
   `DomainSourceMismatch` for the first node that differs, with both renderings (rule A10);
3. **attaches source positions** to its findings, which recording cannot give.

```text
$ flow check
domains/legacy.ts:14 issues.setLike  error  logic   JavaScript arithmetic or comparison on a recorded value
    fix-it (starting point): add(i.likes, when(eq(input.liked, i.liked), 0, when(input.liked, 1, -1)))
domains/legacy.ts:22 tickets.either  error  logic   `||` records only its first operand; write or(...)
    fix-it (starting point): or(eq(record.status, "open"), eq(record.assignee, input.assignee))
domains/legacy.ts:30 tickets.both    error  logic   `&&` records only its second operand; write and(...)
    fix-it (mechanical): and(eq(record.workspaceId, input.workspaceId), eq(record.status, "open"))
domains/legacy.ts:34 tickets.recent  error  impure  `Date.now()` runs once, at construction, and is recorded as a constant
    fix-it: pass the value as an input field the machine supplies (input.now)
domains/legacy.ts:40 chat.react      error  opaque-closure  the opaque function closes over `input.emoji`
    fix-it (mechanical): opaque([m.reactions, input.emoji], (rs, emoji) => addReaction(rs, emoji))
domains/legacy.ts:50 <unknown>       error  unreadable-domain  a factory or a computed id is not read in version 1
```

(From `output.txt` section (d), shortened.)

**What the source reader accepts.** Library operators by the symbol they resolve to: a direct import, an alias, a
namespace import (`import * as F`, then `F.or`) and re-exports through a barrel (`export { eq } from`, `export *
from`), all resolved to the one library module by its exact specifier (`flow-state`), never by a suffix. Constants:
literals, a module `const` with a literal initializer, a member of an `as const` object, an enum member. Wrappers that
do not change a value: parentheses, `as`, `<T>`, `!`, `satisfies`. Parameter reads: property access, element access
with a literal (`input["a"]`), a single-parameter callback (`(c) => c.record.x`) and nested destructuring
(`({ input: { workspaceId } })`). The spike's `domains/variants.ts` writes each of these, and source and recording
agree on it with no findings.

**What it rejects.** A call to anything else in a recorded position, including the author's own helper (M5-D4: no
helpers in version 1), is an error with "inline it as operators". A domain built by a factory or with a computed id,
or an entry that is not `read(op)…`, `write(op)…` or `listen(op)…` written in place, is `unreadable-domain`, an error
(ED:482-483: a declaration the reader cannot read is an error, not a pass). It is reported as unreadable and not
compared, so correct code is never told it mismatches.

**When they disagree.** On a declaration that passes the lint, both readers read the same parameter paths, constants
and operator calls. A disagreement therefore means the lint missed a construct (a reader bug), or the code that ran is
not the code that was read (a stale build, a generated file). The spike exercises the second: `domains/stale.ts` is
lint-clean and its previous build is what runs, and the check reports `stale.list` at `orderBy.0.op`, recorded `asc`,
source `desc` (`output.txt`, section (b)). It is an error, with no option to accept it (errors carry information,
never configuration). **The claim covers recorded positions only:** an `opaque` body, a `.as` mapping and a commit
select are not in the description, so a stale build that changed only those is not caught.

**Fix-its are syntactic** and say which kind they are. A **mechanical** fix-it (`&&` to `and`, `===` to `eq`, `+`/`-`
to `add`/`sub`, `<` to `lt`, a missing opaque dependency) means the same thing. A **starting point** introduces `or`,
`not`, `when` or `coalesce` (`||`, `!`, `!==`, `?:`, `??`), where rules A3 and A4 apply, so the types decide: the
`||` fix-it puts the optional `input.assignee` under `or`, which rule A3 rejects, and the `?:` fix-it for
`input.status ? … : …` is `when(input.status, …)`, a type error whose right form is `eq(record.status,
coalesce(input.status, "open"))` (SPK `types.ts`, last expected error).

### 3.7 What stays opaque, and what `flow check` promises about it

| Opaque | Shown as | `flow check` promises | It cannot promise |
| --- | --- | --- | --- |
| `opaque([deps], fn)` in a predicted value | `reactions ← opaque(prior.reactions, input.emoji)` | the entity, key and field (so queues, lane keys, failure repair of "all predicted fields", ED:609, stay exact); the dependency list; the result's type; no known impure call (`Date`, `Math.random`, `crypto`, `performance`, `new Date`) and no closure over `input` in the body | that functions the body calls are pure; that the value is right; that the running body is the one in the source |
| a `.as` mapping | "changes Ticket (opaque mapping)" (ED:853) | the entities it may change (types, and at runtime, ED:1021) | which events save and which delete |
| a commit's select | "select: opaque" in the join (3.8) | its input type | which event fields reach which input field |
| `serverMatches` | "the server matches input.search on title" | which inputs and record fields it names; that a change to them repairs (ED:142-144) | the server's matching |

### 3.8 The machine and the domain, joined

`flow explain` for a machine event (CLP:22-25) and `flow check` follow one more edge: from a commit to the domain
entry its operation is registered in (ED:33-35), then through the recorded `.predicts` and `.alsoChanges` to every
read on that entity in the App, classified by the same impact classifier as `flow explain <domain>` (ED:836-838), then
to the machine activities that subscribe those reads.

```text
$ flow explain Issues/List READY Toggle
Toggle      READY → READY; updateMemory likeUnsure; commits Issues.setLike (select: opaque)
  setLike   writes one Issue; one at a time per record; lane key input.key (rule 34)
    at start  liked ← input.liked                                                     // ← NEW: values, not just names
              likes ← add(likes, when(eq(input.liked, liked), 0, when(input.liked, 1, -1)))
    repairs   Issues.list: no (liked, likes are neither condition nor order fields)
    retained  by the write's own response (.one(Issue)) and Issues.list (carries liked, likes)
    shown in  Issues.list, subscribed by Issues/List READY.activities.issues
  endings   success → Settled; failure.Gone → IssueGone, Refused | NotSent → Failed; unknown → LikeUnsure
```

- **How it is computed.** From the Model alone: actions, activities and operation descriptors are in it (INS:16-19),
  domains "as recorded" (INS:19-20), and the impact classifier is the runtime's (ED:836). The edge from an action to
  the operation it commits or reads is not listed in INS O1 today; 6.4 adds it. No machine callback, adapter or Layer
  runs; the only callbacks the Model's construction runs are domain recorded positions, which rule A8 makes pure.
- **Where it stops.** At subscribing activities. Views (`useView` selectors, `Issue.get` in a component, M4:303-306)
  are not in the Model, so "the views that read them" (BR:36) cannot be joined; that part of the hint is wrong.
- **One finding it enables: `PredictionNotRetained`** (a warning). A predicted field with no carrier is dropped at
  settlement unless the response carries it (EDP:99-100), so the predicted value shows while the write is in flight
  and then disappears until a reader fetches the field. The carriers counted are the write's own response shape
  (`.one`/`.list` places of the write), every read entry's shape and every `.byKey` loader on the entity (EDP:15-16's
  "carrier"), across the complete declared graph, lazy entries included (CLP:96). Views reading through `Issue.get` are
  not carriers: they see the prediction, then the dropped field. The warning is issued only when the Model is complete;
  if a lazy entry failed to load, `flow check` already fails to load the graph (CLP:108-109) and says nothing about
  retention.

This refines merge 4's accepted display row (M4:650, M4:884-887) from "entity and fields" to the chain above. No rule
in `machine-design.md` changes.

### 3.9 Migration, line by line

| Domain | Line | Before | After |
| --- | --- | --- | --- |
| dispatch-desk tickets (DD) | 3 | imports `and, asc, desc, domain, entity, eq, listen, read, serverMatches, write` | unchanged |
| | 30-48, 51-55 | conditions, order, paging | unchanged: already operators; `serverMatches` already directly under `and` |
| | 59-79 | `.predicts` of inputs and the constant `"assigned"` | unchanged: already a recorded value |
| | 81-88 | `.as` with `?:` | unchanged: a runtime position |
| merge 4 `Issues` (M4:119-132) | 120 (import, not shown in M4) | `eq, asc, desc, …` | adds `add, when` |
| | 127 | `likes: (i) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),` | `likes: (i) => add(i.likes, when(eq(input.liked, i.liked), 0, when(input.liked, 1, -1))),` |
| | 340 (the excerpt in 3.2) | `likes: …` | unchanged |
| entity-domain-examples (EDX) | 53 | `reactions: (m) => addReaction(m.reactions, input.emoji),` | `reactions: (m) => opaque([m.reactions, input.emoji], (rs, emoji) => addReaction(rs, emoji)),` |
| | 99-100 | `balance: (a) => a.balance - input.amount` / `+` | `balance: (a) => sub(a.balance, input.amount)` / `add(…)` |
| | 185 | `User.patch(input.keys, { status: "archived" })` | unchanged; never takes rule 34's default (3.4) |
| | 58-61, 340 | `.as` mappings | unchanged |
| ED notes app (ED:259-261) | — | `.as` with `?:` | unchanged |

DD needs no change at all. The spike ports it with only the stand-in entity declaration differing (no Schema in the
spike, `spike/domains/tickets.ts:1-3`).

## 4. Rules

Numbered A1–A13 (analysis), for `entity-domain.md` section 9; they do not extend machine-design.md's numbering.

- **A1. Three positions.** A recorded expression is a condition, a sort key or a predicted value. Its position
  decides its operators (table 3.1); an operator outside its positions is a type error.
- **A2. Conditions are exact and two-valued.** Every condition operator is defined over decoded values by table 3.1
  and the conformance table (3.2), and answers `true` or `false`; `null` is a value (equal to `null`, unordered).
  Dates compare by `getTime()`. No arithmetic, opaque value, string order, string transform or date logic beyond
  equality and order appears in a condition; those are `serverMatches`.
- **A3. An absent optional input drops a constraint only directly under `and`, or as the whole condition.** A
  comparison leaf that reads it holds; `between` and `overlaps` drop only the absent bound. Under `or`, `not` or
  `when`'s condition it is a type error, and `coalesce(input.x, value)` says what absent means. A present `null` input
  is a value, not an absence. `serverMatches` likewise stands only directly under `and`. (Amends ED:391-395.)
- **A4. Ordering takes numbers and Dates, through Effect's `Order`.** `gt`, `gte`, `lt`, `lte`, `between`, `overlaps`
  and the order check compare numbers with `Order.Number` after a finiteness check and Dates with `Order.Date` after a
  validity check (M5-D2); strings, and a Date against a number, are type errors. An ordering operator on a nullable
  value may not be negated (`not`, `when`'s condition) unless coalesced: a type error.
- **A5. Predicted values compute; their structure is static.** A patch field's value is a constant, an input read,
  an operator expression over `input` and the record beneath (the per-field function's parameter), or `opaque([deps],
  fn)`. A key is parameter reads and constants only. `when` and arithmetic never decide which changes a write makes or
  which records they name. An array key is evaluated at start, predicts each listed record once, and never takes
  merge 4 rule 34's default lane key.
- **A6. One evaluation rule for predictions.** At write start each key is evaluated from the input, and every value
  over the visible record beneath the prediction (the base with older live predictions, in start order, and earlier
  patches of the same write in written order). All fields of one patch read the same record beneath (simultaneous
  assignment). Every base change re-evaluates the values; the input never changes. `.predicts` is recorded once and
  never called again.
- **A7. A value that cannot be evaluated is skipped and still predicted.** A non-finite result, an opaque body that
  throws or a result its field's Schema rejects, or a beneath field the store does not hold: that field keeps the
  value beneath and reads `predicted`, the other fields are unaffected, the write is still queued and sent, and the
  `prediction` event records `skipped` with the reason. At settlement it counts as a predicted field: if the response
  omits it, it is unconfirmed and a confirming read is scheduled (EDP:92-100).
- **A8. A recorded position is checked from source.** `flow check` reads every recorded position with the compiler.
  Anything other than parameter reads, constants and library operators, in the forms 3.6 lists, is an error with its
  file, line, entry and a fix-it marked mechanical or starting point. Runtime positions (`.as`, commit selects,
  `opaque` bodies apart from rule A9) are not linted.
- **A9. An opaque function is a function of its arguments.** Its body may not close over the callback's parameters
  (an error with the dependency-list fix-it) or make a known impure call (an error). It is replayed, so it must give
  the same result for the same arguments.
- **A10. The two readers agree on recorded positions, or `flow check` fails.** The source description and the
  recorded description are compared entry by entry; any difference is `DomainSourceMismatch`, an error naming the
  entry, the first differing node and both renderings. A declaration the reader cannot read is `unreadable-domain`, an
  error, and is not compared. Opaque bodies, `.as` mappings and selects are outside the comparison.
- **A11. The join is read from the Model.** `flow explain` and `flow check` join actions to the operations they
  commit, to domain entries, predicted values and impact rows, and stop at subscribing activities. A predicted field
  no carrier holds (the write's own response, a read entry, a loader) is the warning `PredictionNotRetained`, issued
  over a complete declared graph only.
- **A12. A condition that cannot be decided matches.** When a condition reads a field the record does not carry, or
  fails to evaluate (a bad value, an operator outside its position), it counts as met: the join repairs (ED:523's rule,
  extended to failures), and the response check reports no contradiction. Being conservative, it costs a refetch, never
  a missed repair.
- **A13. The order check skips what it cannot order.** Within a response, a pair of records whose checked sort key is
  `null`, non-finite or an invalid Date on either side is skipped, not reported as `HiddenOrder` (M5-D4; the server's
  null placement is unknown). Unequal string keys leave the pair undecided, as ED:408-410 already says.

Unchanged: repair rules (ED:109-129), the join (ED:516-559) apart from A12's extension, the ordering rule and contests
(ED:592-602), write endings (ED:604-611), record queues (ED:639-654) and merge 4 rules 26-38. Operator-built values
change none of them: predictions still change visible values only and never start a repair (ED:504-506); the
predicted field names, which decide failure repair (ED:609) and confirmation (ED:613-630), are still recorded, skipped
ones included (A7); and the records a write predicts depend only on its keys, which are reads (A5).

## 5. How it is implemented

One runtime: the evaluator in the store is the only code that gives an expression a value (the join, the response
check, the order check and predictions call it). The CLI never evaluates a condition; it prints and classifies.

- **Library.** Operators build plain description nodes, as today's `eq` does (ED:341-343, TanStack DB's `ref`, `val`,
  `func`, TSIR:205-263). The phantom types carry four facts per expression: its value type; whether it may stand only
  directly under `and` (it reads an optional input, or is `serverMatches`); whether it uses a value-only operator; and
  whether it orders a nullable value (SPK `flow.ts:22-50`). Parameter reads carry a brand, so a key cannot be a
  computed expression (SPK `flow.ts:201`). `Entity.patch` calls each per-field function once with a proxy rooted at
  the record beneath. `opaque` records its dependencies; the runtime keeps the function beside the node in its live
  description, and the Model holds only the dependency list.
- **Recording proxies** stay as they are, including the conversion hook ED:475 already specifies ("the proxy throws
  from its conversion hooks and names the place"); the spike implements it (SPK `flow.ts:53-67`), so `i.likes + 1`
  fails at construction naming `prior.likes`.
- **The evaluator** (SPK `flow.ts:331-490`) checks every compared value first (finite, a valid Date, present), orders
  with `Order.Number`, `Order.Date` and `Order.Boolean`, and returns, for a condition, `matches` with the reason
  (`evaluated`, `notCarried`, `failed`). `replay` skips a field that fails and reports it; `settle` counts skipped
  fields as predicted and retires older predictions of a confirmed field (ED:511-513).
- **The source reader** runs inside `flow check` only, through `typescript/unstable/async` (the root
  `node_modules/typescript` 7.0.2; the `unstable/sync` client needs Node's stream internals and fails under bun, the
  async one works in both). It opens the project's `tsconfig.json`, walks each `domain(id, { … })` call, and reads
  each recorded position into the description. The real reader resolves names with the checker
  (`getSymbolAtLocation`); the spike resolves imports, namespace imports and re-exports syntactically.
- **The join** is a CLI projection over the Model plus the existing impact classifier.

**The spike** (SPK, about 1,800 lines; `output.txt`): a stand-in library (`flow.ts`: operators, proxies, entries, the
evaluator, start, replay, settle, the order check), the two reference domains ported (`domains/tickets.ts`,
`domains/issues.ts`), spike-only extras (`domains/extras.ts`: a transfer, an opaque reaction, two `.where` calls, a
calendar over Dates, a bulk archive, two patches to one record), reader variants (`domains/variants.ts`,
`domains/lib.ts`), a stale build (`domains/stale.ts`, `domains/stale.previous-build.ts`), legacy declarations
(`domains/legacy.ts`, `@ts-nocheck`), the conformance rows (`conformance.ts`), the source reader (`source.ts`) and the
checks (`types.ts`, `main.ts`). Result: **ALL PASS, 64 checks.**

| Item | Result |
| --- | --- |
| (a) the operator set types, records and evaluates; both branches of `when` | **pass.** `tsc`: 0 errors; 23 `@ts-expect-error` lines hold, each for its stated reason (the compiler messages are listed in the review record), and five exact-type assertions and three allowed forms compile. The recorded `likes` holds both `when`s; each branch evaluates; 61/61 conformance rows; ticket, queue (two `.where` calls) and calendar (Date `overlaps`, `between` with one bound) conditions; the order check (Order, null and NaN pairs skipped); recording alone reproduces the four silent failures and the arithmetic error |
| (b) source reading equals recording, and catches a stale build | **pass.** tickets 6, issues 5, extras 9 and variants 4 entries identical; 0 findings outside the legacy file; the stale build is `DomainSourceMismatch` at `list.orderBy.0.op`; on legacy declarations they disagree on exactly the four entries recording got wrong; a factory is `unreadable-domain`, not a mismatch |
| (c) predicted values at start, replay, skip and settle | **pass.** Keys at start; merge 4's like scenario; 186/186 cases equal the old function; settlement and retirement; A7 (a missing beneath field, a throwing opaque body, a non-finite sum) with the skipped field unconfirmed at settlement; transfer; a predicted delete and its retraction; two patches to one record; array keys (deduplicated, no rule-34 lane key, one element included); a predicted Date |
| (d) the reader flags `?:`, `&&`, `||` and impure calls with a fix-it | **pass.** Each check compares the fix-it text and its kind, not the message; `?:` in a predicted value is its own finding; the `||` fix-it is a starting point; the `setLike` fix-it is byte-identical to the ported line |

What the spike does not model: Effect Schema (entities are plain types, so no Schema decoding and no Schema check of
opaque results; a Date field is any `Date` value), the store, the join and its indexes, the response check (beyond
`matches` and the order check), confirming-read scheduling (beyond reporting unconfirmed fields), uncertain endings
and restore, the input rule (ED:136-141), `.alsoChanges`, `Entity.where` targets, nested places, paging, the
checker-based name resolution, the static decision that a key is an array (from the input Schema), the join of 3.8
and the `PredictionNotRetained` warning.

## 6. Changes

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| `or`, `not`, `gt`, `gte`, `lt`, `lte`, `isNull`, `when`, `coalesce` | condition and value operators | table 3.1 |
| `add`, `sub` | value operators | predicted values only |
| `opaque([deps], fn)` | value operator | a runtime function with declared dependencies (rule A9) |
| The conformance table | test | 3.2 (M5-D3) |
| The record beneath as the per-field function's parameter | semantics | rule A6; the parameter existed (ED:443), its value is now defined |
| Source reading in `flow check` | tooling | rules A8, A10 |
| `DomainSourceMismatch`, `unreadable-domain` | `flow check` errors | rule A10 |
| Finding rules `logic`, `impure`, `outer-value`, `unknown-call`, `opaque-closure`, `one-expression` | `flow check` reasons | rules A8, A9 (CLP:105-107's stable rule reason) |
| Fix-it kinds `mechanical`, `starting point` | finding field | 3.6 |
| `PredictionNotRetained` | `flow check` warning | rule A11 |
| `skipped` on the `prediction` trace event | evidence | rule A7 |
| "A condition that cannot be decided matches" | join rule | rule A12 |
| The null-pair skip in the order check | order rule | rule A13 (M5-D4) |
| The machine-to-domain chain in `flow explain` | tooling | 3.8 |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| `.predicts` | recorded, then "runs again at write start with the real input" (EDP:51-52, ED:440-445) | recorded once; its description is evaluated at start and at each replay (rule A6) |
| A predicted field's function | ordinary code over the record (ED:443-444) | an operator expression over the record beneath, or `opaque` |
| Keys | any recorded value | parameter reads and constants; an array key never takes rule 34's default (rule A5) |
| Arithmetic | "belongs in a predicted field's function" (ED:475) | `add`/`sub` in predicted values; never in conditions |
| Absent optional inputs | drop the constraint "for every operator" (ED:391-395) | only directly under `and` or as the whole condition; `between`/`overlaps` drop only the absent bound (rule A3) |
| `serverMatches` | anywhere in a condition | only directly under `and` (rule A3) |
| `between`, `overlaps` | any field type | numbers and Dates (rule A4) |
| Client order comparison | unspecified | Effect's `Order.Number` (after a finiteness check) and `Order.Date` (M5-D2, rule A4) |
| A response pair with a `null` sort key | compared (ED:408-412) | skipped (rule A13) |
| A condition over a field not carried | "counts as meeting the condition" (ED:523) | the same, extended to a condition that fails to evaluate (rule A12) |
| The `?:`/`&&` check | "a mandatory flow check rule … also run at construction in development" (ED:477, ED:1016) | a source lint in `flow check` with fix-its (rule A8); not at construction, by M5-D4 |
| Source and recording | one reader (recording); the source check is a scan | two readers of one description; disagreement on recorded positions is an error (rule A10) |
| `flow explain` for a machine event | possible transitions, denials, fallthrough (CLP:23-25) | also the store-effect chain (3.8) |
| Merge 4's store-effect display (M4:650) | the predicted entity and fields | entity, key, field values and the reads they reach (3.8) |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| "`.predicts` runs twice" | ED:440-445, ED:1172-1174, EDP:51-52 | values are recorded; `opaque` receives its input values as arguments |
| The construction-time source check in development | ED:477, ED:1016 | a choice (M5-D4: the agreement check runs only in `flow check`). INS:174-176 keeps the compiler out of the library's packages, not out of a separate development tool, so such a tool would be possible; it would be a second home for the same check |
| "not detectable by the proxy or the types" as the whole answer | ED:477 | still true of the proxy and the types; `flow check` now detects it from source |

### 6.4 Amendments by target

Applied when this proposal merges.

**`EntityDomains.plan`**

| Where | Amendment |
| --- | --- |
| O1 (EDP:29-31) | "Conditions use where (eq, oneOf, contains, between, overlaps, and)" becomes "Conditions use eq, oneOf, contains, between, overlaps, gt, gte, lt, lte, isNull, and, or, not, when and coalesce, two-valued over decoded values (Dates by time); ordering operators take numbers and Dates and compare them with Effect's Order.Number, after a finiteness check, and Order.Date; an ordering of a nullable value is never negated; a condition that reads a field the record does not carry, or fails to evaluate, counts as met". "An absent optional input drops its constraint" gains "directly under and or as the whole condition; between and overlaps drop only the absent bound; elsewhere it is a type error and coalesce gives it a value. serverMatches stands only directly under and." |
| O1 (EDP:37-41) | "Each response is checked on its own number, boolean, date and key-field values" gains "compared with Effect's Order; a pair whose checked key is null, non-finite or an invalid Date is skipped, never HiddenOrder" |
| O1 (EDP:49-52) | "Declarations are recorded once at construction. … predicts runs again at write start with the real input." becomes "Declarations are recorded once at construction, predicted values included, and never called again. A recorded position is one expression of parameter reads, constants and library operators; flow check reads it from source, rejects anything else with a fix-it, and fails if the source and recorded descriptions of its recorded positions differ." |
| O1 (EDP:54) | "predicts returns Entity.patch(key, fields)" gains "whose key is parameter reads and constants and whose field values are constants, input reads, operator expressions over the input and the record beneath (add, sub, when, coalesce), or opaque([deps], fn); which changes a write makes never depends on a value. An array key predicts each listed record once, evaluated at start" |
| O1 (EDP:64-65, EDP:70) | "visible is base plus live predictions replayed over each new base" gains "each value evaluated over the record beneath it, all fields of one patch over the same record, a write's patches in written order; a value that cannot be evaluated is skipped: the field keeps its value beneath, still reads predicted and is confirmed like any predicted field, and the write still runs" |
| O1 (EDP:92-100) | "Predicted fields the response omits" includes skipped ones |
| O1 (EDP:59-60) | `.as` unchanged; add "its mapping is runtime code, shown as opaque" |
| O1 (new sentence, with merge 4's rule 34) | "A write whose key is an array never takes the default lane key" |
| V1 (EDP:197-199) | "source check rejects conditionals and impurity" becomes "the conformance table passes as the evaluator's golden test; the source reader agrees with recording on the reference domains and on each accepted form, and reports a stale build; fix-it goldens, mechanical and starting point, for ?:, &&, \|\|, ??, ===, arithmetic, impure calls and opaque closures" |

**`references/design/entity-domain.md`**

| Where | Amendment |
| --- | --- |
| 2.1 (ED:93, ED:96) | `.predicts` row: "what to show before the server answers, as operator values"; conditions row lists the new operators; add rows for `add`, `sub`, `when`, `coalesce`, `opaque` |
| 2.3 | unchanged |
| 4.1 (ED:336-339) | recorded row gains "predicted values"; runtime row becomes "`.as` mappings and `opaque` functions", run "on each event" and "at each write start and replay, with their declared dependencies"; tools see "the full expression" for recorded, "the declared effect and dependencies" for runtime |
| 4.3 (ED:375-395) | the operator table becomes table 3.1 with the conformance table (3.2); the absent-input paragraph gets rule A3 and the null-input case; add the two-valued rule, rules A4 and A12, and the exactness preconditions |
| 4.4 (ED:405-412) | "Numbers, booleans, dates and key fields are compared" gains "with Effect's Order, after a finiteness and validity check; a pair whose checked key is null, non-finite or an invalid Date is skipped and is no evidence of HiddenOrder" (rule A13) |
| 4.6 (ED:440-445) | replaced by 3.4: recorded once, the record beneath, simultaneous assignment, written order, keys as reads, array keys, `opaque`, skipped values |
| 4.7 (ED:468-483) | the table gains a fix-it column with its kind; the `?:` row reads "detected by `flow check` from source"; the construction-time check goes; rule A10's agreement and `unreadable-domain` are added |
| 5.1 (ED:507-510) | "A predicted field keeps its value or function" becomes "keeps its recorded value"; add simultaneous assignment and rule A7 |
| 5.2 (ED:521-526, ED:557-559) | matching gains rule A12; add: conditions with `or`, `not` or `when` are scanned, never indexed |
| 5.5 (ED:613-630) | a skipped field is predicted and needs its confirming read like any other |
| 7.1 (ED:827-832) | the Model holds predicted values as expression trees and `opaque` dependency lists; the functions stay in the runtime |
| 7.2 (ED:850-853) | `rename … predicts title` becomes `predicts title ← input.title`; the reverse view lists the machines whose events reach a write (3.8) |
| 7.4 (ED:910) | `prediction` gains `skipped` with a reason |
| 9 (ED:1016) | the first row becomes rules A8 and A10; add rows for A3, A4, A5 (types), A9 (`flow check`), A11 (warning), A12, A13 (runtime) |
| 14 (ED:1122) | add: "operators evaluated client-side, and which of TanStack DB's are inexact" — TSE; "comparators" — Effect `Order` (PA) |
| 15.1 (ED:1164, ED:1168, ED:1172-1174) | annotate: superseded by merge 5. ED:1164's "typed against the record and the real input" becomes "typed against the record beneath and the recorded input"; `?:` is caught by the source reader; `.predicts` no longer runs twice |

**`CommandLine.plan`**

| Where | Amendment |
| --- | --- |
| O1 (CLP:22-25) | static explain of a machine event "also shows, for a commit to a domain write, its predicted entity, key and values, the reads they can repair, their carriers and the activities that subscribe them" |
| O5 (CLP:96-97) | "without running application callbacks" becomes "without running application callbacks other than entity domain recorded positions, which App construction calls once with recording proxies and which the source lint limits to parameter reads, constants and library operators" |
| O5 (CLP:95-110) | add: "flow check reads entity domain declarations from source with the TypeScript compiler, reports anything in a recorded position other than parameter reads, constants and library operators as an error with a fix-it, reports a declaration it cannot read as unreadable-domain, and fails when the source description of a recorded position differs from the recorded one (DomainSourceMismatch). Over a complete graph it warns on a predicted field no carrier retains (PredictionNotRetained)." |
| Q1 (CLP:137-139) | "static-analysis implementation" is decided for domains: the compiler API (`typescript/unstable/async`) inside the CLI only |

**`Inspection.plan`**

| Where | Amendment |
| --- | --- |
| O1 (INS:16-19) | "actions" gains "each naming the operation it commits or reads", the edge 3.8 joins on |
| O1 (INS:19-20) | "each entity domain as recorded" includes predicted values and `opaque` dependency lists; an `opaque` function is not in the Model (no closures) |
| D1 (INS:155-157) | add: "flow check's reading of domain source is a check of the Model, not a representation: it is compared and discarded, never printed or saved" |
| C2 (INS:174-176) | unchanged; it is why the source reader lives in the CLI |

**`references/design/sync-engine-adapter.md`**

| Where | Amendment |
| --- | --- |
| SEA:351-353 | "by the same recording the entity domain uses for `.predicts`" becomes "by recording `apply`'s collection set at construction, as entity domains recorded `.predicts` before merge 5; `apply` itself still runs at each write, inside `tx.mutate`, because it is engine code, unlike an entity domain's recorded `.predicts`" |

**`machine-design.md`**: no change. The join is a CLI display over the Model; no machine rule moves.

**merge 4** (accepted; for when it merges into `machine-design.md`):

| Where | Amendment |
| --- | --- |
| 3.1 (M4:127) | the ported `likes` line |
| 2 (M4:74) | "the domain's `.predicts`, with the real input (EDP:51-52)" becomes "the domain's recorded `.predicts`, evaluated with the real input (merge 5 rule A6)" |
| 5 (M4:624-625) | "a domain write runs `.predicts` with the real input (ED:339)" becomes "a domain write evaluates its recorded `.predicts` with the real input (merge 5 rule A6)" |
| 4 rule 34 (M4:606-608) | add "A write whose key is an array (from its input Schema) never takes the default" (rule A5); the key it reads is still recorded, and is now evaluated by the one evaluator |
| 6.1 (M4:650) | "the commit node shows its domain entry's recorded `.predicts` entity, key and values, `.alsoChanges` targets, and the reads they reach (merge 5, 3.8)" |

## 7. Coverage

| Brief item or question | Answer |
| --- | --- |
| Gap 1, logic records one branch (BR:10-11) | rules A8, A10; 3.6; spike (a), (b), (d) |
| Gap 2, runtime functions opaque (BR:12-13) | predicted values recorded (3.4, rules A5-A7); `opaque` with dependencies; `.as` stays opaque (M5-D4, 3.5) |
| Gap 3, server behaviour (BR:14-15) | out of scope (BR:20); untouched |
| Gap 4, machine and domain apart (BR:16-17) | 3.8, rule A11 |
| Gap 5, static requires the App (BR:18) | corrected in section 1: all of Flow's analysis loads the App; recorded callbacks are pure by rule A8, readable without being called, and named in the amended CLP O5 |
| Scope 1, the operator set (BR:24-28) | table 3.1 and the conformance table 3.2, with semantics, null, absent-input and not-carried behaviour, positions and the left-out list |
| Scope 2, recorded predicted values; `.as` (BR:29-32) | 3.4, 3.5 |
| Scope 3, analysis from source (BR:33-34) | 3.6, rule A8 |
| Scope 4, the join (BR:35-36) | 3.8 |
| Scope 5, the spike (BR:37-38) | section 5's table; all four items pass |
| Q: the exact operator list (BR:60-61) | table 3.1, 3.2 |
| Q: recording beside source analysis; disagreement (BR:62-63) | both stay; source reading is a checker; disagreement on recorded positions is an error (3.6, rule A10) |
| Q: evaluation at start and replay; repair and ordering rules (BR:64-65) | rules A6, A7; A12 and A13 are the two rule changes, section 4's last paragraph the rest |
| Q: what stays opaque and what `flow check` promises (BR:66) | 3.7 |
| Q: what the join shows and how (BR:67) | 3.8 |
| Q: migration (BR:68) | 3.9 |
| Hint: TanStack DB (BR:42-44) | it evaluates its IR in JavaScript with SQL three-valued logic; `add` treats `null` as 0 (TSE:596-604), string functions use JavaScript case and length, dates use UTC ISO strings: table 3.1's left-out list |
| Hint: rule 34 reads the key from `.predicts` (BR:51-52) | kept for single keys; an array key never takes the default (rule A5) |
| Hint: `field("likes")` syntax (BR:30) | **changed**: a string `field(...)` is not typed against the entity and needs a second way to name the record; the per-field function's parameter already names it, typed (3.4) |
| Hint: arithmetic in the operator set (BR:25) | **narrowed**: predicted values only (3.1) |
| Hint: "the views that read them" (BR:36) | **not reachable**: views are not in the Model; the join stops at activities (3.8) |
| Found: `between` and `overlaps` were untyped over strings | rule A4 |
| Found: CLP:96-97 says no application callbacks run | amended (6.4) |
| Review 1, every finding | [reviews/review-1.md](reviews/review-1.md) |

## 8. Alternatives considered

- **Source analysis replaces recording.** The runtime would need the description from somewhere: a generated file
  (INS:155-157 forbids a saved structure file) or the compiler at runtime (INS:174-176 forbids it in the library).
  Rejected.
- **Recording only, with the lint as a pattern scan** (today, ED:477). Leaves gap 1 to a scan whose misses are
  silent, gives no fix-its, and cannot tell a stale build from the source. Rejected: the agreement check makes the
  reader's misses loud.
- **Source analysis as a second model for tools.** Tools would print from source and the runtime run from recording:
  two models that could drift without either being wrong in itself. Rejected; tools print the Model, and the source
  reader only checks it.
- **SQL three-valued logic** (TanStack DB, TSE:303-306). Matches SQL backends, but every condition must answer yes or
  no for the join. Rejected for two-valued logic, with the one trap (negated ordering of a nullable) made a type error.
- **A condition that fails to evaluate is false.** Simpler, and what a throw caught at the edge would give, but false
  under `not` becomes true and under `and` hides a repair. Rejected for "matches" (rule A12): conservative in every
  position.
- **A skipped prediction leaves no mark.** The field would read confirmed while the response may omit it, and no
  confirming read would ever come: a stale field. Rejected for rule A7.
- **Forbidding array keys.** Simpler for rule 34, but bulk writes (EDX:185) would need one write per record. Rejected
  for "evaluated at start, no default lane key" (open for the owner, 9.2).
- **Arithmetic in conditions.** Exact for small integers, inexact against decimal servers; nothing needs it. Rejected.
- **A string `field("likes")`** (BR:30). Untyped against the entity unless written `Issue.field(...)`, and a second
  way to name what the per-field parameter names. Rejected.
- **Recorded `.as` mappings with a `match` operator.** A new concept for display; the join does not read mappings.
  Rejected (M5-D4).
- **Recorded helper functions and domain factories.** Useful, but the reader must then follow calls across modules and
  the recorded and source forms of a helper must agree. Not in version 1 (M5-D4); factories are `unreadable-domain`.
- **`opaque` closing over `input` and `.predicts` running twice** (today's model, ED:1172-1174). Keeps a second run
  and hides what the function reads. Rejected for declared dependencies.
- **`when` around changes or in keys.** Makes the predicted records, their queues and lane keys depend on input.
  Rejected (rule A5).

## 9. Open questions

### 9.1 Decided

Open questions 1–7 of the accepted text were settled by M5-D4 with their recommendations, and this revision applies
them: no new value operators until an app needs one (3.1's left-out list); Schema `Date` fields order by time, date
strings compare by equality only (rule A4); no helper functions in version 1 (3.6); `.as` stays a runtime function
(3.5); an unevaluable prediction is not shown, the write is still sent, and `skipped` is recorded (rule A7); a sort
pair with a `null` key is skipped (rule A13); the agreement check runs only in `flow check` (6.3).

### 9.2 For the owner: choices review 1 forced

Each is a correctness fix the decisions do not already state. Each has a recommendation, already written into the
text; the owner may confirm or reverse it.

1. **A skipped prediction still reads `predicted` and needs its confirming read** (rule A7, review H3). M5-D4 says "not
   shown"; it does not say whether the field is then confirmed. *Recommendation:* yes, as written: otherwise the field
   can stay stale for good.
2. **A condition that cannot be decided matches** (rule A12, H2). *Recommendation:* yes; it extends ED:523 from "not
   carried" to "failed to evaluate", and costs a refetch at worst.
3. **Array keys are kept, evaluated at start, and never take rule 34's default lane key** (rule A5, H7).
   *Recommendation:* keep them (bulk writes need them) rather than forbid them.
4. **Ordering a nullable value may not be negated, and `serverMatches` stands only directly under `and`** (rules A3,
   A4, M4). *Recommendation:* yes; both remove an answer two-valued logic gets surprising.
5. **`PredictionNotRetained`** replaces `PredictionNeverShown`, counting the write's own response and loaders as
   carriers, over a complete graph only (rule A11, M1). *Recommendation:* yes.

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
- **M5-D4 Open questions 1–7 take their recommendations:** no new value operators until an app needs one; ordering
  operators compare Schema `Date` fields by time and date strings by equality only; no helper functions in version 1;
  `.as` stays a runtime function; an unevaluable prediction is not shown, the write is still sent, and `skipped` is
  recorded; a sort pair with a `null` key is skipped rather than raising `HiddenOrder` (`nullsFirst`/`nullsLast` later,
  separately); the agreement check runs only in `flow check`.
- **Rejected:** renaming the IR after TanStack DB's variants (cosmetic), and dropping the exact-semantics rule.

## New keywords

| Keyword | Meaning |
| --- | --- |
| `or`, `not` | two-valued disjunction and negation; no optional input, `serverMatches` or nullable ordering under `not` |
| `gt`, `gte`, `lt`, `lte` | number and Date order through Effect's `Order`; `null` is unordered (false) |
| `isNull` | the field holds `null`; nullable fields only |
| `when(c, a, b)` | lazy choice on a boolean; conditions and values; never around a change or in a key |
| `coalesce(a, b)` | `a` unless `null` or absent |
| `add`, `sub` | double arithmetic in predicted values only |
| `opaque([deps], fn)` | a predicted value computed by a function of declared dependencies |
| record beneath | the visible record under a prediction: base plus older live predictions, in start order |
| recorded position kinds | condition, sort key, predicted value (rule A1) |
| not carried | a field the record (the delta) does not hold; a condition reading it matches (rule A12) |
| skipped (prediction) | a predicted value that could not be evaluated: the value beneath, still predicted (rule A7) |
| conformance table | the evaluator's golden rows (3.2, M5-D3) |
| source reader | `flow check`'s reading of domain declarations through the compiler |
| `DomainSourceMismatch` | source and recorded descriptions of a recorded position differ (error) |
| `unreadable-domain` | a domain declaration the reader cannot read (error) |
| mechanical, starting point | the two kinds of fix-it |
| `PredictionNotRetained` | a predicted field no carrier holds after settlement (warning) |
