# Entity domain: the tier-1 proposal (draft 4)

Status: **the tier-1 entity proposal**, the chosen direction. It is measured against `entities.md`
(goals, boundaries, correctness C1–C8) and stays within tier 1 (`entities.md` section 3.3): records
stay coherent, answers are repaired, fields are predicted, and list membership is never predicted.
It builds on `minimal-library.md` decisions 1–8a. Code is illustrative.

The alternatives it was chosen over (operation-first fields, the entity-centric members, the
coordinator with picks in results, and the knowledge store) are in git history at commit
`ad129cc4`; section 12 says why this one won. Section 16 records the reviews of its latest draft.

---

## 1. The rule

> **An operation describes a request. A domain describes what the request means for shared data.**

- **Request facts stay on the operation:** what is asked, with which input, what comes back
  (as a plain Schema), how long the answer may be cached, and how one actor issues the request.
- **Data-policy facts live in the domain:** which records the result contains, which changes can
  make an answer wrong, what a write predicts, and how writes to one record are ordered.

An operation module never imports an entity. Adopting entities edits the domain, not the
operations.

### 1.1 What a domain is

A domain owns the shared data of a few entities whose rules reference each other (notes and their
folders). Its contract:

1. **Closed set.** It lists every operation that reads, writes or reports changes to its entities.
   Each operation belongs to at most one domain.
2. **Sole handle.** Machines reach those operations only through the domain (`O.Notes.rename`).
3. **Declarations only.** Every function in it is recorded once (section 4); nothing in it sends,
   commits, reads another resource or chooses a state.
4. **Ownership.** It names the API service it owns (`{ api: NotesApi }`); an operation that requires
   that service must be registered in it.
5. **Explicit boundaries.** A domain that must repair when another domain's writes settle names
   those writes (`.dependsOn(NotesDomain.rename)`); it never reaches into the other's records.
6. **Configured, not programmed.** Its behaviour is the runtime's fixed algorithm (section 5). It is
   not a machine and has no user logic, because cache-maintenance code written by authors is the
   code that fails. Machines remain the only place workflow is written.

## 2. Reading a domain

Every name in a domain is either **yours** or one of a small, fixed set of **library words**.

| Yours                                                  | The library's                                          |
| ------------------------------------------------------ | ------------------------------------------------------ |
| the domain's id and the keys of its entries (`inFolder`, `rename`) | `domain`, `read`, `write`, `listen`        |
| entity names (`Note`) and their fields (`folderId`)    | `.one`, `.list`, `.count`, `.byKey`                    |
| operations (`notesInFolder`, `renameNote`)             | `.where`, `.unaffectedBy`, `.predicts`, `.alsoChanges`, `.oneAtATimePerRecord` |
| values inside functions (`input.folderId`)             | the operators `eq`, `oneOf`, `contains`, `between`, `overlaps`, `and` |

Library words are verbs and prepositions. Nothing you name sits at the same level as a library
word, and no path or field is written as a string.

### 2.1 The whole vocabulary

| Word | Reads as |
| --- | --- |
| `domain(id, { api }, entries)` | these entries are the shared-data meaning of these operations; this domain owns `api` |
| `read(resource)` | this resource reads shared data |
| `write(transaction)` | this transaction changes shared data |
| `listen(stream)` | this stream reports changes to shared data |
| `.one(Entity, at?)` | the result holds one record at this place (the whole result by default) |
| `.list(Entity, at)` | the result holds a list of records at this place |
| `.count(Entity)` | the result depends on records it does not hold (a count, a total, a quote) |
| `.byKey(({ input }) => key)` | this read is how one record is loaded by its key |
| `.where(({ input, record }) => condition)` | only records meeting this condition can be in, or count toward, this result |
| `.unaffectedBy(...fields)` | a change to these fields cannot make this result wrong |
| `.predicts(({ input }) => changes)` | what to show before the server answers |
| `.alsoChanges(({ input }) => targets)` | the server also changes these records, which the response does not carry |
| `.oneAtATimePerRecord()` | writes to one record queue across every screen |
| `.dependsOn(OtherDomain.write)` | this domain's reads repair when another domain's write settles |
| `.as((event) => change)` | how one stream event becomes a record change |
| `eq`, `oneOf`, `contains`, `between`, `overlaps`, `and` | conditions inside `.where` |
| `Note.patch`, `Note.save`, `Note.delete`, `Note.all` | changes to, and sets of, records |

---

## 3. The notes app

### 3.1 Entities

```ts
// notes/entities.ts
export const Note = entity({
  id: "notes/Note",
  fields: {
    noteId: Schema.String,
    workspaceId: Schema.String,
    folderId: Schema.String,
    title: Schema.String,
    body: Schema.String,
    pinned: Schema.Boolean,
    author: User, // a nested entity: wherever a note is held, its author is held as a User
    revision: Schema.Number,
  },
  primaryKey: ["noteId"],
  version: "revision",
});
```

### 3.2 Operations: plain, no entity imports

```ts
// notes/operations.ts
const NoteRow = Schema.Struct({
  noteId: Schema.String,
  folderId: Schema.String,
  title: Schema.String,
  pinned: Schema.Boolean,
  author: Schema.Struct({ userId: Schema.String, name: Schema.String }),
  revision: Schema.Number,
});

export const notesInFolder = resource({
  id: "notes/in-folder",
  key: (input: { folderId: string }) => input,
  lookup: (input, { signal }) => NotesApi.use((api) => api.list(input, signal)),
  result: Schema.Struct({ notes: Schema.Array(NoteRow), total: Schema.Number }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

export const noteById = resource({ id: "notes/by-id", key: (i: { noteId: string }) => i, … });
export const pinnedCount = resource({ id: "notes/pinned-count", key: () => ({}), … });
export const searchNotes = resource({ id: "notes/search", key: (i: SearchInput) => i, … });
export const renameNote = transaction({ id: "notes/rename", input: RenameInput, … });
export const moveNote = transaction({ id: "notes/move", input: MoveInput, … });
export const noteEvents = stream({ id: "notes/events", key: (i: { workspaceId: string }) => i, … });
```

