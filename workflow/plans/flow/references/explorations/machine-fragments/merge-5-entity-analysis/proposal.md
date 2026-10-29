# Proposal: statically analysable entity domains (merge 5)

Status: **proposal, not accepted.** It answers [brief.md](brief.md) (items 1–5 and its questions). Nothing here
edits a `.plan` file, `merge-3-stories/` or `merge-4-entities/`; section 6 lists the amendments for when the owner
accepts it. The spike in [spike/](spike/) checks sections 3.1–3.5 (`tsc -p .` with the root `node_modules/.bin/tsc`,
then `bun main.ts`; output in [spike/output.txt](spike/output.txt)).

Sources and the short names used for citations:

| Short name | File (under `workflow/plans/flow/` unless marked) |
| --- | --- |
| BR | `references/explorations/machine-fragments/merge-5-entity-analysis/brief.md` |
| ED | `references/design/entity-domain.md` |
| EDX | `references/design/entity-domain-examples.md` |
| EDP | `EntityDomains.plan` |
| CLP | `CommandLine.plan` |
| INS | `Inspection.plan` |
| MD | `references/explorations/machine-fragments/machine-design.md` |
| M4 | `references/explorations/machine-fragments/merge-4-entities/proposal.md` |
| DD | `references/dispatch-desk/features/Tickets/ticket.domain.ts` |
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
5. **"Static" constructs the App.** The brief says this is "unlike the rest of Flow's analysis" (BR:18, and "like the rest of Flow", BR:33). **That hint
   is half wrong.** All of Flow's static analysis loads the App's modules: `inspect(app)` "compiles the App"
   (INS:12-13), `flow check`, `flow graph` and static `explain` "may load declarations" (CLP:31-33), and loading
   "trusts that code with host authority" (CLP:125-126). Only deny codes are read with the compiler (INS:158-161).
   What *is* unlike the rest is that a domain's construction **calls author callbacks**, while the machine Model is
   built "without running any machine callback" (INS:12-14). This proposal makes those callbacks pure by
   construction and readable without calling them; it does not remove module loading from `flow check`, which machines
   need too.

Two further faults surfaced while working the gaps:

- **The construction-time check cannot exist.** ED:477 and ED:1016 say the `?:` scan "also runs at construction in
  development". A scan of source needs the compiler, and the compiler stays out of application bundles (INS:174-176).
  The check belongs to `flow check` alone.
- **Arithmetic has nowhere honest to go.** ED:475 sends arithmetic to "a predicted field's function", which is gap 2.

## 2. Where the data comes from

| Fact | Kept in | Written by | When | Read by |
| --- | --- | --- | --- | --- |
| A recorded position's description (conditions, orders, places, keys, predicted changes and their values) | the App's Model (INS:15-20, ED:827-832) | recording proxies calling the position once (ED:341-345) | App construction | the runtime's join, response check and prediction evaluator; `inspect`, `render`, `flow graph`, `flow explain` |
| The same description read from source | `flow check`'s memory only; never saved (INS:155-157) | the source reader, through `typescript/unstable/async` (root `node_modules/typescript` 7.0.2) | each `flow check` | `flow check`: the lint, and the agreement check against the Model |
| Source positions (file, line) | `flow check` findings | the source reader | each `flow check` | people and agents fixing a finding |
| A predicted value | a live prediction in the store (EDP:64-65) | the one evaluator, from the recorded value, the write's real input and the record beneath (rule A6) | at write start, and again at every replay over a new base | views (`Issue.get`, M4:88), the store |
| An opaque value's dependencies | the Model, as `opaque(prior.reactions, input.emoji)` | recording | construction | tools; the evaluator, which passes the dependencies' values to the function |
| An opaque value's function body | nowhere but the code | the author | — | the runtime only; `flow check` lints it (rule A9) but never reads it into the description |
| A `.as` mapping | the code | the author | — | the runtime, per event (ED:464-466); tools show its entity list |
| The machine-to-domain join | `flow explain` and `flow check` output | the CLI, joining the Model's commit edges (INS:16-18) with the domains' recorded entries and the impact classifier (ED:836-838) | each invocation | people and agents |

Nothing here reads server behaviour or a view's selector: neither is in the Model.

## 3. Design

### 3.1 One expression language, three positions

Every recorded position is one expression of parameter reads, constants and library operators (ED:480-481, kept). An
expression appears in one of three positions, and the position decides which operators it may use:

- a **condition** (`.where`, `Entity.where`, `.derivedFrom` bindings, ED:338): the client evaluates it in the join
  (ED:521-526) and in the response check (ED:1027), and decides repairs from it, so every operator in it must give
  exactly the value its definition states;
- a **sort key** (`.orderBy`): a record field only, as today (ED:405-406);
- a **predicted value** (a field of `Entity.patch`): the client evaluates it to show something before the server
  answers; it is a guess, corrected by confirmation (ED:613-630), so it may compute.

The operators, with their client semantics. All of them run in one evaluator, the one the runtime uses (SPK
`flow.ts:311-379`).

