# Machine fragments: problem, principles and evaluation plan

Status: exploration, not part of version 1. This folder restarts the design from scratch after the
split into two kinds. The earlier files ([fragments.md](../fragments.md),
[fragment-examples.md](../fragment-examples.md),
[fragment-contract-syntax.md](../fragment-contract-syntax.md)) are the **single-fragment
proposal**: one `fragment` concept for everything. It was not accepted; it is prior art. It records
what was tried and why, and its decisions D1–D13 (fragments.md section 13) are evidence here, not
rules.
Where this folder and a plan differ, the plan wins.

Every proposal in this folder is evaluated against this file. The current proposal is
[proposal.md](proposal.md).

**What is settled, and what is not.** Conceptually, the parts of a machine that compose together
are **fragments**, and fragments come in two kinds: **traits** and **subroutines**. That is all
that is settled. No syntax is final: every code sample in the single-fragment proposal, including its baseline, is
a working draft. Whether "fragment" becomes a function in the API is open.

## 1. What we are solving

Machines repeat behaviour. A debounce, a retry with backoff, a confirmation step, a validated
field, draft-versus-saved tracking: each is written again in every machine that needs it, usually
with counters and flags reset by hand. Flow State has two tools today, and neither fits:

- **Substates** structure one machine. They cannot be shared between machines.
- **Separate actors** have their own identity, lifetime and mailbox. That is too heavy for a toggle
  or a retry loop, and it splits one workflow across two actors.

The missing tool is reuse **inside one actor**: a piece of behaviour written once, placed into a
machine when the machine is constructed, with a typed contract. The host stays one actor with one
mailbox, one turn and one plain snapshot.

**Fragment** (or machine fragment) is the word for that tool. It has two kinds, because reusable
behaviour comes in two shapes:

| Kind           | What it is                                | Examples                                                   |
| -------------- | ----------------------------------------- | ---------------------------------------------------------- |
| **Trait**      | something the actor _has_, always present | field, toggle, debounce, cooldown, undo, pagination        |
| **Subroutine** | something the actor _goes into_ and leaves | confirmation, picker, save with retry, wizard step, upload |

Whether `fragment`, `trait` and `subroutine` each become a function, and with what syntax, is
open.

### Which tool?

| Use                | When                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Plain substates    | the behaviour appears once                                                                   |
| A machine fragment | the same behaviour appears in a second machine, needs no I/O of its own, and belongs in the host's turn |
| A separate actor   | it needs its own identity, lifetime, context or operations, or something else must address it |

Extract a fragment on the second use, not the first.

## 2. Constraints from the plans

These are fixed. A proposal that needs one changed must say so and argue for it separately.

1. **One active leaf state per actor; no parallel regions** ([Machines.plan](../../../Machines.plan)
   O2). This is why traits have no states and subroutines are placed as host states.
2. **No child actors.** They were removed ([Package.plan](../../../Package.plan) O3); machine
   fragments are inlined, never spawned.
3. **Definition and machine split.** The definition holds structure and produces `S`, `E` and the
   types the UI uses; the machine holds behaviour and receives `S`, `E` and `O`.
4. **Static analysis.** Structure is data, not closures; everything a fragment adds is known at
   construction ([FlowState.plan](../../../FlowState.plan) D1). `flow graph` and `flow check` see
   all of it.
5. **Determinism.** Stories replay every input at an exact step; fragments use the Runtime clock
   and never wall time ([Testing.plan](../../../Testing.plan)).
6. **Memory holds keys and drafts, never copies** ([design/principles.md](../../design/principles.md)).
7. **One canonical form per concept**, and every name earns its place
   ([FlowState.plan](../../../FlowState.plan) D2).
8. **Schema at boundaries.** Events, memory and anything encoded or validated use Effect Schema.
9. **Nothing off the record.** Inspection sees every fragment's memory, events, schedules and
   transitions under its instance name ([Inspection.plan](../../../Inspection.plan)).

## 3. Guiding principles

In priority order. When two conflict, the earlier one wins.

1. **Correctness first.** A proposal is judged first by which bugs it makes impossible, then by how
   easily the code reads at a glance, then by length. A shorter syntax never wins if it can
   silently break behaviour.
2. **The fragment owns its contract.** A fragment declares everything it needs and everything it
   offers; the host adapts to that declaration. Reading the fragment tells you what it needs and
   what it does.
3. **Fragments hide their implementation.** The host cannot reach inside: it cannot handle a
   fragment's internal events, write its memory, or change its transitions. Hiding implementation
   is the point of fragments, and it must hold at every level of nesting.
4. **Guarantees are automatic, not remembered.** Lifecycle rules (fresh memory on entry, timers
   stopped on leaving, late results rejected) come from the kind, never from code an author must
   remember to write.
