# Machine fragments: traits, subroutines and server calls (version 4)

**Status:** proposal, not accepted. This is the one design. Merge 1 ([merged/outcomes.md](merged/outcomes.md)) and
merge 2 ([merged/server-calls/proposal.md](merged/server-calls/proposal.md)) were merged into it on 2026-10-30; they
are kept as the record behind it, and where they differ from this file, this file wins. Merge 4
([merged/entities.md](merged/entities.md), entity domains) was merged on 2026-10-30, and merge 5
([merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md), statically analysable domains) on 2026-10-30; merge
5's rules A1–A12 belong to `references/design/entity-domain.md` section 9, and only its effects on 2.8 are here.
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

**Four decisions.** Decision 1 can be accepted alone; decision 2 builds on decision 1's turn (2.5); decision 3 is
independent; decision 4 builds on decision 2.

| Decision | What it covers | Plans it touches |
|---|---|---|
| **1. Fragments and the turn** | sections 2.1–2.6 and 3, rules 1–12, P5–P8, P11, P21 | Machines O1–O8, Runtime O4, Persistence O2, Testing O1, Inspection O1, CommandLine O5, React O2/O4, Package O1 |
| **2. Server calls** | section 2.7, rules 13–25 and N1–N3, C1–C20, P15, P19, P20 | Operations O1–O3/O5/O7, Machines O3/O5/O6, Persistence O4–O6, Testing O2/O3, EntityDomains O1, CommandLine O5 |
| **3. Exploration tooling** | T2–T3; T1 and Testing O5 marked for removal | CommandLine O5; Testing O5 (removed), Package (`model` export removed) |
| **4. Entity domains** | section 2.8, rules 26–38, C21–C30, decisions E1–E18 | Operations O1–O3/O5/O6, EntityDomains O1/O2/O5, Persistence O6, Inspection, CommandLine O5 |

## 1. The idea

Three layers, each owning one thing.

- **Operations own how a call is made and what its ending means:** the commit function, which classifies each ending
  with `Outcome` where it reads the response; the transaction's key and concurrency; the cache; restore.
- **Machines own states, turns, timers, history, and the calls they start:** when a write starts, is sent again or
  cancelled, and where its ending goes (2.7).
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
schedules and commit values (2.7).

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
  keyed activity: `s.activities.<name>[i]`, each `{ key, …lane }` (2.7.10); the machine's call lanes:
  `s.calls.<operation path>` (rule 21); records of an entity domain the definition lists in `operations`:
  `Entity.get(s, key, shape)`, `{ data, predicted, uncertain, unconfirmed }` (2.8.1). The record is the store's, read
  through the snapshot's cut, never memory (rule 26).

These names, state names and memory keys share one namespace, and a collision rejects. A slice is
`undefined` while its fragment is inactive, except a resumable slice, which stays present while frozen. Every list
above is a **keyed list** (rule N1): in key order, each entry with `key`, found by key with `find`; an entry that does
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
| `Flow.uncertain(fields)`                         | combinator      | marks an event that a commit value's `unknown:` may target (rule 13)                                            | none                                                                  |
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
| Running I/O and mapping endings            | host **machine**: commit values in `actions`, their `outcomes` onto the host's own events (2.7)                                                                                       |
| A handler or guard shared by several nodes | the definition's `handler(path, h)` / `guard(path?, g)`, e.g. `Signup.guard(g)`: typed as if written at `path` (the root when omitted)                                                |

Placement is structure (it produces `S`, `E` and the view types), so it lives in the definition.
Filling refers to `S`, `E` and `O`, so it lives in the machine.

**Sharing a guard.** A guard written inline takes its types from where it sits; moved into a
variable for reuse, it would lose them. `Definition.guard(g)` keeps them: the guard is typed as if
written at the root (or at `path`, with `Definition.guard(path, g)`), and can then sit in any guard
slot, including a fragment's guard port. A commit value's `idle(key)` is already a guard value, so it is shared as
it is:

