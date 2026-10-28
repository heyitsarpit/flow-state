# Prior art: dynamic collections in synchronous, modelling and statechart languages

Status: research note for [problem.md](problem.md). It answers one question: how do established
reactive languages hold **a changing number of copies of the same behaviour**, and what does that
suggest for Flow State's cases C1–C6 under constraints K1–K9?

It builds on [../prior-art/synchronous-languages.md](../prior-art/synchronous-languages.md) (which
already covers Céu's trails, `finalize`, internal emits as stack calls, and SCADE's turn) and
[../prior-art/statechart-languages.md](../prior-art/statechart-languages.md) and
[../prior-art/modal-models-p-behavior-trees.md](../prior-art/modal-models-p-behavior-trees.md)
(which cover RTC, XState actors and P's responsiveness check). Nothing below repeats those; it
looks only at **replication, membership, identity and removal**.

Sources are primary where they could be reached: language manuals, the authors' papers and
framework reference manuals. Where a claim comes from memory of a source that could not be
fetched, it is marked *(recall)*.

---

## 0. The short version

Every system here splits the problem into the same four decisions, and makes them differently:

| Decision | Static family (Esterel v7, SCCharts, SCADE/Lustre) | Pool family (Céu, UML/Rhapsody, Erlang) | Actor family (XState, SCXML, P) |
| --- | --- | --- | --- |
| **Template** (the copy's behaviour) | one body, written once | one body / class / child spec | one machine type |
| **Membership** (which copies exist) | fixed count `N` known at compile time; "existence" is a per-slot activity or reset flag, often driven by an **input array** | created by a statement (`spawn`, `new`, `start_child`), removed when the body ends or by the owner; optional upper bound | created by an action, stopped by an action |
| **Identity** | the index `i` | a reference to the **incarnation** (Céu option alias, Rhapsody pointer, Erlang pid), separate from any user key | an actor ref / machine id |
| **Step** | host and **all copies in one instant**, deterministic | Céu: one reaction, copies in creation order; Rhapsody: one queue, but one event = one copy | separate mailboxes; no shared step |

Three findings matter most for Flow State:

1. **The only systems that meet K1 (one atomic turn with the host) and K2 (one static graph)
   are the static ones and Céu.** They keep the *template* static and make only *membership*
   dynamic. SCCharts' array-driven for-regions and SCADE's `map` over arrays go one step further:
   **membership is a function of data**, not a separate set of verbs.
2. **Every dynamic system separates the user's key from the incarnation**, and every one of them
   **hides** the incarnation: Céu's option alias is unset when the instance dies, Erlang's pid is
   never the registered name, P's machine id is never reused, Rhapsody cancels queued events when
   the object is destroyed. None asks the author to name or count incarnations. v4's draft
   surfaced them; that is the main thing prior art says it got wrong.
3. **Late deliveries to a removed copy are dropped everywhere**, silently in P, Erlang and
   Rhapsody, by construction in Céu (the reference is gone), by construction in SCADE (a slot
   that was reset simply has fresh memory). Flow State's "dropped with evidence" is already
   stricter than all of them.

The recommended direction (section 4, **A**) is SCCharts / SCADE / React in one rule: **a trait
placed `each` over a keyed array in host memory**. Membership is the host's own data, so R5 holds
by construction and `Add`, `Remove`, `owner`, `canAdd`, `canRemove` and minted keys disappear as
API; incarnations stay, but only inside the runtime.

---

## 1. The systems

### 1.1 Céu: pools of code abstractions

**Declaration.** A pool is a storage entity, declared with the type of the abstraction it holds
and an optional dimension ([manual v0.30, Storage Entities §Pools](https://github.com/ceu-lang/ceu/blob/master/docs/manual/v0.30/ceu-v0.30.md)):

```ceu
code/await Anim (none) => none do … end
pool[]   Anim anims;   // unbounded: instances go to the heap
pool[10] Play plays;   // bounded: "static pool of 10 elements max", pre-allocated
```

The pool is homogeneous: one abstraction type. (Pools of *interfaces* in v0.10 bound bytes, not
instances, and hold heterogeneous organisms; [manual v0.10 §Pools](https://github.com/ceu-lang/ceu/blob/pre-v0.40/docs/manual/v0.10/manual-v0.10.md).)

**Creation.** `spawn Anim() in anims` creates an instance. The spawning trail suspends, the new
body runs **in the same reaction** until it first awaits or terminates, then the spawner resumes
(manual v0.30, Code Invocation). So the host and the new copy change in one reaction, and the new
copy is already waiting for its first event when the reaction ends.

**Full pool.** `spawn` into a full bounded pool fails: "If the `spawn` fails (e.g., lack of memory)
the option alias variable is unset" (Code Invocation). Failure is a value, not an abort.

**Removal.** There is no explicit removal verb in the manual (`kill` is grammar plus "TODO"). An
instance is removed **when its body terminates**: elements "are removed automatically when the code
execution terminates" (Storage Entities §Pools). When the pool's block goes out of scope, "all
running code abstractions are automatically aborted", and each aborted trail first runs its
`finalize` blocks in the aborting reaction (covered in the synchronous note). The Modularity'15
paper is explicit about why pools are lexically scoped: dynamic organisms without a scope give
"no way to externally abort the execution of a dynamic instance"
([Sant'Anna et al., *Structured Synchronous Reactive Programming with Céu*, Modularity 2015, §3.1](https://www.ceu-lang.org/chico/ceu_mod15_pre.pdf)).

**Identity and late access.** `spawn` returns an **option alias**: "If the instance terminates at
any time, the option variable is automatically unset" (Code References). The Modularity paper's
older pointer version enforces that every pointer access *across reactions* is inside
`watching ptr do … end`, which aborts the block when the organism dies (§3.2, Figure 6). A
reference therefore names one incarnation, and using it after death is either a compile error or
an unset option. There is no user key at all; a program that wants one stores an `id` field and
filters.

**Addressing.** Two idioms:

- broadcast and filter: each instance does `await e until id == my_id` (Await grammar,
  `await … until Exp`);
- through a reference: `emit c!.move(…)`, on a public event of that instance.

**Reading and iteration.** `loop c in anims do … end` visits "all alive … instances … starting from
the oldest created to the newest" (Pool Iterator). The loop body may not contain `await`,
`spawn`, `emit`, `watching` and the other synchronous control statements (v0.30, Synchronous
Control Statements; the Modularity paper allowed `emit` and forbade only `await`), so **the set
cannot change while it is being iterated**. Iteration order is creation order.

**Timers per copy.** Free: each instance's body has its own `await 4s`, cancelled when the body is
aborted.

**Static guarantees.** The compiler knows the pool's element type, so every instance's reactions
are analysed once, with the template. With a constant dimension, memory is bounded and allocation
is deterministic ("efficient and deterministic organism instantiation", Modularity §3.1). Bounded
reaction time and the tight-loop check hold for instances as for any code. What is *not* static is
how many instances exist.

**Step.** One external event is one reaction chain; all awoken instances react in it, in a
deterministic order (lexical order for trails; creation order for pool members). Host and copies
change atomically.

**Costs and pitfalls.** Instance bodies are coroutines, cheap in Céu's C backend. The pitfalls the
authors fixed are the ones Flow State met: dangling references (fixed by `watching` and option
aliases), and mutation during iteration (fixed by forbidding control statements in iterators).

### 1.2 SCADE 6 and Lustre: `map` and `fold` over stateful nodes

**Declaration.** SCADE 6 arrays are functional, with static sizes, and come with iterators (`map`,
`fold`, `mapfold`, `mapi`, `foldi`, and the partial `mapw`, `foldw`, `mapfoldw` with an early-exit
condition and a default). Crucially, "it is possible to map (or fold) a statefull function
point-wise to all elements of an array" ([Colaço, Pagano, Pouzet, *SCADE 6: A Formal Language for
Embedded Critical Software Development*, TASE 2017, §VI](https://www.di.ens.fr/~pouzet/bib/tase17.pdf)).
The array iterators come from Morel's Lustre extension (L. Morel, *Array iterators in Lustre*,
EURASIP JES 2007, cited there as [10]).

The paper's own example is exactly a collection of state machines: `n` push buttons, each a
four-state automaton:

```scade
node Button (button, lock, unlock, other : bool) returns (background : bk_color; foreground : fr_color)
  -- automaton Unselected / Preselected / LockedSelection / LockedUnselection
const n : int16 = 8;
bk_buttons, fg_buttons = (map Button <<n>>)(buttons, 'lockSig^n, 'unlockSig^n, buttonPressed^n);
buttonPressed = (fold or <<n>>)(false, buttons);
```

"The interest of this example lies in the iteration of an operator that encapsulates a state …
The semantics is that of the unfolded version; yet, compiled as a for loop" (§VI.B).

**Membership.** There is none: `n` is a static parameter, and the program has exactly `n` copies
for its whole life. Dynamic membership is encoded:

- a per-index **reset**, `(restart Node every c)` (§III), wrapped so each index takes its own
  boolean, gives a fresh copy in a slot;
- a per-index **activation**, `activate … every c` *(recall: SCADE language reference,
  "activate" operator)*, freezes an unoccupied slot;
- the partial iterators (`mapw … if cond default d`) stop at the first index whose condition fails,
  so a "live prefix" of the array behaves like a list of the first *k* items
  ([forum quoting the SCADE Language Reference 8.5](https://innovationspace.ansys.com/forum/forums/topic/correct-usage-of-mapfoldw-iterator)).

**Identity.** The index. A slot that is reset is the "new incarnation"; nothing late can reach the
old one, because there is no queue: inputs are sampled each instant.

**Timers.** Time is a counter in each copy's memory; a reset clears it.

**Static guarantees.** All of them: the program is the unfolded parallel composition, clock- and
causality-checked like any other; array accesses are in bounds by typing (§IV, Property 1); memory
is fixed. This is the strongest K2 there is.

**Step.** All copies and the host compute in the same instant; `fold` gives a deterministic
combination (here, "is any button pressed").

**Costs and pitfalls.** Each copy's state is a fixed slot even when unused; the count is static;
"empty" slots must be encoded by the author. Pouzet's own later slides note that the iterators'
generated code makes "too many copies" of arrays
([Pouzet, Synchron 2024 slides](https://uni-bamberg.de/fileadmin/ba7dk97/slides-pouzet-forward-synchron-2024.pdf)).

### 1.3 Esterel v7: `for … dopar` replication

**Declaration.** "The for-dopar replication statement … `for i < e dopar p end for` … where `e`,
`e1`, and `e2` are statically evaluable expressions. … the construct conceptually builds `m`
parallel copies of `p`, which act concurrently with each other. The copies have independent
control" ([Esterel v7.60 Reference Manual, §8.9.2](https://www.college-de-france.fr/media/gerard-berry/UPL681247605558671166_Esterelv7.60_ReferenceManual.pdf)).
Copies are wired through **signal arrays**, whose dimensions "must be statically evaluable" (§5.7):

```esterel
module NABO :
generic constant N : integer;
input A[N], B[N];
output O[N], Done;
for i < N dopar
  run ABO [ signal A[i] / A, B[i] / B, O[i] / O ]
end for;
emit Done
end module
```

**Membership.** Static. A copy "exists" for the life of the `dopar`; it ends when its body ends
(the `dopar` terminates when all have), or is strongly aborted by an enclosing `abort`, or
restarted by `loop … each`.

**Identity and addressing.** The index; the input signal `A[i]` addresses copy `i`. There is no
way to address a copy that is not there.

**Step.** All copies are threads of the same instant; their emissions combine (the manual computes
`N!` in one tick with a `combine *` signal).

**Static guarantees.** The full constructive-causality analysis applies to the unfolded program.

**Pitfall.** Same as SCADE: the count is a compile-time constant. Esterel never had dynamic
instances; it is the reference point for "what static replication can and cannot do".

### 1.4 SCCharts: for-regions, including array-driven ones

**Declaration.** "You can automatically duplicate regions and access a region counter variable"
([KIELER Syntax wiki, *For Regions*](https://github.com/kieler/semantics/wiki/Syntax)):

```sccharts
region main for i : 1 to 3 { … await I == i … }   // three copies, counter i
region for i : ACTIVE { … await ACTIVE[i] … }     // one copy per element of input bool ACTIVE[10]
```

The second form is the interesting one: **replication is driven by an array**, so "which copies
are relevant" is data. The count is still the array's static size; there is no dynamic creation.
Referenced SCCharts (`state R is Beep(…)`) give reuse of a whole chart with explicit bindings; the
wiki does not say whether references may be replicated by `for`.

**Step.** SC semantics (sequential constructiveness): all copies in one tick, with the
initialise–update–read protocol on shared variables (covered in the synchronous note).

**Lesson.** SCCharts is the statechart language closest to Flow State's surface, and its answer
to "copies" is **one region body, a counter, and an array of inputs**. Nothing more.

### 1.5 UML composite structures and IBM Rhapsody

**Declaration (UML).** A structured classifier owns **parts**: properties with composite
aggregation and a **multiplicity**, e.g. `viewer : Viewer [0..*]`
([OMG UML 2.5.1, §11 Structured Classifiers](https://www.omg.org/spec/UML/2.5.1/PDF);
[uml-diagrams.org, Structured classifier](https://uml-diagrams.org/structured-classifier.html)).
The lower bound says how many are created with the container; the rest are created and destroyed
at run time within the bounds. Each part instance has its own state machine (its classifier's
behaviour). Composite deletion deletes the parts.

**Rhapsody.** Generated code gives an association/part of multiplicity `*` a collection
(`itsX[0]`, …, with `addItsX`, `removeItsX` *(recall)*; see the
[NUS Rhapsody-in-C lab overview](https://www.comp.nus.edu.sg/~abhik/CS4271/module2011/lab1/rhapsody_c_overview.pdf)).
Every reactive instance is an `OMReactive` bound to an `OMThread`; instances of **non-active**
reactive classes share the thread (and so the **event queue**) of an active object; "each active
class … runs on its own thread and therefore also has its own event queue"
([IBM: viewing the event queue](https://www.ibm.com/support/pages/node/735535)). So many part
instances, **one mailbox**, one thread.

**Timers.** Each instance schedules its own timeouts (`schedTm`); due timeouts are queued "to the
relevant thread as an event" for that destination
([Rhapsody 7.4 C++ Framework Execution Reference, *Timeouts*](https://public.dhe.ibm.com/software/rationalsdp/documentation/product_doc/Rhapsody/version_7-4/framework.pdf)).

**Removal and late events.** "Events are canceled when the event destination is deleted."
`cancelEvents` walks the thread's queue and, for each event whose destination is the dying
instance, sets its id to `OMCancelledEventId`; it "is called upon destruction of the reactive
object" (same manual, *Canceling All Events to a Destination*, `OMReactive::cancelEvents`).
Destruction must go through the framework's `Destroy()`, never `delete`
([IBM Ideas RHPY-I-45](https://ibm-ai-apps.ideas.ibm.com/ideas/RHPY-I-45)). This is the pointer
version of an incarnation fence: the target pointer *is* the incarnation, and its death cancels
what was queued for it.

**Step.** Run-to-completion per **event**, and an event has **one destination**. A host
statechart that creates a part and sends it an event does so in two RTC steps (the send is
queued). There is no atomic host-plus-copies step; consistency between host and parts is by
convention.

**Static guarantees.** The *model* is static (classes, multiplicities, ports), and Rhapsody's
tools check statecharts per class. The instance population is not analysed.

**Costs and pitfalls.** Every interaction across instances is an asynchronous event, so a
"collection of rows" behaves like a small actor system inside one thread: one mailbox, but no
shared turn. Pitfall: changing a reactive object's thread after construction loses cancellation
("the events in the queue of the old thread will not be canceled upon the destruction", `setThread`).

### 1.6 SCXML and XState: spawn (contrast)

**SCXML** has no dynamic copies inside one state machine. `<invoke>` starts a child *session*
(its own queue) while a state is active and cancels it on exit; `<foreach>` is executable content
that iterates over a datamodel array, not a construct that replicates behaviour. So SCXML's only
in-machine answer is C6: an array in the datamodel ([W3C SCXML 1.0, §6.4 `<invoke>`, §4.6
`<foreach>`](https://www.w3.org/TR/scxml/)).

**XState v5** spawns actors: `spawnChild(logic, { id })` from an action, or `assign` with `spawn`
to keep an `ActorRef` in context; `stopChild(id)` stops one; spawned actors are "stopped when the
machine is stopped", and "stopping a child actor does *not* remove it from `context`"
([Stately docs, *Spawn*](https://stately.ai/docs/spawn)). Each child has its own mailbox and
lifecycle; persistence stores children with the parent *(recall: [Stately docs,
*Persistence*](https://stately.ai/docs/persistence))*.

**Lesson.** This is the model problem.md rules out (K1, K3). It is worth noting what users get
from it that they would miss: a **ref per item** they can hold and send to, items that **stop
themselves** (a toast actor that finishes), and statecharts per item. Direction A below keeps the
first two inside one actor.

### 1.7 The P language: dynamic machines, checked by exploration

**Creation.** `new M(payload)` creates a machine and returns its reference; the payload goes "to
the entry function of the start state" ([P manual, *Statements*](https://p-org.github.io/P/manual/statements/)).
Each machine has an "unbounded FIFO buffer" ([P manual, *State machines*](https://p-org.github.io/P/manual/statemachines/)).

**Removal and late events.** `halt` destroys a machine; "all events sent to that machine instance
there after are equivalent to being dropped to ether"
([P manual, *Expressions*, `halt`](https://github.com/p-org/P/blob/master/Docs/docs/manual/expressions.md));
the regression suite pins this (`SEM_TwoMachines_1/EventSentAfterSentHalt.p`).

**How it is checked.** Not statically. The checker (PChecker, PEx) runs a **test driver** that
creates a bounded number of machines and explores schedules systematically; the unhandled-event
check and monitors are evaluated per explored execution. The machine *types* are static, so their
handlers are checked once; the *population* is bounded by the test, not by the language.

**Lesson.** When instances are dynamic, P keeps static what can be static (the type's state
graph) and covers counts and interleavings by bounded exploration. That is a fair model for how
`flow check` (per template) and Stories / `model()` (bounded by `max`) could divide the work.

### 1.8 Erlang/OTP supervisors (actor contrast)

**Template.** A `simple_one_for_one` supervisor (or Elixir's `DynamicSupervisor`) declares **one
child spec**; all children are started from it with `supervisor:start_child(Sup, ExtraArgs)`;
`DynamicSupervisor` adds `max_children`, returning `{:error, :max_children}` when full
([Erlang `supervisor`](https://www.erlang.org/doc/apps/stdlib/supervisor.html);
[Elixir `DynamicSupervisor`](https://hexdocs.pm/elixir/DynamicSupervisor.html)).

**Identity.** A pid names one process incarnation. A user key is a separate thing: a registered
name or `Registry` entry that maps to the *current* pid. Sending to a dead pid succeeds and the
message is lost; a monitor delivers `{'DOWN', Ref, process, Pid, Reason}` to whoever cares.

**Removal.** `terminate_child`, or the child exits; restart strategy (`temporary`, `transient`,
`permanent`) says whether the supervisor brings it back, as a **new** pid.

**Lesson.** Erlang names both identities and never confuses them: "the row with key `k`"
(Registry) versus "the incarnation that started this call" (pid). Calls fenced to a pid cannot
land on a restarted child. This is exactly v4's incarnation rule, without the user ever seeing an
incarnation number.

---

## 2. How each maps onto the cases (C1–C6)

"How" means: what a Flow State author would write if they copied the system's approach.

| System | C1 invite rows (debounce per row) | C2 issue pins (flash per row) | C3 challenges (lockout per id, survives Back) | C4 toasts (self-dismiss, pausable) | C5 inline editors (mode + autosave) | C6 plain rows |
| --- | --- | --- | --- | --- | --- | --- |
| Céu pool | spawn a row; `await` debounce in its body | spawn a flash organism per failure; it ends after 3 s | spawn per challenge id, keep pool at root scope | **natural**: body awaits 4 s and ends; `pause/if` for hover | per-row body with its own modes | vector of data, no organisms |
| SCADE `map` | `n` = 5 slots, reset slot on add | slot per *page row* (static page size) | slots, keyed by author | slots with activity flags | per-slot automaton (each copy its own state) | plain array + `fold` |
| Esterel `dopar` | as SCADE, signals `Changed[i]` | as SCADE | as SCADE | as SCADE | as SCADE | arrays |
| SCCharts for-region | region per element of an input array | same | same | same | region per row with its own states | arrays |
| UML / Rhapsody parts `[0..5]` | part instance per row, own statechart and timeout | part per failed pin | part per challenge | part destroys itself | part with states | attribute array |
| XState spawn | actor per row | actor per pin | actor per challenge | actor that stops itself | actor per row | array in context |
| P | machine per row | machine per pin | machine per challenge | machine halts itself | machine per row | sequence |
| Erlang | process per row under a dynamic supervisor | process per pin | process per challenge (`transient`) | process exits | process | list |

Notes:

- **C5 is the one case where the static languages give each copy its own *control state*** (SCADE's
  `Button` automaton). Flow State traits have no states (K4: one active leaf per actor), so a
  copy's mode must be **memory** (`mode: "viewing" | "editing"`). Nothing in prior art says this
  is a loss: SCADE automata compile to a state variable in the node's memory anyway.
- **C2's in-flight flag is server state**, already readable as `O.Issues.setPinned.pending(g, { id })`
  in v4; only the flash needs a copy, and only **while it flashes**. Céu, Erlang and XState all
  suggest *sparse* membership: a copy per failed pin, not per row.
- **C4 is self-removal.** Céu, P, Erlang and XState all let a copy end itself. Under R5 the host
  must decide, so the copy reports and the host removes (direction A, section 4).

## 3. How each fares against the constraints (K1–K9)

"Holds" means: Flow State could adopt the system's mechanism without breaking the constraint.

| | K1 one turn | K2 static graph | K3 no child actors | K4 one leaf | K5 def / machine | K6 typed | K7 deterministic, persisted | K8 no I/O in fragments | K9 locality |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Céu pools | **holds**: spawn and copies react in the host's reaction | **holds** for the template, count dynamic (bounded optional) | holds (organisms are not actors) | n.a. (trails, not leaf states); copies' "modes" are their own continuations | holds (pool decl. is structure, spawn is behaviour) | holds | holds: creation order is deterministic | holds (I/O is in `async`/C) | holds: pool declared where its scope is |
| SCADE / Lustre `map` | **holds** | **holds, strongest** | holds | **breaks if copied literally** (each copy has its own automaton state); holds if copy modes become memory | holds | holds | holds trivially | holds | holds |
| Esterel `dopar` | holds | holds, strongest | holds | as SCADE | holds | holds | holds | holds | holds |
| SCCharts for-region | holds | holds | holds | as SCADE (regions = parallel) | holds | holds | holds | holds | holds |
| UML / Rhapsody parts | **breaks**: one queue but one event per destination; host and part change in separate RTC steps | model static, population not | holds in spirit (parts share a thread), breaks in form (each part is a reactive object with its own dispatch) | breaks (each part its own statechart) | holds | holds | partial: order is queue order; persistence not covered | n.a. | holds |
| XState spawn | breaks | breaks (children discovered at run time) | **breaks** | holds per actor | holds | partial (`ActorRef` typing is loose) | partial | n.a. | holds |
| P | breaks | types static, population by exploration | breaks | holds per machine | n.a. | holds | holds under the checker's scheduler | n.a. | n.a. |
| Erlang supervisors | breaks | breaks | breaks | n.a. | holds (child spec vs code) | n.a. | breaks (pids are not reproducible) | n.a. | holds |

The static family and Céu are the only rows that hold K1 and K2 together. Between them, the
static family holds K2 most strongly but fails R1 (count is a constant), and Céu holds R1 with a
bound but needs membership verbs (`spawn`) and references.

---

## 4. Candidate directions for Flow State

Each sketch uses v4 syntax (proposal-v4 §2, §3). New pieces are marked `// new`.

### A. `each`: one copy per element of a keyed array in host memory (recommended)

**Prior art.** SCCharts' `region for i : ACTIVE` (replication driven by an array), SCADE's `map`
over an array (copies follow the data, point-wise), Céu's oldest-to-newest iteration and option
references (identity hidden, death unsets it), Erlang's key-versus-pid split, and React's keyed
reconciliation (which is what R9 asks the UI to look like). It is also v4's own `resetOn`,
generalised from "one value" to "a set of keys".

**Rule.** A trait placed with `.each(path, { key, max? })` has one incarnation per element of the
host memory array at `path`, in that array's order. Membership is **computed, never commanded**:

- It is evaluated exactly when `resetOn` is (rule 1): on the source-updated memory before the walk,
  and again on the committed memory, with changes from part fillings applied as a follow-up turn.
- A key that appears gets a fresh incarnation (its `Flow.input` fields from the element). A key
  that disappears ends its incarnation: schedules cancelled, `onLeave` fused. A key that stays
  keeps its incarnation. A per-copy `resetOn` (reading its element) gives a fresh incarnation
  without removal.
- Incarnations exist only in the runtime, as in v4 rule 9 (deliveries are fenced to the
  incarnation live when the commit started or the timer was armed; a dead one is dropped with
  evidence). Authors see keys only.
- More than `max` elements at commit is an `InvalidTurn` (K1 refuses the whole turn). `max` bounds
  Stories' and `model()`'s exploration, P-style.

**What disappears from the v4 draft.** Built-in `Add` / `Remove` events, minted keys, `owner`,
`canAdd` / `canRemove`, and incarnations as API. The host adds and removes rows by writing its own
array, on its own events, with its own guards (R5 by construction, K9: the policy sits on the
host's transition). C6 is the same array **without** a trait (R8: no new concept).

```ts
// invites.definition.ts (C1)
export const InviteRow = trait({                     // Field + Debounce, written once (R2)
  id: "InviteRow",
  events: { Changed: { value: Schema.String } },
  hostEvents: { Checked: { taken: Schema.Boolean } },
  internalEvents: { Settled: {} },
  callbacks: { onSettled: Flow.Callback({ value: Schema.String }) },   // payload also carries `key`
  memory: {
    value: Flow.initial(Schema.String, ""),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
  },
}, ({ E, callbacks }) => ({
  schedules: { settle: { schedule: "400 millis", send: E.Settled, armOn: [E.Changed] } },
  on: {
    Changed: { target: "self", updateMemory: ({ event }) => ({ value: event.value, error: localIssue(event.value) }) },
    Settled: { target: "self", notify: [callbacks.onSettled.from(({ memory }) => ({ value: memory.value }))] },
    Checked: { target: "self", updateMemory: ({ event }) => (event.taken ? { error: "Already registered" } : {}) },
  },
}));

export const Invite = definition({
  id: "Signup/Invite",
  states: ["EDITING", "SENT"],
  events: { AddInvite: {}, RemoveInvite: { key: Schema.String } },
  internalEvents: { EmailChecked: { key: Schema.String, taken: Schema.Boolean } },
  memory: {
    invites: Flow.initial(Schema.Array(Schema.Struct({ id: Schema.String })), []),  // membership is data
    nextId: Flow.private(Flow.initial(Schema.Int, 1)),                              // deterministic ids (K7)
  },
  traits: {
    rows: InviteRow.each("invites", { key: "id", max: 5 }),   // new: one copy per element, by id
  },
  operations: { Accounts },
});
```

```ts
// invites.machine.ts
export const InviteMachine = machine(Invite, ({ S, E, O }) => {
  const check = O.Accounts.isRegistered.commit(({ payload }) => ({ key: payload.key, email: payload.value }), {
    outcomes: { success: E.EmailChecked.from((r, { input }) => ({ key: input.key, taken: r.taken })) },
  });
  return {
    default: S.EDITING,
    traits: {
      rows: { callbacks: { onSettled: { target: "self", actions: [check] } } },   // one filling, every copy
    },
    on: {
      // A late result for a removed row is dropped with evidence (its incarnation is gone).
      EmailChecked: { target: "self", raise: [E.rows.Checked.from(({ event }) => ({ key: event.key, taken: event.taken }))] },
    },
    states: {
      EDITING: {
        on: {
          AddInvite: {
            target: "self",
            guard: ({ memory }) => memory.invites.length < 5 || deny("TooMany"),
            updateMemory: ({ memory }) => ({ invites: [...memory.invites, { id: `i${memory.nextId}` }], nextId: memory.nextId + 1 }),
          },
          RemoveInvite: {
            target: "self",
            updateMemory: ({ memory, event }) => ({ invites: memory.invites.filter((r) => r.id !== event.key) }),
          },
        },
      },
      SENT: {},
    },
  };
});
```

```tsx
// InvitePage.tsx: reads like a keyed list (R9)
{s.memory.rows.map((row) => (                                 // ordered as memory.invites; each { key, value, error }
  <div key={row.key}>
    <input value={row.value} onChange={(e) => invite.send(E.rows.key(row.key).Changed({ value: e.target.value }))} />
    {row.error && <span>{row.error}</span>}
    <button onClick={() => invite.send(E.RemoveInvite({ key: row.key }))}>Remove</button>
  </div>
))}
<button onClick={() => invite.send(E.AddInvite())}>Add</button>
```

The host raise addresses its copy as v4 rule 9 does: the payload mapper returns the `key`.

**The other cases under A.**

- **C2 (sparse).** `flashes: Flash({ length: "3 seconds" }).each("failedPins", { key: "id" })`. `PinFailed`
  appends `{ id }`; `Flash`'s `onDone` callback filling removes it. No copy per row, only per failure.
- **C3.** `challenges: Lockout(…).each("lockouts", { key: "challengeId" })` at the root: survives Back
  because the array is root memory. `PasswordAccepted` appends the id if absent; `onUnlocked` removes it.
  The sign-in's "re-add in the same turn" case disappears: the abandoned wrong-code handler writes
  "ensure present" into the array, and membership is computed once from the result.
- **C4.** `toasts: Toast(…).each("notices", { key: "id" })`, with a pausable dismiss schedule and
  `Hover` / `Unhover` events; its `onExpired` callback filling removes its key from `notices`. The
  removal is written by a part, so under rule 1 timing it ends the copy only in the follow-up
  turn: the snapshot published in between has `notices` without the key while `s.memory.toasts`
  (which views iterate) still holds the expired copy. This one-snapshot lag must be stated or
  closed (open question 1).
- **C5.** `Editor` trait with `mode` memory, a draft and an autosave debounce; `.each("issues", { key: "id" })`
  over the host's loaded rows.
- **C6.** `lineItems: Schema.Array(LineItem)` and plain selects. No trait, no `each`.

**Meets.** R1 (bounded by `max`), R2, R3, R4 (incarnations internal), R5 (by construction), R6
(ordered as the array), R7, R8, R9. K1 (membership is part of the turn), K2 (one template, a
declared path and key; `flow graph` draws one node marked "× invites ≤ 5"), K3, K4 (copy modes are
memory), K5 (`each` placement is structure; adding/removing is the host's behaviour), K6 (the path
and key are typed against the memory schema), K7 (keys and order are host data, persisted with it),
K8, K9.

**Costs.** One new placement modifier. A diff per commit over each `each` path (O(n) by key).
Two names per collection (the host array and the copies' view), which a later version could merge
by letting the view read `s.memory.rows` as `{ key, …element, …slice }` if host and copy fields
never collide.

**Open questions for A.**

1. Close the C4 lag: either apply membership removals **at commit** (removal cannot refuse; only
   `onLeave` would need its own turn), or document that views read copies and the copies trail
   the array by one snapshot when a callback removes.
2. Is membership read from host memory only, or also from activities (server rows, C5)? Prior art
   says data that changes outside the turn (SCADE inputs) is sampled at the step; Flow State would
   need activity data to be turn-owned first. Recommend host memory only.
3. Duplicate keys in the array: reject at commit (`InvalidTurn`).

### B. `pool`: membership by statement, copies may finish (Céu / Erlang)

**Prior art.** Céu `pool[N] T` + `spawn T in pool`, removal when the body ends; Erlang
`simple_one_for_one` + `start_child` + child exit; UML parts `[0..N]`.

**Rule.** `T.pool({ max })` places a homogeneous set. Host transitions get two effect lists,
`spawn` and `end`, beside `raise`. A trait may declare `finish: Flow.Exit({…})`-like **done**
ports: taking one removes that copy, and the host's filling is told (Céu's "removed when its body
terminates"). Membership lives in the runtime, readable as `s.memory.toasts` in creation order.

```ts
// definition
traits: { toasts: Toast.pool({ max: 5 }) },                  // new
// machine
on: {
  Notify: {
    target: "self",
    spawn: [E.toasts.spawn.from(({ event }) => ({ key: event.id, input: { text: event.text } }))],  // new
  },
},
traits: { toasts: { done: { Expired: { target: "self" } } } },   // new: a copy that finishes is removed
```

**Meets.** R1–R4, R6, R7, R9; K1, K2 (template static), K3–K8. **Weaker on** R5 (membership is
not data, so "the host's policy" is a guard on `spawn` again, close to v4's `canAdd`), R8 (C6 still
needs a plain array, so two models of "a list"), and K9 (who may spawn is written on the spawning
transitions, not on the collection). It also brings back the verbs v4 was criticised for, under
other names. Its advantage over A is C4: self-removal is first-class and has no lag.

### C. Fixed slots (Esterel `dopar`, SCADE `map` with reset)

**Rule.** `T.slots(n)` places `n` incarnations, addressed by index; occupancy is a per-slot
boolean the host sets, and occupying a slot resets it.

```ts
traits: { challenges: Lockout({ limit: 3, length: "5 minutes" }).slots(4) },  // new
// view: s.memory.challenges[i] is { occupied: false } | { occupied: true, …slice }
```

**Meets.** K2 and K7 at their strongest (the graph is literally `n` copies; nothing to diff), K1,
K3–K6, K8. **Fails** R9 (indices, not keys), R4 for domain ids (the host maps ids to slots
itself), and R1 beyond the static `n`. Worth recording because it is what v4 already supports by
placing a trait `n` times, and as the model `flow check` can unfold for a bounded `each`.

### D. Keyed schedules on the host, no copies (Céu `await … until id`, Erlang `send_after` per key)

**Rule.** A host schedule may be keyed: `per: ({ event }) => event.id` arms one timer per key;
`restartOn` and cancellation act per key; the firing carries the key.

```ts
schedules: {
  flash: { schedule: "3 seconds", send: E.FlashOver, armOn: [E.PinFailed], per: ({ event }) => event.id },  // new
},
memory: { flashing: Flow.initial(Schema.Array(Schema.String), []) },
```

**Meets.** C2 and the timer half of C1 with almost no new concepts; R8 and K1–K9. **Fails** R2
(behaviour is not packaged, so C3–C5 are rewritten per machine) and R3 for anything beyond one
timer (C4's pause, C5's mode). Useful as a *complement* to A for "data rows plus one timer", not
as the general answer.

## 5. Recommendation

1. Take **A** as the model: membership is host data; copies follow it, keyed, in order. It is the
   one direction where every v4 complaint (minted keys, `owner`, `canAdd` / `canRemove`,
   incarnations as API, verbs added per review finding) disappears rather than being renamed, and
   it reuses a rule v4 already has (`resetOn` timing).
2. Keep v4's **incarnation fencing**, but internal, as Céu, Erlang, P and Rhapsody all do.
3. Let `flow check` analyse the template once (P's split) and let Stories / `model()` explore up to
   `max` copies; `slots` (C) is the unfolding they can use.
4. Settle open question A.1 (the C4 lag) before anything else: it is where B is better than A.

## Sources

- Céu manual v0.30: <https://github.com/ceu-lang/ceu/blob/master/docs/manual/v0.30/ceu-v0.30.md>
- Céu manual v0.10 (organisms, pools, iterators): <https://github.com/ceu-lang/ceu/blob/pre-v0.40/docs/manual/v0.10/manual-v0.10.md>
- F. Sant'Anna, R. Ierusalimschy, N. Rodriguez, *Structured Synchronous Reactive Programming with Céu*, Modularity 2015, §3.1–3.2: <https://www.ceu-lang.org/chico/ceu_mod15_pre.pdf>
- Céu publications: <https://www.ceu-lang.org/publications.html>
- J.-L. Colaço, B. Pagano, M. Pouzet, *SCADE 6: A Formal Language for Embedded Critical Software Development*, TASE 2017, §III, §VI: <https://www.di.ens.fr/~pouzet/bib/tase17.pdf> (HAL: <https://hal.archives-ouvertes.fr/hal-01666470>)
- M. Pouzet, Synchron 2024 slides: <https://uni-bamberg.de/fileadmin/ba7dk97/slides-pouzet-forward-synchron-2024.pdf>
- SCADE `mapfoldw` grammar, quoting the Language Reference 8.5: <https://innovationspace.ansys.com/forum/forums/topic/correct-usage-of-mapfoldw-iterator>
- Esterel v7.60 Reference Manual, §5.7 signal arrays, §8.9.2 `for … dopar`: <https://www.college-de-france.fr/media/gerard-berry/UPL681247605558671166_Esterelv7.60_ReferenceManual.pdf>
- KIELER SCCharts syntax, For Regions and references: <https://github.com/kieler/semantics/wiki/Syntax>
- OMG UML 2.5.1 (Structured Classifiers): <https://www.omg.org/spec/UML/2.5.1/PDF>; <https://uml-diagrams.org/structured-classifier.html>
- IBM Rhapsody 7.4 C++ Framework Execution Reference (event cancellation, timeouts, `OMReactive`): <https://public.dhe.ibm.com/software/rationalsdp/documentation/product_doc/Rhapsody/version_7-4/framework.pdf>
- IBM support, event queues per active class: <https://www.ibm.com/support/pages/node/735535>; `Destroy()` guidance request: <https://ibm-ai-apps.ideas.ibm.com/ideas/RHPY-I-45>
- Rhapsody in C overview (part multiplicity naming): <https://www.comp.nus.edu.sg/~abhik/CS4271/module2011/lab1/rhapsody_c_overview.pdf>
- W3C SCXML 1.0: <https://www.w3.org/TR/scxml/>
- Stately, *Spawn*: <https://stately.ai/docs/spawn>; *Persistence*: <https://stately.ai/docs/persistence>
- P manual, statements and state machines: <https://p-org.github.io/P/manual/statements/>, <https://p-org.github.io/P/manual/statemachines/>; `halt`: <https://github.com/p-org/P/blob/master/Docs/docs/manual/expressions.md>
- Erlang `supervisor`: <https://www.erlang.org/doc/apps/stdlib/supervisor.html>; Elixir `DynamicSupervisor`: <https://hexdocs.pm/elixir/DynamicSupervisor.html>
