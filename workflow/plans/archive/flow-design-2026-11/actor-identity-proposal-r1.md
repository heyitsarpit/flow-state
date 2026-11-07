# Actor identity: is `Flow.input` already the name?

Status: **PROPOSED**, nothing decided. Written 2026-11-07 for absorb-wiring items C and D
([../absorb-wiring/absorb-wiring-proposal.md](../absorb-wiring/absorb-wiring-proposal.md), section 4). No plan or
design section changes because of this file. Evidence: `dispatch-desk/`, `checkout/`, `machine-design.md` (rules 43,
44, 51, 73; 2.7.13; 2.7.17), `Runtime.plan` O3, `React.plan` O2, the prototype's `convergence-13.md` (D221, D222) and
`FOR-ARPIT.md` (H2). Type spike: `c-actor-ref.ts` in the session scratchpad (passes `tsc` 7.0.2, every expected error
held).

Code marks: **NEW**, **RENAMED**, existing, user-defined.

## 1. The question, and the short answer

The user asked: how is `Flow.identity` different from `Flow.input`, and can they be one?

**They can be one.** For a machine, the fields its creator supplies already name it in 2.7.13: a local actor's
identity is (machine id, input by `Equal.equals`). Only shared actors name themselves a second time, by the ref's
parts. Folding the two gives one rule for every actor: **an actor is its machine plus its input.** A singleton keeps a
literal name. Recommendation: **option (a)**, below. It adds no word.

## 2. Where the data comes from: every shared actor in both apps

| Actor | Ref today | `Flow.input` fields | Input equals the parts? |
| --- | --- | --- | --- |
| editor, presence, assistant | `[workspaceId, ticketId]` | `workspaceId`, `ticketId` | yes |
| visit | `[workspaceId, ticketId]` | `workspaceId`, `ticketId`, **`assignee`** | **no** |
| queue, feed, panels, roster, find, technicians | `workspaceId` | `workspaceId` | yes |
| cart, miniCart | `cartId` | `cartId` | yes |
| session | `"coordinator"` | **`userId`** | **no**: a singleton with input |
| toasts, shopper, pay, refunds | a literal | none | no input |

So 13 shared actors take input, and 11 of them are named by exactly their input. There are two exceptions:

- **`visit.assignee` is a latent bug, found here.** `VisitScreen` ensures the persisted visit with
  `{ ...ticket, assignee }`. Runtime O3 says the first accepted input wins, and a later different input reports
  `InputIgnored`. So after the ticket is reassigned, the saved visit still holds the old assignee.
  `visit.machine.ts:55` (`memory.assignee === context.me || deny("NotAssignedToYou")`) then lets the old technician
  resolve and refuses the new one. It is a copy of the `Ticket` record's `assignee`, frozen at the first ensure. The
  editor's own comment says memory holds "keys and drafts, never copies of cached tickets".
