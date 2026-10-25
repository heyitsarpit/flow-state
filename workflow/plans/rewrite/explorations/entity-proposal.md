# Entity proposal (draft 3)

Status: a concrete design to work with, not decided. It answers the questions in `entities.md`
(unchanged, the problem statement). Draft 3 is the version 1 core: draft 2 grew to about 35
author-facing names and 20 runtime rules while patching review findings, and a simplicity review
showed both guarantees survive a much smaller set. Section 17 lists what was deferred to version 2 and
why; section 18 lists what changed since draft 2.

## 1. The model

> **The server owns truth and membership. The client keeps answers to questions it asked; each
> answer knows which entities it contains and which entity changes it depends on. Every write to an
> entity updates every copy at once. When a change settles, every answer that depends on it is
> refetched. Commands say what they change. Machines own workflow and drafts; they read local answers
> and send commands.**

| Concern                                           | Owner                                |
| ------------------------------------------------- | ------------------------------------ |
| Which entities belong in a page, search or list   | the server                           |
| An entity's fields agreeing across cached answers | the runtime (the entity store)       |
| Which entity changes an answer depends on         | the resource, by declaring `depends` |
| Hiding an item whose fields no longer fit a view  | the view's selector                  |
| Drafts, transitions, timing                       | machines                             |
| Fetching and committing                           | resources and transactions           |

**Two guarantees:**

1. **Entity coherence.** Every cached copy of an entity shows the same fields in the same
   publication, whoever wrote them, including optimistic changes.
2. **Result validity.** When a change settles (a command succeeds or becomes `unknown`, a push
   arrives, or a read reveals newer fields), every answer that depends on it and holds older data is
   refetched; inactive answers are marked stale. With a stable server this ends, and every answer
   ends up as the server would return it. Between a change and its refetch an answer may briefly
   show stale membership or context (a resolved ticket in the open queue, an old `total`).

Machines read **local** answers, which can include optimistic values the server has not returned.
Local observation and remote confirmation stay distinct. There is no local query language.

## 2. Entities

The entity is the Schema, so there is no bare struct to confuse with it.

```ts
export const Ticket = entity("support/Ticket", {
  fields: {
    workspaceId: Schema.String,
    ticketId: Schema.String,
    title: Schema.String,
    status: Status,
    updatedAt: Schema.String,
    description: Schema.NullOr(Schema.String),
    assignee: Schema.NullOr(User.pick("name")), // a nested entity
  },
  primaryKey: ["workspaceId", "ticketId"],
  version: "updatedAt", // optional; compared as a string, so use ISO timestamps or zero-padded counters
});

export const TicketSummary = Ticket.pick("title", "status", "updatedAt");
```

- **`entity(id, { fields, primaryKey, version? })`** returns a Schema annotated as the entity. The id
  is stable for traces and tools; duplicates are a static error.
- **`primaryKey`** lists top-level primitive fields. `Ticket.keyOf(value)` extracts a key;
  `Ticket.keyString(key)` is its one canonical string (for `actorRef` ids and maps).
- **Shapes.** `Ticket.pick(...fields)` is a Schema with the key fields plus the chosen fields,
  annotated as `Ticket`. Every result containing tickets is built from `Ticket` or its picks. A
  struct with a ticket's fields but not built this way is a plain struct and gets no coherence;
  `flow check` flags a struct containing all of `Ticket`'s key fields that is not a shape.
- **Nested entities** are found recursively: renaming a user updates every ticket embedding them.
- **Discovery.** Entities are found in the result Schemas of the app's operations; no registry.

Feasibility (checked against Effect 4.0.5): the annotation lives under a string key such as
`"~flow/entity"` and survives `Array`, `optional`, `NullOr`, brands and `toType`; `pick` is
`Schema.Struct(Struct.pick(fields, …)).annotate(…)`; results are walked over `SchemaAST.toType` with a
hand-written switch (`Objects`, `Arrays`, `Union`, `Suspend`, `Declaration`). The annotation must be
applied before any `.check`; `mapFields` drops it.

