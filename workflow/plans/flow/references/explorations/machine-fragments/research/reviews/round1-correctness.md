# Round 1 review: correctness and static analysis

Lens: which bugs each proposal actually makes impossible, and whether each claimed rule is enforced
by TypeScript or `flow check` at the line that causes it, or is only convention. Checked against
[principles.md](../../principles.md) and the plans (Machines O2/O3/O5, Operations O2/O3/O7).
Proposals' own L1–A6 tables were not trusted; each claim below was rebuilt as an event sequence.

Severity: **blocker** = a legal program silently reaches a wrong state that matters (data loss,
double write, stuck actor) and nothing reports it at authoring time. **major** = a claimed
guarantee is convention, or a sample breaks its own rule or a plan. **minor** = sharp edge, unclear
rule, or example-only bug.

Plan facts the findings lean on:

- Machines O3: updates and action parameters read the **pre-turn** snapshot.
- Machines O5: `restartOn` "establishes a silent baseline and leaves the schedule **idle on entry**".
- Operations O3: `reject` "declines a second unsettled commit **without work or outcome**";
  pre-invocation `cancel` "ends it **silently**"; state exit does not cancel finite work.
- Persistence today saves deadlines and baselines, not fragment activation generations.

---

## 1. sonnet-single-fragment.md (one `fragment()`, `parts` / `states`, `expose`, `request`)

### Blockers

**B1. Abandoned in-flight commit: success and unknown are dropped (L2 fix creates D4/L5).**
Rule 12 and weakness 6. Scenario (4.4): `Delete → Yes` → DELETING.SENDING, commit invoked. A root
handler, or any ancestor handler the host adds later (`on: { Reset: S.VIEWING }`), fires. The
`CancelDelete` guard on DELETING does not cover ancestors. The commit then succeeds and its outcome is
fenced. The cache write lands, but the host stays in VIEWING with "Delete" enabled. The user deletes
again and gets `NotFound`, and the UI shows an error for a delete that worked. With `unknown`, the
Attempt is lost, so `O.x.retry` reconciliation is impossible. Nothing reports it: check 24/25 do not
cover it. Weakness 6 calls guarding the leave "convention". **Fix:** a commit-bound request requires a
host-owned abandoned route (as in codex 3.4, but see codex B1: it must not target). Also add a
`flow check` error for any transition, from any ancestor, that can leave a placement while a commit
request is outstanding with no `O.x.cancel` or abandoned route.

**B2. Silent admission leaves the fragment stuck (A6/L4).** Bind `save` to a descriptor with
`concurrency: "reject"`. Leave DELETING mid-flight via an ancestor, then re-enter it. `start` issues a
second commit for the same key. `reject` declines it with no outcome, and the earlier one is fenced.
CommitWithRetry now sits in SENDING forever. Pre-invocation `cancel` does the same. Check 15
("outcome event not handled") passes, because handlers exist and simply never fire. **Fix:** declined
or silently cancelled admission must answer the request with `interrupt` (codex 3.4). Alternatively,
`request.commit` declares the concurrency it tolerates and the binding is type-checked against the
descriptor's.

**B3. AutoSave loses edits made during a save (D3 fix creates a lost write).** 4.6. Sequence: edits
1–3, then Due (inFlight = 3, save starts). Edit 4 arrives, `restartOn(edits)` re-arms, and Due fires
while inFlight ≠ null. The guard denies it and the second alternative is a no-op. Saved sets
savedEdits = 3. Edit 4 is now dirty with no armed schedule, because a Duration goes idle after
firing. It is never saved unless the user types again. **Fix:** on `Saved`/`Failed`, if
`edits > savedEdits`, save again immediately. Or set `restartOn: ({memory}) => [memory.edits,
memory.inFlight]` so clearing inFlight re-arms. The codex AutoSave `due` bit is a working pattern.

### Majors

**M1. `start` and placement `input` violate the pre-turn rule (Machines O3) and cannot seed from the
event.** Rule 9 says `start` reads "the fresh `initial` memory", but action parameters read the
pre-turn snapshot, where `memory.DELETING` is undefined. The placement `input` reads host `memory`
only, and check 10 forbids reading `event`. Scenario: a list row sends `Delete({ ticketId })`. The
host cannot enter DELETING with that id in one turn. Its `updateMemory` writes ticketId, but `input`
reads the pre-turn ticketId. That gives either a stale id (wrong ticket deleted: D2) or a two-turn
copy (D1). **Fix:** state explicitly that `input` and `start` read the post-patch staged snapshot
plus `event` and exit `payload` (codex 3.1 transition `input`; sonnet-split `S.X.start(({ memory,
payload }))`). List it as a Machines O3 amendment.

