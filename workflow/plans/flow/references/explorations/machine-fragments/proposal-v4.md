# Machine fragments: traits and subroutines (version 4)

**Status:** proposal, not accepted. It **supersedes [proposal-v3.md](proposal-v3.md)**. It is
evaluated against [principles.md](principles.md). v4 keeps v3's model and adds what the prior-art
study found missing ([prior-art/README.md](prior-art/README.md)). Where this file and a plan
differ, the plan wins. Section 5 lists every plan amendment, with the sentence each one replaces.
All syntax is a working draft.

**Three independent decisions.** Each can be accepted without the others.

| Decision                                | What it covers            | Plans it touches                                                                                           |
| --------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **1. Fragments and the turn**           | sections 2–3, P1–P13, P21 | Machines O1–O8, Operations O2–O3, Runtime O4, Persistence O2/O6, Testing O1, Inspection O1, CommandLine O5 |
| **2. Commit and persistence hardening** | P14–P17, P19, P20         | Operations O1/O3/O7, Persistence O5/O6                                                                     |
| **3. Exploration tooling**              | T1–T3                     | Testing O5, CommandLine O5                                                                                 |

## 1. The idea

Three layers, each owning one thing.

- **Operations own every I/O rule:** commits, reads, retries, timeouts, fencing of late results,
  uncertainty, restore.
- **Machines own states, turns, timers and history.**
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

The rules that make apps correct (fenced late results, retry policy, timeouts, outcome attribution,
outstanding-call reads, history, readable deadlines) help plain machines as much as fragments, so
they belong in the plans. v4 reuses **pieces** (fields, timers, dialogs, selections), not I/O
**policy**. Policy is written once per machine, using commit options.

## 2. Fragments

### 2.1 The two kinds

