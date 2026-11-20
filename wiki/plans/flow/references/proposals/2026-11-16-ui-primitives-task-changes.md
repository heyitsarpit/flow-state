---
proposal ui-primitives-task-changes
status merged 2026-11-16 [@plan.Machines, @plan.Runtime, @plan.React, @plan.Testing, @plan.Inspection, @spec.Turn, @spec.Actors, @spec.Compile, @spec.StaticCli, @spec.WriteAhead, @spec.Restore, @spec.Codec, @task.V3.T72, @task.V3.T76, @task.V3.T77, @task.V3.T78]
    proposed 2026-11-16
---
# UI primitives: proposed Task changes for Q1, Q2, Q3 and Q5

**Bottom line:** the accepted decisions need three new Tasks and changes to ten open or draft Tasks. Nothing here
is applied.

- **New Tasks:** T76 (props), T77 (emits), and T78, which migrates done T71's number input.
- **Changed Tasks:** T57, T56, T21, T22, T73, T72, T9, T29, T30 and T49.

Every new Task, and the schedule work added to T57, waits for the Plan merge in
@proposal.ui-primitives-merge-guide, which needs the user's yes. The user has decided the frame
items (§4): T72 moves from P3 to P4, T76 to T78 join P4, and the command palette keeps `Configure`.

**Read first:** @proposal.ui-primitives-merge-guide §7 (build gaps),
@proposal.ui-primitives-decisions §1.6, §5, §8 W8e and §9, skill:to-task.

All quotes are exact, from the Task files as read on 2026-11-16, with the file's indent dropped.

## 1. Changes to open Tasks

### @task.V3.T57 (draft, P4): schedules, `.each` fan-out and the negative-delay flip

From: Q1, R4, Q2, Q2a–Q2f, G1–G10, R5, batch. It owns most of the guide's build gaps.

Current `satisfies` (P4.task:117): `[@plan.Machines.O1, @plan.Machines.O5]`. Proposed:
`[@plan.Machines.O1, @plan.Machines.O3, @plan.Machines.O5, @plan.Machines.O6, @plan.Machines.O8]`. O3 gains the
fan-out exception, O6 the lane-change re-check and O8 `{ left }`.

Current Read first (P4.task:124):

> **Read first:** @plan.Machines.O5, @spec.Compile, @spec.Turn.

Proposed:

> **Read first:** @plan.Machines.O5, @spec.Turn (R14 to R17, R19, R27, R30 after the merge), @spec.Compile,
> @proposal.ui-primitives-merge-guide. Starts after the Plan merge it
> lists (the user's yes).

Add a Risk paragraph:

> **Risk:** R5 turns a computed negative delay from a refusal into zero. Five built checks use it as their refusal
> case and must move to an over-range delay (2^31 ms, which JSON carries) in the same commit:
> `tests/turn/refusal.test.ts:16`, `tests/write-lanes/ending-delivery.test.ts:18-24`, `tests/pay/pay.test.ts:84`
> and `:100`, and the `busyRefused` Story in `fixtures/pay/stories.ts:33-39`. `tests/compile/construction.test.ts:446`
> stays, because a fixed negative is still DelayOutOfRange.

Add acceptance lines:

> - Keyed and unkeyed schedules take `paused`; a timer shows `{ dueAt }` or `{ left }`, never both; every lane
>   change, a denied or unhandled ending's included, re-checks `keys` and `paused`; restore re-evaluates them
>   silently. Each is shown by a Story test citing @spec.Turn.R27.
> - `armOn` and `disarmOn` take event tokens and Flow.entry, and a non-string token no longer reads as Flow.entry
>   (`src/compile-body.ts`, the `armOn` filter); only `armOn: [Flow.entry]` beside `restartOn`, arming once from
>   step one.
> - `paused` is a record of named reasons; the snapshot shows `pausedBy`. A restored paused multi-step Schedule
>   finishes `left`, then continues from step one.
> - A `FanOutNeverHandled` warning exists; a fixed negative delay is reported by `flow check`.
> - Every function of a keyed schedule receives `key`; `schedule` returns a Duration.Input or an Effect Schedule,
>   and the host steps a Schedule and hands the core the next delay as data.
> - A computed negative delay fires once on the next turn; the five checks named in Risk refuse with an over-range
>   delay instead, and a planted fault "a negative delay refused" is caught.
> - A raise into an .each trait reaches every live copy in key order, skips a copy with no handler (`Unhandled`
>   evidence), refuses on a copy's denial, and does nothing (recorded) with no copies (@spec.Turn.R30).
> - Schedule evidence records pause and resume.

### @task.V3.T56 (draft, P4): the saved paused timer

From: batch (Saved format).

Add acceptance line:

> - An actor record's timer is `{ name, key?, dueAt }` or `{ name, key?, left }` at the next format, and a record of
>   the format before it restores through a pure step with every timer read as `dueAt` (@spec.Restore.T6, with its
>   planted fault "an old timer read as `left`").

Already `blocked_by` T57; no new blocker.

### @task.V3.T21 (draft, P4): the Q6 build gaps

From: Q6a, Q6b, Q6d; decisions §5 G1–G3. The Plans need no change; these are built-code gaps in operations, which
T21 owns (@plan.Operations.O1, O3).

Add acceptance lines:

> - Boot refuses an operation whose service the Runtime Layer lacks, by name, read from the contract's `services`
>   list (decisions §5 G1, G2); the reference contracts list their services.
> - Outcome mappers receive `{ value, input, key, attempt }`, not the value alone (`src/core/serve.ts`, §5 G3;
>   @plan.Operations.O3).

### @task.V3.T22 (draft, P4): graph and explain

From: Q3; batch (`flow explain`); merge guide W2.

Add acceptance line:

> - `flow graph` prints each `emit` part as an edge named as in the turn's evidence, and `flow explain` lists
>   each schedule's pause reasons by name, emit and `onProps` edges, one fan-out edge per copy state, and the copy
>   denials that refuse (@spec.StaticCli.R5 after the merge).

Add to `blocked_by`: @task.V3.T77. It builds the `emit` part that graph reads.

### @task.V3.T73 (draft, P4): the prompt (token input) fixture

From: R1, Q5, W8c, W8e.

Current Risk (P4.task:303-305):

> **Risk:** the generality pass found that props in `Flow.input` reset the actor; send props by event (or use
> declared props if the user accepts them first). The proposal names three probable upstream bugs (a collapse
> while loading, a stale `hasMore`, a refused undo); pin the correct behaviour, not upstream's.

Proposed:

> **Risk:** the three primitives are local actors, so their parent's configuration is declared props
> (@task.V3.T76), and view events are emits (@task.V3.T77); no `Configure` event. The proposal names three
> probable upstream bugs (a collapse while loading, a stale `hasMore`, a refused undo); pin the correct
> behaviour, not upstream's.

Add a paragraph:

> **Approach (prompt):** entries store `{ id, ref, label? }`; a token's status is read from the mention lookup's
> rows, and the selector hides failed tokens, so undo brings one back as failed. `readOnly` is a prop. The
> composing draft is a trait on COMPOSING. Drop `value`, `loading` and token `status` from memory
> (@convention.where-a-value-lives).

Current `blocked_by` (P4.task:289): `[@T21, @T57]`. Proposed: `[@T21, @T57, @T76, @T77]`.

### @task.V3.T72 (open, P3, moves to P4): toaster and menu

From: Q2, Q3, Q4a, R1, W8d, W8e. W8e already proposed the first two edits.

Current Read first and Risk (P3.task:910-917):

> **Read first:** @proposal.ui-primitives-generality (toaster
> and menu machines), @proposal.ui-primitives, the upstream core
> tests in `codebases/ui-sdk/packages/core/test/`: `toast.test.ts` and `toast-swipe.test.ts` (34), and
> `menu-*.test.ts` (36), at commit `98ba9fd`.
>
> **Risk:** the toaster's pausable timer is leaky with today's features (the idiom pass); if the user accepts
> `pauseWhile` before this starts, build on it instead. Behaviour is ported, never code or test text.

Proposed:

> **Read first:** @proposal.ui-primitives-decisions (§1 schedules,
> §3 Q4a, §8 W8d), @convention.interaction-state, @convention.view-commands, the upstream
> core tests in `codebases/ui-sdk/packages/core/test/`: `toast.test.ts` and `toast-swipe.test.ts` (34), and
> `menu-*.test.ts` (36), at commit `98ba9fd`.
>
> **Risk:** the toaster's timer uses `paused` and per-key durations (@task.V3.T57), not stored clock stamps. Its
> pause reasons are `Hovered`, `Hidden` and `Pressing`, with `Hidden` reading `context.maxVisible` (the toaster is
> shared, so no props). `restartOn` selects a toast's `{ title, type }`, `keys` leave out loading toasts,
> `maxVisible` is context (the toaster is shared, R1), and `focusRequest` becomes an emit (@task.V3.T77). The menu's
> short-lived fields live
> in a trait placed on OPEN (Q4a). Behaviour is ported, never code or test text.

Current `blocked_by` (P3.task:901): `[@T17]`. Proposed: `[@T17, @T57, @T77]`. T72 moves from P3 to P4 (F1, §4), so
no P3 Task waits on a P4 Task.

### @task.V3.T9 (in_progress, P3): one shared-interface note

From: R1. T9 builds `createActor`; T76 adds `props` to its options.

Add after the Read first paragraph:

> `createActor`'s options stay a record, because @task.V3.T76 adds `props` to them (the decisions' R1); don't
> run the two at once.