**M2. `raise` fusion is underspecified for stateful targets.** Rule 8 says fusion is "resolved at
construction into one transition", but a raised handler depends on the fragment's active inner leaf
and its fallthrough. Raising into a state-placed fragment with states (CommitWithRetry SENDING versus
BACKOFF) cannot be fused statically. The only stated conflict is a raised *exit*. A raised handler
that targets an inner state (`S.BACKOFF`) while the host targets another host state is not covered.
**Fix:** define fusion per active leaf at turn time. Make any second state change in a fused turn a
`flow check` error, and a runtime rejection where it cannot be proven (as in sonnet-split rule 9).

**M3. E2 "prevents" is false for `expose`.** In Checkout (4.7), `expose: ["line1.Set", …]` names
AddressStep's *children's* event names. If AddressStep swaps TextField for a field whose input is
`Change`, Checkout's definition and the UI both break. That is E2 by the yardstick's own definition.
**Fix:** reclassify E2 as "allows, by explicit delegation" (codex is honest here). Or require that
the middle layer re-export under its own names, which is A1 cost.

**M4. Host guards read fragment internals.** In 4.4, `guard: !S.DELETING.SENDING.is(state)`.
Renaming SENDING breaks the host. Check 19 catches the missing path, but the coupling is the bug:
principle 3. It is also the only thing standing between the host and B1. **Fix:** let the fragment
declare abandonment safety (for example `busy` states, or a generated `S.DELETING.inFlight`
predicate), so hosts never name inner states.

**M5. Poll example creates a drifting copy (D1).** In 4.5, `onStale` sets host `stale = true`. A
later `Got` resets `misses` in the fragment, but host `stale` stays true until re-Watch. The view
shows "stale" while data is fresh. **Fix:** read `s.memory.WATCHING.misses >= staleAfter`, or add an
`onFresh` callback. Also tighten the D1 claim: callbacks make copies easy.

**M6. D3 "checked" overclaims.** Check 18 errors only for request cycles with *no guard on any edge*.
The real loop is server write → host value → host raises `Edited` → Due → save. It passes because Due
carries a guard, and only an info finding is emitted. **Fix:** downgrade D3 to "pattern", or check
"a request outcome reaches an edit-counting event" as a warning.

**M7. Restoring in-flight work is promised but not specified.** Rule 12 fences by generation. Unless
generation is persisted and restored, a restored `unknown` (Operations O3) is fenced on reload, and
SENDING is stuck (B2 shape). Section 9 mentions "a placement generation in the snapshot", but no
rule says restore keeps it, or what a pending `request.read` becomes. **Fix:** state that restore
keeps the generation and resolves pending reads as `interrupt` (codex 3.5).

### Minors

- m1. The request binding `O.Tickets.delete.commit(({ payload }) => …)` does not say whether `select`
  can read live `memory`. If it can, D2 is convention. Restrict it to `payload` (codex).
- m2. Poll's `onStale` fires on every miss ≥ 3. It is idempotent here, but the callback is repeated.
- m3. A part's callback may target a host state. A Debounce part timer can then abandon a
  state-placed commit, which is a timer-driven B1. Check 27 does not cover it.
- m4. Fusion denial: raising a guarded `Set` (canEdit) denies the host's own `updateMemory` as well.
  That is probably intended, but `check()` must report the raised guard's code. Say so.

### Must fix before next round

1. B1: an abandoned-commit route, plus a `flow check` error for any leave path while a commit is
   outstanding.
2. B2: silent admission answers `interrupt`.
3. B3: fix AutoSave's lost trailing edit.
4. M1: define the snapshot that `input` and `start` read; allow `event` and `payload`.
5. M2: specify fusion over stateful targets, with one state change per turn.

---

## 2. opus-single-fragment.md (one `fragment()`, everything in `props`, public events)

### Blockers

**B1. The host maps operation outcomes onto fragment reply events, so it can fake or mislabel them
(H3/D4).** In 3.3 the host writes `failure: { TicketLocked: E.DELETING.Busy, … }, unknown:
E.DELETING.Uncertain`. Nothing ties a reply to an outcome *kind*. `unknown: E.DELETING.Busy` type-checks.
Scenario: the order commit times out after invocation and reports `unknown`. The host maps it to
Busy, BACKOFF follows, and a **new** commit with a new Attempt id goes out: a double order.
`success: E.DELETING.Rejected` and `TicketNotFound → Succeeded` are equally legal. Rule 13 restricts
*where* tokens may be used, not *what* they mean. **Fix:** declare each reply's kind
(`replies({ Succeeded: success, Busy: failure, Uncertain: unknown(Attempt) })`) so the types allow
`unknown` only into an `unknown`-kind reply and `success` only into a success reply. Alternatively,
the fragment owns the table (sonnet-single) or the unknown/interrupt/defect half of it (opus-split).

