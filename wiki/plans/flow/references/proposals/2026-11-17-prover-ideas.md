---
proposal prover-ideas
status superseded 2026-11-19 [@proposal.alchemy-adoption, @task.V3.T106]
    proposed 2026-11-17
---
# Prover module: ideas (ideas only)

Superseded by @proposal.alchemy-adoption and @task.V3.T106: rules sit on definitions
and every run judges them, not separate *.props.ts files; bounded exhaustive search is T106's generator profile; static
checks over Compiled follow @proposal.context-slots. The text below is prior art.

**Bottom line:** Flow could offer an optional `flow-state/prove` module where properties live in `*.props.ts` files,
apart from machines, and one command proves or refutes them. Most of it is Flow's own parts reused: `Compiled` is
the finite graph, `step` is the transition function, Stories are the traces, run rules are the properties and
generated runs with shrinking are the search. The smallest slice is exhaustive checks over `Compiled` plus bounded
search that returns a failing Story. Nothing here is in scope now; no TLA+ or tla-ts.

Everything below is a sketch, not a design. **New** means invented here, existing means already in Flow, and
`user-defined` is the developer's own name.

## 1. What a property file looks like

One machine, in `checkout.props.ts`:

```ts
import { Prove, Always, Never, LeadsTo } from "flow-state/prove"   // NEW module
import { CheckoutMachine } from "./checkout.ts"                     // user-defined machine

export default Prove.machine(CheckoutMachine, {                     // NEW: Prove.machine
  id: "checkout/props",                                             // existing idea: ids are unique
  props: {
    // NEW: Always(state/data predicate), checked in every reachable state
    paidHasReceipt: Always(({ state, context }) => state.is("Paid") ? context.receipt !== undefined : true),
    // NEW: Never(event while in state); decided on Compiled alone
    noPayWhenEmpty: Never.on("Pay", { in: "Empty" }),
    // NEW: LeadsTo(p, q): from p, every path reaches q, under fairness
    submitSettles: LeadsTo.state("Submitting", ["Paid", "Failed"], { fair: ["PayResult"] }),
  },
})
```

Over an app (several actors, refs, context, write lanes, reloads):

```ts
import { CheckoutApp } from "./app.ts"                              // user-defined RuntimeSetup

export default Prove.app(CheckoutApp, {                             // NEW: Prove.app
  fixtures: [PaymentsFake],                                         // existing: Story fixtures
  inputs: PaymentSamples,                                           // existing: samples as the input domain
  bounds: { actors: 3, steps: 12, reloads: 1 },                     // NEW: Alloy-style scope
  props: {
    // data invariant across actors, through a ref
    cartMatchesOrder: Always(({ actor }) => actor("Order").total === sum(actor("Cart").lines)),  // NEW: actor(...)
    // ending guarantee: every commit gets exactly one ending, across reloads
    oneEnding: Ending.each("commit", { exactly: 1, across: "reload" }),                         // NEW: Ending
    // write-lane rule: two writers never hold one lane
    laneExclusive: Never.both(Lane("stock:sku"), { writers: 2 }),                                // NEW: Lane
    // temporal: a held payment is eventually released, if the fake server answers
    heldReleases: Eventually(Held("pay"), { fair: "world" }),                                    // NEW
  },
})
```

Kinds in one table:

| Kind           | Example                                  | Decided how (section 2)  |
| -------------- | ---------------------------------------- | ------------------------ |
| state / event  | `Never.on("Pay", { in: "Empty" })`       | A: `Compiled` only       |
| data invariant | `paidHasReceipt`                         | C or D                   |
| temporal       | `LeadsTo`, `Eventually` under `fair`     | B, with cycle search     |
| ending         | `Ending.each(...)`                       | B, over the reload sweep |
| refinement     | `Prove.refines(Spec, Impl)` (NEW, later) | B, trace inclusion       |

Rule of thumb: properties never import a machine's internals. They see the same public reads a Story checkpoint
does (state, context, lanes, records), so the single graph and static analysis stay intact.

## 2. How each kind is proved

**A. Exhaustive over `Compiled` alone (SPARK flow analysis, Coq/Lean "decide").** `Compiled` is finite per machine,
so these need no run at all: unreachable states, events no state handles, dead ends, `Never.on(event, { in })`,
reachability of a named state, "every Submitting state has an exit". The answer is a proof or a path, in
milliseconds. This is SPARK's cheap tier: the flow analysis that runs before any proof.