## 3. Answers: resources with a result

```ts
export const ticketById = resource({
  id: "support/ticket-by-id",
  key: (input: typeof Ticket.Key.Type) => input,
  lookup: (input, { signal }) => TicketApi.use((api) => api.load(input, signal)),
  result: Ticket, // a single-entity answer
  notFound: ["TicketNotFound"], // this failure means the ticket no longer exists
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

export const ticketList = resource({
  id: "support/ticket-list",
  key: (input: TicketListInput) => listKey(input),
  lookup: (input, { signal }) => TicketApi.use((api) => api.list(input, signal)),
  result: Schema.Struct({ tickets: Schema.Array(TicketSummary), total: Schema.Number }),
  depends: [Ticket.changes({ when: (t, input) => t.workspaceId === input.workspaceId })],
  staleTime: "10 seconds",
  gcTime: "2 minutes",
});

export const openCount = resource({
  …,
  result: Schema.Struct({ open: Schema.Number }), // contains no ticket, but counts them
  depends: [Ticket.changes({ when: (t, input) => t.workspaceId === input.workspaceId })],
});
```

- **`result`** replaces the old `data` field; it is required when the result contains entities.
- **`depends`** says which entity changes could affect the answer. `when` narrows it with the
  entity's fields and the resource input. **When unsure, depend more**: an extra refetch costs only
  bandwidth, a missing one leaves a stale screen.
- **Default.** Without `depends`, an answer depends on every entity type its result contains, with no
  `when`. Answers that derive from entities without containing them (counts, totals) must declare
  `depends`; `flow check` warns when a feature changes an entity and a resource with no entity in its
  result declares no `depends`.
- **`when`** is typed with the shape the answer contains (or the entity's full Schema for a type it
  does not contain). If a field it reads is absent from the value being tested, the answer depends on
  the change. Because the parameter type lists only available fields, reading anything else is a type
  error; no proxy tracking is needed.
- **Self-check** in development and Stories: whenever a lookup lands, every entity it returned must
  satisfy its answer's `when`, tested on **the response's own values** (not the merged record, which
  may hold a newer optimistic or confirmed value). A violation is an error naming the entity, the answer and the
  predicate ("`when` says ticket 42 cannot matter here, but the server returned it"), which catches
  predicates narrower than the server.
- **Single-entity answers** need no `depends`: by default they depend on their own key only, and
  section 6 says when they refetch. Nested entity types inside any answer propagate by coherence and
  trigger no refetch unless the answer declares a `depends` on them.
- **Context fields** (`total`, `highlight`, rank) belong to the answer and are made valid by its
  refetch.
- **`notFound`** lists failure tags that mean the entity **no longer exists**. Such a failure deletes
  the entity everywhere. Access failures (forbidden) are not listed here: they fail only that answer,
  since access can differ by endpoint.

## 4. The entity store and ordering

One **record per entity key**: the fields received so far, each with the version and start time of
the write that set it. Answers store their result with every entity position replaced by a
reference (key plus shape). An answer's value is assembled at publication by projecting records to
its shape, with structural sharing, so an element keeps its identity while the fields its shape
projects are unchanged.

**One write path** for every source:

```ts
upsert(key, fields, { version?, startRevision, cause })
delete(key, { version?, startRevision, cause })
```

Every write has a **start revision** (the store revision when it started) and a **landed revision**
(when it was applied); the store keeps the landed revision of each field's last write. Start
revisions:

| Write                                                     | Start revision                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| lookup result                                             | when the lookup started                                                                       |
| push                                                      | when it arrived                                                                               |
| command result and promoted optimistic fields (section 5) | when the command **settled**, because the server applied it somewhere between send and settle |
| restore from persistence                                  | 0                                                                                             |