| | `trait(declaration, body)` | `subroutine(declaration, body)` |
| --- | --- | --- |
| The actor… | has it | goes into it |
| Examples | field, countdown, lockout, debounce, selection, pager, flash | confirm, hold-to-confirm, address step, picker |
| Placed (definition) | the root's `traits: { code: Field(…) }`, or on a node with `Flow.state(…, { traits })` | a state: `states: [{ CANCELLING: Confirm }]` |
| Many of them | `.list(…)`: **open**, to be designed separately (rule 9, section 7) | no |
| Instance name | the `traits` key (`code`) | the state's name (`CANCELLING`) |
| States of its own | none | optional, under its state (`HOLDING.WAITING`). Without `states` it is a leaf (`Confirm`) |
| Lives | while its node is active (the root: the actor's life); fresh on every activation unless `.resumable()` | while its state is active; fresh on every entry |
| Re-activated | when its `resetOn` value changes | on every entry |
| Ends | when its node is left (resumable: frozen) | by taking an exit, or abandoned by a transition that exits its state |
| On ending, except by an exit or a freeze | `onLeave` notifications run, fused into the leaving turn | the same |
| Contains | traits | traits and subroutines |

One question picks the kind: **does the actor have it, or go into it?** A countdown that runs beside
other states is a trait. A dialog that blocks what is under it is a subroutine.

**Reading.** Memory and schedules sit under the instance name:

- a trait: `s.memory.code` (absent without memory) and `s.schedules.code.<name>`;
- a subroutine: `s.memory.CANCELLING` and `s.schedules.HOLDING.<name>`;
- the host's own schedules: `s.schedules.<name>`;
- a nested child: `s.memory.challenges[i].timer`, `s.schedules.challenges.key(k).timer.<name>`.

These names, state names and memory keys share one namespace, and a collision rejects. A slice is
`undefined` while its fragment is inactive, except a resumable slice, which stays present while frozen.

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
  onLeave: [callbacks.onIdle],               // notified when this incarnation ends, except by an exit
}))
```

A fragment's transitions may also carry ordinary guards over its own memory (`Previous` above). A
guard slot may hold an array; all must pass. A **state token** may be an element of that array
(`guard: [S.TWO_FACTOR.ENTERING, …]`). It passes when the pre-turn state is at or below that token,
and `flow check` reads it structurally (rule 12).

| Port | The fragment uses it as | The host fills it with |
| --- | --- | --- |
| `memory` fields marked `Flow.input` | ordinary memory, already set when it activates | `input: ({ memory, event }) => …`, the derived `Input` record, read from the source-updated memory (2.5) |
| `events` | handled in `on` | nothing; views and other senders send `E.pager.Next()` |
| `internalEvents` | sent by its own `schedules` | nothing |
| `hostEvents` | handled in `on` | `raise: [E.pager.Jump.from(f)]` on any host transition |
| `guards` | `guard: guards.hasNext` | `guards: { hasNext: (g) => … \|\| deny("LastPage") }` |
| `callbacks` | `notify: [callbacks.onTurned.from(f)]` on a transition, or in `onLeave` | an `on`-style handler (`target?`, `updateMemory?`, `actions?`, `raise?`), possibly ordered alternatives ending in an unguarded one; its data is `payload` |
| `exits` | `target: exits.Done`, or `exits.Done.from(f)` | an `on`-style handler that must leave the subroutine's state |

Every category sits at the top level and is named by its direction, as `events` already is:

| Category | Direction | Who writes the code that runs |
| --- | --- | --- |
| `events`, `hostEvents`, `internalEvents` | in (from anyone, the host, itself) | the fragment |
| `guards` | in: the fragment consults them | the host writes the predicate |
| `callbacks` | out: tell the host; the fragment carries on | the host writes the handler |
| `exits` | out: return to the host; the subroutine ends | the host writes the handler |

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

| `Flow` | Kind | Meaning | Schema counterpart |
| --- | --- | --- | --- |
| `Flow.Guard` | value | a place the host may refuse; no payload | a value, like `Schema.Boolean` |
| `Flow.Callback(fields)` | constructor | a moment the fragment reports; the host fills a handler | `Schema.Struct(fields)` |
| `Flow.Exit(fields)` | constructor | a way a subroutine ends; the host maps it | `Schema.Struct(fields)` |
| `Flow.optional(port)` | combinator | the host may leave the port unfilled | shape of `Schema.optional`; a different meaning (a port, not a field) |
| `Flow.uncertain(fields)` | combinator | marks an internal event that `unknown`, `interrupt` and `defect` may target | none |
| `Flow.annotate({ title, description })` | combinator | documentation for Inspection, devtools and agents | `Schema.annotate` |
| `Flow.input(schema)` | memory modifier | the creator supplies this field (2.2.2) | none; derives the `Input` type |
| `Flow.initial(schema, value or fn)` | memory modifier | the field's starting value (2.2.2) | `Schema.withConstructorDefault(Effect.succeed(value))` |
| `Flow.private(schema)` | memory modifier | only the owner sees this field (2.2.2) | none |
| `Flow.Denial` | value | the Schema of what `deny(code, context?)` returns, `{ code, context? }`, for storing a refusal reason in memory | a value, like `Schema.Boolean` |
| `port.payload` | field | the payload `Schema.Struct`, for decode, encode or JSON Schema | none |
| `Flow.Payload<P>`, `Flow.Filling<C>` | types | a port's payload type; the type of the host's filling block for a contract | `Schema.Schema.Type<S>` |
| `Flow.isGuard`, `Flow.isCallback`, `Flow.isExit` | predicates | for tooling | `Schema.isSchema` |

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

| Modifier | Meaning |
| --- | --- |
| `Flow.input(schema)` | The creator supplies this field: an actor's creator (`ensure(ref, { input })`, `useActor(m, { input })`), or a fragment's host (its `input:` filling). The definition's `Input` type is exactly these fields. |
| `Flow.initial(schema, value)` | A constant start. It is Schema's constructor default, `withConstructorDefault(Effect.succeed(value))`, restricted to a plain value so it is pure. |
| `Flow.initial(schema, ({ …fields }) => value)` | A computed start: a pure function of fields that start from `Flow.input` or a constant `Flow.initial`, never of another computed field. |
| `Flow.private(schema)` | Only the owner sees this field: its own handlers, guards and selects. The host, views and other actors do not; Stories and Inspection do. |

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
  **total** (handled unguarded in every state).
- It also records the callbacks `onLeave` notifies.
- Effects of different alternatives are exclusive, so two of them are never counted as two state
  changers.

The summary is part of the fragment's type and is printed by Inspection. `flow check` checks a host
against its fragments' summaries, never their bodies (rule 10).

**Test position with tokens.** A guard that only tests where the actor is uses a token element
(`guard: [S.WIZARD.INVITE]`). Closures test data, and their position tests are invisible to pruning.

Fragments may not declare `operations`, `activities`, `context`, `onContext`, `send` or persistence.

### 2.3 Where things go

| What | Where |
| --- | --- |
| Placing a trait | host **definition**: the root's `traits`, or the node's `Flow.state(…, { traits })`; inside a fragment, the same in its declaration |
| Placing a subroutine | host **definition**: a state, `{ NAME: Sub }`, or `{ NAME: Flow.state(Sub, { traits }) }` with host traits on its node |
| Filling ports, `resetOn` | host **machine**, **at the node where it is placed**: the root's `traits.<name>`, a node's `states.<NAME>.traits.<name>`, a subroutine's `states.<NAME>`; inside a fragment, its body |
| What survives an abnormal ending | the fragment's body: `onLeave` |
| Feeding a fact into a fragment | host **machine**: `raise` on any host transition |
| Running I/O and mapping outcomes | host **machine**: actions and outcomes onto the host's own events |
| A handler or guard shared by several nodes | the definition's `handler(path, h)` / `guard(path?, g)`, e.g. `Signup.guard(g)`: typed as if written at `path` (the root when omitted) |

Placement is structure (it produces `S`, `E` and the view types), so it lives in the definition.
Filling refers to `S`, `E` and `O`, so it lives in the machine.

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
     - Freezing is not ending, so `onLeave` does not run. It runs if the trait is reset on return.
     - Subroutines are never resumable (a type error): they are things the actor goes into.
   - **History** (`S.X.history`) restores control only. Fragments placed at or below the restored
     child resume only if resumable. `flow check` warns when a history target can re-activate a node
     with non-resumable fragments under it, or a state that handles fenced outcome events (it would wait
     with nothing pending).
   - **`resetOn`** returns a **reset value**, compared with `Equal.equals` as `restartOn` is.
     - It reads the **source-updated memory** (2.5): the pre-turn memory with the source
       transition's own `updateMemory` applied, plus the fresh slices of traits reset before it.
     - Traits reset in declaration order (their order of placement), and each `resetOn` is typed to
       read only host memory and earlier traits. A reset cycle therefore cannot be written.
     - A reset gives the trait a new incarnation **before** the turn's parts react, so a raise into
       it in the same turn reaches the fresh incarnation.
     - **A key written by a part** (a callback or exit filling) is not seen until commit. There,
       every `resetOn` is evaluated again on the committed memory. A changed value becomes a
       **pending reset**. It runs as its own **follow-up turn**, at the head of the mailbox, right
       after the commit that recorded it. That turn resets, runs `onLeave`, arms entry timers and
       publishes. It cannot refuse. The lag is exactly one snapshot, `check()` sees the same
       turns, and `onLeave` never shares a turn with unrelated work. Pending resets are not
       persisted: on restore, `resetOn` baselines are re-taken silently (section 6).
     - On a list, a reset removes every instance.
   - **Typing.** A trait slice placed at X is typed as present in every handler, guard and select
     written at or below X. Code written elsewhere is typed where it is used:
     - a commit is checked at each transition whose `actions` list it;
     - a shared handler or guard is wrapped in the definition's `handler(path, h)` /
       `guard(path?, g)`;
     - any other helper sees the root view.
2. **Three sender lists.**
   - `events` come from anyone: views, other actors, the host.
   - `hostEvents` come only from the direct host, by `raise`.
   - `internalEvents` come only from the fragment's own schedules.

   The host maps operation outcomes onto **its own** events and raises into fragments. Sending a
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
   - **`onLeave`.** It is notified when an incarnation ends other than by its own exit: its node
     is left, it is abandoned, removed or reset (not frozen). It is fused into the leaving turn
     (2.5, step 3). Its payload mappers read the incarnation's pre-turn memory. Its fillings
     cannot target, cannot refuse (rule 8), and write only keys the leaving transition does not
     write.
   - **A late result never preempts live work.** A **late turn** is one sourced from:
     - an `abandoned` settlement run;
     - or an outcome or `retrying` of a commit started from either `abandoned` run (the pending
       run fused into a leaving turn included), or from a late turn, transitively.

     In a late turn, selection (2.5, steps 2–3) treats as denied any alternative whose target
     would exit a state that holds a fenced commit outstanding in the pre-turn snapshot, or an
     active subroutine. The last alternative of each such handler must not move the actor.
7. **One turn.** A transition and everything it raises, notifies, exits, resets and leaves compile
   into one transition, run by the algorithm in 2.5. That algorithm is normative for the runtime
   and for `check()`.
8. **Deliveries are never lost.** This covers every event a server or a clock produces, and every
   ending the host cannot refuse:
   - outcome events of fenced commits (P2);
   - `abandoned` and `orphaned` handlers;
   - exit fillings;
   - `onLeave` fillings;
   - timer-fired handlers.

   Each must be handled, ending in an unguarded alternative, in every state where it can arrive.
   Everything those handlers raise or notify must be total by the child's summary.
9. **Lists (open).** This rule records the current draft only; dynamic collections are being
   designed separately (section 7). `T.list({ max?, key?, owner? })` places keyed instances.
   - **Keys.** Without `key`, the runtime mints one on each `Add`. With `key: Schema.String`, the
     author chooses the key (`Add { key }`), and adding an existing key is a no-op.
   - **Incarnations.** Every `Add` creates a new incarnation, and so does re-adding a key that was
     removed. A delivery chain (rule 8) addresses the incarnation that was live when its commit
     started or its timer was armed. If that one is dead and the same turn re-adds the key (an
     `Add` earlier in the chain), the in-turn incarnation wins; the sign-in relies on this. Any
     other incarnation added after the commit started is deliberately never addressed.
   - **Dead incarnations.** If the addressed incarnation is gone, only the parts addressed to it
     (with their sub-chains) are dropped, with evidence. The rest of the turn, including the
     host's own outcome handling, commits, so rule 8 holds. A stale result therefore never lands
     on a row re-added by someone else; it lands only on one its own chain re-adds.
   - **Persistence and Stories.** The incarnations captured by commits and armings persist with
     the actor. In Stories, minted keys and incarnations are deterministic (`invites#2`,
     `invites#2@1`).
   - **Owner.** With `owner: "host"`, `Add` and `Remove` are host events. Otherwise they are
     public, and the optional `canAdd` / `canRemove` guards may refuse them.
   - **Events.** `Add` is refused at `max`. `Remove { keys }` ignores keys that are absent, and is
     never refused when the host raises it. An instance event carries its key: views send
     `E.invites.key(k).Changed(…)`, and the host raises `E.challenges.Strike.from(() => ({ key }))`.
     A view event addressed to an absent key is `Unhandled`. A host raise into an absent key, in a
     turn not sourced by a delivery, refuses the turn like any child refusal.
   - **Filling.** One block serves every instance. Callback payloads carry `key`.
   - **Reading.** `s.memory.invites` is the instances in order, each `{ key, …slice }`.
10. **Nesting hides the level below, for types and for checks.** A fragment places children in its
    contract and fills them in its body. It raises only into its direct children. `flow check`
    verifies a host's raise and notify graph and its rule-8 totality from its children's summaries
    only. It checks each fragment body against its own summary. Swapping a fragment for one with
    the same contract and summary cannot break its host. A changed summary is a changed contract.
11. **Tested alone.** `story.machine(fragment, { id })` fills every port with a recording harness
    and may send host events. `run.calls.<callback>` records notifications, including `onLeave`;
    `checkpoint.exit` records exits. `.enter(input)` enters a subroutine, with its `Input` record;
    `.leave()` abandons it, as a host transition would.
