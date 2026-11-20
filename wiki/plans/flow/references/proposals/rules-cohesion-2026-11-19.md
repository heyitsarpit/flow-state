# Rules cohesion across Flow's features (proposed, 2026-11-19)

**Status (2026-11-20):** acted on: design input to @task.V3.T106, cited from its comments. The text below is prior art.

**Bottom line (proposed, nothing here is decided):** the rules design in @task.V3.T106 covers every Flow feature with
three changes and no rule kind per feature. (1) Value rules read the snapshot a guard already reads
(`{ state, memory, props, context, schedules, operations }`, Turn R12), not only state and memory; that alone covers
operation rows, props, context, armed schedules, stream rows and reloads. (2) `transitions` also gets `turn`: the
event, its outcome (accepted, denied with codes, unhandled) and what it emitted, which are the only facts of a turn no
snapshot shows. (3) `never` takes one edge pattern, `{ from | outside, to, on, does }`, where `does` is any static
effect token (a commit, an emit, a send's event, a stream placement), so "a charge starts only in PAY" and "Focus is
emitted only from OPEN" are one form proved by `flow check`. Each value rule may name its subject (`in: S.X`,
`on: E.X`) so the report counts the subject, not every publication; a vacuous rule shows as unseen. "Every ending
handled" leaves the user's rule list: it is already a built-in `flow check` error for every operation. Nothing runs in
production. Ten of the fourteen features need nothing new.

**Why now:** the user likes T106's simple design (typed `S`, `E`, `O` tokens in the `machine()` callback; structural
rules proved by `flow check`; value rules judged by every run with a tier). It was written against states and memory
only. This pass checks it against every other feature before the Spec is written.

**Read first:** @task.V3.T106 and its design-constraint comment;
code:wiki/plans/flow/references/proposals/alchemy-adoption-2026-11-19.md; Turn R12 (code:wiki/specs/core/Turn.spec);
@plan.CommandLine O5 (the built-in check list).

## Feature verdicts

"Input" means change (1) above, "turn" change (2), "pattern" change (3). A run rule is one of Flow's own runtime
guarantees in `tests/rules/`, which no app can break and no app restates.

| Feature | Verdict | Reason in one line (details below) |
|---|---|---|
| States, nested states | nothing | `S.X.is` already means "X or below" |
| Memory | nothing | T106's three value forms |
| Operation endings | nothing | every ending handled is already a built-in `flow check` error |
| Operation rows, lanes | value, by input | rows are in the guard snapshot; lane mechanics are run rules |
| Where commits start | structural, by pattern | commits are static action data |
| Denials | value, by turn | a denied turn changes no snapshot |
| Schedules | value, by input | arming is state-scoped by construction; armed names are in the snapshot |
| Fragments | both, per placement | rules in the fragment body, judged per placement and copy (P4) |
| Emits | value, by turn; structural, by pattern | emits are stored nowhere; where they start is static |
| Props | value, by input | props sit beside memory, never in it |
| Context | value, by input | a consumer's own context slot; provider agreement is the runtime's |
| Sends | structural, by pattern; else `relations` | the event is static; the target is an erased callback |
| Persistence, reloads | nothing | a restore publishes, and the reload sweep judges every rule |
| Lifetimes, disposal | nothing | disposal is run rules and host-driven |
| Streams | value, by input; structural, by pattern | values arrive as events; rows in the snapshot; placement static |
| Entities | nothing | coherence has its own runtime oracle |
| Lazy features | nothing; a report reason | check loads lazy entries; runs say "never adopted" |

Details, with the evidence:

- **Nested states:** Machines O2; `src/core/tree.ts:14`. `never({ to })`, `terminal` and `reachable` read a
  compound as its subtree.
- **Operation endings:** an adopted ending unhandled in a leaf of its arrival set, NotSent unmapped where it can
  occur and a late event with no handler are errors (@plan.CommandLine O5); `UnknownEvent` and
  `UnknownNotUncertain` are built (`src/operation-checks.ts:14-68`).
- **Rows and lanes:** "memory says an add is in flight only while its lane is busy" needs `operations` (Operations
  O8). One ending, nothing after definite are run rules (WriteLanes I3, I15, I16).
