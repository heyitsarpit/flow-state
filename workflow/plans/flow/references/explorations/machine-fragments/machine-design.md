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
Stories (merge 3) is last; parts of 2.8 that
need Story reads are marked *Story reads: merge 3* (section 7 item 17). The work order is in [the folder README](README.md). It
**supersedes `proposal-v3.md`** (removed, see [the folder README](README.md)). It is evaluated against
[principles.md](principles.md). v4 keeps v3's model and adds what the prior-art study found missing (`prior-art/`,
removed, see [the folder README](README.md)). Where this file and a plan differ, the plan wins. Section 5 lists every
plan amendment, with the sentence each one replaces. All syntax is a working draft.

**Revision (multiplicity audit, 2026-10-31).** [audit-multiplicity.md](audit-multiplicity.md) checked every handle,
read, action, event, record and evidence item for how many exist at once, which one each reference names, and what
happens before creation, after deletion and across restores and tabs. Its three general rules are N1–N3 (2.4, after
rule 25); its changes are marked with this heading's words, and its decisions are D18–D21.

**Five decisions.** Decision 1 can be accepted alone; decision 2 builds on decision 1's turn (2.5); decision 3 is
independent; decision 4 builds on decision 2; decision 5 builds on decisions 2 and 4.

| Decision | What it covers | Plans it touches |
|---|---|---|
| **1. Fragments and the turn** | sections 2.1–2.6 and 3, rules 1–12, P5–P8, P11, P21 | Machines O1–O8, Runtime O4, Persistence O2, Testing O1, Inspection O1, CommandLine O5, React O2/O4, Package O1 |
| **2. Server calls** | section 2.7, rules 13–25 and N1–N3, C1–C20, P15, P19, P20 | Operations O1–O3/O5/O7, Machines O3/O5/O6, Persistence O4–O6, Testing O2/O3, EntityDomains O1, CommandLine O5 |
| **3. Exploration tooling** | T2–T3; T1 and Testing O5 marked for removal | CommandLine O5; Testing O5 (removed), Package (`model` export removed) |
| **4. Entity domains** | section 2.8, rules 26–38, C21–C30, decisions E1–E18 | Operations O1–O3/O5/O6, EntityDomains O1/O2/O5, Persistence O6, Inspection, CommandLine O5 |
| **5. Operations in the definition** | 2.7 (rewritten), 2.7.13–2.7.16, rules 13–25 and N1–N3 amended, 26–38 amended, rules 39–47, C31–C53, decisions OD1–OD26 | Operations O1–O7, Machines O1/O4–O6/O8, Runtime O3/O6/V4, Persistence O2–O6, ServerRendering O3/O5, LazyFeatures O3, Inspection O1, React O2/O3, Testing O3/O7, CommandLine O5 |

## 1. The idea

Three layers, each owning one thing.

- **Contracts own how a call is made, which server thing it is about and what its ending means:** the commit
  function, which classifies each ending with `Outcome` where it reads the response; the contract's `key` and
  concurrency; the cache; restore.
- **Definitions declare every operation the actor uses** and what its endings become (`operations`, `outcomes`).
- **Machines own states, turns, timers, history, and the work they start:** when a write starts, is sent again or
  cancelled, when a read is placed, and where an ending goes (2.7). The Runtime keeps write lanes (2.7.13).
- **Fragments are locked islands of logic with no I/O.** A fragment is behaviour written once and
  placed into a machine at construction: a validated field, a countdown, a lockout, a confirmation,
  a selection. The actor stays one actor, with one mailbox, one turn and one plain snapshot.

There are two kinds:

- A **trait** is something the actor _has_: no states, alive while its node is active.
- A **subroutine** is something the actor _goes into_: placed as a state, fresh on every entry, and
  left through a declared **exit**.

A fragment declares a contract: what it reads, which events it takes from whom, where the host may
refuse, what it tells the host, and how it ends. The host fills that contract and cannot reach
inside. Because fragments do no I/O, the machine reads like today's machines: the host runs every
operation and feeds the answers into its fragments by raising their events.

The rules that make apps correct (endings routed by their owner, the Attempt's ending, declines as endings, lane
reads, history, readable deadlines) help plain machines as much as fragments, so they belong in the plans. v4 reuses
**pieces** (fields, timers, dialogs, selections), not I/O **policy**. Policy is written once per machine, as states,
schedules and the operations' members (2.7).

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
| On ending, except by an exit or a freeze | `whenAbandoned` notifications run, fused into the leaving turn                                               | the same                                                                                 |
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
  `subscribe.each` a keyed list (rule 41); records of an entity domain the definition lists in `operations`:
  `Entity.get(s, key, shape)`, `{ data, predicted, uncertain, unconfirmed }` (2.8.1). The record is the store's, read
  through the snapshot's cut, never memory (rule 26).

These names, state names and memory keys share one namespace, and a collision rejects. A slice is
`undefined` while its fragment is inactive, except a resumable slice, which stays present while frozen. Every list
above is a **keyed list** (rule N1): in key order, each entry with `key`, found by key with `find` (write lanes: with `get`); an entry that does
not exist is absent, never a default.

### 2.2 The contract

