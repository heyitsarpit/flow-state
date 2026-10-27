# Round 1 review: principles, prior art, simplicity, coverage

Reviewer lens: first principles, prior art and standardisation, simplicity and cohesiveness,
feature coverage. Yardstick: [principles.md](../../principles.md). Reviewed: sonnet-single-fragment,
opus-single-fragment, codex-single-fragment, sonnet-split, opus-split, and codex-split (section 7,
added after the others; the cross-proposal section 6 includes it).

Severity: **blocker** = the proposal's verdict or a core rule does not hold as written; **major** = a
correctness hole, a principle violation or a missing answer to an open feature; **minor** = naming,
consistency or presentation.

Plan facts used below (all quoted from the plans):

- Machines O3: updates and action parameters read the pre-turn snapshot; one publication.
- Machines O4: "Guards read only these captured inputs and start no work, so views can trust check."
- Operations O2: "State exit does not cancel finite work; its event reaches the actor's later state."
  Reads have no `unknown` outcome. Outcome members are optional.
- Operations O3: `reject` "declines a second unsettled commit without work or outcome".
- Testing O3/O5: fixtures "cannot inject operation outcomes directly"; replays never obtain outcomes
  "by externally sending internal events".
- `raise`, entry actions and generation fencing do not exist in any plan today.

---

## 1. sonnet-single-fragment.md

### Blocker

1. **§1 "Why one constructor": the main premise is false.** "Choosing the kind ... would force two
   copies of `Field`" is wrong under the split: a trait embedded in a subroutine already lives per
   entry (fragments.md §7 "Fragments embedded inside a mounted fragment live with that mount";
   both split proposals do exactly this with `AddressStep` embedding `Field`). Poll is a stateful,
   exitless subroutine under the split, so it is not evidence either. The one thing a single
   constructor adds is placing a *stateless* fragment directly as a state, which is a "may be
   either" placement (principle 6), and the proposal's own weakness 1 admits the fragment alone no
   longer says its lifetime (principle 2). The cited prior art (React `key`, TCA `ifLet`) supports
   lifetime-by-container, which the split also has. **Fix:** either show a case the split cannot
   express without a wrapper, or concede that `fragment` is the split with one name plus a
   placement check, and forbid stateless fragments in `states`.

### Major

2. **§3, rule 12, request outcomes owned entirely by the fragment.** "The operation's error union
   must be covered by the declared failure tags" couples a generic fragment to every host's error
   tags: a host whose delete fails with `NotFound` cannot bind `CommitWithRetry` without editing
   the fragment. This is E2 in reverse (the fragment grows with its hosts). **Fix:** host maps
   `success` and its own failure tags onto fragment-declared results; the fragment maps `unknown`,
   `interrupt` and `defect` (opus-split §2/rule 7).
3. **Rule 4 / §4.4 `input` "frozen at entry" does not say which snapshot it reads.** Under Machines
   O3 it is the pre-turn snapshot, so `{ target: S.DELETING, updateMemory: ({event}) => ({ ticketId:
   event.id }) }` freezes the *old* ticket id: D2 reappears at entry. **Fix:** state that placement
   input reads the post-update memory and the exit/event payload of the entering transition, or
   require entry data to come from the event/exit payload.
4. **Rule 9 `start` has no rule for entry without a transition.** A placement that is the host's
   `default` is entered at admission, which is not an accepted transition, so `start` (and `input`
   from memory) has no source. **Fix:** forbid `start`/`input` fragments on default paths
   (sonnet-split check 9) or define admission as an entering transition.
5. **Rule 8 `raise` fusion is underspecified.** Not covered: a raised handler that is an ordered list
   of alternatives; a raised handler targeting an inner fragment state while the host targets
   another state; the order of `check()` reasons. "Later wins on the same key" cannot happen
   (slices are disjoint). **Fix:** a composition table like opus-split §4, plus "any declined part
   declines the host event and `check` reports it" (already implied; say it once).
6. **Weakness 6 (abandoned commit loses `unknown`) is a correctness hole, not a convention.** **Fix:**
   adopt codex's mandatory `abandoned: { unknown }` route for commit-bound requests.