### @task.V3.T29 (draft, P5): advance and the shared `Story.machine`

From: G10; batch (Same turn).

Add a description line:

> `Story.machine` and its `props(values)` step land first in @task.V3.T76; this Task extends them.

Add acceptance line:

> - `advance({ next })` skips paused timers (`NoDeadline` when every match is paused); `advance(d)` and
>   `advance({ to })` never fire a paused timer (@plan.Testing.O2 after the merge).

### @task.V3.T30 (draft, P5): React and server rendering

From: R1, R2, Q5d, R6, Q3c, Q3e; batch (Emits, Hydration).

Add acceptance lines:

> - `useActor(machine, { input, props })` shows this render's props before attach and queues a changed value from
>   a layout effect, in FIFO order with sends; a `props` option on `useActorByRef` is a type error.
> - `useOnEmit` delivers an actor's emits after the commit of the first render at or after their turn, in order,
>   never from a discarded render; a fragment's emits come under its instance name and an .each copy's key.
> - Server rendering delivers no emit; a paused timer transfers its `left` unchanged; the shape digest leaves out
>   props and emits.

Add to `blocked_by`: @task.V3.T76, @task.V3.T77.

### @task.V3.T49 (draft, P5): inspection

From: batch (Records); G10. Add acceptance line:

> - The Model lists props and emits Schemas and fragment emits; the event kinds add `emit`, and schedule events
>   show arm, fire, restart, pause, resume and disarm (@plan.Inspection.O1, O4, O6 after the merge).

### No change

- **T74 (review):** app mix, unrelated.
- **T17 (review):** its fix round keeps today's negative-delay refusal until the merge; T57 flips it.
- **T71 (done):** never changed; its migration is T78.
- **T58:** its minimal React needs neither props nor emits.

## 2. New Tasks

### T76: declared props on local actors (P4)