```ts
trait({
  id: "Pager",
  events: { Next: {}, Previous: {} },        // sent by anyone, at the instance path
  hostEvents: { Jump: { page: Schema.Int } },// sent only by the direct host, with `raise`
  internalEvents: { Due: {} },               // produced only by this fragment's own schedules
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
| `internalEvents` | sent by its own `schedules` | nothing |
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
| `Flow.entry`                                     | value           | in a schedule's `armOn`: also start when the schedule's owner begins (its state is entered, its trait created or reset) | none |
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
- Effects of different alternatives are exclusive, so two of them are never counted as two state
  changers.

The summary is part of the fragment's type and is printed by Inspection. `flow check` checks a host
against its fragments' summaries, never their bodies (rule 10).

**Test position with tokens.** A guard that only tests where the actor is uses a token element
(`guard: [S.WIZARD.INVITE]`). Closures test data, and their position tests are invisible to pruning.

Fragments may not declare `operations`, `activities`, `context`, `onContext`, `send` or persistence.

### 2.3 Where things go

| What                                       | Where                                                                                                                                                                                 |
|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Placing a trait                            | host **definition**: the root's `traits`, or the node's `Flow.state(…, { traits })`; inside a fragment, the same in its declaration                                                   |
| Placing a subroutine                       | host **definition**: a state, `{ NAME: Sub }`, or `{ NAME: Flow.state(Sub, { traits }) }` with host traits on its node                                                                |
| Filling ports, `resetOn`                   | host **machine**, **at the node where it is placed**: the root's `traits.<name>`, a node's `states.<NAME>.traits.<name>`, a subroutine's `states.<NAME>`; inside a fragment, its body |
| What survives an abnormal ending           | the fragment's body: `whenAbandoned`                                                                                                                                                        |
| Feeding a fact into a fragment             | host **machine**: `raise` on any host transition                                                                                                                                      |
| Running I/O and mapping endings            | host **definition**: `operations`, each contract with its `outcomes` onto the host's events; host **machine**: `O.x.commit` and `O.x.lookup` in `actions`, `O.x.subscribe` in `activities` (2.7) |
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
(multiplicity audit, 2026-10-31)).

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
       persisted: on restore, `resetOn` baselines are re-taken silently (section 6).
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
   - `internalEvents` come only from the fragment's own schedules. On a definition, `internalEvents` come from its
     schedules or its operations' endings; an event an operation maps comes only from endings (rule 47).

   The host maps call endings onto **its own** events, through its operations' `outcomes`, and raises into fragments. Sending a
   host or internal event from outside is a type error, and `InvalidEvent` untyped.
3. **No I/O.** Fragments run no operations, read no context and send to no actor.
4. **The host cannot reach inside.** It cannot handle a fragment's events in its own `on`, write its
   memory, or change its transitions. It can read everything. Its policy enters only through the
   declared guards.
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
     write.
   - **A late ending never leaves live work.** A late turn may not exit a state that owns another pending call, or
     an active subroutine (rule 15).
7. **One turn.** A transition and everything it raises, notifies, exits, resets and leaves compile
   into one transition, run by the algorithm in 2.5. That algorithm is normative for the runtime
   and for `check()`.
8. **Deliveries are never lost.** This covers every event a server or a clock produces, and every
   ending the host cannot refuse:
   - call endings, current and late (rules 14, 20), except what rule 17 makes evidence by declaration;
   - exit fillings;
   - `whenAbandoned` fillings;
   - timer-fired handlers.

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
     `item` (the entry). **Revision (multiplicity audit, 2026-10-31; amended by the operations merge).** A commit
     started in a copy's filling is an ordinary commit of the host's operation: its lane is named by the contract's key,
     picked from the input, so copies whose input carries the copy's key have their own lanes, and copies whose input
     does not share one, which is `reject`'s promise (rule 21). The Attempt carries no copy key; a handler that needs the
     copy reads it from the mapper's `key` or `input`. Call endings are governed by rules 8, 14, 17 and 20 and are never
     dropped; only a raise the ending's handler makes into a copy that is gone follows the drop below (rule N3). `s.memory.<name>` and `s.schedules.<name>` are the copies in
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
11. **Tested alone.** `story.machine(fragment, { id })` fills every port with a recording harness
    and may send host events. `run.calls.<callback>` records notifications, including `whenAbandoned`;
    `checkpoint.exit` records exits. `.enter(input)` enters a subroutine, with its `Input` record;
    `.leave()` abandons it, as a host transition would.
12. **Construction errors and runtime defects.**
    - **Construction errors** (types or `flow check`):
      - unfilled required ports;
      - rules 6, 8 and 10, and rule 20's late handlers;
      - a raise into a fragment that the turn's state change, as tokens show it, exits;
      - two state changers or overlapping keys that the state-token pruning cannot separate.
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
13–25 say how their work runs.

13. **Endings map to events, on the definition.** An operation `name: contract.outcomes({ … })` (rule 40) maps each
    ending to one of the definition's events: for a write `success:`, `failure:` (an exhaustive record over the commit's
    failure tags, plus an optional `NotSent`; or one event for an untagged failure type), and `unknown:` (one event, or
    a record by tag as `failure` is, OD23 Q36; 2.7.13); for a read `success:` (one-off) or `value:` (live) and
    `failure:` (rule 41). A mapping value is an event (payload-free) or `E.X.from((value, ctx) => payload)`, with `ctx`
    `{ input, attempt, progress, key }` for a write and `{ input, key }` for a read or stream; `key` is the contract's
    key record of the call that ended. Several endings may map to one event. Every `unknown:` target is a
    `Flow.uncertain` event. A read's `failure:` carries its tags plus Flow's `Defect` and `Interrupted` (rule 37). An
    author error whose tag is one of Flow's reasons (`NotSent`, `Cancelled`, `Restored`, `Interrupted`, `Defect`,
    `StillUnknown`, `StorageRefused`) is a type error.
14. **Owner, current, late, decided at admission.** A commit, lookup or retry of an operation is owned by the activation
    of the state its transition names (`"self"`: the handler's own state). When the ending's turn is **admitted** (2.5
    step 1), Flow maps the ending through the operation's `outcomes` and tests the owner against the pre-turn snapshot.
    If that activation is alive, the event is **current** and routes from the active leaf. Otherwise it is **late** and
    the same event routes from the nearest strict ancestor of the owner whose activation is the one alive when the call
    started (the root at worst). **One owner test**, whenever an ending lands, parked or not (rule 44): the owner
    activation alive → current; an activation of this incarnation that has ended → late; never an activation of this
    incarnation (an adopted lane) → current, from the active leaf. Every `unknown { Restored }` is current from the
    active leaf. Routing is never decided at settlement. Settlement decides only the Attempt's ending (rule 18) and, for
    a domain write, its store effects (rule 27).
15. **Late turns.** In a late event's turn, an alternative whose target would exit a state that owns another pending
    call, or an active subroutine, is denied (`LateMayNotLeave`); so a late handler ends in an alternative that does not
    move (`flow check`). A call started in a late turn is an ordinary call with its own owner: lateness is not
    transitive.
16. **Declines are endings; Flow adds no guard.** A decline refuses only the write, never the transition that asked for
    it: the transition's target, memory and other actions run as written. Under `concurrency: "reject"`, a commit on a
    lane that is `InFlight` or `Held` invokes nothing and ends `NotSent { why: "Rejected" }`. A commit past its lane's
    queued commits or a record queue's bound is declined the same way, `NotSent { why: "Overloaded" }` (rule 35). A
    retry on an `InFlight` lane is evidence `InFlight`, and on an `Idle` lane evidence `NothingToResend`: neither is an
    ending (rule 17). A declined commit has no Attempt, so its `NotSent` mapper sees `attempt` undefined (decision D17,
    as amended). The ending is mapped through the operation's `outcomes` and owned by the transition that asked (rule
    14). To refuse the transition itself, the author writes `O.pay.idle(k?)` in its guard, so `check()` and a view's
    button agree. `flow check` warns when a transition that changes state lists a `reject` commit without its `idle`
    guard.
17. **Every commit ends once, unless its operation declares it replaceable.** Every commit and lookup, and every retry
    that sends, delivers exactly one ending, to a live incarnation of its identity or to its saved record (rule 44).
    Evidence, by declaration: a never-sent commit replaced under `latest` (`Superseded`); a lookup a newer lookup or
    `cancel` released (`Superseded`); a declined retry (`InFlight`, `NothingToResend`); a bare write's endings (rule
    40); under `concurrency: "cancel"`, the ending of an Attempt a newer commit interrupted.
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
    persisted identity (`Restored`, `StorageRefused`, `Disposed`), or for a domain write (`Overloaded`, rule 35). A read
    operation's tag record must map `Defect` and `Interrupted` (rule 37). **Every late event that can occur, from any
    channel, is handled** at a strict ancestor of the owner; `{ target: "self" }` is the explicit ignore. A missing late
    handler is a `flow check` error naming the event and the state whose leaving makes it late. Flow cannot know which
    late failures matter (sign-in's late `WrongCode` is a strike), so a person decides for each one. **Adopted endings**
    (OD22). Every event a write operation maps (`success`, each `failure` tag, `unknown` or each of its tags) is handled
    totally from every leaf of that operation's new-incarnation arrival set (2.7.14); `{ target: "self" }` is the
    explicit ignore; a missing handler is a `flow check` error naming the event and the leaf. Requirements are read per
    operation; a bare operation has none.
21. **The write lane** (2.7.13; decisions OD5–OD7, OD10, OD16, OD19, OD20, OD25). A write lane is (actor identity,
    contract id, key of the input), owned by the Runtime; the actor that commits is its **binding actor**. It is created
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
    visible (*Story reads: merge 3*: the `checkpoint.evidence` shape). A lane holds no store state: predictions, record
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
    - **Lane reads** (`operations`, `get` and the `idle` and `retryable` guards) are not memory. Selects and guards see
      the pre-turn lanes with the turn's own ending admitted; `keys`, `when`, placement selects and the published rows
      see the **after lanes**, the lanes with this turn's members applied (rule 21; OD16).
23. **Schedules.** A function schedule reads the after memory of the arming turn (rule 22). `armOn` counts an event
    accepted anywhere on the active path. A keyed schedule's `keys` return key records (`({ docId })`, the shape of a
    contract's key) from the after memory and the after lanes, so `keys` may read `operations` (OD23 Q29); it keeps one
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
    nothing, with evidence. It never drops a queued commit silently. **A settled ending is never rewritten.** A one-off
    read's `cancel` is rule 42's. On a domain write, rule 30 gives each ending's store effects (rule 29).
25. **No Flow timeout and no Flow retry.** Waiting and trying again are states and schedules of the machine (2.7.6).
    **Classification runs outside the fiber it interrupts.**

**Multiplicity** (rules N1–N3). **Revision (multiplicity audit, 2026-10-31).** Every rule above that names "the" lane,
"the" Attempt, "the" copy or "the" session obeys these three; [audit-multiplicity.md](audit-multiplicity.md) has the
matrix behind them and a failing sequence for each case they close.

- **N1. One reference, one thing; many is a keyed list.** A declaration that can have several instances at once
  publishes them as a list in key order, each entry with `key`: `.each` copies, keyed schedules, `subscribe.each`
  placements, a keyed operation's write lanes. A read names its entry by key. A reference that can match several says in
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
  delivery to something gone has one rule: call endings are never dropped: they reach a live incarnation of their
  identity or its saved record, routed by owner (rules 8, 14, 17, 20, 44); raises and timers to a dead copy are dropped
  with evidence (rule 9); a released stream session's deliveries are discarded with evidence (merge 6). Whatever the
  store keeps for an Attempt (a prediction, an uncertain mark) holds its record (rules 30, 32).

**Entity domains** (2.8). Rules 26–38 are merge 4's ([merged/entities.md](merged/entities.md)); each names its
decision (E1–E18). Rules 13–25 and N1–N3 still apply.

26. **One split** (E1). For an operation registered in a domain, the domain owns shared data: the prediction, its
    confirmation and rollback, repair, the record queue, `uncertain` and `unconfirmed`. The operation and the
    machine own workflow: which event each ending becomes, its route, retry and cancel. A commit's `optimistic` and a
    `setData` action on its own entries are type errors on a domain operation (EDP:60-61; OD26). Memory holds workflow and never a copy of a record field; views read records and
    answers.
27. **Settlement for the store, admission for the lane** (E4, E13). At settlement Flow classifies the send, applies
    rule 18, applies the Attempt's ending to the store (rule 30) and releases record queues, in one publication, then
    queues the ending. At admission it maps the ending, tests its owner and applies the ending's cell to the lane (rules 14, 21); for a
    lane with no binding actor the Runtime applies the cell when the ending lands, and parks the ending (rule 44). A
    Runtime step publishes the rows it changes (2.5). Store effects never depend on whether the ending routes current
    or late, or on whether an actor is bound.
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
    or interruption ends on `failure` as `Defect` or `Interrupted`; a tag record must map them (rule 20; 2.8.10).
38. **Lanes and predicted keys persist together** (E14; amended by OD20). A domain write's lane record, its Attempt and
    that Attempt's predicted keys are written in one capture, the Attempt's one Persistence O6 acknowledgement before
    its first invocation (rule 46). Prediction values are never persisted.

**Operations in the definition** (2.7, 2.7.13–2.7.16). Rules 39–47 are the operations merge's
([merged/operations/proposal.md](merged/operations/proposal.md)); each names its decisions.

39. **Contracts** (OD4, OD11–OD15, OD17 Q18, OD18, OD23 Q37, Q38). A contract (`transaction`, `resource`, `stream`, or a
    domain entry) lives in `*.contracts.ts` and has exactly two schemas, `input` and `output`, flat at its top level,
    each a fields record or a full Schema (an omitted `output` is `Schema.Void`), and its function inline (`commit`,
    `lookup`, `subscribe`), which calls services whose Layer is the swap point. A transaction's `progress` keeps its own
    schema. `key` is required on every contract, streams included: a list of top-level `input` fields naming which
    server thing a call is about, `[]` for one; a composite key lists every field; its Schema is `input`'s pick; there
    are no derived or nested keys, and no default, domain writes included. On a resource, every `input` field that
    changes the output is in `key` (`KeyOmitsInput` warns otherwise); a stream's resume position is an input field
    outside the key. No Rpc inside; a `fromRpc` adapter comes later.
40. **Operations** (OD3, OD9 Q4, Q7, OD17 Q15, Q16). A definition declares every server interaction once, by name, under
    `operations: ({ E }) => ({ name: contract.outcomes({ … }) | contract })`; an operation holds no select, trigger, key
    or verb, and its mappings live only there. One write operation per write contract (`SharedContract` otherwise);
    reads and streams are exempt. A **bare** operation maps nothing: a bare write's endings are evidence and its unknown
    is not retained, so it never holds; `flow check` lists bare writes as info. The definition exports `O`, the
    operations' handles.
41. **Verbs and placements** (OD1, OD2, OD9 Q22, Q23, OD17 Q14). Operations are used through `O` with the contract's own
    verbs: `O.x.commit(select)` (write) and `O.x.lookup(select)` (one-off read) in `actions`; `O.x.subscribe(select, {
    when? })` and `O.x.subscribe.each(select)` (one session per distinct key of the selected inputs) in `activities`, a
    list of placements. The verb decides one-off or live and must agree with the mapping (`success` only with `lookup`,
    `value` only with `subscribe`); one operation uses one verb (`VerbMismatch`). A live operation is placed in one
    state at a time unless state tokens in `when` make placements exclusive (`DuplicatePlacement`). Each select is typed
    by its transition.
42. **Reads** (OD9 Q6, Q21, Q23, Q26; OD23 Q33). A one-off read operation has one lane; a lookup releases the previous
    lookup of the same operation, whose settlement is evidence (`Superseded`), and only the latest lookup's ending is
    delivered. Its row is Operations O6's resource lane for the entry its latest lookup named, with that entry's `key`,
    held until the next lookup or `cancel`, and `undefined` before the first lookup and after `cancel`; guards and
    callbacks read it with `O.x.get(operations, k)` as views do. `cancel` releases the operation's wait, not the shared
    request. One-off read lanes are not persisted. A live placement has one lane per placement (per key under
    `subscribe.each`), `undefined` while not placed, and no replacement rule beyond Operations O4.
43. **Key-less addressing** (OD4, OD8, OD19 Q35). On an unkeyed operation (`key: []`) a key-less member names its one
    lane. On a keyed one, `retry`, `retryable` and `cancel` may omit the key only in a handler of an event that
    operation alone maps, naming that ending's Attempt and, once it is resolved or released, the lane's addressable one
    (holding policies only); under `serialize`, only in the head's own ending's handler; in a `NotSent` ending they do
    nothing; anywhere else a key-less member is `KeyRequired`. `idle` and `get` always take a key on a keyed operation.
    Members take any value carrying the key's fields.
44. **A hold outlives its actor; handle it at the root** (OD19–OD22, OD23 Q40, OD25). Disposing a binding actor drops
    and cancels nothing: the Runtime keeps the lane, applies its endings and invokes what the table promotes. An ending
    with no binding actor is parked raw on its lane record for the identity's saved record, if one exists, and mapped
    through the current `outcomes` at delivery; otherwise it is evidence. A starting incarnation adopts only its own
    identity's **unbound lanes** (the oldest first, for equal local identities) and receives, before any external event:
    the parked endings in saved order; per lane in creation order, a held head's `unknown { Restored }` exactly once
    (and, on a reload, `NotSent { Restored }` for never-acknowledged work); an `InFlight` lane's ending when it lands.
    Adopted endings and every `unknown { Restored }` are current from the active leaf (rule 14). So a holding write's
    unknown, success and failure are handled at the root, with a path to an owner, reading what they need from the
    event, never from memory an earlier incarnation set. `runtime.unsettledWrites()` lists non-`Idle` lanes by identity,
    for a host's `beforeunload`.
45. **Every hold has an owner** (OD6, OD10, OD16, OD22, OD25). `flow check` reports `UnresolvedHold` (2.7.14) when a
    write on `reject`, `latest` or `serialize` maps anything but not `unknown`, or when, from some arrival of an event
    its `unknown` maps (one, or one per tag), a branch that keeps the hold reaches no `retry` or `cancel` of the
    operation; an error, or a warning when the owner exists but is unreachable. The same arrival set is rule 20's for
    the operation's other mapped events.
46. **Lane persistence** (OD9 Q26, OD17 Q12, OD20–OD22). Write lanes of a persisted identity are Runtime records under
    (actor identity, contract id, key), bound or unbound, never inside the actor's record; each Attempt carries its
    `retryCount` and whether it was acknowledged; Persistence O6 acknowledges once per Attempt, per lane record, and a
    persisted re-send waits for its lane record's capture. Restore follows the table's restore row (2.7.13). A lane
    record decodes by its contract's `input` pick, independent of the machine, so a fresh incarnation adopts it even
    when the actor record no longer decodes; a lane whose operation is gone, or whose key no longer decodes, goes to
    `orphaned` (P19). A local identity's lanes are never persisted; one-off read lanes are not persisted (rule 42).
47. **Mapped events come only from endings** (OD23 Q33). An event an operation maps is never a schedule's `send`, a
    `raise` or a view's `send`; operations map only `internalEvents`; `flow check` reads all three. Stories drive
    endings through the operation, `Story.ending(O.x, …)` (*Story reads: merge 3*).

### 2.5 The turn

One algorithm, shared by the runtime and `check()`. `check(snapshot, event)` runs steps 2–6 on the
given event and publishes nothing.

**What reads what.**

| Memory view | What it is | Read by |
|---|---|---|
| **Before** (the pre-turn snapshot) | the last published snapshot | every guard; every payload mapper (`raise`, `notify`, `exits`, `whenAbandoned` `.from`); the source's `updateMemory`; parts' `updateMemory` |
| **Before-walk** | the pre-turn memory with the source's patch applied, plus earlier resets | `resetOn`; `input` fillers |
| **Initial memory** | a new incarnation's starting memory (input fields, then constant and computed `Flow.initial`s) | guards, mappers and updates of parts addressed to an incarnation created in this turn |
| **After** | the memory the turn publishes: initial memory of new incarnations, then every patch in expansion order, after list repair; computed in step 5 | commit input selects; retry and cancel key selects; schedule functions; `keys`; `restartOn`; placement selects and `when`; `.each` membership; the `resetOn` re-check; `optimistic` (captured at start, rule 36) |
| **After lanes** | the lanes with this turn's members applied, in action order, in step 5 (rule 21) | `keys`; `when`; placement selects; the published rows |

**Lane reads** (`operations`, `get`, `idle`, `retryable`) in selects and guards are not memory: they see the pre-turn
lanes with the turn's own ending already admitted (rule 22). In an unknown's own turn the lane is `Held`, so `idle`
denies `Uncertain` and `retry` re-sends; in a success's turn the next queued commit may already be promoted, so `idle`
denies `InFlight`.

1. **Admit** (runtime only).
   - A pending reset from the last commit runs first, as its own follow-up turn (rule 1).
   - Otherwise, take the oldest event from the mailbox. The mailbox is FIFO in admission order: user sends,
     call endings, timer firings and `onContext` events queue together.
   - **A call's ending is mapped here.** The Attempt's ending was decided at settlement (rules 18, 27), and for a
     domain write its store effects are already published; here the ending's cell is applied to the lane, which may promote the
     next queued commit (rule 21, 2.7.13), the ending is mapped through its operation's `outcomes` (rule 13), and its owner is tested against the pre-turn
     snapshot (rule 14): a current event starts at the active leaf, a late one at the owner's nearest surviving
     ancestor.
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
     incarnation the turn ends. A reset's `whenAbandoned` comes after the raises into its fresh incarnation, and
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
     interrupts, releases or ends a never-sent commit. An admitted domain write joins every record queue it predicts and
     computes its prediction (rule 28). `check()` computes only the verdicts: it mints nothing, joins no queue and
     predicts nothing.

   A violation, a failing select or an invalid duration is a pre-commit defect. `check()` reports it as `Denied` with
   code `InvalidTurn`. A declined token element appears in `Denied.reasons` as
   `{ code: "NotInState", context: { state } }`. A rejected turn keeps none of its own members' cells; step 1's admitted ending keeps
   its cell (step 2).
6. **Commit.**
   - Apply exits (deepest first) and entries (outermost first).
   - Publish the after memory. Drop the copies the final list ended.
   - Cancel the schedules of ended incarnations, and freeze resumable ones.
   - Arm schedules, with the values step 5 computed, that start on entry (no `armOn`, or `Flow.entry` in it) for
     every entered, reset or created incarnation. Arm `armOn` schedules on every accepted listed event, raised ones
     included, accepted anywhere on the active path, and stop `disarmOn` schedules on theirs. A keyed schedule arms a
     timer for each key new to its list and cancels each key gone (rule 23).
   - Evaluate `resetOn` again on the after memory, and queue any pending resets as one
     follow-up turn at the head of the mailbox.
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
lane changes when the ending's turn is admitted (an unbound lane, when the Runtime applies the ending's cell, rule 44). Between the two, a record can read confirmed while the lane row still
reads `pending` (2.8.1). How a Story reads this frame and asserts the gap is merge 3's (*Story reads: merge 3*). A Runtime step that changes a
bound lane's row (an invocation raising `retryCount`, a storage refusal promoting the next commit) publishes that row on
its own, as a new snapshot; an old snapshot never sees it (Machines O8).

### 2.6 Conventions

**Key order.** Category keys appear in one order, from what the outside sees to the internals:

| Object                        | Order                                                                                                                                              |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| definition, trait, subroutine | `id`, `states` / `default`, `events`, `hostEvents`, `internalEvents`, `guards`, `callbacks`, `exits`, `memory`, `traits`, `operations` / `context` |
| machine or fragment body      | `default`, `schedules`, `traits`, `on`, `states`, `whenAbandoned`                                                                                        |
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
operation does is a member of its handle: `O.x.commit`, `.lookup`, `.subscribe`, `.retry`, `.cancel`, `.idle`,
`.retryable`, `.get`. A write lane is the Runtime's record of the actor identity (rule 21), read as snapshot data,
`s.operations`. `trait(…)` and
`subroutine(…)` stay plain constructors beside `definition` and `machine`; their inference comes
from branding their results and `const` type parameters, not from a namespace. `Outcome` is the commit function's
vocabulary, outside the machine (2.7.1).

**Properties live on what they describe.** A fact about a thing is written on that thing, never in
a separate list that refers to it by name. Named lists (`events`, `hostEvents`, `internalEvents`)
hold categories a reader scans for; modifiers (`Flow.private`, `.resumable()`) hold properties of one
item. Readability decides between the two.

### 2.7 Server calls

A definition declares each server interaction once, by name, under `operations`, and maps its endings with `outcomes`;
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
| Server truth in Stories | the fixture (a stateful fake server behind the service) | the Story reads the fixture; no ending is injected (Testing O3); `Story.ending` (rule 47) against this is merge 3's (*Story reads: merge 3*) |

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
      const api = yield* StripeApi                              // production wraps fetch; Stories use a fixture
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
  typing: ChatTyping.typing,                                                    // bare: maps nothing; the machine subscribes
}),
```