12. **Construction errors and runtime defects.**
    - **Construction errors** (types or `flow check`):
      - unfilled required ports;
      - rules 6, 8 and 10;
      - outcome handlers outside the fenced state;
      - a raise into a fragment that the turn's state change, as tokens show it, exits;
      - two state changers or overlapping keys that the state-token pruning cannot separate.
    - **Pruning reads only state tokens that are elements of guard arrays.** It never parses
      closures. Two alternatives made exclusive by their token elements are not flagged.
    - **Runtime pre-commit defects,** each also a `flow check` warning:
      - an overlap that only closures separate;
      - a key written both by `abandoned`'s pending run and by the leaving transition. This makes
        the leaving transition itself fail, so keep those keys disjoint by construction;
      - a raise into a fragment that a state change selected later in the same turn enters or
        exits.

### 2.5 The turn

One algorithm, shared by the runtime and `check()`. `check(snapshot, event)` runs steps 2–6 on the
given event and publishes nothing.

**What reads what.**

| Memory view | What it is | Read by |
| --- | --- | --- |
| **Pre-turn snapshot** | the last published snapshot | every guard; every payload mapper (`raise`, `notify`, `exits`, `onLeave` `.from`); commit selects; the source's `updateMemory`; parts' `updateMemory` |
| **Source-updated memory** | the pre-turn memory with the source's patch applied, plus earlier resets | `resetOn`; `input` fillers |
| **Initial memory** | a new incarnation's starting memory (input fields, then constant and computed `Flow.initial`s) | guards, mappers and updates of parts addressed to an incarnation created in this turn |

1. **Admit** (runtime only).
   - A pending reset from the last commit runs first, as its own follow-up turn (rule 1).
   - Otherwise, take the oldest event from the mailbox. The mailbox is FIFO in admission order: user sends,
     outcome events, timer firings, `onContext` events and `abandoned` settlements queue together.
   - Firings with the same deadline are separate turns.
   - `onLeave` is never queued, because it is fused. `orphaned` runs on the descriptor, not in an
     actor's mailbox (P19).
2. **Select the source.** Start at the active leaf.
   - Try that node's alternatives in order. An alternative is selected when all its guards pass,
     state-token elements first.
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
   - **Resets come first.** Before the walk, `resetOn` runs on the source-updated memory, and every
     changed trait gets a new incarnation. Raises into it reach the fresh incarnation.
   - **Addressing.** A raise addresses the incarnation live at that point: pre-turn, reset, or
     added earlier in the walk. A new incarnation is seeded lazily on first address: its `Input` record from
     the source-updated memory, then its `Flow.initial` values (2.2.2).
   - **Children that cannot react.** If an addressed child has no handler, or all its alternatives
     decline, the part **refuses the whole turn**. The host never falls through to its next
     alternative because a child refused; alternatives are chosen by their own guards.
   - **Dead incarnations.** A delivery chain addressed to a dead list incarnation drops that part
     and its sub-chain, with evidence (rule 9).
   - **Leaving.** After the walk, append, for the exit set (deepest first): `abandoned`'s pending
     runs for commits fenced to exited states, then `onLeave` for every incarnation the turn ends.
     A reset's `onLeave` comes after the raises into its fresh incarnation, and reads the old
     incarnation's pre-turn memory.
   - **Late turns.** Late turns (rule 6) deny the moves rule 6 forbids, in steps 2 and 3 alike.
4. **Seed and compute.**
   - Seed every new incarnation (entered, reset or added) that is not yet seeded.
   - Compute every payload and patch from the memory view in the table above.
5. **Validate.**
   - **One state changer** among the selected parts.
   - **Disjoint memory keys.** A new incarnation's initial memory and a later part's patch to the
     same slice do not overlap.
   - **A valid action batch** (Machines O3).

   A violation is a pre-commit defect. `check()` reports it as `Denied` with code `InvalidTurn`. A
   declined token element appears in `Denied.reasons` as `{ code: "NotInState", context: { state } }`.
6. **Commit.**
   - Apply exits (deepest first) and entries (outermost first).
   - Apply new incarnations' initial memory, then patches in expansion order, then list removals.
   - Cancel the schedules of ended incarnations, and freeze resumable ones.
   - Arm entry schedules for every entered **or reset** incarnation, and `armOn` schedules for
     every accepted event, raised ones included.
   - Evaluate `resetOn` again on the committed memory, and queue any pending resets as one
     follow-up turn at the head of the mailbox.
   - Publish once, then start actions.

**Reading the same key twice.** Payload mappers and commit selects read the pre-turn snapshot, so a
mapper that reads a key its own turn writes sees the old value (`memory.challengeId` on the
transition that sets it). `flow check` warns when a Story trace shows this, and names both sides.
Read the event instead.

### 2.6 Conventions

**Key order.** Category keys appear in one order, from what the outside sees to the internals:

| Object | Order |
| --- | --- |
| definition, trait, subroutine | `id`, `states` / `default`, `events`, `hostEvents`, `internalEvents`, `guards`, `callbacks`, `exits`, `memory`, `traits`, `operations` / `context` |
| machine or fragment body | `default`, `schedules`, `traits`, `on`, `states`, `onLeave` |
| a host's filling | `input`, `guards`, `callbacks`, `exits` |
| a transition | `target`, `guard`, `updateMemory`, `actions`, `raise`, `notify` |
| commit options | `outcomes`, `retry`, `timeout`, `optimistic`, `revertOnUnknown`, `abandoned` |

A lint rule enforces it with an autofix (T4). It moves category keys only: the entries of `traits`,
alternatives and schedules keep their order, because declaration order carries meaning (rule 1,
Machines O5).

**What lives in `Flow`.** `Flow` is the Schema-like vocabulary for shapes and declarations: ports
(`Flow.Guard`, `Flow.Callback`, `Flow.Exit`), memory modifiers (`Flow.input`, `Flow.initial`,
`Flow.private`), `Flow.uncertain`, `Flow.annotate` and `Flow.state`. How one trait instance behaves
is an attribute of that trait, so it is a method on it: `.resumable()`, `.list(…)`. `trait(…)` and
`subroutine(…)` stay plain constructors beside `definition` and `machine`; their inference comes
from branding their results and `const` type parameters, not from a namespace.

**Properties live on what they describe.** A fact about a thing is written on that thing, never in
a separate list that refers to it by name. Named lists (`events`, `hostEvents`, `internalEvents`)
hold categories a reader scans for; modifiers (`Flow.private`, `.resumable()`) hold properties of one
item. Readability decides between the two.

## 3. Example

### 3.1 Two-factor sign-in, in full

The apps are those of [comparison/apps.md](comparison/apps.md). The flow is `PASSWORD → TWO_FACTOR →
SIGNED_IN`. In the two-factor step:

- a 6-digit code;
- three wrong codes lock **that challenge** for 5 minutes;
- resend is refused for 30 seconds after each resend, across Back and return;
- strikes and lockouts are kept **per challenge**, across Back and return;
- a wrong code that settles after Back still strikes its own challenge, and a late third strike
  locks at once if the user is entering that challenge's code;
- only one guess is in flight per challenge: a verify stays pending until it really settles;
- a verify that takes longer than 15 seconds shows "couldn't check" at once, but the next guess
  waits for that verify's real result (P16);
- a challenge's instance is removed once it unlocks, and all are removed on sign-in; a late strike
  after sign-in is ignored, so nothing re-adds one;
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