```text
    T76
        title        Declared props on local actors
        status       draft
        priority     high
        blocked_by   [@task.V3.T9, @task.V3.T77]
        derives_from @plan.Machines.O1
        satisfies    [@plan.Machines.O1, @plan.Machines.O4, @plan.Machines.O7, @plan.Machines.O8, @plan.Runtime.O3,
                     @plan.Runtime.O4]
        description
            Build declared `props` and `onProps` on local actors, with `createActor`'s props and `Story.machine`'s
            `props(values)` step.

            **Why now:** configurable widgets mirror parent props into memory through a `Configure` event (the
            number input fixture does); the user accepted declared props instead (decisions Q5, §9 R1
            to R3). Starts after the Plan merge.

            **Read first:** @spec.Turn.R28 (after the merge), @plan.Machines.O7,
            code:wiki/conventions/where-a-value-lives.md, @task.V3.T9.

            **Risk:** `Story.machine` is @task.V3.T29's; this Task builds its first slice (input, props and the
            props step) and T29 extends it.
            Blocked by T9, which builds `createActor` and the mailbox, and by T77, because emit mappers read props.

            **Approach:** definition `props` with Schema defaults; a props update is its own turn, changing only props,
            then `onProps`; every memory reader gets props from the same snapshot; construction rejects a prop that
            collides in the one namespace.

            May change: `src/`, `fixtures/`, `tests/`. Evidence: this Task's comments.

            False pass: props read only by guards → caught by tests that read them in `updateMemory`, an emit
            mapper, a schedule function, `keys`, `paused`, `restartOn` and `check(s, event)`.
        acceptance
            - A local actor shows each prop's Schema default before any use; `createActor` and `Story.machine`
              take props; `ensureActor`, `actorRef` and `useActorByRef` take none (type tests).
            - A props update is its own turn that changes only props and then runs `onProps`; an equal value is
              silent; it keeps its FIFO place (@spec.Turn.R28, Story tests).
            - The snapshot shows `props`, and every memory reader receives them from the same snapshot.
            - A prop colliding with a memory field, state, trait, operation or emit name is InvalidConfiguration.
            - Local handles have `setProps(partial)` and `createActor` takes props; a ref on a machine with props is a
              type error and refused at construction (R9, R10); `PropWithoutDefault`.
            - Each new rule has a planted fault that `nub run faults` catches.
```

### T77: declared emits (P4)

```text
    T77
        title        Declared emits, heard by actor.onEmit and in Stories
        status       draft
        priority     high
        blocked_by   [@task.V3.T57]
        derives_from @plan.Machines.O2
        satisfies    [@plan.Machines.O1, @plan.Machines.O2, @plan.Runtime.O3, @plan.Testing.O1]
        description
            Build declared `emits`, the transition part `emit`, `actor.onEmit`, and emit records in Stories and
            evidence.

            **Why now:** view commands that depend on the cause (focus after Escape, the first invalid field on
            every failed submit) are stored today as a request plus a counter that replays after a reload; the user
            accepted emits (decisions Q3, §9 R6 and the Emits batch). Starts after the Plan merge.

            **Read first:** @spec.Turn.R29 (after the merge), @plan.Machines.O2,
            code:wiki/conventions/view-commands.md.

            **Risk:** fragment emits are addressed by instance path and .each key, which need @task.V3.T57's
            fragments; that is the blocker. React delivery (`useOnEmit`) is @task.V3.T30's.

            **Approach:** the payload is computed in the walk (a pre-commit defect) and delivered after the turn
            publishes, in turn order; nothing is stored or replayed.

            May change: `src/`, `fixtures/`, `tests/`. Evidence: this Task's comments.

            False pass: an emit asserted only through a listener → caught by emit records in a Story run with no
            listener, and by a reload that replays none.
        acceptance
            - Any accepted transition may emit (send, firing, ending, `onContext` or `onProps` event); entry, exit and a
              refused turn never do; a copy that ends in the same turn still delivers (@spec.Turn.R29).
            - An emit part naming an undeclared emit is a construction error; `UnusedEmit` warning.
            - `actor.onEmit(handlers)` hears emits after their turn, in order; it is not a use; with no listener
              they are dropped; a reload or restore replays none.
            - A fragment's emits are heard under its instance name and an .each copy's key, and appear in its
              summary type.
            - An `emit` evidence kind and Story emit records exist; each new rule has a planted fault.
```

### T78: migrate the number input to props and emits (P4)