Per kind (OD3: the declaration is one shape, the rest is per kind):

| Contract kind | Verb in the machine | `outcomes` keys | Other members | Row |
| --- | --- | --- | --- | --- |
| transaction, domain write | `O.x.commit(select)` in `actions` | `success`, `failure`, `unknown` | `retry(k?)`, `cancel(k?)` in `actions`; `idle(k?)`, `retryable(k?, { times })` in `guard` | per contract key: `{ pending, uncertain, waiting, retryCount, progress? }`, the flags defined by lane state (2.7.13, OD10); under `allow`, `{ pending, outstanding }` (no hold) |
| resource, domain read, used one-off | `O.x.lookup(select)` in `actions` | `success`, `failure` | `idle`, `cancel` (rule 42) | one per operation: OPS O6's resource lane for the entry its latest lookup named, `undefined` before the first lookup (rule 42) |
| resource, domain read, used live | `O.x.subscribe(select)` or `O.x.subscribe.each(select)` in `activities` | `value`, `failure` | `refetch(k?)` | OPS O6's resource lane per placement, per key under `each`; `undefined` while not placed |
| stream, domain `listen` | `O.x.subscribe(select)` or `O.x.subscribe.each(select)` in `activities` | `value`, `gap`, `complete`, `failure` (M6 rule 50) | none | M6 4.1.5's stream lane per placement, per key under `each`; `undefined` while not placed |

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

A **bare** operation (`typing: ChatTyping.typing`, `ping: ChatTyping.ping`) maps nothing, for every kind: none of its
results becomes an event. What happens to them is the kind's own rule, not a second meaning of "bare": a write's
results are evidence only (rule 40), and a read's or stream's data is in its lane for views. Declaring a write bare is the
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
`output`"); **merge 6** streams gain `input` with the resume position outside the key, so M6 4.1.1's `messages` is
`input: { roomId, after }, key: ["roomId"]`; **merge 4** domain reads and writes take `input`/`output` from their
contract, and `.predicts` reads `input`; **Stories** build fake contracts with the same two schemas; **`flow check`**
reads `key` against `input`'s fields as data. OPS O1 is rewritten around `input`, `output` and a required `key`.

**The key is a field list of `input`** (decided, OD4, OD12; R3 K3), like an entity's `primaryKey`: `key: ["docId"]`,
and a composite key lists every field, `key: ["docId", "field"]`. **`key` is required on resources and transactions,
with no default** (decided, OD15): one lane or one cache entry is written `key: []`. Decided for streams as well
(OD23 Q38): required, `key: []` for one session, because a stream's key is its session identity (OPS
O4) and the same rule on every kind is one rule; a resume position such as `after` is an ordinary input field outside
the key (OD12). Consequences:

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
  Stories drive endings through the operation (`Story.ending(O.like, "unknown", { id })`, *Story reads: merge 3*); on a lane with nothing on
  the wire it is a Story error.
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
- **Two write operations on one write contract** in one definition are a declaration error (`SharedContract`). D9's
  "one write in flight per key" holds by construction, per actor identity (two live local actors with equal input are
  two lanes, R8 M5). Revision 2's `.joins` is removed (R2 A-M1, C-M6): a second kind
  of start is a second `commit` of the same operation with its own select; when the handlers must tell them apart,
  the starting transition records it in memory (9.2's `method`; R3 M6: correct for an unkeyed lane, a known limit for
  concurrent starts on different keys). Reads and streams are exempt: two reads never charge twice, and two sessions on
  one key end `DuplicateSession` (M6 rule 47).

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
filling of a fragment callback, or behind a schedule's event; it cannot be started from a guard, mapper or
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