| Operator | Client semantics (over decoded values) | Null | An absent optional input | Condition | Predicted value | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `eq(a, b)` | strict equality of scalars: strings by code unit, numbers by value, booleans | `null` equals `null`; `null` equals nothing else | drops the constraint (rule A3) | yes | yes | existing (ED:377) |
| `oneOf(a, values)` | `a` equals some element, by `eq` | as `eq` | drops | yes | yes | existing |
| `contains(arrayField, v)` | some element equals `v`, by `eq` | an element may be `null` | drops | yes | yes | existing |
| `between(a, from, to)` | `from ≤ a < to`, numbers and dates only | a `null` `a` is false | an absent bound is no bound (ED:393-394) | yes | yes | existing; **restricted** to numbers and dates (rule A4) |
| `overlaps(s, e, from, to)` | `s < to` and `e > from`, numbers and dates | a `null` end is false | drops | yes | yes | existing |
| `gt`, `gte`, `lt`, `lte` | numeric or date order | `null` is not ordered: false | drops | yes | yes | **new** |
| `isNull(a)` | `a === null`; only on a nullable field (a type error otherwise) | — | — | yes | yes | **new** |
| `and(c, …)` | all hold | — | the only place a leaf may hold an optional input | yes | yes | existing |
| `or(c, …)`, `not(c)` | two-valued; arguments must not read an optional input (a type error) | — | type error: use `coalesce` | yes | yes | **new** |
| `when(c, a, b)` | `a` if `c` is `true`, else `b`; lazy (the other branch is never evaluated); `c` must be a boolean, never a truthy number | — | type error in `c` | yes | yes | **new** |
| `coalesce(a, b)` | `a` unless it is `null` or absent, else `b` | the way to give a nullable value or an optional input a default | the way to use an optional input under `or`, `not` or `when` | yes | yes | **new** |
| `serverMatches(input, …fields)` | may hold for any record | — | drops | yes | no | existing (ED:383) |
| `add(a, b)`, `sub(a, b)` | IEEE double arithmetic; non-null numbers only; a non-finite result is an evaluation failure | type error: `coalesce` first | — | **no** | yes | **new** |
| `opaque([deps], fn)` | `fn` called with the dependencies' values; its result checked against the field's Schema | — | — | **no** | yes | **new** |
| `asc(f)`, `desc(f)` | a sort key; `f` is a record field | — | — | order only | no | existing |

**Why arithmetic is not in conditions.** The server may add integers exactly, or decimals in base ten, where the
client adds doubles; `0.1 + 0.2` differs between them, so `gt(add(record.price, input.tax), 10)` could hold on the
server and not on the client, and the join would miss a repair. No reference domain needs it. Conditions compare;
predicted values compute. A comparison against a constant or an input stays exact.

**Two-valued, not SQL's three-valued logic.** TanStack DB evaluates `eq`, `gt` and `not` in SQL's three-valued logic:
any comparison with `null` is UNKNOWN (TSE:303-306, TSE:318-321), `not(UNKNOWN)` is UNKNOWN (TSE:428-441), and a WHERE
treats UNKNOWN as false (TSE:85). So `not(gt(null, 1))` excludes the row there and includes it here. Flow's
conditions describe an API's membership, not a SQL query, and every condition must answer yes or no for the join and
the response check; a two-valued rule is the one a reader can predict. `isNull` and `coalesce` say what `null` means
where it matters. The spike checks both (`output.txt`, "two-valued").

**Left out, with the reason** (each was a candidate from TanStack DB, which evaluates them in JavaScript):

| Candidate | Why not in conditions | Why not in predicted values |
| --- | --- | --- |
| `upper`, `lower` | `toUpperCase`/`toLowerCase` (TSE:516, TSE:523) are not a server collation's folding (`ß`, Turkish `i`) | no reference needs them; a predicted string is an input or a constant |
| `like`, `ilike` | pattern rules and case folding are the server's (TSE:717-727); this is `serverMatches` | — |
| `concat`, `length` | `String(arg ?? "")` and UTF-16 length (TSE:526-555) differ from server strings | `opaque` covers the rare case |
| `date`, `datetime`, `strftime` | time zones and formats (TSE:633-660) | — |
| `caseWhen` | conditions are truthy numbers there (TSE:687-700); `when` takes a boolean only | — |
| `mul`, `divide` | arithmetic is never in conditions | rounding and division by zero (TSE:623-632 returns `null`); no reference needs them (open question 1) |
| `isUndefined` | an absent field is the join's case (ED:523: a field not carried matches), not a value | — |
| string `gt`/`lt` | collation is the server's (ED:408-409 already refuses to check string order) | — |

**Exactness and what the domain still claims.** Each condition operator's semantics is exact on the client. Whether
the *server* filters that way is the domain's claim, as today: the response check catches a returned record that
contradicts it, and audit mode an omission (ED:1027-1028). Two preconditions are stated, not checked: a string `eq`
is right only where the server compares strings exactly (a case-insensitive collation is `serverMatches`; DD's search
key is already normalised that way, `ticket.operations.ts:18`); and number comparisons are right only for numbers
that survive JSON as doubles (a decimal beyond about 15 digits is sent as a string, and strings are not ordered).
Both already hold for `eq` and `between` today.

### 3.2 Conditions

```ts
// dispatch-desk (DD:32-39): unchanged; every position was already operator syntax.
.where(({ input, record }) =>
  and(
    eq(record.workspaceId, input.workspaceId),
    eq(record.status, input.status),           // absent status: no constraint (directly under `and`)
    eq(record.assignee, input.assignee),       // a null assignee equals no input value
    serverMatches(input.search, record.title),
  ))

// A queue of mine or nobody's, updated before a time the machine supplies:   // ← NEW
.where(({ input, record }) =>
  and(
    eq(record.workspaceId, input.workspaceId),
    or(isNull(record.assignee), eq(record.assignee, input.me)),  // ← NEW: or, isNull
    lt(record.updatedAt, input.before),                          // ← NEW: lt on a number
  ))

// An optional input under `or`, `not` or `when` is a type error; say what absent means:
eq(record.status, coalesce(input.status, "open"))                  // ← NEW: absent means "open"
// or(eq(record.status, input.status), …)   ✗ "an optional input under or": absent would not mean "no constraint"
```