**One comparison, per field (a delete is a write of every field):** a write replaces a stored field
when

- both carry a version: its version is greater than or equal to the stored version;
- otherwise: its start revision is at or after the stored field's landed revision (it began after the
  stored value arrived).

Writes land one at a time in Runtime order, so the outcome is deterministic. A list response that
started before a save settled cannot overwrite the saved title; a detail lookup that started before a
delete settled cannot resurrect the ticket; a `notFound` that started before a newer write cannot
delete it.

**Propagation.** A write updates the record, and every answer whose shape includes a changed field
shows it in the same publication. A write carries only the fields its shape has; absent fields keep
their values; `null` is a value.

## 5. Commands

```ts
export const resolveTicket = transaction({
  id: "support/resolve-ticket",
  key: (input: typeof Ticket.Key.Type) => input,
  commit: (input, { signal, attempt }) => TicketApi.use((api) => api.resolve(input, { signal, attempt })),
  result: Ticket,
  optimistic: [Ticket.patch((input) => input, () => ({ status: "resolved" }))],
  concurrency: "serialize",
});

export const resolveMany = transaction({
  …,
  result: Schema.Array(Ticket),
  optimistic: [Ticket.patch((input) => input.keys, () => ({ status: "resolved" }))], // several keys
  concurrency: "serialize",
});

export const deleteTicket = transaction({ …, optimistic: [Ticket.delete((input) => input)], concurrency: "serialize" });

export const createTicket = transaction({ …, result: Ticket, concurrency: "allow" }); // no optimistic create in v1

export const archiveWorkspace = transaction({ …, affects: [Ticket], concurrency: "reject" });
```

- **Optimistic operations** live on the descriptor: `patch(key | keys, (entity, input) => fields)`
  and `delete(key | keys)`. They are pure (`flow check` flags `Date.now`, `Math.random`, `crypto`).
  They are layered over the record, carry no version, and are replayed in admission order whenever
  something beneath them changes. A `patch` on a key with no record does nothing (traced). An
  operation that throws rejects the admission as a defect.
- **What a command affects** is the union of its result's entities, its optimistic keys and its
  `affects` list (types, keys, or a function of the input). `affects` may accompany a result.
- **Concurrency** stays per descriptor, as in Transactions. Two different commands changing the same
  field concurrently resolve by the ordering rules and the refetch that follows.
- **Creates** have no optimistic form in version 1: the result writes the entity and dependent lists
  refetch, so server-assigned ids need nothing special.

The call site carries only outcomes and timing:

```ts
O.resolveTicket.commit(({ memory }) => memory.ticketKey, {
  outcomes: {
    success: E.Resolved,
    failure: { … },
    unknown: E.ResolveUncertain.from(({ attempt }) => ({ attempt })),
  },
});
O.deleteTicket.commit(({ event }) => event, { delay: "5 seconds", outcomes: { … } }); // undo window
```

**How a command ends:**

| Ending                                     | Store                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Refetches                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| success                                    | each patched field becomes a base write, then the result is written over it (both with the settle revision as their start); deletes become permanent; the change ends; all in one publication                                                                                                                                                                                                                                                                                 | always (section 6), whether or not anything visible changed |
| failure, or cancelled before sending       | the change is removed; the revert publishes in the same turn as the failure outcome                                                                                                                                                                                                                                                                                                                                                                                           | none                                                        |
| defect, cancelled after sending, abandoned | `unknown`: the change stays and the entity reads `unconfirmed`                                                                                                                                                                                                                                                                                                                                                                                                                | always (section 6)                                          |
| `unknown` resolved                         | only by evidence about **this attempt**: a push echoing its `attempt.id` (`EntityChange.Confirm`), or the machine deciding: `O.resolveTicket.settle(({ event }) => event.attempt, "applied" \| "notApplied")`. `"applied"` promotes the change like a success; `"notApplied"` removes it. Either way the commit's optional `settled` outcome fires (`settled: E.ResolveSettled.from(({ applied }) => ({ applied }))`), so the machine always learns how its uncertainty ended | always                                                      |

