# Entity-centric proposal (draft 8) — superseded

> **Superseded.** The chosen direction is `entity-proposal.md` (draft 7, operation-first). Its
> section 2.4 keeps this design's layout and namespace as code organisation over one vocabulary,
> and its section 17 records why. This file is kept for reference and is not maintained.


Status: a proposal, not decided. It is the entity-centric alternative to `entity-proposal.md` (the
operation-first proposal, draft 6), written to the same scope with the same features, use cases
and worked examples in the same section order. This file's earlier drafts: draft 4 grew a query
grammar for filtered admin lists; draft 5 replaced it with general facts per query; draft 6 revised
draft 5 after six reviews (section 17). Draft 7 applied the shared-runtime fixes from seven reviews
of the operation-first draft, which `entity-proposal.md` section 18 records. Draft 8 makes the
entity layer optional (section 1.2) and applies the line between machines and the store (section
1.3), which removes cross-entity optimistic writes.

It builds on `minimal-library.md` decisions 1–8a, which are agreed. **The runtime (the store,
ordering, repair, holding, deletes, persistence) is `entity-proposal.md` section 6, normative for
both proposals;** section 6 here lists only how this proposal's names map onto it. Section 13
lists every change to agreed decisions.

---

## 1. The idea

> **An entity is a record type the server owns. Next to it lives everything that involves it: how
> to load one record, the questions the server answers about it, the commands that change it, and
> the feeds that push it. Machines work with entities directly. Anything that involves no entity
> stays in the base layer: plain `resource`, `transaction` and `stream`.**

Two layers share one Runtime:

| Layer      | What it is                                                     | Used for                                   |
| ---------- | -------------------------------------------------------------- | ------------------------------------------ |
| **Base**   | `resource`, `transaction`, `stream` as in decisions 1–8a       | anything that involves no entity           |
| **Entity** | an `entity` and its `members`: `load`, `read`, `write`         | every read or write of an entity's records |

**The boundary.** An operation **involves** an entity when it writes, hides or depends on that
entity's records in the store: its `result` contains the entity or a pick of it, its optimistic
operations name it, its `depends` or `affects` name it, or its stream carries it. Such an operation
lives on the entity's members; a base operation that involves an entity is a `flow check` error.

**When to declare an entity.** A record has a stable key, and it either appears in more than one
answer or is changed by a command and shown elsewhere. The current user is always an entity
(`User`), never a special singleton or a base result, so their avatar stays coherent wherever it is
embedded.

**What the runtime promises:**

1. **Entity coherence.** Every cached copy of a record shows the same fields in the same
   publication, whoever wrote them, including optimistic changes.
2. **Result validity.** When a change settles, every answer it could affect is repaired, including
   answers that do not contain the record yet. With a stable server and **correct declarations**,
   every answer ends up as the server would return it. The declarations that can be wrong are
   `when`, `ignoreChanges`, `place`, `depends`, `affects`, and the choice of layer; section 10.2
   lists what catches each.

Machines read **local** data, which can include optimistic values the server has not returned.
Local observation and remote confirmation stay distinct. There is no local query language.

### 1.1 Ownership

| Concern                                           | Owner                                           |
| ------------------------------------------------- | ----------------------------------------------- |
| Which records belong in a list, search or count   | the server, through queries                     |
| A record's fields agreeing everywhere             | the runtime (the entity store)                  |
| Which changes can affect an answer                | the query (`when`, `ignoreChanges`, `depends`)  |
| What a command changes                            | the command (`result`, `optimistic`, `affects`) |
| Drafts, transitions, timing, what a failure means | machines                                        |
| Work that involves no entity                      | base operations driven by machines              |

### 1.2 Optional, one entity at a time

The entity layer is an extension of the core library, imported from `flow-state/entities`, as in
the operation-first proposal's section 1.2:

- **An app with no entity is `minimal-library.md` exactly:** the base layer, with decision 6's
  call-site `optimistic` and `writes`. No entity store exists.
- **Adoption is per entity.** Declaring `Note` moves the operations that involve notes into
  `Note.members`; `Settings` can stay in the base layer.
- **Adopting renames.** `ticketList` becomes `Tickets.list` and every machine's
  `O.ticketList.subscribe` becomes `O.Tickets.list.subscribe`, and the definitions change from
  `operations` to `entities`. The layer rule then forbids the old base forms, so adoption is a
  refactor of every feature that touches the record. This is the main cost of optionality in this
  design.
- **One form per piece of data.** A call-site `setData`, `invalidate` or `clear` on a base resource
  that holds an entity is already an error (the layer rule).
- **When to adopt.** `flow check` hints when two base resources return records with the same key
  fields.

### 1.3 Machines coordinate; the store keeps copies true