- **`session.userId` is real non-identity input.** One session per Runtime. A different user means a different Runtime
  and `scope` (the session definition's header). The app wires `SessionRef` statically as a context provider
  (`app/app.ts`), so its name cannot depend on `userId`.

Fragment inputs (`address`, `lineId`, `quantity`, `intentId`, `draft`, `saved`, …) never name anything. A fragment
is identified by its placement (rule 51). They are out of scope.

The claimed hazard is `ensureActor(editorRef(T42), { input: T43 })`: T-42 created with T-43's memory, with nothing
reported. No instance of it was found. `visit` is the first real instance of the wider class: **non-identity input
on a shared actor is frozen by whichever caller ensured first.** Nothing shows which caller that was.

## 3. The options, on the ticket editor

The definition, machine body and commit are the same in every option, except D (section 6). Only the declaration
marker, the ref, the hook and the host change.

### Before (today, rule 73 applied)

```ts
// editor.definition.ts
memory: {
  workspaceId: Flow.input(Schema.String),                        // existing: Flow.input
  ticketId: Flow.input(Schema.String),
  draft: Flow.initial(Schema.String, ""),                        // existing: Flow.initial
},
// editor.machine.ts
const ticketKey = ({ memory }: { memory: Memory }) =>           // user-defined: ticketKey
  ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId });
const commitDraft = O.save.commit(({ memory }) => ({ ...ticketKey({ memory }), title: memory.draft }));
// guard: [canSave, O.save.idle(ticketKey)]
// editor.ref.ts
export const editorRef = (ticket: TicketKey) =>                  // user-defined: editorRef, TicketKey
  actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], { persist: true });  // existing: actorRef, parts
// useEditor.ts
const editor = useActorByRef(editorRef(ticket), { input: ticket });   // existing: input; the same value again
// app/host.ts
runtime.ensureActor(editorRef(T42), { input: T42 });                  // existing: ensureActor
```

### (a) Fold: a ref built from a value is named by the machine's input (recommended)

```ts
// editor.definition.ts: unchanged
memory: { workspaceId: Flow.input(Schema.String), ticketId: Flow.input(Schema.String), draft: Flow.initial(Schema.String, "") },
// editor.ref.ts
export const editorRef = (ticket: TicketKey) =>
  actorRef(EditorMachine, ticket, { persist: true });            // RENAMED arg 2: parts → a value carrying the input
// useEditor.ts
const editor = useActorByRef(editorRef(ticket), {});             // dropped: input. `{}` selects ensure (React O2), as Toasts and Pay do today
// app/host.ts
runtime.ensureActor(editorRef(T42));                             // dropped: input
runtime.ensureActor(editorRef(T42), { input: T43 });             // a type error: a value-named ref takes no input
```

### (b) A separate marker

```ts
// editor.definition.ts
memory: {
  workspaceId: Flow.identity(Schema.String),                     // NEW: Flow.identity (supplied, and names the actor)
  ticketId: Flow.identity(Schema.String),
  draft: Flow.initial(Schema.String, ""),
},
// editor.ref.ts: as (a)
export const editorRef = (ticket: TicketKey) => actorRef(EditorMachine, ticket, { persist: true });
// useEditor.ts, host: as (a) for the editor; a machine with both kinds still passes `{ input }` for the rest
```

### (c) Today, plus a `flow check` that the ref's parts equal the input fields

```ts
// every file unchanged
actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], { persist: true });
// flow check: ??? the ref is a closure over `ticket`; its parts are positional strings with no field names
```

(c) cannot be built. A ref is a closure, so `flow check` never sees the parts. A runtime check at ensure would have to
know which input field each position is, and that is (b)'s declaration. Dropped.

### (d) Considered: the ref is only (machine, input), with `persist` moved to the app entry

This is (a), plus `persist` beside `context` in `app({ machines })`. Then refs carry no options, and
`ConflictingActorRef` loses its `persist` case. It is a separate change with its own reach (lazy entries, Runtime O1).
It is mentioned so nobody counts it as part of (a).

## 4. The other actors, under (a)

```ts
// visit: assignee leaves input; the guard reads the Ticket record, which a reassignment changes
memory: { workspaceId: Flow.input(Schema.String), ticketId: Flow.input(Schema.String), /* dropped: assignee */ },
operations: ({ E }) => ({ ticket: TicketsDomain.ticketById, /* … */ }),     // existing: a bare domain read (rows only)
activities: [O.ticket.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId }))],
const mine = ({ operations, context }) =>                                     // user-defined: mine
  operations.ticket?.data?.assignee === context.me || deny("NotAssignedToYou");
export const visitRef = (ticket: TicketKey) => actorRef(VisitMachine, ticket, { persist: true });
const visit = useActorByRef(visitRef(ticket), {});                            // dropped: { ...ticket, assignee }

// session: a singleton, unchanged; the one place input is not identity
export const SessionRef = actorRef(SessionMachine, "coordinator", { persist: true });   // existing: a literal name
runtime.ensureActor(SessionRef, { input: { userId } });                                  // existing: input at ensure

// cart: a one-field ref is a value, not a string
export const cartRef = (cartId: string) => actorRef(CartMachine, { cartId }, { persist: true });  // RENAMED arg 2
runtime.ensureActor(cartRef(shopper.cartId));                                             // dropped: { input: { cartId } }
actorRef(CartMachine, cartId);   // a type error: a runtime string is not a singleton name (spike)

// presence: not persisted; same shape as the editor
export const presenceRef = (ticket: TicketKey) => actorRef(PresenceMachine, ticket);
const watcher = useActorByRef(presenceRef(ticket), {});

// a local actor: unchanged, and now under the same rule as a shared one
const scratch = runtime.createActor(EditorMachine, { input: T43 });          // existing: identity = (Editor, T43)
Story.machine(EditorMachine, { id, input: T42 });                            // existing: a Story's actor is local
```

The visit change is right under every option. Its guard stops reading a frozen copy, so it is recommended on its own
(Q2). The server still checks the assignment. The guard only spares the user a refused request.

## 5. Every question the user listed

| Question | (a) fold | (b) `Flow.identity` |
| --- | --- | --- |
| **Local actors** | One rule: (machine id, input), as 2.7.13 already says. Shared and local differ only in lifetime (rule 73 or React O3) and persistence | Two definitions: either local identity becomes the identity fields (a remount with another `assignee` then adopts the lanes) or it stays the whole input |
| **Releases** | Adding, removing or renaming an input field of a value-named persisted machine is a **new version**. Its saved actors are old-version records, listed at boot and never renamed. This is D221's upfront rule, applied to actors. A field's type is part of the version (D221's H2: the field set plus each field's encoded Schema). Today, changing a parts array renames saved actors silently, and there is no rule at all | The same rule, but only identity fields trigger it. Adding a plain input is D222's release-added input |
| **Defaults** | A value-named machine's input fields are required and have no default (D221). D222's one default still serves singletons and local actors | Identity fields have no default. Plain input keeps D222 |
| **Encoding** | Fields whose encoded form is a string (today's parts are strings; all 16 fields in the apps are `Schema.String`). Encoded in field-name order, so a reorder is not a new version (D221's "reordered only") | The same |
| **Read-only** | A machine's `Flow.input` fields are read-only: an `updateMemory` that writes one is a type error. Otherwise memory and name could disagree. No machine in the apps writes one. Fragment inputs stay writable (`autosave.saved` is a seed) | Identity fields only |
| **One-field refs** | `actorRef(QueueMachine, { workspaceId })`. A non-literal string is a type error (spike), so the old `queueRef(ws)` form cannot silently become a singleton named `"north"` | The same |
| **Singletons** | A **literal** name. A machine with input takes `{ input }` at ensure, and `InputIgnored` survives only here (session) | The same |
| **Fragments** | Unchanged. `Flow.input` means "the creator supplies it". A machine's creator names it; a fragment is named by its placement | The marker is a type error in a trait or subroutine: one more rule |
| **Rule 73** | Uses count per identity, unchanged. Inspection and `flow trace` print `Editor{workspaceId: "north", ticketId: "T-42"}` | The same, from identity fields |
| **Multi-tab** | The leader counts followers' uses by the encoded identity, which is canonical by the encoding row. Tabs on two releases: an old-version identity is a different actor. A stated limit, as for lanes | The same |
| **Server rendering** | The payload carries the encoded identity. The client's ref recomputes it from the same value. A server/client input mismatch (today a silent `InputIgnored`) cannot be written for a value-named ref | Can still be written for the non-identity part |
| **Stories** | `Story.machine(M, { input })` is a local actor: unchanged. App Stories and tests: `.ensure(Editor42)`, no input (27 of the 46 sites) | As (a), except machines with plain input |
| **Inspection** | Identity is named fields, not anonymous parts | The same |
| **Lane identity** | (actor identity, contract id, key), unchanged in shape. Actor identity is (machine id, input) for every actor, so 2.7.13's two definitions become one | Still two definitions, or a changed local one |
| **React lookup or ensure** | `useActorByRef(ref)` looks up and `useActorByRef(ref, {})` ensures (React O2). Value refs move to `{}` | The same where nothing else is supplied |

**What (a) forces.** Non-identity creation data on a shared value-named actor goes elsewhere: a record read (visit), an
event, or context. The evidence says that is where it belongs. Such data is frozen at the first ensure, and the other
callers cannot see that it was. **What (b) keeps legal:** exactly that. Its silent failure is also the worse one.
Forgetting the marker on a naming field makes two tickets share one actor (T-43 shows T-42's draft). Marking a field
that does not name only splits actors. Under (a) there is no per-field choice to get wrong.

## 6. D, the Flow-written key selector, as a consequence

D would give the machine body a helper that picks the identity fields from memory (`identity` under (b), naturally
`input` under (a)). It replaces 13 helpers such as the editor's `ticketKey` (4 lines, used 20 times).

- Rule 43 already lets `idle`, `retry`, `retryable`, `cancel` and `get` take any value carrying the key's fields. So
  `O.save.idle(({ memory }) => memory)` needs no helper today.
- Reads (`O.ticket.subscribe(ticketKey)`) and commit spreads (`...ticketKey({ memory })`) need exact input, so the
  helper stays there.
- D prevents nothing (filter 1), and it is one more name in the body. Its one gain is that summaries could print
  `save × input`, which is agent UX, the third priority.

**Not worth it under any option, for now.** Under (c) it has nothing to derive from. Revisit under (a) if a third app
writes the same helper.

```ts
// BEFORE and AFTER (no change recommended): the helper stays the app's
const ticketKey = ({ memory }: { memory: Memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId });
guard: [canSave, O.save.idle(({ memory }) => memory)],   // existing: rule 43, where a key is all that is needed
```

## 7. Counted from both apps

| | (a) fold | (b) `Flow.identity` | (c) |
| --- | --- | --- | --- |
| `{ input }` at ensure and `useActorByRef` | 46 of 63 removed (17 are session's) | 45 removed (visit keeps `{ input: { assignee } }`) | 0 |
| Refs | 4 parts arrays become the value; 8 string refs become `{ workspaceId }` or `{ cartId }` | the same | 0 |
| Field declarations | 0 changed | 16 fields re-marked | 0 |
| Words | 0 new; arg 2 of `actorRef` changes meaning | 1 new (`Flow.identity`) | 0 |
| Rules an agent must remember | 2: "an actor is its machine and its input; a singleton has a literal name"; "changing a persisted machine's input is a new version" | 4: which fields to mark; identity ⊆ supplied; local identity; no marker in fragments. Plus the version rule | 1 that no tool checks |
| Bugs closed | the mismatched ensure (never seen); visit's stale assignee (real); server/client input mismatch | the mismatched ensure for identity fields only | none |
| Bugs opened | none found. A release that adds creation data to a persisted value-named machine must use memory and an event, not input | a forgotten marker merges actors | none |

## 8. Recommendation

**(a).** An actor is its machine plus its input, for local and shared actors alike. A singleton has a literal name and
takes input at ensure. Input fields of a value-named machine are required, have no default, encode to strings, and are
read-only. Changing them in a persisted machine is a new version, as D221 does for keys. Fix `visit` either way. Do
not add D.

What this would change in the design, once accepted (a change list for the user's yes comes first):
`Runtime.plan` O3 (arg 2 is a literal name or a value; `InputIgnored` only for named refs); 2.7.13's identity
paragraph (one definition); rule 51's first bullet; 2.7.17 (uses per identity, named fields in Inspection);
`React.plan` O2 (value refs ensure with `{}`); 2.2.2 (`Flow.input` on a machine is read-only and names it); a compile
finding for an optional or defaulted input field on a value-named machine (name to choose, as D221's
`KeyFieldOptional`); an old-version actor finding at boot.

## 9. Questions

**Q1. One name, or two?**
A: fold: input is identity. B: `Flow.identity` beside `Flow.input`. C: today.
```ts
// A
actorRef(EditorMachine, ticket, { persist: true }); useActorByRef(editorRef(ticket), {});
// B
workspaceId: Flow.identity(Schema.String), ticketId: Flow.identity(Schema.String)   // NEW
// C
actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], { persist: true }); useActorByRef(editorRef(ticket), { input: ticket });
```
Rec. **A**: no new word, one rule for local and shared, and no per-field choice to get wrong.

**Q2. Visit's `assignee`.**
A: the guard reads the `Ticket` record. B: keep it as input (legal only under Q1 B or C).
```ts
// before
assignee: Flow.input(Schema.String);  memory.assignee === context.me || deny("NotAssignedToYou")
// A
ticket: TicketsDomain.ticketById;     operations.ticket?.data?.assignee === context.me || deny("NotAssignedToYou")
```
Rec. **A**, whatever Q1 says: B is a frozen copy that a reassignment never updates.

**Q3. A release that changes a persisted machine's input fields.**
A: a new version, as D221: old records are listed, never renamed, and reachable only by `forget`. B: try to rename
them by shared fields.
```ts
// release 1: actorRef(EditorMachine, { workspaceId, ticketId })   release 2 adds `boardId` to Flow.input
// A: saved T-42 editors of release 1 are old-version records (said at boot); release 2 starts fresh ones
```
Rec. **A**. Renaming by projection failed review three times for keys (convergence-13).

**Q4. Singleton names.**
A: literal strings only, so a runtime string is a type error. B: any string, as today.
```ts
actorRef(SessionMachine, "coordinator");   // both
actorRef(QueueMachine, workspaceId);       // A: type error, write { workspaceId }. B: a singleton named after the workspace
```
Rec. **A**: otherwise the old one-field form compiles and quietly keeps today's mismatch.

**Q5. A machine's input fields are read-only.**
A: yes, a type error to write one. B: no.
```ts
on: { Moved: { target: "self", updateMemory: ({ event }) => ({ ticketId: event.to }) } }   // A: type error
```
Rec. **A**: memory and name must agree. No machine in the apps writes one.

**Q6. Identity encoding.**
A: fields whose encoded form is a string. B: any Schema, encoded as JSON, with D221 H2's fingerprint.
```ts
page: Flow.input(Schema.Int)              // A: not allowed on a value-named machine; B: allowed
id: Flow.input(Schema.NumberFromString)   // A and B: allowed
```
Rec. **A**: today's parts are strings, and all 16 fields in the apps are; B needs H2's answer first.

**Q7. D, a Flow-written selector in the machine body.**
A: no. B: `input` in the body under Q1 A (`identity` under Q1 B).
```ts
// A: guard: [O.save.idle(({ memory }) => memory)]      B: machine(Editor, ({ O, input }) => …) ; guard: [O.save.idle(input)]
```
Rec. **A**: rule 43 covers keys, and D prevents nothing.

**Q8. Ensuring a value-named ref in React.**
A: keep `useActorByRef(ref, {})` (React O2; used 5 times today). B: split lookup into its own hook.
```ts
useActorByRef(editorRef(ticket), {});   // A
useActorByRef(editorRef(ticket));       // B: ensure; lookup becomes useActorIfAlive(ref) (name to choose)
```
Rec. **A** for now. B is a React change with its own reach.

## 10. Not verified

- The spike types `actorRef` and `ensureActor` only. The read-only rule, the version stamp and the encoding were not
  built.
- The visit rewrite assumes a bare domain read's row exposes `data` (as the editor's `ticket` does). Its Story
  (`resolve.story.ts:68`) would gain a Ticket fixture.
- The prototype has no shared-actor identity code to change. Its machine Stories are local.
- Counts are greps over both apps, tests and Stories included. 17 of the 63 sites are session's.