Each works as it does today in an app without the entity layer.

### 3.3 The domain

```ts
// notes/domain.ts
export const NotesDomain = domain("notes", { api: NotesApi }, {
  noteById: read(noteById)
    .one(Note)
    .byKey(({ input }) => ({ noteId: input.noteId })),

  inFolder: read(notesInFolder)
    .list(Note, ({ result }) => result.notes)
    .where(({ input, record }) => eq(record.folderId, input.folderId))
    .unaffectedBy("title", "author"),

  pinnedCount: read(pinnedCount)
    .count(Note)
    .where(({ record }) => eq(record.pinned, true)),

  search: read(searchNotes)
    .list(Note, ({ result }) => result.hits.note)
    .where(({ input, record }) => eq(record.workspaceId, input.workspaceId)),

  rename: write(renameNote)
    .one(Note)
    .predicts(({ input }) => Note.patch(input.key, { title: input.title }))
    .oneAtATimePerRecord(),

  move: write(moveNote)
    .one(Note)
    .predicts(({ input }) => Note.patch(input.key, { folderId: input.to }))
    .oneAtATimePerRecord(),

  events: listen(noteEvents).as((event) =>
    event.type === "noteSaved" ? Note.save(event.note) : Note.delete({ noteId: event.noteId })),
});
```

Read aloud:

- **noteById** reads one note, and is how a note is loaded by its key.
- **inFolder** reads a list of notes at `result.notes`. Only notes in the input's folder can be in
  it. A change to a note's title or author cannot make it wrong.
- **pinnedCount** counts pinned notes.
- **search** reads a list of notes at `result.hits.note`, scoped to the input's workspace. The
  search text is not a condition the client can evaluate, so any change to a note in the workspace
  can make the result wrong.
- **rename** writes one note, predicts the new title, and queues renames of the same note.
- **move** writes one note and predicts its new folder.
- **events** turns each pushed event into a saved or deleted note.

### 3.4 Machines

```ts
export const Editor = definition({
  id: "notes/Editor",
  operations: { Notes: NotesDomain, heartbeat }, // heartbeat stays a plain operation
  …
});

activities: { note: O.Notes.noteById.subscribe(({ memory }) => ({ noteId: memory.noteId })) }
actions: [O.Notes.rename.commit(({ memory }) => ({ key: memory.noteKey, title: memory.draft }))]
```

---

## 4. How declarations are recorded

Every function in a domain is called **once, when the domain is constructed**, with recording
proxies in place of real values. What it touches becomes a plain description that `flow graph`,
`flow check`, `flow explain` and the runtime read. This is how TanStack DB's query builder works
(section 14).

### 4.1 Places in a result (`.one`, `.list`)

`({ result }) => result.notes` records the path `["notes"]`. An array on the path means each
element; `result.hits.note` over an array of hits means the `note` of each hit.

- **The record shape is inferred** from the struct at that place. It must contain the entity's key
  fields, and every field whose name matches an entity field must have that field's type. The
  matching fields are what this result carries; the rest (a search `highlight`) belong to the
  result, not the record.
- **Nested entities follow the entity's declaration.** `Note.fields.author` is a `User`, so holding
  a note holds its author as a user; the domain names only top-level places.