7. **`expose` (rule 11, §4.7).** Per-path string lists repeated at every level are still depth ×
   inputs (A1 "prevents" is overstated: Checkout lists six strings for two fields), and `events`
   inside a fragment silently means "owner-only inbox" while at a machine root it means public (A4).
   **Fix:** let the fragment declare who may send (opus-split's three lists) or expose a whole child
   once (codex); rename the fragment field if its meaning differs.
8. **§4.6 AutoSave has no definition, machine or component** (principles §7.2 requires full code).

### Minor

9. `prop<T>({ default })` reuses the machine word `default` (initial child token); `request` is
   Operations prose ("starts a request"); `ignore` is a third way to say "optional". Pick one
   optional form.
10. §8 lists 28 checks; 15, 16 and 18 (request cycles "with no guard on any edge") cannot be decided
    over opaque guards and selectors. Mark them heuristic or drop.
11. §4.4 `guard: ({ state }) => !S.DELETING.SENDING.is(state)`: `.is` takes a snapshot, not a path.
12. §6 `story.fragment(..., { placement: "state" | "part" })` makes the test author choose the
    lifetime, which confirms finding 1. Value props as "functions" conflict with Testing O1 (no
    arbitrary callbacks); `request.fixture` is the right shape (Testing O3).

### Must fix before next round

1. Argue single vs split on a case the split cannot express; otherwise forbid stateless-in-states.
2. Split outcome mapping: host maps success and its tags; fragment maps unknown/interrupt/defect.
3. Define the snapshot entry input reads, and entry at admission.
4. Write the raise composition table, including alternatives and `check`.
5. Add the abandoned-`unknown` route and the full AutoSave host.

---

## 2. opus-single-fragment.md

### Major

1. **§2 verdict on the split.** More honest than sonnet's ("the shape half is real"), but "That is a
   gain: an inline rename is `{ RENAMING: Field(…) }`" is exactly the placement principle 6 forbids,
   and weakness 2 (`TypeToConfirm` embedded keeps its text) is a silent lifetime bug the author
   cannot prevent except by adding fake exits. **Fix:** forbid stateless fragments in `states` (a
   one-leaf subroutine wrapper costs one line), at which point the proposal is the split under one
   name; then argue only the naming.
2. **Rules 15–17, the step model, rewrite Machines O3.** Sequential steps that read the previous
   step's snapshot, entry-time `initial`, then raises: this is the biggest plan change in any
   proposal and doubles what an agent must simulate to predict a turn (and what `check` must
   simulate). It is needed only so `start`/`initial` see the entering transition's updates.
   **Fix:** keep O3 (one pre-turn read, fused patches) and pass entry data by payload, or justify
   the step model by a case fusion cannot express. Keep rule 17 (whole-turn rejection); it is right.
3. **Rule 13, derived event ownership.** An internal event's sender is inferred (schedule-owned,
   reply-owned, "otherwise placer-owned"). One field, three meanings, and the reader must scan the
   whole fragment to know who may raise `Set` (A4, principle 6). **Fix:** declare them (opus-split's
   `hostEvents`).
4. **H1 "prevents" is overstated.** With D11 dropped and `changed` optional, a UI edit reaches `Field`
   with no host reaction at all; a required callback runs after the change and cannot refuse it.
   **Fix:** verdict "reduces"; host-policy inputs go in an explicit host-only list.
5. **Replying callbacks (rule 20).** Every host maps all five outcome kinds onto fragment events
   (`E.DELETING.Rejected`), so CommitWithRetry's meaning of `defect`/`interrupt` is re-decided in
   every host (TicketEditor and Checkout both do it). D2 is "allowed in the host" because the select
   reads live memory. **Fix:** host maps success and tags only; fragment maps the rest; the select
   receives `payload` only (codex §3.4).
6. **§3.6 `.reply(name, event)` injects outcomes**, which Testing O3/O5 forbid for machines. Either
   name the Testing amendment or bind requests to fixture Layers in `story.fragment`.
7. **Weakness 7: abandoned commit `unknown` reaches only an issue.** Adopt codex's abandoned route.

### Minor