Flow has no timeout and no retry (rule 25). Each is a state and a schedule.

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
released session cannot publish later (M6 rule 44). Nothing new is needed.

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
quotes: Market.quote.outcomes({ failure: E.QuoteLost.from((_e, { key }) => ({ symbol: key.symbol })) }),
// machine
activities: [O.quotes.subscribe.each(({ memory }) => memory.watchlist.map((symbol) => ({ symbol })))],   // one session per symbol in the after list
// view
useView(watch, (s) => List.O.quotes.get(s, { symbol })?.data)               // undefined for a symbol not placed
```

A key's subscription starts when the key first appears in the after list and is released when it leaves; a repeated
key keeps its first position, with `listRepair` evidence (rule 23). Each key's lane and deliveries behave as one
ordinary activity's (Machines O6; merge 6 for streams), and a delivery for a key that has left is discarded as a
released session's is. Two selected inputs with the same key are one session (rule 41); two placements of one key are
`DuplicateSession` (merge 6 rule 47).

#### 2.7.11 Batches and Stories

**Per-item results of a batch.** Each item is its own commit (keyed by item, `reject`, so each item's lane is one
call that `retry` can name: rule N2, Revision (multiplicity audit, 2026-10-31)) with its own Attempt, classification
and cache rule. The batching happens below the commit, in the adapter, with Effect's
`RequestResolver`: each commit calls `Effect.request(Archive({ id, key }), resolver)`, and the resolver sends one HTTP
request and completes each entry from the per-item statuses. Not spiked.

**Stories read the server's truth.**

```ts
const busyThenPaid = story.machine(Checkout, { id: "Checkout/busy-then-paid", fixtures: FakeStripe({ script: [{ status: 429, retryAfterMs: 2000 }] }) })   // Erratum (2026-10-30): 429 is Busy (the commit above); 503 would be unknown
  .send(E.Pay()).advance("3 seconds").process()
  .checkpoint("paid", ({ truth }) => truth.FakeStripe.charges === 1)   // the fixture's truth, read, not commented
