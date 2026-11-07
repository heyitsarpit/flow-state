Prior art: revision 1, with the full reasoning, the options (b) to (d), the counts and the type spike, is [../../../../archive/flow-design-2026-11/actor-identity-proposal-r1.md](../../../../archive/flow-design-2026-11/actor-identity-proposal-r1.md).

# Actor identity: an actor is its machine plus its input (revision 2, merge-ready)

**Status: ACCEPTED by the user, 2026-11-07; MERGED into machine-design.md on 2026-11-07 as OD30.** The user took every
recommendation, Q1–Q8 option A. Recorded as **OD30**, with a new **rule 74**, a new section **2.7.19** and plan rows
**C117–C122**. Merge it after [../absorb-wiring/absorb-wiring-proposal.md](../absorb-wiring/absorb-wiring-proposal.md)
(OD29, C114–C116). The 2.7.17 entries are marked **to reconcile with lifetime proposal-v2**
(`../actor-lifetime/proposal-v2.md`, being written now), which is redesigning rule 73 and 2.7.17.

Code marks: **NEW**, **NEW MEANING**, **RENAMED**, existing, user-defined.

## 1. The decisions

**Q1 A. One rule for every actor.** A local actor's identity is already (machine id, input by `Equal.equals`)
(2.7.13). Only shared actors name themselves a second time, by the ref's parts, and then take the same fields again as
`{ input }` (46 sites in the apps). Nothing reports a ref and an input that disagree: `ensureActor(editorRef(T42),
{ input: T43 })` names T-42 with T-43's memory. So a ref built from a value is named by the machine's `Flow.input`
fields, and the value is the input. A singleton has a literal name and takes input at ensure. No new word.

```ts
// BEFORE: editor.ref.ts, useEditor.ts, app/host.ts
export const editorRef = (ticket: TicketKey) =>                                    // user-defined: editorRef, TicketKey
  actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], { persist: true }); // existing: actorRef, parts
const editor = useActorByRef(editorRef(ticket), { input: ticket });               // the same two values again
runtime.ensureActor(editorRef(T42), { input: T42 });                              // existing: ensureActor

// AFTER (editor.definition.ts unchanged: workspaceId and ticketId are Flow.input)
export const editorRef = (ticket: TicketKey) =>
  actorRef(EditorMachine, ticket, { persist: true });                             // NEW MEANING of arg 2: a value carrying the input fields
const editor = useActorByRef(editorRef(ticket), {});                              // dropped: input. `{}` selects ensure (React O2)
runtime.ensureActor(editorRef(T42));                                              // dropped: input
runtime.ensureActor(editorRef(T42), { input: T43 });                              // a type error: a value-named ref takes no input

// a singleton: unchanged
export const SessionRef = actorRef(SessionMachine, "coordinator", { persist: true });   // existing: a literal name
runtime.ensureActor(SessionRef, { input: { userId } });                                  // existing: input at ensure
// a one-field ref is a value, never a runtime string
export const cartRef = (cartId: string) => actorRef(CartMachine, { cartId }, { persist: true });
actorRef(CartMachine, cartId);                                                           // a type error (Q4)
```

**Added:** nothing. **Changed:** the meaning of `actorRef`'s second argument (a literal name or a value).
**Dropped:** 46 `{ input }` sites, 4 hand-ordered parts arrays.

**Q2 A. Visit's guard reads the `Ticket` record; `assignee` leaves input.** The persisted visit took `assignee` as
input, so after a reassignment it kept the old one (Runtime O3: the first input wins), and its guard let the old
technician resolve. The record is what a reassignment changes.

```ts
// BEFORE: visit.definition.ts, visit.machine.ts:55, ResolveWizard.tsx
assignee: Flow.input(Schema.String),                                            // existing: a frozen copy of the record's field
memory.assignee === context.me || deny("NotAssignedToYou")
useActorByRef(visitRef(ticket), { input: { ...ticket, assignee } })
// AFTER
operations: ({ E }) => ({ ticket: TicketsDomain.ticketById, /* … */ }),        // existing: a bare domain read
operations.ticket?.data?.assignee === context.me || deny("NotAssignedToYou")   // user-defined guard, reads the record
useActorByRef(visitRef(ticket), {})                                             // dropped: assignee
```