**B. Bounded explicit-state search (TLC, Alloy).** Treat a Story step as one transition and breadth-first search
the product of reachable (World, state) pairs, hashing states to stop revisits (TLC's fingerprint set). Bound
what grows: actors, step count, `.each` fan-out, reloads (Alloy's scopes: "no counterexample within these
bounds" is a real result, said as such). Fairness assumptions come from the world words (`hold`, `release`, `lose`)
as TLC's weak fairness does. Liveness is a cycle search over the same graph (TLC's approach, Stateright does the
same). Result: `refuted` with a trace, or `holds within bounds`, never `proved`.

**C. Inductive invariants (Coq, Lean, SPARK loop invariants).** The developer states `inv`; the prover checks two
things one step at a time, with no search: (1) `inv` holds in every initial state; (2) for each `Compiled` edge,
`inv(s) and guard => inv(step(s, e))`. A failure is a single edge, which is far more useful than a long trace. This
is the induction step of Lean and Coq, without tactics: `step` is the one lemma and it is computable. If the
invariant is too weak, the failing edge is a counterexample to induction (CTI, from Ivy), which tells the developer
what to strengthen. Optional **new** sugar: `Always(p, { strengthen: q })`, where `q` is a helper invariant that is
also proved, like a Lean `have`.

**D. Data obligations through SMT (SPARK + Z3, refinement types).** Context arithmetic ("total equals the sum of
lines", "stock never negative") is outside what `Compiled` sees. For machines whose transitions are written in a
small declared fragment (assign, compare, add, a `Schema` refinement), generate one proof obligation per edge
and hand it to a solver, as SPARK hands verification conditions to Why3 and Z3. Optional dependency, behind a
solver seam; with no solver installed these report `unproved`, never silently pass. Schema refinements double
as refinement types: the decoded value is trusted, so the obligation is only about transitions.

**E. Counterexamples as minimal Stories (QuickCheck shrinking, TLC trace minimisation).** Every refutation is a
Story: steps, checkpoints, fake words. Shrinking reuses the existing generated-run shrinker (step chunks, single
steps, smaller inputs). BFS already finds a shortest trace; shrinking then reduces inputs. The failing Story is
written out so `flow story` replays it with the production Runtime: the proof tool and the test tool agree.

**F. Symbolic execution (KLEE, SPARK's path conditions).** Later, if D grows: run `step` on symbolic context values
and collect path conditions, so "for all amounts" replaces sampled amounts. Only worth it with a solver already in.

## 3. Reuse of the Story system

- **Counterexample = Story.** The prover emits `Story.app(...).send(...).reload(...).checkpoint(...)` data and the
  existing `run()` replays it. No new trace format.
- **Story steps = the transition alphabet.** `send`, `together`, `world`, `advance`, `reload`, `ensure`, `dispose`
  are the moves the search may take; the existing step data forms are the labels on edges.
- **Run rules = properties.** Rules applied to every run today (ending guarantees, lane rules) become `Always`
  properties; a rule that holds in all generated runs is a candidate to be proved. One definition, two checkers:
  the sampler finds bugs fast, the prover closes the question.
- **Fixture samples = input domains.** Search draws payloads from the same `Samples` the generated runs and bench
  use; edge-value samples (empty, max, unicode) are the small domains B can enumerate, and the same ones a
  solver would be told are the boundary values.
- **Reload and pair sweeps = state-space moves.** The sweep reloads at every step; in B a reload is one more
  edge, so "across reloads" properties come for free.
- **Fakes = the environment.** Fake servers and clocks are the only nondeterminism the search branches on (answer
  order, hold, lose), exactly as P language models the environment.

## 4. What it would take, honestly

**Hard parts.**
- State explosion: `.each` over N items and many actors multiply. Needs symmetry reduction (identical actors are
  interchangeable, as in Murphi/TLC symmetry sets), partial-order reduction on independent lanes, and hard bounds.
- Data in memory: contexts are rich values. Hashing needs a canonical encoding (the persistence encoders may
  serve); abstraction (keep only the fields a property reads, a cone of influence cut) is what makes it feasible.
- Time and timers: virtual time is deterministic, but `advance` has an infinite choice space; discretise to
  "next timer" jumps only (the existing `advance({ next })`).
- The outside world: fakes are code, not data. Search can only branch on declared world words, so a fake with
  hidden state is a hole in the proof. Say so in the report.
- Effects in transitions: `step` is pure, but the host runs the effects. Proofs are about the core's turns plus the
  fake-world words, not about the real network.

**Smallest useful slice (one Spec, a few days of work).**
1. `*.props.ts` discovery through `flow.config.ts`, as Stories are found today.
2. Kind A only: reachability, dead ends, `Never.on`. All from `Compiled`.
3. Kind B with a depth bound on one machine, no `.each`, returning a shrunk Story.
4. `flow check` prints `proved`, `refuted(Story)`, or `no counterexample within bounds N`; exit code only.

Then, in order: apps with two actors, `Ending` across the reload sweep, kind C (`inv` edge checks), and last D.

**Never promise.**
- "Proved" over unbounded actors, steps or data when the search was bounded. Three honest verdicts only: `proved`,
  `refuted`, `holds within bounds` (and `unproved` when a solver is missing).
- Proofs of the real network, browser, or any service behind a fake.
- That properties are complete. A proved property is only as good as its statement; vacuity checks (is the
  premise ever reachable?) should be on by default, as in SPARK and model checkers.
- Speed on large apps. Bounds and abstractions are the developer's dial, not a guarantee.

## 5. Prior art in other runtimes

- **XState `@xstate/test`:** builds test paths from a machine's graph (shortest path, simple paths). Take the idea
  of paths as the unit; skip it for depth, since it is only coverage.
- **P language (AWS):** state machines plus an explicit environment model, checked by systematic scheduler
  exploration. Take: fakes as the declared environment, and one spec monitor per property, run beside the system.
- **Ivy (McMillan):** inductive invariants with interactive counterexamples to induction. Take: kind C reports the
  failing edge, and the developer strengthens the invariant.
- **Quint:** a TLA-like language with a typed, readable syntax and a randomized simulator beside a model checker.
  Take: the two modes, `run` (random, fast) and `verify` (exhaustive), over the same spec. Here: generated runs
  and the prover over the same props.
- **Stateright (Rust):** actor model checker that runs the real implementation, not a model. Take: check the
  production `step`, not a copy; this is Flow's biggest advantage.
- **Alloy / TLC (already above):** bounded scopes and fingerprinted state sets.

## Open ideas (not decided)

- Should `Always` predicates be plain functions (easy, opaque to D) or a small expression language (solver-ready,
  less convenient)? Leaning functions first, a typed fragment only if D is ever built.
- Could `flow check` fold into "the prover with all properties at depth 0", so one command covers both?
- Do properties double as docs in `flow explain` output? Probably, cheaply, as the property's id and text.