```

A fixture may expose its truth; a checkpoint reads it. Every ending can be produced through services: `unknown` by a
dropped response, `NotSent` by a cancel during the Attempt's storage acknowledgement, by `reject`, or by a refused
acknowledgement (`StorageRefused`). `NotSent { why: "Overloaded" }` and record-queue order are reached with a
fixture that holds the head's answer plus enough sends (*Story reads: merge 3*). (Merge 3 designs the Story API for all
of this, `Story.ending` included, rule 47.)

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
| Restore and rebind | a new incarnation adopts its identity's lanes and receives, before any external event, its parked endings, then per lane a held head's `unknown { Restored }` and, on a reload, `NotSent { Restored }` for never-acknowledged work (rule 44); an Attempt acknowledged once restores as `unknown { Restored }`; its predicted records are marked uncertain and repaired before readiness, and an unacknowledged one predicted nothing (rule 38) |

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
| a one-off read lane (proposed) | from the operation's first lookup until `cancel`, or the actor ends; it holds its entry until the next lookup or `cancel` (R4 M4) | a released lookup's settlement is evidence only (2.7.9) |
| a placement's session | the state activation | a released session's delivery is discarded (M6 rule 44) |

- A lane's **status** changes **only in its binding actor's turns** (at a commit or lookup in step 5, OD16; at an
  ending's admission, step 1; at a `cancel`), **or in the Runtime's own steps for an unbound lane or after a turn**
  (invocation, endings with no binding actor, dispose, Runtime disposal; OD19, OD20). No store event and no other
  actor touches it (R2 C-M3; R5 L7: status, not data). A
  one-off read row's data is the held entry's current confirmed data, so another actor's refetch changes the data,
  not the status.
- A write lane is the Runtime's (OD19): it outlives its binding actor, and a `reject` hold that passes the terminal
  check (5.1's LEFT) stays, persisted with its mark, until a binding actor resolves or releases it (R7 L7).
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
   default** (decided, OD6): no quiet release and no automatic retry (rule 25).
4. **`cancel` acts on the same one Attempt as `retry`**; after it is released, the waiting commit is sent; `cancel`
   never silently drops a waiting commit (decided, OD7).

Every other sentence about write lanes in this design is a reading of the table below.

**Owner** (decided, OD19; R7 H1, K17). **A write lane is owned by the Runtime, not by the actor**, as TanStack
Query's `MutationCache` owns mutations rather than the component that started them (`mutationObserver.ts:96-99`:
unsubscribing only removes the observer; `mutation.ts:155-162`: a mutation with no observers is not cancelled, and is
kept while pending). The actor that commits is the lane's **binding actor**: it receives the lane's endings and its
members address the lane. Disposing that actor never drops or cancels the lane's sent, held or queued writes. The
Runtime keeps the lane, applies its endings to it (the table's lane effects and merge 4's store effects, which never
depended on the actor, rule 27), and invokes what the table promotes. **With no binding actor** (decided, OD21; R9
K25, H1), an ending is applied to the lane by the Runtime; if the lane's identity has a saved actor record (a
persisted actor disposed by retain expiry, or awaiting reload), the ending, including `NotSent { Disposed }`, is also
**parked** for that identity and delivered once to its next incarnation, in saved order (Persistence O2, O4). It is
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
is the adoption key, and while bound a lane belongs to its binding actor (R10 L4). The actor identity
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
Attempt. "Actor" in earlier sections reads as "binding actor". Amends Runtime O3 and V4 ("no outcome from an old
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
OD19: Q28 A). "Delivered" is a mapped event to the binding actor in a later turn, or evidence if there is none;
"→ promote" is defined above.

| Row | `Idle` | `InFlight` | `Held` |
| --- | --- | --- | --- |
| **`commit`** | mint an Attempt → `InFlight` | `reject`: ends `NotSent { Rejected }`, delivered, state unchanged; `latest`: becomes `W`, a previous `W` ends `Superseded` (evidence), **and an addressable Attempt never sent and not yet invoked is replaced too**: it ends `Superseded` and **the new commit becomes the addressable Attempt**, waiting to be invoked (OD20, F4; R7 L3); `serialize`: appended to `W`, past 64 `NotSent { Overloaded }` | as `InFlight`: the hold refuses (`reject`) or queues (`latest`, `serialize`); nothing is sent |
| **`retry`** | evidence `NothingToResend` | evidence `InFlight`, no re-send | re-send the addressable Attempt with its id and input (rule 31) → `InFlight` (waiting to be invoked) |
| **`cancel`** | nothing | on the wire: interrupt it; the lane stays `InFlight` until the interrupt's ending is admitted, `unknown { Cancelled }` (→ `Held`) or the real ending if it had already settled (R6 L1). Waiting to be invoked, **by history** (R7 H2): never sent → it ends `NotSent { Cancelled }`, delivered (rule 24) → promote; a re-send → it returns to `Held` and is released (`Released`, the record's mark kept, its record-queue entry withdrawn so it is never invoked, R8 L2) → promote | release the addressable Attempt (`Released`) → promote, or `Idle` |
| **`idle`** (guard) | passes | denies `InFlight` | denies `Uncertain` |
| **`retryable({ times })`** (guard) | denies `NothingToResend` | denies `InFlight` | passes if `retryCount < times`, else denies `RetryLimit { retryCount }` |
| **invoked** (Runtime) | cannot occur | waiting → on the wire, once every wait is met: the Attempt's one acknowledgement (a first send), its record queues, and, **for a re-send of a persisted lane, the lane record's capture of the re-send** (R9 M3; lane model C2; a failed capture is the storage-refused row); a re-send adds 1 to `retryCount` here | cannot occur |
| **storage refused** (before invocation; R7 L9) | cannot occur | never sent (its Attempt's one acknowledgement fails): ends `NotSent { StorageRefused }` (Persistence O6's `StorageFailure` evidence), delivered → promote. A re-send (its Attempt was acknowledged once, so it waits for no new acknowledgement; refused only when the lane record's capture fails before invocation): returns to `Held`, and **the operation's mapped `unknown` event is delivered again, with reason `StorageRefused`**, so a handler runs (OD20, F5; R8 M1) | cannot occur |
| **success** | cannot occur | delivered → promote, or `Idle` | cannot occur |
| **failure** | cannot occur | delivered → promote, or `Idle`; the failed Attempt is resolved, so a later `retry` is `NothingToResend` (amends rule 19) | cannot occur |
| **unknown** (incl. `StillUnknown`) | cannot occur | delivered → `Held` | cannot occur |
| **interrupt** (adapter, or after a `cancel`) | cannot occur | delivered as `unknown` → `Held` | cannot occur |
| **dispose** (the binding actor ends; R7 K17) | nothing (virtual idle lane) | unchanged: the Attempt stays waiting or on the wire, and the Runtime invokes it; its ending is applied, and is a pending mapped outcome of the identity's saved record if one exists, else evidence (OD21). An acknowledged re-send still waiting for its lane record's capture is unchanged: the Runtime owns the lane (OD19), so it captures it later and then invokes it (decided, OD25; lane model C8) | unchanged; the hold and `W` stay in the Runtime |
| **rebind** (an incarnation of **the same identity** starts and adopts the lane, OD20) | cannot occur (no lane) | unchanged; the new incarnation receives the ending when it lands | the hold is delivered **exactly once**, as `unknown { Restored }`, routed by the owner test below (OD20 F3, OD21, OD22), `retryCount` kept, unless that Attempt's outcome is already parked (G3; R10 L1); `W` stays queued |
| **restore** (Persistence O6) | nothing (virtual idle lane) | an Attempt acknowledged once (per Attempt, OD20 F2) restores as `unknown { Restored }`, delivered → `Held`, even if its current re-send was waiting, and even if it was acknowledged but never invoked: the Runtime cannot know whether invocation began before the crash (G1), so `retry` may be its first send, which the idempotency key makes safe; one never acknowledged ends `NotSent { Restored }`; each `W` entry ends `NotSent { Restored }`, delivered (C2); if a saved pending outcome exists for this Attempt, that outcome is delivered instead, once (G3) | stays `Held`, and the hold is delivered **exactly once**, as `unknown { Restored }`, from the restored incarnation's saved leaf (OD20 F3, OD21), unless the hold's own unknown is already among the record's pending outcomes (G3); `W` as in `InFlight` |
| **Runtime disposal** (OD20, K23; R8 M2; R9 H2) | nothing (virtual idle lane) | from its start nothing is invoked. Waiting, never sent: ends `NotSent { Disposed }`; predictions removed (rule 30); **for a persisted identity it is saved with the final capture as a pending mapped outcome and delivered to the restored incarnation** (OD21), else evidence. Waiting re-send: → `Held`. On the wire: Runtime O6 (settles within its bound, else unknown); an ending that settles before the final capture is saved as a pending mapped outcome (Persistence O3). Each `W` entry ends `NotSent { Disposed }` when the head's ending is admitted, or when Runtime O6's bound ends, so a lane's parked endings keep lane order (R10 M4). If the final capture fails, the last good capture's lane record restores per the restore row, which is also safe | stays `Held`; captured if the identity persists, else gone with the Runtime (evidence); each `W` entry as in `InFlight` |
| **SSR hydration** (OD20, K23; R8 M3) | lanes are never hydrated from the server; only resource entries are. A commit in flight at dehydration is reported (`DehydrateCommitInFlight`, ServerRendering O3, naming the actor and its state) and is evidence; no client lane is created. The transferred actor receives no ending for it: a state that waits for one waits until its own timers or the user move it, and a later client write to that key is unordered with the server's (stated limit, R9 M4) | cannot occur (no client lane exists before hydration) | cannot occur |

That is 16 rows by 3 states, 48 cells; 15 are "cannot occur" (an ending, an invocation or a storage refusal only
exists for an Attempt that is `InFlight`; a rebind needs a lane; hydration creates none), and 33 are reachable, of
which 4 change no lane (dispose, restore, Runtime disposal, hydration in `Idle`; hydration's reports evidence, R9 L5). The
two "cannot occur" hydration cells are untestable by construction (G6, stated). `unknown`
and `interrupt` have the same effect; they stay two rows because their causes differ. `StillUnknown` is rule 18's
name for a re-send's failure, which is treated as unknown. **An ending admitted in a `Denied` or `Unhandled` turn
counts as delivered** (OD20, F8): its lane effect is kept, and it is not delivered again. An ending of an Attempt
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
| **`commit`** | mint → `InFlight` | on the wire: interrupt it (its ending is evidence by Attempt id), mint → `InFlight`; waiting to be invoked, never sent: it ends `Superseded` (evidence), mint; a waiting re-send: it becomes evidence (released), mint (OD20, F6) | mint → `InFlight`; the held one becomes evidence |
| **`retry`** | `NothingToResend` | evidence `InFlight` | re-send, same id → `InFlight` |
| **`cancel`** | nothing | as the holding table (by history before invocation) | release (`Released`) → `Idle` |
| **`idle`**, **`retryable`** | as the holding table's `Idle` | as its `InFlight` | as its `Held` |
| **success**, **failure** | cannot occur | delivered → `Idle` | cannot occur |
| **unknown**, **interrupt** | cannot occur | delivered → `HeldThisTurn`; with no live actor and a persisted identity: parked, and the lane is **`Held` (parked)** between turns until delivery (OD25, C5) | cannot occur |
| **turn end** | | | → `Idle`; the unknown is evidence |
| **invoked** | cannot occur | waiting → on the wire | cannot occur |
| **storage refused** | cannot occur | never sent: `NotSent { StorageRefused }`, delivered → `Idle`; a re-send: delivered as `unknown { StorageRefused }` → `HeldThisTurn` (OD20, F5; R9 L4) | cannot occur |
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

Under **`allow`** (OD20, F9), a lane is a set of independent Attempts, each following the `cancel` table's rows for
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
| `serialize` | yes | queued commits, FIFO ≤ 64 | the head | amends N2 and C18 (`retry`, `retryable`, `retryCount` on the head); key-less members only in the head's own ending (Q35 A); "drop the queue" and per-item stops have no member ([open-items.md](open-items.md); a keyed design) |
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
sending the user events that hold them; endings with `Story.ending(O.x, ...)` (*Story reads: merge 3*); dispose and rebind by disposing the
Story's actor and starting another incarnation of the same identity in the same Runtime; restore with the Story's
reload. `Story.ending` on an unbound lane addresses the lane by identity in the Story's Runtime (R8 L6): a shared actor
by its ref, a local one by its machine and input (R9 L6). All 33 reachable
cells per holding policy, the storage refusal, Runtime disposal and the unacknowledged-restore cell belong to **a
policy suite in Flow's own tests**, which drives the real Runtime under the TestClock, not to an app's Stories (R6 L2). The executable lane model (in
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
  members goes to [open-items.md](open-items.md) with these four cases; no word now.
- **Independent work one at a time.** Under unkeyed `serialize`, one unknown holds every later write (photo 3 holds
  photos 4–20); `allow` neither throttles nor holds. A throttle of independent writes is a memory queue in the
  machine (commit the next file on `Uploaded`). Stated as a cut, for [open-items.md](open-items.md) (R4 M6).

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
3. Closures are over-approximated (any closure guard may pass); Flow's own token guards are not: `X.idle` blocks,
   `X.retryable` blocks once its budget is spent. A `cancel(k)` on a keyed X counts for any key (the key is a
   closure), which is stated as inherent. Also inherent, stated (R6): a closure guard that reads
   `O.x.get(operations, k).uncertain` is `idle` written by hand and is not seen as blocking (false negative); an owner
   path through `X.idle(k)` for a different key is treated as blocked (rare false positive); an owner reached only
   through a schedule whose `keys` closure never includes the lane is counted (false negative).
4. **Disposal and reload** (decided, OD19, OD20). A host that disposes the actor, or a reload, does not end a hold:
   the lane stays with the Runtime (or its persisted lane record), and the next incarnation **of the same identity**
   receives it exactly once, as `unknown { Restored }`, current, from its active leaf (F3, OD21). So the check needs no
   host knowledge; rule 2's new-incarnation arrivals are what make a new incarnation an owner, and their "unhandled"
   branch makes a missing handler an error. Stated limit: if no incarnation of that identity starts again, the hold lasts
   until the Runtime ends (or, persisted, until a reload); Inspection lists it. The executable model's 6b audit
   (`lane-model/RESULTS.md`) found the two missed entries into `Held`, a refused re-send and a reloaded hold; both now
   deliver U (F3, F5), so both are arrivals.

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
  bound or unbound, with its Attempts, each with its `retryCount` and whether it was acknowledged (R2 C-M1). It is
  not inside the actor's saved record; restore and ensure bind the incarnation to the one lane record (2.7.13, "Lanes
  are Runtime records"). The key decodes with `input`'s pick (OD4; closes R3 M5). A restored unknown holds its lane
  again (OD5), so a reload cannot send a newer write ahead of it; the flags are derived, not stored. The table's
  restore row is the whole rule: an Attempt acknowledged once is delivered as `unknown { Restored }`; a `Held` lane's
  hold is delivered **exactly once**, as `unknown { Restored }`, from its saved leaf, in delivery order (2.7.13; OD20, F3;
  R10 L3).
  Revision 9's "not delivered again" (R5 L6) is removed: a reload is a new incarnation, whose handlers have not seen
  the hold. 8.2's first `SaveUnsure` branch therefore re-sends once after a reload, within its budget, which
  `retryCount` keeps. A persisted waiting commit was never sent, so restore does not replay it; it ends
  `NotSent { why: "Restored" }` (C2, R4 L1), and an autosave that should re-send it re-arms on that ending (8.2).
- **A live placement** re-opens from its input, and M6 rule 51 restores the data (OPS O4, Persistence O4).
- **A one-off read lane is not persisted.** OPS has no restore for finite lookups and the
  lane holds no workflow fact the server does not: on restore the row is `undefined` and nothing is delivered, so a
  state that was waiting for a lookup must look up again (5.1's `READING` does, on its next poll). **Decided (OD9,
  Q26).**
- A write lane whose contract no longer has an operation, or whose key no longer decodes under the contract's key
  Schema, goes to `orphaned` (P19). Changing a contract's key fields is therefore a persistence break, as changing
  an entity's `primaryKey` is.
- So renaming an operation (`pay` to `charge`) changes nothing persisted: R1's double charge cannot occur, with no
  alias. Revision 2's `.was`, the rebind ladder and `Rebound` are removed.

#### 2.7.16 Views, `check()`, Stories, `flow check`, `flow explain`

- Stories: `ending` evidence names `operation`, `contract`, the verb (`commit`, `lookup`, `subscribe`) and `key`;
  `Superseded` is an evidence kind, for a never-sent `latest` commit or a released lookup; `Released` (proposed) for
  an unknown `cancel` released. Stories drive endings with `Story.ending` (*Story reads: merge 3*); a Story reaches the cells its
  machine's transitions allow, and all reachable cells belong to a policy suite in Flow's own tests (2.7.13). The
  walks listed in 2.7.13 are Stories by steps.
- `flow check`: errors `SharedContract`, `DuplicatePlacement`, `VerbMismatch` (2.7.3, proposed), `KeyRequired` (2.7.3,
  decided, OD8), `UnresolvedHold` (2.7.13, decided, OD6 and OD10, a check over the write-lane graph from tokens; a warning when only
  unreachable; it also covers a holding write that maps anything but `unknown`), a mapped event used as a schedule's
  `send`, a `raise` or a view's `send` (2.7.3, proposed); a contract without `key` (OD15; a type error first), a key
  field that is not a top-level `input` field; warning **`KeyOmitsInput`** (proposed, R7 K19): a resource's `input`
  has a field outside its `key`, which would alias cache entries (non-key input is read only when the entry opens,
  OPS O2); streams are exempt, since a resume position is non-key by design (OD12); a paged resource puts its page
  cursor in `key`, since each page is its own entry (R8 L4); warning `UnusedOperation`; info: bare writes. Field-list
  keys are data, so `flow check` and Inspection print every lane's key without running code (R10). Rule 20's `NotSent`
  requirement is read per operation. `SharedCopyLane` is deleted. Because the verb at each use is a token, the
  one-off or live kind of every resource operation is read from the machine without reading a mapping or a closure.
- `flow explain`: `Toggle  READY → READY; commits like (Issues.setLike, latest, one lane per Issue key)`;
  `SearchDue  READY → READY; looks up results (Search.query, one lane)`; `READY subscribes issues (Issues.list)`.

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
  write members; a stream's has `subscribe` and `subscribe.each`; a resource's has `lookup`, `subscribe`,
  `subscribe.each`, `refetch`, `idle`, `cancel`. Rule 41 narrows a resource handle by its mapping: mapping `success` drops
  `subscribe`, mapping `value` drops `lookup`, so a mismatch is a type error. "One operation, one verb" for a bare or
  failure-only resource is not typed (it spans transitions); `flow check` reports it from the tokens.
- **Rows typed from the definition alone**: possible because a resource row is OPS O6's lane for either verb (rule 42);
  were one-off rows `{ pending }`, as in revision 3, a bare resource's row type would depend on the machine's verb,
  which the definition cannot see (the rejected alternative to Q21, decided as OD9).
- **`get(s, key?)`** is typed by the contract's key fields for writes (returns the row) and by the `each` key for live
  placements (returns `Lane | undefined`); a one-off read and an unkeyed placement take no key.
- **Watch**: no excess-property check on returned literals (TS (j)); errors collapse onto callback heads (TS shape 2).

### 2.8 Server calls and entity domains

For an operation registered in an entity domain, **the domain owns shared data; the operation and the machine own workflow**.
Rules 26–38 (2.4) are normative; this section shows them. It is merge 4 ([merged/entities.md](merged/entities.md)),
whose record also holds the review findings it answers (A-H1 to F-L2, from
[merged/server-calls/reviews/entities.md](merged/server-calls/reviews/entities.md)). Citations use its short names:
LIST is [merged/server-calls/rewrites/list.ts](merged/server-calls/rewrites/list.ts); EDP `EntityDomains.plan`, OPS
`Operations.plan`, PER `Persistence.plan`, ED `references/design/entity-domain.md`, EDX
`references/design/entity-domain-examples.md`, REV the entities review. "The store" is the Runtime's record store
(EDP:6, EDP:62-64). Parts that need Story reads are marked *Story reads: merge 3* (section 7 item 17).

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
      issues: Issues.list.outcomes({ value: E.Listed.from((v) => ({ ids: v.issues.map((i) => i.id) })) }),   // maps value: the machine subscribes (S11)
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
  the ending, which is what `O.pay.idle` and "Saving…" mean (D5, D6); for a lane with no binding actor, the
  Runtime applies the cell when the ending lands and parks the ending for the identity's saved record (rule 44). A
  Runtime step publishes the rows it changes (2.5).
- **Rule 18 moves to settlement** (found checking E4/E8). 2.5 step 1 applies rule 18 at admission, but the store needs
  the Attempt's ending at settlement. Rule 18 reads only the Attempt's send history, which is known at settlement, so
  nothing else moves; admission only maps it.
- **Routing never changes store effects (E13).** A late or current ending, or one applied with no binding actor, has the same store effect,
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
// lockout.test.ts: a fragment alone (rule 11); send runs its turn, process drains due work
const L = Lockout({ limit: 2, length: "1 minute" });
const locks = story
  .machine(L, { id: "Lockout/locks-then-clears" })
  .send(L.E.Strike()).send(L.E.Strike())
  .checkpoint("locked")
  .advance("1 minute").process()
  .checkpoint("cleared");
// locked: memory.strikes === 2, schedules.timer.done.dueAt === now + 60_000, run.calls.onLocked.length === 1
// cleared: memory.strikes === 0, run.calls.onUnlocked.length === 1
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
// confirm.test.ts: a subroutine alone (rule 11)
const yes = story.machine(Confirm, { id: "Confirm/yes" }).enter({}).send(Confirm.E.Yes()).checkpoint("end");
// run.checkpoints.end.exit → { exit: "Confirmed", payload: {} }; .leave() instead would abandon it
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
| **New, fragments** | `trait`, `subroutine`, `traits` (root and node), `Flow.state`, `.resumable()`, `.each` (`of`, `max`, `by`), `key` / `item` in fillings and copy views, `.key(k)`, `hostEvents`, `guards`, `callbacks`, `exits` (declarations and fillings), `notify`, the `Flow` module (`Flow.Guard`, `Flow.Callback`, `Flow.Exit`, `Flow.optional`, `Flow.uncertain`, `Flow.annotate`, `Flow.input`, `Flow.initial`, `Flow.private`, `Flow.Denial`, `Flow.entry`), `raise`, `resetOn`, `whenAbandoned`, the definition's `handler` / `guard`, state tokens in guard arrays, `story.machine(fragment)` with `.enter` / `.leave` / `run.calls` / `checkpoint.exit` |
| **New, plans** | `Outcome.success`, `Outcome.failure`, `Outcome.unknown`; Flow's reasons `NotSent { why }` (`Cancelled`, `Restored`, `Rejected`, `Overloaded`, `StorageRefused`, `Disposed`), `Cancelled`, `Restored`, `Interrupted`, `Defect`, `StillUnknown { failure }`, `StorageRefused`; evidence `Superseded`, `Released`, `NothingToResend`, `InFlight`; (operations merge) contracts with `input`, `output` (omitted: `Schema.Void`) and a required `key: [...]` field list, in `*.contracts.ts`; `operations: ({ E }) => ({ … })` with `contract.outcomes({ … })` (`unknown` may be a record by tag); the handles `O.x` with `commit(select)`, `lookup(select)`, `subscribe(select)`, `subscribe.each(select)`, `retry(k?)`, `cancel(k?)`, `idle(k?)` (a partial key allowed), `retryable(k?, { times })`, `refetch`, `get(s, k?)`; the rows `s.operations.<name>` with `pending`, `uncertain`, `waiting`, `retryCount`, `progress`, `outstanding`; the mapper's `{ input, attempt, progress, key }`; the operation's options argument `.outcomes(mapping, { writes })` and the commit's `{ optimistic }` (OD26); `runtime.unsettledWrites()`; `Story.ending` (*Story reads: merge 3*); the findings `SharedContract`, `DuplicatePlacement`, `VerbMismatch`, `KeyRequired`, `UnresolvedHold`, `KeyOmitsInput`, `UnusedOperation`; the denials `Uncertain`, `RetryLimit`; `DehydrateCommitInFlight`; `attempt.id`, `attempt.retryCount`, `attempt.mayHaveApplied`; `concurrency: "latest"`; the record read `{ data, predicted, uncertain, unconfirmed }` (`predicted` replaces the record's and the resource lane's `pending`); (merge 5) the condition operators `or`, `not`, `gt`, `gte`, `lt`, `lte`, `isNull`, a predicted field's `(beneath, input) => value`, the Runtime option `checkReplays`, the warning `PredictionNotRetained`; the codes `InFlight` and `LateMayNotLeave`; `keys` on keyed schedules (key records); `.checkpoint(name, ({ truth }) => …)`; `orphaned`; `.history` (and `.history.child`); `armOn`; `disarmOn`; `s.schedules`; `dueAt` (the `model()` options `invariants`, `hot` and `explore` are removed with T1) |
| **New concepts, not words** | **incarnation** (one life of a fragment instance), **frozen** (a resumable trait while its node is inactive), **summary** (a contract's inferred per-alternative effects), the memory views **before**, **before-walk** and **after** (2.5, rule 22), pending reset, the three **channels** (2.7.1), a **write** (one Attempt) and a **send** (one invocation), a **contract** and an **operation** (rules 39, 40), the **write lane** with its states **`Idle`**, **`InFlight`**, **`Held`** and **`HeldThisTurn`** and its queued commits **`W`** (rule 21, 2.7.13), the **hold**, the lane's **addressable Attempt**, **after lanes**, the **binding actor**, an **unbound lane**, **rebind**, **actor identity**, a **pending mapped outcome** (rule 44), a **keyed list** (rules 21, N1, N2), a call's **owner** and its **current** or **late** ending (rule 14), **late turn** (rule 15), the **Attempt's ending** (rule 18); the **record queue** (per record, across actors, rule 29), the **uncertain mark** (per record and Attempt, rule 32), **settlement** versus **admission** (rule 27), a **create draft** (`creating`, a convention, rule 33); (merge 5) yes / no / maybe, a **carried path**, the **record beneath**, an **uncomputed** prediction, a **prediction fault**, `many` |
| **Existing** | `definition`, `machine`, `states`, `default`, `events`, `internalEvents`, `input` (caller side only: `ensure`, `useActor`, a host's filling), `memory`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`, `restartOn`, `transaction`, `key`, `concurrency`, `commit`, `outcomes`, `optimistic`, `setData`, the Attempt, `deny`, `check`, `model` (marked for removal, T1), `S`, `E`, `O`, `.from`, `payload` |
| **Removed** (operations merge) | commit values and their `{ outcomes }` option; `writes` as a commit option; `s.calls`; `s.activities` and the `activities` record; `keys` on activities; `read.fetch(key)`; the mapper's `superseded`, `laneKey` and copy `key`; `SharedCopyLane`; the default lane key of a domain write; key closures `key: (i) => …`; `result` and `params` on contracts; `*.operations.ts`; `NotSent { Superseded \| NothingToResend }` as endings |
| **Author-chosen** | every other name (`Field`, `Lockout`, `challenges`, `LOCKED_OUT`, `canEdit`, `onLocked`, …) |

