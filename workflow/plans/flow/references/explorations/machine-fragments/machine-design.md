# Machine fragments: traits, subroutines and server calls (version 4)

**Status:** proposal, not accepted. This is the one design. Merge 1 ([merged/outcomes.md](merged/outcomes.md)) and
merge 2 ([merged/server-calls/proposal.md](merged/server-calls/proposal.md)) were merged into it on 2026-10-30; they
are kept as the record behind it, and where they differ from this file, this file wins. Merge 4
([merged/entities.md](merged/entities.md), entity domains) was merged on 2026-10-30, and merge 5
([merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md), statically analysable domains) on 2026-10-30; merge
5's rules A1–A12 belong to `references/design/entity-domain.md` section 9, and only its effects on 2.8 are here.
Operations in the definition ([merged/operations/proposal.md](merged/operations/proposal.md), revision 13) was merged on
2026-10-30: server interaction is declared once under `operations` (2.7, rules 39–47), and write lanes are the
Runtime's (2.7.13).
Operations in fragments ([merged/fragment-operations/proposal.md](merged/fragment-operations/proposal.md), revision 3) was merged on 2026-10-31: a fragment may declare
and act on its own operations (2.9, rules 48–60); write lanes keep their identity and record the subject path of the
incarnation that created them.
Stories (merge 3, [merged/stories/proposal-v2.md](merged/stories/proposal-v2.md), revision 3) was merged on 2026-10-31:
a Story is a plan of the user's, time's and the world's inputs, run on the production Runtime against fake servers,
with no ending injected (2.10, rules 61–66). The amended Stories and Fake design ([merged/story-checks/stories-amended.md](merged/story-checks/stories-amended.md), [merged/story-checks/fakes-v2.md](merged/story-checks/fakes-v2.md)) was merged on 2026-11-01: a Story is a transcript of inputs and checkpoints, and a test checks values with its runner's own `expect` (rules 11, 61–66; decisions SC1–SC5, W1–W43). Streams (merge 6, [merged/streams/proposal-v3.md](merged/streams/proposal-v3.md), [merged/streams/decisions-v2.md](merged/streams/decisions-v2.md)) was merged on 2026-11-01: a feed's adapter says what the connection did, and Flow runs one session table, keeps the consumer's place in a private bookmark saved with its memory, and tells a clear from a wipe with `fills` (2.11, rules 67–72; decisions S1–S16). The work order is in [the folder README](README.md). This design
**supersedes the earlier design `proposal-v3.md`**, not streams' file of that name (removed, see [the folder README](README.md)). It is evaluated against
[principles.md](../../../../archive/flow-design-2026-11/machine-fragments/fragments-problem.md). v4 keeps v3's model and adds what the prior-art study found missing (`prior-art/`,
removed, see [the folder README](README.md)). Where this file and a plan differ, the plan wins. Section 5 lists every
plan amendment, with the sentence each one replaces. All syntax is a working draft.

**Revision (multiplicity audit, 2026-10-31).** [audit-multiplicity.md](../../../../archive/flow-design-2026-11/machine-fragments/audit-multiplicity.md) checked every handle,
read, action, event, record and evidence item for how many exist at once, which one each reference names, and what
happens before creation, after deletion and across restores and tabs. Its three general rules are N1–N3 (2.4, after
rule 25); its changes are marked with this heading's words, and its decisions are D18–D21.

**Eight decisions.** Decision 1 can be accepted alone; decision 2 builds on decision 1's turn (2.5); decision 3 is
independent; decision 4 builds on decision 2; decision 5 builds on decisions 2 and 4; decision 6 builds on decisions 1
and 5; decision 7 builds on decisions 5 and 6; decision 8 builds on decisions 2, 5, 6 and 7.

| Decision | What it covers | Plans it touches |
|---|---|---|
| **1. Fragments and the turn** | sections 2.1–2.6 and 3, rules 1–12, P5–P8, P11, P21 | Machines O1–O8, Runtime O4, Persistence O2, Testing O1, Inspection O1, CommandLine O5, React O2/O4, Package O1 |
| **2. Server calls** | section 2.7, rules 13–25 and N1–N3, C1–C20, P15, P19, P20 | Operations O1–O3/O5/O7, Machines O3/O5/O6, Persistence O4–O6, Testing O2/O3, EntityDomains O1, CommandLine O5 |
| **3. Exploration tooling** | T2–T3; T1 and Testing O5 removed (C77, C82) | CommandLine O5; Testing O5 (removed), Package (`model` export removed) |
| **4. Entity domains** | section 2.8, rules 26–38, C21–C30, decisions E1–E18 | Operations O1–O3/O5/O6, EntityDomains O1/O2/O5, Persistence O6, Inspection, CommandLine O5 |
| **5. Operations in the definition** | 2.7 (rewritten), 2.7.13–2.7.16, rules 13–25 and N1–N3 amended, 26–38 amended, rules 39–47, C31–C53, decisions OD1–OD26 | Operations O1–O7, Machines O1/O4–O6/O8, Runtime O3/O6/V4, Persistence O2–O6, ServerRendering O3/O5, LazyFeatures O3, Inspection O1, React O2/O3, Testing O3/O7, CommandLine O5 |
| **6. Operations in fragments** | 2.9, rules 48–60, rules 1–4, 6, 8–17, 20–24, 26, 27, 37, 40–47, N1 and N3 amended, C54–C68, decisions F1–F10 | Machines O1/O4–O6/O8, Runtime O3/V4, Persistence O2–O5, Testing O1, Inspection O1, CommandLine O5, React O4, EntityDomains O1, Operations O3/O7 |
| **7. Stories** | 2.10, rules 61–66, rules 11, 17, 21, 47, 58 amended, 2.4, 2.5, 2.7.2, 2.7.3, 2.7.11, 2.7.13, 2.7.16, 2.8, 3.6, sections 5–7, C69–C85, decisions Stories T1–T7, amended by SC1–SC5 and W1–W43 | Testing O1–O9, V1–V9, Inspection O1/O4/O5, CommandLine O2/O5/O6, Package O1, Diagnostics, EntityDomains O2/O4, Persistence O7 |
| **8. Streams** | 2.11, rules 67–72, rules 8, 13, 14, 20, 25, 37, 39–42, 47, 52, 57, 65, N3 amended, 2.5, 2.7.3, 2.7.6, 2.7.8, 2.7.10, 2.7.13, 2.7.15, 2.7.16, 2.8.14, 2.10, 3.6, sections 5–7, C57, C79, C86–C103, decisions S1–S16 | Operations O1/O4/O6/V9/Q1, Machines O6, Runtime O4/O6, Persistence O2/O4/O5, ServerRendering O2/O3/O5/V3/V5, EntityDomains O1/O4, Inspection O4, CommandLine O5, Package O1, Diagnostics |

## 1. The idea

Three layers, each owning one thing.

- **Contracts own how a call is made, which server thing it is about and what its ending means:** the commit
  function, which classifies each ending with `Outcome` where it reads the response; the contract's `key` and
  concurrency; the cache; restore.
- **Definitions declare every operation the actor uses** and what its endings become (`operations`, `outcomes`).
- **Machines own states, turns, timers, history, and the work they start:** when a write starts, is sent again or
  cancelled, when a read is placed, and where an ending goes (2.7). The Runtime keeps write lanes (2.7.13).
- **Fragments are locked islands of logic, with no I/O of their own unless they declare `operations`** (rule 49),
  which only they may act on (rule 50). A fragment is behaviour written once and
  placed into a machine at construction: a validated field, a countdown, a lockout, a confirmation,
  a selection. The actor stays one actor, with one mailbox, one turn and one plain snapshot.

There are two kinds:

- A **trait** is something the actor _has_: no states, alive while its node is active.
- A **subroutine** is something the actor _goes into_: placed as a state, fresh on every entry, and
  left through a declared **exit**.

A fragment declares a contract: what it reads, which events it takes from whom, where the host may
refuse, what it tells the host, and how it ends. The host fills that contract and cannot reach
inside. A fragment without `operations` does no I/O: the host runs every operation and feeds the answers in by
raising its events. A fragment that declares `operations` owns them wholly; its host reads their lanes and asks
through its events (rules 48–50).

The rules that make apps correct (endings routed by their owner, the Attempt's ending, declines as endings, lane
reads, history, readable deadlines) help plain machines as much as fragments, so they belong in the plans. v4 reuses
**pieces** (fields, timers, dialogs, selections) and, opt-in, a piece's **I/O policy** (an autosave, a like with its
reconcile; 2.9). Policy is written once per declarer, as states, schedules and the operations' members (2.7).

## 2. Fragments, the turn and server calls

### 2.1 The two kinds

|                                          | `trait(declaration, body)`                                                                             | `subroutine(declaration, body)`                                                          |
|------------------------------------------|--------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| The actor…                               | has it                                                                                                 | goes into it                                                                             |
| Examples                                 | field, countdown, lockout, debounce, selection, pager, flash                                           | confirm, hold-to-confirm, address step, picker                                           |
| Placed (definition)                      | the root's `traits: { code: Field(…) }`, or on a node with `Flow.state(…, { traits })`                 | a state: `states: [{ CANCELLING: Confirm }]`                                             |
| Many of them                             | `.each({ of, max, by? })`: one copy per key in a host memory field (rule 9)                         | no                                                                                       |
| Instance name                            | the `traits` key (`code`)                                                                              | the state's name (`CANCELLING`)                                                          |
| States of its own                        | none                                                                                                   | optional, under its state (`HOLDING.WAITING`). Without `states` it is a leaf (`Confirm`) |
| Lives                                    | while its node is active (the root: the actor's life); fresh on every activation unless `.resumable()` | while its state is active; fresh on every entry                                          |
| Re-activated                             | when its `resetOn` value changes                                                                       | on every entry                                                                           |
| Ends                                     | when its node is left (resumable: frozen)                                                              | by taking an exit, or abandoned by a transition that exits its state                     |
| On ending, except by an exit or a freeze | `whenAbandoned` notifications run, fused into the leaving turn; a key-less `O.x.cancel` listed there releases the subject's lanes of that operation (rule 60)                                               | the same                                                                                 |
| Contains                                 | traits                                                                                                 | traits and subroutines                                                                   |

One question picks the kind: **does the actor have it, or go into it?** A countdown that runs beside
other states is a trait. A dialog that blocks what is under it is a subroutine.

**Reading.** Memory and schedules sit under the instance name:

- a trait: `s.memory.code` (absent without memory) and `s.schedules.code.<name>`;
- a subroutine: `s.memory.CANCELLING` and `s.schedules.HOLDING.<name>`;
- the host's own schedules: `s.schedules.<name>`;
- `.each` copies: `s.memory.challenges[i]` and `s.schedules.challenges[i]`, in key order, each with `key`;
- a nested child: `s.memory.challenges[i].timer`, `s.schedules.challenges[i].timer.<name>`;
- **Revision (multiplicity audit, 2026-10-31).** a keyed schedule: `s.schedules.<name>[i]`, each `{ key, dueAt }`; a
  the operations' lanes:
  `s.operations.<name>`: a write's row, or under a keyed contract a keyed list of `{ key, …row }`, read by key with
  `O.<name>.get(s, k)` (rule 21); a one-off read's row or `undefined` (rule 42); a placement's lane, or under
  `subscribe.each` a keyed list (rule 41); a fragment's operations under its instance, `s.operations.<instance>.<name>`
  (`undefined` while inactive, a keyed list of copies under `.each`; rule 59), and its write lanes by key with
  `Fragment.O.<name>.get(s, k)` (rule 50); records of an entity domain the definition or a fragment in its tree lists
  in `operations`:
  `Entity.get(s, key, shape)`, `{ data, predicted, uncertain, unconfirmed }` (2.8.1). The record is the store's, read
  through the snapshot's cut, never memory (rule 26).

These names, operation names, state names and memory keys share one namespace, and a collision rejects. A slice is
`undefined` while its fragment is inactive, except a resumable slice, which stays present while frozen. Every list
above is a **keyed list** (rule N1): in key order, each entry with `key`, found by key with `find` (write lanes: with `get`); an entry that does
not exist is absent, never a default.

### 2.2 The contract

```ts
trait({
  id: "Pager",
  events: { Next: {}, Previous: {} },        // sent by anyone, at the instance path
  hostEvents: { Jump: { page: Schema.Int } },// sent only by the direct host, with `raise`
  internalEvents: { Due: {} },               // produced only by this fragment's own schedules or operations (rule 49)
  guards: { hasNext: Flow.Guard, canTurn: Flow.optional(Flow.Guard) },  // in: the host's predicates
  callbacks: {                                                          // out: the fragment carries on
    onTurned: Flow.Callback({ page: Schema.Int }),
    onIdle: Flow.optional(Flow.Callback({})),
  },
  // subroutines also: exits (out: the subroutine ends), states?, default?
  memory: {
    page: Flow.input(Schema.Int),                       // supplied by the host at activation
    turns: Flow.private(Flow.initial(Schema.Int, 0)),   // starts at 0; nothing outside sees it
  },
  traits: { settle: Debounce({ wait: "300 millis" }) }, // children it places and fills
}, ({ S, E, guards, callbacks, exits }) => ({
  on: {
    Next: { target: "self", guard: [guards.canTurn, guards.hasNext], updateMemory: … },
    Previous: { target: "self", guard: ({ memory }) => memory.page > 1 || deny("FirstPage"), … },
  },
  traits: { settle: { callbacks: { onSettled: { target: "self", notify: [callbacks.onIdle] } } } },
  whenAbandoned: [callbacks.onIdle],               // notified when this incarnation ends, except by an exit
}))
```

A fragment's transitions may also carry ordinary guards over its own memory (`Previous` above). A
guard slot may hold an array; all must pass. A **state token** may be an element of that array
(`guard: [S.TWO_FACTOR.ENTERING, …]`). It passes when the pre-turn state is at or below that token,
and `flow check` reads it structurally (rule 12).

| Port | The fragment uses it as | The host fills it with |
|---|---|---|
| `memory` fields marked `Flow.input` | ordinary memory, already set when it activates | `input: ({ memory, event }) => …`, the derived `Input` record, read from the before-walk memory (2.5) |
| `events` | handled in `on` | nothing; views and other senders send `E.pager.Next()` |
| `internalEvents` | sent by its own `schedules`, or mapped from its own operations' endings (rule 49) | nothing |
| `hostEvents` | handled in `on` | `raise: [E.pager.Jump.from(f)]` on any host transition |
| `guards` | `guard: guards.hasNext` | `guards: { hasNext: (g) => … \|\| deny("LastPage") }` |
| `callbacks` | `notify: [callbacks.onTurned.from(f)]` on a transition, or in `whenAbandoned` | an `on`-style handler (`target?`, `updateMemory?`, `actions?`, `raise?`), possibly ordered alternatives ending in an unguarded one; its data is `payload` |
| `exits` | `target: exits.Done`, or `exits.Done.from(f)` | an `on`-style handler that must leave the subroutine's state |

Every category sits at the top level and is named by its direction, as `events` already is:

| Category                                 | Direction                                    | Who writes the code that runs |
|------------------------------------------|----------------------------------------------|-------------------------------|
| `events`, `hostEvents`, `internalEvents` | in (from anyone, the host, itself)           | the fragment                  |
| `guards`                                 | in: the fragment consults them               | the host writes the predicate |
| `callbacks`                              | out: tell the host; the fragment carries on  | the host writes the handler   |
| `exits`                                  | out: return to the host; the subroutine ends | the host writes the handler   |

There is no grouping block: each list's name says what it is and which way it flows.

The host fills each instance in **one block**, in the machine:

- traits under `traits.<name>`, wherever they are placed;
- subroutines on their state, `states.<NAME>`.

A port is **required** unless wrapped in `Flow.optional(…)`, and leaving a required port unfilled
is a type error. Guards, callbacks and exits are declared with the `Flow` module (2.2.1); memory
fields with `Flow.input`, `Flow.initial` and `Flow.private` (2.2.2).

An optional port may be left out:

- an optional guard **allows**;
- an optional callback **ignores**.

`flow check` lists every unfilled optional guard as an info finding. The fragment author should
leave any guard that protects data required.

#### 2.2.1 The `Flow` module

Port kinds are declared with one module, `Flow`, which follows Effect Schema's conventions:
PascalCase values and constructors, camelCase combinators that are data-first and pipeable, and
`.pipe` / `.annotate` on every port. **Data stays Effect Schema**: a port holds a Schema payload; it
is not itself a Schema. `Schema` describes data; `Flow` describes only what Schema cannot say: port
kinds, optional versus required, and uncertainty.

| `Flow`                                           | Kind            | Meaning                                                                                                         | Schema counterpart                                                    |
|--------------------------------------------------|-----------------|-----------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| `Flow.Guard`                                     | value           | a place the host may refuse; no payload                                                                         | a value, like `Schema.Boolean`                                        |
| `Flow.Callback(fields)`                          | constructor     | a moment the fragment reports; the host fills a handler                                                         | `Schema.Struct(fields)`                                               |
| `Flow.Exit(fields)`                              | constructor     | a way a subroutine ends; the host maps it                                                                       | `Schema.Struct(fields)`                                               |
| `Flow.optional(port)`                            | combinator      | the host may leave the port unfilled                                                                            | shape of `Schema.optional`; a different meaning (a port, not a field) |
| `Flow.uncertain(fields)`                         | combinator      | marks an event that an operation's `unknown:` (or one of its tags) may target (rule 13)                           | none                                                                  |
| `Flow.annotate(port, { title?, description?, denials? })` | combinator | documentation for Inspection, devtools and agents; `denials` names the refusal codes a guard is expected to give | `Schema.annotate` |
| `Flow.input(schema)`                             | memory modifier | the creator supplies this field (2.2.2)                                                                         | none; derives the `Input` type                                        |
| `Flow.initial(schema, value or fn)`              | memory modifier | the field's starting value (2.2.2)                                                                              | `Schema.withConstructorDefault(Effect.succeed(value))`                |
| `Flow.private(schema)`                           | memory modifier | only the owner sees this field (2.2.2)                                                                          | none                                                                  |
| `Flow.Denial`                                    | value           | the Schema of what `deny(code, context?)` returns, `{ code, context? }`, for storing a refusal reason in memory | a value, like `Schema.Boolean`                                        |
| `Flow.entry`                                     | value           | in a schedule's `armOn`: also start when the schedule's owner begins (its state is entered, its trait created or reset; not on a thaw, F8) | none |
| `port.payload`                                   | field           | the payload `Schema.Struct`, for decode, encode or JSON Schema                                                  | none                                                                  |
| `Flow.Payload<P>`, `Flow.Filling<C>`             | types           | a port's payload type; the type of the host's filling block for a contract                                      | `Schema.Schema.Type<S>`                                               |
| `Flow.isGuard`, `Flow.isCallback`, `Flow.isExit` | predicates      | for tooling                                                                                                     | `Schema.isSchema`                                                     |

**Annotating ports.** `Flow.annotate` documents a port for the people and tools reading the
contract. It changes no behaviour. On a guard, `denials` lists the codes the host is expected to
refuse with, and what each means:

```ts
guards: {
  hasNext: Flow.annotate(Flow.Guard, {
    title: "Has a next page",
    description: "Whether a page exists after the current one.",
    denials: { LastPage: "The current page is the last one." },
  }),
  canTurn: Flow.optional(Flow.annotate(Flow.Guard, {
    description: "Whether turning pages is allowed right now, e.g. not while a page is loading.",
    denials: { Loading: "A page is still loading." },
  })),
},
callbacks: {
  onTurned: Flow.annotate(Flow.Callback({ page: Schema.Int }), {
    description: "After every turn, with the new page. Fill it to fetch that page.",
  }),
},
```

Where it shows up:

- **Inspection and devtools** show the description beside the port, and a `check()` verdict's
  `Denied` reasons with the matching `denials` text (`LastPage: The current page is the last one.`).
- **Agents and generated docs** read the contract with its text, so a host can be filled correctly
  without reading the fragment's body.
- **`flow check`** may list, as info, a code a filled guard returns that its port's `denials` does
  not name (from Story traces). It never fails the check.

`Flow` calls are written **data-first, wrapping their argument**, always:
`Flow.optional(Flow.Callback({}))`, `Flow.private(Flow.initial(Schema.Int, 0))`. They are Effect
duals, so `.pipe(Flow.private)` also type-checks, but wrapping is the canonical form, and `Flow` is
always outermost: Schema's own modifiers go inside, on the type.

Ports are not branded Schemas: if they were, `Schema.optional(Flow.Callback(…))` would type-check
and mean "an absent field" instead of "an unfilled port", generic Schema combinators would erase
the port kind `flow check` relies on, and meaningless operations (a union of callbacks, encoding a
guard) would type-check. A port *has* a Schema; it is not one.

Event payloads stay field records, as in Machines O1. A payload that needs a shape check is written
as Schema's own struct: `Changed: Schema.Struct({ value: Schema.String }).check(Schema.makeFilter(…))`.
A payload that fails its check is refused at admission, before guards run: **a check tests the
payload's shape and reads no memory; a guard is policy and may read memory.**

#### 2.2.2 Memory fields: where a value starts, and who sees it

Three `Flow` modifiers sit on memory fields, for fragments and machines alike. Each states a fact
about the field it wraps, so nothing about starting memory lives anywhere else: there is **no
top-level `input` block and no top-level `initial` function**.

| Modifier                                       | Meaning                                                                                                                                                                                                       |
|------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Flow.input(schema)`                           | The creator supplies this field: an actor's creator (`ensure(ref, { input })`, `useActor(m, { input })`), or a fragment's host (its `input:` filling). The definition's `Input` type is exactly these fields. |
| `Flow.initial(schema, value)`                  | A constant start. It is Schema's constructor default, `withConstructorDefault(Effect.succeed(value))`, restricted to a plain value so it is pure.                                                             |
| `Flow.initial(schema, ({ …fields }) => value)` | A computed start: a pure function of fields that start from `Flow.input` or a constant `Flow.initial`, never of another computed field.                                                                       |
| `Flow.private(schema)`                         | Only the owner sees this field: its own handlers, guards and selects. The host, views and other actors do not; Stories and Inspection do.                                                                     |

```ts
memory: {
  workspaceId: Flow.input(Schema.String),                             // supplied
  title: Flow.input(Schema.String),                                   // supplied, then edited
  draft: Flow.initial(Schema.String, ({ title }) => title),           // computed from a supplied field
  error: Flow.initial(Schema.NullOr(Schema.String), null),            // constant
  saves: Flow.private(Flow.initial(Schema.Int, 0)),                   // constant, hidden outside
  cursor: Schema.optionalKey(Schema.String),                          // an optional key starts absent
},
```

Rules:

- **Every field starts from exactly one source:** `Flow.input`, `Flow.initial` (constant or
  computed), or absence for an optional key. A field with none is a type error. `Flow.input` and
  `Flow.initial` never go on the same field.
- **Creation is pure and happens once per incarnation:** decode the input with the derived `Input`
  schema, copy the input fields, apply constant initials, then computed initials. No clock, no
  randomness, never on restore (Machines O1, React O2). The machine never sees an `input` value:
  input fields are ordinary memory, writable like any other.
- **Outside types omit private fields.** `s.memory.<field>` and a host's `memory.<instance>.<field>`
  are type errors for a private field. Only the owner writes any of its memory.
- **Markers survive.** `Flow` is outermost; a Schema modifier applied over a `Flow` marker is a type
  error, so a field cannot silently stop being an input.

A bare token is shorthand for `{ target: token }`, in a filling (`Confirmed: S.CANCELLED`) and in a
fragment (`Yes: exits.Confirmed`).

Each contract also carries an inferred **summary**.

- For every event, hostEvent and internalEvent (timer chains included), it records each
  alternative's effects: the callbacks it notifies, the exits it takes, and whether it is
  **total** (handled unguarded in every state). An event handled only by a schedule trigger (2.5 step 2)
  is total wherever that schedule is active, with no effects.
- It also records the callbacks `whenAbandoned` notifies.
- For a fragment with `operations`, it records each operation, its children's write operations included, and the
  contracts' Effect requirements (rule 57).
- Effects of different alternatives are exclusive, so two of them are never counted as two state
  changers.

The summary is part of the fragment's type and is printed by Inspection. `flow check` checks a host
against its fragments' summaries, never their bodies (rule 10).

**Test position with tokens.** A guard that only tests where the actor is uses a token element
(`guard: [S.WIZARD.INVITE]`). Closures test data, and their position tests are invisible to pruning.

Fragments may not declare `context`, `onContext`, `send` or persistence. They may declare `operations` (rule 49); a
trait body, and a subroutine's states, may hold `activities` (rules 41, 52).

### 2.3 Where things go

| What                                       | Where                                                                                                                                                                                 |
|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Placing a trait                            | host **definition**: the root's `traits`, or the node's `Flow.state(…, { traits })`; inside a fragment, the same in its declaration                                                   |
| Placing a subroutine                       | host **definition**: a state, `{ NAME: Sub }`, or `{ NAME: Flow.state(Sub, { traits }) }` with host traits on its node                                                                |
| Filling ports, `resetOn`                   | host **machine**, **at the node where it is placed**: the root's `traits.<name>`, a node's `states.<NAME>.traits.<name>`, a subroutine's `states.<NAME>`; inside a fragment, its body |
| What survives an abnormal ending           | the fragment's body: `whenAbandoned`, which may also release its operations' lanes (rule 60)                                                                                                                                                        |
| Feeding a fact into a fragment             | host **machine**: `raise` on any host transition                                                                                                                                      |
| Running I/O and mapping endings            | host **definition**: `operations`, each contract with its `outcomes` onto the host's events; host **machine**: `O.x.commit` and `O.x.lookup` in `actions`, `O.x.subscribe` in `activities` (2.7); or a fragment's declaration (`operations`) and body, the only place its operations are acted on (rules 49, 50) |
| A handler or guard shared by several nodes | the definition's `handler(path, h)` / `guard(path?, g)`, e.g. `Signup.guard(g)`: typed as if written at `path` (the root when omitted)                                                |

Placement is structure (it produces `S`, `E` and the view types), so it lives in the definition.
Filling refers to `S`, `E` and `O`, so it lives in the machine.

**Sharing a guard.** A guard written inline takes its types from where it sits; moved into a
variable for reuse, it would lose them. `Definition.guard(g)` keeps them: the guard is typed as if
written at the root (or at `path`, with `Definition.guard(path, g)`), and can then sit in any guard
slot, including a fragment's guard port. An operation's `idle(k)` is already a guard value, so it is shared as
it is:

```ts
export const SignInMachine = machine(SignIn, ({ S, O }) => {
  const notLockedOut = SignIn.guard(({ state }) => !S.TWO_FACTOR.LOCKED_OUT.is(state) || deny("LockedOut"));
  const notChecking = O.verify.idle(({ memory }) => ({ challengeId: memory.challengeId }));   // InFlight while a verify runs (3.1)

  return {
    states: {
      TWO_FACTOR: {
        traits: { code: { guards: { canEdit: notLockedOut } } },                        // a port filling
        on: { Resend: { target: "self", guard: [notLockedOut, notChecking], actions: [O.resend.commit(({ memory }) => ({ challengeId: memory.challengeId }))] } },
        states: {
          ENTERING: { on: { Submit: { target: S.TWO_FACTOR.VERIFYING, guard: [notChecking, codeValid], actions: [O.verify.commit(({ memory }) => ({ challengeId: memory.challengeId, code: memory.code.value }))] } } },
          // …
        },
      },
    },
  };
});
```

**Placing on a node.** `states` stays an ordered list: a string leaf, `{ NAME: [children] }`, or
`{ NAME: Sub }`. Only a node that carries traits is wrapped, with `Flow.state`, whose subject is the
node's children, nothing, or a subroutine:

```ts
states: [
  "PASSWORD",
  { TWO_FACTOR: Flow.state(["ENTERING", "VERIFYING", "LOCKED_OUT"], {        // children, plus traits
      traits: { code: Field(Schema.String, { validate: sixDigits }), resendCooldown: Countdown({ length: "30 seconds" }).resumable() },
  }) },
  { REVIEW: Flow.state({ traits: { diff: DiffView() } }) },                   // a leaf with traits
  { DELETE_ASK: Flow.state(Confirm, { traits: { hold: HoldToConfirm({ hold: "1.5 seconds" }) } }) },
],
traits: { challenges: Lockout({ limit: 3, length: "5 minutes" }) },         // the root node
```

A trait on a subroutine's node belongs to the host: it lives while the subroutine runs and cannot
see inside it. The same trait may be placed on several nodes with different parameters; instance
names stay unique per actor, because they namespace events and memory. **Place a trait on the
highest node whose lifetime matches its data**; `.resumable()` is for data that must also survive leaving
that node.

### 2.4 The rules

Rules 1–12 are fragments and the turn; rules 13–25 are server calls (2.7) and the memory and schedule reads they
rely on; N1–N3, after rule 25, say how many of each thing exist and which one a reference names (Revision
(multiplicity audit, 2026-10-31)); rules 26–38 are entity domains, 39–47 operations in the definition, and 48–60,
after rule 47, let fragments declare operations (2.9); 61–66, after rule 60, are Stories (2.10).

1. **Lifetime comes from placement.**
   - An **incarnation** is one life of a fragment instance. A trait gets a new one each time its
     node activates, and a subroutine on every entry. Leaving the node or state ends it: its
     schedules are cancelled and its memory is dropped.
   - **`.resumable()`.** A trait written `T.resumable()` and placed on X is **frozen** when X is left, not
     dropped. Its memory stays readable, and it resumes when X is entered again.
     - A resumable trait's schedule keeps its `dueAt`. It is not delivered while frozen, and on return it fires
       once if it is overdue.
     - A firing already queued when X is left is retracted, and fires on return.
     - A resumable trait is fresh again only when its `resetOn` value differs from the one it was frozen
       with. Re-entering X does not refresh it.
     - Freezing is not ending, so `whenAbandoned` does not run. It runs if the trait is reset on return.
     - Freezing releases the trait's placements and ends its lookups `failure { Interrupted }`, parked with the
       frozen slice; thawing delivers its parked endings, the interrupted lookups first, and places its `activities`
       again. `Flow.entry` does not fire on a thaw (rule 52; F8).
     - Subroutines are never resumable (a type error): they are things the actor goes into.
   - **History** (`S.X.history`) restores control only. Fragments placed at or below the restored
     child resume only if resumable. `flow check` warns when a history target can re-activate a node
     with non-resumable fragments under it, or a state that owns a call (re-entering it is a new activation, so the
     old call's ending routes late and the state would wait with nothing pending).
   - **`resetOn`** returns a **reset value**, compared with `Equal.equals` as `restartOn` is.
     - It reads the **before-walk memory** (2.5): the pre-turn memory with the source
       transition's own `updateMemory` applied, plus the fresh slices of traits reset before it.
     - Traits reset in declaration order (their order of placement), and each `resetOn` is typed to
       read only host memory and earlier traits. A reset cycle therefore cannot be written.
     - A reset gives the trait a new incarnation **before** the turn's parts react, so a raise into
       it in the same turn reaches the fresh incarnation.
     - **A key written by a part** (a callback or exit filling) is not seen until commit. There,
       every `resetOn` is evaluated again on the after memory. A changed value becomes a
       **pending reset**. It runs as its own **follow-up turn**, at the head of the mailbox, right
       after the commit that recorded it. That turn resets, runs `whenAbandoned`, arms entry timers and
       publishes. It cannot refuse. The lag is exactly one snapshot, `check()` sees the same
       turns, and `whenAbandoned` never shares a turn with unrelated work. Pending resets are not
       persisted: on restore, `resetOn` baselines are re-taken silently (section 6), except on a placement that owns a mapped write:
       there the reset value is a string and a subject part, recorded with the slice, and a re-taken value that differs
       resets the trait as a pending reset, the first turn after restore (rules 48, 51).
     - On a list, a reset removes every instance.
   - **Typing.** A trait slice placed at X is typed as present in every handler, guard and select
     written at or below X. Code written elsewhere is typed where it is used:
     - a commit's or lookup's select is written in, and typed by, its transition;
     - a shared handler or guard is wrapped in the definition's `handler(path, h)` /
       `guard(path?, g)`;
     - any other helper sees the root view.
2. **Three sender lists.**
   - `events` come from anyone: views, other actors, the host.
   - `hostEvents` come only from the direct host, by `raise`.
   - `internalEvents` come only from the declarer's own schedules or its operations' endings (a fragment's too, rule
     49); an event an operation maps comes only from endings (rule 47).

   Each declarer maps its operations' endings onto **its own** events, through their `outcomes`; a host raises into fragments. Sending a
   host or internal event from outside is a type error, and `InvalidEvent` untyped.
3. **I/O is opt-in.** A fragment reads no context and sends to no actor. It runs operations only if it declares them
   (rule 49), within rule 48's scope; a fragment without `operations` is unchanged.
4. **The host cannot reach inside.** It cannot handle a fragment's events in its own `on`, write its
   memory, or change its transitions. It can read everything. Its policy enters only through the
   declared guards. It reads a fragment's write lanes through `Fragment.O` and its other rows at the instance path,
   and never acts on them: a host that wants a stop or a retry sends the fragment's public `events` or `hostEvents`
   (rule 50).
5. **Every port is filled, or optional** (section 2.2).
6. **Callbacks ask; exits leave; leaving is told.**
   - A callback never moves the host out of the fragment's placement node. So a root trait's
     callback may target anything, and a subroutine's callback targets nothing.
   - An exit filling must leave the subroutine's state, and every exit is filled.
   - Inside a subroutine's state, host events fall through to the host's ancestors and root as
     usual. Only a transition that **exits** the subroutine's state abandons it; an ancestor's
     `"self"` does not.
   - **`whenAbandoned`.** It is notified when an incarnation ends other than by its own exit: its node
     is left, it is abandoned, removed or reset (not frozen). It is fused into the leaving turn
     (2.5, step 3). Its payload mappers read the incarnation's pre-turn memory. Its fillings
     cannot target, cannot refuse (rule 8), and write only keys the leaving transition does not
     write. It may list a write operation's key-less `O.x.cancel`: listed in step 3 with the notifications, it
     releases that operation's lanes of this incarnation's subject path in step 5, after every member (rule 60); it
     reads no memory, so rule 22 and `KeyRequired` do not apply.
   - **A late ending never leaves live work.** A late turn may not exit a state that owns another pending call, or
     an active subroutine (rule 15).
7. **One turn.** A transition and everything it raises, notifies, exits, resets and leaves compile
   into one transition, run by the algorithm in 2.5. That algorithm is normative for the runtime
   and for `check()`.
8. **Deliveries are never lost.** This covers every event a server or a clock produces, and every
   ending the host cannot refuse:
   - call endings, current and late (rules 14, 20), to the binding incarnation, or parked for the lane's subject path
     (rule 53), except what rule 17 makes evidence by declaration, a releasing lane's included (rule 60);
   - exit fillings;
   - `whenAbandoned` fillings;
   - timer-fired handlers;
   - stream deliveries of a live session; a released session's undelivered items are discarded with evidence (rule 70).

   Each must be handled, ending in an unguarded alternative, in every state where it can arrive.
   Everything those handlers raise or notify must be total by the child's summary. A write lane whose operation
   is gone, or whose key no longer decodes, goes to its descriptor's `orphaned` handler, outside any actor (P19); a lane
   whose actor record no longer decodes is adopted by the fresh incarnation (rule 46).
9. **Many copies: `.each`.** Full design, reasons and nine worked examples:
   [merged/each.md](merged/each.md). `T.each({ of, max, by? })`
   places one copy of T per key in the memory field `of` names, of the placing definition or fragment, in
   that field's order.
   - **Membership is host data.** Keys are strings, bare or in records (`by` names the key field).
     The host adds and removes copies by writing the field in its own transitions, behind its own
     guards. There are no `Add` or `Remove` events. `max` is required.
   - **Fillings and views.** One filling serves every copy, and each part of it receives `key` and
     `item` (the entry). **Revision (multiplicity audit, 2026-10-31; amended by the operations merge).** A copy may own operations (rule 48); a
     lane its commit creates records the copy's key as a part of its subject path (rule 51). A commit
     started in a copy's filling is an ordinary commit of the host's operation: its lane is named by the contract's key,
     picked from the input, so copies whose input carries the copy's key have their own lanes, and copies whose input
     does not share one, which is `reject`'s promise (rule 21). The Attempt carries no copy key; a handler that needs the
     copy reads it from the mapper's `key` or `input`. Call endings are governed by rules 8, 14, 17 and 20 and are never
     dropped; only a raise the ending's handler makes into a copy that is gone follows the drop below (rule N3). A host operation's lane has path `[]` and the actor as its binding incarnation. `s.memory.<name>` and `s.schedules.<name>` are the copies in
     key order, each `{ key, item, … }` (`key` only when the field is `Flow.private`). Views send
     `E.<name>.key(k).Event(…)`; host raises put `key` in the mapper's result. `key` and `item` are
     reserved memory names in a trait placed with `.each`.
   - **The turn** (2.5). Raises during the walk see the before-walk list, so a source can add a
     key and raise into it. After the walk, the **final list** (every patch applied) decides
     membership for this turn: a key gone ends its copy, with `whenAbandoned` fused; a new key is seeded
     from the after memory. A copy created and ended in one turn is never published. `whenAbandoned`
     fillings of a list's copies may not write that list's field.
   - **Repair, never refuse.** A duplicate key keeps its first entry; keys past `max` are dropped.
     Each repair is recorded as evidence, so a list can never cost a delivery (rule 8). A raise into
     an absent key is dropped with evidence in a turn sourced by a delivery, and refuses otherwise.
   - **Incarnations.** Each copy of a key is a new incarnation, numbered by a counter that persists
     with the actor. A delivery reaches the incarnation it was started or armed under. If that one
     is dead and the same turn created a new one for the key, it reaches the new one (the sign-in
     relies on this). Otherwise it is dropped with evidence and the rest of the turn commits.
     Removing and re-adding a key in one patch changes nothing. View events address keys, not
     incarnations. Copies arming for the same instant fire in list order. These drops cover raises and timer
     firings; call endings are never dropped (above).
   - **Frozen, persisted, hydrated.** With `.resumable()`, frozen copies are still reconciled every
     turn. Copies persist by key with their counters; on restore the key list wins and is repaired.
     Hydration restores copies and never re-runs `input`.
   - **Analysis.** `flow check` and `flow graph` see one node per placement, with its field and
     `max`, and check the template once. Which transitions add or remove keys is runtime data,
     checked by Stories; repairs and dropped raises are Story-derived warnings. Nested `.each` is out of
     scope.
10. **Nesting hides the level below, for types and for checks.** A fragment places children in its
    contract and fills them in its body. It raises only into its direct children. `flow check`
    verifies a host's raise and notify graph and its rule-8 totality from its children's summaries
    only. It checks each fragment body against its own summary. Swapping a fragment for one with
    the same contract and summary cannot break its host. A changed summary is a changed contract.
    **One exception** (rule 57): a fragment's summary carries its children's write operations (contract, holding,
    releasing) and its contracts' requirements, so `SharedContract` and rule 56 work above a nested writing child;
    changing such a child changes every ancestor's summary.
11. **Tested alone** (Stories T3; W1, W5, W30–W34). `Story.fragment(fragment, { id, fixtures?, world? })` runs the fragment
    in an invisible **stand-in host** whose placement its declaration alone decides (2.10.12). `enter(input?, { subject? })`
    starts it, with its `Input` record; `leave()` ends it, or freezes a resumable trait; `leave({ end: true })` ends a
    frozen one; `reset(subject)` (traits) changes its reset value; `guards(answers)` sets the stand-in's guard answers
    (default: allow); public `events` and `hostEvents` may be sent. Notifications, `whenAbandoned` included, are `callback`
    records and exits are `exit` records, the same as in a host (rule 58).
12. **Construction errors and runtime defects.**
    - **Construction errors** (types or `flow check`):
      - unfilled required ports;
      - rules 6, 8 and 10, and rule 20's late handlers;
      - a raise into a fragment that the turn's state change, as tokens show it, exits;
      - two state changers or overlapping keys that the state-token pruning cannot separate;
      - an acting member of a fragment's operation used outside that fragment (rule 50);
      - a mapped write outside rule 48's scope;
      - a non-string `resetOn` on a placement that owns a mapped write (rule 48).
    - **Pruning reads only state tokens that are elements of guard arrays.** It never parses
      closures. Two alternatives made exclusive by their token elements are not flagged.
    - **Runtime pre-commit defects,** each also a `flow check` warning where it can be seen:
      - an overlap that only closures separate;
      - a raise into a fragment that a state change selected later in the same turn enters or
        exits;
      - an effect-only read that fails, or a schedule duration that is invalid (rule 22).

**Server calls** (2.7). A **write** is one commit of a write operation, an **Attempt** with an id Flow mints; a **send**
is one invocation of its commit function. The rules are numbered as merge 2's rule *n* + 12
([merged/server-calls/proposal.md](merged/server-calls/proposal.md)). Rules 39–47 (after rule 38) declare operations; rules
13–25 say how their work runs. Rules 48–60 let a fragment declare them; read "the definition" in rules 13–47 as "the
declarer" (a definition or a fragment), and "binding actor" as "binding incarnation" (rule 53).

13. **Endings map to events, on the declarer.** An operation `name: contract.outcomes({ … })` (rule 40) maps each
    ending to one of its declarer's events (a definition's, or a fragment's `internalEvents`, rule 49): for a write `success:`, `failure:` (an exhaustive record over the commit's
    failure tags, plus an optional `NotSent`; or one event for an untagged failure type), and `unknown:` (one event, or
    a record by tag as `failure` is, OD23 Q36; 2.7.13); for a read `success:` (one-off) or `value:` (live) and
    `failure:` (rule 41); for a stream `value:`, `pages:`, `missed:`, `failure:`, with `fills` beside them as data (rule 67, 2.11.6). A mapping value is an event (payload-free) or `E.X.from((value, ctx) => payload)`, with `ctx`
    `{ input, attempt, progress, key }` for a write and `{ input, key }` for a read or stream; `key` is the contract's
    key record of the call that ended. Several endings may map to one event. Every `unknown:` target is a
    `Flow.uncertain` event. A read's `failure:` carries its tags plus Flow's `Defect` and `Interrupted` (rule 37). An
    author error whose tag is one of Flow's reasons (`NotSent`, `Cancelled`, `Restored`, `Interrupted`, `Defect`,
    `StillUnknown`, `StorageRefused`) is a type error; on a stream, so is one of `Feed`'s reasons (`Closed`, `Overflow`, `Silent`, `Flapping`) or the tag `Feed`, the map's own key [P, merge]. A commit's context also gives `progress(p)`, which sets its row's `progress` with no turn (Streams T8).
14. **Owner, current, late, decided at admission.** Stream deliveries are always current from the active leaf; a session's owner is its placement's activation or incarnation, and release discards rather than routing late (rule 70). Otherwise, a commit, lookup or retry of an operation is owned by the activation
    of the state its transition names (`"self"`: the handler's own state). When the ending's turn is **admitted** (2.5
    step 1), Flow maps the ending through the operation's `outcomes` and tests the owner against the pre-turn snapshot.
    If that activation is alive, the event is **current** and routes from the active leaf. Otherwise it is **late** and
    the same event routes from the nearest strict ancestor of the owner whose activation is the one alive when the call
    started (the root at worst). **One owner test**, whenever an ending lands, parked or not (rule 44): the owner
    activation alive → current; an activation of this incarnation that has ended → late; never an activation of this
    incarnation (an adopted lane) → current, from the active leaf. Every `unknown { Restored }` is current from the
    active leaf. The test runs inside the binding incarnation (rule 53): a fragment's operation is current or late
    within that incarnation, and an adopted ending is current from its active leaf (a trait: its own `on`). With no
    binding incarnation the ending is parked for the lane's path (rule 53), unless the lane is releasing (rule 60). Routing is never decided at settlement. Settlement decides only the Attempt's ending (rule 18) and, for
    a domain write, its store effects (rule 27).
15. **Late turns.** In a late event's turn, an alternative whose target would exit a state that owns another pending
    call, or an active subroutine, is denied (`LateMayNotLeave`); so a late handler ends in an alternative that does not
    move (`flow check`). A call started in a late turn is an ordinary call with its own owner: lateness is not
    transitive. Only the host's own operations count: a fragment's work belongs to its incarnation (rules 52, 53), so
    ending a placement never leaves live work.
16. **Declines are endings; Flow adds no guard.** A decline refuses only the write, never the transition that asked for
    it: the transition's target, memory and other actions run as written. Under `concurrency: "reject"`, a commit on a
    lane that is `InFlight` or `Held` invokes nothing and ends `NotSent { why: "Rejected" }`. A commit past its lane's
    queued commits or a record queue's bound is declined the same way, `NotSent { why: "Overloaded" }` (rule 35). Under
    every concurrency, a commit from an incarnation whose subject path differs from the lane's ends `NotSent { why:
    "Rejected" }`, and the transition runs (rule 51). A retry on an `InFlight` lane is evidence `InFlight`, and on an `Idle` lane evidence `NothingToResend`: neither is an
    ending (rule 17). A declined commit has no Attempt, so its `NotSent` mapper sees `attempt` undefined (decision D17,
    as amended). The ending is mapped through the operation's `outcomes` and owned by the transition that asked (rule
    14). To refuse the transition itself, the author writes `O.pay.idle(k?)` in its guard, so `check()` and a view's
    button agree. `flow check` warns when a transition that changes state lists a `reject` commit without its `idle`
    guard.
17. **Every commit ends once, unless its operation declares it replaceable.** Every commit and lookup, and every retry
    that sends, delivers exactly one ending, to a live incarnation of its identity with the lane's subject path, or parked for it
    (rules 44, 53). This holds within one Runtime; across a crash the restore row decides (2.7.13): an Attempt whose
    acknowledgement was stored restores as `unknown { Restored }`, even if its `NotSent { Cancelled }` was delivered
    before its record was cleared (Stories T7; section 7 item 21).
    Evidence, by declaration: a never-sent commit replaced under `latest` (`Superseded`); a lookup a newer lookup or
    `cancel` released (`Superseded`); a declined retry (`InFlight`, `NothingToResend`); a bare write's endings (rule
    40); under `concurrency: "cancel"`, the ending of an Attempt a newer commit interrupted; a fragment's lookup whose
    incarnation ended (rule 52); an ending of a releasing lane, and its queued commits (rule 60). A freeze is not a
    release: it ends the lookup (rule 52).
18. **The Attempt's ending.** Each send is classified as in 2.7.1. The Attempt's ending is decided at settlement, from
    the Attempt's send history; admission only maps it (2.5 step 1, rule 27). The ending delivered is the Attempt's: success if
    this send succeeded; a definite failure only if no earlier send of the same Attempt ended unknown; otherwise
    `unknown` with reason `StillUnknown { failure }`.
19. **The key is the Attempt's id.** Flow mints `attempt.id`, random, when a write starts; every send of that write
    carries the same id. The commit author puts it on the wire where the API expects it; Flow sends nothing itself and
    derives no other key. Re-sending after an unknown is `O.pay.retry` (the same id, so the server dedups). After a
    definite failure nothing happened, so trying again is a new write (`pay`, a new id): a server that stores failures
    under a key cannot replay one. A failed Attempt is resolved: a `retry` after it is
    evidence `NothingToResend`, and trying again is a new commit.
20. **Required handling** (`flow check`). Every current event that can occur is handled totally from every leaf under
    its owner (fall-through to ancestors included). `failure.NotSent` must be mapped only where it can occur: under
    `reject` (`Rejected`) or `serialize` (`Overloaded`), where the machine cancels the operation (`Cancelled`), for a
    persisted identity (`Restored`, `StorageRefused`, `Disposed`), or for a domain write (`Overloaded`, rule 35), or on a placement whose subject path is not
    empty (`Rejected`, rule 51; checked at the placement from the fragment's summary, rule 57). A read
    operation's tag record must map `Defect` and `Interrupted` (rule 37). **Every late event that can occur, from any
    channel, is handled** at a strict ancestor of the owner; `{ target: "self" }` is the explicit ignore. A missing late
    handler is a `flow check` error naming the event and the state whose leaving makes it late. Flow cannot know which
    late failures matter (sign-in's late `WrongCode` is a strike), so a person decides for each one. **Adopted endings**
    (OD22). Every event a write operation maps (`success`, each `failure` tag, `unknown` or each of its tags) is handled
    totally from every leaf of that operation's new-incarnation arrival set of its declarer (a fragment: its own body, rule 55) (2.7.14); `{ target: "self" }` is the
    explicit ignore; a missing handler is a `flow check` error naming the event and the leaf. **Streams:** `value`, `pages`, `missed` and `failure` are handled from every leaf under the placing state, with no late handler; an unmapped required key is `FeedUnhandled` (2.11.6). Requirements are read per
    operation; a bare operation has none.
21. **The write lane** (2.7.13; decisions OD5–OD7, OD10, OD16, OD19, OD20, OD25). A write lane is (actor identity,
    contract id, key of the input), owned by the Runtime; the live incarnation that receives its endings is its **binding incarnation** (the actor for a
    definition's operation; rule 53). It is created
    by work and removed when `Idle`. Its states are `Idle`, `InFlight` (waiting to be invoked, or on the wire) and
    `Held` (a retained unknown), each with queued commits `W`; every member, ending and Runtime step acts by the table
    in 2.7.13, which is normative, and a turn's members apply in step 5 in action order (2.5). Only a never-sent commit
    is replaceable; a sent Attempt's ending is always delivered; under `reject`, `latest` and `serialize` an unknown
    holds the lane until `retry` resolves it or `cancel` releases it; `cancel` and `allow` hold it for its own ending's
    turn (`HeldThisTurn`), or, for a persisted identity with no live actor, until it is delivered (`Held`, parked). The
    **addressable Attempt** is the lane's one sent, unresolved Attempt (the head under `serialize`). **Rows**
    (`s.operations.<name>`; `O.<name>.get(s, k)`): `{ pending, uncertain, waiting, retryCount, progress? }`, plus
    `outstanding` under `serialize`; `{ pending, retryCount, progress? }` under `cancel`; `{ pending, outstanding }`
    under `allow`. `pending` is `InFlight`; `uncertain` is `Held`; `waiting` is `W` not empty; `outstanding` counts
    unresolved commits other than the addressable Attempt; `retryCount` counts the addressable Attempt's invoked
    re-sends. A failed Attempt is resolved, not kept for `retry`. **Members:** `retry(k?)` and `cancel(k?)` in actions;
    `idle(k?)` (a partial key passes only when every lane it matches is `Idle`, OD23 Q34) and `retryable(k?, { times })`
    in guards. A lane held by an unknown, bound or unbound, is listed by Inspection, so a lane nobody reconciles is
    visible in Inspection and in a checkpoint's `inspection` lane listing, the same listing (2.10.7). A lane created by a fragment's commit records the committing
    incarnation's subject path; a member from another path is declined (rule 51); a lane may be marked releasing (rule
    60). A lane holds no store state: predictions, record
    queues and marks are the store's (rule 26).
22. **Memory reads: before for decisions, after for effects** (decision D15). A memory read in a turn sees one of two
    values. A read whose result can change this turn's memory (a guard, an `updateMemory`, a payload mapper that
    raises, notifies or fills an exit, and the key select of an `idle` guard) sees **before**, the last published snapshot. A read whose result only starts
    or times work (a commit's or lookup's select, a member's key select, a schedule function, `keys`,
    `restartOn`, a placement's select and `when`) sees **after**, the memory this turn
    publishes: initial memory of new incarnations, then every patch in expansion order, after list repair. After is
    computed in step 5, before commit, so a failing select or an invalid duration rejects the turn (`InvalidTurn`).
    - **One exception: incarnation creation.** `resetOn` and `input` read **before-walk** (before, plus the source's
      patch and earlier resets), because they decide which incarnations the parts address before the walk. The
      `resetOn` re-check at commit reads after.
    - **Callbacks** (rule 36). `optimistic` reads the starting turn's after memory, captured when the start is
      recorded; `writes` reads no memory.
    - **Why two values, not one.** Guards and patch-feeding reads cannot see after (it depends on them), and
      effect-only reads seeing before is the stale-etag and zero-`Retry-After` bug.
    - **Two values in one transition** (decision D16). A mapper reads the old value of a key its own turn writes while
      a select reads the new one. `flow check` warns when one transition reads, in both views, a key it writes.
    - **The pending reset edge.** A part writes a key a `resetOn` watches and the same turn starts a commit whose
      select reads that slice: the select sees the old incarnation, and the reset follows one turn later.
    - **Lane reads** (`operations`, `get` and the `idle` and `retryable` guards) are not memory. Selects, guards and
      `updateMemory` (with `get` only) see the pre-turn lanes with the turn's own ending admitted; `keys`, `when`, placement selects and the published rows
      see the **after lanes**, the lanes with this turn's members applied (rule 21; OD16). Inside a fragment, `operations` is that
      fragment's own rows (rule 59).
23. **Schedules.** A function schedule reads the after memory of the arming turn (rule 22). `armOn` counts an event
    accepted anywhere on the active path. A keyed schedule's `keys` return key records (`({ docId })`, the shape of a
    contract's key) from the after memory and the after lanes, so `keys` may read `operations` (OD23 Q29),
    inside a fragment its own rows and under `.each` only the lanes of that copy's path (rule 59); it keeps one
    timer per key, armed when the key first appears, cancelled when it leaves, firing once with `key` in its metadata.
    `restartOn` on a keyed schedule is evaluated per key, `({ key, memory }) => value`, and restarts that key's timer
    when its value changes; `armOn` on a keyed schedule is a construction error (OD17 Q13). **Revision (multiplicity
    audit, 2026-10-31).** A key the `keys` result repeats keeps its first position, with `listRepair` evidence, as
    `.each` repairs (rule 9); per-key timers persist by key with their `dueAt`, and on restore the keys of the restored
    memory win. One live session per key is `O.x.subscribe.each(select)` (rule 41).
24. **Cancel** acts on the addressable Attempt, the one `retry` names (2.7.13; OD7). On the wire it interrupts the
    commit's fiber; the ending (`unknown`, `Cancelled`) is queued when the fiber has exited and is retained (`Held`), so
    nothing newer is sent while the request may land. Waiting to be invoked, it acts by history: never sent, it ends
    `NotSent { why: "Cancelled" }` and the next queued commit is promoted; a re-send returns to `Held` and is released.
    In `Held` it releases the Attempt (`Released`, evidence) and promotes the next queued commit. In `Idle` it does
    nothing, with evidence. It never drops a queued commit silently, except a release on leave the fragment declares, whose cells act on every
    lane of the subject path and end its queued commits as evidence (rule 60). **A settled ending is never rewritten.** A one-off
    read's `cancel` is rule 42's. On a domain write, rule 30 gives each ending's store effects (rule 29).
25. **No Flow timeout and no Flow retry, of a session or a call** (amended, S15). Waiting and trying again are states and schedules of the machine (2.7.6). Flow never re-opens a session or a call. Within a session, it re-runs a connection only by the contract's declared `reconnect`, and fails it by the declared `idleTime` (2.11.10, Streams T1). A streaming write keeps its own timeout, in its commit (2.11.12.5).
    **Classification runs outside the fiber it interrupts.**

**Multiplicity** (rules N1–N3). **Revision (multiplicity audit, 2026-10-31).** Every rule above that names "the" lane,
"the" Attempt, "the" copy or "the" session obeys these three; [audit-multiplicity.md](../../../../archive/flow-design-2026-11/machine-fragments/audit-multiplicity.md) has the
matrix behind them and a failing sequence for each case they close.

- **N1. One reference, one thing; many is a keyed list.** A declaration that can have several instances at once
  publishes them as a list in key order, each entry with `key`: `.each` copies, keyed schedules, `subscribe.each`
  placements, a keyed operation's write lanes, a fragment's rows under an `.each` placement (one entry per copy, each
  listing only the lanes of that copy's path; rule 59). A read names its entry by key. A reference that can match several says in
  its name or type how it aggregates: `idle` passes only when its lane, or every lane a partial key matches, is `Idle`;
  a row's `pending` is `InFlight`; `retry` and `cancel` name one Attempt; `outstanding` counts unresolved commits other
  than the addressable one.
- **N2. A per-call reference names one Attempt.** `retry`, `retryable`, and a lane row's `retryCount` and `progress`
  address the lane's addressable Attempt: under `reject`, `latest` and `cancel` the one minted Attempt, under
  `serialize` the head (OD19). Under `allow` they exist only key-less in an ending's own handler, naming that ending's
  Attempt (OD20); elsewhere they are type errors. A call that needs its own status, retry or progress gets its own key
  (a draft id, an upload ref, a client message id) and `reject`, so one lane is one call. Every ending reads its origin
  (operation, key) from its Attempt, never from the transition that retried it, and every mapper receives `key`.
- **N3. Existence is explicit.** A read of something that may not exist returns `undefined` (a one-off read row before
  its first lookup or after `cancel`, an inactive placement, a copy, a record), never a default that looks like an
  existing thing. A write lane read by key, `O.x.get(s, k)`, is total: a key with no lane reads the idle row, which is
  true because lanes exist only while they hold work (rule 21); `s.operations.x` lists only the lanes that exist. Each
  delivery to something gone has one rule: call endings are never dropped: they reach the binding incarnation, or
  are parked for the lane's subject path or the identity's saved record, routed by owner (rules 8, 14, 17, 20, 44,
  53), unless their lane is releasing (rule 60); raises and timers to a dead copy are dropped
  with evidence (rule 9); a released stream session's deliveries are discarded with evidence (rule 70). Whatever the
  store keeps for an Attempt (a prediction, an uncertain mark) holds its record (rules 30, 32).

**Entity domains** (2.8). Rules 26–38 are merge 4's ([merged/entities.md](merged/entities.md)); each names its
decision (E1–E18). Rules 13–25 and N1–N3 still apply.

26. **One split** (E1). For an operation registered in a domain (by a definition, or by a fragment for its actor,
    rule 49), the domain owns shared data: the prediction, its
    confirmation and rollback, repair, the record queue, `uncertain` and `unconfirmed`. The operation and the
    machine own workflow: which event each ending becomes, its route, retry and cancel. A commit's `optimistic` and a
    `setData` action on its own entries are type errors on a domain operation (EDP:60-61; OD26). Memory holds workflow and never a copy of a record field; views read records and
    answers.
27. **Settlement for the store, admission for the lane** (E4, E13). At settlement Flow classifies the send, applies
    rule 18, applies the Attempt's ending to the store (rule 30) and releases record queues, in one publication, then
    queues the ending. At admission it maps the ending, tests its owner and applies the ending's cell to the lane (rules 14, 21); for a
    lane with no binding incarnation the Runtime applies the cell when the ending lands, and parks the ending (rules 44,
    53). A
    Runtime step publishes the rows it changes (2.5). Store effects never depend on whether the ending routes current
    or late, or on whether an incarnation is bound.
28. **A start publishes with its turn.** A domain write that starts joins every record queue it predicts and applies
    its prediction in the starting turn's publication (2.5 steps 5–6). A start declined as `Rejected` or `Overloaded`
    applies nothing. A `latest` or `serialize` commit queued behind an `InFlight` or `Held` Attempt (`W`) joins and
    predicts at commit too, and is invoked only once its lane promotes it and it heads every queue it joined (2.7.13;
    the cross-actor wait this causes is a stated limit there).
29. **The actor first, then the record queue** (E5). Actor concurrency (`reject`, `latest`, `allow`, `serialize`)
    decides whether a start is admitted; the record queue decides when it is sent. A `latest` waiting commit joins
    the record queue; a newer commit replaces a never-sent queued write, or a never-sent head not yet invoked: evidence
    `Superseded`, prediction removed, queue entry removed, no repair, delivered to no handler (rule 17).
    `concurrency: "cancel"` on a predicting write is a `flow check` error; `O.x.cancel(k?)` follows rule 24 and the
    table (2.7.13), with rule 30's store effects.
30. **The store follows the Attempt's ending** (E8). Success confirms; a definite failure removes predictions without
    repair; `NotSent` (`Rejected`, `Overloaded`, `Cancelled`, `Restored`, `StorageRefused`,
    `Disposed`) and evidence `Superseded` remove or never apply them, without repair (2.8.5); `Released` keeps the mark
    (rule 32) and withdraws a waiting re-send's queue entry (2.8.6); unknown, including `StillUnknown`, keeps live
    predictions until a forced repair lands, holds the record queue until that repair settles, and marks the record
    uncertain for that Attempt. **Revision (multiplicity audit, 2026-10-31) (E18).** A prediction over a record the store does not hold (never held,
    or deleted beneath it by an earlier write or a push) shows nothing, and the record reads absent; it stays with its
    Attempt for the record queue and settlement, and its field functions run only once a base exists.
31. **A retry is the same request** (E2, E7). `O.x.retry(k?)` is the only re-send of a domain write. **Revision
    (multiplicity audit, 2026-10-31) (E17; amended by OD19).** It exists only where the lane has an addressable Attempt
    (rule N2: `reject`, `latest`, the `serialize` head; `concurrency: "cancel"` is an error on a predicting write, rule
    29), and re-sends only in `Held` (rule 21); a domain write that must be retried under several concurrent calls takes
    a per-call key and `reject`. It sends the Attempt's input and `basedOn` unchanged, applies no prediction and joins
    the record queue. Its response is positioned at the Attempt's first send; a differing field it loses on is contested
    (EDP:66-69).
32. **What clears `uncertain`** (E3). A mark is per record and Attempt. A success of a retry of that Attempt clears it;
    a success of a later write to the record clears every mark on that record whose Attempt is resolved or released; a
    mark whose Attempt is still unresolved stays (OD19). `Released` is a store effect: the record queue learns the
    Attempt is given up. Disposal is not a release. A read, a forced repair, a failure and
    `StillUnknown` clear nothing. **Revision (multiplicity audit, 2026-10-31) (E18).** A mark holds its record, as a prediction does, so the record is
    not collected while it may still be changed by a lost request.
33. **No temporary ids** (E9). A domain list holds only records the server returned. A pending create is a memory draft
    the view shows apart from the answer; membership appears when an answer's refetch holds its key.
34. **The key of a domain write** (E10, superseded by OD15; 2.8.8). A domain write states `key` like every contract
    (rule 39). `flow check` warns when a write that predicts exactly one record declares key fields that are not the
    input fields its predicted record's key reads, since two lanes for one record would let `reject` pass two writes. A
    write whose predicted key the Model records as `many` (an array, from the input Schema; merge 5, M5-D9) reads its
    keys at start and predicts each listed record once; the warning does not apply to it, or to writes that predict
    several records or none.
35. **Overflow is an ending** (E11). A commit that would exceed its lane's queued commits (`W`, 64 under `serialize`) or any record queue, or a `many`
    key array past 4,096 items (merge 5, M5-D10), ends `NotSent { why: "Overloaded" }`, with no prediction and no queue join; the transition and its other actions run.
36. **Callback reads** (E12, amends rule 22; OD26). `optimistic`, the commit's only option
    (`O.x.commit(select, { optimistic })`), reads the starting turn's after memory, captured at commit. `writes`, the
    operation's option (`contract.outcomes(mapping, { writes })`), receives `{ value, input }` and reads no memory, so it
    is found by contract id after a rebind or reload, as `outcomes` are. Domain operations have no `optimistic`; their
    `writes` may only invalidate (2.8.9).
37. **Reads carry confirmed data** (E15). A read operation's `success:` and `value:` see confirmed data only. A read's defect
    or interruption ends on `failure` as `Defect` or `Interrupted`, a lookup cut by a freeze included (rule 52); a tag record must map them (rule 20;
    2.8.10). On a stream, `failure` maps Flow's reasons by name or by the one key `Feed` (2.11.6); an `every` feed maps `value`, `missed`, `fills` and `failure`, or is a `listen` entry.
38. **Lanes and predicted keys persist together** (E14; amended by OD20). A domain write's lane record, its Attempt and
    that Attempt's predicted keys are written in one capture, the Attempt's one Persistence O6 acknowledgement before
    its first invocation (rule 46). Prediction values are never persisted.

**Operations in the definition** (2.7, 2.7.13–2.7.16). Rules 39–47 are the operations merge's
([merged/operations/proposal.md](merged/operations/proposal.md)); each names its decisions.

39. **Contracts** (OD4, OD11–OD15, OD17 Q18, OD18, OD23 Q37, Q38). A contract (`transaction`, `resource`, `stream`, or a
    domain entry) lives in `*.contracts.ts` and has exactly two schemas, `input` and `output`, flat at its top level,
    each a fields record or a full Schema (an omitted `output` is `Schema.Void`), and its function inline (`commit`,
    `lookup`, `subscribe`, and a stream's `catchUp`), which calls services whose Layer is the swap point. A transaction's `progress` keeps its own
    schema. `key` is required on every contract, streams included: a list of top-level `input` fields naming which
    server thing a call is about, `[]` for one; a composite key lists every field; its Schema is `input`'s pick; there
    are no derived or nested keys, and no default, domain writes included. On a resource, every `input` field that
    changes the output is in `key` (`KeyOmitsInput` warns otherwise); a stream's position is not in `input`: the contract names a field of `output` (`position`), and the bookmark holds it (rule 71; overturns OD12's clause, S15). A session reads `input` once, at start, so a non-key field never restarts it (S11). No Rpc inside; a `fromRpc` adapter comes later.
40. **Operations** (OD3, OD9 Q4, Q7, OD17 Q15, Q16). A definition or a fragment declares every server interaction once, by name, under
    `operations: ({ E }) => ({ name: contract.outcomes({ … }) | contract })`; an operation holds no select, trigger, key
    or verb, and its mappings live only there. One write operation per write contract **per actor**, counting the definition and every fragment placement in its
    tree (`SharedContract` otherwise; F2), so two placements of one writing fragment are an error;
    reads and streams are exempt. A **bare** operation (never an `every` stream's or a `listen` entry's, which must map, rule 37, 2.11.6) maps nothing: a bare write's endings are evidence and its unknown
    is not retained, so it never holds; `flow check` lists bare writes as info. Each declarer exports `O`, the
    operations' handles (a fragment's, outside it, is read-only; rule 50).
41. **Verbs and placements** (OD1, OD2, OD9 Q22, Q23, OD17 Q14). Operations are used through `O` with the contract's own
    verbs: `O.x.commit(select)` (write) and `O.x.lookup(select)` (one-off read) in `actions`; `O.x.subscribe(select, {
    when? })` and `O.x.subscribe.each(select)` (one session per distinct key of the selected inputs) in `activities`, a
    list of placements in a state (a subroutine's included) or a trait body, placed for that activation or incarnation
    (rule 52). A stream's placement is one session per (actor incarnation, placement path, operation, key) (rule 68). The verb decides one-off or live and must agree with the mapping (`success` only with `lookup`,
    `value` only with `subscribe`); one operation uses one verb (`VerbMismatch`). A live operation is placed in one
    state or trait incarnation at a time unless state tokens in `when` make placements exclusive (`DuplicatePlacement`). Each select is typed
    by its transition.
42. **Reads** (OD9 Q6, Q21, Q23, Q26; OD23 Q33). A one-off read operation has one lane (in a fragment, one per
    incarnation: actor, operation, incarnation; rule 52); a lookup releases the previous
    lookup of the same operation, whose settlement is evidence (`Superseded`), and only the latest lookup's ending is
    delivered. Its row is Operations O6's resource lane for the entry its latest lookup named, with that entry's `key`,
    held until the next lookup or `cancel`, and `undefined` before the first lookup and after `cancel`; guards and
    callbacks read it with `O.x.get(operations, k)` as views do. `cancel` releases the operation's wait, not the shared
    request. One-off read lanes are not persisted; the one exception is the `Interrupted` ending a freeze parks, which
    persists with the frozen slice (rule 52). A live placement has one lane per placement (per key under
    `subscribe.each`), `undefined` while not placed, and no replacement rule beyond Operations O4 and, for a stream, rule 70.
43. **Key-less addressing** (OD4, OD8, OD19 Q35). On an unkeyed operation (`key: []`) a key-less member names its one
    lane. On a keyed one, `retry`, `retryable` and `cancel` may omit the key only in a handler of an event that
    operation alone maps, naming that ending's Attempt and, once it is resolved or released, the lane's addressable one
    (holding policies only); under `serialize`, only in the head's own ending's handler; in a `NotSent` ending they do
    nothing; anywhere else a key-less member is `KeyRequired`. A key-less `O.x.cancel` in `whenAbandoned` is not
    `KeyRequired`: it names every lane of the incarnation's subject path (rule 60). `idle` and `get` always take a key on a keyed operation.
    Members take any value carrying the key's fields.
44. **A hold outlives its actor and its fragment incarnation; handle it at the root of its declarer** (OD19–OD22, OD23
    Q40, OD25). Disposing an actor, or ending the incarnation that binds a fragment's lane, drops and cancels nothing: the Runtime keeps the lane, applies its endings and invokes what the table promotes. An ending
    with no live actor incarnation is parked raw on its lane record for the identity's saved record, if one exists, and mapped
    through the current `outcomes` at delivery; otherwise it is evidence. A starting incarnation adopts only its own
    identity's **unbound lanes** (the oldest first, for equal local identities) and receives, before any external event:
    the parked endings in saved order; per lane in creation order, a held head's `unknown { Restored }` exactly once
    (and, on a reload, `NotSent { Restored }` for never-acknowledged work); an `InFlight` lane's ending when it lands.
    Adopted endings and every `unknown { Restored }` are current from the active leaf (rule 14). So a holding write's
    unknown, success and failure are handled at the root, with a path to an owner, reading what they need from the
    event, never from memory an earlier incarnation set. `runtime.unsettledWrites()` lists non-`Idle` lanes by identity,
    for a host's `beforeunload`. Within the actor, each lane's deliveries go to the incarnation with its subject path, as
    follow-up turns after that incarnation's starting turn (rule 54); a lane whose path no incarnation has is
    **unplaced** and parks its endings (rule 53).
45. **Every hold has an owner** (OD6, OD10, OD16, OD22, OD25). `flow check` reports `UnresolvedHold` (2.7.14) when a
    write on `reject`, `latest` or `serialize` maps anything but not `unknown`, or when, from some arrival of an event
    its `unknown` maps (one, or one per tag), a branch that keeps the hold reaches no `retry` or `cancel` of the
    operation; an error, or a warning when the owner exists but is unreachable. The same arrival set is rule 20's for
    the operation's other mapped events. For a fragment's operation the check runs on the fragment's body (rule 55); at
    its host, rule 56 adds the placement's arrivals, unless the operation releases on leave (rule 60).
46. **Lane persistence** (OD9 Q26, OD17 Q12, OD20–OD22). Write lanes of a persisted identity are Runtime records under
    (actor identity, contract id, key), bound or unbound, never inside the actor's record; each Attempt carries its
    `retryCount` and whether it was acknowledged; Persistence O6 acknowledges once per Attempt, per lane record, and a
    persisted re-send waits for its lane record's capture. Restore follows the table's restore row (2.7.13). A lane
    record decodes by its contract's `input` pick, independent of the machine, so a fresh incarnation adopts it even
    when the actor record no longer decodes; a lane whose operation is gone, or whose key no longer decodes, goes to
    `orphaned` (P19). A lane record names no instance path; it carries the subject path (strings) and the releasing
    mark (a flag), both decoding without the machine. A recorded path the placement cannot produce is adopted by key
    equality only when the placement's last subject part is the contract's single key field, else goes to `orphaned`
    (rule 51; 2.9.4). A local identity's lanes are never persisted; one-off read lanes are not persisted (rule 42).
47. **Mapped events come only from endings** (OD23 Q33), and a stream's deliveries count as endings. An event an operation maps is never a schedule's `send`, a
    `raise` or a view's `send`; operations map only `internalEvents`; `flow check` reads all three. Stories produce
    endings only through fakes and lifecycle steps; no ending is injected (Testing O3; rule 62; Stories T2).

**Operations in fragments** (2.9). Rules 48–60 are operations-in-fragments' ([merged/fragment-operations/proposal.md](merged/fragment-operations/proposal.md)); each names its
decisions (F1–F10).

48. **Scope in v1** (decided, F4, amended by F8; refined, FP RV1 M1, FP RV2 L3, L5). A fragment may own a write operation
    that maps anything only if **every placement from the actor's root to it** is a root trait (a trait at the root of
    the definition, or at the root of such a trait), an `.each` copy, or a `.resumable()` trait, any of which may carry
    `resetOn`, and **no subroutine is on the path**. `.each` with `resetOn` is allowed (its path gains two parts). A
    `resetOn` on such a placement must return a string, so it can be recorded and persisted: a non-string reset value is a
    type error, whose remedy is a joined key (`[sort, status].join("|")`). Elsewhere a fragment may own reads, streams and
    bare writes. A violation is a construction error (rule 12). Nested `.each` is out of scope (rule 9), so a path
    holds at most one copy key.

49. **A fragment may declare `operations`** (decided, F1). Same shape and meaning as a definition's (rules 13,
    39–43, 47), after `memory` and `traits`. Its endings map onto its own `internalEvents`, which now come from its
    schedules or its operations' endings (amends rule 2). It reads no context and sends to no actor. A fragment's domain
    write registers the domain for its actor. A fragment without `operations` is unchanged (amends rule 3).

50. **Only the fragment acts; the host reads and asks** (decided, F5). Acting members (`commit`, `lookup`,
    `subscribe`, `retry`, `cancel`, `refetch`, `bookmark`) are typed only in the declaring fragment's body. `Fragment.O` exposes only
    its write operations' reads: `get(s, k?)` in views, and `get`, `idle`, `retryable` in a host's guards and
    `updateMemory`; they are unambiguous because a write operation is unique per actor (rule 51), and they read the operation
    at any depth (the board reads `LikeButton.O.set` through `IssueRow`, FP 2.10). Reads and streams are read
    through the instance path, `s.operations.<instance>.<name>`. A host that wants a fragment to stop or retry asks through
    its public `events` or `hostEvents`; the fragment decides.

51. **Lane identity is unchanged; each lane records its subject path** (identity decided, F2; subject decided as a
    concept by F8; path refined, FP RV2 H4).

    - A write lane is (actor identity, contract id, key). `SharedContract` counts every write operation of the
      definition and of every fragment placement in its tree.
    - An incarnation's **subject path** lists, from the actor's root down to its placement, one part for each `.each`
      (that copy's key) and one for each `resetOn` (its reset value), in order; any other placement adds nothing. A root
      trait at the actor's root has `[]`; a copy of `docs` has `["d1"]`; a root trait inside copy `X` has `["X"]`; a
      writing `.each` copy with `resetOn` has `[resetValue, copyKey]` in placement order.
    - **A `resetOn` part is the incarnation's own reset value** (FP RV3 M2), recorded when the incarnation is created and
      persisted with its slice. On restore, if a writing placement's re-taken value differs from the recorded one (a
      pending reset was lost by the reload, rule 1), the trait is **reset** (its `whenAbandoned` runs), not silently
      re-baselined; so the path always matches the memory that commits. The reset is a pending reset: the first
      follow-up turn after restore, before rule 44's deliveries, so the old path's lanes become unplaced (or are
      released, rule 60) and the new incarnation adopts only its own path's lanes (delegated, FX6).
    - When a commit creates a lane (`Idle` → `InFlight`), the lane records the committing incarnation's path. It stays
      until the lane is `Idle` **with no parked ending**, and is persisted with the lane record as an array of strings.
    - A member from an incarnation whose path differs from the lane's is **declined**, with existing words: a `commit`
      ends `NotSent { why: "Rejected" }`; a `retry` is evidence `NothingToResend`; a `cancel` does nothing, with
      evidence, as in `Idle`; `retryable` denies `NothingToResend`; `idle` denies by the lane's real state (`InFlight` or
      `Uncertain`); `get` reads the real row. **On every placement whose subject path is not empty, rule 20 requires
      `failure.NotSent` mapped on every mapped write**, since the decline can occur there. It is checked at the host's
      placement from the fragment's summary (rule 57), and the error names the placement and the operation; a reusable
      writing fragment maps `NotSent` (documented default; delegated, FX7).
    - **A definition's operation** records no path: its lane has path `[]` and the actor as its binding incarnation, even
      when it is committed in a copy's filling (rule 9).
    - **Authoring rule: a write key belongs to one subject**, decided by it or unique within it (2.9.1 item 3). **What
      `flow check` can catch** (FP RV3 L10): only the case visible from summaries, a contract with `key: []` on a placement
      whose path is not empty (every subject on one lane), warned under the widened `SharedContract`. Beyond that the key
      comes from a closure, so a breach is seen only at runtime: the decline appears in Inspection, and a decline in a
      Story trace is a Story-derived warning, as the design does for list repairs.
    - **Two placements of one writing fragment** are a `SharedContract` error; fold one into the other's `.each`
      membership, or split the screen into two actors (stated, FP RV1 M8).

52. **Reads live and die with the incarnation; a freeze ends what it cuts** (refined, FP RV1 H2, FP RV2 H2). A fragment's
    one-off read lane is (actor, operation, incarnation); its live placements are the incarnation's, and an `activities`
    list in a trait body (or a subroutine's states, delegated, FX13) is placed for the incarnation's life, switched by `when`.

    - **Ending** the incarnation releases its placements and lookups; nothing is delivered later, because nothing is left
      to receive it (amends rule 17's evidence list: "a fragment's lookup whose incarnation ended").
    - **Freezing** a `.resumable()` trait releases its placements, and **ends each of its lookups with `failure {
      Interrupted }`**: the ending is parked **with the frozen slice, which persists it** (Persistence O2, beside its
      frozen schedules), and delivered at the thaw, first among the parked endings (rule 54). The shared request continues
      only if another holder needs it (OPS O2). A frozen trait **reset on return** has ended, so its parked
      `Interrupted` endings are evidence (FP RV3 L6).
    - **A live incarnation's lookup is still not persisted** (OD9 Q26, rule 42). A fragment has no restore event, so a
      fragment that waits on a lookup keeps a **recurring** schedule that looks up again (FP 4.2's `resync`,
      `Schedule.spaced`); a recurring schedule persists and ticks after a reload.
    - **Thawing** places its `activities` again from the thawed memory, as entering a state does: the session is placed again from the frozen slice's bookmark. A freeze keeps the partition, and a `latest` row's `last` and `heard`, with the slice (rule 71, Streams T9). `Flow.entry` does not fire on thaw (decided, F8).
    - **A frozen `.each` copy removed from membership** has ended (rule 9 reconciles frozen copies): its parked read
      endings are evidence, rule 60's marks apply, and its writes are unplaced (rule 53) (delegated, FX14).
    - **Against rule 17:** every lookup still delivers exactly one ending; a freeze is not added to rule 17's evidence
      releases, it produces an ending. Rule 37 already requires every read operation to map `Interrupted`, so the
      fragment's handler for it (FP 4.2's `CatchUpFailed`) runs at thaw. Against rule 42: only the latest lookup is
      delivered, and the interrupted one is the latest, since a frozen trait issues none; "one-off read lanes are not
      persisted" stays true of the lane, and gains one exception for the ending a freeze parks in its slice. Against rule
      46: no lane record is involved (a read has none), so rule 46 is unchanged; Persistence O2's frozen-slice contents
      gain the parked read endings (C60).

53. **Writes outlive the incarnation; their endings go to the subject** (decided, F3). A lane's **binding
    incarnation** is the live incarnation at its operation's placement whose subject path is the lane's; for a host
    operation it is the actor. At admission, rule 14's owner test runs inside the binding incarnation (a trait: its own
    `on`). A non-`Idle` lane with no binding incarnation while the actor is live is **unplaced**; a lane with no live actor
    incarnation is **unbound** (rule 44). With no binding
    incarnation (the node left, the copy removed, the trait frozen or reset to another value), the ending's lane and store
    effects apply as today (rule 27), and the ending is parked raw on the lane record (OD22) for that path, unless the
    lane is releasing (rule 60).

54. **A starting incarnation adopts its subject's lanes** (decided, F3; refined, FP RV1 M3, FP RV2 L1). When an
    incarnation starts at a placement (an entry, a copy added for a key, **a reset**, a thaw, the actor's rebind or
    restore), it receives, per lane whose path is its own: the parked endings in saved order, then a held head's `unknown {
    Restored }` once, then an in-flight Attempt's ending when it lands. A thaw is the same incarnation and receives its
    parked endings only (its interrupted lookups first, rule 52). These run as follow-up turns at the head of the mailbox
    after the starting turn commits, after any pending reset (rule 1), and before any later event addressed to the
    incarnation. The starting turn's own raises into the new incarnation run before them. **Documented default:** a
    fragment that commits on its creation guards that commit with `O.x.idle(own)`.

55. **Adopted endings are handled inside the fragment.** Rule 20's adopted endings (OD22) and rule 45's
    `UnresolvedHold` run on the fragment's body alone, over its new-incarnation arrival set (a trait: its own `on`). A
    handler reads what it needs from the event (FP 4.1 carries the user's text in `Conflict`). A fragment exit on a branch
    that keeps a hold is reported by the same check. Release on leave is not an owner while the incarnation lives.

56. **A host that ends a holding placement must be able to start it again** (refined, FP RV1 L3, M6, FP RV2 M2). It applies
    to every holding write operation that does **not** release on leave (rule 60).

    - **Node or `.resumable()` placement:** every host transition that can end or freeze the incarnation is an
      `UnresolvedHold` arrival; pass if a transition that starts the placement again is reachable, warning otherwise.
    - **`.each`:** reachability is vacuous, so the check is structural: a host transition that writes the `.each` field
      with no `Fragment.O.x.idle` token in its guard is an `UnresolvedHold` warning. Reading lanes in `updateMemory` (FP 4.4's
      keep-busy line) is not a token, so that host keeps the warning or guards with `idle`.
    - **`resetOn`:** reachability is vacuous too (the next incarnation needs the same reset value, which closures decide).
      Documented default: the transition that changes the reset value guards with `Fragment.O.x.idle` for the current
      subject. Story walk: "A, B, A adopts A's save".
    - At runtime, an incarnation that ends while its path has a non-`Idle` lane leaves an **unplaced** lane, listed by
      Inspection.

57. **Summaries carry operations and requirements** (refined, FP RV1 M5). Per operation: contract id, kind, verb,
    concurrency, key fields, mapped events, whether it holds, and **whether it releases on leave** (rule 60), including
    its **children's** write operations, so `SharedContract` and rule 56 work at a host above a nested writing trait (an
    explicit exception to rule 10's "hides the level below" for these facts only), and each stream operation's `delivers`, key fields, `missed`'s kind and `fills`. The fragment's
    type carries the union of its contracts' Effect requirements (`R`), so a host or Story missing `DocsApi` is a type
    error. Hosts are checked against summaries only.

58. **Stories** (decided, F7; amended by Stories T2, T3; W1). `Story.fragment(fragment, { id, fixtures })` (rule 11); `enter`,
    `leave` and `reset` on traits; a fragment's endings come from its fake's answers, its request named by address
    (`match: { operation: Autosave.O.save, actor, copy }`, rule 65). Walks kept as Stories, each written as steps
    (2.10.15): two copies on one lane, the second
    declined (FP RV1 H1); a freeze during a catch-up, thaw, `Interrupted` is delivered and `resync` looks up again (FP RV2 H2); a creating raise meeting
    an adopted hold (FP RV1 M3); a copy removed during a save that gets a 412, re-added, the adopted `Conflict` keeps the
    user's text (FP RV1 M9); an upgrade from a host-only lane (FP RV1 M4); a removed uploading copy, reload, nothing parked, no
    unsettled write (FP RV2 H1); two rows of a nested writing trait, one removed, the other untouched (FP RV2 H4); "A, B, A"
    under `resetOn` (FP RV2 M2); a reload while frozen during a catch-up, the parked `Interrupted` delivered at thaw, and a
    reload while live and owed, `resync` looking up again (FP RV3 H1); a reload that loses a pending reset, the trait reset
    on restore (FP RV3 M2).

59. **A fragment's rows** (refined, FP RV1 L4). `s.operations.<instance>.<name>` is `undefined` while the incarnation is
    inactive, a keyed list of copies under `.each` (rule N1). A write row there lists the lanes whose path is the
    incarnation's. Inside the fragment, `operations` (in guards, `updateMemory`, and a keyed schedule's `keys`) is the
    fragment's own rows.

60. **Release on leave** (decided, F9; specified here, FP RV2 H1, H3). A fragment lists an operation key-less in
    `whenAbandoned`:

    ```ts
    whenAbandoned: [O.put.cancel, callbacks.onIdle],                                     // existing: whenAbandoned, cancel; NEW MEANING (F9): release this subject's lanes on leave; onIdle frees the host's slot (FP RV2 L6)
    ```

    - **When:** the incarnation ends by removal, leaving or reset. Not on freeze (it has not ended), not on actor disposal
      (OD19: disposal drops nothing; the identity may return).
    - **What:** every lane of that operation whose subject path is the ending incarnation's (one subject may own many
      lanes, as a thread owns one per `clientId`). It is listed in step 3 with the leaving notifications and is a Runtime step in the leaving turn's step 5, after
      every member, reading no memory, so rule 22 does not apply and OD8's `KeyRequired` does not apply to
      `whenAbandoned`; `check()` applies no mark.
    - **How:** each such lane is marked **releasing** on its lane record (persisted, like the subject), and the cells of
      2.9.3's releasing rows apply: a held lane is released now, never-sent and queued commits end `NotSent { Cancelled }` as
      evidence, an Attempt on the wire is interrupted, endings already parked for the path become evidence, and every
      later ending (a restore's `unknown { Restored }` included) is applied to the lane and the store and then released,
      never parked. An incarnation of the same path that starts before the lane is `Idle` clears the mark and adopts the
      lane (rule 54).
    - **Only for worthless work.** Release interrupts a write on the wire and drops queued ones, so a released write may
      never reach the server. Use it for work that is worthless once its subject is gone: a replaced avatar upload, a
      removed attachment, a discarded draft. **Never for user intent that must survive a list refresh:** a like or a
      follow keeps the hold and the host's keep-busy line (decided, F6, F9). The released write may also still land
      unseen (OD20's stated limit).
    - `UnresolvedHold` inside the fragment is unchanged; at the host, rule 56 does not apply to an operation that releases.

**Stories** (2.10). Rules 61–66 are Stories' ([merged/stories/proposal-v2.md](merged/stories/proposal-v2.md), amended by
[merged/story-checks/stories-amended.md](merged/story-checks/stories-amended.md)); each names its decisions (2.10 has the marks).

61. **Every step settles** (W2, W4; Stories T5 B1, T7; the mechanism is [P, SA RV1 H1, SA RV2 H1, M1]). A run never yields to the host between
    its first step and its cleanup. Every step applies its input, then settles on a microtask-only run scheduler (Effect 4.0.5's
    `MixedScheduler` with `executionMode: "sync"`): the settle's drain re-queues microtasks until `K` consecutive hops show no arrival at
    anything of Flow's and no scheduler activity. A settle that does not end within the hop cap is `StoryTurnLimit` with `reason: "Settle"`.
    After the last cut, if a commit or read fiber is parked, the run **finishes the world**: it releases held items, closes connections and fires deadlines up to a fixed horizon, settling after each, with nothing of this reaching the evidence. It looks only at fibers already parked at the last cut; a fiber the phase itself starts is not reported [P, SA MDL U3]. A fiber still parked is `HostTimeWait`: real host work, or something only a later step could wake. A session or setup-scoped fiber may wait. An `advance` fires at most 100,000 deadlines (`StoryTurnLimit`, `reason: "Advance"`). During cleanup the Clock runs free, and cleanup may yield. `advance(d)` settles at every deadline it passes, in a
    documented total order (2.10.17.5; W8). There is no `process()`. **Limits, stated:** a commit on an in-app latch only a later step opens is rejected; a real wait under its own timeout, a cancelled fiber's real wait, and fire-and-forget host work (a `setTimeout` nobody awaits) are not caught [P, SA RV3 M1].

62. **The world is fakes** (W11, W12; Stories T2, T5 B2). Everything outside the client is a **fake server**: one per
    run, holding typed truth and a log of what it received, shared by every tab and reload, and set up before the
    subject starts (the `world` option, W13). It is reached through declared **endpoints** whose wire the Story controls
    with four words (`hold`, `release`, `drop`, `duplicate`; W18). A handler decides the result and never the wire
    [fakes-v2]. The network can keep a request after its client is gone; local storage cannot. A fake never writes client
    truth and never produces an ending: every ending comes from a fake's answer through the commit's real classification,
    or from a lifecycle step. No ending is injected (Testing O3). A broken fake is a broken run: `StoryFakeError` [P, SA RV1 H4].

63. **A Story is data; checks are the test's** (SC1, W25; Stories T4). A Story is a transcript of inputs and checkpoints, and
    plans and controls are data. Code lives only in fakes and in tests. Flow owns no assertions: tests use the runner's own
    `expect` over `run.checkpoints` and `run.frames`. `propertyTest` is the one thing in Flow that judges, because it
    must search and shrink (W25, W38); its properties are plain functions, never part of a Story. Every step has a data form,
    keyed by its method name [P, SA RV1 H3]. Testing O1's no-callbacks rule holds for steps.

64. **Every step has its own cut** (W22; Stories T5 B4). Every step ends with a **step cut**: its latest publication
    frame plus the evidence position, fake truth and wire state at the step's end, so a step that publishes nothing still
    reads its own effects. Every committed publication is also a frame. Every cumulative fact is one record in one ordered
    evidence list. A checkpoint names a step cut, and is read after the run: every read is answered from what was
    captured then (SC3, W23, W24) [P]. The list of cuts is internal, for the player; a test reads named checkpoints [P, SA RV1 section 8].

65. **One address** (Stories T6). One **address** names a thing everywhere: `{ actor?, instance?, copy?, operation?,
    schedule?, timer?, key?, tab?, life? }`. Wire `match` (an address plus kind fields such as `purpose` and `input`), the
    `attempt` read (with the kind field `n`), the `lane` read, record filters, `advance({ next })` (W7) and step targets take it; a request's `via` and
    every record carry the same fields. No ordinal across actors, hosts or tabs. `operation` takes a visible handle (a
    definition's `O.x`, or a fragment's write through `Fragment.O.x`, as a name only, so rule 50 holds); a fragment's read
    or stream is named by `instance` and the operation's name (2.10.6; delegated, at merge). `timer` names Flow's own session sleeps (Streams T1).

66. **The owner decides.** Each behaviour is decided by the declaration that owns it: the stand-in host's placement by
    the fragment's declaration (W30), what a lost request raises by the transport binding, what a server failure looks
    like on the wire by the binding, a hydration source's world by the run it hydrates into (W29), and whether a value is
    right by the test. Never by later steps or by the fake author's Effect code.

**Streams** (2.11). Rules 67–72 are streams' ([merged/streams/proposal-v3.md](merged/streams/proposal-v3.md)). Each is [P] but for the clause that cites S11 or S15. **One interruption, one answer** and **freshness is a function of the present** are their principles.

67. **Kinds.** The spelling is S11's; the meanings are [P]. `delivers` is the data's meaning. `every`: never skipped or silenced, one per turn, or one page per turn from a read. `latest`: newest wins, current only while this connection confirmed it.
68. **One session table** (behaviour, S15; Streams T1 is [P]). Streams T1. Flow runs connections by `reconnect` and `idleTime`, sessions only by placement. One session per (actor incarnation, placement path, operation, key); a session reads `input` once, at start (S11).
69. **Delivery.** Streams T4. Deliveries are outside the mailbox cap: they are bounded by what Flow has pulled, not by Runtime O4's limit.
70. **Ownership.** A session belongs to its placement's activation. Identity per placement path; the wait for a releasing predecessor per (actor, operation, key) at any path. A released session's undelivered items are discarded with evidence. Two operations on one contract and key are two sessions, with a `DuplicateSession` warning (S11).
71. **The bookmark** (that Flow keeps it, S15; its shape is [P]). A Flow-private partition of the slice's saved record, per (operation, key), holding `at` and `filled`. It is not a memory field and has no patch, and no guard reads it, so "memory changes only through `updateMemory`" stays true; it is also not `Flow.private`, which is a memory field a fragment hides (2.2.2) [P, merge]. It says what the consumer was offered: a `Denied` value moves it, with `DeliveryDenied`. Streams T2, T3; `fills` (2.11.7) ties it to memory.
72. **`listen`.** Streams T7.

### 2.5 The turn

One algorithm, shared by the runtime and `check()`. `check(snapshot, event)` runs steps 2–6 on the
given event and publishes nothing. It applies no releasing mark and parks nothing; a decline from another subject
path is a verdict, like `Rejected` (rules 51, 60).

**What reads what.**

| Memory view | What it is | Read by |
|---|---|---|
| **Before** (the pre-turn snapshot) | the last published snapshot | every guard; every payload mapper (`raise`, `notify`, `exits`, `whenAbandoned` `.from`); the source's `updateMemory`; parts' `updateMemory` |
| **Before-walk** | the pre-turn memory with the source's patch applied, plus earlier resets | `resetOn`; `input` fillers |
| **Initial memory** | a new incarnation's starting memory (input fields, then constant and computed `Flow.initial`s) | guards, mappers and updates of parts addressed to an incarnation created in this turn |
| **After** | the memory the turn publishes: initial memory of new incarnations, then every patch in expansion order, after list repair; computed in step 5 | commit input selects; retry and cancel key selects; schedule functions; `keys`; `restartOn`; placement selects and `when`; `.each` membership; the `resetOn` re-check; `optimistic` (captured at start, rule 36) |
| **After lanes** | the lanes with this turn's members applied, in action order, in step 5 (rule 21) | `keys`; `when`; placement selects; the published rows |

**Lane reads** (`operations`, `get`, `idle`, `retryable`) in selects, guards and `updateMemory` (`get` only) are not memory: they see the pre-turn
lanes with the turn's own ending already admitted (rule 22). In an unknown's own turn the lane is `Held`, so `idle`
denies `Uncertain` and `retry` re-sends; in a success's turn the next queued commit may already be promoted, so `idle`
denies `InFlight`.

1. **Admit** (runtime only).
   - A pending reset from the last commit runs first, as its own follow-up turn (rule 1).
   - Otherwise, take the oldest event from the mailbox. The mailbox is FIFO in admission order: user sends,
     call endings, stream deliveries, timer firings and `onContext` events queue together; a session moves one delivery at a time from its own queue (Streams T4, rule 69).
   - **A call's ending is mapped here.** The Attempt's ending was decided at settlement (rules 18, 27), and for a
     domain write its store effects are already published; here the ending's cell is applied to the lane, which may promote the
     next queued commit (rule 21, 2.7.13), the ending is mapped through its operation's `outcomes` (rule 13), and its owner is tested against the pre-turn
     snapshot (rule 14): a current event starts at the active leaf, a late one at the owner's nearest surviving
     ancestor. The test runs inside the binding incarnation; an ending with no binding incarnation is parked for the
     lane's path or, on a releasing lane, applied and released (rules 53, 60).
   - **A stream delivery's bookmark cell** applies here, in the partition, and is kept through `Denied` and `Unhandled`, not on `InvalidTurn`, which ends the session `Defect` (Streams T3). `check()` starts at step 2, so it touches no bookmark.
   - A timer of a dead activation is discarded here (Machines O5).
   - Firings with the same deadline are separate turns.
   - `whenAbandoned` is never queued, because it is fused. `orphaned` runs on the descriptor, not in an
     actor's mailbox (P19).
2. **Select the source.** Start at the active leaf, or, for a late ending, at the ancestor rule 14 names.
   - Try that node's alternatives in order. An alternative is selected when all its guards pass,
     state-token elements first.
   - **A schedule trigger is a handler.** A node with no written handler for the event, but with an
     active schedule that lists it in `armOn` or `disarmOn`, handles it with an implicit unguarded
     `{ target: "self" }`: nothing moves and no memory changes, and step 6 arms or stops the schedule.
     A node with a written handler keeps only its written alternatives, so they still decline and fall
     through as written.
   - If every alternative declines, continue at the next ancestor. Only after the root is the event
     `Denied` (if any handler existed) or `Unhandled`, and then nothing of the turn's own changes. An ending
     admitted in step 1 keeps its lane effects (its cell and any promotion), which are published, and counts as
     delivered; a promoted commit is invoked after the turn.
   - Compute the source's patch.
3. **Select the parts.** Walk depth-first in written order:
   - raises;
   - the child transitions they select, and the notifies and host fillings these reach;
   - exits and their fillings.

   As the walk goes:
   - **Fixed targets.** Every alternative selected fixes its target, so by the end of the walk the
     turn's one state change, and with it the exit and entry sets, is known.
   - **Resets come first.** Before the walk, `resetOn` runs on the before-walk memory, and every
     changed trait gets a new incarnation. Raises into it reach the fresh incarnation.
   - **Addressing.** A raise addresses the incarnation live at that point: pre-turn, reset, or
     added earlier in the walk. A new incarnation is seeded lazily on first address: its `Input` record from
     the before-walk memory, then its `Flow.initial` values (2.2.2).
   - **Children that cannot react.** If an addressed child has no handler (a schedule trigger counts as
     one, step 2), or all its alternatives
     decline, the part **refuses the whole turn**. The host never falls through to its next
     alternative because a child refused; alternatives are chosen by their own guards.
   - **Dead incarnations.** A delivery chain addressed to a dead incarnation of an `.each` copy drops
     that part and its sub-chain, with evidence, unless the same turn created a new incarnation of
     its key (rule 9).
   - **The final list.** After the walk, each `.each` field's final value decides membership
     (rule 9). Copies whose keys are gone end, and their `whenAbandoned` joins the leaving runs below. New
     keys are seeded in step 4.
   - **Leaving.** After the walk, append, for the exit set (deepest first), `whenAbandoned` for every
     incarnation the turn ends. A key-less `O.x.cancel` listed there records a release for step 5 (rule 60). A reset's `whenAbandoned` comes after the raises into its fresh incarnation, and
     reads the old incarnation's pre-turn memory.
   - **Late turns.** In a late ending's turn, any alternative whose target would exit a state that owns another
     pending call, or an active subroutine, is denied as `LateMayNotLeave` (rule 15), in steps 2 and 3 alike.
4. **Seed and compute.**
   - Seed every new incarnation (entered, reset or added) that is not yet seeded.
   - Compute every payload and patch from its memory view in the table above (before, before-walk or initial).
     Reads that only start or time work are not computed here: they read the after memory, in step 5.
5. **Validate.**
   - **List repair** (rule 9) runs first. It never refuses.
   - **One state changer** among the selected parts.
   - **Disjoint memory keys.** A new incarnation's initial memory and a later part's patch to the
     same slice do not overlap.
   - **The after memory.** Apply new incarnations' initial memory, then every patch in expansion order, after list
     repair. From it, compute last every effect-only read: commit input selects, retry and cancel key selects,
     schedule functions, `keys`, `restartOn`, placement selects and `when`, and `optimistic`, captured for each start
     (rules 22, 36).
   - **A valid action batch** (Machines O3).
   - **Lane cells** (rules 16, 21, 28; every write member; OD16). For each member listed, in action order, apply its
     cell to the after lanes (2.7.13): a commit is declined (`Rejected`, `Overloaded`, rule 16), minted (`InFlight`),
     queued (`W`) or replaces a never-sent one, with its owner (rule 14); `retry` re-sends or is evidence; `cancel`
     interrupts, releases or ends a never-sent commit. A member from an incarnation whose subject path differs
     from the lane's is declined (rule 51). After every member, the turn's releases mark their lanes and apply the
     releasing cells (rule 60). An admitted domain write joins every record queue it predicts and
     computes its prediction (rule 28). `check()` computes only the verdicts: it mints nothing, joins no queue and
     predicts nothing.

   A violation, a failing select or an invalid duration is a pre-commit defect. `check()` reports it as `Denied` with
   code `InvalidTurn`. A declined token element appears in `Denied.reasons` as
   `{ code: "NotInState", context: { state } }`. A rejected turn keeps none of its own members' cells; step 1's admitted ending keeps
   its cell (step 2).
6. **Commit.**
   - Apply exits (deepest first) and entries (outermost first).
   - Publish the after memory. Drop the copies the final list ended.
   - Cancel the schedules of ended incarnations, and freeze resumable ones, ending each of their lookups `failure {
     Interrupted }`, parked with the slice (rule 52).
   - Arm schedules, with the values step 5 computed, that start on entry (no `armOn`, or `Flow.entry` in it) for
     every entered, reset or created incarnation. Arm `armOn` schedules on every accepted listed event, raised ones
     included, accepted anywhere on the active path, and stop `disarmOn` schedules on theirs. A keyed schedule arms a
     timer for each key new to its list and cancels each key gone (rule 23).
   - Evaluate `resetOn` again on the after memory, and queue any pending resets as one
     follow-up turn at the head of the mailbox; after them, queue the adoption deliveries of every incarnation the
     turn started (rule 54).
   - For each session placed and connected, write the bookmark's `filled` from the field `fills` names, only on a change (Streams T3); a session waiting for its predecessor writes nothing, and a releasing turn may only raise it.
   - Publish once: memory, lane rows and the store revision (step 5's starts and predictions) are one cut. Declines
     are queued as endings (rule 16). After the turn, whatever its outcome, each Attempt minted, promoted or re-sent is invoked
     once its Persistence O6 acknowledgement (once per Attempt), its record queues and, for a persisted re-send, its lane
     record's capture allow (2.7.12).

**Before for decisions, after for effects** (rule 22). A read whose result can change this turn's memory sees
before; a read that only starts or times work sees after. So a payload mapper that reads a key its own turn writes
sees the old value (`memory.challengeId` on the transition that sets it), while a commit's select on the same
transition sees the new one. `flow check` warns when a Story trace shows a mapper reading a key its own turn writes,
and when one transition reads, in both views, a key it writes (decision D16), and names both sides. Read the event
instead, or keep the old value under its own key.

**Settlement and Runtime steps publish without a turn.** For a domain write, settlement applies the Attempt's ending to the store and
releases record queues in one publication (rule 27); every actor's snapshot reflects that store revision, while a bound
lane changes when the ending's turn is admitted (an unbound or unplaced lane, when the Runtime applies the ending's cell, rules 44, 53). Between the two, a record can read confirmed while the lane row still
reads `pending` (2.8.1). The settlement is its own publication, hence its own frame; a Story names it with `checkpoint(name, { at: { settled: O.x } })` (2.10.6). A Runtime step that changes a
bound lane's row (an invocation raising `retryCount`, a storage refusal promoting the next commit) publishes that row on
its own, as a new snapshot; an old snapshot never sees it (Machines O8).

### 2.6 Conventions

**Key order.** Category keys appear in one order, from what the outside sees to the internals:

| Object                        | Order                                                                                                                                              |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| definition, trait, subroutine | `id`, `states` / `default`, `events`, `hostEvents`, `internalEvents`, `guards`, `callbacks`, `exits`, `memory`, `traits`, `operations` / `context` |
| machine or fragment body, a state | `default`, `activities`, `schedules`, `traits`, `on`, `states`, `whenAbandoned`                                                                                        |
| a host's filling              | `input`, `guards`, `callbacks`, `exits`                                                                                                            |
| a transition                  | `target`, `guard`, `updateMemory`, `actions`, `raise`, `notify`                                                                                    |
| commit options                | `optimistic`                                                                                                                                       |
| operation options             | `writes`                                                                                                                                           |

A lint rule enforces it with an autofix (T4). It moves category keys only: the entries of `traits`,
alternatives and schedules keep their order, because declaration order carries meaning (rule 1,
Machines O5).

**What lives in `Flow`.** `Flow` is the Schema-like vocabulary for shapes and declarations: ports
(`Flow.Guard`, `Flow.Callback`, `Flow.Exit`), memory modifiers (`Flow.input`, `Flow.initial`,
`Flow.private`), `Flow.uncertain`, `Flow.annotate`, `Flow.state` and the schedule marker `Flow.entry`. How one trait instance behaves
is an attribute of that trait, so it is a method on it: `.resumable()`, `.each(…)`. In the same way, what an
operation does is a member of its handle: `O.x.commit`, `.lookup`, `.subscribe`, `.retry`, `.cancel`, `.bookmark`, `.idle`,
`.retryable`, `.get`. A write lane is the Runtime's record of the actor identity (rule 21), read as snapshot data,
`s.operations`. A fragment's handles are its `O` inside its body; outside, `Fragment.O` offers only its write
operations' reads (rule 50). `trait(…)` and
`subroutine(…)` stay plain constructors beside `definition` and `machine`; their inference comes
from branding their results and `const` type parameters, not from a namespace. `Outcome` is the commit function's
vocabulary, outside the machine (2.7.1).

**Properties live on what they describe.** A fact about a thing is written on that thing, never in
a separate list that refers to it by name. Named lists (`events`, `hostEvents`, `internalEvents`)
hold categories a reader scans for; modifiers (`Flow.private`, `.resumable()`) hold properties of one
item. Readability decides between the two.

### 2.7 Server calls

A definition or a fragment declares each server interaction once, by name, under `operations`, and maps its endings with `outcomes`;
the machine uses it through `O`, with the contract's own verb: `commit` and `lookup` in `actions`, `subscribe` in
`activities` (rules 40, 41). Contracts own how the call is made and which server thing it is about (2.7.1, rule 39); the
machine owns when work starts, is sent again or cancelled, and where its ending goes (2.7.3–2.7.7); the Runtime keeps
write lanes (2.7.13). Rules 13–25 and 39–47 (2.4) are normative; this section shows them. "Flow" means Flow's own
runtime: **nothing in Flow reads an HTTP status or an author error type.**

Citations in 2.7.3, 2.7.5, 2.7.9, 2.7.10 and 2.7.13–2.7.16 to reviews (R*n*, K*n*, H*n*, M*n*, L*n*), lane-model
findings (F*n*, G*n*, C*n*, inv *n*), revisions, cases (5.*x*, 8.*x*, 9.*x*) and questions (Q*n*) are the operations
record's ([merged/operations/proposal.md](merged/operations/proposal.md)); its marks *decided (OD*n*)* and
*proposed* are kept as written there, and all of it was accepted for merging (OD24).

#### 2.7.1 Endings: three channels

A machine needs one thing from a send: **what is now true on the server?** There are three answers.

| Channel | Meaning | Filled by |
| --- | --- | --- |
| **success** | it happened | the commit's return value |
| **failure** | this send definitely did not do it | the author's errors, and Flow's `NotSent` |
| **unknown** | it may have happened | the author's `Outcome.unknown(…)`, and Flow's `Cancelled`, `Restored`, `Interrupted`, `Defect`, `StillUnknown` |

"unknown" is about the server's state, not about the reason: a definite failure can have a reason nobody
understands (an untyped error), and it is still a failure. The ending the machine receives is the **Attempt's**, not
the send's: once a send of a write has ended unknown, a later definite failure of the same write arrives as unknown,
with reason `StillUnknown { failure }` (rule 18).

**Inside the commit function** (the operation, outside the machine). What an ending means is decided where the
request is made, line by line, by the author who has read the API:

```ts
return yield* Outcome.success(value)  // success. A plain `return value` is the same.
return yield* Outcome.failure(err)    // failure, stated explicitly (recommended)
return yield* new SomeError(…)        // failure: any plain error defaults here
return yield* Outcome.unknown(err)    // unknown: "this may have happened"
throw / die                           // unknown, reason Defect, and an actor issue

catch: (e) => Outcome.unknown(err)    // the same calls work wherever Effect wants an error value
```

- `Outcome.*` classifies any error: `Schema.TaggedError`, `Data.TaggedError` or a custom class.
- `Outcome.failure` and `Outcome.unknown` return error values, so one spelling works in `yield*`, in `catch:`
  (`tryPromise`, `try`) and in `mapError`. Authors never use the wrapper classes.
- `Outcome.success` exists for symmetry, so every ending of a commit can be written the same way.
- When Flow aborts the call (a cancel), it ignores what the commit then reports and uses its own reason.
- Plain errors default to failure because they are already in Effect's error channel, and that is what an author
  usually means by `Effect.fail`.

**Flow's own reasons.** Reserved names; an author error with one of these tags is a type error (rule 13).

| Reason | Channel | When |
| --- | --- | --- |
| `NotSent { why }` | failure | the commit was never called. `why`: `Cancelled` (before invocation, rule 24), `Restored` (the page reloaded before the Attempt was acknowledged), `Rejected` (a busy or held `reject` lane, rule 16), `Overloaded` (a commit past its lane's queued commits or a record queue's bound, or a `many` key array past 4,096 items, rule 35), `StorageRefused` (the Attempt's acknowledgement failed), `Disposed` (the Runtime was disposed before invocation) |
| `Cancelled` | unknown | `O.pay.cancel(k?)` after the call started (rule 24) |
| `Restored` | unknown | the page reloaded mid-call (persisted identities), or a new incarnation adopted a held lane (rule 44) |
| `Interrupted` | unknown | the commit's fiber was interrupted by something other than Flow |
| `Defect` | unknown | the commit threw or died; also published as an actor issue |
| `StillUnknown { failure }` | unknown | a definite failure after an earlier unknown send of the same Attempt (rule 18) |
| `StorageRefused` | unknown | a re-send's lane-record capture failed before invocation (2.7.13) |

`Superseded` (a replaced never-sent commit or a released lookup), `NothingToResend` and `InFlight` (a declined retry)
and `Released` (a `cancel` in `Held`) are evidence, never endings (rule 17).

`Defect` and `Interrupted` carry the full Effect `Cause` for diagnostics. Flow has no `Timeout`: it has no timeout
(rule 25).

**How it is built.** The unknown channel is a classified part of Effect's error channel, built the way Effect's own
`HttpClientError` carries a `reason`. The wrappers are internal:

```ts
class OutcomeFailure<R> extends Data.TaggedError("Flow/Failure")<{ readonly reason: R }> {}
class OutcomeUnknown<R> extends Data.TaggedError("Flow/Unknown")<{ readonly reason: R }> {}

// Inferred from the commit, with nothing declared elsewhere:
//   failure channel = FailureReasons<E> | NotSent
//   unknown channel = UnknownReasons<E> | Cancelled | Restored | Interrupted | Defect | StillUnknown<FailureReasons<E>>
```

Effect's own combinators keep working inside a commit (`Effect.catchReason("Flow/Unknown", "NoResponse", …)`).
Branching inside a commit uses `Effect.gen` with `if` and `return yield*`; a ternary that returns different Effect
types does not unify.

**The classifier.** The runtime classifies each send from its `Exit` and the whole `Cause`, outside the fiber it
interrupts, Flow's own knowledge first, then most cautious first:

```ts
if (neverInvoked)                      → failure: NotSent
if (restoredWithSavedAttempt)          → unknown: Restored
Exit success                           → success: value
Cause.hasDies(cause)                   → unknown: Defect (with the Cause), and an actor issue
Cause.findError(cause) finds e:
  e is OutcomeUnknown                  → unknown: e.reason
  e is OutcomeFailure                  → failure: e.reason
  otherwise                            → failure: e
only interruptions:
  Cause.interruptors are Flow's fibers → NotSent { why: "Cancelled" } before invocation, else Cancelled
  otherwise                            → unknown: Interrupted (with the Cause)
```

A Cause can hold several reasons (a failure plus a crashing finalizer, parallel sub-calls), so the classifier reads
all of it: a failure followed by a dying finalizer is unknown, not failure. Rule 18 then turns the send's ending into
the Attempt's.

**What each channel does to the cache.**

| Channel | Optimistic look (plain operations) | Refetch |
| --- | --- | --- |
| success | confirmed | none |
| failure | removed | none |
| unknown | kept, marked uncertain | the displayed entries, once |

Domain predictions follow the Attempt's ending, after rule 18, not the send's channel (rule 30; the table in 2.8.6).

- The refetch is a read, and a read has no unknown: it succeeds or fails. If it fails, the look stays marked
  uncertain and the next natural trigger (reconnect, focus, invalidate) reads again. Flow never loops.
- Entity domains: 2.8. A definite failure removes predictions without repair; unknown, `StillUnknown` included, keeps
  live predictions, forces the repair, holds the record queue until it settles and marks the record uncertain (rule 30).
- Reads (`lookup`, `subscribe`) keep two channels, success and failure, because a read changes nothing. A read's defect or interruption also ends
  the read operation's lookup on `failure` as Flow's `Defect` or `Interrupted`, which a tag record must map (rule 37); a defect is
  still an issue.

**Where unknowns come from.** An unknown always means: the request left the device, and no trustworthy answer came
back. A dropped connection cannot be told apart from "the server never got it"; that is the honest limit of the web,
why the unknown channel exists, and why the Attempt's id matters. The author decides for transport errors, proxy
pages, server errors and undecodable bodies; Flow decides for its own cancels, reloads, outside interruptions and
throws ([merged/outcomes.md](merged/outcomes.md) section 6 lists each source, with tRPC as the example).

#### 2.7.2 Where the data comes from

| Value | Real source | How it reaches the machine |
| --- | --- | --- |
| Status, `Retry-After`, body | the browser's `Response` | the adapter service decodes it into a typed result, or fails `NoResponse` when `fetch` rejects |
| The send's channel | the commit author's `Outcome.success / failure / unknown`, beside the status it reads | Flow's classifier reads the commit fiber's `Exit` and `Cause`, outside that fiber (2.7.1) |
| The success value `A` | the commit's return | the `success:` mapper's `value`, typed `A` |
| A failure `X` | the author's error class, built from status and body (`Busy { retryAfterMs }`) | the `failure.<X._tag>:` mapper's `value`, typed `X` |
| An unknown reason | the author's `Outcome.unknown(u)`, or Flow's reasons | the `unknown:` mapper's `value`, typed `U \| Flow reasons \| StillUnknown<X>` |
| `NotSent { why }` | Flow: the adapter was never called | the `failure.NotSent:` mapper |
| The author's event and payload | the author's mapper: `E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs }))` | the event, declared in the definition, routed by rule 14 |
| Attempt `id`, `retryCount` | Flow mints the id, random, when a write is committed, and counts each re-send of that write at its invocation | the mapper's `attempt` (absent on a declined commit); the addressable Attempt's count also as the lane row's `retryCount` in `s.operations` (rule 21) |
| The idempotency key on the wire | the commit author puts `attempt.id` wherever the API expects it | the server; Flow sends nothing itself (rule 19) |
| `attempt.mayHaveApplied` | Flow: an earlier send of this Attempt ended unknown | the commit's context, to read a response with the write's history |
| `input` | the commit's select, over the after memory and event (rule 22) | the mapper's `input`; always present |
| `key` | the contract's `key`, a list of `input` fields, picked from the input (rule 39) | the lane's identity for a write, the entry or session for a read; every mapper's `key`, present even when `attempt` is not |
| Lane identity | Runtime O3's actor identity, the contract id and the key | adoption by a new incarnation of the identity (rule 44) |
| A prediction | the domain's predicted fields' functions `(beneath, input) => value`, with the real input; `.predicts` itself runs once, at construction, for structure | the store, joined in the starting turn's publication (rule 28); views read `predicted` on the record |
| The record queue | the store, per record, across actors | Flow joins it at start or retry and releases it at settlement, or after a forced repair (rules 29, 30) |
| `uncertain` | the store, per record and Attempt | set at settlement of an unknown, cleared by rule 32; views read it on the record |
| `unconfirmed` | the store, from a success that omitted a predicted field | views |
| Cancel | the machine's `O.pay.cancel(k?)` action | `Fiber.interrupt` on the commit, which aborts the `AbortSignal` it handed the adapter; the browser drops the request **only if the adapter passed it to `fetch`/XHR** |
| "the request reached the server", "the server finished after a cancel" | nothing: no browser API reports either | so a send interrupted after invocation is `unknown`, and clean-up is keyed by the Attempt (2.7.7) |
| Time | the Runtime Clock; `TestClock` in Stories | schedules (`now`, firing metadata, a keyed schedule's `key`) |
| Server truth in Stories | a fake server, one per run (rule 62) | the fake's truth and request log, read at every step cut (2.10.4); no ending is injected (Testing O3, rule 62) |

#### 2.7.3 Contracts, operations and the commit

The checkout (the operations record's 5.1), in excerpts:

```ts
// checkout.contracts.ts (outside the machine)
export const Stripe = {
  confirm: transaction({
    id: "Stripe.confirm",
    input: Schema.Struct({ intentId: Schema.String, paymentMethodId: Schema.String }),
    output: Intent,
    key: [],                                                    // one lane: one intent per checkout actor (rule 39)
    concurrency: "reject",
    commit: (input, { attempt, signal }) => Effect.gen(function* () {
      const api = yield* StripeApi                              // production wraps fetch; Stories use a fake's client half (2.10.4)
      const res = yield* api.confirm(input, { idempotencyKey: attempt.id, signal }).pipe(   // the author puts Flow's id on the wire (rule 19)
        Effect.retry({ while: (e) => e._tag === "NoResponse", times: 1 }),                  // invisible: inside one send
        Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (res.ok) return yield* Outcome.success(toIntent(res))
      if (res.status === 402) return yield* Outcome.failure(new CardDeclined({ declineCode: res.declineCode ?? "generic_decline" }))
      if (res.status === 429) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))   // information only
      if (res.status === 409) return yield* Outcome.failure(new TooManyAttempts({}))
      if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
      return yield* Outcome.failure(new Rejected({ code: res.code ?? "unknown" }))
    }),
  }),
  intent: resource({ id: "Stripe.intent", input: { intentId: Schema.String }, output: Intent, key: ["intentId"], staleTime: "0 millis", gcTime: "1 minute", lookup: retrieveIntent }),
}

// A response read with the write's history, by the author who knows the API:
if (res.status === 404 && attempt.mayHaveApplied) return yield* Outcome.success({ alreadyGone: true })
```

```ts
// checkout.definition.ts
internalEvents: {
  Intent: { status: IntentStatus, chargeId: Schema.optionalKey(Schema.String) },   // 2.7.4 reads `status`
  Declined: { code: Schema.String, paymentMethodId: Schema.String },
  Busy: { retryAfterMs: Schema.optional(Schema.Number) },   // no `attempt` field: Flow keeps the Attempt
  TooManyAttempts: {}, Refused: {}, TryLater: {}, ReadFailed: {},
  Unsure: Flow.uncertain({}),                               // the only kind of event `unknown:` may target
  TookTooLong: {}, RetryNow: {}, CheckTick: {},
},
operations: ({ E }) => {
  const intent = E.Intent.from((i) => ({ status: i.status, chargeId: i.chargeId }))
  return {
    pay: Stripe.confirm.outcomes({
      success: intent,                                      // the read in 2.7.9 maps to the same event
      failure: {                                            // exhaustive over the commit's failure tags
        CardDeclined: E.Declined.from((r, { input }) => ({ code: r.declineCode, paymentMethodId: input.paymentMethodId })),
        Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })),
        TooManyAttempts: E.TooManyAttempts, Rejected: E.Refused,
        NotSent: E.TryLater,                                // optional in the type; flow check requires it here (rule 20)
      },
      unknown: E.Unsure,                                    // StillUnknown arrives here too (rule 18)
    }),
    read: Stripe.intent.outcomes({ success: intent, failure: E.ReadFailed }),   // maps success: looked up (rule 41)
  }
},

// checkout.machine.ts
CARD:    { on: { Pay: { target: S.PAYING, guard: [O.pay.idle], updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId, busyTries: 0 }), actions: [O.pay.commit(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }))] } } },   // a new Attempt
UNSURE:  { on: { CheckTick: [{ target: S.PAYING, guard: [O.pay.retryable({ times: 6 })], actions: [O.pay.retry] }, { target: S.STUCK }] } },   // the same Attempt, in Held
PAYING:  { on: { TookTooLong: { target: "self", actions: [O.pay.cancel] } } },   // interrupts; the unknown { Cancelled } is retained
```



**What an operation is.**

An operation binds one contract to this definition's events. It holds **no select, trigger, params or key**, and
**no verb**: the machine's verb says how it runs (decided, OD2).

```ts
// Excerpts from 5.1, 5.3 and 9.1
operations: ({ E }) => ({                                                       // existing keyword, NEW MEANING
  pay: Stripe.confirm.outcomes({                                                // user-defined: pay; existing word outcomes, now a method
    success: E.Intent.from((v) => ({ status: v.status, chargeId: v.chargeId })),
    failure: { CardDeclined: E.Declined.from((r, { input }) => ({ code: r.declineCode, paymentMethodId: input.paymentMethodId })), Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })), TooManyAttempts: E.TooManyAttempts, Rejected: E.Refused, NotSent: E.TryLater },
    unknown: E.Unsure,
  }),
  read: Stripe.intent.outcomes({ success: E.Intent.from((v) => ({ status: v.status, chargeId: v.chargeId })), failure: E.ReadFailed }),   // maps success: the machine must use lookup
  issues: Issues.list.outcomes({ value: E.Listed.from((v) => ({ ids: v.issues.map((i) => i.id) })) }),   // maps value: the machine must use subscribe
  like: Issues.setLike.outcomes({ success: E.Settled, failure: { Gone: E.IssueGone, Refused: E.Failed.from(() => ({ message: "Could not update" })), NotSent: E.Failed.from(() => ({ message: "Could not update" })) }, unknown: E.LikeUnsure.from((_r, { key }) => ({ id: key.id })) }),   // key ["id"] on the contract (OD15): one lane per Issue
  typing: ChatTyping.typing,                                                    // bare: a delivers: "latest" stream; maps nothing
}),
```

Per kind (OD3: the declaration is one shape, the rest is per kind):

| Contract kind | Verb in the machine | `outcomes` keys | Other members | Row |
| --- | --- | --- | --- | --- |
| transaction, domain write | `O.x.commit(select)` in `actions` | `success`, `failure`, `unknown` | `retry(k?)`, `cancel(k?)` in `actions`; `idle(k?)`, `retryable(k?, { times })` in `guard` | per contract key: `{ pending, uncertain, waiting, retryCount, progress? }`, the flags defined by lane state (2.7.13, OD10); under `allow`, `{ pending, outstanding }` (no hold) |
| resource, domain read, used one-off | `O.x.lookup(select)` in `actions` | `success`, `failure` | `idle`, `cancel` (rule 42) | one per operation: OPS O6's resource lane for the entry its latest lookup named, `undefined` before the first lookup (rule 42) |
| resource, domain read, used live | `O.x.subscribe(select)` or `O.x.subscribe.each(select)` in `activities` | `value`, `failure` | `refetch(k?)` | OPS O6's resource lane per placement, per key under `each`; `undefined` while not placed |
| stream, domain `listen` | `O.x.subscribe(select)` or `O.x.subscribe.each(select)` in `activities` | `value`, `pages`, `missed`, `fills`, `failure` (rule 67, 2.11.6); a `listen` entry the domain's | `refetch(k?)`, `bookmark(select)` in `actions` (2.11.8) | 2.11.9's row per placement, per key under `each`; `undefined` while not placed |

**The verb and the mapping must agree** (proposed, follows from OD2). A resource operation that maps `success` can
only be looked up; one that maps `value` can only be subscribed; one that maps neither (bare, or `failure` only) may
use either verb, but **one operation uses one verb**: a definition whose machine both looks up and subscribes the same
operation is a declaration error (`VerbMismatch`), as is `lookup` on an operation mapping `value` or `subscribe` on
one mapping `success`. On a typed handle these are type errors first (4); `flow check` reports them from the tokens
for untyped code and Inspection. Deleting a `success` mapper now breaks the `lookup` that needed it, loudly, instead
of turning it into a placement (review 3's mode (a)). Transactions have only `commit`, streams only `subscribe`.

Proposed, follows from OD5: **a bare write's unknown is not retained.** No handler sees it, so nothing could retry
or release it, and under the hold it would block its lane for good (9.1's `latest` ping). It ends as evidence and the
lane is free; a bare write is fire-and-forget by declaration.

Proposed (R4 M7, removes R4's mode 2): **a write that maps anything must map `unknown`** when its policy holds
(`reject`, `latest`, `serialize`); otherwise `UnresolvedHold` reports it (2.7.13, case 1; revision 6's separate
`UnmappedUnknown` is folded in, R5 audit). So whether a write holds depends only on "bare or not", never on which
keys are mapped. `cancel` and `allow` do not hold, so there it is not required.

A **bare** operation (`typing: ChatTyping.typing`, `ping: ChatTyping.ping`) maps nothing, for every kind but an `every` stream (rule 40) and a `listen` entry, which must map `failure` (2.11.6): none of its
results becomes an event. What happens to them is the kind's own rule, not a second meaning of "bare": a write's
results are evidence only (rule 40), and a read's or a `latest` stream's data is in its lane for views. Declaring a write bare is the
explicit ignore, as `{ target: "self" }` is for a late event (D13). `flow check` lists bare writes as info.

**Lane identity, per kind.**

**Each kind states its own identity** (OD3). The contract's `key` keeps OPS O1's meaning, "which server thing", for
every kind; what a lane is per differs:

| Kind | A lane is | The contract's `key` is | Status |
| --- | --- | --- | --- |
| write (`commit`) | (actor identity, contract id, key of the input), owned by the Runtime | the lane's identity: one write in flight per thing per actor identity (D9) | **decided (OD9, Q2; OD19, OD20)** |
| one-off read (`lookup`) | (actor, operation): **one lane per operation** | the cache entry the lookup reads (OPS O1, O2), not the lane | proposed, follows from OD3 (R3 K2); its delivery rule decided (OD9, Q6) |
| live read or stream (`subscribe`) | (actor, placement); under `subscribe.each`, (actor, placement, key) | the entry or session (OPS O1, O4); under `each`, also the session's key | proposed (revision 3, kept) |

Why one lane per one-off read operation: a one-off read operation shows one thing (a search box's results, a
reconcile read's answer). With lanes per cache key, as revision 3 implied, "only the latest lookup is delivered" was
per operation while the row and `get` were per key, so a lazy tree lost node A's children when node B expanded, and a
search view read a keyed lane as a plain row (R3 H4, M3). With one lane per operation the delivery scope, the row and
`cancel` are the same thing. A per-thing one-off read (a tree's nodes, one card's details) is a live
`subscribe.each` over the things shown, or one operation per independent read.

**The contract's shape** (decided, OD11–OD15). Every kind (transaction, resource, stream) has exactly two flat
schemas, **`input`** and **`output`** (OD12; `result` is renamed `output`, and there is no `params` schema), each a
fields record (`{ q: Schema.String }`, wrapped as `Schema.Struct`) or a full Schema for unions and classes (OD14).
Errors stay `Schema.TaggedError` classes typed through the function's Effect. The function stays inline (`commit`,
`lookup`, `subscribe`) and calls user services whose Layer is the swap point (OD11). Effect RPC is not inside the
contract (OD13): `Rpc` is unstable in 4.0.5 and brings wire machinery Flow does not need. A later, opt-in
`resource.fromRpc` / `transaction.fromRpc` adapter would take an existing `Rpc` for its two schemas and map a
client error to `unknown`, when a real app needs it.

Consequences, stated (proposed where not in an OD): **persistence** decodes every lane's and persisted entry's key
with `input`'s pick, and a persisted resource's data with `output` (OPS O1's "persisted resources require result"
reads `output`); **SSR** transfers `output`-decoded data (ServerRendering O3's "without result" becomes "without
`output`"); **streams** take `input` with no position, so 2.11.2's `messages` is
`input: { roomId }, key: ["roomId"]`, and `position` names a field of `output` (S15); **merge 4** domain reads and writes take `input`/`output` from their
contract, and `.predicts` reads `input`; **Stories** build fake contracts with the same two schemas; **`flow check`**
reads `key` against `input`'s fields as data. OPS O1 is rewritten around `input`, `output` and a required `key`.

**The key is a field list of `input`** (decided, OD4, OD12; R3 K3), like an entity's `primaryKey`: `key: ["docId"]`,
and a composite key lists every field, `key: ["docId", "field"]`. **`key` is required on resources and transactions,
with no default** (decided, OD15): one lane or one cache entry is written `key: []`. Decided for streams as well
(OD23 Q38): required, `key: []` for one session, because a stream's key is its session identity (OPS
O4) and the same rule on every kind is one rule. A stream's position is not an input field (rule 71, overturning OD12's clause). Consequences:

- **It has a Schema**: `input`'s pick of those fields, for every kind, so a persisted lane's or entry's key decodes on
  restore (R3 M5) and Inspection prints it without running code. Review 5's Q27 (a read's key Schema) is answered by
  OD12: every kind has `input`.
- **`flow check` and Inspection read it** (R10): a list of names is data, not a closure.
- **The key record has one meaning everywhere**: the pick of those fields, `{ docId: "d1" }`, in a mapper's `key`, a
  lane's `key`, a keyed list's rows and (proposed, L1) a keyed schedule's `key` (2.7.10).
- **Any value that carries the fields names the lane** (OD4): `O.post.get(s, msg)`, `O.save.idle(({ event }) => event)`.
  Flow picks the fields; extra fields are ignored; a missing field is a type error.
- **The limit** (OD4): no derived or nested keys. `key: (i) => ({ id: i.card.id })` or a key computed from two fields
  cannot be written; the input must be reshaped so the key is top-level fields (`{ cardId, ... }`). OPS O1's other
  rules (canonical values, size bounds, `InvalidKey`) still apply to the picked values.

For writes:

- **It is stated once**, on the contract, and picked at every commit. A commit cannot name a lane that disagrees
  with what it sends. Nothing in a definition or machine spells it, except where a member must name a lane without an
  input (`retry`, `cancel`, `idle`, `retryable`, `get`). Where they may omit the key is fixed by tokens, never by
  where an event came from at runtime (decided, OD8): **on an unkeyed operation** a key-less member always names its
  one lane, in any handler; **on a keyed operation** it may stand only in a handler of an event that this operation
  alone maps, and names that ending's Attempt; anywhere else it is `KeyRequired`. Elsewhere members take a selector
  returning any value that carries the key's fields, usually the user event that names the thing. An event shared by
  several keyed operations whose handler acts on lanes is split per operation (5.3: `RenameUnsure`, `RemoveUnsure`).
  Revision 5's "acts only if this turn's ending is X's" is removed (R4 H4: either reading broke a case).
- **Lanes are created by work** (the first commit for a key) and **removed when they hold nothing** (no outstanding
  Attempt and no retained unknown). No membership list, no draining, no `max`. An unused key has no lane, and
  `O.x.get(s, key)` returns the idle row for it, which is true: nothing is in flight for that thing.
- **An unkeyed contract** (`key: []`) has one lane per operation; its row is plain:
  `s.operations.pay.pending`.
- **Every transaction states its key** (OD15), so "`latest` and `cancel` need one" is no longer a separate rule:
  "only the newest matters" has its "of what" written on every contract. `key: []` on a `latest` write says "one
  thing", explicitly. R3 M4 (domain writes failing an early check) is gone with the default.
- **Domain writes state their key too** (decided, OD15). Revision 5's primary-key default and rule 34's
  `.predicts` default are gone: `setLike` writes `key: ["id"]`. Rule 34's warning is now "a one-record write whose
  key fields are not the input fields its predicted record's key reads". R4 M3 (the default's entity read from a closure) and Q30 go
  with the default.
- **Routing is unchanged** (rule 14): a commit or lookup is owned, for current-or-late routing, by the state
  activation its transition names.

Per-field autosave, the case that broke revision 2 (R2 C-H1):

```ts
// settings.contracts.ts
export const saveField = transaction({
  id: "settings/save-field",
  input: { docId: Schema.String, field: Schema.Literals(["title", "description", "tags"]), value: Schema.String },   // OD14: a fields record
  key: ["docId", "field"],                                                     // a field list (OD4); one lane per field: title, description and tags never supersede each other
  concurrency: "latest",
  commit: (i, { attempt, signal }) => SettingsApi.use((api) => api.patch(i, { idempotencyKey: attempt.id, signal })),
})
// in the machine: one commit, the key comes from the input
FieldEdited: { target: "self", actions: [O.save.commit(({ memory, event }) => ({ docId: memory.docId, field: event.field, value: event.value }))] },   // existing: commit
```

**Members.**

- **`commit(select)`** (existing, OPS O3; decided, OD2) runs the select on the turn's after memory and event (rule
  22), picks the key, mints an Attempt, and invokes the contract under its `concurrency` on that key's lane. A busy
  `reject` lane, or one holding an unknown (OD5), ends the commit `NotSent { why: "Rejected" }` and the transition
  runs (rule 16).
- **`lookup(select)`** (existing, OPS O2; decided, OD2) runs the select, joins or starts the entry's lookup (OPS O2:
  fresh data settles with no request), and points the operation's one lane at that entry. A newer lookup of the same
  operation releases the older one's delivery (2.7.9).
- **`subscribe(select, { when? })`** and **`subscribe.each(select, { when? })`** (existing verb, OPS O2, O4; decided,
  OD2; `.each` proposed) place a live operation; `each`'s select returns a list of inputs, one session per distinct
  key, repaired like `.each` keys (rule 23). `when` may hold state tokens. OPS O2's `subscribe` options
  (`placeholder`) stay on the placement.
- **`retry(k?)`**, **`cancel(k?)`**, **`idle(k?)`** on a write, as in 2.7.3, on the lane `k` names; `k` returns any
  value carrying the key's fields. **Key-less addressing** (decided, OD8): on an unkeyed operation `k` is always
  omitted and names the one lane; on a keyed operation `retry`, `retryable` and `cancel` may omit it only in a handler
  of an event that operation alone maps, and then address that ending's Attempt; anywhere else a key-less member of a
  keyed operation is `KeyRequired`, a type and `flow check` error. `idle` and `get` always take a key on a keyed
  operation. A key-less member in an ending acts on that ending's own Attempt (2.7.13, R5 K9). Revision 6's
  `SharedEnding` info is cut (R5 L4): it fired only on the intended use.
- **Mapped events come only from endings** (proposed, simplified per R5 L3). An event an `outcomes` maps is never a
  schedule's `send`, a `raise` or a view's `send`; `outcomes` map only `internalEvents`. `flow check` reads all three.
  Stories produce endings through fakes (rule 62); a lane with nothing on the wire has nothing to `release`
  (`NothingHeld`, 2.10.2).
- **`retry`, `cancel`, `idle`, `retryable` on a write do exactly what the write-lane table in 2.7.13 says** (decided,
  OD10), per state; the bullets below are summaries. The addressable Attempt is the one sent Attempt the lane holds
  in `InFlight` or `Held` (the head under `serialize`).
- **`retry`** re-sends a `Held` Attempt with its id and input unchanged (rule 31); in `Idle` or `InFlight` it sends
  nothing. A failed Attempt is resolved and not re-sendable (R5 L5; amends rule 21).
- **`idle(k?)`** passes in `Idle`; it denies `InFlight` in `InFlight` and `Uncertain` in `Held`. Proposed.
- **`retryable({ times })`**, **`retryable(k, { times })`** (decided, OD1): passes in `Held` while `retryCount <
  times` (re-sends after the first send, as `Effect.retry({ times })` counts); denies `RetryLimit { retryCount }`,
  `InFlight`, or `NothingToResend` by state. `check()` reports the same denial. Budgets never travel through events.
  Writes only.
- **`cancel` addresses one Attempt, the same one as `retry`** (decided, OD7). In `InFlight` it interrupts an invoked
  Attempt; the lane stays `InFlight` until the interrupt's ending is admitted, and that `unknown { Cancelled }` is
  **retained**, so the lane becomes `Held` and nothing newer is sent while the request may still land (R5 H1, R6 L1).
  An Attempt waiting to be invoked, in any turn, acts by history (2.7.13): never sent, it ends
  `NotSent { why: "Cancelled" }`, delivered (rule 24); a re-send returns to `Held` and is released. In
  `Held` it releases the Attempt (`Released`) and the queued commit is promoted at once (OD16). In `Idle` it does
  nothing. So `[O.x.cancel, O.x.cancel]` in one `Held` turn releases, then ends the just-promoted commit, visibly (R5
  M5). Mode (c) stays gone: one address, an effect per state, as `retry` has.
- **`cancel` on a one-off read** (follows from OD3; rule 42) releases the operation's lookup: nothing is
  delivered, the row becomes `undefined`, and the shared request continues only if another holder needs it (OPS O2:
  "Releasing one owner preserves shared work"). OPS O7's "resources have no cancel action" stays true of the entry:
  this cancels this operation's wait, not the cache. `idle` on a one-off read passes while no lookup of the operation
  is waiting.
- **`refetch(k?)`** re-requests the entry a live placement holds (OPS O2).
- **Mapper context**: writes `(value, { input, attempt, progress, key })`; reads and streams `(value, { input, key })`.
  `key` is always the contract's key record of the call that ended, the pick of its key fields; it identifies the lane
  for a write and the entry or session for a read or stream (2.7.3). The key of a `subscribe.each` session (2.7.10, rule
  41) and a keyed schedule's `key` (rule 23) are the same record. `laneKey` and `superseded` are gone.

**The contract: concurrency, `key`, one write operation per contract.**

- `concurrency` stays required on the transaction and governs each lane.
- `key` is required on every resource and transaction (OD15), is a field list of `input` (OD4, OD12), and is now
  what a write lane is per.
  Revision 2 removed it to delete the K-rule; with lanes per key there is no K-rule to delete: different keys are
  different lanes. For reads it keeps OPS O1's meaning only (2.7.3).
- **Two write operations on one write contract** in one definition are a declaration error (`SharedContract`), per actor, counting every fragment placement (rule 40, F2). D9's
  "one write in flight per key" holds by construction, per actor identity (two live local actors with equal input are
  two lanes, R8 M5). Revision 2's `.joins` is removed (R2 A-M1, C-M6): a second kind
  of start is a second `commit` of the same operation with its own select; when the handlers must tell them apart,
  the starting transition records it in memory (9.2's `method`; R3 M6: correct for an unkeyed lane, a known limit for
  concurrent starts on different keys). Reads and streams are exempt: two reads never charge twice, and two operations on one stream contract are two sessions; `flow check` warns `DuplicateSession` (rule 70).

**Refusing a second press is explicit.** Under `concurrency: "reject"`, a commit on a busy lane refuses only the
write: the transition still runs, and the decline arrives as `NotSent { why: "Rejected" }` (rule 16). To refuse the
whole transition, and disable the button through `check()`, write `O.pay.idle(k?)` in its guard. Other modes decide
what many presses do (2.7.8).

**Starting is static.** A write starts only by listing a commit in `actions` (Machines O1: actions are static). A
conditional start is written as alternatives:

```ts
Pay: [
  { guard: ({ memory }) => memory.useSaved || deny("NoSavedCard"), target: S.PAYING, actions: [O.pay.commit(fromSaved)] },
  { target: S.PAYING, actions: [O.pay.commit(fromForm)] },
]
```

A commit is a value, so it may sit in a shared transition object, in an action list beside other actions, in a host's
filling of a fragment callback (for the host's own operation), in a fragment's own body (for its operation, rule 50),
or behind a schedule's event; it cannot be started from a guard, mapper or
`updateMemory`. One write made of several requests that must succeed or fail together is composed inside the commit
function, as Effect code calling services (one Attempt, one ending). Writes that depend on each other are separate
operations chained through states.

**The select is typed where it is used.** The select is written at the commit, so it is type-checked by its transition
(rule 1, Typing): a select that reads `event.paymentMethodId` can be written only on transitions whose event has that
field. The select reads the after memory (rule 22), so writing `etag` and sending it in one transition works.

#### 2.7.4 Handling endings: current or late, the same event

An excerpt: it shows routing, so PAYING's handlers for `Declined` and `TryLater` and the root's `ReadFailed`
handler are left out; a complete machine needs them (rule 20).

```ts
const thisIntent = ({ memory }) => ({ intentId: memory.intentId })
const paid = { target: S.DONE, guard: ({ event }) => event.status === "succeeded" || deny("NotSucceeded") }
const toRead = { target: S.READING, actions: [O.read.lookup(thisIntent)] }
const answered = [O.pay.cancel, O.challenge.cancel]           // the read answered: release what the lanes still hold
return {
  on: {
    // Late (rule 14), or adopted by a new incarnation in any leaf (rule 44): the same event, routed from the root.
    Intent: [{ ...paid, actions: answered }, { target: "self" }],
    Unsure: { target: "self", actions: [O.read.lookup(thisIntent)] },   // never drop a charge that may have landed
    Declined: { target: "self" }, Busy: { target: "self" }, TryLater: { target: "self" },   // late failures: explicit ignores (rule 20)
  },
  states: {
    CARD: { on: { Unsure: S.UNSURE } },                         // a new incarnation starts here and may receive a held pay
    PAYING: {
      on: {   // current: the user is still in PAYING (or below it)
        Intent: [paid, toRead],
        Busy: [
          { target: S.WAITING, guard: ({ memory }) => memory.busyTries < 3 || deny("GaveUp"),   // a budget across new writes: memory
            updateMemory: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs ?? 1000 * 2 ** memory.busyTries }) },
          toCard("Stripe is busy. Try again shortly."),   // true: after an unknown send this arrives as Unsure (rule 18)
        ],
        Unsure: S.UNSURE,
      },
    },
  },
}
```

At admission Flow tests whether the call's owner is alive. If so the mapped event routes from the active leaf; if
not, the same event routes from the nearest surviving ancestor of the owner. A handler on the owner state is the
"still waiting" reaction; a handler on an ancestor is the "after leaving" one, and every late event that can occur
has one, even if it is `{ target: "self" }` (rule 20). A save that belongs to the app is started with
`target: "self"` and its endings are handled once, at the root, whether they arrive current or late
([merged/server-calls/rewrites/m1.save.ts](merged/server-calls/rewrites/m1.save.ts)). A holding write's endings are handled at the
root, because a new incarnation can adopt the lane in any leaf (rule 44).

#### 2.7.5 Reading lanes: `s.operations` and `O.x.get`

Rows are per kind (OD3; rules 21, 42):

- **Unkeyed write operation**: `s.operations.pay` is the row: `{ pending, uncertain, waiting, retryCount,
  progress? }`. The flags are functions of the lane's state (decided, OD10; table in 2.7.13): **`pending`** is
  `InFlight` (NEW MEANING against rule 21, which counted a waiting start); **`uncertain`** (OD5, M4's word) is
  `Held`, so a view shows "not confirmed" and a schedule's `keys` can read it (R3 M2), and it is false during a
  re-send; **`waiting`** (OD6) is "a never-sent commit exists", so a view can say "your newer edit waits" and a guard
  can keep a live answer from overwriting it (8.2's `Loaded`).
- **Keyed write operation**: `s.operations.like` is a keyed list (N1) of the lanes that exist, each
  `{ key, ...row }`, in creation order, for Stories and Inspection. Views read one lane with
  **`O.like.get(s, issue)`**, passing the item they render (decided, OD4): any value carrying the key's fields, so a
  view never builds a key record. Total: the idle row when the key has no lane. A value missing a field is a type
  error (AU F9's failure). R3 M7 is reduced less than revision 5 said (R4 L5): TypeScript is structural, so any
  record with an `id`, of any entity, type-checks against `["id"]` and reads idle. Branded keys would close it; not
  proposed.
- **In callbacks** (proposed, R4 M1): `O.x.get(operations, k)` reads a lane in a guard or `updateMemory` as in a view,
  so no callback writes `operations.save.find(...)` (R16).
- **One-off read operation** (*decided, OD9* (Q21)): `s.operations.read` is one row: OPS O6's resource lane
  (`Pending`, `Ready`, `Refreshing`, `Failure`, ...) of the entry its latest lookup named, and `undefined` before the
  first lookup and after `cancel`. Proposed (R4 M4): **the operation holds that entry** until its next lookup or
  `cancel`, as a placement holds its entry, so `gcTime` cannot empty the row of an idle search box; the data shown is
  still the store's current confirmed data (another actor's refetch of `{ q }` updates it, as for any held read). A one-off
  read and a live read of one resource therefore have the same row type, so the definition can type the row without
  knowing the verb (4). "A lookup of mine is running" is `_tag` `Pending` or `Refreshing`. Revision 3's `{ pending }`
  is dropped: OPS O6's `predicted` (renamed from `pending` by E16) already means "live optimistic values", and a second meaning on one row would be a
  hidden mode. Proposed (R5 M7): the row also carries **`key`**, the key record of the entry it holds, as keyed write
  rows do, so a guard can tell which input the row answers (`operations.name?.key.name === memory.name`) without a
  memory mirror (9.6). No new word. Proposed (R6 L3): an unkeyed live placement's row carries `key` too, so a one-off
  and a live read of one resource still have the same row type. A guard comparing `row.key` with memory must also check
  `row.placeholder`: placeholder data belongs to the previous key (R7 L5).
- **Live operation**: `s.operations.feed` is the placement's lane, `undefined` while not placed (OPS O6); under
  `subscribe.each`, a keyed list read with `O.load.get(s, { docId })`, `undefined` for a key not placed.
- **Why a join and not rows on items** (revision 2's choice, R2 C-H3, C-M3): the items a view renders (an answer's
  rows, memory drafts, the store's records) and the lanes with work are different sets with different lifetimes: a
  deleted issue can still be saving, a never-edited row has no work. Any attachment needs a membership rule and its
  edge cases. A typed accessor by the thing's own key needs none.
- **The record keeps its shared state**: `Issue.get(s, key)` returns `{ data, predicted, uncertain, unconfirmed }` as
  in M4; `predicted` already shows "an unconfirmed write is applied", for every actor and every write, many-record
  ones included. "This actor is saving this one" is the lane.

```tsx
const paying = useView(checkout, (s) => s.operations.pay.pending)                          // unkeyed write
const saving = useView(list, (s) => List.O.like.get(s, issue).pending)                     // keyed write: the item the view renders (OD4)
const unsure = useView(list, (s) => List.O.like.get(s, issue).uncertain)                    // this actor's write is unknown (OD5)
const row = useView(list, (s) => Issue.get(s, { id }, Issue.pick("title", "liked")))         // shared: predicted, uncertain
const hits = useView(search, (s) => s.operations.results?.data?.hits ?? [])                  // one-off read: one lane per operation
```

**The keys to reconcile** are the held lanes, read from the after lanes, not a list kept in memory (rule 23; 2.8.2):

```ts
reconcile: { keys: ({ operations }) => operations.like.filter((l) => l.uncertain).map((l) => l.key), schedule: "3 seconds", send: E.ReconcileLike.from(({ key }) => ({ id: key.id })) },
```

#### 2.7.6 Waiting, trying again and reconciling

Flow has no timeout and no retry (rule 25). Each is a state and a schedule. A stream's connection is the one thing Flow re-runs, by its contract's declaration (2.11.10).

| Need | Form |
| --- | --- |
| "Still working" after a delay | a schedule on the owner state that sets memory |
| Stop waiting, keep listening (soft) | a schedule whose handler leaves the owner state; the real ending is then late (rule 14) |
| Abort a hung request (hard) | a schedule whose handler runs `O.pay.cancel(k?)`; the ending is `unknown(Cancelled)`, retained, so the lane is `Held` until retried or released, or the real one if it already settled (rule 24) |
| A transport deadline the UI never sees | inside the commit: `Effect.timeoutOrElse({ duration, orElse: () => Outcome.unknown(new NoResponse()) })` |
| A deadline racing a write (seat hold) | a schedule on the enclosing state; the lane row's `pending` stays true until the ending's turn |

**A visible retry: the CALL/WAIT split.** After a definite failure such as `Busy`, nothing happened, so trying again
is a new write with a new id (rule 19), and a server that stores failures under a key cannot replay `Busy`. Its
budget is therefore memory, counted across writes:

```ts
PAYING:  { on: { Busy: [{ target: S.WAITING, guard: underBudget, updateMemory: countAndDelay }, toCard("busy")] } },
WAITING: {
  schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },   // after memory: the Busy turn's retryInMs (rule 23)
  on: { RetryNow: [{ target: S.PAYING, guard: [O.pay.idle], actions: [O.pay.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: memory.paymentMethodId }))] }, { target: "self" }] },   // a new write, a new id
},
```

Entry arms the wait and leaving cancels it, so leaving stops the retry, and no `armOn` arms on the give-up branch.
The view shows "retrying 2 of 3" from `memory.busyTries`.

**Reconciling an unknown.** After an **unknown**, the write may have happened, so the same write is sent again
(`O.pay.retry`): the server dedups by its id, and `O.pay.retryable({ times })` is the budget:

```ts
UNSURE: {
  schedules: { check: { schedule: "3 seconds", send: E.CheckTick } },
  on: {
    CheckTick: [
      { target: S.PAYING, guard: [O.pay.retryable({ times: 5 })], actions: [O.pay.retry] },   // never a new Attempt; RetryLimit at the budget
      { target: S.STUCK },                                    // still unknown after 5 re-sends: tell the user, never "not charged"; STUCK reads and releases (2.7.4's answered)
    ],
  },
},
```

Re-sending is safe when the server dedups by key; otherwise reconcile with a read (2.7.9). Once a send has ended
unknown, a later definite failure of the same Attempt reaches `unknown:` as `StillUnknown { failure }` (rule 18), so
a give-up branch can never say "not charged" after a send that may have charged. `Stripe.confirm` is `reject`, so the
lane's one Attempt is the one this state reconciles; under `allow` a key-less `retry` exists only in the ending's
own handler, naming that ending's Attempt (rule N2).

#### 2.7.7 Leaving, compensation and clean-up

```ts
// booking.contracts.ts (excerpt)
export const charge = transaction({
  id: "Booking.charge",
  input: { holdId: Schema.String, amountCents: Schema.Int },
  key: ["holdId"],
  concurrency: "reject",
  commit: chargeCard,                                 // classifies with Outcome where it reads the response
  orphaned: ({ attempt, retry }) => retry(attempt),   // its operation gone across a version change (P19)
});

// booking.definition.ts (excerpt)
operations: ({ E }) => ({
  charge: Booking.charge.outcomes({ success: E.Paid.from((v) => ({ paymentId: v.paymentId })), failure: { … }, unknown: E.ChargeUnsure }),
  refund: Booking.refund.outcomes({ success: E.Refunded, failure: { … }, unknown: E.RefundUnsure }),
}),

// booking.machine.ts (excerpt): the user left mid-charge; the charge lands. LEFT owns no call, so the late handler may move it.
const chargeKey = ({ memory }) => ({ holdId: memory.holdId })
const refundKey = ({ memory }) => ({ paymentId: memory.paymentId })
on: {
  Paid: [{ target: S.REFUNDING, guard: [S.LEFT], updateMemory: ({ event }) => ({ paymentId: event.paymentId }), actions: [O.refund.commit(refundKey)] }, { target: "self" }],
  ChargeUnsure: { target: S.SETTLING, actions: [O.charge.retry(chargeKey)] },   // late or adopted, in any leaf: SETTLING owns the hold (rule 44; SETTLING retries or reads, elided)
},
REFUNDING: {
  on: {
    Refunded: S.REFUNDED,
    RefundBusy: [waitBusy(S.REFUND_WAIT, 8), needsHelp("Your refund is delayed. We'll complete it and email you.")],   // a new write after a wait
    RefundUnsure: [waitUnsure(S.REFUND_WAIT, O.refund, refundKey, 8), needsHelp("Your refund is delayed. We'll complete it and email you.")],   // the same write
  },
},
```

Lateness is not transitive: a call started by a late turn is an ordinary call with its own owner (rule 15), so the
chain can finish. REFUNDING owns the refund, so its endings are current there and may move the user. The refund's
select reads the `paymentId` the same turn wrote (rule 22), so one commit serves both starting points
(CONFIRMING's give-up and the late `Paid`) and `O.refund.retry(refundKey)` always finds its record.

**Compensation recipe.** Handle a late success at an ancestor by moving an idle state to a compensating state that
starts the undo; try a definite failure of the undo again as a new write after a wait, and reconcile its unknown with
`O.x.retry` of the same Attempt, each with a budget, ending in a state that tells the user. The full case is
[merged/server-calls/rewrites/booking.ts](merged/server-calls/rewrites/booking.ts).

**Cancel, then clean up.**

```ts
// uploads.definition.ts (excerpt; the operations record's 8.1)
operations: ({ E }) => ({
  put: Uploads.put.outcomes({                                            // key: ["ref"], one lane per file
    success: E.Uploaded.from((_v, { key }) => ({ ref: key.ref })),
    failure: { NotSent: E.UploadNotSent.from((_r, { key }) => ({ ref: key.ref })) },   // never left the device: nothing to clean
    unknown: E.UploadUnsure.from((_r, { key, attempt }) => ({ ref: key.ref, uploadKey: attempt.id })),   // Cancelled after invocation arrives here
  }),
  clean: Uploads.discard.outcomes({ success: E.Cleaned, failure: { … }, unknown: E.CleanUnsure }),
}),
// uploads.machine.ts (excerpt)
UPLOADING: {
  on: {
    Uploaded: S.DONE,
    Cancel: { target: "self", actions: [O.put.cancel(({ event }) => event)] },   // interrupts; the unknown { Cancelled } is retained (Held)
    UploadNotSent: S.CANCELLED,
    UploadUnsure: { target: S.CLEANING, actions: [O.put.cancel, O.clean.commit(({ event }) => ({ ref: event.ref, uploadKey: event.uploadKey }))] },   // key-less: release this upload's hold; the tombstone takes over
  },
},
```

The client cannot stop a body already sent, and no browser API says when the server is done with it. So the
clean-up names the write by its id and the server applies it whenever the upload arrives (a tombstone). Flow's part:
the id reaches the clean-up typed, and the lane stays `InFlight` until the interrupt's ending is admitted, then `Held`
(rule 24), so nothing newer is sent while the upload may land.

#### 2.7.8 Concurrency

The contract's `concurrency` governs each lane (rule 21). Every cell is in 2.7.13.

| Mode | Holds an unknown | Queued commits `W` | Addressable Attempt | Row in `s.operations` |
| --- | --- | --- | --- | --- |
| `reject` | yes | none: a commit while `InFlight` or `Held` ends `NotSent { why: "Rejected" }`; the transition still runs, and `O.pay.idle(k?)` refuses it too (rule 16) | the one minted Attempt | `{ key, pending, uncertain, waiting, retryCount, progress? }` |
| `latest` | yes | one; a newer commit replaces it, and a never-sent head not yet invoked (evidence `Superseded`); a domain write's queued commit also waits to head its record queues (rule 29) | the one minted Attempt | as `reject` |
| `serialize` | yes | a FIFO of at most 64; past it `NotSent { why: "Overloaded" }` | the head | as `reject`, plus `outstanding` |
| `cancel` | for its own ending's turn (`HeldThisTurn`) | none: a commit interrupts the Attempt on the wire, whose ending is then evidence | the one minted Attempt, for its own ending's turn | `{ key, pending, retryCount, progress? }` |
| `allow` | per Attempt, for its own ending's turn | none | per Attempt, key-less in its own ending's handler (rule N2) | `{ key, pending, outstanding }` |

`idle` exists in every mode; `retry` and `cancel` as rule N2 says. Several concurrent calls that each need a status, a
retry or a progress bar (messages, uploads, per-item batch results) are keyed per call and declared `reject`; on its own
key, `reject` never refuses a different call.

```ts
// issues.domain.ts (2.8.2): the store predicts and rolls back; a failure only toasts, so it can never undo newer intent (rule 30).
setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch({ id: input.id }, { liked: input.liked, likes: (i, input) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1) })),
// list.definition.ts: setLike is `latest`, key: ["id"]
like: Issues.setLike.outcomes({
  success: E.Settled,                                              // the store confirms; memory has nothing to write
  failure: { Gone: E.IssueGone, Refused: fail("Could not update"), NotSent: fail("Could not update") },
  unknown: E.LikeUnsure.from((_r, { key }) => ({ id: key.id })),
}),
// list.machine.ts
Toggle: { target: "self", actions: [O.like.commit(({ event }) => ({ id: event.id, liked: event.liked }))] },   // a toggle while unsure waits behind the held lane
LikeUnsure: [
  { target: "self", guard: [O.like.retryable({ times: MAX_LIKE_RESENDS })] },   // the reconcile schedule re-sends it
  { target: "self", updateMemory: () => ({ toast: "Couldn't confirm your like" }), actions: [O.like.cancel] },   // give up: release; a waiting unlike is then sent
],
ReconcileLike: { target: "self", actions: [O.like.retry(named)] },   // the same request, no new prediction (rule 31)
```

A plain operation (no domain) keeps memory-held predictions, as before: the select reads the memory its turn flipped
(rule 22); a replaced never-sent commit is not delivered, so no `superseded` guard is needed (rule 17).

#### 2.7.9 Reads around writes

**One-off reads: one lane, latest lookup delivered (decided, OD9: Q6).**

A one-off read operation has one lane (2.7.3). A lookup releases the previous lookup of the same operation; the
released lookup's settlement is evidence `Superseded`, and only the latest lookup's result is delivered (R2 A-H2). A
search box needs no stale guard; clearing the box is `O.results.cancel`, with no key (R3 H4). This replaces MD
2.7.9's "each fetch is its own call with one ending" and OPS O2's "each finite lookup settles once" for lookups
through one operation: two lookups of one operation from two states deliver the latest, and a state waiting for a
read still receives it, because a current ending routes from the active leaf. Two independent reads that must both
arrive are two operations, or a `subscribe.each` placement.

Reads need no version rule: a lookup changes nothing on the server, and OPS O2's ordering already stops an older
request from overwriting newer data in the entry.

**Live reads and streams: no replacement rule (unchanged).**

OPS O2 and O4 already say it: a placement that changes identity releases its session before opening another, and a
released session cannot publish later (rule 70). Nothing new is needed.

A read operation's `success:` sees confirmed data only, never a prediction (rule 37).

```ts
// checkout: a reconcile read; a slow poll is released by the next, so only the latest answer arrives
READING: {
  schedules: { poll: { schedule: Schedule.spaced("2 seconds"), send: E.PollTick.from((m) => ({ n: m.attempt })) } },
  on: {
    PollTick: [{ target: S.STUCK, guard: ({ event }) => event.n >= MAX_POLLS || deny("PollsLeft") }, { target: "self", actions: [O.read.lookup(thisIntent)] }],
    Intent: [{ ...paid, actions: answered }, { target: "self" }],   // the read answered: release the held writes (rule 24)
    ReadFailed: { target: "self" },
  },
},
// a search box: one lane, no stale guard; an empty query cancels the waiting lookup, with no key
Typed: [
  { target: "self", guard: ({ event }) => event.q.trim().length > 1 || deny("TooShort"), updateMemory: ({ event }) => ({ q: event.q }) },
  { target: "self", updateMemory: ({ event }) => ({ q: event.q, hits: [] }), actions: [O.results.cancel] },
],
SearchDue: { target: "self", actions: [O.results.lookup(({ memory }) => ({ q: memory.q }))] },
Found: { target: "self", updateMemory: ({ event }) => ({ hits: event.hits }) },   // an older query's answer is never delivered
```

#### 2.7.10 Time per key: keyed schedules

```ts
schedules: {
  unlock: {                                                                   // one timer per key
    keys: ({ memory }) => Object.keys(memory.lockedUntil).map((challengeId) => ({ challengeId })),   // key records
    schedule: ({ key, memory, now }) => Duration.millis(Math.max(0, memory.lockedUntil[key.challengeId] - now)),
    send: E.Unlock.from(({ key }) => ({ challengeId: key.challengeId })),
  },
  autosave: {                                                                 // one debounce per document
    keys: ({ memory }) => memory.dirty.map((docId) => ({ docId })),
    restartOn: ({ key, memory }) => memory.drafts[key.docId],                 // per key (rule 23)
    schedule: "1 second",
    send: E.SaveDue.from(({ key }) => ({ docId: key.docId })),
  },
},
```

A key's timer is armed when the key first appears in the after list, cancelled when it leaves, and fires once
(rule 23). Keys are key records, as a contract's key is, and `keys` may read `operations`; on a keyed schedule
`restartOn` is evaluated per key and `armOn` is a construction error (rule 23; OD17 Q13, OD23 Q29). It replaces "one timer aimed at the earliest deadline" and per-row ticks. Keyed schedules are a Machines
feature (C14).

**One session per key.** A list holds one live session per row with `O.x.subscribe.each(select)` (rule 41): the
select returns a list of inputs, one session per distinct key (rule N1; OD9 Q22); the view reads one with
`O.x.get(s, key)`:

```ts
// definition: the stream's key is ["symbol"]; every mapper receives `key`
quotes: Market.quote.outcomes({ failure: { MarketDropped: E.QuoteEnded.from((_e, { key }) => key), Feed: E.QuoteEnded.from((_e, { key }) => key) } }),   // 2.11.12.3
// machine
activities: [O.quotes.subscribe.each(({ memory }) => memory.watchlist.map((symbol) => ({ symbol })))],   // one session per symbol in the after list
// view
useView(watch, (s) => List.O.quotes.get(s, { symbol })?.value)              // undefined for a symbol not placed
```

A key's subscription starts when the key first appears in the after list and is released when it leaves; a repeated
key keeps its first position, with `listRepair` evidence (rule 23). Each key's lane and deliveries behave as one
ordinary activity's (Machines O6; rules 67–70 for streams), and a delivery for a key that has left is discarded as a
released session's is. Two selected inputs with one key are one session (rule 41); two operations on one contract are two (rule 70).

#### 2.7.11 Batches and Stories

**Per-item results of a batch.** Each item is its own commit (keyed by item, `reject`, so each item's lane is one
call that `retry` can name: rule N2, Revision (multiplicity audit, 2026-10-31)) with its own Attempt, classification
and cache rule. The batching happens below the commit, in the adapter, with Effect's
`RequestResolver`: each commit calls `Effect.request(Archive({ id, key }), resolver)`, and the resolver sends one HTTP
request and completes each entry from the per-item statuses. Not spiked.

**Stories read the server's truth.**

```ts
const busyThenCharged = Story.machine(CheckoutMachine, { id: "checkout/busy-then-charged", input: { intentId: "pi_1" }, fixtures: [StripeFake] })
  .world(Stripe.busy({ times: 1 }))                                   // user-defined control: the next confirm answers 429 (Busy)
  .send(E.Pay({ paymentMethodId: "pm_card" }))
  .checkpoint("waiting")
  .advance("2 seconds")                                               // WAITING's schedule fires; a new Attempt is sent
  .checkpoint("charged")

test("busy then charged", async () => {
  const { waiting, charged } = (await busyThenCharged.run()).checkpoints
  expect(waiting.state).toBe(S.WAITING)
  expect(waiting.memory).toMatchObject({ busyTries: 1, retryInMs: 2000 })
  expect(charged.state).toBe(S.DONE)
  expect(charged.read(Stripe)).toMatchObject({ charges: [{ intentId: "pi_1", key: charged.attempt(O.pay, { n: 1 }) }] })   // the fake's truth, read
})
```

A fake server holds the truth, and a test reads it with `cp.read(fake)` (2.10.4, 2.10.6). Every ending is
produced through fakes and lifecycle steps (2.10.5): `unknown` by a dropped answer, `NotSent` by a cancel while the
Attempt's acknowledgement is held, by `reject`, or by a refused acknowledgement (`StorageRefused`).
`NotSent { why: "Overloaded" }` and record-queue order are reached by holding the head's request and sending enough
commits (2.10.8). (2.10.18.2's `busyThenPaid` checks the same run by its `ending` records.)

#### 2.7.12 Timing in the turn

| Moment | What happens |
| --- | --- |
| The starting turn, steps 2–3 | the author's guards, including `O.pay.idle(k?)` if written, decide whether the transition runs; Flow adds none (rule 16) |
| The starting turn, step 5 | input and key computed from the after memory (rule 22); each member's cell applied to the after lanes in action order (2.5 step 5): a commit declined (`Rejected`, `Overloaded`; nothing applied), minted (`InFlight`, waiting to be invoked), queued (`W`) or replacing a never-sent one (evidence `Superseded`); a domain write joins its record queues and predicts (rule 28) |
| The starting turn, step 6 | one publication: memory, the after lanes' rows and the store revision; declines queued as endings |
| After the turn | whatever the turn's outcome, each Attempt waiting to be invoked is invoked once its acknowledgement (once per Attempt), its record queues and, for a persisted re-send, its lane record's capture allow; from invocation a cancel means `unknown` |
| Settlement | the send is classified (2.7.1); rule 18 applied; for a domain write, store effects applied and record queues released, in one publication (rule 27); then the ending is queued in the FIFO mailbox; the lane is untouched; `pending` stays true |
| A Runtime step | an invocation (`retryCount` grows on a re-send), a storage refusal, an ending of an unbound lane (applied and parked, rule 44), a dispose: the cell applies at once and the changed rows publish without a turn (2.5) |
| A cancel | rule 24 |
| The ending's admission (step 1) | the Attempt's ending mapped (rule 18 was applied at settlement); its cell applied, which may promote the next queued commit, invoked after the turn; owner tested (rule 14); the lane removed when `Idle` |
| The event's turn, steps 2–6 | ordinary selection, rule 15 if late; after an unknown the lane is `Held`, so a `retry` here re-sends |
| A timer of a dead activation | discarded at admission (Machines O5) |
| Restore and rebind | a new incarnation adopts its identity's lanes and receives, before any external event, its parked endings, then per lane a held head's `unknown { Restored }` and, on a reload, `NotSent { Restored }` for never-acknowledged work (rule 44); an Attempt acknowledged once restores as `unknown { Restored }`; its predicted records are marked uncertain and repaired before readiness, and an unacknowledged one predicted nothing (rule 38); within the actor, each lane's deliveries go to the incarnation with its subject path, after any pending reset (rule 54) |

The reference implementation is the spike in [merged/server-calls/spike/](merged/server-calls/spike/) (`tsc -p .`,
then `bun stories.ts`), in the form before the operations merge: commit values, `Outcomes` and `Events` types, the lane, admission and routing, with Stories
that run the old and new rules on the same machine and fixture.

#### 2.7.13 The write lane

Rule 21 is normative; this is its table and what follows from it (decisions OD5–OD8, OD10, OD16, OD19–OD22, OD25;
citations as in 2.7's introduction).

**Lifetime.** Per kind (OD3):

| Lane | Lives | An ending after it is gone |
| --- | --- | --- |
| a write lane | from its first commit while it has outstanding work or a retained unknown | cannot happen: the lane outlives its work |
| a one-off read lane (proposed) | from the operation's first lookup until `cancel`, or the actor (in a fragment, the incarnation) ends; a freeze ends its lookup `Interrupted` (rule 52); it holds its entry until the next lookup or `cancel` (R4 M4) | a released lookup's settlement is evidence only (2.7.9) |
| a placement's session | its activation, or the trait incarnation (rule 52) | a released session's undelivered items are discarded with evidence (rule 70) |

- A row's **`progress`** follows Streams T8: `progress(p)` by the addressable Attempt publishes the row as a Runtime step, a superseded Attempt's is evidence, and a restore clears it.
- A lane's **status** changes **only in its binding incarnation's turns** (at a commit or lookup in step 5, OD16; at an
  ending's admission, step 1; at a `cancel`), **or in the Runtime's own steps for an unbound or unplaced lane or after a turn**
  (invocation, endings with no binding incarnation, dispose, Runtime disposal; OD19, OD20). No store event and no other
  actor touches it (R2 C-M3; R5 L7: status, not data). A
  one-off read row's data is the held entry's current confirmed data, so another actor's refetch changes the data,
  not the status.
- A write lane is the Runtime's (OD19): it outlives its binding incarnation, and a `reject` hold that passes the terminal
  check (5.1's LEFT) stays, persisted with its mark, until a binding incarnation resolves or releases it (R7 L7).
- A write's retained unknown stays until its retry succeeds or fails, or `cancel` releases it (decided, OD5); a newer
  commit no longer replaces it, except under `cancel` concurrency (2.7.13). While it stays it holds its lane, and the
  row's `uncertain` is true. Each is a real unresolved write the UI may show; there is no cap (R2 C-M3: a cap would
  hide one).
- **An inactive placement is `undefined`** (OPS O6, unchanged). Revision 2's `Inactive { data }` is removed (R2 C-M5:
  it kept data across different params). Continuity across params is OPS O6's `placeholder({ previous })`, which the
  author asks for explicitly.
- `DuplicatePlacement` (decided, OD17, Q14): one operation placed on two states that can be active together is a construction error unless
  state tokens in their `when` arrays make them exclusive (closures are not read, R10).

**Principles** (decided, OD5).

Revision 3 dropped the ending of a sent `latest` Attempt as if it had never been sent, and let a newer commit go out
while an older unknown was unresolved. Review 3 showed both produce silent wrong state (R3 K1: H1 the late landing,
H2 lost facts, H3 the wrong retry under `cancel`, M1 a second charge under `reject`). The principles (decided, OD5):

1. **A never-sent commit is replaceable**; the replaced one ends as evidence `Superseded` (`NotSent { why:
   "Superseded" }` for a domain write, rule 29) and no handler sees it.
2. **A sent Attempt's ending is always delivered**: success, failure and unknown, each mapped once (R3 H2), to a
   live incarnation of its identity or to that identity's saved record (OD21). **Exception, stated (G4):** a local
   actor's lanes are never persisted, so a write a local actor sent before a reload has no lane afterwards: its
   ending is not seen, **and its hold is lost**, so after the reload a newer write on that key can be sent past an
   unresolved one (lane model L1). The remedy is a persisted identity, or a version precondition (`basedOn` as
   `If-Match`).
3. **A retained unknown holds its lane** until `retry` resolves it or `cancel` releases it. **The hold is the
   default** (decided, OD6): no quiet release and no automatic retry (rule 25). A declared release on leave is not
   quiet (F9, rule 60).
4. **`cancel` acts on the same one Attempt as `retry`**; after it is released, the waiting commit is sent; `cancel`
   never silently drops a waiting commit (decided, OD7); a release on leave ends them as evidence (F9, rule 60).

Every other sentence about write lanes in this design is a reading of the table below.

**Owner** (decided, OD19; R7 H1, K17). **A write lane is owned by the Runtime, not by the actor**, as TanStack
Query's `MutationCache` owns mutations rather than the component that started them (`mutationObserver.ts:96-99`:
unsubscribing only removes the observer; `mutation.ts:155-162`: a mutation with no observers is not cancelled, and is
kept while pending). The live incarnation with the lane's subject path is its **binding incarnation** (the actor, for a
definition's operation; rule 53): it receives the lane's endings and its
members address the lane. Disposing that actor never drops or cancels the lane's sent, held or queued writes. The
Runtime keeps the lane, applies its endings to it (the table's lane effects and merge 4's store effects, which never
depended on the actor, rule 27), and invokes what the table promotes. **With no live actor incarnation** (decided, OD21; R9
K25, H1), an ending is applied to the lane by the Runtime; if the lane's identity has a saved actor record (a
persisted actor disposed by retain expiry, or awaiting reload), the ending, including `NotSent { Disposed }`, is also
**parked** for that identity and delivered once to its next incarnation, in saved order (Persistence O2, O4). With a live actor but no incarnation of the lane's path, the ending is parked
for that path instead (rule 53). It is
evidence only when no record of the identity survives (`disposeActor`, `forget`, a non-persisted or local identity).
A reload's `NotSent { Restored }` is **not** parked: it is produced by the restore itself and delivered as step 2 of
the delivery order below, once (lane model C3).
**A parked ending lives on its lane record, raw** (decided, OD22; R10 M3): the contract's outcome (decoded by its
`output` and error schemas, plus Flow's reasons), the Attempt, and the lane state after it; it is **mapped through the
current definition's `outcomes` at delivery**. A lane record holding only a parked ending counts as non-`Idle` until
delivered. So a release that changes the machine, or an actor record that no longer decodes, cannot lose it: the
same parked ending serves a restored record or a fresh incarnation. **Within a Runtime, an ensure restores from the
Runtime's copy** of the identity's records when one exists, not from storage (R10 M5); storage failure then affects
only a reload, where the last good capture is consistent.
**A lane's identity is (actor identity, contract id, key)** (decided, OD20; R8 K21, H1); for local actors this identity
is the adoption key, and while bound a lane belongs to its binding incarnation (R10 L4). The actor identity
is Runtime O3's ref (machine id, actor id) for a shared actor; for a local actor it is **defined here** (R9 K27, M1)
as (machine id, input by `Equal.equals`), so a remounted or revealed local actor with the same input adopts its
predecessor's lanes (fresh memory and state, as React O2 and O3 say, but not fresh write lanes). **A starting actor
(created, ensured or restored) adopts only the unbound lanes of its own identity**: d2's editor never takes d1's
lane, and checkout B never takes checkout A's. A new incarnation of an identity receives that identity's lanes,
whether it starts by rebind or by restore. A shared identity has one live actor. Two live local actors with equal
input have two lanes for one key, and their plain writes are unordered, as two tabs are (stated; domain writes are
ordered by merge 4's record queue); if both are disposed holding, a starting incarnation adopts the **oldest** orphan
for each (contract id, key), and the rest stay unbound, listed by Inspection. Stated limit: a local actor's input
must carry what identifies its writes; an input-free local machine (9.6's wizard) is one identity, so a fresh one
adopts the previous one's hold. Considered and not taken (R8): one lane per (contract id, key)
Runtime-wide, as TanStack's cache-wide `scope` is; it would let one actor's `retry` and `cancel` act on another's
Attempt. "Actor" in earlier sections reads as "binding incarnation"; an actor alive with no
incarnation of the path leaves the lane **unplaced**, and its endings are parked on the lane record whether or not
the identity persists (rule 53; 2.9.3). Amends Runtime O3 and V4 ("no outcome from an old
incarnation reaches a new one"): **a new incarnation of the same identity receives its write lanes**, a hold as
`unknown { Restored }` and the ending of an Attempt still on the wire.

**Lanes are Runtime records for persistence too** (decided, OD20; R8 H2). A capture includes every non-`Idle` lane
of a persisted identity, bound or unbound, under (actor identity, contract id, key); Persistence O6's acknowledgement
is per lane record and per Attempt, and needs no actor. An actor's saved record holds no lanes. Restore at ready, and
an ensure after retain expiry, bind the incarnation to the Runtime's one lane, never to a stale copy beside it.
`disposeActor` removes the actor's record and keeps its non-`Idle` lanes as unbound lanes; `forget` removes both. A local
actor's lanes are never persisted (Persistence O2). When an actor record no longer decodes but its lane records do
(they decode by the contract's `input` pick, independent of the machine), the fresh incarnation adopts them in its
initial leaf. Amends Persistence O2 ("pending writes follow their actor's identity"), O3 (a capture's contents) and O6
(acknowledgement per lane and Attempt).

**States.** A lane is in one of three states, each with an optional waiting part `W`:

| State | Meaning |
| --- | --- |
| `Idle` | no Attempt is unresolved, and `W` is empty; an `Idle` lane is not stored, and reads see the virtual idle lane, as `get` does (R8 L1) |
| `InFlight` | one Attempt (the **addressable Attempt**) is minted, promoted or re-sent: either **waiting to be invoked** (Persistence O6's acknowledgement, **once per Attempt**: a re-send of an acknowledged Attempt needs no new one, OD20 F2, but a persisted lane's re-send waits for the lane record's capture, R9 M3; merge 4's record queue; or the turn's end) or **on the wire** |
| `Held` | the addressable Attempt's last ending was unknown, and it is not on the wire: a retained unknown |

`W` holds the **queued commits** behind the addressable Attempt (OD16): none under `reject`; at most one under
`latest`; a FIFO of at most 64 under `serialize` (OPS O3). `Idle` never has `W`. An Attempt also remembers whether it
**was ever sent**: a re-send waiting to be invoked was sent before (R7 K18).

**When cells apply** (decided, OD16; R6 K13; R7 L1). A turn computes **after lanes** the way 2.5 computes after
memory: in step 5, after the selects, the turn's members are applied to each lane **in action order**, using the
table. Selects and guards read the pre-turn lanes with the turn's own ending admitted (rule 22); `keys`, `when`,
activity inputs and the published rows read the after lanes. **Promotion**: whenever the addressable Attempt is
**resolved** (success, failure) **or released** (`cancel`), `W`'s head becomes the addressable Attempt, `InFlight`
and waiting to be invoked; an unknown, a retry and a restore never promote (R7 M1). In particular, a restore that
ends a never-acknowledged head `NotSent { Restored }` promotes nothing: its `W` entries end the same way, so the lane
becomes `Idle` (G5).

**Invocation is its own step** (proposed; R7 K18, H3). Every Attempt minted, promoted or re-sent is invoked **after
its turn ends, whatever the turn's outcome**: an ending admitted in a turn that is then `Denied`, `Unhandled` or
`InvalidTurn` keeps its lane effects (the ending's cell and any promotion), publishes the after lanes, and invokes the
promoted Attempt; only the turn's own members are dropped with the turn. An Attempt is then invoked when Persistence
O6's acknowledgement (once per Attempt, OD20) and its merge 4 record queues allow, and, for a re-send of a persisted
lane, when the lane record's capture of the re-send is written (not a new acknowledgement: restore still reads
"acknowledged once", R9 M3), which may be many turns later; until then it is waiting to be invoked. Before, 2.7.12 invoked a waiting start at settlement; this keeps that independence from the turn.

**Flags, as functions of the state** (decided, OD10; R5 K10). Each is true in exactly one condition:

| Flag | True when | Mark |
| --- | --- | --- |
| `pending` | `InFlight` (waiting to be invoked or on the wire) | NEW MEANING against rule 21, which counted a waiting `latest` start as pending |
| `uncertain` | `Held` | M4's word, for this lane; false during a re-send, so a keyed schedule over `uncertain` re-arms on every unknown (5.3) |
| `waiting` | `W` is not empty | independent of the other two |
| `outstanding` | the number of unresolved commits other than the addressable Attempt: `W` under `serialize`, every Attempt under `allow` (which has no addressable Attempt) | MD's word (R6 L4), one meaning on both rows |
| `retryCount` | the addressable Attempt's **invoked** re-sends; 0 in `Idle` | counted at the invoked cell, not at `retry` (R8 M1), so a re-send that never left uses no budget; kept across rebinds and persisted |

A view that wants "not confirmed" to stay on during a re-send reads `uncertain || retryCount > 0`.

**Transitions** for a lane under `reject`, `latest` or `serialize`, the three policies that hold (cells decided,
OD19: Q28 A). "Delivered" is a mapped event to the binding incarnation in a later turn, parked if the actor is alive without one
(rule 53), or evidence if there is none; 2.9.3 adds the fragment rows (subject path, another path, freeze, thaw,
release);
"→ promote" is defined above.

| Row | `Idle` | `InFlight` | `Held` |
| --- | --- | --- | --- |
| **`commit`** | mint an Attempt → `InFlight` | `reject`: ends `NotSent { Rejected }`, delivered, state unchanged; `latest`: becomes `W`, a previous `W` ends `Superseded` (evidence), **and an addressable Attempt never sent and not yet invoked is replaced too**: it ends `Superseded` and **the new commit becomes the addressable Attempt**, waiting to be invoked (OD20 F4; R7 L3); `serialize`: appended to `W`, past 64 `NotSent { Overloaded }` | as `InFlight`: the hold refuses (`reject`) or queues (`latest`, `serialize`); nothing is sent |
| **`retry`** | evidence `NothingToResend` | evidence `InFlight`, no re-send | re-send the addressable Attempt with its id and input (rule 31) → `InFlight` (waiting to be invoked) |
| **`cancel`** | nothing | on the wire: interrupt it; the lane stays `InFlight` until the interrupt's ending is admitted, `unknown { Cancelled }` (→ `Held`) or the real ending if it had already settled (R6 L1). Waiting to be invoked, **by history** (R7 H2): never sent → it ends `NotSent { Cancelled }`, delivered (rule 24) → promote; a re-send → it returns to `Held` and is released (`Released`, the record's mark kept, its record-queue entry withdrawn so it is never invoked, R8 L2) → promote | release the addressable Attempt (`Released`) → promote, or `Idle` |
| **`idle`** (guard) | passes | denies `InFlight` | denies `Uncertain` |
| **`retryable({ times })`** (guard) | denies `NothingToResend` | denies `InFlight` | passes if `retryCount < times`, else denies `RetryLimit { retryCount }` |
| **invoked** (Runtime) | cannot occur | waiting → on the wire, once every wait is met: the Attempt's one acknowledgement (a first send), its record queues, and, **for a re-send of a persisted lane, the lane record's capture of the re-send** (R9 M3; lane model C2; a failed capture is the storage-refused row); a re-send adds 1 to `retryCount` here | cannot occur |
| **storage refused** (before invocation; R7 L9) | cannot occur | never sent (its Attempt's one acknowledgement fails): ends `NotSent { StorageRefused }` (Persistence O6's `StorageFailure` evidence), delivered → promote. A re-send (its Attempt was acknowledged once, so it waits for no new acknowledgement; refused only when the lane record's capture fails before invocation): returns to `Held`, and **the operation's mapped `unknown` event is delivered again, with reason `StorageRefused`**, so a handler runs (OD20 F5; R8 M1) | cannot occur |
| **success** | cannot occur | delivered → promote, or `Idle` | cannot occur |
| **failure** | cannot occur | delivered → promote, or `Idle`; the failed Attempt is resolved, so a later `retry` is `NothingToResend` (amends rule 19) | cannot occur |
| **unknown** (incl. `StillUnknown`) | cannot occur | delivered → `Held` | cannot occur |
| **interrupt** (adapter, or after a `cancel`) | cannot occur | delivered as `unknown` → `Held` | cannot occur |
| **dispose** (the binding incarnation ends: the actor is disposed, or the incarnation with the lane's path ends; cells unchanged except the parking row, 2.9.3; R7 K17) | nothing (virtual idle lane) | unchanged: the Attempt stays waiting or on the wire, and the Runtime invokes it; its ending is applied, and is a pending mapped outcome of the identity's saved record if one exists, else evidence (OD21). An acknowledged re-send still waiting for its lane record's capture is unchanged: the Runtime owns the lane (OD19), so it captures it later and then invokes it (decided, OD25; lane model C8) | unchanged; the hold and `W` stay in the Runtime |
| **rebind** (an incarnation of **the same identity** starts and adopts the lane, OD20) | cannot occur (no lane) | unchanged; the new incarnation receives the ending when it lands | the hold is delivered **exactly once**, as `unknown { Restored }`, routed by the owner test below (OD20 F3, OD21, OD22), `retryCount` kept, unless that Attempt's outcome is already parked (G3; R10 L1); `W` stays queued |
| **restore** (Persistence O6) | nothing (virtual idle lane) | an Attempt acknowledged once (per Attempt, OD20 F2) restores as `unknown { Restored }`, delivered → `Held`, even if its current re-send was waiting, and even if it was acknowledged but never invoked: the Runtime cannot know whether invocation began before the crash (G1), so `retry` may be its first send, which the idempotency key makes safe; one never acknowledged ends `NotSent { Restored }`; each `W` entry ends `NotSent { Restored }`, delivered (C2); if a saved pending outcome exists for this Attempt, that outcome is delivered instead, once (G3) | stays `Held`, and the hold is delivered **exactly once**, as `unknown { Restored }`, from the restored incarnation's saved leaf (OD20 F3, OD21), unless the hold's own unknown is already among the record's pending outcomes (G3); `W` as in `InFlight` |
| **Runtime disposal** (OD20, K23; R8 M2; R9 H2) | nothing (virtual idle lane) | from its start nothing is invoked. Waiting, never sent: ends `NotSent { Disposed }`; predictions removed (rule 30); **for a persisted identity it is saved with the final capture as a pending mapped outcome and delivered to the restored incarnation** (OD21), else evidence. Waiting re-send: → `Held`. On the wire: Runtime O6 (settles within its bound, else unknown); an ending that settles before the final capture is saved as a pending mapped outcome (Persistence O3). Each `W` entry ends `NotSent { Disposed }` when the head's ending is admitted, or when Runtime O6's bound ends, so a lane's parked endings keep lane order (R10 M4). If the final capture fails, the last good capture's lane record restores per the restore row, which is also safe | stays `Held`; captured if the identity persists, else gone with the Runtime (evidence); each `W` entry as in `InFlight` |
| **SSR hydration** (OD20, K23; R8 M3) | lanes are never hydrated from the server; only resource entries are. A commit in flight at dehydration is reported (`DehydrateCommitInFlight`, ServerRendering O3, naming the actor, its state and, for a fragment's operation, its instance path) and is evidence; no client lane is created. The transferred actor receives no ending for it: a state that waits for one waits until its own timers or the user move it, and a later client write to that key is unordered with the server's (stated limit, R9 M4) | cannot occur (no client lane exists before hydration) | cannot occur |

That is 16 rows by 3 states, 48 cells; 15 are "cannot occur" (an ending, an invocation or a storage refusal only
exists for an Attempt that is `InFlight`; a rebind needs a lane; hydration creates none), and 33 are reachable, of
which 4 change no lane (dispose, restore, Runtime disposal, hydration in `Idle`; hydration's reports evidence, R9 L5). The
two "cannot occur" hydration cells are untestable by construction (G6, stated). `unknown`
and `interrupt` have the same effect; they stay two rows because their causes differ. `StillUnknown` is rule 18's
name for a re-send's failure, which is treated as unknown. **An ending admitted in a `Denied` or `Unhandled` turn
counts as delivered** (OD20 F8): its lane effect is kept, and it is not delivered again. An ending of an Attempt
that is not the addressable one (under `cancel` concurrency, an interrupted older Attempt) is evidence, routed by
Attempt id, never read against the `unknown` in `InFlight` cell (R7 L8). Every cell names one address and one next
state.

**What a new incarnation receives, from where, and when** (decided, OD19, OD20, OD21; R9 K26, H3, L3). **One owner
test**, whenever an ending lands, parked or not (R10 M2): at admission, test the Attempt's owner activation against
this incarnation's activations, restored ones included. Alive: the ending is current (rule 14). An activation of this
incarnation that has ended: late (rule 14). Never an activation of this incarnation (a rebind, or a lane adopted
before the saved record): current, from the **active leaf**. Every `unknown { Restored }` is current from the active
leaf. A restored record resumes in its saved leaf (Persistence O4). Amends rule 14 and C17. The deliveries are several turns, in this order, before any external event:

1. the parked endings, in saved order (Persistence O4), each mapped through the current `outcomes` (OD22);
2. per lane, in creation order: the head's `unknown { Restored }` if the lane is `Held` (once; not if that Attempt's
   outcome was parked, G3), or its `NotSent { Restored }` if it was never acknowledged (reload only), then, on a
   reload only, each `W` entry's `NotSent { Restored }` (C2; R10 L2);
3. an `InFlight` lane delivers nothing now; its ending is delivered, current, when it lands.

For a fragment's operation the same order applies per subject path, as follow-up turns after the starting turn (its
own raises first) and any pending reset, before any later event (rule 54).

On a rebind (no reload) `W` stays queued in order. An unbound lane that no incarnation of its identity adopts keeps its
hold, its queued commits and its record's mark until the Runtime ends (or, persisted, until a reload); Inspection
lists it (R8 M4, stated limit). React's pre-attach send buffer flushes after steps 1 and 2, so "before any
external event" holds when a component sends on mount (R10 M6). A host's `beforeunload` reads unsettled writes with `runtime.unsettledWrites()`, the non-`Idle` lanes by identity
(decided, OD23 Q40). Runtime observers see evidence endings, as TanStack's `MutationCache` global callbacks
see every settlement (`mutationCache.ts:19-45`, `mutation.ts:238-300`).

**Key-less members in an ending** (decided, OD8; R5 K9; R6 M1): a key-less `retry`, `retryable` or `cancel` in a
handler of an event its operation alone maps names **that ending's own Attempt; once that Attempt is resolved or
released, it names the lane's addressable one**. So `[O.x.cancel, O.x.cancel]` in an unknown's handler releases the
ending's Attempt (→ promote) and then ends the promoted, not yet invoked commit with `NotSent { Cancelled }`. In a
**success or failure** handler of a keyed operation, the ending's Attempt is already resolved, so a key-less `cancel`
there ends the commit that admission just promoted (R7 L2). In a `NotSent` ending there is no Attempt (rule 16),
so a key-less member does nothing. The "then the lane's addressable one" step applies to the three holding policies
only (R7 M2). On `serialize`, key-less `retry`, `retryable` and `cancel` stand only in a handler of the head's own
ending; per-item stops use a keyed design (decided, OD19: Q35 A; narrows OD8 for one policy).

Documented default, not a rule (R6 L6): re-send an unknown on a timer (5.1's `UNSURE`, 5.3's reconcile), not in the
unknown's own handler; offline, an immediate 3-send budget is spent in milliseconds.

**The two policies that do not hold** (decided, OD19; R6 M3, R7 M2). Under `cancel` concurrency at most one Attempt
is live; an unknown is held only for its own ending's turn (**`HeldThisTurn`**, a table label):

| Row | `Idle` | `InFlight` | `HeldThisTurn` |
| --- | --- | --- | --- |
| **`commit`** | mint → `InFlight` | on the wire: interrupt it (its ending is evidence by Attempt id), mint → `InFlight`; waiting to be invoked, never sent: it ends `Superseded` (evidence), mint; a waiting re-send: it becomes evidence (released), mint (OD20 F6) | mint → `InFlight`; the held one becomes evidence |
| **`retry`** | `NothingToResend` | evidence `InFlight` | re-send, same id → `InFlight` |
| **`cancel`** | nothing | as the holding table (by history before invocation) | release (`Released`) → `Idle` |
| **`idle`**, **`retryable`** | as the holding table's `Idle` | as its `InFlight` | as its `Held` |
| **success**, **failure** | cannot occur | delivered → `Idle` | cannot occur |
| **unknown**, **interrupt** | cannot occur | delivered → `HeldThisTurn`; with no live actor and a persisted identity: parked, and the lane is **`Held` (parked)** between turns until delivery (OD25, C5) | cannot occur |
| **turn end** | | | → `Idle`; the unknown is evidence |
| **invoked** | cannot occur | waiting → on the wire | cannot occur |
| **storage refused** | cannot occur | never sent: `NotSent { StorageRefused }`, delivered → `Idle`; a re-send: delivered as `unknown { StorageRefused }` → `HeldThisTurn` (OD20 F5; R9 L4) | cannot occur |
| **dispose** | nothing | unchanged; the Runtime invokes it; its ending is a pending outcome of the saved record if one exists, else evidence (OD21) | cannot outlast its turn |
| **rebind** | cannot occur | unchanged; the new incarnation receives the ending, current | cannot occur |
| **restore** | nothing | acknowledged: delivered as `unknown { Restored }` → `HeldThisTurn` in its delivery turn (R10 L3); never acknowledged: `NotSent { Restored }`, delivered (R9 L4) | cannot occur |
| **Runtime disposal** | nothing | from its start nothing is invoked; a waiting, never-sent Attempt ends `NotSent { Disposed }`. An Attempt on the wire follows Runtime O6 (it settles within the bound, or not). For a persisted identity, `NotSent { Disposed }` and an ending that settles before the final capture are parked (OD21, OD22); a waiting re-send, or an Attempt still on the wire at the final capture, is captured as an acknowledged `InFlight` lane record, so a reload uses this table's restore cell (`unknown { Restored }` → `HeldThisTurn`, where a key-less `retry` re-sends the same id). Otherwise they are evidence. The live lane ends `Idle`: nothing is held past a turn (G2; R10 H2, K30). `allow` follows this per Attempt | cannot occur |
| **SSR hydration** | as the holding table | cannot occur | cannot occur |

**The between-turns state for a persisted identity** (decided, OD25; lane model C5, inv 18). Under `cancel` and
`allow`, an `unknown` that lands while a persisted identity has no live actor is parked, and its lane stays
**`Held` (parked)** between turns until the parked ending is delivered, so the Attempt is still addressable when the
handler runs. `HeldThisTurn` starts at delivery, not at admission:

| Row | `Held` (parked; persisted identity, no live actor) |
| --- | --- |
| **Flags** | as `Held`: `pending` false, `uncertain` true. `cancel` and `allow` rows have no `uncertain` field, so the flag is read where lanes are listed by identity (Inspection, `runtime.unsettledWrites()`) and by `idle`, which denies `Uncertain`; the delivering turn publishes `HeldThisTurn`'s row (decided by the main session; lane model N1) |
| **delivery** (ensure, rebind or restore of the identity) | the parked `unknown` is delivered, current, from the active leaf (OD21) → `HeldThisTurn` for the delivering turn |
| **`retry`**, **`cancel`** in the delivering turn | as `HeldThisTurn`: re-send the same id → `InFlight`; or release (`Released`) → `Idle` |
| **turn end** of the delivering turn | → `Idle`; the unknown is evidence |
| **`commit`**, endings, **invoked**, **storage refused** | cannot occur (no live actor; nothing on the wire) |
| **restore** | stays `Held` (parked); delivered in the restored incarnation's delivery turn |
| **Runtime disposal** | captured with the lane record if the identity persists, else evidence |
| **dispose**, **rebind** without a record, **SSR hydration** | cannot occur |

In a live actor, a lane with no incarnation of its path parks the same way (rule 53); "no live actor" reads "no
binding incarnation" (2.9.3).

Under **`allow`** (OD20 F9), a lane is a set of independent Attempts, each following the `cancel` table's rows for
itself, including invoked, storage refused, dispose, rebind and restore; its state is a count (`outstanding`), `pending` is
`outstanding > 0`, and each Attempt has its own `HeldThisTurn` for its own ending's turn. `retry` and `cancel` exist
only key-less in an ending's own handler (N2 stands elsewhere); the "then the lane's addressable one" step does not
apply. Rows: `{ pending, retryCount, progress? }` under `cancel`, `{ pending, outstanding }` under `allow`; no
`uncertain` or `waiting` (R6 L4).

**Per concurrency policy** (decided, OD19):

| Policy | Holds | `W` | Addressable Attempt | Notes |
| --- | --- | --- | --- | --- |
| `reject` | yes | none | the one minted Attempt | a commit while `InFlight` or `Held` ends `NotSent { Rejected }` |
| `latest` | yes | one queued commit | the one minted Attempt | a commit replaces `W`, and a never-sent head not yet invoked |
| `serialize` | yes | queued commits, FIFO ≤ 64 | the head | amends N2 and C18 (`retry`, `retryable`, `retryCount` on the head); key-less members only in the head's own ending (Q35 A); "drop the queue" and per-item stops have no member ([open-items.md](../../proposals/open-items.md); a keyed design) |
| `cancel` | no | none | the one minted Attempt, for its own ending's turn | `HeldThisTurn` |
| `allow` | no | none | per Attempt, in its own ending's turn | a count; `HeldThisTurn` per Attempt |

Stated limit (R7 L6): no case in sections 5, 8 and 9 uses `cancel`, `allow` or `serialize`; their rows are exercised
only by review sketches (`ops-review-6/8-upload-queue-r7.ts` for `serialize`) and must be in Flow's policy suite.

**One name per distinct thing** (decided, OD16; R6 K15):

- **Queued commits** of a lane are `W`, counted by `outstanding` (`serialize`) or shown by `waiting`.
- **A record's mark and a lane's `uncertain`** are two things: `Issue.get(s, k).uncertain` is the store's mark (M4);
  `O.like.get(s, k).uncertain` is this lane holding an unknown. When the mark clears is **the record queue's** fact,
  not the lane's (R7 K20, below).
- **"The user stopped it" and "the connection dropped"** are both `unknown`, with different tags: `Cancelled` is
  Flow's tag after `cancel`; transport failures carry the contract's own tags. They may map to different events:
  `unknown` takes a record by tag, as `failure` does (decided, OD23 Q36), so a "stopped" handler releases and a
  "dropped" one re-sends. The record is exhaustive over the contract's unknown tags; Flow's reasons (`Cancelled`,
  `Restored`, `Interrupted`, `Defect`, `StillUnknown`, `StorageRefused`) are optional in the type and required by
  `flow check` where they can occur, as `NotSent` is (rule 20) and as a read's `Defect` and `Interrupted` are (rule 37);
  `Restored`, `Interrupted` and `Defect` can always occur on a holding write. Every target is a `Flow.uncertain` event.

Consequence worth stating: a user's "Retry" in `Idle` gives no ending, so a UI must not wait for one (9.3's
`RetrySave`).

**Stories and tests.** A Story reaches the cells its machine's transitions allow: `commit`, `retry`, `cancel` by
sending the user events that hold them; endings by the fakes' answers (an unbound lane's ending is its held request's
answer: the wire does not care who is bound, 2.10.5); dispose and rebind by `dispose` and another `ensure` of the same
identity in the same Runtime; restore with `reload` (2.10.10). **A policy suite in Flow's own tests** covers all 33
reachable cells per holding policy, the storage refusal, Runtime disposal and the unacknowledged-restore cell, driving
the real Runtime under the TestClock (R6 L2); an app Story may reach any cell its machine allows, the storage and
restore cells through `Fake.storage` and `reload`, and only Runtime disposal is the suite's alone (`disposeRuntime`,
Stories T2; 2.10.15). The executable lane model (in
the operations record) is a design check, not that suite: running the suite on it would be the second execution path
T1 removed. Walks kept as Stories: 8.2's force save, 5.3's three
re-sends offline, 8.2's `CloseAnyway` then unmount (R7 H1), 9.3's `Saved` denied (R7 H3), and sketch 10's walk E
(R7 H2), plus a rebind into a leaf with no handler (R8 H3), "retain expiry, the unbound lane's write succeeds,
ensure: the restored state receives the ending" (R9 H1), "an adopted Attempt ends unknown in a leaf other than the
initial one" (R9 H3), and "an adopted Attempt succeeds in the new incarnation's initial leaf" (R10 H1). **A clean
Runtime shutdown with queued work (R9 H2) is a policy-suite test**, not an app Story: Testing O7's `closeTab` ends a
tab abruptly (R10 M6; decided, OD23 Q41). The lane model's next run adds two
invariants: every ending of a persisted identity reaches an incarnation of it or a fresh start (including under
`cancel` and `allow` with Runtime disposal, and with an actor record that fails to decode), and arrival in a
non-initial leaf.

**Limits, stated** (decided, OD19; R4 K8, R5 K12). **The hold orders one lane, not the actor.**

- **One writer per scope** (stated, R10 L5). Lane records and parked endings assume one writer per persistence scope
  (Persistence O7); a `KeyValueStore` shared across devices is outside this design: re-sends would dedupe by
  `attempt.id`, but deliveries and UI effects would not.
- **The idempotency window** (stated, R9 M5). A re-send is safe only within the server's idempotency window (Stripe
  keeps keys for 24 hours). A hold adopted or restored later re-sends what is, to such a server, a new write;
  contracts that can outlive their window send a version precondition (`basedOn` as `If-Match`), as for a released
  Attempt, or the handler settles the unknown by a read (5.1) rather than a re-send. An age bound on adopted holds
  would be public API and is not proposed.
- **Across operations and keys.** Two lanes are unordered, even in one actor. In review 5's wizard (9.6), PROFILE's
  save can be held while `submit`, another operation, is sent; the server then finalizes the old profile. The author
  must guard the dependent write on the other lanes. An aggregate guard is `idle` over a partial key, `O.save.idle(({ memory }) => ({ draftId: memory.draftId }))`,
  passing only when every existing lane it matches is `Idle` (decided, OD23 Q34).
- **Across actors, through a record queue** (stated limit; decided by the main session under OD19). A commit queued
  behind a held lane (`W`) joins its records' queues at commit (rules 28, 29), so it can head record r's queue while its
  lane cannot promote it: every other actor's write to r then waits as long as the hold lasts, for an unbound lane
  until an incarnation of its identity returns or the Runtime ends. The order is kept on purpose: it is the
  cross-actor ordering of rule 29, and letting a later write pass an earlier commit would bring back a late landing
  across actors (TanStack Query's `scope` blocks the same way). Inspection lists the unbound lane that blocks.
- **Across Runtimes** (decided, OD19: Q31 A). Two tabs are two Runtimes (Persistence O7): tab 1's "A" is held, tab
  2 saves "X", and an hour later tab 1's retry applies "A" over "X" if the original never reached the server. Flow
  cannot order writers it does not see; cross-Runtime ordering is the server's (a version precondition, rebased as
  below) or a shared actor's. Within one Runtime, two actors' writes to one record are ordered by merge 4's record
  queue; two lanes with no shared record are unordered (the previous bullet).
- **`basedOn` and `If-Match`** (decided, OD19: Q32 A). A queued commit's input is fixed when it is committed (rule
  22), so its `basedOn` is rebased **along the record queue** (above, merge 4): it takes the version returned by the
  write ahead of it in the record's queue if that write's committed base equals its own, transitively, across lanes
  and actors in the Runtime. Computing `basedOn` at send time (revision 6) would make `If-Match` pass against a
  version the user never saw. Plain transactions get no rebase.
- **Work over a dynamic set of keys in one turn** (R6 M9) cannot be written: an action list holds a fixed number of
  members, and `commit`, `retry` and `cancel` have no per-key form (archive selected threads, flush N held notes on
  reconnect, retry all unsure, cancel all uploads). The pattern is a bulk contract: one request over the set, one
  `serialize` lane (review 6's sketch 9, `archived: boolean` with Undo queued behind it). Per-key fan-out of write
  members goes to [open-items.md](../../proposals/open-items.md) with these four cases; no word now.
- **Independent work one at a time.** Under unkeyed `serialize`, one unknown holds every later write (photo 3 holds
  photos 4–20); `allow` neither throttles nor holds. A throttle of independent writes is a memory queue in the
  machine (commit the next file on `Uploaded`). Stated as a cut, for [open-items.md](../../proposals/open-items.md) (R4 M6).

**Prior art.** RxJS uses `concatMap` (queue, never drop sent work) rather than `switchMap` (cancel the previous) for
writes, because switching drops results the server already acted on. TanStack Query's mutation `scope` runs
mutations with the same scope id in order, one at a time. Replicache and Firestore keep an ordered queue of pending
writes per client and replay them in order until the server confirms each. Stripe's guidance for an unknown result is
to retry the same request with the same idempotency key until the outcome is known, never to send a new one. HTTP's
`If-Match` (RFC 9110 conditional requests) adds a version check on top, for servers that need to refuse stale writes
on their own.

#### 2.7.14 Every hold has an owner: `UnresolvedHold`

Rule 45 is normative; this is its specification.

For a write operation X on `reject`, `latest` or `serialize`:

1. If X maps anything but not `unknown`, that is `UnresolvedHold` (error): the table reaches `Held` with no handler.
   This replaces revision 6's separate `UnmappedUnknown`. A bare X never holds (rule 40).
2. Otherwise let U be each event X's `unknown` maps (one, or one per tag). Take every **arrival**: each leaf where any of them can arrive (its owner by
   rule 14; ancestors for late endings; any leaf a storage-refused re-send can deliver to, OD20 F5); and **every leaf a
   new incarnation can be in while X's lane is unresolved** (decided, OD21; R9 K26, H3): the initial leaf and every
   leaf reachable from it (rebind), and every leaf reachable from a transition holding `X.commit` or from an arrival
   branch's target (a restored record resumes in its saved leaf), where the search **stops at** a transition guarded
   by `X.idle`, a transition that handles U, and a transition holding `X.retry` or `X.cancel` **only on a path where
   the hold already exists when it runs** (it is in a handler of U, or guarded by `X.retryable`); elsewhere a `retry`
   or `cancel` can fire as a declined no-op while the lane is `InFlight` or `Idle`, so the search continues to where
   the hold can arrive (decided, OD25; lane model C7, inv 15b; R10 M1). An `X.idle`-guarded commit counts as a
   reachable commit for `reject`'s terminal pass and never owns a hold (decided, OD25; lane model C6, inv 15a:
   revision 12's exemption hid stuck `reject` machines). The same set is rule 20's arrival set for X's other mapped events (OD22). For each arrival, take each **branch that keeps the hold**: a branch of U's handler with
   neither `X.retry` nor `X.cancel`, or with only an `X.retry` behind `X.retryable` whose fallback keeps the hold (R9
   L2). Two implicit branches keep the hold, with the arrival leaf as their target: **"declined"**, when every
   alternative of U's handler there has a guard (R7 M7), and **"unhandled"**, when neither that leaf nor any ancestor
   handles U (decided, OD20; R8 H3, K22). From each such branch's target, search
   the state graph by state tokens:
   - **pass under `reject` only** if no transition holding `X.commit` is reachable (5.1's `LEFT`; R5 M1 false
     positive). Under `latest` and `serialize` a queued commit may already be in `W` when the hold starts, so an
     owner is always required (decided, OD16: the check sees commits already waiting; R6 H3, K14);
   - **pass** if a non-ending transition holding `X.retry(k)` or `X.cancel(k)` is reachable **without passing a
     transition guarded by `X.idle`**, which the table says denies `Uncertain` while `Held` (R5 M1 false negative),
     and, **for every owner, not only U's branches**, an owner guarded by `X.retryable` counts only if the same event
     has a later alternative that reaches an owner (R6 M2);
   - else **error** if no such member exists in the definition, **warning** if one exists but is unreachable.

   For a fragment's operation the arrivals are inside the fragment (a trait: its own `on`; rule 55).
3. Closures are over-approximated (any closure guard may pass); Flow's own token guards are not: `X.idle` blocks,
   `X.retryable` blocks once its budget is spent. A `cancel(k)` on a keyed X counts for any key (the key is a
   closure), which is stated as inherent. Also inherent, stated (R6): a closure guard that reads
   `O.x.get(operations, k).uncertain` is `idle` written by hand and is not seen as blocking (false negative); an owner
   path through `X.idle(k)` for a different key is treated as blocked (rare false positive); an owner reached only
   through a schedule whose `keys` closure never includes the lane is counted (false negative).
4. **Disposal and reload** (decided, OD19, OD20). A host that disposes the actor, or a reload, does not end a hold:
   the lane stays with the Runtime (or its persisted lane record), and the next incarnation **of the same identity**
   receives it exactly once, as `unknown { Restored }`, current, from its active leaf (OD20 F3, OD21; for a fragment's operation, the incarnation with the lane's path, rules
   53, 54). So the check needs no
   host knowledge; rule 2's new-incarnation arrivals are what make a new incarnation an owner, and their "unhandled"
   branch makes a missing handler an error. Stated limit: if no incarnation of that identity starts again, the hold lasts
   until the Runtime ends (or, persisted, until a reload); Inspection lists it. The executable model's 6b audit
   (`lane-model/RESULTS.md`) found the two missed entries into `Held`, a refused re-send and a reloaded hold; both now
   deliver U (OD20 F3, OD20 F5), so both are arrivals.
5. **At the host** (rule 56), for every holding write operation of a fragment that does not release on leave: on a node
   or `.resumable()` placement, every host transition that can end or freeze the incarnation is an arrival, passing if
   a transition that starts the placement again is reachable, warning otherwise; on `.each`, a host transition that
   writes the `.each` field with no `Fragment.O.x.idle` token in its guard is a warning (reading lanes in
   `updateMemory` is not a token); on `resetOn`, the documented default is a `Fragment.O.x.idle` guard on the
   transition that changes the reset value.

On 5.2 as revision 5 wrote it (no `cancel` in `CodeUnchecked`), revision 6's spec passed, because `Submit` →
VERIFYING was reachable; with rule 2's `idle` refinement, `Submit` is guarded by `O.verify.idle` and is blocked, so
the hold is an error, which is exactly review 4's H1 deadlock. On 5.1, `Leave` → `LEFT` now passes (no `pay` commit
is reachable from LEFT, and `pay` is `reject`, so nothing can be queued), where revision 6 warned. On 8.2 as
revision 7 wrote it, `CloseAnyway` during an outage left "ABC" queued behind a hold CLOSED could not end, and the
check passed; now it is an error, and 8.2's CLOSED releases (8.2, revision 8 walk). With OD19, the page that
unmounts the editor on CLOSED no longer loses "ABC": the lane is the Runtime's (8.2, revision 9 walk).

What this replaces and removes: revision 3's `Superseded` for sent Attempts; "a newer commit releases a retained
unknown"; and, still, the `superseded` mapper flag, revision 2's `superseded:` key and every
`event.superseded || deny("Latest")` guard. The `Superseded` evidence kind stays, for never-sent commits.

**The late-landing race is gone** for any contract that sends `attempt.id` as an idempotency key: nothing newer is
sent while an older write is unknown, and the only re-send of it carries its own id, so the server answers what it
did, and a late copy of the first request is a no-op there (8.2 shows the steps). What is left is stated: a write the
machine **releases** with `cancel` may still land later, unseen, even after a newer write (decided as a stated limit,
OD20 F1: the executable model's invariant 3, "the server ends at the latest eligible commit", holds in every other
sequence; its shortest counterexample is commit, unknown, cancel, commit, the newer lands, the released one lands);
the remedy is a version precondition, `basedOn` sent as `If-Match`; and a server that ignores idempotency keys cannot be
fenced by any client ordering. For those, a version precondition is an optional layer on top (see the limits below): the contract sends
`basedOn` as `If-Match` and maps `412` to a failure. It is a contract-level choice, not a replacement for the hold
(OD5).

#### 2.7.15 Lane persistence, restore and hydration

Rule 46 is normative. Per kind (OD3):

- **A write lane** is a Runtime record (decided, OD17 Q12, OD20), stored under **(actor identity, contract id, key)**,
  bound or unbound, with its Attempts, each with its `retryCount` and whether it was acknowledged (R2 C-M1), and, for a fragment's operation, the creating
  incarnation's subject path and the releasing mark (rule 46). It is
  not inside the actor's saved record; restore and ensure bind the incarnation to the one lane record (2.7.13, "Lanes
  are Runtime records"). The key decodes with `input`'s pick (OD4; closes R3 M5). A restored unknown holds its lane
  again (OD5), so a reload cannot send a newer write ahead of it; the flags are derived, not stored. The table's
  restore row is the whole rule: an Attempt acknowledged once is delivered as `unknown { Restored }`; a `Held` lane's
  hold is delivered **exactly once**, as `unknown { Restored }`, from its saved leaf, in delivery order (2.7.13; OD20 F3;
  R10 L3).
  Revision 9's "not delivered again" (R5 L6) is removed: a reload is a new incarnation, whose handlers have not seen
  the hold. 8.2's first `SaveUnsure` branch therefore re-sends once after a reload, within its budget, which
  `retryCount` keeps. A persisted waiting commit was never sent, so restore does not replay it; it ends
  `NotSent { why: "Restored" }` (C2, R4 L1), and an autosave that should re-send it re-arms on that ending (8.2).
- **A live placement** re-opens from its restored `input`: a `latest` feed restores `last` and its baseline, and an `every` feed restores its bookmark with the slice (rule 71, Streams T9; OPS O4, Persistence O4).
- **A one-off read lane is not persisted.** OPS has no restore for finite lookups and the
  lane holds no workflow fact the server does not: on restore the row is `undefined` and nothing is delivered, so a
  state that was waiting for a lookup must look up again (5.1's `READING` does, on its next poll). **Decided (OD9,
  Q26).** The one exception is a fragment's lookup cut by a freeze: its `Interrupted` ending persists with the frozen
  slice (rule 52).
- A write lane whose contract no longer has an operation, or whose key no longer decodes under the contract's key
  Schema, goes to `orphaned` (P19). Changing a contract's key fields is therefore a persistence break, as changing
  an entity's `primaryKey` is.
- So renaming an operation (`pay` to `charge`) changes nothing persisted: R1's double charge cannot occur, with no
  alias. Revision 2's `.was`, the rebind ladder and `Rebound` are removed.

#### 2.7.16 Views, `check()`, Stories, `flow check`, `flow explain`

- Stories: `ending` records name `operation`, `contract`, the verb (`commit`, `lookup`, `subscribe`) and `key` (2.10.6);
  `Superseded` is an evidence kind, for a never-sent `latest` commit or a released lookup; `Released` (proposed) for
  an unknown `cancel` released. Endings come from fakes (rule 62), and `lane` records name their cell, so `flow stories
  --coverage` counts cells (2.10.14); a Story reaches the cells its
  machine's transitions allow, and all reachable cells belong to a policy suite in Flow's own tests (2.7.13). The
  walks listed in 2.7.13 are Stories by steps.
- `flow check`: errors `SharedContract` (per actor tree, F2; a warning for `key: []` on a placement whose path is not
  empty), `DuplicatePlacement`, `VerbMismatch` (2.7.3, proposed), `KeyRequired` (2.7.3,
  decided, OD8), `UnresolvedHold` (2.7.13, decided, OD6 and OD10, a check over the write-lane graph from tokens; a warning when only
  unreachable; it also covers a holding write that maps anything but `unknown`), a mapped event used as a schedule's
  `send`, a `raise` or a view's `send` (2.7.3, proposed); a contract without `key` (OD15; a type error first), a key
  field that is not a top-level `input` field; warning **`KeyOmitsInput`** (proposed, R7 K19): a resource's `input`
  has a field outside its `key`, which would alias cache entries (non-key input is read only when the entry opens,
  OPS O2); streams are exempt, since a session reads `input` once, at start (S11); a paged resource puts its page
  cursor in `key`, since each page is its own entry (R8 L4); warning `UnusedOperation`; info: bare writes. Field-list
  keys are data, so `flow check` and Inspection print every lane's key without running code (R10). Rule 20's `NotSent`
  requirement is read per operation, and per placement for a fragment's operation (rule 51). `UnresolvedHold` and rule
  20 run inside each fragment and gain rule 56's checks at the host; no new finding name. `SharedCopyLane` is deleted. Streams add `FeedUnhandled`, `ListenNeedsEvery`, `DuplicateSession`, `DuplicateListen`, `SharedFills`, `FillsNotPerKey` and, not built, `UnboundedBridge` (2.11.13). Because the verb at each use is a token, the
  one-off or live kind of every resource operation is read from the machine without reading a mapping or a closure.
- `flow explain`: `Toggle  READY → READY; commits like (Issues.setLike, latest, one lane per Issue key)`;
  `SearchDue  READY → READY; looks up results (Search.query, one lane)`; `READY subscribes issues (Issues.list)`; `LIVE subscribes messages (Chat.messages, every, one session per room, fills messages, idle 45s, reconnects by predicate, catches up)`;
  `docs  SaveDue → commits save (docs/save, reject, one lane per docId, subject = copy key)`. Inspection lists every
  lane with its operation path and subject path, and whether it is unplaced or releasing.

**Typing.**

- **The `operations` callback needs `E` first.** `events` and `internalEvents` are plain literals; nothing in
  `operations` reads `memory`. Fallback: `definition({ ... }).operations(fn)`.
- **`commit(select)` and `lookup(select)`** are contextually typed by the transition's `Action<Ev>` element type; one
  built outside a transition reads memory only or is wrapped in `Definition.handler(path, h)`.
- **Keyed or not, from the contract** (writes): the key's field list, a tuple of literal field names checked against
  the input's keys (`ReadonlyArray<keyof I>`), decides whether members take a selector and whether the row is plain
  or a keyed list; `[]` is unkeyed. The key record is `Pick<I, K[number]>`; members and `get` accept any
  `{ readonly [F in K[number]]: I[F] }`, so passing an item is a plain structural check (OD4). A one-off read's row is
  never keyed (2.7.3). `key` is required (OD15) and typed as a tuple of `input`'s field names; a contract without one is
  a type error at the contract. With a full Schema `input` that is a union (OD14), a key may name only fields present
  in every member (`keyof` of the union) (R7 L5).
- **Key-less members in an ending's handler** need the handler's event to be known as that operation's ending: the
  definition's `outcomes` record which events each operation maps, so `O.move.retry` without a key type-checks only
  in handlers of events that operation alone maps (`KeyRequired` otherwise, OD8). Risk: the handler type must carry its event's
  origin; if TypeScript cannot narrow it in shared handler consts, `flow check` is the fallback.
- **The handle per kind, the verb at the use** (OD2, OD3): a transaction operation's handle has `commit` and the
  write members; a stream's has `subscribe`, `subscribe.each`, `refetch` and `bookmark`; a resource's has `lookup`, `subscribe`,
  `subscribe.each`, `refetch`, `idle`, `cancel`. Rule 41 narrows a resource handle by its mapping: mapping `success` drops
  `subscribe`, mapping `value` drops `lookup`, so a mismatch is a type error. "One operation, one verb" for a bare or
  failure-only resource is not typed (it spans transitions); `flow check` reports it from the tokens.
- **Rows typed from the definition alone**: possible because a resource row is OPS O6's lane for either verb (rule 42);
  were one-off rows `{ pending }`, as in revision 3, a bare resource's row type would depend on the machine's verb,
  which the definition cannot see (the rejected alternative to Q21, decided as OD9).
- **`get(s, key?)`** is typed by the contract's key fields for writes (returns the row) and by the `each` key for live
  placements (returns `Lane | undefined`); a one-off read and an unkeyed placement take no key.
- **Fragments** (rule 50): `Fragment.O` is typed from the declaration and has only write operations' reads; members
  are branded with their fragment; key-less `O.x.cancel` type-checks in `whenAbandoned`; the fragment's `R` reaches
  the host and its Stories; a writing placement's `resetOn` returns `string`. Not spiked (section 7 item 20).
- **Watch**: no excess-property check on returned literals (TS (j)); errors collapse onto callback heads (TS shape 2).

### 2.8 Server calls and entity domains

For an operation registered in an entity domain, **the domain owns shared data; the operation and the machine own workflow**.
Rules 26–38 (2.4) are normative; this section shows them. It is merge 4 ([merged/entities.md](merged/entities.md)),
whose record also holds the review findings it answers (A-H1 to F-L2, from
[merged/server-calls/reviews/entities.md](merged/server-calls/reviews/entities.md)). Citations use its short names:
LIST is [merged/server-calls/rewrites/list.ts](merged/server-calls/rewrites/list.ts); EDP `EntityDomains.plan`, OPS
`Operations.plan`, PER `Persistence.plan`, ED `references/design/entity-domain.md`, EDX
`references/design/entity-domain-examples.md`, REV the entities review. "The store" is the Runtime's record store
(EDP:6, EDP:62-64). A test reads the store with `cp.entity`, and its queues and marks in `cp.inspection` (2.10.8).

#### 2.8.1 Where the data comes from

Three places hold facts about one write. Each has one writer and one moment.

| Fact | Kept in | Written by | When | Read by |
| --- | --- | --- | --- | --- |
| The record's confirmed fields, versions, positions | the store (EDP:62-70) | responses, pushes, a write's success | when the response lands; a write's at **settlement** | views (`Issue.get`), answers, `value` outcomes |
| A prediction | the store, per record and Attempt (EDP:64-65) | the domain's predicted fields' functions `(beneath, input) => value`, with the real input; `.predicts` itself runs once, at construction, for structure (EDP:51-52) | joined at the **start**, in the starting turn's publication (rule 28) | views, as `predicted` |
| The record queue | the store, per record, across actors (EDP:112-116) | Flow, from starts and retries | joined at start or retry; released at **settlement**, or after the forced repair for an unknown | Flow; `Entity.queue` in Stories (EDP:138) |
| `uncertain` | the store, per record and Attempt (EDP:103-106) | Flow, from the Attempt's ending | set at **settlement** of an unknown; cleared per rule 32 | views, as `uncertain` |
| `unconfirmed` fields | the store (EDP:93-100) | Flow, from a success that omitted a predicted field | **settlement**; cleared by a confirming read | views |
| The lane's state: `pending`, `uncertain`, `waiting`, `retryCount` | the Runtime's write lane (rule 21) | Flow | at admission, or in a Runtime step for an unbound lane; `pending` while `InFlight` | guards and views, `O.like.get(s, issue)`, never the store |
| The ending as an event, its route | the mailbox and the operation's `outcomes` (rules 13, 14) | Flow, at **admission** | the ending's turn | the machine's handlers |
| Drafts, toasts, reconcile keys, selection | memory | the machine's handlers | its turns | views, guards, selects |
| `attempt.id` on the wire, `basedOn` | the request | the commit author (rule 19); Flow passes `basedOn` (OPS:88-89, EDP:109) | each send; a retry sends the same (rule 31) | the server |

**Store versus lane.** The record is shared truth: every actor and view in the Runtime sees it the moment the
server's answer lands. The lane is this actor's workflow: whether this actor has handled the ending yet. They answer
different questions, so they change at different moments, and a view picks the one that means what it shows:

```ts
const row = useView(list, (s) => Issue.get(s, { id }, Issue.pick("title", "liked", "likes")))   // { data, predicted, uncertain, unconfirmed }
const saving = useView(list, (s) => List.O.like.get(s, { id }).pending)   // this actor identity's write is InFlight (rule 21)
// "Saving…" reads `saving`; the grey "not yet confirmed" style reads `row.predicted`; the "?" badge reads `row.uncertain`
```

Between a write's settlement and its ending's admission, `row.predicted` is already false and `saving` still true.
That is not a contradiction: the server has answered, and this actor has not yet reacted (rule 27).
`O.like.get(s, { id }).uncertain` is this actor's lane holding an unknown; `row.uncertain` is the record's mark (2.8.12).

#### 2.8.2 The list, rewritten against an `Issues` domain

LIST (197 lines: definition 52, machine 142) keeps every issue in memory as an `Item` with `sync`, `like.desired` and
`like.confirmed`, `pendingTitle`, `deleted` and a temporary id (LIST:8-19), and writes prediction and rollback by hand
(LIST:117-128, LIST:104). The rewrite moves shared data to the domain and keeps workflow in memory.

**The contracts and the domain** (`issues.contracts.ts` is plain structs; every contract states `input`, `output` and `key`,
rule 39):

```ts
// issues.contracts.ts (plain structs; no entity imports, EDP O1)
import { Effect, Schema } from "effect"
import { Outcome, resource, transaction } from "flow-state"
import { IssueRow, IssuesApi, IssuesPage } from "./issues-api"

export class Gone extends Schema.TaggedError<Gone>()("Gone", {}) {}
export class Refused extends Schema.TaggedError<Refused>()("Refused", { status: Schema.Number }) {}
export class Invalid extends Schema.TaggedError<Invalid>()("Invalid", { message: Schema.String }) {}
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}
export class ListFailed extends Schema.TaggedError<ListFailed>()("ListFailed", { status: Schema.Number }) {}

const send = (method: "PUT" | "PATCH" | "DELETE" | "POST", path: string, body: unknown, attemptId: string, signal: AbortSignal) =>
  IssuesApi.use((api) => api.send(method, path, body, { idempotencyKey: attemptId, signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
const settle = (res: { status: number }) => Effect.gen(function* () {
  if (res.status === 404) return yield* Outcome.failure(new Gone({}))
  if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
  return yield* Outcome.failure(new Refused({ status: res.status }))
})

export const issuesInProject = resource({
  id: "issues/in-project", input: { projectId: Schema.String }, output: IssuesPage, key: ["projectId"], staleTime: "30 seconds", gcTime: "5 minutes",   // OD12: input/output; OD4: key names input fields
  lookup: (i, { signal }) => Effect.gen(function* () {
    const res = yield* (yield* IssuesApi).list(i, { signal }).pipe(Effect.mapError(() => new ListFailed({ status: 0 })))
    if (res.page === undefined) return yield* new ListFailed({ status: res.status })
    return res.page
  }),
})
export const setLike = transaction({
  id: "issues/set-like", input: Schema.Struct({ id: Schema.String, liked: Schema.Boolean }), output: IssueRow, key: ["id"], concurrency: "latest",   // stated, no domain default
  commit: (i, { attempt, signal }) => Effect.gen(function* () {
    const res = yield* send("PUT", `/issues/${i.id}/like`, { liked: i.liked }, attempt.id, signal)
    if (res.status === 200 && res.row !== undefined) return res.row
    return yield* settle(res)
  }),
})
export const renameIssue = transaction({
  id: "issues/rename", input: Schema.Struct({ id: Schema.String, title: Schema.String }), output: IssueRow, key: ["id"], concurrency: "latest",
  commit: (i, { attempt, signal }) => Effect.gen(function* () {
    const res = yield* send("PATCH", `/issues/${i.id}`, { title: i.title }, attempt.id, signal)
    if (res.status === 200 && res.row !== undefined) return res.row
    return yield* settle(res)
  }),
})
export const removeIssue = transaction({
  id: "issues/remove", input: Schema.Struct({ id: Schema.String }), key: ["id"], concurrency: "reject",   // no output: void (Q37)
  commit: (i, { attempt, signal }) => Effect.gen(function* () {
    const res = yield* send("DELETE", `/issues/${i.id}`, {}, attempt.id, signal)
    if (res.status === 204) return
    return yield* settle(res)
  }),
})
export const createIssue = transaction({
  id: "issues/create", input: Schema.Struct({ draftId: Schema.String, projectId: Schema.String, title: Schema.String }), output: IssueRow,
  key: ["draftId"],                                                            
  concurrency: "reject",
  commit: (i, { attempt, signal }) => Effect.gen(function* () {
    const res = yield* send("POST", `/projects/${i.projectId}/issues`, { title: i.title }, attempt.id, signal)   // draftId stays on the device
    if (res.status === 201 && res.row !== undefined) return res.row
    if (res.status === 422) return yield* Outcome.failure(new Invalid({ message: res.message ?? "invalid" }))
    if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
    return yield* Outcome.failure(new Refused({ status: res.status }))
  }),
})
```

```ts
// issues.domain.ts (the predicts read input.id: keys are top-level input fields, rule 39)
import { asc, desc, domain, entity, eq, read, write } from "flow-state"   // eq, asc, desc: the Condition operators (merge 5)
import { IssueRow } from "./issues-api"
import { createIssue, issuesInProject, removeIssue, renameIssue, setLike } from "./issues.contracts"

export const Issue = entity({ id: "issues/Issue", fields: IssueRow.fields, primaryKey: ["id"] })
export const Issues = domain("issues", {
  list: read(issuesInProject)
    .list(Issue, ({ output }) => output.issues)
    .where(({ input, record }) => eq(record.projectId, input.projectId))
    .orderBy(({ record }) => [desc(record.number), asc(record.id)]),
  setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch({ id: input.id }, {
    liked: input.liked,
    likes: (i, input) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),
  })),
  rename: write(renameIssue).one(Issue).predicts(({ input }) => Issue.patch({ id: input.id }, { title: input.title })),
  remove: write(removeIssue).predicts(({ input }) => Issue.delete({ id: input.id })),
  create: write(createIssue).one(Issue),
})
```

**The definition, machine and view** (definition 72 lines, machine 86; LIST was 197: definition 52, machine 142). The
operations, their mappings and their keys are on the definition; the machine holds behaviour only; rows come from the
answer, row fields from the record, drafts from memory, "Saving…" from the lane:

```ts
// list.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"

export const MAX_LIKE_RESENDS = 3

export const Draft = Schema.Struct({
  draftId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(["sending", "failed", "unsure", "created"]),
  failure: Schema.NullOr(Schema.String),
  id: Schema.NullOr(Schema.String),
  discarded: Schema.Boolean,
})
export type Draft = typeof Draft.Type

export const List = definition({
  id: "Issues/List",
  states: ["READY"],
  events: {
    Toggle: { id: Schema.String, liked: Schema.Boolean },
    Edit: { id: Schema.String, title: Schema.String },
    Delete: { id: Schema.String },
    Open: { id: Schema.String },
    Create: { draftId: Schema.String, title: Schema.String },
    Retry: { draftId: Schema.String },
    Discard: { draftId: Schema.String },
  },
  internalEvents: {
    Listed: { ids: Schema.Array(Schema.String) },
    Settled: {}, IssueGone: {},
    Failed: { message: Schema.String },                                         // no superseded field (2.7.13)
    RenameUnsure: Flow.uncertain({ message: Schema.String }), RemoveUnsure: Flow.uncertain({ message: Schema.String }),   // one unknown event per keyed operation whose handler acts on its lane
    LikeUnsure: Flow.uncertain({ id: Schema.String }),                          // no superseded field
    Created: { draftId: Schema.String, id: Schema.String },
    CreateFailed: { draftId: Schema.String, message: Schema.String },
    CreateUnsure: Flow.uncertain({ draftId: Schema.String }),
    ReconcileLike: { id: Schema.String }, ToastExpired: {},
  },
  memory: {
    projectId: Flow.input(Schema.String),
    creating: Flow.initial(Schema.Array(Draft), []),
    // likeUnsure, the mirrored id list (R3 M2); the reconcile schedule reads the lanes' `uncertain`
    selectedId: Flow.initial(Schema.NullOr(Schema.String), null),
    toast: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => {                                                      
    const fail = (message: string) => E.Failed.from(() => ({ message }))
    const unsure = (event: typeof E.RenameUnsure | typeof E.RemoveUnsure, message: string) => event.from(() => ({ message }))
    return {
      issues: Issues.list.outcomes({ value: E.Listed.from((v) => ({ ids: v.issues.map((i) => i.id) })) }),   // maps value: the machine subscribes (the operations proposal's S11, its own numbering)
      like: Issues.setLike.outcomes({                                           // one lane per Issue, created by work (key: ["id"], stated on the contract, OD15)
        success: E.Settled,
        failure: { Gone: E.IssueGone, Refused: fail("Could not update"), NotSent: fail("Could not update") },   // a replaced toggle never arrives here (2.7.13)
        unknown: E.LikeUnsure.from((_r, { key }) => ({ id: key.id })),
      }),
      rename: Issues.rename.outcomes({
        success: E.Settled,
        failure: { Gone: E.IssueGone, Refused: fail("Couldn't save the title"), NotSent: fail("Couldn't save the title") },
        unknown: unsure(E.RenameUnsure, "Couldn't confirm the title"),
      }),
      remove: Issues.remove.outcomes({
        success: E.Settled,
        failure: { Gone: E.Settled, Refused: fail("Couldn't delete"), NotSent: fail("Couldn't delete") },
        unknown: unsure(E.RemoveUnsure, "Couldn't confirm the delete"),
      }),
      create: Issues.create.outcomes({                                          // one lane per draft (the contract's key)
        success: E.Created.from((v, { key }) => ({ draftId: key.draftId, id: v.id })),
        failure: {
          Invalid: E.CreateFailed.from((r, { key }) => ({ draftId: key.draftId, message: r.message })),
          Refused: E.CreateFailed.from((r, { key }) => ({ draftId: key.draftId, message: `Refused (${r.status})` })),
          NotSent: E.CreateFailed.from((r, { key }) => ({ draftId: key.draftId, message: `Not sent (${r.why})` })),   // key: always present (was laneKey)
        },
        unknown: E.CreateUnsure.from((_r, { key }) => ({ draftId: key.draftId })),
      }),
    }
  },
})
```

```ts
// list.machine.ts
import { deny, machine } from "flow-state"
import { List, MAX_LIKE_RESENDS, type Draft } from "./list.definition"

type Memory = typeof List.Memory.Type
const draft = (m: Memory, draftId: string) => m.creating.find((d) => d.draftId === draftId)
const editDraft = (m: Memory, draftId: string, f: (d: Draft) => Draft) => ({ creating: m.creating.map((d) => (d.draftId === draftId ? f(d) : d)) })
const dropDraft = (m: Memory, draftId: string) => ({ creating: m.creating.filter((d) => d.draftId !== draftId) })

export const ListMachine = machine(List, ({ S, E, O }) => {                      
  const named = ({ event }) => event                                            // user-defined: a user event names the thing; it carries the key's fields (OD4)
  const draftIs = (pred: (d: Draft) => boolean, code: string) => ({ memory, event }) => { const d = draft(memory, event.draftId); return (d !== undefined && pred(d)) || deny(code) }
  const toast = { target: "self", updateMemory: ({ event }) => ({ toast: event.message }) }

  return {
    default: S.READY,
    states: {
      READY: {
        activities: [O.issues.subscribe(({ memory }) => ({ projectId: memory.projectId }))],   
        schedules: {
          reconcile: { keys: ({ operations }) => operations.like.filter((l) => l.uncertain).map((l) => l.key), schedule: "3 seconds", send: E.ReconcileLike.from(({ key }) => ({ id: key.id })) },   // uncertain on the row; key: the lane's key record (L1, 2.7.10)
          toastOff: { schedule: "4 seconds", send: E.ToastExpired, armOn: [E.Failed, E.RenameUnsure, E.RemoveUnsure, E.LikeUnsure] },
        },
        on: {
          Toggle: {
            target: "self",                                                     // a toggle while unsure waits behind the held lane (OD5); no mirror to update
            actions: [O.like.commit(({ event }) => ({ id: event.id, liked: event.liked }))],   // existing: commit; the key is derived
          },
          Edit: {
            guard: ({ event }) => event.title.trim() !== "" || deny("EmptyTitle"),
            target: "self",
            actions: [O.rename.commit(({ event }) => ({ id: event.id, title: event.title }))],
          },
          Delete: {
            guard: [O.remove.idle(named)],                                      // existing: idle(key); the event carries `id` (OD4)
            target: "self",
            updateMemory: ({ memory, event }) => ({ selectedId: memory.selectedId === event.id ? null : memory.selectedId }),
            actions: [O.remove.commit(({ event }) => ({ id: event.id }))],
          },
          Open: { guard: ({ operations, event }) => operations.issues?.data?.issues.some((i) => i.id === event.id) || deny("NoSuchRow"), target: "self", updateMemory: ({ event }) => ({ selectedId: event.id }) },
          Settled: { target: "self" },
          IssueGone: { target: "self", actions: [O.issues.refetch] },
          Failed: toast,
          RenameUnsure: { ...toast, actions: [O.rename.cancel] },              // give up: release this Attempt; a rename that waited behind it is then sent (OD7)
          RemoveUnsure: { ...toast, actions: [O.remove.cancel] },              // key-less: rename and remove each alone map their event (OD8)
          LikeUnsure: [
            { target: "self", guard: [O.like.retryable({ times: MAX_LIKE_RESENDS })] },   // retryable (OD1); no key: this ending's Attempt (OD4); the reconcile schedule re-sends it
            { target: "self", updateMemory: () => ({ toast: "Couldn't confirm your like" }), actions: [O.like.cancel] },   // gave up: release this Attempt (OD7); an unlike that waited is then sent, not dropped (R4 H3)
          ],
          ReconcileLike: { target: "self", actions: [O.like.retry(named)] },   // not an ending: the event names the Issue

          Create: {
            guard: [({ event }) => event.title.trim() !== "" || deny("EmptyTitle"), ({ memory, event }) => draft(memory, event.draftId) === undefined || deny("DuplicateDraft")],
            target: "self",
            updateMemory: ({ memory, event }) => ({ creating: [...memory.creating, { draftId: event.draftId, title: event.title, status: "sending", failure: null, id: null, discarded: false }] }),
            actions: [O.create.commit(({ memory, event }) => ({ draftId: event.draftId, projectId: memory.projectId, title: event.title }))],   // the key comes from the input
          },
          Created: [
            { guard: draftIs((d) => d.discarded, "NotDiscarded"), target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId), actions: [O.remove.commit(({ event }) => ({ id: event.id }))] },
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "created", id: event.id })) },
          ],
          Listed: { target: "self", updateMemory: ({ memory, event }) => ({ creating: memory.creating.filter((d) => d.id === null || !event.ids.includes(d.id)) }) },
          CreateFailed: [
            { guard: [draftIs((d) => d.discarded, "NotDiscarded")], target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId) },
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "failed", failure: event.message })) },
          ],
          CreateUnsure: [
            { guard: [draftIs((d) => d.discarded, "NotDiscarded"), O.create.retryable({ times: 3 })], target: "self", actions: [O.create.retry] },   // an ending: no key (OD4)
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "unsure" })) },
          ],
          Retry: [
            { guard: [draftIs((d) => d.status === "failed", "NotFailed"), O.create.idle(named)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "sending", failure: null })), actions: [O.create.commit(({ memory, event }) => ({ draftId: event.draftId, projectId: memory.projectId, title: draft(memory, event.draftId)?.title ?? "" }))] },   // a second start, its own select
            { guard: [draftIs((d) => d.status === "unsure", "NothingToRetry"), O.create.idle(named)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "sending" })), actions: [O.create.retry(named)] },
          ],
          Discard: [
            { guard: [draftIs((d) => d.status === "failed", "NotFailed")], target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId) },
            { guard: [draftIs((d) => d.status === "unsure", "NotUnsure"), O.create.idle(named)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, discarded: true })), actions: [O.create.retry(named)] },
            { guard: [draftIs((d) => d.status === "sending", "NotSending")], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, discarded: true })) },
          ],
          ToastExpired: { target: "self", updateMemory: () => ({ toast: null }) },
        },
      },
    },
  }
})
```

```tsx
// IssueList.tsx
const { O } = List                                                              // the definition exports O, as it exports S and E
const rows = useView(list, (s) => s.operations.issues?.data?.issues ?? [])      // path; undefined while not placed (OPS O6)
const drafts = useView(list, (s) => s.memory.creating.filter((d) => !d.discarded && !rows.some((r) => r.id === d.id)))   // one issue never shows twice (rule 33)
{rows.map((r) => <IssueRow key={r.id} issue={r} />)}
{drafts.map((d) => <DraftRow key={d.draftId} title={d.title} status={d.status} />)}   // status lives in memory: the handlers write it

// IssueRow.tsx
const row = useView(list, (s) => Issue.get(s, { id: issue.id }, Issue.pick("title", "liked", "likes")))   // shared: data, predicted, uncertain
const saving = useView(list, (s) => O.like.get(s, issue).pending || O.rename.get(s, issue).pending)   // get(s, item): the item carries `id` (OD4)
<LikeButton liked={row.data.liked} count={row.data.likes} unsure={row.uncertain} saving={saving} onClick={() => send(E.Toggle({ id: issue.id, liked: !row.data.liked }))} />
```

**What changed, case by case.**

| Case | LIST | Rewrite |
| --- | --- | --- |
| Like | memory `desired`/`confirmed`/`count`; `LikeSynced`, `LikeRefused` rollback with a `superseded` guard (LIST:117-128) | `.predicts` (2 lines); success is `Settled`; failure only toasts; the store replays the newer waiting prediction, so a failure can never undo newer intent |
| Like unknown | keyed reconcile, `retryCount` budget (LIST:130-138) | the reconcile schedule's `keys` read the held lanes; `retryable({ times })` is the budget, then `cancel` releases; a newer toggle waits behind the held like, and once the like is retried or released the toggle's success clears its mark (rule 32) |
| Rename | select reads memory; `Edit` with two alternatives and `pendingTitle` for an unsaved row; `Created` re-sends (LIST:93, LIST:152, LIST:172-178) | one transition; the store predicts and confirms. Editing a draft while it sends is dropped: a draft is not a record |
| Remove | `deleted` flag, `notConfirmed` restores it (LIST:104, LIST:180-184) | `.predicts(Issue.delete)` hides it everywhere; failure restores it in the store |
| Create | a temporary-id row adopted on `Created` (LIST:100-103, LIST:150-154) | a `creating` draft, hidden by the view once the list holds its id, pruned by `Listed` (rule 33) |
| A gone issue | `dropId` from memory | `IssueGone` refetches the list: a failure repairs nothing (C4) |
| Unknown rename and remove | one shared `Unsure` | `RenameUnsure`, `RemoveUnsure`: one event per keyed operation whose handler acts on its lane, so a key-less `cancel` names it (rule 43) |
| Superseded endings | `superseded` in three events, two guards | none: a replaced toggle was never sent and is not delivered (rule 17) |

#### 2.8.3 Ownership (E1)

For an operation registered in a domain, **the domain owns shared data; the operation and the machine own workflow**:

| The domain (store) | The operation (definition) and the machine |
| --- | --- |
| applies the prediction at start, replays it over each new base | which event each ending becomes (`outcomes`, rule 13) |
| confirms, rolls back, repairs, forces a repair for unknown | where that event routes: current or late (rule 14) |
| marks and clears `uncertain`, `unconfirmed` | whether to retry, when, with what budget (rules 19, 25) |
| orders sends per record (the record queue) | whether to cancel (rule 24) |

```ts
// before (LIST:117-128): memory is a second store
Toggle: { updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => withLike(i, { desired: !i.like.desired })) }), actions: [like] },
LikeRefused: [{ guard: superseded }, { updateMemory: …(i) => withLike(i, { desired: i.like.confirmed }) }],
// after: the domain predicts; memory holds nothing about the like
setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch({ id: input.id }, { liked: input.liked, likes: … })),
Toggle: { target: "self", actions: [O.like.commit(({ event }) => ({ id: event.id, liked: event.liked }))] },
```

- Machine memory never mirrors entity data. It holds drafts, toasts, reconcile keys and selection. Views read records
  and answers.
- This is EDP D1 (EDP:185-187) stated for the operation: `optimistic` and `setData` stay type errors on a domain
  operation (EDP:60-61, ED:294-299; OD26).
- A plain operation (not in a domain) keeps memory-held predictions or the commit's `optimistic` (2.7.8, rule 36).

#### 2.8.4 Timing: settlement and admission (E4, E13)

```text
settlement ── classify the send (2.7.1); apply rule 18 from the Attempt's send history
           ── store: apply the Attempt's ending (rule 30), release the record queue   ── one publication
           ── queue the ending in the actor's mailbox; the lane is untouched, pending stays true
admission  ── map through outcomes, test the owner (rule 14), update the lane (rule 21)
```

- **Store effects publish at settlement.** Shared truth never waits for one actor's mailbox: a busy or disposed
  actor (OPS:105-106 keeps cache consequences during disposal) must not hold another screen's view of a record.
- **The lane changes at admission**, as merge 2 decided (2.7.12): it records whether this actor has handled
  the ending, which is what `O.pay.idle` and "Saving…" mean (D5, D6); for a lane with no binding incarnation, the
  Runtime applies the cell when the ending lands and parks the ending for the identity's saved record (rule 44), or, in a live actor, for the lane's subject
  path (rule 53). A
  Runtime step publishes the rows it changes (2.5).
- **Rule 18 moves to settlement** (found checking E4/E8). 2.5 step 1 applies rule 18 at admission, but the store needs
  the Attempt's ending at settlement. Rule 18 reads only the Attempt's send history, which is known at settlement, so
  nothing else moves; admission only maps it.
- **Routing never changes store effects (E13).** A late or current ending, or one applied with no binding incarnation, has the same store effect,
  because routing is decided later, at admission, from the machine's state. So `LIST`'s `LikeSynced` overwrite of
  newer memory (REV:60-61) cannot happen in the domain path: there is no memory to overwrite.

```ts
// A late success (the owner state was left) still confirms the rename for every screen:
rename: …,                         // store at settlement: fields the response carries are confirmed; omitted ones stay predicted until a confirming read (EDP:92-100). Erratum (2026-10-30)
Settled: { target: "self" },       // at the root: handled whether current or late (rule 20)
```

**The starting side** (E4). A start applies its prediction "on start" (OPS:82). Publishing the turn first and
starting after would show this actor's lane not yet pending and the record not yet predicted, then a second snapshot.
So every start is decided in step 5, before publication, and a domain write's queue joins and prediction publish in
the starting turn's publication (rule 28, 2.5 steps 5–6). A declined start (`Rejected`, `Overloaded`) applies nothing.

#### 2.8.5 Concurrency: the record queue wins (E5, E6, E11)

The actor decides first, then the record queue (ED:643-651). Merge 2's `latest` is an actor mode; the record queue is
shared and decides when a send leaves.

```ts
// setLike is `latest`. Three quick toggles on one issue while another actor's rename (R) is queued on it (Erratum (2026-10-30): was "another tab's"; each tab is its own Runtime and store):
// t0 Toggle(true)   A starts: the actor's current write; joins the record queue [R, A]; the record shows liked
// t1 Toggle(false)  B starts: the actor's one waiting write; joins [R, A, B]; B's prediction replays over A's: not liked
// t2 Toggle(true)   C replaces B: B was never invoked, so it is removed from the queue and becomes
//                   evidence Superseded, prediction removed, no repair; C joins [R, A, C]; the record shows liked
// R settles unknown → the queue holds A until R's forced repair settles (EDP:115-116); then A is sent, then C
```

- **E5. A `latest` waiting start joins the record queue.** Superseding it removes a queued, never-invoked write,
  which EDP already allows (EDP:114-115): it becomes evidence `Superseded`, delivered to no handler, with its
  prediction removed and no repair (rule 17). The record queue, not merge 2's settlement rule (2.7.12), releases the next send, so a waiting `latest`
  start never runs over an unrepaired record (F-H3).
- **`cancel`** (E5, as corrected). `concurrency: "cancel"` on a predicting write is a `flow check` error (EDP:112-113,
  ED:645-646). The `O.x.cancel(k?)` action stays allowed and acts by the table (2.7.13), with rule 30's store effects:
  never sent, `NotSent { why: "Cancelled" }` and no repair; a waiting re-send, released (`Released`); invoked, unknown
  `Cancelled`, retained (`Held`), a forced repair and `uncertain`. The hard abort of 2.7.6 needs it.
- **E6. `reject` is the design's:** a start on a busy lane is an ending, `NotSent { why: "Rejected" }`, and the
  transition runs (rule 16, D5), replacing OPS's "declines … without work or outcome" (OPS:92-93). A Rejected start
  has no Attempt, so it never applies a prediction or joins a queue.
- **E11. Queue overflow is an ending.** A start that would exceed the actor's `serialize` queue (64, OPS:95-96) or
  any record queue it joins (64, EDP:179-182) ends `NotSent { why: "Overloaded" }`: no prediction and no queue join
  in any record (EDP's "no partial joins", EDP:209-210). The batch's other actions and the transition run. This replaces
  "rejects the whole action batch" (OPS:96-97) and is rule 16 applied to one more decline.

```ts
failure: { …, NotSent: fail("Could not update") },   // Overloaded (a replaced toggle is evidence, rule 17)
```

**Every `NotSent` against the store (F-M3).**

| `NotSent { why }` | Prediction | Queue | Repair | `uncertain` |
| --- | --- | --- | --- | --- |
| `Rejected` | never applied | never joined | none | unchanged |
| `Overloaded` | never applied | never joined (no partial join) | none | unchanged |
| `Superseded` (evidence) | removed | removed | none | unchanged |
| `Cancelled` (queued, before invocation) | removed | removed | none | unchanged |
| `Restored` (unacknowledged at reload) | none: predictions are never persisted (EDP:127-128) | none | none | unchanged |
| `NothingToResend` (evidence) | none: no write | none | none | unchanged |
| `StorageRefused` (acknowledgement failed) | removed | removed | none | unchanged |
| `Disposed` (Runtime disposal, never sent) | removed | removed | none | unchanged |

This replaces ED:650-651's "settles interrupted" for a queued cancel.

**A queued commit behind a hold waits in the record queue** (stated limit, 2.7.13). A commit in `W` joins its records'
queues at commit, so while its lane holds an unknown it can head record r's queue: every other actor's write to r waits
as long as the hold lasts. The order is kept on purpose (rule 29).

#### 2.8.6 Unknown, retry and uncertain (E2, E3, E7, E8)

**E2. One retry shape.** `O.x.retry(k?)` (2.7.3, rule 19) replaces `O.x.retry(select)` in OPS O3 (OPS:113-117) and
EDP O1 (EDP:107-108), with OPS's "known settled result settles immediately" (OPS:114-115): under rule 21 a lane whose
Attempt succeeded has no addressable Attempt, so a retry is evidence `NothingToResend`. "The machine
reconciles the Attempt" (EDP:105-106) is spelled `O.x.retry(k?)`.

**E7. A retry is the same request.**

```ts
ReconcileLike: { target: "self", actions: [O.like.retry(named)] },
// sends the Attempt's input and basedOn unchanged; applies no prediction; joins the record queue behind any newer write
```

- **The same `basedOn`.** REV's direction was "a fresh `basedOn`" (REV:44-45). A server that deduplicates by
  `attempt.id` compares the request with the stored one; a different `If-Match` makes it a different request under
  the same key, which such servers refuse or, worse, apply. A stale `basedOn` that the server now refuses with 412 is
  a definite failure after an unknown send, so it arrives as `StillUnknown` (rule 18): honest, because the first send
  may be the reason the version moved. The loop REV:45 fears is bounded by the machine's `retryable({ times })` budget.
  A never-sent queued write's `basedOn` is rebased along the record queue instead: it takes the version the write
  ahead of it returns when that write's committed base equals its own, transitively (OD19 Q32); a re-send keeps its
  first send's.
- **No prediction.** The Attempt's prediction ended when its forced repair landed (EDP:103-105); re-applying it
  would show a value the server just contradicted.
- **It joins the record queue** (found checking E7). E7 does not say; it must, because "one write in flight per
  record" (ED:639) covers every send. It joins at the tail and adds no prediction.
- **Its response takes the position of the Attempt's first send**, so it cannot beat a newer write by position.
  That is right when the server replays a stored response, and wrong when the server applies the request fresh,
  after the newer write. Flow cannot tell the two apart, and it does not have to: a field the response carries that
  differs from a newer value loses by position and is therefore **contested** (EDP:66-69, ED:598-601), so the
  record's loader and holders refetch and the server decides. With versions, the version decides (EDP:65-66).

**E8. The store follows the Attempt's ending**, after rule 18, not the send's channel (F-M1, A-M4). A definite failure
of a retry after an unknown send is `StillUnknown`: the store treats it as unknown, keeps any prediction still live
(one exists only if the retry was sent before the first forced repair landed), forces the repair and keeps the record
uncertain. It never takes the failure row (predictions removed, no repair).

**E3. What clears `uncertain`** (F-M2):

```ts
// cleared: a later write to the record succeeds; a retry of the same Attempt succeeds
// not cleared: a read, a failed or StillUnknown retry, a later write that fails, the forced repair landing
```

A read never clears it: a read cannot prove the write will not still land (ED:656-658). The mark is per record and
Attempt (found checking E3): a record reads `uncertain` while any of its marks remains; a retry's success clears that
Attempt's mark, and a later write's success clears every mark on the record whose Attempt is resolved or
released (rule 32; EDP:105-106).

**The rule table** (replaces the cache table of 2.7.1 for domain operations; C4):

| The Attempt's ending (after rule 18) | Predictions | Repair | Queue release | `uncertain` |
| --- | --- | --- | --- | --- |
| success | confirmed fields (whole values, per record) replace them; omitted ones `unconfirmed` (EDP:92-100), unless no carrier's shape holds the whole field, when the prediction ends (`PredictionNotRetained`); an uncomputed field counts as predicted (merge 5, A9) | answers from both bases | at settlement | this Attempt's mark, and the record's marks whose Attempts are resolved or released, cleared |
| failure (author's tag) | removed | none (C4) | at settlement | unchanged |
| failure `NotSent` | 2.8.5's table | none | at settlement | unchanged |
| unknown (author's, `Cancelled`, `Restored`, `Interrupted`, `Defect`, `StillUnknown`) | kept until the forced repair lands | forced | after the forced repair settles | set for this Attempt |
| `Released` (`cancel` in `Held`) | none left (ended by the forced repair) | none | a waiting re-send's entry withdrawn | kept until a later write's success (rule 32) |

**Facts the record queue owns** (decided as behaviour, OD19, OD20; R7 K20, M3, M4). The record queue is shared, applied at
settlement (rule 27), and orders writes to a record across lanes and actors (rule 29). Two facts move there:

- **Marks (rule 32, amended per Attempt):** a later write's success clears every mark on the record whose Attempt is
  resolved or released; a mark whose Attempt is still unresolved stays. `Released` (the table's `cancel` cells) is a
  store effect: it tells the record queue the Attempt is given up. Disposal is not a release (the lane lives on,
  OD19), so a disposed actor's held write keeps its mark while its Attempt is unresolved; an unbound lane that no
  incarnation of its identity adopts keeps it until the Runtime ends, and Inspection lists it (R8 M4).
- **`basedOn` rebase (decided, OD19: Q32 A, owner moved to the record queue):** a queued write whose `basedOn` for
  record r equals the committed base of the write ahead of it **in r's record queue** takes that write's returned
  version for r, transitively. A like and a rename of issue 1 committed on v4 no longer 412 each other (R7 M4);
  revision 8's lane chain is the special case. A released predecessor returns no version, so the queued write keeps
  its base (a 412 may follow, stated). The rebase applies to never-sent writes only: a re-send keeps its first
  send's input and `basedOn` under its own idempotency key (R8 L5). Plain transactions have no record queue and get
  no rebase; they compare versions in their commit function.

The other merge 4 facts are unchanged: a queued `latest` commit applies its prediction at commit and joins the record
queue (rules 28, 29); `Superseded` and `NotSent { Cancelled | Rejected | Restored | StorageRefused | Disposed }` remove its
prediction without repair (rule 30); rule 30's record-queue hold and the lane hold agree. A re-send joins its record
queues again (rule 31), which is why a re-send can wait to be invoked across turns (the `cancel` cell's re-send case).

#### 2.8.7 Creates (E9)

No temporary id enters a domain list. A pending create is workflow: memory holds a `creating` draft, the view shows it
apart from the answer, and membership appears when the answer's refetch holds its key (EDP:118-119, ED:670-674).

```ts
Create:  { updateMemory: …({ creating: [...memory.creating, { draftId, title, status: "sending", id: null, … }] }), actions: [O.create.commit(({ memory, event }) => ({ draftId: event.draftId, projectId: memory.projectId, title: event.title }))] },
Created: { updateMemory: …editDraft(memory, event.draftId, (d) => ({ ...d, status: "created", id: event.id })) },   // the view hides it once rows hold the id
Listed:  { updateMemory: …({ creating: memory.creating.filter((d) => d.id === null || !event.ids.includes(d.id)) }) },   // housekeeping; the view's filter is what shows
```

- **`draftId` is the view's key and the create's lane, never the server's id.** The idempotency key on the wire is
  `attempt.id` (rule 19); `draftId` stays on the device.
- **One source of rows** (F-M4): rows come from the answer; a draft is shown only while the answer does not hold its
  id, so one issue never shows twice.
- **`Listed` carries ids, not rows**, from the activity's `value`, which sees confirmed data only (EDP:130-131).
- A draft discarded while its create may land is created-then-deleted: `Created` starts `remove` with the real id
  (LIST kept the same behaviour, LIST:151).

#### 2.8.8 Keys (E10, superseded by OD15)

A domain write states its `key`, a list of `input` fields, like every contract (rule 39): `setLike`, `renameIssue` and
`removeIssue` write `key: ["id"]`, `createIssue` `key: ["draftId"]`. There is no default. `flow check` warns when a
one-record write's key fields are not the input fields its predicted record's key reads (rule 34), since two lanes for
one record would let `reject` pass two writes; writes predicting several records, none, or a `many` key are exempt. The
`.each` spelling (strings, rule 9) is unchanged.

#### 2.8.9 Callback memory reads (E12)

Rule 22 used to list "optimistic and write callbacks" as after reads while section 7 item 10 left them open (F-H4,
F-L2). Decided (E12, rule 36):

```ts
// notes.definition.ts: a plain operation; its mapping and `writes` are on the definition (rules 13, 36)
notes: Notes.save.outcomes({ success: E.Saved, failure: { … }, unknown: E.SaveUnsure }, {
  writes: ({ value, input }) => …,            // no memory: it runs at settlement, before any turn of the ending exists
}),
// notes.machine.ts: optimistic is the commit's only option
O.notes.commit(select, {
  optimistic: ({ memory, input }) => …,       // the starting turn's after memory, captured at start, even if the start waits
})
```

- `optimistic` (plain operations only) reads the starting turn's after memory, captured when the start is recorded,
  so a queued `serialize` start applies what its own turn saw, not a later turn's memory.
- `writes`, the operation's option, receives `{ value, input }` and reads no memory: it runs at settlement (OPS:83),
  and the after memory of the ending's turn does not exist yet; on the operation, it is found by contract id after a
  rebind or reload (OD26).
- Domain operations have no `optimistic` (EDP:60-61); their `writes` may only invalidate, with the same
  `{ value, input }` view (ED:297-299; E12, as corrected), on the operation (OD26).

#### 2.8.10 Reads around writes (E15)

A read operation (2.7.9) carries confirmed data only: predictions never reach a `success:` mapper,
as they never fire `value` (EDP:130-131). A read's defect or interruption arrives on `failure` as the Flow reasons
`Defect` and `Interrupted`:

```ts
// in the definition's operations: one event, Defect and Interrupted arrive there; or a tag record that maps them
issue: Issues.issueById.outcomes({ success: E.Loaded, failure: E.ReadFailed }),
// or, as a tag record:
// issue: Issues.issueById.outcomes({ success: E.Loaded, failure: { NotFound: E.Gone, Defect: E.ReadFailed, Interrupted: E.ReadFailed } }),
// in the machine
Open: { target: "self", actions: [O.issue.lookup(({ event }) => ({ id: event.id }))] },
```

With a single `failure:` event they arrive there; in a tag record they are optional in the type and required by
`flow check` (E15, as corrected), as `NotSent` is where it can occur (rule 20): an unmapped read defect would leave a
state waiting with no event, the silent decline D5 removed for writes. A read can always defect, so in practice they
are always required.

`O.issues.refetch` (Operations O2, as in 2.8.2) is a cache action with no ending: the placement's `value`
delivers what it reads. A state that must wait for a read uses a one-off read operation (2.7.9).

#### 2.8.11 Persistence (E14)

A domain write's lane record, its Attempt and the keys that Attempt predicts persist in **one capture**, the Attempt's
one acknowledgement Persistence O6 requires before its first invocation (rule 38; PER:123-127, C17). Lane records are
the Runtime's, never inside the actor's record (rule 46). Restore therefore finds either both or
neither: an acknowledged Attempt whose predicted keys are marked `uncertain` with a forced repair (EDP:106-107), or an
unacknowledged one that ends `NotSent { why: "Restored" }` with nothing to repair (F-M7). Prediction values are never
persisted (EDP:127-128).

#### 2.8.12 Names (E16)

The record read's `pending` (EDP:130, ED:705-706, ED:749) is renamed `predicted`:
`{ data, predicted, uncertain, unconfirmed }`. Then `pending` means one thing: this actor identity's write is `InFlight`
(rule 21). `uncertain` names two things, kept apart by where they are read: `Issue.get(s, k).uncertain` is the store's
mark; `O.like.get(s, k).uncertain` is the lane holding an unknown (OD16). The resource and answer lane's field "true for live optimistic values or
predictions" (OPS:153, OPS:166, ED:703-704), which means what the record's means, is renamed `predicted` too (E16, as
corrected).

#### 2.8.13 How it is implemented

One runtime: the store and the actors already share the Runtime (EDP:6); nothing here adds a second execution path,
and `check()` still runs steps 2–6 and publishes nothing (2.5): it decides no start, so it never predicts.

- **Start** (step 5). Once the after memory gives the input and key, a domain write calls its predicted fields' functions with the real input, over records the store holds (merge 5, A8)
  (ED:339), checks every record queue's bound, and either declines (`Overloaded`, `Rejected`) or joins all its queues
  at once. The store revision and the actor's snapshot publish as one cut in step 6. A persisted actor captures the lane, the
  Attempt and the predicted keys in one record and waits for the acknowledgement before invocation (rule 38).
- **Send.** A write is invoked after its turn, once its lane has promoted it, its acknowledgement is written and it
  heads every queue it joined. A retry joins like a start, without a prediction,
  and keeps its first send's position.
- **Settlement.** The watcher fiber that merge 2's spike uses (`{ lane, outstanding, sendEnding }`, [merged/server-calls/proposal.md](merged/server-calls/proposal.md) section 5) classifies the send, applies rule 18 from the Attempt's send history (kept with the Attempt),
  calls the store with the Attempt's ending, which publishes and releases queues, and only then queues the ending in
  the mailbox. Routing stays in `admitEnding`.
- **Admission**: map, test the owner, apply the cell (promotion included). For an unbound lane the Runtime applies the
  cell when the ending lands and parks the ending (rule 44).
- **Restore.** Predicted keys come back with their Attempt; the store marks them uncertain and forces their repair
  before readiness, and the ending (`Restored`) is routed by rule 14 after readiness (2.7.12).

#### 2.8.14 `listen` and connections

A domain's `listen` entry is a stream whose values are record changes. It has no bookmark: `from` is the session's own last position, and `listen` ignores a contract's `catchUp` (rule 72, Streams T7; [P]). "Reconnect" means rule 72's gaps: an unproven or reset registration, an `end` or a release starts a refetch of each subscribed answer read earlier, and an answer is current only while every session covering it is `Live` with no gap since its read. The example is 2.11.12.7. Costs: one refetch per subscribed list on re-entry; a change before registration, at most 2 reads; one connection cannot feed both records and a log.

### 2.9 Operations in fragments

Rules 48–60 are normative; this section is their reading, in the record's terms ([merged/fragment-operations/proposal.md](merged/fragment-operations/proposal.md), revision 3; decisions F1–F10). 2.7.13's table stays the write lane's one normative table: 2.9.3 adds the rows fragments change. Worked examples are in 2.9.6.

#### 2.9.1 Where the data comes from, and when a fragment should own I/O

| Value | Real source | Written in | Changes here |
| --- | --- | --- | --- |
| Request, response, status, body | `fetch`, XHR, `WebSocket`, an SDK (Stripe.js, a socket client) | an Effect service (`DocsApi`, `StripeApi`, `ChatSocket`, `IssuesApi`) whose Layer is the swap point (OD11) | no |
| Cancel | `AbortController`: Flow interrupts the commit's fiber, which aborts the `signal` the adapter passed to `fetch` | the contract's function | no |
| Idempotency key | `attempt.id`, minted by Flow, put on the wire by the commit author (rule 19) | the contract | no |
| Classification | `Outcome.success / failure / unknown` beside the status it reads | the contract (2.7.1) | no |
| Which server thing | the contract's `key`, a list of `input` fields (OD4, OD15) | the contract | no |
| Which event an ending becomes | the operation's `outcomes` | **the fragment's declaration** | moved from the host |
| The input of one commit | the commit's select over the after memory and event (rule 22) | **the fragment's transition** | moved from the host |
| The write lane (`pending`, `uncertain`, `waiting`, `retryCount`) | the Runtime, per (actor identity, contract id, key) | read with `Fragment.O.x.get(s, k)` | identity unchanged (F2) |
| The subject path | the copy keys (host data) and string reset values (host memory) from the actor's root down | the placements | recorded on the lane record when the lane is created (rule 51) |
| The releasing mark | the fragment's `whenAbandoned: [O.x.cancel]`, when the incarnation ends | the Runtime, on the lane record | rule 60 (decided, F9) |
| A read's or a stream's lane | the incarnation that placed or looked it up | `s.operations.<instance>.<name>` | scoped to the incarnation (rule 52) |
| The services the contracts need | Effect's `R` of each contract's function | the fragment's type and summary | carried to the host (rule 57) |
| Shared record data | the store (merge 4) | `Issue.get(s, key, shape)` | no |
| What the host learns | the fragment's callbacks, exits and public memory | the host's filling | as today |

A fragment should own an operation when **all** of these hold:

1. **The policy is the feature.** What the fragment does with endings (coalesce edits, re-send an unknown with a
   budget, catch up after a gap, roll a like back) is the reusable thing, used in two or more hosts.
2. **The facts are its own.** The workflow facts the endings produce live and die with the fragment, and the host
   needs only a few of them.
3. **Each write key belongs to one subject** (rule 51): decided by it (a document's `docId` under a copy keyed by
   `docId`) or unique within it (a comment's `clientId` under a thread). A follow-author button on each post fails
   this (two posts, one author, one lane); a follow button over distinct authors passes.
4. **The host does not need a late result at once.** If the host must react wherever the user has gone (a payment
   that lands after Back moves the user to the receipt), the host owns that operation.

It should not when any fails: a screen used once; a saga across steps; bulk work over a membership (2.7.13's
per-key fan-out limit); host data many writes share.

#### 2.9.2 Lifecycle: where every piece goes

| What happens | Reads and streams | A write on the wire or waiting | A held unknown | Delivered to |
| --- | --- | --- | --- | --- |
| Root trait at the actor's root, actor alive | live | runs | held | the trait; never a gap |
| `.each` copy removed | released | runs (Runtime-owned) | held, unplaced | parked for the path; a new copy for the key adopts (rule 54); never: stays until the actor ends (decided, F6) |
| A copy removed whose fragment releases on leave (rule 60) | released | interrupted; its ending is released when it lands | released now | nothing: evidence |
| `.each` copy added in a turn that also raises into it | the raise runs first | — | — | the raise, then adopted endings (rule 54) |
| Two copies, one lane | own | the first path's; another path's commit ends `NotSent { Rejected }` | the first path's | the first path's copy only |
| Writing root trait inside a copy (FP 2.10) | own | the copy's path `["X"]` | `["X"]`'s | copy X's inner trait only |
| `.resumable()` frozen | placements released; lookups end `Interrupted`, parked with the slice (persisted) | runs | held | parked; at thaw the same incarnation, interrupted lookups first; `activities` placed again (rule 52) |
| `resetOn` reset (F8) | released; placed again | runs | held | the incarnation with the old value, when it returns (rule 54); with rule 60, released |
| Node trait left, subroutine left (phase 2) | released | runs | held, unplaced | the next incarnation with the same path |
| Actor disposed | released | unchanged (OD19) | unchanged | the identity's next incarnation, then the path's placement; parked for a persisted identity, evidence otherwise (OD21); a releasing mark survives |
| Rebind or restore | placed per state | delivered when it lands, or released if marked | `unknown { Restored }` once, or released if marked | the incarnation with the lane's path, if active; else parked |
| Runtime disposal, SSR | as 2.7.13 | as 2.7.13 | as 2.7.13 | as 2.7.13 |

Store and cache effects never wait: a domain write's prediction, confirmation, rollback and marks apply at settlement
(rule 27), and `writes` is on the operation (OD26).

#### 2.9.3 The write lane's fragment rows

The lane's states (`Idle`, `InFlight`, `Held`, `W`), its 16 rows and both policy tables (2.7.13) are unchanged.
Delta:

| Row | Before (2.7.13 before this merge) | After |
| --- | --- | --- |
| **lane created** (`commit` in `Idle`) | mint an Attempt → `InFlight` | as before, and the lane records the committing incarnation's subject path |
| **member from another path** | — | `commit`: `NotSent { Rejected }`, delivered to the asking incarnation, lane unchanged; `retry`: evidence `NothingToResend`; `cancel`: nothing, with evidence; `retryable`: denies `NothingToResend`; `idle`: denies by the lane's state; `get`: the real row |
| **lane becomes `Idle`** | removed | removed once it also holds no parked ending; the path and any mark go with it |
| **dispose** | the binding actor ends | the binding incarnation ends: the actor is disposed, or the incarnation with the lane's path ends. Cells unchanged, except the parking row below |
| **freeze** | — | as dispose for writes; lookups end `Interrupted`, parked (rule 52) |
| **rebind** | an incarnation of the same identity starts | an incarnation starts at the placement with the lane's path (an entry, a copy, a reset, the actor's rebind). Cells unchanged; a releasing mark is cleared |
| **thaw** | — | the frozen incarnation resumes: parked endings delivered (interrupted lookups first); `activities` placed again; no `unknown { Restored }`; `W` stays |
| **parking condition** | parked if the identity has a saved record, else evidence | also parked while the actor is alive and no incarnation has the lane's path, unless the lane is releasing; on actor disposal the existing rule decides (OD21) |
| **delivery order** | before any external event of a new actor incarnation | follow-up turns after the starting turn (whose own raises come first), after pending resets, before any later event addressed to the incarnation (rule 54) |

**The releasing rows** (rule 60; decided, F9). A lane is marked releasing when the incarnation with its path ends and the
operation is listed in that incarnation's `whenAbandoned`. Cells, by state at marking, then for later events:

| Row | `Idle` | `InFlight` | `Held` |
| --- | --- | --- | --- |
| **mark** (leaving turn, step 5) | nothing; a parked ending for the path becomes evidence and the record is removed | on the wire: interrupt (as `cancel`); waiting, never sent: ends `NotSent { Cancelled }`, evidence; a waiting re-send: released (`Released`); every `W` entry ends `NotSent { Cancelled }`, evidence; parked endings become evidence | released (`Released`), with merge 4's store row for `Released` (the record keeps its mark, its queue entry is withdrawn); every `W` entry ends `NotSent { Cancelled }`, evidence; parked endings become evidence |
| **an ending lands** (success, failure, unknown, interrupt) | cannot occur | applied to the lane and store (rule 27), then evidence; an unknown is `Released` evidence; the lane becomes `Idle` | cannot occur |
| **restore** (a reload, persisted identity) | nothing | the restore row's `unknown { Restored }` is applied, then `Released` evidence; nothing is delivered or parked | stays released (it already is) |
| **rebind** (an incarnation with the lane's path starts) | cannot occur | the mark is cleared; the lane is adopted (rule 54) | cannot occur |
| **dispose, Runtime disposal** | — | the mark is captured with the lane record; the rows above apply when the ending lands or the record is restored | — |

**Under `cancel` and `allow`** (FP RV3 L4): a lane in `HeldThisTurn` or `Held (parked)` is released at marking, as
`Held` is; under `allow` the rows apply per Attempt. **Order and capture** (FP RV3 L5): in step 5 the marks apply after
every member of the turn, so a commit in a copy the same turn removes is marked too; the mark is captured no later
than the actor record that drops the incarnation, so a crash between the two captures cannot lose it.

Every other row is unchanged. OD25's parked `Held` row reads "no binding incarnation" for "no live actor". Inspection
lists a releasing lane as such.

#### 2.9.4 Persistence and rebind

- **A lane record names no instance path.** The operation is found by contract id (rule 51).
- **The lane record carries its subject path** (strings) **and its releasing mark** (a flag). Both decode without the
  machine.
- **A recorded path whose shape the placement cannot produce** (FP RV1 M4, FP RV2 M3): after a version that moves a write
  from the host into a fragment, adds or removes `resetOn`, or adds or removes a level of `.each`, a lane's recorded
  path no longer fits. It is adopted by key equality only when the placement's last subject part **is the contract's
  single key field**: for `.each`, `by` names that field (FP 4.1: `by: "docId"`, `key: ["docId"]`, so a held save of `d1`
  becomes path `["d1"]`); for `resetOn`, the reset value is that field's value. Otherwise it goes to `orphaned` (P19),
  stated. A subjectless lane adopted by a root trait at the actor's root needs nothing (its path is `[]`).
  Membership of bare strings has no `by`, so it does not pass the test: after FP 4.4's upgrade (a board with bare-string
  `issueIds`), a held like from the host-only form goes to `orphaned`, stated (FP RV3 L3).
- Parked endings of an unplaced path are on the lane record (OD22), captured, and listed by Inspection and
  `runtime.unsettledWrites()`; a releasing lane leaves that list once its ending lands.
- A version that removes the fragment's operation sends the lane to `orphaned` (P19).

#### 2.9.5 Static analysis, the single graph, `flow check`, and the wiring authors repeat

- **One graph.** A fragment's operations are nodes under its placement; `flow graph` and `flow explain` draw them from
  the summary (`docs  SaveDue → commits save (docs/save, reject, one lane per docId, subject = copy key)`). Inspection
  lists every lane with its operation path, subject path, and whether it is **unplaced** or **releasing**.
- **`flow check` adds no finding name.** `SharedContract` widens (F2). `UnresolvedHold` and rule 20's adopted-ending
  check run inside each fragment (rule 55) and gain rule 56's arrivals and structural warning at the host. Rule 20's `NotSent`
  list gains "a mapped write on a placement whose subject path is not empty (`Rejected`)". An acting member used
  outside its fragment, a rule 48 violation and a non-string `resetOn` on a writing placement are construction or type
  errors.
- **Typing.** `Fragment.O` is typed from the declaration and has only write operations' reads. Members are branded
  with their fragment. Key-less `O.x.cancel` type-checks in `whenAbandoned` on any write operation. The fragment's `R`
  reaches the host (rule 57).

| Wiring | Where it appears | Same in every app? | Decision |
| --- | --- | --- | --- |
| Keep busy keys in `.each` membership (FP 4.4's `Listed` line) | like, follow | yes, word for word | **keep** (decided, F6, F9): release on leave would drop user intent (FP RV2 H3). It is one line per host; rule 56 warns where it is missing |
| Stop a predecessor by raising its `Cancel` (avatar) | upload | yes | **absorbed** (decided, F9): `whenAbandoned: [O.put.cancel]` in the fragment |
| A list of one so a root trait can change its thing | editor switching documents, avatar | yes | **absorbed** (decided, F8): `resetOn`, its value a subject part |
| The retry-budget triplet (`retryable` else `cancel` and notify; a schedule that `retry`s) | every write | the shape, not the budget, delay or give-up reaction | **keep**: it is what a fragment is for, written once per fragment. A generic reconcile fragment cannot be written (rule 13's exhaustive `failure`) |
| A second `cancel` after `unknown { Cancelled }` to release a user's stop | upload | no: a tombstone clean-up needs the hold (2.7.7) | **keep**; "release on user cancel" goes to [open-items.md](../../proposals/open-items.md) |
| A 0 ms `Flow.entry` schedule to commit on creation | upload | yes, but once per fragment | **keep** (F7: no entry hook); rule 54's `idle` default makes it safe |
| Mirroring status from endings into memory for a row | upload, autosave | partly: `pending`, `uncertain`, `progress` are rows already | **keep** |
| Drafts pruned against the list's ids (rule 33) | comments | the shape; what a draft is differs | **keep** |
| View-minted client ids | comments | yes | **keep for now**: a key must exist before the commit (rule 39), and a turn has no randomness source (section 7 item 12) |
| `writes` invalidation of a thread's list on each post | comments | no | **keep** |
| Toast callbacks with fixed text | like, follow | no | **keep** |

#### 2.9.6 Examples

**Autosave, used by several documents (`.each`).** Edits are debounced 800 ms; one save per document in flight;
edits during a save are coalesced and the newest body goes next with the etag the save returned (the contract is
`reject` and the fragment coalesces, since a queued `latest` commit would carry a stale etag); a 412 is a conflict the
user resolves with "keep mine"; an unknown is re-sent as the same write every 2 s, three times, then released.
Closing a document is refused while it is dirty or its save is unresolved. The contract is `docs/save` (`input: {
docId, body, etag }`, `key: ["docId"]`, `concurrency: "reject"`), whose commit calls `DocsApi.put`, a wrapper of
`fetch("PUT /docs/:id", { headers: { "If-Match", "Idempotency-Key": attempt.id }, signal })` ([the record](merged/fragment-operations/proposal.md) 4.1).

```ts
// autosave.trait.ts
import { deny, Flow, trait } from "flow-state"                                       // existing
import { Schema } from "effect"
import { saveDoc } from "./docs.contracts"

export const MAX_RESENDS = 3                                                          // user-defined

export const Autosave = trait(                                                        // existing: trait; user-defined: Autosave
  {
    id: "Autosave",
    events: { Edited: { body: Schema.String } },                                     // existing: events; the editor view sends it
    hostEvents: { Overwrite: {} },                                                   // existing: hostEvents; the host keeps this version after a conflict
    internalEvents: {                                                                // existing; also this fragment's operations' endings (rule 49)
      SaveDue: {}, ResendDue: {},
      Saved: { etag: Schema.String }, Conflict: { serverEtag: Schema.String, mine: Schema.String }, Refused: {},   // mine: the body the refused save carried (FP RV1 M9)
      SaveUnsure: Flow.uncertain({}),                                                // existing: Flow.uncertain
    },
    callbacks: { onStalled: Flow.optional(Flow.Callback({})) },                     // existing: callbacks, Flow.optional, Flow.Callback
    memory: {
      docId: Flow.input(Schema.String), body: Flow.input(Schema.String), etag: Flow.input(Schema.String),   // existing: Flow.input
      status: Flow.initial(Schema.Literals(["clean", "dirty", "saving", "unsure", "conflict", "stalled"]), "clean"),
      serverEtag: Flow.initial(Schema.NullOr(Schema.String), null),
      rev: Flow.private(Flow.initial(Schema.Int, 0)),                                // existing: Flow.private; edits seen
      sentRev: Flow.private(Flow.initial(Schema.Int, 0)),                            // edits in the last commit
    },
    operations: ({ E }) => ({                                                        // existing key; in a fragment (rule 49)
      save: saveDoc.outcomes({                                                       // existing: outcomes; user-defined: save
        success: E.Saved.from((v) => ({ etag: v.etag })),
        failure: { Conflict: E.Conflict.from((r, { input }) => ({ serverEtag: r.serverEtag, mine: input.body })), Refused: E.Refused, NotSent: E.Refused },   // existing: the mapper's input
        unknown: E.SaveUnsure,
      }),
    }),
  },
  ({ E, O, callbacks }) => {                                                         // O, this fragment's own handles (rule 50); no whenAbandoned: a closed document's save is kept for its return (rule 54)
    const own = ({ memory }: { memory: { docId: string } }) => ({ docId: memory.docId })   // user-defined: this document's lane
    const send = O.save.commit(({ memory }) => ({ docId: memory.docId, body: memory.body, etag: memory.etag }))   // existing: commit; after memory (rule 22)
    return {
      schedules: {
        settle: { schedule: "800 millis", armOn: [E.Edited, E.Overwrite], send: E.SaveDue },   // existing: armOn; a debounce
        resend: { schedule: "2 seconds", armOn: [E.SaveUnsure], send: E.ResendDue },
      },
      on: {
        Edited: { target: "self", updateMemory: ({ memory, event }) => ({ body: event.body, rev: memory.rev + 1, status: memory.status === "clean" || memory.status === "stalled" ? "dirty" : memory.status }) },
        SaveDue: [
          { target: "self", guard: [({ memory }) => memory.status === "dirty" || deny("NotDirty"), O.save.idle(own)], updateMemory: ({ memory }) => ({ status: "saving", sentRev: memory.rev }), actions: [send] },   // existing: idle
          { target: "self" },
        ],
        Saved: [                                                                     // current, or adopted by a reopened copy (rule 54)
          { target: "self", guard: ({ memory }) => memory.rev > memory.sentRev || deny("NoNewEdits"), updateMemory: ({ memory, event }) => ({ etag: event.etag, sentRev: memory.rev }), actions: [send] },
          { target: "self", updateMemory: ({ event }) => ({ etag: event.etag, status: "clean" }) },
        ],
        Conflict: { target: "self", updateMemory: ({ memory, event }) => ({ status: "conflict", serverEtag: event.serverEtag, body: memory.rev > memory.sentRev ? memory.body : event.mine }) },   // adopted by a fresh copy: keeps the user's text from the event (FP RV1 M9)
        Refused: { target: "self", updateMemory: () => ({ status: "stalled" }), notify: [callbacks.onStalled] },
        SaveUnsure: { target: "self", updateMemory: () => ({ status: "unsure" }) },  // Held; `resend` arms
        ResendDue: [
          { target: "self", guard: [O.save.retryable(own, { times: MAX_RESENDS })], updateMemory: () => ({ status: "saving" }), actions: [O.save.retry(own)] },   // existing: retryable, retry; the same Attempt
          { target: "self", updateMemory: () => ({ status: "stalled" }), actions: [O.save.cancel(own)], notify: [callbacks.onStalled] },   // existing: cancel; give up, release (OD7); the released save may still land, and If-Match turns that into a Conflict (FP RV3 L5)
        ],
        Overwrite: { target: "self", updateMemory: ({ memory }) => ({ etag: memory.serverEtag ?? memory.etag, serverEtag: null, status: "dirty" }) },
      },
    }
  },
)
```

The host decides only when a document opens and closes, and what "keep mine" means:

```ts
// workspace.definition.ts (after)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Autosave } from "./autosave.trait"

const OpenDoc = Schema.Struct({ docId: Schema.String, title: Schema.String, body: Schema.String, etag: Schema.String })   // user-defined: what GET /docs/:id returned

export const Workspace = definition({
  id: "Docs/Workspace",
  states: ["READY"],
  events: {
    Open: { docId: Schema.String, title: Schema.String, body: Schema.String, etag: Schema.String },
    Close: { docId: Schema.String },
    KeepMine: { docId: Schema.String },
  },
  memory: { open: Flow.initial(Schema.Array(OpenDoc), []) },
  traits: { docs: Autosave.each({ of: "open", by: "docId", max: 20 }) },             // existing: .each, of, by, max; one copy per open document
})
```

```ts
// workspace.machine.ts (after)
import { deny, machine } from "flow-state"
import { Autosave } from "./autosave.trait"
import { Workspace } from "./workspace.definition"

type Memory = typeof Workspace.Memory.Type
const copy = (m: Memory, docId: string) => m.docs.find((d) => d.key === docId)       // user-defined: a copy's public memory (rule 9)

export const WorkspaceMachine = machine(Workspace, ({ S, E }) => ({
  default: S.READY,
  traits: { docs: { input: ({ item }) => ({ docId: item.docId, body: item.body, etag: item.etag }) } },   // existing: one filling for every copy; onStalled left out
  on: {
    Open: { target: "self", guard: ({ memory, event }) => !memory.open.some((d) => d.docId === event.docId) || deny("AlreadyOpen"), updateMemory: ({ memory, event }) => ({ open: [...memory.open, event] }) },
    Close: {
      target: "self",
      guard: [Autosave.O.save.idle(({ event }) => event), ({ memory, event }) => copy(memory, event.docId)?.status !== "dirty" || deny("Unsaved")],   // the host reads the fragment's lane (rule 50)
      updateMemory: ({ memory, event }) => ({ open: memory.open.filter((d) => d.docId !== event.docId) }),
    },
    KeepMine: {
      target: "self",
      guard: ({ memory, event }) => copy(memory, event.docId)?.status === "conflict" || deny("NoConflict"),
      raise: [E.docs.Overwrite.from(({ event }) => ({ key: event.docId }))],         // existing: a raise into one copy
    },
  },
  states: { READY: {} },
}))
// view: useView(ws, (s) => Autosave.O.save.get(s, { docId }).pending)   // Fragment.O read from a view
//       send(Workspace.E.docs.key(docId).Edited({ body }))
```

The host writes nothing about I/O; it reads `Autosave.O.save` (`idle`, `get`). Its `Close` guard carries the
`Autosave.O.save.idle` token, so rule 56's structural `.each` check passes, and a user cannot strand a save; a
disposed workspace can, and the reopened copy then adopts the save, including a `Conflict` that still carries the
user's text. Autosave has no release on leave: unsaved edits are user intent (rule 60). The copy's key is the
document id and the contract's key is `["docId"]`, so each lane's subject path is its own document (rule 51), and a
lane a host-only form left is adopted by key after an upgrade (2.9.4).

**A like button over an entity-domain write (`.each`).** 2.8.2's like, moved into a fragment: the view sends the value
it wants; `latest` queues one newer toggle behind a held one; the store predicts, confirms and rolls back; an unknown
is re-sent as the same write every 3 s, three times, then released with a notice. `Issues.setLike` and `Issues.list`
are 2.8.2's domain entries (`key: ["id"]`, `latest`).

```ts
// likebutton.trait.ts
import { Flow, trait } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"

export const MAX_LIKE_RESENDS = 3

export const LikeButton = trait(                                                      // user-defined: LikeButton
  {
    id: "LikeButton",
    events: { Toggle: { liked: Schema.Boolean } },
    internalEvents: { Settled: {}, Gone: {}, Failed: {}, LikeUnsure: Flow.uncertain({}), ReconcileDue: {} },   // endings (rule 49)
    callbacks: { onGone: Flow.Callback({}), onFailed: Flow.optional(Flow.Callback({ message: Schema.String })) },
    memory: { id: Flow.input(Schema.String) },
    operations: ({ E }) => ({                                                        // in a fragment; registers the Issues domain for its actor (rule 49)
      set: Issues.setLike.outcomes({ success: E.Settled, failure: { Gone: E.Gone, Refused: E.Failed, NotSent: E.Failed }, unknown: E.LikeUnsure }),
    }),
  },
  ({ E, O, callbacks }) => {
    const own = ({ memory }: { memory: { id: string } }) => ({ id: memory.id })
    const failed = (message: string) => callbacks.onFailed.from(() => ({ message }))
    return {
      schedules: { reconcile: { schedule: "3 seconds", armOn: [E.LikeUnsure], send: E.ReconcileDue } },
      on: {
        Toggle: { target: "self", actions: [O.set.commit(({ memory, event }) => ({ id: memory.id, liked: event.liked }))] },   // a toggle while unsure waits behind the hold (OD5)
        Settled: { target: "self" },
        Gone: { target: "self", notify: [callbacks.onGone] },
        Failed: { target: "self", notify: [failed("Couldn't update the like")] },
        LikeUnsure: [
          { target: "self", guard: [O.set.retryable({ times: MAX_LIKE_RESENDS })] },   // key-less: this ending's Attempt (OD8); `reconcile` re-sends
          { target: "self", actions: [O.set.cancel], notify: [failed("Couldn't confirm your like")] },   // give up: release; a waiting toggle is then sent
        ],
        ReconcileDue: { target: "self", actions: [O.set.retry(own)] },              // the same request, no new prediction (rule 31)
      },
    }
  },
)
```

The board places one copy per listed issue:

```ts
// board.definition.ts (after)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"
import { LikeButton } from "./likebutton.trait"

export const Board = definition({
  id: "Issues/Board",
  states: ["READY"],
  events: { Dismiss: {} },
  internalEvents: { Listed: { ids: Schema.Array(Schema.String) } },
  memory: {
    projectId: Flow.input(Schema.String),
    issueIds: Flow.initial(Schema.Array(Schema.String), []),                         // membership is host data (rule 9)
    toast: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  traits: { likes: LikeButton.each({ of: "issueIds", max: 500 }) },                  // existing: .each
  operations: ({ E }) => ({ issues: Issues.list.outcomes({ value: E.Listed.from((v) => ({ ids: v.issues.map((i) => i.id) })) }) }),
})
```

```ts
// board.machine.ts (after)
import { machine } from "flow-state"
import { LikeButton } from "./likebutton.trait"
import { Board } from "./board.definition"

const busy = (row: { pending: boolean; uncertain: boolean; waiting: boolean }) => row.pending || row.uncertain || row.waiting

export const BoardMachine = machine(Board, ({ S, O }) => ({
  default: S.READY,
  traits: {
    likes: {
      input: ({ key }) => ({ id: key }),
      callbacks: { onGone: { actions: [O.issues.refetch] }, onFailed: { updateMemory: ({ payload }) => ({ toast: payload.message }) } },
    },
  },
  states: {
    READY: {
      activities: [O.issues.subscribe(({ memory }) => ({ projectId: memory.projectId }))],
      on: {
        Listed: { target: "self", updateMemory: ({ memory, operations, event }) => ({ issueIds: [...event.ids, ...memory.issueIds.filter((id) => !event.ids.includes(id) && busy(LikeButton.O.set.get(operations, { id })))] }) },   // a host read (rule 50); keeps a copy whose like is unresolved (decided, F6, F9: a like is user intent, so it is never released on leave)
        Dismiss: { target: "self", updateMemory: () => ({ toast: null }) },
      },
    },
  },
}))
// view: useView(board, (s) => LikeButton.O.set.get(s, { id }).pending)  and  send(Board.E.likes.key(id).Toggle({ liked: !row.data.liked }))
```

A second host, an issue page with one like button at the root, writes only the placement and its filling:

```ts
// issuepage.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { LikeButton } from "./likebutton.trait"

export const IssuePage = definition({
  id: "Issues/IssuePage",
  states: ["SHOWING", "GONE"],
  memory: { issueId: Flow.input(Schema.String) },
  traits: { like: LikeButton },
})
```

```ts
// issuepage.machine.ts
import { machine } from "flow-state"
import { IssuePage } from "./issuepage.definition"

export const IssuePageMachine = machine(IssuePage, ({ S }) => ({
  default: S.SHOWING,
  traits: { like: { input: ({ memory }) => ({ id: memory.issueId }), callbacks: { onGone: S.GONE } } },   // onFailed left out (optional)
  states: { SHOWING: {}, GONE: {} },
}))
```

The board's `Listed` line keeps a copy whose like is unresolved (F6): a like is user intent, so it is never released
on leave (F9), and rule 56's structural warning stays on the board, because reading lanes in `updateMemory` is not a
token. Store effects (predictions, rollback, `uncertain` marks, the record queue) apply at settlement whether a copy
exists or not (rule 27); two screens liking one issue are two actor identities, ordered by the record queue (rule 29).

**The subject path, walked: a writing root trait inside an `.each` copy.**

```ts
// issuerow.trait.ts                                                                    // user-defined: IssueRow
export const IssueRow = trait(
  { id: "IssueRow", memory: { id: Flow.input(Schema.String) }, traits: { like: LikeButton } },   // existing: traits in a fragment; LikeButton at IssueRow's root
  () => ({ traits: { like: { input: ({ memory }) => ({ id: memory.id }) } } }),
)
// board.definition.ts
traits: { rows: IssueRow.each({ of: "issueIds", max: 500 }) },                             // existing: .each
```

Rule 48 admits it (an `.each` copy, then a root trait of that copy; no subroutine). The inner `like` incarnation's path is
`["X"]` in row X and `["Y"]` in row Y (rule 51).

1. Row X's like ends unknown. The lane (board, `issues/set-like`, `{ id: X }`) records path `["X"]`.
2. A host without the like example's keep-busy line removes X. Y is live at the same placement, but its path is `["Y"]`, so Y is
   not the binding incarnation. X's endings are parked for `["X"]` (rule 53); rule 56's structural warning fires on the
   host's `issueIds` write (it fires with the keep-busy line too, which is not a token).
3. Y's own toggles create or use the lane `{ id: Y }` with path `["Y"]`; a stray `retry` from Y on X's lane is
   `NothingToResend` (rule 51). Y's rows list only `["Y"]`'s lanes (rule 59).
4. X is re-added (a later list holds it): the copy X's inner `like` has path `["X"]`, adopts the
   lane, receives the parked unknown, and its `reconcile` re-sends it.

The same holds under `resetOn`: an Autosave at the root with `resetOn: docId` has path `["d1"]` while on `d1`, and
`["d2"]` after a switch; `d1`'s lanes wait for `["d1"]` (2.9.2).

### 2.10 Stories

Stories (merge 3, [merged/stories/proposal-v2.md](merged/stories/proposal-v2.md), revision 3; decisions Stories T1–T7), amended
2026-11-01 ([merged/story-checks/stories-amended.md](merged/story-checks/stories-amended.md) section 3, with the `Fake` module of
[merged/story-checks/fakes-v2.md](merged/story-checks/fakes-v2.md); plan
[merged/story-checks/merge-plan.md](merged/story-checks/merge-plan.md)).

**Marks and citations.** **SC*n*** and **W*n*** are owner-confirmed decisions ("Decisions", Stories, amended; SC*n* is the record's C*n*, renamed
because a bare C*n* is a row of section 5). **[P]** is proposed by the amended proposal, and **[fakes-v2]** is a proposed `Fake` spelling (W35):
the owner approved the proposal as a whole, not each of these. No mark means carried from the Stories merge, where "Stories T*n*" is a delegated decision
(a bare T*n* is a tooling row of section 5). STR*n*, STF*n*, SG*n* and "brief C*n*" are the brief's ([merged/stories/brief.md](merged/stories/brief.md)); SP is the earlier
proposal, with its reviews (SP RV, SP RV2), model (SP MDL), root causes (SP RC) and new changes (SP N1–N4). SA H*n* is the record's table 1.3; SA RV1–SA RV3 are its
reviews ([merged/story-checks/reviews/](merged/story-checks/reviews/)); SA MDL is its model; v3 is [merged/streams/proposal-v3.md](merged/streams/proposal-v3.md), whose design is 2.11; Streams T*n* are 2.11.11's tables.

Rules 61–66 are normative; this section shows them, and 2.10.17's tables are normative for the executor. The examples
are 2.10.18.

**Where the inputs come from.** Production gets input from three places: **the user** (sends and lifecycle), **time**
(the Clock) and **the world** (servers, the network, storage). A Story is a plan of those inputs, as data, with named
**checkpoints** (SC1). Each input is applied to the production Runtime, which is then left to do everything it would do
before the next input could arrive (rule 61). The world is a set of **fakes** that hold server truth and answer through
the real transport boundary; Flow never injects an ending, so the commit's own classification always runs (rule 62, W12).
What a **test** checks is a value read from a checkpoint, a **cut** a step left (rule 64), with the runner's own `expect`,
one way to name a thing (an **address**, rule 65) and one home per kind of record.

**Concepts per tier** (recounted **[P]**; 3.6 has the words with their marks). The Stories merge's table said 13, 18 + 8 and
5. That omitted options and every word inside a fake, so it undercounted. Below is every word this section shows an author typing,
on the Story side and the fake side. Not counted: the runner's `expect`; fields read off a record (`phase`, `via`, `channel`,
`reason`, …), since they are read, not written; record-kind strings (21, 2.10.6); error names, since they are raised; and words of
the design used here, such as `deny` (SA RV1 L4).

| Tier | Count | Words |
| --- | --- | --- |
| **Common** (a scripted test of one machine, as 2.10.18.1–2) | **34** new, 5 reused | Story, 10: `Story.machine`, `id`, `fixtures`, `world`, `send`, `advance`, `next`, `checkpoint`, `run`, `checkpoints`. Reads, 8: `read`, `lane`, `records`, `since`, `attempt`, `n`, `now`, `run.end`. Fake, 11: `Fake.server`, `truth`, `initial`, `endpoints`, `Fake.call`, `request`, `handle`, `response`, `controls`, `Fake.control`, `Fake.Lost`. Wire, 5: `hold`, `release`, `drop`, `at`, `times`. Reused: `input`, `state`, `memory`, `operations`, `schedules` |
| **Uncommon** (apps, fragments, domains, reloads, tabs, streams, transports, SSR) | **43** new, 13 reused | Subjects, 2: `Story.app`, `Story.fragment`. Steps and options, 12: `together`, `dispose`, `how`, `reload`, `guards`, `suspended`, `from`, `subject`, `end` (on `leave`), `settled`, `turn`, `step` (the last three in `checkpoint(…, { at })`). Wire, 4: `duplicate`, `match`, `purpose`, `after`. Fake, 20: `Fake.storage`, `Fake.stream`, `frame`, `open`, `ping`, `every`, `frames`, `refuse`, `end` (on `open`, and `socket.end`), `send`, `close`, `Fake.fetch`, `endpoint`, `params`, `query`, `body`, `headers` (the route context), `Fake.webSocket`, `Fake.Refused`, `Fake.Closed`. Reads, 5: `inspection`, `entity`, `tabs`, `run.frames`, `truncated`. Reused: `ensure`, `openTab`, `closeTab`, `enter`, `leave`, `setContext`, `dehydrate`, `hydrate`, `within`, `maxBytes`, `label`, `serverView`, `input` (in a route) |
| **Rare** (policy cells, property tests, upgrades) | **17** | `to`, `reset`, `nth`, `storage`, `Fake.storage.seed`, `Fake.storage.from`, `seed`, `propertyTest`, `steps`, `properties`, `whenQuiet`, `runs`, `length`, `quietWithin`, `domainPropertyOptions`, `Story.Frame`, `Story.Step` |
| **Total** | **94** new, 18 reused | v3's `ping` and `every` add 2 [v3 item 1]. Round 2's cuts of `message` and `signal` took 2. `Story.World` became `Story.Step`, same count. `release({ match })`, the data forms and round 3's rules add no word |

**Removed** from the plans' Story surface: `process()` (W2), `advanceTo`, `advanceToNextTimer` (W6), the `frames` option and
frame collapse (W22), `run.calls`, `checkpoint.exit` (W34), the checkpoint predicate (SC2, C16), `Story.ending` (never
adopted, W12), `Story.make` and the lowercase `story.app` / `story.machine` (W1), `.expect`, `StoryExpectationFailed`,
`Story.property`, the `properties` option on a Story (SC1, W25), `Story.records`, `Story.inspection`, `Story.entity`,
`Story.attempt`, `Story.now` (W24), earlier streams proposals' `.do(…)` (W37) and `story.suspend` (W9), `model()` (W39), `run`'s `signal` (W43) and `frames` (W22; SA RV2 section 8), and
Testing O4's `pending` for work.

#### 2.10.1 What a Story is

`Story.app(setup, options)`, `Story.machine(machine, options)` and `Story.fragment(fragment, options)` (W1) each return an
inert plan (STR2): the subject, its options and an ordered list of steps. The kind is visible on the line; handing the
wrong kind to a constructor is a type error. Constructing, importing and discovering a Story start nothing. Each chained
step returns a new plan; a prefix never changes, and nothing in a prefix depends on later steps (rule 66), so branches are
plain variables and each branch runs in a fresh Runtime. A plan holds inputs and checkpoints, and no checks (SC1).

| Constructor | Subject | Options (exactly what the subject declares, STR1) | Steps that type-check beyond the common ones |
| --- | --- | --- | --- |
| `Story.app` | an app setup (`RuntimeSetup`) | `id`, `fixtures?`, `world?`, `storage?`, `seed?` | `ensure(ref)`, `dispose(ref, { how? })`, `send(target, …events)`, `openTab`, `closeTab`, `reload`, `dehydrate`, `hydrate` |
| `Story.machine` | a machine | `id`, `input` (iff declared), `context` (iff declared), `fixtures?`, `world?`, `seed?` | `send(…events)`, `setContext`, `dispose()`, `ensure()` (another incarnation of the same identity) |
| `Story.fragment` | a trait or a subroutine alone | `id`, `fixtures?`, `world?`, `seed?` (input is given at `enter`) | `enter(input?, { subject? })`, `leave(options?)`, `guards(answers)`, `reset(subject)` (traits), `send` of `events` and `hostEvents` |

**The start** (SP RC3, SP N1; W13). A run builds the fake servers, applies the `world` option's controls to them in order
(server controls and standing wire rules; nothing is held yet, since nothing has been sent), and only then bootstraps
the first tab (an app) or starts the subject's actor (a machine; a fragment is started by `enter`). So "the server
already holds X when the screen opens" is one option, printed by `describe`, and the actor's first read meets it.
`world` is the same data `.world(…)` takes; there is no second spelling.

**Targets** (rule 65, SP N2). In an app Story a step names its actor with a ref, or with an address when more must be
said: `{ actor: Workspace, tab: "b" }`. A send takes a target, then events: `send(target, …events)`; there is no
trailing options object, so the event list stays unambiguous to the type checker. A machine Story's steps need no
target. A fragment inside an author-written test host is a machine Story over that host. Every subject's Effect
requirements (`R`, a fragment's through rule 57) must be met by `fixtures`, so a missing fake is a type error at the
constructor (STR12, STR63).

**Ids and discovery** (STR4, STF61, STF73). An id is non-empty and **unique across the configuration**, so `flow story
run <id>` needs no scope. `defineConfig({ apps: [{ app, stories }], stories })` lists app Stories under their app and
Stories with no app at the top level; a trace of the latter has `appId: null`. Discovery rejects duplicate ids before
acquiring anything (Testing O1).

**Every step has a data form** [P, SA RV1 H3, SA RV2 M10], keyed by its own method name, with no new word. `Story.Step` is the type of any of them, so a helper can annotate one, since an unannotated literal widens to an array and fails to assign; the `world` option is `ReadonlyArray<Story.Step>` narrowed to controls.

| Step | Data form |
| --- | --- |
| `send` | `{ send: [target?, ...events] }`; a bare event on a machine or fragment Story |
| `world` | a control; `{ world: [...controls] }` |
| `advance` | `{ advance: d }`, `{ advance: { next } }`, `{ advance: { to } }`, `{ advance: [d, { suspended }] }` |
| `together` | `{ together: [...inputs] }` |
| `ensure`, `dispose` | `{ ensure: [ref?, options?] }`, `{ dispose: [ref?, options?] }` |
| `enter`, `leave`, `reset`, `guards` | `{ enter: [input?, options?] }`, `{ leave: options }`, `{ reset: subject }`, `{ guards: answers }` |
| `setContext` | `{ setContext: context }` |
| `openTab`, `closeTab`, `reload` | `{ openTab: [name, options?] }`, `{ closeTab: name }`, `{ reload: name }` |
| `dehydrate`, `hydrate` | `{ dehydrate: [label, options] }`, `{ hydrate: [source, label?] }` |
| `checkpoint` | `{ checkpoint: [name, options?] }` |

**`together` takes a send, a control or `{ advance }`, and anything else is a type error**, since nothing else has a defined meaning there; a nested `together` is one. `propertyTest`'s `steps` take every form but `checkpoint`. `describe` prints these.

**Running** (STR3). `story.run()` is the one execution boundary. It takes no `signal` (W43): a run never yields to the host (rule 61), so `abort()` could not be called during one, and a runner's timeout cannot interrupt a run; it reports when the run ends, so a finished run over the limit fails with "Test timed out" [P, SA RV2 M1, SA RV3 M2]; the hop cap, the turn limit and the deadline limit bound it. C75 lists the change to Testing O8. It returns a `StoryRun` (`frames`, `steps`,
`checkpoints`, `end`, `evidence`, `payloads`, `trace`; cuts for every step exist per W22, and their list is internal, for the player [P, SA RV1 section 8]), or rejects with a `FlowError` that carries the same evidence up to
the failing boundary (Testing O8). **It rejects on a real Story error** (`StoryTurnLimit`, `HostTimeWait`,
`StoryInvalidCommand`, `InvalidDuration`, a failed acquisition, a cleanup failure) **or a broken fake**
(`StoryFakeError`, 2.10.4), never because of a value (SC1), so after a resolve every declared checkpoint is present and typed
**[P, SA H15, SA RV1 H4]**. **The earliest recorded error is primary, and later ones are listed** [P, SA RV2 M6]: a route typo that makes a later `release` `NothingHeld` reports the route. **Classification runs at every rejection boundary, and "earliest" orders by the step where a fiber parked** [P, SA RV3 M5], so a commit parked on a real `fetch` at step 2 and a `NothingHeld` at step 4 report the `fetch`. A fiber's parked step is the last step whose settle saw it run; how to read that is left to the executor (`currentOpCount` is untested) [SA RV3 section 2]. `InvalidInput` is the one edge where a value rejects: it is a contract check by the fake's author, and a Story of the server refusing bad input declares a loose `request` and answers 422. **`run()` writes each diagnostic through `console.warn` at its end** (`UnusedWireRule`, 2.10.4); it fails nothing, and it is how a test runner's reader is told [P, SA RV2 M7]. Each `run()` is a fresh run; a test that reads several checkpoints runs once and destructures. A checkpoint
and its Story cannot share a name there: `const { paid } = (await paid.run()).checkpoints` is TS2448. Keep SC5, and name the
Story differently: `const { paid } = (await paidFirstTime.run()).checkpoints` [P, SA RV1 M10]. Direct and CLI runs agree.

#### 2.10.2 Steps, and what each one runs (rule 61)

**Settling** (W2, W4; Stories T5 B1, T7; the mechanism is [P, SA RV1 H1, SA RV2 H1, M1, M2]). **A run never yields to the host between its first step and its cleanup.** The executor runs every tab's Runtime and every fake on one deterministic, **microtask-only** run scheduler: Effect 4.0.5's `MixedScheduler` with `executionMode: "sync"`, whose dispatcher uses `setMicrotask` and never hands a fiber to a macrotask. So no host task runs during a run, and the result never depends on host speed. The start acquires fixtures and bootstraps as a step would, settling [SA RV2 L3]. **A build still parked after the start's settle with no deadline rejects there**, since nothing can wake it [P, SA RV3 M5]; a fixture needing host work finishes it before the Story runs, by a top-level `await` in the module, so its result reaches the Layer. **What a run uses is built in the run**: a `Queue` made by `Effect.runPromise` at module level keeps its creator's dispatcher and never wakes its taker (`Queue.ts:488`) [SA RV3 L1]. Two parts:

1. **The settle's drain, not an emptiness check.** Nothing can observe an empty microtask queue from inside one, and the scheduler's task count reaches 0 while a promise chain still runs (SA RV1, `settle.ts`); a fiber working through promises shows no scheduler activity at all (SA RV2 `http.ts`: 20,000 chunks stopped at exactly 4,096 reads). So the settle re-queues one microtask until `K` consecutive hops show **no scheduler activity and no arrival at anything of Flow's**: a mailbox, a gate, the Clock, a connection's or body's pull. `K` is a fixed constant, proposed 4096, about 0.06 ms on Bun and 0.72 ms in Chromium. A chain of up to `K` idle hops completes; a longer one is cut there, at the same point on all three engines, since hop cost is identical (SA RV2 `engines.ts`) [SA MDL (d)]. The drain also runs the answer list: a settle ends with the list empty (2.10.4). A settle still showing activity at the **hop cap** (proposed 1,048,576 per instant) rejects as `StoryTurnLimit` with `reason: "Settle"`, naming the step, the instant and the fiber's owner that scheduled most, which catches a loop below the commit that takes no turns (`Stream.paginate`, `Effect.forever`) [SA RV3 section 2]. A synchronous `while (true)` in a handler hangs as in any JS; only a debugger helps. **An `advance` fires at most 100,000 deadlines** (proposed): `StoryTurnLimit` with `reason: "Advance"`, naming the owner that fired most, since a settle costs `K` hops whatever it does, and `advance("1 day")` over a 1 ms ticker is hours [P, SA RV3 M2].
2. **Finish the world, then look** [P, SA RV2 H1, SA RV3 M1]. No fiber is attributed at each settle: an owner does not cross a promise, a queue, a shared lock or a batch, so per-settle attribution rejected Checkout's 3-D Secure and the desk's batches (SA RV2 `owner.ts`). And since no host task runs during a run, a host-waiting fiber cannot progress, so nothing is lost by asking at the end. Asking who *could* wake a fiber brings the same attribution back, so the run wakes what can be woken instead. After the last cut, only if a commit or read fiber is parked: release every held item, close every open connection as the network would, and fire deadlines up to a fixed horizon (proposed 1 hour of virtual time, or the deadline limit, whichever is first), settling after each. **A fiber still parked is `HostTimeWait`: "still parked at the end of the run: real host work, or something only a later step could wake", naming its owner and the step it parked at.** The run then rejects. A session or setup-scoped fiber may wait. **It looks only at fibers already parked at the last cut; a fiber the phase itself starts is not reported** [P, SA MDL U3]. **Nothing from this phase reaches the evidence:** no frame, record, truth read or diagnostic, and a rule it fires does not count as fired; what fakes do in it, a crash included, is not reported. `HostTimeWait` can also mean "a chain longer than `K`". The Clock records each sleep's owner, for the ranks only; gates and connections record none.

| Case (run on Bun, Node and Chromium with SA RV3's own minimum, not Flow) | Result |
| --- | --- |
| 3-D Secure, a batch, a semaphore, `Effect.cached`: released, or ending on the hold | Fine |
| A batch mid-window; its first commit cancelled mid-window | Fine |
| A streaming write with a silent body, opened in the commit or by an SDK's fiber | Fine: closing wakes it |
| RPC over a setup socket, the Story stopping before the push; a token bucket; an SDK sender mid-window | Fine |
| A fake's Clock `ping` on an open connection: a session waiting on it, not host work (2.10.4) [P, v3 item 10] | Fine |
| A real wait, alone, with a setup-scoped heartbeat, with another connection open, with an unrelated hold, or with another operation's backoff | `HostTimeWait` |

**The four cases it does not catch, stated:**

1. **An in-app latch a later step opens, the Story stopping first: rejected**, though no host work exists. Add the step that wakes it. The message says so.
2. **A real wait under its own `Effect.timeout`: passes**, since the fired deadline wakes it. A stall test can pass without reaching a fake; the [record](merged/story-checks/stories-amended.md)'s section 11 item 9 is the real case.
3. **A cancelled fiber's real wait: passes.**
4. **Fire-and-forget host work**, such as a `setTimeout` nobody awaits: passes. No parked fiber exists, so a "nothing was sent" test can pass falsely.

Flow's own suite (V3) tests for false passes: a matrix of host primitives against exemptions, an always-on sentinel (a `setTimeout(0)` and a `MessageChannel` armed at run start, checked before cleanup, and firing is an internal error), and running Stories at `K` and 2`K` and comparing evidence [SA RV3 section 2].

**A Story is checked on the engine its tests run on** [P, SA RV2 M3]. The result never depends on host speed. It does depend on the engine, for one engine and version, because engines differ in what finishes in microtasks:

| Work, inside a settle | Bun | Node | Chromium |
| --- | --- | --- | --- |
| A 500-`await` chain; a `Response` subclass with resolved bodies; a plain `Response.body` reader | yes | yes | yes |
| `Response` or `Request` `.json`, `.text`, `.arrayBuffer`, `Blob.text` | yes | yes | **no** |
| `crypto.subtle.digest` | **no** | **no** | yes |
| `process.nextTick` | yes | **no** | n/a |
| A dynamic import in a commit | **no** | yes | not meaningful: the bundle inlined it [SA RV3 L7] |

So a client half returning `new Response(…)` can pass under Vitest on Node and reject in `StoryPlayer`, which records in the browser, and `flow story run` can differ from the tests. Playback may reject what tests accept. There are no guards on `fetch`, `WebSocket` or `crypto`. Microtask-only promises resolve inside the drain, in a fixed order. Firefox and Safari were not run.

While it runs, turns, pending resets, adoption deliveries, settlements, invocations, acknowledgements, fake handlers and
adapter pulls happen in production's order (2.5, P21; the FIFO mailbox). **Interleaving is fixed**: tabs take turns
one at a time in each name's first-open order (a reloaded tab keeps its rank); Attempts invoked in one settle reach their fakes in invocation order (tab order, then
the turn that promoted them); fakes' handlers run in arrival order. What waits for time or the world stays, and is read
as work (2.10.6).

| Step | Input applied | Then |
| --- | --- | --- |
| `send(target?, …events)` | each event is one step, queued as a view's send would be | settle; the verdict is a record (STR7) |
| `together(…inputs)` | admission is held in every tab while each listed input (a send, a control or `{ advance }`) arrives, in order: a send is queued; a control runs until its effects reach a mailbox or a gate; `{ advance: d }` moves time, firing each deadline so its event is queued, without turns | admission resumes, then settle (STR16); answers wait for that settle [P, SA MDL (e)] |
| `world(…controls)` | each control, in order: a wire word, or a server control (2.10.4) | settle (STR24) |
| `advance(d)` | time moves to now + d, stopping at every deadline on the way, in the order of 2.10.3, settling at each | settle at now + d |
| `advance({ next: address })`, `advance({ to })` | to the earliest unfrozen deadline the address matches; to an epoch millisecond at or after now | as `advance` |
| `advance(d, { suspended })` | a page in the background (2.10.3) | the tab's overdue timers fire, then settle |
| `ensure`, `dispose`, `openTab`, `closeTab`, `reload`, `enter`, `leave`, `reset`, `setContext` | the lifecycle command, as a host would issue it | settle |
| `guards(answers)` | the stand-in host's answers from now on (2.10.12) | nothing to settle |
| `dehydrate`, `hydrate` | Testing O7; dehydrate's time motion follows 2.10.3, deadline by deadline; a source runs on the run's clock (2.10.11) | settle |
| `checkpoint(name, { at? })` | nothing: it names the latest step cut (2.10.6) | nothing |

**`together` is the only concurrency word** (W3, W10; Stories T4). It states a real interleaving: these inputs arrived before
the actor ran any of them. Its inputs are steps' data forms (2.10.1), so a targeted send is `{ send: [target, ...events] }`, and two tabs racing is `together({ send: [payRef, pay] }, { send: [{ actor: payRef, tab: "b" }, pay] })` [P, SA RV1 H3]. `together(Stripe.confirm.release(), E.Cancel())` settles the charge and queues its ending,
then queues `Cancel`; listed the other way round, `Cancel` is admitted while the ending waits, which is 2.7.13's "the
real ending if it had already settled" cell and the spike's P1 race. `together({ advance: "30 seconds" },
Stripe.confirm.release())` is the timeout-against-answer race: PAYING's `TookTooLong` and the landing answer are both
queued before either is admitted (SP N4). Inside `together({ advance })` **every woken fiber** (an
adapter's backoff, a setup-scoped heartbeat) runs until it reaches a mailbox, a gate or the Clock; only admission is
held, so a woken backoff may send a request, whose handler answers at once. A timer chain does not re-arm there,
because no turn runs. `together(E.Cancel(), { advance: d })` models a busy main thread: production fires a timer while
a click waits only when the thread is blocked.
Outside `together` a send never sits behind queued arrivals, because the previous step settled.

**Limits and errors** (STR5, Testing O2, O8). Each step may run 10,000 turns per instant; the 10,001st rejects with
`StoryTurnLimit` naming the step and the instant (a fake that always answers with another page loops at one instant
and is stopped here; the author bounds the fake). `InvalidDuration` rejects a negative, non-finite or backwards move.
`StoryInvalidCommand` names the step and one reason: `ActorAbsent`, `AlreadyEntered`, `NotEntered`, `TabOpen`,
`TabClosed`, `NothingHeld` (a `release` with nothing held **and** no standing rule to end, or a `release({ nth: k })`
when no queue has k, 2.10.4), `NoConnection` (a stream `drop()` with nothing to close, 2.10.4), `NoDeadline` (an
`advance({ next })` whose address matches nothing, W7), or a negative `hold({ after })` [fakes-v2]. `HostTimeWait` is above. Cleanup follows Testing O8.

#### 2.10.3 Time

One `advance`, with `{ next }` and `{ to }` (W6). One controlled clock per run: the executor's own `Clock`, since Effect's `TestClock` cannot rank owners or skip one tab's sleeps [P, SA RV2 L2]; a fixture providing `TestClock` hides its sleeps from it, so use the run's Clock [SA RV3 L6]. **A sleep of zero or less is a yield, as in Effect's Clock, and is not a deadline** [P, SA RV3 M4], so `Effect.retry({ times: 3 })` and `Schedule.spaced(0)` finish in the settle, and a `sleep(0)` loop reaches the hop cap. Work takes no virtual time (STR13). `advance(d)` is what
production does if d passes with nothing else happening: each deadline fires at its instant, the turns it causes run,
and a timer they re-arm inside the window fires too, so the dispatch desk's `lockedOut` runs its whole chain (STF20).

**A total order at equal instants** (W8; STR14, STF22). Every sleep has an owner, attached by Flow to the fiber that sleeps;
2.10.17.5 is normative. At one instant the sleeps wake one at a time, settling after each, by rank: **a fake's `ping`, so a tie with a client's `idleTime` keeps a registered connection alive** (by server name, then connection open order) [P, v3 item 1]; adapters (by tab, actor, operation, key), **setup-scoped fibers** (an SDK
client's heartbeat or backoff forked at layer build, a rate limiter: by layer order), the Runtime's own waits, then
actor schedules (by tab, actor, instance path in placement order, copy in list order, schedule key in list order).
Ties within an owner go by arming order. "Outside before inside" is a documented choice; a Story that needs the other
order uses `together({ advance })`.

**One clock** [P, SA RV1 M13]: a hydration source runs on it too (2.10.11).

**The next deadline** (W7; STR15, STF23, SP RV M3). `advance({ next: address })` moves to the earliest unfrozen deadline whose
owner the address matches: `{ schedule: "checkTick" }` (schedule names are type-checked against the subject, so a
typo is a type error, not a `NoDeadline`), `{ operation: O.messages, timer: "backoff" }` (a session's sleeps are Flow's,
so they carry `timer`: `backoff`, `page`, `healthy`, `idle` [P, v3 item 4]; `{ timer: "page" }` under the default schedule uses its own copy of it [v3 item 9]; the default is jittered, so a fixed `advance("500 millis")` cannot land on it, and a Story uses `next` [v3 item 7]; Streams T1), `{ actor: Checkout1 }`. An author's own adapter sleeps
(an idle deadline in the adapter's code) are addressed by operation only, the earliest of them. Adding an unrelated timer to the app (a toast, a heartbeat) cannot move the Story. A frozen
schedule has no sleep (rule 1), so it is never chosen. `advance({ to })` stays for the rare exact instant.

**A suspended page** (W9; STR17, STF78). `advance(d, { suspended: true })` (or `{ suspended: "b" }`) moves time while the
tab runs nothing: its timers, adapters and Runtime are paused; fake servers keep running and their pushes wait in the
tab's transport. At now + d the tab's overdue deadlines fire in deadline order, then its waiting transport input is
delivered, each settling.

**Time is readable** (W24; STR18, STF24). `cp.now` on any cut or frame; schedules keep the design's reads (`s.schedules.<path>.dueAt`,
keyed lists of `{ key, dueAt }`); `inspection.work` names every deadline with its owner, `dueAt` and `frozen` (2.10.6).

#### 2.10.4 The world: fakes

(Decided: the module, W11; `Fake` stands alone with its own narrow capabilities, and a mocking library is optional, W17, as W42 amends it; no MSW binding now, W15. The spelling below is **[fakes-v2]**.) A fake has two
halves with two lifetimes, which is what makes one server per run possible without breaking per-tab fixtures (STR22,
STF13–STF15):

| Half | What it is | Lifetime | May depend on |
| --- | --- | --- | --- |
| **the server** (`Fake.server`) | typed truth, a request log per endpoint, handlers, controls | **one per run**: built first, given the `world` option, shared by every tab and reload, released last | nothing from a tab |
| **the client half** (a fixture: an ordinary Layer, or a binding `Fake.fetch` / `Fake.webSocket`) | the app's service or a transport, calling the server's endpoints | **one per tab**, as Testing O3's fixtures are | setup services (STF14) |

**Everything a fake remembers is server truth**, and so is every wire rule's remaining count (`times: 2` survives a
reload): a reload rebuilds only the client half, which holds no state (STF15). The dispatch desk's `DemoServer` is shadowed in
Stories by a fixture that provides it from the run's server (STF13).

**Where a server comes from** [P, SA RV1 M9]. `Stripe` is an Effect that gets or builds the server from a **run-scoped registry** the executor
provides. So it is not in a Layer's `R`, and "a missing fake is a type error" holds for the app's services, which is its point. A Layer is opaque,
so nothing can list the fakes behind a fixture until it runs (2.10.14). A server is a module value with no parameters; seeds are `initial` or a
`world` control. Controls and endpoints named `hold`, `release`, `drop` or `duplicate`, or one name used for both, are construction errors
[P, SA RV1 L8].

**A fake has three parts, and each answers one question** [fakes-v2]:

- **The result** of any handler: what changed, what is answered, what connections hear.
- **The wire** (W18): whether and when that reaches the client. Handlers never decide it.
- **The binding**: how the app's own transport reaches an endpoint.

Flow never asks the engine to do work that needs a host task (rule 61).

```ts
// stripe.fake.ts (test code). Source: fetch to the payment API, wrapped by the app's StripeApi service.
import { Fake } from "flow-state/testing"
import { Effect, Layer, Schema } from "effect"

const Charge = Schema.Struct({ intentId: Schema.String, key: Schema.String })        // user-defined
type Truth = { readonly charges: ReadonlyArray<typeof Charge.Type>; readonly busy: number }   // user-defined

export const Stripe = Fake.server("Stripe", {  // user-defined: Stripe
  truth: { charges: Schema.Array(Charge), busy: Schema.Int },
  initial: { charges: [], busy: 0 },
  endpoints: {
    confirm: Fake.call({
      request: { intentId: Schema.String, key: Schema.String },  // logged, redacted by Inspection O5
      handle: (truth: Truth, req) =>  // an object [W14]
        truth.busy > 0 ? { truth: { ...truth, busy: truth.busy - 1 }, response: { ok: false, status: 429, retryAfterMs: 2000 } }
        : truth.charges.some((c) => c.key === req.key) ? { response: { ok: true, status: 200, intent: succeeded(req.intentId) } }   // the fake's own dedupe (brief C16); truth omitted: unchanged
        : { truth: { ...truth, charges: [...truth.charges, req] }, response: { ok: true, status: 200, intent: succeeded(req.intentId) } },   // user-defined: succeeded
    }),
  },
  controls: {
    busy: Fake.control({ times: Schema.Int }, (truth: Truth, { times }) => ({ truth: { ...truth, busy: times } })),  // same result shape
  },
})

// The client half: the app's StripeApi, over the run's server.
export const StripeFake = Layer.effect(StripeApi, Effect.map(Stripe, (server) => StripeApi.of({
  confirm: (input, { idempotencyKey }) => server.confirm({ intentId: input.intentId, key: idempotencyKey }).pipe(
    Effect.catchTag("FakeLost", () => new NoResponse())),  // the client half says what a lost request raises
})))
```

A second fake, with a stream and a route table, showing every part [fakes-v2]:

```ts
const Message = Schema.Struct({ room: Schema.String, text: Schema.String, from: Schema.String })  // user-defined
type Truth = { readonly messages: ReadonlyArray<typeof Message.Type> }                            // user-defined

const socket = Fake.stream({
  request: { room: Schema.String, clientId: Schema.String },
  frame: Schema.fromJsonString(Message),  // frame, required; Schema.String for raw
  open: (truth: Truth, req) => ({  // object result
    frames: truth.messages.filter((m) => m.room === req.room),
    // or: refuse: 4403  // replaces accept
    // and, for a finished body: end: true  // end, this connection, after its frames
  }),
})

export const Chat = Fake.server("Chat", {                          // user-defined: Chat
  truth: { messages: Schema.Array(Message) },
  initial: { messages: [] },
  endpoints: {
    socket,
    post: Fake.call({
      request: { room: Schema.String, text: Schema.String, from: Schema.String },
      handle: (truth: Truth, req) => ({                            // W14: an object; pure
        truth: { messages: [...truth.messages, req] },             // omitted means unchanged
        response: { status: 201 },                                 // under Fake.fetch: status, body?, headers?
        send: [socket.frames((c) => c.room === req.room && c.clientId !== req.from, [req])],
        // send, an ordered list; socket.frames(where, frames); where reads the connection's request
      }),
    }),
    logout: Fake.call({
      request: { clientId: Schema.String },
      handle: (_truth: Truth, req) => ({
        response: { status: 204 },                                 // no body, as Effect's omitsBody
        send: [socket.close((c) => c.clientId === req.clientId, 4401, "expired")],
        // socket.close(where, code, reason?)
      }),
    }),
  },
  controls: {
    finish: Fake.control({ room: Schema.String }, (_truth: Truth, a) => ({
      send: [socket.end((c) => c.room === a.room)],  // socket.end(where), a clean end
    })),
  },
})

// A client half reads a stream as it makes a call. Each run of the Stream is one connection; its scope closes it.
server.socket({ room, clientId })  // Stream of wire frames: encoded, not Type [P, SA RV1 L10]
// failing with Fake.Lost, Fake.Refused { code } or Fake.Closed { code, reason? }

// Bindings: one route table for both [W16, W36]
Fake.fetch(Chat, {
  "POST /api/rooms/:room/messages": {  // the key, FindMyWay's path syntax
    endpoint: "post",  // endpoint, a name or a function of the context
    input: ({ params, body, headers }) =>  // input; context also has query. params is typed from the key [P, SA RV1 M8]
      ({ room: params.room, text: body.text, from: headers.get("X-Client") ?? "" }),
  },
  "POST /api/logout": "logout",                                    // short form; input is { ...params, ...query, ...body }
  "POST /graphql": { endpoint: ({ body }) => body.operationName, input: ({ body }) => body.variables },
})
Fake.webSocket(Chat, {
  "GET /api/rooms/:room/socket": { endpoint: "socket", input: ({ params, query }) => ({ room: params.room, clientId: query["client"] }) },
})

// In a Story
Story.machine(Room, { id: "chat/mid-stream", world: [Chat.socket.hold({ after: 2 })] })
  .world(Chat.socket.hold({ match: { input: { room: "r1" } } }))  // input in match, reads the logged request
```

`socket`, `Chat.socket` and `server.socket` are one name on three values: the definition, the Story target and the client
read. A standalone `Fake.call` or `Fake.control` that reads `truth` annotates it (`Truth`), since it infers as `unknown`;
`Fake.server` constrains `endpoints` by its truth Schema, so another server's `Truth` is rejected. `input`'s result is typed loosely, since `request`
decodes it and invalid input is `StoryFakeError`; `query` values are `string | undefined` under the repo's `noUncheckedIndexedAccess` [P, SA RV1 M8].

**A heartbeat** [P, v3 items 1–3, 10]. `Fake.stream({ …, ping: { every, frame } })`: on each open connection, the fake delivers `frame` every `every`, on the run's Clock, so a client's `idleTime` has something real to see. It is data, like `open`, and runs no handler; it reads no truth. `frame` encodes by the stream's `frame` Schema. NDJSON has no codec: `frame` is `Schema.String`, and `end: true` must be written [P, v3 item 13].

- It takes no count: `hold({ after: n })` does not count a ping, and a `duplicate` does not take one.
- A hold stops pings: while `Silent` or `Closing`, none is sent and none queues, so a half-open connection is really silent. When frames flow again, the next is `every` from then.
- Each is one `delivery` record, with `ping: true`.
- While the tab is suspended, pings **coalesce** to one at wake, after the tab's overdue deadlines: a week at 10 s would be 60,480 frames. So a client's overdue `idleTime` fires first, as Machines O5's overdue rule says.
- It is not an operation's deadline: quiet ignores it, and it does not hold a run open. It counts toward an `advance`'s 100,000 deadlines (the record's section 10 item 13).

`Fake.webSocket`'s `addEventListener("close")` gives a `code` [v3].

**Not added** [fakes-v2]: `pushes`, a `closed` handler, `release({ take })`, a duplex client half, `HttpApi` derivation
(`revisit.md`); `headers` on `Fake.stream`, until the first SSE adapter checks a content type [P, SA RV1 section 8]; `message` on `Fake.stream`, until the first duplex fake [P, SA RV2 section 8]. So a stream is server-to-client for now: a client's frame through `Fake.webSocket`'s socket is ignored and logged.

**One result shape** [fakes-v2] for `handle`, `open` and controls: `truth?` and `send?` everywhere, `response`
(required) on a call, `frames?`, `refuse?` and `end?` on `open`. All three are pure. Truth and `send` commit atomically; one
that throws is a crashed server, with no truth and no frames.

**`handle` is pure and always answers synchronously** [W42; SA RV1 M1]. There is no `latency` and no `response` as an Effect: they had no real
use, and added a second form of `Held`, a rank clause and a crash half. **A slow answer is `hold`, `advance`, `release`**, the form Testing O6 already spells:

```ts
Story.machine(Editor, { id: "editor/slow-save", input: T42, fixtures: [TicketsFake] })   // user-defined: T42, TicketsFake
  .world(Tickets.save.hold())  // The request waits in transit
  .send(E.SaveRequested())
  .checkpoint("saving")
  .advance("2 seconds")  // Two seconds pass
  .world(Tickets.save.release())  // Now the server answers
  .checkpoint("saved")
```

**A mocking library: a recipe** [P, W17 as amended; SA RV1 M1]. A **synchronous** library goes in a pure handler. An **async** one goes in the client half, an ordinary
Layer, which can still call an endpoint first, so the wire words apply to it:

```ts
const Search = Fake.server("Search", {                             // user-defined: Search
  truth: { asked: Schema.Array(Schema.String) },  // Only what the server declares is truth
  initial: { asked: [] },
  endpoints: {
    gate: Fake.call({                                              // user-defined: gate, an ordinary endpoint
      request: { q: Schema.String },
      handle: (t: { readonly asked: ReadonlyArray<string> }, r) => ({ truth: { asked: [...t.asked, r.q] }, response: {} }),
    }),
  },
})

const SearchFake = Layer.effect(SearchApi, Effect.gen(function* () {  // user-defined: SearchApi
  const server = yield* Search
  const library = makeLibrary(handlers)                            // user-defined: built here, so never module-level
  const askLibrary = (input: { q: string }) => Effect.promise(() => library.answer(input))
  return SearchApi.of({
    search: (input) => server.gate(input).pipe(                    // hold, drop and duplicate apply to the gate
      Effect.andThen(() => askLibrary(input)),
      Effect.catchTag("FakeLost", () => new NoResponse())),
  })
}))
```

Its limits:

- **Truth only if declared on the server.** What the library remembers is not truth: no `cp.read(Search)`, no `propertyTest` oracle. Put what a test reads in `truth`.
- **Memory is per Layer build,** so it cannot leak across runs or a shrink. A client half is built per tab, so a `reload` or second tab starts the library afresh. If that memory must survive a reload, declare it as truth.
- **The library must finish in microtasks,** or the operation's fiber is `HostTimeWait` (rule 61). A real `Response` read needs a host task in Chromium (run), so anything that needs one is Bun and Node only. `response` under `Fake.fetch` never is a web `Response`.
- **The wire only sees the gate.** `hold({ at: "response" })` holds the gate's answer before the library runs; a lost answer never reaches the library.

**A broken fake is a broken run** [P, SA RV1 H4, SA RV2 M6; keeps SC1, which is about the app]. It is recorded when it happens, one per crash, so a crashed original and its crashed copy are two, listed in order [SA MDL (c)]. A wrong route otherwise gives a 404 the commit classifies, and a decline test passes
without ever exercising a decline. These are errors in the test's own world, so `run()` **finishes the run, then rejects** with a `FlowError`:

```ts
await paidFirstTime.run()         // rejects: StoryFakeError { fake, endpoint, reason }
// reason: "NoRoute" | "InvalidInput" | "Crashed" | "UnplacedStream" | "InvalidRefusal"
```

The evidence is complete on the error. A Story that wants a 500 writes `response: { status: 500 }`; one that wants a 404 writes a route. Product `issue`s stay records and never
reject. `propertyTest` reports it as a rejecting `FlowError`, like an acquisition defect. A stream not placed on this server is `UnplacedStream`, at the send. One stream value on
two servers is a construction error.

**Order** [fakes-v2].

| Case | Rule |
| --- | --- |
| A handler's `send` against its answer | Commit truth; deliver the list in order; its answer **joins the run's one FIFO answer list**. Each settle ends by delivering the next answer to its gate, then settling again [P, SA RV1 M2] |
| `hold()` on the request | The handler has not run, so nothing is sent |
| `hold({ at: "response" })` | Frames are delivered now; the answer waits |
| `drop({ at: "response" })`, `release({ drop: true })` | Truth and frames stand; only the answer is lost |
| `orphan` (client gone) | Frames still go, so a reopened tab hears them |
| `duplicate` | The copy's answer is discarded, its frames are not; the fake's dedupe omits them |
| Frames to a connection `Opening`, `None` or `Closed` | Nothing; `open` replays from truth |

So A and B arriving in one settle answer A then B, frames still come before their answer, and adding a `send` never reorders answers (a nested settle answered B first; SA RV1 `wire.ts`). A request caused by a frame can reach the server before the first answer arrives. That is real and deterministic. Inside `together`, "settling" means what that row says: run until each fiber reaches a mailbox, a gate or the Clock.

**A server failure never reaches the client as a defect** (rule 66, SP RV M8; W12). A handler that throws is a crashed
server, which the wire turns into the binding's failure (`Fake.Lost` for a client half, `500` for `Fake.fetch`, close `1011`
for `Fake.webSocket`), and the run rejects with `StoryFakeError { reason: "Crashed" }` at its end. Nothing in Flow reads a status, a header or an error type: `429` means
busy because the fake author wrote it and the commit classifies it.

**Failures** [fakes-v2]. A network loss is `Fake.Lost` on a client half, a `TypeError` from `fetch` under `Fake.fetch`, and close
1006 under `Fake.webSocket`; an app-service client half maps it itself, as `StripeFake` does (rule 66). Endpoints declare no
`lost`. A refusal is `Fake.Refused { code }` on a client half. Under `Fake.fetch` its code is the status; a code outside 200–599 is `StoryFakeError { reason: "InvalidRefusal" }`, since `new Response` would throw. Under `Fake.webSocket` it is an error event, then close 1006, as a refused handshake is in a real browser, with the code only in the log; app-level closes use `socket.close` after open [P, SA RV1 M11]. A server close is `Fake.Closed {
code, reason? }`. A crashed `open` is `Fake.Closed { code: 1011 }`. `end` ends the Stream or body, and is close 1000 under
`Fake.webSocket`, which Effect's `Socket` reports as `SocketCloseError { 1000 }`, not a stream end [P, SA RV1 M11]. Tags are `FakeLost`, `FakeRefused`, `FakeClosed`, as PascalCase importable error classes (following Effect's
`SocketCloseError`, `HttpClientError`).

**How the words combine** [P, SA RV1 H5, SA RV2 M8, M9, L4, SA RV3 M6; SA MDL G2, G4–G9, G12, G16, N1–N6]. Five rules, then the tables:

1. **Arrivals take one rule.** A call or an attempt arrives once, and takes the earliest-set arrival rule that covers it, matches it and means something for it, and only that one, consuming its `times`. A `duplicate` means nothing to an attempt, so an attempt skips it without consuming it [SA MDL G5]. A hold or drop on a handle covers the next arrival, call or attempt [SA MDL G4].
2. **Frames rules do not compete: every one covering a connection applies to it** [SA MDL G9]. So a standing `hold()` and a standing `duplicate()` both apply, at open as on an open connection, and each `hold({ after })` counts on its own. **A count is per rule and counts delivered frames**, so it is not a hold until reached, and it pauses while the connection is silent: set on a `Silent` or `Closing` connection, it starts when frames flow again [SA MDL N4]. The first to reach its count silences the connection, under its own rule; another target's count resumes when that one is released, and a `release` on one target ends all of that target's counts [SA MDL G8, N6]. **Each `duplicate` rule doubles one frame per connection, and one frame takes only the earliest armed**, so a frame never arrives three times [SA MDL N5]. **A connection is silent while any hold covering it has taken effect, on its endpoint or its handle; `release` on one target ends only that target's rules** [SA RV2 M8, SA MDL G2]. It returns to `Open` and delivers its queue when the last one ends. So `Chat.hold()`, `Chat.socket.hold()`, `Chat.release()` leaves it silent, and a `Chat.socket.release()` with no rule of the endpoint's own is `NothingHeld`.
3. **`release` ends its target's rules first, then delivers** [SA MDL G16]; what it delivers has no arrival rule to take again. **The frames rules of its own target do not apply to what it delivers, even under `{ match }`, where they stay; another target's do** [SA RV3 M6]. A `Closing` close or end comes last, only when no hold is left. **A count reaching `n` during a release's own delivery queues the items past `n` again under that rule, whatever form of `release` delivered them** [P, SA MDL U1; not reached within the model's bounds].
4. **A `release` must do something** [SA RV3 M6, SA MDL N1]: it is `NothingHeld` when it ends no rule and delivers no item. A request marked to hold, still at `Server`, counts as a held item for every form of `release` [P, SA MDL U2]. `release({ match })` is `NothingHeld` when no held item on its target matches, on every table, whether or not a rule stands or other items are held, since a typo'd match has no check left to catch it. This also defines `release({ nth })` and `{ drop: true }` over nothing.
5. **A rule ends when it has nothing left to do** [SA RV3 M6, SA MDL N3]: a used-up rule is **removed unless it still holds an item or silences a connection**, and then `release` ends it. So `save.drop()`, used, then `save.release()` is `NothingHeld`, not a silent no-op, and a used-up `hold` can still be released.

The rest follows:

- **One word on a handle is two rules** with separate counters: an arrival rule, and a frames rule [SA MDL (a)]. `at` on a handle is a type error: use endpoints for phases.
- **`times`** counts arrivals: on a call, requests; on a stream's `hold`, connections taking it; on a stream's or handle's `drop`, calls and attempts. A used-up rule takes no more arrivals; rule 5 says when it goes. A connection it silenced stays silent and held items stay held until `release` [P, SA RV3 M6, amending my reading of SA RV2 M8].
- **`drop()` on a stream or a handle** closes matching open connections at once. With default `times` it stands for the next arrival **only when no connection matched** [SA RV2 M8]: on a handle a rule, on a stream endpoint `StoryInvalidCommand { NoConnection }`, since a silent no-op is what SC1 can no longer catch (skipped under `propertyTest`). With `times` above 1 or `"always"`, it closes and also stands, so **offline means offline**.
- **`duplicate` is per connection** at frames; its `match` narrows it.
- **`release({ match })` delivers the matching held items and leaves the rest held; the standing rule stays** until a `release()` with no `match` [SA RV2 M9; W21 kept]. So two saves in flight can be answered one at a time:

```ts
.world(Docs.put.hold())
.send(edit("d1", "A"), edit("d2", "B"))                          // user-defined: edit
.advance("800 millis")
.checkpoint("bothSaving")
.world(Docs.put.release({ match: { input: { docId: "d1" } } }))  // match on release
.checkpoint("oneSaved")
```

- **`release({ nth: k })` is per queue** [SA MDL G6]: an endpoint's held list is one queue, counting `Held` and `HeldAnswer` together in arrival order [SA MDL (b)], and each connection is one queue. **"First" orders within a kind, and released answers still join the list before released requests run**: in `[HeldAnswer a, Held b]`, `nth: 2` delivers a, then b; in `[Held a, Held b]` it delivers b, then a [SA RV3 M6, SA MDL N2]. A queue shorter than k releases in order; it is `NothingHeld`, naming k, only when no queue has k, and then nothing is released. With a call endpoint's one queue this is the old reading.
- **Order across connections is their open order** [SA MDL G7]: a `send` list item, `release` and `drop` reach matching connections earliest-opened first, across tabs.
- **A handle's `release` across endpoints** reaches connection queues in open order, then answers, then requests [SA RV3 L2].
- **A `send` list evaluates every `where` before delivering**, so a `where` that throws is a crash with nothing delivered [SA RV3 L4].
- **"Fired"** [SA RV2 M7]: a rule fired if a call or attempt took it, or it applied to an open connection, so a `hold()` on a silent socket counts. A rule that never fired is `UnusedWireRule`.

**The wire** (W18). Every endpoint call goes through a gate Flow owns, between the client half and the handler; 2.10.17.2 and
2.10.17.3 are normative. Its words are delivery facts true of any transport, never server meanings (brief C16, STF17):

| Word | On a call endpoint | On a stream endpoint (2.10.9) | Options |
| --- | --- | --- | --- |
| `hold()` | a standing rule: matching requests wait in transit, unseen by the server | frames stop reaching the client (silence, half-open) | `at: "request"` (default) or `"response"` (handled, the answer waits; W20); stream: `"frames"` (default) or `"open"`; stream only: `after: n` [fakes-v2]; not on a handle |
| `release()` | every standing rule on this target ends, then held items are delivered: released answers join the answer list first, in arrival order, and released requests reach the handler in arrival order, whose answers follow [P, SA MDL G3] | its rules end; a connection with no hold left delivers its queue, then a held close or end; held opens complete | `{ drop: true }`: the held items are lost instead; `{ nth }` (rare): deliver the n-th held item first, a reorder (W21); `{ match }`: only those, and rules stay [P, SA RV2 M9] |
| `drop()` | matching requests are lost before the server; `at: "response"`: handled, the answer is lost | open connections close as the network would, at once; `at: "open"`: matching attempts are lost | `times` (default 1, or `"always"` until `release`); on a stream, `times` counts attempts |
| `duplicate()` | a matching request reaches the server twice; the client gets the first answer, the second is discarded (`phase: "duplicate"`) | the next frame arrives twice, per connection; the count is per frame | `times`. It has no `at`; a request is duplicated at arrival [SA RV1 L11] |

`hold` is standing (until `release`) unless `times` is given; `drop` and `duplicate` default to once (W19). A rule that never fires is the `UnusedWireRule` diagnostic, since a rule set after the step that sent its request waits for nothing [P, SA RV1 M17]. Every word takes
`match: address` (rule 65): `{ actor: BoardP1 }`, `{ operation: LikeButton.O.set, actor: IssuePageC7 }`, `{ tab: "b"
}`, `{ purpose: "acknowledge" }`, `{ input: { room: "r1" } }` (an address plus kind fields; listed `input` keys must equal the
logged request's; at frames, the connection's request). **One rule per request**, as the combination rule says; `release` on a target ends only that target's rules (2.10.17.2). Applied to the server handle (`Stripe.drop({ times: "always"
})`), a word covers every endpoint: an offline device.

**`hold({ after: n })`** [fakes-v2]. Counted per connection: from its first frame if set before open, otherwise from when it is
set. `times` counts connections. `release` behaves as for `hold()`. A connection takes a frames rule at open or when the
rule is set. A later `hold` on a matching open connection still counting takes effect at once, since silence only widens.
`duplicate`'s count is per frame, and a duplicated frame counts as two. A `drop()` always closes. A `close` or `end` while
counting, with no hold yet in effect, passes in order: so `end: true` with fewer than n frames is `Closed { 1000 }`, and once the count is reached, or under a plain `hold()`, it is `Closing { 1000 }` [SA MDL G12]. `after` with `at`, on a call or on the server handle is a type error; `after: 0` is `hold()`; a
negative is `StoryInvalidCommand`.

**Close under `hold`** [fakes-v2]. A server `close` or `end` is the last queued item: delivered at `release`, lost under
`release({ drop: true })`, which becomes close 1006. A network `drop()` stays immediate. While a close is held, the server sees
the connection as closed: a `send` reaches nothing, the log reads `phase: "closed"` with its `code`, the `delivery` record shows delivery, and
`release({ nth })` does not count the close, which stays last. This is the state `Closing` in 2.10.17.3.

**Remote and local.** A request to a remote server that has left the device **stays in transit** after its client is
gone (a cancel, a closed tab): released, the server handles it and the answer goes nowhere (`phase: "orphan"`). That is
2.7.2's "the server finished after a cancel", and it makes "charged once across a reload" (STF12) a fact the Story
sets. **Local storage is not remote** (SP RC6, SP MDL F1): `Fake.storage`'s writes are FIFO per tab, as one writer's writes
are (Persistence O7), and a closed tab's unfinished writes are **aborted** (`phase: "aborted"`), never applied later, as a
crashed page's storage transaction is. A held acknowledgement for an Attempt the Story then cancels either lands
before the capture that removes it, which is queued behind it (a Persistence fact, Persistence O7's one writer), or is
aborted with the tab. A write that was **stored but whose confirmation was held** (`hold({ at: "response" })`) stays
stored when the tab closes, as an IndexedDB transaction that committed before the page crashed does; the restore then
finds an acknowledged Attempt and delivers `unknown { Restored }` even if the Story had cancelled it. That is
2.7.13's restore row (Stories T7): Stories reach the cell and do not decide it (section 7 item 21).

**Server controls** (W13) are the author's typed messages to the server (`Stripe.busy({ times: 1 })`, `Chat.finish({ room })`):
their arguments are Schemas, so they are data, `describe` prints them and a property test generates them (STF16,
STF52). Pushing, refusing, going silent, resetting a log, keeping the last n and greeting with or without a replay are
each a control or a wire word (STR23); flapping and flooding are loops at construction, data once built.

**Provenance** (STR21, STR26, STF3, SP RV M9). Each logged request is `{ n, input, phase, via }`. At a call endpoint `phase` is one
of `held`, `handled`, `answered`, `lost`, `dropped`, `duplicate`, `orphan`; at a stream endpoint an open's is one of
`opening` (held), `open`, `refused`, `lost`, `closed`. `via` is the **client side**, recorded by Flow, never
seen by the server: `{ tab: { name, open }, actor, instance, copy, operation, attempts, purpose }`. `phase` is always a plain string, with `code`, `reason` and `by` as fields [P, SA RV1 M11]: an open's `closed` has `code` and `by: "server" | "network" | "client"`, so a released connection reads `{ phase: "closed", code: 1000, by: "client" }`; a network-refused attempt is `lost`. At `Fake.storage` a write's is `held`, `stored`, `aborted` or `refused`, and a read's `held`, `served`, `refused` or `aborted` [P, SA RV1 M12]. `attempts` is a list, but a batched request (Effect's `RequestResolver`) carries **the Attempt of the fiber that formed it**, since the gate sees only that fiber's context: a test reads each item's idempotency key in `input` [P, SA RV2 M11]. `via.tab` is **always** present (a client
half is built per tab); a send an SDK's own fiber makes lacks only the Attempt fields (`actor`, `instance`, `copy`,
`operation`, `attempts`), so `match: { tab: "b" }` still targets one device's SDK traffic, and a test checks the
idempotency key the server saw in `input` instead. So "charged once" is checked by values: requests whose `via.attempts`
hold the same Attempt and one charge whose `key` is that Attempt's id is a deduplicated retry; two Attempts and one charge is
a different, wrong case. The log records the mapped `input` and `via`, never the `Request` or its headers: `init.headers`
carries random `b3` and `traceparent` values [fakes-v2]. A `delivery` record, `{ endpoint, connection, phase: "delivered" | "held" |
"lost", digest }`, is a new Inspection O4 kind, redacted like `input` [fakes-v2].

**Storage** (W28; STR25, STF5, STF6). `Fake.storage` is Flow's own in-memory `KeyValueStore` plus Persistence O7's scope lock, one
per run, used by every tab (STR42). Its endpoints are `read` and `write`, under `hold`, `release` and `drop` (not `duplicate`, 2.10.17.6), and Flow knows
each write's purpose: `acknowledge`, `capture`, `flush`. `Fake.storage.write.hold({ match: { purpose: "acknowledge" } })`
opens the acknowledgement window without delaying bootstrap restore, which reads (STF6); `hold({ at: "response",
match: { purpose: "acknowledge" } })` stores the acknowledgement but holds its confirmation, which is 2.7.13's
G1 "acknowledged, never invoked" restore cell once the tab closes; `drop(…)` refuses (`StorageRefused`). Storage starts
fresh and may be seeded with encoded records, which restore validates (Testing O3): `storage: Fake.storage.seed(records)`,
or (rare) `Fake.storage.from(story)`, the storage an earlier Story's run left, which is how records written by
an earlier definition are made (STR41). Stories are prefixes, so a mid-run store is `from(thatPrefix)`, with no per-cut capture [P, SA RV1 M6]. `from` carries storage, not fake truth: the new run's servers start at `initial` [P, SA RV1 L7]. The new run's clock starts at the source's final `now`, so a restored `dueAt` is not in the far future; "reopened after a week" is one run with `closeTab`, `advance`, `openTab` [P, SA RV2 L7]. A seed record's shape is Persistence's encoded record; until that shape is public, `from` is the only form an app can rely on [P, SA RV1 L6]. A handle word (`Fake.storage.hold()`) covers reads and writes, so it blocks bootstrap; `release({ nth })` here is a type error, as writes are FIFO per tab [P, SA RV1 M12].

**Transport bindings** (uncommon; W16, W36). Most apps put `fetch` behind their own service (OD11), and a client half replaces
that service; the commit's classification still runs (STR19). Where the adapter itself calls a transport, Flow ships
`Fake.fetch(server, routes)` (provides `FetchHttpClient.Fetch`) and `Fake.webSocket(server, routes)` (provides
`Socket.WebSocketConstructor`). `routes` is the route table above; a function stays for unusual cases (W16).

- **Routes** [fakes-v2]. `::` is one literal colon. A key whose single-colon param does not follow `/` is rejected, because
  `/parts:release` silently parses as a param. No matching route, or invalid `input`, is a 404 or 400, and the run then rejects with `StoryFakeError` (`NoRoute`, `InvalidInput`). Keys ignore the origin. The function form stays, and its `Request` has the same body overrides.
- **Bodies never need a host task** [fakes-v2]. In Chromium every `Request` and `Response` body read does. *Request:* the binding
  reads `init.body`, since `FetchHttpClient` passes `(URL, init)`. Effect's JSON, text and urlencoded bodies arrive as
  `Uint8Array`, decoded synchronously by content type: JSON parsed, urlencoded to `URLSearchParams`, otherwise a string.
  `FormData`, `URLSearchParams` and strings are given as they are. A `ReadableStream` is read with a reader, keeping the arrival
  number. A `Blob` or `File` exposes `name`, `size` and `type`; its bytes stay unread. *Response:* `Fake.fetch` returns a `Response`
  subclass with resolved `text`, `json` and `arrayBuffer`. It keeps `bodyUsed` honest and rejects a second read. A streamed body
  stays a real `ReadableStream`. This is a deliberate shim. An object body becomes JSON; a string stays as is; a `Uint8Array` or `ArrayBuffer` passes through, and the shim's `formData` and `blob` resolve from it [P, SA RV2 L9]; 204, 205 and 304
  carry no body. An adapter that calls `fetch(new Request(…))` with a body gets `HostTimeWait` in a browser. That is honest; the
  docs say so.
- **Arrival order** [fakes-v2]. A binding takes the arrival number and `via` synchronously at the `fetch` call, and delivers to the
  gate in that order, even from an async route function.
- **Streams under `Fake.fetch`** [fakes-v2]. Open is a 200 streamed body, `refuse` a status, `end` body done, a close a body error.
- **Malformed frames** [fakes-v2]. To reach 2.10.5's `Defect`, declare `Schema.Union([Schema.fromJsonString(M), Schema.String])`. It
  encoded a typed and a raw frame correctly in the review's probe.

**From Effect** [fakes-v2].

| Module | Use |
| --- | --- |
| `FindMyWay` | Reuse for the route table |
| `Queue`, `Stream.fromQueue` | Reuse for a connection: `Queue.fail` for a close, `Queue.end` for an end |
| `Deferred`, `Latch` | Parts of the gate; one `Deferred` per held item, since `nth` needs per-item release |
| `Ref` | One atomic commit of truth and frames |
| `Schema.fromJsonString` | The `frame` codec |
| `FetchHttpClient.Fetch`, `Socket.WebSocketConstructor` | Keep as the seams |
| `HttpServerResponse.omitsBody` | Follow |
| `SocketCloseError`, `HttpClientError` | Follow: PascalCase importable error classes |
| `HttpRouter.toWebHandler` | Do not use: a body read is a host task in Chromium, an abort kills the handler (the wire table says it continues), an unknown route is a silent 404, and the gate and `via` have no place in it |

#### 2.10.5 Endings: how every one is produced (W12; Stories T2)

An ending is the commit fiber's `Exit`, classified (2.7.1), or a reason Flow's Runtime adds. A Story produces the
first by what the fake returns and the second by the lifecycle step that causes it. No step names an ending.

| Ending (2.7.1, rule 20, rule 37) | Produced by |
| --- | --- |
| success; each failure tag; each author unknown tag | the handler's response, classified by the commit (`429` → `Busy`, `5xx` → `unknown ServerError`) |
| author unknown after a lost request or answer | `drop()` or `drop({ at: "response" })`: `Fake.Lost`, mapped by the binding, reaches the commit's `catchTag("NoResponse", Outcome.unknown)` |
| `unknown { Defect }`; a read's `Defect` | a response the adapter cannot handle (a malformed body it throws on; a malformed frame through a union `frame`, 2.10.4): an adapter bug, which is what `Defect` means. A server crash is not this: the app sees the binding's failure, and the run rejects (2.10.4) |
| `unknown { Interrupted }`; a read's `Interrupted` | a client half that interrupts its call, as an SDK whose own fiber is interrupted does; it is client code, so the wire stays honest |
| `StillUnknown { failure }` | a lost answer, then a retry the server refuses definitely |
| `unknown { Cancelled }` | `hold()`, then the send whose transition cancels |
| `NotSent { Cancelled }` | `Fake.storage.write.hold({ match: { purpose: "acknowledge" } })`, or a head held in a record queue, then the cancel (STF5) |
| `unknown { Restored }` | `reload` with the Attempt acknowledged and on the wire; with the acknowledgement stored but its confirmation held (2.7.13's G1: acknowledged, never invoked); the same after the Story cancelled that Attempt (a cancelled Attempt's stored acknowledgement, restored as unknown: the merged design's crash behaviour, Stories T7); a rebind (`dispose`, `ensure`) adopting a held lane |
| `NotSent { Restored }` | `reload` with the acknowledgement held (not stored: aborted with the tab, 2.10.4); each queued `W` entry of the restored lane |
| `NotSent { Rejected }` | `hold()`, then a second commit on a `reject` lane; or a commit from another subject path (rule 51) |
| `NotSent { Overloaded }` | `hold()` on the head, then 64 queued commits and one more (STF11; 2.10.18) |
| `NotSent { StorageRefused }`, `unknown { StorageRefused }` | `Fake.storage.write.drop({ match: { purpose: "acknowledge" } })`; the same on a persisted re-send's `capture` |
| evidence `Superseded`, `Released`, `NothingToResend`, `InFlight` | a second `latest` commit while the first waits; `cancel` in `Held`; `retry` in `Idle`; `retry` while held on the wire |
| `NotSent { Disposed }` | only Runtime disposal, through the policy suite's internal `disposeRuntime` step (Stories T2; OD23 Q41, brief C11) |

**Why no injection** (W12; Stories T2, STF8). `Story.ending(O.x, "unknown")` would skip the commit's classification and the
adapter's decoding, so a Story could pass along a path the real response never takes (requirements R38). Every reason above is
reachable without it (requirements R34), and the cases that seemed to need it are covered by rule 62 and rule 65:

- **an unbound lane** (STF9): the fake answers the request it still holds; the wire does not care who is bound;
- **a fragment's operation** (STF10): `match: { operation: Autosave.O.save, actor, copy }` names its request in a host,
  and alone;
- **a lane with nothing on the wire** (STF7): there is nothing to `release`, which is `NothingHeld`;
- **the wrong path passing** (STF4): the ending record names its channel and reason, so a test that reads `cp.records("ending", …)` and
  expects `{ channel: "failure", reason: { _tag: "Busy" } }` fails if the fake answers 503. A test that checks only the final
  state still passes, and **coverage reports** the `Busy` handler unreached; the documented shape also checks the
  intermediate state (`S.WAITING`).

Prior art kept: alternatives B (injection at the lane) and C (`Story.ending(O.x, exit)`, a scripted fake without
truth) were rejected in SP revision 1 for the reasons Stories T2 records.

#### 2.10.6 Step cuts, frames, reads and records

**Step cuts** (rule 64, SP RC1, SP RV H1; W22). Every step ends with its own cut. A cut is a frame plus `wire` [P, SA RV1 M15]: the
latest publication frame (of each open tab), plus `seq` the evidence position at the step's end, `truth` each fake server's
truth then, `storage` the encoded records then, and `wire` each endpoint's held items and standing rules then [SA RV2 L1]. A plain frame has no `wire` or `storage`, so its type omits `read(Fake.storage)`. `<StoryFrame frame={…}>` takes a frame or a cut. A step that publishes nothing (an `Unhandled` send, a
`world` control, a `release` after the only tab closed) still has a cut that includes its own `verdict`, `request` and `control`
records and the server's new truth. The executor keeps `{ command, cut, frames: [from, to], evidence: [from, to] }` per step for the player and `flow explain`;
that list is not public [P, SA RV1 section 8]. `checkpoint`
names a step cut (SC2); it never reads a bare publication frame, unless `{ at }` says so. `end` is reserved, so `checkpoint("end")`
is a type error (STF75), and `run.end` is the cut after the last step. A `checkpoint` before any step names the cut the start left, once the subject has started and settled **[P]**. Checkpoint names are camelCase by convention, so
destructuring works (SC5); duplicate names and unknown names are type errors (Testing O1).

**Frames** (STR45, STR50; W22). A frame is the cut after one committed publication of one tab (a turn, a settlement or a
Runtime step, 2.5), plus the initial frame: every actor's snapshot and one store revision per open tab, `now`, and the truth and
`seq` at that publication. Snapshots and truth are immutable and shared (Machines O8, playback.md 4); records are referred to by
position, never copied (STF66), so memory is linear. A frame has exactly one cause (STF64). Frames serve test loops,
`propertyTest`, `checkpoint(…, { at })` and playback. There is no `frames` option (W22).

**`run.frames`** keeps at most 10,000 and **exposes `truncated`** (W25): a readonly array whose `truncated: boolean` is
**non-enumerable**, since an enumerable one fails `toEqual` and `toMatchObject` against a plain array (run, SA RV1) **[P, SA RV1 M14]**. Its
**iterator throws `FramesTruncated`** after yielding the last kept frame, so a `for … of`, spread or `Array.from` over a truncated run cannot finish quietly; `.every`, `.map`, `.some`, `.forEach` and `toEqual` can, which is stated, not fixed, since 10,000 frames is rare [SA RV2 L5];
`run.frames[i]`, `.length` and `.truncated` stay plain, and `.filter` loses `truncated`. The first 10,000 stay **[P, SA H21]**. Step cuts,
checkpoints and any frame named by `{ at }` are **never** truncated, as the trace never drops checkpoints (Inspection O4; SP RV L1).

**Reading after the run [P, SA H6].** Reads run in test code, after `run()` has finished and the Runtime is gone. So every read is
answered from what was captured [P, SA RV1 M6]. Every frame captures snapshots, store revision, `now`, truth, evidence position, and only
`work` and lanes of `inspection`, which playback's Inspect and `lane` need. Cuts and named `{ at }` frames capture the full `inspection`;
the executor knows the plan, so it captures those on demand. A session's 256-entry ring is therefore not copied per frame. A frame's
`inspection` has that narrower type, and `propertyTest` drops a run's frames once they are checked. **Memory is unmeasured**; measure
before accepting. Reads are pure and start nothing. A
value read at an earlier checkpoint never changes: a logged request's `phase` is its phase **at that cut**.

**The reads** (SC3, W23, W24). A checkpoint, `run.end` and every frame have the same reads. **Every read with no tab means tab `"main"`**, as
Testing O7 says [P, SA RV1 M3]:

| Read | Returns | Subjects | Status | Tier |
| --- | --- | --- | --- | --- |
| `state` | the active leaf's state token; throws `SubjectAbsent` if the subject is absent | machine, fragment | SC1's example; the throw is [P, SA RV1 M4] | common |
| `memory` | the memory, private fields typed (2.2.2); throws `SubjectAbsent` if absent | machine, fragment | as above | common |
| `operations` | the rows `s.operations` (2.7.5); throws `SubjectAbsent` if absent | machine, fragment | as above | common |
| `schedules` | `s.schedules`; throws `SubjectAbsent` if absent | machine, fragment | [P, SA RV1 M15] | common |
| `read()` | the whole snapshot, or `undefined` if absent (SP N3): the check for absence, and the snapshot `check(cp.read(), event)` and `O.x.get(cp.read(), k)` take | machine, fragment | W23 | common |
| `read(ref)`, `read({ actor, tab })` | that actor's snapshot, or `undefined` | all | W23 | common |
| `read(Stripe)` (a fake server) | its truth | all | W23 | common |
| `read(Stripe.confirm)` (an endpoint) | its request log, in arrival order, with phases (2.10.4) | all | W23 | common |
| `lane(O.x, key?)` | the lane at this cut, or `undefined` when it does not exist | machine, fragment | SC3 | common |
| `lane(address)` | the same, by address: `{ actor?, instance?, copy?, tab?, operation, key? }`; `operation` is a handle, or a string for a fragment's read or stream, type-checked against the summary (rule 57) | all; the only form on an app Story | [P, SA RV1 M5] | common |
| `records(kind, filter?)` | the run's records of one kind up to this cut; `filter` is an address plus kind fields, and `since: "checkpointName"` | all | SC3 | common |
| `attempt(O.x, address?)` | the Attempt's id, or `undefined` if none was minted by this cut | all | W24; the return value is [P, SA H4] | common |
| `now` | the epoch millisecond | all | W24 | common |
| `inspection` | `inspect(runtime)` (Inspection O1) at this cut, of tab `"main"`; `| undefined` on an app Story, where `main` may be closed [P, SA RV1 M3]; only `work` and lanes on a plain frame: lanes by identity, incarnations, work, sessions, domain queues and marks, persistence. Held wire items are not Runtime facts and are read from endpoints (SP RV L2) | all | W24 | uncommon |
| `tabs.b?.inspection` | the same for tab `b`; `tabs.b` is `undefined` while `b` is closed | app | [P, SA H5]; `tabs.<name>` is Testing O7's | uncommon |
| `entity(Entity, key, { tab? })` | the record as a view reads it, `{ data, predicted, uncertain, unconfirmed }`, or `undefined` (STR31), also when the tab is closed [P, SA RV1 M3] | all | W24 | uncommon |
| `read(Fake.storage)` | the encoded records at this cut's end; a cut only | all | [P, SA RV1 M6, SA RV2 L1] | rare |
| `serverView(label)` | a `dehydrate` label's first-render view, for comparison | app | Testing O7; [P, SA RV2 L6] | uncommon |

In test code the same values are also reachable as the design's reads on a snapshot (`O.like.get(cp.read(), k)`, `Issue.get(cp.read(), k)`). A
`toBeUndefined()` on a tab-less read while `main` is closed passes for the wrong reason, so a test of another tab names it. **Absent** [P, SA RV1 M4]:
2.10.17.4's `Absent` and `Ended` read absent; `Frozen` reads its slice, and `inspection.incarnations` says frozen; on a machine Story, after
`dispose()`. **Dropped** [P, SA RV1 M15]: `Entity.get`'s `shape`, `descriptor.get(checkpoint, …)`, `Domain.entry.get(checkpoint, …)` and
`Entity.queue(checkpoint, …)`, in favour of `Issues.list.get(cp.read(ref), …)` and `cp.inspection`. To share a helper across Stories, annotate
`Story.Frame<typeof PayMachine>`, by subject, not Story, since a Story's checkpoint names would not assign across Stories [P, SA RV1 M7].

**`lane` [P, SA H17].** `lane` differs from `O.x.get` on purpose. `O.x.get` is total, for views, and returns the idle row. `lane` is
for tests, and `undefined` means there is nothing there (SC3), so a settled lane reads as gone and a wrong key fails.

- A **write**: its entry in Inspection's lane listing (2.10.7), which is every non-`Idle` lane by identity, with the row's flags:
  `{ key, subject, binding, releasing, state, pending, uncertain, waiting, retryCount, progress?, queued, parked }`. It reads the
  listing rather than the actor's rows so an unbound or unplaced lane still holding an unknown is not reported as gone.
  `paying.lane(O.pay, pi)` matches `{ pending: true }` (SC3); once settled it is `undefined`, and `operations.pay` still reads
  `{ pending: false, uncertain: false }` there.
- A **read or live operation**: its row (2.7.5), `undefined` before the first lookup, after `cancel`, or while not placed. A
  settled read is `Ready`, not gone.
- An **unkeyed** operation omits the key. On an app Story that is `lane({ actor: Checkout1, operation: O.pay })`.
- **Conversion risk** [SA RV1 M15]: 40 real tests use `O.x.get(at, k)`, which returns the idle row on a settled lane where `lane` returns `undefined`.

**Attempts [P, SA H4].** `attempt(op, address?)` names the Attempt of `op` that the address names (rule 65): `attempt(O.pay)` when one
actor commits it once, `attempt(LikeButton.O.set, { actor: BoardP1 })` for the board's, and `{ n }` (from 0) picks among one
address's Attempts in mint order (`n` is a kind field, rule 65). It reads **mints**, wherever they were restored: an Attempt minted in `main` and restored in b reads under `{ actor }`, even with main closed, and is `undefined` under `{ tab: "b" }` [P, SA RV2 L13]. An address that matches several without `n`, here or in `lane`, **throws `AmbiguousRead`** in the
test, never guessing (RENAMED from `AmbiguousAttempt`, since `lane` needs the same rule). An address's `operation` takes a handle where
one is visible: a definition's `O.x`, or a fragment's write through `Fragment.O.x`, used only as a name, so rule 50 holds. A
fragment's read or stream has no outside handle (rule 50), so it is named by `instance` and the operation's name, type-checked
against the subject's summary (rule 57), as a schedule is named by its string (2.10.3); alone, its instance is `[]` (delegated, at
merge).

**Checking a read: what replaces `expect`'s five rules** (SC1, SC3, SC4). All **[P]**, and the probes ran on Vitest 5.0.5:

| The old rule | Now | Example |
| --- | --- | --- |
| Objects match the keys listed | `toMatchObject` | `expect(cp.memory).toMatchObject({ busyTries: 1 })` |
| A key listed as `undefined` matches only an absent key | **Not `toMatchObject`**, which fails on an absent key listed as `undefined` and passes on a present one. Use `.toBeUndefined()` on the read. `.not.toHaveProperty` fails on a key held as `undefined`, which snapshots keep faithfully (Testing O4) [SA RV1 L1] | `expect(cp.lane(O.pay)).toBeUndefined()` |
| Arrays match element by element, equal length | `toMatchObject`, which requires equal length; or `toHaveLength` for a count | `expect(cp.records("ending", { operation: O.pay })).toHaveLength(1)` (SC1's example) |
| Primitives match exactly | `toBe`, or inside `toMatchObject` | `expect(cp.now).toBe(t0 + 60_000)` |
| A state token matches at or below it | Leaf: `toBe`. A parent: the existing `token.is` | `expect(cp.state).toBe(S.PAYING)`; `expect(S.WIZARD.is(cp.state)).toBe(true)` |
| `Story.attempt` as a matcher | A plain value inside `toMatchObject` | `expect(cp.read(Stripe)).toMatchObject({ charges: [{ key: cp.attempt(O.pay) }] })` |

Use `toBe` for `state`, never a token inside `toMatchObject`: tokens compare by identity, and a deep subset compare of one says
nothing useful. The runner's `toMatchObject` on a read that has no value fails with a clear diff. An `attempt` that reads `undefined` makes `toMatchObject` compare against `undefined`, which the runner reports
as a mismatch on a present id. No matchers are added for now (SC4); `toHaveLane`, `toHaveRecord` and `toBeIn` stay in `revisit.md`.
The same reads work on any runner (SC3), and nothing here imports a Flow test adapter: there is no `@flow-state/vitest` or `storyTest`
(decisions' proposed list).

**"This never shows"** [W25, P for the shape]. A loop over frames:

```ts
test("never shown twice", async () => {
  const run = await created.run()  // user-defined: created
  for (const frame of run.frames) {  // the iterator throws FramesTruncated if any were dropped [P, SA RV1 M14]
    expect(shownTwice(frame)).toEqual([])         // user-defined: shownTwice, a plain function (2.10.18.4)
  }
})
```

**One home per kind of record** (STR48, STF33, STF55). `run.evidence` is one list in run order; each record has the run-wide
`seq`, the Runtime's own sequence, and `tab: { name, open }`, so a closed tab's records and the reopened tab's are told apart
(STR42, SP RV M4); filters accept the name alone. `cp.records(kind, { …address, since?: "checkpointName" })` selects one kind, in
order, up to `cp`; `since` is exclusive of that checkpoint's `seq` and takes a **name** (type-checked), and a name later than `cp`
gives `[]`; on `Story.Frame<Subject>` it is typed `string` [P, SA H20, SA RV1 M7]. Records are kept for the whole run in process, taken from the Inspection O4 event stream, independent of
the trace's 4,096-event window and of Inspection's per-session 256-entry ring (STR49, STF76). Every kind is an Inspection O4 event
kind (STF72; members added in C79). **The table is the kinds `records` takes, 21** [P, SA H23, SA RV1 L3]; Inspection O4 has others, such as `turn`,
`lifecycle` and `admission`:

| Kind | One record per | Fields beyond `seq`, `tab` |
| --- | --- | --- |
| `step` | command | the command as data |
| `verdict` | send, raise, guard check of a lifecycle command | `actor`, `instance`, `copy`, `event`, `result` (`Allowed`, `Denied { reasons }`, `Unhandled`) |
| `ending` | ending delivered, parked, applied with no incarnation, or turned into evidence | `actor`, `instance`, `copy`, `operation`, `contract`, `verb`, `key`, `attempt`, `channel`, `reason`, `event`, `route` (`{ kind: "current" \| "late", from, owner }`, state paths), `declined` (`LateMayNotLeave`), `subject`, `disposition` |
| `lane` | write-lane cell applied (rule 21, 2.7.13, 2.9.3) | lane identity, `cell` (row and state), `before`, `after`; evidence words are cells |
| `life` | fragment incarnation event | `actor`, `instance`, `copy`, `life`, `change` (`created`, `ended`, `frozen`, `thawed`, `reset`), `why` |
| `callback`, `exit` | callback told; exit taken (W34) | `actor`, `instance`, `copy`, `life`, `name`, `payload` |
| `listRepair`, `drop` | `.each` or keyed-schedule repair; dropped raise or timer delivery (rule 9). `drop` is not a wire drop: after `Stripe.confirm.drop()` it is `[]`; read the endpoint's log [SA RV1 L2] | `actor`, `instance`, `copy`, `reason` |
| `schedule` | armed, fired, discarded, retracted by a freeze | owner (an address), `dueAt` |
| `queue`, `store` | record-queue join, release, removal (`Superseded`, `Cancelled`, `Released`); predictions, confirmations, `uncertain` set or cleared, repairs, skips, tombstones | `entity`, `key`, `attempt`, `reason` |
| `session` | stream-session evidence (2.11.13's Inspection) | `actor`, `instance`, `copy`, `operation`, `key`, a `cell` per Streams T1 and T3 write (`<State>.<input>`), Streams T2's row and basis in place of `answer`, `proof` on a read, `bookmark` (`{ at, filled }`), `missed`, drops (a record carries `drop` only when one is written [final integration L9]), `Overflow`, `Discarded`, `st`, `ended` (the reason a session ended) [P, v3 item 6] |
| `request`, `control` | a fake's request (each phase change) or control | 2.10.4 |
| `delivery` | a stream frame's delivery [fakes-v2; renamed from `frame`, P, SA RV1 L2] | `endpoint`, `connection`, `phase` (`delivered`, `held`, `lost`), `digest` |
| `issue`, `diagnostic`, `persistence`, `hydration`, `entry` | as Inspection O4; `UnusedWireRule` is a `diagnostic`: a wire rule that never fired by the end of the run [P, SA RV1 M17]; 2.11.13's flags `ValuesWhileDown`, `RegistrationChurn`, `ReleaseOverdue`, `ProofWithoutPosition`, `PingsWithoutLive`, `IdleWithoutPing`, `DeliveryDenied`, `FillsUntouched` are `diagnostic` records | as Inspection O4 |

One shape everywhere: `instance` is a list of placement names (`["likes"]`), `copy` is the `.each` copy's key string,
`key` is the contract's key record, `subject` is the subject path (STF38). A callback and an exit with the same name
are two kinds (STF59). An owner is a state path (STF40). An `Overloaded` commit never joined a queue, so it is an
`ending` record, not a `queue` removal (STR32).

**Work** (STR51, STF31, STF32, STF34). `cp.inspection.work` lists the Runtime's unfinished things with what each
waits for, and nothing else: a queued mailbox item (`{ actor, item: "event" | "reset" | "adoption", event, from }`); an
Attempt waiting (`waitsFor: "acknowledgement" | "recordQueue" | "capture" | "server"`, the last with the request's
`n`); a deadline (owner address, `dueAt`, `frozen`); an open session. A lane's state is never repeated there. `pending`
keeps the design's one meaning, the lane row's `InFlight`; the record's old `pending` is `predicted` (E16).

**A moment inside a step** (uncommon; STF46). `checkpoint(name, { at: { settled: O.like } })` names the latest frame of
the previous step whose cause matches; the other causes are `{ turn: E.X }` and `{ step: "invoked" }`. The
confirmed-but-saving moment of 2.8.1 is then a named frame. It has every read in the table above. Its `wire` is not captured,
since a frame has none; a held item at that moment shows in `read(endpoint)`'s phases. `at` here is a checkpoint option and needs
no rename now that `at` is not a read **[P]**.

#### 2.10.7 Lanes and rows

Rows are snapshot data (brief C7; 2.7.5), so a frame shows them exactly as a view at that publication reads them
(STR28, STF67). Keyed rows are keyed lists of the lanes that exist; `operations.like` lists only
existing lanes, and `lane(O.like, key)` is `undefined` for one that does not exist, so a wrong key fails instead of reading idle (SC3, STF30); the design's `O.like.get(s, k)` stays total for views.
`cp.inspection.lanes` lists every non-`Idle` write lane by identity (actor identity, contract id, key), with subject
path, `binding` (`bound`, `unbound`, `unplaced`), `releasing`, state, flags, queued commits and parked endings: the same
listing as Inspection O1 and `runtime.unsettledWrites()` (STR29, STF41). A parked lane under `cancel` or `allow` is listed
`Held` with `uncertain: true`, as 2.7.13's `Held (parked)` table decides; that listing is where a Story reads it
(STF42). Read lanes and sessions are not write lanes and are never in that listing (STF35). Every ending is an `ending`
record (STR30); "admitted" means only 2.5 step 1, and entering the mailbox is "queued" (STF36).

#### 2.10.8 Entities and the store

Server truth is per run, in fakes; client truth is per tab, in the store; a fake never writes the store, and truth
reaches it only through real responses and pushes (STR34). A test compares them in its own words (W24):

```ts
expect(cp.read(Issues)).toMatchObject({ issues: { c7: { likes: 4 } } })
expect(cp.entity(Issue, { id: "c7" }, { tab: "b" })).toMatchObject({ data: { likes: 4 }, predicted: false })   // STF51
```

The three moments of a domain write (start, settlement, admission) are three publications, hence three frames (STR33, STF46);
`predicted` is read per record and omitted fields are listed in `unconfirmed`, which is what a read at settlement states (STF45,
STF50). A record queue's members, with Attempt and retry count, are in `cp.inspection`; a removal is one `queue` record with its
reason (STR32, STF48). A deleted record reads `undefined` like a never-loaded one, as a view sees it, and the tombstone that tells
them apart is in `cp.inspection` and in `store` records while it lives (STR31, STF49). The boundaries (64/65 with no partial join,
FIFO across two actors, a forced repair holding the queue, `uncertain` set and cleared) are reached by holds and sends (STR35;
2.10.18).

#### 2.10.9 Streams (controls decided, W37)

This section reads 2.11's `Feed`, sessions and rows. Reconnecting and history run from the contract (`reconnect`, `idleTime`, `catchUp`), so an adapter has no combinator and Flow's own sleeps carry the `timer`s. `.do(…)`, `.process()` and checkpoint predicates are gone (SC1, SC2, W2, W37); the [record](merged/story-checks/stories-amended.md)'s section 11 has the conversion from the earlier controls **[P, SA H22]**.

A stream endpoint is a connection: `Fake.stream({ request, frame, open, ping? })` (2.10.4) [fakes-v2; `ping`, v3]. `open(truth, request)`
returns `{ frames?, refuse?, end?, truth?, send? }`. Duplex waits for the first duplex fake [P, SA RV2 section 8]. Any handler or
control reaches open connections through its `send` list: `socket.frames(where, frames)`, `socket.close(where, code, reason?)` and
`socket.end(where)`, where `where` reads the connection's request. `Fake.webSocket` binds stream endpoints to
`Socket.WebSocketConstructor`; `Fake.fetch` binds them to a streamed body; a client half reads one as `server.socket(input)`, and an
`EventSource` or SDK subscription is a client half over that (STR19). So every `Feed` signal comes from the real adapter reading
real frames (STR36, STF77). Stream controls are ordinary wire steps, with no stream-specific step words (W37):

| Real sequence | Story step |
| --- | --- |
| a greeting that proves a replay, or registers without one | `open` returns the author's `frames`; a control `Chat.greet({ replay: false })` changes truth, which `open` reads |
| a drop, then a reconnect from the bookmark | `world(Chat.socket.drop())`, then `advance({ next: { operation: O.messages, timer: "backoff" } })`; `next` only, since the default is jittered [v3 item 7] |
| a reload that keeps the bookmark | a `Story.app`, since `reload` is a type error on `Story.machine` [v3 item 7] |
| network-refused attempts, a flap | `drop({ at: "open", times: 3 })`; a loop of drop and advance |
| a server refusal | `open` returns `refuse: 4403`; under `Fake.webSocket` the client sees an error, then close 1006, as a browser does, and the code is only in the log (2.10.4) |
| a server's heartbeat | `ping: { every, frame }` on the stream [v3 item 1]. A ping does not register: `open` still sends the greeting [P, final integration L3] |
| a quiet or half-open connection | `hold()` on the socket (frames and pings stop, nothing closes), so a client's `idleTime` ends it with the reason `Silent`, which is `Feed`'s, not the wire state `Silent` |
| silence after n frames | `hold({ after: 2 })` [fakes-v2] |
| a server close code (token expiry) | a handler or control with `send: [socket.close(where, 4401, "expired")]` |
| a clean end of a body | `end: true` on `open`, or `socket.end(where)`. Under `Fake.webSocket` this is close 1000, which Effect's `Socket` fails as `SocketCloseError`, not a stream end; Streams T1's `stream completes` from a raw socket is adapter code reading code 1000 [SA RV1 M11] |
| a log reset, retention shorter than the gap | controls `Chat.resetLog({ epoch })`, `Chat.retain({ last })` |
| a catch-up page held, answered, failed | the history endpoint under `hold`, `release`, `drop`, **set before the step that reads it**; a failed page's retry is `next: { operation, timer: "page" }` [v3 item 9] |
| a flood past the buffer | a control that sends `1,024 + 1` frames; a flood is a long list [P, final integration section 2] |
| reordered frames (the brief's SR12) | `hold()`, the frames, then `release({ nth })` |

**The resume position the server saw** is the socket endpoint's request log, read directly:
`expect(cp.read(Chat.socket)).toMatchObject([{ input: { from: { epoch: 1, seq: 2 } } }, { input: { from: { epoch: 1, seq: 5 } } }])`.
The fake keeps no `connections` field by hand (SP RV L4).

Rows (`connection`, `drop`, `failure`, `catchingUp` for `every` [P, v3 item 5]; `value`, `last { value, at }` for `latest`) are snapshot data; the bookmark is in `session` records and Inspection only. They are read with `operations`, or `lane` with an address for one in a fragment (SA RV1 M5); after `FeedEnded` a
flapping test reads the row as `undefined`, not `Ended`, because `FeedEnded` left the placing state (Streams T1's row). Streams T2's row, each `proof` (on `Feed.live` and `Feed.done`), the bookmark with `filled`, `missed`, drops, `Overflow`, `Discarded`,
`st`, `ended` and release are `session` records (STR37) [P, v3 item 6]. **Spellings** [P, 2.11.4, 2.11.5]: `head` on `Feed.live`, `through` on a read's answer, and `at` only for the bookmark's own place. A test reads it as `cp.records("session", { operation: O.x }).at(-1)?.bookmark?.at`, and `.filled` for "stays cleared". Settling never waits for an open stream (STR38). A streaming
write's `progress` publishes as Runtime steps, so each token is a frame; Stop mid-stream is the send that cancels while the body is
open (STR39; SP 4.6). `backoff`, `page`, `healthy`, `idle` and a fake's `ping` run on the run's Clock (brief C12).

**What no transport can produce** (SP RC5; the socket-finalizer finding, SP RV M10). Effect 4.0.5's socket finalizer closes
with `Effect.sync(() => ws.close(1000))` and does not await the close, so a session's scope closes at once on release.
`ReleaseOverdue` and Streams T1's `Releasing` cells in which a signal or value arrives after release begins therefore cannot
be produced through `Fake.webSocket` or any binding whose finalizer does not wait, and SP revision 1's `hold({ at:
"close" })` is removed. They are reached in **Flow's policy suite**, whose purpose-built `Feed.callback` adapter has a
finalizer that awaits a gate (2.10.15). An app whose own adapter awaits its close (an SDK `removeChannel`) can reach them
through its own client half; the cells stay listed as suite cells.

#### 2.10.10 Persistence, reload and tabs (W26, W27)

An app Story's tabs are independent Runtimes of its setup that share the run's fake servers and `Fake.storage`
(STR42, Testing O7). A tab's identity is `{ name, open }`: the name and how many times that name has been opened (STR26's
seed already counts it), carried by `via` and every record (SP RV M4).

- `openTab(name, { from? })` constructs and readies one. With `from: "main"` it then ensures, in the new tab, the
  refs this Story's steps ensured in that tab's **latest life and did not dispose**, those it got from an earlier `from` included [P, SA RV2 L8], with the same options, in
  first-ensure order (SP RC3, SP RV2 M2), so `describe` prints the list from the plan alone. Refs app code ensured are
  ensured again by app code, as in production; `from` may name a closed tab (its latest life). Sends are not repeated: memory comes from
  the server or storage, as in production.
- `closeTab(name)` ends it abruptly with no final flush, releases its scope ownership (brief C11, brief C14), aborts its storage
  writes and leaves its remote requests in transit (2.10.4).
- `reload(name = "main")` is `closeTab(name)` then `openTab(name, { from: name })` in one step (SP N3): the reopened tab
  ensures what the closed one had ensured. It is the one-line reload every reload Story was writing by hand.

A reload mid-charge is written exactly (STR40, STF12): what was acknowledged, what the server applied, and when, are
each a step. After the reopen, restore, `Restored` endings, held lanes, parked endings and the delivery order before
any external event are records and frames. A tab opened while another holds the scope runs without persistence
(`SecondTabNoPersistence` in `cp.tabs.b?.inspection`'s persistence status). While a tab is closed, `read({ actor, tab })` is
`undefined` and its records stay (STR55, STF69). A focused machine Story's actor is a local identity, whose lanes are
never persisted (brief C14), so `closeTab` and `reload` there are type errors. Rebind is `dispose()` then `ensure()`; retain
expiry is `dispose(ref)` then `advance` past the retain; `dispose(ref, { how: "now" })` is `disposeActor` and
`{ how: "forget" }` is `forget` (STR9, STF43). Upgrades start from `storage: Fake.storage.from(oldStory)` (STR41).

#### 2.10.11 SSR and lazy entries

`dehydrate(label, { within })` and `hydrate(source, label?)` are Testing O7's, with two rules (SP RC5). **One world** (W29): a
hydration source Story runs against the destination run's fake servers, not a second run's, so the server render and
the client's refetch read one truth, as in production (SP RV M11). A source may not set `world` (a type error), runs at
the `hydrate` step against the truth current then, and its requests carry `via.tab: { name: "server", open }` (SP RV2 M6). **Time**: `dehydrate`'s time motion settles deadline by
deadline in 2.10.3's order (SP RV L8). A commit in flight at dehydration is a `hydration` record `DehydrateCommitInFlight`
naming the actor, state and instance path, and no client lane exists (brief C15). A state stream's `last` arrives rebased by
its age (STR43). **One clock** [P, SA RV1 M13]: a source runs on the run's clock and advances it. At a leading `hydrate` there is nothing else to fire. At a later one, tabs' sleeps are held as under `suspended` until it ends. `"server"` ranks before every tab. A source's `world` steps, not only the option, are a type error, so `Story.app`'s type carries "has no world"; its fixtures are its own, and its server is the destination's. Lazy adoption at a chosen step is Testing O7's (STR44). A cut keeps Testing O7's `serverView(label)` for first-render comparison, and hydration evidence is `hydration` records; W24's list does not name `serverView`, and no decision removes it [P].

#### 2.10.12 Fragments (constructor W1; W5, W30–W34)

**In a host** (STR11, STR12, STF53, STF55, STF60). Every fact about a fragment is a record at its actor, instance path
and copy: `life`, `callback`, `exit`, `listRepair`, `drop`, and its operations' `ending` and `lane` records with
`subject`. `cp.inspection.incarnations` lists each live or frozen incarnation (`{ instance, copy, life, status:
"active" | "frozen" }`), so a frozen slice no longer looks active (STF54). A fragment on two hosts gives the same
records at each host's address, and `match`, `attempt` and filters tell them apart by `actor` (SP RV M1, M2).

**Alone** (STR10, F7, rule 58). A trait or subroutine Story runs in a **stand-in host** Flow builds, whose placement
is decided by the **fragment's declaration alone**, never by later steps (rule 66, SP RV M7):

| Fragment | Placement | `leave()` | `leave({ end: true })` | `reset(subject)` |
| --- | --- | --- | --- | --- |
| a trait | one `.each` copy keyed by the Story's `subject` (default `""`), on a node, with `resetOn` returning the same subject | its node is left: the incarnation ends (`whenAbandoned`, rule 60's release) | the same | the reset value changes: a pending reset, a new life |
| a `.resumable()` trait | the same, on a resumable node | its node is left: the incarnation **freezes** | the copy is removed: a frozen or active incarnation **ends** | as above; a frozen one resets on its next `enter` |
| a subroutine | a state | the state is left: abandoned | the same | a type error |

So one prefix has one placement in every branch, a Story may use `leave` and `reset` together, and every placement is
one rule 48 allows. Nothing about the stand-in is readable (STF57): `read()` (and `state`, `memory`, `operations`) is the fragment's own snapshot (its memory
with private fields, schedules, rows); records carry the fragment's instance path `[]` and a subject path made only of
the Story's own `subject` (empty when none is given); a send after `leave` is `Unhandled`. Reads are re-rooted at the
fragment: the stand-in's two path parts (its copy key and its reset value, both the subject) are reported as one,
`[subject]`, or `[]` when no subject is given, in every read, `inspection` included (delegated, at merge).
**Rule 20 at the stand-in** reads its path as `[]` until the Story changes the subject (an `enter({ subject })` with
another value, or `reset`), since only then can a decline from another path occur (rule 51): a writing fragment that
does not map `failure.NotSent` may be tested alone, and `flow check`, which reads the Story's steps (2.10.14), reports
rule 20 at the first step that changes the subject (delegated, at merge).

```ts
const L = Lockout({ limit: 2, length: "1 minute" })
export const paused = Story.fragment(L, { id: "lockout/paused" })                    // a trait alone; no input declared, none written
  .enter()
  .guards({ canStrike: deny("Paused") })                                          // the stand-in's answers from now on (default: allow)
  .send(L.E.Strike())                                                             // public events; hostEvents are sendable alone
  .checkpoint("struck")
  .leave()                                                                        // ends, or freezes if resumable
```

`guards` is the one way to set a stand-in guard (STF58). `enter(input, { subject })` gives the subject a real host's
`.each` key or `resetOn` would; `enter` while frozen thaws (same subject) or resets on return (another). Callbacks and
exits alone and in a host are the same records (STF60); rule 11's `run.calls` and `checkpoint.exit` are gone (W34). 2.10.17.4
is normative. **Reads** [P, SA RV1 M4]: `Absent` and `Ended` read absent, so `read()` is `undefined` and `state`, `memory`, `operations`, `schedules` throw `SubjectAbsent`; a test of the memory at an exit reads a checkpoint before it. `Frozen` reads its slice, and `inspection.incarnations` says frozen.

#### 2.10.13 Playback

Recording is still `run()` once and only rendering after (brief C5). Every frame is a publication, so lane-gated buttons,
`check()` eligibility, stream connection states and the confirmed-but-saving moment render as production would
(STR52). `<StoryFrame frame={…}>` takes a frame or a cut (2.10.6) [P, SA RV1 M15]. The player moves by frame, step or scene, from the internal list of cuts: a step is never lost (STR53, STF63), and a frame's cause is one
cause (STF64). The next-action highlight compares the clicked control's addressed event, `{ ref?, instance path, copy,
tag, payload }`, with the next step's, so a keyed copy or a nested subroutine is found (STR54, STF68); steps that are
not clicks (`world`, `advance`) play as captioned waits. A frame between a settlement and its ending's turn shows its
queued arrival from `work` in Inspect, so it never looks stuck (STR56, STF70). For a tab that is closed at a frame,
`<StoryFrame tab="b">` renders nothing and reports the gap `{ tab: "b", closed: true }` (STR55, STF69). A Story holds no expectations (SC1), so the player shows no pass or fail; a `propertyTest` result gives the emitted Story and the frame index to look at [P, SA H11]. A fragment-alone Story has no app to render: handing it to
`StoryPlayer` or `StoryFrame` is a type error (W1 makes the kind visible on the line), and its frames are readable as text (playback.md 8's agent text frames); playback.md's
open question 2 stays open (STR57, STF71). Presentations stay typed, name checkpoints and hold no callbacks (STR58).

#### 2.10.14 CLI, `flow check`, `flow explain` and Inspection

- `flow story list`, `describe <id>` and `run <id>` work for every subject (STR59; W40). `describe` prints, from the plan alone:
  subject and kind (now the constructor's), options, every step with index in its data form, checkpoints, and **every fake server the plan
  names** in `world` or a step, with its endpoints, controls and their Schemas. A Layer is opaque, so a fake reached only through a fixture is
  not printed: `yield* Stripe` resolves per run from the run-scoped server registry (2.10.4), and only `story run` starts work [P, SA RV1 M9]. It has no expectation or property lines, because a Story holds neither (W40).
- `flow story run <id>` reports **what ran**, with no pass or fail on correctness (W40): steps, checkpoints with their state and
  `seq`, endings reached, requests per endpoint. **[P, SA H13, SA RV1 H4, M17]** It exits 2 when `run()` rejected, under CommandLine's "Story
  execution" failure, printing the `FlowError`'s boundary and evidence. It prints the earliest error as primary, `issue` records and `UnusedWireRule` diagnostics; "product
  failures recorded as Story issues do not alone fail the invocation" (CommandLine) stays. Tests answer whether values are right; `flow story run`
  never claims to.
- No SIGINT handler is installed for mid-run cancellation, since one cannot run during a run [SA RV3 L5].
- `flow explain --trace <file> --at <checkpoint>` answers lane, ending, store and session questions from the trace's
  records at that checkpoint's `seq`, and says "evidence unavailable" for what fell outside the trace window (STR59,
  brief C13).
- Every record kind is an Inspection O4 member, follows Inspection O5's redaction, and fake truth leaves a process as digests
  (STR60). Request `via` fields are identities and are never redacted.
- `flow stories --coverage` (T2; W40) also lists write-lane cells (from `lane` records' `cell`), stream cells (from
  `session` records' `cell`), ending handlers reached current and late (from `ending` records' `route`) and Flow
  reasons reached (STR61). **Coverage says reached, not checked [P, SA H14]**: it reads what Stories ran, and knows nothing about tests.
- The Story-derived `flow check` warnings read records the trace keeps (STR62): denial codes from `verdict` records,
  repairs and dropped raises, rule 51's declines from `ending` records, and mapper read-after-write from the `turn`
  event, which gains the keys its mappers read that the turn writes (D16).
- Types catch: unknown checkpoint names, a wrong instance path or copy key in an addressed event, a mapped, internal or
  host event sent from outside (rule 47, 2.2; host events only alone), a fixture list that does not meet `R`, an
  undeclared control (controls are members of the fake's handle), a schedule name in an address the subject does not
  declare, a read of an operation the subject does not declare, `state`, `memory`, `operations`, `schedules` or `read()` on an app Story's cut,
  `lane(O.x, …)` on an app Story, `at` on a handle, a `world` control on a hydration source, a subject of the wrong kind for its constructor (W1), and a fragment Story given to an
  app-only API (STR6, STR63).
- A Story is data: `flow check` and `flow graph` read its steps without running a Runtime (STR64).

#### 2.10.15 Reaching every cell: write lanes, streams and the policy suite

Every reachable cell is reached through production paths (W12: no injection). Each `lane` and `session` record
names its cell, so coverage counts cells; a "cannot occur" cell firing is a Runtime defect (an issue), which property
tests over the policy suite's machines search for (STR65, STR66).

| 2.7.13 holding table row | Reached in `Idle` / `InFlight` / `Held` by |
| --- | --- |
| `commit`, `retry`, `cancel` | the send (or timer) whose transition lists the member, after the lane was brought to the state: `InFlight` by `hold()`, `Held` by `drop({ at: "response" })`; `cancel` while waiting to be invoked by holding the acknowledgement (never sent) or a persisted re-send's `capture` (a re-send) |
| `idle`, `retryable` (guards) | a guarded send in each state; the result is a `verdict` record |
| invoked | settling once the acknowledgement, record queues and capture allow |
| storage refused | `Fake.storage.write.drop({ match: { purpose: "acknowledge" } })` (never sent); the same on `capture` for a re-send |
| success, failure, unknown, interrupt | the held request's answer; an interrupting client half, or a cancel's interruption |
| dispose, rebind | `dispose`; `dispose` then `ensure` of the same identity |
| restore | `reload`: acknowledged and on the wire (`unknown { Restored }`); acknowledgement stored, confirmation held (2.7.13's G1: acknowledged, never invoked); acknowledgement held, so aborted (`NotSent { Restored }`); with a `W` entry queued (its `NotSent { Restored }`); a cancelled Attempt whose acknowledgement was stored with its confirmation held (`unknown { Restored }`, Stories T7) |
| SSR hydration | `dehydrate` with a commit held on the wire, then `hydrate` |
| Runtime disposal | the policy suite's internal step only (Stories T2) |

The `cancel`/`allow` table adds `turn end`, reached by settling; `Held (parked)` by a persisted identity disposed by
retain expiry (`dispose`, `advance`), an unknown answer released while it has no actor, then `ensure`. 2.9.3's rows:
another path's member by two copies whose commits share a key; freeze and thaw by `leave()` and `enter()` on a
resumable placement; parking in a live actor by removing the copy; the releasing rows by a `whenAbandoned` cancel and
a removal in each state, restore by `reload`, and the cleared mark by re-adding the copy before the lane is `Idle`. The
two hydration cells 2.7.13 calls untestable (G6) stay so.

For streams (Streams T1–T8, STR66) [P, v3 item 11]: Streams T1's signals come from `open`, controls and `ping`, values from `socket.frames`, `down` from
the adapter reading a `drop`, failure from `socket.close`, completion from `socket.end` or `end: true` on a body or client half (under `Fake.webSocket` close 1000 is adapter code's to read, SA RV1 M11), defect from a malformed frame, `idle` from `hold()`, release from leaving the state;
its page rows from the history endpoint and a control like `retain`, their delays from `advance({ next })`; Streams T6's
queue from floods through a `Feed.callback` client half; Streams T8's progress from a streamed body with a superseded
Attempt. Coverage counts Streams T1 and T3 cells, `<State>.<input>`, from `session` records. **Suite-only cells**: `ReleaseOverdue` and the `Releasing` cells with a late signal or value (2.10.9), Streams T1 and T3's cells for a turn in the wait for a predecessor [v3 item 11], and the
Runtime-disposal cells. The wire's own `interrupt` while in transit or while an answer returns cannot occur under
rule 61 (both are instantaneous within a step, SP MDL W2), so 2.10.17.2 no longer lists them.

**The policy suite** (STR67, operations merge-plan X33, brief C11). Flow's own suite is Stories over small purpose-built machines and adapters,
run by the same executor under its Clock. It uses one step apps cannot import, `disposeRuntime()` from
`flow-state/internal/testing`, and one adapter (a `Feed.callback` client half whose finalizer awaits a gate). The
executable lane, stream and Story models remain design checks (brief C1); their invariants become properties of the suite.

**Rule 58's walks, as steps** (STF62). Two copies on one lane, the second declined: two `send`s to two copies whose
commits share a key, `ending { reason: NotSent Rejected }`. A freeze during catch-up, thaw, `Interrupted`, `resync`:
`hold()` the read, `leave()` a resumable trait, `enter()`, then `advance` to `resync`. A creating raise meeting an
adopted hold: `drop({ at: "response" })`, `leave()`, `enter()` whose turn raises. A copy removed during a 412 save,
re-added, text kept: 2.10.18's `reopenedKeepsText`. An upgrade from a host-only lane: `storage:
Fake.storage.from(oldStory)`, `openTab`. A removed uploading copy, reload, nothing parked: `hold()`, a removal with
rule 60's cancel, `closeTab`, `openTab`, and the test reads `cp.inspection.lanes` as empty. Two rows of a nested writing trait,
one removed: two copies, `hold()`, a removal, and the test reads the other copy's rows. "A, B, A" under `resetOn`:
`reset("B")`, `reset("A")` alone, or the host's sends. A reload while frozen or while owed: `leave()` or `hold()`,
`closeTab`, `openTab`. A reload that loses a pending reset: `storage: Fake.storage.seed([an actor record whose reset key
differs from its saved incarnation's reset value])`, then `openTab`: the restore re-takes the value and resets the
trait as the first turn, before rule 44's deliveries (rule 51).

#### 2.10.16 Property tests and exploration (W25, W38, W39; Stories T5 B5, with SP RV's condition)

`propertyTest(story, options)` (W38) generates ordinary Stories by appending generated steps to a base Story. It takes **plain
functions** as its properties, in its own option (W25). It is the one place in Flow that judges, because searching and shrinking need
a verdict (rule 63).

```ts
// money.test.ts. Base Story: inputs only.
const base = Story.machine(PayMachine, { id: "pay/money", context: signedIn, fixtures: [StripeFake] })  // [W1]
  .send(E.Start(CART_1))                                                       // user-defined: CART_1, signedIn, PayMachine

test("charged once, never left authorized", () =>
  propertyTest(base, {  // story first [W38]
    steps: [
      [E.PayPressed(), E.Leave(), E.CheckAgain()],                             // Testing O6's generator: a sample array of step data [P, SA RV1 H3]
      [Stripe.confirm.hold(), Stripe.confirm.release(), Stripe.confirm.drop({ at: "response" })],
      [Stripe.busy({ times: 1 })],
      [{ advance: "2 seconds" }, { advance: "5 minutes" }],                    // the shape together takes
    ],
    properties: {  // own option, plain functions [W25, W38]
      chargedOnce: (frame) => {                                                // user-defined: chargedOnce; the key is its name
        const { charges } = frame.read(Stripe)
        const twice = charges.filter((c, i) => charges.findIndex((d) => d.intentId === c.intentId) !== i)
        return twice.length > 0 ? twice : undefined                            // undefined: fine; any other value: the violation
      },
    },
    whenQuiet: {  // checked once, at the quiet point [P]
      noneLeftOnACard: (cut) => {                                              // user-defined
        const left = cut.read(Stripe).charges.filter((c) => c.status === "authorized")   // this Stripe's Charge has a status (the Checkout's, not 2.10.4's)
        return left.length > 0 ? left : undefined
      },
    },
    seed: 11,  // required
    runs: 200,  // default 50
    length: 30,  // default 40; Testing O6's "steps"
  }))
```

**Options.** `propertyTest(story, { steps, properties?, whenQuiet?, seed, runs?, length?, quietWithin? })`. `steps` lists generators
of step values: Testing O6's nonempty sample arrays, or pure `{ sample, shrink }` objects. **A step value is a step's data form** (2.10.1), any but `checkpoint` [P, SA RV1 H3, SA RV2 M10], so an app Story can generate targeted sends, lifecycle steps and races:

```ts
steps: [  // on an app Story
  [{ send: [payRef, pay] }, { send: [{ actor: payRef, tab: "b" }, pay] }],  // { send: [target?, ...events] }
  [{ reload: "main" }, { closeTab: "b" }, { openTab: ["b", { from: "main" }] }],  // a lifecycle step, keyed by its method
  [{ together: [{ send: [payRef, pay] }, Stripe.confirm.release()] }],  // a generated race, so 2.7.13's P1 is findable
  [Stripe.confirm.hold(), Stripe.confirm.release()],
]
```

The desk and Checkout invented a `Generate` module; no design defines one, so none is added here.

**Properties are plain functions** (W25, W38). `properties` is a record of `(frame) => violation | undefined`, named by its key, run on
every frame of every generated run. `whenQuiet` **[P, SA H9]** has the same shape, over the cut at the quiet point, and runs once if that is reached.
This replaces the `frame.settled` the Checkout assumed.

**The quiet phase ends the world** [P, SA RV1 H2]. Otherwise a correct app rejects, since a run ending on `hold` leaves a Pay `InFlight` forever. After the generated steps, it releases every target with a standing rule **or a held item** [SA RV2 M4],
in the order set, then moves time within `quietWithin`. **These are ordinary steps and are part of the emitted Story**, so a pasted one reproduces. **Quiet** is no lane
`InFlight`, no held item, no queued arrival, and no deadline at or before the horizon that an operation owns. Open sessions, actor schedules that recur and setup-scoped sleeps do not count, so a polling app can go quiet [SA RV2 M4]. EntityDomains O4's "at quiet" takes the same line. **[P]** A function that throws counts as a violation carrying the error, so the
runner's `expect` works inside one; a function must be pure and has only the frame. **Flow's own read errors are not violations** [P, SA RV2 M5]: `SubjectAbsent` or `AmbiguousRead` thrown in a property, on a frame where a generated `dispose` left no subject, say, rejects as a `FlowError` with `reason: "PropertyDefect"`, naming the property, and shrinking retains a candidate only if its violation is not one of these. Otherwise a candidate dropping `enter` would "fail" on its first frame, and shrink the real failure to an empty Story. To share one across Stories, annotate
`(frame: Story.Frame<typeof PayMachine>)` **[P, SA RV1 M7]**, by subject, as a type only, since `StoryFrame` is the component. At least one of `properties` and
`whenQuiet` is required.

**Judging** (Testing O6's distinctions, kept). **[P, SA H8]** `propertyTest` resolves with `{ _tag: "Pass", seed, runs }` and rejects with a
`PropertyTestFailed` carrying `result`, whose `_tag` is:

| `result._tag` | When | Fields |
| --- | --- | --- |
| `Fail` | a property returned a violation or threw | `property`, `violation`, `at: { frame: n } \| { quiet: true }` [SA RV1 H2], `story` (the shrunk Story), `source` (the appended steps as a string, section below) [SA RV1 L9, SA RV2 M12], `run`, `seed`, `shrinks`, `bound` |
| `Fail` with `reason: "FramesTruncated"` | a generated run's frames were truncated, so some were not checked (W25; a truncated run never passes). No property failed, so nothing is shrunk, and **the search continues; a later real `Fail` wins** [SA RV2 M5]; lower `length` | `seed`, `run` |
| `Inconclusive` | turn exhaustion, pending external work, a quiet horizon not reached, insufficient evidence. **`StoryTurnLimit` and `HostTimeWait` under generation are here** [SA RV2 M5]. Never pass | `reason`, `seed`, `completedRuns`, `inconclusiveRuns` |

**All runs complete** unless one fails, and `Fail` wins over `Inconclusive`, so an `Inconclusive` at run 3 cannot hide a real `Fail` at run 50 [P, SA RV1 H2].

Acquisition, generator and cleanup defects, and `StoryFakeError`, reject as ordinary `FlowError`s, not counterexamples (Testing O6); a `StoryFakeError` here carries `seed`, `run` and the unshrunk `source`, since a crash found only on a generated path has no other way to reproduce [SA RV3 L5]. Rejecting makes
`test("x", () => propertyTest(…))` honest; a returned `Fail` that nobody checked would pass silently.

Two rules make generated runs useful (SP RV's B5 condition):

- **A generated step that is invalid in the current state is skipped**, never `StoryInvalidCommand`: a `release` with
  nothing held, a `leave` when not entered, an `ensure` of an existing actor. The skip is a `step` record with
  `skipped: reason`, and the same seed skips the same steps. **The emitted and shrunk Story leaves skipped steps
  out**: they had no effect, so the run is the same, and the literal Story replays without `StoryInvalidCommand`
  (STR69, SP RV2 M9).
- **Shrinking keeps pairs**: a `hold` and the `release` that ends it, a `closeTab` and its `openTab`, `enter` and
  `leave`, are removed together or not at all, so a shrunk Story never strands a hold it did not have.

Every fault Testing O6 names is one of those steps (hold, release, fail, delay as hold-advance-release, reorder as
`release({ nth })`, duplicate, lose as `drop`, push as a control, disconnect and reconnect, change subscriptions as
sends or `ensure`/`dispose`, invalidate as a step, crash and restore as `reload`, adopt as lazy adoption), so a shrunk
failure is a literal Story that runs and plays back (STR69, STF52). Shrinking retains a candidate only if the same property fails,
stops at 1,000 candidates or no smaller failure, and reports the bound (Testing O6).

**A counterexample [P, SA H10, SA RV2 M12].** The emitted Story holds inputs only (SC1), so running it alone reports nothing wrong. `source` is **the appended steps only, chained from the author's `base`**, since at run time a Layer or a ref's variable has no name: `base.world(Stripe.confirm.drop({ at: "response" })).send({ _tag: "PayPressed" })`. Its options come from `base`. Controls print by server name and endpoint, so the variable must match `Fake.server`'s name; events print as literals; refs print as `steps[i]`, by generator index, since the author passed them there; a non-JSON event payload such as `DateTime` does not paste [SA RV3 L5]. A run between `propertyTest` runs may yield to the host, so a runner's timeout can fire there. Its id is
`<base id>/counterexample/<seed>`, with no option needed. To keep it as a regression, paste `result.source`, lift the property to a `const`, and run the same plain function:

```ts
export const chargedTwice = base                                               // user-defined: base, the author's own  // the rest pasted from result.source
  .world(Stripe.confirm.drop({ at: "response" })).send({ _tag: "PayPressed" }).advance("5 minutes")

test("regression: charged twice", async () => {
  const run = await chargedTwice.run()
  for (const frame of run.frames) expect(chargedOnce(frame)).toBeUndefined()   // user-defined: chargedOnce, the same function
})
```

**Domains are a preset** (W38). Testing O6's domain form becomes `domainPropertyOptions(domains, inputs)`, exported from `flow-state/testing` so a testing helper stays out of a production module **[P: RENAMED from
`Domain.propertySteps`, SA H10, SA RV1 L12]**, which returns `{ steps, properties, whenQuiet, quietWithin }` to spread: its steps are the domain's faults
and its properties are EntityDomains O4's, as plain functions over `frame.read(fake)` and `frame.entity`, keeping O4's oracle, quietness
and `Inconclusive` rules.

```ts
propertyTest(base, { ...domainPropertyOptions([Issues], { setLike: likeInputs }), seed: 3 })  // [P]  // user-defined: base, Issues, likeInputs
```

**After `model()`** (W39; STR68, STF79). `model()` is removed. Finding a sequence the author did not write is this search on the
real Runtime: write the property "never `LOCKED_OUT`" and shrink the counterexample. Shrinking gives a **local minimum**, a short way
in, not the shortest (SP RV). Exhaustive paths and shortest counterexamples are given up; one Runtime and one execution path stay
(W39, T1).

**Weighed.** STR70 (worlds from contracts): in reach with no new runtime; the generators already range over every
endpoint a subject's contracts reach, every wire word and every address. STR71 (record and replay): in reach later as a
scripted fake whose truth is the recorded answers, recorded at the transport bindings; it needs stable event tags and
Schemas (present), raw in-process capture (Inspection O5 digests cannot replay), and it rots loudly when a payload no longer
decodes. STR72 (one controller): yes; user input, time, the network, server state and storage are steps of one plan,
seeded by one option, named by one address.

#### 2.10.17 State machines as tables

Normative for the executor, and complete enough to rebuild the executable model from this section alone: every state
is a column, every input a row, every cell defined or "—" (cannot occur, with the reason). The model's ambiguities
A1–A6 are settled here (delegated, at merge). fakes-v2's order and close rows and SA RV1 H5's rows are folded in below; the executable model was
extended with them and re-run ([merged/story-checks/model/RESULTS.md](merged/story-checks/model/RESULTS.md): 77 invariants pass; 92 of 95 mutants killed; wire searches capped at 200,000 states, depths 5 to 8; a ping's coalescing, the 100,000-deadline limit and `together({ advance })` are not modelled).

##### 2.10.17.1 What a step runs

| Step | Admission | Time | Settles (2.10.2) | Its cut | Errors |
| --- | --- | --- | --- | --- | --- |
| the start | fixtures acquired, first tab bootstrapped or actor started | fixed | after | one: a checkpoint before any step names it | a build parked after this settle with no deadline rejects here [P, SA RV3 M5] |
| `send(target?, …events)` | open | fixed | after each event | a step cut per event | `ActorAbsent`, `TabClosed`, `StoryTurnLimit` |
| `together(…inputs)` | held until every input arrived, then open | fixed, or moved by an `{ advance }` input (deadlines fire, events queue, no turns) | after admission resumes | one | as `send`; `NothingHeld`, `InvalidDuration` |
| `world(…controls)` | open | fixed | after each control | one | `NothingHeld`, `NoConnection` |
| `advance(d)` | open | each deadline ≤ now + d, then now + d | at each deadline (2.10.17.5), then at now + d | one | `InvalidDuration`, `StoryTurnLimit` (per instant; `reason: "Advance"` past 100,000 deadlines) |
| `advance({ next })`, `advance({ to })` | open | to the earliest unfrozen deadline the address matches; to `to` | as `advance` | one | `NoDeadline`, `InvalidDuration` |
| `advance(d, { suspended })` | the tab runs nothing during the move | as `advance`, the tab's sleeps skipped | at each world deadline; then the tab's overdue ones in deadline order, then its queued transport input | one | as `advance` |
| `ensure`, `dispose`, `enter`, `leave`, `reset`, `setContext` | open | fixed | after | one | `AlreadyEntered`, `NotEntered`, `ActorAbsent` |
| `openTab(name, { from? })` | open | fixed | after bootstrap, then after each ensure `from` repeats | one | `TabOpen` |
| `closeTab(name)` | the tab stops | fixed | after (other tabs; remote requests keep travelling; local writes abort) | one | `TabClosed` |
| `reload(name)` | as `closeTab` then `openTab(name, { from: name })` | fixed | as both | one | as both |
| `guards(answers)` | — | fixed | no | one (no publication) | — |
| `dehydrate` | open | moves time as `advance` does | after | one | Testing O7's |
| `hydrate` | open; a leading one runs before bootstrap | a source advances the run's clock; at a later one, tabs' sleeps are held as under `suspended` until it ends [P, SA RV1 M13] | after | one | Testing O7's |
| `checkpoint(name, { at? })` | — | fixed | no | names the latest step cut (`at`: a frame of the previous step) | duplicate or unknown names are type errors |

A run never yields to the host between its first step and its cleanup. Every settle runs the drain until `K` consecutive hops show no scheduler activity and no arrival at anything of Flow's, within the hop cap (`StoryTurnLimit`, `reason: "Settle"`). After the last cut, if a commit or read fiber is parked, the run finishes the world, with nothing reaching the evidence; a fiber still parked is `HostTimeWait` (2.10.2, rule 61) [P, SA RV2 H1, M1, M2, SA RV3 M1].

**Cleanup** [P, SA RV3 M3]. During cleanup the Clock runs free: a settle that leaves a finalizer parked jumps to the next deadline, so a flush after a short sleep and a close under `Effect.timeout` finish. Cleanup may yield to the host, and has its own hop cap and a real-time bound, proposed 1 second. Past either, it is a cleanup failure naming the finalizer's scope. The run has already been judged, so a real timer here cannot change the result. An uninterruptible loop in a finalizer still starves the host (reasoned, not run). A world control applied while every tab is closed still has a step cut (rule 64).

##### 2.10.17.2 A request at a call endpoint

**Rules.** Each server keeps two lists of rules `{ target, word, at, times, match }` (target: the handle, covering every
endpoint, or one endpoint), ordered by when each was set: one for calls and attempts, one for frames (2.10.4) [P, SA RV1 H5]. **At arrival** a request takes the earliest-set rule whose
target covers its endpoint and whose `match` it fits, and only that
rule, whose `times` then drops by one (at zero it is removed unless it still holds an item, 2.10.4 rule 5 [SA RV3 M6, SA MDL N3]; `"always"` stays). Its effect applies at the rule's phase.
Requests from tabs reach the endpoint in invocation order (2.10.2). Under rule 61 a request is never observable between
leaving the client and reaching the gate, nor between the handler's answer and the client (SP MDL W2), so those are not
states.

States: `Held` (in transit, unseen by the server), `Server` (`handle` commits synchronously, its `send` is delivered, and its answer waits in the FIFO answer list; only `together` can observe this state, since a settle delivers the list) [P, SA RV1 M1, M2], `HeldAnswer` (handled;
the answer waits). Each request also has `gone` (its client cancelled, or its tab closed). Terminal phases: `answered`,
`lost`, `dropped`, `orphan` (handled, nobody to answer), `duplicate` (a second copy's answer, discarded).

| Input ↓ / State → | (arriving) | `Held` | `Server` | `HeldAnswer` |
| --- | --- | --- | --- | --- |
| its rule is none | → `Server` | — | — | — |
| its rule is `hold()` | → `Held` | — | — | — |
| its rule is `hold({ at: "response" })` | → `Server`, marked to hold | — | — | — |
| its rule is `drop()` | → `lost`; the client gets `Fake.Lost` | — | — | — |
| its rule is `drop({ at: "response" })` | → `Server`, marked to drop | — | — | — |
| its rule is `duplicate()` | → `Server`, and a copy → `Server` after it | — | — | — |
| `release()` on its target | — | → `Server`, in arrival order, after the `HeldAnswer`s join the answer list [P, SA MDL G3] | no change; a request marked to hold: the rule ends for later arrivals, and its answer is delivered once ready [P, SA MDL U2] | joins the answer list, in arrival order; then → `answered`, or `orphan` if `gone` |
| `release({ match })`; no item matches: `NothingHeld` [SA MDL N1] | — | matching: → `Server`; else stays | no change | matching: as `release()`; else stays |
| `release({ drop: true })` | — | → `lost` | no change | → `dropped`; the client, if any, gets `Fake.Lost` [SA RV3 L3] |
| `release({ nth: k })` | — | the k-th held item (from 1, arrival order, `HeldAnswer`s counted) first within its kind, then the rest as `release()`; fewer than k held: `NothingHeld`, naming k, nothing released (2.10.4) [SA MDL N2] | no change | as `Held`'s cell |
| handler answers | — | — | commits, delivers its `send`, then by the one order: a copy: → `duplicate`; marked to hold: → `HeldAnswer`; marked to drop: → `dropped` (the client, if any, gets `Fake.Lost`); `gone`: → `orphan`; else, at its turn in the answer list, → `answered`, or `orphan` if `gone` by then [SA RV3 L3] | — |
| `handle` throws (a crashed server): no truth, no frames | — | — | the table below; `StoryFakeError` at the run's end | — |
| its client cancels, or its tab closes | — | stays `Held`, `gone` | continues, `gone`; its frames still go | stays, `gone` |
| a tab is suspended | — | stays | continues (the server is not suspended); its answer waits in the tab's transport | stays; delivered when the tab wakes |

**Handler fails**, in the same order as the row above, so a hold-marked `gone` request is `HeldAnswer` whether it crashes or not, and `release` then makes it `orphan` [P, SA RV1 M1, SA MDL G1]:

| Handler fails | Result |
| --- | --- |
| a copy | → `duplicate`, nothing reaches the client |
| marked to hold | → `HeldAnswer`, holding the failure |
| marked to drop | → `dropped`, `Fake.Lost` if a client is there |
| `gone` | → `orphan` |
| otherwise | → `answered` with the binding's failure (`Fake.Lost`, `500`, close `1011`) |

A held item belongs to the rule that held it: `release()` on a target delivers exactly the items its own rules held
(a handle's, on any endpoint) and removes every standing rule whose target is its own (a handle's `release` does not
end an endpoint's rules, nor the reverse). With no held item and no standing rule it is `NothingHeld` (SP MDL W1),
at a call endpoint, a stream endpoint and `Fake.storage` alike. Every change is a `request` record. 14 rows × 4 columns: 56 cells, 26 defined, 30 "—" (a
request takes its rule once, at arrival, and a handler acts only on a request at the server).

##### 2.10.17.3 A connection at a stream endpoint

States: `None` (no connection), `Opening` (an attempt held by `hold({ at: "open" })`), `Open` (including one still counting a
`hold({ after })`), `Silent` (frames held), `Closing { code }` (a server close or end queued behind held frames; the server sees it
as closed, the client as silent) [fakes-v2: "2.10.17.3 gains this state"], `Closed { code }`. A tab's transport input waits while the
tab is suspended, in every state, and is delivered at wake. A clean end is `{ code: 1000 }`. Under a `hold({ after })` a frame counts as
it is delivered, and the frame that reaches the count takes the connection to `Silent`, with later frames queued. Words here are per connection, and 2.10.4's combination rule applies: a word on a handle reaches these rows as the same word on every stream, with `hold` also holding attempts and `drop` as below. Attempts use the arrival list; frames rules the other.

| Input ↓ / State → | `None` | `Opening` | `Open` | `Silent` | `Closing` | `Closed` |
| --- | --- | --- | --- | --- | --- | --- |
| an attempt, rule none | `open` runs. `frames`, `end` absent → `Open`, frames sent (or `Silent`, queued, under a hold in effect); `refuse` → `Closed { code }`, log `refused`, the client sees the binding's refusal (2.10.4); `end: true` → frames, then `Closed { 1000 }` (or `Closing { 1000 }` under a hold in effect, or once a count is reached, [SA MDL G12]); throws → `Closed { 1011 }`, `StoryFakeError` | — | — | — | — | as `None` (a new connection) |
| an attempt, rule `hold({ at: "open" })`, or a handle's `hold()` | → `Opening` | — | — | — | — | → `Opening` |
| an attempt, rule `drop({ at: "open" })`, or a handle's or a standing `drop` | lost, log `lost`: the binding's lost (`Fake.Lost`, close `1006`), stays `None` | — | — | — | — | lost, stays |
| a `send` of `socket.frames` matches | nothing (no connection) | nothing; `open` replays from truth | delivered in order | queued | nothing: the server sees it closed | nothing |
| a `send` of `socket.close` matches | — | nothing: the server has not seen it [SA RV1 M11] | → `Closed { code }`, after frames ahead of it | → `Closing { code }`: queued last | — | — |
| a `send` of `socket.end` matches | — | nothing: the server has not seen it [SA RV1 M11] | → `Closed { 1000 }`, after frames ahead of it | → `Closing { 1000 }`: queued last | — | — |
| a `ping` is due [v3 items 1–3] | — | — | delivered; not counted by `after`, not doubled | nothing; none queues | nothing; none queues | — |
| `hold()` (frames) | a standing rule: the next connection opens `Silent` | the rule applies when it opens | → `Silent` | joins its holds | joins its holds | a standing rule, as `None` |
| `hold({ after: n })` | a standing rule: the next connection counts from its first frame | the rule applies when it opens | counts on its own from now [SA MDL G8, N6] | a count, starting when frames flow again [SA MDL N4] | a count, starting when frames flow again [SA MDL N4] | a standing rule, as `None` |
| `release()`, no other hold left on it | ends standing rules; `NothingHeld` if none | the target's rules end, then the open completes as "rule none" [SA MDL G16] | ends standing rules, and any count; `NothingHeld` if none | → `Open`, queued frames delivered | queued frames delivered, then the close → `Closed { code }` | ends standing rules; `NothingHeld` if none |
| `release()`, another hold still on it | — | its own attempt: completes, → `Silent`; another target's: no change | ends its rules; a count of another rule goes on | ends its rules, stays `Silent`, queue kept [SA RV2 M8, SA MDL G2] | ends its rules, stays `Closing` | — |
| `release({ match })`; no held item on the target matches: `NothingHeld` [SA MDL N1] | no change | matching: the open completes; else stays | no change | matching: queued frames delivered, unless another target's hold covers it; stays `Silent` while the rule stands [SA RV3 M6] | matching: frames likewise; the close waits until no hold is left [SA RV3 M6] | no change |
| `release({ drop: true })` | as `release()` | the attempt is lost, as `drop({ at: "open" })` → `None` | as `release()` | queued frames lost; → `Open` when no hold is left | no hold left: frames and close lost → `Closed { 1006 }`; otherwise frames lost, stays | as `release()` |
| `release({ nth: k })` | as `release()` | as `release()` | as `release()` | no hold left: → `Open`, the k-th queued frame first, then the rest in order; otherwise as `release()` | no hold left: the k-th queued frame first, the rest, then the close, which is not counted; otherwise as `release()` | as `release()` |
| `drop()`, default `times` | if no connection matched: on the endpoint `NoConnection`, on a handle a rule for the next arrival | → `None`, lost, log `lost` [SA RV2 L4] | → `Closed { 1006 }` | → `Closed { 1006 }`, queued frames lost | → `Closed { 1006 }`, at once; queued frames and the close lost | as `None` |
| `drop({ times })`, above 1 or `"always"` | stands as `drop({ at: "open" })` | → `None`, lost; stands | → `Closed { 1006 }`; stands | → `Closed { 1006 }`, queued frames lost; stands | → `Closed { 1006 }`, queued and close lost; stands | stands |
| `duplicate()` | a standing rule for the next frame | as `None` | the next undoubled frame is delivered twice [SA MDL N5] | the next released undoubled frame twice | the next released undoubled frame twice | as `None` |
| the client closes (release) or its tab closes | — | → `None` | → `None` (Effect's finalizer does not wait, 2.10.9) | → `None`, queued frames lost | → `None`, queued frames and the close lost | — |

18 rows × 6 columns: 108 cells, 83 defined, 25 "—" (an attempt arrives only with no live connection; a ping needs an open connection; a `where` selects only connections the server sees as live, or a held open; another hold cannot be on a connection that does not exist; nothing is closed by a client that has no connection). 2.10.4's three combination rules are normative over these rows. `release({ nth: k })` with fewer than k queued frames releases that connection in order; it is `NothingHeld`, naming k, only when no queue has k (2.10.4). A count reaching `n` during a release's delivery queues the rest again [SA MDL U1]. Rows reach connections in their open order [SA MDL G7]. An answer or frame that reaches a suspended tab waits in its transport and is delivered at wake, after the tab's overdue deadlines, in arrival order (2.10.3); pings coalesce to one [v3 item 3].

Changes **[P]** from the Stories merge's table beyond fakes-v2's: `release({ drop: true })` was in 2.10.4's word table with no row here; a second `hold()` on `Silent` was "—", though a Story can write it. `message`'s row is cut (SA RV2 section 8): a client's frame is ignored and logged in any state. Each `send` to a connection is a `delivery` record. A client close logs `{ phase: "closed", code: 1000, by: "client" }` [SA RV1 M11].

##### 2.10.17.4 The stand-in host (a fragment alone)

Placement per 2.10.12's table. `subject` is the Story's subject value; "same" and "other" compare with the incarnation's.

| Step ↓ / State → | `Absent` | `Active` | `Frozen` (resumable) | `Ended` (exit taken) |
| --- | --- | --- | --- | --- |
| `enter(input, { subject })` | a new incarnation | `AlreadyEntered` | same subject: thaw (parked endings, then `activities`); other: reset on return, a new life. The subject compared is `enter`'s when it gives one, else the one `reset` stored | a new incarnation |
| `leave()` | `NotEntered` | resumable: → `Frozen`; else → `Absent`, `whenAbandoned` and rule 60's release | `NotEntered` | `NotEntered` |
| `leave({ end: true })` | `NotEntered` | → `Absent`, `whenAbandoned`, release | → `Absent`: the frozen incarnation ends, `whenAbandoned` runs, its parked read endings become evidence (SP MDL H1) | `NotEntered` |
| `reset(subject)` (traits) | `NotEntered` | same: nothing; other: a pending reset, a new life | stores the new subject; the next `enter` resets, unless it gives a subject of its own | `NotEntered` |
| `guards(answers)` | stored | stored | stored | stored |
| `send(event)` | `Unhandled` | the fragment's turn | `Unhandled` | `Unhandled` |
| the fragment takes an exit (subroutines) | — | → `Ended`, an `exit` record | — | — |

7 rows × 4 columns: 28 cells, 25 defined, 3 "—" (only an active subroutine takes an exit).

##### 2.10.17.5 Order: equal instants and settling

| Rank | Owner of a sleep | Then by |
| --- | --- | --- |
| 1 | a fake's `ping` [P, v3 item 1] | server name, connection open order, arming |
| 2 | adapters (fibers of an operation) | tab order, actor creation, operation, key, arming |
| 3 | setup-scoped fibers (an SDK client, a rate limiter) | tab order, layer order, arming |
| 4 | the Runtime's own waits | tab order, actor creation, arming |
| 5 | actor schedules | tab order, actor creation, instance path in placement order, copy in list order, schedule key in list order, arming |

A handler is pure and takes no time (SA RV1 M1), so a fake's only sleep is its `ping`. It ranks first so a tie with a client's `idleTime` keeps a registered connection alive; without this rank, SA RV3 got `Silent` at 45 s or 90 s by arming order. A client half's own sleep ranks as an adapter under an operation, otherwise as setup-scoped. A hydration source's tab `"server"` ranks before every tab (SA RV1 M13).

At one instant one sleep wakes, the Runtime settles, then the next. "Tab order" is each name's first-open order; a
reloaded tab keeps its rank (SP RV2 L5). Inside a settle: tabs take turns one at a time in tab order; invoked Attempts reach fakes in invocation order (tab order, then the turn that promoted them); fake
handlers run in arrival order, and answers go through the one answer list: those a `release` freed join first, then handlers' [P, SA RV1 M2, SA MDL G3]; connections are reached in open order [SA MDL G7]; storage writes are FIFO per tab (2.10.17.6).

##### 2.10.17.6 A write at `Fake.storage` (local)

States: `Queued` (behind an earlier write of the same tab), `Held`, `HeldConfirm` (stored; the caller's confirmation
waits). Terminal: `stored`, `aborted`, `refused`. Reads never queue behind writes (bootstrap restore is a read, STF6); their
own rows are below.

| Input ↓ / State → | (arriving) | `Queued` | `Held` | `HeldConfirm` |
| --- | --- | --- | --- | --- |
| an earlier write of its tab is unfinished | → `Queued` | — | — | — |
| its rule is none | → `stored` | — | — | — |
| its rule is `hold()` | → `Held` | — | — | — |
| its rule is `hold({ at: "response" })` | applied, → `HeldConfirm` | — | — | — |
| its rule is `drop()` | → `refused` (the caller sees the store's failure: `StorageRefused`) | — | — | — |
| its rule is `drop({ at: "response" })` | applied, → `refused`: the caller sees a failure though the bytes were written [P, SA RV1 M12] | — | — | — |
| the write ahead of it finishes | — | takes its rule now, as "arriving" | — | — |
| `release()` | — | no change | → `stored` (then the queue behind it moves) | → `stored`, confirmed |
| `release({ match })` | — | no change | matching: → `stored` | matching: → `stored`, confirmed |
| `release({ drop: true })` | — | no change | → `refused` | → `refused`: the caller sees a failure though the bytes were written |
| its tab closes | — | → `aborted` | → `aborted`: never applied | stays written; the confirmation is lost (2.7.13's G1 cell after `reload`) |

A cancelled Attempt's `Held` acknowledgement either lands before the capture that removes it (queued behind it; a
Persistence fact, Persistence O7) or is aborted with the tab (SP MDL F1). A `HeldConfirm` one stays written, so `reload` restores
it as `unknown { Restored }` (2.10.4; Stories T7). 11 rows × 4 columns: 44 cells, 19 defined, 25 "—".

`duplicate` is not a `Fake.storage` word (a type error): local storage has no network to repeat a request.

A read at `Fake.storage` (a slow or failed restore):

| Input ↓ / State → | (arriving) | `Held` |
| --- | --- | --- |
| its rule is none | → `served` | — |
| its rule is `hold()` | → `Held` | — |
| its rule is `drop()` | → `refused`: the restore fails as the store's failure would | — |
| `release()` | — | → `served` |
| `release({ match })` | — | matching: → `served` |
| `release({ drop: true })` | — | → `refused` |
| its tab closes | — | → `aborted` |

7 rows × 2 columns: 14 cells, 7 defined, 7 "—". While a restore read is held, the tab has not finished bootstrap:
its persisted actors are absent, and a send to one is `ActorAbsent`. Refused, the tab reports `StorageFailure` and runs
without persistence (Persistence O5).

#### 2.10.18 Examples

Each case starts at the real source, names the fake that stands in for it, and gives the Story and its test in full. Machines are
the design's (cited), unchanged. The record's chat case (SP 4.3) is 2.10.18.7 and 2.11.13. The LLM case (SP 4.6) has its contract and machine in 2.11.12.5, and its steps in 2.10.9; its Story is not written out (the plan's 2.7).

Every example is **[P]** in form: SC1's example fixes the shape, and these apply it. Names of fakes, controls, schedules and refs are
user-defined.

##### 2.10.18.1 Before and after: the common case

The SG2 case: an editor actor with input and a fake for its one service; two sends; time passes; the state, one
memory field, one lane row and what the server received are checked.

Before (the Stories merge of 2026-10-31, with `.expect` in the Story):

```ts
export const saved = Story.make(Editor, { id: "editor/saved", input: T42, fixtures: [TicketsFake] })
  .send(E.TitleChanged({ title: "Replace foyer light" }), E.SaveRequested())
  .advance("2 seconds")
  .expect({ state: S.SAVED, memory: { title: "Replace foyer light" }, operations: { save: { pending: false } } })
  .expect(Tickets.save, [{ input: { title: "Replace foyer light" }, via: { attempts: [Story.attempt(O.save)] } }])
test("editor saved", () => saved.run())
```

After:

```ts
// editor.story.ts
import { Story } from "flow-state/testing"

export const savesTitle = Story.machine(Editor, {  // [W1]
  id: "editor/saved", input: T42, fixtures: [TicketsFake],  // user-defined: T42, TicketsFake
})
  .world(Tickets.save.hold())  // A slow answer is hold, advance, release
  .send(E.TitleChanged({ title: "Replace foyer light" }), E.SaveRequested())  // each event is its own step
  .checkpoint("saving")  // camelCase [SC5]
  .advance("2 seconds")
  .world(Tickets.save.release())
  .checkpoint("saved")

// editor.test.ts
test("editor saved", async () => {
  const { saving, saved } = (await savesTitle.run()).checkpoints  // The Story is not named saved (SA RV1 M10)
  expect(saving.lane(O.save)).toMatchObject({ pending: true })  // [SC3]
  expect(saved.state).toBe(S.SAVED)  // [SC1]
  expect(saved.memory.title).toBe("Replace foyer light")  // not nullable (SA RV1 M4)
  expect(saved.lane(O.save)).toBeUndefined()                                     // settled, so gone [SC3]
  expect(saved.read(Tickets.save)).toMatchObject([  // [W23]  // user-defined: Tickets (a Fake.server, as 2.10.4's Stripe)
    { input: { title: "Replace foyer light" }, via: { attempts: [saved.attempt(O.save)] } },  // [W24]
  ])
})
```

Added: three constructors, the reads on a checkpoint. Dropped: `.expect`, `Story.attempt`, `Story.make`. The "Saving…" moment now has a name, because something real keeps the save going: the `hold`.

##### 2.10.18.2 Checkout with 3-D Secure (common; 2.7.3–2.7.4, the operations record's 5.1)

**Source.** `fetch` to the payment API with `Idempotency-Key: attempt.id`, wrapped by the app's `StripeApi` service;
the commit classifies `429` as `Busy`, `402` as `CardDeclined`, `5xx` and `NoResponse` as unknown, and retries one
`NoResponse` inside the send (2.7.3). The fake is 2.10.4's `Stripe` server with its `StripeFake` client half.
3-D Secure's challenge is a control (`Stripe.requireAction()`, user-defined) whose `requires_action` answer the
commit classifies; its Story has the shape of `busyThenPaid`.

```ts
// checkout.story.ts
import { Fake, Story } from "flow-state/testing"
import { CheckoutMachine } from "./checkout.machine"
import { E } from "./checkout.definition"
import { Stripe, StripeFake } from "./stripe.fake"                                 // user-defined (2.10.4)

const checkout = (id: string) => Story.machine(CheckoutMachine, { id, input: { intentId: "pi_1" }, fixtures: [StripeFake] })
export const pay = E.Pay({ paymentMethodId: "pm_card" })

export const paidFirstTime = checkout("checkout/paid")
  .send(pay)                                                                        // settles: committed, invoked, answered, Intent, DONE
  .checkpoint("paid")

export const pressedTwice = checkout("checkout/paying")
  .world(Stripe.confirm.hold())                                                     // the request waits in transit
  .send(pay, pay)                                                                   // a second press while paying: two steps, two cuts (rule 64)
  .checkpoint("paying")                                                             // names the second step's cut
  .world(Stripe.confirm.release())
  .checkpoint("paid")

export const busyThenPaid = checkout("checkout/busy-then-paid")
  .world(Stripe.busy({ times: 1 }))                                                 // user-defined control: the next confirm answers 429
  .send(pay)
  .checkpoint("waiting")
  .advance("2 seconds")                                                             // a new Attempt is sent
  .checkpoint("paid")

export const droppedThenResent = checkout("checkout/dropped-then-resent")
  .world(Stripe.confirm.drop({ at: "response", times: 2 }))                         // charged, both answers lost (the in-send retry included)
  .send(pay)
  .checkpoint("unsure")
  .advance({ next: { schedule: "checkTick" } })                                     // UNSURE's timer (user-defined name): retry, the same Attempt
  .checkpoint("paid")
```

```ts
// checkout.test.ts
import { expect, test } from "vitest"                                               // any runner [SC3]
import { O, S } from "./checkout.definition"
import { Stripe } from "./stripe.fake"
// and the Stories above, from ./checkout.story

test("paid first time", async () => {
  const { paid } = (await paidFirstTime.run()).checkpoints
  expect(paid.state).toBe(S.DONE)
  expect(paid.lane(O.pay)).toBeUndefined()                                          // or: operations.pay is { pending: false, uncertain: false }
  expect(paid.read(Stripe)).toMatchObject({ charges: [{ intentId: "pi_1", key: paid.attempt(O.pay) }] })   // the wire key is the Attempt's id
})

test("a second press while paying", async () => {
  const { paying, paid } = (await pressedTwice.run()).checkpoints
  expect(paying.state).toBe(S.PAYING)
  expect(paying.lane(O.pay)).toMatchObject({ pending: true })                       // check() disables Pay here; the frame renders it so
  expect(paying.records("verdict")).toMatchObject([{ result: { _tag: "Allowed" } }, { result: { _tag: "Unhandled" } }])
  expect(paid.state).toBe(S.DONE)
})

test("busy then paid", async () => {
  const { waiting, paid } = (await busyThenPaid.run()).checkpoints
  expect(waiting.state).toBe(S.WAITING)
  expect(waiting.memory).toMatchObject({ busyTries: 1, retryInMs: 2000 })
  expect(paid.state).toBe(S.DONE)
  expect(paid.records("ending", { operation: O.pay })).toMatchObject([
    { channel: "failure", reason: { _tag: "Busy" }, attempt: paid.attempt(O.pay, { n: 0 }) },   // a 503 here would read unknown, and fail (STF4)
    { channel: "success", attempt: paid.attempt(O.pay, { n: 1 }) },
  ])
})

test("dropped then resent: three requests, one Attempt, one charge (STF3)", async () => {
  const { unsure, paid } = (await droppedThenResent.run()).checkpoints
  expect(unsure.state).toBe(S.UNSURE)
  expect(unsure.lane(O.pay)).toMatchObject({ uncertain: true })
  expect(paid.state).toBe(S.DONE)
  const id = paid.attempt(O.pay)
  expect(paid.read(Stripe.confirm)).toMatchObject([
    { phase: "dropped", via: { attempts: [id] } },
    { phase: "dropped", via: { attempts: [id] } },
    { phase: "answered", via: { attempts: [id] } },
  ])
  expect(paid.read(Stripe)).toMatchObject({ charges: [{ key: id }] })
})
```

The two walks that need a persisted identity are app Stories (`ShopSetup` persists `CheckoutRef`). An app Story reads through the ref:

```ts
const shop = (id: string) => Story.app(ShopSetup, { id, fixtures: [StripeFake] })  // [W1]
  .ensure(Checkout1, { input: { intentId: "pi_1" } })                               // a reopened tab repeats it

export const cancelledInAckWindow = shop("checkout/cancel-before-send")
  .world(Fake.storage.write.hold({ match: { purpose: "acknowledge" } }))            // bootstrap restore is unaffected
  .send(Checkout1, pay)
  .advance({ next: { schedule: "tookTooLong" } })                                   // PAYING's timer: cancel; never sent
  .checkpoint("cancelled")

export const reloadMidCharge = shop("checkout/reload-mid-charge")
  .world(Stripe.confirm.hold())                                                     // acknowledged, sent, in transit
  .send(Checkout1, pay)
  .closeTab("main")                                                                 // abrupt; the request still travels
  .world(Stripe.confirm.release())                                                  // the server charges; the answer goes nowhere
  .openTab("main", { from: "main" })                                                // re-ensures Checkout1; restore: unknown { Restored } → UNSURE
  .checkpoint("reopened")
  .advance({ next: { schedule: "checkTick" } })                                     // retry the same id; the server's dedupe answers
  .checkpoint("settled")

export const reloadAfterPaid = shop("checkout/reload-after-paid")                  // nothing held: the charge settles before the reload
  .send(Checkout1, pay)
  .reload("main")                                                                   // close, reopen, re-ensure [W26]
  .checkpoint("reloaded")

test("cancelled before it was sent", async () => {
  const { cancelled } = (await cancelledInAckWindow.run()).checkpoints
  expect(cancelled.records("ending", { operation: O.pay })).toMatchObject([{ channel: "failure", reason: { _tag: "NotSent", why: "Cancelled" } }])
  expect(cancelled.read(Stripe.confirm)).toEqual([])                                // the server never heard of it
})

test("charged once across a reload (STF12)", async () => {
  const { reopened, settled } = (await reloadMidCharge.run()).checkpoints
  expect(reopened.read(Checkout1)?.state).toBe(S.UNSURE)
  expect(settled.read(Checkout1)?.state).toBe(S.DONE)
  expect(settled.read(Stripe)).toMatchObject({ charges: [{ key: settled.attempt(O.pay, { actor: Checkout1 }) }] })
  expect(settled.read(Stripe.confirm)).toMatchObject([
    { phase: "orphan", via: { tab: { name: "main", open: 1 } } },
    { phase: "answered", via: { tab: { name: "main", open: 2 } } },
  ])
})

test("nothing was in flight: the restored actor is paid", async () => {
  const { reloaded } = (await reloadAfterPaid.run()).checkpoints
  expect(reloaded.read(Checkout1)?.state).toBe(S.DONE)
})
```

**Walk.** `fetch` → `StripeApi` (fake client half) → the wire → `Stripe.confirm`'s handler → `StripeResponse` → the
commit's `if (res.status === 429)` → `Busy` → `E.Busy` → WAITING. The Pay button reads `s.operations.pay.pending`;
the `paying` frame holds that row, so playback renders it disabled. Playback shows `paying` as a scene; the next step
(`world`) plays as "the server answers".

##### 2.10.18.3 Autosave (common; 2.9.6's `Autosave` under `.each`)

**Source.** `fetch("PUT /docs/:id", { headers: { "If-Match", "Idempotency-Key" }, signal })` behind `DocsApi.put`.

```ts
// docs.fake.ts
const Doc = Schema.Struct({ body: Schema.String, etag: Schema.String })
type Truth = { readonly docs: Readonly<Record<string, typeof Doc.Type>>; readonly applied: ReadonlyArray<string> }   // user-defined
export const Docs = Fake.server("Docs", {                                          // user-defined: Docs
  truth: { docs: Schema.Record({ key: Schema.String, value: Doc }), applied: Schema.Array(Schema.String) },   // applied: idempotency keys
  initial: { docs: { d1: { body: "Hello", etag: "e1" } }, applied: [] },
  endpoints: {
    put: Fake.call({
      request: { docId: Schema.String, body: Schema.String, ifMatch: Schema.String, key: Schema.String },
      handle: (t: Truth, r) => {
        const doc = t.docs[r.docId]
        if (t.applied.includes(r.key)) return { response: { status: 200, etag: doc.etag } }   // a re-send of an applied write
        if (doc.etag !== r.ifMatch) return { response: { status: 412, etag: doc.etag } }
        const etag = bump(doc.etag)                                                          // user-defined: e1 → e2
        return {
          truth: { docs: { ...t.docs, [r.docId]: { body: r.body, etag } }, applied: [...t.applied, r.key] },
          response: { status: 200, etag },
        }
      },
    }),
  },
  controls: {
    editElsewhere: Fake.control({ docId: Schema.String, body: Schema.String }, (t: Truth, e) => ({
      truth: { ...t, docs: { ...t.docs, [e.docId]: { body: e.body, etag: bump(t.docs[e.docId].etag) } } },
    })),
  },
})
export const DocsFake = Layer.effect(DocsApi, Effect.map(Docs, (docs) => DocsApi.of({
  put: (d, { idempotencyKey }) => docs.put({ ...d, key: idempotencyKey }).pipe(Effect.catchTag("FakeLost", () => new NoResponse())),
})))
```

```ts
// workspace.story.ts
const ws = (id: string) => Story.machine(WorkspaceMachine, { id, fixtures: [DocsFake] })
  .send(E.Open({ docId: "d1", title: "Notes", body: "Hello", etag: "e1" }))
const edit = (body: string) => E.docs.key("d1").Edited({ body })

export const debounced = ws("autosave/debounce")
  .send(edit("Hello w"))
  .advance("500 millis")
  .send(edit("Hello world"))
  .advance("800 millis")                                                            // one pause after the last edit: one save
  .checkpoint("clean")

export const editDuringSave = ws("autosave/edit-during-save")
  .world(Docs.put.hold())
  .send(edit("Hello world"))
  .advance("800 millis")                                                            // the save is in transit
  .send(edit("Hello world!"), E.Close({ docId: "d1" }))                             // the newer edit waits; Close is refused
  .checkpoint("closeRefused")
  .world(Docs.put.release())                                                        // Saved → the newer body goes next with the new etag
  .checkpoint("bothSaved")

export const conflictKeepMine = ws("autosave/412-keep-mine")
  .world(Docs.editElsewhere({ docId: "d1", body: "Theirs" }))                       // the server's etag moves to e2
  .send(edit("Mine"))
  .advance("800 millis")                                                            // 412 → Conflict, the user's text kept
  .checkpoint("conflict")
  .send(E.KeepMine({ docId: "d1" }))
  .advance("800 millis")                                                            // Overwrite → dirty → saved over e2
  .checkpoint("overwritten")

export const offline = ws("autosave/offline")
  .world(Docs.drop({ times: "always" }))                                            // on the server handle: every endpoint, until release
  .send(edit("Hello world"))
  .advance("800 millis")                                                            // NoResponse → SaveUnsure; resend every 2 s
  .advance("6 seconds")                                                             // three re-sends of the same Attempt, then released
  .checkpoint("stalled")

export const reopenedKeepsText = ws("autosave/unmounted-mid-save")
  .world(Docs.put.hold())
  .send(edit("Mine"))
  .advance("800 millis")
  .dispose()                                                                        // the workspace unmounts; the Runtime keeps the lane
  .ensure()                                                                         // a new incarnation of the same (input-free) identity adopts it
  .world(Docs.editElsewhere({ docId: "d1", body: "Theirs" }), Docs.put.release())   // 412 with no copy d1: parked for ["d1"] (rule 53)
  .checkpoint("parked")
  .send(E.Open({ docId: "d1", title: "Notes", body: "Theirs", etag: "e2" }))        // the copy returns and adopts the Conflict
  .checkpoint("reopened")
```

```ts
// workspace.test.ts
test("debounced: one save", async () => {
  const { clean } = (await debounced.run()).checkpoints
  expect(clean.read(Docs.put)).toMatchObject([{ input: { body: "Hello world", ifMatch: "e1" } }])
  expect(clean.memory).toMatchObject({ docs: [{ key: "d1", status: "clean" }] })
})

test("an edit during a save goes next", async () => {
  const { closeRefused, bothSaved } = (await editDuringSave.run()).checkpoints
  expect(closeRefused.records("verdict", { event: E.Close })).toMatchObject([{ result: { _tag: "Denied" } }])   // Autosave.O.save.idle and the dirty check
  expect(bothSaved.read(Docs.put)).toMatchObject([
    { input: { body: "Hello world", ifMatch: "e1" } },
    { input: { body: "Hello world!", ifMatch: "e2" } },
  ])
})

test("412, keep mine", async () => {
  const { conflict, overwritten } = (await conflictKeepMine.run()).checkpoints
  expect(conflict.memory).toMatchObject({ docs: [{ key: "d1", status: "conflict", body: "Mine", serverEtag: "e2" }] })
  expect(overwritten.read(Docs)).toMatchObject({ docs: { d1: { body: "Mine" } } })
})

test("offline: the same Attempt, four times, never applied", async () => {
  const { stalled } = (await offline.run()).checkpoints
  expect(stalled.memory).toMatchObject({ docs: [{ key: "d1", status: "stalled" }] })
  const id = stalled.attempt(Autosave.O.save)
  expect(stalled.read(Docs.put)).toMatchObject(Array.from({ length: 4 }, () => ({ phase: "lost", via: { attempts: [id] } })))
  expect(stalled.read(Docs)).toMatchObject({ docs: { d1: { body: "Hello" } } })    // the server never got it
})

test("reopened keeps the user's text", async () => {
  const { parked, reopened } = (await reopenedKeepsText.run()).checkpoints
  expect(parked.inspection).toMatchObject({ lanes: [{ subject: ["d1"], binding: "unplaced", parked: [{ reason: { _tag: "Conflict" } }] }] })
  expect(reopened.memory).toMatchObject({ docs: [{ key: "d1", status: "conflict", body: "Mine" }] })   // from the event (FP RV1 M9)
})
```

**Walk.** `Edited` arms `settle`; `advance` fires it at 800 ms and the commit's `fetch` stand-in reaches `Docs.put`.
The operations record's 8.2 `CloseAnyway` then unmount, and a reload, are `reopenedKeepsText`'s shape in an app Story with `closeTab`.

##### 2.10.18.4 Kanban board with likes (uncommon; 2.9.6's `Board` and `LikeButton`, 2.8.2's `Issues`)

**Source.** `fetch` behind `IssuesApi` (`PUT /issues/:id/like` with the Attempt's key, `GET` the project's list).
`Issues` is a fake server whose truth is `{ issues: Record<id, Row>, applied }`, with endpoints `list`, `setLike` and
`get`, and controls `add` and `move` (written as 2.10.18.3's `Docs`).

```ts
const c7 = Issues.add({ id: "c7", projectId: "p1", likes: 3 })                     // user-defined control
const desk = (id: string) => Story.app(IssuesSetup, { id, fixtures: [IssuesFake], world: [c7] })   // the server holds c7 before bootstrap
  .ensure(BoardP1, { input: { projectId: "p1" } })
const toggle = (liked: boolean) => Board.E.likes.key("c7").Toggle({ liked })

export const unknownLikeKept = desk("board/unknown-like-kept")
  .world(Issues.setLike.drop({ at: "response" }))                                    // applied on the server; the answer lost → LikeUnsure
  .send(BoardP1, toggle(true))
  .checkpoint("unsure")
  .world(Issues.move({ id: "c7", to: "p2" }))                                        // the card leaves the column on the server
  .advance("3 seconds")                                                              // reconcile: the same Attempt; deduped; the repair read moves c7 out
  .checkpoint("reconciled")

export const queueAcrossActors = desk("board/queue-across-actors")
  .ensure(IssuePageC7, { input: { issueId: "c7" } })
  .world(Issues.setLike.hold())
  .send(BoardP1, toggle(true))                                                       // heads c7's record queue, in transit
  .send(IssuePageC7, IssuePage.E.like.Toggle({ liked: false }))                      // joins behind it: predicted, not sent
  .checkpoint("queued")
  .world(Issues.setLike.release())
  .checkpoint("drained")

const pages = Array.from({ length: 64 }, (_, i) => issuePageRef(`c7-${i}`))          // user-defined: 64 actors on one issue
export const overloaded = pages
  .reduce((s, page) => s.ensure(page, { input: { issueId: "c7" } }).send(page, IssuePage.E.like.Toggle({ liked: false })),
    desk("board/65th-write").world(Issues.setLike.hold()).send(BoardP1, toggle(true)))   // 1 held head + 63 queued; the 65th is refused
  .checkpoint("refused")

export const twoTabs = desk("board/two-tabs")
  .send(BoardP1, toggle(true))
  .openTab("b", { from: "main" })                                                    // ensures BoardP1 in b too: the same server, b's own store
  .checkpoint("bOpen")

test("an unknown like is kept, then reconciled", async () => {
  const { unsure, reconciled } = (await unknownLikeKept.run()).checkpoints
  expect(unsure.entity(Issue, { id: "c7" })).toMatchObject({ data: { liked: true, likes: 4 }, predicted: true, uncertain: true })   // after an unknown (STF50)
  expect(unsure.inspection).toMatchObject({ lanes: [{ key: { id: "c7" }, subject: ["c7"], state: "Held", binding: "bound" }] })
  expect(reconciled.entity(Issue, { id: "c7" })).toMatchObject({ data: { projectId: "p2" }, predicted: false, uncertain: false })
  expect(reconciled.read(Issues)).toMatchObject({ issues: { c7: { likes: 4 } } })   // liked once
})

test("FIFO across actors", async () => {
  const { queued, drained } = (await queueAcrossActors.run()).checkpoints
  expect(queued.read(Issues.setLike)).toMatchObject([{ input: { liked: true }, phase: "held" }])
  expect(drained.read(Issues.setLike)).toMatchObject([{ input: { liked: true }, phase: "answered" }, { input: { liked: false }, phase: "answered" }])
})

test("the 65th write is refused, with no partial join", async () => {
  const { refused } = (await overloaded.run()).checkpoints
  expect(refused.records("ending", { channel: "failure" })).toMatchObject([{ reason: { _tag: "NotSent", why: "Overloaded" }, instance: ["like"] }])
  expect(refused.inspection).toMatchObject({ domains: { issues: { queues: [{ key: { id: "c7" }, length: 64 }] } } })
})

test("a second tab reads the same server, without persistence", async () => {
  const { bOpen } = (await twoTabs.run()).checkpoints
  expect(bOpen.entity(Issue, { id: "c7" }, { tab: "b" })).toMatchObject({ data: { liked: true, likes: 4 }, predicted: false })
  expect(bOpen.tabs.b?.inspection).toMatchObject({ persistence: { status: "SecondTabNoPersistence" } })  // [P, SA H5]
})
```

"Never shown twice" (rule 33) is a loop over every frame of the list Stories (2.8.2's `List`, which creates). The check is a plain function
the same test file can also hand to `propertyTest` (W25):

```ts
export const created = Story.app(IssuesSetup, { id: "list/created", fixtures: [IssuesFake] })
  .ensure(ListP1, { input: { projectId: "p1" } })
  .send(ListP1, List.E.Create({ draftId: "dr1", title: "New" }))

const shownTwice = (frame: Story.Frame<typeof IssuesSetup>) => {                     // user-defined; Story.Frame, by subject [P, SA RV1 M7]
  const s = frame.read(ListP1)
  if (s === undefined) return []
  const rows = Issues.list.get(s, { projectId: "p1" })?.rows ?? []
  return s.memory.creating.filter((d) => !d.discarded && d.status !== "created" && rows.some((r) => r.id === d.id))
}

test("a created issue is never shown as a draft too", async () => {
  const run = await created.run()
  for (const frame of run.frames) expect(shownTwice(frame)).toEqual([])              // the iterator throws FramesTruncated if any were dropped [P, SA RV1 M14]
})
```

**Walk.** "A like that ends unknown on a card removed and re-added" is 2.9.6's `IssueRow` walk: the same steps over
a host without the keep-busy line, where the list's next answer removes copy c7 (its unknown is parked for `["c7"]`,
read in `inspection`) and `Issues.move` back re-adds it, whose new life adopts and reconciles.

##### 2.10.18.5 Onboarding wizard (uncommon; 3.2's `Confirm`, the operations record's 9.6)

**Source.** `fetch` behind `AccountsApi`: a profile save keyed by draft (`saveProfile`) and the final `submit`.

```ts
export const confirmYes = Story.fragment(Confirm, { id: "confirm/yes" })  // a subroutine alone (rule 11)  // [W1]
  .enter()
  .send(Confirm.E.Yes())
  .checkpoint("answered")

const signup = (id: string) => Story.machine(SignupMachine, { id, fixtures: [AccountsFake] })
export const discardDeclined = signup("signup/discard-declined")
  .send(E.Next(), E.Cancel())                                                        // user-defined: Next, ProfileChanged (the operations record's 9.6 page events)
  .checkpoint("asking")
  .send(E.CANCELLING.No())
  .checkpoint("backOnPage")

export const submitWaitsForProfile = signup("signup/submit-guarded")
  .world(Accounts.saveProfile.drop({ at: "response" }))                              // the profile save ends unknown: held
  .send(E.ProfileChanged({ name: "Ada" }))
  .advance({ next: { schedule: "saveProfile" } })                                    // its debounce (user-defined name) commits the save
  .send(E.Submit())
  .checkpoint("submitDenied")
  .dispose()
  .ensure()                                                                          // an input-free local machine is one identity: it adopts the hold
  .checkpoint("adopted")

test("a subroutine's exit, alone", async () => {
  const { answered } = (await confirmYes.run()).checkpoints
  expect(answered.records("exit")).toMatchObject([{ instance: [], name: "Confirmed", payload: {} }])
})

test("declining a discard restores the page", async () => {
  const { asking, backOnPage } = (await discardDeclined.run()).checkpoints
  expect(asking.state).toBe(S.CANCELLING)
  expect(backOnPage.state).toBe(S.WIZARD.PROFILE)                                    // history restores the page, fields kept
  expect(S.WIZARD.is(backOnPage.state)).toBe(true)                                   // at or below a parent: existing token.is [P, SA H4]
  expect(backOnPage.records("exit")).toMatchObject([{ instance: ["CANCELLING"], name: "Declined" }])   // the same record shape as alone (STF60)
})

test("submit waits for an unknown profile save", async () => {
  const { submitDenied, adopted } = (await submitWaitsForProfile.run()).checkpoints
  expect(submitDenied.records("verdict", { event: E.Submit })).toMatchObject([{ result: { _tag: "Denied", reasons: [{ code: "Uncertain" }] } }])   // O.save.idle over a partial key
  expect(submitDenied.read(Accounts.submit)).toEqual([])                             // an old profile is never submitted
  expect(adopted.records("ending", { operation: O.save })).toMatchObject([{ channel: "unknown" }, { channel: "unknown", reason: { _tag: "Restored" }, route: { kind: "current" } }])
})
```

`.leave()` on `Confirm` alone abandons it: `cp.records("exit")` stays empty, `cp.read()` is `undefined`, and `cp.memory` throws `SubjectAbsent`.

##### 2.10.18.6 A fragment reused on two hosts (uncommon; 2.9.6's `LikeButton`)

```ts
export const likeAlone = Story.fragment(LikeButton, { id: "like/alone", fixtures: [IssuesFake], world: [c7] })   // R includes IssuesApi (rule 57)
  .world(Issues.setLike.drop({ at: "response" }))
  .enter({ id: "c7" })                                                               // the trait's Input record
  .send(LikeButton.E.Toggle({ liked: true }))
  .checkpoint("unsure")
  .leave()                                                                           // ends (a one-copy .each, 2.10.12); no release on leave (F6, F9): the hold stays
  .checkpoint("left")
  .enter({ id: "c7" })                                                               // a new life adopts it: unknown { Restored }
  .advance("3 seconds")                                                              // reconcile re-sends the same Attempt
  .checkpoint("reconciled")

export const bothHosts = desk("like/both-hosts")                                     // 2.10.18.4's desk: one Runtime, two hosts of one fragment
  .ensure(IssuePageC7, { input: { issueId: "c7" } })
  .world(Issues.setLike.drop({ at: "response", match: { actor: IssuePageC7 } }))     // only the page's request
  .send(BoardP1, Board.E.likes.key("c7").Toggle({ liked: true }))
  .send(IssuePageC7, IssuePage.E.like.Toggle({ liked: true }))
  .checkpoint("both")

test("a like alone", async () => {
  const { unsure, left, reconciled } = (await likeAlone.run()).checkpoints
  expect(unsure.operations).toMatchObject({ set: [{ key: { id: "c7" }, uncertain: true }] })   // its own rows (rule 59)
  expect(left.lane(LikeButton.O.set, { id: "c7" })).toMatchObject({ subject: [], binding: "unplaced", state: "Held" })   // no stand-in parts; not gone [P, SA H17]
  expect(reconciled.read(Issues)).toMatchObject({ issues: { c7: { likes: 4 } } })
})

test("records tell two hosts apart", async () => {
  const { both } = (await bothHosts.run()).checkpoints
  expect(both.records("ending", { operation: LikeButton.O.set, actor: BoardP1 })).toMatchObject([{ channel: "success", instance: ["likes"], copy: "c7", subject: ["c7"] }])
  expect(both.records("ending", { operation: LikeButton.O.set, actor: IssuePageC7 })).toMatchObject([{ channel: "unknown", instance: ["like"], subject: [] }])
  expect(both.read(Issues.setLike)).toMatchObject([
    { via: { attempts: [both.attempt(LikeButton.O.set, { actor: BoardP1 })] } },
    { via: { attempts: [both.attempt(LikeButton.O.set, { actor: IssuePageC7 })] } },
  ])
})

Story.machine(IssuePageMachine, { id: "page/no-fake", input: { issueId: "c7" }, fixtures: [] })
// type error: IssuesApi is missing (LikeButton's R, rule 57)
```

##### 2.10.18.7 A chat room over a socket (uncommon)

The subject is written out, since a definition imports its contract and this server has no history endpoint: a contract `ChatLog` with `position: "seq"`, a positive sequence number, and no `catchUp`; its one-branch adapter; a definition with no `pages`, which needs `catchUp` (2.11.6); the machine `ChatLogRoom` [P, merge]. The fake extends 2.10.4's `Chat` with `seq`, a resume position and a seed control, reached through the adapter with `Fake.webSocket`. Each frame is a value, the first registers (Streams T1), and the reconnect owes one `missed Unproven` (Streams T2 row 6). This server neither greets nor pings, so `idleTime` is `"Infinity"` (2.11.3). 2.11.13's Story is 2.11.2's `ChatRoom`, the room with history. Fixed from SA RV1 M16: the old example had no messages to deliver, and its `from` was not in `request`.

```ts
// chat-log.contracts.ts
export const Message = Schema.Struct({ seq: Schema.Number, room: Schema.String, text: Schema.String, from: Schema.String })   // user-defined: 2.10.4's Message plus seq, numbered from 1
export class ChatDropped extends Schema.TaggedError<ChatDropped>()("ChatDropped", { code: Schema.Number }) {}   // user-defined

export const ChatLog = { messages: stream({   // user-defined: ChatLog
  id: "ChatLog.messages",
  input: { roomId: Schema.String },
  output: Message,
  key: ["roomId"],
  delivers: "every",
  position: "seq",   // the NAME of a field of output. No catchUp: this server has no history
  subscribe: ({ roomId }, { from }) => Effect.map(ChatLogSocket, (chat) => chat.room(roomId, from)).pipe(Stream.unwrap),
  reconnect: { while: (e) => e._tag === "ChatDropped" },
  idleTime: "Infinity",   // no heartbeat, and the only registration is the first value
}) }

// chat-log.socket.ts, user-defined: ChatLogSocket. One branch: every frame is a Message
export class ChatLogSocket extends Context.Service<ChatLogSocket, {
  readonly room: (roomId: string, from: number | undefined) => Stream.Stream<typeof Message.Type | Feed.Signal, ChatDropped>
}>()("app/ChatLogSocket") {
  static readonly layer = Layer.effect(ChatLogSocket, Effect.gen(function* () {
    const open = yield* Socket.WebSocketConstructor   // the seam ChatFake binds
    return { room: (roomId, from) => Feed.callback<typeof Message.Type, ChatDropped>((emit) =>
      Effect.gen(function* () {
        const ws = open(`/api/rooms/${roomId}/socket?client=c1${from === undefined ? "" : `&from=${from}`}`)
        ws.addEventListener("message", (e) => { emit(Schema.decodeUnknownSync(Schema.fromJsonString(Message))((e as MessageEvent).data)) })
        ws.addEventListener("close", (e) => { emit.fail(new ChatDropped({ code: (e as CloseEvent).code })) })
        yield* Effect.addFinalizer(() => Effect.sync(() => ws.close()))
      })) }
  }))
}

// chat-log.definition.ts
export const ChatLogDefinition = definition({   // user-defined: ChatLogDefinition, LIVE, ENDED, its events
  id: "Chat/Log",
  states: ["LIVE", "ENDED"],
  memory: {
    roomId: Flow.input(Schema.String),
    messages: Flow.initial(Schema.Array(Message), []),
    notice: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  internalEvents: { Message: { message: Message }, MayHaveMissed: {}, FeedEnded: {} },
  operations: ({ E }) => ({
    messages: ChatLog.messages.outcomes({
      value: E.Message.from((message) => ({ message })),
      missed: E.MayHaveMissed,
      fills: "messages",
      failure: { ChatDropped: E.FeedEnded, Feed: E.FeedEnded },
    }),   // no pages: there is no catchUp
  }),
})

// chat-log.machine.ts
export const ChatLogRoom = machine(ChatLogDefinition, ({ S, O }) => ({   // user-defined: ChatLogRoom
  default: S.LIVE,
  states: {
    LIVE: {
      activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId }))],
      on: {
        Message: { target: "self", updateMemory: ({ memory, event }) => ({
          messages: [...memory.messages.filter((m) => m.seq !== event.message.seq), event.message],   // by seq: a replay repeats
        }) },
        MayHaveMissed: { target: "self", updateMemory: () => ({ notice: "Some messages may be missing." }) },
        FeedEnded: { target: S.ENDED },
      },
    },
    ENDED: {},
  },
}))

// chat.fake.ts
type Truth = { readonly messages: ReadonlyArray<typeof Message.Type> }   // user-defined
const socket = Fake.stream({
  request: { room: Schema.String, clientId: Schema.String, from: Schema.optional(Schema.Number) },   // user-defined: from, the resume position
  frame: Schema.fromJsonString(Message),  // [fakes-v2]
  open: (truth: Truth, req) => ({
    frames: truth.messages.filter((m) => m.room === req.room && m.seq > (req.from ?? 0)),
  }),
})
export const Chat = Fake.server("Chat", {
  truth: { messages: Schema.Array(Message) },
  initial: { messages: [] },
  endpoints: { socket },
  controls: { seed: Fake.control({ messages: Schema.Array(Message) }, (_t: Truth, a) => ({ truth: { messages: a.messages } })) },   // user-defined: seed
})
const ChatFake = Fake.webSocket(Chat, {   // user-defined: ChatFake
  "GET /api/rooms/:room/socket": {
    endpoint: "socket",
    input: ({ params, query }) => ({ room: params.room, clientId: query["client"], from: query["from"] === undefined ? undefined : Number(query["from"]) }),
  },
})

// chat-log.story.ts
const { O } = ChatLogDefinition
const threeMessages = [1, 2, 3].map((seq) => ({ seq, room: "r1", text: `m${seq}`, from: "ann" }))   // user-defined
export const replayThenDrop = Story.machine(ChatLogRoom, {
  id: "chat/replay-then-drop", input: { roomId: "r1" }, fixtures: [ChatLogSocket.layer.pipe(Layer.provide(ChatFake))],   // ChatFake binds the constructor ChatLogSocket.layer reads
  world: [Chat.seed({ messages: threeMessages }), Chat.socket.hold({ after: 2 })],  // after. Quiet after two frames
})
  .checkpoint("quiet")                                                               // a start cut (2.10.6)
  .world(Chat.socket.drop())  // a network loss; a stream control is a wire step [W37]
  .advance({ next: { operation: O.messages, timer: "backoff" } })  // [W7]
  .checkpoint("reconnected")

test("resumes from where it stopped", async () => {
  const { quiet, reconnected } = (await replayThenDrop.run()).checkpoints
  expect(quiet.records("delivery", { endpoint: "socket", phase: "delivered" })).toHaveLength(2)  // the delivery record (SA RV1 L2)
  expect(reconnected.read(Chat.socket)).toMatchObject([                               // read directly, not a `connections` field (2.10.9)
    { phase: "closed", code: 1006, by: "network" },                                   // plain phase (SA RV1 M11)
    { phase: "open", input: { from: 2 } },                                            // the resume position the server saw
  ])
})
```

### 2.11 Streams

Streams (merge 6, [merged/streams/proposal-v3.md](merged/streams/proposal-v3.md), merged 2026-11-01; decisions S1–S16 in "Decisions"; plan
[merged/streams/merge-plan.md](merged/streams/merge-plan.md)). Rules 67–72 (2.4) and the tables of 2.11.11 are normative; the rest shows them.

**Marks.** **S15** confirmed four behaviours: Flow runs connections when the contract declares `reconnect` and `idleTime` (rule 25, as amended), and never re-opens a session; the default retries while offline and ends `Flapping` after 8 registered flaps; Flow keeps the position, with `fills`; the silent-loss cases are documented limits (section 7 item 23). **S11** confirmed that a session reads `input` once, `delivers: "every" | "latest"`, and two operations on one contract and key are two sessions with a warning. **S12** kept the spellings `Feed`, `live`, `down`, `proof`, `restartAt`. **S14** delegated the other words, and **S16** the remaining questions. So **everything else in this section, tables included, is [P]**: the proposal's, approved as a whole, not read row by row. **[P, merge]** is a resolution made at this merge (the plan's 1.4).

**Evidence.** "Spike" is `tsc` against real Effect and a stand-in Flow; "model" is a small executable model of these tables, by their author ([model/v3/](merged/streams/model/v3/)). Neither ran Flow, which does not exist yet (section 7 item 23).

**Labels.** **Streams T1–T9** are 2.11.11's tables (the record's T*n*; a bare T*n* is a tooling row of section 5, and "Stories T*n*" a Stories decision). **ST Q*n*** is a question of the record's section 4, with its options and evidence. **ST RV1–ST RV3** are its review rounds ([merged/streams/reviews/](merged/streams/reviews/)), **ST AT** and **ST DT** its agent and desk trials ([agent trial](merged/streams/trials/agent-trial.md), [desk trial](merged/streams/trials/desk/RESULTS.md)), and **STC1–STC5** the second agent trial's findings ([trial 2](merged/streams/trials/agent-trial-2.md); the record's C*n*). **req X** is a row of [merged/streams/requirements-v3.md](merged/streams/requirements-v3.md). **v3 item *n*** in 2.10 is a row of the record's section 9 table of what Stories took (numbered from an earlier draft of that table; its rows are in a different order).

**Where the data comes from.** A live source is a socket, an SDK or a poll, and Flow is not a network library. The author's adapter, an ordinary service or `Feed.callback`, turns what the source says into three things: a value arrived, the server is listening, the connection dropped. Everything else here is what Flow does with those.

#### 2.11.1 Three ideas

**One: a bookmark, saved inside the memory it describes.** "This consumer was offered everything up to here." A Flow-private part of the slice's saved record: not a memory field, no patch, no guard reads it. Fresh memory is a fresh bookmark (`resetOn`, `.each` re-adds, subroutines, dispose then `ensure`). Flow moves it when a value's turn is admitted. Delivery is **at least once**.

**Two: `fills`, data.** Names the memory field this feed fills. A person writes only that. Flow tells three things apart:

| What happened to the field | Next connection |
| --- | --- |
| Never filled | Continues from the bookmark. On a first open, reads history, no notice |
| Emptied in a turn while the session stayed placed: **cleared** | Stays cleared across reconnects and reloads. **After a later message and then a wipe, a `catchUp` re-read can return it, visibly** |
| Empty because a turn that released the session, or one while not placed, emptied it: **wiped** | Reads with `catchUp`, no notice. Without `catchUp`: `missed` |

**Three: contract data.** `reconnect`, `idleTime`, `catchUp` are declared, and Flow runs one session table. A `latest` contract cannot type-check with `catchUp`, `position` or `restartAt` (req F6).

#### 2.11.2 Chat in full

**Source.** A WebSocket: a greeting `hello`, then messages, a `ping` every 20 s, close 4401 on an expired token. A history endpoint whose pages say `complete` and `truncated`, and `head`, the newest position. The machine is `ChatRoom`, as 2.11.13 reads it; 2.10.18.7's `ChatLogRoom` is a room with no history.

```ts
// chat.contracts.ts
messages: stream({
  id: "Chat.messages",
  input: { roomId: Schema.String },
  output: Message,   // user-defined: Message
  key: ["roomId"],
  delivers: "every",   // S11
  position: "cursor",   // the NAME of a field of `output`. Its Schema comes with it
  subscribe: ({ roomId }, { from }) => Effect.map(ChatSocket, (chat) => chat.room(roomId, from)).pipe(Stream.unwrap),   // user-defined: ChatSocket, a service, below. As commit calls StripeApi. E is inferred from the service
  catchUp: ({ roomId }, { from, next, signal }) =>
    fetchPage(roomId, next ?? from, signal).pipe(Effect.map((p) =>        // user-defined: fetchPage
      p.truncated ? Feed.gone({ reason: `history starts at ${show(p.oldest)}`, items: p.messages, next: p.next })
      : p.complete ? Feed.done({ items: p.messages, proof: "server: page.complete", through: p.head })   // proof is required
      : Feed.more({ items: p.messages, next: p.next, through: p.next }))),   // p.next is the page token and, on this server, also a position
  reconnect: { while: (e) => e._tag === "ChatDropped" },   // Effect.retry's while and schedule. After subscribe and catchUp, so e is typed
  idleTime: "45 seconds",   // like staleTime, gcTime. This server pings every 20 s. No ping from your server: "Infinity"
}),
// chat.definition.ts
memory: { roomId: Schema.String, messages: Schema.Array(Message), notice: Schema.optional(Schema.String) },
internalEvents: { Message: { message: Message }, Page: { messages: Schema.Array(Message) }, MayHaveMissed: {}, FeedEnded: {}, SignedOut: {}, Retry: {} },   // user-defined
operations: ({ E }) => ({
  messages: Chat.messages.outcomes({
    value: E.Message.from((message) => ({ message })),   // at least once: store by id
    pages: E.Page.from((messages) => ({ messages })),   // optional. A read's page is one turn
    missed: E.MayHaveMissed,   // type-required
    fills: "messages",   // a field of THIS memory; a wrong name does not compile here
    failure: { SignedOut: E.SignedOut, ChatDropped: E.FeedEnded, Feed: E.FeedEnded },   // exhaustive, as on a transaction. Under the default, ChatDropped never ends a session
  }),
}),
// chat.machine.ts
LIVE: {
  activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId }))],   // first load is catchUp, so there is no loading state
  on: {
    Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsert(memory.messages, event.message) }) },   // user-defined: upsert. Required: a replay repeats
    Page: { target: "self", updateMemory: ({ memory, event }) => ({ messages: upsertAll(memory.messages, event.messages) }) },  // user-defined: stores by position (2.11.5). This server's pages are oldest first
    MayHaveMissed: { target: "self", updateMemory: () => ({ notice: "Some messages may be missing." }) },
    SwitchRoom: { target: S.LIVE, updateMemory: ({ event }) => ({ roomId: event.roomId, messages: [] }) },  // releases the session: wiped. Re-read on return
    ClearChat: { target: "self", updateMemory: () => ({ messages: [] }) },   // stays placed: cleared. No flag
    Refresh: { target: "self", updateMemory: () => ({ messages: [] }),       // user-defined
      actions: [O.messages.refetch(({ memory }) => ({ roomId: memory.roomId }))] },   // refetch(k?), as O.issues.refetch. On a stream: forget the bookmark and read now
    FeedEnded: { target: S.ENDED },                                          // user-defined. Only a flapping server or a defect gets here
    SignedOut: { target: S.SIGNED_OUT },
  },
},
ENDED: { on: { Retry: S.LIVE } },                                            // a bad deploy can reach it in every open tab: show a Retry
// view
const row = useView(chat, (s) => s.operations.messages)
row?.connection === "Live"
row?.catchingUp   // listening, older items still arriving (req G8)
```

The socket is a service, as `commit` calls `StripeApi`. **User-defined, shown once; the other recipes in this section name theirs and show the contract.**

```ts
// chat.socket.ts, user-defined
export class ChatSocket extends Context.Service<ChatSocket, {
  readonly room: (roomId: string, from: Cursor | undefined) => Stream.Stream<Message | Feed.Signal, ChatDropped | SignedOut>
}>()("app/ChatSocket") {
  static readonly layer = Layer.effect(ChatSocket, Effect.gen(function* () {
    const open = yield* Socket.WebSocketConstructor   // the seam Stories replace. `new WebSocket` reaches no fake
    return { room: (roomId, from) => Feed.callback<Message, ChatDropped | SignedOut>((emit) =>   // Stream.callback's shape, with a bound that fails
      Effect.gen(function* () {
        const ws = open(roomUrl(roomId, from))                            // user-defined: roomUrl
        ws.addEventListener("message", (e) => {
          const f = frameOf(e)                                            // user-defined: decodes WebSocketEvent
          if (f.t === "hello") emit(f.replayedFrom && sameCursor(f.replayedFrom, from)   // user-defined: sameCursor
            ? Feed.live({ proof: `server replayed from ${show(from)}` })   // only on the server's echo of this from
            : Feed.live({ head: f.head }))   // the server's newest position now
          else if (f.t === "reset") emit(Feed.live({ restartAt: f.start }))
          else if (f.t === "ping") emit(Feed.ping)   // a sign of life, no value
          else emit(f.message)
        })
        ws.addEventListener("close", (e) => {                             // user-defined classification (req C5)
          const code = closeCode(e)                                       // user-defined: reads WebSocketEvent
          emit.fail(code === 4401 ? new SignedOut() : new ChatDropped({ code }))
        })
        yield* Effect.addFinalizer(() => Effect.sync(() => ws.close()))
      })) }
  }))
}
```

#### 2.11.3 The contract

```ts
stream({
  id, input, output, key,
  delivers: "every" | "latest",   // S11
  subscribe: (input, { from, signal }) => Stream<A | Signal, E, R>,   // from: when position is set
  // every only (type error on latest):
  position?: keyof A,                               // the NAME of a field of output, as key names input's
  catchUp?: (input, { from, next, signal }) => Effect<Feed.more | Feed.done | Feed.gone, E, R>,   // requires position
  // written last, so `e` is typed:
  reconnect?: { while?: (e: E) => boolean, schedule?: Schedule },   // Effect.retry's two options. With:
  idleTime?: Duration.Input,                        // required exactly when reconnect is present. "Infinity": no deadline
})
```

**Field rules, in plain words.**

| Word | Rule |
| --- | --- |
| `position` | A field name of `output`. `position: "cursor"` means "each message's `cursor` says where it is" |
| `from` | Where to continue: the bookmark. In `subscribe` and `catchUp` |
| `E` | Inferred from `subscribe` and `catchUp`, as on `commit` and `lookup`. Where a closure hides it, `Feed.callback<A, E, R>` names it, as `Stream.callback` does |
| `reconnect` | **Your connection ends on failure (`emit.fail`, or a stream that fails): declare it. An SDK that re-opens by itself and you report `Feed.down`: omit it.** Omitted: one failure, including `Overflow`, is terminal, and the machine must re-open. So EventSource and Supabase's per-channel error declare it, because the adapter closes on error. Socket.IO, Ably, Phoenix omit it |
| `idleTime` | **Your server must send something within this window: a value, or a heartbeat you pass as `Feed.ping`. No heartbeat: write `"Infinity"`, and a half-open connection is not detected.** `idle` runs from connect, and is re-armed by a registration, a value or a ping. **Until a connection registers, a ping does not extend it**, so a server that pings and never greets ends `Silent` and retries. A source whose only registration is its first value has no time to give: `"Infinity"`, or a server first event |

**Three typing rules.** Write `subscribe`, then `catchUp`, then `reconnect`: earlier, `e` is `unknown` or misses `catchUp`'s errors, a compile error (spike). `Feed.callback` names `<A, E, R>`, as `Stream.callback`, since no closure can infer them. `next` defaults to the position type; a richer token annotates `catchUp`'s second parameter.

**Honest typing costs** (ST DT):
- A helper returning a mixed array of values and signals needs an annotation naming `Feed.Signal<P>`; `Stream.map` inline does not. A feed with no position has `P = never`, so it cannot share a helper that emits `restartAt` with a positioned one.
- A mapper hoisted out of `outcomes` annotates its parameter. Inline infers.

#### 2.11.4 Signals

| Signal | Means |
| --- | --- |
| `Feed.live()` | Registered: anything said from now reaches me. Nothing proven |
| `Feed.live({ proof })` | Registered, and nothing was missed. A required string. **On `every`:** at a connection's first registration, the server replays everything after `from`; later, nothing was missed since the last value delivered. **On `latest`:** the value this session confirmed is still current |
| `Feed.live({ head })` | Registered, and the server's newest position is `head`. Used only when there is no position yet, so a quiet feed still has a place. Every only |
| `Feed.live({ restartAt })` | The server's log restarted; continue here. One `missed`. Every only |
| `Feed.down(reason)` | An SDK lost its connection and is healing itself |
| `Feed.ping` | A sign of life, no value |

Each `head`, `through`, `restartAt`, `at` is typed `P` and **decoded against the position's Schema at intake; a failure is `Defect`**, so one bad frame cannot stop saving (Persistence O5, O2). Undefined means no change.

**`Feed.callback<A, E, R>(register)`:** shaped as `Stream.callback`, returns a Stream. `register(emit)` is a scoped Effect. `emit(x)` offers a value or a signal; `emit.fail(e)` and `emit.end()` match `Queue.fail` and `Queue.end`. Bounded at 1,024; `emit` resolves when there is room (S7 Q20). It reads the session's kind from a `Context.Reference`, so no argument is needed: outside a session it behaves as `every`, which fails rather than drops. A signal offered through it is not checked against the position type at compile time, only at intake. ST Q10 says why it is not `Stream.callback`.

#### 2.11.5 A read's answer

| Answer | Means |
| --- | --- |
| `Feed.more({ items, next, through? })` | More to read. `through`: oldest first, nothing before it unread. It moves the bookmark, so a long repair keeps its progress |
| `Feed.done({ items, proof, through? })` | **The server said this read reached `from`.** A required string, like `Feed.live`'s, greppable and shown by Inspection. `through`: where the read ends, even in an empty room. Newest first: the walk's first head |
| `Feed.gone({ reason, items?, next?, through? })` | The history does not reach `from`: one `missed`, then what is kept. No budget spent |

**Page order (STC1, trial 2).** A read's pages reach the machine in the order the server gives them, newest first or oldest first. **A handler must store by position and trim only after sorting.** `upsertAll(...).slice(-100)` after a newest-first walk keeps the oldest of the walk, and `done` then moves the bookmark to the head: silent. The Ably recipe below inserts by position.

**A limit-style or snapshot endpoint must not answer `Feed.done` with `from` set** unless it can prove overlap. This is the most natural silent mistake (ST AT). The recipe:

```ts
// GET /messages?limit=50: the newest 50, no cursor parameter
catchUp: ({ roomId }, { from, signal }) => latest50(roomId, signal).pipe(Effect.map((p) =>   // user-defined
  from === undefined ? Feed.done({ items: p.messages, proof: "first load: newest 50", through: p.head })
  : p.messages.some((m) => sameCursor(m.cursor, from)) ? Feed.done({ items: p.messages, proof: "page overlaps the bookmark", through: p.head })
  : Feed.gone({ reason: "more than 50 since the bookmark", items: p.messages, through: p.head }))),   // a notice, never a silent gap
```

**A short page or an empty page is not a proof.** A feed that wants nothing from before now: `from === undefined ? Effect.succeed(Feed.done({ items: [], proof: "nothing before now" }))`, with the greeting's `Feed.live({ head })`.

**Preconditions, unsafe if broken, unchecked.** With `from` defined, the read is a change log, including deletes (req R20). A read sees the log up to registration (no lagging replica). A read with `from` undefined reaches back to registration. A `catchUp` given a position from another log answers `gone`.

#### 2.11.6 Outcomes

| Kind | `value` | `pages` | `missed` | `fills` | `failure` |
| --- | --- | --- | --- | --- | --- |
| `every`, machine | required | optional, needs `catchUp` | required | required: a field or `false` | required |
| `latest` | optional | — | type error | — | required when anything is mapped |
| `listen` | the domain's | — | the domain's | — | required |

**Delivery is at least once.** A replay, a reload or a repair repeats items. A handler stores by id (`upsert`). **A counter keys by id, with a seen set, or accepts drift:** `unread + 1` over-counts. Do not give a counter `catchUp`: a wipe would re-read and re-count.

**`failure`:** exhaustive over `E`, as on a transaction. `Feed` covers Flow's reasons `Closed`, `Overflow`, `Silent`, `Flapping`, `Defect`, `Interrupted`. `Interrupted` comes only from `stream fails e` with an interrupted Stream outside release (Streams T1); a release discards. A reason may be named, and it beats `Feed`. `Feed.Reason` is tagged. Under the default schedule a tag `while` accepts cannot end a session, so its entry is unreached until you write a `schedule`: a known cost (ST Q9).

**`missed`:** an event, or `.from((m) => ({ why: m.why }))` for `Unproven`, `Lost`, `Reset`. A consumer that does not care writes one handler (req V9: 2 lines). Exactly one notice per interruption.

#### 2.11.7 `fills`

**`fills` names a field of the operation's own memory: an array, a `Record` or a number (0 is empty).** A required field: a string, boolean, closed struct, `Schema.optional` or `NullOr` is not offered, so `fills: "roomId"` does not compile. Checked in the definition, where memory's Schema is known: a misspelling or wrong kind **does not compile**. A wrong field of the right kind still compiles; Inspection's `FillsUntouched` reports a value handled whose turn left the field unchanged.

| Consumer | Line | Note |
| --- | --- | --- |
| A list | `fills: "messages"` | The field holds only this feed's items. **Banners and drafts go in another field** |
| A count | `fills: "unread"` | 0 means empty |
| Per-key list under `subscribe.each` | `fills: "byRoom"` | A `Record`, indexed by a single-field key. Otherwise `FillsNotPerKey` |
| Stores nothing, or a short-lived list such as toasts | `fills: false` | Never wiped. Continues from the bookmark |
| **The list lives in a parent, or a fragment wants a parent's field** | **Not nameable: a compile error.** | **One answer: place the operation in the machine that owns the list, or keep the list in the fragment and expose it.** `fills: false` compiles and is the stated silent limit |
| Nested in a struct | Lift the list to a top-level field | |

**When is memory saved?** Only for a persisted actor. Not persisted: a reload is a new slice, and the feed starts fresh.

#### 2.11.8 Clear, wipe, refresh

| You write | Flow reads | Result |
| --- | --- | --- |
| `messages: []`, session stays placed | **Cleared** | Stays cleared across reconnects and reloads, until a later message and a wipe (below) |
| `messages: []` with a target that re-enters, or a switch | **Wiped** | Re-reads, no notice. Without `catchUp`, one `missed`. A drop before that read lands: one notice, then the read |
| Sign-out clears in another state; back later | Wiped | As above |
| `messages: []` on a root or parent handler, wanting a reload | Cleared | Stays empty. **The one recipe for reload:** `O.messages.refetch(({ memory }) => ({ roomId: memory.roomId }))` |

**Exactly when cleared items return. Each is visible; nothing is lost.**
1. **A clear, a later message, then a wipe (a room switch).** The message (**the user's own sends count**: a sent message that lands in the field is a later message) makes the field filled again, so the wipe reads as a wipe and `catchUp` re-reads from the start. **Limit, stated.** If it matters, one line in the app, which knows its own order: `messages: upsert(memory.messages, event.message).filter(after(memory.clearedBefore))` in `Message`, and the same `.filter(after(memory.clearedBefore))` in `Page`, since a re-read arrives as pages; `clearedBefore` is a memory field the clear sets.
2. Clear and leave in **one** turn (`ClearAndClose`): read as a wipe. **Recipe for "stays cleared": clear in one turn, leave in the next:** `send(E.Clear); send(E.Close)`. Modelled. (`O.x.refetch` in that turn also works.)
3. Clear during the wait for a releasing predecessor.
4. Clear before any position is known (no `head`, no item yet).
5. A read in progress: its items, landed or not, may return after a drop or wipe.
6. A stale duplicate moved the bookmark back just before the clear: one item (model confirms).
7. After `O.x.refetch`, on purpose.

**An accidental `[]` is permanent, and silent.** Flow cannot tell a bug from Clear. An `onError: messages: []` is the worst form. With a cursor in memory (the record's v2) the cursor stays too: the same result.

**`O.x.refetch(k?)`**, existing (`O.issues.refetch`; 2.7.3), `k` a selector returning the key fields, as on `retry` and `cancel`; under `subscribe.each`, one key's session. On a stream: forget the bookmark and read now. **On a feed with no `catchUp`, it empties the bookmark and re-reads nothing, with one `missed Unproven` notice.** **`O.x.bookmark(select)`** remains only for stating a position (a read outside `catchUp`), always a selector returning the key fields and `at`.

#### 2.11.9 The row

`latest`: `key`, `connection`, `drop`, `failure`, `value`, `last { value, at }`. `value` is empty unless current; to show stale data you write `last`. `every`: `key`, `connection`, `drop`, `failure`, `catchingUp`. `connection` exists on every phase. A fact row has no `value` and no `last`. The bookmark is in `session` records and Inspection, not on the row.

#### 2.11.10 First registration, repair, reconnect

The parts of the record's section 4 that state behaviour. Its options and evidence stay in the record (ST Q1–ST Q10).

**First registration (ST Q2).** One record. With no record and an empty field: first open, no notice (req G10, req G13, req G14). **A read that can be `catchUp` belongs there**: it starts after registration, so no race. A **non-empty read outside it** (a parent, another actor, a resource, `Flow.input`) is found: no record and a filled field owes one notice. **An empty read with no head, outside `catchUp`,** is silent for what was posted before registration.

**SSR is where it must be outside:** an `every` session never opens on a server (ST RV2 Med7). The server reads a resource; `Loaded` writes `O.messages.bookmark(({ memory, event }) => ({ roomId: memory.roomId, at: event.head }))`; the partition transfers; the client's `catchUp` reads from `head`.

**A read landing after `hello`:** Streams T1's cell. Without `catchUp`, a notice at the queue's head. With it, nothing extra: every registration already read (ST RV2 H2, ST RV3 Low2). In every state, queued values stop moving the bookmark and queued `settle`s drop (model).

**A from-now feed with a head** has it settled at `complete`, not registration (ST RV3 H1): a drop between `complete` and that `settle`'s admission, then a reconnect, loses what was posted since the first greeting. One queue turn; a 500 ms backoff outlasts it unless a turn is very slow. **With no head (the desk's `hello` today, ST DT 3.1):** `{ at: undefined }`, one notice per reconnect until the first entry, and the first window's loss. The fix is a protocol field, not Flow's.

**Repair (ST Q3).** The bookmark stays frozen until a read says; live items buffer during a read and flush after its pages; a drop discards the buffer; one page at a time; pages retry with the socket open.

**Convergence, ST RV2's stepped figures, not a table run.** Gap 20,000, 100 msg/s, 500 reads/s, oldest first with `through`: 3 connections, 50 s. 150/s: 20 connections. 90/s with budget 8: ends by budget. Newest first, frozen, default: never ended. So: **3 repairs in a row that overflow with no bookmark move give up:** the next registration is one `missed Lost`, then `Live`; live values move past what was accepted (req M8).

**Newest first (req R16).** Older pages are never lost. Limits: req V4's exception, and a windowed store (`.slice(-100)`) can evict newest entries when an older page lands: store by position, trim after sorting (2.11.5, STC1). **Reset:** with `catchUp`, after `missed Reset`, read from `restartAt`.

**A first load is not one turn per item:** `pages` maps a read's page to one event (ST RV1 Med6). A guard on its handler loses the whole page, with evidence.

**Failure maps (ST Q6).** Author tags are exhaustive, with one `Feed` key. Add `Banned` to what the adapter fails with: compile error at the map (spike, ST DT). `rest:` would hide it.

**Who runs reconnect (ST Q5).** Rule 25 as amended (S15).

**`idleTime`** is armed by Machines O5's rule, "fires once if overdue", compared on the Clock at resume, while a pull is outstanding.

**Default `schedule`.** `exponential("500 millis")`, jittered, then capped at 30 s, in that order, with `Schedule.modifyDelay`. **8 connections in a row that register and die within `healthy` (1 minute) end `Flapping`.** A connection that never registers spends and restores nothing, so offline waits forever at one try per 30 s. **A connection ended by `Silent` is not a flap:** a server with no heartbeat under a duration reconnects each `idle`, flagged `IdleWithoutPing`, and does not end (ST AT 9's trap). `pageSched` is a copy of it, so a 503 forever reads `catchingUp` forever: visible. `healthy` of exactly 1 minute sits on common proxy idle timeouts: docs.

**Escalating re-open stays a machine recipe (ST DT 3.11).** After `Ended`, re-open is states and a schedule, with its delay in memory so a reload keeps the deadline:

```ts
ENDED: {                                                                  // user-defined
  schedules: { reopen: { schedule: ({ memory }) => Duration.millis(memory.reopenInMs), send: E.Reopen } },
  on: { Reopen: S.LIVE, Retry: S.LIVE },
},
LIVE: { schedules: { healthy: { schedule: "1 minute", send: E.Healthy } },
        on: { Healthy: { target: "self", guard: [live], updateMemory: () => ({ reopenInMs: 1000 }) },   // never reset on a value (req C3)
              FeedEnded: { target: S.ENDED, updateMemory: ({ memory }) => ({ reopenInMs: Math.min(30_000, memory.reopenInMs * 2) }) } } },
```

**Words (ST Q7).** `at` meant four things (ST AT). **Now:** `head` on `Feed.live`, `through` on a read's answer, `at` only the bookmark's own place, in `O.x.bookmark` and `session` records. **`held` and `void` are internal, renamed `filled` and `wiped`, and absent from author docs**, which say cleared and wiped.

#### 2.11.11 Normative tables

`—` means it cannot occur; a model must check it. Timers on Effect's `Clock`, tagged `backoff`, `page`, `healthy`, `idle`. Flow compares no positions; only `Equal` on `next`.

**One interruption, one answer** and **freshness is a function of the present** are the principles.

##### Streams T1. The session

**Variables.** `st`; `drop`, `dropAt`; `regInConn`; `owed`; `noted`; `claim`; `wiped`; `greeted`; `n`; `flaps`; `stalls`; `liveSince`; `lastRead`. In `Repairing`: `buf`, `cursor`, `prevNext`, `emptyRun`, `pageSched`, `movedHere`.

**Procedures.**
- `connect`: clear `wiped`, `greeted`, `noted`. If `b` exists, `filled`, and the field is empty: `wiped = true`, `b = { at: undefined, filled: false }` **at once**, so leaving before registering stays owed. `claim = b.at`; `subscribe(input, { from: claim })`; `Connecting`.
- `register(a)`: `regInConn` read then set; `owed = false`; `noted = false`; `liveSince = now`; `drop = none`; re-arm the deadline; Streams T2. `latest`: Streams T5.
- `notice(why)`: if not `noted`: queue `missed why`, `noted = true`.
- `abandon`: interrupt the read, aborting `signal`; `buf = []`; `lastRead = none`.
- `lose(e)`: `abandon`; read `liveSince`, then **clear it**. If in `Repairing` with `e = Overflow` and not `movedHere`: `stalls += 1`. If `reconnect` and (`e` is Flow's, or `while(e)`, or no `while`): under the default: step `n` for the delay, which never exhausts; unless `e = Silent`, `flaps += 1` if `liveSince` was set and `healthy` had not elapsed; `flaps = 8` ends `Flapping`. A `Silent` end neither adds nor resets `flaps`: 8, none healthy in between. With a written `schedule`: step `n`, exhausted ends `e`. Otherwise `Waiting`, `drop = e`, `dropAt = now`, `regInConn = false`, discard this connection's frames. No `reconnect`, or not retried: `end(e)`.
- `end(f)`: `Ended { f }`; queue `failure f`.
- `complete(through?)`: `stalls = 0`; queue `settle(through ?? lastRead ?? greeted)`; if none, it makes `{ at: undefined }` when there is no record; queue each of `buf`; `buf = []`; `Live`.

| Input ↓ / State → | `Connecting` | `Live` | `Repairing` | `Dropped` | `Waiting` | `Ended` | `Releasing` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `live()`, `live({ head })` | `register` | `register` | `abandon`; restart from `b.at`; one budget step; `RegistrationChurn`; no second notice | `register` | — | — | discard, evidence |
| `live({ proof })` | `register` | `register` | evidence; stay | `register` | — | — | discard, evidence |
| `live({ restartAt })` | Streams T2 rows 1, 2 | Streams T2 rows 1, 2 | `abandon`; Streams T2 rows 1, 2 | Streams T2 rows 1, 2 | — | — | discard, evidence |
| `down(r)` | `Dropped`, `drop = r` | `Dropped`, `drop = r`, `dropAt = now`, `liveSince = none` | `abandon`; as `Live` | `drop = r`, `owed = false` | — | — | discard, evidence |
| `ping` | evidence, `PingsWithoutLive`. **Does not re-arm** | re-arm the deadline | re-arm | evidence | — | — | discard |
| value v | `register(live())`, then this row in the new state | re-arm; queue v, moves | re-arm; append to `buf`; at 1,024, stop pulling | no record and empty field: make `{ at: undefined }`, no notice. Else if not `owed`: `noted = false`, `notice(Unproven)`, `owed = true`. Queue v, moves. Stay | — | — | discard, evidence |
| stream fails e | `lose(e)` | `lose(e)` | `lose(e)` | `lose(e)` | — | — | discard |
| stream completes | `lose(Closed)` | `lose(Closed)` | `lose(Closed)` | `lose(Closed)` | — | — | discard |
| defect | `end(Defect)` | `end(Defect)` | `abandon`, `end(Defect)` | `end(Defect)` | `end(Defect)` | — | discard |
| a position fails to decode | `end(Defect)` | `end(Defect)` | `abandon`, `end(Defect)` | `end(Defect)` | — | — | discard |
| `idleTime` deadline | `lose(Silent)` | `lose(Silent)` | `lose(Silent)` | not armed | not armed | not armed | not armed |
| backoff elapsed | — | — | — | — | `connect` | — | — |
| `healthy` elapsed (1 minute since `liveSince`) | — | reset `n`, `flaps` | reset `n`, `flaps` | — | — | — | — |
| page: `more(items, c, { through? })` | — | — | queue items, frozen; `lastRead` = last; `through`: queue `settle(through)`, `movedHere`, `stalls = 0`; `c` same as `prevNext`, or second empty page in a row: page failure; else request `c` when no page item is queued | — | — | — | discard |
| page: `done(items, { proof, through? })` | — | — | queue items, frozen; `lastRead` = last; record `proof`; `complete(through)` | — | — | — | discard |
| page: `gone(r, { items?, next?, through? })` | — | — | `notice(Lost)`, then items, frozen; `lastRead` = last; `next`: request; else `complete(through)` | — | — | — | discard |
| page fails e, `while(e)` | — | — | step `pageSched`: delay, retry, socket open; exhausted: `lose(e)` | — | — | — | discard |
| page fails e, otherwise | — | — | `abandon`, `end(e)` | — | — | — | discard |
| `O.x.bookmark({ at })`, `at` defined | Streams T3. A later `hello` reaches row 6 | Streams T3. No `catchUp`: `notice(Unproven)` at the queue's head | `abandon`; Streams T3; restart from `at` | as `Live` | Streams T3 | Streams T3 | Streams T3 |
| `O.x.refetch` | Streams T3 | Streams T3. `catchUp`: `Repairing`, `from` undefined, no notice. Else `notice(Unproven)` at the head | `abandon`; as `Live` | as `Live` | Streams T3 | Streams T3 | Streams T3 |
| `InvalidTurn` on a delivery | `end(Defect)` | `end(Defect)` | `abandon`, `end(Defect)` | `end(Defect)` | — | — | — |
| release | `Releasing`, close the scope | same | `abandon`, same | same | cancel the sleep, same | same | stays |
| scope closed, or 5 s (`ReleaseOverdue`) | — | — | — | — | — | — | `Released` |

**Any `O.x.bookmark` or `O.x.refetch` cell** also makes queued values stop moving and drops queued `settle`s. **With no session placed** (`LOADING`, SSR) it is Streams T3 only.

**The deadline is armed** from connect, re-armed by `register`, a value and a ping, only while a pull is outstanding, so a slow consumer of a pulled source does not look dead, and not in `Dropped`.

**Row.** `connection`: `Connecting` for `Connecting`, `Dropped`, `Waiting`; `Live` for `Live`, `Repairing`; `Ended`; undefined for `Releasing`, `Released`. `catchingUp` = `Repairing`.

##### Streams T2. Registration, `every` with a machine consumer

`b` the bookmark, `E` = the field is empty (`fills: false` is always empty), `first = ¬regInConn`, `C` = has `catchUp`. In order:

| # | Input | State | Result |
| --- | --- | --- | --- |
| 1 | reset(`at`) | none, `E` | `b = { at, filled: false }`; no notice. `C`: `Repairing` from `at`. Else `Live` |
| 2 | reset(`at`) | any | `b.at = at`; `notice(Reset)`. `C`: `Repairing` from `at`. Else `Live` |
| 3 | any other | none, `E` | **First open.** No notice. `C`: `greeted = head`, nothing written; `Repairing`, `from` undefined; the record is made at `complete`, so an interrupted first read stays first. No `C`: `b = { at: head, filled: false }`, `head` maybe undefined. `Live` |
| 4 | proof, and `claim` defined or not `first` | any | `Live`. A replay follows and moves `b` |
| 5 | `wiped`, `first` | | **Wiped.** `C`: `greeted = head`; `Repairing`, `from` undefined, no notice. Else `notice(Unproven)`, `head` applied at its admission if `b.at` is undefined, `Live` |
| 6 | | `{ at: p }` | `stalls ≥ 3`, three repairs in a row with no move: `notice(Lost)`, `Live`. `C`: `Repairing` from `p`. Else `notice(Unproven)`, `Live` |
| 7 | | `{ at: undefined }`, or none and not `E` | Make `b`, `filled` = not `E`. `notice(Unproven)`. `C`: `greeted = head`; `Repairing`, `from` undefined. Else `head` applied at the notice's admission, `Live` |

A proof at a first registration with nothing to name a place is not believed: `ProofWithoutPosition`. A stale `from`, as in an SDK self-rejoin, only over-replays.

**`listen`:** no bookmark; `from` is the session's own last position. `fills: false`: `E` always, never `wiped`.

##### Streams T3. The bookmark

| Event | When | Effect |
| --- | --- | --- |
| Streams T2 rows 1, 3, 5, 7; `connect`'s wipe | Runtime step, one publication | as stated. **Every write that creates an entry takes `filled` from the field** |
| Row 2 | at `missed Reset`'s admission | `b.at = at` |
| A value that moves, admitted | step 1, kept through `Denied`, `Unhandled`; not on `InvalidTurn`, which ends `Defect`. A missing entry is re-created | `at = v[position] ?? at`. No comparison: last delivered wins, may move backward, safe |
| A frozen item or page, admitted | step 1 | none |
| `settle(p)` at the queue's head | Runtime step | `at = p`; creates the entry if none |
| `O.x.bookmark({ at })` | step 5, a member | `b.at = at`, `filled` = field not empty, on after memory |
| `O.x.refetch` | step 5, a member | `b = { at: undefined, filled: false }` |
| **Any committed turn whose key's session stays placed and has connected, including `Connecting`, `Waiting`** | end of the turn | `filled` = field not empty. Written only on a change. A session waiting for its predecessor writes nothing. **A releasing turn may raise `filled`, never lower it** |
| Release, reload, freeze, thaw | — | none |
| New slice: `resetOn`, new incarnation, `.each` re-add, subroutine, dispose then `ensure` | — | none: the partition is new |
| A position inside an entry fails to decode | at restore | `{ at: undefined }`: owes. **Persistence O5 must allow this.** A partition failing its own shape discards the scope, as O5. A removed operation's entries are dropped |

**Bound (req M1).** 256 entries per operation in a slice, oldest out. A missing entry reads none: filled, it owes; empty, nothing is held. Under `subscribe.each`, an evicted, quiet, empty key reads first open: req G11 at scale, stated beside req M9. **SSR's total bound binds first** (262,144 bytes).

**`from` is the bookmark at connect.** A queued page may land after: duplicates only. A `missed Reset` not yet admitted at connect asks the old log: one extra notice.

##### Streams T4. Delivery

**`every`.** `Q`, `inFlight`. Flow pulls at turn pace in `Live`. **In `Repairing`** it pulls into `buf` until full, then stops: a pulled source waits (req M2), a pushed one fills `Feed.callback`'s queue, whose bound fails `Overflow`. A pushed source holds at most 2,048.

| Input | `inFlight = none` | `inFlight ≠ none` |
| --- | --- | --- |
| queue x | append; move the head to the mailbox (`settle`: apply and continue) | append |
| turn ends (committed, `Denied`, `Unhandled`) | — | `inFlight = none`; move the next |
| admission when `Releasing`, `Released` | — | discard, `Discarded { Released }`; clear `Q` |

`pages` mapped: a page is one queue item and one turn. A page's size is the author's, the only unbounded input.

**`latest`.** `slot`, `slotConn`, `queued`, `heard`. `reconcile`: if current, `value` mapped and it differs from `heard`, set the slot; else clear it. At admission the slot must be current and match the connection, or discard (`NotLive`). One value delivery, one `failure`.

##### Streams T5. `latest`

| Connection | Value | `live()` | `proof` |
| --- | --- | --- | --- |
| `Connecting` | implicit live; `last = { v, now, own }`, confirmed, reconcile | `Live`, `value` undefined | `Live`; confirmed only if `last.own` |
| `Live` | `last = { v, now, own }`, confirmed, reconcile. Equal confirms, not heard | not confirmed | confirmed if `last.own` |
| `Dropped`, `Waiting` | `last = { v, dropAt, not own }`, nothing delivered | `Live`, not confirmed | as `Connecting` |
| Leaving `Live` | `last.at = now` if confirmed; not confirmed | | |

`value` = `last.value` iff `Live ∧ confirmed`. Age is transferred across reload and SSR and rebased.

##### Streams T6. `Feed.callback`'s queue

**Variables:** `q`, values and signal groups `(down₁?, live?, down₂?)`, with a ping flag; `closing`; `released`; `waiters`. At most 1,024 values and one group between two values.

Group merge: appending `down(r)` sets `down₂ = r` if the group has a `live`, else `down₁ = r`. Appending `live(a)` with a `down₂` moves it to `down₁`, clears `down₂`, and sets `live` to the weaker of the two; without one, the weaker. Pulling a group emits `down₁`, `live`, `down₂`. No merge upgrades an answer or hides a drop.

| Input | Room | Full | `closing ≠ open` or `released` |
| --- | --- | --- | --- |
| `emit(value)` | append; a resolved promise, or if this filled the last slot, one that resolves when a pull makes room | `closing = failing Overflow`; drop the value (evidence); a promise that never resolves | no-op, evidence |
| `emit(signal)` | merge | same | no-op, evidence |
| `emit.fail(e)` / `emit.end()` | `closing = failing e` / `ending` | same | no-op |
| pull | take the head; if this made room, resolve the waiter | same | drain `q`, then fail or end |
| release | run finalizers, awaited; `released = true` | same | run finalizers if not yet run |

**For `latest`: a signal is a fence.** A value before a signal is dropped when another value follows it. At most (signal group, one value); it never overflows.

##### Streams T7. `listen` coverage

Per covered answer r: `readStart[r]`, `landed[r]`, `subscribed[r]`. Per session s: `st`, and `lastGap[s]`. **Gaps** (set `lastGap`, start a refetch of each subscribed r read earlier): an unproven or reset registration, first included; `end`; release. A `down` and a proven registration only change the present state.

```text
current(r) = landed[r] ∧ every covering s is Live ∧ for every s that covers or covered r: lastGap[s] = none ∨ lastGap[s] < readStart[r]
```

A released session's `lastGap` is kept until every covered `readStart` is later. `listen` ignores a contract's `catchUp`.

##### Streams T8. Write progress

Per write lane: Attempts with `ended[a]`, `addr`, `prog[a]`. Row `progress = addr ? prog[addr] : undefined`.

| Input | `a = addr ∧ ¬ended[a]` | otherwise |
| --- | --- | --- |
| `progress(p)` by Attempt a's commit | `prog[a] = p`; publish the row as a Runtime step | evidence; nothing changes |
| a's ending admitted | the mapper reads `prog[a]`; `ended[a] = true` | the mapper reads `prog[a]` |
| promotion | `addr` = the promoted Attempt, `prog` undefined | — |
| restore | every `prog[a]` undefined | same |

##### Streams T9. Lifecycle

| Edge | Session | Bookmark | Row | Machine | `listen` |
| --- | --- | --- | --- | --- | --- |
| Placement starts | waits for a releasing predecessor, then `connect` | loaded | `Connecting`; restored `last` | nothing | stale |
| Connection change | Streams T1 | Streams T2, Streams T3 | Streams T1 | none unless `missed` | Streams T7 |
| Ending | `Ended` | kept | `Ended` | `failure` behind queued items | stale |
| Leave, key gone | `Releasing`, awaited, 5 s | kept | undefined | queued discarded with evidence | stale |
| Disposal, then `ensure` | same, then new | goes with the slice (Persistence O3) | gone, then `Connecting` | new memory | as start |
| `resetOn`, `.each` re-add | released, then new, waits | none | `Connecting` | new memory | gap |
| Restore | new; budget restarts (req C4) | last capture | `Connecting`; `last` from age | no replay | stale |
| Wake | The deadline by Machines O5's overdue rule. The browser orders a timer and a socket message | unchanged | leaves `Live` at resume | nothing | stale |
| Freeze, thaw | released, then new | with the frozen slice | undefined, then `Connecting` | discarded, then as start | gap |
| Second tab | its own | none unpersisted | as new | as new | as new |
| SSR server | `every`: **never opens**. `latest`: may run, released at capture | as written by `O.x.bookmark`; an omitted actor omits both (SSR O3) | `last` as age | — | as EDP |
| SSR client | new, never delays settling | hydrated; sensitive position: entry omitted, row 7, one notice | `Connecting`; `last` dim; `heard` stops a double | no replay | one refetch per covered list |

**Rule list (req L12).** 8: deliveries of a live session are never lost; a released session's are discarded with evidence. 14: always current from the active leaf. 20: `value`, `pages`, `missed`, `failure` handled from every leaf under the placement. 25: as ST Q5. 37: `failure` includes `Defect`, `Interrupted`, by name or `Feed`. 47: deliveries count as endings.

#### 2.11.12 Examples

##### 2.11.12.1 Chat's walk

| Step | What happens |
| --- | --- |
| First load | Row 3, read, `catchingUp`. `done` with `through` |
| Drop during first load | No record. Empty field: row 3 again, reads again. After a `more` with no `through` the field is filled: row 7, one notice, reads again |
| Drop, replay | `Waiting`, banner. `from = b.at`. `hello` echoes: row 4 |
| Quiet reconnect, empty room | `{ at: head }`, row 6: read from head, nothing, no notice |
| Server cannot replay | Row 6. Socket buffered, 503 retried with the socket open, `settle`, flush |
| Drop mid-repair | Buffer discarded. Bookmark at the last `more`'s `through` |
| Retention | `Feed.gone`: one `missed Lost`, kept pages, flush. No budget spent |
| Reset | Row 2: one notice, reads the new log |
| Room A→B→A | Row 3 on B; wiped on A: reads, no notice |
| Clear chat, then a reconnect or reload | Stays cleared |
| Clear chat, a message, A→B→A | The wipe re-reads: **cleared items return, visibly** |
| Refresh | Forgets, reads now |
| Long outage | Tries every 30 s, row `Connecting` |
| Flapping | `Flapping` after 8, `Feed`, `S.ENDED` |
| Token expiry | Not in `while`: `end`, `SIGNED_OUT` |

##### 2.11.12.2 Presence

**Source:** a WebSocket with `presence_state` then diffs. Each connection folds from its own `presence_state`.

```ts
export const Presence = { room: stream({
  id: "Presence.room", input: { roomId: Schema.String }, output: Members, key: ["roomId"],   // user-defined: Members
  delivers: "latest",
  subscribe: ({ roomId }) => PresenceSocket.frames(roomId).pipe(          // user-defined
    Stream.mapAccum((): Members | undefined => undefined, (acc, f) =>
      f.t === "ping" ? [acc, [Feed.ping]] as const                        // a ping is not a value
      : f.t === "presence_state" ? [f.members, [f.members]] as const
      : acc === undefined ? [acc, []] as const                            // a diff before the state: nothing to apply it to
      : [applyDiff(acc, f), [applyDiff(acc, f)]] as const)),
  reconnect: { while: (e) => e._tag === "PresenceDropped" },
  idleTime: "45 seconds",   // the server pings
}) }
// definition: bare, the data is its row (brief K3)
operations: ({ E }) => ({ presence: Presence.room }),
// machine
ROOM: { activities: [O.presence.subscribe(({ memory }) => ({ roomId: memory.roomId }))] },
// view
const row = useView(room, (s) => s.operations.presence)
const members = row?.value ?? row?.last?.value ?? {}
```

##### 2.11.12.3 Ticker

**Source:** one app-wide socket multiplexed by the service, ticks `{ symbol, price, asOf }`, pings every 10 s. **Each symbol registers when its subscribe is sent, and the socket's pings must reach every symbol's stream**, or a quiet symbol hits `Silent` at 25 s.

```ts
export class MarketFeed extends Context.Service<MarketFeed, {   // user-defined
  readonly frames: (symbol: string) => Stream.Stream<{ t: "subscribed" } | { t: "ping" } | { t: "quote"; quote: Quote }, MarketDropped>   // subscribed when this symbol's subscribe is sent; fans each socket ping out to every symbol
}>()("app/MarketFeed") {}

export const Market = { quote: stream({
  id: "Market.quote", input: { symbol: Schema.String }, output: Quote, key: ["symbol"],
  delivers: "latest",
  subscribe: ({ symbol }) => Stream.unwrap(Effect.map(MarketFeed, (mf) => mf.frames(symbol).pipe(
    Stream.map((f) => f.t === "subscribed" ? Feed.live() : f.t === "ping" ? Feed.ping : f.quote)))),   // per symbol. A ping alone does not register
  reconnect: { while: (e) => e._tag === "MarketDropped" }, idleTime: "25 seconds",
}) }
// definition
internalEvents: { Quoted: { symbol: Schema.String, price: Schema.Number }, QuoteEnded: { symbol: Schema.String } },
operations: ({ E }) => ({ quotes: Market.quote.outcomes({
  value: E.Quoted.from((q, { key }) => ({ symbol: key.symbol, price: q.price })),
  failure: { MarketDropped: E.QuoteEnded.from((_e, { key }) => key), Feed: E.QuoteEnded.from((_e, { key }) => key) },
}) }),
// machine
WATCHING: {
  activities: [O.quotes.subscribe.each(({ memory }) => memory.watchlist.filter((s) => !memory.ended.includes(s)).map((symbol) => ({ symbol })))],
  on: {
    Quoted: [{ target: "self", guard: ({ memory, event }) => event.price > (memory.alerts[event.symbol] ?? Infinity) || deny("BelowAlert"),
               updateMemory: ({ memory, event }) => ({ fired: [...memory.fired, event.symbol], alerts: omit(memory.alerts, event.symbol) }) },
             { target: "self" }],
    QuoteEnded: { target: "self", updateMemory: ({ memory, event }) => ({ ended: [...memory.ended, event.symbol] }) },   // req C10
    RetryQuote: { target: "self", updateMemory: ({ memory, event }) => ({ ended: memory.ended.filter((s) => s !== event.symbol) }) },
  },
},
// view
const row = useView(watch, (s) => Watch.O.quotes.get(s, { symbol }))
row?.value ? <Price value={row.value.price} />
: row?.last ? <Price dim value={row.last.value.price} note={`as of ${ago(now - row.last.at)}`} />
: <Price pending />
```

Quiet market: `Feed.live()` at subscribe registers it, and pings keep it `Live`. Half-open: 25 s, `Silent`, dim with true age. Equal price after reconnect: undimmed, not heard. A queued tick from before a drop is fenced and discarded (req F4, req F5). `subscribe.each` has no cap of its own (req M9).

##### 2.11.12.4 Counter

```ts
delivers: "every", position: "id",   // no catchUp: history must not be counted
subscribe: () => notifications(),    // user-defined
reconnect: { while: (e) => e._tag === "Dropped" }, idleTime: "30 seconds",
memory: { unread: Schema.Int, seen: Schema.Array(Schema.String) },        // user-defined: seen, the last few ids
fills: "unread",
Notification: { target: "self", updateMemory: ({ memory, event }) => memory.seen.includes(event.n.id) ? {} : { unread: memory.unread + 1, seen: [...memory.seen, event.n.id].slice(-256) } },
MarkRead: { target: "self", updateMemory: () => ({ unread: 0 }) },        // cleared: stays 0
MayHaveMissed: { target: "self", updateMemory: () => ({ countMayBeLow: true }) },
```

Or accept drift, and drop `seen`.

##### 2.11.12.5 LLM tokens with Stop

As in the record's v2 4.4: **a streaming write stays a transaction.** Nothing here touches it (req I3).

```ts
ask: transaction({
  id: "Assistant.ask", input: { threadId: Schema.String, prompt: Schema.String }, output: Answer, key: ["threadId"],
  progress: { text: Schema.String }, concurrency: "reject",
  commit: (input, { attempt, signal, progress }) => Effect.gen(function* () {
    const http = yield* FetchHttpClient.Fetch   // the seam Fake.fetch binds
    const res = yield* Effect.tryPromise({
      try: () => http("/api/ask", { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": attempt.id }, signal }),
      catch: () => Outcome.unknown(new NoResponse()) })
    if (!res.ok) return yield* (res.status >= 500 ? Outcome.unknown(new ServerError({ status: res.status })) : Outcome.failure(new Refused({ status: res.status })))
    let text = ""
    let done: Usage | undefined
    yield* Stream.fromReadableStream({ evaluate: () => res.body!, onError: () => new NoResponse() }).pipe(
      Stream.decodeText(), Stream.splitLines,
      Stream.timeoutOrElse({ duration: "20 seconds", orElse: () => Stream.fail(new Stalled()) }),   // a stall fails. Rule 25 still governs calls
      Stream.runForEach((line) => Effect.sync(() => {
        const f = JSON.parse(line)
        if (f.t === "token") { text += f.text; progress({ text }) }       // no turn per token
        if (f.t === "done") done = f.usage
      })),
      Effect.catch((e) => Outcome.unknown(e)))
    if (done === undefined) return yield* Outcome.unknown(new Truncated())
    return { text, usage: done }
  }),
}),
// machine
IDLE:   { on: { Ask: { target: S.ASKING, guard: [O.ask.idle], actions: [O.ask.commit(({ memory, event }) => ({ threadId: memory.threadId, prompt: event.prompt }))] } } },
ASKING: { on: { Stop: { target: "self", actions: [O.ask.cancel] }, Answered: { target: S.IDLE, updateMemory: ({ event }) => ({ last: event.text, incomplete: false }) } } },
on: { Stopped: { target: S.IDLE, updateMemory: ({ event }) => ({ last: event.partial, incomplete: true }), actions: [O.ask.cancel] } },
// view
const text = useView(chat, (s) => s.operations.ask.progress?.text ?? s.memory.last)
```

req W6: Stop then Ask is admitted once `Stopped` releases the hold; a retry may be charged twice.

##### 2.11.12.6 Upload

As in the record's v2 4.5.

```ts
put: transaction({
  id: "Uploads.put", input: { ref: Schema.String, file: Schema.instanceOf(File) }, output: Stored, key: ["ref"],
  progress: { sent: Schema.Number, total: Schema.Number }, concurrency: "reject",
  commit: ({ ref, file }, { attempt, signal, progress }) => Effect.callback<Stored, Outcome.Unknown<UploadLost> | Outcome.Failure<TooLarge>>((resume) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) progress({ sent: e.loaded, total: e.total }) }
    xhr.onload = () => resume(xhr.status === 201 ? Effect.succeed(JSON.parse(xhr.responseText)) : xhr.status === 413 ? Outcome.failure(new TooLarge()) : Outcome.unknown(new UploadLost({ status: xhr.status })))
    xhr.onerror = xhr.ontimeout = () => resume(Outcome.unknown(new UploadLost({ status: 0 })))
    xhr.onabort = () => resume(Outcome.unknown(new UploadLost({ status: -1 })))
    signal.addEventListener("abort", () => xhr.abort())
    xhr.open("PUT", `/uploads/${ref}`); xhr.setRequestHeader("Idempotency-Key", attempt.id); xhr.send(file)
  }).pipe(Effect.timeoutOrElse({ duration: "10 minutes", orElse: () => Outcome.unknown(new UploadLost({ status: -2 })) })),
}),
// view
const label = !row.pending ? undefined : row.progress && row.progress.sent < row.progress.total ? `Sending ${pct(row.progress)}` : "Waiting for the server…"
```

##### 2.11.12.7 Entity `listen` (Supabase)

```ts
export const Tickets = { changes: stream({
  id: "Tickets.changes", input: { queueId: Schema.String }, output: TicketChange, key: ["queueId"],
  delivers: "every",
  subscribe: ({ queueId }) => Effect.map(TicketChannel, (t) => t.changes(queueId)).pipe(Stream.unwrap),   // user-defined: TicketChannel, below
  reconnect: { while: (e) => e._tag === "ChannelDown" },   // the adapter fails on a channel error, so Flow rejoins
  idleTime: "Infinity",                                                   // No heartbeat reaches the adapter; status reports
}) }
// tickets.domain.ts
changes: listen(Tickets.changes).as([Ticket], (c) => c.kind === "delete" ? Ticket.delete({ id: c.id }, { version: c.version }) : Ticket.patch({ id: c.id }, c.fields)),
// queue.definition.ts
operations: ({ E }) => ({ changes: TicketsDomain.changes.outcomes({ failure: { SignedOut: E.SignedOut, ChannelDown: E.PushEnded, Feed: E.PushEnded } }) }),
// queue.machine.ts
QUEUE: { activities: [O.changes.subscribe(({ memory }) => ({ queueId: memory.queueId }))], on: { PushEnded: S.QUEUE_ENDED } },
```

```ts
// ticket.channel.ts, user-defined: the adapter, as a service
export class TicketChannel extends Context.Service<TicketChannel, {
  readonly changes: (queueId: string) => Stream.Stream<TicketChange | Feed.Signal, ChannelDown | SignedOut>
}>()("app/TicketChannel") {
  static readonly layer = Layer.effect(TicketChannel, Effect.map(Supabase, (sb) => ({ changes: (queueId) => Feed.callback<TicketChange, ChannelDown | SignedOut>((emit) => Effect.gen(function* () {
    const ch = sb.channel(`queue:${queueId}:${crypto.randomUUID()}`)      // a topic of its own, so removing it closes nothing shared
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `queue_id=eq.${queueId}` }, (p) => emit(toChange(p)))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") emit(Feed.live())
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") emit.fail(new ChannelDown({ status }))
      })
    const off = sb.auth.onAuthStateChange((e) => { if (e === "SIGNED_OUT") emit.fail(new SignedOut()) })
    yield* Effect.addFinalizer(() => Effect.promise(async () => { off.data.subscription.unsubscribe(); await sb.removeChannel(ch) })
      .pipe(Effect.timeout("3 seconds"), Effect.ignore))
  })) })))
}
```

**Costs (req E9, req E10, req E11).** One refetch per subscribed list on re-entry. A change before `SUBSCRIBED`: at most 2 reads. One connection cannot feed both records and a log: the desk keeps 2.

##### 2.11.12.8 SDKs by recipe

**Vendor behaviour is from the record's v2, blind and prior-art notes. None was run.** Rule: 2.11.3's `reconnect` row. A finalizer removes only what it created (req L6). Socket.IO, Firestore, polling, `fetch`, a reduced Ably compile in the record's spike (its section 11); the rest in ST RV3's.

| Source | `reconnect`, `idleTime` | req F9 |
| --- | --- | --- |
| Raw WebSocket, Presence, ticker | yes, a duration | Yes |
| Socket.IO, Ably, Phoenix | none | The SDK's |
| Firestore | none | **No**: half-open stays current. req F10 fails |
| Supabase | yes, `"Infinity"` | Status from the SDK |
| graphql-ws | yes, a duration, `keepAlive` on | Yes: pongs. `on("pong")` is client-wide, so it proves the socket, not each subscription |
| Electric | yes, a duration | Yes: `up-to-date` |
| EventSource | yes, `"Infinity"` | **No**, unless a named `ping` event. req F10 fails |
| Polling | yes, a duration | Yes: a hung GET |
| Streaming `fetch` | yes, a duration | Yes: blank lines |

**Socket.IO** (`every`; no position).

```ts
delivers: "every",
subscribe: ({ room }) => Feed.callback<Msg, Rejected | SioDropped>((emit) => Effect.gen(function* () {
  const s = sio.socket(room)                                              // user-defined: forceNew, reconnectionAttempts: 8
  s.on("connect", () => emit(s.recovered ? Feed.live({ proof: "socket.io recovered" }) : Feed.live()))
  s.on("disconnect", (why) => why === "io server disconnect" ? emit.fail(new Rejected({ why })) : emit(Feed.down({ why })))
  s.io.on("reconnect_failed", () => emit.fail(new SioDropped()))          // the SDK's budget is the budget
  s.on("chat", (m) => emit(m))
  yield* Effect.addFinalizer(() => Effect.sync(() => s.disconnect()))
})),
```

Streams T2's row 7 covers this. REST history read first: one notice per load. With no `reconnect`, one `Overflow` is terminal: the machine must re-open.

**Ably** (`every`; `RcMap` compiled by ST RV1). **Unconfirmed:** whether a transparent resume emits a channel event, so react to channel states rather than `connection.on`.

```ts
delivers: "every", position: "serial",
subscribe: ({ name }) => Effect.map(AblyChannel, (c) => c.messages(name)).pipe(Stream.unwrap),   // user-defined: AblyChannel, below
catchUp: ({ name }, { from, next, signal }: { from: Serial | undefined; next: Walk | undefined; signal: AbortSignal }) =>   // annotated: a richer token. user-defined: Walk
  history(name, from, next?.page, signal).pipe(Effect.map((p) => {        // newest first
    const head = next?.head ?? p.firstSerial                              // the walk's first page: where this read ends
    const items = [...p.items].reverse()
    return p.reachedRetention ? Feed.gone({ reason: "past retention", items, through: head })
      : p.hasNext && head ? Feed.more({ items, next: { page: p.next, head } })   // no through: pages are newest first
      : Feed.done({ items, proof: "walked back to from", through: head })
  })),
// the machine's handlers: this walk is newest first, so insert by position, then trim
Message: { target: "self", updateMemory: ({ memory, event }) => ({ messages: insertByPosition(memory.messages, [event.message]).slice(-100) }) },   // user-defined: insertByPosition sorts by serial
Page: { target: "self", updateMemory: ({ memory, event }) => ({ messages: insertByPosition(memory.messages, event.messages).slice(-100) }) },   // the trim comes after the sort (2.11.5)
```

```ts
// ably.channel.ts, user-defined: the adapter, as a service
export class AblyChannel extends Context.Service<AblyChannel, {
  readonly messages: (name: string) => Stream.Stream<Msg | Feed.Signal, AblyDown | HistoryDown>
}>()("app/AblyChannel") {
  static readonly layer = Layer.effect(AblyChannel, Effect.map(Ably, (a) => ({ messages: (name) => Feed.callback<Msg, AblyDown | HistoryDown>((emit) => Effect.gen(function* () {
    const ch = yield* RcMap.get(a.channels, name)   // released with the scope
    let first = true
    const attached = (c: ChannelStateChange) => { emit(c.resumed && !first ? Feed.live({ proof: "ably resumed" }) : Feed.live()); first = false }   // a cached channel's first flag proves nothing (req G6)
    const update = (c: ChannelStateChange) => { if (!c.resumed) emit(Feed.live()) }
    const down = (c: ChannelStateChange) => emit(Feed.down({ state: c.current }))
    const message = (m: InboundMessage) => emit(toMsg(m))   // user-defined: toMsg. Ably's types
    ch.on("attached", attached); ch.on("update", update); ch.on("detached", down); ch.on("suspended", down); ch.on("failed", (c) => emit.fail(new AblyDown({ reason: c.reason?.message })))
    yield* Effect.promise(() => ch.subscribe(message))
    if (ch.state === "attached" && first) { emit(Feed.live()); first = false }
    yield* Effect.addFinalizer(() => Effect.sync(() => { ch.off(attached); ch.off(update); ch.off(down); ch.unsubscribe(message) }))
  })) })))
}
```

**graphql-ws** (`every`; `retryAttempts: 0`, `keepAlive: 10_000`, which defaults to off).

```ts
delivers: "every", position: "cursor",   // a Subscribed first event registers within idleTime; a pong before it does not extend it
subscribe: ({ boardId }, { from }) => Stream.unwrap(Effect.map(Gql, (gql) =>
  gql.pongsAndEvents({ query: BoardEvents, variables: { boardId, after: from } }).pipe(   // user-defined: iterate merged with on("pong")
    Stream.map((x) => x.t === "pong" ? Feed.ping
      : x.ev.__typename === "Subscribed" ? (sameCursor(x.ev.replayedFrom, from) ? Feed.live({ proof: "server replayed" }) : Feed.live({ head: x.ev.head }))
      : x.ev)))),
reconnect: { while: (e) => e._tag === "GqlDropped" }, idleTime: "30 seconds",
```

Cost: with no server first event, registration is the first `next`: write `idleTime: "Infinity"`, and a quiet subscription stays `Connecting` (req FC66), half-open undetected.

**Firestore** (`latest`; a listener error is final).

```ts
delivers: "latest",
subscribe: ({ docId }) => Feed.callback<Doc, NoAccess | ListenError>((emit) => Effect.gen(function* () {
  let cached = false
  const off = onSnapshot(docId, (snap) => {
    if (snap.fromCache) { cached = true; emit(Feed.down("served from cache")) }   // the fence keeps the next value from reading current (Streams T6)
    else if (cached) { cached = false; emit(Feed.live()) }
    emit(snap.data)
  }, (err) => emit.fail(err.code === "permission-denied" ? new NoAccess() : new ListenError({ code: err.code })))
  yield* Effect.addFinalizer(() => Effect.sync(off))
})),
```

Costs: an optimistic echo reads current (req F13); req F10 fails; `fromCache` unconfirmed.

**Phoenix** (`every`; `heartbeatIntervalMs` set). **Unconfirmed:** `receive("ok")` firing on a rejoin.

```ts
delivers: "every", position: "id",
subscribe: ({ topic }, { from }) => Stream.unwrap(Effect.map(Phoenix, (p) => Feed.callback<Msg, ChannelClosed | JoinRefused>((emit) => Effect.gen(function* () {
  const ch = p.socket.channel(topic, () => ({ after: from }))
  ch.on("message", (m) => emit(m))
  ch.onError(() => emit(Feed.down({ why: "channel error" })))
  ch.onClose(() => emit.fail(new ChannelClosed()))
  ch.join().receive("ok", (r) => emit(r.replayed ? Feed.live({ proof: "join replayed" }) : Feed.live({ head: r.head }))).receive("error", (e) => emit.fail(new JoinRefused({ e })))
  yield* Effect.addFinalizer(() => Effect.sync(() => ch.leave()))
})))),
```

An SDK self-rejoin sends the stale `from`: more replay. Safe: duplicates.

**Electric** (`latest`).

```ts
delivers: "latest",
subscribe: ({ where }) => Feed.callback<Rows, ElectricDown>((emit) => Effect.gen(function* () {
  const ctl = new AbortController()
  const stream = new ShapeStream({ url, params: { table: "tickets", where }, signal: ctl.signal })
  stream.subscribe((msgs) => { if (msgs.some((m) => m.headers?.control === "up-to-date")) emit(Feed.live({ proof: "electric up-to-date" })) }, (e) => emit.fail(new ElectricDown({ e })))
  new Shape(stream).subscribe(({ rows }) => emit(rows))
  yield* Effect.addFinalizer(() => Effect.sync(() => ctl.abort()))
})),
reconnect: { while: (e) => e._tag === "ElectricDown" }, idleTime: "45 seconds",
```

**Cost, stated (ST RV2):** `latest` bans `position`, so offset and handle are not saved: each reconnect and reload re-syncs the whole shape, unless the adapter holds them for the session. `must-refetch` arrives as a new full value (req R21).

**EventSource** (`every`; dense ids, no greeting).

```ts
delivers: "every", position: "id",
subscribe: ({ userId }, { from }) => Feed.callback<Note, SseDropped>((emit) => Effect.gen(function* () {
  const es = (yield* Sse).open(`/notes/stream?user=${userId}${from !== undefined ? `&after=${from}` : ""}`)   // user-defined: Sse, a service; a Story gives a client half over server.socket
  let decided = false
  es.onmessage = (m) => {
    const note = toNote(m)
    if (!decided) { decided = true; emit(from !== undefined && note.id === from + 1 ? Feed.live({ proof: `ids contiguous after ${from}` }) : Feed.live()) }   // req R15
    emit(note)
  }
  es.onerror = () => emit.fail(new SseDropped())                          // closes, so the browser's Last-Event-ID cannot disagree
  yield* Effect.addFinalizer(() => Effect.sync(() => es.close()))
})),
reconnect: { while: (e) => e._tag === "SseDropped" }, idleTime: "Infinity",
```

Why `reconnect` here: this adapter closes on error, so the browser's retry never runs. Costs: quiet reconnect stays `Connecting`; sparse ids unproven each time (req FC74); `onerror` hides status, so authenticated SSE uses `fetch` (req C11); six per origin (req L10).

**Polling** (`every`). The desk's technician pulse needs `idleTime` too. A first answer registers; a hung first GET ends `Silent`.

```ts
delivers: "every", position: "cursor",   // a hung GET: Silent
subscribe: ({ ticketId }, { from }) => Stream.paginate({ cursor: from ?? "0", first: true }, ({ cursor, first }) => progress(ticketId, cursor).pipe(
  Effect.map((b) => [
    [...(first ? [Feed.live({ head: b.cursor })] : []), ...(b.events.length ? b.events : [Feed.ping])],   // ST RV2: the quiet false notice goes
    Option.some({ cursor: b.cursor, first: false }),
  ] as const),
  Effect.delay("1 second"))),
reconnect: { while: (e) => e._tag === "PollFailed" }, idleTime: "30 seconds",
```

A poll from `from` sees all, but `head` alone is unproven: a reconnect's first answer is a notice unless the server says so; `Feed.live({ proof: ... })` when `from` is defined and the server's contract is "every event after". `Connecting` until the first answer (req C14). A failed GET keeps the bookmark (req C12).

**Streaming `fetch`** (`every`).

```ts
delivers: "every", position: "seq",
subscribe: ({ feedId }, { from, signal }) => Stream.unwrap(Effect.gen(function* () {
  const http = yield* FetchHttpClient.Fetch   // the seam Fake.fetch binds. A global fetch reaches no fake
  const res = yield* Effect.tryPromise({ try: () => http(feedUrl(feedId, from), { signal }), catch: () => new BodyDropped() })
  if (res.status === 401) return yield* new SignedOut()
  if (!res.ok) return yield* new BodyDropped()
  const hello = res.headers.get("x-replayed-from") === String(from) ? Feed.live({ proof: "server replayed" }) : Feed.live()
  return Stream.fromReadableStream({ evaluate: () => res.body!, onError: () => new BodyDropped() }).pipe(
    Stream.decodeText(), Stream.splitLines,
    Stream.map((line) => line === "" ? Feed.ping : decodeRow(line)),
    Stream.prepend([hello]))
})),
reconnect: { while: (e) => e._tag === "BodyDropped" }, idleTime: "30 seconds",
```

A body end is `Closed`, retried. req V8: a terminator becomes a typed error outside `while`.

#### 2.11.13 Tooling and testing

**Single graph, single runtime.** Streams T1 is one Runtime record. `delivers`, `idleTime`, `reconnect`'s presence, `catchUp`'s presence, `position`, `fills`, `failure`'s keys, the action are readable without running a closure. `while` and `schedule` are closures. No new memory writes; `check()` runs steps 2–6, so it touches no bookmark.

**`flow check`:** `FeedUnhandled`, `ListenNeedsEvery`, rule 20 rows, `DuplicateSession`, `DuplicateListen`, `VerbMismatch`, `DuplicatePlacement`, `KeyRequired`, NEW `SharedFills` (two ops, one field), NEW `FillsNotPerKey`, NEW `UnboundedBridge` (source text on `Stream.callback`; not built).

**`flow explain`:** `LIVE subscribes messages (Chat.messages, every, one session per room, fills messages, idle 45s, reconnects by predicate, catches up)`.

**Inspection:** per session: state, `drop`, Streams T2 row and basis, each `proof`, losses, bookmark and `filled`, bound, release; counters plus a ring of the last 256. Flags: `ValuesWhileDown`, `RegistrationChurn`, `ReleaseOverdue`, `ProofWithoutPosition`, `PingsWithoutLive`, `IdleWithoutPing`, `DeliveryDenied`, `FillsUntouched`. Stories templates assert no flags.

**The chat Story**, as [the Stories record](merged/story-checks/stories-amended.md) section 11 fixed it. Illustrative; not run.

```ts
const ChatFake = Fake.webSocket(Chat, chatRoutes)   // user-defined: Chat, chatRoutes
export const chat = Story.machine(ChatRoom, {   // [W1]
  id: "chat/replay-then-reset", input: { roomId: "r1" }, fixtures: [ChatSocket.layer.pipe(Layer.provide(ChatFake)), HistoryFake],   // user-defined. [P, merge] ChatSocket is in R, so its Layer is a fixture; ChatFake binds the constructor ChatSocket.layer reads
  world: [Chat.seed({ history: seed })],                                  // user-defined control
})
  .checkpoint("live")                                                     // a start cut
  .world(Chat.greet({ replay: false }), Chat.history.drop({ at: "response" }), Chat.socket.drop())   // [W37]; a page fails once
  .advance({ next: { operation: O.messages, timer: "backoff" } })   // [W7]; reconnects, reads, the page's answer is lost
  .advance({ next: { operation: O.messages, timer: "page" } })
  .checkpoint("caughtUp")
  .world(Chat.resetLog({ epoch: 9 }), Chat.socket.drop())
  .advance({ next: { operation: O.messages, timer: "backoff" } })
  .checkpoint("reset")

test("replay, then reset", async () => {
  const { live, caughtUp, reset } = (await chat.run()).checkpoints
  expect(live.operations.messages?.connection).toBe("Live")
  expect(caughtUp.records("session", { operation: O.messages }).filter((r) => r.drop)).toHaveLength(1)
  expect(caughtUp.operations.messages?.catchingUp).toBe(false)
  expect(reset.records("session", { operation: O.messages }).at(-1)?.bookmark?.at?.epoch).toBe(9)
})
```

**Reading the bookmark in a test (ST DT 5.1).** This replaces the five weakened assertions: "does not move backwards", the cursor after a catch-up, the cursor after a reload, and the request-log and entry-count stand-ins. The block reads the desk's Story, `merged/streams/trials/desk/features/Tickets/feed/feed.story.ts`, an app Story; `O.activity` and `Desk.socket` are the desk's. The cut names are this block's: the trial's own are `caughtUp` and `resumed`, and it has no older-frame or clear Story.

```ts
const bookmark = (cp: Story.Frame<typeof DeskSetup>) => cp.records("session", { operation: O.activity }).at(-1)?.bookmark   // user-defined: DeskSetup, O.activity (the desk's feed)
expect(bookmark(caughtUp)?.at).toEqual({ epoch: 8, seq: 41 })             // the cursor after a catch-up
expect(bookmark(afterReload)?.at).toEqual({ epoch: 8, seq: 41 })          // the cursor after a reload
expect(bookmark(afterOlderFrame)?.at).toEqual({ epoch: 8, seq: 40 })      // last delivered wins: it may move backward, on purpose
expect(afterReload.read(Desk.socket).at(-1)?.input.from).toEqual({ epoch: 8, seq: 41 })   // what the server saw
expect(bookmark(cleared)?.filled).toBe(false)                             // cleared, no message since
```

A reload Story is `Story.app`; a record outlives the session, since `session` records are the run's.

**A Flapping Story, by plain construction (ST DT 5.3; `stories-amended.md`'s table).** A loop of `world` and `advance` adds no checkpoint, so the builder's type is unchanged.

```ts
const flapped = Array.from({ length: 7 }).reduce(                         // plain JavaScript
  (story: typeof base) => story.advance("1 second").world(Chat.socket.drop()).advance({ next: { operation: O.messages, timer: "backoff" } }),
  base,                                                                   // user-defined: base, a Story past its first registration
).advance("1 second").world(Chat.socket.drop())                           // the eighth drop ends it: no backoff left (W7)
 .checkpoint("ended")
test("eight quick drops end the session", async () => {
  const { ended } = (await flapped.run()).checkpoints
  expect(ended.state).toBe(S.ENDED)                                       // after FeedEnded the row is undefined
  expect(ended.records("session", { operation: O.messages }).at(-1)?.ended).toBe("Flapping")
})
```

**Fakes: `pushes` stays out (ST Q8).**

```ts
// desk.fake.ts: 6 lines, then one line per handler
const pushed = (before: Truth, after: Truth) => ({ truth: after, send: [Desk.socket.frames(sameWorkspace(after), newEntries(before, after))] })   // user-defined
```

#### 2.11.14 Words and cuts

Words an author writes, by v2's method (the word count of ST RV1):

| Tier | Words | Count |
| --- | --- | --- |
| Common | `reconnect`, `idleTime`, `position`, `from`, `Feed.callback`, `Feed.live`, `proof`, `Feed.ping`, `missed`, `fills`, `Feed` key, `drop`, `value`, `last`, `connection` literals | **15** |
| Uncommon | `Feed.down`, `catchUp`, `next`, `Feed.more`, `Feed.done`, `Feed.gone`, `head`, `through`, `pages`, `catchingUp`, `O.x.bookmark` (`at`, a position only), `Feed.Signal` | **12** |
| Rare | `restartAt`, `why` | **2** |
| **Total** | | **29** |

Read-only: reasons `Closed`, `Overflow`, `Silent`, `Flapping`; findings and flags. **Not counted:** `O.x.refetch`, existing, so reload costs no word; `items`, `reason` are keys of the answer objects.

**Why 29.** `errors` and `"never"` cut under S14; `at` split in two because it meant four things; `Feed.Signal` is honest (ST DT). `pages` is the only easy cut left; it should stay.

**Cut.**

| Cut | What replaces it |
| --- | --- |
| `Feed.reconnect`, 70 cells | Contract data, one session table |
| `fresh`, `registered`, `announced`, `initial`, the guard, "`from` required with `position`" | The bookmark, `fills` |
| `after` in `input`, `cursor` in memory, `restartAt` in `missed`'s payload | The bookmark |
| `seen`, `tail`, `meet`, P0, P1, P3 | The bookmark stays put until a read says |
| `resetAfter`, `bufferSize` | Constants, 1 minute, 1,024. A flood test sends 1,025 frames |
| A private clear mark | Stated limit in 2.11.8: more private state for one sequence, and a bug in it would hide items silently |
| `Feed.CannotRepair`, `continueAt` | `Feed.gone` |
| `lost` as an option | `Feed.live()`; `Lost` from `Feed.gone` or a stall |
| `"accept"` | One handler |
| `errors`, `"never"` | Inferred `E`; `"Infinity"`, Duration.Input's own |
| The fact row's `last`; hello deadline; prepended `Feed.live()` | Nothing read it; `idleTime`; the first value registers |
| `RETRY_WAIT` in chat | The default. Escalation stays a recipe |
| `pushes`, ST RV3's dotted `fills: "room.messages"`, `Feed.finished`, a Flow `merge`, per-repair progress for newest-first pages, a duplex fake | Not taken. req V8: a terminator becomes a typed error outside `while` |
| Outbound live state, one shared session per Runtime, a `reconnect` member, `fromRpc` streams | Out of scope, open-items 16–19 |

## 3. Example

### 3.1 Two-factor sign-in, in full

The apps are those of [reference/example-apps.md](reference/example-apps.md). The flow is `PASSWORD → TWO_FACTOR →
SIGNED_IN`. In the two-factor step:

- a 6-digit code;
- three wrong codes lock **that challenge** for 5 minutes;
- resend is refused for 30 seconds after each resend, across Back and return;
- strikes and lockouts are kept **per challenge**, across Back and return;
- a wrong code that settles after Back still strikes its own challenge, and a late third strike
  locks at once if the user is entering that challenge's code;
- only one guess is in flight per challenge: the next Submit is refused until the verify's ending has been handled
  (`O.verify.idle`, rule 21);
- a verify that takes longer than 15 seconds shows "couldn't check" at once, but the call keeps running and the next
  guess waits for its real ending (a soft timeout, 2.7.6);
- a challenge gets its lockout copy at its first strike; the copy is removed once it unlocks, and
  all are removed on sign-in; a late strike after sign-in is ignored, so nothing re-adds one;
- a late **success** after a timeout is ignored too: the user has already been told "couldn't
  check" and enters a new code, which may meet an already-consumed code (acceptable here);
- the resend cooldown belongs to the step, not to a challenge: a new challenge inherits it, as the
  spec says. Add `resetOn: ({ memory }) => memory.challengeId` for per-challenge cooldowns.

```ts
// fragments.ts
import { deny, Flow, trait, type Denial } from "flow-state";
import { Duration, Schema } from "effect";

// A value with an optional validator. Input is never refused: `validate` only computes `error`, the
// validator's denial or null; `touched` says whether to show it yet. A validator answers like a
// guard, `true | deny(code, context?)`, so a host guard can return the stored reason as it is. How it
// checks is the author's choice: a regex, `Schema.is(SomeCheckedSchema)`, or a library call.
export const Field = <V, I>(value: Schema.Codec<V, I>, p: { validate?: (v: V) => true | Denial } = {}) => {
  const errorOf = (v: V) => {
    const verdict = p.validate?.(v) ?? true;
    return verdict === true ? null : verdict;
  };
  return trait(
    {
      id: "Field",
      events: { Changed: { value } },
      hostEvents: { Reset: {} },
      guards: { canEdit: Flow.optional(Flow.Guard) },
      callbacks: { onChanged: Flow.optional(Flow.Callback({ value })) },
      memory: {
        value: Flow.input(value),                                       // the host supplies the start
        start: Flow.private(Flow.initial(value, ({ value }) => value)), // kept for Reset; hidden
        error: Flow.initial(Schema.NullOr(Flow.Denial), ({ value }) => errorOf(value)),
        touched: Flow.initial(Schema.Boolean, false),
      },
    },
    ({ guards, callbacks }) => ({
      on: {
        Changed: {
          target: "self",
          guard: guards.canEdit,
          updateMemory: ({ event }) => ({ value: event.value, error: errorOf(event.value), touched: true }),
          notify: [callbacks.onChanged.from(({ event }) => ({ value: event.value }))],
        },
        Reset: {
          target: "self",
          updateMemory: ({ memory }) => ({ value: memory.start, error: errorOf(memory.start), touched: false }),
        },
      },
    }),
  );
};

// Runs once per Start; Start never refuses, and raising it re-arms the timer. Start has no
// handler of its own: the schedule's `armOn` handles it (2.5 step 2).
// No memory: "running" is the armed schedule, s.schedules.<name>.done !== undefined.
export const Countdown = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Countdown",
      hostEvents: { Start: {} },
      internalEvents: { Done: {} },
      callbacks: { onDone: Flow.optional(Flow.Callback({})) },
    },
    ({ E, callbacks }) => ({
      schedules: { done: { schedule: p.length, send: E.Done, armOn: [E.Start] } },
      on: {
        Done: { target: "self", notify: [callbacks.onDone] },
      },
    }),
  );

// Counts strikes. The `limit`-th strike locks for `length`, then the count clears.
// Summary: Strike is total and may notify onLocked; the timer's Done notifies onUnlocked.
export const Lockout = (p: { limit: number; length: Duration.Input }) =>
  trait(
    {
      id: "Lockout",
      hostEvents: { Strike: {} },
      callbacks: {
        onLocked: Flow.optional(Flow.Callback({})),
        onUnlocked: Flow.optional(Flow.Callback({})),
      },
      memory: { strikes: Flow.initial(Schema.Int, 0) },   // readable: the UI can say "2 tries left"
      traits: { timer: Countdown({ length: p.length }) }, // nested (rule 10)
    },
    ({ E, callbacks }) => ({
      traits: {
        timer: { callbacks: { onDone: { target: "self", updateMemory: () => ({ strikes: 0 }), notify: [callbacks.onUnlocked] } } },
      },
      on: {
        Strike: [
          {
            target: "self",
            guard: ({ memory }) => memory.strikes + 1 === p.limit || deny("NotTheLimit"),
            updateMemory: () => ({ strikes: p.limit }),
            raise: [E.timer.Start],
            notify: [callbacks.onLocked],
          },
          // Below the limit counts; at the limit (already locked) changes nothing.
          { target: "self", updateMemory: ({ memory }) => ({ strikes: Math.min(memory.strikes + 1, p.limit) }) },
        ],
      },
    }),
  );
```

```ts
// signin.definition.ts
import { definition, deny, Flow } from "flow-state"
import { Schema } from "effect"
// verifyCode: key challengeId, concurrency "reject"; resendCode: concurrency "reject", no key. The commits classify
// WrongCode, Expired and Throttled as failures, with Outcome, where they read the response.
import { Auth } from "./auth.contracts"                                         // file
import { Countdown, Field, Lockout } from "./fragments"

export const LIMIT = 3

const sixDigits = (v: string) => /^\d{6}$/.test(v) || deny("CodeFormat", { length: 6 })

export const SignIn = definition({
  id: "Auth/SignIn",
  states: [
    "PASSWORD",
    {
      TWO_FACTOR: Flow.state(["ENTERING", "VERIFYING", "LOCKED_OUT"], {
        traits: {
          code: Field(Schema.String, { validate: sixDigits }),
          resendCooldown: Countdown({ length: "30 seconds" }).resumable(),
        },
      }),
    },
    "SIGNED_IN",
  ],
  events: {
    PasswordAccepted: { challengeId: Schema.String },
    Submit: {},
    Resend: {},
    BackToPassword: {},
  },
  internalEvents: {
    CodeAccepted: {},
    CodeWrong: { challengeId: Schema.String },
    CodeExpired: {},
    CodeUnchecked: Flow.uncertain({}),
    ResendSent: {},
    ResendRefused: {},
    ResendUnsure: Flow.uncertain({}),
    StopWaiting: {},
  },
  memory: {
    challengeId: Flow.initial(Schema.String, ""),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
    struck: Flow.private(Flow.initial(Schema.Array(Schema.String), [])),
  },
  traits: {
    challenges: Lockout({ limit: LIMIT, length: "5 minutes" }).each({ of: "struck", max: 20 }),
  },
  operations: ({ E }) => ({
    verify: Auth.verifyCode.outcomes({                                          // user-defined: verify; one lane per challenge (the contract's key)
      success: E.CodeAccepted,
      failure: {
        WrongCode: E.CodeWrong.from((_, { key }) => ({ challengeId: key.challengeId })),   // key: the lane's challenge
        Expired: E.CodeExpired,
        NotSent: E.CodeUnchecked,
      },
      unknown: E.CodeUnchecked,
    }),
    resend: Auth.resendCode.outcomes({
      success: E.ResendSent,
      failure: { Throttled: E.ResendRefused, NotSent: E.ResendRefused },
      unknown: E.ResendUnsure,
    }),
  }),
})
```

```ts
// signin.machine.ts
import { deny, machine } from "flow-state"
import { LIMIT, SignIn } from "./signin.definition"

type Memory = typeof SignIn.Memory.Type
const strikesOf = (memory: Memory, key: string) => memory.challenges.find((c) => c.key === key)?.strikes ?? 0

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {                  
  const strike = E.challenges.Strike.from(({ event }) => ({ key: event.challengeId }))
  const isCurrent = ({ key, memory }) => key === memory.challengeId || deny("OtherChallenge")
  const union = (ids: ReadonlyArray<string>, id: string) => (ids.includes(id) ? ids : [...ids, id])
  const forget = ({ memory, key }) => ({ struck: memory.struck.filter((id) => id !== key) })
  const toEntering = (error: string) => ({ target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error }) })
  const thisChallenge = ({ memory }) => ({ challengeId: memory.challengeId })   // user-defined: a key selector (was the lane-key const)

  return {
    default: S.PASSWORD,

    traits: {
      challenges: {
        callbacks: {
          onLocked: [
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: [S.TWO_FACTOR.ENTERING, isCurrent],
              updateMemory: () => ({ error: null }),
              raise: [E.code.Reset],
            },
            { target: "self" },
          ],
          onUnlocked: [
            { target: S.TWO_FACTOR.ENTERING, guard: [S.TWO_FACTOR.LOCKED_OUT, isCurrent], updateMemory: (g) => ({ ...forget(g), error: null }) },
            { target: "self", updateMemory: forget },
          ],
        },
      },
    },

    on: {
      CodeWrong: [
        {
          target: "self",
          guard: ({ state }) => !S.SIGNED_IN.is(state) || deny("SignedIn"),
          updateMemory: ({ memory, event }) => ({ struck: union(memory.struck, event.challengeId) }),
          raise: [strike],
        },
        { target: "self" },
      ],
      CodeAccepted: { target: "self" },   // deliberate for an adopted verify too (OD22 rule 20): the user signs in again
      CodeExpired: { target: "self" },
      CodeUnchecked: [
        { target: "self", guard: [O.verify.retryable({ times: 2 })], actions: [O.verify.retry] },   // R5 M6: re-send the same id first; the server answers what it did with the code
        { target: "self", actions: [O.verify.cancel] },                        // then release (OD6, R4 H1); key-less: verify alone maps CodeUnchecked (OD8)
      ],
      ResendSent: { target: "self" }, ResendRefused: { target: "self" }, ResendUnsure: { target: "self", actions: [O.resend.cancel] },   // resending is safe to repeat: release, else every Resend ends Rejected
    },

    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: [
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: ({ event, memory }) => strikesOf(memory, event.challengeId) >= LIMIT || deny("NotLocked"),
              updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null }),
            },
            {
              target: S.TWO_FACTOR,
              updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null }),
            },
          ],
        },
      },

      TWO_FACTOR: {
        default: S.TWO_FACTOR.ENTERING,
        traits: {
          code: {
            input: () => ({ value: "" }),
            guards: { canEdit: ({ state }) => !S.TWO_FACTOR.LOCKED_OUT.is(state) || deny("LockedOut") },
          },
          resendCooldown: {},
        },
        on: {
          BackToPassword: S.PASSWORD,
          Resend: {
            target: "self",
            guard: [
              ({ state }) => !S.TWO_FACTOR.VERIFYING.is(state) || deny("Checking"),
              ({ schedules }) => schedules.resendCooldown.done === undefined || deny("CoolingDown"),
            ],
            actions: [O.resend.commit(({ memory }) => ({ challengeId: memory.challengeId }))],   // existing: commit (OPS O3)
            raise: [E.resendCooldown.Start],
          },
          ResendSent: { target: "self" },
          ResendUnsure: { target: "self", actions: [O.resend.cancel] },
          ResendRefused: { target: "self", updateMemory: () => ({ error: "Too many requests, try again later" }) },
        },
        states: {
          ENTERING: {
            on: {
              Submit: {
                target: S.TWO_FACTOR.VERIFYING,
                guard: [
                  ({ memory }) => memory.code.error ?? true,
                  ({ memory }) => strikesOf(memory, memory.challengeId) < LIMIT || deny("NoTriesLeft"),
                  O.verify.idle(thisChallenge),                                  // existing: idle(key); InFlight per challenge
                ],
                updateMemory: () => ({ error: null }),
                actions: [O.verify.commit(({ memory }) => ({ challengeId: memory.challengeId, code: memory.code.value }))],   // the key comes from the input
              },
            },
          },
          VERIFYING: {
            schedules: { gaveUp: { schedule: "15 seconds", send: E.StopWaiting } },
            on: {
              StopWaiting: toEntering("Couldn't check the code, try again"),
              CodeAccepted: {
                target: S.SIGNED_IN,
                updateMemory: () => ({ struck: [] }),
              },
              CodeWrong: [
                {
                  target: S.TWO_FACTOR.LOCKED_OUT,
                  guard: ({ event, memory }) => strikesOf(memory, event.challengeId) + 1 >= LIMIT || deny("TriesLeft"),
                  updateMemory: ({ event, memory }) => ({ error: null, struck: union(memory.struck, event.challengeId) }),
                  raise: [E.code.Reset, strike],
                },
                {
                  target: S.TWO_FACTOR.ENTERING,
                  updateMemory: ({ event, memory }) => ({
                    error: `Wrong code, ${LIMIT - strikesOf(memory, event.challengeId) - 1} tries left`,
                    struck: union(memory.struck, event.challengeId),
                  }),
                  raise: [E.code.Reset, strike],
                },
              ],
              CodeExpired: toEntering("Code expired, send a new one"),
              CodeUnchecked: [
                { target: "self", guard: [O.verify.retryable({ times: 2 })], actions: [O.verify.retry] },   // Held → InFlight, same id (2.7.13); a consumed code answers "accepted", not WrongCode (R5 M6)
                { ...toEntering("Couldn't check the code, try again"), actions: [O.verify.cancel] },   // Held → Idle: released, so Submit's idle passes
              ],
            },
          },
          LOCKED_OUT: {},
        },
      },

      SIGNED_IN: {},
    },
  }
})
```


**The third strike.** `CodeWrong` targets LOCKED_OUT itself. Its `Strike` locks the instance and
notifies `onLocked`. The token element `S.TWO_FACTOR.ENTERING` excludes `onLocked`'s first
alternative, because the pre-turn state is VERIFYING, so only one part changes state. `flow check`
sees this from the token elements alone (rule 12).

**A late third strike.** It arrives as a late `CodeWrong`: VERIFYING was left, so the event routes from TWO_FACTOR
(or the root, if TWO_FACTOR was left too) and reaches the root handler (rule 14).

- If the user is entering that challenge's code, `onLocked` moves them from an idle ENTERING to
  LOCKED_OUT. ENTERING owns no call, so rule 15 allows the move.
- If they are elsewhere, the lock simply runs. The next `PasswordAccepted` for that challenge finds
  three strikes and goes straight to LOCKED_OUT.

Without the root `CodeWrong` handler, `flow check` fails, naming the event and VERIFYING (rule 20): Flow cannot know
that this late failure is a strike, and dropping it would let a guesser submit, press Back and guess again.

**Copies and incarnations.** A challenge gets its `Lockout` copy at its first strike, so going Back
and entering the password again never fills the list. Strikes for a challenge the user has left stay
in its copy until it unlocks. A late strike for an unlocked challenge re-adds its key and strikes it
in one turn: the strike reaches the new copy (rule 9).

```tsx
// TwoFactorStep.tsx
import { check, type Actor } from "flow-state";
import { useNow, useView } from "flow-state/react";
import { SignIn } from "./signin.definition";
import type { SignInMachine } from "./signin.machine";

const { S, E } = SignIn;
const secondsLeft = (dueAt: number | undefined, now: number) =>
  dueAt === undefined ? 0 : Math.max(0, Math.ceil((dueAt - now) / 1000));

export function TwoFactorStep({ signIn }: { signIn: Actor<typeof SignInMachine> }) {
  const now = useNow("1 second");
  const code = useView(signIn, (s) => (S.TWO_FACTOR.is(s) ? s.memory.code : null));
  const error = useView(signIn, (s) => s.memory.error);
  const resendDue = useView(signIn, (s) => s.schedules.resendCooldown?.done?.dueAt);
  const lockoutDue = useView(signIn, (s) =>
    S.TWO_FACTOR.LOCKED_OUT.is(s) ? s.schedules.challenges.find((c) => c.key === s.memory.challengeId)?.timer.done?.dueAt : undefined,
  );
  const canType = useView(signIn, (s) => check(s, E.code.Changed({ value: "" }))._tag === "Allowed");
  const canSubmit = useView(signIn, (s) => check(s, E.Submit())._tag === "Allowed");
  const canResend = useView(signIn, (s) => check(s, E.Resend())._tag === "Allowed");
  const resendIn = secondsLeft(resendDue, now);

  return (
    <form onSubmit={(e) => (e.preventDefault(), signIn.send(E.Submit()))}>
      <input
        inputMode="numeric"
        maxLength={6}
        value={code?.value ?? ""}
        disabled={!canType}
        onChange={(e) => signIn.send(E.code.Changed({ value: e.target.value }))}
      />
      {code?.touched && code.error?.code === "CodeFormat" && <p className="hint">Enter the 6-digit code</p>}
      {error && <p role="alert">{error}</p>}
      {lockoutDue !== undefined && (
        <p role="status">Too many wrong codes. Try again in {secondsLeft(lockoutDue, now)} s.</p>
      )}
      <button type="submit" disabled={!canSubmit}>Submit</button>
      <button type="button" disabled={!canResend} onClick={() => signIn.send(E.Resend())}>
        {resendIn > 0 ? `Resend code (${resendIn} s)` : "Resend code"}
      </button>
      <button type="button" onClick={() => signIn.send(E.BackToPassword())}>Back to password</button>
    </form>
  );
}
```

```ts
// lockout.story.ts: a fragment alone (rule 11); every step settles (rule 61)
const L = Lockout({ limit: 2, length: "1 minute" });
export const locksThenClears = Story.fragment(L, { id: "lockout/locks-then-clears" })
  .enter()
  .send(L.E.Strike(), L.E.Strike())
  .checkpoint("locked")
  .advance("1 minute")                                               // the lock's timer fires and its turn runs
  .checkpoint("cleared");

test("locks, then clears", async () => {
  const { locked, cleared } = (await locksThenClears.run()).checkpoints;
  expect(locked.memory).toMatchObject({ strikes: 2 });
  expect(locked.records("callback")).toMatchObject([{ name: "onLocked" }]);
  expect(locked.schedules.timer.done.dueAt).toBe(locked.now + 60_000);
  expect(cleared.memory).toMatchObject({ strikes: 0 });
  expect(cleared.records("callback", { since: "locked" })).toMatchObject([{ name: "onUnlocked" }]);
});
```

### 3.2 A subroutine with exits, history, drafts and a visible retry

The signup wizard's discard dialog is `Confirm`, a subroutine without states. Keep returns to
whichever page Cancel came from, **with its fields**:

- history restores the page;
- the fields live at the root, the highest node whose lifetime matches the drafts (the whole
  signup), so leaving the wizard for the dialog does not touch them. No `.resumable()` is needed.

Submitting tries `Busy` again three times, after 1 s, 2 s and 4 s or the server's `Retry-After`, each time as a new
write; after an unknown it asks again about the same write, only when the user presses Check again.

```ts
// imports: Flow, subroutine from "flow-state"; Duration, Schema from "effect"
export const Confirm = subroutine(
  {
    id: "Confirm",
    events: { Yes: {}, No: {} },
    exits: { Confirmed: Flow.Exit({}), Declined: Flow.Exit({}) },
  },
  ({ exits }) => ({ on: { Yes: exits.Confirmed, No: exits.Declined } }),
);

// signup.definition.ts (excerpt)
states: [
  { WIZARD: ["ACCOUNT", "PROFILE", "INVITE", "REVIEW"] },
  { CANCELLING: Confirm },
  "SUBMITTING", "WAITING", "UNSURE", "DONE", "CANCELLED",
],
events: { Cancel: {}, Submit: {}, CheckAgain: {}, /* page events */ },
internalEvents: {
  Created: {}, EmailTaken: {}, Busy: { retryAfterMs: Schema.optional(Schema.Number) }, TryAgain: {},
  Unsure: Flow.uncertain({}), RetryNow: {},
},
memory: {
  error: Flow.initial(Schema.NullOr(Schema.String), null),
  busyTries: Flow.initial(Schema.Int, 0),   // Busy is tried again as new writes, so its budget is memory (rule 19)
  retryInMs: Flow.initial(Schema.Int, 0),
},
traits: {
  // The root: drafts live for the whole signup, across pages and the discard dialog.
  email: Field(Schema.String, { validate: isEmail }), // isEmail = (v) => v.includes("@") || deny("NotAnEmail"), and so on
  password: Field(Schema.String, { validate: longEnough }),
  name: Field(Schema.String, { validate: required }),
  role: Field(Role, { validate: chosen }),
},
// Accounts.create: key: [] (one lane per actor), concurrency "reject"; its commit classifies 409 as EmailTaken and
// 429 as Busy, both failures.
operations: ({ E }) => ({
  create: Accounts.create.outcomes({
    success: E.Created,
    failure: {
      EmailTaken: E.EmailTaken,
      Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })),   // information only: the machine decides to wait
      NotSent: E.TryAgain,                                            // `reject` (rule 20)
    },
    unknown: E.Unsure,                                                // StillUnknown too (rule 18)
  }),
}),

// signup.machine.ts (excerpt)
on: {
  // A new incarnation can adopt create's lane in any leaf, so its endings are handled at the root too (rule 44).
  Created: S.DONE,
  Unsure: S.UNSURE,
  Busy: { target: S.WIZARD.REVIEW, updateMemory: () => ({ error: "Try again later" }) },
  EmailTaken: { target: S.WIZARD.ACCOUNT, updateMemory: () => ({ error: "That email is registered" }) },
  TryAgain: { target: S.WIZARD.REVIEW, updateMemory: () => ({ error: "Not sent. Try again" }) },
},

WIZARD: { default: S.WIZARD.ACCOUNT, on: { Cancel: S.CANCELLING }, states: { /* pages; REVIEW's Submit: { target: S.SUBMITTING, guard: [O.create.idle], updateMemory: () => ({ busyTries: 0 }), actions: [O.create.commit(reviewedFields)] } */ } },
CANCELLING: { exits: { Confirmed: S.CANCELLED, Declined: S.WIZARD.history } },
SUBMITTING: {
  // Owns create. Cancel is Unhandled here and nothing else leaves SUBMITTING, so no ending can be late.
  // Every ending is handled unguarded (rule 20).
  on: {
    Created: S.DONE,
    Busy: [
      {
        target: S.WAITING,
        guard: ({ memory }) => memory.busyTries < 3 || deny("GaveUp"),
        updateMemory: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs ?? 1000 * 2 ** memory.busyTries }),
      },
      { target: S.WIZARD.REVIEW, updateMemory: () => ({ error: "Try again later" }) },
    ],
    EmailTaken: { target: S.WIZARD.ACCOUNT, updateMemory: () => ({ error: "That email is registered" }) },
    TryAgain: { target: S.WIZARD.REVIEW, updateMemory: () => ({ error: "Not sent. Try again" }) },
    Unsure: S.UNSURE,
  },
},
WAITING: {
  // Entry arms the wait, with the retryInMs the Busy turn wrote (after memory, rule 23). Busy proved
  // nothing happened, so trying again is a new write with a new id (rule 19).
  schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },
  on: { RetryNow: [{ target: S.SUBMITTING, guard: [O.create.idle], actions: [O.create.commit(reviewedFields)] }, { target: "self" }] },
},
UNSURE: {
  // The account may exist: send the same write again, so the server dedups by its id (rule 19). No idle guard:
  // the lane is Held here, and idle would deny the re-send (rule 21).
  on: {
    CheckAgain: [
      { target: S.SUBMITTING, guard: [O.create.retryable({ times: 3 })], actions: [O.create.retry] },
      { target: S.WIZARD.REVIEW, updateMemory: () => ({ error: "We couldn't confirm your account. Check your email before trying again" }), actions: [O.create.cancel] },   // give up: release the hold
    ],
  },
},
```

```tsx
// SignupWizard.tsx (excerpt): the dialog over the page Cancel came from
const page = useView(signup, (s) => S.WIZARD.child(s) ?? S.WIZARD.history.child(s));
const asking = useView(signup, (s) => S.CANCELLING.is(s));
// render <Page name={page} inert={asking} /> and, while asking, the dialog sending E.CANCELLING.Yes()
```

```ts
// confirm.story.ts: a subroutine alone (rule 11)
export const confirmYes = Story.fragment(Confirm, { id: "confirm/yes" })
  .enter()
  .send(Confirm.E.Yes())
  .checkpoint("answered");

test("a subroutine's exit, alone", async () => {
  const { answered } = (await confirmYes.run()).checkpoints;
  expect(answered.records("exit")).toMatchObject([{ instance: [], name: "Confirmed", payload: {} }]);
});
// .leave() instead abandons it: no exit record, and read() is undefined
```

Had the fields been placed on each page, they would come back empty after Keep, and `flow check`
would warn, because a history target re-activates nodes with non-resumable traits under them (rule 1).
Placing them at the root avoids that without `.resumable()`. Nothing outside the
subroutine can take `Confirmed`. Each try after `Busy` is a new Attempt, built from the reviewed fields by the select
(rule 22); `O.create.retry` from UNSURE re-sends the held Attempt with its own input (rule 21); `idle` would deny it
there, so UNSURE has none, and its last branch releases the hold (rule 45).

### 3.3 A list of Field instances

The invite page holds up to five email fields. An empty entry is valid and is dropped on Next. Rows
can be added and removed only on the Invite page: the events are handled only there.

```ts
// signup.definition.ts (excerpt)
events: { AddInvite: {}, RemoveInvite: { key: Schema.String }, /* … */ },
memory: {
  inviteIds: Flow.initial(Schema.Array(Schema.String), ["invite-1"]),
  nextInvite: Flow.private(Flow.initial(Schema.Int, 2)),             // deterministic keys
},
traits: {
  invites: Field(Schema.String, { validate: optionalEmail }).each({ of: "inviteIds", max: 5 }), // "" or contains "@"
},

// signup.machine.ts (excerpt)
traits: { invites: { input: () => ({ value: "" }) } },
INVITE: {
  on: {
    AddInvite: {
      target: "self",
      guard: ({ memory }) => memory.inviteIds.length < 5 || deny("FiveAtMost"),
      updateMemory: ({ memory }) => ({
        inviteIds: [...memory.inviteIds, `invite-${memory.nextInvite}`],
        nextInvite: memory.nextInvite + 1,
      }),
    },
    RemoveInvite: {
      target: "self",
      updateMemory: ({ memory, event }) => ({ inviteIds: memory.inviteIds.filter((k) => k !== event.key) }),
    },
    Next: {
      target: S.WIZARD.REVIEW,
      guard: ({ memory }) => memory.invites.find((f) => f.error !== null)?.error ?? true, // the row's own reason
      updateMemory: ({ memory }) => ({ inviteIds: memory.invites.filter((f) => f.value !== "").map((f) => f.key) }),
    },
    Back: S.WIZARD.PROFILE,
  },
},
```

```tsx
// InvitePage.tsx (excerpt)
{invites.map((f) => (
  <div key={f.key}>
    <input value={f.value} onChange={(e) => signup.send(E.invites.key(f.key).Changed({ value: e.target.value }))} />
    <button onClick={() => signup.send(E.RemoveInvite({ key: f.key }))}>Remove</button>
  </div>
))}
<button disabled={!canAdd} onClick={() => signup.send(E.AddInvite())}>Add</button>

// signup.story.ts (excerpt): keys come from the host's own counter
.send(E.AddInvite()).send(E.invites.key("invite-2").Changed({ value: "grace@example.com" }))
```

A keystroke sent for a row removed a moment earlier is `Unhandled`. A late delivery for a removed
row is dropped with evidence, even if the key was added again (rule 9).

### 3.4 Resetting with `resetOn`, and the pin commit

On the issue list:

- The page goes back to 1 when the search, sort or status changes.
- The checked rows (the `checked` trait, a `Selection`) clear whenever any of them changes, the
  page included.

Both resets read the before-walk memory. So the applied search is set by a host transition, the
source of its turn, rather than by a callback.

```ts
// issuelist.machine.ts (excerpt)
const listQuery = ({ memory }: { memory: Memory }) => ({
  search: memory.appliedSearch,
  sort: memory.sort,
  status: memory.status,
  page: memory.pager.page,
});

// issuelist.definition.ts (excerpt). Issues.setPinned: a plain operation (this list registers no domain; with 2.8's
// domain, the pin would be `.predicts`, and `optimistic` a type error, rule 26), key: ["id"], concurrency "reject".
operations: ({ E }) => ({
  pin: Issues.setPinned.outcomes(
    { success: E.Pinned, failure: E.PinFailed, unknown: E.PinUnsure },   // one event for every failure, NotSent included
    { writes: ({ value }) => [Issues.list.invalidate({})] },             // the operation's option: cache verbs on the contract (OD26)
  ),
  issues: Issues.list,      // bare: placed in the machine, its data read from the row
}),


// A host debounce: 300 ms after the last keystroke, SearchSettled is the source of its own turn.
schedules: { settle: { schedule: "300 millis", send: E.SearchSettled, restartOn: ({ memory }) => memory.search.value } },
traits: {
  pager: {
    resetOn: ({ memory }) => [memory.appliedSearch, memory.sort, memory.status],
    guards: {
      hasNext: ({ memory, operations }) =>
        memory.pager.page * 20 < (operations.issues?.data?.total ?? 0) || deny("LastPage"),
    },
  },
  checked: { resetOn: listQuery }, // declared after pager, so it sees pager's reset (rule 1)
},
on: {
  SearchSettled: { target: "self", updateMemory: ({ memory }) => ({ appliedSearch: memory.search.value }) },
  SortChanged: { target: "self", updateMemory: ({ event }) => ({ sort: event.sort }) },
  // `optimistic` is the commit's only option (OD26). It reads the after memory (rule 22). Success confirms the look;
  // failure removes it; unknown keeps it, marked uncertain, and refetches the displayed entries once (2.7.1).
  Pin: {
    target: "self",
    guard: [O.pin.idle(({ event }) => event)],   // InFlight or Uncertain per row
    actions: [O.pin.commit(({ event }) => ({ id: event.id, pinned: event.pinned }), { optimistic: [Issues.list.setData(({ memory, event }) => ({ key: listQuery({ memory }), data: pinRow(event) }))] })],
  },
  Pinned: { target: "self" }, PinFailed: { target: "self" },   // the cache shows each ending
  PinUnsure: { target: "self", actions: [O.pin.cancel] },   // key-less: pin alone maps it; release, the look stays marked uncertain
  // Select all on this page: the ids come from the pre-turn snapshot, never from the click.
  SelectPage: {
    target: "self",
    raise: [E.checked.SelectAll.from(({ operations }) => ({
      ids: operations.issues?.data?.items.map((i) => i.id) ?? [],
    }))],
  },
},
```

The pin starts on a root `"self"` transition, so the root owns it and its endings are never late. They route from
the active leaf and fall through to the root handlers, even while the actor is inside the `HOLDING` subroutine
(rules 6, 14).

### 3.5 Leaving: a draft survives abandonment

An address step can be abandoned by a root `SignOut`. The step hands its draft back as it goes.

```ts
export const AddressStep = subroutine(
  {
    id: "AddressStep",
    events: { Changed: { address: Address }, Confirm: {} },
    callbacks: { onDraft: Flow.optional(Flow.Callback({ address: Address })) },
    exits: { Done: Flow.Exit({ address: Address }) },
    memory: { address: Flow.input(Address) },
  },
  ({ exits, callbacks }) => ({
    on: {
      Changed: { target: "self", updateMemory: ({ event }) => ({ address: event.address }) },
      Confirm: exits.Done.from(({ memory }) => ({ address: memory.address })),
    },
    whenAbandoned: [callbacks.onDraft.from(({ memory }) => ({ address: memory.address }))], // not on Done
  }),
);

// host machine (excerpt): the draft seeds the next entry
ADDRESS: {
  input: ({ memory }) => ({ address: memory.addressDraft }),
  callbacks: { onDraft: { updateMemory: ({ payload }) => ({ addressDraft: payload.address }) } },
  exits: { Done: { target: S.PAYMENT, updateMemory: ({ payload }) => ({ address: payload.address, addressDraft: null }) } },
},
```

`SignOut` must not write `addressDraft` itself, because `whenAbandoned`'s filling writes it in the same
turn (rule 6).

### 3.6 Keywords

| Kind | Words |
|---|---|
| **New, fragments** | `trait`, `subroutine`, `traits` (root and node), `Flow.state`, `.resumable()`, `.each` (`of`, `max`, `by`), `key` / `item` in fillings and copy views, `.key(k)`, `hostEvents`, `guards`, `callbacks`, `exits` (declarations and fillings), `notify`, the `Flow` module (`Flow.Guard`, `Flow.Callback`, `Flow.Exit`, `Flow.optional`, `Flow.uncertain`, `Flow.annotate`, `Flow.input`, `Flow.initial`, `Flow.private`, `Flow.Denial`, `Flow.entry`), `raise`, `resetOn`, `whenAbandoned`, the definition's `handler` / `guard`, state tokens in guard arrays; (operations in fragments) `operations` in a trait or subroutine declaration, `O` in a fragment body, `Fragment.O.<write>.get` / `.idle` / `.retryable` outside it, `activities` in a trait body, `s.operations.<instance>.<name>`, a string `resetOn` on a writing trait, key-less `O.x.cancel` in `whenAbandoned` (existing words, new meanings; no new word) |
| **New, plans** | `Outcome.success`, `Outcome.failure`, `Outcome.unknown`; Flow's reasons `NotSent { why }` (`Cancelled`, `Restored`, `Rejected`, `Overloaded`, `StorageRefused`, `Disposed`), `Cancelled`, `Restored`, `Interrupted`, `Defect`, `StillUnknown { failure }`, `StorageRefused`; evidence `Superseded`, `Released`, `NothingToResend`, `InFlight`; (operations merge) contracts with `input`, `output` (omitted: `Schema.Void`) and a required `key: [...]` field list, in `*.contracts.ts`; `operations: ({ E }) => ({ … })` with `contract.outcomes({ … })` (`unknown` may be a record by tag); the handles `O.x` with `commit(select)`, `lookup(select)`, `subscribe(select)`, `subscribe.each(select)`, `retry(k?)`, `cancel(k?)`, `idle(k?)` (a partial key allowed), `retryable(k?, { times })`, `refetch`, `get(s, k?)`; the rows `s.operations.<name>` with `pending`, `uncertain`, `waiting`, `retryCount`, `progress`, `outstanding`; the mapper's `{ input, attempt, progress, key }`; the operation's options argument `.outcomes(mapping, { writes })` and the commit's `{ optimistic }` (OD26); `runtime.unsettledWrites()`; the findings `SharedContract`, `DuplicatePlacement`, `VerbMismatch`, `KeyRequired`, `UnresolvedHold`, `KeyOmitsInput`, `UnusedOperation`; the denials `Uncertain`, `RetryLimit`; `DehydrateCommitInFlight`; `attempt.id`, `attempt.retryCount`, `attempt.mayHaveApplied`; `concurrency: "latest"`; the record read `{ data, predicted, uncertain, unconfirmed }` (`predicted` replaces the record's and the resource lane's `pending`); (merge 5) the condition operators `or`, `not`, `gt`, `gte`, `lt`, `lte`, `isNull`, a predicted field's `(beneath, input) => value`, the Runtime option `checkReplays`, the warning `PredictionNotRetained`; the codes `InFlight` and `LateMayNotLeave`; `keys` on keyed schedules (key records); `orphaned`; `.history` (and `.history.child`); `armOn`; `disarmOn`; `s.schedules`; `dueAt` (`model()` and its options are removed: T1, C82) |
| **New, Stories** | (rules 61–66, 2.10; common) `Story.machine` (`id`, `fixtures`, `world`), `send`, `advance` (settles at every deadline; `{ next: address }`), `checkpoint`, `world`, `run`, `run.checkpoints`, `run.end`, the reads `read`, `lane`, `records` (`since`), `attempt` (`n`), `now` beside the existing `state`, `memory`, `operations`, `schedules`, `Fake.server` (`truth`, `initial`, `endpoints`, `controls`), `Fake.call` (`request`, `handle`, `response`), `Fake.control`, `Fake.Lost`, `hold`, `release`, `drop`, `at`, `times`; (uncommon) `Story.app`, `Story.fragment`, `together` (`{ advance }`), `duplicate`, `match` (`purpose`, `input`), `after`, `Fake.storage`, `Fake.stream` (`frame`, `open`, `ping`, `every`, `frames`, `refuse`, `end`), `send` on a result, `.frames`, `.close`, `.end`, `Fake.webSocket`, `Fake.fetch` (`endpoint`, `input`, `params`, `query`, `body`, `headers`), `Fake.Refused`, `Fake.Closed`, `dispose` (`how`), `reload`, `guards`, `inspection` (`work`, `incarnations`), `tabs`, `entity`, `run.frames` (`truncated`), `advance(…, { suspended })`, `checkpoint(…, { at })` (`settled`, `turn`, `step`), `openTab(…, { from })`, `enter(input, { subject })`, `leave({ end })`; (rare) `advance({ to })`, `reset` (a fragment alone), `release({ nth })`, `storage`, `seed`, `Fake.storage.seed`, `Fake.storage.from(story)`, `propertyTest(story, …)` (`steps`, `properties`, `whenQuiet`, `runs`, `length`, `quietWithin`), `domainPropertyOptions`, the types `Story.Frame`, `Story.Step`; the errors `StoryInvalidCommand`, `NoConnection`, `NoDeadline`, `HostTimeWait`, `AmbiguousRead`, `PropertyTestFailed` (with the reason `PropertyDefect`), `StoryFakeError`, `SubjectAbsent`, the diagnostic `UnusedWireRule`, and the `Fail` reason `FramesTruncated`; twenty-one record kinds that `records` takes (read, not written). Reused: `ensure`, `closeTab`, `setContext`, `dehydrate`, `hydrate`, `within`, `maxBytes`, `label`, `serverView`. The address is a shape, not a word |
| **New, streams** | (rules 67–72, 2.11; common) `reconnect` (`while`, `schedule`), `idleTime`, `position`, `from`, `Feed.callback` (`emit`, `emit.fail`, `emit.end`), `Feed.live`, `proof`, `Feed.ping`, `missed`, `fills`, the `Feed` key of `failure`, and on the row `drop`, `value`, `last`, `connection`'s literals; (uncommon) `Feed.down`, `catchUp`, `next`, `Feed.more`, `Feed.done`, `Feed.gone`, `head`, `through`, `pages`, `catchingUp`, `O.x.bookmark` (`at`), `Feed.Signal`; (rare) `restartAt`, `why`. 29 in all (2.11.14). Read-only: the reasons `Closed`, `Overflow`, `Silent`, `Flapping`. New, not counted (S11): `delivers`' values `"every" \| "latest"`. Existing: `progress(p)` in a commit's context (rule 39). Existing with a new meaning: `O.x.refetch(k?)` on a stream. New concepts, not words: the **bookmark**, **cleared** and **wiped**, a **connection** within a **session** |
| **New concepts, not words** | **incarnation** (one life of a fragment instance), **frozen** (a resumable trait while its node is inactive), **summary** (a contract's inferred per-alternative effects), the memory views **before**, **before-walk** and **after** (2.5, rule 22), pending reset, the three **channels** (2.7.1), a **write** (one Attempt) and a **send** (one invocation), a **contract** and an **operation** (rules 39, 40), the **write lane** with its states **`Idle`**, **`InFlight`**, **`Held`** and **`HeldThisTurn`** and its queued commits **`W`** (rule 21, 2.7.13), the **hold**, the lane's **addressable Attempt**, **after lanes**, the **binding incarnation**, an **unbound lane**, an **unplaced lane**, a **releasing lane**, the **subject path** (rules 51, 53, 60), **rebind**, **actor identity**, a **pending mapped outcome** (rule 44), a **keyed list** (rules 21, N1, N2), a call's **owner** and its **current** or **late** ending (rule 14), **late turn** (rule 15), the **Attempt's ending** (rule 18); the **record queue** (per record, across actors, rule 29), the **uncertain mark** (per record and Attempt, rule 32), **settlement** versus **admission** (rule 27), a **create draft** (`creating`, a convention, rule 33); (merge 5) yes / no / maybe, a **carried path**, the **record beneath**, an **uncomputed** prediction, a **prediction fault**, `many` |
| **Existing** | `definition`, `machine`, `states`, `default`, `events`, `internalEvents`, `input` (caller side only: `ensure`, `useActor`, a host's filling), `memory`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`, `restartOn`, `transaction`, `key`, `concurrency`, `commit`, `outcomes`, `optimistic`, `setData`, the Attempt, `deny`, `check`, `S`, `E`, `O`, `.from`, `payload` |
| **Removed** (operations merge) | commit values and their `{ outcomes }` option; `writes` as a commit option; `s.calls`; `s.activities` and the `activities` record; `keys` on activities; `read.fetch(key)`; the mapper's `superseded`, `laneKey` and copy `key`; `SharedCopyLane`; the default lane key of a domain write; key closures `key: (i) => …`; `result` and `params` on contracts; `*.operations.ts`; `NotSent { Superseded \| NothingToResend }` as endings |
| **Removed** (Stories, amended) | `Story.make` and `story.app`, `story.machine` (W1), `.expect`, `StoryExpectationFailed`, `AmbiguousAttempt` (SC1; P), `Story.property`, a Story's `properties` option (W25), `Story.records`, `Story.inspection`, `Story.entity`, `Story.attempt`, `Story.now` (W24), `process()` (W2), `advanceTo`, `advanceToNextTimer`, the `frames` option and frame collapse (W22), `run.calls`, `checkpoint.exit` (W34), the checkpoint predicate `.checkpoint(name, ({ truth }) => …)` (SC2, C16), `Story.ending` (never adopted), `model` and Testing O5 (W39), earlier streams proposals' `.do(…)` (W37), `accept`, tuple results, `Fake/Lost`, `{ to, send }` [fakes-v2], `latency`, `response` as an Effect, `headers` on `Fake.stream`, public `run.steps`, `message` on `Fake.stream`, `signal` on `run`, `Fake.storage.from`'s `{ at }`, `services?`, `shape` on a checkpoint read (P), Testing O4's `pending` for work |
| **Not adopted** (earlier streams proposals) | `Feed.reconnect` and its 70 cells; `fresh`, `registered`, `announced`, `initial` on `missed`, the handler guard, "`from` required with `position`"; `after` in `input`, `cursor` in memory, `restartAt` in `missed`'s payload; `seen`, `tail`, `meet`; `resetAfter`, `bufferSize`; `Feed.CannotRepair`, `continueAt`; `lost` as an option; `"accept"`; `errors`, `"never"`; `DuplicateStreamSession`; `delivers: "facts" \| "state"`; `persist` on streams (2.11.14 has the list) |
| **Author-chosen** | every other name (`Field`, `Lockout`, `challenges`, `LOCKED_OUT`, `canEdit`, `onLocked`, …) |

## 4. Against the problems in principles.md

| Problem | Answer |
|---|---|
| **L1** stale timers, **T2** schedule traps | Prevented. Schedules stop with their incarnation. Arming ids drop firings from before a re-arm (P11). `armOn` replaces counter idioms. The `restartOn` baseline is the activating turn's memory (P8). A schedule function reads the memory its own turn wrote (rule 23). |
| **L2** late results | Prevented. A call's ending is routed when its turn is admitted, by its owner: current from the active leaf, late from the owner's nearest surviving ancestor (rule 14). Raises and timers to `.each` copies follow the copy's incarnation (rule 9); call endings started in a copy are never dropped (rules 9, N3); an adopted ending is current from the active leaf (rule 14); a fragment's ending goes to the incarnation with its subject path (rule 53). |
| **L3** leftover memory | Prevented by placement and incarnations. `.resumable()` is an explicit opt-in to carry data back. |
| **L4** no way out | Prevented. The host may always leave a subroutine's state (rule 6). |
| **L5** abandoned effects | Prevented. A late ending is the same mapped event, handled at an ancestor, and every late event that can occur must be handled (rules 14, 20). A late handler may start a compensating call, which can finish (rule 15). |
| **L6** silent admission, **L8** phantom replies | Prevented. A call never sent ends `NotSent { why }`, and a declined start or retry is an ending too (rules 16, 17). Lanes are readable as snapshot data (`s.operations`, `O.x.get`, rules 21, N3); replaced never-sent work is evidence (rule 17). A raise or timer into a dead incarnation is dropped with evidence; a call ending never is (rule 9; Revision (multiplicity audit, 2026-10-31)). |
| **L7** departure gap | Allowed. Refusing a new submit while an earlier write is still unfinished is host code (`verify.idle(key)`, as the sign-in does). |
| **E1** broken invariants, **E4** refusal by forwarding | Prevented. Refusal happens only at declared guards, and deliveries cannot be refused (rule 8). A decline refuses only the write, never the transition (rule 16). |
| **E2** interfaces growing with depth | Prevented, for types and for checks. Hosts are checked against contract summaries only (rule 10), with rule 57's one stated exception (children's write operations). |
| **E3** hidden endings | Prevented. Only exits leave a subroutine. Callbacks never leave their node. |
| **E5** preempting observers | Prevented. A late turn cannot exit a state that owns another pending call, or an active subroutine (`LateMayNotLeave`, rule 15). Lateness is not transitive, so compensation can finish. |
| **H1** bypassed policy | Allowed, by design. Host-owned facts are `hostEvents`, and list membership is host memory (rule 9). |
| **H2** unforeseen checks | Allowed, by choice: declare the guard in the fragment. |
| **H3** faked results | Prevented. Exits are never sendable. `internalEvents` come only from the fragment's own schedules or its operations' endings, and a mapped event only from endings (rules 2, 47, 49). |
| **H4** mislabelled results | Prevented. The commit classifies each ending with `Outcome` where it reads the response (2.7.1); `unknown:` reaches only `Flow.uncertain` events (rule 13); a definite failure after an unknown send stays unknown (`StillUnknown`, rule 18). |
| **H5** interrupt treated as not sent | Prevented. An interruption after invocation is unknown (`Cancelled`, `Interrupted`); only one before invocation is `NotSent` (rule 24). Re-sending after an unknown is `.retry`, the same Attempt (rule 19). In host code, starting a new write from an `uncertain` handler is a convention. |
| **D1** drifting copies | Prevented. Fragment memory, resumable slices, schedule deadlines and lanes are readable, so nothing is copied; an entity record is never copied into memory (rule 26); the Attempt stays in the Runtime's lane, not in events or memory. |
| **D2** live values on retry | Prevented. `.retry` re-sends the lane's addressable Attempt with the input it was started with, only in `Held` (rule 21), and exists only where a lane has one (rule N2). |
| **D3** feedback loops | Not prevented, as for hosts: a fragment that owns a save coalesces as a host does (2.9.6's Autosave). |
| **D4** unmapped outcomes | Prevented. `failure:` is exhaustive by tag (rule 13), and every current and late event that can occur must be handled (rule 20). |
| **D5** restore in flight | Prevented. Write lanes are Runtime records of the identity, restored by the table's restore row, and an ending with no live incarnation is parked and routed by its owner (rules 14, 44, 46); a lane records its subject path, so the restored incarnation of the right thing adopts it (rules 51, 54). Attempts survive a version change through `orphaned`, at least once (P19). Saved-state compatibility Stories are left out (section 6). |
| **D6** same-turn seeding | Prevented. `input` and `resetOn` read the before-walk memory; selects and schedules read after (rule 22). A transition that reads a key it writes in both views is a warning. |
| **D7** drafts lost | Prevented where the fragment declares `whenAbandoned`, or the trait is placed high enough, or with `.resumable()`. Otherwise it is a convention. |
| **A1, A2** forwarding, scattered blocks | One filling block per instance. A view sends at the instance path, so nothing is forwarded. One `outcomes` mapping per operation, on its declarer, serves current, late and adopted endings. |
| **A3** conditional rules, **A4** overloaded words | Avoided. Each kind has its own rules, and every new word is listed. |
| **A5** I/O inside fragments | **Allowed, opt-in** (F1): a fragment that declares an operation is its only actor; its host reads and asks (rules 48–50), so I/O is never split for one operation. |
| **A6** silence discovered late | By the fragment author's choice. Required ports are type errors; optional guards are an info finding. Dead exits and unused host events are warnings (T2). A missing late handler is an error (rule 20). |
| **A7** forgotten first send | A host or a fragment starts an operation on its own transition; a fragment that commits on creation uses a 0 ms `Flow.entry` schedule guarded by `idle` (rule 54's default). |
| **T1** partial turns | Prevented by the turn algorithm (2.5): one selection, no fallthrough on a child's refusal. |

## 5. Plan amendments

Each row names the plan outcome, the rule, and the sentence it replaces or adds. Draft syntax is in
sections 2 and 3. Earlier drafts' rows P1–P4, P9, P10, P12–P14, P16 and P17 are replaced by the server-call rows
C1–C18 (their record is in [merged/](merged/)); P15 and P20 are rewritten in place.

### For fragments

| Plan | Rule | Replaces or adds |
|---|---|---|
| **Machines O1** | Definitions gain `traits` (the root's `traits`, and `Flow.state(children \| {} \| Sub, { traits })` on a node; `.resumable()`; `.each`) and fragment states. Fillings sit at the node where a fragment is placed. A fragment declares what a definition declares (`id`, `events`, `internalEvents`, `memory`, child `traits` / `states`) plus `hostEvents`, `guards`, `callbacks` and `exits` at the top level, its body's `whenAbandoned`, and an inferred summary. Machines gain one filling block per instance. Names share one namespace | Adds to "A definition requires id, states and events."; amended by C54 (operations in fragments) |
| **Machines O1** | An internal event may be marked `Flow.uncertain(fields)`; an event payload may be a `Schema.Struct` with checks, refused at admission when a check fails | Adds to "events and optional internalEvents are records…" |
| **Package O1** | The root route exports `Flow` (with `Flow.Guard`, `Flow.Callback`, `Flow.Exit`, `Flow.optional`, `Flow.uncertain`, `Flow.annotate`, `Flow.input`, `Flow.initial`, `Flow.private`, `Flow.Denial`, the `Flow.is*` predicates and the `Flow.Payload` / `Flow.Filling` types) and `Outcome` (`Outcome.success`, `Outcome.failure`, `Outcome.unknown`, 2.7.1), and `Condition` (the condition operators `eq`, `oneOf`, `contains`, `between`, `overlaps`, `gt`, `gte`, `lt`, `lte`, `isNull`, `and`, `or`, `not`, `serverMatches`, `asc`, `desc`; merge 5) | Adds to the flow-state route's name list |
| **Machines O1** | Memory fields carry `Flow.input` (supplied by the creator; the `Input` type is derived from them), `Flow.initial` (a constant or a pure computed start) and `Flow.private`. Every field starts from exactly one source. The top-level `input` and `initial` are removed | Replaces "Optional input and memory are Schema field records. Nonempty memory requires initial({ input })…" |
| **Machines O8**, **React O4** | Outside snapshot and view types omit `Flow.private` fields; Stories and Inspection still see them | Adds |
| **React O2** | The pure starting snapshot uses the memory built from `Flow.input`, `Flow.initial` and computed initials | Replaces "initial(input) memory" |
| **Machines O1** | *Superseded by C37 (operations merge).* | — |
| **Machines O1** | A definition's `handler(path, h)` / `guard(path?, g)` type shared code as if written at `path`; a commit's or lookup's select is typed at its transition | Adds |
| **Machines O2** | A subroutine state is entered at its default, or is a leaf. It is left by an exit, or abandoned by a transition that exits it; host events fall through to ancestors as usual. Exits are targets only fragments take | Adds to "target is required and is this machine's token or "self"" |
| **Machines O2** | `token.is` accepts a snapshot or a state path. A state token may be an element of a guard array, and passes when the pre-turn state is at or below it | Replaces "token.is(snapshot) includes descendants" with "token.is(snapshot or state)…" |
| **Machines O3** | **The turn algorithm of section 2.5 is normative**, for the runtime and `check()`. All-declining still falls through to ancestors (O2); a child's refusal inside a selected alternative never does | Replaces the prose from "An accepted transition computes updateMemory before action parameters" to "One invalid action rejects the whole turn" with the algorithm, keeping its defect rules (the memory views are C13) |
| **Machines O4** | Guards also receive `schedules` and `operations` (the rows of rules 21 and 42, read with `O.x.get(operations, k)`), and may use an operation's `idle` and `retryable` guards. `check()` runs steps 2–6 of the turn. `deny(code, context?)` returns plain data matching `Flow.Denial`, so it may be stored in memory, and a guard may return a stored denial | Replaces "A guard receives { event, state, memory, context, activities }" with the same list plus `schedules`; adds the last sentence |
| **Machines O8** | The snapshot exposes fragment slices (`undefined` while inactive, present while frozen), `.each` copies in key order, `schedules`, and `operations`, the rows of rules 21 and 42, replacing `calls` and `activities`; keyed schedules, keyed write lanes and `subscribe.each` placements are keyed lists (rule N1). A Runtime step publishes the bound lane rows it changes (2.5). Reading an old snapshot still never consults live lanes | Replaces "It has no input, methods, timers or public revision" with "…no input, methods or public revision; armed schedules appear under `schedules`" |
| **Persistence O2** | Resumable slices, frozen schedules and `.each` copies with their incarnation counters persist with the actor; (Revision (multiplicity audit, 2026-10-31)) so do keyed schedules' per-key timers, by key with `dueAt` (rule 23) | Adds to "Actor state, memory … survive reload"; amended by C60 (operations in fragments) |
| **Testing O1** | `story.machine` also accepts a fragment (`.enter`, `.leave`, `run.calls`, `checkpoint.exit`, host-event sends). `send` runs its turn; `process()` drains operation work and due timers. Copies' incarnations are deterministic | Adds to "story.machine(machine, { … }) tests one fresh actor"; amended by C63 (operations in fragments); replaced by C69 (Stories) |
| **Inspection O1** | Fragments, `.each` copies, incarnations, fused transitions and contract summaries appear under their instance names | Adds; amended by C64 (operations in fragments) and C78 (Stories) |
| **CommandLine O5** | Errors: rule 12's list. Warnings: overlaps only closures separate; history targets over non-resumable fragments or states that own a call; a mapper reading a key its own turn writes (from Story traces). Info: unfilled optional guards. The server-call findings are C18 | Adds; amended by C65 (operations in fragments) |

### For every machine: turns, history, timers

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| P5 | Machines O2, Persistence O2 | `S.X.history` targets X's last active child, or its default. `S.X.history.child(s)` reads it. It restores control only; data comes back only through placement or `.resumable()` | Adds |
| P6 | Machines O5, O8 | Armed schedules expose `dueAt` at the paths of 2.1 | See Machines O8 |
| P7 | Machines O5 | A schedule without `armOn` starts on entry. `armOn: [...]` starts it on each accepted listed event, raised ones included, restarting it if running; with `Flow.entry` in the list it also starts on entry, otherwise it is idle on entry. `disarmOn: [events]` stops it on each accepted listed event; stopping an idle schedule does nothing. Exit stops any schedule. An event in both lists, or `armOn` together with `restartOn`, is a construction error. Every temporal construct is delayed: it never counts the turn that arms it. An event listed in an active schedule's `armOn` or `disarmOn` is handled by it where the node has no written handler: an implicit unguarded `{ target: "self" }` | Replaces "Entry arms a schedule; exit cancels it" with "Entry arms a schedule without `armOn` (or with `Flow.entry`); `disarmOn` and exit cancel"; amended by C56 (operations in fragments) |
| P8 | Machines O5 | The `restartOn` baseline is the activating turn's after memory | Clarifies "restartOn … establishes a silent baseline" |
| P11 | Machines O5 | Each arming has an id; a firing from an earlier arming is never delivered | Extends "if its declaring activation ended before handling, it is discarded" |
| P21 | Runtime O4, Machines O7 | The mailbox is FIFO in admission order. User sends, call endings, timer firings and `onContext` events queue together. A call's ending is queued at settlement and mapped and routed when its turn is admitted (rule 14). Equal deadlines are separate turns | Adds the queue order to Runtime O4's input ordering |

### For every machine: server calls

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| C1 | Operations O1, O3 | Commits end in three channels: success, failure, unknown. The commit function classifies each ending with `Outcome.success`, `Outcome.failure`, `Outcome.unknown`; a plain error defaults to failure; a throw or die is unknown (`Defect`) and an actor issue. Flow interprets no status and no error type. An author error with a Flow reason's tag is a type error | Replaces the five outcomes (`success`, `failure`, `defect`, `interrupt`, `unknown`) and the descriptor's `failureKinds` |
| C2 | Operations O3, O7 | Flow's reasons: the failure `NotSent { why }` (`Cancelled`, `Restored`, `Rejected`, `Overloaded`, `StorageRefused`, `Disposed`) and the unknowns `Cancelled`, `Restored`, `Interrupted`, `Defect` (with the Cause), `StillUnknown { failure }` and `StorageRefused`. `Superseded`, `NothingToResend`, `InFlight` and `Released` are evidence, never endings (rule 17). `interrupt` and `defect` stop being outcome keys. Flow has no timeout reason | Replaces the `reject` and "ends it as interrupt" sentences |
| C3 | Operations O3 | The runtime classifies each send from the commit fiber's `Exit` and its whole `Cause`, outside that fiber, most cautious first (2.7.1). The ending delivered is the Attempt's: a definite failure after an unknown send of the same Attempt is `StillUnknown` (rule 18) | Adds |
| C4 | Operations O5, EntityDomains O1 | Success confirms the optimistic look and domain predictions; failure removes them without a refetch; unknown keeps them, marked uncertain, and refetches the displayed entries once. Flow never loops. `revertOnUnknown` does not exist. Domain predictions follow the Attempt's ending after rule 18, not the channel: a definite failure after an unknown send is unknown in the store (rule 30) | Replaces Operations O5's "unknown retains them and invalidates the entry" and EntityDomains O1's "failure or defect … repairs" |
| C5 | Operations O2 | Reads keep two channels, success and failure; a read's defect is an issue and arrives on `failure` as `Defect` (rule 37). A one-off read is an operation looked up with `O.x.lookup(select)` (rule 42; C32); its endings are routed like a write's (rule 14) | Replaces `defect` and `interrupt` for lookups |
| C6 | Operations O2, O3 | An operation maps each ending onto a definition event, on the definition (rule 13). Mappers receive `(value, { input, attempt, progress, key })` for a write, `(value, { input, key })` for a read; a `NotSent` mapper's `attempt` is optional. `failure` is exhaustive by tag; `NotSent` is optional in the type; `unknown` may be a record by tag (OD23 Q36). See C33 | Replaces "Mappers receive values only." |
| C7 | Operations O3 | The operation's handle `O.x` is the handle: `commit`, `retry(k?)` and `cancel(k?)` (actions; `cancel` acts on one Attempt, rule 24), `idle(k?)` (a guard, code `InFlight`; also denies `Uncertain`), `retryable(k?, { times })`, `get`. Starting is static: only from `actions`. `O.x.retry(attempt)`, `retry(select, options)`, and `cancel` / `pending` on the descriptor are removed. Flow has no timeout and never retries (rule 25) | Replaces Operations O3's `retry(select, options)` and descriptor-level `cancel`; keeps "Flow promises no remote rollback and never retries automatically" |
| C8 | Operations O3 | *Replaced by C33 and C35 (operations merge):* one write lane per actor identity, contract and key (rule 21) | — |
| C9 | Operations O3 | `attempt.id` is minted by Flow, random per write, the same for every send of it; the commit author puts it on the wire, and Flow derives no other key. A definite failure is tried again as a new write. The Attempt carries `retryCount` and `mayHaveApplied` (rule 19) | Adds |
| C10 | Operations O3 | `concurrency: "reject"` declines only the write, ending `NotSent { why: "Rejected" }`; the transition runs. `concurrency: "latest"` keeps one Attempt and one queued commit; a replaced never-sent commit is evidence `Superseded`; an unknown holds the lane (rules 17, 21). Every commit and every retry that sends ends once (rules 16, 17). A domain write's queued commit joins the record queue and is sent when its lane promotes it and it heads the queue; queue overflow ends `NotSent { why: "Overloaded" }` for that write only, and the transition and its other actions run (rules 29, 35) | Replaces "declines … without work or outcome"; adds `latest` |
| C11 | Operations O7 | Cancel acts on the addressable Attempt (rule 24): before invocation, by history (a never-sent commit ends `NotSent { why: "Cancelled" }`, a waiting re-send is released); while running it interrupts, and the ending `unknown(Cancelled)` is queued when the fiber exits and retained (`Held`); in `Held` it releases; in `Idle` it does nothing, with evidence. A settled ending is never rewritten | Replaces "Every invoked commit delivers exactly one outcome" and the silent cancel before invocation |
| C12 | Operations O2, Machines O6 | A commit, lookup or retry of an operation is owned by the activation of the state its transition names. At admission its ending is current (from the active leaf) or late (from the owner's nearest surviving ancestor) (rule 14); an adopted ending is current from the active leaf. A late turn may not leave a state that owns another pending call, or an active subroutine (`LateMayNotLeave`); lateness is not transitive (rule 15). Every late event that can occur is handled (rule 20) | Replaces "State exit does not cancel finite work; its event reaches the actor's later state." **Breaking:** the reference editor's after-Close save is handled at the ancestor its late ending routes to ([m1.save](merged/server-calls/rewrites/m1.save.ts)) |
| C13 | Machines O3 | "Action parameters" split: guards, updates and patch-feeding mappers read before; commit selects, key selects and schedule inputs read after (rule 22) | Exempts commit selects and schedule inputs from "both read the pre-turn snapshot" |
| C14 | Machines O5 | A schedule function reads the after memory of its arming turn, with the same `now`; `armOn` counts an event accepted anywhere on the active path; keyed schedules (`keys`) keep one timer per key (rule 23) | Adds |
| C15 | Operations O3 | `optimistic` is the commit's only option, `O.x.commit(select, { optimistic })`, and reads the starting turn's after memory, captured at start; `writes` is the operation's option, `contract.outcomes(mapping, { writes })`, receives `{ value, input }` and reads no memory; domain operations have no `optimistic`, and their `writes` may only invalidate (rules 22, 36; OD26) | Adds |
| C16 | Testing O2, O3 | *Superseded by C70–C72 (Stories): truth is read with `cp.read(fake)`, with no checkpoint predicate (SC2); every ending is produced through fakes (Stories T2).* | — |
| C17 | Persistence O4, O6 | Write lanes are Runtime records of the actor identity (C44–C48), acknowledged once per Attempt, in one capture with the records the Attempt predicts; prediction values are never persisted (rules 38, 46). On restore, an Attempt acknowledged once ends `unknown` (`Restored`) and an unacknowledged one `NotSent { why: "Restored" }`; parked endings and held lanes are delivered in rule 44's order, routed by the one owner test (rule 14) | Replaces the former P12 ("a fenced commit restores with its activation"); extends "A crash after acknowledgment restores unknown carrying the same Attempt…" |
| C18 | CommandLine O5 | Errors: a late event with no handler at a strict ancestor of its owner, naming the event and the state; `failure.NotSent` unmapped where it can occur; an adopted ending unhandled in a leaf of its operation's arrival set (rule 20); `SharedContract`, `DuplicatePlacement`, `VerbMismatch`, `KeyRequired`, `UnresolvedHold` (rules 40–45); a mapped event used as a schedule's `send`, a `raise` or a view's `send` (rule 47); a contract without `key`, or a key field that is not a top-level `input` field (rule 39); (merge 4) `concurrency: "cancel"` on a predicting write (rule 29); `Defect` or `Interrupted` unmapped in a read operation's tag record (rule 37). Warnings: a state-changing transition listing a `reject` commit without its `idle` guard (rule 16); one transition reading, in both memory views, a key it writes (rule 22); `KeyOmitsInput` (rule 39); `UnusedOperation`; `UnresolvedHold` when the owner exists but is unreachable (rule 45); a one-record domain write whose key fields are not those its predicted record's key reads (rule 34). Info: bare writes (rule 40). Type errors: `retry`, `retryable`, a row's `retryCount` or `progress` under `allow` outside an ending's own handler (rule N2); a key-less member outside its operation's ending (rule 43). `SharedCopyLane` is deleted. Display: the commit node shows its operation, contract, verb, policy and key, and for a domain write its predicted entity, key and field names, `.alsoChanges` targets and the reads they reach; `flow explain` prints the lane key and cardinality (A-L2; merge 5, 3.7; 2.7.16) | Adds; amended by C65 (operations in fragments) |
| C19 | Machines O6 | *Superseded by C40 (operations merge): `subscribe.each` replaces keyed activities.* | — |
| C20 | Operations O3, Machines O1 | *Deleted (operations merge): the Attempt carries no copy key; a commit from a copy's filling is an ordinary commit of the host's operation (rule 9).* | — |
| P15 | Operations O3, Persistence O6 | All sends of a write are **one Attempt** (same id, same input). `attempt.retryCount` counts the re-sends. The Attempt is acknowledged once, before its first send; a persisted re-send waits for its lane record's capture (C48) | Adds to "A persisted actor's remote commit cannot invoke its adapter until storage acknowledges its Attempt" |
| P19 | Persistence O5 | A write lane whose operation is gone, or whose key no longer decodes under the contract's key Schema, survives in a version-independent record; after ready it goes to its descriptor's `orphaned` handler (which may `retry` or invalidate), or else surfaces as an issue. Delivery is at least once, so the adapter must be idempotent. Input that no longer decodes under the new Schema is an issue, not a retry. An orphaned retry has no actor: its ending is evidence only. An actor record that no longer decodes does not orphan its lanes: they decode by their contract's `input` pick and the fresh incarnation adopts them (rule 46; C47) | Adds to O5's version-change rule; amended by C62 (operations in fragments) |
| P20 | Operations O3 | A late handler may start a commit; it is an ordinary call owned by its transition's state (rule 15). **Compensation recipe** (2.7.7): handle a late success at an ancestor by moving an idle state to a compensating state that starts the undo; try the undo's definite failures again as new writes after a wait, and reconcile its unknowns with `O.x.retry` of the same Attempt, each with a budget | Adds to C12 |

### For entity domains

Merge 4 ([merged/entities.md](merged/entities.md) section 6.4). Operations O1's `latest` is already C10.

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| C21 | Operations O3 | A domain write's store effects publish at settlement, before its ending is queued (rule 27) | Replaces "publish together before its event" (OPS:101) |
| C22 | Operations O3, EntityDomains O1, O5 | A commit past its lane's queued commits (`W`, 64 under `serialize`) or any record queue, or a `many` key array past 4,096 items, ends `NotSent { why: "Overloaded" }` for that write, with no prediction and no partial join; the transition and its other actions run (rule 35) | Replaces "rejects the whole action batch with AdmissionOverloaded" (OPS:96-97) and EDP:179-182's whole-write rejection |
| C23 | Operations O3, EntityDomains O1, Persistence O6 | One retry shape, `O.x.retry(k?)`, in `Held` only, also on a `serialize` head: the identical request (input and `basedOn`), no prediction, joins the record queue, positioned at the first send (rule 31). `O.x.retry(select)`, "a known-settled attempt settles without calling the adapter" and `InvalidAttempt` are removed; PER:133's "Explicit retry(attempt) and known-settled behavior" becomes "`O.x.retry(k?)` (Operations O3)" | Replaces OPS:113-117, EDP:105-109, PER:133 |
| C24 | EntityDomains O1 | The actor decides whether a start runs, the record queue when it is sent; actor concurrency includes `latest`; a replaced never-sent queued write is evidence `Superseded` and a cancelled one ends `NotSent { why: "Cancelled" }`, both without repair (rule 29) | Replaces EDP:112-116's concurrency sentences and ED:650-651's "settles interrupted" |
| C25 | EntityDomains O1 | `uncertain` is a mark per record and Attempt; a successful retry of that Attempt clears it, a later successful write clears every mark on the record whose Attempt is resolved or released; a read, a forced repair, a failure and `StillUnknown` clear nothing (rule 32) | Replaces "a later write … succeeds or the machine reconciles" (EDP:105-106) |
| C26 | EntityDomains O1 | No temporary ids: a pending create is a memory draft shown apart from the answer (rule 33) | Names the pattern at EDP:118-119 |
| C27 | EntityDomains O1, Operations O5, O6 | The record read is `{ data, predicted, uncertain, unconfirmed }`; the resource and answer lane's "true for live optimistic values or predictions" is `predicted` (E16) | Replaces `pending` at EDP:130, OPS:153, OPS:166. Testing O4's `pending` becomes `predicted` in C72 (Stories) |
| C28 | EntityDomains O1 | A domain write states its `key` like every contract; `flow check` warns when a one-record write's key fields are not the input fields its predicted record's key reads (rule 34, OD15) | Replaces EDP O1's default lane key and merge 5's `many` sentence |
| C29 | Operations O2 | A read operation's `success:` sees confirmed data only; a read's defect or interruption ends on `failure` as `Defect` or `Interrupted`, required in a tag record (rule 37) | Adds to O2's call values |
| C30 | Inspection; EntityDomains O2 | Inspection (ED 7's evidence table): `queue` events gain `Superseded`, `Cancelled` and `Released` removals (an `Overloaded` write never joined, so it is an `ending` record, rule 35); `uncertain` "ended (later write or reconciliation)" becomes "ended (a later write succeeded, or a retry of the Attempt succeeded)"; held lanes, bound or unbound, appear in Inspection by identity (C51). EntityDomains O2's `Entity.queue` removals are `queue` records with their reason (C84, Stories) | Adds |

Merge 5 amends EntityDomains O1/V1, CommandLine O1/O5/O6/Q1 and Inspection O1/O4/D1/D2; its amendments are listed by
target in [merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md) section 6.4 (with
`entity-domain.md` and `sync-engine-adapter.md`, which are designs, not plans).

### For operations in the definition

The operations merge ([merged/operations/proposal.md](merged/operations/proposal.md), 2.7.13's amendment list).

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| C31 | Operations O1 | Contracts have `input` and `output` (a fields record or a Schema; an omitted `output` is `Schema.Void`), the function inline, `progress` with its own schema, and a required `key`, a list of top-level `input` fields, `[]` for one; streams too; files are `*.contracts.ts` (rule 39) | Replaces `key(params)`, `result`, `params` and the optional key |
| C32 | Operations O2 | A one-off read operation has one lane and delivers only its latest lookup; its row is O6's lane with `key`, held until the next lookup or `cancel`; not persisted; the verb agrees with the mapping (`VerbMismatch`) (rules 41, 42) | Replaces "each finite lookup settles once" for lookups through one operation, and C5's call values |
| C33 | Operations O3 | The write lane table (2.7.13): the hold; promotion; invocation after the turn; `retryable({ times })`; a failed Attempt is resolved; one write operation per contract per actor (C68); write lanes are the Runtime's, disposal drops nothing, and endings of unbound lanes are parked (rules 21, 40, 44) | Replaces C8 and Operations O3's disposal sentences; amended by C68 (operations in fragments) |
| C34 | Operations O4 | A stream is declared under `operations` and placed with `subscribe` or `subscribe.each`; `key` is required (rules 39, 41) | Adds |
| C35 | Operations O6 | Rows are `s.operations.<name>`; `O.x.get(s, k)` is total for write lanes; transactions have lanes (rules 21, 42) | Amends "Transactions have outcomes, never lanes" |
| C36 | Operations O7 | `cancel` acts on the addressable Attempt, by history before invocation; `cancel` on a one-off read releases its wait (rules 24, 42) | Replaces "this actor's queued and running commits for a key"; amends "resources have no cancel action"; amended by C68 (operations in fragments) |
| C37 | Machines O1 | `operations: ({ E }) => ({ name: contract.outcomes({ … }) \| contract })`; one write operation per contract per actor (C68); the definition exports `O`; a commit's or lookup's select is typed at its transition (rules 13, 40) | Replaces "a flat record of operation or entity-domain handles" |
| C38 | Machines O4 | Guards receive `operations`; `idle(k?)` (a partial key allowed) and `retryable(k?, { times })` are guards (rule 21) | Replaces `calls` in O4's row; amended by C55 (operations in fragments) |
| C39 | Machines O5 | Keyed schedules: key records; `keys` may read `operations` (after lanes); `restartOn` per key; `armOn` is a construction error on a keyed schedule (rule 23) | Amends C14; amended by C56 (operations in fragments) |
| C40 | Machines O6 | `activities` is a list of placements; `subscribe.each` places one session per key; `DuplicatePlacement` (rule 41) | Replaces C19; amended by C57 (operations in fragments) |
| C41 | Machines O8 | The snapshot exposes `operations`, replacing `calls` and `activities`; a Runtime step publishes the bound lane rows it changes (2.5) | Amends O8's row; amended by C58 (operations in fragments) |
| C42 | Runtime O3, V4 | A write lane is (actor identity, contract id, key); a starting incarnation adopts only its own identity's unbound lanes, and receives a hold as `unknown { Restored }` and the ending of an Attempt still on the wire; a local identity is (machine id, input by `Equal.equals`), and equal local identities adopt the oldest unbound lane first (rule 44) | Replaces "no outcome, schedule, issue or send from an old incarnation reaches a new one" for write lanes; amends "`createActor` always creates a new local actor"; amended by C59 (operations in fragments) |
| C43 | Runtime O6 | Disposal invokes nothing new; queued commits end `NotSent { Disposed }`, delivered after reload for a persisted identity; `runtime.unsettledWrites()` lists non-`Idle` lanes by identity (OD23 Q40) | Amends "invoked commits settle within the disposal bound" |
| C44 | Persistence O2 | Write lanes are Runtime records of the actor's identity; local actors' lanes never persist (OD20); pending mapped outcomes also include endings of a persisted identity's lanes admitted while no incarnation is bound, and its `NotSent { Disposed }` (OD21) | Replaces "pending writes follow their actor"; amended by C60 (operations in fragments) |
| C45 | Persistence O3 | Plus every non-`Idle` lane of a persisted identity, bound or unbound; a disposed actor's non-`Idle` lanes stay as unbound lane records; a pending mapped outcome settled before the final capture, and never-sent work ended `NotSent { Disposed }`, are delivered after reload (OD20, OD21) | Replaces "a capture is the actor's saved record; explicitly disposed durable actors disappear from the next capture"; amended by C61 (operations in fragments) |
| C46 | Persistence O4 | Then, per lane in creation order, a `Held` head's `unknown { Restored }` (once, unless its outcome was saved) and, on reload, `W`'s `NotSent { Restored }` (OD21) | Replaces "restore resumes in the saved leaf and delivers saved outcomes"; amended by C62 (operations in fragments) |
| C47 | Persistence O5 | With that machine id's lane records, as evidence (R9 M2); otherwise lane records, with their parked endings, decode and restore independently of the actor record, and a fresh incarnation adopts them in its initial leaf; this is not a partial restore of the actor (R10 M3). P19 is narrowed to match (X14). | Replaces "saved records for an undeclared machine id are discarded"; amended by C62 (operations in fragments) |
| C48 | Persistence O6 | Once per Attempt, per lane record, with no actor (OD20 F2); a persisted lane's re-send waits for its lane record's capture (R9 M3); a failed acknowledgement ends `NotSent { StorageRefused }`, not an interrupt (R9 M2). P15 is narrowed to match. | Replaces "an Attempt's acknowledgement before its adapter is invoked; a failed acknowledgement settles through interrupt with `StorageFailure` evidence" |
| C49 | ServerRendering O3, O5 | Write lanes are never hydrated; `DehydrateCommitInFlight` is evidence on the client, naming the actor and its state; "the actor's unknown outcome owns reconciliation" is removed; only resource entries hydrate (OD20; R9 M4) | Replaces "an in-flight commit transfers as unknown, and "the actor's unknown outcome owns reconciliation"; client or persisted actors beat hydrated copies"; amended by operations in fragments (instance path in `DehydrateCommitInFlight`, 2.7.13) |
| C50 | LazyFeatures O3 | A lazy machine's lane records stay dormant, undecoded and uninvoked, until the feature is adopted (R9 M2) | Replaces "a lazy feature's machine loads on demand" |
| C51 | Inspection O1 | Unbound lanes by identity, with holds, queued commits and marks; lane states `Idle`, `InFlight`, `Held`; `ending` evidence names operation, contract, verb and key; evidence kinds `Superseded`, `Released`, `NothingToResend`, `InFlight` | Amends "lists actors and their lanes" and C30; amended by C64 (operations in fragments) and C78 (Stories) |
| C52 | React O2, O3 | Fresh memory and state, with write lanes adopted by identity; the pre-attach send buffer flushes after a new incarnation's deliveries (rule 44); selectors read `operations` | Amends "one fresh local actor per component incarnation" and the pre-attach buffer; amended by C66 (operations in fragments) |
| C53 | Testing O3, O7 | Stories produce endings through fakes, never by injection (Testing O3 kept; Stories T2); Testing O7's `closeTab` stays abrupt; a clean Runtime shutdown with queued work is a policy-suite test (OD23 Q41) | Adds; amended by C63 (operations in fragments) and C71, C74 (Stories) |

### For operations in fragments

The fragments merge ([merged/fragment-operations/proposal.md](merged/fragment-operations/proposal.md), section 7).

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| C54 | Machines O1 | A fragment may declare `operations` after `memory` and `traits`, mapped onto its own `internalEvents`; mapped writes only within rule 48's scope (every placement from the root a root trait, an `.each` copy or a `.resumable()` trait, any with a string `resetOn`, no subroutine); acting members only in the declaring fragment; `Fragment.O` exposes its write operations' reads; key-less `O.x.cancel` in `whenAbandoned` releases on leave (rules 48–50, 60) | Amends the fragments row "A fragment declares what a definition declares (…)" |
| C55 | Machines O4 | A host's guards read a fragment's write lanes with `Fragment.O.x.get`, `idle`, `retryable`; every `updateMemory` receives `operations` (pre-turn lanes, `get` only); inside a fragment `operations` is its own rows (rules 22, 50, 59) | Amends C38 |
| C56 | Machines O5 | `Flow.entry` does not fire on a thaw; a fragment's keyed schedule reads its own rows (rules 23, 52, 59; F8) | Amends P7, C39 |
| C57 | Machines O6 | `activities` in a trait body or a subroutine's states, placed for the incarnation's life; a freeze releases them, a thaw places them again (rules 41, 52); a stream placement in a fragment is one session per placement path (rule 68) | Amends C40 |
| C58 | Machines O8 | The snapshot exposes `s.operations.<instance>.<name>`, `undefined` while inactive, a keyed list of copies under `.each`, each write row listing the lanes of that copy's path (rule 59) | Amends C41 |
| C59 | Runtime O3, V4 | A write lane's identity is unchanged; it records the creating incarnation's subject path; its binding incarnation is the live incarnation with that path (the actor for a definition's operation); a member from another path is declined; with no binding incarnation in a live actor the ending is parked for the path; a starting incarnation (entry, copy, reset, thaw, rebind, restore) receives its path's parked endings, then held heads' `unknown { Restored }`, then in-flight endings, as follow-up turns (rules 51, 53, 54) | Amends C42 |
| C60 | Persistence O2 | The lane record carries the subject path (strings) and the releasing mark (a flag); a writing placement's reset value persists with its slice; a frozen slice persists its parked read endings (`Interrupted`) beside its frozen schedules; parked endings of an unplaced path are on the lane record (rules 46, 51, 52, 60) | Amends C44 and the fragments' Persistence O2 row |
| C61 | Persistence O3 | A releasing mark is captured no later than the actor record that drops the incarnation (rule 60) | Amends C45 |
| C62 | Persistence O4, O5 | On restore, a writing placement whose re-taken reset value differs resets as a pending reset, the first turn after restore, before rule 44's deliveries; a recorded path the placement cannot produce adopts by key equality only when its last part is the contract's single key field, else `orphaned` (rules 46, 51; P19 gains the case) | Amends C46, C47, P19 |
| C63 | Testing O1 | `Story.fragment(fragment, { id, fixtures })`; `enter`/`leave`/`reset` on traits; a fragment's request named by address (rule 65); rule 58's walks are Stories | Amends the fragments' Testing O1 row and C53; amended by C69 (Stories) |
| C64 | Inspection O1 | Every lane with its operation path, subject path, and whether it is unplaced or releasing; fragment operations in contract summaries; `runtime.unsettledWrites()` lists unplaced lanes and drops a releasing lane once its ending lands | Amends C51 and the fragments' Inspection O1 row; amended by C78 (Stories) |
| C65 | CommandLine O5 | `SharedContract` per actor tree (an error; a warning for `key: []` on a non-empty path, also C18's severity); `UnresolvedHold` and rule 20 inside each fragment, plus rule 56 at the host; rule 20's `NotSent` on a non-empty path, at the placement; rule 12's new construction errors; `flow explain` prints fragment operations and their subject; a key-less `O.x.cancel` in `whenAbandoned` is the one exception to C18's key-less type error (rules 43, 60); no new finding name | Amends C18 and the fragments' CommandLine O5 row |
| C66 | React O4 | Views read `Fragment.O.x.get(s, k)` and `s.operations.<instance>.<name>` | Amends C52 |
| C67 | EntityDomains O1 | A fragment's domain write registers its domain for its actor; `Released` on a releasing lane keeps the record's mark (rules 26, 30, 32, 60) | Adds |
| C68 | Operations O3, O7 | One write operation per contract per actor, across placements; a release on leave interrupts, releases and ends queued commits as evidence, the one exception to "never silently drops" (rules 24, 40, 60) | Amends C33, C36 |

### For Stories

The Stories merge ([merged/stories/proposal-v2.md](merged/stories/proposal-v2.md), section 6.2), amended
([merged/story-checks/stories-amended.md](merged/story-checks/stories-amended.md) section 4): **all proposed**, following the decisions cited. playback.md follows
Testing O4 and O9.

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| C69 | Testing (title), O1 | Title "…checkpoints, models and property tests" → "…checkpoints and property tests". `Story.app`, `Story.machine`, `Story.fragment` (W1) over an app setup, a machine, a trait or a subroutine; 2.10.2's steps; ids unique across the configuration; the stand-in host, its placement from the declaration (W30); the `world` option (W13); addressed targets; `reload` and `openTab(…, { from })` (W26); a Story holds inputs and checkpoints and no checks (SC1); "Construction, import and discovery start no services, actors, fixtures or assertions" → the last word goes; "Scenario commands accept no arbitrary callbacks…" **kept** (rules 61–66); every step has a data form; `services?` on `story.machine` is removed, `fixtures` covers it; `run({ signal?, frames? })` → `run()` (W22; P, SA RV2 section 8) | Replaces O1's `story.app` / `story.machine` sentences and "Both Story kinds support send, process, advance, advanceTo, advanceToNextTimer…"; "unique within its App" → "unique across the configuration"; replaces the fragments' Testing O1 row and C63's syntax |
| C70 | Testing O2 | A run never yields to the host between its first step and its cleanup. Every step settles on a microtask-only run scheduler (`executionMode: "sync"`), draining until `K` consecutive hops show no scheduler activity and no arrival at anything of Flow's, within a hop cap per instant (`StoryTurnLimit`, `reason: "Settle"`); after the last cut, if a commit or read fiber is parked, the run finishes the world with nothing reaching the evidence, and a fiber still parked is `HostTimeWait`; a session or setup-scoped fiber may wait; a sleep of zero or less is a yield; 100,000 deadlines per `advance` (`reason: "Advance"`); cleanup's free Clock and bounds; the turn limit is per instant; 2.10.17.5's five ranks; the executor's own Clock; a Story is checked on the engine its tests run on; `advance({ next: address })`, `together({ advance })`, `suspended` (rule 61; W2, W4, W6–W10; SA RV1 H1, SA RV2 H1, M1–M3, L2; Streams T1 for a session's timers) | Replaces "process() drains currently eligible work…" and "These commands make work eligible without draining it…" |
| C71 | Testing O3 | Fixtures are client halves; `Fake.server` (run-scoped truth, endpoints, controls, the wire words `hold`, `release`, `drop`, `duplicate`); fakes-v2's one result shape, a pure synchronous `handle`, `send`, one answer list, route tables, the combination rule, the run-scoped server registry; provenance (`via`); `Fake.Lost`, `Fake.Refused`, `Fake.Closed`, mapped by the binding; a crashed server is the binding's failure, and a broken fake rejects the run with `StoryFakeError`; `from` carries storage only; `Fake.storage` with `purpose`, FIFO per tab, aborted on close, and the scope lock; "fixtures cannot inject operation outcomes directly" **kept** (rules 62, 66; W11, W12, W14, W16–W21, W28, W35, W36) | Adds to O3; supersedes C16 |
| C72 | Testing O4 | A frame after every committed publication; a step per command, each with its step cut; frames never collapse (W22); a checkpoint names a step cut and has the reads `state`, `memory`, `operations`, `schedules`, `read(target)`, `lane`, `records`, `inspection`, `entity`, `attempt`, `now` (SC3, W23, W24); `checkpoint.actor(ref)` → `cp.read(ref)`; `pending` → `cp.inspection.work`; `Entity.get(checkpoint, …)` → `cp.entity(…)`, returning `{ data, predicted, uncertain, unconfirmed }`; records in one list with `tab: { name, open }`; `descriptor.get`, `Domain.entry.get`, `Entity.queue` and `shape` on a checkpoint are removed; every cut captures its full `inspection`, every frame `work` and lanes; `run.frames` keeps at most 10,000, exposes a non-enumerable `truncated` (W25), and its iterator throws `FramesTruncated`; step cuts and checkpoints are never truncated (rule 64) | Replaces "a frame after every command by default … Consecutive identical frames collapse into one", and O4's reads; answers C27's note |
| C73 | Testing O6 | `propertyTest(story, { steps, properties?, whenQuiet?, seed, runs?, length?, quietWithin? })` (W25, W38); plain function properties; steps are data forms; resolves on `Pass`, rejects `PropertyTestFailed { result }` on `Fail` or `Inconclusive`, after every run completes; a truncated run is a `Fail` with `FramesTruncated`; the quiet phase ends the world in ordinary steps, which the emitted Story keeps; invalid generated steps are skipped and left out of emitted Stories; shrinking keeps pairs; faults are steps; the domain form is `domainPropertyOptions` (2.10.16) | Replaces O6's generator shape, and "even when process() drains many turns". O6's "Results distinguish Pass, Fail and Inconclusive" stays. O6's "insufficient evidence is Inconclusive" gains the truncation exception, as the brief asks |
| C74 | Testing O7 | Tabs share the run's fake servers and `Fake.storage`; remote requests in transit survive `closeTab`, local writes abort; a hydration source runs in the destination's world, may not set `world`, and its requests carry `via.tab: { name: "server", open }`; `dehydrate` moves time as `advance` does (2.10.10, 2.10.11); the default tab is `"main"` | Adds |
| C75 | Testing O8 | Errors `StoryInvalidCommand` (`ActorAbsent`, `AlreadyEntered`, `NotEntered`, `TabOpen`, `TabClosed`, `NothingHeld`, `NoDeadline`, `NoConnection`), `HostTimeWait`, `FramesTruncated`, `PropertyTestFailed`, `PropertyDefect` (a reason) [SA RV3 L5], `AmbiguousRead`, `StoryFakeError`, `SubjectAbsent`. `run()` rejects on a real Story error or a broken fake, never on a value (SC1, SA RV1 H4); the earliest recorded error is primary (SA RV2 M6). **O8's cancellation goes with `signal`** (W43): "Cancellation stops admission and later commands", "a blocked send settles once", the cancellation flag; cleanup order and failure evidence stay (SA RV2 M1, section 8). `StoryExpectationFailed` is removed | Adds |
| C76 | Testing O9 | The next-action highlight compares the addressed event; a closed tab renders nothing and reports the gap; fragment-alone Stories are not playable (a type error) (2.10.13) | Adds |
| C77 | Testing O5, V1–V9 | O5 and V5 removed (W39, T1); V1 adds the reads' types; V3 proves rule 61 and the instant order, with the host-primitive matrix, the always-on sentinel and `K` doubling (SA RV3 section 2); V4 proves publication frames, steps and captured reads, and loses "recording and collapse"; V6 proves `propertyTest` judging, including `FramesTruncated` | Applies W39 |
| C78 | Inspection O1 | `inspect(runtime)` adds `work` (with `waitsFor`) and `incarnations` (`status: active \| frozen`); lanes by identity with `binding` (`bound`, `unbound`, `unplaced`), `releasing` and parked endings; held wire items are not Runtime facts (2.10.6, 2.10.7) | Amends C51, C64 and the fragments' Inspection O1 row |
| C79 | Inspection O4 | Event kinds gain `ending`, `lane` (with `cell`), `life`, `callback`, `exit`, `listRepair`, `drop`, `session` (with `cell`), and for Story runs `step`, `request`, `control`, `verdict`; `turn` carries the keys its mappers read that it writes; every event gains the run-wide sequence and `tab: { name, open }`; the `delivery` kind [fakes-v2]; `records` takes 21 kinds (2.10.6); the diagnostic `UnusedWireRule` (2.10.4) | Adds |
| C80 | Inspection O5 | Fake truth and request inputs leave the process as digests; `via` is identity, never redacted | Adds |
| C81 | CommandLine O2, O5, O6 | `describe` prints subject, options, steps, checkpoints and every fake the plan names (W40); `flow story run` reports what ran, exits 2 on a rejected run, and prints `issue` records and unused wire rules; coverage by cells, handlers (current and late) and Flow reasons, stated as reached; Story-derived warnings from `verdict`, `listRepair`, `drop`, `ending` (rule 51's declines) and `turn` records; rule 20 at a stand-in after a subject change (2.10.12); top-level Stories in `defineConfig` (`appId: null`) (2.10.14) | Amends T2 |
| C82 | Package O1 | `flow-state/testing` exports `Story`, `Fake`, `propertyTest`, `domainPropertyOptions`, `StoryFrame`, `StoryPlayer`, `definePresentation`, `defineConfig`, `type StoryRun`, the error classes `PropertyTestFailed`, `Fake.Lost`, `Fake.Refused` and `Fake.Closed`; `story` and `model` removed (W39); no test-runner adapter package (proposed; follows from SC2–SC4); `flow-state/internal/testing` (not public) exports `disposeRuntime` for Flow's suite | Amends Package O1 |
| C83 | Diagnostics | The error names of C75 | Adds |
| C84 | EntityDomains O2, O4 | `Entity.queue` removals are `queue` records with their reason (`Superseded`, `Cancelled`, `Released`; an `Overloaded` write never joined and is an `ending` record, rule 35); `domainPropertyOptions(domains, inputs)` keeps O4's oracle, quietness (with 2.10.16's line on recurring schedules) and `Inconclusive` rules | Resolves C30's deferred half and delegated-decisions row 3 (K11) |
| C85 | Persistence O7 | The capture that removes a cancelled Attempt's acknowledgement queues behind that acknowledgement (one writer per scope); an acknowledgement stored before a crash restores as `unknown { Restored }` even if this Runtime had cancelled the Attempt (2.7.13's restore row; Stories T7; section 7 item 21) | Adds |

### For streams

The streams merge ([merged/streams/proposal-v3.md](merged/streams/proposal-v3.md), section 9): **all proposed**, following the decisions cited. The record's Testing O2, O3 and O6 changes are already in C70, C71 and C73.

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| C86 | Operations O1 | A stream contract is 2.11.3's shape: `delivers`, `position`, `subscribe`, `catchUp`, `reconnect`, `idleTime`; `persist` is removed from streams; `result` reads `output`; a stream's resume position is no longer an input field (rule 39, S15) | Replaces OD12's clause |
| C87 | Operations O4 | Rewritten from rules 67–72; `DuplicateStreamSession`, "equal values are silent" and "complete … end the session" are replaced | Replaces O4's stream text |
| C88 | Operations O6 | A stream's tags become 2.11.9's rows | Replaces |
| C89 | Operations V9, Q1 | V9: Stories prove the Streams tables and the record's section 11 oracles; Q1 is decided by Streams T4 and T6 | Amends |
| C90 | Machines O6 | The list form of `activities` and rule 67's outcome keys | Adds |
| C91 | Runtime O4 | "Stream values coalesce" becomes rule 69; "Facts from an ended activation are discarded" becomes rule 70, with evidence | Replaces |
| C92 | Runtime O6 | Sessions release within the bound (5 s, `ReleaseOverdue`); a new session waits per rule 70 | Adds |
| C93 | Persistence O2 | The position field's Schema must pass `persist: true`'s type rule; a frozen slice keeps the partition, and a `latest` row's `last` and `heard` | Adds |
| C94 | Persistence O4 | "running streams retain their selected latest value and count" becomes Streams T5 and T9 | Replaces |
| C95 | Persistence O5 | A position inside a stream partition entry failing to decode reads `{ at: undefined }`; this is not a partial restore of memory. A partition failing its own shape discards the scope. Persistence O3 is cited, not changed | Amends |
| C96 | ServerRendering O2, O5, V3, V5 | "latest stream values and counts" becomes a `latest` row's `last` and baseline; "existing stream lanes win" is removed; client rows start `Connecting`; V3 and V5 gain a ticker and a chat feed | Replaces |
| C97 | ServerRendering O3 | The partition is in the transferred list; the position field's Schema joins the digest; a sensitive position is omitted, and that entry owes one notice (Streams T9) | Amends |
| C98 | ServerRendering, sessions | `every` sessions never open on a server; their `R` is provided by a layer, or exempt | Adds |
| C99 | EntityDomains O1, O4 | "Reconnect" means rule 72's gaps; O4 adds stream faults | Amends |
| C100 | Inspection O4 | Per session: state, `drop`, Streams T2's row and basis, each `proof`, losses, bookmark and `filled`, bound, release; counters and a ring of the last 256; 2.11.13's flags. C79's `session` kind carries them | Adds |
| C101 | CommandLine O5 | `flow check` and `flow explain` as 2.11.13 | Adds |
| C102 | Package O1 | `Feed` is exported beside `stream` [P, merge] | Adds |
| C103 | Diagnostics | The finding names of 2.11.13 and `Feed`'s reasons | Adds |

### For tooling

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| T1 | Testing O5 | **Marked for removal: model-based exploration is cut.** Remove Testing O5 (`model`, `stateKey`, `getShortestPaths`, `getSimplePaths`) and the `invariants`, `hot` and `explore` options this row used to add; remove `model` from Package's `flow-state/testing` exports; remove the dispatch-desk demo (`editor.story.ts` `exploreEditor`, its test in `editor.test.tsx`, the README coverage row). Exploration predicts operations, schedules and turns without running them, a second execution path that must keep "replay parity" with the Runtime; Flow keeps one runtime. Finding unwritten sequences stays with `propertyTest` (Testing O6) on the real Runtime | Removes Testing O5 and the Package export; check V7's proofs that cite O5; applied by C77 and C82 (Stories) |
| T2 | CommandLine O5 | Warnings: an exit no reachable transition takes; a `hostEvent` no host raises; a public fragment event unhandled everywhere; a subroutine whose exits are unreachable from its default. `flow stories --coverage` lists transitions, exits, callbacks and ending handlers (current and late) no Story reaches, and (Stories, C81) the write-lane cells, stream cells (Streams T1, T3) and Flow reasons none reaches | Adds to the warning list |
| T3 | CommandLine O5 | Warn when `send(ref, E.X)` can reach a state of the target actor where X is Unhandled. There is no silencing keyword; warnings never fail the check | Sharpens "unhandled events" |
| T4 | CommandLine O5 | A lint rule with an autofix orders the category keys of definitions, fragments, machine bodies, fillings, transitions, commit options and operation options (section 2.6). It never reorders entries inside a record, whose order carries meaning | Adds |

## 6. Deliberately left out

**Not in v4's model:**

- **Parallel regions in the host, deferred events, queued microsteps, statechart inheritance and
  general eventless transitions.** No prior-art note recommends them for Flow State.
- **Combinable memory keys** (`combine(append)`), Esterel-style. Disjoint keys stay, and the
  workaround is one callback per key.
- **`resetOn` deviates from the synchronous note (R2).** The note offers pre-turn reads, or
  post-update reads with static rejection. v4 reads the before-walk memory, the same view as
  `input`. Cycles cannot be written, but a key written by a callback or exit filling resets in an
  immediate follow-up turn (a pending reset), so exactly one published snapshot shows the old
  incarnation. Keys that drive resets belong in source transitions, as the issue list's settle is.
- **Flow timeouts and Flow retries** (rule 25). A timeout is a schedule on the owner state; a retry is a new write or
  `.retry` from a state the machine enters. A stream's declared `reconnect` and `idleTime` re-run a connection, never a session or a call (S15).
- **Generic I/O fragments** (the exploration's `CommitWithRetry`): rule 13's exhaustive `failure` makes a
  contract-agnostic reconcile fragment unwritable; fragments own concrete operations (2.9). **Mapped writes in
  subroutines and node traits** are phase 2 (F4, F7; [merged/fragment-operations/proposal.md](merged/fragment-operations/proposal.md) section 9).
- **An Rpc-based contract** (OD13): a `fromRpc` adapter, later, when a real app needs it.
- **Streams, out of scope** ([open-items.md](../../proposals/open-items.md)): outbound live state on a session (item 16), one shared session per Runtime (17), a manual `reconnect` member (18), `fromRpc` streams and download resume (19).
- **Per-key fan-out of write members, throttled independent writes, per-item stops on a `serialize` queue** (2.7.13's
  limits): bulk contracts and keyed designs; deferred to [open-items.md](../../proposals/open-items.md).

**Decisions pending for the user** (each is its own proposal):

- **Stateful traits:** a trait with its own states, as a synchronous component without host
  regions (modal R5). Today it is a subroutine placed as a host state, or a trait whose modes are
  memory.
- **Typed read ports for live host values** (`reads: { other: … }`), evaluated from the pre-turn
  snapshot (statechart R5). This partly revisits v2's cut of live props.
- **Named subroutine entries and entry-time exits** (`S.CHECKOUT.entry.AtPayment`) (statechart R3).
- **Deep history, a history default, and clearing history** (`S.X.history.deep`, `.or(…)`,
  `forgetHistory`) (statechart R4).
- **Node memory:** host memory scoped to a compound, resumed or reset like a trait. `.resumable()` covers
  traits only. The sign-in avoids the gap with an `.each` list; host keys elsewhere are still reset by
  hand (modal R2).
- **Data-conditioned leaving** (`while: { select, event }`), which enqueues an event when a lane
  selection turns false (modal R7).
- **Recorded-history replay** (Temporal's replay test). Upgrade Stories exist: `storage: Fake.storage.from(oldStory)`
  or `Fake.storage.seed(records)` (2.10.10), which matter more now that `orphaned` makes version changes first-class
  (durable R8). Replaying recorded production histories stays out (SP 2.17's STR71).
- **`idempotency` windows, deferred.** A server's dedup window would bound how late a `.retry` may re-send the same
  Attempt. The durable note's R1 gating, restated for this design:
  - an Attempt `createdAt` lets an expired re-send answer **`unknown`** (reason `IdempotencyExpired`), never
    `NotSent`, which proves no write;
  - the window should be compared with a margin, since the client clock is not the server's.

  This moves together with author-derived idempotency keys and completion through another channel
  (durable R7, R9).

## 7. Open

0. **Collections, after `.each`** (rule 9; [merged/each.md](merged/each.md)
   section 4): ~~per-copy subscriptions (keyed activities)~~ (closed: `subscribe.each`, rule 41,
   C40); raising into every copy at once; several
   copies writing their list's field in one turn; ~~commits joined across incarnations~~ (closed with item 15: the
   Attempt carries its copy); nested `.each`.
1. **Summaries in types.** Can the contract summary (rule 10) be inferred into TypeScript types
   cheaply enough, or does it live only in `flow check` metadata? Rule 57 adds operations and the contracts' `R` to
   the summary in the fragment's type.
2. **`.resumable()` and `resetOn` together.** A resumable trait resets on return when its value differs. Is
   comparing against the frozen value the right baseline, or should leaving reset it? On a writing placement the
   frozen value is also a subject part, and a restore whose value differs resets (rule 51).
3. *Removed with T1: model-based exploration is cut (section 5, T1).*
4. **Declaration order in types.** TypeScript does not order object-literal keys reliably, so
   "earlier traits" for `resetOn` may need tuple placement or a builder (the type spike).
5. **Names.** `trait`, `subroutine`, `hostEvents`, `resetOn`, `Flow`, `Flow.state`, `.each`, `by`, `Flow.entry`, `.key`, `.resumable()`,
   `whenAbandoned`.

From merge 2 (its section 10, in its order):

6. ~~**The lane key in a `NotSent` mapper.**~~ **Closed (Revision (multiplicity audit, 2026-10-31), D21):** every
   mapper's context carries `laneKey` (2.7.3), so a `NothingToResend` names its row. It is not called `key`, which
   already names the `.each` copy. *Moot after the operations merge: `laneKey` and the copy key are gone; every mapper
   receives the contract's `key`.*
7. **A send that must finish while the page closes** (undo send): out of scope; `pagehide` gives no time for an async
   turn and Persistence O6's acknowledgement. The server-side alternative is a server delay (`sendAt`) with undo as a
   `DELETE` by the Attempt's id.
8. **Per-item batch results** (2.7.11): one write per item, batched below the commit with Effect's
   `RequestResolver`; not spiked.
9. ~~**Writes that stream**~~ **Closed (streams merge):** designed as progress on the write lane (`progress(p)`, Streams T8; 2.11.12.5, 2.11.12.6). A streaming write stays a transaction.
10. ~~**`writes` and `optimistic`**~~ **Closed (merge 4, rule 36).** Was: (Operations O3/O5): not redesigned; options of the commit value, applied to every
    send of it? Rule 22 and C15 already list optimistic and write callbacks as after reads, while this question
    leaves them open; the entity review finds after circular for `writes`, which run at success before the ending's
    event ([merged/server-calls/reviews/entities.md](merged/server-calls/reviews/entities.md), F-H4, F-L2).
11. ~~**Persisted endings.**~~ **Closed (operations merge):** contracts carry `output` (OD12), and parked endings are
    stored raw on lane records and mapped at delivery (OD22). Was: a persisted actor's saved ending needs the
    transaction's success Schema (`result`), as persisted resources do (Operations O1).
12. **Randomness** for jitter in backoff (Machines O3 mentions seeded test randomness but no source in a turn).
13. **The machine signature.** `machine(def, (h) => body)` loses TypeScript's excess-property check on handler keys
    (found by the merge 2 spike), so a handler for an event that does not exist is not a type error. Change the
    signature, or rely on `flow check`?

Found while merging:

14. ~~**Server calls and entity domains:**~~ **Closed (merge 4, 2.8, rules 26–38).** Was: who owns a write about an entity, and the conflicts recorded in
    [merged/server-calls/reviews/entities.md](merged/server-calls/reviews/entities.md) (retry shape, settlement
    versus admission, queue release, temporary ids, `AdmissionOverloaded`).
15. ~~**`.each` copies and call owners.**~~ **Closed (Revision (multiplicity audit, 2026-10-31), D21), with the
    recommendation it carried:** rules 8, 14, 17 and 20 govern call endings, which are never dropped; rule 9's drop
    applies only to raises and timers; the Attempt carries the copy's key and incarnation, so a retry from the host or
    another copy still reaches its own copy's handling (rule 9, C20). For the owner to confirm. *Moot after the
    operations merge: the Attempt carries no copy key (rule 9).*
16. **`orphaned`'s `retry(attempt)`** (P19, 2.7.7). Merge 2 removed every Attempt-argument retry in favour of the
    commit value's `.retry(key)`, but an orphaned Attempt has no actor and no lane, so the descriptor-level
    `orphaned: ({ attempt, retry }) => retry(attempt)` remains the one place an Attempt is retried by argument. Its
    shape is not settled (see also entities.md A-H2). Narrowed by the operations merge: only a write lane whose operation
    is gone, or whose key no longer decodes, reaches `orphaned`; an undecodable actor record does not orphan its lanes
    (rule 46, P19).
17. ~~**Story reads for entity domains**~~ **Closed (Stories merge):** `cp.entity` reads `{ data, predicted, uncertain,
    unconfirmed }` (C72); removals are `queue` records (C84); settlement frames are named with `checkpoint(…, { at })`;
    `Overloaded` and queue order are reached by holds and sends; held lanes are in `cp.inspection` (2.10.6–2.10.8).
    Was: `Entity.get` with `predicted` (Testing still says `pending`),
    `Entity.queue` removals (C30), the frames between settlement and admission (2.5, rule 27), reaching `Overloaded`
    and record-queue order with fixtures (2.7.11), held unknown lanes in evidence (rule 21), and server truth against
    the store.
18. **Typing risks** (operations merge, 2.7.16): the `operations` callback needs `E` first; key-less members need the
    handler's event origin, with `flow check` as the fallback; the fallback for the callback is
    `definition({ … }).operations(fn)`.
19. ~~**Story reads for operations**~~ **Closed (Stories merge):** no ending is injected (Stories T2, rule 62); rows are
    read on the snapshot; `dispose`, `ensure` and `reload` drive rebind and restore; the parked lane is listed `Held`
    with `uncertain: true` (2.10.7, 2.10.10). Was: `Story.ending` (rule 47) against Testing O3's "no ending is injected";
    merge 3's 3.14 reads `snapshot.operations` and `O.x.get`, so its question 40 (export commit values at module scope)
    is moot, the definition exports `O`; Story drives for dispose, rebind and restore (2.7.13); the parked lane's flags
    (2.7.13).
20. **Typing risks** (operations in fragments, 2.7.16): `Fragment.O`, branded members, key-less `cancel` in
    `whenAbandoned`, rows under `.each`, the fragment's `R` reaching the host, string-only `resetOn`; no type spike;
    `flow check` is the fallback.
21. **A cancelled Attempt's stored acknowledgement** (Stories merge; for the owner). A cancel that ends a never-sent
    commit `NotSent { Cancelled }` queues the capture that clears its acknowledgement; if the tab crashes after the
    acknowledgement was stored and before that capture, the restore finds an acknowledged Attempt and delivers
    `unknown { Restored }` (2.7.13's restore row, rule 17, C85). Stories T7 keeps this; the alternative is to fence the
    cancel's capture so the restore sees the cancel (the Stories record's Q15, option B).
22. **Amended Stories, what is unproven** (proposed, 2026-11-01). No Flow code ran: the rewrite has no `Fake`, Story executor or checkpoint reads. The model
    ([merged/story-checks/model/RESULTS.md](merged/story-checks/model/RESULTS.md)) covers the wire within its caps; the desk's trial converted only its feed, Presence and Assistant fakes, and only on paper
    (`merged/streams/trials/desk/RESULTS.md`). The rest of the desk and Checkout still use `Story.make`, `.expect` and `storyTest`. A Story is checked on the engine its tests run on (2.10.2), so playback may
    reject what tests accept; no guards on `fetch` were added, so a real `fetch` under its own timeout passes (rule 61's limits). `inspection` and frame memory is unmeasured (2.10.6).
23. **Streams: where loss stays silent, and what is unproven** (S15 confirmed that these are documented limits; the rows are [P], 2026-11-01). One rule covers most: *the named field holds only this feed's items, in this slice.* "Same in trimmed v2?" compares the fallback S15 keeps (below).

    | Case | Who breaks it | Same in trimmed v2? |
    | --- | --- | --- |
    | Two feeds into one field; `subscribe.each` over a plain list (both have findings) | Memory shape | No |
    | `fills: false` where a list exists | Memory shape | No |
    | A wipe leaving a residue, such as a joined banner | Memory shape | No |
    | `[]` by accident in a handler that stays placed: read as a clear | App bug | Yes: the cursor stays too |
    | A list shortened by your own bug | App bug | Yes |
    | **A list trimmed by arrival order after a newest-first read** (STC1, trial 2): `upsertAll(...).slice(-100)` keeps the oldest of the walk, then `done` moves the bookmark to the head | App | **No**: v2 required pages oldest first |
    | A guard denies a value or a page: the bookmark moves past it, with `DeliveryDenied` evidence only (rule 71, ST Q3) | App | Mostly: the next value moves the cursor past it |
    | `fills` names a wrong field of the right kind: wipes are misread. `FillsUntouched` flags some (2.11.7) | Memory shape | No |
    | Under `subscribe.each`, an evicted, quiet, empty key reads as first open (Streams T3's bound) | Scale | No |
    | **Any keyed feed without `catchUp`:** Streams T3's 256-entry eviction takes the oldest key's bookmark, which then reads as first open (STC4, trial 2) | Scale | No |
    | **A non-persisted reload starts fresh**: a new slice, first open, no notice, and cleared or dismissed items return (STC2, trial 2) | Persistence choice | Yes |
    | **Half-open with `idleTime: "Infinity"`**: nothing fires, no notice (STC5, trial 2) | Source shape | Yes |
    | A read with `from` set that is not a change log; a false `Feed.done` or `Feed.live` `proof`; a lagging replica; a wrong `through` | Adapter | Yes |
    | A first read that does not reach back to registration, then a reload | Adapter | Yes |
    | An empty read with no head, outside `catchUp`; a from-now feed with no head (the desk's log today) | Source shape | Yes |
    | A from-now log that drops between its first read's end and that `settle`'s admission | One queue turn | Yes |

    In exchange, trimmed v2 has a silent case this does not: a forgotten `cursor: undefined` on any wipe line. ST RV3 and the main session judged the first agent trial's findings not a fourth High: the accidental `[]`, a counter's duplicates and host-kept lists are the same or worse in v2, or stated limits. Cleared items can come back, visibly, after a clear, a later message and a wipe (2.11.8).

    **Unproven.**
    - No Flow code, Story, vendor SDK or browser has run.
    - **Trial evidence is limited:** the desk code type-checks against stand-ins written from this spec, which shows the spec's words agree, not that Flow can type them. 11 "compile error" claims fire there. The agent's code was not compiled.
    - **Trial 2 ran on the record's sections 1, 2, 3 and 6: 5 of 8 right first time** ([merged/streams/trials/agent-trial-2.md](merged/streams/trials/agent-trial-2.md)); the first run had 2 of 8. It found STC1 (page order, 2.11.5), and STC2, STC4, STC5 above. It was not compiled.
    - **Whether 2.10.9's flood overflows**, traced by reading only. 1,025 frames pass Streams T6's bound only if no pull runs between them and no parked pull takes the first. Neither is stated: 2.10.17.3 says "delivered in order", and T6 has no row for an `emit` that meets a parked pull. So it is open for a `Fake.webSocket` listener that ignores `emit`'s promise, as `ChatSocket`'s does. It does not overflow where the source waits on that promise (Streams T6), as the desk's 1,025-frame Presence burst does (`merged/streams/trials/desk/features/Presence/presence.story.ts`), nor on a pulled source (Streams T4).
    - Ably's resume event, Phoenix's rejoin and Firestore's `fromCache` are unconfirmed.
    - Freeze, SSR payloads and the Persistence amendments are reasoned.
    - The model is small, and its author wrote the tables too ([merged/streams/model/v3/](merged/streams/model/v3/); the record's section 11).
    - Fourteen requirement rows pass only on a stated condition, chiefly req F9 and req F10 (`"Infinity"` sources detect no half-open connection), req C2 and req C8 (the record's section 7).
    - **Three review rounds each found a High in how the bookmark ties to memory. If a fourth turns up in real code, S15 falls back to trimmed v2 rather than adding more private state.** S16: trial 2's page-order finding is not that fourth High; its cause is a missing contract on read order, now stated in 2.11.5.

## Changes from v3

Historical, in the terms of the time: fencing, `abandoned`, the commit's `retry` and `timeout`, `failureKinds` and
`model()` named here were later replaced (see "Decisions").

Notes (removed, see [the folder README](README.md)): `prior-art/synchronous-languages.md`, `statechart-languages.md`, `durable-workflows.md`, `modal-models-p-behavior-trees.md`, `comparison/reviews/v3-amended-correctness.md`.

- One normative turn algorithm (2.5), with incarnations for fragments entered, added or reset in the same turn (synchronous R3; statechart R1).
- `resetOn` reads the source-updated memory once, in declaration order, so cycles cannot be written; it resets before parts react (synchronous R1, R2).
- `flow check` checks hosts against contract summaries, not bodies (synchronous R4).
- A child's refusal refuses the turn; the host never falls through to its next alternative (synchronous R8).
- A read-after-write lint for mappers and selects (synchronous R5).
- The mailbox is FIFO, stated in Runtime and Machines (P21) (statechart R7).
- History restores control, not data, with a warning over unkept fragments (synchronous R7).
- Pruning reads only state-token elements of guard arrays; "outstanding in the pre-turn snapshot" (v3-amended-correctness n1, n2).
- `whenAbandoned`: a leave hook that cannot refuse or move, fused into the leaving turn (synchronous R6; statechart R2; modal R6).
- List incarnations: a delivery into a dead incarnation is dropped with evidence (modal R1).
- `keep` on `.at`: frozen data with kept deadlines; signup pages use it with history (modal R2).
- Sign-in: a host-owned `Lockout` list keyed by challenge replaces `wrongAttempts` and `lockedChallenge` (modal R2).
- Failure tags are declared definite or uncertain; only definite tags retry (P14) (durable R1).
- All retries are one Attempt, acknowledged before each invocation (P15) (durable R2).
- A timeout stops waiting but keeps listening, so its real result reaches `abandoned`; an explicit cancel interrupts (P16, P17) (durable R3, R4).
- `orphaned` keeps in-flight Attempts across a version change (P19) (durable R5).
- `abandoned` may start a compensating commit, and the saga recipe is documented (P20) (durable R6).
- `model()` explores outstanding outcomes and armed timers, with `invariants` and `hot` options (T1) (modal R3). *Later
  cut: see "Changes after review".*
- New `flow check` findings and Story coverage (T2) (statechart R6).
- A warning on unhandled cross-actor sends (T3) (modal R4).
- Stateful traits, read ports, named entries and history extensions are listed as pending decisions (modal R5; statechart R3–R5).

## Changes after review

From [reviews/design-correctness.md](../../../../archive/flow-design-2026-11/machine-fragments/reviews/design-correctness.md) and [reviews/design-principles.md](../../../../archive/flow-design-2026-11/machine-fragments/reviews/design-principles.md):

- Turn (2.5): parts selected before seeding (M1); initial memory before patches, so Add-then-Strike keeps the strike (M2); all-declining falls through to ancestors (M8); a "what reads what" table; `check()` runs steps 2–6; `whenAbandoned` and pending runs after the walk; reset incarnations arm entry timers; pending resets (m2, m3).
- Dead incarnations drop only their own parts; the host's handling commits (M3).
- Summaries record per-alternative effects, timer chains and `whenAbandoned` (M4).
- A timeout stops waiting, not the call, and `.pending` holds until the real settlement; an explicit cancel interrupts (M5, m13). *Later replaced by merge 2: no Flow timeout; a soft timeout is a schedule that leaves the owner state, and `.pending` holds until the ending's turn (rules 21, 25).*
- `IdempotencyExpired` would be `unknown`, never `notSent`; the `idempotency` window is deferred with its gating (M6).
- Rule 6 covers late turns sourced by compensating commits (M7). *Later replaced by merge 2's rule 15: late turns are not transitive.*
- Minors: `whenAbandoned` not queued (m1); `keep` edge cases (m5); history warning for waiting states (m6); host raise into an absent key refuses (m7); saga reconciles and serializes (m8); per-invocation keys (m9, later removed: Flow derives no key, rule 19); `orphaned` at least once (m10); sign-in removes unlocked instances and keeps the resend cooldown (m11); `check()` codes (m12).
- Principles: a three-decision summary; `failureKinds` (later replaced by `Outcome`); `hot` in `model()`; `ignore` cut; `whenAbandoned` skips freezing; concepts named; token-first position guards; five items added to "Left out".
- Fix check: pending resets run as an immediate follow-up turn (f1); late turns include commits started in `abandoned`'s pending run (f2, later moot: `abandoned` is removed); an in-turn re-add wins (f3); sign-in notes on late success, the shared cooldown and late strikes after sign-in.
- Port kinds use one `Flow` module following Effect Schema conventions (`Flow.Guard`, `Flow.Callback`, `Flow.Exit`, `Flow.optional`, `Flow.uncertain`, `Flow.annotate`); ports hold Schema payloads rather than being Schemas; event payloads may carry Schema checks, refused at admission (2.2.1).
- Fragments keep a definition's shape, with `hostEvents`, `guards`, `callbacks` and `exits` as top-level lists named by direction; no grouping block. Memory fields carry `Flow.input`, `Flow.initial` (constant or computed) and `Flow.private`, for fragments and machines, replacing the top-level `input` and `initial`. `Flow` calls are written data-first (2.2.2).
- Placement: `Flow.state(children | {} | Sub, { traits })` on a node replaces `.at("PATH")`; `.resumable()` is a method; fillings sit at the node; signup drafts live at the root; key order, the `Flow` namespace rule and the locality rule are recorded (2.3, 2.6); `.list` is marked open (section 7).
- `.keep()` is renamed `.resumable()`: the trait resumes on return instead of restarting (SCADE 6's resume versus restart).
- `Field(schema, { validate? })` keeps the author's validator. A validator returns `true | deny(code, context?)`, the field stores the denial or null as `Flow.Denial`, and a host guard forwards it (`memory.code.error ?? true`). A Schema check fits inside a validator (`Schema.is`), so `unchecked` and `firstIssue` are gone ([reference/effect4-field-validation.md](reference/effect4-field-validation.md)).
- `.each` replaces the open `.list` draft (rule 9, 2.5, sign-in, invites): membership is host memory, decided from the turn's final list, repaired instead of refused, with incarnations kept internal ([merged/each.md](merged/each.md) and its four reviews).
- Schedules (P7): `armOn` may list `Flow.entry` to also start on entry; `disarmOn` stops a schedule; `armOn` with `restartOn` is a construction error. Event-typed triggers need no name inference ([spikes/schedule-triggers/RESULTS.md](../../../../archive/flow-design-2026-11/machine-fragments/spikes/schedule-triggers/RESULTS.md)). `schedules` keeps its name (D53).
- Schedule triggers are handlers (2.5 step 2): an event listed in an active schedule's `armOn` or `disarmOn` is handled
  there with no move when the node has no written handler, so `Countdown` loses its `Start: { target: "self" }` no-op.
  Rejected: restarting by reset alone (`Flow.entry` plus `resetOn`), because `Lockout`'s nested timer must start at
  the limit-th strike, not when `Lockout` is created; and arming from the transition (`arm:`), for the locality and
  naming costs in [spikes/schedule-triggers/RESULTS.md](../../../../archive/flow-design-2026-11/machine-fragments/spikes/schedule-triggers/RESULTS.md).
- `.each` names its list with `of`: `.each({ of: "inviteIds", max: 5 })` reads "a copy for each of inviteIds", where the
  bare first argument read as a key or an id. Rejected: `.list({ key, max })` (suggests the trait owns the list, and
  `key` already means the copy's key), a selector (`flow check` would have to run it), and a `Flow` marker on the
  memory field paired with the option (useful for narrowing and helpers, not worth a concept now).
- Model-based exploration is marked for removal (T1): `model()` and Testing O5 go, with T1's `invariants`, `hot`
  and `explore`, because exploring without a Runtime is a second execution path that must keep replay parity with
  the real one, and Flow keeps one runtime. `check()` stays: it runs the same turn algorithm inside that runtime.
  If exploration is ever wanted, it drives the real Runtime under the TestClock. Rejected: keeping O5 as inherited
  scope (restored from the archived StoriesAndModels plan, never re-decided), and extending it for server calls,
  which would simulate lanes, Attempts and late routing.
- `onLeave` is renamed `whenAbandoned`: it names the moment a life is ended by someone else, and the `when` prefix keeps it apart from the `on…` callbacks it fires.
- Merges 1 and 2 merged on 2026-10-30 (section 2.7, rules 13–25, C1–C18; the memory views of 2.5 after
  [merged/server-calls/reviews/memory-reads.md](merged/server-calls/reviews/memory-reads.md)). Their decisions follow.
  One deviation from merge 2's text: its amendment table said selects are computed in step 4; its rule (now rule
  22) and the memory-read review say step 5, after every patch, and the design follows the rule.
- **Revision (multiplicity audit, 2026-10-31)** ([audit-multiplicity.md](../../../../archive/flow-design-2026-11/machine-fragments/audit-multiplicity.md)): rules N1–N3; lanes
  as `s.calls` with the per-call members decided by concurrency (rule 21, 2.7.3, 2.7.5, 2.7.8); `cancel` over every
  outstanding Attempt (rule 24); a retry of an outstanding Attempt is `Rejected` in every mode (rule 16); copy-started
  calls and `laneKey` (rule 9, 2.7.2, 2.7.3; items 6 and 15 closed); one ending per `fetch` (2.7.9); keyed schedules' repeats and restore (rule 23); keyed activities (2.7.10); C8, C19, C20; decisions D18–D21.
- Merge 4 merged on 2026-10-30 ([merged/entities.md](merged/entities.md)): section 2.8, rules 26–38, C21–C30; amended rules
  13, 14, 16, 18, 20–22, 24 and N3, 2.5 steps 1, 5 and 6 (every start is decided in step 5, before publication), 2.7.1,
  2.7.2, 2.7.3, 2.7.5, 2.7.8, 2.7.9, 2.7.11, 2.7.12, 3.4, C2, C4, C10, C15, C17, C18 and the Machines O1 row;
  decisions E1–E18; section 7 items 10 and 14 closed, item 17 added. Stories-dependent parts are marked *Story reads:
  merge 3*.
- Merge 5 merged on 2026-10-30 ([merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md)): 2.8 amended
  (predicted fields' functions, the list's `likes` line, whole-value settlement); rules 34 and 35; C18, the Package O1
  row and a pointer to its plan amendments in section 5; decisions M5-D1–M5-D10. Its rules A1–A12 go to
  `entity-domain.md` section 9.
- Operations in the definition merged on 2026-10-30
  ([merged/operations/proposal.md](merged/operations/proposal.md), revision 13; decisions OD1–OD26; plan
  [merged/operations/merge-plan.md](merged/operations/merge-plan.md)):
  operations declared once under `operations` with `outcomes`; the verbs `commit`, `lookup`, `subscribe`; `s.operations`
  and `O.x.get`; contracts with `input`, `output` and a required field-list `key`; the write lane owned by the Runtime
  (2.7.13); `UnresolvedHold` (2.7.14); lane persistence (2.7.15); tooling (2.7.16); rules 2, 8, 9, 13–25, N1–N3 and
  26–38 amended, rules 39–47 added; 2.5 steps 1, 2, 5 and 6; section 4; C2, C5–C8, C10–C12, C17–C20, C22–C25, C28–C30,
  P15, P19, P20 amended and C31–C53 added; section 7 items 0, 6, 11, 15, 16 amended and 18, 19 added. OD23 is applied as
  decided (the proposal had left it open). Examples rewritten: 2.7.3–2.7.10, 2.8.2, 2.8.3, 2.8.7, 2.8.9, 3.1 (from the
  record's 5.2), 3.2 and 3.4 (both re-walked against `UnresolvedHold` and rule 20), and 3.6's keywords. The owner's
  answer to Q1 is OD26: `writes` is the operation's option, `optimistic` the commit's only one (2.6, rules 26, 36, 2.8.3,
  2.8.9, 3.4, C15).
- Operations in fragments merged on 2026-10-31 ([merged/fragment-operations/proposal.md](merged/fragment-operations/proposal.md), revision 3; decisions F1–F10; plan
  [merged/fragment-operations/merge-plan.md](merged/fragment-operations/merge-plan.md)): fragments declare and alone act
  on `operations` (rules 48–50); write lanes keep their identity and record a subject path (rule 51); reads end with
  their incarnation, a freeze ends lookups `Interrupted` (rule 52); endings go to the incarnation with the path, parked
  meanwhile (rules 53, 54); hold checks inside the fragment and at the host (rules 55, 56); summaries carry operations
  and requirements (rule 57); release on leave (rule 60); 2.9 added (its examples in a second change set); rules 1–4,
  6, 8–17, 20–24, 26, 27, 37, 40–47, N1, N3, 2.1–2.6, 2.5 steps 1, 3, 5, 6, 2.7.3, 2.7.12–2.7.16, 2.8.4, 3.6, sections
  4, 6, 7 amended; C54–C68 added.
- Stories (merge 3) merged on 2026-10-31 ([merged/stories/proposal-v2.md](merged/stories/proposal-v2.md), revision 3;
  decisions Stories T1–T7; plan [merged/stories/merge-plan.md](merged/stories/merge-plan.md)): rules 61–66 (settling,
  fakes, data, cuts, addresses, owners); 2.10 added (its examples in a second change set); rules 11, 17, 21, 47, 58,
  2.4, 2.5, 2.7.2, 2.7.3, 2.7.11, 2.7.13, 2.7.16, 2.8, 3.6, sections 5–7 amended; C16, C27, C30, C51, C53, C63, C64,
  T1 and T2 amended; C69–C85 added; section 7 items 17 and 19 closed, item 21 added; every merge 3 mark for Story reads
  resolved. Streams (merge 6) was not merged then; its rules were to renumber from 67, and Stories' stream parts were marked for it.
- Stories, amended, merged on 2026-11-01 ([merged/story-checks/stories-amended.md](merged/story-checks/stories-amended.md), [merged/story-checks/fakes-v2.md](merged/story-checks/fakes-v2.md); decisions SC1–SC5,
  W1–W43; plan [merged/story-checks/merge-plan.md](merged/story-checks/merge-plan.md)): a Story holds inputs and checkpoints, and tests use the runner's `expect` over checkpoint reads; `Story.app`,
  `Story.machine`, `Story.fragment` replace `Story.make`; rules 11, 61–66 and 2.10 rewritten; rules 21, 58, 2.7.11, 2.8, 3.1, 3.2, 3.6, sections 5 and 7 amended; C16, C63, C69–C75, C77, C79, C81,
  C82, C84 amended. The `.plan` files are still owed (the plan's 2.7). Streams (merge 6) was still not merged.
- Streams (merge 6) merged on 2026-11-01 ([merged/streams/proposal-v3.md](merged/streams/proposal-v3.md); decisions S1–S16; plan [merged/streams/merge-plan.md](merged/streams/merge-plan.md)): 2.11 and rules 67–72 added; rule 25 amended (S15); rules 8, 13, 14, 20, 37, 39–42, 47, 52, 57, 65, N3, 2.5, 2.7.3, 2.7.6, 2.7.8, 2.7.10, 2.7.13, 2.7.15, 2.7.16, 2.8, 2.10, 3.6, sections 6 and 7 amended; C57, C79 amended, C86–C102 added; section 7 item 9 closed, item 23 added; every mark for stream text resolved. The `.plan` files are still owed (the plan's 2.7).

## Decisions

Settled by the owner or under the owner's delegation, with the reason each wins and what was rejected. Merge 2's decisions keep their numbers D1–D17, merge 4's E1–E18, the operations merge's OD1–OD26, operations-in-fragments' F1–F10, Stories' T1–T7 (cited "Stories T*n*"; a bare T*n* is a tooling row of section 5) amended Stories' SC1–SC5 and W1–W43, and streams' S1–S16, which
their rewrites, spikes, models and later proposals cite; they are not the problems D1–D7 of section 4.

### Outcomes (merge 1, [merged/outcomes.md](merged/outcomes.md))

- **Commits end in three channels: success, failure, unknown.** A machine needs one thing from a commit: what is now
  true on the server. Of the plans' five endings, `interrupt` and `defect` were Effect mechanics, not answers: an
  interrupt is either "never sent" or "may have happened", and a defect is a bug whose effect on the server is
  unknown. They became unknown reasons; v4's `notSent` became the failure reason `NotSent`.
- **Classification happens in the commit, with `Outcome.*`; plain errors default to failure.** Only the author who
  has read the API knows what an ending means, so the decision sits where the request is made. Rejected:
  `failureKinds` on the descriptor (a list away from the code that produces the errors, against locality); Flow
  reading HTTP statuses or network errors (Flow is not a network library, and many APIs are poorly designed and
  typed); a marker property on the error class, like Effect's `isRetryable` getters (workable and native, but the
  owner chose an explicit classifier at the point of failure); Effect's `Die` as the unknown channel (untyped, and it
  means "bug"); `Cause` annotations as the marker (not part of the error type, so neither typed nor exhaustive); raw
  TypeScript brands (replaced by `Data.TaggedError` wrappers, so the channels are real Effect errors: yieldable,
  catchable and visible to Effect's combinators).
- **`Outcome.failure` and `Outcome.unknown` return error values**, not `Effect.fail(…)`, so one spelling works in
  `yield*`, `catch:` and `mapError` (checked on Effect 4.0.5, [spikes/outcome-channels](../../../../archive/flow-design-2026-11/machine-fragments/spikes/outcome-channels/outcome.ts)).
- **`Outcome.success` stays**, for symmetry only; a plain `return` means the same.
- **No `flow check` warning on unwrapped typed errors.** `outcomes.failure` is exhaustive, so an unwrapped error meant
  as unknown appears there by name and must be handled as a failure, where the author sees it.
- **The cache follows the channel.** Unknown keeps the optimistic look, marked uncertain, and refetches the displayed
  entries once; failure removes it with no repair refetch; reads keep two channels, because a read changes nothing.
  Replaced: `revertOnUnknown`, and Operations O5's "unknown retains them and invalidates".
- **Amended by merge 2** (its 6.4): failure describes one send, and the Attempt's ending is rule 18 (`StillUnknown`);
  `Timeout` is dropped; `NotSent` gains `why`; `failure.NotSent` is optional in the type; `O.x.retry(attempt)` is
  replaced by the commit value's `.retry`, and after a definite failure by a new write; merge 1's automatic
  `retry: { on }` goes with every Flow retry (rule 25). *Rule 25 later allows one thing: a stream's declared connection (S15).*

### Server calls (merge 2, [merged/server-calls/proposal.md](merged/server-calls/proposal.md))

- **D1 Endings map to author-declared events through `outcomes`.** `success:`, `failure:` (exhaustive by tag) and
  `unknown:` map onto events the definition declares. Author names read as the domain (`Declined`, `Unsure`) and
  several endings may share one event. Consequence: one declared event and one mapping line per distinct ending.
  Rejected: derived events (`pay.Busy`, fewer lines but not author-named), a `calls` definition category, and endings
  as inline transitions under the call. *Superseded in part by OD3, OD17 Q16 (operations merge): the mapping is on the definition's operation.*
- **D2 No `abandoned`.** An ending that arrives after its owner state was left routes the same mapped event from the
  nearest surviving ancestor (rule 14). Consequence: the "after leaving" reaction is a handler on an ancestor.
  Rejected: a second mapping table, which builds copied and let drift; choosing between `outcomes` and `abandoned` at
  settlement, which lost a queued wrong-code strike (spike P1); and both tables chosen at admission, which dropped an
  unknown after Leave where `abandoned` mapped only `success`.
- **D3 `Flow.uncertain` is kept.** `unknown:` may target only an event marked `Flow.uncertain`, so the property sits
  on the event it describes. Rejected: dropping the marker.
- **D4 The commit value is the handle.** Listed in `actions` it starts a write; its members are `retry`, `cancel`
  (actions), `idle` (a guard) and `pending`, `retryCount` (reads). Starting is static. Consequence: a re-send can
  never miss its mapping. Rejected: `O.x.retry(attempt)` on the descriptor, which five builds spelled five ways, two
  with no mapping at all. *Superseded in part by D18 (2026-10-31): the reads `pending` and `retryCount` leave the
  commit value for snapshot data; `retry`, `cancel` and `idle` stay.* *Superseded by OD3, OD17 Q15: the operation's handle `O.x` is the handle; starting stays static.*
- **D5 Declines are endings; refusing the transition is explicit.** Under `reject`, a busy lane refuses only the
  write and ends `NotSent { why: "Rejected" }`; `pay.idle(key)` is the explicit guard, with the code `InFlight`.
  Concurrency is the transaction's required choice, so a button that should send every press uses `allow` or
  `serialize`. Consequence: a network lane never blocks a transition's other effects. Rejected: an implicit guard
  from `reject`, which would refuse an autosave's keystroke while a save is in flight, and a hidden guard breaks
  locality; a silent decline, which left a state waiting forever (spike P5). *Spelled `O.pay.idle(k?)` after the operations merge (OD17 Q15).*
- **D6 The machine reads a lane through `pending` and `retryCount`.** The write reaches the machine through the
  mapper, and the last ending through its own event's handler. Rejected: a readable record
  `{ pending, attempt, sends, last }` (the builds only read "is it busy" and "how many tries"), and the names `sends`,
  `attempts`, `attemptCount`, `sendCount`, `tryCount`. *Superseded in part by D18 (2026-10-31): the same two facts,
  and still nothing else, are read as snapshot rows, not through the commit value.* *Rows are `s.operations` and `O.x.get` after the operations merge (OD17 Q15).*
- **D7 Keys are optional.** A transaction without `key` has one lane per actor and its members take no key.
  Rejected: making keys mandatory. *Superseded by OD15: `key` is required on every contract.*
- **D8 The idempotency key is `attempt.id`, and a definite failure is tried again as a new write.** `pay.retry`
  re-sends the same write after an unknown so the server dedups; after a definite failure a new write gets a new id,
  so a server that stores failures cannot replay one. Consequence: a budget across definite failures lives in memory.
  Rejected: a Flow-derived key (`${id}~n`; Flow would choose a protocol the server must understand); a fresh key on
  every send (a re-send after an unknown would charge twice); the same id after a definite failure (a stored 403 or
  503 is replayed to every re-send, spike P6).
- **D9 Two commit values of one transaction share a lane, and the lane remembers its starter.** Consequence: `reject`
  still guarantees one write in flight per key. Rejected: a lane per commit value (two charges for one intent), and a
  `flow check` warning on two commit values of one transaction. *Superseded in part by D20 (2026-10-31): each Attempt,
  not the lane, remembers its starter.* *Superseded by OD9 Q4: one write operation per contract (`SharedContract`).*
- **D10 `StillUnknown` has no author override.** A definite failure after an unknown send of the same write stays
  unknown; a server that replays its original decline is confirmed by a read. Rejected: an override, which would put
  configuration on the error; and keeping failure definite per send with only `mayHaveApplied` for the author, which
  let a give-up say "not charged" and charge again (spike P2).
- **D11 A settled lane is evicted.** Reading it gives `pending` false and `retryCount` 0, as a fresh lane does, so
  eviction cannot be observed; a lane holding a failed or unknown Attempt is kept for `retry`. Consequence: memory
  stays bounded for unbounded keys, with no new option. Rejected: a required `max` like `.each`, and keeping every
  lane. *Superseded in part by D19 (2026-10-31): an evicted lane has no row, the same as one never started.* *Superseded by OD9 Q2, OD19: a lane is removed when `Idle`; `get` reads the idle row.*
- **D12 The machine-wide rules were reviewed.** Rules 22 and 23 and keyed schedules change every machine, not only
  calls; they came with merge 2 so the calls design reads as one piece, and were reviewed before merging
  ([merged/server-calls/reviews/memory-reads.md](merged/server-calls/reviews/memory-reads.md)); the answer is D15 and
  D16. Rejected: a separate Machines proposal before the review.
- **D13 Every late event must be handled.** A missing late handler is a `flow check` error; `{ target: "self" }` is
  the explicit ignore. Flow cannot tell which late failures matter: in sign-in, a late `WrongCode` is a strike, and
  dropping it would let a guesser submit, press Back and guess again without limit. Consequence: one line per late
  event the author chooses to ignore. Rejected: late failures optional and dropped with evidence (the brute-force hole
  is invisible), and requiring handlers only where the current handler writes memory (less predictable). *Extended by OD22: adopted endings are handled over the arrival set (rule 20).*
- **D14 Amendments to other documents are grouped by target.** Now section 5's C rows, so each plan owner reviews
  their part and the `.plan` edits are mechanical. Rejected: moving each group into the document it amends.
- **D15 Memory reads: before for decisions, after for effects** (rule 22). One value for every read is impossible
  (guards and patch-feeding reads would be circular), and this is the smallest split that writes and sends an etag in
  one transition and reads `Retry-After` in the schedule armed by the same turn. Most of it names what v4 already did
  (`restartOn`, activity params, `.each`, the `resetOn` re-check read after); only commit selects move, and schedule
  functions and callbacks go from unspecified to after. Consequence: a select can no longer read the value its own
  turn replaced. Rejected: everything before (brings back the stale etag and the zero `Retry-After`, and is not true
  of `restartOn` or `.each`); everything downstream of the source sees its patch (reverses Machines O3, so mappers lose
  the old value, and changes every part guard).
- **D16 A lint for two values in one transition.** `flow check` warns when one transition reads, in both views, a key
  it writes. It extends the existing "reading the same key twice" warning to the one trap D15 leaves. Rejected: no
  warning.
- **D17 A `NotSent` mapper's `input` and `attempt` are optional.** A declined start has an input but no Attempt, and a
  retry with nothing to re-send has neither; every other mapper's context stays complete. It is honest about the one
  ending that can lack a write, and the type makes the author check. Rejected: `NothingToResend` as a guard verdict
  like `idle` (breaks D5), and forbidding `retry` where no current write is guaranteed (not analysable in general). *Amended by the operations merge: `input` is always present (`NothingToResend` is evidence); `key` replaces `laneKey`.*
- **Also rejected** (merge 2 section 9): late turns transitive (the refund's ending could not leave REFUNDING, spike
  P4); Flow treating 409 or 429 "in progress" as unknown (Flow would read statuses); keeping a call pending until "the
  server finished" after a cancel (no browser API reports it; the clean-up is keyed by the Attempt instead); `now` in
  guards for lockouts (`check` would depend on the clock; keyed schedules keep it pure); polling as a transaction
  (each GET would mint an Attempt and have an unknown channel a read cannot have); per-item results in one success
  value (per-item unknowns get no cache rule).

### Multiplicity audit ([audit-multiplicity.md](../../../../archive/flow-design-2026-11/machine-fragments/audit-multiplicity.md), 2026-10-31)

**Revision (multiplicity audit, 2026-10-31).** Made by the audit under the owner's brief; each awaits the owner's
confirmation (the audit's section 5).

- **D18 Lanes are snapshot data, `s.calls`, beside `s.activities`; the commit value keeps `retry`, `cancel` and
  `idle`** (supersedes the read half of D4 and D6). Reason: correctness first. A read of a lane by an actor that does
  not declare the operation is a type error, because `calls` is typed by the snapshot's own definition; a lane that
  does not exist is absent, not "idle"; a view, a guard, `check()` and a Story read the same published rows; "this
  call" and "anything on this key" are told apart by the row's type (D20). Locality: lane state is a fact about the
  actor, so it lives on the snapshot with the activity lanes, and commit values stay in the machine body where their
  selects are typed. Consequence: a keyed read is a `find` over plain data, as copies and keyed schedules already are;
  guards receive `calls`. Rejected: (A) commit values exported at module scope (breaks locality and select typing);
  (B) a descriptor read `O.x.pending(s, key)` (silent wrong-actor and never-started reads; brings back the read C7
  removed); (C) `Machine.lanes.x.pending(s, key)` (correct, but a namespace and a call where data suffices); keeping
  `pay.pending` beside `s.calls` (two spellings of one fact). *Superseded by OD17 Q15: `s.operations` and `O.x.get`.*
- **D19 An absent lane has no row** (supersedes D11's read sentence). An evicted lane and one never started are both
  absent (rule N3); under `allow` and `serialize`, where nothing is retained for `retry`, a lane is evicted as soon as
  nothing is outstanding. Reason: a default that looks like a lane hides a wrong key. Consequence: readers write
  `?? false` or `?? 0` where they mean it. Rejected: keeping "reads as fresh", which made a lane that will never exist
  indistinguishable from an idle one. *Superseded for write lanes by OD4, OD9 Q2: `O.x.get` reads the idle row for a key with no lane (rule N3).*
- **D20 Concurrency decides which per-call members exist** (rule N2; supersedes D9's "the lane remembers its
  starter"). Under `reject`, `latest` and `cancel` a lane has one addressable Attempt, and `retry`, `retryCount` and
  `progress` address it; under `allow` and `serialize` they are type errors, and a call that needs them gets its own
  key and `reject`. Each Attempt remembers its starter, lane key and copy. `cancel` aggregates over every outstanding
  Attempt; a retry of an outstanding Attempt is `Rejected` in every mode. Reason: under `allow` the old "current
  Attempt" made `retry` re-send the newest write while the older one's unknown went unreconciled, and `retryCount`
  and `progress` described the wrong write (the audit's F1). Consequence: concurrent sends with per-message status,
  several uploads and per-item batch retries are written with per-call keys and are correct by construction; `retry`
  inside one `serialize` lane is not expressible (audit F15, for the owner). Rejected: picking "the oldest unknown" or "the
  Attempt of the ending's own turn" as the target (clever rules no reader can predict), and an Attempt-addressed retry
  now (a second retry shape, against D4, with no case yet). *Superseded in part by OD7, OD19: the `serialize` head is addressable; `cancel` acts on one Attempt; no starter.*
- **D21 Calls started in `.each` copies, and `laneKey`** (closes section 7 items 6 and 15). The Attempt carries its
  copy's key and incarnation; call endings are never dropped; every mapper receives `laneKey`, and `key` stays the
  copy's key. Reason: rules 8 and 17 promise every ending, and a retry from the host must still reach the copy that
  started the write; a `NothingToResend` must name its row. Rejected: dropping copy endings with evidence (breaks rule
  17); naming the lane key `key` (already the copy's). *Moot after the operations merge: the Attempt carries no copy key, and `laneKey` is `key` (rule 9).*

### Entity domains (merge 4, [merged/entities.md](merged/entities.md))

Settled by the owner on 2026-10-30 (the whole of merge 4, with every recommendation of its section 9). Its numbers
E1–E18 are kept, because its rules, merge 3, merge 5 and operations-in-definition cite them.

- **E1** One split: the domain owns shared data, the commit value owns workflow; memory never mirrors a record (rule 26). *After the operations merge: the operation and the machine own workflow (OD3).*
- **E2, E7** One retry shape, `x.retry(key)`: the identical request, no new prediction, joins the record queue,
  positioned at the first send (rule 31). *Superseded in part by E17 (2026-10-31): `x.retry(key)` exists only where
  the lane has one addressable Attempt.* *Spelled `O.x.retry(k?)`; a retry outside `Held` is evidence (OD10).*
- **E3** `uncertain` is per record and Attempt; a successful retry or a later successful write clears it; a read never
  does (rule 32). *Amended by OD19: a later write's success clears only marks whose Attempt is resolved or released (rule 32).*
- **E4, E13** The store applies endings at settlement (rule 18 decided there); the lane changes at admission; routing
  never changes store effects (rule 27). A start publishes its prediction with its turn (rule 28). *Amended by OD19: an unbound lane changes when the Runtime applies the ending's cell (rule 27).*
- **E5, as corrected** The actor decides whether a start runs, the record queue when it is sent; `latest` joins the
  queue and supersedes by removal; `concurrency: "cancel"` on a predicting write stays a `flow check` error, while the
  `.cancel(key)` action is allowed under rule 24 (rule 29). *`cancel` acts by the table (OD7); a replaced write is evidence `Superseded` (OD5).*
- **E6** `reject` is an ending; a Rejected start applies nothing (rules 16, 28).
- **E8** The store follows the Attempt's ending after `StillUnknown` (rule 30).
- **E9** No temporary ids; pending creates are memory drafts (rule 33).
- **E10, as corrected** A write predicting one record uses that record's key as its lane key; `flow check` warns on a
  different declared key (rule 34). *Superseded by OD15: every write states `key` (rule 34).*
- **E11** Queue overflow ends `NotSent { why: "Overloaded" }` for that write only (rule 35).
- **E12, as corrected** `optimistic` reads the starting turn's after memory, captured; `writes` reads `{ value, input }`
  only; domain operations keep `writes` for `invalidate` only (rule 36). *Amended by OD26: `writes` is the operation's option, `optimistic` the commit's only option.*
- **E14** A lane, its Attempt and its predicted keys persist in one capture (rule 38). *Amended by OD20: the lane record's capture (rule 38).*
- **E15, as corrected** Read call values carry confirmed data; `Defect` and `Interrupted` arrive on `failure` and must be
  mapped (rule 37).
- **E16, as corrected** The record read and the resource/answer lane read rename `pending` to `predicted`.
- **Lane lifetime** Lanes holding an unknown Attempt are kept (D11), with evidence added so they are visible. *Superseded by OD19, OD20: lanes are Runtime records, kept while not `Idle`; Inspection lists them by identity.*
- **E17 (Revision (multiplicity audit, 2026-10-31); supersedes part of E2, E7).** `x.retry(key)` addresses the lane's one addressable Attempt, so
  it exists only under `reject`, `latest` and `cancel` (rule N2, D20); a domain write retried under several
  concurrent calls takes a per-call key and `reject`. The list's `createIssue` is `reject` per draft (2.8.2). Reason:
  under `allow` the lane's "current" Attempt was the newest create, so a retry re-sent the wrong draft's write
  ([audit-multiplicity.md](../../../../archive/flow-design-2026-11/machine-fragments/audit-multiplicity.md) F1). Views and guards read lanes as `s.calls` rows (D18);
  the `NotSent` mapper's `laneKey` names the draft (D21), so `CreateFailed.draftId` is never `null`. *Amended by OD19: also the `serialize` head (rule 31).* *Rows are `s.operations`; `laneKey` is `key` (X30).*
- **E18 (Revision (multiplicity audit, 2026-10-31); new).** A prediction over a record the store does not hold shows nothing and waits for a base;
  an uncertain mark holds its record (rules 30, 32). Reason: a patch replayed over a deleted or never-loaded record had
  no defined result, and a collected record lost its mark (audit F12). Merge 5's replay rule needs the matching
  sentence (audit section 4).

Not caused by server calls, and recorded only to correct merge 2's example: E1's "memory never mirrors a record" and E9
were already required by EntityDomains (D1, O1).

**Also rejected** (merge 4 section 8):

- **Memory as an equal owner** (LIST as written). Two truths for one record, and no rule says which a view reads
  (A-H1). Rejected for rule 26.
- **Store effects at admission.** One actor's mailbox would gate every screen's view of a shared record, and a
  disposed actor's write would never confirm. Rejected for rule 27.
- **The lane changes at settlement.** `pending` false before the ending is handled let a timeout say "not charged"
  for a charge that landed ([merged/server-calls/proposal.md](merged/server-calls/proposal.md)). Rejected; merge 2 already rejected it.
- **Retry with a fresh `basedOn`** (REV:44-45). Changes the request under the same idempotency key. Rejected for 2.8.6.
- **Retry re-applies the prediction.** Shows a value the forced repair just contradicted. Rejected.
- **Retry's response by its own position.** Overwrites a newer confirmed write whenever the server replays a stored
  response. The first-send position plus the existing contest rule is right in both server behaviours. Rejected.
- **`latest` bypasses the record queue** (2.7.12 as written). Sends over an unrepaired uncertain record (F-H3).
  Rejected.
- **Temporary ids with re-keying** (TanStack DB's model). EDP C1 forbids instant inserts (EDP:189-192). Rejected.
- **A read clears `uncertain`.** It cannot prove the lost request will not still run (ED:656-658). Rejected.
- **Overflow rejects the batch** (OPS:96-97). Breaks rule 16: a lane must not refuse a transition's other effects.
  Rejected.
- **Rename the lane's `pending`** instead of the record's. The lane name is in rules 16, 21, D5, D6 and every rewrite;
  the record's is in one plan line and its design. Rejected.
- **Key from `.one(Entity)`** (E10 as proposed). Not available at start (2.8.8). Replaced by the predicted record key.

### Entity analysis (merge 5, [merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md))

Settled by the owner on 2026-10-30: the proposal is accepted as written, with these decisions.

- **M5-D1 Scope.** Entity domains are client coherence (one store across screens) plus honest optimistic writes, not a
  sync engine (sync engines plug in through `references/design/sync-engine-adapter.md`). The exact client semantics of
  condition operators stay: a condition the client evaluates differently could skip a refetch a list needed, so
  exactness protects coherence; it is kept because it is correct, not as a server-agreement guarantee.
- **M5-D2 Effect's comparators.** Client-side ordering uses Effect's `Order.Date`, `Order.Number` (after a finiteness
  check, since `Order.Number` ranks NaN below every number, `node_modules/effect/src/Order.ts:183-187`) and
  `Order.mapInput`, not hand-written comparators ([prior-art.md](merged/entity-analysis/prior-art.md)).
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
  *Rejected:* forbidding array keys; deciding at start from the value. *Its "never takes merge 4 rule 34's default" clause is moot (OD15).*
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

### Operations in the definition (operations merge, [merged/operations/decisions.md](merged/operations/decisions.md))

Settled by the owner, OD1–OD18, OD23 and OD26; OD19–OD22 and OD25 are behaviour the owner delegated to the main session; OD24
is the process under which this merge was approved. The numbers are kept, because merge 6, the RPC exploration,
operations-in-fragments, the lane model and the reviews cite them.

- **OD1** The retry budget guard takes a named option, following Effect's `Effect.retry({ times })`: `O.pay.retryable({
  times: 3 })`, or `O.post.retryable(selectKey, { times: 3 })` for a keyed lane. `times` counts re-sends after the first
  send, which is what `retryCount` counts. Replaces revision 3's `retryable(n, k?)`. (2026-10-30)
- **OD2** Machine verbs are the contract's own function names, not new words: `O.pay.commit(select)` for a write,
  `O.read.lookup(select)` for a one-off read, `O.feed.subscribe(select)` in `activities` for a live resource or a
  stream. Different names signal different intent. Revision 3's `start` and `params` are dropped. These are
  `Operations.plan` O2's existing words (`lookup`, `subscribe`, `refetch`); O6's `descriptor.get(snapshot, params)` is
  the prior art for `get`. Which verb is used decides one-off or live, not which outcome key is mapped. (2026-10-30)
- **OD2a** A live resource and a stream both use `subscribe`, as `Operations.plan` O2 already has it. `watch` for
  resources was considered and rejected: the act (hold it while the state is active) is the same; the kind differences
  (gaps, recovery by `refetch` vs automatic reconnect, row shape) are already checked by the declaration's outcome keys,
  the members and the row types. (2026-10-30)
- **OD3** Unify the declaration only. Every kind is declared by name under `operations`, mapped with `.outcomes`, and
  used through `O`. Behaviour, rows and rules stay per kind (transaction, resource, stream); they are not made uniform.
  (2026-10-30)
- **OD4** Review 3's K3: a contract's `key` is a list of top-level input fields, `key: ["docId", "field"]` (composite
  keys list every field), like `primaryKey`. Its Schema is the input's pick of those fields. A domain write defaults to
  the entity's primary key, checked at the operation. Members and `get` accept any value that carries the key's fields
  (`O.post.get(s, msg)`). Inside an ending's handler, `retry`, `retryable` and `cancel` with no key address that
  ending's Attempt. Derived or nested keys need the input reshaped. (2026-10-30)
- **OD5** Review 3's K1, the owner's recommendation (prior art: RxJS `concatMap` over `switchMap` for writes, TanStack
  mutation `scope`, Replicache/Firestore ordered write queues, Stripe idempotent retry until known): only a never-sent
  start is replaceable. A sent Attempt's ending is always delivered. A retained unknown holds its lane: under `latest`
  the waiting start stays waiting, under `reject` a start ends `Rejected`, until `retry` resolves it or `cancel`
  releases it. The addressable Attempt is the oldest unresolved sent one. Under `cancel` concurrency, an Attempt
  interrupted by a newer start is evidence only. The write row gains `uncertain` (merge 4's word), true while the lane
  holds an unknown. Version preconditions (`If-Match`) remain a contract-level option on top, not a replacement.
  (2026-10-30)
- **OD6** Review 4's K4: the hold stays the default (no quiet release, no automatic retry). `flow check` reports
  `UnresolvedHold` when a path can leave a write's unknown neither retried nor cancelled, read from the machine's
  tokens. The write row gains `waiting` (a commit queued behind a held unknown). (2026-10-30) *Narrowed by F9: a declared release on
  leave (rule 60).*
- **OD7** Review 4's K5: `cancel` acts on the same one Attempt as `retry`, the oldest unresolved sent one; after it is
  released, the waiting commit is sent. `cancel` never silently drops a waiting commit. (2026-10-30) *Narrowed by F9: a release on leave
  ends queued commits as evidence (rule 60).*
- **OD8** Review 4's K6: a key-less member on an unkeyed operation always names its one lane. On a keyed operation it is
  allowed only in a handler of an event that this operation alone maps, and names that ending's Attempt; anywhere else
  it is `KeyRequired`. (2026-10-30)
- **OD9** Section 11 round 1, all option A: Q2 (write lanes per operation and key, created by work), Q4 (one write
  operation per write contract, a `SharedContract` error otherwise), Q6 (a one-off read delivers only its latest
  lookup), Q7 (a bare write's results are evidence only), Q21 (a one-off read's row is OPS O6's resource lane), Q22
  (`O.x.subscribe.each(select)`), Q23 (`VerbMismatch`, and `cancel` on a one-off read; amends OPS O7), Q26 (one-off read
  lanes are not persisted). (2026-10-30)
- **OD10** Review 5: the next revision states the write lane as an explicit state machine (states `Idle`, `InFlight`,
  `Held`, each with an optional waiting commit; a table of every member and ending against every state; `pending`,
  `uncertain`, `waiting` defined as functions of the state; `UnresolvedHold` as a check over that graph), and applies
  review 5's rule cuts. (2026-10-30)
- **OD11** Contracts keep their function inline (`commit`, `lookup`, `subscribe`), calling user services whose Layer is
  the swap point. Contracts as pure data implemented by a Layer per contract (the RPC exploration's design C,
  `contract.toLayer`) is rejected. (2026-10-30)
- **OD12** Every contract kind (transaction, resource, stream) has exactly two schemas, flat at the contract's top
  level: one for what goes in and one for what comes out. No nesting under the function, and no third `params` schema.
  `key` names fields of the in-schema; a stream's resume position is an ordinary in-field outside the key; errors stay
  `Schema.TaggedError` classes typed through the function's Effect. Names: `input` and `output` on every kind (`result`
  renamed to `output`; mapper context `{ params }` becomes `{ input }`). (2026-10-30) *Its stream clause is overturned by S15: a stream's position is Flow's bookmark, not an in-field (rule 71). The rest stands.*
- **OD13** Effect RPC: the core contract stays `input`/`output` plus its function, with no Rpc inside (Rpc is
  `@stability unstable` in 4.0.5 and adds wire machinery Flow does not need). An opt-in `resource.fromRpc` /
  `transaction.fromRpc` adapter, taking an existing `Rpc` for its schemas and mapping a client error to `unknown`, comes
  later when a real app needs it. (2026-10-30)
- **OD14** `input` and `output` accept either a fields record (`{ q: Schema.String }`, wrapped as `Schema.Struct`) or a
  full Schema (for unions and classes), as `Rpc.make`'s `payload` does. (2026-10-30)
- **OD15** `key` is required on resources and transactions; there is no default. One lane or one cache entry is written
  `key: []`. This replaces the "default to every input field" proposal and revision 5's domain-write primary-key default
  (a domain write states its key too). Streams: not yet decided. (2026-10-30)
- **OD16** Review 6's K13–K16 are applied as definitions: the table's cells apply in step 5 in action order; `keys` and
  published rows read the after lanes; `UnresolvedHold` sees commits already waiting; one name per distinct thing; the
  amendment list to MD and merge 4 is completed. Then one more review. (2026-10-30)
- **OD17** Section 11 rounds 4 and 5, all option A: Q12 (persist write lanes by contract id and key), Q13 (`restartOn`
  per key on keyed schedules, `armOn` banned there), Q14 (`DuplicatePlacement` unless state tokens make placements
  exclusive), Q15 (names `outcomes`, `get`, `O`), Q16 (mappings only on the definition, for now), Q17 (cache verbs
  `invalidate`, `clear`, `setData` on the contract, in actions), Q18 (`*.contracts.ts`), Q19 (operations in fragments
  deferred to their own exploration). (2026-10-30) *Q19 answered by F1–F10.*
- **OD18** Q37 (2): a transaction's `progress` keeps its own schema, the one named exception to OD12's two schemas (it
  is the commit's side channel, not in or out). (2026-10-30)
- **OD19** Behaviour, delegated by the owner to the main session ("whatever is still open in terms of behavior"); API
  and public-syntax changes stay with the owner. Taken: Q28 A (the table's cells as recommended), Q31 A (two tabs: a
  stated limit), Q32 A (rebase across the lane's own writes; its owner may move to merge 4's record queue per review 7's
  K20), Q35 A (per-item stops use a keyed design; on `serialize`, key-less members only in the head's own ending
  handler), Q9 A, Q10 A, Q20 A. Review 7's H1: write lanes are owned by the Runtime, not the actor (TanStack Query's
  `MutationCache` model): disposing an actor never drops or cancels its sent, held or queued writes; a later actor of
  the same definition rebinds them by (contract id, key). Left to the owner as API questions: Q29, Q33, Q34, Q36, Q37
  (1), Q38. (2026-10-30)
- **OD20** Behaviour, delegated (as OD19), from review 8 and the lane model (lane-model/RESULTS.md): a lane's identity
  is (Runtime O3 actor identity, contract id, key), so a new actor adopts only its own identity's lanes; lanes are
  Runtime records, captured and acknowledged per lane; `UnresolvedHold` counts an unhandled arrival as keeping the hold;
  the storage acknowledgement is per Attempt; a held unknown is delivered exactly once on rebind or restore, as `unknown
  { Restored }`; a storage-refused re-send re-delivers the mapped `unknown` with reason `StorageRefused`; under `latest`
  a commit replacing a never-sent head becomes the head; Runtime disposal starts no new invocations and ends queued
  commits `NotSent { Disposed }`; lanes are never hydrated from the server; a released Attempt landing late stays a
  stated limit, remedied by version preconditions. (2026-10-30)
- **OD21** Behaviour, delegated (as OD19), from review 9 and the lane model's G1–G6. K25: an ending (including `NotSent
  { Disposed }`) for a persisted identity with no live actor is saved as a pending mapped outcome of that identity's
  record (Persistence O2/O4) and delivered when the record is restored; it is evidence only when no record survives.
  K26: MD rule 14 is amended so an adopted lane's endings and `unknown { Restored }` are current, delivered from the
  active leaf (a restored record resumes in its saved leaf); `UnresolvedHold`'s arrivals are every leaf a new
  incarnation can be in; S7c becomes "handle at the root". (2026-10-30)
- **OD22** Behaviour, delegated (as OD19), from review 10. MD rule 20 is amended so every event a write maps (success,
  failure, unknown) must be handled or explicitly ignored over the new-incarnation arrival set, checked by `flow check`.
  The `cancel`/`allow` Runtime-disposal cell follows OD21 (a persisted identity keeps its on-the-wire work; its endings
  become pending outcomes). Parked endings are stored raw on the lane record and mapped at delivery, so a release cannot
  lose them (review 10 M3). (2026-10-30)
- **OD23** Owner API round, all option A: Q29 (keyed schedules use key records; `keys` may read `operations`), Q33 (a
  one-off read's row carries `key`; `O.x.get(operations, k)` in guards and callbacks; S15 with `Story.ending`), Q34
  (`idle` accepts a partial key; only `idle`), Q36 (`unknown` may be mapped per tag, as `failure` is), Q37 (an omitted
  `output` means `Schema.Void`), Q38 (streams require `key`, `[]` for one session), Q39 (merge 4's projector says `({
  output })`), Q40 (`runtime.unsettledWrites()`), Q41 (clean shutdown stays a policy-suite test; no Testing API).
  (2026-10-30)
- **OD25** Behaviour, delegated (as OD19), from the lane model on revision 12. C5: for a persisted identity, a parked
  `unknown` keeps its lane `Held` between turns until delivered (also under `cancel`/`allow`); `retry` and `cancel` in
  the delivering turn address it; `HeldThisTurn` starts at delivery. C6: `UnresolvedHold` has no exemption for an
  `idle`-guarded commit. C7: a `retry` or `cancel` resolves a hold only on paths where the hold already exists when it
  runs. C8: disposing an actor leaves an acknowledged re-send that waits for its capture unchanged; the Runtime captures
  and then invokes it. (2026-10-30)
- **OD26** Operations merge Q1 (X20), option B: a plain operation's `writes` moves to the operation, as
  `.outcomes(mapping, { writes })`, because it reads only `{ value, input }` and must be found from a lane record after
  rebind or reload; `optimistic` stays the commit's only option, `O.x.commit(select, { optimistic })`, because it reads
  the starting turn's memory and event (rule 36). Domain writes take no `optimistic` (they predict records with
  `.predicts`); their `writes` may only invalidate, now on the operation. (2026-10-30)
- **OD24** Process, delegated by the owner (2026-10-30): the main session approves the merge change lists for merges 4
  and 5 and for operations-in-definition, and treats operations as accepted for merging, unless a conflict needs an
  owner decision; only then is the owner asked. The streams direction review remains the owner's. (2026-10-30) *Process,
  not a design decision.*

- **Accepted with the proposal under OD24** (not decided one by one): `VerbMismatch` and one verb per operation;
  invocation as its own step (R7 K18); the `UnresolvedHold` specification (2.7.14); `KeyOmitsInput`; `cancel` on a
  one-off read; mapped events only from endings; the one-off row holding its entry; the delivery order of rule 44; local
  identity (R9 M1); the stated limits of 2.7.13. Decided by the main session at merge (OD19's delegation): the parked
  lane's flags (2.7.13), the cross-actor wait behind a hold as a stated limit, Runtime-step publications (2.5), per-tag
  `unknown`'s Flow reasons (2.7.13), rule 20's `NotSent` list, `Released`'s store row (2.8.6), and one meaning of
  `outstanding`.

**Also rejected** (the proposal's 10.2 and 10.3):

- **Today's model** (lanes per actor, transaction and key; commit values in the machine body): lookups by internal key
  records and transaction paths, two uses colliding, selects typed outside their transition.
- **Call sites in the machine body, a trigger on the definition, string event names, activities declared in the
  machine**: rows typed only through the body, behaviour in the contract, weak mappings, two identity models.
- **`.each` operations over entities and memory lists, `.each({ by })` on the operation, `.single()`, `.joins`, `.was`,
  `sharesLane`, `renamedFrom`**: modes, membership and draining for rare cases; the contract's `key` says it once.
- **`superseded:` as a mapping key, and a newer commit releasing an unknown**: a mapping nobody acts on correctly, and
  the late-landing race; replaced never-sent work is evidence and an unknown holds its lane (OD5).
- **`.overlap()` for reads, lanes per cache key for one-off reads, one-off or live decided by the mapped key**: delivery
  and rows disagree, and deleting a mapper changes behaviour silently; the verb decides (OD2, OD3).
- **Record `pending` from the store's queue**: a second place for workflow state; the lane and the record's `predicted`
  answer both questions.
- **Revision 3's `start` and `params`, and `.emits`**: new words for things the design names (`commit`, `lookup`,
  `subscribe`, `outcomes`).
- **One lane per (contract id, key) Runtime-wide** (TanStack's cache-wide `scope`): one actor's `retry` and `cancel`
  would act on another's Attempt.
- **Resuming never-sent work across a reload** (TanStack Query's model): left for [open-items.md](../../proposals/open-items.md); it would amend C2 and
  Operations O3.
- **Branded keys** and **an age bound on adopted holds**: not proposed; the first would close a structural-typing gap,
  the second is public API.

### Operations in fragments (fragments merge, [merged/fragment-operations/decisions.md](merged/fragment-operations/decisions.md))

Settled by the owner, F1–F9; F10 is the process under which this merge was approved (as OD24 was). The numbers are
kept, because the record, its reviews and delegated-decisions.md cite them; OD20's sub-items are always written
"OD20 F*n*".

- **F1** Q1 A: fragments may own operations, opt-in, traits first. (2026-10-30)
- **F2** Q2 A: a fragment's write lane keeps the merged identity (actor identity, contract id, key); `SharedContract` widens to one write operation per contract per actor. (2026-10-30)
- **F3** Q3 A: an ending after the fragment incarnation ends is parked on the lane record and delivered to the next incarnation at the placement (OD21 one level down). (2026-10-30)
- **F4** Q4 B: in v1, mapped writes only in placements about one thing (root trait, `.each` copy, `.resumable()` without `resetOn`); reads and streams anywhere. (2026-10-30)
- **F5** Q5 A: a host may read a fragment's lanes (`Fragment.O.x.get`, `idle`, `retryable`; `s.operations.<instance>.<name>`); acting is a type error. (2026-10-30)
- **F6** Q6 A: a held write whose `.each` copy is removed is a stated limit; the host keeps busy keys in membership when it matters. (2026-10-30)
- **F7** Q7–Q10 A: subroutines that own writes are phase 2; fragment Stories with `fixtures`, `.enter`, `.leave`; no subroutine entry hook; `cancel` in `whenAbandoned` deferred. (2026-10-30) *Amended by Stories T3 (delegated, big): `Story.make(fragment)` with `enter`, `leave`, `guards`, `reset`; respelled `Story.fragment(fragment)` by W1, and W5, W31–W33 confirm the steps.*
- **F8** Revision 2 questions, all option A: Q11 (`resetOn` allowed on a writing root or resumable trait; the reset value is the subject; amends F4), Q12 (`cancel` in `whenAbandoned` releases the incarnation's write when it ends; amends F6, reverses F7's deferral), Q13 (`Flow.entry` does not fire on thaw). (2026-10-31)
- **F9** Review 2 H1, option A: release on leave is a property of the subject's lanes, remembered by the Runtime; spelled key-less, `whenAbandoned: [O.put.cancel]` (NEW MEANING: releases every lane of this incarnation's subject, survives reload, also releases endings parked for the subject). Use it only for work that is worthless once its subject is gone (review 2 H3); like and follow keep the keep-busy line. (2026-10-31)
- **F10** The proposal (revision 3 with review 3 fixes, 1c3a1c68) is accepted for merging into machine-design.md, under the same process as the operations merge (OD24: the main session approves the change list and resolves small conflicts, logged in delegated-decisions.md; owner conflicts go to the owner). (2026-10-31) *Process, not a design decision.*

- **Accepted with the proposal under F10** (not decided one by one): rules 48–60 as written; the freeze-cut
  `Interrupted` (rule 52); the upgrade rule (2.9.4); the `key: []` warning. **Decided by the main session at merge
  (delegated, [delegated-decisions.md](delegated-decisions.md)):** the restore reset as a pending reset before rule
  44's deliveries; rule 20's placement-dependent `NotSent` checked at the placement; `updateMemory` receives
  `operations` (`get` only); `activities` in a subroutine's states; a removed frozen copy has ended; rule 15 counts only
  the host's own operations.

**Also rejected** (the record's section 3):

- **The placement in the lane identity, or lanes per subject**: two writes to one thing at once (D9), records tied to
  the machine's shape.
- **The committing copy on each Attempt** (revision 1): two copies share a lane and deadlock; **the subject of the
  placement alone** (revision 2): copies of a nested trait share "nothing".
- **A keyed member in `whenAbandoned`** (revision 2): its select reads after memory, names one lane of many, and is
  lost by a reload or a parked ending; **release without interrupting**: deferred.
- **`Superseded` evidence for a freeze-cut lookup**: a fragment waits forever, against rule 17.
- **`Flow.entry` on thaw**, **`Fragment.O` for reads** (ambiguous when a read is placed twice), **a host port for late
  endings**, **Flow keeping a removed copy alive**, **quiet release**, and **release for likes** (loses the user's
  write).

### Stories (merge 3, [merged/stories/decisions-v2.md](merged/stories/decisions-v2.md))

Made by the main session under the owner's overnight delegation, for the owner's review
([delegated-decisions.md](delegated-decisions.md)). Cited in this file as "Stories T*n*"; a bare T*n* is a tooling row
of section 5.

- **T1** Continue with proposal-v2.md (from the brief); the earlier proposal.md and its reviews stay as prior art. *Delegated.* (2026-10-31)
- **T2** C3: no ending injection. Every ending comes from a fake's answer through the real classification, or from a lifecycle step; Testing O3 stays as written. `NotSent { Disposed }` is reached only by the policy suite's internal `disposeRuntime` step. *Delegated.* (2026-10-31)
- **T3** C10: one constructor, `Story.make(subject)`; the subject's kind decides which steps type-check; a fragment alone runs in an invisible stand-in host. *Delegated, big* (B6: `story.app` and `story.machine` renamed). (2026-10-31) *Reversed by W1: `Story.app`, `Story.machine`, `Story.fragment`.*
- **T4** C4/C12: stream and wire controls are data values on fake handles, applied with `.world(…)`; `together(…)` is the only race word; Testing O1's no-callbacks rule stays. *Delegated.* (2026-10-31)
- **T5** Accept the proposal's big changes for review and convergence: B1 (`process()` removed, each step settles), B2 (a `Fake` module), B3 (`expect` makes `run()` reject), B4 (a frame per publication, amending accepted Testing O4), B5 (`propertyTest` takes any Story). *Delegated, big.* (2026-10-31) *B3 reversed by SC1; B1 confirmed by W2, B2 by W11, B4 by W22, B5 by W38.*
- **T6** Revision 2's new changes N1–N4 accepted: the `world` option (servers seeded before the subject starts), one address shape for `match`, `Story.attempt`, record filters, `advance({ next })` and step targets, `reload(tab)` and `openTab(name, { from })`, and `together({ advance: d })`. *Delegated, big.* (2026-10-31) *`Story.attempt` became the `attempt` read on a checkpoint (W24); the rest confirmed by W6, W7, W10, W13, W26.*
- **T7** From final review 2: H1, settling runs on a microtask-only scheduler (Effect 4.0.5 `executionMode: "sync"`), so host I/O never decides a result; the `hold({ at: "response" })` ghost restore is the same as a real crash and follows the merged design (an acknowledged Attempt restores as `unknown { Restored }`), so 2.5 and 3.6 stop claiming "never restores an ended Attempt"; all Mediums and Lows fixed as the review proposes. *Delegated.* (2026-10-31)

(T*n*'s C*n* above are the brief's constraints, not this file's C rows; its section numbers are the proposal's.)

- **Accepted with the proposal (delegated)**, option A each, not decided one by one: the proposal's Q5 (storage is
  local: FIFO per tab, aborted on close), Q6 (a crashed server is the binding's failure plus an `issue`), Q7 (cells no
  transport reaches belong to the policy suite), Q9 (outside before inside at equal instants), Q10 (ids unique across
  the configuration), Q12 (fragment Stories not playable until playback.md's question 2), Q13 (the turn limit per
  instant per step), Q14 (the names as written). **Decided by the main session at merge (delegated,
  [merged/stories/merge-plan.md](merged/stories/merge-plan.md)):** a fragment's read named by `instance` and name
  (rule 65); two endings across a crash stated (rule 17); the stand-in's re-rooted path and rule 20 at the stand-in
  (2.10.12); the model's ambiguities A1–A6 (2.10.17).

**Also rejected** (the record's sections 1, 2.6 and 2.10):

- **Injecting endings** at the lane, or `Story.ending(O.x, exit)` with a scripted fake without truth: a Story could pass
  along a path the real response never takes.
- **A settle that waits for host time** (a grace, or a macrotask flush): host I/O would decide results.
- **`advance("next")` without an address**, **ordinals across actors**, **a trailing `{ tab }` option**, **`lost` on
  endpoints**, **`hold({ at: "close" })`** (no transport produces it).
- **Storage that travels like a remote request** (a ghost restore no page produces), **a handler's defect reaching the
  client** (no transport carries a defect), **an app-shipped awaiting adapter** (it would test Flow's adapter, not the
  app).

### Stories, amended ([merged/story-checks/decisions.md](merged/story-checks/decisions.md))

The owner approved the amended proposal for merging on 2026-11-01. SC1–SC5 and W1–W43 are **owner-confirmed**, row by row; they amend the delegated
Stories T1–T7 above. SC*n* is the record's C*n*, renamed because a bare C*n* is a row of section 5; bare T*n* inside a W row is Stories T*n*; Q*n* is the walk's question.

- **SC1** A Story is a transcript of inputs and checkpoints. Flow owns no assertions: `.expect` leaves the Story, and tests use the runner's own `expect`. *Owner-confirmed.* (2026-11-01)
- **SC2** Keep the word `checkpoints`. No `at` until it does something extra; no callback form. *Owner-confirmed.* (2026-11-01)
- **SC3** Q1 B: short reads on a checkpoint, for every runner. `lane(O.x, key)` is `undefined` when the lane does not exist; `records(kind, filter?)` is NEW on a checkpoint. *Owner-confirmed.* (2026-11-01)
- **SC4** Q2 A: no matchers for now. `toHaveLane`, `toHaveRecord` and `toBeIn` are deferred ([revisit.md](../../proposals/revisit.md)). *Owner-confirmed.* (2026-11-01)
- **SC5** Q3 A: checkpoint names are camelCase by convention, so destructuring works. *Owner-confirmed.* (2026-11-01)
- **W1** Group 1, Q1 B: `Story.app`, `Story.machine` and `Story.fragment`, so the kind is visible on the line. Reverses T3's `Story.make`; the options and steps per subject stay. *Owner-confirmed.* (2026-11-01)
- **W2** Group 1, Q2 A: `process()` is removed; each step settles (T5 B1 confirmed). *Owner-confirmed.* (2026-11-01)
- **W3** Group 1, Q3 A: `together` is the one word for races (T4 confirmed). *Owner-confirmed.* (2026-11-01)
- **W4** Group 1, Q4 A: real host work pending during a settle fails with `HostTimeWait` (T7 confirmed). *Owner-confirmed.* (2026-11-01)
- **W5** `enter` and `leave` stay as steps for a fragment alone. The rest of that group (`guards`, `reset`, the stand-in host) is still to be walked. *Owner-confirmed.* (2026-11-01)
- **W6** Group 2, Q5 A: one `advance`, with `{ next }` and `{ to }`. *Owner-confirmed.* (2026-11-01)
- **W7** Group 2, Q6 A: `next` names its timer by address; nothing matching fails with `NoDeadline`. *Owner-confirmed.* (2026-11-01)
- **W8** Group 2, Q7 A: `advance` runs the whole chain, in the fixed order at equal instants. *Owner-confirmed.* (2026-11-01)
- **W9** Group 2, Q8 A: keep `advance(d, { suspended })`. *Owner-confirmed.* (2026-11-01)
- **W10** Group 2, Q9 A: `together({ advance })` for a deadline racing an input. *Owner-confirmed.* (2026-11-01)
- **W11** Group 3, Q10 A: a `Fake` module with server and client halves (T5 B2 confirmed). *Owner-confirmed.* (2026-11-01)
- **W12** Group 3, Q11 A: no ending injection (T2 confirmed). *Owner-confirmed.* (2026-11-01)
- **W13** Group 3, Q12 A: `world` as an option and a step, with controls as data. *Owner-confirmed.* (2026-11-01)
- **W14** Group 3, Q13 A: `handle` returns `{ truth, response }`, so order cannot be confused (Effect's `Ref.modify` is `[result, next]`, the reverse of the merged tuple). *Owner-confirmed.* (2026-11-01)
- **W15** Group 3, Q14 A: no MSW binding now ([revisit.md](../../proposals/revisit.md)). *Owner-confirmed.* (2026-11-01)
- **W16** Group 3, Q15 A: `Fake.fetch` routes by method and path, such as `{ "POST /confirm": "confirm" }`; the function stays for unusual cases. Spelling to check against the desk's five fakes. *Owner-confirmed.* (2026-11-01)
- **W17** `Fake` stands alone with its own narrow set of capabilities. A mocking library is optional, and goes inside a handler or a plain Layer if a user wants one. *Owner-confirmed.* (2026-11-01)
- **W18** Group 4, Q21 A: `hold`, `release`, `drop` and `duplicate` as a Story-owned wire layer. *Owner-confirmed.* (2026-11-01)
- **W19** Group 4, Q22 A: `hold` stands until `release`; `drop` and `duplicate` apply once; `times` overrides. *Owner-confirmed.* (2026-11-01)
- **W20** Group 4, Q23 A: keep `at: "request" \| "response"` on the wire. *Owner-confirmed.* (2026-11-01)
- **W21** Group 4, Q24 A: keep `release({ drop: true })` and `release({ nth })`. *Owner-confirmed.* (2026-11-01)
- **W22** Group 5, Q25 A: every step has a cut; frames are per publication; no `frames` option (T5 B4 confirmed). *Owner-confirmed.* (2026-11-01)
- **W23** Group 5, Q26 A: one `read(target)` for actors, fakes and endpoints, beside SC3's `lane` and `records`. *Owner-confirmed.* (2026-11-01)
- **W24** Group 5, Q27 A: `inspection`, `entity(Entity, key)`, `attempt(O.x)` and `now` live on the checkpoint. `Story.inspection`, `Story.entity`, `Story.attempt`, `Story.records` and `Story.now` go. This settles SC3's related proposal. *Owner-confirmed.* (2026-11-01)
- **W25** Group 5, Q28 A: `Story.property` and the `properties` option go; tests loop over `run.frames`, which exposes `truncated`. `propertyTest` takes its checks as its own option (group 8). *Owner-confirmed.* (2026-11-01)
- **W26** Group 6, Q29 A: `reload` and `openTab(name, { from })`. *Owner-confirmed.* (2026-11-01)
- **W27** Group 6, Q30 A: one `dispose` with `{ how: "now" \| "forget" }`. *Owner-confirmed.* (2026-11-01)
- **W28** Group 6, Q31 A: `Fake.storage`, with `seed` and `from`. *Owner-confirmed.* (2026-11-01)
- **W29** Group 6, Q32 A: hydration sources run against this run's fake servers and cannot set `world`. *Owner-confirmed.* (2026-11-01)
- **W30** Group 7, Q33 A: an invisible stand-in host, placed by the fragment's declaration alone. *Owner-confirmed.* (2026-11-01)
- **W31** Group 7, Q34 A: `guards(answers)` as a step, defaulting to allow. *Owner-confirmed.* (2026-11-01)
- **W32** Group 7, Q35 A: `enter(input, { subject })` and `reset(subject)`. *Owner-confirmed.* (2026-11-01)
- **W33** Group 7, Q36 A: `leave({ end: true })` ends a frozen trait. *Owner-confirmed.* (2026-11-01)
- **W34** Group 7, Q37 A: `run.calls` and `checkpoint.exit` go; callbacks and exits are records. *Owner-confirmed.* (2026-11-01)
- **W35** Fake gaps, Q17–Q20: direction approved, final spellings delegated to the main session and an Opus review ([fakes-v2.md](merged/story-checks/fakes-v2.md)). The owner has not yet read the spellings. *Owner-confirmed.* (2026-11-01)
- **W36** Group 8, Q38 A: `Fake.fetch` and `Fake.webSocket` on Effect's injection points, spelled as in [fakes-v2.md](merged/story-checks/fakes-v2.md). *Owner-confirmed.* (2026-11-01)
- **W37** Group 8, Q39 A: stream controls are ordinary wire steps, with no stream-specific step words; `.do(…)` goes. Details wait for the streams merge. *Owner-confirmed.* (2026-11-01) *Streams merged; the details are 2.10.9.*
- **W38** Group 8, Q40 A: `propertyTest(story, …)` with plain function properties; domains become a preset. *Owner-confirmed.* (2026-11-01)
- **W39** Group 8, Q41 A: `model()` is removed. Exhaustive paths and shortest counterexamples are given up; one Runtime and one execution path stay (T1 confirmed). *Owner-confirmed.* (2026-11-01)
- **W40** Group 8, Q42 A: coverage and CLI as walked; `flow story describe` loses its expectation and property lines, and `flow story run` reports what ran, with no pass or fail on correctness. *Owner-confirmed.* (2026-11-01)
- **W41** Process: amend Stories into a new proposal, then two rounds of Opus deep review covering Stories, fakes and how they integrate; a third round is allowed for major issues. *Owner-confirmed.* (2026-11-01)
- **W42** Owner confirmed: `latency` and `response` as an Effect are cut, so a slow answer is `hold`, `advance`, `release`; this changes W17, where an async library goes in the client half. *Owner-confirmed.* (2026-11-01)
- **W43** Owner confirmed: `run({ signal })` is removed, changing Testing O8; a run never yields to the host. *Owner-confirmed.* (2026-11-01)

(SC1's own snippet in the record spells `Story.make`, which W1 reversed; W1 wins. W42 changes W17: an async mocking library goes in the client half.)

**Proposed: approved only with the proposal as a whole, not confirmed by a C or W.** Everything marked **[P]** or **[fakes-v2]** in 2.10 and rules 11, 61–66, chiefly:
the settle's drain and its constants (`K`, the hop cap, 100,000 deadlines per `advance`); finishing the world before `HostTimeWait` (rule 61); what `Fake`'s words
spell (W35; the owner has not read them) and how they combine (2.10.4's five rules); `StoryFakeError` and `InvalidInput` as the one value that rejects a run;
`UnusedWireRule`; `cp.attempt`'s return, `AmbiguousRead`, `cp.lane(address)`, `cp.tabs.b?.inspection`, `SubjectAbsent`; capture of reads at cuts; `whenQuiet`, `PropertyTestFailed`,
`PropertyDefect`, `result.source`, `domainPropertyOptions`; `Story.Step`, `Story.Frame`; `flow story run` exiting 2 on a rejected run; a fake's `ping` and its first rank; the rest of `run`'s surface; `checkpoint(name, { at })` keeps its word; the rows of C69–C84.

**Proposed: resolved at this merge** ([merged/story-checks/merge-plan.md](merged/story-checks/merge-plan.md) 1.4): the labels SC*n*, SA RV*n*, SA MDL, SA H*n* (MX1); the proposal's "C-new" folded
into C79 rather than numbered, so merge 6's rows still start after C85 (MX2); this section's pointers to the record's sections 10 and 11 (MX3); section 7 item 22 (MX6).

**Also rejected** (the record's 1.2 and 1.3): `.expect` in a Story and `StoryExpectationFailed` (SC1); `@flow-state/vitest` and `storyTest` (SC2–SC4, and the decisions' proposed list);
matchers, for now (SC4, `revisit.md`); a callback on `checkpoint` (SC2); an MSW binding, for now (W15); a failure's `{ step, cut, target, path, expected, actual }` shape.

### Streams (merge 6, [merged/streams/decisions-v2.md](merged/streams/decisions-v2.md))

S1–S10 decided [proposal-v2](merged/streams/proposal-v2.md), S11 and S12 are the owner's walkthrough, S13 commissioned [proposal-v3](merged/streams/proposal-v3.md), and S15 and S16 approved it. S12 left S1–S11 open, so the later rows overturn some; each is annotated, not rewritten. Q*n* inside a row is that round's question, not ST Q*n*. OD23's "S15 with `Story.ending`" is history, the operations proposal's own numbering, not this list's S15.

- **S1** Continue with proposal-v2.md; revision 3 is prior art. (2026-10-30)
- **S2** Q1 A: the adapter reports the connection in-band, as items in its Stream (`Feed.live`, `Feed.down`), ordered with the values. (2026-10-30)
- **S3** Q4 A: repair lives in the adapter (`Feed.reconnect`'s `catchUp`, a server replay); the machine sees `missed` only when nothing could repair. (2026-10-30) *Overturned: repair is contract data, `catchUp` (S15, proposal-v3).*
- **S4** Q5 A: the resume position across sessions is an `input` field the machine fills from its memory; Flow stores and compares no position. (2026-10-30) *Overturned by S15: Flow keeps the position, in the bookmark.*
- **S5** Section 8, the remaining questions, all option A: Q2 (`missed`), Q3 (an SDK's own reconnect policy, wrapped in `Feed.reconnect` by recipe), Q6 (row: `connection`, `drop`, `value` on state feeds, `last { value, at }`), Q7 (`Closed` in `failure`), Q8 (cursors out of scope, to open-items), Q9 (no shared session per Runtime, to open-items), Q10 (drop `persist` on streams), Q11 (`progress(p)`), Q12 (`resetAfter` default 1 minute; `Closed` and `Overflow` retryable), Q13 (`bufferSize` default 1,024), Q14 (finding names as listed). (2026-10-30) *Q12's default is overturned (a fixed 1 minute, Flapping after 8; S15). Q13's option is cut (a constant 1,024) and Q3's recipe goes with `Feed.reconnect`; the record's list names only Q12 [P, merge].*
- **S6** Round 4, all option A: Q15 (`catchUp` is a page-step function, no `Feed.complete`), Q16 (the row reads `Live` during a catch-up), Q17 (a proof on a state feed re-confirms only a `last` this session confirmed), Q18 (pages retry with a fresh copy of the reconnect `schedule`, no `catchUpSchedule`). (2026-10-30) *Q15 is overturned: `Feed.more`, `Feed.done`, with a `proof`.*
- **S7** Revision 3 questions, all option A: Q19 (`Feed.CannotRepair`, NEW word: a `catchUp` step fails with it; the start settles lost, `missed Lost`, no budget spent), Q20 (`emit` returns a `Promise<void>` for back-pressure), Q21 (a first start with no position is `fresh` under `Feed.reconnect` only), Q22 (an unhandled fact feed is a type error), Q23 (one `catchUp` step function; first call receives the position, later calls the page token). (2026-10-31) *Q19 is overturned: `Feed.gone`. Q21 is overturned: there is no `fresh`.*
- **S8** Delegated, from review 3: H1, a start is `fresh` only when `Feed.reconnect` declares `from` and it is empty (amends S7 Q21); H2, session identity includes the fragment subject path (rules 48–60), with freeze, thaw and `resetOn` rows; H3, `catchUp`'s contract requires pages oldest first (P1), and newest-first histories (Ably) page forwards or reverse in the adapter. (2026-10-31) *H1 and H3 are overturned: no `fresh`; pages arrive in the server's order, and 2.11.5 states the contract (S16).*
- **S9** Delegated, from review 4 (last allowed round): H1, a session owes from its first registration, tracked by an internal `announced` flag (3.4); `Missed` gains a small flag for a first-registration loss (spelled `initial`), with an empty-`from` precondition for `fresh`; H2, transport recipes' finalizers remove only their own listeners (shared Ably channels are never detached by a session), plus a `detached` listener; M1, release-before-restart follows R-Owner across placements of one (actor, operation, key), not only the same path. (2026-10-31) *H1 is overturned: no `announced` or `initial`.*
- **S10** Delegated, from review 5 (beyond the allowed rounds, so streams is NOT merged tonight): continuity registration is tracked by Flow per (memory slice, operation, key) and persisted like `heard` (`registered`), not per session; `fresh` drops to `live()` once it is set; `initial = not registered` (changes S9). Ably channel accumulation gets a ref count or a stated cost; `initial` on `settle(lost)` is specified; the ignore guard applies only to `Unproven`. Applied as revision 7 for the owner to check before merging. (2026-10-31) *Overturned: no `registered` or `initial`.*
- **S11** Walkthrough, group 1, owner's answers, for inclusion when streams is next revised: a session reads `input` once, at start, so a non-key field never restarts it; `DuplicateStreamSession` goes, two operations on one contract and key are two sessions, with a `DuplicateSession` warning; one `stream` function, spelled `delivers: "every" \| "latest"` (not `"facts" \| "state"`; those stay as the docs' words for the concepts). (2026-11-01)
- **S12** Walkthrough, group 2: the owner finds the API acceptable and delegates behaviour to the main session, including re-judging earlier decisions from the ground up (S1–S11 are not binding on that review). Spellings kept for now: signals in-band; `Feed.live({ proof \| lost, restartAt })`, `Feed.down`, names `Feed`, `live`, `down`. (2026-11-01) *`lost` is overturned; S15, proposal-v3.*
- **S13** The owner delegates the streams design: write a new proposal (`proposal-v3.md`) carrying v2's learnings, taking the best ideas from v2 and the blind design, then three review rounds. Its contents are the main session's proposal, not owner decisions, until the owner reads them. (2026-11-01)
- **S14** Streams' vocabulary and conventions follow Effect's and what `transaction` and `resource` already use. The owner delegates the resulting word choices to the main session. (2026-11-01)
- **S15** Owner confirmed proposal-v3's recommendations, Q1-Q4 of the round: Flow runs connections when the contract declares `reconnect` and `idleTime`, amending rule 25, and never re-opens a session; the default retries while offline and ends `Flapping` after 8 registered flaps; Flow keeps the position, with `fills`, falling back to trimmed v2 if a fourth High appears in real code; the silent-loss cases are documented limits. The word list and spellings stay the main session's proposal (S14). (2026-11-01)
- **S16** Delegated: the owner left the remaining questions to the main session unless they really matter. proposal-v3 merges. Trial 2's page-order finding (C1) is not S15's fourth High: its cause is a missing contract on read order, now stated in v3 3.4, not how the bookmark ties to memory. `Feed` keeps its name; the `Flow` rename and the other absorb-wiring questions stay in that exploration and do not touch this merge. (2026-11-01)

**Earlier rows overturned that are not in this list** (the record's section 1): the brief's M6-D3 (the reconnect combinator), K2's position clause, requirement O8's "no Flow retry", in part (rule 25 as amended), and O5's spelling `lost`. OD12's clause is annotated on its row.

**Proposed: approved only with the proposal as a whole.** Everything marked **[P]** in rules 67–72 and 2.11, chiefly: the Streams tables; the word list (S14); `position` as a field name; `Feed.ping`, `head`, `through`; `pages`; the stall rule; the constants 1 minute, 1,024, 256, 5 s; the findings and flags; `O.x.refetch` on a stream; the recipes.

**Proposed: resolved at this merge** ([merged/streams/merge-plan.md](merged/streams/merge-plan.md) 1.4): the labels (MX1); `ChatSocket.layer`, provided `ChatFake`, as a fixture (MX6); 2.10.18.7's contract `ChatLog`, `ChatLogSocket`, `ChatLogRoom` and `ChatFake` (MX6, MX7, as the merge check rewrote them); an author tag equal to a `Feed` reason is a type error (MX9); `Feed`'s export (MX12); "not `Flow.private`" (MX11); the LLM Story left unwritten (MX13).

**Also rejected** (the record's section 10 and ST Q1–ST Q10): the combinator; a cursor in memory (trimmed v2, S15's fallback); a required `holds` predicate; a separate Flow record for the position; a private clear mark; a whole-feed `"accept"`; `rest:` in `failure`; `Stream.callback` as the documented bridge; `pushes` on a fake; a Flow `merge`; dotted `fills`.
