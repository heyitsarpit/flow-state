# Prior art: synchronous languages

**Scope:** Esterel (including its constructive semantics and causality analysis), SyncCharts,
SCCharts with sequentially constructive (SC) semantics, Lustre and SCADE (including SCADE 6 state
machines), and Céu. Each is read against [proposal-v3.md](../proposal-v3.md) (sections 1, 2, 5) and
[principles.md](../principles.md) section 4. Rule numbers (rule 1–12) are v3 section 2.4, and
P1–P13 are v3 section 5.

**Sources.** The primary sources are listed at the end. Where a claim rests on the standard
literature and not on a page I could read in this session, it is marked _(from the literature)_.
Three PDFs (Berry's constructive-semantics book, the PLDI'14 SCCharts paper, and the TECS'14 SC
paper) could not be text-extracted here, so their content comes from abstracts, slides, the Kiel
documentation and the literature.

---

## 1. The systems

### 1.1 Esterel

**Composition.** Esterel is an imperative language of _modules_. A module declares input, output
and local signals. Reuse is `run M [signal A / B, …]`: the module body is **inlined** at the call
site, with its interface signals renamed onto the caller's. A local signal (`signal S in p end`) is
invisible outside `p`, so nobody outside can emit it. Composition operators are sequence (`;`),
synchronous parallel (`||`), `loop`, and the preemption operators below. The compiler produces
**one** reactive automaton or circuit for the whole program. No runtime instances exist. _(Esterel v5
Primer, sections 4–5.)_

**Execution.** Time is a sequence of **instants**, also called reactions. In each instant the
environment supplies a set of present input signals. The program reacts _instantaneously_ under
the synchrony hypothesis, emits outputs and pauses. Every statement in every parallel branch sees
the **same** status for each signal in one instant: present if emitted anywhere in that instant,
absent otherwise. Emission and test happen in the same instant. Causality therefore matters:
`present S else emit S end` has no consistent status. The program
`present S then emit S end` has two statuses, so it is non-deterministic. Valued signals emitted
several times in one instant need a declared `combine` function, or the compiler rejects them.