// Runs once per Start; Start never refuses, and raising it re-arms the timer.
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
        Start: { target: "self" },
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
import { Auth } from "./auth.operations"; // verifyCode: keyed by challengeId; WrongCode, Expired are "definite"
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
    CodeWrong: {},
    CodeExpired: {},
    CodeUnchecked: Flow.uncertain({}), // the only kind of event unknown / interrupt / defect may target
  },
  memory: {
    challengeId: Flow.initial(Schema.String, ""),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  traits: {
    // One per challenge, at the root, host-owned: strikes and lockouts survive Back (list: open, section 7).
    challenges: Lockout({ limit: LIMIT, length: "5 minutes" }).list({ key: Schema.String, owner: "host" }),
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
  const strikeCurrent = E.challenges.Strike.from(({ memory }) => ({ key: memory.challengeId }));
  const isCurrent = ({ payload, memory }) => payload.key === memory.challengeId || deny("OtherChallenge");
  const forgetIt = E.challenges.Remove.from(({ payload }) => ({ keys: [payload.key] }));

  // Fenced to the VERIFYING activation it starts in (P2). A result after Back goes to `abandoned`,
  // which runs twice (pending, then settled); only a settled WrongCode writes anything.
  const verify = O.Auth.verifyCode.commit(
    ({ memory }) => ({ challengeId: memory.challengeId, code: memory.code.value }),
    {
      // perAttempt: notSent before sending; after sending, unknown at once while the call keeps
      // running. It stays pending (Submit refused) until its real result, which goes to `abandoned`.
      timeout: "15 seconds",
      outcomes: {
        success: E.CodeAccepted,
        failure: { WrongCode: E.CodeWrong, Expired: E.CodeExpired },
        notSent: E.CodeUnchecked,
        unknown: E.CodeUnchecked,
        interrupt: E.CodeUnchecked,
        defect: E.CodeUnchecked,
      },
      abandoned: [
        {
          // Strikes its own challenge, current or not. Add first: a no-op if present.
          guard: [
            ({ state }) => !S.SIGNED_IN.is(state) || deny("SignedIn"),
            ({ payload }) => payload.tag === "WrongCode" || deny("NotWrong"),
          ],
          raise: [
            E.challenges.Add.from(({ payload }) => ({ key: payload.input.challengeId })),
            E.challenges.Strike.from(({ payload }) => ({ key: payload.input.challengeId })),
          ],
        },
        {},
      ],
    },
  );

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
          // Unlocked with zero strikes: the instance is no longer needed.
          onUnlocked: [
            { target: S.TWO_FACTOR.ENTERING, guard: [S.TWO_FACTOR.LOCKED_OUT, isCurrent], updateMemory: () => ({ error: null }), raise: [forgetIt] },
            { target: "self", raise: [forgetIt] },
          ],
        },
      },
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
              raise: [E.challenges.Add.from(({ event }) => ({ key: event.challengeId }))], // reads the event
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
          // On TWO_FACTOR, so the resend is fenced there: moving ENTERING → LOCKED_OUT does not
          // exit its state, and a late lock may move an idle user (rule 6).
          Resend: {
            target: "self",
            guard: [
              ({ state }) => !S.TWO_FACTOR.VERIFYING.is(state) || deny("Checking"),
              ({ schedules }) => schedules.resendCooldown.done === undefined || deny("CoolingDown"),
            ],
            actions: [O.Auth.resendCode.commit(({ memory }) => ({ challengeId: memory.challengeId }))],
            raise: [E.resendCooldown.Start],
          },
        },
        states: {
          ENTERING: {
            on: {
              Submit: {
                target: S.TWO_FACTOR.VERIFYING,
                guard: [
                  ({ memory }) => memory.code.error ?? true, // forwards the field's own reason, e.g. CodeFormat
                  ({ memory }) => strikesOf(memory, memory.challengeId) < LIMIT || deny("NoTriesLeft"),
                  (g) => !O.Auth.verifyCode.pending(g, { challengeId: g.memory.challengeId }) || deny("StillChecking"),
                ],
                updateMemory: () => ({ error: null }),
                actions: [verify],
              },
            },
          },
          VERIFYING: {
            on: {
              CodeAccepted: {
                target: S.SIGNED_IN,
                raise: [E.challenges.Remove.from(({ memory }) => ({ keys: memory.challenges.map((c) => c.key) }))],
              },
              CodeWrong: [
                {
                  target: S.TWO_FACTOR.LOCKED_OUT,
                  guard: ({ memory }) => strikesOf(memory, memory.challengeId) + 1 >= LIMIT || deny("TriesLeft"),
                  updateMemory: () => ({ error: null }),
                  raise: [E.code.Reset, strikeCurrent],
                },
                {
                  target: S.TWO_FACTOR.ENTERING,
                  updateMemory: ({ memory }) => ({
                    error: `Wrong code, ${LIMIT - strikesOf(memory, memory.challengeId) - 1} tries left`,
                  }),
                  raise: [E.code.Reset, strikeCurrent],
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

**A late third strike.** It arrives through `abandoned`:

- If the user is entering that challenge's code, `onLocked` moves them from an idle ENTERING to
  LOCKED_OUT. ENTERING holds no outstanding fenced commit, so rule 6 allows the move.
- If they are elsewhere, the lock simply runs. The next `PasswordAccepted` for that challenge finds
  three strikes and goes straight to LOCKED_OUT.

**Lists and incarnations.** Strikes for a challenge the user has left stay in its instance until it
unlocks. A late strike for a removed challenge re-adds it (`Add` first), as a new incarnation.

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
    S.TWO_FACTOR.LOCKED_OUT.is(s) ? s.schedules.challenges.key(s.memory.challengeId)?.timer.done?.dueAt : undefined,
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
      {/* signIn.send(E.challenges.Remove({ keys: ["c1"] })) ← type error: a host-owned list */}
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

### 3.2 A subroutine with exits, history, drafts and a commit retry

The signup wizard's discard dialog is `Confirm`, a subroutine without states. Keep returns to
whichever page Cancel came from, **with its fields**:

- history restores the page;
- the fields live at the root, the highest node whose lifetime matches the drafts (the whole
  signup), so leaving the wizard for the dialog does not touch them. No `.resumable()` is needed.

Submitting retries `Busy` three times at 1 s, 2 s and 4 s, and never retries an uncertain outcome.

```ts
// imports: Flow, subroutine from "flow-state"; Schedule, Schema from "effect"
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
  "SUBMITTING", "UNSURE", "DONE", "CANCELLED",
],
internalEvents: { Created: {}, EmailTaken: {}, Busy: {}, Retrying: { n: Schema.Int }, Unsure: Flow.uncertain({}) },
traits: {
  // The root: drafts live for the whole signup, across pages and the discard dialog.
  email: Field(Schema.String, { validate: isEmail }), // isEmail = (v) => v.includes("@") || deny("NotAnEmail"), and so on
  password: Field(Schema.String, { validate: longEnough }),
  name: Field(Schema.String, { validate: required }),
  role: Field(Role, { validate: chosen }),
},

// signup.machine.ts (excerpt)
const create = O.Accounts.create.commit(reviewedFields, {
  retry: { on: ["Busy"], schedule: Schedule.exponential("1 second").pipe(Schedule.recurs(3)) }, // Busy is "definite"
  outcomes: {
    success: E.Created,
    failure: { EmailTaken: E.EmailTaken, Busy: E.Busy }, // Busy arrives only after the last retry
    retrying: E.Retrying.from(({ retry }) => ({ n: retry })), // value { retry, error }
    notSent: E.Unsure, unknown: E.Unsure, interrupt: E.Unsure, defect: E.Unsure,
  },
});

WIZARD: { default: S.WIZARD.ACCOUNT, on: { Cancel: S.CANCELLING }, states: { /* pages; REVIEW's Submit runs create */ } },
CANCELLING: { exits: { Confirmed: S.CANCELLED, Declined: S.WIZARD.history } },
SUBMITTING: {
  // Cancel is Unhandled here. Every outcome is handled unguarded (rule 8).
  on: {
    Created: S.DONE,
    Retrying: { target: "self", updateMemory: ({ event }) => ({ busyRetries: event.n }) },
    Busy: { target: S.WIZARD.REVIEW, updateMemory: () => ({ error: "Try again later" }) },
    EmailTaken: { target: S.WIZARD.ACCOUNT, updateMemory: () => ({ error: "That email is registered" }) },
    Unsure: S.UNSURE,
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
subroutine can take `Confirmed`. Every retry is the same Attempt, with the input `create` was
admitted with (P15).

### 3.3 A list of Field instances (open)

The invite page holds up to five email fields. An empty entry is valid and is dropped on Next. Rows
can be added and removed only on the Invite page.

```ts
// signup.definition.ts (excerpt)
traits: {
  invites: Field(Schema.String, { validate: optionalEmail }).list({ max: 5 }), // "" or contains "@" (list: open, section 7)
},

// signup.machine.ts (excerpt)
const onInvitePage = Signup.guard(({ state }) => S.WIZARD.INVITE.is(state) || deny("NotOnInvitePage"));
traits: {
  invites: { input: () => ({ value: "" }), guards: { canAdd: onInvitePage, canRemove: onInvitePage } },
},
INVITE: {
  on: {
    Next: {
      target: S.WIZARD.REVIEW,
      guard: ({ memory }) => memory.invites.every((f) => f.error === null) || deny("InvitesInvalid"),
      raise: [
        E.invites.Remove.from(({ memory }) => ({
          keys: memory.invites.filter((f) => f.value === "").map((f) => f.key),
        })),
      ],
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
    <button onClick={() => signup.send(E.invites.Remove({ keys: [f.key] }))}>Remove</button>
  </div>
))}
<button disabled={!canAdd} onClick={() => signup.send(E.invites.Add())}>Add</button>

// signup.story.ts (excerpt): minted keys are deterministic in Stories
.send(E.invites.Add()).send(E.invites.key("invites#1").Changed({ value: "grace@example.com" }))
```

A keystroke sent for a row removed a moment earlier is `Unhandled`. A late delivery for a removed
row is dropped with evidence, even if the key was added again (rule 9).

### 3.4 Resetting with `resetOn`, and the pin commit

On the issue list:

- The page goes back to 1 when the search, sort or status changes.
- The checked rows (the `checked` trait, a `Selection`) clear whenever any of them changes, the
  page included.

Both resets read the source-updated memory. So the applied search is set by a host transition, the
source of its turn, rather than by a callback.

```ts
// issuelist.machine.ts (excerpt)
const listQuery = ({ memory }: { memory: Memory }) => ({
  search: memory.appliedSearch,
  sort: memory.sort,
  status: memory.status,
  page: memory.pager.page,
});

const pin = O.Issues.setPinned.commit(({ event }) => ({ id: event.id, pinned: event.pinned }), {
  optimistic: [O.Issues.list.setData(({ memory, event }) => ({ key: listQuery({ memory }), data: pinRow(event) }))],
  revertOnUnknown: true, // the row reverts at once; the entry is still invalidated and refetched
  outcomes: {
    failure: E.PinFailed.from((_, { input }) => ({ id: input.id })), // (value, { input, attempt })
    notSent: E.PinFailed.from((_, { input }) => ({ id: input.id })),
    unknown: E.PinUnsure.from((_, { input }) => ({ id: input.id })),
    interrupt: E.PinUnsure.from((_, { input }) => ({ id: input.id })),
    defect: E.PinUnsure.from((_, { input }) => ({ id: input.id })),
  },
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
  Pin: { target: "self", guard: (g) => !O.Issues.setPinned.pending(g, { id: g.event.id }) || deny("PinInFlight"), actions: [pin] },
  // Select all on this page: the ids come from the pre-turn snapshot, never from the click.
  SelectPage: {
    target: "self",
    raise: [E.checked.SelectAll.from(({ activities }) => ({
      ids: activities.issues?.data?.items.map((i) => i.id) ?? [],
    }))],
  },
},
```

The pin commit starts on a root `"self"` transition, so it is fenced to the root and lives as long as
the actor. Its outcomes arrive at the root handlers even while the actor is inside the `HOLDING`
subroutine (rule 6).

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
    onLeave: [callbacks.onDraft.from(({ memory }) => ({ address: memory.address }))], // not on Done
  }),
);

// host machine (excerpt): the draft seeds the next entry
ADDRESS: {
  input: ({ memory }) => ({ address: memory.addressDraft }),
  callbacks: { onDraft: { updateMemory: ({ payload }) => ({ addressDraft: payload.address }) } },
  exits: { Done: { target: S.PAYMENT, updateMemory: ({ payload }) => ({ address: payload.address, addressDraft: null }) } },
},
```

`SignOut` must not write `addressDraft` itself, because `onLeave`'s filling writes it in the same
turn (rule 6).

### 3.6 Keywords

| Kind | Words |
| --- | --- |
| **New, fragments (21)** | `trait`, `subroutine`, `traits` (root and node), `Flow.state`, `.resumable()`, `.list` (open: `max`, `key`, `owner`), `.key(k)`, `Add` / `Remove` / `canAdd` / `canRemove`, `hostEvents`, `guards`, `callbacks`, `exits` (declarations and fillings), `notify`, the `Flow` module (`Flow.Guard`, `Flow.Callback`, `Flow.Exit`, `Flow.optional`, `Flow.uncertain`, `Flow.annotate`, `Flow.input`, `Flow.initial`, `Flow.private`, `Flow.Denial`), `raise`, `resetOn`, `onLeave`, the definition's `handler` / `guard`, state tokens in guard arrays, `story.machine(fragment)` with `.enter` / `.leave` / `run.calls` / `checkpoint.exit` |
| **New, plans (18)** | `abandoned` (payload `outcome`, `tag`, `definite`, `value`, `input`, `attempt`), `notSent`, `.pending`, `retry` (`on`, `schedule`), `retrying`, the mapper's `{ input, attempt }`, `revertOnUnknown`, `timeout` (`perAttempt`, `total`), `failureKinds` (`"definite"` / `"uncertain"`), `orphaned`, `.history` (and `.history.child`), `armOn`, `s.schedules`, `dueAt`, and the `model()` options `invariants` and `hot` |
| **New concepts, not words** | **incarnation** (one life of a fragment instance), **frozen** (a resumable trait while its node is inactive), **summary** (a contract's inferred per-alternative effects), **source-updated memory** (pre-turn memory plus the source's patch), **late turn** (rule 6), pending reset |
| **Existing** | `definition`, `machine`, `states`, `default`, `events`, `internalEvents`, `input` (caller side only: `ensure`, `useActor`, a host's filling), `memory`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`, `restartOn`, `outcomes`, `optimistic`, `setData`, `deny`, `check`, `model`, `S`, `E`, `O`, `.from`, `payload` |
| **Author-chosen** | every other name (`Field`, `Lockout`, `challenges`, `LOCKED_OUT`, `canEdit`, `onLocked`, …) |

## 4. Against the problems in principles.md

| Problem | Answer |
| --- | --- |
| **L1** stale timers, **T2** schedule traps | Prevented. Schedules stop with their incarnation. Arming ids drop firings from before a re-arm (P11). `armOn` replaces counter idioms. The `restartOn` baseline is the activating turn's memory (P8). |
| **L2** late results | Prevented. Host commits are fenced to the activation they start in (P2). List deliveries are fenced to their instance's incarnation (rule 9). |
| **L3** leftover memory | Prevented by placement and incarnations. `.resumable()` is an explicit opt-in to carry data back. |
| **L4** no way out | Prevented. The host may always leave a subroutine's state (rule 6). A hot state reachable with nothing pending is a `flow check` error (T1). |
| **L5** abandoned effects | Prevented. A late result, including one after leaving or a timeout, goes to `abandoned` with its Attempt (P10, P16). `abandoned` may reconcile or compensate (P20). |
| **L6** silent admission, **L8** phantom replies | Prevented. A call never sent answers `notSent` (P9). Outstanding calls are readable (P3). A delivery into a dead incarnation is dropped with evidence. |
| **L7** departure gap | Allowed. Refusing a new submit while an abandoned one is pending is host code (`.pending`, as the sign-in does). |
| **E1** broken invariants, **E4** refusal by forwarding | Prevented. Refusal happens only at declared guards, and deliveries cannot be refused (rule 8). |
| **E2** interfaces growing with depth | Prevented, for types and for checks. Hosts are checked against contract summaries only (rule 10). |
| **E3** hidden endings | Prevented. Only exits leave a subroutine. Callbacks never leave their node. |
| **E5** preempting observers | Prevented. A late turn, including one sourced by a compensating commit's outcome, cannot exit live work, and each handler's last alternative cannot move (rule 6). |
| **H1** bypassed policy | Allowed, by design. Host-owned facts are `hostEvents`, and host-owned lists are `owner: "host"`. |
| **H2** unforeseen checks | Allowed, by choice: declare the guard in the fragment. |
| **H3** faked results | Prevented. Exits are never sendable. `internalEvents` come only from the fragment's own schedules. |
| **H4** mislabelled results | Prevented. `unknown`, `interrupt`, `defect` and uncertain failure tags reach only `uncertain` events (P9, P14). |
| **H5** interrupt treated as not sent | Prevented for commit retries: only definite tags retry (P14). In host code, resending from an `uncertain` handler is a convention. |
| **D1** drifting copies | Prevented. Fragment memory, resumable slices and schedule deadlines are readable, so nothing is copied. |
| **D2** live values on retry | Prevented for commit retries: one Attempt, the admitted input (P15). |
| **D3** feedback loops | Not applicable: fragments do no I/O. |
| **D4** unmapped outcomes | Allowed. An unmapped outcome publishes an issue; `uncertain` only types the right target. |
| **D5** restore in flight | Prevented. Fenced commits restore with their activation (P12). Attempts survive a version change through `orphaned`, at least once (P19). Saved-state compatibility Stories are left out (section 6). |
| **D6** same-turn seeding | Prevented. `input` and `resetOn` read the source-updated memory (2.5). A mapper that reads a key its own turn writes is a warning. |
| **D7** drafts lost | Prevented where the fragment declares `onLeave`, or the trait is placed high enough, or with `.resumable()`. Otherwise it is a convention. |
| **A1, A2** forwarding, scattered blocks | One filling block per instance. A view sends at the instance path, so nothing is forwarded. |
| **A3** conditional rules, **A4** overloaded words | Avoided. Each kind has its own rules, and every new word is listed. |
| **A5** I/O inside fragments | Prevented (rule 3). |
| **A6** silence discovered late | By the fragment author's choice. Required ports are type errors; optional guards are an info finding. Dead exits and unused host events are warnings (T2). |
| **A7** forgotten first send | Not applicable: the host starts every operation on its own transition. |
| **T1** partial turns | Prevented by the turn algorithm (2.5): one selection, no fallthrough on a child's refusal. |

## 5. Plan amendments

Each row names the plan outcome, the rule, and the sentence it replaces or adds. Draft syntax is in
sections 2 and 3.

### For fragments

| Plan | Rule | Replaces or adds |
| --- | --- | --- |
| **Machines O1** | Definitions gain `traits` (the root's `traits`, and `Flow.state(children | {} | Sub, { traits })` on a node; `.resumable()`; `.list` open) and fragment states. Fillings sit at the node where a fragment is placed. A fragment declares what a definition declares (`id`, `events`, `internalEvents`, `memory`, child `traits` / `states`) plus `hostEvents`, `guards`, `callbacks` and `exits` at the top level, its body's `onLeave`, and an inferred summary. Machines gain one filling block per instance. Names share one namespace | Adds to "A definition requires id, states and events." |
| **Machines O1** | An internal event may be marked `Flow.uncertain(fields)`; an event payload may be a `Schema.Struct` with checks, refused at admission when a check fails | Adds to "events and optional internalEvents are records…" |
| **Package O1** | The root route exports `Flow` (with `Flow.Guard`, `Flow.Callback`, `Flow.Exit`, `Flow.optional`, `Flow.uncertain`, `Flow.annotate`, `Flow.input`, `Flow.initial`, `Flow.private`, `Flow.Denial`, the `Flow.is*` predicates and the `Flow.Payload` / `Flow.Filling` types) | Adds to the flow-state route's name list |
| **Machines O1** | Memory fields carry `Flow.input` (supplied by the creator; the `Input` type is derived from them), `Flow.initial` (a constant or a pure computed start) and `Flow.private`. Every field starts from exactly one source. The top-level `input` and `initial` are removed | Replaces "Optional input and memory are Schema field records. Nonempty memory requires initial({ input })…" |
| **Machines O8**, **React O4** | Outside snapshot and view types omit `Flow.private` fields; Stories and Inspection still see them | Adds |
| **React O2** | The pure starting snapshot uses the memory built from `Flow.input`, `Flow.initial` and computed initials | Replaces "initial(input) memory" |
| **Machines O1** | `operations` may group operation handles one level deep | Replaces "a flat record of operation or entity-domain handles" with "…or one-level groups of operation handles" |
| **Machines O1** | A definition's `handler(path, h)` / `guard(path?, g)` type shared code as if written at `path`; a commit is typed at each transition that runs it | Adds |
| **Machines O2** | A subroutine state is entered at its default, or is a leaf. It is left by an exit, or abandoned by a transition that exits it; host events fall through to ancestors as usual. Exits are targets only fragments take | Adds to "target is required and is this machine's token or "self"" |
| **Machines O2** | `token.is` accepts a snapshot or a state path. A state token may be an element of a guard array, and passes when the pre-turn state is at or below it | Replaces "token.is(snapshot) includes descendants" with "token.is(snapshot or state)…" |
| **Machines O3** | **The turn algorithm of section 2.5 is normative**, for the runtime and `check()`. All-declining still falls through to ancestors (O2); a child's refusal inside a selected alternative never does | Replaces the prose from "An accepted transition computes updateMemory before action parameters" to "One invalid action rejects the whole turn" with the algorithm, keeping its defect rules |
| **Machines O4** | Guards also receive `schedules` and may call `.pending`. `check()` runs steps 2–6 of the turn. `deny(code, context?)` returns plain data matching `Flow.Denial`, so it may be stored in memory, and a guard may return a stored denial | Replaces "A guard receives { event, state, memory, context, activities }" with the same list plus `schedules`; adds the last sentence |
| **Machines O8** | The snapshot exposes fragment slices (`undefined` while inactive, present while frozen), keyed list instances, and `schedules` | Replaces "It has no input, methods, timers or public revision" with "…no input, methods or public revision; armed schedules appear under `schedules`" |
| **Persistence O2** | Resumable slices, frozen schedules and list incarnations persist with the actor | Adds to "Actor state, memory … survive reload" |
| **Testing O1** | `story.machine` also accepts a fragment (`.enter`, `.leave`, `run.calls`, `checkpoint.exit`, host-event sends). `send` runs its turn; `process()` drains operation work and due timers. Minted keys and incarnations are deterministic | Adds to "story.machine(machine, { … }) tests one fresh actor" |
| **Inspection O1** | Fragments, list instances, incarnations, fused transitions and contract summaries appear under their instance names | Adds |
| **CommandLine O5** | Errors: rule 12's list. Warnings: overlaps only closures separate; history targets over non-resumable fragments; a mapper reading a key its own turn writes (from Story traces). Info: unfilled optional guards | Adds |

### For every machine: turns, history, timers

| # | Plan | Rule | Replaces or adds |
| --- | --- | --- | --- |
| P1 | Operations O2 | One mapper form, `(value, { input, attempt })`. For `retrying`, the value is `{ retry, error }` | Replaces "Mappers receive values only." |
| P2 | Operations O2, Machines O6 | A host commit is **fenced** to the activation of the state its starting transition enters. For `"self"`, that is the handler's own state, so a root `"self"` commit lives as long as the actor. Outcome handlers must sit inside that state. A late result goes to `abandoned`, or is dropped with evidence | Replaces "State exit does not cancel finite work; its event reaches the actor's later state." **Breaking:** the reference editor's after-Close save moves to the save's `abandoned` (`payload.value`) |
| P3 | Operations O3, Machines O4 | `O.x.pending(snapshotOrGuardInput, key)` reads whether a call is outstanding, in the pre-turn snapshot. A call is pending from admission until its real settlement (a timeout does not end it, P16), an explicit cancel (P17), or the settlement of a `retry(attempt)` that resolves its Attempt | Adds |
| P4 | Operations O3 | A commit call may declare `retry: { on: [definite tags], schedule }`. It never retries `unknown`, `interrupt`, `defect`, `notSent` or uncertain tags. Each scheduled retry reports `retrying` before the wait; when retries run out, the last failure is the ordinary `failure`. Leaving the fenced state cancels a retry not yet invoked (`notSent` to `abandoned`) | Replaces "Flow promises no remote rollback and never retries automatically" with "…never retries automatically unless the commit declares `retry`." This **reverses** that sentence |
| P5 | Machines O2, Persistence O2 | `S.X.history` targets X's last active child, or its default. `S.X.history.child(s)` reads it. It restores control only; data comes back only through `keep` | Adds |
| P6 | Machines O5, O8 | Armed schedules expose `dueAt` at the paths of 2.1 | See Machines O8 |
| P7 | Machines O5 | `armOn: [events]` arms on any accepted event on it, raised ones included; a schedule with `armOn` is idle on entry. Every temporal construct is delayed: it never counts the turn that arms it | Replaces "Entry arms a schedule; exit cancels it" with "Entry arms a schedule without `armOn`; exit cancels any" |
| P8 | Machines O5 | The `restartOn` baseline is the activating turn's committed memory | Clarifies "restartOn … establishes a silent baseline" |
| P9 | Operations O3, Machines O6, Persistence O6 | `unknown`, `interrupt` and `defect` target only `uncertain` events. A call never invoked answers `notSent` | Replaces the `reject` and "ends it as interrupt" sentences; adds `notSent` to the outcome list |
| P10 | Operations O3, Machines O3 | `abandoned` receives `{ outcome, tag?, value?, input, attempt }`. It is an `on`-style handler without `target`, ending unguarded. It writes host memory, may raise into root traits, and may run actions (P20). It runs twice: `"pending"` fused into the leaving turn, then on settlement. Each run must be correct alone | Adds a turn source |
| P11 | Machines O5 | Each arming has an id; a firing from an earlier arming is never delivered | Extends "if its declaring activation ended before handling, it is discarded" |
| P12 | Persistence O6 | A fenced commit restores with its activation, in P10's shape; if the activation was not restored, the result goes to `abandoned` | Extends "A crash after acknowledgment restores unknown carrying the same Attempt…" |
| P13 | Operations O3, O5 | `optimistic` is a list of `setData` writes. `revertOnUnknown: true` removes them at once on `unknown`, and still invalidates and refetches | Adds an exception to "unknown retains them and invalidates the entry" |
| P21 | Runtime O4, Machines O7 | The mailbox is FIFO in admission order. User sends, outcomes, timer firings, `onContext` events and deliveries queue together. Equal deadlines are separate turns | Adds the queue order to Runtime O4's input ordering |

### For every machine: commits, hardened

```ts
// accounts.operations.ts (excerpt)
export const charge = transaction({
  id: "Payments.charge",
  commit: chargeCard,
  concurrency: "reject",
  failureKinds: { CardDeclined: "definite", Busy: "definite", Gateway: "uncertain" }, // every tag classified
  orphaned: ({ attempt, retry }) => retry(attempt), // in-flight across a version change (P19)
});
// refund: concurrency "serialize", never "reject", so a second abandoned run is queued, not notSent.

// A saga step: charge, then reserve; if the reservation is abandoned after the charge, refund.
const refund = O.Payments.refund.commit(({ payload }) => ({ chargeId: payload.value.chargeId }), {
  retry: { on: ["Busy"], schedule: Schedule.spaced("30 seconds") }, // unbounded: it must happen
  outcomes: { success: E.Refunded, failure: { Rejected: E.RefundFailed }, unknown: E.RefundUnsure, … },
});
const pay = O.Payments.charge.commit(select, {
  timeout: "20 seconds",
  outcomes: { … },
  abandoned: [
    { guard: ({ payload }) => payload.outcome === "success" || deny("NotCharged"), actions: [refund] },
    // Not known to be charged: reconcile the same Attempt, never a fresh charge.
    { guard: ({ payload }) => payload.definite === false || deny("Definite"), actions: [O.Payments.charge.retry(({ payload }) => payload.attempt)] },
    {},
  ],
});
// The refund's outcomes start a late turn (rule 6): handled at the root, they may not move a busy user.
```

| # | Plan | Rule | Replaces or adds |
| --- | --- | --- | --- |
| P14 | Operations O1, O3 | A transaction declares `failureKinds`, classing every tag as `"definite"` (proves no effect) or `"uncertain"`. `retry.on` accepts only definite tags (a type error otherwise). Uncertain tags target only `uncertain` events. `abandoned`'s payload carries `definite` for failures | Adds to Operations O1's `transaction({ … })` options |
| P15 | Operations O3, Persistence O6 | All retries of a commit are **one Attempt** (same id, same input). The adapter receives the invocation ordinal `n`. Each invocation is acknowledged before it runs. A restore between retries restores as the last failure; after an acknowledged invocation, as `unknown`. A server that caches definite failures by key may get a per-invocation key derived from `(id, n)` | Adds to P4 and to "A persisted actor's remote commit cannot invoke its adapter until storage acknowledges its Attempt" |
| P16 | Operations O3, P3 | A commit may declare `timeout`: a duration (per attempt) or `{ perAttempt, total }`. **A timeout stops waiting, not the call.** Expiry before invocation answers `notSent`. After invocation it answers `unknown` (reason `Timeout`) at once, does **not** interrupt the adapter, and the call stays `.pending` until its real settlement, which goes once to `abandoned`. A timed-out attempt is uncertain, so it is never retried | Adds |
| P17 | Operations O3, O7 | **An explicit cancel interrupts.** After invocation it answers `unknown`, which is final: no later settlement is delivered, and `.pending` becomes false. A commit therefore delivers one in-state outcome, and at most one `abandoned` settlement (when its state was left, or it timed out) | Replaces "Every invoked commit delivers exactly one outcome" with that sentence, and keeps "after invocation it reports unknown and blocks late results" for cancel only |
| P19 | Persistence O5 | On `RestoreDiscarded`, acknowledged Attempts that are unsettled, or settled but undelivered, survive in a version-independent record. After ready, each goes to its descriptor's `orphaned` handler (which may `retry` or invalidate), or else surfaces as an issue. Delivery is at least once, so the adapter must be idempotent. Input that no longer decodes under the new Schema is an issue, not a retry. An orphaned retry has no actor: its outcome is evidence only | Adds to O5's version-change rule |
| P20 | Operations O3 | `abandoned` may list `actions`. A commit started there is fenced to the root, as a root `"self"` commit is. Its outcomes start late turns (rule 6). **Saga recipe:** in `abandoned`, compensate a success with a commit that retries every definite tag on an unbounded schedule, with `serialize` concurrency; reconcile `unknown` and uncertain tags with `retry(attempt)` | Adds to P10 |

### For tooling

| # | Plan | Rule | Replaces or adds |
| --- | --- | --- | --- |
| T1 | Testing O5 | **Systematic exploration in `model()`.** While a fenced commit is outstanding on a path, each declared outcome (from fixture samples) is a candidate event, and so is each armed schedule's firing. **Default oracle:** rules 6, 8 and 12, P2, and author `invariants: (snapshot) => true \| deny(…)`. `model(base, { stateKey, invariants, hot: [S.TWO_FACTOR.VERIFYING] })`: a quiet path in a **hot** state is a liveness failure, and `flow check` errors on a hot state reachable with nothing pending (it reads the same option). Schedules are explored delay-bounded (default 1–2), and counterexamples are Stories | Adds `invariants`, `hot` and a `check` mode to "model(baseStory, { stateKey })" |
| T2 | CommandLine O5 | Warnings: an exit no reachable transition takes; a `hostEvent` no host raises; a public fragment event unhandled everywhere; a subroutine whose exits are unreachable from its default. `flow stories --coverage` lists transitions, exits, callbacks and delivery handlers no Story reaches | Adds to the warning list |
| T3 | CommandLine O5 | Warn when `send(ref, E.X)` can reach a state of the target actor where X is Unhandled. There is no silencing keyword; warnings never fail the check | Sharpens "unhandled events" |
| T4 | CommandLine O5 | A lint rule with an autofix orders the category keys of definitions, fragments, machine bodies, fillings, transitions and commit options (section 2.6). It never reorders entries inside a record, whose order carries meaning | Adds |

## 6. Deliberately left out

**Not in v4's model:**

- **Fragment I/O** (`requests`, `CommitWithRetry`). Retry policy, fencing, timeouts and
  uncertainty belong to the commit, for every machine. The cost: an unmapped outcome only
  publishes an issue (D4), and a host handler can still resend from an `uncertain` event.
- **Nested request relays.** These follow from the above.
- **Parallel regions in the host, deferred events, queued microsteps, statechart inheritance and
  general eventless transitions.** No prior-art note recommends them for Flow State.
- **Combinable memory keys** (`combine(append)`), Esterel-style. Disjoint keys stay, and the
  workaround is one callback per key.
- **`resetOn` deviates from the synchronous note (R2).** The note offers pre-turn reads, or
  post-update reads with static rejection. v4 reads the source-updated memory, the same view as
  `input`. Cycles cannot be written, but a key written by a callback or exit filling resets in an
  immediate follow-up turn (a pending reset), so exactly one published snapshot shows the old
  incarnation. Keys that drive resets belong in source transitions, as the issue list's settle is.

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
  traits only. The sign-in avoids the gap with a keyed list; host keys elsewhere are still reset by
  hand (modal R2).
- **Data-conditioned leaving** (`while: { select, event }`), which enqueues an event when a lane
  selection turns false (modal R7).
- **Saved-state compatibility Stories** (`story.restore(fixture)`), the analogue of Temporal's
  replay test. They matter more now that `orphaned` makes version changes first-class (durable R8).
- **`idempotency` windows and their gating, deferred.** The durable note's R1 gating is:
  - `retry(attempt)` needs `{ unsafe: true }` without a declared window;
  - `retry.on` may include `unknown` with one;
  - an Attempt `createdAt` lets an expired `retry(attempt)` answer **`unknown`** (reason
    `IdempotencyExpired`), never `notSent`, which proves no write;
  - the window should be compared with a margin, since the client clock is not the server's.

  This moves together with author-derived idempotency keys and completion through another channel
  (durable R7, R9).

## 7. Open

0. **Dynamic collections.** A changing number of copies of the same behaviour inside one actor (rule
   9, `.list`) is open and will be designed separately, from its requirements (a changing count,
   each copy with its own traits and timers, one turn with the host, stable identity, static
   analysis) and prior art (Ceu pools, SCADE iterators, React keyed children). Candidates so far:
   `id` instead of `key`; membership changed only by the host's own events, removing `owner` and
   `canAdd` / `canRemove`. Rejected: one actor per item, which brings back machine-spawned child
   actors and leaves single-turn composition.
1. **Summaries in types.** Can the contract summary (rule 10) be inferred into TypeScript types
   cheaply enough, or does it live only in `flow check` metadata?
2. **`.resumable()` and `resetOn` together.** A resumable trait resets on return when its value differs. Is
   comparing against the frozen value the right baseline, or should leaving reset it?
3. **Exploration cost.** Does `stateKey` need outstanding-commit and armed-timer identity by
   default, for T1 to explore enough?
4. **Declaration order in types.** TypeScript does not order object-literal keys reliably, so
   "earlier traits" for `resetOn` may need tuple placement or a builder (the type spike).
5. **Names.** `trait`, `subroutine`, `hostEvents`, `resetOn`, `Flow`, `Flow.state`, `.key`, `owner`, `.resumable()`,
   `onLeave`, `failureKinds`.

## Changes from v3

Notes: [synchronous](prior-art/synchronous-languages.md), [statechart](prior-art/statechart-languages.md), [durable](prior-art/durable-workflows.md), [modal](prior-art/modal-models-p-behavior-trees.md), [v3-amended-correctness](comparison/reviews/v3-amended-correctness.md).

- One normative turn algorithm (2.5), with incarnations for fragments entered, added or reset in the same turn (synchronous R3; statechart R1).
- `resetOn` reads the source-updated memory once, in declaration order, so cycles cannot be written; it resets before parts react (synchronous R1, R2).
- `flow check` checks hosts against contract summaries, not bodies (synchronous R4).
- A child's refusal refuses the turn; the host never falls through to its next alternative (synchronous R8).
- A read-after-write lint for mappers and selects (synchronous R5).
- The mailbox is FIFO, stated in Runtime and Machines (P21) (statechart R7).
- History restores control, not data, with a warning over unkept fragments (synchronous R7).
- Pruning reads only state-token elements of guard arrays; "outstanding in the pre-turn snapshot" (v3-amended-correctness n1, n2).
- `onLeave`: a leave hook that cannot refuse or move, fused into the leaving turn (synchronous R6; statechart R2; modal R6).
- List incarnations: a delivery into a dead incarnation is dropped with evidence (modal R1).
- `keep` on `.at`: frozen data with kept deadlines; signup pages use it with history (modal R2).
- Sign-in: a host-owned `Lockout` list keyed by challenge replaces `wrongAttempts` and `lockedChallenge` (modal R2).
- Failure tags are declared definite or uncertain; only definite tags retry (P14) (durable R1).
- All retries are one Attempt, acknowledged before each invocation (P15) (durable R2).
- A timeout stops waiting but keeps listening, so its real result reaches `abandoned`; an explicit cancel interrupts (P16, P17) (durable R3, R4).
- `orphaned` keeps in-flight Attempts across a version change (P19) (durable R5).
- `abandoned` may start a compensating commit, and the saga recipe is documented (P20) (durable R6).
- `model()` explores outstanding outcomes and armed timers, with `invariants` and `hot` options (T1) (modal R3).
- New `flow check` findings and Story coverage (T2) (statechart R6).
- A warning on unhandled cross-actor sends (T3) (modal R4).
- Stateful traits, read ports, named entries and history extensions are listed as pending decisions (modal R5; statechart R3–R5).

## Changes after review

From [reviews/v4-correctness.md](reviews/v4-correctness.md) and [reviews/v4-principles.md](reviews/v4-principles.md):

- Turn (2.5): parts selected before seeding (M1); initial memory before patches, so Add-then-Strike keeps the strike (M2); all-declining falls through to ancestors (M8); a "what reads what" table; `check()` runs steps 2–6; `onLeave` and pending runs after the walk; reset incarnations arm entry timers; pending resets (m2, m3).
- Dead incarnations drop only their own parts; the host's handling commits (M3).
- Summaries record per-alternative effects, timer chains and `onLeave` (M4).
- A timeout stops waiting, not the call, and `.pending` holds until the real settlement; an explicit cancel interrupts (M5, m13).
- `IdempotencyExpired` would be `unknown`, never `notSent`; the `idempotency` window is deferred with its gating (M6).
- Rule 6 covers late turns sourced by compensating commits (M7).
- Minors: `onLeave` not queued (m1); `keep` edge cases (m5); history warning for waiting states (m6); host raise into an absent key refuses (m7); saga reconciles and serializes (m8); per-invocation keys (m9); `orphaned` at least once (m10); sign-in removes unlocked instances and keeps the resend cooldown (m11); `check()` codes (m12).
- Principles: a three-decision summary; `failureKinds`; `hot` in `model()`; `ignore` cut; `onLeave` skips freezing; concepts named; token-first position guards; five items added to "Left out".
- Fix check: pending resets run as an immediate follow-up turn (f1); late turns include commits started in `abandoned`'s pending run (f2); an in-turn re-add wins (f3); sign-in notes on late success, the shared cooldown and late strikes after sign-in.
- Port kinds use one `Flow` module following Effect Schema conventions (`Flow.Guard`, `Flow.Callback`, `Flow.Exit`, `Flow.optional`, `Flow.uncertain`, `Flow.annotate`); ports hold Schema payloads rather than being Schemas; event payloads may carry Schema checks, refused at admission (2.2.1).
- Fragments keep a definition's shape, with `hostEvents`, `guards`, `callbacks` and `exits` as top-level lists named by direction; no grouping block. Memory fields carry `Flow.input`, `Flow.initial` (constant or computed) and `Flow.private`, for fragments and machines, replacing the top-level `input` and `initial`. `Flow` calls are written data-first (2.2.2).
- Placement: `Flow.state(children | {} | Sub, { traits })` on a node replaces `.at("PATH")`; `.resumable()` is a method; fillings sit at the node; signup drafts live at the root; key order, the `Flow` namespace rule and the locality rule are recorded (2.3, 2.6); `.list` is marked open (section 7).
- `.keep()` is renamed `.resumable()`: the trait resumes on return instead of restarting (SCADE 6's resume versus restart).
- `Field(schema, { validate? })` keeps the author's validator. A validator returns `true | deny(code, context?)`, the field stores the denial or null as `Flow.Denial`, and a host guard forwards it (`memory.code.error ?? true`). A Schema check fits inside a validator (`Schema.is`), so `unchecked` and `firstIssue` are gone ([research/field-validation-effect4.md](research/field-validation-effect4.md)).