- **Two entity types at one place** (a folder's files and subfolders in one array) are written as
  two entries at the same place, `.list(File, at)` and `.list(Folder, at)`. Each element is matched
  to the entity whose key fields it carries. When both entities share key field names, the place
  must be a tagged union (`Schema.Union` of structs with a literal `kind`), and each `.list` names
  its member: `.list(File, at, { kind: "file" })`. An element that matches neither is context;
  one that matches both is a type error.

### 4.2 Conditions (`.where`)

`({ input, record }) => eq(record.folderId, input.folderId)` records the condition
`eq(record.folderId, input.folderId)`. Conditions use operators, never JavaScript comparisons:

| Operator | Condition |
| --- | --- |
| `eq(a, b)` | equal |
| `oneOf(a, values)` | `a` is one of an array |
| `contains(arrayField, value)` | an array field contains the value |
| `between(a, from, to)` | `a` lies in the half-open range `[from, to)` |
| `overlaps(start, end, from, to)` | the record's interval `[start, end)` overlaps `[from, to)` |
| `and(c1, c2, …)` | all hold |

Each argument is a record field, an input field, the signed-in principal (`principal()`) or a
constant. Several `.where` calls are combined with `and`.

**Absent inputs mean "no constraint".** An optional input that is absent turns the operator that
uses it into a condition that always holds: `oneOf(record.status, input.statuses)` with no
`statuses` means any status, and `between(record.postedAt, input.from, input.to)` with no `to` means
no upper bound. This matches how such filters behave on a server; a filter that means something else
when absent is not expressible, and the condition is left out (the safe default).

### 4.3 Predictions and other changes (`.predicts`, `.alsoChanges`, `.as`)

`({ input }) => Note.patch(input.key, { title: input.title })` records **which** record changes:
a `Note`, at the key `input.key`. The values are computed for real when the write starts. A patch
may compute from the record itself (`Post.patch(input.key, (post) => ({ likeCount:
post.likeCount + 1 }))`); that function runs only at runtime and is never recorded.

`.as` runs for real on each event; the domain's declaration says only which entities it may change.

### 4.4 What recording forbids, and how mistakes are reported

A recording proxy can see property access but not JavaScript logic. So inside a recorded function:

| Written | Result |
| --- | --- |
| `record.folderId === input.folderId` | **an error at construction:** "`.where` received a boolean. Write `eq(record.folderId, input.folderId)`." `===` returns a plain boolean, which the domain rejects |
| arithmetic, templates, `String(x)`, `x + 1` on a recorded value | **an error:** the proxy throws from its conversion hooks and names the place |
| a method call (`record.title.trim()`) | **an error:** recorded values cannot be called |
| `cond ? a : b`, `a && b`, `a \|\| b`, `if` | **not detectable by the proxy or the types**: the proxy is always truthy, so one branch is recorded and the condition is silently too narrow. The type spike confirmed this. A **mandatory** `flow check` rule (an error, in the style of `strict-boolean-expressions`) rejects them in recorded functions |
| `Date.now()`, `Math.random()`, outer mutable state | `flow check` rejects them; they would run once at construction |

**The rule for authors: a recorded function is one expression of property reads and library
operators.** Logic the client cannot express that way belongs in the server's query, or makes the
condition unknown, in which case `.where` is left out and the result depends on every change to the
entity (the safe default).

---

## 5. Repair: the runtime, in differential-dataflow terms

The runtime is stated with four ideas from differential dataflow (sections 5.1 to 5.5), which
turn what used to be special cases into consequences, plus the store rules they rest on (section
5.6).

### 5.1 Every change is a delta

A record change carries the record's old value and its new value. Every source produces one:

| Source | Delta |
| --- | --- |
| a write starting | a **predicted** delta, with the write's attempt as its cause |
| a write settling | the predicted delta is removed; the server's delta is applied |
| a response revealing newer fields | a delta from the stored base to the newer value |
| a push (`listen`) | a delta from the stored base to the pushed value, or to nothing for a delete |

A failed write's predicted delta is removed: retraction is the inverse delta, and no rollback rule
is needed. A held field is a predicted delta whose cause has settled but whose field the response
did not carry; it ends when a later delta for that field arrives.

### 5.2 Repair is a join

Finding the answers a change can make wrong is a **join** of two changing collections: record
deltas and active answers, matched on the answers' conditions.

- An answer matches a delta when the delta's **old or new** value meets the answer's `.where` (a
  field the delta does not carry counts as meeting it), and a changed field is not in
  `.unaffectedBy`, or the change moves the record into or out of the condition.
- **The join is indexed**: equality and `oneOf` conditions by value, `contains` by element, ranges
  by interval, and answers with no indexable condition in a scanned list. This is how Electric
  routes changes to shapes.
- **Both sides change.** The join's delta rule has two halves: a new record delta against existing
  answers (ordinary repair), and a new answer against deltas already in flight. The second half is
  the in-flight fence: an answer whose request started before an affecting change is stale on
  arrival.

### 5.3 Freshness is a frontier

Each answer has a **frontier**: the revision up to which its data is known to account for every
affecting change. A delta that matches an answer and is newer than its frontier makes the answer
stale. Only a response whose request started at or after that delta advances the frontier.

- Reconnects, restores and `invalidate(Note.all)` lower the frontier of every answer on the entity.
- An answer is fresh when its frontier is at or after the latest matching delta. That is the
  convergence property C2, and the generated test checks it.

### 5.4 Deltas consolidate per drain

All deltas produced while the Runtime drains its ready work are consolidated per record before
the join runs. A title renamed and renamed back within one drain nets to nothing and repairs
nothing; a bulk write repairs each answer once.

### 5.5 What this replaces

| Former special rule | Now |
| --- | --- |
| rollback on failure | removing a predicted delta |
| held fields | a predicted delta outliving its cause's settlement until a newer delta |
| the in-flight fence | the second half of the join |
| the stale floor | the frontier |
| coalescing within a window | consolidation per drain |
| one-hop repair | a response that changes no base value produces no delta |

Behaviour is unchanged; the rules now follow from one model, and a missing case shows up as a
missing term.

### 5.6 Store rules

**Records.** One record per key holds the fields received so far, each with the version, start
revision and landed revision of the write that set it. A record's **base** is what the server has
said; its **visible** value is the base with live predicted deltas on top.

**Ordering.** A write replaces a stored field when both carry a version and its version is strictly
greater (a lower version is rejected; an equal one falls through), or otherwise when its request
started at or after the stored field's landed revision. A lookup's start is when it was sent; a
push's is when it arrived; a write's confirmed fields start when the write settled.

**Contested fields.** Without versions, start order is not server truth. A field is contested when
a write carries a different value and either lands on a field another write set after this write was
sent, or is skipped by the ordering rule. A contested record is refetched by its loader and every
answer holding it. If one field flips between two sources twice in a row, read-triggered repair for
it stops and `FieldDisagrees` is reported (two endpoints use one name for different values);
repeated forced repairs of one record are capped and reported as `ContestLoop`.

**How a write ends.**

| Ending | Predicted deltas | Repair |
| --- | --- | --- |
| success | fields the response carries replace them; a predicted field it omits is **held** until a later delta for that field | affected answers |
| failure or defect | removed | affected answers, all fields |
| rejected, or cancelled before sending | removed | none |
| uncertain (cancelled after sending, response lost, restored mid-flight) | kept and marked `pending` | **forced**: the record's loader and every answer holding it refetch; the deltas end when a read that started after the write covers the record |

**Holding.** A record exists while an answer references it (until the answer's `gcTime` after its
last subscriber), a loader subscription holds it, or a predicted delta is live. A pushed change to a
record nothing holds is matched against active answers (unknown fields count as matching) and makes
the matching ones stale; the record itself is not stored.

**Deletes.** A delete hides the record in every answer and leaves a tombstone while any lookup that
started before it is in flight, so that lookup cannot bring the record back. A `notFound` never
deletes a record whose create is unsettled.

**Persistence.** Only confirmed data is persisted: each persisted answer's references and context,
and for each record only the fields persisted answers project. Restore writes at revision 0 and
lowers every restored answer's frontier, so live data wins. A write restored as uncertain keeps its
records `pending` until its forced repair lands. A different principal is a new Runtime.


---

## 6. Stories

Stories keep every rule of `minimal-library.md` section 11 and the StoriesAndModels plan: the
closed builders and command list (`send`, `process`, `advance`, `advanceTo`, `advanceToNextTimer`,
`checkpoint`, `run`), one production executor, the Runtime clock, seeded ids, fixtures as Layers,
and atomic checkpoints (O4). A domain adds **no Story kind and no Story command**. It adds two
evidence fields, two read helpers and one fixture helper, each listed as an amendment to the
StoriesAndModels plan in section 6.6.

### 6.1 The stateful fixture

Repair is visible in a Story only if the server remembers writes. `statefulFixture` builds an
ordinary `fixture()` (O2): a complete Layer for the domain's API service whose state is a `Ref`
**created inside the Layer's scope**, so every Story run and every generated run gets fresh state.

```ts
export const NotesServer = statefulFixture(NotesDomain, {
  records: [n7InF1, n8InF1],
  override: {
    // the real server searches titles case-insensitively; the domain cannot say so
    search: (records, input) =>
      records.filter((note) => note.title.toLowerCase().includes(input.q.toLowerCase())),
  },
  pushes: [{ at: "3 seconds", stream: "events",
             event: { type: "noteSaved", note: { ...n8InF1, title: "Lobby" } } }],
});
```

- **Defaults come from the domain.** Without an override, a read entry answers by filtering
  `records` with its recorded condition and projecting the result shape; a write entry applies its
  predicted fields and returns the record. These defaults are the **reference layer** of section 8.
- **`override`** replaces a default with the real server's behaviour, keyed by **domain entry**
  (`search`, `move`), never by API method name. An override is where the fixture says something the
  domain cannot: search, sorting, server-side effects, totals, or a different meaning of an absent
  input. The fixture's report says which entries are overridden and which are derived.
- **Completeness.** The API service must be complete (O2). Methods behind operations not in the
  domain need an override; a missing one is a type error.
- **`records`**, not `seeds`, so it does not collide with O2's resource seeds.

**Pushes** (`pushes`) are scheduled on the Runtime clock, measured from the Runtime's start:

- An event is delivered into its stream when the clock reaches its time and the stream is
  subscribed; a Story still calls `process()` after `advance` to react to it, as for any timer.
- A scheduled push counts as a timer for `advanceToNextTimer()`.
- Events at the same time are delivered in array order. A reconnect does not replay delivered
  events.
- An event whose time is never reached, or whose stream is never subscribed, is listed as
  `undeliveredPushes` in `run.end`, so a typo cannot pass silently.

### 6.2 Reading records and answers in a Story

A checkpoint is one atomic cut over published snapshots and **one store revision** (O4). Reads in
Stories take the checkpoint, not a snapshot, so they read exactly that revision:

| Read | Returns |
| --- | --- |
| `Note.get(checkpoint, key, shape?)` | `{ data, pending }`, or `undefined` if the store does not hold it |
| `NotesDomain.inFolder.get(checkpoint, input)` | the answer at that revision: `{ data, stale, pending }`, or `undefined` if no active answer has that input |

The second is the read 8a already defines for resources (`ticketById.get(s, input)`), applied to a
domain entry. With it, "the archived user left the table" and "the badge shows 2" are direct
assertions.

**Live views** use `Note.get(snapshot, key, shape?)` through `useView`. All actors of a Runtime
publish into one versioned store per turn (8a), so a live snapshot belongs to one store version;
the read uses it through Runtime-internal bookkeeping and adds no public field (D22). A snapshot
copied out of the Runtime (serialised, or rendered by `CheckpointProvider`) carries no such link;
`CheckpointProvider` reads records from its checkpoint instead.

### 6.3 Repair evidence

Every checkpoint, and `run.end`, carries the repair decisions **from the start of the run up to the
cut**, in decision order. They are projected from the accepted trace evidence captured in the cut,
not read live, so they follow O4's copying and failed-capture rules (a failed capture yields no
evidence, never empty lists).