## 4. Against the problems in principles.md

| Problem | Answer |
|---|---|
| **L1** stale timers, **T2** schedule traps | Prevented. Schedules stop with their incarnation. Arming ids drop firings from before a re-arm (P11). `armOn` replaces counter idioms. The `restartOn` baseline is the activating turn's memory (P8). A schedule function reads the memory its own turn wrote (rule 23). |
| **L2** late results | Prevented. A call's ending is routed when its turn is admitted, by its owner: current from the active leaf, late from the owner's nearest surviving ancestor (rule 14). Raises and timers to `.each` copies follow the copy's incarnation (rule 9); call endings started in a copy are never dropped (rules 9, N3); an adopted ending is current from the active leaf (rule 14). |
| **L3** leftover memory | Prevented by placement and incarnations. `.resumable()` is an explicit opt-in to carry data back. |
| **L4** no way out | Prevented. The host may always leave a subroutine's state (rule 6). |
| **L5** abandoned effects | Prevented. A late ending is the same mapped event, handled at an ancestor, and every late event that can occur must be handled (rules 14, 20). A late handler may start a compensating call, which can finish (rule 15). |
| **L6** silent admission, **L8** phantom replies | Prevented. A call never sent ends `NotSent { why }`, and a declined start or retry is an ending too (rules 16, 17). Lanes are readable as snapshot data (`s.operations`, `O.x.get`, rules 21, N3); replaced never-sent work is evidence (rule 17). A raise or timer into a dead incarnation is dropped with evidence; a call ending never is (rule 9; Revision (multiplicity audit, 2026-10-31)). |
| **L7** departure gap | Allowed. Refusing a new submit while an earlier write is still unfinished is host code (`verify.idle(key)`, as the sign-in does). |
| **E1** broken invariants, **E4** refusal by forwarding | Prevented. Refusal happens only at declared guards, and deliveries cannot be refused (rule 8). A decline refuses only the write, never the transition (rule 16). |
| **E2** interfaces growing with depth | Prevented, for types and for checks. Hosts are checked against contract summaries only (rule 10). |
| **E3** hidden endings | Prevented. Only exits leave a subroutine. Callbacks never leave their node. |
| **E5** preempting observers | Prevented. A late turn cannot exit a state that owns another pending call, or an active subroutine (`LateMayNotLeave`, rule 15). Lateness is not transitive, so compensation can finish. |
| **H1** bypassed policy | Allowed, by design. Host-owned facts are `hostEvents`, and list membership is host memory (rule 9). |
| **H2** unforeseen checks | Allowed, by choice: declare the guard in the fragment. |
| **H3** faked results | Prevented. Exits are never sendable. `internalEvents` come only from the fragment's own schedules. |
| **H4** mislabelled results | Prevented. The commit classifies each ending with `Outcome` where it reads the response (2.7.1); `unknown:` reaches only `Flow.uncertain` events (rule 13); a definite failure after an unknown send stays unknown (`StillUnknown`, rule 18). |
| **H5** interrupt treated as not sent | Prevented. An interruption after invocation is unknown (`Cancelled`, `Interrupted`); only one before invocation is `NotSent` (rule 24). Re-sending after an unknown is `.retry`, the same Attempt (rule 19). In host code, starting a new write from an `uncertain` handler is a convention. |
| **D1** drifting copies | Prevented. Fragment memory, resumable slices, schedule deadlines and lanes are readable, so nothing is copied; an entity record is never copied into memory (rule 26); the Attempt stays in the Runtime's lane, not in events or memory. |
| **D2** live values on retry | Prevented. `.retry` re-sends the lane's addressable Attempt with the input it was started with, only in `Held` (rule 21), and exists only where a lane has one (rule N2). |
| **D3** feedback loops | Not applicable: fragments do no I/O. |
| **D4** unmapped outcomes | Prevented. `failure:` is exhaustive by tag (rule 13), and every current and late event that can occur must be handled (rule 20). |
| **D5** restore in flight | Prevented. Write lanes are Runtime records of the identity, restored by the table's restore row, and an ending with no live incarnation is parked and routed by its owner (rules 14, 44, 46). Attempts survive a version change through `orphaned`, at least once (P19). Saved-state compatibility Stories are left out (section 6). |
| **D6** same-turn seeding | Prevented. `input` and `resetOn` read the before-walk memory; selects and schedules read after (rule 22). A transition that reads a key it writes in both views is a warning. |
| **D7** drafts lost | Prevented where the fragment declares `whenAbandoned`, or the trait is placed high enough, or with `.resumable()`. Otherwise it is a convention. |
| **A1, A2** forwarding, scattered blocks | One filling block per instance. A view sends at the instance path, so nothing is forwarded. One `outcomes` mapping per operation, on the definition, serves current, late and adopted endings. |
| **A3** conditional rules, **A4** overloaded words | Avoided. Each kind has its own rules, and every new word is listed. |
| **A5** I/O inside fragments | Prevented (rule 3). |
| **A6** silence discovered late | By the fragment author's choice. Required ports are type errors; optional guards are an info finding. Dead exits and unused host events are warnings (T2). A missing late handler is an error (rule 20). |
| **A7** forgotten first send | Not applicable: the host starts every operation on its own transition. |
| **T1** partial turns | Prevented by the turn algorithm (2.5): one selection, no fallthrough on a child's refusal. |