- **Where commits start:** `never({ outside: S.PAY, does: O.charge.commit })`. Guards make the graph an
  over-approximation, so a `never` the graph proves is sound.
- **Denials:** Turn I14. `turn.outcome` shows the codes; a rule whose subject is a denial is counted.
- **Schedules:** exit stops a state's schedules (`src/core/serve.ts:244-257`). A missing `disarmOn` (still armed
  while the state stays) is an invariant over `schedules`. A repeating schedule is never quiet, so `eventually`
  reports inconclusive, never pass (Testing O6).
- **Fragments:** unfilled ports and unreachable exits are already built-in findings (Compile Spec; @plan.CommandLine
  O5). See Composition.
- **Emits:** never stored (Machines O2), so only `turn.emitted` sees a wrong payload or a missing emit. `UnusedEmit`
  is a planned warning (StaticCli R11).
- **Props, context:** Turn R12 gives guards `props` and `context` beside memory. "Context equals the provider's
  selection" is Actors I27.
- **Sends:** the target is a `to` callback (`src/send.ts:12`), so what the target did is judged by `relations` at
  quiet points.
- **Persistence, reloads:** a restore publishes (`src/core/incarnations.ts:233`), so `invariants` judge the
  restored snapshot. A restore is not a turn (Restore I2), so `transitions` rightly skip it. Record rules are run
  rules (Restore I1, WriteAhead I3, I20, I21, Codec I7).
- **Lifetimes, disposal:** Actors I30, I37, I38. A `NotSent { Disposed }` ending is an ordinary turn.
- **Streams:** exhaustive failure mapping and release on exit are by construction (Operations O4, O7); rows
  (`connection`, `catchingUp`) are in `operations`; placement is `does: O.feed.subscribe`.
- **Entities:** `domainPropertyOptions` (EntityDomains O4) owns coherence, rollback and no regress. App meaning
  over a domain write reads its row through `operations`.
- **Lazy features:** @plan.LazyFeatures O5. A never-adopted feature's value rules report "unseen: never adopted",
  not "unseen: subject not met".

## The API, before and after

Before is T106's design as its comment describes it (proposed, not built). After is this proposal. The fixture is shop
(`fixtures/shop/machines/cart.ts`, `checkout-flow.ts`). `emits.LineAdded` on Cart is added only to show emits; shop
declares no emit today. The Upload trait is the Plan's (Machines O2), since fragments are not built.

### Before (T106)

```ts
// existing: definition, machine, Flow, deny, S, E, O, token.is, actions, updateMemory, guard
// T106 (proposed, accepted as a concept): rules, never, terminal, reachable, invariants, transitions, eventually,
//   relations, before, after
// user-defined: ShippingHasAddress, StepsMoveForward, NotStuckBusy, NoChargeOutsidePay

export const CheckoutFlowMachine = machine(CheckoutFlow, ({ S, E }) => ({
  default: S.BROWSING,
  onContext: [/* existing, unchanged */],
  on: {/* existing, unchanged */},
  states: {/* existing, unchanged */},
  rules: {
    terminal: [S.DONE],
    reachable: [S.DONE],
    never: [[S.DONE, S.BROWSING]],                                   // a pair: no step from DONE to BROWSING
    invariants: {
      ShippingHasAddress: ({ state, memory }) => !S.SHIPPING.is(state) || memory.line1 !== "",
    },
    transitions: {
      StepsMoveForward: ({ before, after }) => !S.DONE.is(before.state) || S.DONE.is(after.state),
    },
    eventually: {
      NotStuckBusy: ({ memory }) => !memory.cartWaiting,             // at the end of a run that ran its course
    },
  },
}));

export const CartMachine = machine(Cart, ({ S, O }) => ({
  default: S.OPEN,
  on: {/* existing, unchanged */},
  rules: {
    // "the add lane is busy" and "a LineAdded matches the line" cannot be said: rules see state and memory only
    invariants: {},
  },
}));

export const shopApp = app({
  id: "shop",
  machines: { cart: CartMachine, checkout: CheckoutFlowMachine, pay: PayMachine },
  relations: {},
});
```