```ts
type Repair = {
  sequence: number;                        // position in the run's decision order
  read: "notes.inFolder";                  // domain and entry, the same spelling everywhere
  input: { folderId: "f1" };
  source: DeltaSource;                     // a write, a push, a response, a reconnect, invalidate
  record: { entity: "notes/Note"; key: { noteId: "n7" } };
  changed: Array<{ field: string; from: unknown; to: unknown }>;
  matched: "entered" | "left" | "both";    // which side of the change met the condition
};
type Skip = Omit<Repair, "matched"> & { reason: "outside-condition" | "unaffected" | "fresh" };
```

- **`repairs`** lists answers that became stale. **`skips`** lists answers that the index offered
  as candidates and that were then rejected, with the reason. Answers that were not active, or that
  the index never offered, appear in neither: an explanation of absence comes from `flow explain`
  (section 7).
- **Order is canonical:** by delta, then by the entry's position in the domain, then by the input's
  canonical key. Tests can compare lists exactly.
- **Data, not prose.** The CLI renders sentences from these fields; Stories assert on fields.

```ts
const { settled } = (await moveRepairs.run()).checkpoints;
expect(NotesDomain.inFolder.get(settled, { folderId: "f1" })?.data.notes.map((n) => n.noteId))
  .toEqual(["n8"]);
expect(settled.repairs.filter((r) => r.source.write === "notes.move").map((r) => r.input))
  .toEqual([{ folderId: "f1" }, { folderId: "f2" }]);
```

**A trap worth a note.** With `oneOf(record.status, input.statuses)`, an absent `statuses` means any
status. A table opened with no status filter keeps archived users after an archive: they still meet
the condition. A Story asserting they disappear is wrong, not the library.

