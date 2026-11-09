This file holds every plan sentence superseded by the phase 2 merge (2026-11-09); the plans in `workflow/plans/flow/` no longer carry superseded text.

# Superseded plan text

Grouped by plan, then by the plan entry that held the text. Each item quotes the old sentence verbatim, names what
replaced it (the design's section 5 row, C*n*, P*n*, T*n*, "fragments row", merge 5, or a decision OD*n*), and the
plan entry that now holds the rule. "Commit" is the commit that marked the item: the plan's merge commit, or a fix
pass commit (a8a2551d, e2e5c858, 227081b8) for the items the independent audit asked for. Decisions are recorded in
`references/explorations/machine-fragments/machine-design.md`; the merge record is
`references/proposals/plan-merge-log.md`.

## Machines

### Machines O1

- "A definition requires id, states and events." gains traits, fragment states, operations and persist (fragments row; C37; C160, C175). Now held in: @plan.Machines.O1 and the rows cited. Commit: 75a73b84.
- "Optional input and memory are Schema field records. Nonempty memory requires initial({ input }); empty memory forbids initial, and input requires initial, so a machine with input declares memory. initial runs once for a fresh actor, never on restore, adoption or hydration." is replaced by the field modifiers above; there is no top-level input or initial (fragments row; C137; C156; C157; C184). Now held in: @plan.Machines.O1 and the rows cited. Commit: 75a73b84.
- "Original input is unavailable thereafter." is replaced by "input fields are ordinary memory", read-only on a machine (C121). Now held in: @plan.Machines.O1 and the rows cited. Commit: 75a73b84.
- "Optional operations is a flat record of operation or entity-domain handles." is replaced by the operations declaration (C37). Now held in: @plan.Machines.O1 and the rows cited. Commit: 75a73b84.
- "duplicate activity or schedule names reject" loses activities, now a list of placements (C40). Now held in: @plan.Machines.O1 and the rows cited. Commit: 75a73b84.
- "Activity parameters may read earlier activities' lanes, parents before children; cyclic dependencies reject." is replaced: placement selects read the after memory and after lanes (@O3; C40). Now held in: @plan.Machines.O1 and the rows cited. Commit: 75a73b84.
- "initial is pure: it reads no clock or randomness" is kept (C157). Now held in: @plan.Machines.O1 and the rows cited. Commit: 75a73b84.

### Machines O2

- "target is required and is this machine's token or "self"" is replaced by "an omitted target means self" (C123). Now held in: @plan.Machines.O2 and the rows cited. Commit: 75a73b84.
- "token.is(snapshot) includes descendants" becomes "token.is(snapshot or state)", with token guard elements (fragments row). Now held in: @plan.Machines.O2 and the rows cited. Commit: 75a73b84.
- Re-entry by naming the handler's own state is a new activation (C164). Now held in: @plan.Machines.O2 and the rows cited. Commit: 75a73b84.

### Machines O3

- the prose from "An accepted transition computes updateMemory before action parameters; both read the pre-turn snapshot and event." to "One invalid action rejects the whole turn" is replaced by the algorithm above, keeping its defect rules (fragments row). Now held in: @plan.Machines.O3 and the rows cited. Commit: 75a73b84.
- Its "both read the pre-turn snapshot" no longer holds for commit selects, key selects and schedule inputs, which read after (C13). Now held in: @plan.Machines.O3 and the rows cited. Commit: 75a73b84.
- "State changes, activity changes, schedule arming and the complete action batch validate before publication." is restated as the validate step (fragments row). Now held in: @plan.Machines.O3 and the rows cited. Commit: 227081b8.
- ""self" changes no state and restarts no work, including at the root." is kept in @O2, with "keeps the activation" added (C164). Now held in: @plan.Machines.O3 and the rows cited. Commit: 227081b8.

### Machines O4

- "A guard receives { event, state, memory, context, activities }" gains schedules and replaces activities with operations (fragments row; C38; C55). Now held in: @plan.Machines.O4 and the rows cited. Commit: 75a73b84.
- "check(snapshot, event) uses the same handler, alternative and fallthrough rules" is now "runs steps two to six of the turn" (fragments row). Now held in: @plan.Machines.O4 and the rows cited. Commit: 75a73b84.

### Machines O5

- "Entry arms a schedule; exit cancels it." is replaced by "Entry arms a schedule without armOn (or with Flow.entry); disarmOn and exit cancel" (P7; C56). Now held in: @plan.Machines.O5 and the rows cited. Commit: 75a73b84.
- "restartOn ... establishes a silent baseline" is clarified as the activating turn's after memory (P8). Now held in: @plan.Machines.O5 and the rows cited. Commit: 75a73b84.
- "if its declaring activation ended before handling, it is discarded" is extended by arming ids (P11). Now held in: @plan.Machines.O5 and the rows cited. Commit: 75a73b84.
- "On restore or resume, a Duration preserves its deadline and fires once if overdue" gains returns after an end and returning uses (C124). Now held in: @plan.Machines.O5 and the rows cited. Commit: 75a73b84.
- Keyed schedules are added (C14; C39). Now held in: @plan.Machines.O5 and the rows cited. Commit: 75a73b84.

### Machines O6

- "activities: { name: O.x.subscribe(params, { outcomes?, placeholder?, when? }) }" is replaced by the list of placements, with outcomes on the operation (C40; C57; C90). Now held in: @plan.Machines.O6 and the rows cited. Commit: 75a73b84.
- "params and when may read { state, memory, context, activities }" is replaced by the after memory and after lanes (C40; @O3). Now held in: @plan.Machines.O6 and the rows cited. Commit: 75a73b84.
- "Finite actions declare optional success, failure, defect, interrupt and unknown outcomes; subscriptions declare value, complete, failure, defect and interrupt." is replaced by the operation's three write channels and two read channels (C1; C5; C6). Now held in: @plan.Machines.O6 and the rows cited. Commit: 75a73b84.
- "omitted failures or defects publish an actor issue" and "unknown carries the Attempt for explicit reconciliation" move to @plan.Operations.O3 (C1). Now held in: @plan.Machines.O6 and the rows cited. Commit: 75a73b84.
- "State exit does not cancel finite work; its event reaches the actor's later state." is replaced by the owner test (C12; C162; C164; C170; C185). Now held in: @plan.Machines.O6 and the rows cited. Commit: 75a73b84.

### Machines O8

- "activities (named lanes, undefined when not running)" is replaced by operations (fragments row; C41; C58). Now held in: @plan.Machines.O8 and the rows cited. Commit: 75a73b84.
- "It has no input, methods, timers or public revision" is replaced by "no input, methods or public revision; armed schedules appear under schedules" (fragments row; P6). Now held in: @plan.Machines.O8 and the rows cited. Commit: 75a73b84.

## Operations

### Operations O1

- "resource({ id, key?, lookup, result?, staleTime, gcTime, persist? }), transaction({ id, key?, input?, commit, concurrency }) and stream({ id, key?, subscribe, result?, persist? })" is replaced by the contract shapes above: input and output, a required key, services (C31; C86; C138). Now held in: @plan.Operations.O1 and the rows cited. Commit: 82a4378e.
- "lookup(params, { signal }) and commit(params, { signal, attempt, basedOn }) return Effects; subscribe(params, { signal }) returns a Stream." is replaced by the same contexts without signal (C116). Now held in: @plan.Operations.O1 and the rows cited. Commit: 82a4378e.
- "Boundary transfer without result follows @plan.ServerRendering.O3" reads output (C31). Now held in: @plan.Operations.O1 and the rows cited. Commit: a8a2551d.
- "concurrency is required and is reject, cancel, allow or serialize" is replaced by reject, latest, cancel or serialize; allow is cut from v1 (C153). Now held in: @plan.Operations.O1 and the rows cited. Commit: 82a4378e.
- "key(params) is a pure synchronous record projector; omission means {}." is replaced by the required field list (C31). Now held in: @plan.Operations.O1 and the rows cited. Commit: 82a4378e.
- "persist defaults to false; transactions have no persist option" now excludes streams too (C86). Now held in: @plan.Operations.O1 and the rows cited. Commit: 82a4378e.
- "In actions they reject the batch; in activities they report an issue and leave the lane undefined; passive reads throw." is narrowed: an unencodable key declines or ends Defect (C154). Now held in: @plan.Operations.O1 and the rows cited. Commit: 82a4378e.
- "Authors must include every parameter affecting the result" becomes KeyOmitsInput (C31). Now held in: @plan.Operations.O1 and the rows cited. Commit: 82a4378e.

### Operations O2

- "Each finite lookup or refetch settles once as success(A), failure, defect or interrupt" is replaced by two channels with Defect and Interrupted on failure, and for lookups through one operation by "only its latest lookup is delivered" (C5; C29; C32). Now held in: @plan.Operations.O2 and the rows cited. Commit: 82a4378e.
- "State exit does not cancel finite work; its event reaches the actor's later state." is replaced by the owner test (C12; C162; C170). Now held in: @plan.Operations.O2 and the rows cited. Commit: 82a4378e.
- "Actor disposal ends delivery." is replaced by the actor's end parking Interrupted (C143). Now held in: @plan.Operations.O2 and the rows cited. Commit: 82a4378e.
- "Continuing outcomes are value(A), failure, defect and interrupt." is replaced by value and failure (C5). Now held in: @plan.Operations.O2 and the rows cited. Commit: 82a4378e.
- "Each outcomes member is optional; tagged failure mappings must cover every error tag, untagged mappings receive E, and E = never forbids failure." keeps its failure rule; Defect and Interrupted must be mapped in a tag record (C29). Now held in: @plan.Operations.O2 and the rows cited. Commit: 82a4378e.
- "Mappers receive values only." is replaced by (value, { input, key }) (C6). Now held in: @plan.Operations.O2 and the rows cited. Commit: 82a4378e.
- "Unmapped failure or defect" loses defect (C5). Now held in: @plan.Operations.O2 and the rows cited. Commit: 82a4378e.

### Operations O3

- "Outcomes are success(A), failure, defect, interrupt and unknown(Attempt), with @O2 mappings." and the descriptor's failureKinds are replaced by three channels (C1). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "select reads the pre-turn snapshot and event" is replaced by the after memory (C13). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "O.x.commit(select, { optimistic?, writes?, outcomes? })" is replaced by optimistic as the only commit option and writes and outcomes on the operation (C15; C37). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "unencodable input rejects admission before work starts" is replaced by NotSent { Unencodable } (C154). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "Concurrency is per actor, descriptor and key" is replaced by the write lane (identity with its version, contract id, key) (C33; C42; C214). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "reject declines a second unsettled commit without work or outcome; the action continues." is replaced by NotSent { Rejected } with the transition running (C10). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "allow starts every commit independently and delivers every outcome in settlement order." is cut from v1 (C153). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "serialize starts commits FIFO, applying optimistic writes only on start; at most 64 queued occurrences are allowed. Overflow rejects the whole action batch with AdmissionOverloaded before any work starts." is replaced by W's 64 bound ending NotSent { Overloaded } for that write only (C10; C22). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "Every invoked commit delivers exactly one outcome." is replaced by "every commit and every retry that sends ends once", counted per ending (C11; C165). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "Before invocation, an explicit cancel ends it silently, while a failed Attempt acknowledgment or a never-invoked restore ends it as interrupt." is replaced by NotSent { Cancelled }, NotSent { StorageRefused } and NotSent { Restored } (C11; C48; C128). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "Its optimistic changes and success writes publish together before its event" becomes, for a domain write, publication at settlement before its ending is queued (C21). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "During actor disposal, cache consequences still apply but outcome events are dropped" is replaced by Runtime-owned lanes and parked endings (C33; C43). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "Once the adapter has been called, cancellation or abandonment reports unknown with its Attempt" is kept as unknown { Cancelled } and unknown { Disposed } (C11; C158). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "Restored work with no acknowledged Attempt cannot have been invoked and ends interrupt" is replaced by the one batch with its turn (C128). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "work with an acknowledged Attempt restores as unknown unless a durable settled result is known" becomes unknown { Restored } once per incarnation, a parked ending restoring as itself (C126; C167). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "O.x.retry(select, options) accepts an Attempt and reuses its exact id and decoded input under the same concurrency, writes and outcome rules. A known settled result settles immediately with its consequences and no adapter call. A foreign descriptor or invalid input rejects the action batch with InvalidAttempt." is replaced by retry(k?) in Held only; InvalidAttempt is removed (C7; C23). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- Descriptor-level cancel and pending are removed (C7). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "Flow promises no remote rollback and never retries automatically" is kept (C7). Now held in: @plan.Operations.O3 and the rows cited. Commit: 82a4378e.
- "Runtime disposal of a persisted actor saves them instead (@plan.Persistence.O3)" is replaced by parked endings of Runtime-owned lanes (C43; C45). Now held in: @plan.Operations.O3 and the rows cited. Commit: a8a2551d.
- "Late completion of replaced work cannot deliver another outcome or affect a later actor incarnation." is replaced: a replaced never-sent commit is evidence Superseded, a sent Attempt's ending is always delivered, and a new incarnation of the same identity adopts its lanes (C10; C42). Now held in: @plan.Operations.O3 and the rows cited. Commit: a8a2551d.
- "Flow mints a unique id; adapters receive it for remote idempotency." is restated as the Attempt paragraph: id random per write, put on the wire by the commit author (C9). Now held in: @plan.Operations.O3 and the rows cited. Commit: a8a2551d.
- "Invalid success writes apply nothing and report InvalidWrite", the no-overwrite rule and "Neither restore nor hydration invokes a commit." are kept; the design does not touch them. Now held in: @plan.Operations.O3 and the rows cited. Commit: a8a2551d.

### Operations O4

- the stream text "Each activity owns its session. ... Persisted latest values and session reopening follow @plan.Persistence.O4." is rewritten from the streams rules (C87). Now held in: @plan.Operations.O4 and the rows cited. Commit: 82a4378e.
- "A second same-actor session for the same descriptor and key reports DuplicateStreamSession, leaves its lane undefined and preserves the existing session." is replaced by two sessions with a DuplicateSession warning (C87). Now held in: @plan.Operations.O4 and the rows cited. Commit: 82a4378e.
- "Equal values are silent." is replaced by at-least-once delivery (C87). Now held in: @plan.Operations.O4 and the rows cited. Commit: 82a4378e.
- "complete, failure, defect and adapter interrupt end the session once, retain its data and map their optional outcomes. A terminal session restarts only when its activity starts again" is replaced by declared reconnect and the outcome table (C87; C90). Now held in: @plan.Operations.O4 and the rows cited. Commit: 82a4378e.
- "Changing identity releases it before opening another" gains the wait for a releasing predecessor (C87). Now held in: @plan.Operations.O4 and the rows cited. Commit: 82a4378e.
- "a session reads input once" gains the select on every turn (C201). Now held in: @plan.Operations.O4 and the rows cited. Commit: 82a4378e.

### Operations O5

- "pending remains true while any update is live" is replaced by predicted (C27). Now held in: @plan.Operations.O5 and the rows cited. Commit: 82a4378e.
- "Failure, defect, interrupt and pre-invocation cancellation remove that commit's updates" is replaced by the Attempt's three channels (C1; C4). Now held in: @plan.Operations.O5 and the rows cited. Commit: 82a4378e.
- "unknown retains them and invalidates the entry until a confirming lookup lands" is replaced by "keeps them, marked uncertain, and refetches the displayed entries once" (C4). Now held in: @plan.Operations.O5 and the rows cited. Commit: 82a4378e.
- Released is added (C113). Now held in: @plan.Operations.O5 and the rows cited. Commit: 82a4378e.

### Operations O6

- "snapshot.activities.<name>" is replaced by s.operations.<name> (C35; C41). Now held in: @plan.Operations.O6 and the rows cited. Commit: 82a4378e.
- "Transactions have outcomes, never lanes." is replaced: transactions have lanes (C35). Now held in: @plan.Operations.O6 and the rows cited. Commit: 82a4378e.
- "pending, true for live optimistic values or predictions" is renamed predicted (C27). Now held in: @plan.Operations.O6 and the rows cited. Commit: 82a4378e.
- "Stream tags are Running, Complete, Failure, Defect and Interrupted; data is the latest value or undefined, with no pending field." is replaced by the stream rows (C88). Now held in: @plan.Operations.O6 and the rows cited. Commit: 82a4378e.
- "It is undefined for inactive activities, when false, or null, undefined or false parameters" becomes undefined while not placed (C40). Now held in: @plan.Operations.O6 and the rows cited. Commit: 82a4378e.
- "A stream read sees only that snapshot actor's session" is kept as the row per placement (C88). Now held in: @plan.Operations.O6 and the rows cited. Commit: 82a4378e.
- "descriptor.get" reads contract.get (C31). Now held in: @plan.Operations.O6 and the rows cited. Commit: 82a4378e.

### Operations O7

- "Planned release aborts the signal and runs finalizers once" is replaced by "interrupts the fiber" (C116). Now held in: @plan.Operations.O7 and the rows cited. Commit: 82a4378e.
- "O.x.cancel(select) cancels this actor's queued and running commits for a key." is replaced by cancel on the addressable Attempt (C11; C36). Now held in: @plan.Operations.O7 and the rows cited. Commit: 82a4378e.
- "Resources have no cancel action." is amended by cancel on a one-off read (C36). Now held in: @plan.Operations.O7 and the rows cited. Commit: 82a4378e.
- "Before invocation, cancellation is silent and removes optimistic updates; after invocation it reports unknown and blocks late results." is replaced by NotSent { Cancelled } and a retained unknown { Cancelled } (C11). Now held in: @plan.Operations.O7 and the rows cited. Commit: 82a4378e.
- "disposed actors receive no finite lookup outcome" and "Actor disposal waits for invoked commits; bounded disposal follows @plan.Runtime.O6." are replaced by Runtime-owned lanes (C43; C158). Now held in: @plan.Operations.O7 and the rows cited. Commit: 82a4378e.
- The release on leave is added (C68; C183); cancelAll is added (C171); the acknowledgement wait is added (C146; C180; C186). Now held in: @plan.Operations.O7 and the rows cited. Commit: 82a4378e.

## Runtime

### Runtime O1

- "Durable identity is app id, machine id and actor id" now reads the actor's identity, its machine plus its input (C117). Now held in: @plan.Runtime.O1 and the rows cited. Commit: a5d6b0a5.

### Runtime O2

- "services is an Effect Layer that must provide every service the app's operation adapters need" gains the contracts' services lists and the boot's refusal by name (C138). Now held in: @plan.Runtime.O2 and the rows cited. Commit: a5d6b0a5.
- Step 4's "install restored and hydrated actors" is replaced: restored records stay records until reached, except identities owed an ending (C106). Now held in: @plan.Runtime.O2 and the rows cited. Commit: a5d6b0a5.

### Runtime O3

- "actorRef(machine, id, { persist?, retain?, context? }) is inert. id is a string or a readonly array of strings; arrays encode unambiguously, so ["a/b", "c"] and ["a", "b/c"] are different actors." is replaced by the two ref forms (C117; C144). Now held in: @plan.Runtime.O3 and the rows cited. Commit: a5d6b0a5.
- "Two refs with the same machine and id but different persist, retain or context reject with ConflictingActorRef" is now context only (C104; C144; C160). Now held in: @plan.Runtime.O3 and the rows cited. Commit: a5d6b0a5.
- "runtime.ensureActor(ref, { input }) ... The first accepted input initializes it; later ensures never reset memory, and a different later input reports InputIgnored." is replaced: no ensure takes input and InputIgnored does not exist (C117; C144). Now held in: @plan.Runtime.O3 and the rows cited. Commit: a5d6b0a5.
- "An input-free machine is ensured with no options." becomes the singleton (C117). Now held in: @plan.Runtime.O3 and the rows cited. Commit: a5d6b0a5.
- "runtime.createActor(machine, { input }) always creates a new local actor" is kept, amended by local identity adoption (C42). Now held in: @plan.Runtime.O3 and the rows cited. Commit: a5d6b0a5.
- "No outcome, schedule, issue or send from an old incarnation ever reaches a new one." is replaced for write lanes by adoption (C42; C59). Now held in: @plan.Runtime.O3 and the rows cited. Commit: a5d6b0a5.
- "Ensure while disposing returns at once a handle that reads the pre-attach snapshot" is amended by the Runtime's copy and the ending state (C143). Now held in: @plan.Runtime.O3 and the rows cited. Commit: a5d6b0a5.
- "A use is an attached React consumer, a live snapshots subscription or a bound context consumer.", "With retain (a Duration), a shared actor is disposed once retain has passed since its last use ended; a new use cancels that.", "A provider with bound consumers never expires.", "Without retain a shared actor lives until explicit or Runtime disposal." and "Retain expiry of a persisted actor disposes the live actor but keeps its saved record, so a later ensure restores it" are replaced by the lifetime rule (C104; C143). Now held in: @plan.Runtime.O3 and the rows cited. Commit: a5d6b0a5.
- "only explicit disposeActor or forget removes saved state" is kept, amended at @O6 (C159; C178). Now held in: @plan.Runtime.O3 and the rows cited. Commit: a5d6b0a5.
- Versions are added (C161; C174; C181). Now held in: @plan.Runtime.O3 and the rows cited. Commit: a5d6b0a5.

### Runtime O4

- "Each actor processes events one at a time in FIFO order; a send during a turn is queued, never run inside the current turn." gains the queue order, follow-ups, rotation and the idle-Runtime rule (P21; C136; C148; C149). Now held in: @plan.Runtime.O4 and the rows cited. Commit: a5d6b0a5.
- "Sends to a disposing or disposed actor are dropped and reported as SendTargetAbsent, never thrown." and "If the target is absent or disposing the event is dropped with SendTargetAbsent" are replaced by the send table (C105). Now held in: @plan.Runtime.O4 and the rows cited. Commit: a5d6b0a5.
- "Stream values coalesce (@plan.Operations.O4)." becomes deliveries bounded by what Flow has pulled (C91). Now held in: @plan.Runtime.O4 and the rows cited. Commit: a5d6b0a5.
- "Facts from an ended activation are discarded by design" becomes discard with evidence (C91). Now held in: @plan.Runtime.O4 and the rows cited. Commit: a5d6b0a5.
- "A snapshots subscription completes only at the actor's disposal, after its terminal snapshot." is replaced (C105). Now held in: @plan.Runtime.O4 and the rows cited. Commit: a5d6b0a5.
- Slices and spins (C132), refused deliveries (C134; C166) and the boot queue (C155) are added. Now held in: @plan.Runtime.O4 and the rows cited. Commit: a5d6b0a5.

### Runtime O5

- "keyed into the actor id" reads the actor's identity (C117). Now held in: @plan.Runtime.O5 and the rows cited. Commit: a5d6b0a5.

### Runtime O6

- "invoked commits are allowed to settle" is replaced: disposal invokes nothing new and lanes stay with the Runtime (C43). Now held in: @plan.Runtime.O6 and the rows cited. Commit: a5d6b0a5.
- "after 5 seconds a commit still in flight becomes unknown with its Attempt" is now unknown { Disposed }, with the parking order (C158; C176; C179). Now held in: @plan.Runtime.O6 and the rows cited. Commit: a5d6b0a5.
- "runtime.disposeActor(actor) disposes the actor for every user" gains the flushed removal and unbound lanes (C159; C168). forget's effect on lanes is added (C173; C178). Now held in: @plan.Runtime.O6 and the rows cited. Commit: a5d6b0a5.
- Session release is added (C92). Now held in: @plan.Runtime.O6 and the rows cited. Commit: a5d6b0a5.

### Runtime V1 and V4 (held under V7 until extraction)

- V1's "unambiguous id parts" and V4's "first input wins with a diagnostic" and "retain expiry on the TestClock" (C109; C118; C144). Now held in: @plan.Runtime.V1 and @plan.Runtime.V4. Commit: a5d6b0a5.

## Persistence

### Persistence O1

- "runtimeSetup({ app, scope, services?, persistence?: { version } })" and "version is a required nonempty string and matches exactly" are replaced by automatic checks with no app-wide or manual version: per definition (the user's Q1 A), decided per record (the runner's ruling, OD54 (8)) (C211). Now held in: @plan.Persistence.O1 and the rows cited. Commit: 23295eb4.

### Persistence O2

- "actorRef(machine, id, { persist: true }) selects a stable shared actor" is replaced by persist on the definition, default false (C120; C160; C175). Now held in: @plan.Persistence.O2 and the rows cited. Commit: 23295eb4.
- "Transactions have no persist option: pending writes follow their actor." is replaced by Runtime lane records (C17; C44). Now held in: @plan.Persistence.O2 and the rows cited. Commit: 23295eb4.
- "A stream's persist option retains its latest value only when its owning actor also persists." is replaced by the bookmark partition (C86; C93). Now held in: @plan.Persistence.O2 and the rows cited. Commit: 23295eb4.
- "for each activity binding" reads each placement (C40). Now held in: @plan.Persistence.O2 and the rows cited. Commit: 23295eb4.
- The fragment, history, keyed-schedule and lane-record contents are added (fragments row; P5; C60). Now held in: @plan.Persistence.O2 and the rows cited. Commit: 23295eb4.

### Persistence O3

- "Explicitly disposed durable actors disappear from the next successful capture" is replaced: a disposed actor's non-Idle lanes stay as unbound lane records (C45; C159). Now held in: @plan.Persistence.O3 and the rows cited. Commit: 23295eb4.
- "a persisted actor whose retain expired keeps its saved record (@plan.Runtime.O3)" is replaced by an ended actor's record encoded in its end step (C106). Now held in: @plan.Persistence.O3 and the rows cited. Commit: 23295eb4.
- "Exceeding either bound rejects the whole capture without eviction." is replaced by dropping records equal to a fresh start first (C106). Now held in: @plan.Persistence.O3 and the rows cited. Commit: 23295eb4.
- "Ordinary writes are coalesced to the newest waiting state" is replaced by the 5 s interval with immediate lane batches (C131). Now held in: @plan.Persistence.O3 and the rows cited. Commit: 23295eb4.
- "During Runtime disposal, a commit that settles before the final capture is saved as a pending mapped outcome and delivered after reload." is kept, amended by the head's disk state at disposal (C45; C176). Now held in: @plan.Persistence.O3 and the rows cited. Commit: 23295eb4.
- Record formats, forget and resets are added (C173; C178; C210; C212). Now held in: @plan.Persistence.O3 and the rows cited. Commit: 23295eb4.

### Persistence O4

- "Restored stable actors are active without another ensure" is replaced by records staying records until reached (C106). Now held in: @plan.Persistence.O4 and the rows cited. Commit: 23295eb4.
- "ensureActor returns the restored actor and ignores fresh input" is replaced: no ensure takes input (C120; C144). Now held in: @plan.Persistence.O4 and the rows cited. Commit: 23295eb4.
- "Their retain clock starts at ready." is removed with retain (C106). Now held in: @plan.Persistence.O4 and the rows cited. Commit: 23295eb4.
- "Saved mapped outcomes are delivered once, in saved order after readiness" gains the lane order and pending resets (C46; C62; C151; C179). Now held in: @plan.Persistence.O4 and the rows cited. Commit: 23295eb4.
- "A crash after acknowledgment restores unknown" is amended by a parked ending restoring as itself (C17; C167). Now held in: @plan.Persistence.O4 and the rows cited. Commit: 23295eb4.
- "Running streams retain their selected latest value and count" becomes the latest and every restore rows (C94). Now held in: @plan.Persistence.O4 and the rows cited. Commit: 23295eb4.
- "Terminal streams stay terminal until their activity starts again." is replaced by declared reconnect (C87; C94). Now held in: @plan.Persistence.O4 and the rows cited. Commit: 23295eb4.

### Persistence O5

- "Incompatible versions or identities and corrupt scope data report RestoreDiscarded and start fresh" and "Flow never partially restores an invalid scope." are replaced by per-record restore, quarantine, old-version records and saved-shape resets (C47; C120; C143; C210; C211). Now held in: @plan.Persistence.O5 and the rows cited. Commit: 23295eb4.
- "Compatible shape changes may use Schema decode transformations; v1 has no migration API." is kept (C211). Now held in: @plan.Persistence.O5 and the rows cited. Commit: 23295eb4.
- "saved actor records for a machine id that no eager or lazy entry declares are discarded with a diagnostic" is kept for the actor records; their lane records follow the quarantine (C47; C152). Now held in: @plan.Persistence.O5 and the rows cited. Commit: 23295eb4.
- "A dormant record that fails to decode ... discards only that record, with a diagnostic; the feature opens fresh" is replaced by quarantine and a fresh ensure (C143). Now held in: @plan.Persistence.O5 and the rows cited. Commit: 23295eb4.
- "Encoding failure never fails the turn: the turn commits, the whole write is skipped with the codec's code" now names UnencodableValue (C154). Now held in: @plan.Persistence.O5 and the rows cited. Commit: 23295eb4.
- P19's orphaned handler is cut (C152). Now held in: @plan.Persistence.O5 and the rows cited. Commit: 23295eb4.
- Versions, record formats, old-version lanes, renames and dropped fields are added (C135; C161; C174; C181; C213; C214); the boot queue is added (C155). Now held in: @plan.Persistence.O5 and the rows cited. Commit: 23295eb4.

### Persistence O6

- "A persisted actor's remote commit cannot invoke its adapter until storage acknowledges its Attempt, including id and encoded input." is amended: once per Attempt, per lane record, one batch with its turn (P15; C48; C128). Now held in: @plan.Persistence.O6 and the rows cited. Commit: 23295eb4.
- "If acknowledgment fails, the adapter is not called; the occurrence settles through interrupt with StorageFailure evidence." is replaced by NotSent { StorageRefused } (C48). Now held in: @plan.Persistence.O6 and the rows cited. Commit: 23295eb4.
- "A crash after acknowledgment restores unknown carrying the same Attempt unless durable evidence proves the adapter could not have run." becomes unknown { Restored }, or the parked ending (C17; C167). Now held in: @plan.Persistence.O6 and the rows cited. Commit: 23295eb4.
- "Explicit retry(attempt) and known-settled behavior follow @plan.Operations.O3." becomes O.x.retry(k?) (C23). basedOn and predicted-key fields are added (C200). Now held in: @plan.Persistence.O6 and the rows cited. Commit: 23295eb4.

### Persistence O7

- "requests an immediately available Web Lock for its app and scope, independent of version" drops "independent of version" with the app-wide version (C211); the back-forward cache rule (C131), NoPersistence (C130) and the cancel capture order (C85) are added. Now held in: @plan.Persistence.O7 and the rows cited. Commit: 23295eb4.

## EntityDomains

### EntityDomains O1

- "Conditions use where (eq, oneOf, contains, between, overlaps, and)" is replaced by the operator list with yes, no or maybe; "An absent optional input drops its constraint." by the Type-side input rule (merge 5, 6.4). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "predicts runs again at write start with the real input." and "conditionals, short-circuits and impure calls fail construction or flow check" are replaced by recorded positions, field functions and the allowlist lint; the construction-time check goes (merge 5). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "Changes: predicts returns Entity.patch(key, fields) ..." gains field functions and many keys (merge 5) and key values (C115); listen maps to delta or row (C198). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "on its old or new values; a missing condition field matches." is replaced by existence-aware matching (merge 5). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "Reconnect, restore and invalidate" reads stream gaps (C99). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "Predicted fields the response omits stay pending" becomes a predicted slot staying unconfirmed (merge 5; C27). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "Failure or defect removes predictions and repairs affected answers, because a failed call may have partly applied." is replaced by "a definite failure removes predictions without repair" (C4). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "Uncertain (cancelled after invocation, response lost, or restored mid-flight) forces the loader and every holder to refetch, keeps predictions until that repair lands, then shows server state." is restated as the unknown row: live predictions kept until a forced repair lands, the record queue held until it settles (C4; C189). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: e2e5c858.
- "Rejection or cancellation before the adapter ran removes predictions without repair." becomes the NotSent list (C24). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "The record stays uncertain until a later write to it succeeds or the machine reconciles the Attempt." is replaced by the mark rules (C25; C192). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "unknown delivers an Attempt; O.x.retry(select) reissues that exact Attempt and a known-settled attempt settles without calling the adapter." is replaced by retry(k?) in Held (C23). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "Predicting writes queue per record, FIFO across actors" is replaced by joining at the head of the lane in send order (C24; C187). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "predictions show while queued" holds for drafts (C187). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "Cancelling a queued, never-invoked write removes it." becomes NotSent { Cancelled } without repair (C24). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "An uncertain write releases the next only after its forced repair settles, whether it succeeds or fails; the record stays uncertain." is amended per record with the repair bound (C189; C190; C207). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "Creates return the record and repair matching answers; membership appears only when they refetch (no temporary ids or optimistic inserts)." is named as the draft pattern (C26). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- "Record reads are { data, pending, uncertain, unconfirmed }." is replaced by predicted (C27). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.
- The judge, guarded, the cap, ModuleDisabled, gone, listen and Released are added (C113; C169; C191; C193-C198; C208; C67). Now held in: @plan.EntityDomains.O1 and the rows cited. Commit: 8f960eca.

### EntityDomains O2

- "Entity.get(snapshotOrCheckpoint, key, shape)" reads snapshots; checkpoints use cp.entity (C72). Now held in: @plan.EntityDomains.O2 and the rows cited. Commit: 8f960eca.
- "Entity.queue returns ordered attempts and queue states." is replaced by queue records with their reason (C30; C84). Now held in: @plan.EntityDomains.O2 and the rows cited. Commit: 8f960eca.

### EntityDomains O4

- "propertyTest(domains, options)" is replaced by the domain form domainPropertyOptions(domains, inputs), keeping the oracle, quietness and inconclusive rules (C73; C84); stream faults are added (C99). Now held in: @plan.EntityDomains.O4 and the rows cited. Commit: 8f960eca.

### EntityDomains O5

- "if any record of a multi-record write would overflow, the whole write is rejected before any prediction, queue join or adapter work, with AdmissionOverloaded naming the record and limit" is replaced by NotSent { Overloaded } for that write (C22; C199). Now held in: @plan.EntityDomains.O5 and the rows cited. Commit: 8f960eca.

### EntityDomains V1 and V3 (held under V5 until extraction)

- V1's "source check rejects conditionals and impurity" (merge 5, 6.4); V3's "partial failure repair" (C4). Now held in: @plan.EntityDomains.V1 and @plan.EntityDomains.V3. Commit: 8f960eca.

## Inspection

### Inspection O1

- "per actor its state, revision, mailbox depth, schedules, activity bindings, pending commits, issues and retain" is replaced by placements, incarnations, lanes and uses, actors named by identity (C78; C111; C122). Now held in: @plan.Inspection.O1 and the rows cited. Commit: dc54bc71.
- "resource entries, transactions and stream sessions in flight" is replaced by write lanes by identity and per-session facts (C51; C64; C78; C100). Now held in: @plan.Inspection.O1 and the rows cited. Commit: dc54bc71.
- "every operation descriptor" reads every operation with its contract (C31). Now held in: @plan.Inspection.O1 and the rows cited. Commit: dc54bc71.
- "actions" gains the operation each names, and "each entity domain as recorded" its predicted field names (merge 5, 6.4). Now held in: @plan.Inspection.O1 and the rows cited. Commit: dc54bc71.
- Fragments are added (fragments row). Now held in: @plan.Inspection.O1 and the rows cited. Commit: dc54bc71.

### Inspection O4

- the event-kind list gains ending, lane, life, callback, exit, listRepair, drop, session, delivery, predictionFault and the Story kinds, and every event the run-wide sequence and tab (C79; C100; C111; merge 5, 6.4). Now held in: @plan.Inspection.O4 and the rows cited. Commit: dc54bc71.
- "persistenceVersion" leaves the Trace's fields and import's identity check with the app-wide persistence version (C211). Now held in: @plan.Inspection.O4 and the rows cited. Commit: dc54bc71.
- "unknown carries reconcileRequired" reads its reason, since unknown has reasons (C2). flow trace replaces round 7's trace summarize (C141). Now held in: @plan.Inspection.O4 and the rows cited. Commit: dc54bc71.

### Inspection O5

- fake truth and request inputs as digests, and via never redacted, are added (C80); "result" reads output (C31). Now held in: @plan.Inspection.O5 and the rows cited. Commit: dc54bc71.

### Inspection O6

- the "transactions" section reads write lanes and endings (C51; C79); "persistenceVersion" leaves the comparison's identity (C211). Now held in: @plan.Inspection.O6 and the rows cited. Commit: dc54bc71.

## Diagnostics

### Diagnostics O2

- "InputIgnored (@plan.Runtime.O3): the actor already exists; its first input stands." is removed: no ensure takes input (C144). Now held in: @plan.Diagnostics.O2 and the rows cited. Commit: affa2f3a.
- "ConflictingActorRef ... give refs with one identity the same options" now names context only (C160). Now held in: @plan.Diagnostics.O2 and the rows cited. Commit: affa2f3a.
- "InvalidAttempt (@plan.Operations.O3): retry only an Attempt from this descriptor, with valid input." is removed with retry(attempt) (C23). Now held in: @plan.Diagnostics.O2 and the rows cited. Commit: affa2f3a.
- "DuplicateStreamSession (@plan.Operations.O4): open one session per actor and key." is replaced by the DuplicateSession warning (C87; C103). Now held in: @plan.Diagnostics.O2 and the rows cited. Commit: affa2f3a.
- "RestoreDiscarded (@plan.Persistence.O5): expected after a version change; otherwise inspect the reason (incompatible, corrupt, orphan)." is replaced by RecordUndecodable, RecordShapeChanged and the quarantine names (C143; C152; C211). Now held in: @plan.Diagnostics.O2 and the rows cited. Commit: affa2f3a.
- The Story names (C83), the stream names (C103), ScheduleLeadsToWrite and EndedWithWork (C125), TurnStorm and AsksForever (C132), ReservedStateName, InputFieldForm, UnknownNotUncertain and UnencodableValue (C145; C154), IdentityFieldOptional (C121) and ImpureDefault (C157; C184) are added, with the names other plans' rows define (C18; C65; C177; C193; C209; C211-C215). Now held in: @plan.Diagnostics.O2 and the rows cited. Commit: affa2f3a.

### Diagnostics O3

- "forwarded AbortSignal cancellation" reads Effect's own signal: contexts carry no signal (C116). Now held in: @plan.Diagnostics.O3 and the rows cited. Commit: affa2f3a.

## CommandLine

### CommandLine O1

- "trace summarize <artifact|->" is replaced by trace <story-id> [--at] (C141). Now held in: @plan.CommandLine.O1 and the rows cited. Commit: a00c1dba.
- "trace diff <left|-> <right|->" and "diff --base <git-revision>", with its revision-diff sentences, are cut by the user's CLI scope of 2026-11-02 (OD55); release comparison is explain --since (C216). Now held in: @plan.CommandLine.O1 and the rows cited. Commit: a8a2551d.
- "story list returns declared identities; describe returns actors, commands and checkpoints" is replaced by describe's plan-only listing and coverage (C81; T2). Now held in: @plan.CommandLine.O1 and the rows cited. Commit: a00c1dba.
- "graph uses @plan.Inspection.O6" gains the edge rules (C141). Now held in: @plan.CommandLine.O1 and the rows cited. Commit: a00c1dba.
- The domain-write explain lines are added (merge 5, 6.4; C18; C101; C125). Now held in: @plan.CommandLine.O1 and the rows cited. Commit: a00c1dba.

### CommandLine O2

- "Only story run starts application work." adds trace (C141). Now held in: @plan.CommandLine.O2 and the rows cited. Commit: a00c1dba.
- "Interruption stops later Story commands" is replaced: no mid-run handler is installed, since a run never yields (C70; C75; 2.10.14). story run's report and exit are added (C81). Now held in: @plan.CommandLine.O2 and the rows cited. Commit: a00c1dba.

### CommandLine O4

- "trace summarize reports counts and an ordered timeline" becomes the artifact summary, and trace <story-id> prints a Story's timeline (C141). Now held in: @plan.CommandLine.O4 and the rows cited. Commit: a00c1dba.
- The paragraph "trace diff optionally selects sections with --section, from the closed section list of @plan.Inspection.O6; omission compares all sections. Equal requires complete matching evidence. Differing retained facts prove difference; matching truncated evidence is incomplete and never proves equality. Both completeness markers accompany the result. Incompatible identities fail rather than report difference. Independently redacted values never establish equality or difference without evidence." is cut with trace diff (OD55). Now held in: @plan.CommandLine.O4 and the rows cited. Commit: a8a2551d.

### CommandLine O5

- "without running application callbacks" gains the domain recorded positions' recording proxies (merge 5, 6.4) and the compiled data view (C139). Now held in: @plan.CommandLine.O5 and the rows cited. Commit: a00c1dba.
- "Warnings identify likely stuck/unreachable states, unhandled events ..." gains the fragment, server-call, tooling, stream and Story-derived findings (fragments row; C18; C65; C81; C101; C125; C145; T2; T3); "unhandled events" is sharpened by T3. The late-turn check becomes a strict error (C163; C170; C182; C185). Now held in: @plan.CommandLine.O5 and the rows cited. Commit: a00c1dba.
- ReservedReason, the guarded names, GoneWithoutKey and PreviousIsCurrent are added (C177; C193; C209; C215). Now held in: @plan.CommandLine.O5 and the rows cited. Commit: a00c1dba.
- The key-order lint is added (T4). Now held in: @plan.CommandLine.O5 and the rows cited. Commit: a00c1dba.

### CommandLine O6

- "defineConfig({ apps: [{ app, stories }] })" gains top-level stories and tsconfig (C81; merge 5, 6.4). Now held in: @plan.CommandLine.O6 and the rows cited. Commit: a00c1dba.
- "duplicate ... Story ids within an app" reads within the configuration (C69). Now held in: @plan.CommandLine.O6 and the rows cited. Commit: a00c1dba.
- "Revision diff applies the same rule inside its selected revision." goes with diff --base (the user's CLI scope of 2026-11-02, OD55). Now held in: @plan.CommandLine.O6 and the rows cited. Commit: a00c1dba.

## Testing

### Testing O1

- "story.app(setup, { id, fixtures? })" and "story.machine(machine, { id, input?, context?, services?, fixtures? })" are replaced by Story.app, Story.machine and Story.fragment; services? is removed, fixtures covers it (C69; C63). Now held in: @plan.Testing.O1 and the rows cited. Commit: 5858767b.
- "unique within its App" reads unique across the configuration (C69). Now held in: @plan.Testing.O1 and the rows cited. Commit: 5858767b.
- "Construction, import and discovery start no services, actors, fixtures or assertions." loses "or assertions" (C69). Now held in: @plan.Testing.O1 and the rows cited. Commit: 5858767b.
- "run({ signal?, frames? })" is replaced by run() (C69). Now held in: @plan.Testing.O1 and the rows cited. Commit: 5858767b.
- "Both Story kinds support send, process, advance, advanceTo, advanceToNextTimer, checkpoint and run." is replaced by the step list (C69; C70). Now held in: @plan.Testing.O1 and the rows cited. Commit: 5858767b.
- "App ensure(ref, options?) follows @plan.Runtime.O3 at the chosen step." is replaced by ensure attaching one use, with no input (C110; C122; C144). Now held in: @plan.Testing.O1 and the rows cited. Commit: 5858767b.
- "send never creates an absent actor" becomes "may restore, never create" (C110). Now held in: @plan.Testing.O1 and the rows cited. Commit: 5858767b.
- "Scenario commands accept no arbitrary callbacks..." is kept (C69). Now held in: @plan.Testing.O1 and the rows cited. Commit: 5858767b.
- The fragments' Testing O1 row and C63's syntax are replaced by Story.fragment (C69). Now held in: @plan.Testing.O1 and the rows cited. Commit: 5858767b.

### Testing O2

- "process() drains currently eligible work that can settle without moving time. ... Each call permits 10,000 production turns." is replaced by every step settling, with the turn limit per instant (C70). Now held in: @plan.Testing.O2 and the rows cited. Commit: 5858767b.
- "advanceTo(epochMilliseconds)" and "advanceToNextTimer()" are replaced by advance({ to }) and advance({ next }) (C70). Now held in: @plan.Testing.O2 and the rows cited. Commit: 5858767b.
- "These commands make work eligible without draining it; process() applies the due work." is replaced by settling (C70). Now held in: @plan.Testing.O2 and the rows cited. Commit: 5858767b.

### Testing O3

- "Delays and responses pass through real services and the controlled clock" is replaced by fakes, the wire words and provenance; "fixtures cannot inject operation outcomes directly" is kept (C71; C53). Now held in: @plan.Testing.O3 and the rows cited. Commit: 5858767b.
- C16's checkpoint-predicate truth is superseded by cp.read(fake) (C71). Now held in: @plan.Testing.O3 and the rows cited. Commit: 5858767b.

### Testing O4

- "a frame after every command by default, or after every committed publication with frames: "publication"; frames: "named" records only checkpoints. Consecutive identical frames collapse into one." is replaced by publication frames, step cuts and no collapse (C72). Now held in: @plan.Testing.O4 and the rows cited. Commit: 5858767b.
- "checkpoint(name) captures immediately without processing" becomes a named step cut (C72). Now held in: @plan.Testing.O4 and the rows cited. Commit: 5858767b.
- "checkpoint.actor(ref)" reads cp.read(ref); "pending" reads cp.inspection.work; "Entity.get(checkpoint, key, shape)" reads cp.entity(...) with predicted; descriptor.get, Domain.entry.get, Entity.queue and shape on a checkpoint are removed (C72; C27). Now held in: @plan.Testing.O4 and the rows cited. Commit: 5858767b.

### Testing O5

- the whole outcome, "model(baseStory, { stateKey }) accepts a command-empty focused Story ... Live replay must match predicted keys at every prefix and the end; pure exploration alone proves no effect behaviour.", with getShortestPaths, getSimplePaths and the invariants, hot and explore options, is removed (T1; C77): exploration predicted operations, schedules and turns without running them, a second execution path that had to keep replay parity with the Runtime. Now held in: @plan.Testing.O5 (a stub kept for the id) and @plan.Testing.O6. Commit: 5858767b.

### Testing O6

- "propertyTest(domains, options) generates ordinary Stories" and the options "fixture, inputs and seed, with optional runs, steps and quietWithin" are replaced by propertyTest(story, { ... }) and domainPropertyOptions (C73); runs and length keep the defaults 50 and 40 (the runner's reading of steps' default as length's). Now held in: @plan.Testing.O6 and the rows cited. Commit: 5858767b.
- "Every committed publication is checked, even when process() drains many turns." loses process() (C73). Now held in: @plan.Testing.O6 and the rows cited. Commit: 5858767b.
- "Results distinguish Pass, Fail and Inconclusive" is kept (C73); "insufficient evidence is Inconclusive" gains the truncation exception (C73). Now held in: @plan.Testing.O6 and the rows cited. Commit: 5858767b.

### Testing O7

- "sharing that run's in-memory storage" reads the run's fake servers and Fake.storage (C74). Now held in: @plan.Testing.O7 and the rows cited. Commit: 5858767b.
- "closeTab(name) ends it abruptly" is kept (C53). Now held in: @plan.Testing.O7 and the rows cited. Commit: 5858767b.
- "checkpoints expose tabs.<name>" reads records with tab (C72; C74). Now held in: @plan.Testing.O7 and the rows cited. Commit: 5858767b.
- "dehydrate is the explicit exception to process-only draining." goes with process() (C70; C74). Now held in: @plan.Testing.O7 and the rows cited. Commit: 5858767b.

### Testing O8

- "Cancellation stops admission and later commands, retains partial evidence and waits for finalization. A blocked send settles once; no committed turn or end is fabricated." and the cancellation flag go with signal (C75). Now held in: @plan.Testing.O8 and the rows cited. Commit: 5858767b.
- "Execution or cancellation failure stays primary" becomes the earliest recorded error (C75). Now held in: @plan.Testing.O8 and the rows cited. Commit: 5858767b.
- The error names are added (C75). Now held in: @plan.Testing.O8 and the rows cited. Commit: 5858767b.

### Testing O9

- "highlights the control whose click would send the Story's next event" gains the addressed event; closed tabs and fragment Stories are added (C76). Now held in: @plan.Testing.O9 and the rows cited. Commit: 5858767b.

### Testing V5

- Was: tests prove model ordering, bounds, truncation and live replay parity at every prefix. Now held in: @plan.Testing.V5 (a stub kept for the id); removed with Testing O5 (T1; C77). Commit: 5858767b.

### Testing V1, V3, V4, V6 and V8 (held under V9 until extraction)

- V1 adds the reads' types; V3 proves the settle and instant order; V4 loses "frame recording and collapse"; V6 adds FramesTruncated; V8 loses cancellation (C77; C75). Now held in: @plan.Testing.V1, V3, V4, V6 and V8. Commit: 5858767b.

### Testing Q2

- "Model key encoding and limits. Model path descriptions and traversal metadata." go with @O5 (T1). Now held in: @plan.Testing.Q2 and the rows cited. Commit: 5858767b.

## React

### React O2

- "useActor(machine, options?) returns one fresh local actor handle per component incarnation." is amended: fresh memory and state, write lanes adopted by identity (C52). Now held in: @plan.React.O2 and the rows cited. Commit: 058d9352.
- "Declared input must have its exact type." is amended: a value-named ref takes no input (C119; C144). Now held in: @plan.React.O2 and the rows cited. Commit: 058d9352.
- "missing or disposed means null" is replaced by the record view (C108). Now held in: @plan.React.O2 and the rows cited. Commit: 058d9352.
- "initial(input) memory" reads the memory built from Flow.input, Flow.initial and computed initials (fragments row). Now held in: @plan.React.O2 and the rows cited. Commit: 058d9352.
- "Pending lanes alone do not mark optimistic writes pending" reads predicted (C27). Now held in: @plan.React.O2 and the rows cited. Commit: 058d9352.
- "initial must be pure" reads creation and its one pure default per field (C137; C157). Now held in: @plan.React.O2 and the rows cited. Commit: 058d9352.
- "Shared input never resets an existing actor" is replaced: refs carry no input (C119; C144). Now held in: @plan.React.O2 and the rows cited. Commit: 058d9352.
- The pre-attach copy read is added (C108; C143). Now held in: @plan.React.O2 and the rows cited. Commit: 058d9352.

### React O3

- "Reattach before expiry keeps the actor and cancels disposal; expiry disposes it through the Runtime." is restated as the remount rule (C143). Now held in: @plan.React.O3 and the rows cited. Commit: 227081b8.
- "React Activity hiding beyond grace disposes local actors; reveal creates a fresh one." is restated with uses and lane adoption (C108; C52). Now held in: @plan.React.O3 and the rows cited. Commit: 227081b8.
- "Sends through a handle whose actor is disposed are dropped as SendTargetAbsent" is replaced by the send table (C105). Now held in: @plan.React.O3 and the rows cited. Commit: 058d9352.
- "Local cleanup leaves the actor active for 100 milliseconds on the Runtime Clock." is amended by the in-flight exception and the remount rule (C108; C143). Now held in: @plan.React.O3 and the rows cited. Commit: 058d9352.
- "Work continues during grace." is replaced: activities run and schedules wait (C108). Now held in: @plan.React.O3 and the rows cited. Commit: 058d9352.
- "Shared ensuring hooks count as uses until cleanup; retention follows @plan.Runtime.O3." is replaced by uses from passive commit effects (C108). Now held in: @plan.React.O3 and the rows cited. Commit: 058d9352.
- "Shared refs with retain are the way to keep state across hiding." is replaced: persist, or hold a use outside the hidden subtree (C108). Now held in: @plan.React.O3 and the rows cited. Commit: 058d9352.
- The pre-attach buffer flushes after a new incarnation's deliveries (C52); one notify per task is added (C147). Now held in: @plan.React.O3 and the rows cited. Commit: 058d9352.

### React O4

- "Selectors read frozen state, memory, context, issues, lifecycle and activities." is replaced by schedules and operations, with private fields omitted (fragments row; C41; C66). Now held in: @plan.React.O4 and the rows cited. Commit: 058d9352.
- "Activity data follows @plan.Operations.O6." reads rows. "Transactions have no view reader." is replaced: write lanes are rows (C35; C66). Now held in: @plan.React.O4 and the rows cited. Commit: 058d9352.
- "descriptor.get" reads contract.get (C31). Now held in: @plan.React.O4 and the rows cited. Commit: 058d9352.

### React V4 (held under V6 until extraction)

- V4's "retention" reads uses and work in flight (C108). Now held in: @plan.React.V4. Commit: 058d9352.

## Package

### Package O1

- the flow-state list gains trait, subroutine, Flow, Outcome, Feed and the operators gt, gte, lt, lte, isNull, or and not (fragments row; C102; merge 5). Now held in: @plan.Package.O1 and the rows cited. Commit: 734e1707.
- "flow-state/testing: story, model, defineConfig, StoryFrame, StoryPlayer, definePresentation, propertyTest; type StoryRun." is replaced: story and model are removed; Story, Fake, domainPropertyOptions and PropertyTestFailed are added (C82; T1). Now held in: @plan.Package.O1 and the rows cited. Commit: 734e1707.

## FlowState

### FlowState O1

- "Rebuild packages/flow-state-rewrite in place." is replaced by the production location of the approved v3 roadmap (2026-11-07) and AGENTS.md, which freeze packages/flow-state-rewrite. Now held in: @plan.FlowState.O1 and the rows cited. Commit: ab87c325.

### FlowState O2

- S7's "model infrastructure" goes with Testing O5's removal (T1; C77). Now held in: @plan.FlowState.O2 and the rows cited. Commit: ab87c325.

## LazyFeatures

### LazyFeatures O2

- "An actor's send(ref, ...) never adopts or creates its target: an absent target drops the send and reports SendTargetAbsent, with details.adopted false for an inactive entry." is replaced by the send table: never adopts a lazy entry or creates an actor, may restore, NotAdopted (C105). Now held in: @plan.LazyFeatures.O2 and the rows cited. Commit: 102bd0a2.

### LazyFeatures O3

- "or a version change discards the scope" goes with the app-wide version (C211). Now held in: @plan.LazyFeatures.O3 and the rows cited. Commit: 102bd0a2.
- Dormant lane records are added (C50). Now held in: @plan.LazyFeatures.O3 and the rows cited. Commit: 102bd0a2.
- "A dormant record that fails to decode at adoption is discarded alone with a diagnostic and its actor opens fresh" is replaced by the quarantine and a fresh ensure (C143; the runner's ruling). Now held in: @plan.LazyFeatures.O3 and the rows cited. Commit: 102bd0a2.
- "@plan.Persistence.O5 discards them" gains the lane quarantine (C152; the runner's ruling, reading the user's quarantine decision as covering a removed machine). Now held in: @plan.LazyFeatures.O3 and the rows cited. Commit: 102bd0a2.

## ServerRendering

### ServerRendering O1

- the sentence "Shared actor retention starts at activation" (@O5) is replaced, and this outcome gains dehydrate's hold on each shared actor (C107). Now held in: @plan.ServerRendering.O1 and the rows cited. Commit: 37f1c1ce.

### ServerRendering O3

- "latest stream values and counts" is replaced by a latest row's last and baseline, and the partition is added (C96; C97). Now held in: @plan.ServerRendering.O3 and the rows cited. Commit: 37f1c1ce.
- "pending-commit facts" and "An in-flight commit becomes unknown with its attempt under @plan.Operations.O3 and reports DehydrateCommitInFlight" are replaced: write lanes are never hydrated and the commit is evidence (C49). Now held in: @plan.ServerRendering.O3 and the rows cited. Commit: 37f1c1ce.
- "the actor's unknown outcome owns reconciliation" is removed (C49). Now held in: @plan.ServerRendering.O3 and the rows cited. Commit: 37f1c1ce.
- "each activity binding" reads each placement (C40). Now held in: @plan.ServerRendering.O3 and the rows cited. Commit: 37f1c1ce.

### ServerRendering O5

- "Existing stream lanes win." is removed (C96). Now held in: @plan.ServerRendering.O5 and the rows cited. Commit: 37f1c1ce.
- "Streams open new sessions while displaying their transferred latest values." becomes rows starting Connecting with last shown (C96). Now held in: @plan.ServerRendering.O5 and the rows cited. Commit: 37f1c1ce.
- "Shared actor retention starts at activation." is replaced by Hydrate's hold (C107). Now held in: @plan.ServerRendering.O5 and the rows cited. Commit: 37f1c1ce.

### ServerRendering V5

- V5's "commits stay unknown" (C49); V3 and V5 gain a ticker and a chat feed (C96). Now held in: @plan.ServerRendering.V3 and @plan.ServerRendering.V5. Commit: 37f1c1ce.