## 5. Plan amendments

Each row names the plan outcome, the rule, and the sentence it replaces or adds. Draft syntax is in
sections 2 and 3. Earlier drafts' rows P1–P4, P9, P10, P12–P14, P16 and P17 are replaced by the server-call rows
C1–C18 (their record is in [merged/](merged/)); P15 and P20 are rewritten in place.

### For fragments

| Plan | Rule | Replaces or adds |
|---|---|---|
| **Machines O1** | Definitions gain `traits` (the root's `traits`, and `Flow.state(children \| {} \| Sub, { traits })` on a node; `.resumable()`; `.each`) and fragment states. Fillings sit at the node where a fragment is placed. A fragment declares what a definition declares (`id`, `events`, `internalEvents`, `memory`, child `traits` / `states`) plus `hostEvents`, `guards`, `callbacks` and `exits` at the top level, its body's `whenAbandoned`, and an inferred summary. Machines gain one filling block per instance. Names share one namespace | Adds to "A definition requires id, states and events." |
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
| **Persistence O2** | Resumable slices, frozen schedules and `.each` copies with their incarnation counters persist with the actor; (Revision (multiplicity audit, 2026-10-31)) so do keyed schedules' per-key timers, by key with `dueAt` (rule 23) | Adds to "Actor state, memory … survive reload" |
| **Testing O1** | `story.machine` also accepts a fragment (`.enter`, `.leave`, `run.calls`, `checkpoint.exit`, host-event sends). `send` runs its turn; `process()` drains operation work and due timers. Copies' incarnations are deterministic | Adds to "story.machine(machine, { … }) tests one fresh actor" |
| **Inspection O1** | Fragments, `.each` copies, incarnations, fused transitions and contract summaries appear under their instance names | Adds |
| **CommandLine O5** | Errors: rule 12's list. Warnings: overlaps only closures separate; history targets over non-resumable fragments or states that own a call; a mapper reading a key its own turn writes (from Story traces). Info: unfilled optional guards. The server-call findings are C18 | Adds |

### For every machine: turns, history, timers

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| P5 | Machines O2, Persistence O2 | `S.X.history` targets X's last active child, or its default. `S.X.history.child(s)` reads it. It restores control only; data comes back only through placement or `.resumable()` | Adds |
| P6 | Machines O5, O8 | Armed schedules expose `dueAt` at the paths of 2.1 | See Machines O8 |
| P7 | Machines O5 | A schedule without `armOn` starts on entry. `armOn: [...]` starts it on each accepted listed event, raised ones included, restarting it if running; with `Flow.entry` in the list it also starts on entry, otherwise it is idle on entry. `disarmOn: [events]` stops it on each accepted listed event; stopping an idle schedule does nothing. Exit stops any schedule. An event in both lists, or `armOn` together with `restartOn`, is a construction error. Every temporal construct is delayed: it never counts the turn that arms it. An event listed in an active schedule's `armOn` or `disarmOn` is handled by it where the node has no written handler: an implicit unguarded `{ target: "self" }` | Replaces "Entry arms a schedule; exit cancels it" with "Entry arms a schedule without `armOn` (or with `Flow.entry`); `disarmOn` and exit cancel" |
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
| C16 | Testing O2, O3 | A Story checkpoint may read fixture truth (`.checkpoint(name, ({ truth }) => …)`); every ending can be produced through services | Adds |
| C17 | Persistence O4, O6 | Write lanes are Runtime records of the actor identity (C44–C48), acknowledged once per Attempt, in one capture with the records the Attempt predicts; prediction values are never persisted (rules 38, 46). On restore, an Attempt acknowledged once ends `unknown` (`Restored`) and an unacknowledged one `NotSent { why: "Restored" }`; parked endings and held lanes are delivered in rule 44's order, routed by the one owner test (rule 14) | Replaces the former P12 ("a fenced commit restores with its activation"); extends "A crash after acknowledgment restores unknown carrying the same Attempt…" |
| C18 | CommandLine O5 | Errors: a late event with no handler at a strict ancestor of its owner, naming the event and the state; `failure.NotSent` unmapped where it can occur; an adopted ending unhandled in a leaf of its operation's arrival set (rule 20); `SharedContract`, `DuplicatePlacement`, `VerbMismatch`, `KeyRequired`, `UnresolvedHold` (rules 40–45); a mapped event used as a schedule's `send`, a `raise` or a view's `send` (rule 47); a contract without `key`, or a key field that is not a top-level `input` field (rule 39); (merge 4) `concurrency: "cancel"` on a predicting write (rule 29); `Defect` or `Interrupted` unmapped in a read operation's tag record (rule 37). Warnings: a state-changing transition listing a `reject` commit without its `idle` guard (rule 16); one transition reading, in both memory views, a key it writes (rule 22); `KeyOmitsInput` (rule 39); `UnusedOperation`; `UnresolvedHold` when the owner exists but is unreachable (rule 45); a one-record domain write whose key fields are not those its predicted record's key reads (rule 34). Info: bare writes (rule 40). Type errors: `retry`, `retryable`, a row's `retryCount` or `progress` under `allow` outside an ending's own handler (rule N2); a key-less member outside its operation's ending (rule 43). `SharedCopyLane` is deleted. Display: the commit node shows its operation, contract, verb, policy and key, and for a domain write its predicted entity, key and field names, `.alsoChanges` targets and the reads they reach; `flow explain` prints the lane key and cardinality (A-L2; merge 5, 3.7; 2.7.16) | Adds |
| C19 | Machines O6 | *Superseded by C40 (operations merge): `subscribe.each` replaces keyed activities.* | — |
| C20 | Operations O3, Machines O1 | *Deleted (operations merge): the Attempt carries no copy key; a commit from a copy's filling is an ordinary commit of the host's operation (rule 9).* | — |
| P15 | Operations O3, Persistence O6 | All sends of a write are **one Attempt** (same id, same input). `attempt.retryCount` counts the re-sends. The Attempt is acknowledged once, before its first send; a persisted re-send waits for its lane record's capture (C48) | Adds to "A persisted actor's remote commit cannot invoke its adapter until storage acknowledges its Attempt" |
| P19 | Persistence O5 | A write lane whose operation is gone, or whose key no longer decodes under the contract's key Schema, survives in a version-independent record; after ready it goes to its descriptor's `orphaned` handler (which may `retry` or invalidate), or else surfaces as an issue. Delivery is at least once, so the adapter must be idempotent. Input that no longer decodes under the new Schema is an issue, not a retry. An orphaned retry has no actor: its ending is evidence only. An actor record that no longer decodes does not orphan its lanes: they decode by their contract's `input` pick and the fresh incarnation adopts them (rule 46; C47) | Adds to O5's version-change rule |
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
| C27 | EntityDomains O1, Operations O5, O6 | The record read is `{ data, predicted, uncertain, unconfirmed }`; the resource and answer lane's "true for live optimistic values or predictions" is `predicted` (E16) | Replaces `pending` at EDP:130, OPS:153, OPS:166. Testing.plan still says `pending`; the Testing amendment waits (*Story reads: merge 3*) |
| C28 | EntityDomains O1 | A domain write states its `key` like every contract; `flow check` warns when a one-record write's key fields are not the input fields its predicted record's key reads (rule 34, OD15) | Replaces EDP O1's default lane key and merge 5's `many` sentence |
| C29 | Operations O2 | A read operation's `success:` sees confirmed data only; a read's defect or interruption ends on `failure` as `Defect` or `Interrupted`, required in a tag record (rule 37) | Adds to O2's call values |
| C30 | Inspection; EntityDomains O2 | Inspection (ED 7's evidence table): `queue` events gain `superseded`, `cancelled` and `overloaded` removals; `uncertain` "ended (later write or reconciliation)" becomes "ended (a later write succeeded, or a retry of the Attempt succeeded)"; held lanes, bound or unbound, appear in Inspection by identity (C51; *Story reads: merge 3*). *Story reads: merge 3:* EntityDomains O2's `Entity.queue` states include removals with their `NotSent` reason, pending merge 3's choice of read (its revision 3 reads removals from `ending` entries) | Adds |

Merge 5 amends EntityDomains O1/V1, CommandLine O1/O5/O6/Q1 and Inspection O1/O4/D1/D2; its amendments are listed by
target in [merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md) section 6.4 (with
`entity-domain.md` and `sync-engine-adapter.md`, which are designs, not plans).

### For operations in the definition

The operations merge ([merged/operations/proposal.md](merged/operations/proposal.md), 2.7.13's amendment list).

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| C31 | Operations O1 | Contracts have `input` and `output` (a fields record or a Schema; an omitted `output` is `Schema.Void`), the function inline, `progress` with its own schema, and a required `key`, a list of top-level `input` fields, `[]` for one; streams too; files are `*.contracts.ts` (rule 39) | Replaces `key(params)`, `result`, `params` and the optional key |
| C32 | Operations O2 | A one-off read operation has one lane and delivers only its latest lookup; its row is O6's lane with `key`, held until the next lookup or `cancel`; not persisted; the verb agrees with the mapping (`VerbMismatch`) (rules 41, 42) | Replaces "each finite lookup settles once" for lookups through one operation, and C5's call values |
| C33 | Operations O3 | The write lane table (2.7.13): the hold; promotion; invocation after the turn; `retryable({ times })`; a failed Attempt is resolved; one write operation per contract; write lanes are the Runtime's, disposal drops nothing, and endings of unbound lanes are parked (rules 21, 40, 44) | Replaces C8 and Operations O3's disposal sentences |
| C34 | Operations O4 | A stream is declared under `operations` and placed with `subscribe` or `subscribe.each`; `key` is required (rules 39, 41) | Adds |
| C35 | Operations O6 | Rows are `s.operations.<name>`; `O.x.get(s, k)` is total for write lanes; transactions have lanes (rules 21, 42) | Amends "Transactions have outcomes, never lanes" |
| C36 | Operations O7 | `cancel` acts on the addressable Attempt, by history before invocation; `cancel` on a one-off read releases its wait (rules 24, 42) | Replaces "this actor's queued and running commits for a key"; amends "resources have no cancel action" |
| C37 | Machines O1 | `operations: ({ E }) => ({ name: contract.outcomes({ … }) \| contract })`; one write operation per contract; the definition exports `O`; a commit's or lookup's select is typed at its transition (rules 13, 40) | Replaces "a flat record of operation or entity-domain handles" |
| C38 | Machines O4 | Guards receive `operations`; `idle(k?)` (a partial key allowed) and `retryable(k?, { times })` are guards (rule 21) | Replaces `calls` in O4's row |
| C39 | Machines O5 | Keyed schedules: key records; `keys` may read `operations` (after lanes); `restartOn` per key; `armOn` is a construction error on a keyed schedule (rule 23) | Amends C14 |
| C40 | Machines O6 | `activities` is a list of placements; `subscribe.each` places one session per key; `DuplicatePlacement` (rule 41) | Replaces C19 |
| C41 | Machines O8 | The snapshot exposes `operations`, replacing `calls` and `activities`; a Runtime step publishes the bound lane rows it changes (2.5) | Amends O8's row |
| C42 | Runtime O3, V4 | A write lane is (actor identity, contract id, key); a starting incarnation adopts only its own identity's unbound lanes, and receives a hold as `unknown { Restored }` and the ending of an Attempt still on the wire; a local identity is (machine id, input by `Equal.equals`), and equal local identities adopt the oldest unbound lane first (rule 44) | Replaces "no outcome, schedule, issue or send from an old incarnation reaches a new one" for write lanes; amends "`createActor` always creates a new local actor" |
| C43 | Runtime O6 | Disposal invokes nothing new; queued commits end `NotSent { Disposed }`, delivered after reload for a persisted identity; `runtime.unsettledWrites()` lists non-`Idle` lanes by identity (OD23 Q40) | Amends "invoked commits settle within the disposal bound" |
| C44 | Persistence O2 | Write lanes are Runtime records of the actor's identity; local actors' lanes never persist (OD20); pending mapped outcomes also include endings of a persisted identity's lanes admitted while no incarnation is bound, and its `NotSent { Disposed }` (OD21) | Replaces "pending writes follow their actor" |
| C45 | Persistence O3 | Plus every non-`Idle` lane of a persisted identity, bound or unbound; a disposed actor's non-`Idle` lanes stay as unbound lane records; a pending mapped outcome settled before the final capture, and never-sent work ended `NotSent { Disposed }`, are delivered after reload (OD20, OD21) | Replaces "a capture is the actor's saved record; explicitly disposed durable actors disappear from the next capture" |
| C46 | Persistence O4 | Then, per lane in creation order, a `Held` head's `unknown { Restored }` (once, unless its outcome was saved) and, on reload, `W`'s `NotSent { Restored }` (OD21) | Replaces "restore resumes in the saved leaf and delivers saved outcomes" |
| C47 | Persistence O5 | With that machine id's lane records, as evidence (R9 M2); otherwise lane records, with their parked endings, decode and restore independently of the actor record, and a fresh incarnation adopts them in its initial leaf; this is not a partial restore of the actor (R10 M3). P19 is narrowed to match (X14). | Replaces "saved records for an undeclared machine id are discarded" |
| C48 | Persistence O6 | Once per Attempt, per lane record, with no actor (OD20, F2); a persisted lane's re-send waits for its lane record's capture (R9 M3); a failed acknowledgement ends `NotSent { StorageRefused }`, not an interrupt (R9 M2). P15 is narrowed to match. | Replaces "an Attempt's acknowledgement before its adapter is invoked; a failed acknowledgement settles through interrupt with `StorageFailure` evidence" |
| C49 | ServerRendering O3, O5 | Write lanes are never hydrated; `DehydrateCommitInFlight` is evidence on the client, naming the actor and its state; "the actor's unknown outcome owns reconciliation" is removed; only resource entries hydrate (OD20; R9 M4) | Replaces "an in-flight commit transfers as unknown, and "the actor's unknown outcome owns reconciliation"; client or persisted actors beat hydrated copies" |
| C50 | LazyFeatures O3 | A lazy machine's lane records stay dormant, undecoded and uninvoked, until the feature is adopted (R9 M2) | Replaces "a lazy feature's machine loads on demand" |
| C51 | Inspection O1 | Unbound lanes by identity, with holds, queued commits and marks; lane states `Idle`, `InFlight`, `Held`; `ending` evidence names operation, contract, verb and key; evidence kinds `Superseded`, `Released`, `NothingToResend`, `InFlight` | Amends "lists actors and their lanes" and C30 |
| C52 | React O2, O3 | Fresh memory and state, with write lanes adopted by identity; the pre-attach send buffer flushes after a new incarnation's deliveries (rule 44); selectors read `operations` | Amends "one fresh local actor per component incarnation" and the pre-attach buffer |
| C53 | Testing O3, O7 | `Story.ending(O.x, …)` drives an ending through the operation (*Story reads: merge 3*: against Testing O3's "no ending is injected"); Testing O7's `closeTab` stays abrupt; a clean Runtime shutdown with queued work is a policy-suite test (OD23 Q41) | Adds |

### For tooling

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| T1 | Testing O5 | **Marked for removal: model-based exploration is cut.** Remove Testing O5 (`model`, `stateKey`, `getShortestPaths`, `getSimplePaths`) and the `invariants`, `hot` and `explore` options this row used to add; remove `model` from Package's `flow-state/testing` exports; remove the dispatch-desk demo (`editor.story.ts` `exploreEditor`, its test in `editor.test.tsx`, the README coverage row). Exploration predicts operations, schedules and turns without running them, a second execution path that must keep "replay parity" with the Runtime; Flow keeps one runtime. Finding unwritten sequences stays with `propertyTest` (Testing O6) on the real Runtime | Removes Testing O5 and the Package export; check V7's proofs that cite O5 |
| T2 | CommandLine O5 | Warnings: an exit no reachable transition takes; a `hostEvent` no host raises; a public fragment event unhandled everywhere; a subroutine whose exits are unreachable from its default. `flow stories --coverage` lists transitions, exits, callbacks and ending handlers (current and late) no Story reaches | Adds to the warning list |
| T3 | CommandLine O5 | Warn when `send(ref, E.X)` can reach a state of the target actor where X is Unhandled. There is no silencing keyword; warnings never fail the check | Sharpens "unhandled events" |
| T4 | CommandLine O5 | A lint rule with an autofix orders the category keys of definitions, fragments, machine bodies, fillings, transitions, commit options and operation options (section 2.6). It never reorders entries inside a record, whose order carries meaning | Adds |

## 6. Deliberately left out

**Not in v4's model:**

- **Fragment I/O** (`requests`, `CommitWithRetry`). Waiting, trying again and reconciling are the host's states and
  schedules, and what an ending means is the commit's classification, for every machine. The cost: a host handler
  can still start a new write from an `uncertain` event instead of `.retry`.
- **Nested request relays.** These follow from the above.
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
  `.retry` from a state the machine enters.
- **Operations in fragments** (OD17 Q19): fragments keep rule 3; their own exploration is
  [operations-in-fragments/exploration.md](operations-in-fragments/exploration.md).
- **An Rpc-based contract** (OD13): a `fromRpc` adapter, later, when a real app needs it.
- **Per-key fan-out of write members, throttled independent writes, per-item stops on a `serialize` queue** (2.7.13's
  limits): bulk contracts and keyed designs; deferred to [open-items.md](open-items.md).

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
- **Saved-state compatibility Stories** (`story.restore(fixture)`), the analogue of Temporal's
  replay test. They matter more now that `orphaned` makes version changes first-class (durable R8).
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
   cheaply enough, or does it live only in `flow check` metadata?
2. **`.resumable()` and `resetOn` together.** A resumable trait resets on return when its value differs. Is
   comparing against the frozen value the right baseline, or should leaving reset it?
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
9. **Writes that stream** (LLM generation, upload progress): deferred; to be designed from their browser sources.
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
17. **Story reads for entity domains** (merge 3): `Entity.get` with `predicted` (Testing still says `pending`),
    `Entity.queue` removals (C30), the frames between settlement and admission (2.5, rule 27), reaching `Overloaded`
    and record-queue order with fixtures (2.7.11), held unknown lanes in evidence (rule 21), and server truth against
    the store. Each is marked *Story reads: merge 3*; merge 3's G10–G14 answer them.
18. **Typing risks** (operations merge, 2.7.16): the `operations` callback needs `E` first; key-less members need the
    handler's event origin, with `flow check` as the fallback; the fallback for the callback is
    `definition({ … }).operations(fn)`.
19. **Story reads for operations** (merge 3): `Story.ending` (rule 47) against Testing O3's "no ending is injected";
    merge 3's 3.14 reads `snapshot.operations` and `O.x.get`, so its question 40 (export commit values at module scope)
    is moot, the definition exports `O`; Story drives for dispose, rebind and restore (2.7.13); the parked lane's flags
    (2.7.13). Each is marked *Story reads: merge 3*.

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

From [reviews/design-correctness.md](reviews/design-correctness.md) and [reviews/design-principles.md](reviews/design-principles.md):

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
- Schedules (P7): `armOn` may list `Flow.entry` to also start on entry; `disarmOn` stops a schedule; `armOn` with `restartOn` is a construction error. Event-typed triggers need no name inference ([spikes/schedule-triggers/RESULTS.md](spikes/schedule-triggers/RESULTS.md)). `schedules` keeps its name (D53).
- Schedule triggers are handlers (2.5 step 2): an event listed in an active schedule's `armOn` or `disarmOn` is handled
  there with no move when the node has no written handler, so `Countdown` loses its `Start: { target: "self" }` no-op.
  Rejected: restarting by reset alone (`Flow.entry` plus `resetOn`), because `Lockout`'s nested timer must start at
  the limit-th strike, not when `Lockout` is created; and arming from the transition (`arm:`), for the locality and
  naming costs in [spikes/schedule-triggers/RESULTS.md](spikes/schedule-triggers/RESULTS.md).
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
- **Revision (multiplicity audit, 2026-10-31)** ([audit-multiplicity.md](audit-multiplicity.md)): rules N1–N3; lanes
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

## Decisions

Settled by the owner, with the reason each wins and what was rejected. Merge 2's decisions keep their numbers D1–D17, merge 4's E1–E18 and the operations merge's OD1–OD26, which
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
  `yield*`, `catch:` and `mapError` (checked on Effect 4.0.5, [spikes/outcome-channels](spikes/outcome-channels/outcome.ts)).
- **`Outcome.success` stays**, for symmetry only; a plain `return` means the same.
- **No `flow check` warning on unwrapped typed errors.** `outcomes.failure` is exhaustive, so an unwrapped error meant
  as unknown appears there by name and must be handled as a failure, where the author sees it.
- **The cache follows the channel.** Unknown keeps the optimistic look, marked uncertain, and refetches the displayed
  entries once; failure removes it with no repair refetch; reads keep two channels, because a read changes nothing.
  Replaced: `revertOnUnknown`, and Operations O5's "unknown retains them and invalidates".
- **Amended by merge 2** (its 6.4): failure describes one send, and the Attempt's ending is rule 18 (`StillUnknown`);
  `Timeout` is dropped; `NotSent` gains `why`; `failure.NotSent` is optional in the type; `O.x.retry(attempt)` is
  replaced by the commit value's `.retry`, and after a definite failure by a new write; merge 1's automatic
  `retry: { on }` goes with every Flow retry (rule 25).

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

### Multiplicity audit ([audit-multiplicity.md](audit-multiplicity.md), 2026-10-31)

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
  inside one `serialize` lane is not expressible (F15, for the owner). Rejected: picking "the oldest unknown" or "the
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
  ([audit-multiplicity.md](audit-multiplicity.md) F1). Views and guards read lanes as `s.calls` rows (D18);
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
  tokens. The write row gains `waiting` (a commit queued behind a held unknown). (2026-10-30)
- **OD7** Review 4's K5: `cancel` acts on the same one Attempt as `retry`, the oldest unresolved sent one; after it is
  released, the waiting commit is sent. `cancel` never silently drops a waiting commit. (2026-10-30)
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
  renamed to `output`; mapper context `{ params }` becomes `{ input }`). (2026-10-30)
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
  deferred to their own exploration). (2026-10-30)
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
- **Resuming never-sent work across a reload** (TanStack Query's model): left for [open-items.md](open-items.md); it would amend C2 and
  Operations O3.
- **Branded keys** and **an age bound on adopted holds**: not proposed; the first would close a structural-typing gap,
  the second is public API.