### 6.4 Determinism

- **Recording** runs once when a domain is constructed. Its description is frozen and fingerprinted;
  the fingerprint is part of the App's identity, so runs of one Story can be compared.
- **Consolidation unit: one scheduler turn** (the Statecharts plan's turn), in Stories and in
  production alike. A Story's `process()` may run several turns; deltas never consolidate across
  turns. A pair of changes that cancel within one turn produces no delta, no repair and no frontier
  change.
- **Repairs are decided in canonical order** (section 6.3) and their lookups start in that order.
- **Predictions are not run twice.** Their purity is a `flow check` rule. The property test
  (section 8) may run an opt-in purity check in a sandbox with a cloned id generator.

### 6.5 Recording errors

A recording error is thrown when the domain is constructed. `flow check` reports it as a diagnostic,
and `flow story run` reports it as a load failure of the App, before any Story runs.

### 6.6 Amendments to the StoriesAndModels plan

| Amendment | Outcome |
| --- | --- |
| checkpoints and `run.end` carry `repairs` and `skips`, projected from captured evidence | O4, V4 |
| `Entity.get(checkpoint, …)` and `Domain.entry.get(checkpoint, input)` read the checkpoint's store revision | O4, V4 |
| `statefulFixture(domain, { records, override, pushes })` returns an ordinary `fixture()` | O2, V2 |
| `run.end` lists `undeliveredPushes` | O4 |

---

## 7. The CLI and inspection

A domain is recorded at construction into the App's internal representation (SurfaceSimplification
O2), and every runtime decision is a trace event, so the CLI explains a domain without a second
model. This section targets D40's command set; the binary name and the remaining `behavior` leaves
are reconciled by the CommandLine rewrite, and section 7.6 lists the amendments that plan needs.

### 7.1 The recorded description

`inspect(app)` (D39) includes each domain as plain data: its entries, the places records sit, the
recorded conditions as an expression tree (`ref`, `val`, `func`), `unaffectedBy`, predicted fields,
other changes, ordering and edges to other domains. The layout is added to the
InspectionAndArtifacts schema (V4) as a declared nested layout.

- **No user values.** Constants inside conditions and predictions are recorded as literals, because
  they are structure (`status: "archived"`). `flow check` rejects literals that look like secrets or
  exceed a size cap.
- **Rendering.** `render(model, "text")` prints the sentences of section 3.3 as a deterministic
  projection of the same data, with golden tests; `render(model, "json")` is the form for agents.

### 7.2 Static questions: `flow explain <domain>`

Static mode reads the App and runs nothing.

```text
$ flow explain notes
mode         static
noteById     reads one Note; loads a note by its key
inFolder     reads a list of Note at result.notes
             where record.folderId = input.folderId; unaffected by title, author
pinnedCount  counts Note where record.pinned = true
search       reads a list of Note at result.hits.note where record.workspaceId = input.workspaceId
rename       writes one Note; predicts title; one at a time per record
move         writes one Note; predicts folderId; one at a time per record
events       listens; saves or deletes Note

impact       source      read          certain              possible
             rename      search        title                any field in the response
             rename      inFolder      none (unaffected)    any field in the response
             move        inFolder      folderId (condition) any field in the response
             move        search        folderId             any field in the response
             events      every read    —                    any pushed field
             reconnect   every read    all
             invalidate  every read    all
```

- **Two columns.** *Certain* is what the recorded predictions change; *possible* is what a response,
  a push or `.alsoChanges` may change, which the domain cannot know in advance. A read with no
  expressible condition is shown as `all (condition not expressible)`.
- **The reverse view**, `flow explain notes --read notes.inFolder`, lists every write, stream and
  other source that can affect one read, and the machines that subscribe to it (from `flow graph`).
  It answers "which writes can change this screen".

### 7.3 Evidence questions: from a trace artifact

Evidence mode never runs application code. A Story run writes the trace, and the CLI reads it:

```text
$ flow story run move-repairs --trace-output move.trace.json
$ flow explain notes --trace move.trace.json --at settled
$ flow trace summarize move.trace.json --read notes.inFolder
$ flow trace summarize move.trace.json --entity Note:n7 --at 41
$ flow trace diff before.trace.json after.trace.json --section repairs
```

| Question | Answered by |
| --- | --- |
| why did this read refetch | `trace summarize --read`: each repair with its source, record and changed fields |
| why did it not refetch | `explain --trace --at`: whether the read was active, fresh, offered by the index, rejected (and why), or never a candidate |
| why does this record show this value | `trace summarize --entity Note:n7 --at <sequence>`: the base value, live predictions, held fields, and the delta that set each field |
| what changed between two runs | `trace diff --section repairs` or `--section records`, normalised and ordered |

### 7.4 Trace events

Every event carries the Runtime's sequence number, so it orders against machine transitions in one
total order.

| Event | Fields |
| --- | --- |
| `delta` | record, source, predicted or confirmed, changed field names, value digests |
| `consolidated` | the deltas that cancelled within a turn, and the net delta |
| `repair` | read, input, source, record, changed fields, entered or left |
| `skip` | read, input, source, reason; only for candidates the index offered |
| `repairSettled` | read, input, the refetch's outcome, whether it joined an in-flight lookup |
| `frontier` | read, input, old and new frontier, and the response that advanced it |
| `prediction` | started, settled, held field kept or ended, with its attempt |
| `byKey` | a loader read served from the store or sent to the server |
| `invalidate`, `reconnect`, `restore` | the source and the entities it covers |
| `tombstone`, `gc` | record, reason |
| `selfCheck` | a response record that contradicted a read's condition |

- **Values and redaction.** Artifacts carry changed field names and value digests, not values.
  Values reach only `attachInspector`'s in-memory events. An entity field marked `sensitive` is
  never sent even there. This keeps artifact redaction within InspectionAndArtifacts' exact-path
  rules.