**Q3 A. Changing a persisted value-named machine's input fields is a new version.** Adding, removing or renaming a
field, or changing a field's encoded Schema, gives saved actors an identity no ref can spell. They are **old-version
records**: listed at ready, never renamed or matched by shared fields, removed by `forget`. This is the prototype's
D221 rule for an operation's key fields, applied to actors; renaming by projection failed review three times there.

**Q4 A. Singleton names are literal strings.** A runtime `string` as the second argument is a type error, so the old
one-field form `queueRef(ws)` cannot silently become a singleton named after the workspace.

**Q5 A. A machine's input fields are read-only.** An `updateMemory` that writes one is a type error, so memory and
name cannot disagree. No machine in the apps writes one. A fragment's input stays writable (its host seeds it).

**Q6 A. Identity fields encode to strings.** A value-named machine's input fields must have a string encoded form
(`Schema.String`, literals, template literals, `NumberFromString`); `Schema.Int` is a type error there. All 16 such
fields in the apps are strings. Encoded in field-name order, so reordering fields is not a new version.

**Q7 A. No Flow-written identity selector** (absorb-wiring's D is dropped). Rule 43 already lets `idle`, `retry`,
`retryable`, `cancel` and `get` take any value carrying the key's fields (`O.save.idle(({ memory }) => memory)`), and
D prevents nothing.

**Q8 A. Value refs ensure with `useActorByRef(ref, {})`** (React O2, as Toasts and Pay already do). Splitting lookup
into its own hook is a React change with its own reach.

**Limits.** Non-naming creation data on a shared value-named actor must come from a record read, an event or context,
never from input; a release that adds creation data to a persisted value-named machine uses memory and an event.
Tabs on two releases see an old-version identity as a different actor. A machine with no `Flow.input` can only be a
singleton. Fragments are unchanged: a fragment is named by its placement (rule 51), and its `Flow.input` means only
"the host supplies it".

**D221 and D222.** Both are prototype decisions (`prototypes/convergence-13.md`), not design text. Q3 is D221's rule
for actors. D222's one default per field serves singletons and local actors; it never applies to a value-named
machine's input fields, which have none (Q3, Q6).

## 2. Settled at merge (coordinator, for the user's read)

These follow from the decisions; none adds a word. Each is marked **[P]** in the design text.

- **One machine, two forms.** A machine reached both by a singleton ref and by value refs is `ConflictingActorRef`
  at ensure, beside `persist` and `context`. Otherwise one machine would have two meanings of input.
- **Finding names.** `IdentityFieldOptional` (a value-named machine's input field is optional or has a default; a
  construction error, as the prototype's `KeyFieldOptional`) and `OldVersionActor` (an old-version record, at ready,
  as the prototype's `OldVersionLane`).
- **Extra fields.** Flow keeps only the input fields of the value, as an entity key keeps only `primaryKey` fields
  (OD29 J). A fresh literal with an extra field is a type error.

## 3. The merge change list

All anchors are in `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md` as it stands on
2026-11-07, before absorb-wiring's merge; each "Current" phrase occurs exactly once (`grep -cF`), except where noted.

### Header and decision log

**I1. Header**, after absorb-wiring's revision note (its last line is the link to `absorb-wiring-proposal.md`; if that
merge has not landed, after "sections 3 and 6."). Insert:

```text
**Revision (actor identity, 2026-11-07).** An actor is its machine plus its input: a ref built from a value is named
by the machine's `Flow.input` fields and takes no input; a singleton has a literal name and takes input at ensure; a
machine's input fields are read-only, and on a value-named machine required, default-free and string-encoded (rule
74, 2.7.19; decided, OD30). Proposal: [../../proposals/actor-identity/proposal.md](../../proposals/actor-identity/proposal.md).
```

**I2. Decision log, after OD29** (if absorb-wiring has not landed, after "A catch-all `Flow` key was dropped. (2026-11-07)"). Insert:

```text
- **OD30** The user, 2026-11-07: accepted the actor-identity proposal, every question option A (rule 74, 2.7.19).
  Q1, an actor is its machine plus its input: a ref built from a value is named by the machine's `Flow.input` fields;
  a singleton has a literal name and takes input at ensure. Q2, visit's guard reads the `Ticket` record and `assignee`
  leaves input. Q3, changing a persisted value-named machine's input fields is a new version: old records are listed
  at ready, never renamed (the prototype's D221, for actors). Q4, singleton names are literal strings. Q5, a machine's
  input fields are read-only. Q6, identity fields encode to strings, in field-name order. Q7, no Flow-written identity
  selector (absorb-wiring's D dropped). Q8, value refs ensure with `useActorByRef(ref, {})` (React O2). Settled at
  merge [P]: `ConflictingActorRef` for one machine reached in both forms; the names `IdentityFieldOptional` and
  `OldVersionActor`. (2026-11-07)
```

### 2.2: the memory modifiers

**I3. 2.2.1, the `Flow.input` row.** Current: ``the creator supplies this field (2.2.2)``
New: ``the creator supplies this field; on a machine it is read-only and names the actor (2.2.2, rule 74)``. Re-pad the row.

**I4. 2.2.2, the `Flow.input` row.** Current: ``an actor's creator (`ensure(ref, { input })`, `useActor(m, { input })`)``
New: ``an actor's creator (a value-named ref's value, `actorRef(M, ticket)`; a singleton's `ensure(ref, { input })`; a local actor's `useActor(m, { input })`; rule 74)``