5. **Every rule is checked where it is written.** A missing exit, an unbound required prop, a
   wrong placement or a mismatched payload is a type error at the line that causes it, or a
   `flow check` error naming that line. Nothing is discovered at run time if it can be found
   earlier.
6. **One question decides where code goes.** An author or agent decides placement and blocks by
   one question with an obvious answer ("does the actor have it, or go into it?"; "which way does
   this cross the boundary?"). No rule of the form "it may be either".
7. **One meaning per word.** A word already in the plans keeps its meaning (`context`, `outcomes`,
   `activities`, `behaviour`, `scene`). Every new keyword is listed as new.
8. **No escape hatches without a failure case.** An opt-in exists only when a concrete correctness
   case needs it, and it is written explicitly at every level it crosses.
9. **Familiar where possible.** Prefer a model readers already know (React props and callbacks,
   subroutine calls and returns) over a new one, unless the familiar one is wrong here.
10. **Testable alone.** Each fragment can be run and checked by itself, including how it behaves
    when the host refuses or never sends something.

## 4. Problems to avoid

Each one was hit in the single-fragment proposal. A proposal must say, for each, whether it prevents it,
allows it, or does not apply.

### Lifecycle

| #   | Problem                                                                                                                                       | Seen in                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| L1  | **Stale timers.** A timer keeps firing after the behaviour it belongs to is no longer relevant.                                                | retry backoff, debounce         |
| L2  | **Late results.** A save result from an abandoned attempt lands in a later one.                                                                | save with retry                 |
| L3  | **Leftover memory.** Entering a step again shows values or counters from last time.                                                            | wizard steps, retry counts      |
| L4  | **No way out.** A long-running step (poll, autosave) cannot be left because it never decides to finish.                                         | poll, autosave                  |
| L5  | **Abandoned effects.** The host leaves a step while a commit is in flight; its late success or unknown is dropped and the workflow disagrees with the server (double delete, double order). | delete, checkout |
| L6  | **Silent admission.** A request that starts no work and reports nothing (concurrency `reject`, cancel before invocation) leaves a waiting state stuck. | every request |
| L7  | **Departure gap.** After a step is left mid-commit, a new submit starts before the old commit settles. | checkout, autosave |
| L8  | **Phantom replies.** A reply is delivered for a call that was never admitted, or to the wrong call. | retries |

### Encapsulation

| #   | Problem                                                                                                                                                                  | Seen in                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| E1  | **Broken invariants.** A host refuses or rewrites something a fragment relies on. Refusing `Release` leaves a hold-to-confirm holding, and it confirms an abandoned delete. | hold to confirm, debounce  |
| E2  | **Interfaces that grow with depth.** A host three levels up depends on an inner fragment, so swapping that inner fragment breaks it, and a middle layer can promise nothing. | the inverted model         |
| E3  | **Hidden endings.** A fragment's code says it stays, but the actor leaves because of a rule elsewhere.                                                                    | version 5 callbacks        |
| E4  | **Refusal by forwarding.** Any layer that forwards inputs can refuse or drop one the fragment relies on, such as `Release`. | hold to confirm |
| E5  | **Preempting observers.** A late-outcome handler moves the actor out of a newer live step. | abandoned handlers |

### Host control

| #   | Problem                                                                                                                                        | Seen in                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| H1  | **Bypassed policy.** The UI sends straight into a fragment and skips what the host does first (pinned changes locally without saving).             | toggle used for pinning |
| H2  | **Unforeseen checks.** A host needs a check the fragment author did not declare.                                                                 | locked tickets          |
| H3  | **Faked results.** A host or UI produces a fragment's result or ending without the fragment deciding it.                                          | exits as raisable events |
| H4  | **Misrouted or mislabelled results.** An outcome is mapped onto the wrong kind of result, above all `unknown` onto a retryable one, causing a double write. | every commit |
| H5  | **Interrupt treated as not sent.** A retry follows `interrupt`, which can happen after the request left. | commit with retry |

### Data

| #   | Problem                                                                                                                                                  | Seen in                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| D1  | **Drifting copies.** A host copies fragment values into its own memory and the copies disagree (a copied error starts as `null`, the field as "Required"). | everything-private model        |
| D2  | **Reading live values too late.** A retry sends the fields as they are now, not the request that was confirmed.                                             | commit with retry               |
| D3  | **Feedback loops.** Server normalization changes a value, which looks like an edit, which saves again.                                                       | autosave                        |
| D4  | **Unmapped outcomes.** An operation result (failure, unknown, interrupt, defect) has nowhere to go.                                                        | every commit                    |
| D5  | **Restore in flight.** Work in flight at a reload restores into the wrong entry, or never resolves. | persisted steps |
| D6  | **Same-turn seeding.** A step's input reads memory from before the turn, or cannot read the triggering event, forcing a copy or a stale value. | wizard steps |
| D7  | **Drafts lost on abnormal endings.** A failure exit or abandonment drops user data the fragment held. | address step, autosave |

### Authoring

| #   | Problem                                                                                                                                       | Seen in                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| A1  | **Forwarding that compounds.** Each level re-declares and forwards every input, so cost grows with depth × inputs, and the send path differs from the read path. | nested wizard                   |
| A2  | **Two blocks that look unrelated.** Inputs and endings of the same fragment sit in different places with nothing linking them.                   | `on` beside `exits`             |
| A3  | **Conditional rules.** "If mounted… if embedded…" rules that every reader meets.                                                                | one `fragment` for both kinds   |
| A4  | **Overloaded words.** A word that means something else in the plans (`context`, `outcomes`, `submachine`).                                       | version 3, naming               |
| A5  | **I/O inside fragments.** A fragment subscribes or commits itself, so I/O is split between fragment and host.                                    | version 1                       |
| A6  | **Silence discovered late.** An unbound callback or unhandled ending that nothing reports until it matters.                                      | optional callbacks              |
| A7  | **Forgotten first send.** A step that must send on entry has no place to say so, and the send is forgotten. | commit with retry |

### Turns and timers

| #   | Problem | Seen in |
| --- | ------- | ------- |
| T1  | **Partial turns.** A raised event is refused or unhandled while its source transition commits, and `check()` reports Allowed for a half-applied turn. | raise |
| T2  | **Schedule traps.** A `restartOn` debounce in a state entered by the triggering edit never fires (Machines O5's silent baseline), and a firing queued before a restart can fire the restarted timer early. | debounce, today's editor autosave |

Problems L5–L8, E4, E5, H4, H5, D5–D7, A7, T1 and T2 were added from the research reviews
([research/reviews/](research/reviews/)).

## 5. What the single-fragment proposal gives us

Decisions from [fragments.md](../fragments.md) section 13 that the problems above support. They are
the starting point here, and can be revisited if a proposal shows a better answer against
sections 3 and 4.

| Prior art      | Starting point                                                                                                              | Principles, problems |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| D12, D13       | Two kinds, settled as concepts: traits (always there, no states, never end) and subroutines (entered as a host state, may have states, end through exits). Their syntax is not settled. | 4, 6; A3, L1–L3      |
| D6, D4         | A fragment declares what it needs: values, callbacks and guards                                                             | 2; A6                |
| D9             | The host cannot reach inside                                                                                                | 3; E1, E2            |
| D11            | Only the host sends into its fragments; anyone may read their memory and states                                             | 1, 3; H1, D1         |
| D10            | Host policy enters only through guards the fragment declares                                                                | 1, 2; E1, H2         |
| D5, D7         | A subroutine ends from inside only through declared exits; nobody else produces an exit                                     | 1, 5; E3, H3         |
| D1–D3          | Fragments may contain fragments; nested names are readable; no depth limit                                                   | 3; E2                |
| version 2      | Fragments do no I/O; the host runs every operation and maps every outcome                                                     | 1; A5, D4            |

## 6. Open questions

Carried from the single-fragment proposal, in the order they will be reviewed:

1. **Leaving a subroutine from outside (L4).** May the host always leave a subroutine's state with
   its own event, abandoning the subroutine?
2. **Inputs through nesting (A1, A2).** Forward at every level, or list in `exposes` which inner
   events outsiders may send at their full path?
3. **How the host handles exits.** A separate `exits` block at the subroutine's state, or `on`.
4. **Required and optional props (A6).**
5. **Schema or TypeScript types for prop shapes.**
6. **`raise`:** when a host or fragment may send into a fragment within the same turn.
7. **Async results into fragments (D2, D3, D4):** how operation outcomes reach a fragment.
8. **Testing a fragment alone:** `fragmentStory` for traits and subroutines.

## 7. How proposals are written and evaluated

A proposal in this folder:

1. **States the problem it addresses**, by number from section 4.
2. **Shows full code**: the fragment, the host definition, the host machine and a component, with
   nothing truncated, so it is clear what goes where.
3. **Lists keywords**: which are new, which already exist in the plans, which are author-chosen.
4. **Includes a nested case** at least two levels deep, and a failure case it prevents.
5. **Checks every problem in section 4** it touches: prevents, allows, or not applicable.
6. **Ranks options against section 3** in order, and recommends one.
7. **Says what it adds and what it removes**, in keywords and in rules.

Decisions are recorded with their reason, consequences and rejected alternatives, one at a time.