The join, the `Entity.where` overlap rule (ED:456-458, "anything else counts as overlapping") and the indexes
(ED:557-559, equality and range only) need no change: `or`, `not` and `when` count as overlapping and are scanned.
`flow explain` prints `or` and `not` as words, `isNull` as "has no assignee".

### 3.3 Predicted values

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
```

- **Recorded once, evaluated by one evaluator.** `.predicts` no longer "runs twice" (ED:440-445, ED:1172-1174,
  EDP:51-52). Its single run at construction records the changes, entities, keys, field names *and* values. At write
  start the evaluator computes the key from the real input (merge 4's lane key, rule 34, M4:606-608, comes from here
  unchanged) and each value over the record beneath; at every base change it evaluates the values again (rule A6).
- **Why `opaque` takes its dependencies.** The callback runs once, at construction, so `input` inside it is a
  recording proxy; today's design works around that by running `.predicts` twice (ED:1172-1174). An opaque function
  that receives its values as arguments needs no second run, is typed by its dependency list, and tells tools what it
  reads. A body that closes over `input` instead is a `flow check` error with a fix-it (rule A9).
- **The set of changes is structure.** `when` and arithmetic appear inside a field's value, never around a change: a
  type error says so (SPK `types.ts`, "`when` around changes"). So the records a write predicts, and its record
  queues and lane key (EDP:112-116, M4 rule 34), stay static.
- **Replay** (ED:507-510) is unchanged in kind: the values are recomputed over each new base in start order. Two
  increments stay two; retracting one leaves one. The spike runs merge 4's like scenario: base `liked false, likes 5`,
  like A starts (`6`), unlike B queues behind (`5`), a push sets `liked true, likes 9`, the replay shows `liked false,
  likes 8`; A fails, B alone still `8`; B fails, the base `9` shows. The operator form equals the JavaScript function
  it replaces in all 186 base × sequence cases (`output.txt`, section (c)).

### 3.4 `.as` mappings stay runtime functions

```ts
// DD:81-88: unchanged. A runtime position: ordinary code, shown as an opaque mapping (ED:853).
events: listen(ticketEvents).as([Ticket], (event) =>
  event._tag === "TicketSaved" ? Ticket.save(event.ticket) : Ticket.delete({ … }, { version: event.revision })),
```

A stream event is a tagged union; `when(eq(event._tag, "TicketSaved"), Ticket.save(event.ticket), …)` would not type,
because `event.ticket` exists only on one member, so a recorded mapping needs a `match` operator: a new concept. The
gain would be display only: the join never reads the mapping (it reads the delta the mapping produced, ED:502), and
its result is already checked against the listed entities (ED:464-466, ED:1021). `.as` keeps its position kind,
"runtime" (ED:339), so `?:` inside it is allowed and the source reader does not lint it.

### 3.5 Two readers, one description

Recording stays: it is how the runtime gets its description (the join, the response check, the evaluator), and Flow
keeps one runtime (INS:155-157: the Model is the only structural representation). **Source reading is added as a
checker, not a second model.** `flow check` reads every domain declaration through the TypeScript compiler API into
the same description, and:

1. **lints** every recorded position: anything that is not a parameter read, a constant or a library operator is an
   error naming the file, line and entry, with a fix-it in operator syntax (rule A8);
2. **compares** the source description with the recorded one in the Model, entry by entry, and reports
   `DomainSourceMismatch` for the first node that differs, with both renderings (rule A10);
3. **attaches source positions** to its findings, which recording cannot give.

```text
$ flow check
domains/legacy.ts:14 issues.setLike  error  logic   JavaScript arithmetic or comparison on a recorded value
    fix-it: add(i.likes, when(eq(input.liked, i.liked), 0, when(input.liked, 1, -1)))
domains/legacy.ts:22 tickets.either  error  logic   `||` records only its first operand; write or(...)
    fix-it: or(eq(record.status, "open"), eq(record.assignee, input.assignee))
domains/legacy.ts:34 tickets.recent  error  impure  `Date.now()` runs once, at construction, and is recorded as a constant
    fix-it: pass the value as an input field the machine supplies (input.now)
domains/legacy.ts:40 chat.react      error  opaque-closure  the opaque function closes over `input.emoji`
    fix-it: opaque([m.reactions, input.emoji], (rs, emoji) => addReaction(rs, emoji))