**B2. Abandoned in-flight commit is dropped.** Rules 22 and 24. This is the same scenario as
sonnet-single B1. A fenced `unknown` becomes only an actor issue (weakness 7), and a fenced
`success` is not reported at all. Check 12 is a warning. **Fix:** as sonnet-single B1.

**B3. Silent admission leaves the fragment stuck.** This is the same scenario as sonnet-single B2,
with `concurrency: "reject"` and a re-entry while a fenced call is outstanding. Check 7 passes.
**Fix:** `interrupt` on declined or silently cancelled admission.

### Majors

**M1. `initial({ props })` breaks the definition/machine split (constraint 3) and Machines O1.** In
Field, `initial: ({ props }) => ({ value: props.start, … })`. Props are bound in the **machine**
(`start: ({ memory }) => memory.original`), but `initial` belongs to the definition. Machines O1 says
`initial({ input })`, pure, and it runs in React render (React O2). The definition alone can no
longer produce initial memory. It also creates an ordering dependency: host `initial` must run
before the embedded `initial` that reads `memory.original`. **Fix:** a Schema `input` for seeding,
supplied at the placement from host `input` (embedded) or from the entering transition (state), as
sonnet-split and codex do. Reserve `prop` for live values.

**M2. H1 "prevents" is false.** Rule 12 makes fragment `events` sendable by anyone. Pinned-toggle
case: the UI sends `E.pin.Toggle` directly. The value flips first, and the required callback can
only *react*, by starting a save. The policy "save, then flip on success" cannot be expressed, and a
failed save leaves the local value wrong. Worse, `callback().optional()` and `guard().optional()`
(Field) let a host bind nothing, which is a silent bypass. **Fix:** reclassify H1 as "fragment
author decides" and offer a placer-only command class (opus-split `hostEvents`). Optional guards
should require an explicit `allow` binding, so silence is spelled out.

**M3. Whole-turn rejection on an unhandled raise blocks unrelated host work.** By rule 17, if a host
raises into a state-placed fragment whose current inner leaf does not handle the event, the
*host's* transition is rejected too. Scenario: a host `Save` event updates host memory and raises
`E.EDITOR.Flush`, but EDITOR is in a state without Flush, so Save is refused for a reason the host
cannot see without naming inner states. This may be the right default for correctness, but then
`check()` and a `flow check` warning ("raise into a state that may not handle it") are required.
Neither is listed. **Fix:** add the check, or allow `raise` to be marked optional explicitly.

**M4. D2 is enforced in neither place.** Weakness 8 admits that the fragment may read `props.input`
live at retry. Rule 19 lets the binding's select read `memory` and `context` too, so the host can
read live fields. **Fix:** remove value props from request inputs, and give the binding select only
`payload` (codex 3.4). Then D2 is a type property.