**I5. 2.2.2, the example.** Current: ``// supplied, then edited`` New: ``// supplied; read-only on a machine, writable in a fragment``

**I6. 2.2.2, the creation rule.** Current: ``input fields are ordinary memory, writable like any other.``
New: ``input fields are ordinary memory. **A machine's input fields are read-only** (decided, OD30 Q5): an `updateMemory` that writes one is a type error, since they name the actor (rule 74). A fragment's input fields stay writable.``

**I7. 2.2.2, a new bullet after "Markers survive."** (anchor: "so a field cannot silently stop being an input."). Insert after that line:

```text
- **A value-named machine's input** (rule 74) is required and has no default: an optional field, or a Schema
  default on a `Flow.input` field, is a construction error (`IdentityFieldOptional` [P]), as an operation's key
  fields are (rule 39). Each field's encoded form is a string (`Schema.String`, a literal, a template literal, a
  transformation such as `NumberFromString`); any other is a type error (OD30 Q6). A singleton's and a local actor's
  input keep their fields' one default.
```

### The rule and the section

**I8. Rule 74, after rule 73** (anchor: "Local actors keep React O3. `retain` does not exist."). Insert after that line:

```text
74. **An actor is its machine plus its input** (decided, OD30; 2.7.19). `actorRef(machine, nameOrValue, options?)`
    names a shared actor in one of two forms. **From a value:** the value carries the machine's `Flow.input` fields,
    which are its identity; Flow keeps only those fields. Ensuring it takes no `input` (`ensureActor(ref)`,
    `useActorByRef(ref, {})`), because the value is the input. **A singleton:** a literal string name (a runtime
    `string` is a type error); its input, if declared, is given at ensure, the first accepted input wins, and a
    different later one reports `InputIgnored`, the only place it remains. A machine with no input is a singleton. A
    local actor (`createActor`, `useActor`, `Story.machine`) is (machine, input by `Equal.equals`), as 2.7.13 says.
    - A machine's input fields are read-only; on a value-named machine they are required, have no default and encode
      to strings (2.2.2). The identity encodes them in field-name order, so a reorder changes nothing.
    - **Versions.** For a persisted value-named machine, adding, removing or renaming an input field, or changing a
      field's encoded Schema, is a new version. A saved record of another field set is an **old-version record**:
      listed at ready (`OldVersionActor` [P]), never renamed or matched by shared fields, removed by `forget`. Its
      non-`Idle` lanes stay unbound and listed (rule 44), since no ref can spell its identity.
    - One machine reached in both forms, or two refs of one identity with different `persist` or `context`, is
      `ConflictingActorRef` at ensure [P].
    - Uses (rule 73) count per identity. Inspection, `flow trace` and Story records name an actor by its machine and
      fields, `Editor{workspaceId: "north", ticketId: "T-42"}`, or a singleton's name. The multi-tab leader and a
      server-rendered payload carry the encoded identity; the client's ref recomputes it from the same value.
```