### After (proposed)

```ts
// existing: definition, machine, trait, app, Flow, deny, S, E, O, emits, token.is, O.x.get, actorRef
// T106 (proposed): rules, terminal, reachable, invariants, transitions, eventually, relations, before, after
// NEW: in, on (a rule's subject); turn, turn.event, turn.outcome, turn.emitted; emits.X.is; does, outside;
//      actors.of, actors.get
// changed: never takes an edge pattern { from | outside, to, on, does } instead of a state pair
// changed: invariants, transitions, eventually read the guard's snapshot (adds props, context, schedules,
//          operations)
// changed: eventually holds at every quiet point, the end of a run among them
// user-defined: every rule name, emits.LineAdded, busy

export const Cart = definition({
  id: "Shop/Cart",
  persist: true,
  states: ["OPEN"],
  events: {/* existing, unchanged */},
  internalEvents: {/* existing, unchanged */},
  memory: {/* existing, unchanged */},
  emits: { LineAdded: { lineId: Schema.String, quantity: Schema.Number } }, // user-defined: LineAdded
  context: {/* existing, unchanged */},
  operations: ({ E }) => ({/* existing, unchanged */}),
});

const busy = (row: { readonly pending: boolean; readonly uncertain: boolean; readonly waiting: boolean }) =>
  row.pending || row.uncertain || row.waiting;                       // user-defined: busy

export const CartMachine = machine(Cart, ({ S, E, O, emits }) => ({
  default: S.OPEN,
  on: {
    Added: {
      updateMemory: ({ memory, event }) => ({ lines: answered(memory, event), adding: "" }),
      emit: [emits.LineAdded.from(({ event }) => ({ lineId: event.lineId, quantity: event.quantity }))],
    },
    /* every other handler existing, unchanged */
  },
  rules: {
    never: {
      NoAddAfterUnsure: { on: E.AddUnsure, does: O.add.commit },     // NEW: on, does; a retry, never a new commit
    },
    invariants: {
      // Catches: a handler that forgets `adding: ""`, or a reload that restores `adding` without its lane,
      // leaving Add denied with AddInFlight forever. State and memory alone cannot see the lane.
      AddingMeansBusy: ({ memory, operations }) =>                   // changed: operations in the input
        memory.adding === "" || busy(O.add.get({ operations }, { cartId: memory.owner })),
      AtMostOneRetry: ({ memory, operations }) =>
        O.add.get({ operations }, { cartId: memory.owner }).retryCount <= 1,
    },
    transitions: {
      // Catches: LineAdded emitted twice, or with the asked quantity instead of the answered one.
      LineAddedMatchesAnswer: {
        on: E.Added,                                                 // NEW: on; seen counts Added turns only
        check: ({ after, turn }) => {                                // NEW: turn
          const added = turn.emitted.filter(emits.LineAdded.is);     // NEW: turn.emitted, emits.X.is
          return added.length === 1 && after.memory.lines[added[0].lineId]?.quantity === added[0].quantity;
        },
      },
    },
    eventually: {
      NothingLeftWaiting: ({ memory }) => waiting(memory) === false, // changed: judged at every quiet point
    },
  },
}));

export const CheckoutFlowMachine = machine(CheckoutFlow, ({ S, E }) => ({
  default: S.BROWSING,
  onContext: [/* existing, unchanged */],
  on: {/* existing, unchanged */},
  states: {/* existing, unchanged */},
  rules: {
    terminal: [S.DONE],                                              // proved: no edge leaves DONE's subtree
    reachable: [S.DONE],                                             // graph: possible; runs: seen N or unseen
    never: {
      PayOnlyFromPay: { outside: S.PAY, does: Pay.E.PayRequested },  // NEW: outside, does; a send's event token
      NoWayBackFromDone: { from: S.DONE, to: S.BROWSING },           // changed: an edge pattern, not a pair
    },
    invariants: {
      ShippingHasAddress: { in: S.SHIPPING, check: ({ memory }) => memory.line1 !== "" }, // NEW: in
    },
    transitions: {
      // Catches: a stale `cartWaiting` copy that denies Begin after the cart has answered.
      BusyDenialIsTrue: {
        on: E.Begin,
        check: ({ before, turn }) =>
          !(turn.outcome._tag === "Denied" && turn.outcome.codes.includes("CartBusy")) || // NEW: turn.outcome
          before.context.busy,                                       // changed: context in the input
      },
    },
    eventually: {
      // Catches: an onContext mirror that misses a wave. Mid-wave it may lag; at a quiet point it must not.
      CountMirrorCurrent: ({ memory, context }) => memory.lineCount === context.count,
    },
  },
}));

// A fragment's rules, in its body, over its own tokens (Plan shape; fragments land in P4)
const Upload = trait(
  {
    id: "Upload",
    events: { Cancel: {} },
    memory: { ref: Flow.input(Schema.String), cancelled: Flow.initial(Schema.Boolean, false) },
  },
  ({ E }) => ({
    on: { Cancel: { target: "self", updateMemory: () => ({ cancelled: true }) } },
    rules: {                                                         // NEW: rules on a fragment body
      transitions: {
        CancelSticks: ({ before, after }) => !before.memory.cancelled || after.memory.cancelled,
      },
    },
  }),
);
// Placed as `uploads: Upload.each({ of: "attachments", by: "ref", max: 10 })`, the rule is judged per copy and
// reported as Desk/Editor/uploads.CancelSticks; the host adds rules, never removes or weakens one.

export const shopApp = app({
  id: "shop",
  machines: { cart: CartMachine, checkout: CheckoutFlowMachine, pay: PayMachine },
  relations: {                                                       // T106: relations, at every quiet point
    // Catches: a send to a hard-coded Pay ref that charges while that checkout is elsewhere.
    PayingHasItsCheckout: ({ actors }) =>                            // NEW: actors.of, actors.get
      actors.of(CheckoutFlowMachine).every(
        (flow) =>
          CheckoutFlow.S.PAY.is(flow.snapshot) || CheckoutFlow.S.DONE.is(flow.snapshot) ||
          actors.get(actorRef(PayMachine, flow.snapshot.memory.cartId)).pipe(
            Option.match({ onNone: () => true, onSome: (pay) => Pay.S.IDLE.is(pay) }),
          ),
      ),
  },
});
```