```ts
export const SignInMachine = machine(SignIn, ({ S, O }) => {
  const notLockedOut = SignIn.guard(({ state }) => !S.TWO_FACTOR.LOCKED_OUT.is(state) || deny("LockedOut"));
  const verify = O.Auth.verifyCode.commit(select, { outcomes });                  // 3.1
  const notChecking = verify.idle(({ memory }) => ({ challengeId: memory.challengeId }));   // InFlight while a verify runs

  return {
    states: {
      TWO_FACTOR: {
        traits: { code: { guards: { canEdit: notLockedOut } } },                        // a port filling
        on: { Resend: { target: "self", guard: [notLockedOut, notChecking], actions: [resend] } },
        states: {
          ENTERING: { on: { Submit: { target: S.TWO_FACTOR.VERIFYING, guard: [notChecking, codeValid], actions: [verify] } } },
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
     - a commit value's select is checked at each transition whose `actions` list it;
     - a shared handler or guard is wrapped in the definition's `handler(path, h)` /
       `guard(path?, g)`;
     - any other helper sees the root view.
2. **Three sender lists.**
   - `events` come from anyone: views, other actors, the host.
   - `hostEvents` come only from the direct host, by `raise`.
   - `internalEvents` come only from the fragment's own schedules.

   The host maps call endings onto **its own** events and raises into fragments. Sending a
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
   - call endings, current and late (rules 14, 20);
   - exit fillings;
   - `whenAbandoned` fillings;
   - timer-fired handlers.

   Each must be handled, ending in an unguarded alternative, in every state where it can arrive.
   Everything those handlers raise or notify must be total by the child's summary. An Attempt orphaned by a
   version change goes to its descriptor's `orphaned` handler, outside any actor (P19).
9. **Many copies: `.each`.** Full design, reasons and nine worked examples:
   [merged/each.md](merged/each.md). `T.each({ of, max, by? })`
   places one copy of T per key in the memory field `of` names, of the placing definition or fragment, in
   that field's order.
   - **Membership is host data.** Keys are strings, bare or in records (`by` names the key field).
     The host adds and removes copies by writing the field in its own transitions, behind its own
     guards. There are no `Add` or `Remove` events. `max` is required.
   - **Fillings and views.** One filling serves every copy, and each part of it receives `key` and
     `item` (the entry). **Revision (multiplicity audit, 2026-10-31).** A commit started in a copy's filling is an
     ordinary call: its **Attempt** carries the copy's key and incarnation, and every ending of that Attempt (a retry
     from the host or another copy included) gives its mappers that `key`, never the retrier's. Call endings are
     governed by rules 8, 14, 17 and 20 and are never dropped; only a raise the ending's handler makes into a copy
     that is gone follows the drop below (rule N3, decision D21). Two copies whose lane key does not name the copy
     share one lane, which is `reject`'s server promise (D9); `flow check` warns from Story traces when Attempts
     started under two copies of one placement are on one lane at once (`SharedCopyLane`). `s.memory.<name>` and `s.schedules.<name>` are the copies in
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
     firings; call endings are never dropped (above; section 7 item 15, closed).
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

**Server calls** (2.7). A **write** is one start of a commit value, an **Attempt** with an id Flow mints; a **send**
is one invocation of its commit function. The rules are numbered as merge 2's rule *n* + 12
([merged/server-calls/proposal.md](merged/server-calls/proposal.md)).

13. **Endings map to events.** A commit value `O.x.commit(select, { outcomes })` maps each ending of its Attempts to one
    of the definition's events: `success:`, `failure:` (an exhaustive record over the commit's failure tags, plus an
    optional `NotSent`; or one event for an untagged failure type), and `unknown:`. A mapping value is an event
    (payload-free) or `E.X.from((value, { input, attempt, superseded }) => payload)`. Several endings may map to one
    event. `unknown:` may target only a `Flow.uncertain` event. A resource's call value maps `success:` and `failure:`
    only; its `failure:` carries the read's tags plus Flow's `Defect` and `Interrupted` (rule 37). An author error whose tag is one of Flow's reasons (`NotSent`, `Cancelled`, `Restored`, `Interrupted`,
    `Defect`, `StillUnknown`) is a type error.
14. **Owner, current, late, decided at admission.** A start or retry is owned by the activation of the state its
    transition names (`"self"`: the handler's own state). When the ending's turn is **admitted** (2.5 step 1), Flow
    maps the ending through the commit value's `outcomes` and tests the owner against the pre-turn snapshot. If that
    activation is alive, the event is **current** and routes from the active leaf. Otherwise it is **late** and the
    same event routes from the nearest strict ancestor of the owner whose activation is the one alive when the call
    started (the root at worst). Routing is never decided at settlement. Settlement decides only the Attempt's ending (rule 18) and, for a domain write,
    its store effects (rule 27).
15. **Late turns.** In a late event's turn, an alternative whose target would exit a state that owns another pending
    call, or an active subroutine, is denied (`LateMayNotLeave`); so a late handler ends in an alternative that does not
    move (`flow check`). A call started in a late turn is an ordinary call with its own owner: lateness is not
    transitive.
16. **Declines are endings; Flow adds no guard.** A decline refuses only the write, never the transition that asked for
    it: the transition's target, memory and other actions run as written. Under `concurrency: "reject"`, a start on a
    lane that is pending invokes nothing and ends `NotSent { why: "Rejected" }`. A start past its actor queue or a record
    queue's bound is declined the same way, `NotSent { why: "Overloaded" }` (rule 35). **Revision (multiplicity audit,
    2026-10-31).** In every mode, a retry whose addressable Attempt (rule 21) is still outstanding also ends
    `NotSent { why: "Rejected" }`, so one Attempt never has two sends at once; a retry on a lane with no addressable
    Attempt ends `NotSent { why: "NothingToResend" }`. A declined start has no Attempt and a `NothingToResend` has no write, so
    their `NotSent` mapper sees `attempt` (and, for `NothingToResend`, `input`) undefined (decision D17). The ending is
    mapped through the commit value's `outcomes` and owned by the transition that asked (rule 14). To refuse the
    transition itself, the author writes `pay.idle(key)` in its guard, so `check()` and a view's button agree.
    `flow check` warns when a transition that changes state lists a `reject` commit value without its `idle` guard.
17. **Every start ends once.** Every start and every retry, invoked or declined, delivers exactly one ending.
18. **The Attempt's ending.** Each send is classified as in 2.7.1. The Attempt's ending is decided at settlement, from
    the Attempt's send history; admission only maps it (2.5 step 1, rule 27). The ending delivered is the Attempt's: success if
    this send succeeded; a definite failure only if no earlier send of the same Attempt ended unknown; otherwise
    `unknown` with reason `StillUnknown { failure }`.
19. **The key is the Attempt's id.** Flow mints `attempt.id`, random, when a write starts; every send of that write
    carries the same id. The commit author puts it on the wire where the API expects it; Flow sends nothing itself and
    derives no other key. Re-sending after an unknown is `pay.retry` (the same id, so the server dedups). After a
    definite failure nothing happened, so trying again is a new write (`pay`, a new id): a server that stores failures
    under a key cannot replay one. `pay.retry` after a definite failure stays allowed and sends the same id.
20. **Required handling** (`flow check`). Every current event that can occur is handled totally from every leaf under
    its owner (fall-through to ancestors included). `failure.NotSent` must be mapped only when it can occur: its
    concurrency is `reject`, `latest` or `serialize`, the machine cancels or retries that commit value, the actor is
    persisted, or the operation is a domain write (a record queue can overflow under any concurrency, rule 35). A
    resource call value's tag record must map `Defect` and `Interrupted` (rule 37). **Every late event that can occur, from any channel, is handled** at a strict ancestor of the owner;
    `{ target: "self" }` is the explicit ignore. A missing late handler is a `flow check` error naming the event and
    the state whose leaving makes it late. Flow cannot know which late failures matter (sign-in's late `WrongCode` is a
    strike), so a person decides for each one.
21. **The lane, read as `s.calls`.** **Revision (multiplicity audit, 2026-10-31; decisions D18–D20).** Per actor,
    transaction and key (Operations O3), across every commit value of that transaction, Flow keeps a lane: the Attempts of that key that are outstanding, and, where one is addressable, that one. A domain write that predicts one
    record and declares no `key` has that record's key (rule 34). A lane holds no store state: predictions, record
    queues and `uncertain` are the store's (rule 26).
    - **The addressable Attempt** (rule N2). Under `reject` it is the lane's only Attempt; under `latest` and `cancel`
      it is the newest start (an older one is superseded). It is replaced by a start, kept after a failure or
      unknown, and cleared after a success. Under `allow` and `serialize` a lane has none: several Attempts can be
      outstanding and none is "the" one.
    - **What the machine reads** is plain snapshot data, beside `s.activities`: `s.calls.<operation path>` (the
      definition's `operations` record, `s.calls.Stripe.confirm`). A keyed transaction's entry is a keyed list (rule
      N1) of the lanes that exist, in the order they were created; an unkeyed one's is one row or `undefined`. Under
      `reject`, `latest` and `cancel` a row is `{ key, pending, retryCount }` (plus `progress` for a transaction that
      declares it, merge 6): `pending` is true from the starting turn until the ending's turn of every outstanding
      Attempt is admitted (a waiting `latest` start included); `retryCount` counts the addressable Attempt's re-sends,
      0 on its first send. Under `allow` and `serialize` a row is `{ key, outstanding }`, the number of outstanding
      Attempts. Guards receive `calls` with the rest of the turn's view; `check()` on an old snapshot reads that
      snapshot's rows. A row carries no Attempt, input or last ending: those reach the machine through the mapper.
    - **The commit value's members** are the actions `retry` and `cancel` and the guard `idle(key)`, the guard form of
      "no outstanding Attempt" with the code `InFlight` (rule 16). `retry` exists only where a lane has an
      addressable Attempt (a type error under `allow` and `serialize`); `cancel` cancels every outstanding Attempt
      of the lane (rule 24).
    - **Existence** (rule N3). A lane with nothing outstanding and nothing addressable is evicted, and has no row; a
      lane never started has none either, so the two cannot be told apart, and neither can be mistaken for a lane
      that exists. A lane whose addressable Attempt failed or ended unknown is kept, because `retry` needs it, and a lane held by an
      unknown is listed in the actor's evidence, so a lane nobody reconciles is visible (merge 4, "Lane lifetime"; *Story reads: merge 3*: the `checkpoint.evidence` shape); under
      `allow` and `serialize` nothing is retained, so the lane is evicted when nothing is outstanding.
    - **Each Attempt remembers what started it**: its commit value (whose `outcomes` a `retry` uses, called on any
      commit value of the transaction), its lane key, and, from a `.each` copy, the copy's key and incarnation (rule
      9). The ending's own turn sees the lane with that ending applied, so it may retry. Lanes persist with the actor; Persistence O6 acknowledges each Attempt before invocation, in one capture with the
      records that Attempt predicts (rule 38).
22. **Memory reads: before for decisions, after for effects** (decision D15). A memory read in a turn sees one of two
    values. A read whose result can change this turn's memory (a guard, an `updateMemory`, a payload mapper that
    raises, notifies or fills an exit, and the key select of an `idle` guard) sees **before**, the last published snapshot. A read whose result only starts
    or times work (a commit's input select, a retry's or cancel's key select, a schedule function, `keys`,
    `restartOn`, activity `params` and `when`) sees **after**, the memory this turn
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
    - **Lane reads** (`calls` and the `idle` guard) are not memory. They see the pre-turn lanes with the turn's own
      ending already admitted (rule 21).
23. **Schedules.** A function schedule reads the after memory of the arming turn (rule 22). `armOn` counts an event
    accepted anywhere on the active path. A keyed schedule (`keys`) keeps one timer per key of the after list: armed
    when the key first appears, cancelled when it leaves, firing once with `key` in its metadata. **Revision
    (multiplicity audit, 2026-10-31).** A key the `keys` result repeats keeps its first position, with `listRepair`
    evidence, as `.each` repairs (rule 9); per-key timers persist by key with their `dueAt`, and on restore the keys of
    the restored memory win. An activity may declare `keys` the same way (2.7.10): one subscription per key.
24. **Cancel.** Before invocation: the ending is `NotSent { why: "Cancelled" }`. After invocation, before settlement:
    the commit's fiber is interrupted; the ending (`unknown`, `Cancelled`) is queued when the fiber has exited, and the
    lane stays pending until its turn. After settlement, or with nothing outstanding: no effect, with evidence. **A
    settled ending is never rewritten.** **Revision (multiplicity audit, 2026-10-31).** `x.cancel(key)` applies this
    to **every** outstanding Attempt of the lane (a running one and the queued ones, as Operations O7 says), and each
    ends once. On a domain write, rule 30 gives each ending's store effects (rule 29).
25. **No Flow timeout and no Flow retry.** Waiting and trying again are states and schedules of the machine (2.7.6).
    **Classification runs outside the fiber it interrupts.**

**Multiplicity** (rules N1–N3). **Revision (multiplicity audit, 2026-10-31).** Every rule above that names "the" lane,
"the" Attempt, "the" copy or "the" session obeys these three; [audit-multiplicity.md](audit-multiplicity.md) has the
matrix behind them and a failing sequence for each case they close.

- **N1. One reference, one thing; many is a keyed list.** A declaration that can have several instances at once
  publishes them as a list in key order, each entry with `key`: `.each` copies, keyed schedules, keyed activities,
  call lanes. A read names its entry by key. A reference that can match several says in its name or type how it
  aggregates: `idle` and a row's `pending` mean any outstanding Attempt, `cancel` means every one, `outstanding`
  counts them.
- **N2. A per-call reference names one Attempt.** `retry`, and a lane row's `retryCount` and `progress`, address the
  lane's addressable Attempt, so they exist only where the transaction's `concurrency` guarantees at most one:
  `reject`, `latest` and `cancel`. Under `allow` and `serialize` they are type errors; a call that needs its own
  status, retry or progress gets its own key (a draft id, an upload ref, a client message id) and `reject`, so one
  lane is one call. Every ending reads its origin (starting commit value, lane key, copy key and incarnation) from its
  Attempt, never from the transition that retried it, and every mapper receives `laneKey`.
- **N3. Existence is explicit.** A read of something that may not exist returns `undefined` (a lane never started or
  evicted, a copy, a record), never a default that looks like an existing thing. Each delivery to something gone has
  one rule: call endings are never dropped and route by owner (rules 8, 14, 17, 20); raises and timers to a dead copy
  are dropped with evidence (rule 9); a released stream session's deliveries are discarded with evidence (merge 6).
  Whatever the store keeps for an Attempt (a prediction, an uncertain mark) holds its record (rules 30, 32).


**Entity domains** (2.8). Rules 26–38 are merge 4's ([merged/entities.md](merged/entities.md)); each names its
decision (E1–E18). Rules 13–25 and N1–N3 still apply.

26. **One split** (E1). For an operation registered in a domain, the domain owns shared data: the prediction, its
    confirmation and rollback, repair, the record queue, `uncertain` and `unconfirmed`. The commit value owns
    workflow: which event each ending becomes, its route, retry and cancel. Call-site `optimistic` and `setData` are
    type errors on it (EDP:60-61). Memory holds workflow and never a copy of a record field; views read records and
    answers.
27. **Settlement for the store, admission for the lane** (E4, E13). At settlement Flow classifies the send, applies
    rule 18, applies the Attempt's ending to the store (rule 30) and releases record queues, in one publication, then
    queues the ending. At admission it maps the ending, tests its owner and updates the lane (rules 14, 21). Store
    effects never depend on whether the ending routes current, late or superseded.
28. **A start publishes with its turn.** A domain write that starts joins every record queue it predicts and applies
    its prediction in the starting turn's publication (2.5 steps 5–6). A start declined as `Rejected` or `Overloaded`
    applies nothing.
29. **The actor first, then the record queue** (E5). Actor concurrency (`reject`, `latest`, `allow`, `serialize`)
    decides whether a start is admitted; the record queue decides when it is sent. A `latest` waiting start joins
    the record queue; superseding it removes a never-invoked queued write: `NotSent { why: "Superseded" }`,
    prediction removed, no repair. `concurrency: "cancel"` on a predicting write is a `flow check` error;
    `.cancel(key)` follows rule 24, with rule 30's store effects.
30. **The store follows the Attempt's ending** (E8). Success confirms; a definite failure removes predictions without
    repair; `NotSent` removes or never applies them, without repair (2.8.5); unknown, including `StillUnknown`, keeps live
    predictions until a forced repair lands, holds the record queue until that repair settles, and marks the record
    uncertain for that Attempt. **Revision (multiplicity audit, 2026-10-31) (E18).** A prediction over a record the store does not hold (never held,
    or deleted beneath it by an earlier write or a push) shows nothing, and the record reads absent; it stays with its
    Attempt for the record queue and settlement, and its field functions run only once a base exists.
31. **A retry is the same request** (E2, E7). `pay.retry(key)` is the only re-send of a domain write. **Revision (multiplicity audit, 2026-10-31)
    (E17).** It exists only where the lane has one addressable Attempt (`reject`, `latest`; `concurrency: "cancel"` is an error on a
    predicting write, rule 29; rule N2); a domain write that must be retried under several concurrent calls takes a per-call key and `reject`. It sends the
    Attempt's input and `basedOn` unchanged, applies no prediction and joins the record queue. Its response is
    positioned at the Attempt's first send; a differing field it loses on is contested (EDP:66-69).
32. **What clears `uncertain`** (E3). A mark is per record and Attempt. A success of a retry of that Attempt clears it;
    a success of a later write to the record clears every mark on that record. A read, a forced repair, a failure and
    `StillUnknown` clear nothing. **Revision (multiplicity audit, 2026-10-31) (E18).** A mark holds its record, as a prediction does, so the record is
    not collected while it may still be changed by a lost request.
33. **No temporary ids** (E9). A domain list holds only records the server returned. A pending create is a memory draft
    the view shows apart from the answer; membership appears when an answer's refetch holds its key.
34. **The lane key of a domain write** (E10, as corrected; 2.8.8). A write that predicts exactly one record and
    declares no `key` has that record's key as its lane key. `flow check` warns when a declared key is not that
    projection. Other writes keep their declared key or `{}`. A write whose key the Model records as `many` (an array,
    from the input Schema) never takes the default; its lane key is declared or `{}`; with `allow` or `serialize`,
    `retry` is a type error (rule N2), so a bulk write that must be retried declares a per-call key and `reject`
    (merge 5, M5-D9).
35. **Overflow is an ending** (E11). A start that would exceed its actor queue or any record queue, or a `many`
    key array past 4,096 items (merge 5, M5-D10), ends `NotSent { why: "Overloaded" }`, with no prediction and no queue join; the transition and its other actions run.
36. **Callback reads** (E12, amends rule 22). `optimistic` reads the starting turn's after memory, captured at start.
    `writes` receives `{ value, input }` and reads no memory. Domain operations have no `optimistic`; their `writes`
    may only invalidate (2.8.9).
37. **Reads carry confirmed data** (E15). A resource call value's `success:` sees confirmed data only. A read's defect
    or interruption ends on `failure` as `Defect` or `Interrupted`; a tag record must map them (rule 20; 2.8.10).
38. **Lanes and predicted keys persist together** (E14). A persisted actor's lane, its Attempt and that Attempt's
    predicted keys are written in one capture, the Persistence O6 acknowledgement before invocation.

### 2.5 The turn

One algorithm, shared by the runtime and `check()`. `check(snapshot, event)` runs steps 2–6 on the
given event and publishes nothing.

**What reads what.**

| Memory view | What it is | Read by |
|---|---|---|
| **Before** (the pre-turn snapshot) | the last published snapshot | every guard; every payload mapper (`raise`, `notify`, `exits`, `whenAbandoned` `.from`); the source's `updateMemory`; parts' `updateMemory` |
| **Before-walk** | the pre-turn memory with the source's patch applied, plus earlier resets | `resetOn`; `input` fillers |
| **Initial memory** | a new incarnation's starting memory (input fields, then constant and computed `Flow.initial`s) | guards, mappers and updates of parts addressed to an incarnation created in this turn |
| **After** | the memory the turn publishes: initial memory of new incarnations, then every patch in expansion order, after list repair; computed in step 5 | commit input selects; retry and cancel key selects; schedule functions; `keys`; `restartOn`; activity `params` and `when`; `.each` membership; the `resetOn` re-check; `optimistic` (captured at start, rule 36) |

**Lane reads** (`calls` and the `pay.idle` guard) are not memory: they see the pre-turn lanes with the turn's own
ending already admitted (rule 21). A guard `pay.idle(key)` in an ending's own turn therefore sees the lane free, unless
another Attempt of the lane is still outstanding (rule N1: `idle` means none outstanding).

1. **Admit** (runtime only).
   - A pending reset from the last commit runs first, as its own follow-up turn (rule 1).
   - Otherwise, take the oldest event from the mailbox. The mailbox is FIFO in admission order: user sends,
     call endings, timer firings and `onContext` events queue together.
   - **A call's ending is mapped here.** The Attempt's ending was decided at settlement (rules 18, 27), and for a
     domain write its store effects are already published; here the lane is updated (rule 21), the
     ending is mapped through its commit value's `outcomes` (rule 13), and its owner is tested against the pre-turn
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
     `Denied` (if any handler existed) or `Unhandled`, and then nothing changes.
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
     schedule functions, `keys`, `restartOn`, activity `params` and `when`, and `optimistic`, captured for each start
     (rules 22, 36).
   - **A valid action batch** (Machines O3).
   - **Starts** (rules 16, 21, 28; every write). For each commit value listed, in action order: decline it
     (`Rejected`, `Overloaded`, rule 16) or admit it, minting its Attempt with its owner (rule 14), starter, lane key
     and copy (rule 21). An admitted domain write joins every record queue it predicts and computes its prediction
     (rule 28). `check()` computes only the verdicts: it mints nothing, joins no queue and predicts nothing.

   A violation, a failing select or an invalid duration is a pre-commit defect. `check()` reports it as `Denied` with
   code `InvalidTurn`. A declined token element appears in `Denied.reasons` as
   `{ code: "NotInState", context: { state } }`.
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
     are queued as endings (rule 16). Then the admitted Attempts are invoked (2.7.12).

**Before for decisions, after for effects** (rule 22). A read whose result can change this turn's memory sees
before; a read that only starts or times work sees after. So a payload mapper that reads a key its own turn writes
sees the old value (`memory.challengeId` on the transition that sets it), while a commit's select on the same
transition sees the new one. `flow check` warns when a Story trace shows a mapper reading a key its own turn writes,
and when one transition reads, in both views, a key it writes (decision D16), and names both sides. Read the event
instead, or keep the old value under its own key.

**Settlement publishes without a turn.** For a domain write, settlement applies the Attempt's ending to the store and
releases record queues in one publication (rule 27); every actor's snapshot reflects that store revision, while lanes
change only when the ending's turn is admitted. Between the two, a record can read confirmed while the lane row still
reads `pending` (2.8.1). How a Story reads this frame and asserts the gap is merge 3's (*Story reads: merge 3*).

### 2.6 Conventions

**Key order.** Category keys appear in one order, from what the outside sees to the internals:

| Object                        | Order                                                                                                                                              |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| definition, trait, subroutine | `id`, `states` / `default`, `events`, `hostEvents`, `internalEvents`, `guards`, `callbacks`, `exits`, `memory`, `traits`, `operations` / `context` |
| machine or fragment body      | `default`, `schedules`, `traits`, `on`, `states`, `whenAbandoned`                                                                                        |
| a host's filling              | `input`, `guards`, `callbacks`, `exits`                                                                                                            |
| a transition                  | `target`, `guard`, `updateMemory`, `actions`, `raise`, `notify`                                                                                    |
| commit options                | `outcomes`, `optimistic`, `writes`                                                                                                                 |

A lint rule enforces it with an autofix (T4). It moves category keys only: the entries of `traits`,
alternatives and schedules keep their order, because declaration order carries meaning (rule 1,
Machines O5).

**What lives in `Flow`.** `Flow` is the Schema-like vocabulary for shapes and declarations: ports
(`Flow.Guard`, `Flow.Callback`, `Flow.Exit`), memory modifiers (`Flow.input`, `Flow.initial`,
`Flow.private`), `Flow.uncertain`, `Flow.annotate`, `Flow.state` and the schedule marker `Flow.entry`. How one trait instance behaves
is an attribute of that trait, so it is a method on it: `.resumable()`, `.each(…)`. In the same way, what a commit
value does is a member of it: `.retry`, `.cancel`, `.idle`. What a lane is, is a fact about the actor, so it is
snapshot data, `s.calls` (rule 21; Revision (multiplicity audit, 2026-10-31)). `trait(…)` and
`subroutine(…)` stay plain constructors beside `definition` and `machine`; their inference comes
from branding their results and `const` type parameters, not from a namespace. `Outcome` is the commit function's
vocabulary, outside the machine (2.7.1).

**Properties live on what they describe.** A fact about a thing is written on that thing, never in
a separate list that refers to it by name. Named lists (`events`, `hostEvents`, `internalEvents`)
hold categories a reader scans for; modifiers (`Flow.private`, `.resumable()`) hold properties of one
item. Readability decides between the two.

### 2.7 Server calls

A machine starts a server write by listing a commit value in a transition's `actions`, and reacts to everything that
happens to it through events it declares. Operations own how the call is made and what its ending means (2.7.1); the
machine owns when it starts, is sent again or cancelled, and where its ending goes (2.7.3–2.7.7). Rules 13–25 (2.4)
are normative; this section shows them. "Flow" means Flow's own runtime: **nothing in Flow reads an HTTP status or an
author error type.**

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
| `NotSent { why }` | failure | the commit was never called. `why`: `Cancelled` (before invocation, rule 24), `Restored` (the page reloaded before the Attempt was saved), `Superseded` (a newer `latest` start replaced it), `Rejected` (a busy `reject` lane, rule 16), `NothingToResend` (a retry with no addressable Attempt, rule 21), `Overloaded` (a start past its actor queue or a record queue's bound, or a `many` key array past 4,096 items, rule 35) |
| `Cancelled` | unknown | `pay.cancel(key)` after the call started (rule 24) |
| `Restored` | unknown | the page reloaded mid-call (persisted actors only) |
| `Interrupted` | unknown | the commit's fiber was interrupted by something other than Flow |
| `Defect` | unknown | the commit threw or died; also published as an actor issue |
| `StillUnknown { failure }` | unknown | a definite failure after an earlier unknown send of the same Attempt (rule 18) |

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
  its call value on `failure` as Flow's `Defect` or `Interrupted`, which a tag record must map (rule 37); a defect is
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
| Attempt `id`, `retryCount` | Flow mints the id, random, when a write starts, and counts each re-send of that write | the mapper's `attempt` (absent on a declined start and on `NothingToResend`); the addressable Attempt's count also as the lane row's `retryCount` in `s.calls` (rule 21; Revision (multiplicity audit, 2026-10-31)) |
| The idempotency key on the wire | the commit author puts `attempt.id` wherever the API expects it | the server; Flow sends nothing itself (rule 19) |
| `attempt.mayHaveApplied` | Flow: an earlier send of this Attempt ended unknown | the commit's context, to read a response with the write's history |
| `input` | the commit's select, over the after memory and event (rule 22) | the mapper's `input`; absent on a `NothingToResend` ending |
| `key` | the transaction's optional `key(input)` (Operations O1; omitted means one lane, `{}`, except a domain write that predicts one record, whose lane key is that record's key, rule 34) | the lane's key; `attempt.key`; **Revision (multiplicity audit, 2026-10-31):** every mapper's `laneKey`, present even when `attempt` is not (rule N2) |
| The copy's key | the `.each` copy whose filling started the Attempt, carried by the Attempt (rule 9) | the mapper's `key`, on every ending of that Attempt, retries included; absent for an Attempt not started in a copy |
| `superseded` | Flow: a newer Attempt was started on the same key after this one | the mapper's `superseded` |
| A prediction | the domain's predicted fields' functions `(beneath, input) => value`, with the real input; `.predicts` itself runs once, at construction, for structure | the store, joined in the starting turn's publication (rule 28); views read `predicted` on the record |
| The record queue | the store, per record, across actors | Flow joins it at start or retry and releases it at settlement, or after a forced repair (rules 29, 30) |
| `uncertain` | the store, per record and Attempt | set at settlement of an unknown, cleared by rule 32; views read it on the record |
| `unconfirmed` | the store, from a success that omitted a predicted field | views |
| Cancel | the machine's `pay.cancel(key)` action | `Fiber.interrupt` on the commit, which aborts the `AbortSignal` it handed the adapter; the browser drops the request **only if the adapter passed it to `fetch`/XHR** |
| "the request reached the server", "the server finished after a cancel" | nothing: no browser API reports either | so a send interrupted after invocation is `unknown`, and clean-up is keyed by the Attempt (2.7.7) |
| Time | the Runtime Clock; `TestClock` in Stories | schedules (`now`, firing metadata, a keyed schedule's `key`) |
| Server truth in Stories | the fixture (a stateful fake server behind the service) | the Story reads the fixture; no ending is injected (Testing O3) |

#### 2.7.3 The commit and the commit value

```ts
// checkout.operations.ts (outside the machine)
export const confirm = transaction({
  id: "Stripe.confirm",
  input: Schema.Struct({ intentId: Schema.String, paymentMethodId: Schema.String }),
  key: (i) => ({ intentId: i.intentId }),                       // a record (Operations O1); one lane per intent
  concurrency: "reject",
  commit: (input, { attempt }) => Effect.gen(function* () {
    const api = yield* StripeApi                                // production wraps fetch; Stories use a fixture
    const res = yield* api.confirm(input, { idempotencyKey: attempt.id }).pipe(   // the author puts Flow's id on the wire (rule 19)
      Effect.retry({ while: (e) => e._tag === "NoResponse", times: 1 }),          // invisible: inside one send
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
    if (res.ok) return yield* Outcome.success(res.intent)
    if (res.status === 402) return yield* Outcome.failure(new CardDeclined({ declineCode: res.declineCode ?? "generic_decline" }))
    if (res.status === 429) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))   // information only
    if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
    return yield* Outcome.failure(new Rejected({ code: res.code }))
  }),
})