An `unknown` attempt does not block later commands on the same key. Promoting patched fields to
base values (not replaying them after success) means an increment is never applied twice. Matching entity values, or a newer version, never end an `unknown` on their own:
they show the state of the entity, not the outcome of the attempt.

## 6. Repair: what refetches, and when

**Repair reads base values, never optimistic ones.** Every record has a **base** (what the server has
said) and a **visible** value (base plus active optimistic changes). Views show the visible value;
every repair decision below compares base values, so an optimistic overlay can neither trigger a
refetch nor hide a real server change.

**Triggers.**

- A command settling (success, `unknown`, or settled `unknown`): always, for every entity it affects.
- A read or push that changes a **base** field of an entity, even when an optimistic overlay keeps
  the visible value the same.
- A stream reconnecting after a gap: every answer depending on its entity type is marked stale.

**Which answers.** For each affected entity, the answers that contain it or depend on it, where
`when` holds for the base value before or after the change (creates have no before; deletes no
after). For a command, "before" is the base value **captured at admission**, kept with the change
until it settles, so a ticket moved from workspace A to B optimistically still repairs workspace A's
queue and count at settlement. Single-entity answers holding the entity refetch only if the settled
change was not covered by a command result or push carrying that entity.

**Convergence rule.** A trigger refetches a matching answer only if the answer's current data
**started before** the change that triggered it. A refetch's own response is an ordinary read: if it
reveals newer fields, it triggers other answers whose data started earlier, and never itself. Each
refetch starts later than its trigger, so with a stable server the process ends, and every answer
holds data that started after the last change it depends on.

**The in-flight fence.** A lookup that was already running when a matching change settled still
writes entity fields under section 4, but its membership and context are not trusted: its answer is
refetched once it lands, unless a lookup for that answer that started after the change is already in
flight or has landed. A fence refetch always starts a fresh lookup.

**Volume.**

- Refetches are coalesced per answer over a short trailing window (about 50 ms, on the Runtime
  clock), so a bulk command or a burst of pushes refetches each answer once.
- Active answers refetch; inactive ones are marked stale and refetch when next subscribed.
- A list whose input is a page number refetches only its active page; other pages are marked stale.
- Optimistic changes trigger no refetches; only settlement does.

**The resolve scenario.** Ticket 42 goes from `open` to `resolved`.

1. Admission: `status` changes in every copy. The open queue's selector filters on status, so 42
   disappears from the view at once.
2. A lookup of the open queue that started earlier lands with 42 still listed: the fence marks it
   for refetch.
3. Success, even if the result equals the optimistic value: the open queue, the resolved queue and
   `openCount` match `when` and hold older data, so they refetch. The resolved queue gains 42.
4. Answers in other workspaces do not match `when` and are untouched.

## 7. Deletes

- `delete` hides the entity everywhere at admission: every array element holding it is left out at
  assembly. Success makes it permanent.
- A single-entity answer whose entity is deleted, by any source, shows the built-in failure
  `Deleted { key, confirmed }`. During an undo window `confirmed` is false. The activity's optional
  `deleted` outcome fires only once the delete is confirmed, so an undo never strands a machine in a
  "gone" state; if the delete is undone, the lane simply returns to its value. This is distinct from a lookup's own `TicketNotFound` failure: one says "the lookup was
  answered not found", the other "the entity was deleted here".
- A deleted **nested** entity never removes its parent. Until the parent answers' refetch lands,
  the nested position keeps showing the entity's last base value (its tombstone keeps it), so the
  answer's type always holds; if the refetch fails, the answer reports that failure as usual while
  still showing those last values.
- A deleted key keeps a **tombstone** while any read that started before the delete is in flight.

## 8. Pushes