```text
    T78
        title        Number input on declared props and emits
        status       draft
        priority     medium
        blocked_by   [@task.V3.T76, @task.V3.T77]
        description
            Move the done number-input fixture (@task.V3.T71) from `Configure` and `lastCommit` to declared props and
            an emit.

            **Why now:** decisions W8e and §9 R7. The fixture mirrors seven props into memory, re-sends `Configure`
            after every reload, and stores `lastCommit { seq, value }` only to defeat equality.

            **Read first:** code:wiki/conventions/controlled-values.md, code:wiki/conventions/where-a-value-lives.md,
            code:packages/flow-state-v3/fixtures/number-input/machine.ts, @task.V3.T71's mapping comment.

            **Risk:** a controlled value's emit carries the intent (`Change { by }`), not an absolute value (R7). The
            typed text becomes view-owned, so the display-text scenarios move to view tests (@task.V3.T30) or are
            listed as dropped. The command palette keeps `Configure` (R12).

            **Approach:** drop `min`, `max`, `step` and `wheel` from memory (props), `text` (view) and `lastCommit`
            (emit); write `hold: { direction, size }` once on `Press`; keep T71's mapping, updating each changed case.

            May change: `fixtures/number-input/`, `tests/`. Evidence: this Task's comments.

            False pass: a migrated case that asserts less than before → caught by re-checking T71's mapping comment
            case by case.
        acceptance
            - The number input declares props and a `Change` emit and has no `Configure` event or `lastCommit` field;
              its Stories set props with the `props(values)` step and assert emit records.
            - Every case in T71's mapping still maps to a test asserting the same behaviour, or is listed as moved
              to view tests or dropped, with its reason.
            - `nub run check`, `nub run test` and `nub run faults` pass.
```

The `satisfies` lines in T76 and T77 wrap past one line here. `wk format` lays them out on save.

## 3. Ordering and dependencies

1. **The Plan merge** from the merge guide (the user's yes). T57's schedule and fan-out lines, T56's format line,
   T76, T77, T22's line and T29/T30/T49's lines all wait for it. T21's and T73's text edits don't.
2. **T17's fix round** (in review) finishes as planned under today's rule.
3. **T57** builds the schedule forms, fan-out and pause, and flips the five refusal checks.
4. **T77** (emits) after T57.
5. **T9** (P3) and then **T76** (props), which needs T9's `createActor` and T77's emit mappers.
6. **T78** after T76 and T77; **T72** after T57 and T77 (see §4); **T73** after T21, T57, T76 and T77.
7. **T56** after T57 (already linked).
8. **T22** after T77.
9. **T29**, **T30** and **T49** in P5, each building on T76 and T77.

T57, T76 and T77 all touch `src/core/` turn and schedule code, so they run one at a time (the Epic works serially
anyway).

## 4. Frame items [decided: user 2026-11-16]

T72 moves from P3 to P4 (F1), with an Amendment note per skill:build-a-loop; T76 to T78 join P4 (F2); F3 (Pending or
direct) is the user's call. The toaster needs `paused` and keyed schedules (T57), the menu needs a trait on OPEN
(T57's fragments), and both need emits (T77), so T72 cannot sit in P3.

Proposed edit to P4's Order line (P4.task:59), which is a proposed order only. Current:

> **Order:** @task.V3.T58, @task.V3.T57, @task.V3.T21, @task.V3.T56, @task.V3.T22, @task.V3.T23. A `blocked_by` link

Proposed:

> **Order:** @task.V3.T58, @task.V3.T57, @task.V3.T77, @task.V3.T76, @task.V3.T72, @task.V3.T78, @task.V3.T21,
> @task.V3.T56, @task.V3.T22, @task.V3.T23. A `blocked_by` link

## 5. Open choices for the user

- **U3. Where `Story.machine` starts.** Proposed: T76 builds its first slice (T29 extends it). Alternative: block
  T76 on T29 in P5, which leaves T73 and T78 without props until P5.
- **U4. The refusal case for the five checks.** Proposed: an over-range delay (2^31 ms). NaN is the other option,
  but JSON can't carry it from the fake server.

U1 and U2 are resolved (decisions log §9.1 R10 and R12): the palette keeps `Configure`, and local handles get
`setProps(partial)`.


**F3** [decided: user 2026-11-16]: the Plan merge lands directly, done by another session; the Task edits here follow
it.