As the operation-first proposal's section 1.3: machines decide what happens next; the store only
answers "is my copy still what the server would say?". The store never starts a command, sends an
event other than its lane outcomes, chooses a state, or reads one entity to change another.
Machines never maintain copies or refetch what a query's `when` and `depends` already repair. An
optimistic operation therefore changes only the records its command acts on (section 5.1); a
folder's note count is a query that depends on `Note` and refetches when a move settles.

### 1.4 Not a version 1 target

Offline-first operation. It needs a persisted operation queue, record-level persistence and
server-key creates with re-keying (section 14). Version 1 keeps the door open but does not claim
it.

---

## 2. Identity: `entity`

```ts
// notes/note.entity.ts
export const Note = entity({
  id: "notes/Note",
  fields: {
    noteId: Schema.String,
    workspaceId: Schema.String,
    folderId: Schema.String,
    title: Schema.String,
    body: Schema.String,
    pinned: Schema.Boolean,
    author: User.pick("name", "avatarUrl"), // a nested entity
    createdAt: Schema.String,
    revision: Schema.Number,
  },
  primaryKey: ["noteId"],
  version: "revision", // optional
});

export const NoteRow = Note.pick("folderId", "title", "pinned", "createdAt");
```

The identity rules are the operation-first proposal's section 2, unchanged:

- **`id`** is stable; duplicates are a static error. **`fields`** is the full record (D45), and a
  field means one thing (an excerpt of `body` is a separate `bodyPreview`).
- **`primaryKey`** lists immutable top-level primitive fields; `Note.Key` is the key Schema;
  `Note.keyOf` and `Note.keyString` extract and encode keys. Choose keys that never change.
  `primaryKey: []` declares a singleton.
- **`version`** names a field the server changes on every update (a number, or a fixed-width
  string). Every pick includes it automatically.
- **Shapes:** `Note.pick(...)` carries the identity. A struct copying the key fields, or a rebuilt
  pick, is a `flow check` error; a struct sharing two or more fields with an entity is a warning;
  `Note.detached(NoteRow)` is a deliberate plain copy.
- **Nested entities** stay coherent; a nested field change refetches nothing on its own; a nested
  delete forces repair of the parents' answers. Nesting is one way; trees use a `parentId` field.

**`entity` declares identity only.** Its members are declared separately (section 2.2), so two
entities can refer to each other without an import cycle.

### 2.1 Where entities are found

Definitions list the entity members they use (section 7.1), and nested picks reach the rest. The
closed universe stays "the app lists machines".

### 2.2 Members: `Note.members`

```ts
// notes/notes.ts
export const Notes = Note.members({
  load: { … },                                                   // section 3
  read: {
    inFolder: Note.query({ … }),
    pinnedCount: Note.query({ … }),
  },
  write: {
    rename: Note.command({ … }),
    move: Note.command({ … }),
    remove: Note.command({ … }),
  },
});
```

- **`Note`** is the identity: keys, picks, patches, passive reads. **`Notes`** is the members hub
  that machines use: `O.Notes.inFolder.subscribe`, `O.Notes.rename.commit`, `O.Notes.watch`.