```

(From `output.txt` section (d), shortened; the fix-it for merge 4's `setLike` is exactly the ported line.)

**When they disagree.** On a declaration that passes the lint, the two readers cannot disagree in the language of
section 3.1: both read the same parameter paths, constants and operator calls. A disagreement therefore means the lint
missed a construct (a reader bug), or the code that ran is not the code that was read (a stale build, a generated
file). Either way the description the runtime uses is not the one the author can read, so it is an error, not a
warning, and it names both forms. There is no option to accept a mismatch (errors carry information, never
configuration). On the spike's legacy declarations the two disagree exactly where recording was silently wrong
(`either`, `status`, `both`, `recent`; `output.txt` section (b)); on the reference domains they agree entry for entry
(tickets 6, issues 5, extras 3).

**What the source reader resolves.** Library operators by the symbol they resolve to (an import from `flow-state`,
aliases included), entities and operations by their declarations, parameters by the callback's binding pattern. A
call to anything else in a recorded position, including the author's own helper, is an error with "inline it as
operators" (open question 3). A declaration it cannot read (compiled or generated code) stays an error (ED:482-483).

**Fix-its are syntactic.** They rewrite `?:` to `when`, `&&` to `and`, `||` to `or`, `??` to `coalesce`, `===` to
`eq`, `!==` to `not(eq(…))`, `+`/`-` to `add`/`sub`, `<` and friends to `lt` and friends, `!` to `not`. The types then
check the result: the fix-it for `input.status ? eq(record.status, input.status) : eq(record.status, "open")` is
`when(input.status, …)`, which is a type error (an optional string is not a condition), and the right form is
`eq(record.status, coalesce(input.status, "open"))` (SPK `types.ts`, last expected error). A fix-it is a start, not a
proof.

### 3.6 What stays opaque, and what `flow check` promises about it

| Opaque | Shown as | `flow check` promises | It cannot promise |
| --- | --- | --- | --- |
| `opaque([deps], fn)` in a predicted value | `reactions ← opaque(prior.reactions, input.emoji)` | the entity, key and field (so queues, lane keys, failure repair of "all predicted fields", ED:609, stay exact); the dependency list; the result's type; no known impure call (`Date`, `Math.random`, `crypto`, `performance`, `new Date`) and no closure over `input` in the body | that functions the body calls are pure; that the value is right |
| a `.as` mapping | "changes Ticket (opaque mapping)" (ED:853) | the entities it may change (types, and at runtime, ED:1021) | which events save and which delete |
| a commit's select | "select: opaque" in the join (3.7) | its input type | which event fields reach which input field |
| `serverMatches` | "the server matches input.search on title" | which inputs and record fields it names; that a change to them repairs (ED:142-144) | the server's matching |

At runtime an opaque result is checked against the field's Schema, and every predicted value must evaluate; one that
does not (a non-finite sum, a Schema mismatch, a beneath field the store does not hold) is not shown, the write is
still sent, and the trace's `prediction` event (ED:910) records `skipped` with the reason (rule A7).

### 3.7 The machine and the domain, joined

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
    shown in  Issues.list (carries liked, likes), subscribed by Issues/List READY.activities.issues
  endings   success → Settled; failure.Gone → IssueGone, Refused | NotSent → Failed; unknown → LikeUnsure
```

- **How it is computed.** From the Model alone: commit edges and activities are already in it (INS:16-19), domains
  "as recorded" (INS:19), and the impact classifier is the runtime's (ED:836). No machine callback, adapter or Layer
  runs; the only callbacks the Model's construction runs are domain recorded positions, which rule A8 has made pure.
- **Where it stops.** At subscribing activities. Views (`useView` selectors, `Issue.get` in a component, M4:303-306)
  are not in the Model, so "the views that read them" (BR:36) cannot be joined; that part of the hint is wrong.
- **One finding it enables.** A predicted field that no read entry in the App carries can never be shown, and its
  prediction is dropped at settlement (EDP:99-100): `flow check` warns `PredictionNeverShown`, naming the write, the
  field and the entity. This is the one new check; the rest is display.

This refines merge 4's accepted display row (M4:650, M4:884-887) from "entity and fields" to the chain above. No rule
in `machine-design.md` changes.

### 3.8 Migration, line by line

| Domain | Line | Before | After |
| --- | --- | --- | --- |
| dispatch-desk tickets (DD) | 3 | imports `and, asc, desc, domain, entity, eq, listen, read, serverMatches, write` | unchanged |
| | 30-48, 51-55 | conditions, order, paging | unchanged: already operators |
| | 59-79 | `.predicts` of inputs and the constant `"assigned"` | unchanged: already a recorded value |
| | 81-88 | `.as` with `?:` | unchanged: a runtime position |
| merge 4 `Issues` (M4:119-132) | 120 (import, not shown in M4) | `eq, asc, desc, …` | adds `add, when` |
| | 127 | `likes: (i) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),` | `likes: (i) => add(i.likes, when(eq(input.liked, i.liked), 0, when(input.liked, 1, -1))),` |
| | 340 (the excerpt in 3.2) | `likes: …` | unchanged |
| entity-domain-examples (EDX) | 53 | `reactions: (m) => addReaction(m.reactions, input.emoji),` | `reactions: (m) => opaque([m.reactions, input.emoji], (rs, emoji) => addReaction(rs, emoji)),` |
| | 99-100 | `balance: (a) => a.balance - input.amount` / `+` | `balance: (a) => sub(a.balance, input.amount)` / `add(…)` |
| | 58-61, 340 | `.as` mappings | unchanged |
| ED notes app (ED:259-261) | — | `.as` with `?:` | unchanged |

DD needs no change at all: every recorded position there was already one expression of operators. The spike ports it
with only the stand-in entity declaration differing (no Schema in the spike, `spike/domains/tickets.ts:1-3`).

## 4. Rules

Numbered A1–A11 (analysis), for `entity-domain.md` section 9; they do not extend machine-design.md's numbering.

- **A1. Three positions.** A recorded expression is a condition, a sort key or a predicted value. Its position
  decides its operators (table 3.1); an operator outside its positions is a type error.
- **A2. Conditions are exact and two-valued.** Every condition operator is defined over decoded values and answers
  `true` or `false`; `null` is a value (equal to `null`, unordered). No arithmetic, opaque value, string order, string
  transform or date logic beyond equality appears in a condition; those are `serverMatches`.