**I9. 2.7.19, a new section after 2.7.18** (anchor: "- **Rule 73.** An ignored unknown leaves no `InFlight` lane, so it is not a use.", the last line of 2.7.18). Insert after it:

````text
#### 2.7.19 Actor identity: the machine plus its input

Rule 74 is normative (decided, OD30). A shared actor used to be named twice, by the ref's parts and again by its
input, and nothing reported the two disagreeing; a persisted actor's non-naming input was frozen by whichever caller
ensured first. Now an actor is its machine plus its input, shared or local.

```ts
// before
actorRef(EditorMachine, [ticket.workspaceId, ticket.ticketId], { persist: true });   // parts
useActorByRef(editorRef(ticket), { input: ticket });                                  // the same values again
// after
actorRef(EditorMachine, ticket, { persist: true });     // new meaning: a value carrying the input fields
useActorByRef(editorRef(ticket), {});                   // `{}` selects ensure (React O2); no input
actorRef(SessionMachine, "coordinator", { persist: true });   // a singleton: a literal name, input at ensure
```

- **Where non-naming data goes.** Data that does not name the actor comes from a record read, an event or context,
  never input: the visit's `assignee` is read from the `Ticket` record, which a reassignment changes.
- **Lanes.** A lane is still (actor identity, contract id, key); adoption, parking and `unknown { Restored }` are
  unchanged (rule 44), and 2.7.13's local identity is now the general rule.
- **Releases.** Changing a persisted value-named machine's input fields is a new version (rule 74). Changing a
  parts array used to rename saved actors silently.
- **Stories.** `Story.machine(M, { input })` is a local actor, unchanged. An app Story ensures a value ref with no
  input (`.ensure(Editor42)`) and a singleton with its input.
- **Stated limits.** A release that adds creation data to a persisted value-named machine must use memory and an
  event. Tabs on two releases see two actors. Whether an old-version record's lanes should go to `orphaned` (P19)
  instead of staying unbound is open.
````

**I10. Rule 51, first bullet.** Current: ``- A write lane is (actor identity, contract id, key). `SharedContract` ``
New: ``- A write lane is (actor identity, contract id, key); an actor identity is its machine plus its input (rule 74). `SharedContract` ``

**I11. 2.7.2, the lane identity row.** Current: ``| Lane identity | Runtime O3's actor identity, the contract id and the key |``
New: ``| Lane identity | the actor identity (its machine plus its input, rule 74), the contract id and the key |``

**I12. 2.7.13, the identity paragraph.**

```text
Current:
The actor identity
is Runtime O3's ref (machine id, actor id) for a shared actor; for a local actor it is **defined here** (R9 K27, M1)
as (machine id, input by `Equal.equals`), so
New:
The actor identity
is **its machine plus its input** for every actor (decided, OD30; rule 74): for a ref built from a value, (machine
id, its input fields, encoded in field-name order); for a singleton, (machine id, its literal name); for a local actor,
as first **defined here** (R9 K27, M1), (machine id, input by `Equal.equals`), so
```

### 2.7.17 (to reconcile with lifetime proposal-v2)

**I13. The example.** In the four `actorRef` lines of 2.7.17's code block, replace ``[ws, ticket]`` with ``ticket``
(four occurrences, all in that block; `ticket` carries `workspaceId` and `ticketId`).

**I14. Uses.** Current: ``is restored on send (decided, OD27 Q2).`` New: ``is restored on send (decided, OD27 Q2). Uses count per actor identity (rule 74).``

**I15. Inspection.** Current: ``  `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }`, which `flow trace` and `flow explain` show.``
New: ``  `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }`, which `flow trace` and `flow explain` show; an actor is printed by its machine and input fields (`Editor{workspaceId: "north", ticketId: "T-42"}`) or a singleton's name (rule 74).``

### Stories (2.10.18)

**I16.** Current: ``.ensure(Checkout1, { input: { intentId: "pi_1" } })`` New: ``.ensure(Checkout1)``, and append to the
same line's comment: ``; Checkout1 = actorRef(CheckoutMachine, { intentId: "pi_1" }, { persist: true })``.

