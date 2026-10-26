# Entity coordinator (draft 1): an extension to the entity proposal

Status: a proposal, not decided. It extends `entity-proposal.md` (draft 7). The entity proposal
puts coordination policy on the operations themselves: `depends` on resources, `optimistic` and
`affects` on transactions, `loads` and `feeds` as markers. This proposal moves all of that policy
to one owner per data domain, the **coordinator**, and keeps operations exactly as in
`minimal-library.md` decisions 1–8a. The entity proposal's identity (section 2) and runtime
(section 6) stay, with the changes in section 9.

It is measured against `entities.md` (goals and correctness). Code is illustrative. Names
(`domain`, `load`, `answer`, `change`, `feed`) are placeholders.

---

## 1. What needs coordinating

The client holds copies of server state. Seven problems follow:

| #  | Problem                                                          | Owner         |
| -- | ---------------------------------------------------------------- | ------------- |
| P1 | copies of one fact agree                                         | the runtime   |
| P2 | after a server change, which cached answers are wrong            | **a policy**  |
| P3 | late responses must not overwrite newer truth                    | the runtime   |
| P4 | speculative results, retracted on failure, honest on `unknown`   | **a policy**  |
| P5 | several writers on the same record                               | **a policy**  |
| P6 | what to keep and when to drop it                                 | the runtime   |
| P7 | what the app does about a change                                 | the machine   |

P1, P3 and P6 are mechanical. P7 is workflow. P2, P4 and P5 are policies about shared data. In the
entity proposal they are scattered: P2 on readers (`depends`), P4 on writers (`optimistic`), P5 on
each actor (concurrency is actor-local). The runtime computes how they cross.

## 2. Why scattered policy is hard to make correct

Every guarantee in the scattered model rests on a **global** property: every reader of notes
declared its dependency correctly, and every writer declared its effects correctly. Nothing ever
looks at the whole. The rules meet pairwise, at runtime, when a write happens to settle while a
read happens to be active. Three consequences:

- **Completeness cannot be checked.** Nobody can list "every operation that touches notes",
  because any file can add one. A count that holds no notes is the visible symptom.
- **Interactions cannot be tested systematically.** The repair audit checks only the paths a
  hand-written Story happens to take.
- **Writers cannot be ordered across actors**, because no one owns the record. Versions and
  contested fields exist to cope with that.

A coordinator is worth adding only if it fixes these. Grouping operations under one name does not.

## 3. The coordinator

A coordinator owns a **domain**: the smallest set of entities whose rules reference each other.
Folder counts depend on notes, so `Note` and `Folder` form one domain. Its contract:

1. **Closed set.** It lists every operation that reads, writes or feeds its entities. Each such
   operation belongs to exactly one coordinator.
2. **Sole handle.** Machines reach those operations only through it (`O.Notes.rename`). Listing a
   registered operation directly in a definition is an error.
3. **Declarations only.** Membership predicates, ignored fields, placement, optimistic intent,
   effects on other domains and write ordering. Every function is pure over records and inputs; no
   callback sends, commits, reads another resource or chooses anything.
4. **Explicit boundaries.** Effects on another domain's data are declared edges to that domain.
   Inside its domain, the coordinator sees everything.
5. **Configured, not programmed.** Its behaviour is the runtime's fixed algorithm, configured by
   the declarations. It appears in inspection as a node with its own trace, but authors never write
   its logic. Machines remain the only programmed coordinators, of workflow.

Apps without shared records declare no coordinator and use operations as today.

### 3.1 The boundary: the client predicts, the server decides

No locally computed result is ever authoritative. Every client-side decision is a **prediction**
about a server answer: an optimistic field, a record hidden because it left a list, a record
placed because it entered one. Each prediction is held as an overlay over the server's last
answer. It has a cause, the write that made it or the feed change that arrived, and the server
confirms, retracts or corrects it.

This is the line between the coordinator and a client database such as TanStack DB. A client
database computes membership with local queries, so it needs complete data and a notion of
coverage. The coordinator never computes an answer; it only predicts changes to one the server
gave, and re-asks. A feature that would make a local result authoritative, such as a local query,
a local sort the server does not confirm, or an answer with no server lookup, is out of scope by
this rule.