- **Volume.** Skips are recorded only for candidates the index offered, never for answers it
  excluded; every turn also records counters `{ deltas, candidates, repairs, skips }`. A repairs
  section is complete even when older skip events fell out of the retained window.
- **No `recording` event.** The recorded description is part of the App identity, not the trace.

### 7.5 Production inspection

`attachInspector(runtime, sink)` (D39) receives the same events as they happen and never delays
them. For current state it offers a passive read, `inspect(runtime).domains.notes.answers()`, at
one store revision: each active answer's frontier, live predictions with their attempts, and held
fields. It starts no work; a late-attached inspector gets that snapshot and a truncation marker.

### 7.6 Amendments to the CommandLine and InspectionAndArtifacts plans

| Amendment | Plan |
| --- | --- |
| `flow explain <domain>` with `--read <domain.entry>`, `--trace <artifact\|->` and `--at <checkpoint>` | CommandLine O1 (the closed grammar of C2 changes) |
| `flow trace summarize <artifact\|-> --read <domain.entry>` or `--entity <Entity:key>`, optional `--at <sequence>`; the two filters exclusive; an unknown read, entity or key exits 2 | CommandLine O1 |
| trace diff sections `repairs` and `records` | CommandLine O3, InspectionAndArtifacts |
| the recorded domain layout in the inspection schema | InspectionAndArtifacts V4 |
| the trace events of section 7.4 and their redaction rule | InspectionAndArtifacts |
| `inspect(runtime).domains` as a passive current-state read | InspectionAndArtifacts, D39 |

`flow explain` exits 0 whenever it produces an explanation, including "stale", and 2 for an unknown
domain, entry, artifact or checkpoint.

---

## 8. The generated property test

The closed set of a domain makes one test possible that scattered declarations cannot: drive the
domain's writes, pushes and failures in random interleavings and check the correctness properties
of `entities.md` (C1–C8) throughout, not only at the end.

### 8.1 What it is

`propertyTest(domain, options)` is a **test-host helper** in `flow-state/testing`, not a Story kind.
From a seed it generates plans, each an ordinary static `story.app(...)` run on a fresh Runtime, and
checks properties on their evidence. It runs in the test runner like any test.

```ts
test("notes converge", () =>
  propertyTest(NotesDomain, {
    fixture: NotesServer,   // optional: without it, only the reference layer runs
    seed: 1,                // default: derived from the test name
    runs: 50,               // default 50; CI runs more
    steps: 40,              // actions per run
  }));
```

- **No app needed.** The helper subscribes every read entry through a generated probe actor, with
  inputs drawn as in section 8.4, so a domain is tested on its own.
- **Results:** pass, fail, or inconclusive. A run that reaches the turn bound or leaves external
  work pending is inconclusive, never a pass or a failure.
- **A failure** is shrunk and printed as a static Story with literal records, inputs and delivery
  schedule, plus the seed, the failed property and the first publication that broke it. The printed
  Story is re-run before printing; if it does not reproduce, it is printed as "not reproduced".

### 8.2 What it checks

| Property | Checked |
| --- | --- |
| C1 coherence | at every publication: all copies of each record field agree |
| C2 convergence | once quiet: every active answer equals the oracle's answer, element by element, including context fields; lists compared in order where the server's order is known, as sets otherwise |
| C3 no cascades | every repair has exactly one source; no repair's source is a refetch's own response; repairs per source stay within a bound |
| C4 monotonic truth | every field's version and landed revision never move backwards, except through a recorded forced repair |
| C5 honest prediction | every displayed unconfirmed value is an overlay with a live attempt and is `pending`; persisted data contains no overlay |
| C6 no silent loss | every record that leaves an answer has a recorded reason |
| C7 determinism | each failing plan, and a sample of passing ones, is run twice and the traces compared |
| C8 explainability | every repair, skip and hidden record names its source |

**Quiet** is a fixed suffix of existing commands: `process()`; then `advanceToNextTimer()` and
`process()` until no timer remains or a horizon is reached; then a checkpoint. After it, the clock
is advanced a long way and no new lookup may start: a refetch loop shows up here.

### 8.3 Two oracles, two questions

| Layer | Server | Oracle | A failure means |
| --- | --- | --- | --- |
| **library** | the fixture's derived defaults | a **from-scratch evaluator**: recomputes each answer by filtering the server's records, written separately from the runtime's indexed join | the repair runtime is wrong: a Flow State bug |
| **app** | the fixture with its overrides | the same evaluator over the fixture's state | the declarations disagree with the author's server: a missing `.alsoChanges`, a field wrongly in `.unaffectedBy`, a hidden server filter |

- **The evaluator is independent of the runtime.** It shares the recorded conditions (they are the
  declaration under test) but not the join, the frontiers or the deltas. It also runs every
  condition through both the index and a full scan, so an indexing bug shows as a disagreement.
- **The harness is tested by mutation.** For each domain the helper also runs known-bad variants (a
  dropped `.alsoChanges`, a field added to `.unaffectedBy`, a `.where` branch removed) against the
  app layer, and the test fails if any mutant passes.
- **The app layer is only as good as its overrides.** A fixture that copies the domain's conditions
  proves only consistency. The helper reports which entries were overridden; entries with no
  override are tested by the library layer only.

### 8.4 What it generates

- **Actions:** a write starting; its settlement as success, failure, or uncertain (cancelled after
  sending, or a lost response) followed later by the forced refetch; a lookup whose response is
  computed when the request starts and delivered after a generated delay (so responses reorder),
  duplicated, failed or empty; a push of a save, a delete, or a delete of an unheld key; a
  disconnect and a reconnect that misses changes; a persistence save and a restore; unsubscribing
  and resubscribing a read; `invalidate`.
- **Records and keys:** seeded keys, newly created keys and unknown keys; writes that move a record
  into, out of and within an answer, and writes that change only unaffected fields.
