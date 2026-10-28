# Prior art: statechart languages and tools

**Status:** research input for [proposal-v3.md](../proposal-v3.md). Not a decision. Rule numbers
refer to proposal-v3 section 2.4 ("rule 7"), plan amendments to its section 5 ("P5"), problems to
[principles.md](../principles.md) section 4 ("D7"). Plan outcomes are cited as in the plans
(Machines O3, Runtime O4).

Systems covered: Harel statecharts and Statemate, UML state machines, SCXML, itemis CREATE
(formerly YAKINDU Statechart Tools), IBM Rhapsody, and XState v5 for contrast.

How sure each claim is: SCXML, itemis CREATE and XState `raise` were checked against the current
primary text during this research (quotes below). UML, Statemate and Rhapsody claims come from the
cited specification and papers as I know them. The Rhapsody PDF could not be fetched (connection
reset), so its section is marked **unverified here** and should be checked before anyone relies on
it.

---

## 1. The systems

### 1.1 Harel statecharts and Statemate

**Composition.** Hierarchy (OR-states), orthogonality (AND-states, parallel regions) and broadcast
communication. One event is seen by every orthogonal component in the same step, so one event can
fire several transitions at once. There is no encapsulated reusable unit in the original formalism.
Reuse is copying, plus Statemate's "generic charts", which are parameterised and instantiated.
([Harel 1987](https://doi.org/10.1016/0167-6423(87)90035-9))

**Execution** ([Harel & Naamad 1996, "The STATEMATE semantics of statecharts"](https://doi.org/10.1145/235321.235322)):

- A **step** takes every enabled, non-conflicting transition at once, one per orthogonal component.
- Every condition and guard in a step reads the values from **before** the step. Assignments and
  generated events take effect **at the end of the step**. An event generated in step _n_ is sensed
  only in step _n+1_ and then disappears.
- Two actions in one step that write the same variable are a **race**. Statemate detects races; it
  does not order them.
- Priority goes to the **outer** transition: the one whose scope is higher in the hierarchy wins.
- There are two time models. In the synchronous model, one step runs per clock tick. In the
  asynchronous model, steps repeat until the system is stable, with no new events and no enabled
  transitions. That chain of steps is a **super-step**, and external input is read only between
  super-steps.
- History: shallow (`H`) and deep (`H*`) connectors. The action language also has
  `history_clear(S)` and `deep_clear(S)` to forget recorded history ([Harel & Politi, _Modeling
  Reactive Systems with Statecharts_, 1998](https://www.wisdom.weizmann.ac.il/~harel/reactive_systems.html)).
- `in(S)` conditions test the current configuration.

**Built to handle:** concurrency within one controller without an explosion of states,
deterministic simulation, and avionics-style analysis: reachability, races and nondeterminism
checks run on the model.

### 1.2 UML state machines (UML 2.5.1, clause 14)

**Composition** ([OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1/)):

- **Submachine states.** A state refers to a whole state machine that is defined once. Each
  reference is a separate instance in the configuration.
- **Connection points.** A submachine declares **entry points** and **exit points**
  (pseudostates). The referencing state binds them through connection point references. An outer
  transition may end at a named entry point, so the submachine is entered somewhere other than its
  initial state. A transition inside may reach a named exit point, which the outer machine continues
  from. This is the established form of "a reusable step with declared endings".
- State machine **redefinition** (inheritance) lets subclasses extend or override regions, states
  and transitions.

**Execution:**

- **Run-to-completion (RTC).** One event occurrence is taken from the **event pool**. A maximal set
  of enabled, non-conflicting transitions fires, and every action completes before the next
  occurrence is dispatched. The pool's dispatch order is a semantic variation point: UML does not
  require FIFO.
- **Priority** goes to the **inner** transition. A transition from a substate takes priority over a
  conflicting transition from any state that contains it. This is the opposite of Statemate.
- **Completion events.** A state completes when its entry and do-activity finish, or when every
  region of a composite reaches a final state. Completing produces a completion event, and
  completion events are dispatched **before** any other pending event. A transition with no trigger
  is a completion transition.
- **Deferred events.** A state may list `deferrableTrigger`s. A matching event that fires no
  transition stays in the pool while a deferring state is active. It is reconsidered once the
  configuration no longer defers it.
- **Local and external transitions.** A transition with `kind=local` to a descendant does not exit
  its source. `external` does.
- Entry and exit behaviours run outermost-first and innermost-first. A do-activity is aborted when
  its state is exited, by whatever transition.
- History: shallow and deep pseudostates, each with an optional default transition used on first
  entry.

**Built to handle:** object behaviour with asynchronous messaging, reuse across a class model, and
code generation by many vendors. That is why the specification has so many semantic variation
points.

### 1.3 SCXML (W3C Recommendation, 2015)

**Composition** ([W3C SCXML](https://www.w3.org/TR/scxml/)):

- Compound and parallel states, `<history type="shallow|deep">`, and `<final>` with `<donedata>`.
- `<invoke>` starts a separate session, which may be another SCXML machine. The session runs
  asynchronously, talks through events tagged with an `invokeid`, and is tied to the lifetime of
  the invoking state.
- There is no in-process submachine reference. Reuse is either a separate invoked session (an
  actor) or copying the XML (`src` inclusion was dropped).

**Execution** (normative algorithm in Appendix D):

- **Two queues.** `<raise>` puts an event on the **internal** queue ("at the rear of the session's
  internal event queue", §4.2). `<send>`, including a send to self, puts one on the **external**
  queue.
- A **microstep** takes one event, or none for eventless transitions, and fires an optimal set of
  enabled transitions. Data changes take effect immediately, so the next microstep's conditions see
  them.
- A **macrostep** repeats microsteps (eventless transitions first, then internal events) until "the
  internal event queue is empty and no transitions are enabled by NULL" (§3.13). Only then is an
  external event read. Non-termination is "currently allowed".
- **Conflict resolution.** The search for transitions "first looks in the most deeply nested active
  state(s)" (§3.1.2). Within a state, the first matching transition in document order wins. Between
  parallel regions, a transition whose source is a descendant preempts. This is child-first, as in
  UML.
- **Eventless transitions** are checked on entry and after every microstep (§3.12.1).
- **Completion.** Entering a `<final>` child generates `done.state.<parent id>` on the internal
  queue, carrying `<donedata>` (§3.7, §5.5).
- **Invoke lifecycle.**
  - Invocations start only **after** a macrostep completes, and only for states still active then
    (§3.13).
  - Exiting the state cancels the invocation.
  - "Once it cancels the invoked session, the Processor MUST ignore any events it receives from that
    session" (§6.4.3).
  - `<finalize>` runs on each returned event, before any transition is selected, to copy data into
    the datamodel.
- **Errors.** A failing executable element stops the rest of its block. `error.execution` goes onto
  the internal queue and the transition is **not** rolled back (§4.9, §3.12.2). A condition that
  fails to evaluate counts as false (§5.9.1).
- **Unmatched events are discarded** (§3.1.2).
- Transition `type` defaults to **external**: a transition to a descendant exits and re-enters its
  source (§3.1.5).
- History has a mandatory default transition, used when the parent was never visited (§3.10).

**Built to handle:** an interoperable XML format and executable semantics for voice and dialog
systems and general control. The pseudocode algorithm exists so that independent implementations
agree.

### 1.4 itemis CREATE (formerly YAKINDU Statechart Tools)

**Composition** ([definition section](https://www.itemis.com/en/yakindu/state-machine/documentation/user-guide/sclang_definition_section?hsLang=en),
[reactions](https://www.itemis.com/en/products/itemis-create/documentation/user-guide/sclang_reactions)):

- **Interface scopes**, named or unnamed, declare:
  - `in event`, raised by the environment;
  - `out event`, raised by the machine and delivered outside;
  - typed `var` (optionally `readonly` to clients, or `const`);
  - `operation`s with typed parameters and a single return type. Client code implements them, and
    the machine calls them synchronously from reactions.
- The **internal scope** declares events and variables that are invisible to clients. Internal
  events "have no direction".
- Named interfaces namespace their members (`ui.next`).
- **Multi-state-machine modelling** (since 4.0, [release notes](https://www.itemis.com/en/yakindu/state-machine/documentation/user-guide/release_notes_4.0.0)):
  a machine declares variables whose type is another statechart. Through them it can raise that
  machine's in events, react to its out events, and read or write its variables. The parent drives
  the child's lifecycle. Children are separate machines with their own queues.
- Named **entry points** and **exit points** on composite states:
  - An entry point has one outgoing transition, and that transition cannot be guarded.
  - Reaching an exit point deactivates the composite.
  - "There must be an unguarded transition that catches the exit."
  - A blank transition (no trigger, no guard) catches every exit.

**Execution:**

- `@EventDriven`, the default, takes one event per RTC step in order of arrival. `@CycleBased`
  processes every event raised since the last `runCycle()` in one step.
- **Local (internal) events** raised in a step "won't have an effect on the current step". They
  are queued, and "local events are guaranteed to be always processed before any other incoming
  event". This is SCXML's internal-queue priority.
- **Priority.** Within a state, transitions follow their written order and the first enabled one
  wins. `@ChildFirstExecution` is the default; `@ParentFirstExecution` reverses it. "Named exit
  points take precedence over the actual transition priority." `else` and `default` come last.
- `@SuperSteps` (off by default) keeps taking transitions while states keep being entered. Active
  events stay active for the whole super-step, so an unguarded self-transition loops forever.
- Final states do not deactivate their composite, and a region has at most one final state.
- Shallow and deep history are supported, with choices whose `else` / `default` guarantees a path.

**Validation and testing:** the editor validates live:

- unique entry and exit point names, and at most one default each;
- one final state per region;
- boolean guards;
- a caught exit;
- unreachable states, and states with no way out.

**SCTUnit** tests a statechart in isolation, with operations mocked and coverage reported. That is
the same idea as v3 rule 11.

**Built to handle:** embedded and HMI code generation (C, C++, Java, Python, TypeScript), where the
host program must call into the machine and be called back in a typed, generated API.

### 1.5 IBM Rhapsody (unverified here)

Source: [Harel & Kugler, "The Rhapsody Semantics of Statecharts (or, On the Executable Core of the UML)", 2004](https://weizmann.ac.il/math/harel/sites/math.harel/files/users/user56/RhapsodySemantics.pdf).
The fetch of this PDF failed, so the points below should be checked against it.

- Reactive classes. Each active thread has one event queue. An object consumes one event per step
  (RTC), and an event that enables no transition is discarded.
- Unlike Statemate, changes made in a step take effect **in the current step**. A step may take
  time.
- Priority goes to **lower** (inner) source states, as in UML.
- **Triggered operations** are synchronous events. The caller blocks while the receiver takes a
  transition, and the transition may return a value.
- **Null transitions** (no trigger) are taken immediately after a step. A configurable maximum
  number of null steps guards against infinite loops at run time.
- Sub-statecharts, and statechart **inheritance** along class generalisation: a subclass's
  statechart may refine its base's.

**Built to handle:** executable object models with generated C++ or Java code. The semantics were
chosen to be cheap to implement in generated code.

### 1.6 XState v5 (contrast)

**Composition:**

- `setup({ types, actions, guards, actors, delays })` declares named implementations with types.
  `machine.provide({...})` "creates a new machine with the same config but with the provided
  implementations" ([actions](https://stately.ai/docs/actions), [setup](https://stately.ai/docs/setup)).
- Reuse of **behaviour with state** goes through **actors**: `invoke` for an actor tied to a state,
  and `spawn` for a dynamic one. Each actor has its own mailbox and talks back through `sendTo`,
  `sendParent` and `onDone` / `onError` ([invoke](https://stately.ai/docs/invoke)).
- There is no in-process submachine and no typed contract for what a child may tell its parent.
- `input` is read once, when the actor is created.

**Execution:**

- `raise` puts an event on an internal queue. "After the current transition is finished, these
  events are processed in insertion order", and "external events are only processed once all events
  in the internal event queue are processed". This is SCXML's macrostep.
- `always` gives eventless transitions ([eventless](https://stately.ai/docs/eventless-transitions)).
- Final states produce `xstate.done.state.<id>` with `output` ([final states](https://stately.ai/docs/final-states)).
- Shallow and deep history ([history](https://stately.ai/docs/history-states)).
- No deferred events.
- An invoked actor stops when its state exits, and events from a stopped child are ignored.
- `snapshot.can(event)` is the analogue of `check()`.
- Transitions are re-entering only with `reenter: true`.
- `@xstate/graph` produces shortest and simple paths through a machine, for model-based tests
  ([graph](https://stately.ai/docs/graph)).

**Built to handle:** UI and application logic in JavaScript, with actor-model composition and
visual tooling.

### 1.7 v3's features beside the six systems

| Concern | v3 | UML | SCXML | itemis CREATE | XState v5 |
| --- | --- | --- | --- | --- | --- |
| Reusable step with endings | subroutine + `exits` | submachine + exit points | invoke (separate session) | composite + exit points; referenced machines | invoked actor + `onDone` |
| Enter not at the default | no | entry points | target a deep state id | named entry points | target a child id |
| Reusable always-on piece | trait (memory, no states) | orthogonal region | parallel state | orthogonal region / referenced machine | spawned actor / parallel |
| Who may send each event | `events` / `hostEvents` / `internalEvents` | none (any) | none | in / out / internal scopes | none (types only) |
| Host policy into the piece | declared `guards` (allow/deny) | none | none | `operation`s (any return type) | `provide` overrides |
| Piece tells host | `callbacks` (fused) | none (events) | events to the parent | out events | `sendParent` / `emit` |
| Raised-event timing | **same step, reads pre-turn** | queued to the pool | internal queue, next microstep, reads new data | internal queue, next RTC step, priority | internal queue, next microstep |
| Priority | child-first, written order | child-first | child-first, document order | child-first (configurable) | child-first |
| Deferral | none (rule 8 totality) | `deferrableTrigger` | none | none | none |
| Completion / eventless | none | completion events | `done.state`, eventless | final states, choice, super-steps | `always`, `done.state` |
| History | shallow, persisted (P5) | shallow, deep, default | shallow, deep, default required | shallow, deep | shallow, deep |
| Late results of left work | fenced; `abandoned` handler (P2, P10) | do-activity aborted | ignored after cancel | n/a | ignored after stop |
| Same-variable writes in one step | construction error / defect (rule 7) | sequential | sequential | sequential | sequential |

---

## 2. Problems Flow State has not considered yet

### 2.1 What a fused turn can see is not fully defined

Statemate reads everything from before the step. SCXML, Rhapsody and XState read everything as it
is after the previous microstep. v3 mixes the two:

- Guards and payload mappers read the **pre-turn** snapshot (rule 7).
- `input` fillers read **after** the activating turn's updates (D6).
- Raises apply **in written order**.
- `resetOn` runs after the updates and raises.
- A raise into an inactive child is an error.

Several orderings are therefore unstated. Von der Beeck's well-known comparison of twenty
statechart variants (1994, _A comparison of Statecharts variants_, FTRTFT, LNCS 863) found that this
exact family of questions is where dialects disagree.

**Failure scenarios in Flow State terms:**

- **Add then Start.** Section 3.1's `lock` raises `E.lockouts.Add({key})` and then
  `E.lockouts.Start({key})` in one turn. Start's handler lookup must see the instance that Add
  created, or Start is `Unhandled` for an absent key (rule 9) and the turn refuses (rule 7). But
  Start's guards read the pre-turn snapshot, where the instance does not exist. The runtime must
  treat instance existence as sequential and memory as pre-turn. Neither rule says so, and
  `check()` must copy whatever the runtime does.
- **A raise into a child the same transition enters.** `PASSWORD → TWO_FACTOR` with
  `raise: [E.code.Reset]`: is `code` (placed `.at("TWO_FACTOR")`) "active"? It is inactive
  pre-turn and active after the transition. Rule 12 rejects "a raise into a child that is not
  active" without saying when that is judged.
- **A raise into a trait that resets in the same turn.** "A raise into it applies first, so the
  reset wins" (rule 1) defines this one case. A notify from the reset trait's re-activation, or a
  reset trait's `input` reading a key a raise just changed, are not covered.
- **Callbacks notified by a raised child transition.** A callback filling can raise into a sibling
  trait. Can that sibling's guard see the first child's memory change? Rule 7 says pre-turn.
  Authors who know SCXML or XState will expect the opposite.

**The known answer.** SCXML puts its semantics in a normative pseudocode interpreter (Appendix D),
and Statemate fixes one visibility rule. Both make every such case decidable from one text.

### 2.2 A subroutine cannot react to being abandoned (no exit behaviour)

In UML, a state's exit behaviour runs on **any** exit, including when an outer transition takes the
whole submachine away. SCXML's `<onexit>` behaves the same. In v3, a subroutine is abandoned
silently: its memory is dropped and it gets no notification (rule 6, section 2.1). The host can read
the slice in the abandoning transition, but only if every abandoning transition remembers to.

**Failure scenario.** An `AddressStep` subroutine holds a half-typed draft and sits under
`CHECKOUT`. The root handler `SignedOut → S.SIGNED_OUT` and the ancestor handler
`CartEmptied → S.CART` both abandon it. Neither copies the draft, so D7 recurs. A third abandoning
transition, added a year later, would have to know too. This is the "hidden obligation" pattern that
E3 and A6 were written against, on the host's side.

### 2.3 A subroutine cannot be entered elsewhere, or end at once

UML entry points and itemis named entries let an outer transition enter a submachine at a declared
alternative start. SCXML or XState eventless transitions, and UML completion and choice
pseudostates, let a step finish at entry when its input already satisfies it. v3's subroutine always
enters at `default` and leaves only through an exit taken by an event (section 2.1, Machines O2).

**Failure scenarios:**

- **Resume in the middle.** A `Checkout` subroutine with states `ADDRESS → PAYMENT → REVIEW` is
  re-entered after a payment decline. The host wants it to start at `PAYMENT` with the address kept
  (passed as `input`). Rule 4 stops the host from targeting `S.CHECKOUT.PAYMENT`, and `default` is
  fixed. The usual workaround is a dummy first state plus a host-raised `hostEvent` to jump. That
  needs a raise into a child entered in the same turn, which is exactly the ambiguity in 2.1.
- **Skip at entry.** A `VerifyEmail` subroutine whose input says the email is already verified
  should take `exits.Verified` immediately. It cannot, because there is no event. Every host must
  instead guard its own transition into the step and duplicate the subroutine's condition, which
  breaks encapsulation (E2).

### 2.4 History is only shallow, and never forgets

UML, SCXML, itemis and XState all have **deep** history. Statemate also has `history_clear` and
`deep_clear`. v3 has shallow history only, persisted with the actor (P5), and no way to clear it.

**Failure scenarios:**

- **Shallow is not enough.** `WIZARD` has `PROFILE: [BASICS, AVATAR]`. On Cancel →
  `CANCELLING` → `Declined: S.WIZARD.history`, the user comes back at `PROFILE.BASICS`, not
  `AVATAR`.
- **Stale history.** After `DONE`, a "start another signup" transition into `S.WIZARD.history`
  (written for the dialog) resumes at `REVIEW`. Because history persists (P5), this survives a
  reload too.
- **History into a subroutine.** If `WIZARD`'s last child was a subroutine state, history re-enters
  it **fresh** (rule 1), with its memory gone. That is correct under v3's rules but surprises anyone
  who expects UML deep history to restore it. v3 needs to say that history never crosses a
  subroutine boundary.

### 2.5 Fragments cannot read live host values

itemis interface `var`s and value-returning `operation`s let the environment provide **live** values
that the machine reads at each step. v3 `input` is read once, at activation (section 2.2), and
guards return only allow or deny. A host-dependent value can enter a running fragment only through a
`hostEvent` raise, or through `resetOn`, which wipes it.

**Failure scenario.** A `confirmPassword: Field(…)` must show "Does not match" whenever **either**
password changes. Its `validate` closure is static and its `error` is computed on `Changed` only.
When the user edits `password`, confirm's stored `error` is stale, which is D1 (drifting copies)
inside the fragment. The fixes available in v3 are:

- `password`'s `onChanged` callback raises a `Revalidate` hostEvent into `confirmPassword`, carrying
  the new value. That is forwarding, so A1 is back.
- `resetOn: password.value` throws away what the user typed.

XState has the same limit, since `input` is read once, so this is a shared gap rather than an XState
advantage. itemis shows the established answer: typed read ports.

### 2.6 Deliveries and user events share one FIFO

SCXML's internal queue, XState's `raise` and itemis's local events all give self-generated events
priority over external ones. In Flow State, outcomes, timer firings and `onContext` events join the
**same** FIFO as user sends (Runtime O4, Machines O7: an onContext event "enqueues after the context
turn"). The order is deterministic and Stories replay it, which is why v3 never needed a second
queue. It does open a small window, though.

**Failure scenario.** A context wave changes the signed-in organisation, and the `onContext`
reaction is to enqueue `OrgChanged`. Before that event runs, two user `Pin` events already in the
mailbox run against memory that still holds the old organisation's filters. A send queued during the
turn is not run inside it (Runtime O4), so nothing stops this.

This is narrow, and only matters where a reaction must be seen before already-queued user input. It
is worth one sentence in Runtime O4 or Machines O7 stating the order as **intended**, with a Story.

### 2.7 Static analysis gaps that other tools cover

itemis validates entry and exit wiring, final states and reachability live. XState generates paths.
Statemate checked races and nondeterminism. `flow check` (CommandLine O5) already covers totality,
fencing, overlaps and cycles, which is more than any of these. It does not yet name:

- a declared exit that no reachable fragment transition takes, so the host fills a dead port;
- a `hostEvent` that no host transition raises (a port nobody uses);
- an `events` member that no reachable configuration handles;
- a subroutine whose exits are all unreachable from its default (L4 inverted: the host can always
  leave, but the step can never finish);
- transition and exit coverage by the app's Stories.

---

## 3. Validation and divergence

### 3.1 Where v3 matches established semantics

| v3 | Established match | Notes |
| --- | --- | --- |
| One event per turn, FIFO mailbox (Machines O3, Runtime O4) | UML RTC; itemis `@EventDriven`; Rhapsody | Same as everyone, minus the internal queue (2.6). |
| Active leaf first, then ancestors; written order within a level (Machines O2) | UML inner priority; SCXML §3.1.2 and document order; itemis `@ChildFirstExecution`; Rhapsody | Statemate is the exception (outer-first). v3 is on the majority side. |
| Unhandled or denied events change nothing (Machines O3) | SCXML "the event is discarded"; UML (unless deferred); Rhapsody; itemis | v3 adds `check()` reasons on top, as XState's `can` does. |
| Guards and payload mappers read the pre-turn snapshot (rule 7) | Statemate step semantics | A sound, well-understood choice. It makes a turn independent of raise order for data, as Statemate intended. |
| Same key written twice in a turn is an error or defect (rule 7, rule 12) | Statemate race detection | Stricter than UML, SCXML and Rhapsody, which just apply writes in sequence. A justified strengthening. |
| Exits must be filled, unguarded, and must leave the state (rule 6, rule 8) | itemis: "There must be an unguarded transition that catches the exit"; UML exit points bound by connection point references | v3 is the stricter (typed) form of an existing rule. |
| Subroutine abandoned by any transition that exits its state; ancestors still handle events inside it (rule 6) | UML submachine states (outer transitions exit the submachine); itemis composites | v3's "an ancestor `"self"` does not abandon" equals UML's internal/local transitions. |
| Schedules cancelled on exit; firings from an earlier arming dropped (L1, P11) | UML time events scoped to the state; XState `after`; SCXML `<cancel>` | Standard. |
| Commits fenced to their activation; late results never handled as current (P2) | SCXML §6.4.3 ignores events from a cancelled invocation; XState ignores stopped actors | v3 goes further: `abandoned` (P10) does not just drop the result. That is right, because a commit has a server-side effect, which an SCXML invocation does not promise to undo. |
| `resetOn` bounded to once per trait per turn, with no cycles | itemis `@SuperSteps` warning about infinite loops; Rhapsody max null steps; SCXML allowing non-termination | v3 bounds the fixed point statically, which is better than a run-time cap. |
| `"self"` changes nothing; a target below the handler keeps the handler's state (Machines O2) | UML `kind=local`; SCXML `type="internal"`; XState v5 default | Differs from the SCXML **default** (external). Worth saying for agents trained on SCXML. |
| Event namespaces per instance (`E.pager.Next`) | itemis named interfaces (`ui.next`) | Because of namespacing, a host handler and a fragment handler can never compete for one event, so there are no host-versus-fragment priority conflicts. Neither UML nor SCXML has this. |
| `events` / `hostEvents` / `internalEvents` | itemis in / out / internal scopes | v3's `hostEvents` (only from the direct host) has no direct counterpart. It is a finer sender restriction than itemis's in-events, which any client may raise. |
| `guards` ports filled by the host | itemis `operation`s implemented by the client; XState `setup` / `provide` | v3 restricts them to boolean and pure, which removes the reentrancy hazards of itemis operations (an operation implementation that raises into the machine mid-step). |
| Fragment tested alone with a harness (rule 11) | SCTUnit with mocked operations | Same idea. |
| No deferred events | SCXML, XState and itemis all omit deferral | Deliberate and well-precedented. See 3.2. |

### 3.2 Where v3 differs, and whether that is a problem

1. **Raises in the same step versus queued microsteps (rule 7).** Every queue-based system (SCXML,
   itemis, XState, Rhapsody) delivers a raised event in a **later** microstep, which sees updated
   data. Statemate delivers it in the **next step**. v3 delivers it in the **same** step, with
   pre-turn data, atomically. That is closest to synchronous languages (Esterel-style instantaneous
   broadcast). v3 avoids their causality problems by making the raise graph acyclic and keys
   disjoint.
   - **Gained:** one publication, whole-turn refusal (T1), and a `check()` that can answer for the
     whole chain. No queue-based system can refuse a turn because a raised event was refused: SCXML
     simply discards it.
   - **Paid for:** every child sees pre-turn data, which leads to 2.1 and 2.5, and to payload
     mappers that recompute what the host's own `updateMemory` just computed.
   - **Verdict:** keep the fused turn. It is the thing that solves T1, E1 and E4. But define it as
     precisely as SCXML's Appendix D (recommendation R1).
2. **A mixed visibility rule (rule 7 versus D6).** `input` fillers read post-update memory, while
   raise mappers read pre-turn memory. This is the one place v3 is internally inconsistent with
   itself, not with prior art. A wizard step's `input` and a raise into a sibling trait, in the same
   transition, read different `memory`. Pick one rule per kind of read and state it (R1).
3. **No completion events, eventless transitions or choices.** v3 deliberately allows no movement
   without an event. That rules out eventless loops, the "infinite super-step" that SCXML allows and
   itemis and Rhapsody cap at run time. The established alternatives are expensive, but entry-time
   endings and alternative entries (2.3) are a known, bounded need. See R3.
4. **No exit behaviour (2.2).** Every system here gives a state that is being left a chance to run
   code. v3's reason is good: an abandoned fragment must not refuse or move (E1, E5). UML exit
   behaviours cannot refuse or move either, so the established answer fits v3's constraints (R2).
5. **History (P5).** Shallow only, persisted, never cleared. It is weaker than every other system,
   and the stale-history problem (2.4) is the one Statemate's `history_clear` exists to solve (R4).
6. **No orthogonal regions.** Traits stand in for Harel's AND-states, with memory instead of
   states. The proposal says regions need their own proposal (section 6). Prior art agrees this is
   the costly part: UML and SCXML conflict resolution between regions, and Statemate races, all come
   from regions. Staying without them is consistent with the choice to have one active leaf. The cost
   is real but already recorded: a hold-to-confirm next to other states keeps its modes in memory.
7. **Typed host policy is boolean only.** itemis operations return any type. v3 guards return allow
   or deny. That is sufficient for policy (H2) but not for data (2.5). See R5.
8. **Late results (P10).** Nothing in statechart prior art handles late results with side effects
   beyond "ignore". v3's `abandoned` plus "a late result never preempts live work" (rule 6) is an
   invention, but a defensible one. This brief cannot validate it from statechart sources. The
   durable-workflow survey next to this file is the better reference for it.

---

## 4. Recommendations, ranked by value

### R1. Write the fused turn as a normative algorithm, and fix its visibility rules (high value, low–medium cost)

**Replaces** the prose in rule 7, rule 1 (`resetOn`), rule 9 (removal timing) and the Machines O3
paragraph with one ordered pseudocode algorithm, modelled on SCXML Appendix D. Plain language stays
as commentary. The algorithm must state, for each part of a turn, what it reads and what it is
judged against. A proposal:

1. Select the source transition, child-first. Guards read the pre-turn snapshot.
2. Compute the source's exit and entry sets. A child is **active for raises** if it is active in the
   post-transition configuration. That makes `raise: [E.code.Reset]` on the transition into
   `TWO_FACTOR` legal and well defined.
3. Apply raises and notifies in written order, depth-first:
   - **Handler lookup and instance existence** are judged against the running structural state, so
     instances added earlier in the turn exist (`Add` then `Start` works).
   - **Guards and payload mappers** read the pre-turn snapshot plus the triggering event. Keep
     Statemate's rule for data.
4. Apply `resetOn` to a fixed point, then removals.
5. Evaluate `input` fillers. Either:
   - make them read the pre-turn snapshot plus the event as well, the same as raise mappers, and
     drop the D6 exception (D6 is then met by reading `event`); or
   - keep D6 and state that `input` is the **only** post-update read, and why.
6. Validate keys and state changers, then publish once.

Make the same algorithm the reference for both the runtime and `check()`, with one shared test
table. Add a Story per row of the 2.1 scenarios.

**Cost:** writing and agreeing the algorithm, plus perhaps 10–15 Story cases. No new syntax.
**Why first:** every other recommendation adds parts to the fused turn. Without one algorithm, each
addition reopens the 2.1 ambiguities, and `check()` and the runtime can disagree silently, which is
the T1 failure moved one level down.

### R2. Add an `onLeave` notification for fragments (high value, low cost)

**Adds** an optional fragment-side `leaving` block: a payload mapper over the fragment's own memory
that notifies one declared callback, for example `callbacks: { onAbandoned: optional({ draft }) }`.
It is fused into the turn that abandons the subroutine (or ends the trait's node), and it is not
taken when the fragment ends through an exit.

- The host fills it like any callback. Rule 6 already says a subroutine's callbacks cannot target,
  so the abandoning transition's target stands.
- It may update host memory and raise into root traits, under the same constraints as `abandoned`
  (P10).

This is UML's exit behaviour, restricted the way v3 restricts everything: it cannot refuse, cannot
move and does no I/O. It closes D7 by construction rather than by convention, and makes the
section 4 "By convention" verdict for D7 a "Prevented".

**Cost:**

- one fused part, which needs R1;
- one rule-8-style check: an exit-time callback chain must be total, because abandonment cannot be
  refused;
- a key-overlap check against the abandoning transition, the same rule as P10's "pending" run.

**Naming:** do not call it `abandoned`. That word is already the commit's late-result handler (A4).

### R3. Named entries and entry-time exits for subroutines (medium–high value, medium cost)

**Adds** two things, both established:

- **Named entries** (UML entry points, itemis named entries). The contract declares
  `entries: { AtPayment: { address: Schema… } }`, and each entry maps to one inner state. The host
  targets `S.CHECKOUT.entry.AtPayment` and supplies `input` for it.
  - It is unguarded, as itemis requires of the entry point's transition.
  - It replaces the "dummy state plus jump raise" workaround from 2.3.
  - Encapsulation holds: the host names a declared entry, never an inner state.
- **Entry-time exits.** A subroutine's `initial` (or each entry) may return an exit instead of
  entering, for example `initial: ({ input }) => input.verified ? exits.Verified({}) : { … }`. It
  is a fused part of the entering turn, so the host's transition and the exit filling compile into
  one transition (rule 7), with one state changer: the exit filling's target replaces the entering
  target. This is a choice pseudostate on entry, not a general eventless transition. It runs once,
  so it cannot loop.

**Cost:** each adds one fused part and one `flow check` rule. An entry's mapped state must exist,
and an entry-time exit's filling must leave both states. Section 6 can keep "no eventless
transitions" as an explicit exclusion.

### R4. Deep history, history defaults and clearing (medium value, low cost)

**Extends** P5 and Machines O2:

- `S.X.history.deep` restores X's last active leaf. It **stops at subroutine states**: if the
  recorded path goes through a subroutine state, the subroutine is re-entered fresh at its default
  (rule 1). Say this explicitly. It is where v3's "fresh on every entry" rule meets UML deep history.
- An optional history default (`S.X.history.or(S.X.REVIEW)`) for first entry, as in UML and SCXML,
  instead of always using X's `default`.
- `forgetHistory: [S.X]` on a transition, Statemate's `history_clear` / `deep_clear`, so that
  "start another signup" does not resume a finished wizard. Fused, and it writes nothing else.

**Cost:**

- one new token form;
- one transition property;
- the persisted history grows from one child per compound to one leaf path (Persistence O2);
- Machines V13 and Persistence V4 gain cases.

### R5. Typed read ports for live host values (medium value, medium cost)

**Adds** a contract port `reads: { other: Schema.String }`. The host fills it with
`({ memory, … }) => …`. It is evaluated from the pre-turn snapshot, like a guard, and passed to the
fragment's guards, updates and selects as `reads`. Optionally, a `derived` selector on the fragment
(computed on read, never stored) lets `Field` compute `error` from `value` and `reads`, instead of
storing a copy that goes stale. This is itemis's interface `var` and value-returning `operation`,
kept pure and read-only.

- **Closes:** the confirm-password D1 case (2.5).
- **Removes:** the "raise a Revalidate hostEvent from a callback" forwarding pattern (A1).

**Cost:** one new port kind, with typing in every handler. `check()` evaluates read ports, since
they are pure. Snapshot identity (Machines O8) gains derived values, which must be memoised by
`Equal.equals`. Lower-cost variant: `reads` only, with no `derived`. That fixes guards, and updates
that run on the fragment's own events, but not the stored `error`.

### R6. Add statechart-tool findings to `flow check`, and path generation for Stories (medium value, medium cost)

**Adds** these warnings to CommandLine O5:

- an exit no reachable fragment transition takes;
- a `hostEvent` no host transition raises;
- a public fragment event unhandled in every reachable configuration;
- a subroutine whose exits are unreachable from its default (and from every named entry, with R3).

These are the ones itemis's live validation and Statemate's analysis report. Separately, offer a
`flow stories --coverage` report: which transitions, exits, callbacks and delivery handlers no Story
reaches. Optionally, generate shortest-path skeleton Stories in the style of `@xstate/graph`.
Stories are deterministic, so generated paths replay exactly.

**Cost:** the reachability analysis already exists for "likely stuck/unreachable states". The exit
and port findings reuse it. Coverage needs evidence of which transitions ran, which Inspection O1
may already record.

### R7. State the queue order for self-generated events (low–medium value, very low cost)

**Adds** one sentence to Runtime O4 and Machines O7. Either:

- **confirm FIFO**: outcomes, timer firings and `onContext` events take their admission place
  behind already-queued user sends, with a Story for the 2.6 scenario; or
- adopt itemis and SCXML's rule that self-generated deliveries run before queued external sends.

FIFO is simpler and already deterministic. Recommend confirming it, and documenting the 2.6 pattern
(use a guard on the derived value, not an `onContext` event, when a user event must see it).

**Cost:** documentation and one Story.

### Not recommended

- **Deferred events (UML).** Rule 8 makes every delivery total, and fencing (P2) scopes where a
  delivery can arrive. Deferral would answer the same need by parking events in the mailbox, which
  breaks the 1,024-event bound (Runtime O4), makes order depend on configuration history, and is
  omitted by SCXML, XState and itemis. User events refused while busy are better shown through
  `check()` in the view.
- **Queued microsteps (SCXML, XState).** These would give up whole-turn refusal (T1) and the
  single publication. Refine the fused turn instead (R1).
- **Statechart inheritance (Rhapsody, UML redefinition).** This conflicts with "the host cannot
  reach inside" (rule 4) and with agent-authored readability. Composition through traits and
  subroutines is the better-supported direction.
- **General eventless and completion transitions.** These bring the loop and termination problems
  that SCXML allows and itemis and Rhapsody cap at run time. R3 covers the bounded cases that are
  actually needed.

---

## Sources

- D. Harel, "Statecharts: A visual formalism for complex systems", _Science of Computer
  Programming_ 8(3), 1987. https://doi.org/10.1016/0167-6423(87)90035-9
- D. Harel, A. Naamad, "The STATEMATE semantics of statecharts", _ACM TOSEM_ 5(4), 1996.
  https://doi.org/10.1145/235321.235322
- D. Harel, M. Politi, _Modeling Reactive Systems with Statecharts: The STATEMATE Approach_,
  McGraw-Hill, 1998. https://www.wisdom.weizmann.ac.il/~harel/reactive_systems.html
- D. Harel, H. Kugler, "The Rhapsody Semantics of Statecharts (or, On the Executable Core of the
  UML)", LNCS 3147, 2004. Preliminary version:
  https://weizmann.ac.il/math/harel/sites/math.harel/files/users/user56/RhapsodySemantics.pdf (not
  fetched here; the section 1.5 claims need checking)
- M. von der Beeck, "A comparison of Statecharts variants", FTRTFT 1994, LNCS 863 (cited from
  memory)
- OMG, _Unified Modeling Language 2.5.1_, clause 14 (StateMachines). https://www.omg.org/spec/UML/2.5.1/
- W3C, _State Chart XML (SCXML): State Machine Notation for Control Abstraction_, 2015.
  https://www.w3.org/TR/scxml/ (quotes in section 1.3 checked)
- itemis CREATE, statechart language: reactions, execution schemes, entry and exit points, history.
  https://www.itemis.com/en/products/itemis-create/documentation/user-guide/sclang_reactions (checked)
- itemis CREATE, definition section: interfaces, internal scope, operations.
  https://www.itemis.com/en/yakindu/state-machine/documentation/user-guide/sclang_definition_section?hsLang=en (checked)
- itemis, YAKINDU SCT 4.0 release notes (multi-state-machine modelling).
  https://www.itemis.com/en/yakindu/state-machine/documentation/user-guide/release_notes_4.0.0
- Stately, XState v5 documentation: [actions](https://stately.ai/docs/actions) (checked),
  [setup](https://stately.ai/docs/setup), [invoke](https://stately.ai/docs/invoke),
  [final states](https://stately.ai/docs/final-states),
  [eventless transitions](https://stately.ai/docs/eventless-transitions),
  [history](https://stately.ai/docs/history-states), [graph](https://stately.ai/docs/graph)