**Constructive semantics and causality.** Berry's constructive semantics (_The Constructive
Semantics of Pure Esterel_, draft v3, 2002) defines a program as correct when, for every input, the
statuses of all signals can be **deduced forwards**: a signal is present when some emitter must
run, and absent when every emitter cannot run. Speculation is not allowed. This is equivalent to
ternary (0/1/⊥) simulation of the translated circuit settling with no ⊥ (Malik; Shiple, Berry &
Touati). A program that is not constructive is **rejected at compile time** as a causality cycle.
The compiler also rejects **instantaneous loops** (a `loop` body that can terminate in the instant
it starts). It also handles **schizophrenia**: one statement, typically a local-signal declaration
inside a loop, can be left and re-entered in the same instant. Two incarnations then coexist, and
their signals must be kept distinct. _(From the literature: Berry 2002; Tardieu & de Simone on
schizophrenia; Rieg's Coq work.)_

**Preemption** _(Primer section 4.7; Columbia lecture notes)_:

- **`abort p when S`** (strong). In an instant where `S` is present after the first, `p` does
  **not** react at all and the statement terminates. The outer context has priority.
- **`weak abort p when S`.** `p` reacts one last time in that instant, and its emissions are
  visible, then it is killed.
- **`suspend p when S`.** In an instant where `S` is present, `p` is frozen. It does not react, and
  it keeps its control state and local data for the next instant.
- **`trap T in p end` / `exit T`.** This is an exception-like exit initiated by the body. It is
  weak: the branches in parallel finish the current instant. When several traps are exited at once,
  the **outermost** wins. Valued traps carry data, and `handle T do q` runs a handler.
- **`abort … when immediate S`** versus non-immediate. Every temporal statement states whether
  the instant in which it starts counts.

**Timers.** Esterel has **multiform time**: `await 5 SECOND`, `await 3 METER` and `await 3 WrongCode`
are the same construct, counting occurrences of any signal. No special clock exists. The
environment delivers `SECOND` like any other input.

**Problems it was built for.** It was built for deterministic control software that must react to
simultaneous inputs with no interleaving ambiguity. Preemption and concurrency had to be
first-class and compositional, since hand-coded automata blew up in size. Static guarantees were
required: reactivity (every input has a reaction) and determinism (exactly one).

### 1.2 SyncCharts

SyncCharts (Charles André, I3S, 1995–96) is the graphical, Statecharts-like face of Esterel. Its
semantics is defined by translation to Esterel. **Macrostates** contain concurrent regions. Exit
arcs are typed as **strong abortion** (the body does not react), **weak abortion** (the body
reacts, then dies) or **normal termination** (taken when every region reaches a final state, as
with trap/exit). **Suspension** is also available. Signals are broadcast within an instant, as in
Esterel. The motivation was to give Esterel's semantics the visual form engineers used for
statecharts, without Statemate's step and microstep ambiguities. Because it is "fully compatible
with ESTEREL" (André, TR 96-28), the same constructive causality check applies.

### 1.3 SCCharts and sequentially constructive (SC) semantics

**Composition.** SCCharts (von Hanxleden et al., PLDI 2014) are statecharts with a small **Core**:
states, superstates with concurrent regions, simple transitions, termination transitions and
variables. A large **Extended** layer covers strong and weak abort, suspend, entry, during and
exit actions, history, deferred transitions, count delays, `pre` and signals. Each Extended
feature is defined as a **model-to-model transformation into Core**, run in a fixed order that
forms a partial order (Kiel docs; synchron13 talk). Referenced SCCharts (one chart used as a
state of another, with variable bindings) are **inlined** before compilation. The textual syntax
names the three arc kinds: weak abort `-->`, strong abort `o->` and termination `>->`.

**Execution.** A **tick** (macro tick) is one reaction. Within a tick, concurrent threads run under
the **SC model of computation** (von Hanxleden et al., TECS 2014). Sequential order inside a
thread is respected, just as in C: `x = 1; if (x) …` is fine, whereas Esterel would reject the
equivalent signal program. For accesses **across** concurrent threads, the scheduler must find
an **SC-admissible** schedule that follows the _initialize–update–read_ protocol:

1. at most one **absolute write** (plain assignment) per variable per tick;
2. then any number of **relative writes** of one combine kind (`+=`, `max=`), whose order does not
   matter;
3. then **reads**.

A program with no such schedule, for example two concurrent absolute writes, is **rejected**. SC
is a _conservative extension_ of Esterel's model: every constructive Esterel program is SC, but
not the reverse.

**Compilation.** SCCharts compile to an **SC Graph** of threads, with control-flow edges and
dependency edges between concurrent accesses. The compiler then takes either a data-flow
(netlist, circuit-like) or a priority-based (sequential C, thread priorities) route. Dependency
cycles that cross threads make a program non-schedulable, and it is rejected.

**Problems it was built for.** Esterel rejected obviously sequential programs that safety-critical
engineers wrote naturally. SCCharts keep determinism and static scheduling while accepting
C-like write-then-read code, with a small, verifiable core.

### 1.4 Lustre and SCADE

**Composition.** Lustre (Halbwachs, Caspi, Raymond, Pilaud 1991) is **data-flow**. A program is a
set of **nodes**, and each node is a system of equations `x = e` over streams. Each variable has
**exactly one** defining equation, so it is single-assignment per instant. `pre e` is the previous
value of `e` and `a -> b` initializes. Calling a node creates an **instance** with its own memory
(its `pre` registers). `reset` (`f(x) every c` in Lustre v6 and Lucid Synchrone; Hamon & Pouzet,
PPDP 2000) restarts an instance's memory whenever `c` is true. In that instant the instance
computes **from its initial state**, with the current inputs: reset happens _before_ the step
_(from the literature; Pouzet's slides describe reset as "the initialization operator becomes a
conditional on the reset signal")_. SCADE 6 (Colaço, Pagano & Pouzet, EMSOFT 2005) adds
hierarchical **state machines whose states contain equations**. Transitions are **weak**
(`until`, delayed: the source state's equations run this instant, and the target is active next
instant) or **strong** (`unless`, immediate: tested first, and the target's equations run this
instant). A transition enters its target either by **reset** (`then`: the target's state machines
and data-flow memory restart) or by **history** (`continue`: the target **resumes** with its
memory, H* in UML terms). The SCADE extension is conservative: every Lustre program keeps its
meaning.

**Execution.** One **cycle** computes every equation once, in dependency order. A combinational
dependency cycle that does not cross a `pre` is a **causality error**. The check is syntactic,
and stricter than Esterel's constructive check.

**Static guarantees.** These cover causality (no instantaneous cycles), clock consistency (the
clock calculus), **initialization analysis** (no `pre` read before it has a value), bounded memory
and bounded execution time. SCADE's KCG code generator is qualified for DO-178C.

**Modular compilation.** Each node compiles to a `step` (and `reset`) function. Pouzet & Raymond
(_Modular static scheduling of synchronous data-flow networks_, EMSOFT 2009 / DAES 2010) show that
compiling a node as **one** atomic step can create **false cycles** at the call site. A feedback
through a node whose output does not actually depend on that input is still rejected. The fix
gives each node an **interface summary**: which outputs depend instantaneously on which inputs.
The node may also be split into the minimum number of step functions. Callers check causality
from the summary alone, without inlining.

**Problems it was built for.** Lustre and SCADE were built for flight control, railway and nuclear
software. The requirements were provable determinism, bounded resources, certifiable code
generation, and modularity that does not leak implementation.

### 1.5 Céu

**Composition.** Céu (Sant'Anna et al., SenSys 2013 and REM'13) is an imperative synchronous
language in Esterel's line, with **trails**:

- **`par/and`** rejoins when all of its trails finish.
- **`par/or`** finishes when any trail finishes, and **aborts** the others.
- **`par`** never rejoins.

Reusable units are **organisms**, later called `code/await` abstractions, and they are instantiated
statically or `spawn`ed into **pools**. A pool may be bounded (`pool T[10]`) or not. "When a pool
of organisms goes out of scope, all organism bodies are automatically aborted" (manual v0.10).

**Execution.** One external input event triggers one **reaction chain**, which runs to completion
and "always run[s] in bounded time." **Internal events** are emitted with `emit e`: the scheduler
saves the emitter's continuation **on a stack**, runs the awoken trails, then resumes the emitter.
This makes an internal emit behave like a synchronous call. Trails awoken together run in
declaration order, which makes execution deterministic. Before an aborted trail dies, "a trail has
a last opportunity to execute all active finalization statements": **`finalize`** blocks run in
the aborting reaction. **Tight-loop check:** every path through a loop body must contain an
`await` or a `break`, otherwise the compiler rejects it. **Timers:** `await 30ms` returns the
**residual delta**: how late the wake-up was, so chained timers can compensate for drift. The host
feeds wall-clock time as an event.

**Problems it was built for.** Céu was built for resource-constrained, event-driven code (sensor
networks, games) that wanted Esterel's structured preemption, with safe and **automatic cleanup**
of aborted code (`finalize`), bounded reactions, and determinism with shared memory.

---

## 2. Problems Flow State has not considered yet

Each item names the prior art, a failure scenario written in Flow State terms, and where v3 is
silent or would get it wrong.

### 2.1 Incarnations within one turn ("schizophrenia")

**Prior art.** Esterel's schizophrenia problem: a statement left and re-entered in one instant has
two live incarnations. The compiler must keep their local signals and registers apart.

**In v3.** Rule 7 says every guard and payload mapper reads the **pre-turn** snapshot. Rule 12
rejects "a raise into a child that is not active". Neither says _which incarnation_ a raise
addresses when the child is **created in the same turn**:

- **Entering and raising.** `PASSWORD → TWO_FACTOR` with `raise: [E.resendCooldown.Start]`, where
  `resendCooldown` is `.at("TWO_FACTOR")`. Before the turn, the trait is inactive and its slice is
  `undefined`. After the turn, it is fresh. Rule 12 must either reject this natural "start on
  entry" (forcing an `armOn`/entry workaround) or address the **new** incarnation. If it addresses
  the new one, its guards cannot read "the pre-turn snapshot", because there is no pre-turn slice.
- **Adding and raising.** Section 3.1 already does this: `lock` raises `lockouts.Add` and then
  `lockouts.Start` for the same key, so `Start` addresses an instance that did not exist before the
  turn. It works only because `Start` is unguarded. If `Countdown` had a guard on `Start`, nothing
  defines what memory that guard reads.
- **Re-entering.** A transition targets a subroutine's own state from outside it. Machines O2 says
  "an explicit target re-enters itself", so the old instance is abandoned and a fresh one entered
  in one turn. That turn runs `abandoned`'s `"pending"` run (P10) for the old instance and the new
  instance's `initial`. A raise in the same turn into `E.CANCELLING.*` is ambiguous between the
  two.

**Failure.** The same code means different things in different turns, with no type error. An agent
writes `raise: [E.timer.Start]` on an entering transition, and it is either a construction error,
or silently addresses a slice whose guard reads `undefined`.

### 2.2 Read-after-write inside one turn

**Prior art.** SC's initialize–update–read protocol makes "write, then read in the same tick"
well-defined. Esterel and Lustre make it either well-defined (same-instant status) or explicitly
delayed (`pre`).

**In v3.** Rule 7 is "pre-turn" for guards and payload mappers. Section 2.2 and rule 1, however,
make `input` and `resetOn` read **after** the turn's updates. So one transition has two read
times. Section 3.1's `PasswordAccepted` writes `challengeId: event.challengeId`.

**Failure.** Suppose an agent adds a raise to that `PasswordAccepted` transition:
`E.lockouts.Add.from(({ memory }) => ({ key: memory.challengeId }))`. It reads the **old**
challenge id, adds a lockout for the previous challenge, and passes every check. The `lock` helper
is safe only because it runs in turns that do not write `challengeId`. This is the same bug class
D6 ("same-turn seeding") named, fixed for `input` only. SC would order the write before the read,
and Lustre would force the author to write `pre` to get the old value. v3 does neither, and does
not warn.

### 2.3 A raise and a reset in the same turn lose the raise

**Prior art.** Lustre, Lucid Synchrone and SCADE reset **before** the step: in an instant where
the reset condition is true, the instance restarts and then processes that instant's inputs.

**In v3.** Rule 1 says the opposite: "A raise into it applies first, so the reset wins." The raised
event is applied to the old incarnation, which is then discarded.

**Failure.** A host handler changes a `resetOn` key and, in the same turn, raises a fact into the
trait. Take a `Field.at("FORM")` with `resetOn: ({ memory }) => memory.recordId`, and a
`RecordLoaded` handler that writes `recordId` and raises `E.field.Reset`, or for a list, `Add`. The
raise is silently lost. It is worse when the raise comes from a **delivery**, such as a commit
outcome, a timer firing or `abandoned`. Rule 8 promises that "a server's answer may not" be
refused, yet the fact it raised vanishes without a refusal. Rule 8's totality check passes,
because the child handles the event unguarded.

### 2.4 Fixed-point resets are a causality loop that v3 resolves at runtime

**Prior art.** In Lustre, a reset condition that depends instantaneously on the reset instance's
own output is a **causality error**, rejected statically. Esterel would reject it as
non-constructive.

**In v3.** Rule 1 runs `resetOn` "until no value changes", allows each trait one reset per turn,
and makes "a reset value that changes twice" a **runtime** defect (rule 12).

**Failure.** Trait A's reset value reads a host key. A's re-activation, through `initial` and a
callback or through an `input` filler, writes the key that trait B's `resetOn` reads, and B's
writes feed A. This passes `flow check` and fails as a pre-commit defect in production, on the
first turn that triggers it. Stories prove only the paths they run.

### 2.5 Modular causality: fragment swaps reintroduce E2 through `flow check`

**Prior art.** Pouzet & Raymond: checking causality across separately written nodes needs an
**interface summary** of each node's instantaneous input→output dependencies. Without one, the
caller either inlines everything, so it depends on internals, or rejects false cycles.

**In v3.** Rule 7 requires the raise/notify graph to be acyclic, and rule 8 requires transitive
totality ("each raise must target an event the child handles unguarded"). Both are computed by
following **inside** fragment bodies (`flow check` "follows the fused chain").

**Failure.** A host fills `flash.callbacks.onShown` with a handler that raises `E.flash.Show`
again. This is acyclic only if `Flash` does not notify `onShown` from `Show` in the same turn. Swap
`Flash` for a version that notifies on `Show`, with an unchanged contract, and the **host** now
fails `flow check` with a cycle. Equally, swap an inner `Countdown` whose `Start` gains a guard,
and the host's rule-8 totality breaks. The contract types did not change, but the host broke.
This is principles.md **E2** (interfaces that grow with depth), moved from the types into the
checker. Rule 10 ("nesting hides the level below") is true for types and false for these two
checks.

### 2.6 History restores control, not the data under it

**Prior art.** SCADE 6 `continue` (history) resumes the target **with** its data-flow memory and
nested automata. `then` (reset) restarts both. Esterel's `suspend` freezes control and data
together. Neither separates "which child" from "that child's memory".

**In v3.** P5's `S.X.history` restores the last active child. Rule 1 makes every trait placed at
or below that child **fresh** on activation.

**Failure.** Signup moves its page fields from root traits to `Field.at("WIZARD.PROFILE")`, which
L3 encourages: "fresh on activation". The user types a display name, presses Cancel and then
"Keep". `Declined: S.WIZARD.history` returns to `PROFILE` with **empty** fields. The page comes
back and its contents do not. Every v3 build avoided this only because fields happened to be root
traits. Nothing in v3 or `flow check` points out the interaction.

### 2.7 No cleanup or hand-back on abandonment

**Prior art.** Céu's `finalize` runs in the aborting reaction. SyncCharts and SCCharts weak abort
let the body react one last time, with visible emissions. SCCharts exit actions run on any exit,
abort included.

**In v3.** A subroutine ends "by taking an exit, or abandoned by a transition that exits its state"
(section 2.1). On abandonment it gets **no** turn: its memory is dropped (rule 1), and only the
host's commit `abandoned` (P10) runs.

**Failure.** An address-entry subroutine holds a half-typed address, and a root-level `SignOut`
handler leaves its state. The draft is gone. D7 ("drafts lost on abnormal endings") is answered "by
convention", which here means the host must copy fragment memory out pre-emptively on every path
that could leave. That is D1 ("drifting copies") again. The fragment author, who knows what
should survive, has nowhere to say it.

### 2.8 Downstream refusal and alternative fallthrough

**Prior art.** In SyncCharts, SCCharts and Esterel, transition priority is decided by **trigger and
guard** only. Downstream effects cannot make a transition "not have been taken", because programs
are total.

**In v3.** Rule 7: "If any part refuses, the whole turn refuses." Machines O2: "the first passing
or unguarded alternative wins; all declining falls through." The rules do not say whether a host
alternative whose **raised child refuses** counts as declined, so that the next alternative is
tried, or refuses the turn.

**Failure.** Two agents read this differently. One writes an ordered handler that expects a
fallback when the child refuses. The other relies on whole-turn refusal. `check()` returns
different verdicts under the two readings.

### 2.9 Multiple writers that should combine

**Prior art.** Esterel's `combine` for valued signals, and SC's relative writes (`+=`, `max=`).

**In v3.** Rule 7 requires "disjoint memory keys", so two parts of a turn writing one key is a
construction error, or a runtime defect when hidden behind a guard (rule 12).

**Failure.** A host transition raises into two traits, and each notifies a callback that appends
to the host's `messages` list or bumps `dirtyCount`. This is a natural pattern that is
order-independent, yet v3 rejects it, sometimes only at runtime. Today's fix is one callback per
key, routed by hand.

### 2.10 Same-deadline firings publish intermediate snapshots

**Prior art.** With multiform time, Esterel delivers simultaneous events in **one** instant.

**In v3.** Machines O5: equal deadlines "enqueue by … outermost state, then declaration order",
which makes them **separate** turns, each published.

**Failure.** A view renders the state between two firings that are logically simultaneous. For
example, `lockouts.key(a)` and `lockouts.key(b)` both end at the same millisecond, and the view
shows one lock released and the other held for one frame. This is minor, but the separate turns
are visible in Stories as two transitions and two checkpoints.

---

## 3. Validation and divergence

### 3.1 What matches v3 (established semantics)

| v3 | Prior art | Verdict |
| --- | --- | --- |
| One event, one deterministic turn, one publication (rule 7, Machines O3) | Synchrony hypothesis: one reaction per instant, outputs observed only at its end | Matches. The atomic turn is the instant. |
| Guards read the **pre-turn** snapshot (rule 7) | Statemate-style "changes visible next step"; Lustre `pre`; SCADE `until` (weak, delayed) | Matches the **delayed** family. It removes the whole constructive-causality problem (no `present S else emit S` paradox) at the cost of item 2.2. This is the right trade for agent-authored code. |
| Raise and notify graph acyclic, checked syntactically (rule 7) | Lustre/SCADE: every cycle must cross `pre`, checked syntactically; Céu: internal emits are stack calls | Matches the **stricter**, simpler choice (Lustre), not Esterel's constructive one. Correct for TypeScript, where guards are opaque functions and no ternary analysis is possible. |
| Raises apply in written order (rule 7) | Céu internal emit is a stack-based synchronous call with deterministic order | Matches Céu. |
| Disjoint memory keys, at most one state changer (rule 7) | Lustre single assignment; SC's "one absolute write per tick" | Matches the absolute-write half. Relative writes are missing (item 2.9). |
| Whole-turn decline (rule 7, T1) | No direct equivalent: synchronous programs are total, so they never decline an input | v3 adds failure atomicity that synchronous languages do not need. It is sound, but see item 2.8. |
| Deliveries never refused, totality checked (rule 8) | Esterel **reactivity**: every input has a reaction | Matches, scoped to server and clock events. User events may be refused, which is a deliberate extension. |
| Exits: named, typed, every exit filled, every exit leaves (rules 6, 12) | Esterel `trap T in … end` / `exit T(v)` / `handle T do`; SyncCharts normal termination; SCCharts termination transitions | Matches valued traps. Exits are traps whose handler the host writes. |
| The host leaving abandons the subroutine and cancels its schedules (rule 6, P2, P11) | Strong abort: the body does not react and its pending `await`s, timers included, die | Matches **strong** abort. |
| Fresh on every entry (rule 1) | SCADE 6 `then` (reset entry); a Lustre instance reset; SCCharts default (non-history) entry | Matches. |
| `internalEvents` emitted only by the fragment's own schedules; `hostEvents` only from the direct host (rule 2) | Esterel local signals (`signal S in … end`) and interface renaming in `run M [A/B]` | Matches. Esterel scopes signals lexically, which gives the same guarantee. |
| Placement at construction, one actor, one snapshot (section 1) | Esterel `run` inlining; SCCharts referenced charts inlined; Lustre nodes compiled into one step | Matches. All four compile reuse away into one machine. |
| `S.X.is(state)` guards read structurally and pruned (rule 12) | Esterel `relation` declarations (`A # B`) that let the compiler prune impossible combinations | Matches in spirit: structural facts prune the analysis. |
| `armOn`, `restartOn`, arming ids (P7, P8, P11) | Esterel `abort … when` / `every S do` / `loop … each R`; Céu `await` restarting inside `loop` | Matches. An arming id is what makes a re-entered `await` a fresh await. |
| `.list({ max })`, removal cancels schedules (rule 9) | Céu pools: `pool T[n]` is bounded, an instance dies when its body ends, and the pool's scope aborts all | Matches closely, including bounded and unbounded pools. |
| `flow check` as a static gate (rule 12, CommandLine O5) | Esterel, SCCharts and SCADE compilers reject non-causal and non-schedulable programs | Matches the role. |

### 3.2 Where v3 differs, and may be wrong or weaker

| # | v3 | Better-known answer | Assessment |
| --- | --- | --- | --- |
| D-a | Rule 1: "A raise into it applies first, so the reset wins" | Lustre/SCADE: reset first, then the instance reacts to this instant | **v3 is likely wrong.** It loses input, which conflicts with rule 8's spirit (item 2.3). |
| D-b | Rule 1: `resetOn` iterates to a fixed point; a value that changes twice is a runtime defect | A reset condition that depends instantaneously on the instance's own output is a static causality error | **Weaker.** A static guarantee is replaced by a runtime defect (item 2.4). |
| D-c | Two read times in one turn: guards and mappers pre-turn, `input` and `resetOn` post-update (rule 7, section 2.2, rule 1) | SC: one sequential order inside a thread. Lustre: explicit `pre` marks every old read | **Inconsistent.** Each choice alone is defensible; the mix is unmarked (item 2.2). |
| D-d | Raises into a child created in the same turn are undefined (rule 12 says "not active") | Esterel incarnations are kept distinct statically | **Underspecified** (item 2.1). |
| D-e | Causality and totality are checked through fragment bodies (rules 7, 8, 10) | Pouzet & Raymond interface summaries | **Leaks implementation**, which is E2 again (item 2.5). |
| D-f | P5 history is control-only, while fragments below reset (rule 1) | SCADE 6 `continue` resumes data and control together; Esterel `suspend` | **Weaker and surprising** (item 2.6). |
| D-g | Abandonment is strong abort only, with no fragment hook (sections 2.1, 6) | Weak abort, Céu `finalize`, SCCharts exit actions | **Missing.** D7 stays "by convention" (item 2.7). |
| D-h | Only one preemption kind: host transitions exit the subroutine | Strong, weak, suspend and trap, chosen per arc (SyncCharts/SCCharts) | Mostly fine. Because v3 namespaces fragment events, the strong/weak race over **one** event that Esterel resolves cannot occur. Weak abort reduces to D-g. Suspend is the real gap (D-f). |
| D-i | Equal deadlines become separate turns (Machines O5) | Simultaneous events share one instant | A deliberate simplification (one event per turn). Keep it and document it (item 2.10). |
| D-j | Mutual-exclusion knowledge comes only from `S.X.is` guards (rule 12) | Esterel `relation`: declared input exclusions | Optional. It could cut false overlap warnings. Low value. |
| D-k | Immediate versus delayed is decided per feature (P7: a raised event arms; P8: the baseline is the activating turn) | Esterel marks `immediate` on every temporal statement | v3's choices are consistent with "delayed" by default. They should be stated once as a principle, not per feature (it closed T2 piecemeal). |

---

## 4. Recommendations, ranked by value

### R1. Reset before react (replaces rule 1's "the reset wins")

**Change.** When a trait resets in a turn, the reset (drop memory, run `initial`, cancel schedules)
happens **first**. Raises addressed to that trait in the same turn then apply to the **fresh**
incarnation, in written order.

**Rules.** The guards of those raises read the fresh incarnation's `initial` memory (see R3). On a
list, a reset removes every instance, so a raise into an instance key is `Unhandled`, and
therefore an error if it comes from a delivery (rule 8).

**Value.** No delivered fact is silently dropped. This is the established Lustre/SCADE order.

**Cost.** `resetOn` must be decided before raises apply, which forces R2.

### R2. Make `resetOn` read only pre-turn memory and the event, and reject reset cycles statically (replaces the fixed point in rule 1 and the twice-changing runtime defect in rule 12)

**Change.** Either of these:

- **(a)** `resetOn` reads the **pre-turn** snapshot and the event, like guards. A reset then
  cannot depend on the same turn's updates.
- **(b)** Keep post-update reads, but have `flow check` reject any `resetOn` that reads a key
  written in the same turn by the trait's own callbacks or `input`, or by another reset-dependent
  trait. This is Lustre's rule: a reset condition may not depend instantaneously on the instance.

Option (a) is simpler and matches rule 7. Its cost is that "reset when the record id I just wrote
changes" becomes "reset on the event that writes it", which R1 makes safe:
`resetOn: ({ memory, event }) => event._tag === "RecordLoaded" ? event.id : memory.recordId`.

**Value.** This removes the only runtime causality defect. It also removes the "at most once per
turn" and "repeats until no value changes" sentences, and makes R1 well-defined.

**Cost.** Small. It changes Machines O3's "resetOn runs after the turn's updates", and possibly
D6's seeding story, since `input` still reads post-update.

### R3. Define incarnations explicitly (adds to rules 7 and 12)

**Change.** State one rule:

> A fragment activated, entered, added or reset in this turn is a **new incarnation**. Raises into
> it address the new incarnation. Its guards and payload mappers read its `initial` memory and
> the host's pre-turn snapshot. An incarnation left in this turn receives no raises after it is
> left.

Rule 12's "a raise into a child that is not active" then means "not active **after** the
structural part of the turn".

**Value.** Section 3.1's `Add`-then-`Start` becomes defined rather than lucky. "Start on entry"
(`raise: [E.timer.Start]` on an entering transition) becomes legal and typed. A7-like entry sends
have one answer.

**Cost.** A short spec paragraph, a story in Testing (V12), and the typing of `.from` on entering
transitions, so that the fresh slice is typed as present.

### R4. Contract-level dependency summaries (adds to rule 10, section 2.2 and CommandLine O5)

**Change.** Each fragment's contract records, inferred when the fragment is built and kept in its
type:

- **(i)** for each `hostEvent` and `event`: which `callbacks` and `exits` it may notify or take in
  the same turn;
- **(ii)** whether it is handled **unguarded** in every state, so it is _total_.

`flow check` verifies the host's raise/notify acyclicity (rule 7) and transitive totality (rule 8)
from these summaries **only**. Inside a fragment, the checker verifies that the body matches its
own summary. This is Pouzet & Raymond's modular scheduling, applied to v3's fused turn.

**Value.** It closes E2 for the checker, as rule 10 already closes it for the types. Swapping an
inner fragment that changes these properties becomes a **contract change** visible in the
fragment's type, not a mysterious host error. It also tells agents, from the contract alone,
which `hostEvents` are safe to raise from deliveries.

**Cost.** Medium: a type-level or metadata summary, and a checker pass. The author need not write
it, because it is inferable, but it must be printed in Inspection O1 so it can be reviewed.

### R5. Read-after-write lint for payload mappers (adds a `flow check` warning; keeps rule 7's pre-turn reads)

**Change.** Warn when a transition's `raise`, `notify` or `exits` `.from` mapper, or a commit
select, reads a memory key that the same fused turn writes. The message names both, for example
"`memory.challengeId` is read before the update on this transition writes it; use `event.…`".
Detection can be dynamic: Stories trace reads through a proxy and writes from patches, as SC
compilers record read and write sets. Do **not** switch to SC's sequential reads: pre-turn reads
are what keep `check()` honest and avoid causality analysis.

**Value.** It catches the D6-class bug in item 2.2, which is the most likely agent mistake under
rule 7.

**Cost.** Low to medium. It needs read and write tracing in the Story runner, and only covers
exercised paths unless read sets are declared.

### R6. An `onAbandon` hand-back port for subroutines (adds a port kind; partly answers D7)

**Change.** A subroutine may declare `abandon: { …payload }`, filled by the host with an
`on`-style handler that **cannot target**, like `abandoned` (P10). It runs **fused** into the
leaving turn and reads the subroutine's pre-turn memory, in Céu `finalize` / weak-abort style. It
is a delivery, so rule 8 totality applies.

**Value.** The fragment author declares what survives an abnormal ending, such as a draft or a
partial selection. The host stores it, and does not shadow-copy memory on every path (D1). This
is the established answer to cleanup on abort.

**Cost.** One port kind and one more fused part per leaving turn. Disjoint-key rules apply to it.
Rule 6 needs a sentence: abandonment now runs fragment code, but that code cannot target.

### R7. Say what history restores, and warn on fragments under history (amends P5; adds a check)

**Change.** First, state in P5 that `.history` restores **control only**, and that fragments at or
below the restored child are fresh. Second, add a `flow check` **warning** when a `.history`
target can re-activate a node that has traits or subroutines placed under it. Third, record
SCADE 6's `continue` (resume control **and** data, frozen schedules) as the established design if
a "modal over" case (CANCELLING over WIZARD) needs data to survive. That is a suspend-like
placement, `Confirm.over(S.WIZARD)`, which needs its own proposal because it touches "exactly one
leaf".

**Value.** It prevents item 2.6 silently.

**Cost.** Low for the warning. High for resume or suspend, which should be deferred.

### R8. Decide fallthrough on downstream refusal (clarifies rule 7 and Machines O2/O4)

**Change.** Pick one reading and write it down. The recommended reading is: **an alternative is
selected by its own guards; once selected, a refusing part refuses the whole turn, and later
alternatives are not tried.** This is the synchronous rule, under which priority depends on
triggers and guards only. It keeps `check()` cheap and keeps a host's choice independent of a
child's internals, consistent with R4.

**Value.** It removes one ambiguity that `check()` and agents will disagree on.

**Cost.** One sentence and one story.

### R9. Optional: combinable keys (adds to rule 7)

**Change.** Allow a memory key to declare a combine function (`memory: { messages: combine(append) }`,
or `sum`, or `max`). Several parts may then write it in one turn, applied in raise order, which is
deterministic. This is SC's relative writes and Esterel's `combine`. Without the declaration, rule
7's disjointness stays.

**Value.** Moderate. It removes a class of construction errors and runtime overlap defects (item
2.9).

**Cost.** Medium: schema, typing and checker work. It is easy to defer, because hand-routing
callbacks to separate keys is the workaround.

### R10. Document "delayed by default" once (editorial; Machines O5)

**Change.** State a single principle, Esterel's: a temporal construct never counts the turn that
arms or activates it unless it says `immediate`. Then show that P7, P8 and the arming-id rule (P11)
are instances of it. Equal-deadline firings are separate turns (item 2.10). Say so, and say that
Stories show two checkpoints.

**Value.** Low cost, and it prevents the next T2-style trap.

**Cost.** Text only.

### Not recommended

- **Esterel's constructive causality** (same-turn signal status). It needs ternary analysis over
  opaque TypeScript guards, and it is exactly the class of reasoning agents get wrong. v3's
  pre-turn reads with syntactic acyclicity is Lustre's safer choice and should stay.
- **Concurrent regions or `par`.** They break "exactly one leaf" (Machines O2). The prior art
  shows they are the root of most causality machinery. Traits cover the "beside" cases without it.
- **Multiform time as the only time** (`await 3 WrongCode`). It is elegant, but v3's memory
  counters plus Clock schedules are more legible to TypeScript readers. `armOn` already covers
  event-restarted timers.

---

## Sources

- G. Berry, _The Esterel v5 Language Primer_, 2000: <https://www.rw.cdl.uni-saarland.de/people/kaestner/private/es0203/esterel_primer.pdf>
- G. Berry, _The Constructive Semantics of Pure Esterel_, draft v3, 2002: <https://www.college-de-france.fr/sites/default/files/documents/gerard-berry/UPL1145408506344059076_Berry_EsterelConstructiveBook.pdf>
- G. Berry, Collège de France lectures on Esterel v5 design: <https://www.college-de-france.fr/media/gerard-berry/UPL8245688185003796235_2013_04_Berry_Cours3_Esterelv5_Design.pdf>
- S. Edwards, Esterel lecture notes (abort, suspend, trap priority): <https://www.cs.columbia.edu/~sedwards/classes/2009/embedded-languages/esterel.pdf>
- L. Rieg, G. Berry, a Coq-verified chain of Esterel semantics: <https://arxiv.org/html/1909.12582v4>
- Esterel overview: <https://en.wikipedia.org/wiki/Esterel>
- C. André, _Representation and Analysis of Reactive Behaviors: A Synchronous Approach_ (SyncCharts), TR 96-28: <https://webusers.i3s.unice.fr/~map/WEBSPORTS/SyncCharts/TR96-28.pdf>
- SyncCharts publications: <https://webusers.i3s.unice.fr/~map/WEBSPORTS/SyncCharts/publications.en.html>
- R. von Hanxleden et al., _SCCharts: Sequentially Constructive Statecharts for Safety-Critical Applications_, PLDI 2014: <https://rtsys.informatik.uni-kiel.de/~biblio/downloads/papers/pldi14.pdf>
- R. von Hanxleden et al., _Sequentially Constructive Concurrency_, ACM TECS 2014: <https://rtsys.informatik.uni-kiel.de/~biblio/downloads/papers/tecs14.pdf> and report <https://rtsys.informatik.uni-kiel.de/~biblio/downloads/papers/report-1308.pdf>
- SC poster (initialize–update–read, relative and absolute writes): <https://rtsys.informatik.uni-kiel.de/~biblio/downloads/papers/ptolemy13-poster.pdf>
- KIELER SCCharts documentation (strong and weak abort, termination, Core and Extended): <https://rtsys.informatik.uni-kiel.de/confluence/x/RYBRB>, <https://rtsys.informatik.uni-kiel.de/confluence/x/oYWQ>
- Kiel lecture on Extended-to-Core transformations: <https://www.informatik.uni-kiel.de/~rvh/ss20/v-synch/lectures/lecture11-handout4.pdf>
- N. Halbwachs, P. Caspi, P. Raymond, D. Pilaud, _The synchronous data flow programming language LUSTRE_, Proc. IEEE 79(9), 1991 _(from the literature)_
- J.-L. Colaço, B. Pagano, M. Pouzet, _A Conservative Extension of Synchronous Data-flow with State Machines_, EMSOFT 2005: <https://www.di.ens.fr/~pouzet/bib/emsoft05b.pdf>, slides <https://www.di.ens.fr/~pouzet/talks/slides-fac07.pdf>
- G. Hamon, M. Pouzet, _Modular resetting of synchronous data-flow programs_, PPDP 2000; reset discussion in <https://www.di.ens.fr/~pouzet/talks/synchron2007.pdf> and <https://www.di.ens.fr/~pouzet/bib/lctes08a.pdf>
- M. Pouzet, P. Raymond, _Modular static scheduling of synchronous data-flow networks_, EMSOFT 2009 / DAES 2010: <https://www.di.ens.fr/~pouzet/bib/emsoft09.pdf>, <https://www.di.ens.fr/~pouzet/bib/jdaes10.pdf>, <https://hal.umontpellier.fr/IMAG/hal-04679268v1>
- F. Sant'Anna et al., Céu (REM'13 preprint): <https://ceu-lang.org/chico/ceu_rem13_pre.pdf>
- Céu manual v0.10 (internal events, finalize, pools, tight loops, timers): <https://github.com/ceu-lang/ceu/blob/pre-v0.40/docs/manual/v0.10/manual-v0.10.md>
- Céu manual v0.8 (par/and, par/or, par): <https://github.com/ceu-lang/ceu/blob/5e0c8d3004ad98658ffe82823ad8303a8d371064/docs/manual/v0.8/manual-v0.8.md>