// A response read with the write's history, by the author who knows the API:
if (res.status === 404 && attempt.mayHaveApplied) return yield* Outcome.success({ alreadyGone: true })
```

```ts
// checkout.definition.ts
internalEvents: {
  Intent: { status: IntentStatus, chargeId: Schema.optional(Schema.String) },   // 2.7.4 reads `status`
  Declined: { code: Schema.String },
  Busy: { retryAfterMs: Schema.optional(Schema.Number) },   // no `attempt` field: Flow keeps the Attempt
  TryLater: {},
  Unsure: Flow.uncertain({}),                               // the only kind of event `unknown:` may target
  RetryNow: {}, CheckTick: {}, TookTooLong: {},
},

// checkout.machine.ts
const pay = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: memory.paymentMethodId }), {   // memory only: Pay and RetryNow both start it
  outcomes: {
    success: E.Intent.from((v) => ({ status: v.status, chargeId: v.chargeId })),   // the read in 2.7.9 maps to the same event
    failure: {                                                // exhaustive over the commit's failure tags
      CardDeclined: E.Declined.from((r) => ({ code: r.declineCode })),
      Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })),
      TooManyAttempts: E.TryLater, Rejected: E.TryLater,      // several endings may map to one event
      NotSent: E.TryLater,                                    // optional in the type; flow check requires it here (rule 20)
    },
    unknown: E.Unsure,                                        // StillUnknown arrives here too (rule 18)
  },
})
```

- Mappers receive `(value, { input, attempt, superseded, laneKey, key? })`. A `failure.NotSent` mapper receives
  `input?` and `attempt?` (decision D17): a declined start has an input but no Attempt, and `NothingToResend` has
  neither. Every other mapper's context is complete. **Revision (multiplicity audit, 2026-10-31).** `laneKey` is the
  lane's key record, always present, because the start's or retry's key select always ran, so even a
  `NothingToResend` names its row (section 7 item 6, closed); `key` is the `.each` copy's key, read from the Attempt
  (rule 9), present only for an Attempt started in a copy (decision D21).
- `failure` is exhaustive over the commit's tags: a missing tag, or one the commit cannot produce, is a type error.
  `NotSent` is optional in the type and required by `flow check` only where it can occur.
- `unknown:` may target only a `Flow.uncertain` event: a type error otherwise.
- There is one mapping: the same mapped event serves the user who stayed and the one who left (2.7.4, rule 14).

**The commit value is the handle.**

```ts
const key = ({ memory }) => ({ intentId: memory.intentId })   // the lane (Stripe.confirm is keyed by intent)