---

## 4. Code

### 4.1 Entities: identity only

```ts
// notes/entities.ts
export const Folder = entity({
  id: "notes/Folder",
  fields: {
    folderId: Schema.String,
    workspaceId: Schema.String,
    name: Schema.String,
    noteCount: Schema.Number,
    revision: Schema.Number,
  },
  primaryKey: ["folderId"],
  version: "revision",
});

export const Note = entity({
  id: "notes/Note",
  fields: {
    noteId: Schema.String,
    folderId: Schema.String,
    title: Schema.String,
    body: Schema.String,
    pinned: Schema.Boolean,
    author: User.pick("name", "avatarUrl"),
    createdAt: Schema.String,
    revision: Schema.Number,
  },
  primaryKey: ["noteId"],
  version: "revision",
});

export const NoteRow = Note.pick("folderId", "title", "pinned", "createdAt");
```

### 4.2 Operations: decisions 1–8a, no coordination fields

```ts
// notes/operations.ts: how to talk to the server, nothing else
export const noteById = resource({
  id: "notes/note-by-id",
  key: (input: typeof Note.Key.Type) => input,
  lookup: (key, { signal }) => NotesApi.use((api) => api.get(key, signal)),
  result: Note,
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

export const notesInFolder = resource({
  id: "notes/notes-in-folder",
  key: (input: { folderId: string }) => input,
  lookup: (input, { signal }) => NotesApi.use((api) => api.list(input, signal)),
  result: Schema.Struct({ notes: Schema.Array(NoteRow), total: Schema.Number }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

export const pinnedNoteCount = resource({
  id: "notes/pinned-count",
  key: () => ({}),
  lookup: (_input, { signal }) => NotesApi.use((api) => api.pinnedCount(signal)), // holds no notes
  result: Schema.Struct({ count: Schema.Number }),
  staleTime: "1 minute",
  gcTime: "5 minutes",
});

export const foldersInWorkspace = resource({
  id: "notes/folders-in-workspace",
  key: (input: { workspaceId: string }) => input,
  lookup: …,
  result: Schema.Array(Folder),
  staleTime: "1 minute",
  gcTime: "5 minutes",
});

export const renameNote = transaction({
  id: "notes/rename",
  input: { key: Note.Key, title: Schema.String },
  key: (input) => input.key,
  commit: ({ key, title }, ctx) => NotesApi.use((api) => api.rename(key, title, ctx)),
  result: Note,
  concurrency: "serialize",
});

export const moveNote = transaction({
  id: "notes/move",
  input: { key: Note.Key, to: Folder.Key },
  key: (input) => input.key,
  commit: …,
  result: Note,
  concurrency: "serialize",
});

export const noteChanges = stream({
  id: "notes/changes",
  key: (input: { workspaceId: string }) => input,
  subscribe: (input) => NotesApi.use((api) => api.changes(input)),
});
```

### 4.3 The coordinator: every policy for the domain

```ts
// notes/domain.ts
export const NotesDomain = domain({
  id: "notes",
  entities: [Note, Folder],
  owns: [NotesApi], // every operation that requires NotesApi must be registered below

  reads: {
    noteById: load(noteById, Note),

    inFolder: answer(notesInFolder, {
      Note: {
        when: (note, input) => note.folderId === input.folderId, // typed from notesInFolder
        ignoreChanges: ["title", "body", "author", "revision"],
      },
    }),

    pinnedCount: answer(pinnedNoteCount, {
      Note: { when: (note) => note.pinned }, // the full record: the answer holds no notes
    }),

    folders: answer(foldersInWorkspace, {
      Folder: { when: (folder, input) => folder.workspaceId === input.workspaceId },
      Note: { ignoreChanges: ["title", "body", "pinned", "author", "revision"] }, // counts move
    }),
  },

  writes: {
    rename: change(renameNote, {
      optimistic: (input) => [Note.patch(input.key, () => ({ title: input.title }))],
      order: "perRecord", // queued per note across every actor
    }),
    move: change(moveNote, {
      optimistic: (input) => [Note.patch(input.key, () => ({ folderId: input.to.folderId }))],
      order: "perRecord",
    }),
  },

  feeds: {
    changes: feed(noteChanges, [Note, Folder]),
  },
});
```