```ts
export const ticketChanges = stream({
  id: "support/ticket-changes",
  key: ({ workspaceId }: { workspaceId: string }) => ({ workspaceId }),
  subscribe: (input) => TicketApi.use((api) => api.changes(input)),
  entity: Ticket, // emissions are EntityChange<Ticket>
});
// EntityChange.Upsert(fields, { version? }) | .Delete(key, { version? }) | .Confirm(attemptId)
```

A push is a write like any other. It triggers repair only if it changes a base field, so our own
echo, already promoted at settlement, triggers nothing. Streams without `entity` stay streams of occurrences mapped to events.

## 9. Machines and definitions

- **Memory holds keys, not copies.** `flow check` flags memory whose Schema contains an entity shape.
  Drafts are plain fields and record what they started from (`baseTitle`, `baseVersion`), so a guard
  can tell "the server changed under my draft" from "my draft changed".
- **`value` outcomes** fire when a fetch or confirmed write changes the answer's **base**, never for
  optimistic changes or their rollback, and their payload is the **base** projection: confirmed data
  only, without any command's optimistic overlay. A clean draft therefore never adopts another
  command's speculative title as its baseline. Views still show the visible value through lanes.
- **Hiding by a changed field** is a selector filter (`tickets.filter((t) => t.status === "open")`),
  using fields that coherence keeps current.
- **Events** may carry entity values as snapshots of a moment.
- **Refs and input** use keys: `editorRef = (key) => actorRef(EditorMachine, Ticket.keyString(key), …)`.
- **Context** exposes keys and primitives only.
- **Definitions** do not list entities; their operations imply them.
- **Refreshing by type.** `Ticket.refetchAll()` is a machine action (after a permission change, for
  example), using the same machinery as `affects: [Ticket]`.

## 10. Reading in views and guards

Decision 8 stands. A snapshot references the store revision it was published with (immutable,
structurally shared, serialised once per revision in checkpoints), so entity reads are pure functions
of the snapshot:

```ts
Ticket.get(s, key, TicketSummary); // the entity in that shape, or undefined if the shape is not satisfied
Ticket.unconfirmed(s, key); // true while an optimistic change on it awaits its outcome
```

Both are passive. Guards may use them and read the same revision as the rest of the turn.
`unconfirmed` replaces 8a's lane `pending`; it is the one entity-level view of command state.

## 11. Persistence and sessions

- Persistence stores **base data only**: each answer's references and context, and each referenced
  record's base fields. Optimistic overlays are never written, so a reload never turns a pending
  rename into apparently confirmed data, and an optimistically deleted element is still present in
  the persisted answer. On restore, base data is written back with start revision 0, so any live write
  wins.
- Unconfirmed changes do not survive a reload in version 1: after a reload the screen shows the last
  confirmed data, and a pending edit the server may or may not have applied appears once the answer
  refetches.
- Persistence is namespaced by the signed-in principal. `runtime.reset()` aborts reads and commands,
  drops the store, disposes retained actors, and deletes that principal's persisted data (logout).

## 12. Stories

- **Stateful fixtures.** A fixture Layer holding a `Ref` acts as a small in-memory server, so a lookup
  returns updated data after a command; this is a documented pattern, not a new API.
- **Steps:** `.emit(stream, input, [EntityChange…])`, `.fail(stream, input, error)`, and
  `.hold(operation)` / `.release(operation)` to pause a command or lookup in flight.
- **Assertions:** `Ticket.get(checkpoint.snapshot, key, Shape)`, `Ticket.unconfirmed(…)`, and
  `run.lookups(resource)` to assert which refetches ran and why.
- **Checkpoints** include records, tombstones and active changes.
- **The `when` self-check** runs on every lookup.
- **`model`** treats pushes and command outcomes as environment inputs from a finite, author-supplied
  list, and hashes machine snapshots only.