- **Inputs:** drawn from each read's input Schema, biased to the values in seeded records and to
  boundary values (empty arrays, absent optional inputs, range edges), so conditions are actually
  met and missed.
- **Server modes:** records with versions, without versions, and responses that omit predicted
  fields, so contested and held fields occur.
- **Coverage:** the helper counts how often each runtime rule fires (the fence, tombstones,
  contested and held fields, forced repairs, uncertain endings, restores) and fails a suite in which
  a rule never fired. A run with no active answer or no settled write does not count as a pass.

### 8.5 Limits it states

- **A recording that is too narrow passes.** A condition silently cut to one branch by `?:` or `&&`
  makes the test generate and check against that same narrow condition. The mandatory `flow check`
  rule (section 4.4) is the only guard.
- **The app layer tests against the author's model of the server**, not the server. A fixture's
  overrides should be checked against the real API (recorded samples or contract tests) where one
  exists.
- **Cost:** a run of 40 steps is a few milliseconds of Runtime work; 50 runs per domain fit a unit
  test, and CI runs more. A run over its time budget is inconclusive.

---

## 9. Rules and checks

| Rule | Checked by |
| --- | --- |
| a recorded function is one expression of reads and operators | the proxy and the types for booleans (`===`), conversions and calls; a mandatory `flow check` error for conditionals, short-circuits and impure calls |
| `.one` and `.list` places exist; inferred record fields have the entity's types | the type system |
| an operation registered in a domain is reached only through it | `flow check` |
| an operation is in at most one domain; a domain's `api` covers its operations' services | the type system for registered values; `flow check` otherwise |
| a resource, transaction or stream whose result or events carry an entity's key fields, or that requires a domain's API service, but is not in a domain | `flow check`: an error for an API service a domain owns, a warning otherwise |
| at most one `.byKey` per entity | `flow check` |
| predictions change only the write's own entity type | the type system |
| a condition the server contradicts | the response self-check, on every response |
| a missing `.alsoChanges` or a field wrongly in `.unaffectedBy` | the property test's app layer, for entries the fixture overrides |
| a domain with no property test | `flow check` warning |
| a prediction or `.as` mapping that is not pure | `flow check`; optionally the property test's sandboxed purity check |
| a literal in a condition or prediction that looks like a secret, or exceeds the size cap | `flow check` |

---

## 10. What this buys

- **It reads as a description of the app.** Each entry is a sentence. Library words are verbs and
  prepositions; everything else is the author's.
- **Operations never import entities**, and adopting entities edits only the domain.
- **One place for every entity fact**, so the impact table, the ownership checks and the generated
  test read the domain alone.
- **No strings for paths or fields.** Renaming a field renames every reference, and a typo is a
  type error.
- **One runtime model.** Deltas, a join, frontiers and consolidation replace a list of rules.

## 11. What it costs

- **Recording has limits.** Conditionals and short-circuits in a recorded function cannot be seen by
  the proxy or the types, and the result is a condition that is too narrow, which makes repair miss
  stale answers. A mandatory `flow check` error must catch them. This is the main new obligation.
- **Identity sits away from the shape.** Renaming `noteId` in a struct breaks the domain's `.list`:
  a type error, fixed in another file.
- **Inference by field name.** A struct field named `title` that means something else is read as
  the note's title. API structs normally agree with their records; nothing writes it down.
- **Two concurrency settings**: `concurrency` on the transaction and `.oneAtATimePerRecord()` in the
  domain. Different concerns, two knobs.

## 12. Why this design

Five designs were written to the same scope and reviewed with the same lenses (git history,
commit `ad129cc4`):

| Design | Why not |
| --- | --- |
| entity-centric: operations live on `Note.members` | two vocabularies; a layer rule agents must apply first; adopting an entity renamed operations in every machine |
| operation-first: `depends`, `optimistic`, `affects` on each operation | an open set, so no closed-world checks or generated test; `"none"` tokens on every operation; a callback form for typing |
| coordinator with picks in results | `when` closures tools cannot read or index; operations imported entities |
| knowledge store | predicted list membership and completeness: the client half of a sync engine, outside tier 1 |
| **this domain** | conditions as data, operations kept plain, one owner per domain, sentences an agent can read; the cost is the recording rule of section 4.4 |

## 13. Open questions

1. **`staleTime` and `gcTime`.** They stay on the operation as request facts. Should a domain be
   able to require them for its reads?
2. **Machine references.** Should definitions accept the raw operation name as an alias for its
   domain handle, so adoption renames nothing?
3. **Escape hatch.** TanStack DB offers `fn.where` for plain JavaScript that tools cannot analyse.
   Tier 1 does not need one: a condition the client cannot express is left out, which is safe.
   Keep it that way?
4. **Untested shapes.** Arrays of nested entities, nullable and optional places, and unions at a
   place were not exercised by the spike.

5. **The amendments in sections 6.6 and 7.6.** They change the StoriesAndModels, CommandLine and
   InspectionAndArtifacts plans (new evidence fields, read helpers, a fixture helper, CLI flags,
   diff sections, trace events). Each needs that plan's approval.
6. **The property test's budget.** 50 runs of 40 steps is a guess; it needs measuring on a real
   domain before the defaults are fixed.

**Settled:** the record shape is inferred, with an optional explicit pick, and chains need no
annotations (the type spike, section 15). Absent inputs mean "no constraint", calendars get
`overlaps`, and two entity types at one place are matched by key fields or a tagged union (section
4). Stories read records and answers from the checkpoint's store revision; live snapshots read
through Runtime-internal bookkeeping and gain no public field (section 6.2). The property test is a
test-host helper with two layers and a from-scratch oracle (section 8). The fixture defaults to the
domain's declarations, with overrides for the real server (section 6.1).