**What is added, and the wrong ending each prevents:**
- The guard's snapshot as rule input (props, context, schedules, operations): rules on rows, props, context and armed
  schedules. Without it they pass vacuously over memory, or need a stored copy of a fact (the cart's `cartWaiting`,
  NUMBER-12's `lastCommit.seq`), which "store facts, derive views" forbids.
- `turn` with `event`, `outcome`, `emitted`: emits are stored nowhere, and a denial leaves no snapshot change. Alchemy's
  `Transition` carries the step's recorded events for the same reason (`codebases/alchemy/packages/domain/src/
  Aggregate.ts:121-130`).
- `in` and `on`: without a subject the report counts every publication, so `!S.PAY.is(s) || …` is "checked 4,000"
  while no run reached PAY. With it, a rule whose subject never occurred is unseen, and `flow check` fails a rule
  whose subject the graph cannot reach.
- `never` as an edge pattern with `does` and `outside`: one form for every static effect (commit, retry, cancel,
  emit, send event, stream placement). A rule per feature would be `commitsOnlyIn`, `emitsOnlyIn`, `sendsOnlyIn`,
  `placedOnlyIn`.
- `eventually` at every quiet point: a breach is found at the first quiet point, with a shorter Story, instead of
  only at the end; the end is one quiet point, so no rule loses meaning.
- `actors.of(machine)` and `actors.get(ref)` on `relations`: typed reads by machine and ref, never by actor id.
- `rules` on a fragment body: a reused fragment states its rule once instead of in every host.

**What is dropped:** "every ending handled" as a user rule (a built-in error for every operation); the state-pair
form of `never`.

**Rejected after checking:** `turn.sent` and `turn.ran` (a send's event and a commit are static, so `never` covers
where; what a send did shows in `relations`; a commit shows in rows); schedule arm and disarm in `turn` (derived from
`before.schedules` and `after.schedules`); per-field persistence rules (persistence is one flag per machine,
`src/core/compiled.ts:320`, so there is nothing to check); an actor-disposed record (disposal is host-driven);
an entity rule kind (the domain oracle owns coherence); `armable` and `handled` user rules (built-in checks, below);
a `relations` rule for context-linked actors (write it on the consumer over its own `context`).

## Composition

- **Fragments:** a fragment's rules compile with its body. On placement they are re-scoped to the instance path: its
  tokens, its memory slice, its rows. Each placement and each `.each` copy is judged separately and named
  `<machine id>/<instance>.<rule>`. Structural rules are proved per placement on the host graph, because a host fills
  ports whose guards are opaque. A host's rules may read the fragment's memory and rows (one namespace, Compile R10).
  Rules only add: a host cannot remove, override or weaken a fragment's rule.
- **Across actors:** linked by context, the rule sits on the consumer over its own `context` slot and is judged at
  every publication (`invariants`) or every quiet point (`eventually`), since mid-wave the consumer may lag (Actors
  R19, I27). Linked only by sends, or not at all, the rule sits on the `app` as `relations`, judged at quiet points.
- **Locality:** machine rules in the `machine()` callback, where `S`, `E`, `O` and `emits` exist; fragment rules in
  the fragment body; only cross-actor `relations` on the `app`.

## Production, tools and cost

- **Production:** nothing runs. The core never calls a rule; a rule is a claim, not a guard (Alchemy's position too).
  `machine()` compiles structural rules into `Compiled` as data and keeps value rules as named closures beside it.
- **`flow check`:** proves or breaks every structural rule; checks every subject token; reports a value rule's subject
  that the graph cannot reach. It never claims a value rule.
- **`flow explain`:** lists each rule under its machine with kind, subject and what judges it (check or runs).
- **`flow graph`:** marks `terminal` and `reachable` states; draws nothing for `never` (it names edges that do not
  exist).
- **The report:** computed by the test reporter for each suite run, never stored:

  ```text
  Shop/CheckoutFlow.terminal(DONE)        proved   flow check
  Shop/CheckoutFlow.reachable(DONE)       possible flow check; seen 37 (stories 6, seeds 200, reload 31)
  Shop/CheckoutFlow.BusyDenialIsTrue      checked  seen 12 (on Begin)
  Shop/Cart.LineAddedMatchesAnswer        checked  seen 418 (on Added)
  Shop/Cart.NothingLeftWaiting            checked  seen 1,930 quiet points; inconclusive 3
  Desk/Editor/uploads.CancelSticks        unseen   never adopted
  ```

  `reachable` has two halves: the graph can only show possible, because guards are opaque, so a run supplies the
  proof. An unseen rule fails the suite unless allowed by name with a reason (the Alchemy proposal, idea 2).
- **Bench:** no cost on the production bench, since the core never calls a rule. Suite cost is one predicate call per
  rule per publication (`invariants`), per turn (`transitions`) or per quiet point (`eventually`, `relations`), plus
  building `turn.emitted` from emit evidence the Inspection Plan already records (Inspection O4). Not measured;
  measure it on the suite with rules on and off before the Spec sets a budget.

## Checks `flow check` gains (proposed names)

- `RuleBroken` (error): a structural rule the compiled graph breaks: an edge matches a `never` pattern; an edge
  leaves a `terminal` state's subtree; a `reachable` state has no path from the default.
- `RuleSubjectUnreachable` (error): a value rule's `in` state or `on` event cannot occur in the graph (no path, or no
  reachable handler), so no run could ever judge it.
- `ScheduleNeverArmed` (warning): a schedule with no `Flow.entry` whose `armOn` events no transition from its state
  accepts. Today nothing checks this (`src/compile-body.ts:315` checks only that the event is declared).

Already built-in, not added: every ending handled, unfilled ports, unreachable exits, `UnusedEmit`, unhandled
events, a foreign token (`ForeignToken`, `src/compile-body.ts:117`).

## Open questions

1. Rules on state nodes: should `states: { PAY: { rules } }` be allowed as the placement form of `in: S.PAY`
   (locality), or is one `rules` block per machine easier to read at a glance? Recommendation: one block, for now.
2. `turn.outcome`: a tagged union as shown, or an Effect `Data.TaggedEnum` with `$is("Denied")`? Deny codes are
   typed literals from `deny(...)`; are they enough, or do they need tokens?
3. Is `eventually` still the right name once it holds at every quiet point? `atRest` reads truer. The name is the
   user's.
4. Whether an operation row is busy in the same publication as the commit that started it (Turn I9 and WriteLanes);
   `AddingMeansBusy` assumes yes. If not, it must be an `eventually` rule.
5. Severity: may an app raise a built-in warning (`UnusedEmit`, an unreachable exit) to an error? That is a config
   knob, not a rule; out of scope here.
6. A dev-only mode that judges value rules in a running app: not proposed; the core stays free of them.
7. Entity field values are not in the guard snapshot (views read records). Should rules read them, or stay with the
   domain oracle? Recommendation: the oracle, until a fixture needs more.

## Found, outside this proposal

- Restore re-arms a record's schedules by name (`src/core/incarnations.ts:228`, `armAt(bound, record.schedules)`);
  no check against the active state's chain was found there. An old or corrupt record could arm a timer for a
  state that is not active. That is a Flow run rule candidate (Restore), not an app rule; not verified beyond those
  lines.
- Emit evidence is in the Plan (Machines O2, Inspection O4) but not in `src/core/evidence.ts`; `turn.emitted` needs it.
- Emits, props and fragments are not built in v3 (`MachineBody` at `src/machine.ts:77-82`); those verdicts rest on
  the Plans.

## Sidecar log

Six Sonnet sidecars, read-only. I re-read the cited lines named below.

- Operations, lanes, denials: accepted the built-in finding list (re-read `operation-checks.ts`, CommandLine O5),
  the evidence shapes (re-read `evidence.ts:66-146`) and the row shape (re-read Operations O8). Changed: its
  `endingsHandled` rule is dropped, as a built-in error; its `turn.members` is dropped for rows plus `never`.
  Rejected: `turn.unchanged` (a denied turn is unchanged by Turn I14).
- Schedules, fragments, tree: accepted nested `S.X` semantics (re-read Machines O2), exit-scoped schedules (cited
  `serve.ts`, not re-read) and the restore re-arm gap (re-read `incarnations.ts:222-233`). Changed: `handled` and
  `armable` become one built-in warning, not user rules. Accepted: fragment rules wait for P4.
- Emits, props, context, sends: accepted that emits, props and fragments are unbuilt (re-read `machine.ts`), that
  emits are never stored (re-read Machines O2), the wave-order lag and the consumer-side locality for context.
  Changed: `sent` is dropped; send events are static, so `never` covers them, and outcomes go to `relations`.
- Persistence, lifetimes, disposal: accepted that a restore publishes (re-read `incarnations.ts:233`) and is not a
  turn. Rejected: a cross-reload `before` (the restored snapshot is judged by `invariants`; a reload pair would need
  the last captured snapshot, which coalescing makes unreliable). Rejected: per-field persistence and an
  actor-disposed record, as having no declaration to check.
- Streams, entities, lazy: accepted the lazy loading claims (re-read CommandLine O5 "including lazy entries") and the
  entity oracle (Testing O6). Accepted the "never adopted" report reason. The stream claims rest on Operations O4,
  not re-read in full.
- Adversary: accepted that most effects are static, so `never` covers them, and that "every ending handled" is
  built-in. Accepted its three real gaps: emit payloads, a schedule left armed in place, send-only relations; each
  has a home above. Changed: `never` stays, because only it gives the proved tier.

## Uncovered

- Not checked: how `before`/`after` type for a `.each` fragment copy whose key is removed in the turn.
- Not checked: the exact typing of `O.x.get({ operations }, key)` outside a guard.
- Not measured: suite cost of rules.
- Not read: Alchemy's Explore and Prove modules beyond the earlier proposal's citations.