```ts
export const resolveWithBothQueues = story
  .app(DeskSetup, {
    id: "resolve-both-queues",
    fixtures: [TicketServer.seed([T42open, T7open, T9resolved])],
  })
  .send(openQueueRef, Queue.E.StatusChanged({ status: "open" }))
  .send(resolvedQueueRef, Queue.E.StatusChanged({ status: "resolved" }))
  .process()
  .hold(O.resolveTicket)
  .send(editorRef(T42key), Editor.E.ResolveRequested())
  .process()
  .checkpoint("admitted") // 42 shows resolved everywhere; the open queue's view filters it out
  .release(O.resolveTicket)
  .process()
  .checkpoint("settled"); // the resolved queue gained 42; each list and openCount refetched once
```

## 13. Tools

- **Traces** record each entity write (cause, fields, version, skipped fields), each refetch with its
  reason ("`resolveTicket` settled; `when` matched the old value; data started before the change"),
  each fenced lookup, and each self-check violation. `flow trace entity Ticket <key>` and
  `flow trace refetch <answer>` explain them.
- **`flow graph`** draws entity ↔ resource (contains, depends), entity ↔ transaction (changes), and
  derived actor-level edges ("Editor affects Queue through Ticket").
- **`flow check`:** a struct copying an entity's key fields without being a shape; a counting resource
  with no `depends`; a `when` reading a nested entity's field without depending on that entity type;
  non-determinism in optimistic operations; memory holding an entity shape; an activity on a
  single-entity resource with no handler for `Deleted` or its `notFound` failures; duplicate entity
  ids.

## 14. Sync engines: how the door stays open

| Constraint (`entities.md`)              | Met by                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| one path for entity changes             | `upsert`/`delete` with ordering metadata                                                   |
| answers maintained by a source          | internal: an answer's maintainer is "refetch" today; an engine could maintain answers live |
| keys as records of primitives           | `primaryKey`                                                                               |
| opaque comparable versions              | `version` (a `compare` option can be added for engines)                                    |
| reads propagate                         | section 4, and reads trigger repair (section 6)                                            |
| confirmation by the source              | `EntityChange.Confirm(attemptId)`                                                          |
| optimistic changes optional per command | `optimistic` is optional                                                                   |
| persistence owned by the source         | a future engine source would declare it                                                    |

## 15. Worked example

```ts
// queue view: hiding is a selector concern
const tickets = useView(queue, (s) =>
  s.activities.tickets?.data?.tickets.filter((t) => t.status === s.memory.status),
);

// editor machine
OPEN: {
  activities: {
    ticket: O.ticketById.subscribe(({ memory }) => memory.ticketKey, {
      outcomes: { value: E.TicketLoaded.from((t) => ({ title: t.title })) },
    }),
  },
  on: {
    TicketLoaded: {
      target: "self",
      guard: ({ memory, event }) =>
        memory.draft === memory.baseTitle || event.title === memory.draft || deny("KeepLocalEdits"),
      updateMemory: ({ event }) => ({ draft: event.title, baseTitle: event.title }),
    },
    ResolveRequested: { target: "self", actions: [O.resolveTicket.commit(({ memory }) => memory.ticketKey, { outcomes: { … } })] },
    ResolveUncertain: { target: "self", actions: [O.ticketById.refetch(({ memory }) => memory.ticketKey)] },
  },
}
```

No author code lists the open queue, the resolved queue or the count.

**The hard sequence** (an optimistic command, an early refetch, success with no visible difference,
then a conflicting response):

1. Resolve is admitted; 42 reads `resolved` everywhere; nothing refetches yet.
2. A queue lookup that started before admission lands with 42 `open`. It writes the base value
   `open`, but the optimistic layer still shows `resolved` on top. Nothing refetches yet.
3. Success with `status: "resolved"`: the patched field is promoted to a base write with the settle
   revision; nothing visible changes, but settlement always triggers repair, so both queues and the
   count refetch.