- **`load(op, Entity)`** marks the loader: one per entity, store-first subscriptions with `shape`
  (entity proposal, section 3).
- **`answer(op, { Entity: { when?, ignoreChanges?, place?, refresh? } })`** declares membership
  per entity the answer holds or counts. An entity the answer holds but does not list is an error.
- **`place` needs an exact `when`.** Hiding is safe with a broader `when`: a record that no longer
  satisfies it cannot belong. Placing is not: a record that satisfies a broader `when` may not
  belong (a folder list that also filters by status would place an archived note). So an answer
  with `place` must have a `when` that is true exactly for the records the server would return.
  The self-check catches a `when` that is too narrow; only the repair audit and the generated
  convergence test catch one that is too broad, as a placed record the refetch then removes.
- **`change(op, { optimistic?, affects?, order? })`** declares a write's intent and ordering.
- **`feed(op, entities)`** marks a stream of entity changes.
- `load`, `answer`, `change` and `feed` take the operation as their first argument, so `when` and
  `optimistic` are typed from it directly. This is the inline typing the entity proposal gave up
  for `depends: (on) => [...]`; it needs a spike to confirm.

### 4.4 A boundary to another domain

```ts
// billing/domain.ts: another team's data
export const BillingDomain = domain({
  id: "billing",
  entities: [Usage],
  owns: [BillingApi],
  reads: { usage: answer(workspaceUsage, { Usage: {} }) },
  writes: {},
  // explicit edge: when a note is created or removed, workspace usage may change
  dependsOn: [NotesDomain.writes.create, NotesDomain.writes.remove],
});
```

Cross-domain edges are few, named, and drawn by `flow graph`. A domain never reaches into another
domain's records; it names the other domain's writes it depends on.

### 4.5 Machines: unchanged shape, one handle

```ts
export const Editor = definition({
  id: "notes/Editor",
  operations: { Notes: NotesDomain, heartbeat }, // heartbeat is plain: it involves no entity
  memory: {
    noteKey: Note.Key,
    draft: Schema.String,
    submitted: Schema.String,
    dirty: Schema.Boolean,
    changedElsewhere: Schema.Boolean,
  },
  …
});

OPEN: {
  activities: {
    note: O.Notes.noteById.subscribe(({ memory }) => memory.noteKey, {
      outcomes: { value: E.NoteLoaded.from((n) => ({ title: n.title })) },
    }),
  },
  on: {
    SaveRequested: {
      target: S.OPEN.SAVING,
      updateMemory: ({ memory }) => ({ submitted: memory.draft }),
      actions: [
        O.Notes.rename.commit(({ memory }) => ({ key: memory.noteKey, title: memory.draft }), {
          outcomes: { success: E.Saved, unknown: E.SaveUncertain },
        }),
      ],
    },
  },
}
```

The machine decides when to save and what an uncertain save means. The domain decides what a save
does to every cached copy.

### 4.6 What the CLI shows, from the closed set

```text
$ flow explain notes

domain notes   entities: Note, Folder   owns: NotesApi   reads: 4   writes: 2   feeds: 1

impact     noteById      inFolder              pinnedCount       folders
rename     result        none (title ignored)  if pinned         none
move       result        refetch (folderId)    none              refetch (folderId)
changes    write         by field              by field          by field

order      rename, move: queued per Note across actors
outside    billing.usage depends on notes.create, notes.remove
```

```text
$ flow check
error  notes/pinned-count requires NotesApi but is not registered in domain "notes"
error  Editor lists notes/rename directly; use Notes.rename from domain "notes"
```

### 4.7 The generated convergence test

```text
$ flow test notes --converge

domain notes: 500 random runs against fixture NotesServer
  writes   rename, move (inputs generated from their Schemas)
  plus     failures, unknown endings, feed events, reconnects
  check    after quiet: every active read equals the fixture's answer

failed run 213, shrunk to 4 steps:
  1. subscribe inFolder { folderId: "f1" }
  2. move n7 → f2            (commit held)
  3. feed: Upsert n7 { folderId: "f1", title: "x" }
  4. release move → success
  inFolder { f1 } still lists n7; the fixture does not
  cause: inFolder ignores "revision", but the fixture sorts by revision
```

