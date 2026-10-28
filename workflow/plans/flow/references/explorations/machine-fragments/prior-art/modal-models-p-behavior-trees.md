# Prior art: modal models, P, behaviour trees and reducers

**Status:** research note, not a proposal. It reads [proposal-v3.md](../proposal-v3.md) (§1, §2, §5,
§6) against four families of systems that combine state machines with data, verify them, or reuse
behaviour: Ptolemy II modal models, the P language (and its systematic-testing descendants), behaviour
trees (BehaviorTree.CPP, Unreal Behavior Trees and StateTree), and Elm/Redux reducers. Problem codes
(L1, E5, D7, ...) are from [principles.md](../principles.md) §4. Rule numbers are v3 §2.4; P1–P13
are v3 §5. Sources are listed at the end; a claim marked *(recall)* is from general knowledge of the
system and was not re-read from a primary source for this note.

## 1. The systems

### 1.1 Ptolemy II modal models

**How behaviour composes.** A *modal model* is an FSM (the *controller*) whose locations (modes)
each have a *refinement*: any Ptolemy actor, including another FSM, a dataflow graph or a
discrete-event model. Concurrency is **not** a feature of the FSM. There are no AND-states; two
concurrent machines are two modal-model actors composed under a concurrency director (SR, DE,
dataflow). Lee and Tripakis say this directly: "AND states can still be modeled in Ptolemy, using
concurrent ModalModel actors", with a model of computation such as SR or DE defining the
composition ([EOOLT 2010](https://ep.liu.se/ecp/047/002/ecp4710002.pdf), §6). This is the *charts
thesis: "the concurrency model should be selected independently of the decision to use hierarchical
FSMs" ([Girault, Lee, Lee 1999](https://www2.eecs.berkeley.edu/Pubs/TechRpts/1997/3275.html)).
Communication is through ports, not broadcast or name matching, which the paper calls more
modular (§6, footnote 7).

**Execution semantics (precise).** Every actor implements an abstract semantics: `fire` computes
outputs from (state, input) without changing state; `postfire` commits the new state (§3). For a
modal model in location *lᵢ* with refinement *Mᵢ* (§4.2):

1. **No controller transition enabled:** the modal model behaves exactly like *Mᵢ* (fire and
   postfire it).
2. **A preemptive transition enabled:** *Mᵢ* is **not** fired. Only the transition's output action
   is emitted. The controller moves; *Mᵢ*'s timers are **suspended**; the destination *Mⱼ* is resumed
   (timers resumed) or, if the transition is a **reset transition**, re-initialised to its initial
   state, timers included.
3. **Only non-preemptive transitions enabled:** *Mᵢ* fires **first**; the transition's output action
   is applied to *Mᵢ*'s outputs and its set action to *Mᵢ*'s postfired state. Then as in case 2.

The modal model's state is the **product of every refinement's state** (S = S_c × S₁ × … × Sₙ).
Inactive refinements are *frozen*, not destroyed: "the state ... does not evolve at all. This
includes in particular the timers of Mᵢ, which are suspended until lᵢ is re-entered" (§5). The
default transition is the history one; reset is opt-in per transition. Other transition kinds:
*default* transitions, taken when no other is enabled ("their guard is the negation of the
disjunction of the guards of all other transitions"), and *nondeterministic* transitions, where
overlapping guards are legal only if marked and rendered in red (§2).

**Problems it was built for.** Mixing control modes with continuous or dataflow computation in
cyber-physical models, with a semantics that is *modular*: the meaning of a composite comes only
from the fire/postfire functions of its parts. §5 discusses the alternatives it rejected:

- **Non-freezing** (all refinements live, only the active one receives inputs) is rejected because
  the switch/select pattern already expresses it, and because "behavior of a subsystem continues
  while the latter is inactive", which makes it depend on how long it was away.
- **Timers live, the rest frozen** is rejected because "for many components the state is
  intrinsically bound to time".

### 1.2 The P language and systematic testing

**How behaviour composes.** A P program is a set of machines with an unbounded FIFO inbox each,
communicating by asynchronous `send`, created dynamically with `new`
([P manual: state machines](https://p-org.github.io/P/manual/statemachines/),
[statements](https://p-org.github.io/P/manual/statements/)). Machine variables are machine-wide;
there is no per-state memory. The 2013 language had **call transitions**, "a subroutine-like
abstraction for machines". The callee's states are pushed on a stack, and the callee returns by
raising an event that the caller handles ([Desai et al., PLDI 2013](https://microsoft.com/en-us/research/wp-content/uploads/2016/02/pldi212_desai.pdf),
§2). If no handler is found at the top of the stack, the callee **is popped** and the caller gets
the event (POP rules, §3). The current manual documents `goto`, `raise`, `defer` and `ignore`, but
not call transitions.

**Execution semantics (precise).**

- Each state has an entry function, an exit function, handlers, a **deferred set** and ignored
  events. To dequeue, the machine scans from the front and takes "the first event that is not in the
  deferred set". Deferral "does not change the FIFO buffer" (manual; PLDI §2).
- `raise` handles an event immediately in the current state, before any queued event. `goto` runs
  exit, then entry of the target, and may pass a payload to entry.
- **Responsiveness:** an event that is dequeued in a state with no handler, defer or ignore is an
  **unhandled-event error** that the verifier reports. To stop programs silencing it by deferring
  everything, a default liveness check rejects events "deferred forever" (PLDI abstract and §3.2).
- **Spec monitors** observe chosen events synchronously ("executed synchronously at that point").
  They may not `send`, `new` or `receive`. Safety is checked with `assert`. For liveness, a state is
  marked `hot` ("intermediate"), and the checker requires that every execution "eventually end[s]
  in a non-hot state" ([P manual: monitors](https://p-org.github.io/P/manual/monitors/)).
- **Ghost machines** model the environment nondeterministically and are erased at compile time; a
  type system makes the erasure semantics-preserving (PLDI §1).

**Verification.** The checker controls every scheduling and modelling choice, runs a test many times
under different schedules, and emits a replayable `.schedule` file and a readable trace for each bug
([Using P](https://p-org.github.io/P/getstarted/usingP/)). Each test case checks four things: no
unhandled events, all assertions, no deadlocks, and all monitors
([test cases](https://p-org.github.io/P/manual/testcases/)). The 2013 paper used **delay-bounded
scheduling**. A deterministic default scheduler is allowed to deviate at most *d* times, so the
number of schedules "is independent of execution length and exponential in d". The default follows
the causal order of events, on the expectation that "most bugs ... [are] found using low values of
the delay bound" (PLDI §1). Coyote, P's C# sibling, applies the same idea to ordinary code:
"declare all sources of non-determinism", let the tester choose them, and replay the bug trace
([Coyote](https://microsoft.github.io/coyote/concepts/concurrency-unit-testing/)).

**Problems it was built for.** The Windows 8 USB driver stack: asynchronous protocols in which an
event arriving in an unexpected state was the dominant bug class, and model and code drifted apart.

### 1.3 Behaviour trees

**How behaviour composes.** A tree of nodes is *ticked* from the root. Each node returns SUCCESS,
FAILURE or RUNNING. Control nodes (Sequence, Fallback, Parallel) decide which children to tick;
decorators wrap one child to transform its result, repeat it or halt it
([BT basics](https://www.behaviortree.dev/docs/learn-the-basics/BT_basics)). Reuse comes from
**subtrees with ports**: "any tree and subtree use a different instance of the Blackboard", so the
parent must "explicitly connect the ports of a tree to those of its subtrees". The remapping lives
in the XML, not in node code ([subtree ports](https://www.behaviortree.dev/docs/tutorial-basics/tutorial_06_subtree_ports)).
The motivating claim is modularity and reactivity over FSMs, which "produce brittle behaviors as
complexity grows" ([Colledanchise and Ögren](https://arxiv.org/abs/1709.00084)).

**Execution semantics (precise).** Memory versus reactivity is a per-node choice
([SequenceNode](https://www.behaviortree.dev/docs/nodes-library/SequenceNode)):

| Node | child FAILURE | child RUNNING |
| --- | --- | --- |
| Sequence | restart | tick that child again |
| ReactiveSequence | restart | restart: re-check earlier conditions on every tick |
| SequenceWithMemory | tick that child again | tick that child again |

- When a ReactiveSequence's earlier condition turns false, its RUNNING child is **halted**. BT.CPP
  allows only one asynchronous child under a ReactiveSequence
  ([API](https://docs.ros.org/en/api/behaviortree_cpp/html/classBT_1_1ReactiveSequence.html)).
- Halting runs a node's `halt()` and then its `_onHalted` post-condition script. Pre-conditions
  `_skipIf`, `_failureIf`, `_successIf` and `_while` are blackboard expressions attached to any
  node ([tree_node.h](https://docs.ros.org/en/api/behaviortree_cpp/html/tree__node_8h_source.html)).
- **Unreal Behavior Trees:** decorators have *observer aborts* (`Self`, `Lower Priority`, `Both`).
  When a watched blackboard condition changes, the running subtree is aborted, or a higher-priority
  branch preempts a lower one
  ([decorators](https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-behavior-tree-node-reference-decorators?lang=ja)).
- **Unreal StateTree** is a hierarchical state machine with BT-style selection
  ([overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-state-tree-in-unreal-engine)):
  - Each state holds several **tasks** that "run concurrently as long as the State remains active".
  - **Global tasks** are active "between the Tree Start and Stop events".
  - Transitions fire on a task's completion, success or failure, or on conditions. They are tried
    "starting from the leaf State and progressing upwards toward the root".
  - **Linked subtrees** take **parameters**.
  - Property bindings let tasks read earlier tasks' outputs in the same or a parent state.
- **Per-node memory:** Unreal shares node templates between agents and gives each running tree a
  per-node memory block. StateTree gives each task instance data for its activation *(recall)*.
  Dynamic populations are handled by running **one tree instance per agent or entity** (Mass runs a
  StateTree per entity) *(recall)*. The tree's shape stays static. BT.CPP v4's loop decorators
  iterate a queue on the blackboard rather than creating child instances *(recall)*.

**Problems it was built for.** Game AI and robotics. Agents must react to world changes mid-action,
which needs preemption with clean halting. Designers also reuse behaviour (patrol, flee, use cover)
across many agents.

### 1.4 Elm and Redux reducers

**How behaviour composes.**

- **Elm:** a child is a `(Model, Msg, update, view)` quadruple nested by wrapping its messages
  (`Html.map`, `Cmd.map`). Each level forwards explicitly. Effects are data (`Cmd`) that the runtime
  runs. The official guide warns that "actively trying to make components is a recipe for disaster
  in Elm". It recommends helper functions over the existing model, with modules built around types
  ([Elm guide: structure](https://guide.elm-lang.org/webapps/structure)).
- **Redux:** `combineReducers` gives each slice reducer **every** action, which is broadcast
  without addressing *(recall)*. Lists of instances are kept **normalised**, `byId` plus `allIds`
  (`createEntityAdapter`), so that "a portion of your store [is treated] as if it were a database"
  ([normalizing](https://redux.js.org/usage/structuring-reducers/normalizing-state-shape)).
  Reducers are pure; I/O lives in middleware or thunks.

**Problems they were built for.** Making state change one pure, replayable function, for
time-travel debugging and deterministic tests, with effects described rather than performed.

## 2. Problems Flow State has not considered yet

Each item below is outside the A/D/E/H/L/T lists of principles.md §4, or is listed there as
"allowed by convention". Each comes with a failure scenario in Flow State terms.

### N1. Deliveries into an absent list instance (rule 8 × rule 9)

Rule 8 says a delivery chain must end in events "the child handles unguarded"; rule 9 says an event
for an absent key is `Unhandled`; rule 7 says one refusing part refuses the whole turn. `flow check`
cannot know which keys are present.

**Scenario.** The invite page runs a host commit `checkEmail` per row and raises
`E.invites.key(k).Checked` from its success outcome. The user removes row `invites#2` while its
check is in flight. The fenced commit is still live, because it is fenced to the host's INVITE
state, not to the row (P2). When the outcome arrives, the raise targets an absent key. Either the
whole delivery turn refuses, so a server answer is refused and rule 8's promise breaks, or the
runtime has to drop it silently.

3.1 avoids this only by convention: it raises `Add` before `Start` on `lockouts`. Ptolemy and BTs
never meet this case. Ptolemy refinements are never destroyed, and a halted BT branch takes its
running actions with it.

### N2. Key reuse lets a stale result land on a new instance (L2/L8 at row level)

With author-chosen keys (`key: Schema.String`), the user removes `a@x.com`, re-adds `a@x.com`, and
the first row's late `checkEmail` result lands on the **new** row. P11 gives timer armings ids, and
Runtime O3 gives actor incarnations ids so that "no outcome ... from an old incarnation ever reaches
a new one". List instances have no such id. This is the row-level version of L2.

### N3. Peer-actor messages are unprotected

Rule 8 covers server and clock deliveries only. An actor-to-actor `send` (Runtime O4) is a public
event, so it may be refused or `Unhandled` and is then dropped.

**Scenario.** A ticket-list actor sends `TicketRenamed` to an editor actor that is inside the
`CANCELLING` subroutine (`Confirm`). Neither `CANCELLING` nor the root handles it. The rename is
lost, and after `Declined` the editor shows the old title. P treats exactly this as its primary
error, the unhandled event, and gives the author two declared escapes: `defer` and `ignore`.
CommandLine O5 warns about "unhandled events" and "unensured send targets" in general, but not
about a known sender reaching a state that cannot take the event.

### N4. Liveness: a waiting state with nothing that can end the wait

Rule 8 checks that each delivery that *can* arrive is handled. Nothing checks that a waiting state
has a delivery that *will* arrive. Suppose a refactor moves `verify` from the transition into
VERIFYING to a sibling transition, or a `when: false` activity never starts. Then VERIFYING has no
outstanding fenced commit, no armed schedule and no subscription. Every user event there is
refused, and the actor is stuck.

This is L6 (silent admission) in a new form that P9 does not cover. P's `hot` states state the
intent ("this state is transitional") and let the checker report executions that end in it.
CommandLine O5's "likely stuck states" warning is a heuristic with no declared intent behind it.

### N5. Conditions over keyed data that change without an event

Lane-only changes "publish captured lanes without running handlers, guards, updates, actions,
schedules, restartOn or onContext" (Machines O6). A node whose meaning depends on data has no way to
leave when the data changes, unless the author maps a subscription's `value` outcome to an event and
handles it everywhere it matters.

**Scenario.** The editor is in `EDITING.CONFIRM_DISCARD` for ticket 42, and another tab deletes the
ticket. The entity lane now reads "deleted", but no turn runs, the dialog stays, and Save later
fails. BTs solve this with reactive conditions: ReactiveSequence, `_while`, and Unreal observer
aborts with halting. v3's `resetOn` does not help, because it runs only after a turn.

### N6. Data dropped when the host leaves (D7)

A subroutine abandoned by a host transition (rule 6) loses its memory with no hook. BT nodes get
`halt()` and `_onHalted`; Ptolemy keeps the frozen refinement. principles.md D7 records this as "by
convention". In v3 terms, a `PickAddress` subroutine with a half-typed address, abandoned by a root
`SessionExpired`, loses the draft. The host cannot read it in the leaving turn's `updateMemory`,
because the subroutine's slice is pre-turn readable, but no rule says the host should copy it, and
that copy would be D1.

### N7. Interleavings are tested by hand

Stories replay deterministically. Testing O5's `model()` explores event sequences, and its candidate
list may include "declared operation outcomes and schedules". Testing O6's `propertyTest` injects
network faults for domains. Nothing searches **orderings of a machine's own deliveries against user
events** and checks rule-level properties along the way. P2, P10 and rule 6 are exactly about those
orderings: a result before or after Back, a late third strike, `abandoned` racing a new entry.
Today every such race is a hand-written Story; 3.1 lists six of them. P's experience is that this
class of bug is found with a small number of deviations from the causal order.

## 3. Validation and divergence

### 3.1 Where v3 matches established semantics

| v3 | Prior art | Comment |
| --- | --- | --- |
| Rule 7: one turn; guards and mappers read the pre-turn snapshot; one publication; whole-turn refusal | Ptolemy `fire` (no state change) then `postfire` (commit) | Same split. `check()` (Machines O4) is a fire without postfire. Ptolemy requires `F` and `P` to be total, which is v3's "deliveries are never refused". |
| Rule 7: callbacks notify the host in the same turn; the host reacts to the fragment's output | Ptolemy **non-preemptive** transitions: the refinement fires first, and the transition reads its output | Callbacks are Ptolemy's non-preemptive pattern. A host transition that exits the node without the fragment reacting is the preemptive case. v3 gets both without naming them. |
| Rule 8: deliveries end in an unguarded alternative | Ptolemy **default transitions** ("negation of the disjunction" of the others) | Same idea; v3 enforces it where Ptolemy only offers it. |
| Rule 8 as a whole | P's unhandled-event check | v3 is P's responsiveness restricted to deliveries. User events may be refused because a UI can disable the control; P has no such channel. Sound, except for peer sends (N3). |
| Rule 12: overlap behind a non-state guard is a defect and a warning | Ptolemy marks nondeterministic transitions explicitly (red) | v3 is stricter: ordered alternatives give priority, and overlap across fused parts is never legal. Good. |
| §2.1 traits at root and `.at`; subroutines with exits; `input` | StateTree **global tasks**, per-state **tasks** that run concurrently while the state is active, **linked subtrees with parameters**, transitions on task completion, success or failure | Close structural match from an independent, production design. Traits are tasks; subroutines are linked subtrees; exits are completion transitions; O2 leaf-to-root fallthrough matches StateTree's transition search order. |
| Rules 2–4 and 10: contracts, no reaching inside, each level fills its own children | BT.CPP subtrees: isolated blackboards and explicit port remapping in the tree definition, not in node code | Same choice. BT.CPP's later `_autoremap` *(recall)* shows that explicit remapping costs authors (A1). v3's instance-path sends (`E.invites.key(k).Changed`) avoid most of it. |
| Rule 3: fragments do no I/O; the host runs operations | Elm `Cmd` as data; pure Redux reducers with I/O in middleware | Same layering. Elm and Redux show it scales, and that the cost is the I/O policy living once per host (v3 §1's stated trade). |
| Rule 9: keyed instances in order, `{ key, ...slice }` | Redux normalised `ids` plus `entities` | Same shape; addressing by key rather than index is the established answer. |
| Instance-path addressing (`E.pager.Next`), no forwarding | Elm `Html.map` forwarding (A1 in full); Redux broadcast to every reducer (no addressing) | v3 avoids both known failure modes: Elm's forwarding cost and Redux's "every reducer sees every action", which is H1 by default. |
| §6 no AND-regions in the host | *charts and Ptolemy: concurrency comes from composing FSMs, not AND-states inside one | The constraint is right; see 3.2 for what it should *not* exclude. |
| Rule 1: schedules stop with their node (L1) | Ptolemy freezes inactive refinements, timers included | Both keep inactive behaviour from evolving. Ptolemy suspends; v3 discards. |

### 3.2 Where v3 differs, and may be weaker or reinventing

1. **Fresh-only lifetime (rule 1, §6 "node memory").** In Ptolemy, history is the default and reset
   is a per-transition choice. In v3 every placed fragment is fresh on activation, and the only way
   to keep data across a visit is to hoist it to the root, as 3.1 does with `lockouts` and
   `wrongAttempts`, plus §7's open question 1. Ptolemy and StateTree treat "keep this mode's state
   while away" as basic.

   v3 already has the needed parts: `S.X.history` for position (P5) and `resetOn` for "reset when
   this value changes" (rule 1). What it lacks is retention across absence. The section 6 cost
   ("resetting a few host keys by hand") understates it: 3.1 needs a root list keyed by challenge
   only because node-scoped state cannot survive Back.

2. **Parallel stateful pieces (§6 "parallel-region traits").** v3 says regions "change Machines O2".
   Ptolemy's design shows they need not. The host keeps exactly one active leaf, and a *trait* may
   own its own one-leaf FSM, composed synchronously within the turn. Rule 7 is already a synchronous
   (SR-style) reaction, with an acyclic raise/notify graph standing in for SR's fixed point. The
   obstacle is one clause, "at most one part changes state". It assumes there is one state to
   change; it should read "at most one change per state component". Today such pieces are modelled
   as "a trait whose modes are memory", which hand-encodes an FSM in memory. `flow check` cannot
   see its transitions, and `token.is`, history and per-state schedules do not apply to it.

3. **Subroutine abandonment vs P's pop.** P (2013) pops a callee when an event is unhandled at the
   top of the stack, so the caller handles it and the callee is gone. v3 lets the event fall
   through without abandoning (rule 6), so the dialog survives a root `"self"`. v3's choice suits
   UI better and is consistent with Ptolemy's non-preemptive case. It is a divergence, not an error.

4. **No `defer`.** P's answer to "this event is valid, but not now" is deferral, with a liveness
   check against deferring forever. v3's answer for user events is refusal (`deny`), which suits a
   UI. For peer sends (N3), refusal loses data. Deferral conflicts with Flow State's plain FIFO
   mailbox (Runtime O4), persistence of a reordered queue, and Story determinism. It should stay out
   unless N3's static check proves insufficient.

5. **Testing is example-based where P is exhaustive within bounds.** v3's correctness rests on rules
   6, 7, 8 and P2/P10, and each is a property over orderings. Testing O5 explores but asserts
   nothing; O6 asserts domain properties but not machine rules. P's lesson is that the rules a
   language enforces should also be the default oracle of its checker. P's default oracle is "no
   unhandled events, no assertion failure, no deadlock, monitors hold".

6. **Reactivity to data (N5).** BT's main contribution, conditions re-checked continuously with
   clean halting of running work, has no counterpart. Flow State is event-driven by design, and
   ticking is wrong for it, but keyed data does change without events.

7. **Per-row workflows.** Dynamic populations of stateful behaviour are handled in BT and StateTree
   by **one tree instance per entity**, and in P by `new` machines. v3 has keyed trait lists
   (stateless, no I/O) for rows and shared actors keyed by id (Runtime O3) for independent
   workflows. Nothing says which to use.

   The trade-off is real. A list trait gives atomic cross-row rules ("all invites valid",
   select-all) in one turn. An actor per row gives each row its own fencing, retries and I/O, but
   cross-row rules then become multi-actor protocols, which is exactly where P says interleaving
   bugs live. A row that needs its own upload with retries currently fits neither cleanly (N1, N2).

8. **Elm's warning about components.** Elm's guide argues against stateful components at all.
   v3's trait is justified only when the piece has events, schedules or a lifetime of its own:
   `Countdown` yes; a `Field` with no schedule is arguable. This is a guidance point, not a
   semantic one. Agent-authored code tends to over-componentise, so the authoring guide should state
   the test: use a trait when the piece owns events, schedules or a lifetime; otherwise use a helper
   over memory.

## 4. Recommendations, ranked by value

### R1. Close the list-delivery hole with instance incarnations (N1, N2). High value, low cost.

- **Adds.** Each list instance gets an incarnation id, as actors have (Runtime O3) and armings have
  (P11).
- **Rule.** A raise into a list instance, along a chain sourced from a delivery (rule 8), is
  addressed to the incarnation captured when the commit started, i.e. `key` plus incarnation, not
  bare `key`. If that incarnation no longer exists, the raise is a no-op recorded as evidence. It is
  not `Unhandled`, and the turn does not refuse. Rule 9's `Remove` already ignores absent keys, so
  this extends the same tolerance to deliveries.
- **Optional.** A commit may be fenced to a list instance
  (`fence: E.invites.key(k)` *(syntax draft)*), so removing the row sends its result to `abandoned`
  exactly as leaving a state does (P2/P10).
- **Replaces.** Rule 9's "one for an absent key is Unhandled" gets the qualifier "for events from a
  view or a host transition; from a delivery chain, a dead incarnation is dropped with evidence".
  The 3.1 `Add`-before-`Start` idiom is then unnecessary for correctness.
- **Cost.** One hidden field per instance, one rule sentence, one `flow check` simplification (it no
  longer needs to prove key presence). Stories need deterministic incarnations, for example
  `invites#2@1`.

### R2. Retained node scope: Ptolemy history versus reset for `.at` traits and node memory (§6, §7.1). High value, moderate cost.

- **Adds.** A placement option, `.at("TWO_FACTOR", { keep: true })` *(syntax draft)*. While the node
  is inactive, the trait's memory is **frozen** (Ptolemy §5), not dropped. On re-activation it
  **resumes** unless its `resetOn` value differs from the value frozen with it, in which case it is
  fresh.
- **Node memory.** The same rule gives §6 its node memory. A compound may declare `memory` that is
  written by handlers at or below it, typed as `.at` slices are (rule 1), and frozen or reset on the
  same terms.
- **Effect on 3.1.** `wrongAttempts` moves under `TWO_FACTOR` with
  `resetOn: ({ memory }) => memory.challengeId`. This answers open question 1 without a second
  list.
- **Schedules while frozen.** Ptolemy suspends them, which is right for simulated clocks but wrong
  for UI deadlines: a 5-minute lockout must keep counting while the user is on PASSWORD. Use the
  semantics the plans already define for restore (Machines O5): "a Duration preserves its deadline
  and fires once if overdue". In a frozen scope, a schedule keeps its `dueAt`. It is not delivered
  while frozen. On resume, it fires once if it is overdue. A multi-step Schedule restarts at step
  one.
- **Fencing is unchanged.** Commits are still fenced to the activation (P2). A frozen scope never
  receives outcomes; late results still go to `abandoned`, which may now write the frozen slice, as
  it already writes host memory.
- **Replaces.** Rule 1's "Leaving the node ... drops its memory" becomes "... drops its memory
  unless placed with `keep`". The §6 "Node memory" bullet is resolved. Snapshot typing (Machines O8)
  becomes "a kept slice is present while frozen". The frozen state persists with the actor, as P5's
  history child does.
- **Cost.** Snapshot size grows. Persistence must carry frozen slices. `abandoned`'s rule-6 check
  must treat a frozen scope as idle. Subroutines stay fresh-only: they are things the actor *goes
  into*, so keeping them would reintroduce L3.

### R3. Systematic exploration as the default oracle: a P-style checker over `model()` (N4, N7). High value, moderate cost.

Extend Testing O5 rather than add a new tool.

- **Environment from descriptors (ghost machines for free).** While a fenced commit is outstanding
  on a path, each declared outcome (`success`, each failure tag, `unknown`, `interrupt`, `defect`,
  `notSent`, `retrying`) is a candidate. Each armed schedule's firing is a candidate. User events
  are the listed `events`. Exploration still starts no Runtime (O5 unchanged). Outcome values come
  from fixture-declared samples, and a missing sample makes the path inconclusive, never a pass.
- **Default oracle = the language rules.** At every explored step, check:
  - no delivery refused (rule 8);
  - no `abandoned`-sourced move out of busy work (rule 6);
  - no pre-commit defect (rule 7, rule 12);
  - no outcome reaching a later activation (P2);
  - author `invariants: (snapshot) => true | deny(...)`, which are P's `assert` monitors.
- **Liveness via hot states.** A definition may mark states `hot` *(word from P)*, as in VERIFYING,
  SUBMITTING and UNSURE. A path that is quiet (no candidate deliveries) while in a hot state is a
  liveness failure. Statically, `flow check` errors when a hot state can be entered with no
  outstanding fenced commit, no armed schedule and no running activity. That is N4, and it turns
  "likely stuck states" into a declared check.
- **Delay bounding.** The default schedule delivers each outstanding result before the next user
  event. A *delay* postpones one delivery past one later user event or timer firing. Explore
  schedules in order of their number of delays. Zero is "results arrive promptly"; one is the single
  late result behind L2, L5, L7 and E5. The default bound is 1 or 2, and exploration reports
  `truncated` as today.
- **Counterexamples are Stories** (`path.story` already exists) and replay through real fixtures.
- **Replaces/adds.** Adds an `invariants` option and a `check` mode to Testing O5, and a `hot` state
  marker to Machines O2. Adds a CommandLine O5 error, "hot state without a pending delivery".
- **Cost.** The candidate generator needs each operation descriptor's outcome set (already typed).
  `stateKey` must also include outstanding-commit and armed-schedule identity, or the search
  under-explores. Multi-actor exploration (sends) is a later, larger step; R4 covers the static part
  now.

### R4. Static responsiveness for peer sends (N3). Medium value, low cost.

- **Adds.** A `flow check` warning, using the app graph it already loads: "machine A's
  `send(ref, E.X)` can reach machine B in state S where X is Unhandled". "Can reach" is
  over-approximated by every state of B unless B marks X as `ignore` *(word from P)* in S or an
  ancestor. An explicit `ignore: [E.X]` on a node documents intended dropping and silences the
  warning.
- **Not added.** `defer` (3.2 item 4).
- **Replaces.** Sharpens CommandLine O5's generic "unhandled events" warning.
- **Cost.** One analysis over existing send declarations, plus one optional node key.

### R5. Stateful traits: synchronous orthogonal components without host regions (§6). Medium-high value, high cost; do it as its own proposal.

- **Adds.** A `trait` may declare `states` and `default`, giving it its own single active leaf. Its
  handlers may target its own tokens. It cannot take exits; it is still something the actor
  *has*. The host keeps Machines O2's single active leaf.
- **Turn rule.** Rule 7's "at most one part changes state" becomes "at most one change per state
  component (the host, each trait instance)". Each component's change is applied in the one fused
  transition, and the publication is still one. Schedules may be declared on trait states, with
  entry and exit semantics as in O5.
- **What it buys.** Hold-to-confirm, upload rows (with R1 lists, a per-row FSM), and connection
  indicators all get real states. `flow check` analyses them, `token.is` works
  (`S.hold.HOLDING.is(s.traits.hold)` *(draft)*), and nobody hand-encodes modes in memory. This is
  Ptolemy's "AND states as concurrent modal models", and StateTree's concurrent tasks given states.
- **Cost.** A snapshot field for component leaves. `flow check` analyses each component separately,
  and its product only where raises and notifies couple them (that coupling graph is already
  acyclic by rule 7). Persistence adds component leaves. It needs a full review against principles
  E1–E5.

### R6. A `leaving` callback on subroutines (N6, D7). Medium value, low cost.

- **Adds.** A subroutine contract may declare `optional` `onAbandoned: { ...payload }`, BT's
  `_onHalted`. It is notified, fused into the abandoning turn (rule 7), with a payload mapped from
  the subroutine's **pre-turn** memory. It cannot target anything, since the host is already
  leaving. The host fills it like any callback, typically `updateMemory` to keep a draft.
- **Replaces.** principles.md D7 moves from "by convention" to "prevented where the fragment author
  declares it".
- **Cost.** One port kind, plus the rule that it may write only keys the leaving transition does
  not (the P10 pending-run rule already exists).

### R7. Data-conditioned leaving (N5). Medium value, moderate cost; keep it narrow.

- **Adds.** A node may declare
  `while: { select: ({ activities, memory }) => boolean, event: E.X }` *(draft)*. After **every**
  publication, lane-only ones included, a selection that turns false enqueues `E.X` as a delivery
  (rule 8 applies, so X must be handled unguarded in that node). The baseline is silent at
  activation, as `restartOn` and `onContext` are. This is a Unreal "observer abort (Self)" expressed
  as an event, so turns stay event-driven and BT ticking is not introduced.
- **Replaces.** Adds a turn source to Machines O6's "lane-only changes ... without running
  handlers". It does not change that sentence for everything else.
- **Cost.** Lane publications must evaluate `while` selectors; the mechanics already exist in
  `onContext` (Machines O7). Selector defects follow O7.

### R8. Authoring guidance (no semantics). Low cost.

- **Lists or actors.** Use a keyed trait list when rows share a rule checked in one turn (validity,
  select-all, max). Use an actor per entity, keyed by id (Runtime O3), when a row owns its own I/O
  policy or outlives the page. Say that the second makes cross-row rules multi-actor protocols,
  which R3 does not yet explore.
- **Trait or helper.** Use a trait when the piece owns events, schedules or a lifetime; otherwise
  use a helper over memory (Elm's warning).
- **Name the Ptolemy kinds in the docs.** A callback is a non-preemptive reaction; a host exit is a
  preemptive one; a trailing unguarded alternative is a default transition. The terms are
  established and make rules 6–8 easier to explain.

## Summary

- **R1, a real hole.** A delivery that raises into a removed list row makes the turn refuse (rule 8
  × rule 9). With author-chosen keys, re-adding a row lets an old result land on the new row.
  Instance incarnation ids, as P11 and Runtime O3 already use, fix both at low cost.
- **R2, Ptolemy's lesson.** History versus reset is a per-entry choice, and inactive modes are
  frozen, not discarded. v3 is fresh-only. A `keep` placement with `resetOn` as the reset key gives
  §6 its node memory and answers §7.1 without root-hoisting. Kept schedules should reuse the
  restore rule (deadline kept, fire once if overdue), not Ptolemy's suspension.
- **R5, regions are not needed for parallel stateful pieces.** Ptolemy and *charts get concurrency
  by composing FSMs inside one reaction. Rule 7 already is that reaction. Letting traits own states
  only changes "one state change per turn" to "one per component".
- **R3, P's main lesson.** The language's own rules should be the checker's default oracle. Extend
  `model()` so that outstanding commits' declared outcomes and armed schedules are candidates, add
  invariants and `hot` states, and order the search by delay bound. The late-result races of P2,
  P10 and rule 6 are delay-1 schedules.
- **N4 and R3, liveness.** A `hot` state with no pending delivery is statically detectable.
- **R4, peer sends.** Peer `send`s are the one input P would call unhandled that v3 drops silently.
  A static `flow check` warning plus an explicit `ignore` covers this without `defer`.
- **Validated.** These v3 choices match prior art:
  - fire/postfire turns and `check()`;
  - callbacks as Ptolemy non-preemptive transitions;
  - trailing unguarded alternatives as default transitions;
  - rule 8 as P's responsiveness;
  - traits and subroutines as StateTree's tasks and linked subtrees (an independent production
    design);
  - contracts as BT.CPP's isolated blackboards with ports;
  - keyed lists as Redux's normalised entities.
- **Smaller additions.** An `onAbandoned` subroutine callback (BT `_onHalted`) fixes D7. A narrow
  `while` delivery (Unreal observer aborts) handles data that changes without events (N5).

## Sources

- E. A. Lee and S. Tripakis, *Modal Models in Ptolemy*, EOOLT 2010:
  <https://ep.liu.se/ecp/047/002/ecp4710002.pdf> (also
  <https://ptolemy.berkeley.edu/projects/chess/pubs/708/ModalModels_EOOLT-1.pdf>). Read in full for
  §§2–6.
- Ptolemy book, *Modal Models* chapter: <https://ptolemy.berkeley.edu/books/Systems/chapters/ModalModels.pdf>
  (not text-extractable here; cited for scope only).
- E. A. Lee, *Finite State Machines and Modal Models in Ptolemy II*, EECS-2009-151:
  <https://www2.eecs.berkeley.edu/Pubs/TechRpts/2009/EECS-2009-151.html>.
- A. Girault, B. Lee, E. A. Lee, *Hierarchical Finite State Machines with Multiple Concurrency
  Models* (*charts), IEEE TCAD 18(6), 1999; tech report: <https://www2.eecs.berkeley.edu/Pubs/TechRpts/1997/3275.html>.
- A. Desai et al., *P: Safe Asynchronous Event-Driven Programming*, PLDI 2013:
  <https://microsoft.com/en-us/research/wp-content/uploads/2016/02/pldi212_desai.pdf>. Read for §§1–3.
- P manual: <https://p-org.github.io/P/manual/statemachines/>,
  <https://p-org.github.io/P/manual/statements/>, <https://p-org.github.io/P/manual/monitors/>,
  <https://p-org.github.io/P/manual/testcases/>, <https://p-org.github.io/P/getstarted/usingP/>.
- Coyote: <https://microsoft.github.io/coyote/concepts/concurrency-unit-testing/>;
  <https://microsoft.github.io/coyote/ref/Microsoft.Coyote.Actors/StateMachine/RaiseGotoStateEvent/>.
- BehaviorTree.CPP: <https://www.behaviortree.dev/docs/learn-the-basics/BT_basics>,
  <https://www.behaviortree.dev/docs/nodes-library/SequenceNode>,
  <https://www.behaviortree.dev/docs/tutorial-basics/tutorial_06_subtree_ports>,
  <https://docs.ros.org/en/api/behaviortree_cpp/html/classBT_1_1ReactiveSequence.html>,
  <https://docs.ros.org/en/api/behaviortree_cpp/html/tree__node_8h_source.html>.
- M. Colledanchise and P. Ögren, *Behavior Trees in Robotics and AI*: <https://arxiv.org/abs/1709.00084>.
- Unreal Engine: Behavior Tree decorators (observer aborts):
  <https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-behavior-tree-node-reference-decorators?lang=ja>;
  StateTree overview: <https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-state-tree-in-unreal-engine>.
- Elm guide, *Structure*: <https://guide.elm-lang.org/webapps/structure>.
- Redux, *Normalizing State Shape*: <https://redux.js.org/usage/structuring-reducers/normalizing-state-shape>.