CARD:    { on: { Pay: { target: S.PAYING, guard: [pay.idle(key)], updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId, busyTries: 0 }), actions: [pay] } } },   // a new Attempt
UNSURE:  { on: { CheckAgain: [{ target: S.PAYING, actions: [pay.retry(key)] }, { target: "self" }] } },   // the same Attempt, the same outcomes
PAYING:  { on: { TookTooLong: { target: "self", actions: [pay.cancel(key)] } } },
```

`O.x.commit(select, { outcomes })` returns an inert object, not a function. It holds the select (how to build the
input) and the `outcomes` (which events the endings become). Nothing runs when it is built or listed; Flow runs it
when a turn that lists it in `actions` commits (Machines O3). Its members return more values of the same kinds:

| Member | Kind | Meaning |
| --- | --- | --- |
| `pay` (in `actions`) | action | start a new write: run the select on the turn's after memory and event, mint an Attempt, invoke the commit |
| `pay.retry(key?)` | action | send the lane's **addressable** Attempt again, with the same id, through the `outcomes` of the commit value that started it; owned by the transition that retries (rule 14). Only under `reject`, `latest` and `cancel` (rule N2). On a domain write it is the identical request, joins the record queue and applies no prediction (rule 31) |
| `pay.cancel(key?)` | action | cancel **every** outstanding Attempt of the lane, each ending once (rule 24) |
| `pay.idle(key?)` | guard | no Attempt of the lane is outstanding, or `deny("InFlight", { operation, key })`: one standard code |
| `s.calls.<operation path>` | snapshot data | the lanes that exist: rows `{ key, pending, retryCount }` under `reject`, `latest` and `cancel`, `{ key, outstanding }` under `allow` and `serialize` (rule 21); guards read `calls` too |

**Revision (multiplicity audit, 2026-10-31).** The commit value no longer has `pending` and `retryCount` reads: lane
state is snapshot data, so a view, a guard, `check()` and a Story read the same published rows, and a read of an actor
that does not declare the operation is a type error (decision D18). A lane that does not exist has no row (D19).

**Keys are optional.** The key is the transaction's key record. Actions and the guard (`retry`, `cancel`, `idle`)
take it as a selector over the turn, like `key` above; a read finds the row by its key
(`s.calls.Issues.setLike.find((l) => l.key.id === id)`). A transaction without `key` has one lane per actor
(Operations O1: omitted means `{}`; a one-record domain write takes its record's key instead, rule 34), its members take no key (`pay.idle()`, `pay.retry()`), and its `s.calls` entry is
one row or `undefined`. A key is needed when one actor runs several independent lanes of one transaction (list rows,
documents, challenges), and, under rule N2, whenever one call needs its own status, retry or progress: then the key
names the call (a draft id, an upload ref, a client message id) and the transaction is `reject`.

**Lanes belong to the transaction and key, not to `pay`.** Two commit values of the same transaction in one machine
share a lane: the same row, the same addressable Attempt. `reject` promises the server one write in flight per key,
and separate lanes per commit value would let `pay` and `payWithSaved` both charge one intent. Each Attempt remembers
which commit value started it (Revision (multiplicity audit, 2026-10-31): per Attempt, not per lane, decision D20),
and `retry`, called on any commit value of the transaction, sends the addressable Attempt through its starter's
`outcomes`:

```ts
const pay          = O.Payments.charge.commit(fromForm,  { outcomes: formOutcomes })
const payWithSaved = O.Payments.charge.commit(fromSaved, { outcomes: savedOutcomes })
// payWithSaved started the lane's write → pay.retry() re-sends it through savedOutcomes
```

**Refusing a second press is explicit.** Under `concurrency: "reject"`, a start on a busy lane refuses only the
write: the transition still runs, and the decline arrives as `NotSent { why: "Rejected" }` (rule 16). To refuse the
whole transition, and disable the button through `check()`, write `pay.idle(key)` in its guard. Other modes decide
what many presses do (2.7.8).

**Starting is static.** A write starts only by listing a commit value in `actions` (Machines O1: actions are
static). A conditional start is written as alternatives:

```ts
Pay: [
  { guard: ({ memory }) => memory.useSaved || deny("NoSavedCard"), target: S.PAYING, actions: [payWithSaved] },
  { target: S.PAYING, actions: [pay] },
]
```

A commit value is a value, so it may sit in a shared transition object, in an action list beside other actions, in
a host's filling of a fragment callback, or behind a schedule's event; it cannot be started from a guard, mapper or
`updateMemory`. One write made of several requests that must succeed or fail together is composed inside the
commit, as Effect code calling services (one Attempt, one ending). Writes that depend on each other are separate
commit values chained through states.

**The select is typed where it is used.** The select runs with the memory and event of whichever transition lists
`pay`, so it is type-checked at each such transition (rule 1, Typing). A select that reads `event.paymentMethodId`
can be listed only on transitions whose event has that field; give each trigger its own commit value, or read memory
only. The select reads the after memory (rule 22), so writing `etag` and sending it in one transition works.

#### 2.7.4 Handling endings: current or late, the same event

An excerpt: it shows routing, so PAYING's handlers for `Declined` and `TryLater` and the root's `ReadFailed`
handler are left out; a complete machine needs them (rule 20).

```ts
const paid = { target: S.DONE, guard: ({ event }) => event.status === "succeeded" || deny("NotSucceeded") }
return {
  on: {
    // Late (rule 14): PAYING was left before the ending's turn. The same event, routed from the root.
    Intent: [{ ...paid, guard: [S.LEFT, paid.guard] }, { target: "self" }],
    Unsure: { target: "self", actions: [read.fetch(key)] },     // never drop a charge that may have landed
    Declined: { target: "self" }, Busy: { target: "self" }, TryLater: { target: "self" },   // late failures: explicit ignores (rule 20)
  },
  states: {
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
([merged/server-calls/rewrites/m1.save.ts](merged/server-calls/rewrites/m1.save.ts)).

#### 2.7.5 Reading a lane: `s.calls`

**Revision (multiplicity audit, 2026-10-31; decision D18).**

```ts
const lane = (calls, intentId) => calls.Stripe.confirm.find((l) => l.key.intentId === intentId)   // undefined: no lane
guard: ({ calls, memory }) => (lane(calls, memory.intentId)?.retryCount ?? 0) < MAX_CHECKS || deny("ChecksLeft")   // a budget for re-sending one write
useView(actor, (s) => s.calls.Docs.save.find((l) => l.key.docId === docId)?.pending ?? false)     // "Saving…" and the leave warning
useView(chat, (s) => s.calls.Chat.send.length)                                                     // allow, keyed per message: how many are sending
```

The machine reads two things from a lane, and nothing else: whether it is busy, and how many times its addressable
write has been sent again. Both are rows of plain snapshot data, typed from the transaction's key and concurrency
(rule 21): under `allow` and `serialize` a row has only `outstanding`, because no one Attempt is the lane's (rule N2).
A lane that does not exist has no row, so `?? false` and `?? 0` are written where the author means "no lane is idle"
(rule N3). Everything else has a better home:

- **The write itself** (`attempt`: id, input, `retryCount`) reaches the machine only through the mapper, for the rare
  case that needs it (a clean-up keyed by the write, 2.7.7).
- **The last ending** is handled by its own event, whose handler writes memory when the view needs to remember it:

```ts
LikeUnsure: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: [...memory.likeUnsure, event.id] }) }   // workflow: the keys to reconcile (2.8.2); the record itself reads uncertain
```

#### 2.7.6 Waiting, trying again and reconciling

Flow has no timeout and no retry (rule 25). Each is a state and a schedule.

| Need | Form |
| --- | --- |
| "Still working" after a delay | a schedule on the owner state that sets memory |
| Stop waiting, keep listening (soft) | a schedule whose handler leaves the owner state; the real ending is then late (rule 14) |
| Abort a hung request (hard) | a schedule whose handler runs `pay.cancel(key)`; the ending is `unknown(Cancelled)`, or the real one if it already settled (rule 24) |
| A transport deadline the UI never sees | inside the commit: `Effect.timeoutOrElse({ duration, orElse: () => Outcome.unknown(new NoResponse()) })` |
| A deadline racing a write (seat hold) | a schedule on the enclosing state; the lane row's `pending` stays true until the ending's turn |

**A visible retry: the CALL/WAIT split.** After a definite failure such as `Busy`, nothing happened, so trying again
is a new write with a new id (rule 19), and a server that stores failures under a key cannot replay `Busy`. Its
budget is therefore memory, counted across writes:

```ts
PAYING:  { on: { Busy: [{ target: S.WAITING, guard: underBudget, updateMemory: countAndDelay }, toCard("busy")] } },
WAITING: {
  schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },   // after memory: the Busy turn's retryInMs (rule 23)
  on: { RetryNow: [{ target: S.PAYING, guard: [pay.idle(key)], actions: [pay] }, { target: "self" }] },   // a new write, a new id
},
```

Entry arms the wait and leaving cancels it, so leaving stops the retry, and no `armOn` arms on the give-up branch.
The view shows "retrying 2 of 3" from `memory.busyTries`.

**Reconciling an unknown.** After an **unknown**, the write may have happened, so the same write is sent again
(`pay.retry`): the server dedups by its id, and `pay.retryCount` is the budget:

```ts
UNSURE: {
  schedules: { check: { schedule: "3 seconds", send: E.CheckTick } },
  on: {
    CheckTick: [
      { target: S.PAYING, guard: ({ calls, memory }) => (lane(calls, memory.intentId)?.retryCount ?? 0) < 5 || deny("ChecksLeft"), actions: [pay.retry(key)] },   // never a new Attempt (lane: 2.7.5)
      { target: S.STUCK },                                    // still unknown after 5 re-sends: tell the user, never "not charged"
    ],
  },
},
```

Re-sending is safe when the server dedups by key; otherwise reconcile with a read (2.7.9). Once a send has ended
unknown, a later definite failure of the same Attempt reaches `unknown:` as `StillUnknown { failure }` (rule 18), so
a give-up branch can never say "not charged" after a send that may have charged. `Stripe.confirm` is `reject`, so the
lane's one Attempt is the one this state reconciles; under `allow` this `retry` would be a type error, because a
second charge on the same intent could be the lane's newest (rule N2; Revision (multiplicity audit, 2026-10-31)).

#### 2.7.7 Leaving, compensation and clean-up

```ts
// booking.operations.ts (excerpt)
export const charge = transaction({
  id: "Booking.charge",
  key: (i) => ({ holdId: i.holdId }),
  concurrency: "reject",
  commit: chargeCard,                                 // classifies with Outcome where it reads the response
  orphaned: ({ attempt, retry }) => retry(attempt),   // in flight across a version change (P19)
});

// booking.machine.ts (excerpt): the user left mid-charge; the charge lands. LEFT owns no call, so the late handler may move it.
const chargeKey = ({ memory }) => ({ holdId: memory.holdId })
const refundKey = ({ memory }) => ({ paymentId: memory.paymentId })
const refund = O.Booking.refund.commit(refundKey, { outcomes: { success: E.Refunded, failure: { … }, unknown: E.RefundUnsure } })
on: {
  Paid: [{ target: S.REFUNDING, guard: [S.LEFT], updateMemory: ({ event }) => ({ paymentId: event.paymentId }), actions: [refund] }, { target: "self" }],
  ChargeUnsure: [{ target: S.SETTLING, guard: [S.LEFT], actions: [charge.retry(chargeKey)] }, { target: "self" }],
},
REFUNDING: {
  on: {
    Refunded: S.REFUNDED,
    RefundBusy: [waitBusy(S.REFUND_WAIT, 8), needsHelp("Your refund is delayed. We'll complete it and email you.")],   // a new write after a wait
    RefundUnsure: [waitUnsure(S.REFUND_WAIT, refund, refundKey, 8), needsHelp("Your refund is delayed. We'll complete it and email you.")],   // the same write
  },
},
```

Lateness is not transitive: a call started by a late turn is an ordinary call with its own owner (rule 15), so the
chain can finish. REFUNDING owns the refund, so its endings are current there and may move the user. The refund's
select reads the `paymentId` the same turn wrote (rule 22), so one commit value serves both starting points
(CONFIRMING's give-up and the late `Paid`) and `refund.retry(refundKey)` always finds its record.

**Compensation recipe.** Handle a late success at an ancestor by moving an idle state to a compensating state that
starts the undo; try a definite failure of the undo again as a new write after a wait, and reconcile its unknown with
`.retry` of the same Attempt, each with a budget, ending in a state that tells the user. The full case is
[merged/server-calls/rewrites/booking.ts](merged/server-calls/rewrites/booking.ts).

**Cancel, then clean up.**

```ts
const put = O.Uploads.upload.commit(({ memory }) => ({ ref: memory.ref }), {
  outcomes: {
    success: E.Uploaded,
    failure: { NotSent: E.UploadNotSent },                               // never left the device: nothing to clean
    unknown: E.UploadUnsure.from((_r, { input, attempt }) => ({ ref: input.ref, uploadKey: attempt.id })),
  },
})
const clean = O.Uploads.discard.commit(({ event }) => ({ ref: event.ref, uploadKey: event.uploadKey }), { outcomes: { … } })
UPLOADING: { on: { Uploaded: S.DONE, Cancel: { target: "self", actions: [put.cancel(key)] }, UploadNotSent: S.CANCELLED, UploadUnsure: { target: S.CLEANING, actions: [clean] } } },
```

The client cannot stop a body already sent, and no browser API says when the server is done with it. So the
clean-up names the write by its id and the server applies it whenever the upload arrives (a tombstone). Flow's part:
the id reaches the clean-up typed, and the call stays pending until the commit's fiber has exited, so a retry cannot
run beside it on the client (rule 24).

#### 2.7.8 Concurrency

| Mode | Meaning (per actor, descriptor and key, Operations O3) |
| --- | --- |
| `reject` | a start on a pending key refuses only the write: it ends `NotSent { why: "Rejected" }` and the transition still runs. `pay.idle(key)` refuses the transition too (rule 16) |
| `latest` | one send in flight, at most one waiting; a newer start replaces the waiting one, which ends `NotSent { why: "Superseded" }`; the waiting one goes when the in-flight one settles (a domain write: when it heads every record queue it joined, rule 29); every mapper receives `superseded` |
| `cancel`, `allow`, `serialize` | as Operations O3; a cancelled or replaced queued start ends `NotSent` |

**Revision (multiplicity audit, 2026-10-31).** The mode also decides how many Attempts a lane can hold at once, and so
which members exist (rule N2):

| Mode | Outstanding at once | Addressable Attempt | `retry`, `retryCount`, `progress` | Row in `s.calls` |
| --- | --- | --- | --- | --- |
| `reject` | one | the only one | yes | `{ key, pending, retryCount }` |
| `latest` | one in flight, one waiting | the newest start; older ones are `superseded` | yes | `{ key, pending, retryCount }` |
| `cancel` | one (a start cancels the previous) | the newest start | yes | `{ key, pending, retryCount }` |
| `allow` | any number | none | type errors | `{ key, outstanding }` |
| `serialize` | one running, up to 64 queued | none | type errors | `{ key, outstanding }` |

`idle` and `cancel` exist in every mode, aggregating as rule N1 says. Several concurrent calls that each need a status,
a retry or a progress bar (messages, uploads, per-item batch results) are keyed per call and declared `reject`; on its
own key, `reject` never refuses a different call.

```ts
// Likes on an Issues domain (2.8.2): the store predicts and rolls back; a failure only toasts, so it can never undo newer intent (rule 30).
setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, { liked: input.liked, likes: (i, input) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1) })),
const like = O.Issues.setLike.commit(({ event }) => ({ key: { id: event.id }, liked: event.liked }), {
  outcomes: {
    success: E.Settled,                                            // the store confirms; memory has nothing to write
    failure: { Gone: E.IssueGone, Refused: fail("Could not update"), NotSent: fail("Could not update") },
    unknown: E.LikeUnsure.from((_r, { input, superseded }) => ({ id: input.key.id, superseded })),
  },
})
Toggle: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [like] },
ReconcileLike: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [like.retry(issue)] },   // the same request, no new prediction (rule 31)
```

A plain operation (no domain) keeps memory-held predictions, as before: the select reads the memory its turn flipped
(rule 22), and a `superseded` guard keeps a failure from undoing newer intent.

#### 2.7.9 Reads around writes

```ts
const read = O.Stripe.intent.lookup(key, { outcomes: { success: E.Intent.from(toDone), failure: E.ReadFailed } })   // a resource's call value
READING: { on: { PollTick: { target: "self", actions: [read.fetch(key)] }, Intent: […], ReadFailed: { target: "self" } } },
```

A resource's call value maps `success` and its failure tags, never `unknown` or `NotSent`, and has no Attempt and
no `retry`; `read.fetch(key)` has Operations O2's `refetch` semantics (joins a running request). Its endings are
routed like a write's (rule 14). **Revision (multiplicity audit, 2026-10-31).** Each `fetch` action is its own call
with one ending, owned by its own transition, even when it joins a request another fetch, an activity or another
actor started: two fetches from two states that join one request give two endings, one to each owner, so neither state waits with nothing coming (rule N1). A resource call value's `success:` sees confirmed data only,
never a prediction (rule 37).

#### 2.7.10 Time per key: keyed schedules

```ts
schedules: {
  unlock: {                                                                   // one timer per key
    keys: ({ memory }) => Object.keys(memory.lockedUntil),
    schedule: ({ key, memory, now }) => Duration.millis(Math.max(0, memory.lockedUntil[key] - now)),
    send: E.Unlock.from(({ key }) => ({ key })),
  },
},
```

A key's timer is armed when the key first appears in the after list, cancelled when it leaves, and fires once
(rule 23). It replaces "one timer aimed at the earliest deadline" and per-row ticks. Keyed schedules are a Machines
feature (C14).

**Keyed activities.** **Revision (multiplicity audit, 2026-10-31).** An activity takes `keys` as an option, read
like a keyed schedule's, so a list can hold one live subscription per row (rule N1; section 7 item 0):

```ts
activities: {
  quotes: O.Market.quote.subscribe(({ key }) => ({ symbol: key }), {           // params receive `key`
    keys: ({ memory }) => memory.watchlist,                                     // one session per symbol in the after list
    outcomes: { failure: E.QuoteLost.from((_e, { key }) => ({ symbol: key })) },   // every mapper receives `key`
  }),
},
useView(watch, (s) => s.activities.quotes.find((q) => q.key === symbol)?.data)  // a keyed list of lanes, each { key, …lane }
```

A key's subscription starts when the key first appears in the after list and is released when it leaves; a repeated
key keeps its first position, with `listRepair` evidence (rule 23). Each key's lane and deliveries behave as one
ordinary activity's (Machines O6; merge 6 for streams), and a delivery for a key that has left is discarded as a
released session's is. Two keys whose params project the same descriptor key are a duplicate session for the later key
(merge 6 rule 47).

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
dropped response, `NotSent` by a cancel during the Attempt's storage acknowledgement or by `latest`. `NotSent { why: "Overloaded" }` and record-queue order are reached with a
fixture that holds the head's answer plus enough sends (*Story reads: merge 3*). (Merge 3 designs the Story API for all
of this.)

#### 2.7.12 Timing in the turn

| Moment | What happens |
| --- | --- |
| The starting turn, steps 2–3 | the author's guards, including `pay.idle(key)` if written, decide whether the transition runs; Flow adds none (rule 16) |
| The starting turn, step 5 | input and key computed from the after memory (rule 22) |
| The starting turn, step 5, before publication | each start decided (2.5 step 5): on a busy `reject` lane or past a queue bound, no Attempt, and the decline (`Rejected`, `Overloaded`) applies nothing (rule 16). Otherwise: Attempt minted, with its starter, lane key and copy (rule 21); under `reject`, `latest` and `cancel` it becomes the addressable one; owner recorded; a domain write joins its record queues and predicts (rule 28) |
| The starting turn, step 6 | one publication: memory, the lane row (`pending` true, or `outstanding` grown) and the store revision; declines queued as endings; then invocation |
| Invocation | after the Persistence O6 acknowledgement; from here a cancel means `unknown` |
| Settlement | the send is classified (2.7.1); rule 18 applied; for a domain write, store effects applied and record queues released, in one publication (rule 27); then the ending is queued in the FIFO mailbox; the lane is not touched; `pending` stays true; under `latest` the waiting start is invoked now (plain) or when it heads its record queues (domain) |
| A cancel | rule 24 |
| The ending's admission (step 1) | the Attempt's ending mapped (rule 18 was applied at settlement); the lane updated (its row, the addressable Attempt; evicted if nothing is left, rule 21); mapped through `outcomes`; owner tested (rule 14) |
| The event's turn, steps 2–6 | ordinary selection, rule 15 if late; the lane is already free, so a retry here is not `Rejected` |
| A timer of a dead activation | discarded at admission (Machines O5) |
| Restore | an invoked send ends `unknown` (`Restored`); an unacknowledged one `NotSent { why: "Restored" }`; saved endings are delivered after readiness (Persistence O4) and routed by rule 14 then; a restored acknowledged Attempt's predicted records are marked uncertain and repaired before readiness, and an unacknowledged one predicted nothing (rule 38) |

The reference implementation is the spike in [merged/server-calls/spike/](merged/server-calls/spike/) (`tsc -p .`,
then `bun stories.ts`): commit values, `Outcomes` and `Events` types, the lane, admission and routing, with Stories
that run the old and new rules on the same machine and fixture.

### 2.8 Server calls and entity domains

For an operation registered in an entity domain, **the domain owns shared data and the commit value owns workflow**.
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
| `pending`, `retryCount`, the addressable Attempt | the lane (rule 21) | Flow | `pending` from the starting turn until the ending's turn is **admitted** | guards and views, as the snapshot's lane rows (`s.calls.Issues.setLike`; Revision (multiplicity audit, 2026-10-31): replaces `like.pending(s, key)`, D18), never the store |
| The ending as an event, its route | the mailbox and the commit value's `outcomes` (rules 13, 14) | Flow, at **admission** | the ending's turn | the machine's handlers |
| Drafts, toasts, reconcile keys, selection | memory | the machine's handlers | its turns | views, guards, selects |
| `attempt.id` on the wire, `basedOn` | the request | the commit author (rule 19); Flow passes `basedOn` (OPS:88-89, EDP:109) | each send; a retry sends the same (rule 31) | the server |

**Store versus lane.** The record is shared truth: every actor and view in the Runtime sees it the moment the
server's answer lands. The lane is this actor's workflow: whether this actor has handled the ending yet. They answer
different questions, so they change at different moments, and a view picks the one that means what it shows:

```ts
const row = useView(list, (s) => Issue.get(s, { id }, Issue.pick("title", "liked", "likes")))   // { data, predicted, uncertain, unconfirmed }
const saving = useView(list, (s) => s.calls.Issues.setLike.find((l) => l.key.id === id)?.pending ?? false)   // this actor's call is in flight or not yet handled (Revision (multiplicity audit, 2026-10-31): lane rows, D18)
// "Saving…" reads `saving`; the grey "not yet confirmed" style reads `row.predicted`; the "?" badge reads `row.uncertain`
```

Between a write's settlement and its ending's admission, `row.predicted` is already false and `saving` still true.
That is not a contradiction: the server has answered, and this actor has not yet reacted (rule 27).

#### 2.8.2 The list, rewritten against an `Issues` domain

LIST (197 lines: definition 52, machine 142) keeps every issue in memory as an `Item` with `sync`, `like.desired` and
`like.confirmed`, `pendingTitle`, `deleted` and a temporary id (LIST:8-19), and writes prediction and rollback by hand
(LIST:117-128, LIST:104). The rewrite moves shared data to the domain and keeps workflow in memory.

**The domain** (26 lines, new; LIST's `list.operations.ts` was not shown):

```ts
// ───────────────────────────────────────────────── issues.operations.ts (plain structs; no entity imports, EDP O1)
export const issuesInProject = resource({ id: "issues/in-project", key: (i: { projectId: string }) => i, result: IssuesPage, … })
export const setLike = transaction({ id: "issues/set-like", input: Schema.Struct({ key: IssueKey, liked: Schema.Boolean }), concurrency: "latest", commit: … })
export const renameIssue = transaction({ id: "issues/rename", input: Schema.Struct({ key: IssueKey, title: Schema.String }), concurrency: "latest", commit: … })
export const removeIssue = transaction({ id: "issues/remove", input: Schema.Struct({ key: IssueKey }), concurrency: "reject", commit: … })
export const createIssue = transaction({                          // no predicts, so its key is declared (E10)
  id: "issues/create", input: Schema.Struct({ draftId: Schema.String, projectId: Schema.String, title: Schema.String }),
  key: (i) => ({ draftId: i.draftId }), concurrency: "reject", commit: …,   // attempt.id on the wire (rule 19); draftId stays on the device
  // Revision (multiplicity audit, 2026-10-31): was "allow". One lane per draft is one call, so `create.retry(drafted)` names it (rule N2);
  // under "allow" retry is a type error, because two creates of one draft would share a lane.
})
// the three predicting writes declare no key: their lane is the predicted record, { id } (E10)

// ───────────────────────────────────────────────── issues.domain.ts
import { asc, desc, eq } from "flow-state"   // the Condition operators (merge 5)
export const Issue = entity({ id: "issues/Issue", fields: IssueRow.fields, primaryKey: ["id"] })
export const Issues = domain("issues", {
  list: read(issuesInProject)
    .list(Issue, ({ result }) => result.issues)
    .where(({ input, record }) => eq(record.projectId, input.projectId))
    .orderBy(({ record }) => [desc(record.number), asc(record.id)]),
  setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, {
    liked: input.liked,
    likes: (i, input) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),
  })),
  rename: write(renameIssue).one(Issue).predicts(({ input }) => Issue.patch(input.key, { title: input.title })),
  remove: write(removeIssue).predicts(({ input }) => Issue.delete(input.key)),
  create: write(createIssue).one(Issue),                          // membership arrives by refetch (EDP O1)
})
```

**The definition and machine** (159 lines: definition 49, machine 109; LIST was 197: definition 52, machine 142):

```ts
// ───────────────────────────────────────────────── list.definition.ts
import { definition, deny, Flow, machine } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"

export const MAX_LIKE_RESENDS = 3

export const Draft = Schema.Struct({            // workflow, not entity data: a create the list does not hold yet (E9)
  draftId: Schema.String,                       // the view's key and the create's lane; never sent
  title: Schema.String,
  status: Schema.Literals(["sending", "failed", "unsure", "created"]),
  failure: Schema.NullOr(Schema.String),
  id: Schema.NullOr(Schema.String),             // the real id once Created; the view hides the draft once the list holds it
  discarded: Schema.Boolean,                    // discarded while it may land: deleted once Created
})
export type Draft = typeof Draft.Type

export const List = definition({
  id: "Issues/List",
  states: ["READY"],
  events: {
    Toggle: { id: Schema.String, liked: Schema.Boolean },   // the view sends the value it wants, read from the record
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
    Failed: { message: Schema.String, superseded: Schema.Boolean },
    Unsure: Flow.uncertain({ message: Schema.String, superseded: Schema.Boolean }),
    LikeUnsure: Flow.uncertain({ id: Schema.String, superseded: Schema.Boolean }),
    Created: { draftId: Schema.String, id: Schema.String },
    CreateFailed: { draftId: Schema.String, message: Schema.String },   // Revision (multiplicity audit, 2026-10-31): a NothingToResend names its draft through laneKey (D21)
    CreateUnsure: Flow.uncertain({ draftId: Schema.String }),
    ReconcileLike: { id: Schema.String }, ToastExpired: {},
  },
  memory: {                                                        // workflow only: no row, title, like or rollback (E1)
    projectId: Flow.input(Schema.String),
    creating: Flow.initial(Schema.Array(Draft), []),
    likeUnsure: Flow.initial(Schema.Array(Schema.String), []),     // the keyed schedule's keys
    selectedId: Flow.initial(Schema.NullOr(Schema.String), null),
    toast: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: { Issues },
})

// ───────────────────────────────────────────────── list.machine.ts
type Memory = typeof List.Memory.Type
const draft = (m: Memory, draftId: string) => m.creating.find((d) => d.draftId === draftId)
const editDraft = (m: Memory, draftId: string, f: (d: Draft) => Draft) => ({ creating: m.creating.map((d) => (d.draftId === draftId ? f(d) : d)) })
const dropDraft = (m: Memory, draftId: string) => ({ creating: m.creating.filter((d) => d.draftId !== draftId) })
const without = (ids: ReadonlyArray<string>, id: string) => ids.filter((x) => x !== id)

export const ListMachine = machine(List, ({ S, E, O }) => {
  const issue = ({ event }) => ({ id: event.id })                  // the lane key is the record key (E10)
  const drafted = ({ event }) => ({ draftId: event.draftId })
  const fail = (message: string) => E.Failed.from((_r, { superseded }) => ({ message, superseded }))
  const unsure = (message: string) => E.Unsure.from((_r, { superseded }) => ({ message, superseded }))

  // B1: the store predicts liked and likes; `latest` coalesces inside the record queue (E5)
  const like = O.Issues.setLike.commit(({ event }) => ({ key: { id: event.id }, liked: event.liked }), {
    outcomes: {
      success: E.Settled,                                          // the store confirms; memory has nothing to write
      failure: { Gone: E.IssueGone, Refused: fail("Could not update"), NotSent: fail("Could not update") },   // NotSent: Superseded or Overloaded (E11)
      unknown: E.LikeUnsure.from((_r, { input, superseded }) => ({ id: input.key.id, superseded })),
    },
  })
  const rename = O.Issues.rename.commit(({ event }) => ({ key: { id: event.id }, title: event.title }), {
    outcomes: { success: E.Settled, failure: { Gone: E.IssueGone, Refused: fail("Couldn't save the title"), NotSent: fail("Couldn't save the title") }, unknown: unsure("Couldn't confirm the title") },
  })
  const remove = O.Issues.remove.commit(({ event }) => ({ key: { id: event.id } }), {   // Delete, and Created for a discarded draft
    outcomes: { success: E.Settled, failure: { Refused: fail("Couldn't delete"), NotSent: fail("Couldn't delete") }, unknown: unsure("Couldn't confirm the delete") },
  })
  // B2: Create and Retry both start it; the select reads the draft from the after memory (rule 22)
  const create = O.Issues.create.commit(({ memory, event }) => ({ draftId: event.draftId, projectId: memory.projectId, title: draft(memory, event.draftId)?.title ?? "" }), {
    outcomes: {
      success: E.Created.from((v, { input }) => ({ draftId: input.draftId, id: v.id })),
      failure: {
        Invalid: E.CreateFailed.from((r, { input }) => ({ draftId: input.draftId, message: r.message })),
        Refused: E.CreateFailed.from((r, { input }) => ({ draftId: input.draftId, message: `Refused (${r.status})` })),
        NotSent: E.CreateFailed.from((r, { laneKey }) => ({ draftId: laneKey.draftId, message: `Not sent (${r.why})` })),   // laneKey: always present
      },
      unknown: E.CreateUnsure.from((_r, { input }) => ({ draftId: input.draftId })),
    },
  })
  const reload = O.Issues.list.refetch(({ memory }) => ({ projectId: memory.projectId }))   // a failure repairs nothing (C4): ask again
  const draftIs = (pred: (d: Draft) => boolean, code: string) => ({ memory, event }) => { const d = draft(memory, event.draftId); return (d !== undefined && pred(d)) || deny(code) }
  const toastUnlessSuperseded = [
    { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },   // a newer write on the lane decides
    { target: "self", updateMemory: ({ event }) => ({ toast: event.message }) },
  ]

  return {
    default: S.READY,
    states: {
      READY: {
        activities: {   // value sees confirmed data only (EDP O1); the event carries ids, never rows
          issues: O.Issues.list.subscribe(({ memory }) => ({ projectId: memory.projectId }), { outcomes: { value: E.Listed.from((v) => ({ ids: v.issues.map((i) => i.id) })) } }),
        },
        schedules: {
          reconcile: { keys: ({ memory }) => memory.likeUnsure, schedule: "3 seconds", send: E.ReconcileLike.from(({ key }) => ({ id: key })) },
          toastOff: { schedule: "4 seconds", send: E.ToastExpired, armOn: [E.Failed, E.Unsure, E.LikeUnsure] },
        },
        on: {
          // ───────────── B1 likes, rename, remove: the store predicts, confirms, rolls back and marks uncertain (E1)
          Toggle: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [like] },   // a newer write replaces the reconcile
          Edit: { guard: ({ event }) => event.title.trim() !== "" || deny("EmptyTitle"), target: "self", actions: [rename] },
          Delete: { guard: [remove.idle(issue)], target: "self", updateMemory: ({ memory, event }) => ({ selectedId: memory.selectedId === event.id ? null : memory.selectedId }), actions: [remove] },
          Open: { guard: ({ activities, event }) => activities.issues?.data?.issues.some((i) => i.id === event.id) || deny("NoSuchRow"), target: "self", updateMemory: ({ event }) => ({ selectedId: event.id }) },
          Settled: { target: "self" },
          IssueGone: { target: "self", actions: [reload] },
          Failed: toastUnlessSuperseded,
          Unsure: toastUnlessSuperseded,                             // the record reads uncertain until a later write or a retry succeeds (E3)
          LikeUnsure: [
            { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },   // the newer write's success clears it (E3)
            { target: "self", guard: ({ calls, event }) => (calls.Issues.setLike.find((l) => l.key.id === event.id)?.retryCount ?? 0) < MAX_LIKE_RESENDS || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ likeUnsure: [...without(memory.likeUnsure, event.id), event.id] }) },   // setLike is latest: one addressable Attempt (rule N2)
            { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id), toast: "Couldn't confirm your like" }) },
          ],
          ReconcileLike: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [like.retry(issue)] },   // the same request, no new prediction (E7)

          // ───────────── B2: create as a draft, shown apart from the list (E9)
          Create: {
            guard: [({ event }) => event.title.trim() !== "" || deny("EmptyTitle"), ({ memory, event }) => draft(memory, event.draftId) === undefined || deny("DuplicateDraft")],
            target: "self",
            updateMemory: ({ memory, event }) => ({ creating: [...memory.creating, { draftId: event.draftId, title: event.title, status: "sending", failure: null, id: null, discarded: false }] }),
            actions: [create],
          },
          Created: [
            { guard: draftIs((d) => d.discarded, "NotDiscarded"), target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId), actions: [remove] },
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "created", id: event.id })) },
          ],
          Listed: { target: "self", updateMemory: ({ memory, event }) => ({ creating: memory.creating.filter((d) => d.id === null || !event.ids.includes(d.id)) }) },
          CreateFailed: [
            { guard: [draftIs((d) => d.discarded, "NotDiscarded")], target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId) },
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "failed", failure: event.message })) },
          ],
          CreateUnsure: [
            { guard: [draftIs((d) => d.discarded, "NotDiscarded"), ({ calls, event }) => (calls.Issues.create.find((l) => l.key.draftId === event.draftId)?.retryCount ?? 0) < 3 || deny("GaveUp")], target: "self", actions: [create.retry(drafted)] },   // find out, so a landed create is deleted
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "unsure" })) },
          ],
          Retry: [
            { guard: [draftIs((d) => d.status === "failed", "NotFailed"), create.idle(drafted)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "sending", failure: null })), actions: [create] },   // a new write (rule 19)
            { guard: [draftIs((d) => d.status === "unsure", "NothingToRetry"), create.idle(drafted)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "sending" })), actions: [create.retry(drafted)] },   // the same Attempt
          ],
          Discard: [
            { guard: [draftIs((d) => d.status === "failed", "NotFailed")], target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId) },
            { guard: [draftIs((d) => d.status === "unsure", "NotUnsure"), create.idle(drafted)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, discarded: true })), actions: [create.retry(drafted)] },
            { guard: [draftIs((d) => d.status === "sending", "NotSending")], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, discarded: true })) },
          ],
          ToastExpired: { target: "self", updateMemory: () => ({ toast: null }) },
        },
      },
    },
  }
})
```

**The view** (excerpt): rows come from the answer, row fields from the record, drafts from memory, "Saving…" from the
lane.

```tsx
const rows = useView(list, (s) => s.activities.issues?.data?.issues ?? [])
const drafts = useView(list, (s) => s.memory.creating.filter((d) => !d.discarded && !rows.some((r) => r.id === d.id)))
const row = useView(list, (s) => Issue.get(s, { id }, Issue.pick("title", "liked", "likes")))
<LikeButton liked={row.data.liked} count={row.data.likes} unsure={row.uncertain} onClick={() => send(E.Toggle({ id, liked: !row.data.liked }))} />
```

**What changed, case by case.**

| Case | LIST | Rewrite |
| --- | --- | --- |
| Like | memory `desired`/`confirmed`/`count`; `LikeSynced`, `LikeRefused` rollback with a `superseded` guard (LIST:117-128) | `.predicts` (2 lines); success is `Settled`; failure only toasts; the store replays the newer waiting prediction, so a failure can never undo newer intent |
| Like unknown | keyed reconcile, `retryCount` budget (LIST:130-138) | the same; `Toggle` drops the key, because a newer write's success clears `uncertain` (rule 32) |
| Rename | select reads memory; `Edit` with two alternatives and `pendingTitle` for an unsaved row; `Created` re-sends (LIST:93, LIST:152, LIST:172-178) | one transition; the store predicts and confirms. Editing a draft while it sends is dropped: a draft is not a record |
| Remove | `deleted` flag, `notConfirmed` restores it (LIST:104, LIST:180-184) | `.predicts(Issue.delete)` hides it everywhere; failure restores it in the store |
| Create | a temporary-id row adopted on `Created` (LIST:100-103, LIST:150-154) | a `creating` draft, hidden by the view once the list holds its id, pruned by `Listed` (rule 33) |
| A gone issue | `dropId` from memory | `IssueGone` refetches the list: a failure repairs nothing (C4) |

#### 2.8.3 Ownership (E1)

For an operation registered in a domain, **the domain owns shared data and the commit value owns workflow**:

| The domain (store) | The commit value (machine) |
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
setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, { liked: input.liked, likes: … })),
Toggle: { target: "self", actions: [like] },
```

- Machine memory never mirrors entity data. It holds drafts, toasts, reconcile keys and selection. Views read records
  and answers.
- This is EDP D1 (EDP:185-187) stated for the merged commit value: `optimistic` and `setData` stay type errors on a
  domain operation (EDP:60-61, ED:294-299).
- A plain operation (not in a domain) keeps memory-held or `optimistic` predictions; nothing in 2.7 changes for it.

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
  the ending, which is what `pay.idle` and "Saving…" mean (D5, D6).
- **Rule 18 moves to settlement** (found checking E4/E8). 2.5 step 1 applies rule 18 at admission, but the store needs
  the Attempt's ending at settlement. Rule 18 reads only the Attempt's send history, which is known at settlement, so
  nothing else moves; admission only maps it.
- **Routing never changes store effects (E13).** A late, superseded or current ending has the same store effect,
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
// t2 Toggle(true)   C supersedes B: B was never invoked, so it is removed from the queue and ends
//                   NotSent Superseded, prediction removed, no repair; C joins [R, A, C]; the record shows liked
// R settles unknown → the queue holds A until R's forced repair settles (EDP:115-116); then A is sent, then C
```

- **E5. A `latest` waiting start joins the record queue.** Superseding it removes a queued, never-invoked write,
  which EDP already allows (EDP:114-115): it ends `NotSent { why: "Superseded" }` with its prediction removed and no
  repair. The record queue, not merge 2's settlement rule (2.7.12), releases the next send, so a waiting `latest`
  start never runs over an unrepaired record (F-H3).
- **`cancel`** (E5, as corrected). `concurrency: "cancel"` on a predicting write is a `flow check` error (EDP:112-113,
  ED:645-646). Whether a `.cancel(key)` action reaches an invoked or a queued write is runtime data, so the action
  stays allowed, with rule 24's endings and rule 30's store effects: queued, `NotSent { why: "Cancelled" }` and no
  repair; invoked, unknown `Cancelled`, a forced repair and `uncertain`. The hard abort of 2.7.6 needs it.
- **E6. `reject` is the design's:** a start on a busy lane is an ending, `NotSent { why: "Rejected" }`, and the
  transition runs (rule 16, D5), replacing OPS's "declines … without work or outcome" (OPS:92-93). A Rejected start
  has no Attempt, so it never applies a prediction or joins a queue.
- **E11. Queue overflow is an ending.** A start that would exceed the actor's `serialize` queue (64, OPS:95-96) or
  any record queue it joins (64, EDP:179-182) ends `NotSent { why: "Overloaded" }`: no prediction and no queue join
  in any record (EDP's "no partial joins", EDP:209-210). The batch's other actions and the transition run. This replaces
  "rejects the whole action batch" (OPS:96-97) and is rule 16 applied to one more decline.

```ts
failure: { …, NotSent: fail("Could not update") },   // Superseded (superseded: true, no toast) or Overloaded (toast)
```

**Every `NotSent` against the store (F-M3).**

| `NotSent { why }` | Prediction | Queue | Repair | `uncertain` |
| --- | --- | --- | --- | --- |
| `Rejected` | never applied | never joined | none | unchanged |
| `Overloaded` | never applied | never joined (no partial join) | none | unchanged |
| `Superseded` | removed | removed | none | unchanged |
| `Cancelled` (queued, before invocation) | removed | removed | none | unchanged |
| `Restored` (unacknowledged at reload) | none: predictions are never persisted (EDP:127-128) | none | none | unchanged |
| `NothingToResend` | none: no write | none | none | unchanged |

This replaces ED:650-651's "settles interrupted" for a queued cancel.

#### 2.8.6 Unknown, retry and uncertain (E2, E3, E7, E8)

**E2. One retry shape.** `pay.retry(key)` (2.7.3, rule 19) replaces `O.x.retry(select)` in OPS O3 (OPS:113-117) and
EDP O1 (EDP:107-108), with OPS's "known settled result settles immediately" (OPS:114-115): under rule 21 a lane whose
Attempt succeeded has no addressable Attempt, so a retry ends `NotSent { why: "NothingToResend" }`. "The machine
reconciles the Attempt" (EDP:105-106) is spelled `pay.retry(key)`.

**E7. A retry is the same request.**

```ts
ReconcileLike: { target: "self", updateMemory: …, actions: [like.retry(issue)] },
// sends the Attempt's input and basedOn unchanged; applies no prediction; joins the record queue behind any newer write
```

- **The same `basedOn`.** REV's direction was "a fresh `basedOn`" (REV:44-45). A server that deduplicates by
  `attempt.id` compares the request with the stored one; a different `If-Match` makes it a different request under
  the same key, which such servers refuse or, worse, apply. A stale `basedOn` that the server now refuses with 412 is
  a definite failure after an unknown send, so it arrives as `StillUnknown` (rule 18): honest, because the first send
  may be the reason the version moved. The loop REV:45 fears is bounded by the machine's `retryCount` budget.
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
Attempt's mark, and a later write's success clears every mark on the record (EDP:105-106).

**The rule table** (replaces the cache table of 2.7.1 for domain operations; C4):

| The Attempt's ending (after rule 18) | Predictions | Repair | Queue release | `uncertain` |
| --- | --- | --- | --- | --- |
| success | confirmed fields (whole values, per record) replace them; omitted ones `unconfirmed` (EDP:92-100), unless no carrier's shape holds the whole field, when the prediction ends (`PredictionNotRetained`); an uncomputed field counts as predicted (merge 5, A9) | answers from both bases | at settlement | this Attempt's mark and the record's cleared |
| failure (author's tag) | removed | none (C4) | at settlement | unchanged |
| failure `NotSent` | 2.8.5's table | none | at settlement | unchanged |
| unknown (author's, `Cancelled`, `Restored`, `Interrupted`, `Defect`, `StillUnknown`) | kept until the forced repair lands | forced | after the forced repair settles | set for this Attempt |

#### 2.8.7 Creates (E9)

No temporary id enters a domain list. A pending create is workflow: memory holds a `creating` draft, the view shows it
apart from the answer, and membership appears when the answer's refetch holds its key (EDP:118-119, ED:670-674).

```ts
Create:  { updateMemory: …({ creating: [...memory.creating, { draftId, title, status: "sending", id: null, … }] }), actions: [create] },
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

#### 2.8.8 Keys (E10)

The lane key of a one-record domain write comes from `.predicts` (E10, as corrected). `.one(Entity)` on a write
locates the record **in the response** (ED:247-251; EDX:96-97 takes it from `result.from`), which does not exist when
the lane key is needed, at start; the key the domain knows at start is the key expression recorded from `.predicts`
(ED:338). Operation modules never import entities (EDP:18-19), so the default is supplied at registration, by the
domain:

```ts
rename: write(renameIssue).one(Issue).predicts(({ input }) => Issue.patch(input.key, { title: input.title })),
// renameIssue declares no key: its lane key is the predicted record's key, input.key = { id } (rule 34)
const issue = ({ event }) => ({ id: event.id })   // so retry, cancel, idle and pending take the entity's key record
create: write(createIssue).one(Issue),            // predicts nothing: createIssue declares key: (i) => ({ draftId: i.draftId })
```

- A write that predicts exactly one record defaults its lane key to that record's key; a declared `key` that is not
  that projection is a `flow check` warning, since two lanes for one record would let `reject` pass two writes.
- A write that predicts several records (EDX:95-101) or none (a create) keeps its declared key, or `{}` (D7).
- The `.each` spelling (strings, rule 9) is not changed here (A-L1; left to section 7 item 0).

#### 2.8.9 Callback memory reads (E12)

Rule 22 used to list "optimistic and write callbacks" as after reads while section 7 item 10 left them open (F-H4,
F-L2). Decided (E12, rule 36):

```ts
O.Notes.save.commit(select, {                 // a plain operation
  optimistic: ({ memory, input }) => …,       // the starting turn's after memory, captured at start, even if the start waits
  writes: ({ value, input }) => …,            // no memory: it runs at settlement, before any turn of the ending exists
  outcomes: { … },
})
```

- `optimistic` (plain operations only) reads the starting turn's after memory, captured when the start is recorded,
  so a queued `serialize` start applies what its own turn saw, not a later turn's memory.
- `writes` receives `{ value, input }` and reads no memory: it runs at settlement (OPS:83), and the after memory of
  the ending's turn does not exist yet.
- Domain operations have no `optimistic` (EDP:60-61); their `writes` may only invalidate, with the same
  `{ value, input }` view (ED:297-299; E12, as corrected).

#### 2.8.10 Reads around writes (E15)

A resource's call value (2.7.9) carries confirmed data only: predictions never reach a `success:` mapper,
as they never fire `value` (EDP:130-131). A read's defect or interruption arrives on `failure` as the Flow reasons
`Defect` and `Interrupted`:

```ts
const read = O.Issues.issueById.lookup(key, { outcomes: { success: E.Loaded, failure: E.ReadFailed } })   // one event: Defect and Interrupted arrive here
const read2 = O.Issues.issueById.lookup(key, { outcomes: { success: E.Loaded, failure: { NotFound: E.Gone, Defect: E.ReadFailed, Interrupted: E.ReadFailed } } })
```

With a single `failure:` event they arrive there; in a tag record they are optional in the type and required by
`flow check` (E15, as corrected), as `NotSent` is where it can occur (rule 20): an unmapped read defect would leave a
state waiting with no event, the silent decline D5 removed for writes. A read can always defect, so in practice they
are always required.

`O.x.refetch(select)` (Operations O2, as `reload` in 2.8.2) is a cache action with no ending: the activity's `value`
delivers what it reads. A state that must wait for a read uses a call value (2.7.9).

#### 2.8.11 Persistence (E14)

A lane, its Attempt and the keys that Attempt predicts persist in **one capture**, the Attempt acknowledgement
Persistence O6 already requires before invocation (PER:123-127, C17). Restore therefore finds either both or
neither: an acknowledged Attempt whose predicted keys are marked `uncertain` with a forced repair (EDP:106-107), or an
unacknowledged one that ends `NotSent { why: "Restored" }` with nothing to repair (F-M7). Prediction values are never
persisted (EDP:127-128).

#### 2.8.12 Names (E16)

The record read's `pending` (EDP:130, ED:705-706, ED:749) is renamed `predicted`:
`{ data, predicted, uncertain, unconfirmed }`. Then `pending` means one thing: this actor's call is in flight or its
ending not yet handled (rule 21). The resource and answer lane's field "true for live optimistic values or
predictions" (OPS:153, OPS:166, ED:703-704), which means what the record's means, is renamed `predicted` too (E16, as
corrected).

#### 2.8.13 How it is implemented

One runtime: the store and the actors already share the Runtime (EDP:6); nothing here adds a second execution path,
and `check()` still runs steps 2–6 and publishes nothing (2.5): it decides no start, so it never predicts.

- **Start** (step 5). Once the after memory gives the input and key, a domain write calls its predicted fields' functions with the real input, over records the store holds (merge 5, A8)
  (ED:339), checks every record queue's bound, and either declines (`Overloaded`, `Rejected`) or joins all its queues
  at once. The store revision and the actor's snapshot publish as one cut in step 6. A persisted actor captures the lane, the
  Attempt and the predicted keys in one record and waits for the acknowledgement before invocation (rule 38).
- **Send.** A write is invoked when it heads every queue it joined. A retry joins like a start, without a prediction,
  and keeps its first send's position.
- **Settlement.** The watcher fiber that merge 2's spike uses (`{ lane, outstanding, sendEnding }`, [merged/server-calls/proposal.md](merged/server-calls/proposal.md) section 5) classifies the send, applies rule 18 from the Attempt's send history (kept with the Attempt),
  calls the store with the Attempt's ending, which publishes and releases queues, and only then queues the ending in
  the mailbox. Routing stays in `admitEnding`.
- **Admission** is unchanged: map, test the owner, update the lane.
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
  (`verify.idle`, rule 21);
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
import { definition, deny, Flow } from "flow-state";
import { Schema } from "effect";
// verifyCode and resendCode: keyed by challengeId, concurrency "reject". The commits classify
// WrongCode, Expired and Throttled as failures, with Outcome, where they read the response.
import { Auth } from "./auth.operations";
import { Countdown, Field, Lockout } from "./fragments";

export const LIMIT = 3;

const sixDigits = (v: string) => /^\d{6}$/.test(v) || deny("CodeFormat", { length: 6 });

export const SignIn = definition({
  id: "Auth/SignIn",
  states: [
    "PASSWORD",
    {
      TWO_FACTOR: Flow.state(["ENTERING", "VERIFYING", "LOCKED_OUT"], {
        traits: {
          // Fresh on every entry to TWO_FACTOR: Back drops the typed code.
          code: Field(Schema.String, { validate: sixDigits }),
          // Resumable: Back and return do not reset the 30 seconds; an overdue cooldown ends on return.
          resendCooldown: Countdown({ length: "30 seconds" }).resumable(),
        },
      }),
    },
    "SIGNED_IN",
  ],
  events: {
    PasswordAccepted: { challengeId: Schema.String }, // the password step's stub
    Submit: {},
    Resend: {},
    BackToPassword: {},
  },
  internalEvents: {
    CodeAccepted: {},
    CodeWrong: { challengeId: Schema.String },     // the call's own challenge, from its input
    CodeExpired: {},
    CodeUnchecked: Flow.uncertain({}),             // the only kind of event `unknown:` may target
    ResendSent: {},
    ResendRefused: {},
    ResendUnsure: Flow.uncertain({}),
    StopWaiting: {},                               // VERIFYING's soft timeout
  },
  memory: {
    challengeId: Flow.initial(Schema.String, ""),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
    struck: Flow.private(Flow.initial(Schema.Array(Schema.String), [])), // challenges with a strike
  },
  traits: {
    // One per struck challenge, at the root: strikes and lockouts survive Back (rule 9).
    challenges: Lockout({ limit: LIMIT, length: "5 minutes" }).each({ of: "struck", max: 20 }),
  },
  operations: { Auth },
});
```

```ts
// signin.machine.ts
import { deny, machine } from "flow-state";
import { LIMIT, SignIn } from "./signin.definition";

type Memory = typeof SignIn.Memory.Type;
const strikesOf = (memory: Memory, key: string) => memory.challenges.find((c) => c.key === key)?.strikes ?? 0;

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  const strike = E.challenges.Strike.from(({ event }) => ({ key: event.challengeId }));
  const isCurrent = ({ key, memory }) => key === memory.challengeId || deny("OtherChallenge");
  // A challenge gets its Lockout copy at its first strike, and loses it when it unlocks.
  const union = (ids: ReadonlyArray<string>, id: string) => (ids.includes(id) ? ids : [...ids, id]);
  const forget = ({ memory, key }) => ({ struck: memory.struck.filter((id) => id !== key) });
  const challenge = ({ memory }) => ({ challengeId: memory.challengeId }); // the lane: one per challenge

  // Owned by VERIFYING, the state Submit enters (rule 14). If VERIFYING was left (Back, or the soft
  // timeout) when an ending's turn is admitted, the same event routes from TWO_FACTOR, or the root.
  const verify = O.Auth.verifyCode.commit(
    ({ memory }) => ({ challengeId: memory.challengeId, code: memory.code.value }),
    {
      outcomes: {
        success: E.CodeAccepted,
        failure: {
          WrongCode: E.CodeWrong.from((_, { input }) => ({ challengeId: input.challengeId })),
          Expired: E.CodeExpired,
          NotSent: E.CodeUnchecked,                // `reject` (rule 20)
        },
        unknown: E.CodeUnchecked,                  // StillUnknown arrives here too (rule 18)
      },
    },
  );
  // Owned by TWO_FACTOR ("self" on its handler): moving ENTERING → LOCKED_OUT does not make it late.
  const resend = O.Auth.resendCode.commit(({ memory }) => ({ challengeId: memory.challengeId }), {
    outcomes: {
      success: E.ResendSent,
      failure: { Throttled: E.ResendRefused, NotSent: E.ResendRefused },
      unknown: E.ResendUnsure,                     // the code may be on its way
    },
  });

  const toEntering = (error: string) => ({ target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error }) });

  return {
    default: S.PASSWORD,

    traits: {
      challenges: {
        // Root-trait callbacks may move the host anywhere (rule 6).
        callbacks: {
          // A late third strike while this challenge's code is being entered: lock now.
          onLocked: [
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: [S.TWO_FACTOR.ENTERING, isCurrent],
              updateMemory: () => ({ error: null }),
              raise: [E.code.Reset],
            },
            { target: "self" },
          ],
          // Unlocked with zero strikes: the copy is no longer needed, so forget its key.
          onUnlocked: [
            { target: S.TWO_FACTOR.ENTERING, guard: [S.TWO_FACTOR.LOCKED_OUT, isCurrent], updateMemory: (g) => ({ ...forget(g), error: null }) },
            { target: "self", updateMemory: forget },
          ],
        },
      },
    },

    // Late endings (rule 14): every one that can occur is handled here (rule 20).
    on: {
      CodeWrong: [
        {
          // Strikes its own challenge, current or not, re-adding its key first. The strike reaches the
          // copy this turn creates (rule 9).
          target: "self",
          guard: ({ state }) => !S.SIGNED_IN.is(state) || deny("SignedIn"),
          updateMemory: ({ memory, event }) => ({ struck: union(memory.struck, event.challengeId) }),
          raise: [strike],
        },
        { target: "self" },                        // signed in: nothing re-adds a copy
      ],
      CodeAccepted: { target: "self" },            // the user was already told "couldn't check"
      CodeExpired: { target: "self" },
      CodeUnchecked: { target: "self" },
      ResendSent: { target: "self" }, ResendRefused: { target: "self" }, ResendUnsure: { target: "self" },
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
        traits: {                                     // filled where they are placed
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
            actions: [resend],
            raise: [E.resendCooldown.Start],
          },
          ResendSent: { target: "self" },
          ResendUnsure: { target: "self" },
          ResendRefused: { target: "self", updateMemory: () => ({ error: "Too many requests, try again later" }) },
        },
        states: {
          ENTERING: {
            on: {
              Submit: {
                target: S.TWO_FACTOR.VERIFYING,
                guard: [
                  ({ memory }) => memory.code.error ?? true, // forwards the field's own reason, e.g. CodeFormat
                  ({ memory }) => strikesOf(memory, memory.challengeId) < LIMIT || deny("NoTriesLeft"),
                  verify.idle(challenge),                    // InFlight until the last verify's ending is handled
                ],
                updateMemory: () => ({ error: null }),
                actions: [verify],
              },
            },
          },
          VERIFYING: {
            // A soft timeout: stop waiting, keep listening. The real ending then arrives late (2.7.6).
            schedules: { gaveUp: { schedule: "15 seconds", send: E.StopWaiting } },
            on: {
              StopWaiting: toEntering("Couldn't check the code, try again"),
              CodeAccepted: {
                target: S.SIGNED_IN,
                updateMemory: () => ({ struck: [] }), // every lockout is forgotten
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
              CodeUnchecked: toEntering("Couldn't check the code, try again"),
            },
          },
          LOCKED_OUT: {}, // Submit is Unhandled; typing is refused by canEdit; Resend falls through
        },
      },

      SIGNED_IN: {},
    },
  };
});
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

// signup.machine.ts (excerpt). Accounts.create: no key (one lane per actor), concurrency "reject";
// its commit classifies 409 as EmailTaken and 429 as Busy, both failures.
const create = O.Accounts.create.commit(reviewedFields, {
  outcomes: {
    success: E.Created,
    failure: {
      EmailTaken: E.EmailTaken,
      Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })),   // information only: the machine decides to wait
      NotSent: E.TryAgain,                                            // `reject` (rule 20)
    },
    unknown: E.Unsure,                                                // StillUnknown too (rule 18)
  },
});

WIZARD: { default: S.WIZARD.ACCOUNT, on: { Cancel: S.CANCELLING }, states: { /* pages; REVIEW's Submit: { target: S.SUBMITTING, guard: [create.idle()], updateMemory: () => ({ busyTries: 0 }), actions: [create] } */ } },
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
  on: { RetryNow: [{ target: S.SUBMITTING, guard: [create.idle()], actions: [create] }, { target: "self" }] },
},
UNSURE: {
  // The account may exist: send the same write again, so the server dedups by its id (rule 19).
  on: { CheckAgain: { target: S.SUBMITTING, guard: [create.idle()], actions: [create.retry()] } },
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
(rule 22); `create.retry()` from UNSURE re-sends the Attempt the lane holds, with its own input (rule 21).

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

// Issues.setPinned: a plain operation (this list registers no domain; with 2.8's domain, the pin would be
// `.predicts`, and `optimistic` a type error, rule 26), keyed by id, concurrency "reject".
const pin = O.Issues.setPinned.commit(({ event }) => ({ id: event.id, pinned: event.pinned }), {
  outcomes: {
    success: E.Pinned,
    failure: E.PinFailed,   // one event for every failure, NotSent included
    unknown: E.PinUnsure,
  },
  // Reads the after memory (rule 22). Success confirms the look; failure removes it; unknown keeps it,
  // marked uncertain, and refetches the displayed entries once (2.7.1).
  optimistic: [O.Issues.list.setData(({ memory, event }) => ({ key: listQuery({ memory }), data: pinRow(event) }))],
});

// A host debounce: 300 ms after the last keystroke, SearchSettled is the source of its own turn.
schedules: { settle: { schedule: "300 millis", send: E.SearchSettled, restartOn: ({ memory }) => memory.search.value } },
traits: {
  pager: {
    resetOn: ({ memory }) => [memory.appliedSearch, memory.sort, memory.status],
    guards: {
      hasNext: ({ memory, activities }) =>
        memory.pager.page * 20 < (activities.issues?.data?.total ?? 0) || deny("LastPage"),
    },
  },
  checked: { resetOn: listQuery }, // declared after pager, so it sees pager's reset (rule 1)
},
on: {
  SearchSettled: { target: "self", updateMemory: ({ memory }) => ({ appliedSearch: memory.search.value }) },
  SortChanged: { target: "self", updateMemory: ({ event }) => ({ sort: event.sort }) },
  Pin: { target: "self", guard: [pin.idle(({ event }) => ({ id: event.id }))], actions: [pin] },   // InFlight per row
  Pinned: { target: "self" }, PinFailed: { target: "self" }, PinUnsure: { target: "self" },   // the cache shows each ending
  // Select all on this page: the ids come from the pre-turn snapshot, never from the click.
  SelectPage: {
    target: "self",
    raise: [E.checked.SelectAll.from(({ activities }) => ({
      ids: activities.issues?.data?.items.map((i) => i.id) ?? [],
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
| **New, plans** | `Outcome.success`, `Outcome.failure`, `Outcome.unknown`; Flow's reasons `NotSent { why }` (`Cancelled`, `Restored`, `Superseded`, `Rejected`, `NothingToResend`, `Overloaded`), `Cancelled`, `Restored`, `Interrupted`, `Defect`, `StillUnknown { failure }`; the commit value's `.retry(key?)`, `.cancel(key?)`, `.idle(key?)`; the lane rows `s.calls.<operation path>` with `pending`, `retryCount` or `outstanding` (Revision (multiplicity audit, 2026-10-31): replaces `.pending` and `.retryCount`); the mapper's `{ input, attempt, superseded, laneKey, key? }`; `attempt.id`, `attempt.retryCount`, `attempt.mayHaveApplied`; `concurrency: "latest"`; the record read `{ data, predicted, uncertain, unconfirmed }` (`predicted` replaces the record's and the resource lane's `pending`); (merge 5) the condition operators `or`, `not`, `gt`, `gte`, `lt`, `lte`, `isNull`, a predicted field's `(beneath, input) => value`, the Runtime option `checkReplays`, the warning `PredictionNotRetained`; the codes `InFlight` and `LateMayNotLeave`; a resource's call value `O.x.lookup(select, { outcomes })` and `read.fetch(key)`; `keys` (keyed schedules and, Revision (multiplicity audit, 2026-10-31), keyed activities); `.checkpoint(name, ({ truth }) => …)`; `orphaned`; `.history` (and `.history.child`); `armOn`; `disarmOn`; `s.schedules`; `dueAt` (the `model()` options `invariants`, `hot` and `explore` are removed with T1) |
| **New concepts, not words** | **incarnation** (one life of a fragment instance), **frozen** (a resumable trait while its node is inactive), **summary** (a contract's inferred per-alternative effects), the memory views **before**, **before-walk** and **after** (2.5, rule 22), pending reset, the three **channels** (2.7.1), a **write** (one Attempt) and a **send** (one invocation), the **lane** (rule 21), the lane's **addressable Attempt** and a **keyed list** (rules 21, N1, N2; Revision (multiplicity audit, 2026-10-31)), a call's **owner** and its **current** or **late** ending (rule 14), **late turn** (rule 15), the **Attempt's ending** (rule 18); the **record queue** (per record, across actors, rule 29), the **uncertain mark** (per record and Attempt, rule 32), **settlement** versus **admission** (rule 27), a **create draft** (`creating`, a convention, rule 33); (merge 5) yes / no / maybe, a **carried path**, the **record beneath**, an **uncomputed** prediction, a **prediction fault**, `many` |
| **Existing** | `definition`, `machine`, `states`, `default`, `events`, `internalEvents`, `input` (caller side only: `ensure`, `useActor`, a host's filling), `memory`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`, `restartOn`, `transaction`, `key`, `concurrency`, `commit`, `outcomes`, `optimistic`, `setData`, the Attempt, `deny`, `check`, `model` (marked for removal, T1), `S`, `E`, `O`, `.from`, `payload` |
| **Author-chosen** | every other name (`Field`, `Lockout`, `challenges`, `LOCKED_OUT`, `canEdit`, `onLocked`, …) |

## 4. Against the problems in principles.md

| Problem | Answer |
|---|---|
| **L1** stale timers, **T2** schedule traps | Prevented. Schedules stop with their incarnation. Arming ids drop firings from before a re-arm (P11). `armOn` replaces counter idioms. The `restartOn` baseline is the activating turn's memory (P8). A schedule function reads the memory its own turn wrote (rule 23). |
| **L2** late results | Prevented. A call's ending is routed when its turn is admitted, by its owner: current from the active leaf, late from the owner's nearest surviving ancestor (rule 14). Raises and timers to `.each` copies follow the copy's incarnation (rule 9); call endings started in a copy are never dropped and carry the copy's key from their Attempt (rules 9, N3; Revision (multiplicity audit, 2026-10-31)). |
| **L3** leftover memory | Prevented by placement and incarnations. `.resumable()` is an explicit opt-in to carry data back. |
| **L4** no way out | Prevented. The host may always leave a subroutine's state (rule 6). |
| **L5** abandoned effects | Prevented. A late ending is the same mapped event, handled at an ancestor, and every late event that can occur must be handled (rules 14, 20). A late handler may start a compensating call, which can finish (rule 15). |
| **L6** silent admission, **L8** phantom replies | Prevented. A call never sent ends `NotSent { why }`, and a declined start or retry is an ending too (rules 16, 17). Lanes are readable as snapshot data, and an absent lane is absent (`s.calls`, rules 21, N3). A raise or timer into a dead incarnation is dropped with evidence; a call ending never is (rule 9; Revision (multiplicity audit, 2026-10-31)). |
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
| **D1** drifting copies | Prevented. Fragment memory, resumable slices, schedule deadlines and lanes are readable, so nothing is copied; an entity record is never copied into memory (rule 26); the Attempt stays in the lane, not in events or memory. |
| **D2** live values on retry | Prevented. `.retry` re-sends the lane's addressable Attempt with the input it was started with (rule 21), and exists only where a lane has one (rule N2; Revision (multiplicity audit, 2026-10-31)). |
| **D3** feedback loops | Not applicable: fragments do no I/O. |
| **D4** unmapped outcomes | Prevented. `failure:` is exhaustive by tag (rule 13), and every current and late event that can occur must be handled (rule 20). |
| **D5** restore in flight | Prevented. Lanes persist with the actor, and a restored ending is routed by its owner (rule 14, C17). Attempts survive a version change through `orphaned`, at least once (P19). Saved-state compatibility Stories are left out (section 6). |
| **D6** same-turn seeding | Prevented. `input` and `resetOn` read the before-walk memory; selects and schedules read after (rule 22). A transition that reads a key it writes in both views is a warning. |
| **D7** drafts lost | Prevented where the fragment declares `whenAbandoned`, or the trait is placed high enough, or with `.resumable()`. Otherwise it is a convention. |
| **A1, A2** forwarding, scattered blocks | One filling block per instance. A view sends at the instance path, so nothing is forwarded. One `outcomes` mapping per commit value serves current and late handlers. |
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
| **Machines O1** | `operations` may hold operation or entity-domain handles, or group operation handles one level deep; a domain's entries are paths under it (`O.Issues.setLike`, `s.calls.Issues.setLike`, 2.8.2) | Replaces "a flat record of operation or entity-domain handles" with "…or entity-domain handles, or one-level groups of operation handles" |
| **Machines O1** | A definition's `handler(path, h)` / `guard(path?, g)` type shared code as if written at `path`; a commit value's select is typed at each transition that runs it | Adds |
| **Machines O2** | A subroutine state is entered at its default, or is a leaf. It is left by an exit, or abandoned by a transition that exits it; host events fall through to ancestors as usual. Exits are targets only fragments take | Adds to "target is required and is this machine's token or "self"" |
| **Machines O2** | `token.is` accepts a snapshot or a state path. A state token may be an element of a guard array, and passes when the pre-turn state is at or below it | Replaces "token.is(snapshot) includes descendants" with "token.is(snapshot or state)…" |
| **Machines O3** | **The turn algorithm of section 2.5 is normative**, for the runtime and `check()`. All-declining still falls through to ancestors (O2); a child's refusal inside a selected alternative never does | Replaces the prose from "An accepted transition computes updateMemory before action parameters" to "One invalid action rejects the whole turn" with the algorithm, keeping its defect rules (the memory views are C13) |
| **Machines O4** | Guards also receive `schedules` and `calls` (Revision (multiplicity audit, 2026-10-31): the lane rows of rule 21, replacing the commit value's `pending` / `retryCount` reads), and may use a commit value's `idle` guard. `check()` runs steps 2–6 of the turn. `deny(code, context?)` returns plain data matching `Flow.Denial`, so it may be stored in memory, and a guard may return a stored denial | Replaces "A guard receives { event, state, memory, context, activities }" with the same list plus `schedules`; adds the last sentence |
| **Machines O8** | The snapshot exposes fragment slices (`undefined` while inactive, present while frozen), `.each` copies in key order, `schedules`, and (Revision (multiplicity audit, 2026-10-31)) `calls`, the lane rows of rule 21; keyed schedules and keyed activities are keyed lists (rule N1). Reading an old snapshot still never consults live lanes | Replaces "It has no input, methods, timers or public revision" with "…no input, methods or public revision; armed schedules appear under `schedules`" |
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
| C2 | Operations O3, O7 | Flow's reasons: the failure `NotSent { why }` (`Cancelled`, `Restored`, `Superseded`, `Rejected`, `NothingToResend`, `Overloaded`) and the unknowns `Cancelled`, `Restored`, `Interrupted`, `Defect` (with the Cause) and `StillUnknown { failure }`. `interrupt` and `defect` stop being outcome keys. Flow has no timeout reason | Replaces the `reject` and "ends it as interrupt" sentences |
| C3 | Operations O3 | The runtime classifies each send from the commit fiber's `Exit` and its whole `Cause`, outside that fiber, most cautious first (2.7.1). The ending delivered is the Attempt's: a definite failure after an unknown send of the same Attempt is `StillUnknown` (rule 18) | Adds |
| C4 | Operations O5, EntityDomains O1 | Success confirms the optimistic look and domain predictions; failure removes them without a refetch; unknown keeps them, marked uncertain, and refetches the displayed entries once. Flow never loops. `revertOnUnknown` does not exist. Domain predictions follow the Attempt's ending after rule 18, not the channel: a definite failure after an unknown send is unknown in the store (rule 30) | Replaces Operations O5's "unknown retains them and invalidates the entry" and EntityDomains O1's "failure or defect … repairs" |
| C5 | Operations O2 | Reads keep two channels, success and failure; a defect in a read is an issue and a `Failure` lane. A resource's call value `O.x.lookup(select, { outcomes })` maps `success` and failure tags; `read.fetch(key)` has `refetch` semantics; its endings are routed like a write's (rule 14); (Revision (multiplicity audit, 2026-10-31)) each `fetch` action has its own ending, even when it joins a running request | Replaces `defect` and `interrupt` for lookups; adds call values |
| C6 | Operations O2, O3 | `O.x.commit(select, { outcomes })` returns an inert commit value that maps each ending onto a definition event (rule 13). Mappers receive `(value, { input, attempt, superseded, laneKey, key? })`; a `NotSent` mapper `{ input?, attempt?, superseded, laneKey, key? }` (Revision (multiplicity audit, 2026-10-31): `laneKey` always, `key` the Attempt's `.each` copy). `failure` is exhaustive by tag; `NotSent` is optional in the type | Replaces "Mappers receive values only." |
| C7 | Operations O3 | The commit value is the handle: `.retry(key?)` and `.cancel(key?)` (actions), `.idle(key?)` (a guard, code `InFlight`). (Revision (multiplicity audit, 2026-10-31): lane reads are snapshot data, C8; `retry` only under `reject`, `latest` and `cancel`, rule N2; `cancel` cancels every outstanding Attempt of the lane, rule 24.) Starting is static: only from `actions`. `O.x.retry(attempt)`, `retry(select, options)`, and `cancel` / `pending` on the descriptor are removed. Flow has no timeout and never retries (rule 25) | Replaces Operations O3's `retry(select, options)` and descriptor-level `cancel`; keeps "Flow promises no remote rollback and never retries automatically" |
| C8 | Operations O3 | One lane per actor, transaction and key, across commit values. **Revision (multiplicity audit, 2026-10-31).** It holds the outstanding Attempts and, under `reject`, `latest` and `cancel`, one addressable Attempt; each Attempt remembers the commit value that started it (whose `outcomes` a `retry` uses), its lane key and its `.each` copy. A lane with nothing outstanding and nothing addressable is evicted. The snapshot exposes lanes as `s.calls.<operation path>`, a keyed list (one row or `undefined` when unkeyed) of `{ key, pending, retryCount }` or, under `allow` and `serialize`, `{ key, outstanding }`; this amends "Transactions have outcomes, never lanes" (Operations O6) (rule 21) | Adds |
| C9 | Operations O3 | `attempt.id` is minted by Flow, random per write, the same for every send of it; the commit author puts it on the wire, and Flow derives no other key. A definite failure is tried again as a new write. The Attempt carries `retryCount` and `mayHaveApplied` (rule 19) | Adds |
| C10 | Operations O3 | `concurrency: "reject"` declines only the write, ending `NotSent { why: "Rejected" }`; the transition runs. `concurrency: "latest"` keeps one send in flight and one waiting, replacing the waiting one (`NotSent { why: "Superseded" }`); mappers receive `superseded`. Every start and retry, invoked or declined, ends once (rules 16, 17). A domain write's waiting start joins the record queue and is sent when it heads it; queue overflow ends `NotSent { why: "Overloaded" }` for that write only, and the transition and its other actions run (rules 29, 35) | Replaces "declines … without work or outcome"; adds `latest` |
| C11 | Operations O7 | Cancel before invocation ends `NotSent { why: "Cancelled" }`; while running it interrupts, the ending `unknown(Cancelled)` is queued when the fiber exits, and the lane stays pending until its turn; after settlement or with nothing outstanding it does nothing, with evidence. A settled ending is never rewritten (rule 24) | Replaces "Every invoked commit delivers exactly one outcome" and the silent cancel before invocation |
| C12 | Operations O2, Machines O6 | A start or retry is owned by the activation of the state its transition names. At admission its ending is current (from the active leaf) or late (from the owner's nearest surviving ancestor) (rule 14). A late turn may not leave a state that owns another pending call, or an active subroutine (`LateMayNotLeave`); lateness is not transitive (rule 15). Every late event that can occur is handled (rule 20) | Replaces "State exit does not cancel finite work; its event reaches the actor's later state." **Breaking:** the reference editor's after-Close save is handled at the ancestor its late ending routes to ([m1.save](merged/server-calls/rewrites/m1.save.ts)) |
| C13 | Machines O3 | "Action parameters" split: guards, updates and patch-feeding mappers read before; commit selects, key selects and schedule inputs read after (rule 22) | Exempts commit selects and schedule inputs from "both read the pre-turn snapshot" |
| C14 | Machines O5 | A schedule function reads the after memory of its arming turn, with the same `now`; `armOn` counts an event accepted anywhere on the active path; keyed schedules (`keys`) keep one timer per key (rule 23) | Adds |
| C15 | Operations O3 | `optimistic` reads the starting turn's after memory, captured at start; `writes` receives `{ value, input }` and reads no memory; domain operations have no `optimistic`, and their `writes` may only invalidate (rules 22, 36) | Adds |
| C16 | Testing O2, O3 | A Story checkpoint may read fixture truth (`.checkpoint(name, ({ truth }) => …)`); every ending can be produced through services | Adds |
| C17 | Persistence O4, O6 | Lanes persist with the actor; Persistence O6 acknowledges the Attempt before invocation, in one capture with the records the Attempt predicts; prediction values are never persisted (rule 38). On restore, an invoked send ends `unknown` (`Restored`) and an unacknowledged one `NotSent { why: "Restored" }`; saved endings are delivered after readiness and routed by rule 14 | Replaces the former P12 ("a fenced commit restores with its activation"); extends "A crash after acknowledgment restores unknown carrying the same Attempt…" |
| C18 | CommandLine O5 | Errors: a late event with no handler at a strict ancestor of its owner, naming the event and the state; `failure.NotSent` unmapped where it can occur (rule 20). Warnings: a state-changing transition listing a `reject` commit value without its `idle` guard (rule 16); one transition reading, in both memory views, a key it writes (rule 22); (Revision (multiplicity audit, 2026-10-31)) Attempts started under two `.each` copies of one placement on one lane at once, from Story traces (`SharedCopyLane`, rule 9). Type errors: `retry` on a commit value whose transaction is `allow` or `serialize`, and a lane row's `retryCount` or `progress` there (rule N2). (Merge 4) Errors: `concurrency: "cancel"` on a predicting write (rule 29); `Defect` or `Interrupted` unmapped in a read call value's tag record (rule 37). Warning: a domain write's declared `key` is not its predicted record's key (rule 34). Display: the commit node shows its domain entry's predicted entity, key and field names, `.alsoChanges` targets and the reads they reach; `flow explain` prints the lane key and cardinality (A-L2; merge 5, 3.7) | Adds |
| C19 | Machines O6 | **Revision (multiplicity audit, 2026-10-31).** An activity's options may declare `keys` (a function of the after memory): one subscription per key, started when the key appears and released when it leaves; `s.activities.<name>` is then a keyed list of `{ key, …lane }`; params and mappers receive `key`; a repeated key is repaired with evidence (2.7.10, rule 23) | Adds to "activities: { name: O.x.subscribe(params, { outcomes?, placeholder?, when? }) }" |
| C20 | Operations O3, Machines O1 | **Revision (multiplicity audit, 2026-10-31).** A commit started in a `.each` copy's filling is an ordinary call: its Attempt carries the copy's key and incarnation, its endings are never dropped, and every mapper of that Attempt receives the copy's `key`; only the handler's raises into a gone copy are dropped (rule 9, D21) | Adds; closes section 7 item 15 |
| P15 | Operations O3, Persistence O6 | All sends of a write are **one Attempt** (same id, same input). `attempt.retryCount` counts the re-sends. Each send is acknowledged before it runs | Adds to "A persisted actor's remote commit cannot invoke its adapter until storage acknowledges its Attempt" |
| P19 | Persistence O5 | On `RestoreDiscarded`, acknowledged Attempts that are unsettled, or settled but undelivered, survive in a version-independent record. After ready, each goes to its descriptor's `orphaned` handler (which may `retry` or invalidate), or else surfaces as an issue. Delivery is at least once, so the adapter must be idempotent. Input that no longer decodes under the new Schema is an issue, not a retry. An orphaned retry has no actor: its ending is evidence only | Adds to O5's version-change rule |
| P20 | Operations O3 | A late handler may start a commit; it is an ordinary call owned by its transition's state (rule 15). **Compensation recipe** (2.7.7): handle a late success at an ancestor by moving an idle state to a compensating state that starts the undo; try the undo's definite failures again as new writes after a wait, and reconcile its unknowns with `.retry` of the same Attempt, each with a budget | Adds to C12 |

### For entity domains

Merge 4 ([merged/entities.md](merged/entities.md) section 6.4). Operations O1's `latest` is already C10.

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| C21 | Operations O3 | A domain write's store effects publish at settlement, before its ending is queued (rule 27) | Replaces "publish together before its event" (OPS:101) |
| C22 | Operations O3, EntityDomains O1, O5 | A start past the actor's `serialize` queue or any record queue, or a `many` key array past 4,096 items, ends `NotSent { why: "Overloaded" }` for that write, with no prediction and no partial join; the transition and its other actions run (rule 35) | Replaces "rejects the whole action batch with AdmissionOverloaded" (OPS:96-97) and EDP:179-182's whole-write rejection |
| C23 | Operations O3, EntityDomains O1, Persistence O6 | One retry shape, `pay.retry(key)`: the identical request (input and `basedOn`), no prediction, joins the record queue, positioned at the first send (rule 31). `O.x.retry(select)`, "a known-settled attempt settles without calling the adapter" and `InvalidAttempt` are removed; PER:133's "Explicit retry(attempt) and known-settled behavior" becomes "`pay.retry(key)` (Operations O3)" | Replaces OPS:113-117, EDP:105-109, PER:133 |
| C24 | EntityDomains O1 | The actor decides whether a start runs, the record queue when it is sent; actor concurrency includes `latest`; a superseded or cancelled queued write ends `NotSent` without repair (rule 29) | Replaces EDP:112-116's concurrency sentences and ED:650-651's "settles interrupted" |
| C25 | EntityDomains O1 | `uncertain` is a mark per record and Attempt; a successful retry of that Attempt clears it, a later successful write clears every mark on the record; a read, a forced repair, a failure and `StillUnknown` clear nothing (rule 32) | Replaces "a later write … succeeds or the machine reconciles" (EDP:105-106) |
| C26 | EntityDomains O1 | No temporary ids: a pending create is a memory draft shown apart from the answer (rule 33) | Names the pattern at EDP:118-119 |
| C27 | EntityDomains O1, Operations O5, O6 | The record read is `{ data, predicted, uncertain, unconfirmed }`; the resource and answer lane's "true for live optimistic values or predictions" is `predicted` (E16) | Replaces `pending` at EDP:130, OPS:153, OPS:166. Testing.plan still says `pending`; the Testing amendment waits (*Story reads: merge 3*) |
| C28 | EntityDomains O1 | A write that predicts exactly one record and declares no `key` has that record's key as its lane key, supplied by the domain at registration (rule 34) | Adds |
| C29 | Operations O2 | A resource call value's `success:` sees confirmed data only; a read's defect or interruption ends on `failure` as `Defect` or `Interrupted`, required in a tag record (rule 37) | Adds to O2's call values |
| C30 | Inspection; EntityDomains O2 | Inspection (ED 7's evidence table): `queue` events gain `superseded`, `cancelled` and `overloaded` removals; `uncertain` "ended (later write or reconciliation)" becomes "ended (a later write succeeded, or a retry of the Attempt succeeded)"; held unknown lanes appear in actor evidence (*Story reads: merge 3*). *Story reads: merge 3:* EntityDomains O2's `Entity.queue` states include removals with their `NotSent` reason, pending merge 3's choice of read (its revision 3 reads removals from `ending` entries) | Adds |

Merge 5 amends EntityDomains O1/V1, CommandLine O1/O5/O6/Q1 and Inspection O1/O4/D1/D2; its amendments are listed by
target in [merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md) section 6.4 (with
`entity-domain.md` and `sync-engine-adapter.md`, which are designs, not plans).

### For tooling

| # | Plan | Rule | Replaces or adds |
|---|---|---|---|
| T1 | Testing O5 | **Marked for removal: model-based exploration is cut.** Remove Testing O5 (`model`, `stateKey`, `getShortestPaths`, `getSimplePaths`) and the `invariants`, `hot` and `explore` options this row used to add; remove `model` from Package's `flow-state/testing` exports; remove the dispatch-desk demo (`editor.story.ts` `exploreEditor`, its test in `editor.test.tsx`, the README coverage row). Exploration predicts operations, schedules and turns without running them, a second execution path that must keep "replay parity" with the Runtime; Flow keeps one runtime. Finding unwritten sequences stays with `propertyTest` (Testing O6) on the real Runtime | Removes Testing O5 and the Package export; check V7's proofs that cite O5 |
| T2 | CommandLine O5 | Warnings: an exit no reachable transition takes; a `hostEvent` no host raises; a public fragment event unhandled everywhere; a subroutine whose exits are unreachable from its default. `flow stories --coverage` lists transitions, exits, callbacks and ending handlers (current and late) no Story reaches | Adds to the warning list |
| T3 | CommandLine O5 | Warn when `send(ref, E.X)` can reach a state of the target actor where X is Unhandled. There is no silencing keyword; warnings never fail the check | Sharpens "unhandled events" |
| T4 | CommandLine O5 | A lint rule with an autofix orders the category keys of definitions, fragments, machine bodies, fillings, transitions and commit options (section 2.6). It never reorders entries inside a record, whose order carries meaning | Adds |

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
   section 4): ~~per-copy subscriptions (keyed activities)~~ (Revision (multiplicity audit, 2026-10-31): keyed
   activities, 2.7.10 and C19, for the owner to confirm); raising into every copy at once; several
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
   already names the `.each` copy.
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
11. **Persisted endings.** A persisted actor's saved ending needs the transaction's success Schema (`result`), as
    persisted resources do (Operations O1).
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
    another copy still reaches its own copy's handling (rule 9, C20). For the owner to confirm.
16. **`orphaned`'s `retry(attempt)`** (P19, 2.7.7). Merge 2 removed every Attempt-argument retry in favour of the
    commit value's `.retry(key)`, but an orphaned Attempt has no actor and no lane, so the descriptor-level
    `orphaned: ({ attempt, retry }) => retry(attempt)` remains the one place an Attempt is retried by argument. Its
    shape is not settled (see also entities.md A-H2).
17. **Story reads for entity domains** (merge 3): `Entity.get` with `predicted` (Testing still says `pending`),
    `Entity.queue` removals (C30), the frames between settlement and admission (2.5, rule 27), reaching `Overloaded`
    and record-queue order with fixtures (2.7.11), held unknown lanes in evidence (rule 21), and server truth against
    the store. Each is marked *Story reads: merge 3*; merge 3's G10–G14 answer them.

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

## Decisions

Settled by the owner, with the reason each wins and what was rejected. Merge 2's decisions keep their numbers D1–D17, and merge 4's E1–E18, which their rewrites, spikes and later
proposals cite; they are not the problems D1–D7 of section 4.

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
  as inline transitions under the call.
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
  commit value for snapshot data; `retry`, `cancel` and `idle` stay.*
- **D5 Declines are endings; refusing the transition is explicit.** Under `reject`, a busy lane refuses only the
  write and ends `NotSent { why: "Rejected" }`; `pay.idle(key)` is the explicit guard, with the code `InFlight`.
  Concurrency is the transaction's required choice, so a button that should send every press uses `allow` or
  `serialize`. Consequence: a network lane never blocks a transition's other effects. Rejected: an implicit guard
  from `reject`, which would refuse an autosave's keystroke while a save is in flight, and a hidden guard breaks
  locality; a silent decline, which left a state waiting forever (spike P5).
- **D6 The machine reads a lane through `pending` and `retryCount`.** The write reaches the machine through the
  mapper, and the last ending through its own event's handler. Rejected: a readable record
  `{ pending, attempt, sends, last }` (the builds only read "is it busy" and "how many tries"), and the names `sends`,
  `attempts`, `attemptCount`, `sendCount`, `tryCount`. *Superseded in part by D18 (2026-10-31): the same two facts,
  and still nothing else, are read as snapshot rows, not through the commit value.*
- **D7 Keys are optional.** A transaction without `key` has one lane per actor and its members take no key.
  Rejected: making keys mandatory. *Superseded in part by E10 (rule 34): a one-record domain write takes its record's
  key.*
- **D8 The idempotency key is `attempt.id`, and a definite failure is tried again as a new write.** `pay.retry`
  re-sends the same write after an unknown so the server dedups; after a definite failure a new write gets a new id,
  so a server that stores failures cannot replay one. Consequence: a budget across definite failures lives in memory.
  Rejected: a Flow-derived key (`${id}~n`; Flow would choose a protocol the server must understand); a fresh key on
  every send (a re-send after an unknown would charge twice); the same id after a definite failure (a stored 403 or
  503 is replayed to every re-send, spike P6).
- **D9 Two commit values of one transaction share a lane, and the lane remembers its starter.** Consequence: `reject`
  still guarantees one write in flight per key. Rejected: a lane per commit value (two charges for one intent), and a
  `flow check` warning on two commit values of one transaction. *Superseded in part by D20 (2026-10-31): each Attempt,
  not the lane, remembers its starter.*
- **D10 `StillUnknown` has no author override.** A definite failure after an unknown send of the same write stays
  unknown; a server that replays its original decline is confirmed by a read. Rejected: an override, which would put
  configuration on the error; and keeping failure definite per send with only `mayHaveApplied` for the author, which
  let a give-up say "not charged" and charge again (spike P2).
- **D11 A settled lane is evicted.** Reading it gives `pending` false and `retryCount` 0, as a fresh lane does, so
  eviction cannot be observed; a lane holding a failed or unknown Attempt is kept for `retry`. Consequence: memory
  stays bounded for unbounded keys, with no new option. Rejected: a required `max` like `.each`, and keeping every
  lane. *Superseded in part by D19 (2026-10-31): an evicted lane has no row, the same as one never started.*
- **D12 The machine-wide rules were reviewed.** Rules 22 and 23 and keyed schedules change every machine, not only
  calls; they came with merge 2 so the calls design reads as one piece, and were reviewed before merging
  ([merged/server-calls/reviews/memory-reads.md](merged/server-calls/reviews/memory-reads.md)); the answer is D15 and
  D16. Rejected: a separate Machines proposal before the review.
- **D13 Every late event must be handled.** A missing late handler is a `flow check` error; `{ target: "self" }` is
  the explicit ignore. Flow cannot tell which late failures matter: in sign-in, a late `WrongCode` is a strike, and
  dropping it would let a guesser submit, press Back and guess again without limit. Consequence: one line per late
  event the author chooses to ignore. Rejected: late failures optional and dropped with evidence (the brute-force hole
  is invisible), and requiring handlers only where the current handler writes memory (less predictable).
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
  like `idle` (breaks D5), and forbidding `retry` where no current write is guaranteed (not analysable in general).
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
  `pay.pending` beside `s.calls` (two spellings of one fact).
- **D19 An absent lane has no row** (supersedes D11's read sentence). An evicted lane and one never started are both
  absent (rule N3); under `allow` and `serialize`, where nothing is retained for `retry`, a lane is evicted as soon as
  nothing is outstanding. Reason: a default that looks like a lane hides a wrong key. Consequence: readers write
  `?? false` or `?? 0` where they mean it. Rejected: keeping "reads as fresh", which made a lane that will never exist
  indistinguishable from an idle one.
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
  now (a second retry shape, against D4, with no case yet).
- **D21 Calls started in `.each` copies, and `laneKey`** (closes section 7 items 6 and 15). The Attempt carries its
  copy's key and incarnation; call endings are never dropped; every mapper receives `laneKey`, and `key` stays the
  copy's key. Reason: rules 8 and 17 promise every ending, and a retry from the host must still reach the copy that
  started the write; a `NothingToResend` must name its row. Rejected: dropping copy endings with evidence (breaks rule
  17); naming the lane key `key` (already the copy's).

### Entity domains (merge 4, [merged/entities.md](merged/entities.md))

Settled by the owner on 2026-10-30 (the whole of merge 4, with every recommendation of its section 9). Its numbers
E1–E18 are kept, because its rules, merge 3, merge 5 and operations-in-definition cite them.

- **E1** One split: the domain owns shared data, the commit value owns workflow; memory never mirrors a record (rule 26).
- **E2, E7** One retry shape, `x.retry(key)`: the identical request, no new prediction, joins the record queue,
  positioned at the first send (rule 31). *Superseded in part by E17 (2026-10-31): `x.retry(key)` exists only where
  the lane has one addressable Attempt.*
- **E3** `uncertain` is per record and Attempt; a successful retry or a later successful write clears it; a read never
  does (rule 32).
- **E4, E13** The store applies endings at settlement (rule 18 decided there); the lane changes at admission; routing
  never changes store effects (rule 27). A start publishes its prediction with its turn (rule 28).
- **E5, as corrected** The actor decides whether a start runs, the record queue when it is sent; `latest` joins the
  queue and supersedes by removal; `concurrency: "cancel"` on a predicting write stays a `flow check` error, while the
  `.cancel(key)` action is allowed under rule 24 (rule 29).
- **E6** `reject` is an ending; a Rejected start applies nothing (rules 16, 28).
- **E8** The store follows the Attempt's ending after `StillUnknown` (rule 30).
- **E9** No temporary ids; pending creates are memory drafts (rule 33).
- **E10, as corrected** A write predicting one record uses that record's key as its lane key; `flow check` warns on a
  different declared key (rule 34).
- **E11** Queue overflow ends `NotSent { why: "Overloaded" }` for that write only (rule 35).
- **E12, as corrected** `optimistic` reads the starting turn's after memory, captured; `writes` reads `{ value, input }`
  only; domain operations keep `writes` for `invalidate` only (rule 36).
- **E14** A lane, its Attempt and its predicted keys persist in one capture (rule 38).
- **E15, as corrected** Read call values carry confirmed data; `Defect` and `Interrupted` arrive on `failure` and must be
  mapped (rule 37).
- **E16, as corrected** The record read and the resource/answer lane read rename `pending` to `predicted`.
- **Lane lifetime** Lanes holding an unknown Attempt are kept (D11), with evidence added so they are visible.
- **E17 (Revision (multiplicity audit, 2026-10-31); supersedes part of E2, E7).** `x.retry(key)` addresses the lane's one addressable Attempt, so
  it exists only under `reject`, `latest` and `cancel` (rule N2, D20); a domain write retried under several
  concurrent calls takes a per-call key and `reject`. The list's `createIssue` is `reject` per draft (2.8.2). Reason:
  under `allow` the lane's "current" Attempt was the newest create, so a retry re-sent the wrong draft's write
  ([audit-multiplicity.md](audit-multiplicity.md) F1). Views and guards read lanes as `s.calls` rows (D18);
  the `NotSent` mapper's `laneKey` names the draft (D21), so `CreateFailed.draftId` is never `null`.
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