---

## 5. What a closed domain makes possible

**(a) Checkable ownership.** "This operation touches notes but is not in the notes domain" is
detectable two ways:

- **by Schema:** its result or stream carries a `Note` pick (the entity proposal's rule);
- **by service:** its `lookup` or `commit` requires `NotesApi` in its Effect requirements, and the
  domain `owns` `NotesApi`.

The service rule closes the count hole: `pinnedNoteCount` holds no notes, but it calls
`NotesApi`, so it must be registered. Effect's requirement types give this for free when APIs are
split by domain. An app with one API service for everything falls back to the Schema rule.

**(b) A static impact matrix.** With a closed set, every (write, read) pair can be classified from
changed fields, `when` and ignored fields: no effect, refetch on these fields, or patched by the
result. `flow explain` prints it (section 4.6). Today that question is answered only by running the
scenario.

**(c) A generated convergence test per domain.** The domain knows every write and its input Schema,
every read, every feed, and the stateful fixture. The runtime generates property-based runs:
random interleavings of writes, failures, `unknown` endings, feed events and reconnects, then
asserts that every active read equals the fixture's answer once the system is quiet. Failures are
shrunk to the shortest sequence (section 4.7). Authors write nothing. This turns the convergence
claim from an argument into a test every app runs on its own domains. It is impossible when the set
of operations is open.

**(d) Write ordering across actors.** The domain owns the record, so `order: "perRecord"` queues
writes per record across every actor. Two editors renaming one note no longer race; the second
waits for the first. Contested fields then arise only from external pushes. Without `version`, this
removes the hardest bug class the reviews found.

**(e) One-hop repair as an interface.** Causes enter the domain: writes settling, feed events,
`invalidate`. Effects leave it: refetches. A refetch's response updates copies but never enters as a
cause. "A refetch never causes a refetch" becomes a property of the coordinator's interface rather
than a rule spread through the store, and every refetch has exactly one traced cause.

## 6. What it changes in the policies

- **Readers keep membership predicates.** Adding a new writer must not require editing every
  reader, so `when` stays on reads; the impact matrix shows the result instead of replacing it.
- **Cross-entity optimistic effects inside a domain become legitimate,** because the domain owner
  is the right place for a rule such as "moving a note changes both folders' counts". Version 1
  still leaves them out: the held-field machinery they need was the main source of runtime
  complexity, and counts that lag one round trip are acceptable. Within a domain they can return
  later without changing the model.
- **Effects on another domain** are declared at the boundary (`dependsOn`), naming the other
  domain's writes.
- **Raw operations that involve no entity** (a heartbeat, feature flags, a report) are never
  registered and never see a coordination field.
- **One lifecycle for every prediction.** Field patches, hiding and placing all follow the write's
  attempt:

  | Attempt           | Its predictions                                                     |
  | ----------------- | ------------------------------------------------------------------- |
  | the commit starts | applied as overlays                                                 |
  | success           | replaced by the server: the result's fields, then the refetches     |
  | failure or defect | removed; the affected answers refetch                               |
  | `unknown`         | kept until the forced refetch lands, then replaced by what it shows |

  Predictions from a feed change (a placed or hidden record) end when a lookup that started after
  the change lands. This restates the entity proposal's sections 4.5, 4.7 and 5.4 as one concept;
  it changes no behaviour.

## 7. Correctness compared with the entity proposal

| Property                                  | Entity proposal (draft 7)                   | Coordinator                                    |
| ----------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| every operation on notes is known         | no: an open set                             | yes: a closed set, checked by Schema and service |
| a count that holds no notes               | needs `depends: "none"` discipline          | caught by service ownership                    |
| which writes affect which reads           | known only at runtime                       | a static matrix                                |
| convergence evidence                      | a hand-written audit on chosen paths        | a generated property test per domain           |
| two actors writing one record             | versions or contested fields                | queued per record by the owner                 |
| repair cascades                           | prevented by a store rule                   | prevented by the owner's interface             |
| where a rule lives                        | operation, reader or writer                 | one place per domain                           |
| typing of `when`                          | through `depends: (on) => [...]`            | inline, from `answer(op, …)` (to be spiked)    |

## 8. Why the coordinator is not a machine

The tempting version is "the coordinator is an actor, so write its behaviour as a statechart". That
puts cache-maintenance logic in user code, which is the code that fails today. The coordinator must
be configured, not programmed: a fixed, tested algorithm whose only input is declarations. Machines
keep all workflow. Inspection shows the domain as a node with its own trace, so nothing is off the
record.

## 9. Changes to the entity proposal

| Entity proposal (draft 7)                          | With the coordinator                                 |
| -------------------------------------------------- | ---------------------------------------------------- |
| `loads`, `depends`, `optimistic`, `affects`, `feeds` on operations | the same declarations, on the domain (`load`, `answer`, `change`, `feed`) |
| `depends: (on) => [...]` callback                  | `answer(op, { Note: { … } })`, typed from `op`       |
| `depends: "none"` and `affects: "none"` on every operation | unregistered operations are plain; ownership is checked by Schema and service |
| operation groups as a layout convention (2.4)      | the domain is the group, and it carries the policy   |
| concurrency per actor and key                      | plus `order: "perRecord"` across actors, per write   |
| repair triggered by writes, feeds and reads        | one hop: writes, feeds and `invalidate` only         |
| repair audit at the end of each Story              | kept, plus the generated convergence test per domain |

Unchanged: entity identity and shapes (section 2), the store, ordering, deletes, persistence and
traces (section 6, apart from one-hop repair), machine call sites and Stories.

## 10. Risks

- **God objects.** A domain that grows to the whole app is one coordinator. A domain is the
  smallest set of entities whose rules reference each other; `flow check` warns past a size.
- **Indirection.** Behaviour is split between the operation (how to talk to the server) and the
  domain (what it means for shared data). That split is the concern boundary, but a reader opens
  two places. Keeping both in one feature folder mitigates it.
- **Registration bookkeeping.** Agents must register each new operation. Ownership detection turns
  forgetting into an error, so this is safe, only slightly verbose.
- **Adoption renames machine references** (`O.noteById` becomes `O.Notes.noteById`) unless
  definitions allow an alias.
- **Per-record write queues change latency.** A queued second rename waits for the first. The
  queue is chosen per write; parallel writes keep the transaction's own concurrency.
- **The generated test needs a stateful fixture** that behaves like the server. It checks the
  client against the author's model of the server, not against the server itself.

## 11. Decisions needed

1. **Domain granularity.** One entity per coordinator, or domains of a few related entities?
   Recommended: domains.
2. **Ownership detection.** Schema only, or Schema and Effect service requirements? Recommended:
   both; the service rule closes the count hole.
3. **Write ordering.** Should `order: "perRecord"` be the default for writes in a domain?
   Recommended: yes.
4. **The generated convergence test.** In version 1? Recommended: yes; it is the main reason a
   coordinator beats scattered policy.
5. **Cross-entity optimistic effects inside a domain.** Now or later? Recommended: later.

## 12. Next

Pressure-test the coordinator against the app list (chat, board, e-mail, banking, file manager,
checkout, live map, global search) before revising the entity proposal. Domain boundaries and the
generated test are where it could still fall apart. Then spike the typing of `answer(op, …)` and
`change(op, …)`.

## 13. Considered and rejected: named facts

A coordinator built around **facts** was considered: writes assert named facts (`Moved`,
`Renamed`), the domain reacts with a closed set of predictions, and answers list the facts they
refresh on. It would give every effect a named cause and match the library's event vocabulary.

It was rejected because:

- it doubles the declarations: every write asserts a fact and every answer lists facts, instead of
  the runtime deriving both from changed fields;
- it brings back the problem reader-side `when` solved: a new write needs either an existing fact
  or a new one no answer listens to;
- pushes and reads still arrive as field changes, so answers would need two kinds of listening;
- its gains are available without it: traces already name the write and the changed fields, and
  section 3.1 gives the same boundary against becoming a client database.