- **Members import identities only, never other members.** This is what makes cross-entity
  commands and queries type-check (the spike's TS7022 cycle disappears), and it avoids TDZ errors
  at runtime. `flow check` errors on a members module importing another members module.
- **`read` holds queries and feeds; `write` holds commands.** The slot says the direction to the
  reader; the builder says the kind to the type system. A builder in the wrong slot is a type
  error.
- **Member names** are unique across `read` and `write`; `watch`, `refetch` and `invalidate` are
  reserved. Member ids are derived: `notes/Note.inFolder`.

---

## 3. `load`: one record by key

```ts
load: {
  lookup: (key, { signal }) => NotesApi.use((api) => api.get(key, signal)),
  notFound: ["NoteNotFound"],
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  persist: true,
},
```

- **Optional.** An entity without `load` (a chat message, an audit entry) is seen only through
  queries and feeds.
- **`lookup`** returns the full record; its key input is `Note.Key`.
- **`notFound`** lists failure tags that mean the record **no longer exists**. Such a failure
  deletes the record everywhere, never while the record is being created (shared runtime, 6.6).
- **`staleTime`, `gcTime`** are required (D32); **`persist`** is optional, as for resources.
- **The current user** (`GET /me`, no key input) is a `User` query. The session machine keeps
  `userKey` in memory from it, and views watch `User` by that key.

### 3.1 `watch`: a machine works with one record

```ts
activities: {
  note: O.Notes.watch(({ memory }) => memory.noteKey, {
    outcomes: { value: E.NoteLoaded.from((n) => ({ title: n.title })) },
  }),
  row: O.Notes.watch(({ memory }) => memory.noteKey, { shape: NoteRow }),
},
```

`O.Notes.watch(key, { shape?, outcomes? })` exists only on members with `load`. Without `load` it
is a type error whose message says the entity has no `load`, so a watch can never wait forever.

- **Store first.** The lane is `Success` at once when the store holds every field of `shape`
  (default: the full record), none of them is held or stale (shared runtime, 6.5), and each landed
  within `load.staleTime` on the Runtime clock. Otherwise `load` runs; meanwhile the lane is
  `Pending`, or `Refreshing` with data (the Resources plan's lane union).
- **One load per key.** Watches of one key, in any actor and any shape, share one load entry.
- **A narrow shape is the placeholder from the store.** Opening a note from its folder, `row`
  resolves at once from the list's copy while `note` loads the body. The activity option
  `placeholder` (decision 8) stays for a different case: keeping the previous key's data while the
  key changes.
- **`pending`** is on the lane, as in 8a (section 7.3).
- **Holding.** An active watch holds the record; after it ends, the load entry's `gcTime` applies.
- **`value`** fires on the first `Success` (including a store-first one) and whenever the record's
  **base** changes in the watched shape. It never fires for optimistic changes or their rollback,
  and its payload is the base projection.
- **`deleted`** (an outcome member added to the D30 container for watches) fires once a delete is
  confirmed. Until then, and during an undo window, the lane is `Failure` with the built-in
  `Deleted { key, confirmed }`.
- **`O.Notes.refetch(keyFn)`** reloads one record: "I am unsure, ask the server".

---

## 4. Queries: questions the server answers about an entity

A query is a resource homed on the entity. It keeps every resource field and action, and adds the
facts the runtime needs for repair.

```ts
inFolder: Note.query({
  key: (input: { folderId: string }) => input,
  lookup: (input, { signal }) => NotesApi.use((api) => api.list(input, signal)),
  result: Schema.Struct({ notes: Schema.Array(NoteRow), total: Schema.Number }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  when: (note, input) => note.folderId === input.folderId,
  // the server sorts by pinned, then createdAt
  ignoreChanges: ["title", "body", "author", "revision"],
}),

pinnedCount: Note.query({
  key: () => ({}),
  lookup: (_input, { signal }) => NotesApi.use((api) => api.pinnedCount(signal)),
  result: Schema.Struct({ count: Schema.Number }), // holds no notes, but counts them
  staleTime: "1 minute",
  gcTime: "5 minutes",
  when: (note) => note.pinned,
  // no ignoreChanges: any change to a pinned note refetches the count; correct, slightly chatty
}),
```

**Kept from resources:** `key` (with D25's partial-input `refetch`), `lookup`, `result`,
`staleTime`, `gcTime`, `persist`; the machine actions `subscribe` and `refetch`; the activity
option `placeholder`.

**There is one kind of query.** A list, a search, a page, a count, a grouping and a summary differ
only in their `result` Schema. `load` is the one record; everything else is a question. A query on
`Note` always depends on `Note`: there is no way to forget it.

### 4.1 `when`: which records can be in this answer

`when(record, input)` is true for every record that can appear in, or count toward, the answer.
It sits beside `key` on the query, so its `input` is typed directly (the spike showed the nested
`Note.changes({ when })` form cannot be typed; the inline form can).

- **Typed by the answer.** Its first parameter has the fields the answer holds for the home entity
  (key and version fields included), or the full record when the answer holds none. Reading a
  field the answer does not hold is a type error, so `NoteRow` includes `folderId`.
- **Broader is safe, narrower is a bug.** A broader `when` costs refetches; a narrower one hides
  real records.
- **The self-check** (`WhenViolated`, in all environments) tests every home-entity record a lookup
  returns against `when`, on the response's own values. A record that arrived violating `when` is
  not hidden in that entry until a later lookup returns it satisfying `when`, or omits it.
- **Omitted** means every record of the entity can matter.

### 4.2 `ignoreChanges`: field changes that cannot move this answer

`ignoreChanges` lists the home entity's fields whose change cannot alter the answer beyond what
coherence and hiding already show. A change to an ignored field updates the record in place, and
refetches only if it makes the record enter or leave the answer.

- **Safe direction.** Omitted means no field is ignored. Forgetting a field costs a refetch; it
  never leaves a stale screen.
- **What to list:** fields that are only displayed, and fields that matter only by deciding
  membership through `when` (a live map lists `lat` and `lng`). Never a field the server sorts or
  groups by, nor one that feeds a context field such as `total`. List the version field unless the
  answer sorts by it.
- The type restricts names to the entity's fields.

### 4.3 `refresh: "manual"`, leaving and entering

- **`refresh: "manual"`** is for answers that must not move under the user (a ranked feed, search
  results being read): changes only mark the entry stale; it refetches on the machine's `refetch`
  or its next subscription. Coherence, hiding and `place` still apply; the repair audit skips it.
- **Leaving** is immediate: a home-entity record whose visible value fails `when` is hidden from
  every array position at once. A single nullable position becomes `null`; a required single
  position gets a forced repair instead.
- **Entering** waits for the repair refetch, or uses `place`.
- **Context fields** (`total`, highlights, ranks) become valid at the refetch.
- **Selectors** may sort, group and filter for presentation; they never re-implement a server's
  membership rule.

### 4.4 Other entity types in a query

A query may contain other entities' picks, nested (`author`), as their own lists, or in a union
array (a file manager's files and folders). Their fields stay coherent. A change to another type
refetches the query only through `depends`:

```ts
depends: (on) => [
  on(Folder, { when: (folder, input) => folder.workspaceId === input.workspaceId,
               ignoreChanges: ["color"] }),
],
```

`depends` is a function for the same typing reason as `optimistic`. An entry for the home entity is
an error: its `when` and `ignoreChanges` already say it. `flow check` errors when a query holds
another entity type outside a nested pick without an `on` entry for it, unless the position is
marked `Folder.detached(...)`.

### 4.5 `place`: entering without waiting

```ts
place: "start", // the server returns newest first
```

- The constant `"start"` or `"end"`, on queries whose result holds exactly one bare array of the
  home entity (static check).
- It applies when a home-entity record enters, from an optimistic insert, a command result or a
  feed upsert carrying every field the answer's shape needs.
- A placement is an overlay on the entry that survives lookups started before the change. It never
  suppresses the entering refetch, so a wrong `place` is a flicker, not a lasting error.

### 4.6 Pages

As the operation-first proposal's section 4.8: a shared resource change, decided separately.
`pages: { next, repair: "first" | "loaded" }`; `O.Messages.inChannel.fetchMore(inputFn)`; pages
extend at the end; a record appears once; a repair supersedes a `fetchMore` in flight;
`place: "start"` inserts into the first page, `"end"` only into a last page with no `next`.

---

## 5. Commands: what changes an entity

A command is a `transaction` homed on the entity. Every transaction field and behaviour applies:
`commit`, `concurrency` (required, D31), outcomes, `unknown`, `attempt.id`, `cancel`, `delay` and
`progress`.

```ts
write: {
  rename: Note.command({
    input: { key: Note.Key, title: Schema.String },
    key: (input) => input.key,
    commit: ({ key, title }, { signal, attempt }) =>
      NotesApi.use((api) => api.rename(key, title, { signal, attempt })),
    result: Note,
    optimistic: (input) => [Note.patch(input.key, () => ({ title: input.title }))],
    concurrency: "serialize",
  }),

  move: Note.command({
    input: { key: Note.Key, from: Folder.Key, to: Folder.Key },
    key: (input) => input.key,
    commit: …,
    result: Note,
    optimistic: (input) => [Note.patch(input.key, () => ({ folderId: input.to.folderId }))],
    // folder counts are not guessed: they depend on Note and refetch when the move settles
    concurrency: "serialize",
  }),

  togglePin: Note.command({
    input: { key: Note.Key },
    key: (input) => input.key,
    commit: …,
    result: Note,
    optimistic: (input) => [Note.patch(input.key, (note) => ({ pinned: !note.pinned }))],
    concurrency: "serialize",
  }),

  remove: Note.command({
    input: { key: Note.Key },
    key: (input) => input.key,
    commit: …,
    optimistic: (input) => [Note.remove(input.key)],
    concurrency: "serialize",
  }),

  create: Note.command({
    input: { note: Note.pick("noteId", "folderId", "title", "createdAt") },
    key: (input) => Note.keyOf(input.note),
    commit: …,
    result: Note,
    optimistic: (input) => [Note.insert({ ...input.note, body: "", pinned: false, … })],
    concurrency: "allow",
  }),
},
```

- **`input`** is a Schema field record, required on commands. This narrows D46 for commands only.
- **`key`** is the concurrency key. A bulk command keys on its scope, not on its first record.
- **`result`** is any Schema; every entity record in the response is written to the store.
- **A command must change something.** One with no `result`, no `optimistic` and no `affects`
  involves no entity, so it is a base `transaction` (`flow check` error).
- **A command lives on the entity it acts on**, the one whose records its optimistic operations
  touch, or whose key its `key` returns (`move` keys on the note, so it is `Notes.move`). A
  scope-keyed bulk command lives on the entity it patches. The rule is checked. Other entities it
  changes as a consequence appear only in `result` or `affects`.

### 5.1 Optimistic operations and what a command affects

The rules are the operation-first proposal's sections 5.1–5.3, unchanged:

- `optimistic: (input) => [...]` returns a fixed list of `Note.patch(keys, fn)`,
  `Note.upsert(record)`, `Note.remove(keys)` and `Note.insert(record)` on **the home entity only**,
  at keys taken from the input; `keys` is one key or an array. A patch reads only its own record.
  The list's kinds are recorded at construction by a probe (the one O1 exception); a different
  list at runtime is a defect.
- Operations apply when the commit starts (decision 6): at once, when a `serialize`d commit leaves
  its queue, or at admission for a `delay`ed commit.
- Ids and timestamps arrive in the event payload, minted by the UI; Stories pass them explicitly.
  `flow check` flags impurity in optimistic and commit input functions.
- Creates with a client key use `insert`; an `unknown` create's retry replaces the earlier
  attempt's operation; any other `insert` of a held key is a defect (use `upsert`).
- `affects: (input) => [Folder.keys(input.folder), AuditEntry.all]` names what results and
  optimistic operations do not. Changed fields decide `ignoreChanges`; an `affects` target, a
  failure, a defect or an `unknown` changes every field.

### 5.2 How a command ends

As the operation-first proposal's section 5.4: success promotes only the fields the response
carries, and other patched fields stay **held** and force repair; failures and defects remove the
operations and repair the affected keys; `unknown` keeps the operations until the forced repair
lands, then shows the server's data, while the attempt stays unresolved for the machine.

### 5.3 Concurrency across actors

Concurrency stays actor-local and exact-key (Transactions D1). With a `version`, the higher version
wins in every copy; without one, the field is contested and a forced repair reads the server's
answer. When edits must queue, use one shared actor per record.

---

## 6. The store

The store is `entity-proposal.md` section 6, normative for both proposals: records with base and
visible values; one write path; ordering by strictly greater versions, then start revisions;
contested fields; `FieldDisagrees` and `ContestLoop`; ordinary and forced repair; coalescing per
drain; the in-flight fence; holding; one stale floor per entity; held fields; feed writes to unheld
keys; deletes and tombstones; persistence of base data only.

How this proposal's names map onto it:

| Section 6 says              | Here                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| loader entry                | the `load` entry of an entity's members                           |
| loader subscription         | `O.Notes.watch(...)`                                              |
| an `on(E, …)` entry         | a query on `E` (its own `when`, `ignoreChanges`, `place`), or an `on` entry in another entity's query's `depends` |
| a stream with `feeds`       | a feed on an entity's members                                     |
| `invalidate(Note.all)`      | `O.Notes.invalidate()`                                            |

---

## 7. Machines and definitions

### 7.1 Definitions list members

```ts
export const Editor = definition({
  id: "notes/Editor",
  entities: { Notes, Folders }, // reached as O.Notes.<member>, O.Folders.<member>
  operations: { heartbeat },    // base operations, as today
  memory: {
    noteKey: Note.Key,
    draft: Schema.String,
    submitted: Schema.String,
    dirty: Schema.Boolean,
    changedElsewhere: Schema.Boolean,
  },
  …
});
```

`O.Notes` offers:

- `watch` and `refetch`, when `load` exists;
- `invalidate()`: raises `Note`'s stale floor, so every answer and load entry holding notes
  refetches, as after a permission change;
- `<query>.subscribe`, `.refetch` and `.fetchMore`;
- `<feed>.subscribe`;
- `<command>.commit`, `.cancel` and `.settle`.

**Changed (decision 6):** for entity commands, the call site carries only outcomes and timing
(`delay`). `optimistic` moves to the command; `result`, `affects` and `depends` replace `writes`.
Base transactions keep decision 6 unchanged, including `writes` on base resources.

### 7.2 Memory holds keys and drafts

- `flow check` errors on memory whose Schema contains an entity shape. Keys are `Note.Key`.
- A draft records whether it is `dirty` and what was last `submitted`. A `value` outcome replaces
  the draft only when it is clean, and is not a conflict when it carries what this machine
  submitted.
- Refs and inputs use keys; context exposes keys and primitives, never records.

### 7.3 Reading in views and guards

```ts
Note.get(source, key, NoteRow) // { data, pending } | undefined: 8a's entry type; starts nothing
```

`source` is a snapshot. `pending` is true while an
optimistic or held overlay awaits settlement, or an `unknown` overlay waits for its repair. A
snapshot carries the store revision it was published with (section 13.1). `flow check` warns when a
machine's guards or the components that render its snapshot `get` an entity that none of its
activities hold.

### 7.4 Records referenced by key

In order of preference: the server embeds a pick; a query on the other entity returns the records
(`Users.byIds`); `User.get(s, key, UserChip)` when an activity of the same machine holds them.

---

## 8. Feeds: records pushed by the server

```ts
live: Note.feed({
  key: (input: { workspaceId: string }) => input,
  subscribe: (input) => NotesApi.use((api) => api.changes(input)),
  carries: [Note, Folder.pick("name", "noteCount")], // the entities and fields each change carries
  gcTime: "1 minute",
}),
```

- A feed emits batches of `EntityChange.Upsert(entity, fields)`, `EntityChange.Delete(entity, key)`
  and `EntityChange.Confirm(attemptId)`, each batch applied in one turn. **`carries`** lists one or
  several entities; a multiplexed feed lives on the members of the first entity it carries.
- Each change is a write; a write to a key nothing holds follows the shared runtime's section 6.5.
- First connect and every reconnect raise the stale floor of each carried entity.
- The feed's lane `data` is `undefined`; machines react to records through `watch` and query
  `value` outcomes.
- A base `stream` whose emitted Schema contains an entity pick is a `flow check` error (it involves
  an entity).

**Device-owned or ephemeral streams** (the user's own location, typing, presence, a CRDT session,
toasts) stay base `stream`s mapped to events.

---

## 9. The base layer

Unchanged from decisions 1–8a. Many parts of real apps have no entity.

| Need                                  | Base form                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| keep-alive heartbeat                  | a `transaction` with `concurrency: "reject"`, sent by a schedule             |
| refresh an auth token                 | a schedule and a `transaction`; the token lives in a provider actor          |
| analytics events                      | a fire-and-forget `transaction`                                              |
| feature flags, app config             | a `resource` read by one provider actor, exposed through context             |
| reports and dashboards over no entity | `resource`s                                                                  |
| poll a job until it finishes          | a schedule sends `PollDue`; the action is `O.job.refetch`; `value` moves on  |
| upload bytes to a signed URL          | a `transaction` with `progress`; the record it creates comes from a command  |
| presence, typing, own location        | a `stream` mapped to events                                                  |
| a collaborative document body         | a `stream` to the sync provider, owned by a document actor                   |

**Crossing the boundary.** A job whose completion changes records ends with an entity action: the
machine's `JobFinished` handler runs `O.Notes.invalidate()`, or the job is started by a command
with `affects: () => [Note.all]`.

**The hole the layer rule cannot close.** A base resource that counts notes without holding any
(`{ count: number }`) names no entity, so the layer check cannot see it. It never repairs; only the
repair audit catches it. The rule for agents (a question about notes is a query on `Note`) is the
mitigation.

---

## 10. Stories and tools

### 10.1 Stories

- **Stateful fixtures** act as small in-memory servers. Slow and failing responses, and feed
  changes, are fixtures scripted on the Runtime clock, so `advance` delivers them at an exact step.
  No new Story command is needed.
- **Assertions:** `Note.get(checkpoint.snapshot, key, Shape)` and the trace's refetch records.
- **Checkpoints** include the store revision they were published with.

### 10.2 What catches a wrong declaration

| Wrong declaration                                 | Caught by                                                 |
| ------------------------------------------------- | --------------------------------------------------------- |
| `when` reads a field the answer lacks             | the type system                                           |
| `when` narrower than the server                   | `WhenViolated` on every lookup, in all environments       |
| `ignoreChanges` names a field the server sorts by | the repair audit                                          |
| a wrong `place`                                   | self-correcting at the entering refetch; the repair audit |
| a missing `on` entry for another held type        | `flow check` error                                        |
| a count written as a query on `Note`              | cannot forget its dependency                              |
| a count written as a base resource                | the repair audit only                                     |
| a command that changes nothing                    | `flow check` error                                        |
| a base transaction that should have been a command | the repair audit only                                    |
| a missing `affects` key                           | the repair audit                                          |
| an entity copied as a plain struct                | `flow check` error, or warning for a partial copy         |
| two endpoints disagreeing on a field              | `FieldDisagrees`                                          |

### 10.3 The repair audit

As the operation-first proposal's section 10.3: it refetches every active answer against the
stateful fixture on a fork of the store at the end of a Story; `RepairMissed`, `AuditSkipped`,
`FixtureInert` and `RepairUnaudited` report what it finds; it checks declarations against the
author's own idea of the server.

### 10.4 `flow graph`

Entities are hubs. Edges: machine → member (watches, subscribes, commits, invalidates); query →
entity (contains, depends); command → entity (changes, from the recorded optimistic sequence and
the result Schema; affects); feed → entity; derived actor-level edges.

### 10.5 `flow check`

| Rule                                                                    | Level   |
| ----------------------------------------------------------------------- | ------- |
| a base operation involves an entity                                     | error   |
| a members module imports another members module                         | error   |
| a struct with an entity's key fields that is not a pick; a rebuilt pick | error   |
| a struct sharing two or more fields with an entity                      | warning |
| memory holds an entity shape                                            | error   |
| impurity in optimistic or commit input functions                        | error   |
| an entity command with no `result`, `optimistic` or `affects`           | error   |
| a command not on the members of the entity it acts on                   | error   |
| optimistic operations on an entity other than the command's home        | error   |
| a handler refetching an answer that a query's `when` or `depends` repairs | warning |
| two base resources returning the same key fields                        | warning |
| an `on` entry for the query's home entity                               | error   |
| another entity type held outside a nested pick without an `on` entry    | error   |
| `place` on a result without exactly one bare array of the home entity   | error   |
| `notFound` tags absent from the lookup's failure Schema                 | error   |
| an entity cycle through nested picks; duplicate entity ids              | error   |
| a command `key` indexing into an input array                            | warning |
| a `watch` without a handler for `Deleted` or a `notFound` tag           | warning |
| `get` on an entity no activity of the machine holds                     | warning |
| a query or command no audited Story runs (`RepairUnaudited`)            | warning |

### 10.6 Traces

As the operation-first proposal's section 10.6: every branch of repair is a traced decision,
including suppressed repairs and why, and all of it reaches `attachInspector` in production.

---

## 11. Worked examples

### 11.1 Many machines, one entity

```ts
// The folder list
OPEN: {
  activities: {
    notes: O.Notes.inFolder.subscribe(({ memory }) => ({ folderId: memory.folderId })),
  },
  on: {
    PinClicked: {
      target: "self",
      actions: [O.Notes.togglePin.commit(({ event }) => ({ key: event.key }),
        { outcomes: { failure: { PinRejected: E.PinFailed } } })],
    },
  },
}

// The badge
activities: { pinned: O.Notes.pinnedCount.subscribe(() => ({})) }

// The editor. NoteLoaded is an internal event; PinFailed, Saved and SaveUncertain carry no payload.
OPEN: {
  activities: {
    note: O.Notes.watch(({ memory }) => memory.noteKey, {
      outcomes: { value: E.NoteLoaded.from((n) => ({ title: n.title })) },
    }),
  },
  on: {
    NoteLoaded: {
      target: "self",
      updateMemory: ({ memory, event }) =>
        !memory.dirty
          ? { draft: event.title }
          : event.title === memory.draft || event.title === memory.submitted
            ? {}
            : { changedElsewhere: true },
    },
    TitleChanged: {
      target: "self",
      updateMemory: ({ event }) => ({ draft: event.title, dirty: true }),
    },
    SaveRequested: {
      target: S.OPEN.SAVING,
      updateMemory: ({ memory }) => ({ submitted: memory.draft }),
      actions: [
        O.Notes.rename.commit(({ memory }) => ({ key: memory.noteKey, title: memory.draft }), {
          outcomes: { success: E.Saved, unknown: E.SaveUncertain },
        }),
      ],
    },
    Saved: {
      target: "self",
      updateMemory: ({ memory }) => ({ dirty: memory.draft !== memory.submitted }),
    },
  },
}
```

The events table is the operation-first proposal's section 11.1, with the same results: renames
patch every copy and refetch only the count when the note is pinned; pins refetch the list and the
count; moves leave at once and enter at the refetch, and both folders' counts refetch when the move
settles; a second dirty editor sets `changedElsewhere`; its own save is not a conflict; the higher
`revision` wins concurrent renames; an `unknown` save shows the guess until its forced repair; a
deleted note drops from every list and the editor sees `Deleted`.

### 11.2 Many entities together: a board

```ts
onBoard: Card.query({
  key: (input: { boardId: string }) => input,
  lookup: …,
  result: Schema.Struct({ cards: Schema.Array(CardTile) }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  when: (card, input) => card.boardId === input.boardId,
  // the view groups by columnId and sorts by position
  ignoreChanges: ["columnId", "position", "title", "assignee", "revision"],
}),

moveCard: Card.command({
  input: { key: Card.Key, columnId: Schema.String, position: Schema.String },
  key: (input) => input.key,
  commit: …,
  result: Card,
  optimistic: (i) => [Card.patch(i.key, () => ({ columnId: i.columnId, position: i.position }))],
  concurrency: "serialize",
}),
```

Dragging patches one record and refetches nothing; renaming a user updates every card's avatar;
deleting a column is `Columns.remove` with `affects: () => [Card.all]`.

### 11.3 Other applications

| App               | Entities                               | Notable use                                                            |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Chat              | `Channel`, `Message`, `User`           | `Messages.inChannel` with `pages` (`repair: "first"`) and `place: "start"`; a multiplexed feed; sends `insert` |
| Social feed       | `Post`, `User`                         | `Posts.home` with `refresh: "manual"` and a "new posts" refetch        |
| Storefront        | `Product`, `Cart` (singleton), `Order` | `Carts.addLine` returns the cart; `Carts.shippingQuote` is a query on `Cart`; `OutOfStock` repairs the cart |
| Banking           | `Account`, `Txn`, `Payee`              | `Accounts.transfer` patches both balances and `affects: () => [Txn.all]` |
| E-mail            | `Thread`, `Label`, `Contact`           | `Threads.archive` patches the thread's `labelIds`; `Threads.unreadCounts` repairs on settle |
| Calendar          | `Event`, `Occurrence`                  | range queries that ignore `start` and `end`; series edits `affects: () => [Occurrence.all]` |
| Spreadsheet       | `Sheet`, `Cell`                        | a cell edit is `Cell.upsert`                                           |
| Settings, profile | `Settings` (singleton), `User`         | `O.Settings.watch(() => ({}))`; one command per section                |
| Admin back-office | `User`, `Role`, `AuditEntry`           | filtered queries; bulk commands keyed by scope; `AuditEntry` has no `load` |
| Maps, IoT         | `Driver`, `Device`, `Trip`             | `Drivers.near` ignores `lat`/`lng`; the feed places entering drivers   |
| File manager      | `Folder`, `File`                       | children as a union array, homed on `Folder` with an `on(File, …)` entry |
| Global search     | `Note`, `Folder`, `User`               | homed on one entity, `depends` for the other two                       |
| Analytics         | none                                   | base resources only                                                    |

---

## 12. Naming

- **`entity` and `members`:** identity and operations are two declarations, as `definition` and
  `machine` are. `Note` names one record; `Notes` names what you can do with them.
- **`load`, `read`, `write`:** one way to load a record by key; queries and feeds; commands.
- **`query`, `command`, `feed`:** resources, transactions and streams homed on an entity. They keep
  the base layer's fields, so nothing is learnt twice.
- **`watch`:** a subscription to the record itself, distinct from subscribing to a question.
- **`carries`:** the entities a feed's changes carry.
- The shared names (`result`, `ignoreChanges`, `refresh`, `place`, `on`, `affects`, `primaryKey`)
  follow the operation-first proposal's section 12.

---

## 13. Changes to agreed decisions

The operation-first proposal's section 13 applies, with these differences:

| Agreed                                     | Here                                                       |
| ------------------------------------------ | ---------------------------------------------------------- |
| D46 Schemas only at boundaries             | `input` required on entity commands only                   |
| definitions list operations                | definitions also list entity members (`entities`)          |
| the public surface                         | adds `members`, `query`, `command`, `feed`, `load`, `watch`, `carries` |
| adopting an entity in an existing app      | renames its operations and every machine call site (section 1.2) |
| `flow check` rule set                      | adds the layer, home and members-import rules (10.5)       |

---

## 14. Version 2

As the operation-first proposal's section 14, plus: `watch` over arrays of keys with a batched
`load`, and `watch` on feed-only records (a lobby roster).

## 15. Rules for agents

1. Start without entities. Declare one when the same server record shows in more than one place or
   changes under a command shown elsewhere, including the current user. Build every result that
   carries it from the entity or its picks.
2. If an operation involves an entity, it lives on that entity's members; a command lives on the
   members of the entity its `key` names. A question about notes, including a count, is a query on
   `Note`. Everything else is a plain `resource`, `transaction` or `stream`.
3. A query says which records can be in it (`when`). List in `ignoreChanges` only fields that are
   purely displayed or only decide membership; when unsure, leave a field out.
4. A command says what it changes: `result`, `optimistic` and `affects`. Its optimistic operations
   touch only the records it acts on. Ids and times arrive in the event payload.
5. Machines decide; the store keeps copies true. Machines hold keys and drafts, never copies, and
   never refetch what a query repairs. Selectors may sort, group and filter for presentation; they
   never re-implement a server's membership rule.
6. Every query and command runs in a Story with a stateful fixture, so the repair audit checks it.

## 16. Open questions

- **The optimistic probe and O1**, **the snapshot revision**, **the convergence proof** and **hiding
  by `when` in production**: as the operation-first proposal's section 16.
- **Two declarations per entity.** `Note` and `Notes` cost one more name per entity in exchange for
  cycle-free modules.
- **The base-resource count hole** (section 9). Should base resources be forbidden from returning
  shapes that look like aggregates of an entity, or is the agent rule enough?
- **Import path.** Whether the entity layer is `flow-state/entities`.

## 17. Review record

**Draft 6** applied six reviews of draft 5: feed writes to unheld keys; contested fields; placement
overlays; held fields; nested deletes; `refetchOn` inverted to `ignoreChanges`; the no-op command
error; strict versions; every failure repairs; `optimistic` as a function and `entity` plus
`members` (from the type spike); `pending` kept; the decision 6 reversal declared; and others. It
rejected collapsing into the operation-first design, cutting `insert` and `place`, deferring
`ignoreChanges`, and data forms for `when`.

**Draft 8** (after discussion with the user, no new reviews): the entity layer is optional and
adopted per entity, with its renaming cost stated (1.2); machines coordinate and the store only
keeps copies true (1.3); optimistic operations touch only the home entity, without a store
accessor (5.1); cross-entity count guesses are removed (5, 11).

**Draft 7** applied the shared-runtime fixes from seven reviews of the operation-first draft 4
(listed in `entity-proposal.md` section 18, marked ✱) and these points specific to this proposal:

| Finding                                                              | Change                                      |
| -------------------------------------------------------------------- | ------------------------------------------- |
| `depends: [Folder.changes({ when })]` and `affects: [E.keys((i) => …)]` cannot be typed | `(on) => [...]`, `(input) => [...]` |
| section 6 was not literally the shared runtime                        | replaced by a pointer and a name map        |
| "a count cannot forget its dependency" was overstated                | the base-resource hole is stated, 9 and 10.2 |
| a base stream carrying entities was unchecked                        | `flow check` error, 8                       |
| a multiplexed feed had no form                                       | `carries`, homed on the first entity        |
| a members module importing another was unchecked                     | `flow check` error, 2.2                     |