- **A3. An absent optional input drops a constraint only directly under `and`.** Under `or`, `not` or `when`'s
  condition it is a type error; `coalesce(input.x, value)` says what absent means there. (Amends ED:391-395.)
- **A4. Ordering operators take numbers and dates.** `gt`, `gte`, `lt`, `lte`, `between` and `overlaps` on a string
  field are type errors. (Restricts `between` and `overlaps`, which ED:380-381 leave untyped.)
- **A5. Predicted values compute; their structure is static.** A patch field's value is a constant, an input read,
  an operator expression over `input` and the record beneath (the per-field function's parameter), or `opaque([deps],
  fn)`. `when` and arithmetic never decide which changes a write makes.
- **A6. One evaluation rule for predictions.** At write start the key is evaluated from the input, and every value
  over the visible record beneath the prediction (the base with older live predictions, in start order). All fields
  of one patch read the same record beneath (simultaneous assignment). Every base change re-evaluates the values; the
  input never changes. `.predicts` is recorded once and never called again.
- **A7. A value that cannot be evaluated is not shown.** A non-finite result, an opaque result its field's Schema
  rejects, or a beneath field the store does not hold: that field shows no prediction, the write is still queued and
  sent, and the `prediction` event records `skipped` with the reason. Other fields of the patch are unaffected.
- **A8. A recorded position is checked from source.** `flow check` reads every recorded position with the compiler.
  Anything other than parameter reads, constants and library operators (`?:`, `&&`, `||`, `??`, `if`, `===`,
  arithmetic, templates, method calls, calls to other functions, `Date`, `Math.random`, `new`, outer values) is an
  error with its file, line, entry and a fix-it. Runtime positions (`.as`, commit selects) are not linted.
- **A9. An opaque function is a function of its arguments.** Its body may not close over the callback's parameters
  (an error with the dependency-list fix-it) or make a known impure call (an error). It is replayed, so it must give
  the same result for the same arguments.
- **A10. The two readers agree, or `flow check` fails.** The source description and the recorded description are
  compared entry by entry; any difference is `DomainSourceMismatch`, an error naming the entry, the first differing
  node and both renderings. A declaration the reader cannot read is an error (ED:482-483).
- **A11. The join is read from the Model.** `flow explain` and `flow check` join commit edges to domain entries,
  predicted values and impact rows, and stop at subscribing activities. A predicted field no read entry carries is the
  warning `PredictionNeverShown`.

Unchanged: repair rules (ED:109-129), the join (ED:516-559), the ordering rule and contests (ED:592-602), write
endings (ED:604-611), record queues (ED:639-654) and merge 4 rules 26-38. Operator-built values change none of them:
predictions still change visible values only and never start a repair (ED:504-506); the predicted field names, which
decide failure repair (ED:609) and confirmation (ED:613-630), are still recorded; and the predicted keys, which decide
queues and lanes, are static by rule A5.

## 5. How it is implemented

One runtime: the evaluator in the store is the only code that gives an expression a value (the join, the response
check and predictions call it). The CLI never evaluates a condition; it prints and classifies.

- **Library.** Operators build plain description nodes, as today's `eq` does (ED:341-343, TanStack DB's `ref`, `val`,
  `func`, TSIR:205-263). The phantom types carry three facts per expression: its value type, whether it reads an
  optional input, and whether it uses a value-only operator (SPK `flow.ts:20-33`). `Entity.patch` calls each
  per-field function once with a proxy rooted at the record beneath. `opaque` records its dependencies and keeps the
  function beside the node for the evaluator.
- **Recording proxies** stay as they are, plus one hook: a conversion to a primitive throws, naming the path (SPK
  `flow.ts:43-58`), so `i.likes + 1` fails at construction with a sentence naming `prior.likes` rather than a
  bare `TypeError` (TanStack's proxy passes symbol properties through, TSRP:164).
- **The source reader** runs inside `flow check` only, through `typescript/unstable/async` (the root
  `node_modules/typescript` 7.0.2; the `unstable/sync` client needs Node's stream internals and fails under bun, the
  async one works in both). It opens the project's `tsconfig.json`, walks each `domain(id, { … })` call, and reads
  each recorded position into the description. The real reader resolves names with the checker
  (`getSymbolAtLocation`); the spike resolves imports syntactically.
- **The join** is a CLI projection over the Model plus the existing impact classifier.

**The spike** (SPK, about 1,200 lines; `output.txt`): a stand-in library (`flow.ts`: operators, proxies, entries, the
evaluator, start and replay), the two reference domains ported (`domains/tickets.ts`, `domains/issues.ts`), spike-only
extras (`domains/extras.ts`: a transfer, an opaque reaction, an `or`/`isNull`/`lt` read), legacy declarations
(`domains/legacy.ts`, `@ts-nocheck`), the source reader (`source.ts`) and the checks (`types.ts`, `main.ts`).

| Item | Result |
| --- | --- |
| (a) the operator set types and records correctly, both branches of `when` included | **pass.** `tsc`: 0 errors; 17 `@ts-expect-error` lines hold, each for its stated reason (optional input under `or`/`not`/`when`; arithmetic in a condition; string order; wrong constant; `isNull` on a non-null field; arithmetic on a nullable; JavaScript `+`; `when` around changes; wrong value type twice; opaque dependency type; opaque in a condition; a JavaScript boolean in `.where`; arithmetic as a sort key; the mechanical `?:` fix-it), and four exact-type assertions compile. At runtime the recorded `likes` holds both `when`s and all of `0`, `1`, `-1`; each branch evaluates; `when` is lazy; ticket conditions evaluate with absent inputs; recording alone reproduces the four silent failures and the arithmetic error |
| (b) source reading equals recording | **pass.** 14 entries over three domains identical (canonical JSON); 0 findings on the reference domains; on legacy declarations they disagree on exactly the four entries recording got wrong. Reading five files took 35 ms |
| (c) predicted values at start and replay over a changed base | **pass.** Keys at start (`{ id: "i1" }`, `{ w1, t1 }`); merge 4's like scenario step by step; 186/186 cases equal the old function; transfer over two records and a pushed base; the opaque reaction replayed over a moved base |
| (d) the reader flags `?:`, `&&`, `||` and impure calls with a fix-it | **pass.** Six findings with file:line; the `setLike` fix-it is byte-identical to the ported line; the opaque-closure fix-it is the extras form |

What the spike does not model: Effect Schema (entities are plain types, so there is no Schema check of opaque results
and no dates), the store, the join, the response check, the input rule (ED:136-141), `.alsoChanges`, `Entity.where`
targets, nested places, paging, the checker-based name resolution, helper functions, and `DomainSourceMismatch`
reporting beyond a printed diff. The join of 3.7 is not built.

## 6. Changes

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| `or`, `not`, `gt`, `gte`, `lt`, `lte`, `isNull`, `when`, `coalesce` | condition and value operators | table 3.1 |
| `add`, `sub` | value operators | predicted values only |
| `opaque([deps], fn)` | value operator | a runtime function with declared dependencies (rule A9) |
| The record beneath as the per-field function's parameter | semantics | rule A6; the parameter existed (ED:443), its value is now defined |
| Source reading in `flow check` | tooling | rules A8, A10 |
| `DomainSourceMismatch` | `flow check` error | rule A10 |
| Finding rules `logic`, `impure`, `outer-value`, `unknown-call`, `opaque-closure`, `one-expression` | `flow check` reasons | rule A8, A9 (CLP:105-107's stable rule reason) |
| `PredictionNeverShown` | `flow check` warning | rule A11 |
| `skipped` on the `prediction` trace event | evidence | rule A7 |
| The machine-to-domain chain in `flow explain` | tooling | 3.7 |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| `.predicts` | recorded, then "runs again at write start with the real input" (EDP:51-52, ED:440-445) | recorded once; its description is evaluated at start and at each replay (rule A6) |
| A predicted field's function | ordinary code over the record (ED:443-444) | an operator expression over the record beneath, or `opaque` |
| Arithmetic | "belongs in a predicted field's function" (ED:475) | `add`/`sub` in predicted values; never in conditions |
| Absent optional inputs | drop the constraint "for every operator" (ED:391-395) | only directly under `and` (rule A3) |
| `between`, `overlaps` | any field type | numbers and dates (rule A4) |
| The `?:`/`&&` check | "a mandatory flow check rule … also run at construction in development" (ED:477, ED:1016) | a source lint in `flow check` with fix-its (rule A8) |
| Source and recording | one reader (recording); the source check is a scan | two readers of one description; disagreement is an error (rule A10) |
| `flow explain` for a machine event | possible transitions, denials, fallthrough (CLP:23-25) | also the store-effect chain (3.7) |
| Merge 4's store-effect display (M4:650) | the predicted entity and fields | entity, key, field values and the reads they reach (3.7) |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| "`.predicts` runs twice" | ED:440-445, ED:1172-1174, EDP:51-52 | values are recorded; `opaque` receives its input values as arguments |
| The construction-time source check in development | ED:477, ED:1016 | it needs the compiler in an application bundle, which INS:174-176 forbids |
| "not detectable by the proxy or the types" as the whole answer | ED:477 | still true of the proxy and the types; `flow check` now detects it from source |

### 6.4 Amendments by target

The `.plan` files change only when this proposal is accepted.

**`EntityDomains.plan`**

| Where | Amendment |
| --- | --- |
| O1 (EDP:29-31) | "Conditions use where (eq, oneOf, contains, between, overlaps, and)" becomes "Conditions use eq, oneOf, contains, between, overlaps, gt, gte, lt, lte, isNull, and, or, not, when and coalesce, two-valued over decoded values; ordering operators take numbers and dates". "An absent optional input drops its constraint" gains "directly under and; elsewhere it is a type error and coalesce gives it a value" |
| O1 (EDP:49-52) | "Declarations are recorded once at construction. … predicts runs again at write start with the real input." becomes "Declarations are recorded once at construction, predicted values included, and never called again. A recorded position is one expression of parameter reads, constants and library operators; flow check reads it from source, rejects anything else with a fix-it, and fails if the source and recorded descriptions differ." |
| O1 (EDP:54) | "predicts returns Entity.patch(key, fields)" gains "whose field values are constants, input reads, operator expressions over the input and the record beneath (add, sub, when, coalesce), or opaque([deps], fn); which changes a write makes never depends on a value" |
| O1 (EDP:64-65, EDP:70) | "visible is base plus live predictions replayed over each new base" gains "each value evaluated over the record beneath it, all fields of one patch over the same record; a value that cannot be evaluated is not shown and the write still runs" |
| O1 (EDP:59-60) | `.as` unchanged; add "its mapping is runtime code, shown as opaque" |
| V1 (EDP:197-199) | "source check rejects conditionals and impurity" becomes "the source reader agrees with recording on the reference domains; each operator's semantics row, null row and absent-input row has a test; fix-it goldens for ?:, &&, \|\|, ??, ===, arithmetic, impure calls and opaque closures" |

**`references/design/entity-domain.md`**

| Where | Amendment |
| --- | --- |
| 2.1 (ED:93, ED:96) | `.predicts` row: "what to show before the server answers, as operator values"; conditions row lists the new operators; add rows for `add`, `sub`, `when`, `coalesce`, `opaque` |
| 2.3 | unchanged |
| 4.1 (ED:336-339) | recorded row gains "predicted values"; runtime row becomes "`.as` mappings and `opaque` functions", run "on each event" and "at each write start and replay, with their declared dependencies"; tools see "the full expression" for recorded, "the declared effect and dependencies" for runtime |
| 4.3 (ED:375-395) | the operator table becomes table 3.1; the absent-input paragraph gets rule A3; add the two-valued rule and the exactness preconditions of 3.1 |
| 4.4 | unchanged (sort keys stay fields) |
| 4.6 (ED:440-445) | replaced by 3.3: recorded once, the record beneath, simultaneous assignment, `opaque` |
| 4.7 (ED:468-483) | the table gains a fix-it column; the `?:` row reads "detected by `flow check` from source"; the construction-time check goes; rule A10's agreement is added |
| 5.1 (ED:507-510) | "A predicted field keeps its value or function" becomes "keeps its recorded value"; add simultaneous assignment and rule A7 |
| 5.2 (ED:557-559) | add: conditions with `or`, `not` or `when` are scanned, never indexed |
| 7.1 (ED:827-832) | the Model holds predicted values as expression trees and `opaque` dependency lists |
| 7.2 (ED:850-853) | `rename … predicts title` becomes `predicts title ← input.title`; the reverse view lists the machines whose events reach a write (3.7) |
| 7.4 (ED:910) | `prediction` gains `skipped` with a reason |
| 9 (ED:1016) | the first row becomes rules A8 and A10; add rows for A3, A4, A5 (types), A9 (`flow check`), A11 (warning) |
| 14 (ED:1122) | add: "operators evaluated client-side, and which of TanStack DB's are inexact" — TSE |
| 15.1 (ED:1168, ED:1172-1174) | annotate: superseded by merge 5 (`?:` is now caught by the source reader; `.predicts` no longer runs twice) |

**`CommandLine.plan`**

| Where | Amendment |
| --- | --- |
| O1 (CLP:22-25) | static explain of a machine event "also shows, for a commit to a domain write, its predicted entity, key and values, the reads they can repair and the activities that subscribe them" |
| O5 (CLP:95-110) | add: "flow check reads entity domain declarations from source with the TypeScript compiler, reports anything in a recorded position other than parameter reads, constants and library operators as an error with a fix-it, and fails when the source description differs from the recorded one (DomainSourceMismatch). It warns on a predicted field no read carries." The warning list gains `PredictionNeverShown` |
| Q1 (CLP:137-139) | "static-analysis implementation" is decided for domains: the compiler API (`typescript/unstable/async`) inside the CLI only |

**`machine-design.md`**: no change. The join is a CLI display over the Model; no machine rule moves.

**merge 4** (accepted; for when it merges into `machine-design.md`): the `Issues` domain in 3.1 (M4:127) takes the
ported `likes` line; the 6.1 row "Store effects in `flow check` and `flow graph`" (M4:650) reads "the commit node
shows its domain entry's recorded `.predicts` entity, key and values, `.alsoChanges` targets, and the reads they reach
(merge 5, 3.7)". Rule 34 (M4:606-608) is unchanged: the key it reads is still recorded, and is now evaluated by the
one evaluator.

**`Inspection.plan`**: no wording change; "each entity domain as recorded" (INS:19) now includes predicted values,
and C2 (INS:174-176) is why the source reader lives in the CLI.

## 7. Coverage

| Brief item or question | Answer |
| --- | --- |
| Gap 1, logic records one branch (BR:10-11) | rules A8, A10; 3.5; spike (a), (b), (d) |
| Gap 2, runtime functions opaque (BR:12-13) | predicted values recorded (3.3, rules A5-A7); `opaque` with dependencies; `.as` stays opaque by decision (3.4) |
| Gap 3, server behaviour (BR:14-15) | out of scope (BR:20); untouched |
| Gap 4, machine and domain apart (BR:16-17) | 3.7, rule A11 |
| Gap 5, static requires the App (BR:18) | corrected in section 1: all of Flow's analysis loads the App; recorded callbacks are now pure by rule A8 and readable without being called |
| Scope 1, the operator set (BR:24-28) | table 3.1, with semantics, null and absent-input behaviour, positions and the left-out list |
| Scope 2, recorded predicted values; `.as` (BR:29-32) | 3.3, 3.4 |
| Scope 3, analysis from source (BR:33-34) | 3.5, rule A8 |
| Scope 4, the join (BR:35-36) | 3.7 |
| Scope 5, the spike (BR:37-38) | section 5's table; all four items pass |
| Q: the exact operator list (BR:60-61) | table 3.1 |
| Q: recording beside source analysis; disagreement (BR:62-63) | both stay; source reading is a checker; disagreement is an error (3.5, rule A10) |
| Q: evaluation at start and replay; repair and ordering rules (BR:64-65) | rule A6; section 4's last paragraph: no repair or ordering rule changes |
| Q: what stays opaque and what `flow check` promises (BR:66) | 3.6 |
| Q: what the join shows and how (BR:67) | 3.7 |
| Q: migration (BR:68) | 3.8 |
| Hint: TanStack DB (BR:42-44) | it evaluates its IR in JavaScript with SQL three-valued logic; `add` treats `null` as 0 (TSE:596-604), string functions use JavaScript case and length, dates use UTC ISO strings: table 3.1's left-out list |
| Hint: rule 34 reads the key from `.predicts` (BR:51-52) | unchanged; the key is evaluated at start (3.3; spike (c)) |
| Hint: `field("likes")` syntax (BR:30) | **changed**: a string `field(...)` is not typed against the entity and needs a second way to name the record; the per-field function's parameter already names it, typed (3.3) |
| Hint: arithmetic in the operator set (BR:25) | **narrowed**: predicted values only (3.1) |
| Hint: "the views that read them" (BR:36) | **not reachable**: views are not in the Model; the join stops at activities (3.7) |
| Found: the construction-time check needs the compiler in bundles | removed (6.3) |
| Found: `between` and `overlaps` were untyped over strings | rule A4 |

## 8. Alternatives considered

- **Source analysis replaces recording.** The runtime would need the description from somewhere: a generated file
  (INS:155-157 forbids a saved structure file) or the compiler at runtime (INS:174-176 forbids it in bundles).
  Rejected.
- **Recording only, with the lint as a pattern scan** (today, ED:477). Leaves gap 1 to a scan whose misses are
  silent, gives no fix-its, and cannot tell a stale build from the source. Rejected: the reader is little more code
  than the scan (the spike's is 380 lines) and the agreement check makes its misses loud.
- **Source analysis as a second model for tools.** Tools would print from source and the runtime run from recording:
  two models that could drift without either being wrong in itself. Rejected; tools print the Model, and the source
  reader only checks it.
- **SQL three-valued logic** (TanStack DB, TSE:303-306). Matches SQL backends, but `not(gt(null, 1))` then excludes a
  row many readers expect it to include, and the join needs yes or no. Rejected for two-valued with `isNull` and
  `coalesce`.
- **Arithmetic in conditions.** Exact for small integers, inexact against decimal servers; nothing needs it. Rejected.
- **A string `field("likes")`** (BR:30). Untyped against the entity unless written `Issue.field(...)`, and a second
  way to name what the per-field parameter names. Rejected.
- **Recorded `.as` mappings with a `match` operator.** A new concept for display; the join does not read mappings.
  Rejected for now (open question 4).
- **Recorded helper functions** (an author's `inWorkspace(record, input)`). Useful, but the reader must then follow
  calls across modules and the recorded and source forms of a helper must agree. Deferred (open question 3).
- **`opaque` closing over `input` and `.predicts` running twice** (today's model, ED:1172-1174). Keeps a second run
  and hides what the function reads. Rejected for declared dependencies.
- **`when` around changes** (`when(input.liked, Issue.patch(…), Issue.delete(…))`). Makes the predicted records, their
  queues and lane keys depend on input. Rejected (rule A5).

## 9. Open questions

Each has a recommendation; none is decided.

1. **More value operators** (`mul`, `min`, `max`, `neg`). *Recommendation:* none until an app needs one; each needs
   its semantics and null rows. `max(0, sub(likes, 1))` is the likely first.
2. **Dates.** The spike has no Schema, so date fields are untested. *Recommendation:* ordering operators accept fields
   whose Schema decodes to `Date` and compare `getTime()`; date strings stay strings (equality only).
3. **Helper functions in recorded positions.** *Recommendation:* not in version 1. A call to a non-library function is
   an error with "inline it"; revisit when two reference apps repeat a condition, with the rule that a helper's body
   is itself one operator expression and the checker resolves it.
4. **Recorded `.as` mappings** (a `match(event, "_tag", { … })` operator). *Recommendation:* no; keep `.as` a runtime
   function (3.4) until a tool needs per-tag effects.
5. **Rule A7: what a prediction that cannot be evaluated does.** *Recommendation:* as written (not shown, write still
   sent, `skipped` evidence). The alternative, rejecting the write before it is sent, would let a display problem
   refuse a user's action.
6. **`null` in sort keys** (found, not in scope). ED:408-410 checks number and date order but does not say where a
   server puts `null`. *Recommendation:* a separate change: skip a pair with a `null` checked key, rather than raise
   `HiddenOrder`, until a `nullsFirst`/`nullsLast` declaration is wanted.
7. **Running the agreement check outside `flow check`** (a dev-server plugin). *Recommendation:* no for now; it would
   be a second home for the same check. `flow check` in CI and the editor's TypeScript errors cover authoring.

## 10. Decisions

Settled by the owner; none yet.

## New keywords

| Keyword | Meaning |
| --- | --- |
| `or`, `not` | two-valued disjunction and negation; no optional input under them |
| `gt`, `gte`, `lt`, `lte` | number and date order; `null` is unordered (false) |
| `isNull` | the field holds `null`; nullable fields only |
| `when(c, a, b)` | lazy choice on a boolean; conditions and values |
| `coalesce(a, b)` | `a` unless `null` or absent |
| `add`, `sub` | double arithmetic in predicted values only |
| `opaque([deps], fn)` | a predicted value computed by a function of declared dependencies |
| record beneath | the visible record under a prediction: base plus older live predictions, in start order |
| recorded position kinds | condition, sort key, predicted value (rule A1) |
| source reader | `flow check`'s reading of domain declarations through the compiler |
| `DomainSourceMismatch` | source and recorded descriptions differ (error) |
| `PredictionNeverShown` | a predicted field no read carries (warning) |
| `skipped` (prediction event) | a predicted value that could not be evaluated |