4. A late response that started before the settle arrives with `open`: section 4 skips it for
   `status`, and the fence refetches its answer, unless a later lookup already covers it.

## 16. Rules for agents

1. Declare each server record once with `entity`, and build every result from it or its `pick`s.
2. A command says what it changes (`optimistic`, `result`, `affects`). A list or count says what it
   depends on (`depends`); when unsure, depend more.
3. To hide an item whose fields no longer fit a view, filter in the selector.
4. Machines hold keys and drafts, never copies; consistency is the runtime's job.

## 17. Deferred to version 2, with reasons

| Deferred                                          | Why it can wait                                                                 | Cost of waiting                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `excludes` (runtime hiding)                       | selectors already see coherent fields; a wrong predicate silently hid real rows | one selector filter per view                                           |
| `fields` on `depends`                             | purely additive                                                                 | an edit refetches every matching list, coalesced                       |
| optimistic `create`, `newId`, provisional inserts | creates appear in no list until refetch anyway                                  | no instant new row                                                     |
| held values for fields a result omits             | promotion plus the always-refetch rule covers it                                | a server-normalised value shows the client's version until the refetch |
| waves, validity-refetch wait                      | replaced by the convergence rule and settlement-only triggers                   | none for correctness                                                   |
| per-entity ordering across descriptors            | per-descriptor `concurrency` plus ordering rules                                | rare overlapping fields resolve by landing order, then refetch         |
| more evidence for ending `unknown`                | only attempt-specific evidence is sound                                         | the machine settles after refetching                                   |
| three-state `unconfirmed`, `changed` outcome      | additive                                                                        | none                                                                   |
| persisting unconfirmed changes, the restore table | reloads lose pending commands, as before                                        | no offline queue                                                       |
| version `compare`                                 | string comparison covers ISO timestamps                                         | engines may need it                                                    |
| transaction `notFound`                            | a failure plus a refetch reaches the same state                                 | one extra round trip                                                   |
| a `fakeServer` helper                             | a Layer with a `Ref` is enough                                                  | a little fixture code                                                  |

## 18. What changed from draft 2

- Cut to the version 1 core above (about 18 author-facing names, about 9 runtime rules).
- Settlement always triggers repair, even with no visible change (an external review's sequence).
- One write comparison on start and landed revisions; command writes start at their settle revision,
  so reads that began before a command settled cannot undo or resurrect it.
- The fence skips a refetch already covered by a later lookup; the self-check tests response values.
- Resolving an `unknown` always fires the optional `settled` outcome; `deleted` fires only when
  confirmed, so undo never strands a machine.
- Waves replaced by the convergence rule on start revisions, which ends and converges.
- `unknown` ends only on evidence about the attempt; `settle` names the attempt and the conclusion.
- Success promotes patched fields to base values, so replay never applies an increment twice.
- `notFound` means absence only; access failures fail one answer; local deletes show `Deleted`.
- Hiding moved to selectors; ordering reduced to two rules.
- After Codex's review of draft 3: repair compares base values, not visible ones; a command keeps its
  admission-time base for matching; `value` delivers base data; persistence stores base data only;
  a deleted nested entity keeps its last values until the parent refetches.

## 19. Still open

**Correctness, needing proof rather than argument:**

- The convergence rule (section 6) must be shown by an executable test, not only reasoned: a
  property test that drives random interleavings of reads, pushes, rejected field writes, masked base
  changes, fenced lookups and commands against a stateful fake server, and checks that once the server
  is quiet every answer equals what the server would return.
- Start revisions order requests; they do not prove server freshness. Replica lag (below) is the
  known gap.

**Tuning and deferred features:**

- The coalescing window: fixed or configurable.
- Infinite scroll with cursors: how a cursor list refetches after a change.
- Optimistic aggregates (`openCount` lags until success).
- Replica lag: an unversioned read started after a confirmed write can still return older data.
- Whether the `when` self-check should also run in production, as a diagnostic.