**I17.** Current: ``.ensure(BoardP1, { input: { projectId: "p1" } })`` New: ``.ensure(BoardP1)``.
Current: ``.ensure(ListP1, { input: { projectId: "p1" } })`` New: ``.ensure(ListP1)``.
Current (two occurrences, in `queueAcrossActors` and `bothHosts`): ``.ensure(IssuePageC7, { input: { issueId: "c7" } })``
New, both: ``.ensure(IssuePageC7)``.

**I18. `overloaded` (2.10.18.4): decided by the user, 2026-11-07, option A (the machine's input gains a `seat` field).** *Applied at merge by the main session, from the recommendation below.* It ensures 64 refs `` issuePageRef(`c7-${i}`) ``, each with
`{ input: { issueId: "c7" } }`, to put 64 actors' writes on one record. Under rule 74 those are one actor. Recommended
replacement (needs the user's yes, since it adds a user-defined machine to the example): a `Liker` machine
(user-defined; `memory: { issueId: Flow.input(Schema.String), seat: Flow.input(Schema.String) }`, one `LikeButton`
trait), with `` pages = Array.from({ length: 64 }, (_, i) => likerRef({ issueId: "c7", seat: `s${i}` })) `` and
`s.ensure(page)`. The alternative is to drop the Story and keep 65th-write coverage in the policy suite.

### Plan amendments (append after C116, in the same table)

**I19.**

```text
| C117 | Runtime O3 | Rule 74: `actorRef(machine, nameOrValue, options?)`; a value carrying the machine's `Flow.input` fields names the actor and is its input, so `ensureActor(ref)` takes none; a singleton has a literal name and takes input at ensure, the only place `InputIgnored` remains; a machine with no input is a singleton; one machine in both forms is `ConflictingActorRef` [P] (OD30 Q1, Q4) | Replaces "id is a string or a readonly array of strings; arrays encode unambiguously, so ["a/b", "c"] and ["a", "b/c"] are different actors" and "The first accepted input initializes it; later ensures never reset memory, and a different later input reports InputIgnored" |
| C118 | Runtime V1, V4 | V1: an unambiguous identity encoding (fields in name order, strings). V4: first input wins only for a singleton; a value-named ref given input is a type error; a mismatched ref and input cannot be written | Replaces "unambiguous id parts" and "first input wins with a diagnostic" |
| C119 | React O2 | A value-named ref takes no input; `useActorByRef(ref, {})` ensures it (OD30 Q8); a singleton's input never resets an existing actor | Amends "Declared input must have its exact type"; replaces "Shared input never resets an existing actor" |
| C120 | Persistence O2, O4, O5 | O2: `actorRef(machine, nameOrValue, { persist: true })`. O4: only a singleton has fresh input to ignore. O5: a saved record of another input field set is an old-version record, listed at ready (`OldVersionActor` [P]), never renamed, removed by `forget` (OD30 Q3) | Replaces "actorRef(machine, id, { persist: true }) selects a stable shared actor" and "ensureActor returns the restored actor and ignores fresh input"; adds to O5's version-change paragraph |
| C121 | Machines O1, Diagnostics | A machine's `Flow.input` fields are read-only (a type error to write one); on a value-named machine they are required, default-free and string-encoded (`IdentityFieldOptional` [P]); a fragment's input stays writable (2.2.2; OD30 Q5, Q6) | Amends the fragments' Machines O1 row "Memory fields carry `Flow.input` (supplied by the creator…)"; adds two finding names to Diagnostics |
| C122 | Inspection O1, O4, Testing O1 | Actors are named by machine and input fields, or a singleton's name, in `inspect(runtime)`, traces and Story records; an app Story's `ensure(ref)` takes input only for a singleton (rule 74) | Amends "per actor its state, revision, mailbox depth…" and C111 |
```

### Hits searched and left unchanged

Searched: `actor identity`, `local identit`, `identity is`, `actorRef`, `ensureActor`, `useActorByRef`, `ensure(`,
`InputIgnored`, `ConflictingActorRef`, `Flow.input(`, `{ input }`, `Runtime O3`, `React O2`, `Inspection O1`, `D221`,
`D222` (none: both are prototype decisions).

- Rules 21, 44, 46, 53 and 2.7.15, 2.9.1, 2.10.7 (4627) and 7511: "(actor identity, contract id, key)" and "equal
  local identities" stay true; rule 74 defines the term.
- 2.7.13's later sentences (two local actors with equal input; the input-free wizard is one identity) and 1713: the
  local rule, unchanged.
- C42 (7657) and C59 (7681): dated rows; C42's local identity is still true.
- 2.10's `Story.machine(…, { input })` (2094, 4214, 5255, 5695), the constructor table (3904–3905) and
  `.ensure()` at 5467 and 5631: local actors, unchanged.
- 2.11.2's `SwitchRoom` writes `roomId`, a plain field (5868), not `Flow.input`; 2.10.18.7's `ChatLog` never writes
  its input `roomId`. Q5 is not hit: a grep of every machine `Flow.input` field (`projectId`, `issueId`, `roomId`)
  against `updateMemory` finds no write.
- 2.7.17's `ConflictingActorRef covers persist and context`: rule 74 extends it; left for lifetime proposal-v2.
- Fragment inputs (143, 3584, 3710, 3827, 6814, 7481): named by placement, unchanged.
- OD27 and the OD24 list ("local identity (R9 M1)"): dated records.

## 4. Reference-app changes the merge implies (not applied)

1. Refs: `dispatch-desk/features/Tickets/editor/editor.ref.ts`, `features/Presence/presence.ref.ts`,
   `features/Assistant/assistant.ref.ts`, `features/Resolve/visit.ref.ts`: parts arrays become the value.
2. Refs: `dispatch-desk/features/Tickets/{queue,feed,panels,technicians}/*.ref.ts`, `features/Roster/roster.ref.ts`,
   `features/Find/find.ref.ts`, `checkout/features/Cart/cart.ref.ts`: string refs over runtime values become
   `{ workspaceId }` or `{ cartId }`. `features/Session/session.ref.ts`, `features/Toasts/toasts.ref.ts`,
   `checkout/features/{Shopper,Pay,Refunds}/*.ref.ts`: literal singletons, unchanged.
3. Ensures: drop `{ input }` for value refs (use `{}` in hooks) in `dispatch-desk/app/host.ts`, `app/view.tsx`,
   `next/app/layout.tsx`, `next/app/desk/[workspace]/page.tsx`, `tools/inspection.ts` and the panels
   (`AssistantPanel.tsx`, `CommentsPanel.tsx`, `TechniciansPanel.tsx`, `Panels.tsx`, `ActivityLog.tsx`,
   `QueueList.tsx`, `useEditor.ts`, `MergeCustomers.tsx`, `Roster.tsx`, `Viewers.tsx`, `FindPalette.tsx`), and in
   `checkout/next/page.tsx`, `app/view.tsx`, `Cart.tsx`, `MiniCart.tsx`. Session keeps `{ input: { userId } }`.
4. Visit (Q2): `dispatch-desk/features/Resolve/visit.definition.ts:44` drops `assignee` and adds the `ticket` read;
   `visit.machine.ts:55` reads `operations.ticket?.data?.assignee`; `ResolveWizard.tsx:14-15` drops the `assignee`
   prop and input; `resolve.story.ts:68` drops `assignee` and gains a Ticket fixture; check `resolve.test.ts`.
5. Stories and tests that ensure value refs with input: grep `ensure(` under both apps' `*.story.ts` and `*.test.ts`.

## 5. Dropped

- **(b) `Flow.identity`** beside `Flow.input`: two definitions of identity, and a forgotten marker merges actors.
- **(c) a `flow check` that parts equal input**: cannot be built; a ref is a closure.
- **(d) `persist` moved to the app entry**: a separate change, not part of Q1.
- **D, a Flow-written identity selector** (Q7): rule 43 covers keys; it prevents nothing.
- **Q8 B, a separate lookup hook**: a React change with its own reach.

## 6. Not verified

- The type spike covered `actorRef` and `ensureActor` only; the read-only rule, string encoding, the version stamp,
  `IdentityFieldOptional` and the extra-field check were not built.
- The visit rewrite assumes a bare domain read's row exposes `data`, as the editor's `ticket` does.
- The prototype has no shared-actor identity code; its machine Stories are local.
- Whether an old-version record's lanes stay unbound or go to `orphaned` (P19): open, stated in 2.7.19.
- How rule 74 sits with lifetime proposal-v2: I13–I15 and rule 74's "Uses" line must be re-read against it.
- Counts are greps over both apps, tests and Stories included.