## 14. Research behind the choices

| Choice | Source |
| --- | --- |
| callbacks called once with recording proxies; a plain expression IR (`ref`, `val`, `func`) | TanStack DB `query/builder/ref-proxy.ts` and `query/ir.ts` |
| operators instead of `===`; rejecting a boolean with the right form in the message | TanStack DB `InvalidWhereExpressionError` |
| throwing from conversion hooks; caching child proxies; forbidding calls | proxy-recording prior art (TanStack DB, Immer, Vue reactivity) |
| conditionals are invisible to a probe and need a lint | Vue's dependency tracking and Immer's documented pitfalls |
| repair as an indexed join of changes and subscriptions, with a scanned fallback | Electric's `Shapes.Filter` (equality and inclusion indexes, `other_shapes` scans) |
| deltas, the join delta rule, frontiers, consolidation | differential dataflow and DBSP |
| no dataflow library at runtime | d2ts is dormant (last release June 2025); `@tanstack/db-ivm` computes results, which tier 1 does not |

## 15. Type spike results

A spike built the types and a small real recording runtime for this draft's surface, with the notes
app written without annotations. Re-run: the positive set compiles in about 0.07 seconds, the 26
runtime checks pass, and the negative files produce 26 type errors at the intended places.

| Question | Result |
| --- | --- |
| record shape inferred from a plain struct at `.one` and `.list` | works: `record` in `.where` is exactly the inferred pick; context fields (`highlight`, `total`) drop out; nested entities match recursively |
| chains infer `input`, `record`, `result` with no annotations | works, provided the resource's `key` parameter is annotated (it already is) |
| `.unaffectedBy` restricted to inferred, non-key fields | works |
| `eq` operand types; `oneOf`, `contains`, `between` on the wrong field types | errors, one to three lines each |
| `===` in `.where` | a type error and a runtime error naming the right form |
| arithmetic, templates, `String(x)`, method calls on recorded values | runtime errors naming the path |
| a mistyped place path; a place lacking the key | type errors; at runtime, an error listing the real fields or the missing key |
| `.predicts` touching another entity type | a type error: `"folders/Folder" is not assignable to "notes/Note"` |
| `?:`, `&&`, `\|\|` in `.where` | **compiles and runs, silently recording one branch**: needs the mandatory `flow check` rule |

**What the spike changes in the design:**

- **Keep inference, and allow an optional explicit pick** (`.list(Note.pick("title"), at)`). Naming
  the pick rejects extra same-named fields, which removes the name-collision risk where it matters.
- **Errors need named "verify" types.** A plain constraint printed a six-line dump before the cause;
  a verify type names the cause in words ("record needs key field `noteId`"). The library must use
  that form throughout and give entities a short printed name, because every error that mentions an
  entity otherwise prints its whole type.
- **A nested mismatch** (`author.userId` with the wrong type) is reported only as "field `author`
  does not have the entity's type"; naming the inner field needs a recursive check.

## 16. Review record

**Draft 4** applies four reviews of draft 3's sections 6 to 8 (Stories consistency, CLI and
inspection, verification validity, agent experience). Findings were checked against the
StoriesAndModels, CommandLine and InspectionAndArtifacts plans.

| Finding | Change |
| --- | --- |
| `convergenceStory` was a new Story kind, which StoriesAndModels O1 forbids | `propertyTest`, a test-host helper generating ordinary static Stories, 8.1 |
| the test checked only the final state, so it verified C2 alone | properties checked at every publication and over the trace, 8.2 |
| the reference server shared the runtime's condition and patch semantics, so it was circular | a from-scratch evaluator, index-versus-scan comparison, and mutation tests, 8.3 |
| "quiet", the action alphabet, shrinking and cost were unspecified | 8.1, 8.2, 8.4, 8.5 |
| out-of-order responses, versions, held and contested fields, restores were not generated | 8.4, with coverage counters |
| a run could pass vacuously | vacuity guards, 8.4 |
| the test's blind spot for one-branch recordings was unstated | 8.5 |
| `checkpoint.repairs` and `skipped` were outside O4's cut; "since the previous checkpoint" broke under branching | cumulative, projected from captured evidence, canonical order, 6.3 |
| no way to read a list or count at a checkpoint | `Domain.entry.get(checkpoint, input)`, 6.2 |
| the hidden snapshot link would not survive copying or serialising | Stories read from the checkpoint's store revision, 6.2 |
| `statefulFixture` duplicated the domain's conditions and its state could leak across runs | defaults from the domain, overrides for the real server, state created per Runtime, 6.1 |
| scripted pushes had undefined timing and could silently never fire | 6.1, `undeliveredPushes` |
| consolidation per drain differed between Stories and production | one scheduler turn, 6.4 |
| running predictions twice broke seeded ids and the one-executor rule | removed, 6.4 |
| `because` was prose; `cause` clashed with Effect's `Cause` | structured fields; `source`, 6.3 |
| new CLI flags broke the closed grammar; evidence mode executed a Story | evidence reads a trace artifact; amendments listed, 7.3 and 7.6 |
| no "sentences" render format | `text`, a projection of the same data, 7.1 |
| delta values escaped artifact redaction | digests in artifacts, values only in memory, `sensitive` fields, 7.4 |
| skip events were unbounded | only index candidates, per-turn counters, 7.4 |
| several "why" questions had no command | the reverse view, the record-at-sequence view, why-not in evidence mode, 7.2 and 7.3 |
| the trace missed restores, invalidations, gc, tombstones, self-checks and refetch outcomes; `recording` duplicated the App identity | events added; `recording` removed, 7.4 |
| the impact table over- and under-reported | certain and possible columns; reconnect and invalidate rows, 7.2 |
| an unregistered transaction silently repaired nothing; the notes example had no `move` | `flow check` covers transactions and streams, 9; `move` added, 3.3 |