**M5. Restoring in-flight work is unspecified.** Generations are listed under Runtime only. If they
are not persisted, every reload during PLACING fences the restored `unknown`, and the step is stuck
(principles D4; opus-split's "D5"). **Fix:** persist the activation identity, and state the restore
rule for pending lookups.

### Minors

- m1. AddressStep `canEdit: (s) => S.FILLING.is(s)`: a guard receives `{ state, memory, … }`, not a
  snapshot, and `S` here is fragment-local. The type of `.is` on a relative state is undefined.
- m2. AddressStep `Verified` exits with *live* field memory. It is correct only because `canEdit`
  blocks edits while VERIFYING, but placer-owned `Set` is unguarded. Capture the verified address in
  memory instead.
- m3. Checkout `UNCERTAIN: {}` is a dead end with no reconcile path. That is acceptable for a sample,
  but warning 11 checks fragment nodes only.
- m4. The step model (rule 15) reads the previous step's snapshot. That changes Machines O3, and
  `check()` must now simulate the chain. The proposal lists it but says nothing about the cost of a
  `check()` per render.

### Must fix before next round

1. B1: reply kinds typed against outcome kinds.
2. B2 and B3: an abandoned route; `interrupt` on silent admission.
3. M1: seed through `input`, not machine-bound props in `initial`.
4. M2: drop the H1 "prevents" claim, or add placer-only commands.
5. M4: the request select reads `payload` only.

---

## 3. sonnet-split.md (`trait` / `subroutine`, `contract`, `also`, `forward`, `results`)

### Blockers

**B1. AutoSave never saves a single edit (restartOn baseline).** In 2.2, `DIRTY` declares `quiet` with
`restartOn: memory.edits`. By Machines O5, entering DIRTY sets a silent baseline and stays **idle**.
Sequence: CLEAN, `Edit("a")` → DIRTY (the baseline now includes this edit), then nothing. QuietDue
never fires and the draft is never saved. Also: SAVING.EDITED, then `Saved` → DIRTY, idle again, so
the user's in-flight edits are never saved. **Fix:** drop `restartOn`, and handle `Edit` in DIRTY
with `target: S.DIRTY` (explicit re-entry restarts the deadline). Add a `flow check` warning:
"schedule with `restartOn` in a state entered by the event that changes its selection".

**B2. Results are not bound to their callback's operation (H3/H4).** In 2.5,
`const r = E.DELETING.send` lives at machine scope. Rule 15 says only that results come from "a host
operation outcome mapping", not *the* mapping inside `send`'s handler. Scenario: the host adds
`DELETING.on.Force: { actions: [deleteTicket] }`. Two commits are now outstanding. The first answers
`Busy` (BACKOFF), and the second answers `Succeeded` in BACKOFF, where it is unhandled and dropped.
The fragment retries a delete that already happened, gets `NotAllowed`, and exits Failed. Any
`r.Succeeded` can also be mapped from an unrelated operation's `success`. Check 4 only checks that
each result has *some* mapping. **Fix:** results tokens exist only inside the binding
(`send: ({ results }) => op.commit(…)`, as in opus-split). Exactly one operation per binding. Error
on a second outstanding call (codex).

**B3. Host-mapped outcome kinds can be mislabelled.** `unknown: r.Busy` type-checks, giving a
retry with a new Attempt and a double write. The same holds for `success: r.Refused`. Rule 15
requires coverage, not meaning. **Fix:** as in opus-single B1: give results declared kinds, or let
the fragment own unknown/interrupt/defect.

**B4. Abandoned in-flight commit is dropped; silent admission leaves the fragment stuck.** These are
the same scenarios as sonnet-single B1 and B2. Check 22 is "info". The Checkout comment ("no Abandon
here: a send may be in flight") is convention: an ancestor `on` would still abandon. **Fix:** as
there.

### Majors

**M1. Data loss on failure exits.** AutoSave exits `Failed { reason }`, `Uncertain`, `Crashed`, and
subroutine memory is then dropped. The user's unsaved draft disappears. Scenario: type, the server
refuses on validation, the step exits Failed, and the text is gone. **Fix:** every non-success exit
of a draft-holding subroutine carries the draft (`Failed: { reason, value }`). Consider a yardstick
problem for "abnormal exit drops owned drafts".

**M2. The Checkout example can double-place an order.** In 2.7, `Uncertain` goes to FAILED, and
FAILED offers `TryAgain` → enterAddress → a new `place` commit with a new Attempt. The comment says
"check your orders first", but the machine allows retrying. The TicketEditor `Uncertain` exit also
discards `payload.attempt`. **Fix:** keep the Attempt in host memory, and route TryAgain from an
uncertain outcome to `O.Orders.place.retry(attempt)`. Never start a fresh commit.

**M3. `start` versus `S.X.start(input)`: two meanings of one word.** The fragment's `start: [...]`
(actions) and the host's `S.X.start(f)` (input supply) are different concepts sharing a keyword
(A4/principle 7). `start` reads `input`, which is good: it avoids the pre-turn problem. But rule 7's
"cannot be on a default path" is a check-9 error only when *declared* input exists. **Fix:** rename
one of them (for example `S.X.with(input)`).

**M4. Restoring in-flight work is unspecified.** Rule 14 fences by generation, but the plan changes
in section 6 do not persist it. This is the same failure as opus-single M5.

### Minors

- m1. `forward(E.X)` is public delegation of every accept. That is H1-equivalent to `exposes`, but
  host-chosen. The H1 row should say "allows, by explicit host choice".
- m2. `...AddressStep.accepts` spread into host `events` makes the child's accept names part of the
  host's public Event Schema. Swapping AddressStep changes the host API, which is E2 at one level.
  Two spread subroutines that both accept `Cancel` with different payloads collide.
- m3. `Unknown: exits.Uncertain // equal payload: copied`: a bare token carrying a payload breaks the
  plans' "bare = payload-free" rule (they admit it). It should be a type error unless `.from` is
  written.
- m4. Test API drift: `.answer(c.props.send, c.send.Busy())` versus `story.subroutine(...).answer(...)`
  use different token paths.

### Must fix before next round

1. B1: AutoSave's restartOn-idle bug; add the check.
2. B2: lexically scope result tokens to one binding and one operation; at most one outstanding call.
3. B3: typed result kinds.
4. B4: an abandoned route; `interrupt` on silent admission; persist generations.
5. M1 and M2: drafts survive failure exits; uncertain never leads to a fresh commit.

---

## 4. opus-split.md (`trait` / `subroutine`, six ports, `hostEvents`, fragment-owned `requests`)

This is the strongest proposal on outcome authority. The host maps only `success` plus failure tags;
the fragment maps unknown, interrupt and defect; result tokens are scoped to the filling. Remaining
issues:

### Blockers

**B1. Abandoned in-flight commit is dropped.** Rule 4 and the comment at section 1: "a host that
needs the effect of a late commit uses the operation's `writes`". `writes` update the cache, not the
workflow. Scenario: Checkout PLACING is in flight, and a root `Cancel` (they add one on ADDRESS; any
ancestor works) abandons it. The order is placed, and the actor sits in CART with the cart intact.
The user places again: a double order. Check 14 is a warning. **Fix:** a required, non-targeting
abandoned route for commit requests (codex 3.4, minus its target), and make check 14 an error.

**B2. Silent admission leaves the fragment stuck.** Rule 7 says "Concurrency is the host's operation
descriptor's". `reject`, or pre-invocation `cancel`, means no outcome, and SENDING waits forever.
Check 5 (stuck waiting) only checks that a request was *sent*. **Fix:** `interrupt` on declined or
silent admission.

### Majors

**M1. `interrupt → E.Busy` retries a possibly-applied commit.** In CommitWithRetry the comment reads
"not invoked: safe to try again". Operations O7 maps *adapter-reported* interruption to `interrupt`,
and that can happen after invocation. Only pre-invocation states are guaranteed not invoked. Sending
again with a new Attempt can double-charge in PLACING. **Fix:** map `interrupt` to an exit (as
sonnet-split's `NotSent` and codex's `Interrupted` do), or get Operations to guarantee "interrupt ⇒
never invoked" for commits.

**M2. Host can still mislabel failure tags, including as success.** `failure: { StockChanged:
results.Done }` type-checks, and PLACED is reached on an out-of-stock order. **Fix:** a request
declares one success result. The host maps `success` only to it and failure tags only to the other
results.

**M3. A dropped raise commits the host half of the turn.** Rule 9: "A raised event that is unhandled
or denied is dropped and recorded as evidence." Scenario: the host pushes a changed permission as a
`hostEvent` into a subroutine state that does not handle it. The host memory updates and the
fragment never learns, so the two disagree (E1/D1). `check()` reports Allowed. Warning 12 exists,
but the runtime semantics hide the failure. **Fix:** pick one rule across proposals. Whole-turn
rejection is correctness-first, with `check()` reporting the inner code. Or require an explicit
`raise.optional` per raise.

**M4. `input` reads the pre-turn snapshot and has no `event` or `payload`.** Section 1 says "on the
entering transition's pre-turn snapshot", and the filling is `({ memory, context })`. That is the same
failure as sonnet-single M1: a `Delete({ ticketId })` from a list cannot seed DELETING in one turn,
and an exit filling that updates memory and enters a subroutine seeds it with stale data. **Fix:**
`input` receives `{ memory (staged), event, payload }`.

**M5. The H1 claim relies on required callbacks, but `{}` is a legal filling.** Toggle in public
`events` with `onToggled: {}` means a bypassed save, and that is "explicit", not prevented. **Fix:**
reword H1 as "fragment author decides via `hostEvents`". Optionally, give a callback a declared
`mustAct` mode that rejects `{}`.

**M6. Restoring in-flight work.** The D5 row claims "`unknown` is always mapped". That holds only if
the restored result reaches the restored activation. The plan-changes table lists "Runtime:
activation generations" but not their persistence. **Fix:** persist the activation id with the
Attempt association. Pending lookups restore as interrupt.

### Minors

- m1. The request binding `O.x.commit(({ request }) => …)`: state that `select` receives **only**
  `request`, so D2 is a type property and not a habit.
- m2. Guard fillings compare strings (`state === "EDITING"`, relative to the fragment). Type this as
  the fragment's state-path union, or use tokens.
- m3. D3 "prevents": a host can `raise` into a child's public `events` (rule 9 allows public events or
  hostEvents) from a server value, which restores the loop. That makes D3 a pattern.
- m4. Rule 3: `start` reads fresh fragment memory, which is a new exception to Machines O3. List it in
  the plan changes.

### Must fix before next round

1. B1: an abandoned route; check 14 becomes an error.
2. B2: `interrupt` on silent admission.
3. M1: never retry on `interrupt` unless the plans guarantee it means non-invocation.
4. M3: one semantics for an unhandled or denied raise, reported by `check()`.
5. M4: `input` sees staged memory, the event and the payload.

---

## 5. codex-single-fragment.md (one `fragment()`, `exposes`, request ports with `abandoned`)

This is the most complete proposal on async correctness. It answers silent admission with
`interrupt`, scopes reply tokens to the binding, gives the select `payload` only, allows one
outstanding call per port, makes `abandoned.unknown` mandatory, restores pending reads as interrupt,
and lets transition `input` read the payload. Remaining issues:

### Blockers

**B1. The mandatory abandoned-unknown handler is a hidden ending for a *live* activation (E3).**
Section 3.4: the handler is "unguarded … required at the machine root and cannot be shadowed", and
the example targets `S.UNCERTAIN`. Scenario: Leave during SAVE.SENDING (commit A invoked), then
Review → Yes → SAVE (commit B in flight). A resolves `unknown`, the fallback fires, and the root
handler yanks the actor out of SAVE. B is abandoned and its reply fenced; B's success is dropped and
its unknown fires the fallback again. A rule elsewhere ended the live step, which the step's code
says stays. **Fix:** the abandoned handler may only `updateMemory` or act (record the Attempt in a
ledger, or raise a notice). Forbid a `target`, or allow only `"self"`. The host then reconciles from
its own states.

### Majors

**M1. Abandoned *success* has no route.** "Other expired replies are dropped". Abandoning after
invocation followed by success means the cache write lands, but the workflow (RetryHost back in
EDITING) does not know the save happened. A destructive commit (delete, place order) then invites a
second, conflicting command. **Fix:** an optional `abandoned.success` route (non-targeting), and a
`flow check` warning when a transaction request has none.

**M2. Host can mislabel outcomes (H3/D4).** `unknown: reply.Busy` or `failure: { Rejected:
reply.Succeeded }` type-check. The document admits this ("cannot prove someone labels … correctly"),
but it can be prevented for `unknown`: reply kinds. **Fix:** a declared reply kind per variant, with
`unknown` mappable only to a reply carrying `Attempt`.

**M3. AutoSave: FAILED is terminal for saving, and Close drops the draft.** After `Rejected` (including
Busy mapped to "Busy; edit retained"), FAILED handles no `Flush`. Later edits set `due`, Flush is
dropped, and nothing is ever saved. `Close` removes the memory. The message "edit retained" is true
only until Close. **Fix:** FAILED handles `Flush` (retry on the next quiet period), or an exit
carrying the draft. Abandonment of a draft-holding step should be a check warning.

**M4. TextField seeds from a live prop in `initial` (constraint 3).** `initial: ({ props }) =>
props.start` reads a machine-bound value during a definition-owned `initial`. The proposal's own
rule says "`input` is the place for a capture that must not change". **Fix:** `start` becomes an
`input`.

**M5. A denied raise is consumed while its source commits (3.3 rule 4).** In the
`PinRequested` pattern (3.2.5), the host commits a pin, then raises the child `Toggle` on success. If
the child's guard denies it, the toggle is dropped, and the server and the fragment disagree. `check()` of the source says
Allowed. **Fix:** as opus-split M3: one rule across proposals; whole-turn rejection or an explicit
optional raise.

### Minors

- m1. A zero-delay `Begin` for the first send publishes READY for one turn. It is correct and
  deterministic, but a host `check()` or view sees a step that has not sent yet. Restore is handled
  (3.5). This is acceptable: it is the only proposal without a new entry-action concept.
- m2. `InactiveRequestOwner` rejects a whole turn at runtime when a request's owner exits later in
  the same staged turn. That is correct, but the proposal should also list it in the `check()`
  semantics.
- m3. Root-handler shadowing exception: the abandoned handler bypasses the leaf-first rule of
  Machines O2. List it as a plan change.
- m4. The UNCERTAIN host states in the examples are dead ends with no `O.save.retry` path.

### Must fix before next round

1. B1: the abandoned route is non-targeting.
2. M1: an abandoned-success route or warning.
3. M2: reply kinds.
4. M3: AutoSave recovers after FAILED; no silent draft loss.
5. M4: seed through `input`.

---

## 6. Cross-proposal: what to borrow

| Problem (where) | Borrow from | Mechanism |
| --- | --- | --- |
| Stuck on `reject` or silent `cancel` (sonnet-single, opus-single, sonnet-split, opus-split) | codex 3.4 | Declined or pre-invocation-cancelled request is answered `interrupt`; an Operations amendment |
| Request select reads live memory, D2 by convention (sonnet-single, opus-single, opus-split unclear) | codex 3.4 | Binding select receives only `payload` |
| Seeding from an event or exit payload; stale pre-turn input (sonnet-single, opus-split, opus-single M1) | codex 3.1 transition/exit `input`; sonnet-split `S.X.start(({ memory, payload }))` | Input read from the staged snapshot plus event and payload |
| Results misrouted from other operations (sonnet-split) | opus-split section 2 / codex 3.4 | Tokens exist only as the binding function's argument; exactly one operation per binding |
| Second outstanding call (all but codex) | codex | One outstanding call per port, enforced by check plus runtime |
| Mislabelled outcomes (opus-single, sonnet-split, codex-single; opus-split M2) | codex-split 4.3 (preferred); opus-split rule 7 / sonnet-single rule 12 | Replies grouped by outcome class (`success`/`failure`/`unknown`/`interrupt`/`defect`); a mapping may target only a reply of its own class (a type error otherwise) |
| Abandoned in-flight commit (all) | codex `abandoned`, made non-targeting | A required route that records the Attempt; `flow check` error on any leave path while a commit is outstanding |
| Pending read on restore (all but codex, sonnet-single partly) | codex 3.5 | Restore as `interrupt`; persist activation identity |
| AutoSave lost trailing edit (sonnet-single B3) or idle DIRTY (sonnet-split B1) | codex 2.8 `due` bit; codex's debounce note on the restartOn baseline | Coalesce edits during flight, flush after reply; never rely on `restartOn` arming on entry |
| H1 overclaims with public events (opus-single, opus-split) | opus-split `hostEvents` (for opus-single); codex's honest "allows" | Fragment declares placer-only commands; H1 becomes the author's choice |
| Raise failure semantics (opus-split, codex-single and codex-split drop; opus-single and sonnet-split reject) | opus-single rule 17 / sonnet-split rule 9 | Pick whole-turn rejection with `check()` reporting the inner code; optional raises explicit |
| `reject` binding (all except the codex proposals) | codex-split 4.3 | A required request cannot bind a `reject` descriptor (construction error); pair it with the `interrupt` closure for pre-invocation cancel |
| Mapper or projection defect leaves the waiter stuck (all; not addressed elsewhere) | codex-split 4.3 | A request-bound projection defect closes the occurrence with the declared bare `Defected` reply plus an issue |
| First send needs an entry action (`start`) or a zero-delay timer (codex-single READY) | codex-split `S.X.call` + `start: "Begin"` | The call enqueues a private start event in the same turn; no entry action, no extra publication, not replayed on restore |
| Queued debounce firing from before a restart fires the new timer early (all; Machines O5 gap) | codex-split 4.2 | Timer firings carry activation and arming identity |
| A callback raises its own scope's event to dodge the no-target rule (opus-split, codex-single) | codex-split 4.4 | `raise` targets only a direct child's commands, never the authoring scope's own events |

## 7. Problems to add to the yardstick

- **L5 Abandoned effects.** The host leaves a step while a commit is in flight; success or unknown
  is fenced, and the workflow diverges from the server (double delete or double order). Every
  proposal hits it.
- **L6 Silent admission.** A request that starts no work and reports nothing (concurrency `reject`,
  pre-invocation cancel) leaves a waiting state stuck. Opus-split's A7 (forgotten first send) is
  the same family.
- **H4 Misrouted or mislabelled results** (extends opus-split's H4): an outcome mapped onto the
  wrong *kind* of result, especially `unknown` mapped to a retryable result, which causes a fresh
  commit and a double write.
- **D5 Restore in flight** (opus-split): fencing generations and pending reads across reload.
- **D6 Same-turn seeding.** Entry input reading the pre-turn snapshot, or unable to read the
  triggering event or exit payload, which forces a copy (D1) or a stale value (D2).
- **D7 Drafts lost on abnormal endings.** A failure exit or abandonment drops fragment-owned user
  data.
- **T1 Partial turns.** A raised event denied or unhandled while its source commits; `check()`
  reports Allowed for an effect that was half dropped.
- **T2 Schedule traps.** `restartOn` is idle on entry (Machines O5), so a debounce inside a state
  entered by the triggering edit never fires. Separately, a firing already queued before a restart
  can reach the restarted timer and fire it early (codex-split 4.2).
- **E4 Refusal by forwarding** (opus-split): any forwarding layer can refuse an invariant-carrying
  input such as `Release`.

---

## 8. codex-split.md (`trait` / `subroutine`, `.call`, typed request replies)

This section was added after sections 1–7 were circulated; the cross-proposal table in section 6 and
T2 in section 7 were updated for it. On request authority it is the strongest of the six:

- replies are grouped by outcome class, and a mapping may target only its own class;
- `reject` cannot bind a required request;
- a pre-invocation cancel or a projection defect closes the occurrence (as `Interrupted` or
  `Defected`);
- a request's select receives `payload` only;
- one outstanding call per port;
- `S.X.call.from(({ event | payload }))` seeds a step from the event or exit payload;
- the first send is a start event in the same turn;
- timers carry an arming identity.

That closes, in this proposal, most of the shared failures listed in sections 1–5. What remains:

### Blockers

**B1. Abandoned in-flight commit: no route and no check.** Section 4.2 says unknown "retain[s]
Operations/Persistence ownership even if a step no longer receives a reply", which means an issue
at most. Success is dropped. In RenameHost (3.5), `SAVE.on.Leave: S.EDITING` is legal while SENDING.
For a destructive commit (delete, place order) the sequence is: Leave → `unknown` (or success) is
fenced → host in EDITING → Submit → Yes → second commit with a new Attempt → double write. Unlike
codex-single (`abandoned.unknown`) and opus-split (check 14), there is no route and no warning: the
"Potentially stuck request" warning concerns timeouts, not departure. **Fix:** a non-targeting
`abandoned` route on transaction bindings that at least records the Attempt (see codex-single B1),
and a `flow check` error or warning on any owner or ancestor transition that can leave a placement
while a commit occurrence is outstanding without `O.x.cancel`.

### Majors

**M1. A finite read in flight at restore is unspecified, so the poll is stuck.** Section 4.5 covers
acknowledged transactions (→ unknown) and never-invoked work (→ interrupt). A refetch that was
running when the actor was saved has no Attempt and is neither of those. After restore, Poll sits in
REFRESHING waiting for a reply no live operation will deliver. Close still works, but nothing tells
the user. **Fix:** restore every pending read-bound occurrence as `interrupt` (codex-single 3.5).

**M2. `initial({ props })` reads machine-bound live props (constraint 3).** RequiredField seeds with
`props.start ?? ""`. For a root trait, the definition's initial memory then depends on the machine's
bindings, which the definition does not have. It also contradicts the proposal's own split: data
fixed at the start belongs in `input`. Section 4.4 step 3 orders "parent before child", which fixes
evaluation order but not ownership. **Fix:** traits take `input` (Schema) supplied at `embeds.x.input`
from the owner's input or memory. Keep `prop` live-only and unreadable in `initial`.

**M3. Partial turns are accepted, and `check()` hides them.** Section 4.4 step 4: a declined or
unhandled queued command "does not roll back already accepted microsteps". `check` returns only the
first input's verdict. That is deliberate and useful for `Replace` (KeepNewerEdit). But in the
documented PinRequested pattern (4.1), the host commits the pin, then raises the child's Toggle on
success. If the child's guard denies it, the server says pinned and the fragment says not pinned,
and `check(PinConfirmed)` said Allowed. **Fix:** mark expected-deniable raises explicitly
(`raise.optional(E.title.Replace…)`), and make any other declined raise reject the turn. Or at least
emit a `flow check` warning per raise whose target has a guard. Settle this jointly with the other
five (section 6 row).

### Minors

- m1. RenameHost maps `interrupt` to the message "Not invoked". Operations O7 adapter-reported
  interruption can follow invocation. FAILED → EditAgain → a new commit is then a possible double
  write for non-idempotent operations. Label it "may not have run", or have Operations guarantee that
  `interrupt` means never invoked.
- m2. `activities.LIVE.queue`: host activities on a subroutine placement change path. That is a
  snapshot-shape change for ordinary activities (Machines O6 names are flat). List it as an
  amendment.
- m3. `replies.SAVE.onSend.*` is reachable from the whole machine build argument. Legality ("only in
  the operation bound to that exact prop") then needs a per-path brand in the types, or a
  construction check. Say which. opus-split's lexical `({ results }) =>` gives this by scope.
- m4. H1 is "prevents" here but "allows" in codex-single, under the same `exposes` mechanism. Both
  depend on the host choosing the export. Use one verdict: "allows, by explicit export".
- m5. `call.from(({ memory }))` on a transition that also sets `updateMemory` reads the
  pre-microstep memory (4.4 step 1). State this beside `.call`, since D6 is otherwise solved.
- m6. `UNCERTAIN: {}` dead ends in the examples. That is fine for a demo, but no `O.x.retry(attempt)`
  path is shown anywhere.

### Must fix before next round

1. B1: an abandoned-commit route plus a check.
2. M1: in-flight reads restore as `interrupt`.
3. M2: traits seed through `input`, not props in `initial`.
4. M3: explicit optional raises; other declined raises reject the turn.