8. A host `props` block mixes callbacks (must not leave) and exits (must leave); `done: S.DELETED`
   and a callback shorthand look alike at the host. Acceptable for A2, but say how a reader tells
   them apart (only the fragment's declaration does).
9. Author-chosen names that collide with plan words in examples: callback `send` (schedule field),
   prop and memory key `input` (actor input). Rename in the examples.
10. §3.2 `canEdit: (s) => S.FILLING.is(s) || ...` uses a different guard signature from the rest.
11. `story.fragment` always places as a state; an embedded fragment's lifetime is untestable alone.

### Must fix before next round

1. Forbid stateless-in-states or show why the "either" placement is safe.
2. Replace the step model with O3-compatible fusion, or justify it with a concrete case.
3. Explicit sender lists instead of derived ownership.
4. Outcome division (host: success and tags; fragment: the rest), payload-only select, abandoned
   `unknown`.
5. Resolve `.reply` against Testing O3.

---

## 3. codex-single-fragment.md

### Blocker

1. **§1 rejects the settled premise instead of arguing it.** "The yardstick's 'two kinds are
   settled' contradicts this assignment's fresh-start rule; the latter wins." The yardstick settles
   the *concepts*, not the syntax, so one constructor was open but two kinds were not. The stated
   reason ("a stateless debounce is useful both for an actor's lifetime and inside one temporary
   state") is met by nesting under the split, as codex's own AutoSave shows (`embeds: { quiet:
   Debounce }` inside a state-placed fragment). Rule 3.1.2 ("A state placement accepts either a
   stateful or stateless fragment") is the "may be either" rule. **Fix:** as for the other single
   proposals.

### Major

2. **First send by a zero-delay schedule (§2.5 `READY` + `Begin`).** Every request fragment gains a
   state that exists only to fire, a published intermediate snapshot the UI can see, a turn in which
   the host can leave before anything is sent, and the restore subtleties §3.5 has to explain. It
   is an entry action in disguise and reads worse than one. **Fix:** `start` appended to the
   entering transition (four of five proposals converge on it; Operations O3 is satisfied because
   it rides an accepted transition).
3. **§3.3.4 "A denied raised message consumes that message; it does not undo its source
   transition."** The host event commits while the fragment refused, so `check(host event)` says
   `Allowed` for a turn whose effect was refused: Machines O4's "views can trust check" no longer
   holds. **Fix:** a denied or unhandled raise declines the whole turn.
4. **`events` changes meaning by scope** (§2.1: owner-only inside a fragment, public at the root),
   and `exposes: ["title"]` exports the whole child; a host cannot export `Edit` but keep `Reset`
   private. **Fix:** let the fragment declare its senders (three lists), or expose per event.
5. **Callbacks never target, for any placement (§3.1.4).** A trait that should move its host
   (idle timeout → `LOCKED`, hold-to-confirm → `DELETING`) has no way to do it: the host cannot
   raise its own events. **Fix:** opus-single's rule "a callback never leaves the fragment's own
   node" (an embedded fragment's node is the root, so its callbacks may target host states).
6. **Testing alone (§4) needs a hand-written harness host per fragment.** It respects Testing O3,
   which is right, but principle 10 asks for testing alone; callback calls are visible only through
   host memory the harness author adds. **Fix:** a thin `story.fragment` that generates the harness
   (no new semantics), with requests bound to fixture Layers.
7. **Readability of the document and the API.** About 16 new identifiers (`fragment.prop`,
   `.callback`, `.guard`, `.request`, `.optional`, `embeds`, `exposes`, `props`, `exits`, `raise`,
   `replies`, `abandoned`, `reply`, `payload`, transition `input`, default-path input selector), a
   second handler block (`replies`) beside `on`, and prose built on undefined terms ("reductions",
   "return routes", "producer tokens"). **Fix:** handle replies in `on` with reply tokens typed
   unsendable (opus-single rule 13), and rewrite §3 in plan vocabulary.

### Minor

8. Two input sources for one state instance (transition `input` and a default-path selector) is one
   per entry path but two places to look. Prefer sonnet-split's rule (no input-bearing fragment on
   a default path).
9. Every host maps every outcome kind (same issue as opus-single finding 5).
10. Required guards bound to `() => true` in three hosts: boilerplate that `guard().optional()`
    (allow when unbound, listed by inspection) would remove without hiding anything.

### Strengths worth keeping (see section 6)

Abandoned-`unknown` route, `reject`/pre-invocation cancel delivering `interrupt`, restored in-flight
reads ending as `interrupt`, request select reading `payload` only, one outstanding call per port,
identity-preserving request relay, honest limits on `flow check`, the most complete examples.

### Must fix before next round

1. Argue the kinds honestly; drop the "either" placement.
2. Replace the zero-delay first send with `start`.
3. Denied raise declines the whole turn.
4. Fragment-declared senders, or per-event exposure; one meaning for `events`.
5. Allow embedded-fragment callbacks to target; add a generated test harness.

---

## 4. sonnet-split.md

### Blocker

1. **§2.7 `...AddressStep.accepts` and `forward(E.ADDRESS)`.** Spreading a child's accepts into the
   host's events puts them in the host's flat public namespace with no prefix: two placed fragments
   that both accept `Next` or `Cancel` collide; the send path (`E.SetStreet`) differs from the read
   path (`memory.ADDRESS.street`), which A1 names as a problem; the spread events are public in
   every state and unhandled outside `ADDRESS`. Forwarding inside `AddressStep` is still one event
   and one `also` per field (`SetStreet`, `SetCity`), so A1 is not prevented at the fragment level.
   And keeping D11 keeps E4 (opus-split): a host can refuse `Release` by not forwarding it. **Fix:**
   fragment-declared public events at their full path, plus a host-only list for policy inputs.

### Major

2. **Rule 10, bare payload copy by structural equality.** `also: [E.street.Set]` silently copies the
   triggering payload when field records match. It bends the plans' "bare means payload-free" rule
   and changes behaviour when someone adds a field. **Fix:** always `.from`.
3. **`start` means two things**: the fragment's first actions, and `S.X.start(input)` (entry with
   input). A4 inside one proposal. Input is also route-specific (the `enterAddress` workaround).
   **Fix:** rename one (`S.X.with(f)`), and keep the default-path ban (check 9), which is a good rule.
4. **Results per callback re-declare outcome kinds** (`Unknown`, `Interrupted`, `Defect` as results;
   six exits in CommitWithRetry). Rule 15 requires `unknown` for reads, which reads do not have
   (Operations O2). **Fix:** opus-split's division of the mapping, by request kind.
5. **Rule 9 does not say what composed parts read.** "Host actions first, then composed parts" fixes
   action order only; whether a raised part's guard and update see the host's patch is open.
   **Fix:** state pre-turn reads for every part (O3) and that data passes by payload.
6. **Traits cannot have phases, so AutoSave (§2.2) becomes a subroutine** that occupies the host's
   only active state; and it has no host, definition or component. **Fix:** show the host, and state
   the limit (always-there behaviour with phases keeps its phase in memory, fragments.md §4).
7. **Two names for one contract (`P` tokens, `props` values) plus `gate`, `contract`, `accepts`,
   `also`, `forward`, `results`**: about 14 new words, the most vocabulary of the five. `forward` is
   a second form of a list of `also` lines (one canonical form). **Fix:** one `props`-style namespace
   usable as token and value; drop `forward` once events are reachable at their path.
8. Abandoned commit `unknown`, `reject` hang: see section 6, shared gaps.

### Minor

9. §2.9 `answer(c.props.send, c.send.Busy())`: `c.send` is not defined anywhere; the machine uses
   `E.DELETING.send`. `answer` injects outcomes (Testing O3); name the amendment.
10. Schema value props are decoded per read; say whether that happens each turn.

### Must fix before next round

1. Replace accepts-spread and `forward` with path-addressed events.
2. Remove the implicit payload copy.
3. Rename one `start`.
4. Outcome division by request kind; define what composed parts read.
5. Complete AutoSave with its host.

---

## 5. opus-split.md

### Blocker

1. **Turn semantics contradict themselves.** §0 and §4 say host fillings are substituted at
   construction into ordinary transitions ("one turn, one edge in the graph"); rule 9 says raised
   events run as micro-steps on the updated snapshot, and "a raised event that is unhandled or denied
   is dropped". The second is SCXML's internal queue, not substitution, and dropping a denied raise
   lets the host's event commit while the fragment refused it, so `check(host event)` lies (Machines
   O4). **Fix:** substitution with pre-turn reads and whole-turn decline, which is what §4 already
   describes; data reaches the child by payload.

### Major

2. **Value props removed entirely (§1 row "Value props → input").** Live host values that a fragment
   reads during an activation now have to be pushed by `hostEvents` into fragment memory: that is a
   copy of host memory, the D1 drift and constraint 6 ("never copies") this design otherwise
   prevents. D2 came from *requests* reading live values, which `input` plus request input already
   fixes. **Fix:** keep both, decided by one question (codex §2.1): "must it stay fixed for the
   activation? `input`; otherwise a live value".
3. **Callbacks never target, in either kind (§1, rule 6).** Same gap as codex finding 5: no trait can
   move its host. **Fix:** opus-single's "never leaves the fragment's own node".
4. **`input` is read on the entering transition's pre-turn snapshot (§1).** An exit filling with
   `updateMemory: address` that targeted `S.PLACING` directly would freeze the old address. The
   examples avoid it by passing through `REVIEW`. **Fix:** input reads post-update memory plus the
   exit/event payload.
5. **Admission into a default subroutine** (`Queue` has `default: S.LIVE`) has no entering transition
   for `input` or `start`. **Fix:** forbid input/start subroutines on default paths, or define it.
6. **Outcome mapping by request kind.** The fragment always maps `unknown`, even when the host binds a
   read (weakness 3; check 16 papers over it). **Fix:** declare the request kind (`commit` or `read`)
   so the fragment maps `unknown` only for commits. The host/fragment division itself is the best
   in the set.
7. **Rule 7 request relay** ("a middle fragment fills a child's request with one of its own") is not
   shown in code; `AddressStep` binds no child request. Show it (codex's `send: props.send` shape).
8. **Weakness 9: abandoning an in-flight commit fences its `unknown`** with only a warning (check
   14). Adopt codex's abandoned route.

### Minor

9. `guards` (contract and filling block) beside `guard` (transition field); `request` (selector
   argument) beside Operations' "request". The three event lists are the right idea; the names are
   fine.
10. §6.3 `editable = ({ state }: { state: string })` shows a guard filling typed by hand; the plans
    want inference without annotations (Machines O1).
11. "Every port is required, `{}` means ignore" is good for A6, but say how inspection lists
    explicit no-ops (codex lists optional omissions).
12. "Gaps in principles.md" (E4, A7, H4, D5) are real and should be added to the yardstick.

### Must fix before next round

1. One turn model: substitution, pre-turn reads, whole-turn decline.
2. Restore live value props beside `input`.
3. Let trait callbacks target host states.
4. Define entry input timing and default-path entry.
5. Request kind decides `unknown`; show the relay; add the abandoned route.

---

## 6. Across proposals

Updated after codex-split (section 7). "codex-single" and "codex-split" are named separately.

### Prior art, in one table

| Model | What it settles here | Who follows it |
| --- | --- | --- |
| Harel / UML: a transition from a composite state's boundary preempts its substates | The host may always leave a step | all six |
| UML submachine states: named exit points; connection points must match | Named exits, mapped exhaustively at the placement | all six |
| Subroutine call with arguments; UML entry point | Every entry to a step names its arguments | codex-split (`S.X.call.from(f)`), sonnet-split (`S.X.start(f)`) |
| SCXML `<invoke>`: cancelled invocations' events are ignored; `autoforward` sends outer events to the child | Generation fencing; `autoforward` is prior art for `exposes` | all fence; sonnet-single, codex-single and codex-split expose |
| SCXML `<raise>`: internal queue, each event a microstep on the updated datamodel; unhandled ones dropped | Staged raise | opus-single, opus-split rule 9, codex-single, codex-split |
| XState v5 `invoke` `input`: evaluated once at invocation | Frozen activation `input` | all; opus-split takes it furthest |
| XState v5 `setup()` + `.provide()`: named slots filled by the user | Required props, guards, callbacks | all |
| Effect `R` requirements provided by a Layer; test Layers | Required ports; requests satisfied by fixtures | sonnet-single (`request.fixture`), codex-single, codex-split |
| Elm nested TEA: wrapping child messages, OutMsg | Forwarding cost (A1); callbacks and exits | all name it |
| React props and callbacks; `key` resets state | Live values and notifications; re-entry resets | all; opus-split argues live props caused D2 |

Needlessly novel: the `replies` block (codex-single, codex-split; reply tokens in `on` do the same
job); sonnet-split's accepts-spread and bare payload copy; opus-single's step model; codex-single's
zero-delay first send; codex-split's start *event* plus `READY` state where `start` actions suffice.
Familiar model now used: codex-split's explicit call with arguments is the closest to UML entry
points and to a function call, and is the clearest answer to "where does a step's input come
from". Entry stays single (default only); none offers several named entry points, and none needs to.

Naming caveat for D13: readers coming from Rust and TypeScript read "trait" as an interface with no
state. Scala's stateful traits fit; keep it, but the docs should say so in one line.

### Best idea in each, worth borrowing

- **sonnet-single:** request props bound to fixture Layers in Stories (`request.fixture`), which
  respects Testing O3; liveness checks 14–15 (no exit and no leaving transition; a request sent from
  a state that cannot handle its outcome).
- **opus-single:** one rule for both placements: "a callback never leaves the fragment's own node; an
  exit must". Exits declared in the same contract record as everything else (A2). Whole-turn
  rejection when any composed part is denied.
- **codex-single:** the abandoned-`unknown` route for commits; `reject`/pre-invocation cancel
  answered as `interrupt` so a request never hangs; restored in-flight reads end as `interrupt`;
  request selects read `payload` only (D2 enforced, not conventional); one outstanding call per
  port; request relay through a middle fragment; an honest list of what `flow check` cannot prove.
- **sonnet-split:** `accepts` instead of `events` where the meaning differs; one `contract` block per
  fragment; a subroutine with `input` cannot sit on a default path (check 9); exit-to-entry with the
  exit payload (`S.PLACING.start(({ payload }) => …)`) sidesteps stale pre-turn reads.
- **opus-split:** the fragment declares who may send each event (`events`, `hostEvents`,
  `internalEvents`); the E4 argument that D10 and D11 contradict; the division of outcome mapping
  (host: `success` and its failure tags; fragment: `unknown`, `interrupt`, `defect`); the
  substitution table (§4); the four missing problems (E4, A7, H4, D5).
- **codex-split:** every subroutine entry is an explicit `S.X.call.from(f)`, a bare `S.X` target is a
  type error, and subroutines cannot be defaults (closes the admission gap with one rule); replies
  grouped by outcome class so a failure cannot be mapped onto a success reply; projection-defect
  closure into the `Defected` reply; `reject` forbidden on a request binding (simpler than
  codex-single's `interrupt` translation); per-arming timer identity; the clearest single-vs-split
  argument ("lifetime and control flow, not whether it needs states").

### Where they converge (treat as near-settled)

- Two shapes exist. Even the single proposals keep a placement rule ("embedded: no states, no
  exits"). Three of six now argue the split.
- The host may always abandon a step; abandoning is not an exit; nothing fakes an exit.
- Exits are taken only by the fragment and mapped exhaustively at the placement, with no guard on the
  mapping.
- Fresh memory per entry; schedules stop on leaving; late results fenced per entry generation.
- Fragments do no I/O; a typed request port with an exhaustive outcome mapping replaces host mapping
  onto arbitrary internal events.
- Requests send a value captured at entry, never live fields.
- Nested memory and states are readable at their full path; nobody outside writes them.
- The fragment owns its first send: `start` actions (four), a start event delivered in the entering
  turn (codex-split), a zero-delay timer (codex-single).

### Where they genuinely disagree, and which side the principles favour

| Question | Positions | Principles favour |
| --- | --- | --- |
| One constructor or two | single: sonnet, opus, codex; split: sonnet, opus, codex | **Split.** Principle 2 (reading the fragment tells you its lifetime) and 6 (no "may be either"). Every single proposal ends with the split's placement rule plus an extra stateless-as-state option, which is the forbidden case. codex-split states the reason best: lifetime and control flow, not states. |
| Who may send a fragment's events | host only plus per-path expose (sonnet-single); host only plus spread (sonnet-split); anyone (opus-single); fragment declares three lists (opus-split); private plus per-child expose (codex-single); private plus per-command or per-namespace expose at every boundary (codex-split) | **Fragment declares (opus-split).** Principles 2, 3; E1 and E4. Host policy before a change (H1) uses a `hostEvents` input. Host-side expose is an escape hatch with no failure case the three lists miss (principle 8). codex-split's per-command exposure is the best host-side variant if host-side wins. |
| What a denied or unhandled raise does | whole turn declines (sonnet-single, sonnet-split, opus-single); dropped, source commits (opus-split, codex-single, codex-split) | **Whole turn declines.** Correctness and Machines O4 (`check` must agree with handling). codex-split's one real case for dropping (a `Replace` that should be skipped after a newer edit while the save still returns) is met by making `Replace` total in the child: guarded apply, then an unguarded no-op alternative. That keeps the decision in the fragment that owns it. |
| What raised and entered parts read | pre-turn, fused (sonnet-single, sonnet-split); staged snapshot (opus-single, opus-split rule 9, codex-single, codex-split) | **Pre-turn, fused**, with data passed by payload. It keeps Machines O3 unchanged and gives one graph edge. Staged reads need a concrete case first; codex-split pays for them with a `check` that dry-runs the reducer (Machines O4, React O4 change). |
| Live value props | kept (sonnet-single, opus-single, sonnet-split, codex-single, codex-split); removed (opus-split) | **Keep both live values and `input`**, decided by "must it stay fixed for the activation?" Removing live values forces copies (constraint 6, D1). |
| Can an always-there fragment's callback move the host | yes (sonnet-single, sonnet-split, opus-single); no (opus-split, codex-single, codex-split) | **Yes, via opus-single's rule.** One rule, and coverage for idle and hold triggers. E3 concerns steps, which cannot be ended by callbacks under either reading. codex-split also forbids a scope raising its own events, which closes the only workaround. |
| Who maps operation outcomes | fragment all (sonnet-single); host all (opus-single, codex-single, codex-split); host onto fragment-declared results (sonnet-split); host success and tags, fragment the rest (opus-split) | **opus-split's division**, plus codex-single's payload-only select, abandoned route and `interrupt` on reject (or codex-split's ban on `reject`), and codex-split's outcome-class grouping. The host knows its error tags; the fragment knows what uncertainty means for it. |
| First send | `start` actions (four); start event in the entering turn (codex-split); zero-delay schedule (codex-single) | **`start` actions**, appended to the entering transition. Glanceable, no extra state, and A7 is checkable. codex-split's start event is correct (same turn, no intermediate publication) but adds a `READY` state and an event to every request fragment. |
| How a step gets its input | placement selector (sonnet-single, opus-split, opus-single props); route-specific entry with input (sonnet-split `S.X.start(f)`, codex-split `S.X.call.from(f)`, codex-single transition `input`) | **Explicit call at the entering transition (codex-split)**, with no subroutine defaults. One canonical place, visible on the edge, reads the event or exit payload. Cost: repeated mappers for several routes into one step. |
| Shapes | Schema for recorded data, TS for live values (sonnet-single, opus-single); Schema for every declared shape (sonnet-split, opus-split, codex-single, codex-split) | **Schema for every declared shape**, with guards and selectors as TypeScript functions. One rule an agent can apply without judgment; inspection and `flow graph` can print every contract. |
| Testing alone | dedicated story with outcome injection (opus-single, sonnet-split, opus-split); dedicated story with fixtures (sonnet-single); hand-written harness host with `story.machine` (codex-single, codex-split) | **A dedicated `story.fragment` that generates the harness host and binds requests to fixture Layers.** Principle 10 and Testing O3 together; codex-split's `RetryHarness` (about 45 lines per request fragment) shows the cost of writing it by hand. If injection is kept, name the Testing amendment. |

### Shared gaps none or few address

1. **Snapshot read by entry data.** opus-single (steps), codex-single (staged), sonnet-split (payload
   into `.start`) and codex-split (call mapper, best fed by the event or exit payload) close it. A
   call mapper that reads `memory` still sees the pre-microstep snapshot, so the trap remains when
   one transition both patches memory and calls.
2. **Entry at admission.** A placement on the default path is entered without a transition. Closed by
   sonnet-split (no input-bearing subroutine on a default path) and codex-split (no subroutine
   defaults at all); codex-single defines a selector; the rest are silent.
3. **Operations O2 conflict.** "State exit does not cancel finite work; its event reaches the
   actor's later state" contradicts fencing. Every proposal needs this amendment; codex-split says so
   most directly.
4. **`reject` concurrency and pre-invocation cancel leave a request waiting forever** (Operations
   O3: no outcome). codex-single answers with `interrupt`; codex-split forbids `reject` and answers
   cancel with `interrupt`. The rest miss it.
5. **Restore of an in-flight read.** Reads have no Attempt; only codex-single defines what the waiting
   fragment receives. codex-split covers commits only.
6. **Abandoned commit `unknown`.** Only codex-single routes it to the host as an event; the rest,
   including codex-split, leave it to an issue.
7. **Projection defects** (an outcome mapper or `writes` callback throws, so no event is enqueued,
   Machines O3) leave a request waiting. Only codex-split closes it, into the `Defected` reply.

### Plan impact, compared

| Plan | Needed by all | Extra, by proposal |
| --- | --- | --- |
| Machines O1/O2 | placement, instance names, nested slices, exits, abandonment | sonnet-single: `expose`; codex-single: `exposes`, transition `input`; codex-split: `exposes`, `.call` targets, no subroutine defaults, placement-qualified activities |
| Machines O3 | composition of host and fragment handlers in one turn | opus-single: the step model (largest); opus-split, codex-single, codex-split: staged raise queue |
| Machines O4, React O4 | none | codex-split: `check` dry-runs the reducer, with callback defects possible in render |
| Operations O2/O3 | outcome routing to fragments, exhaustive when bound to a request, fencing exception | sonnet-single: actions without `outcomes`; codex-single: `interrupt` on reject and silent cancel; codex-split: payload-only selects, `reject` banned, projection-defect closure |
| Runtime, Persistence | entry generations; fragment ids and versions in the shape digest | codex-single: durable request routes and read-restore rule; codex-split: invocation and occurrence identities, per-arming timer identity |
| Testing O1 | fragment Stories | opus-single, sonnet-split, opus-split: outcome injection (conflicts with O3/O5) |
| CommandLine O5 | fragment checks | sonnet-single lists 28 checks, some undecidable |

Justified across the board: fencing and the Operations O2 exception, exhaustive mapping when bound
to a request, `start` riding an accepted transition, explicit entry with arguments. Not yet
justified: opus-single's step model, the staged raise (codex-single, codex-split) and its `check`
dry-run, and any Testing outcome injection.

---

## 7. codex-split.md

### Major

1. **§4.4 step 4: a declined or unhandled raised command "does not roll back already accepted
   microsteps", and `check` reports only the first input.** The same blocker as opus-split finding 1
   in effect: `check(host event)` can say `Allowed` for a turn whose effect a child refused. It is
   graded major here only because codex-split names the cost and offers a real case (§3.5: `Done`
   raises `Replace`, whose denial must not undo the return). **Fix:** whole-turn decline, and make
   `Replace` total in `RequiredField` (guarded apply, then `{ target: "self" }`), so "skip if a newer
   edit exists" stays the field's decision and nothing is silently dropped.
2. **§4.4 `check` dry-runs the reducer (Machines O4, React O4).** Running mappers, payload builders
   and projections in every view that calls `check` adds render cost and new defect sites. It is
   needed only because raised parts read staged snapshots. **Fix:** fused pre-turn reads; then
   `check` stays guard-only.
3. **Start as an event plus a `READY` state (§2, §3.1).** Correct (delivered in the entering turn, no
   intermediate publication), but every request-driven step gains a state and an event that exist
   only to begin, and `Poll` handles `Begin` at its root while its default `WAITING` arms a timer that
   the same turn discards. **Fix:** `start: [actions]` appended to the call's transition; it rides an
   accepted transition, so Operations O3 holds.
4. **Abandoned commit `unknown` (§4.2) is left to Operations ownership** ("retain their
   Operations/Persistence ownership"), meaning an issue. codex-single had the right answer. **Fix:**
   restore the mandatory `abandoned: { unknown }` route for commit-bound requests.
5. **Callbacks cannot target, and a scope cannot raise its own events (§4.4).** No trait can move its
   host (idle timeout → `LOCKED`). **Fix:** opus-single's rule; an embedded fragment's node is the
   root, so its callbacks may target host states.
6. **Every host maps every outcome class** (`RenameHost` and `RetryHarness` repeat the same six-line
   mapping). The outcome-class grouping makes it safe but not shorter. **Fix:** host maps `success`
   and its failure tags; the fragment maps `unknown`, `interrupt` and `defect`, keyed by request kind.
7. **`events` inside a fragment are owner-only commands, at the root they are public** (A4), and
   `exposes` is again a host decision repeated at every boundary (three lines for one field path in
   §3.7). Per-command exports are a real improvement over codex-single. **Fix:** fragment-declared
   senders (opus-split); if host-side exposure stays, rename the fragment field.
8. **Testing alone is a hand-written harness** (`RetryHarness`, about 45 lines, and every exit mapped
   again). Respects Testing O3; costs principle 10. **Fix:** `story.fragment` generating the harness,
   with requests bound to fixture Layers.

### Minor

9. `replies` means both the local handler block and the build argument of reply producers (the
   proposal says so). Rename one (`replies` handlers, `reply` producers, as codex-single did).
10. Call mappers that read `memory` (`Submit` in §3.5, `Checkout` in §3.7) see the pre-microstep
    snapshot; the stale-read trap is smaller than elsewhere but still there. Say "a call mapper reads
    the event or exit payload, or the pre-turn memory".
11. Two routes into one step repeat the same `call.from` mapper (`CART` and `READY` in §3.7); a
    named local constant is the workaround, as in sonnet-split.
12. Activities placed on a subroutine become `activities.LIVE.queue` (§3.6, §4.5): a snapshot shape
    change to Machines O8 that the amendments table does not list.
13. Required guards bound to `() => true` (`AddressStep`, `RenameHost`). Allow-when-unbound with an
    inspection listing would remove the noise without hiding anything.
14. The prose relies on "producer capability", "occurrence identity", "microstep reduction";
    rewrite §4 in plan vocabulary.

### Strengths worth keeping

Explicit `S.X.call.from(f)` with bare targets rejected and no subroutine defaults; replies grouped by
outcome class; projection-defect closure; `reject` banned on request bindings; payload-only request
selects; per-arming timer identity; one outstanding request per port; request relay; complete,
parsed examples; the clearest single-vs-split argument of the six.

### Must fix before next round

1. Denied raise declines the whole turn; make `Replace` total; drop the `check` dry-run.
2. Replace the start event and `READY` state with `start` actions.
3. Restore the abandoned-`unknown` route.
4. Allow embedded-fragment callbacks to target host states.
5. Outcome division by request kind; a generated test harness.
