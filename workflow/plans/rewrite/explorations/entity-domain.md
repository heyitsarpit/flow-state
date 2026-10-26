# Entity domain: the tier-1 proposal (draft 7)

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

A domain is the shared-data meaning of one feature's operations (notes and their folders). Its
contract:

1. **Closed set.** It lists every operation that reads, writes or reports changes to its entities.
   Each operation belongs to at most one domain.
2. **Sole handle.** Machines reach those operations only through the domain (`O.Notes.rename`).
3. **Declarations only.** Every function in it is recorded once (section 4); nothing in it sends,
   commits, reads another resource or chooses a state.
4. **Ownership.** It names the API service it owns (`{ api: NotesApi }`); an operation that requires
   that service must be registered in it.
5. **Shared entities, one join.** Entities belong to no domain. Any domain may hold, list, predict
   and target any entity, and repair runs over every active answer in the App, whichever domain
   declared it: a user renamed in `users` updates every note's author by the store, and repairs a
   `notes` answer only if that answer's condition or order reads the user. A domain declares only
   what its own writes do beyond the records they return (`.alsoChanges`), so no team lists another
   team's writes.
6. **Configured, not programmed.** Its behaviour is the runtime's fixed algorithm (section 5). It is
   not a machine and has no user logic, because cache-maintenance code written by authors is the
   code that fails. Machines remain the only place workflow is written.

## 2. Reading a domain

Every name in a domain is either **yours** or one of a small, fixed set of **library words**.

| Yours                                                  | The library's                                          |
| ------------------------------------------------------ | ------------------------------------------------------ |
| the domain's id and the keys of its entries (`inFolder`, `rename`) | `domain`, `read`, `write`, `listen`        |
| entity names (`Note`) and their fields (`folderId`)    | `.one`, `.list`, `.derivedFrom`, `.byKey`              |
| operations (`notesInFolder`, `renameNote`)             | `.where`, `.orderBy`, `.pagedBy`, `.ignoring`, `.unaffectedBy`, `.predicts`, `.alsoChanges`, `.concurrent` |
| values inside functions (`input.folderId`)             | the operators `eq`, `oneOf`, `contains`, `between`, `overlaps`, `and`, `serverMatches`, `asc`, `desc` |

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
| `.derivedFrom(Entity, fields?)` | the result is computed from records it does not hold: from which records meet `.where` (a count), and from these fields of them (a sum, a quote) |
| `.byKey(({ input }) => key)` | this read is how one record is loaded by its key |
| `.where(({ input, record }) => condition)` | only records meeting this condition can be in, or count toward, this result |
| `.orderBy(({ record }) => [desc(record.pinned), asc(record.noteId)])` | the server returns the list in this total order, ending with the key; checked on every response |
| `.pagedBy(({ input }) => input.cursor)` | this input picks a page; it is not a condition |
| `.ignoring(({ input }) => [input.locale])` | these inputs change neither which records nor their order |
| `.unaffectedBy(...fields)` | only on a list without `.orderBy` (ranked by the server): a change to these fields cannot make it wrong |
| `.predicts(({ input }) => changes)` | what to show before the server answers; `Note.delete(key)` hides a record |
| `.alsoChanges(({ input }) => targets)` | the server also changes these records, which the response does not carry: `Txn.all`, or `Txn.where(…)` |
| `.concurrent()` | writes to one record may run at once; without it, a predicting write queues per record across every screen |
| `.as((event) => change)` | how one stream event becomes a record change |
| `eq`, `oneOf`, `contains`, `between`, `overlaps`, `and` | conditions inside `.where` and `Entity.where` |
| `serverMatches(input.q, record.title, record.body)` | the server filters on these in a way the client cannot evaluate |
| `asc`, `desc` | sort keys inside `.orderBy` |
| `Note.patch`, `Note.save`, `Note.delete`, `Note.all`, `Note.where` | changes to, and sets of, records |

### 2.2 What can make an answer wrong

The record store keeps every copy of a field right (C1), so a field an answer merely displays never
makes it wrong. Only these changes repair an answer:

| Answer | Repaired when |
| --- | --- |
| `.one` | the record is deleted; the store keeps its fields right |
| `.list` with `.orderBy` | a record enters or leaves the condition, or an order field of a record in it changes |
| `.list` without `.orderBy` | a record enters or leaves the condition, or any field not in `.unaffectedBy` changes: the order is the server's own |
| `.derivedFrom(E)` | a record enters or leaves the condition |
| `.derivedFrom(E, fields)` | also, one of those fields of a record meeting the condition changes |
| any answer | a write's `.alsoChanges` target overlaps it, or a reconnect, restore or `invalidate` covers its entity |

A list with no `.where` has every record of the entity in its condition, so a create or a delete
repairs it. The entity's version field never repairs (section 5.1).

**Omission must stay safe (G7).** Section 2.2 trusts the declared condition, so a filter left out
would make a list miss repairs. Four rules keep a missing filter loud or safe:

1. **Every input is accounted for.** Each field of a list's or derived read's input appears in
   `.where`, `.orderBy`, `.pagedBy` or `.ignoring`; an input the domain never mentions is a `flow
   check` error, because an unused input is how a hidden filter shows itself (a search's `q`).
2. **A filter the client cannot evaluate is declared, not dropped:** `serverMatches(input.q,
   record.title, record.body)` may hold for any record, and a change to any field it names repairs.
   With no record fields, `serverMatches(input.q)` means any field repairs.
3. **An order is total.** `.orderBy` ends with the entity's key fields (a type error otherwise), so
   a sort key the domain left out breaks the declared order on the first tie and reports
   `HiddenOrder`.
4. **A filter with no input** (the server hides archived records) cannot be seen statically. Declare
   it as a constant (`eq(record.archived, false)`); the response check catches a returned record
   that contradicts the condition, and in development and tests the skip audit (section 9) reports
   `HiddenFilter` for one the server silently left out.

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
  key: (input: { folderId: string; cursor?: string }) => input,
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
export const createNote = transaction({ id: "notes/create", input: CreateInput, … });
export const deleteNote = transaction({ id: "notes/delete", input: DeleteInput, … });
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
    .orderBy(({ record }) => [desc(record.pinned), asc(record.title), asc(record.noteId)])
    .pagedBy(({ input }) => input.cursor),

  pinnedCount: read(pinnedCount)
    .derivedFrom(Note)
    .where(({ record }) => eq(record.pinned, true)),

  search: read(searchNotes)
    .list(Note, ({ result }) => result.hits.note)
    .where(({ input, record }) => and(
      eq(record.workspaceId, input.workspaceId),
      serverMatches(input.q, record.title, record.body),
    ))
    .unaffectedBy("author"),

  create: write(createNote).one(Note),

  rename: write(renameNote)
    .one(Note)
    .predicts(({ input }) => Note.patch(input.key, { title: input.title })),

  move: write(moveNote)
    .one(Note)
    .predicts(({ input }) => Note.patch(input.key, { folderId: input.to })),

  remove: write(deleteNote).predicts(({ input }) => Note.delete(input.key)),

  events: listen(noteEvents).as((event) =>
    event.type === "noteSaved" ? Note.save(event.note) : Note.delete({ noteId: event.noteId })),
});
```

Read aloud:

- **noteById** reads one note, and is how a note is loaded by its key.
- **inFolder** reads pages of notes at `result.notes`, paged by the input's cursor. Only notes in
  the input's folder can be in it, and the server orders them pinned first, then by title. So it is
  repaired when a note enters or leaves the folder, is pinned or unpinned, or is renamed, and never
  when an author's name or a body changes.
- **pinnedCount** is derived from which notes are pinned.
- **search** reads a list of notes at `result.hits.note`, scoped to the input's workspace, matched
  against `input.q` by the server on title and body, and ranked by the server. The ranking is not
  something the client can state, so any change to a note in the workspace can make the result
  wrong, except a change to its author.
- **create** writes one note. A new note appears in a list when that list's refetch lands.
- **rename** writes one note and predicts its new title; **move** predicts its new folder. Both
  queue behind other writes to the same note.
- **remove** deletes a note and hides it everywhere at once.
- **events** turns each pushed event into a saved or deleted note.

### 3.5 The smallest domain

A two-screen todo app needs this much:

```ts
export const Todo = entity({ id: "todos/Todo", fields: TodoRow.fields, primaryKey: ["todoId"] });

export const TodosDomain = domain("todos", { api: TodosApi }, {
  list: read(todos).list(Todo, ({ result }) => result),
  add: write(addTodo).one(Todo),
  toggle: write(toggleTodo)
    .one(Todo)
    .predicts(({ input }) => Todo.patch(input.key, { done: input.done })),
  remove: write(removeTodo).predicts(({ input }) => Todo.delete(input.key)),
});
```

- **The record is declared once.** The entity reuses the row struct's fields (`TodoRow.fields` is a
  plain Effect Schema property); a field the row lacks, or a nested entity, is written beside the
  spread.
- **No condition and no order.** Every change to a todo repairs the list: correct, and cheap at this
  size. Add `.where` and `.orderBy` when `flow trace summarize` shows refetches that are not worth
  making.
- **A new todo** shows from the composer machine's memory until the list's refetch holds its key
  (section 5.6, Creates).
- **No test is required.** `propertyTest` is worth adding when the domain grows (section 8).

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
  one that matches both is a type error. In such an entry, `record` in `.where` and `.orderBy` has
  the fields the listed entities share.

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
when absent is not expressible, and is written with `serverMatches` (below).

**Filters the client cannot evaluate (`serverMatches`).** `serverMatches(input.q, record.title,
record.body)` records which input the server matches against which record fields. It counts as
possibly met by every record, and its record fields are condition fields, so a change to any of
them repairs the answer. `serverMatches(input.folderId, record.parentId)` describes a subtree the
server computes. It is the only way to say "the server filters on this", and section 2.2 requires
it whenever an input filters in a way the operators cannot state.

**Order (`.orderBy`).** `({ record }) => [desc(record.pinned), asc(record.title),
asc(record.noteId)]` records the sort keys. The order is total: it ends with the entity's key
fields, so no two records tie and a sort key the server uses but the domain omits shows up on the
first response holding two records it orders differently. Every response is checked against it,
across consecutive pages too. A list out of order reports `HiddenOrder`, and that answer is treated
as having no `.orderBy`, so every field repairs it, for the rest of the Runtime. The order is a
claim about the server, never something the client sorts by.

**Pages (`.pagedBy`).** `({ input }) => input.cursor` names the input that picks a page: a cursor,
an offset or a page number. It is part of the answer's identity but not a condition: the pages
loaded for one input without the paging field form one paged answer. A repair refetches every loaded
page in order from the first, as TanStack Query's infinite queries do, because a record that moves
changes which page later records fall on.

### 4.3 Predictions and other changes (`.predicts`, `.alsoChanges`, `.as`)

`({ input }) => Note.patch(input.key, { title: input.title })` records **which** record changes:
a `Note`, at the key `input.key`. The values are computed for real when the write starts. A patch
may compute from the record itself (`Post.patch(input.key, (post) => ({ likeCount:
post.likeCount + 1 }))`); that function runs only at runtime and is never recorded.

`.alsoChanges(({ input }) => Txn.where(({ record }) => eq(record.accountId, input.from)))` records a
target in the language of `.where`. An answer is a target when a record could meet both its
condition and the target's: equal-to-a-value conditions on the same field are compared, and anything
else counts as overlapping. `Txn.all` targets every answer on the entity.

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
operators.** Logic the client cannot express that way belongs in the server's query and is
declared with `serverMatches`, naming the inputs and record fields it reads (section 2.2).

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
| a response revealing a changed record | an **observed** delta from the stored base to the newer value; it repairs one hop at most (5.2) |
| a push (`listen`) | a delta from the stored base to the pushed value, or to nothing for a delete |

A failed write's predicted delta is removed: retraction is the inverse delta, and no rollback rule
is needed. A predicted field that a settled write's response does not carry is **unconfirmed**: it
ends when a confirming read lands (section 5.6), never by waiting for a later delta that may not
come.

**Predictions are replayed, not stored.** A predicted delta keeps its function (`(post) => ({
likeCount: post.likeCount + 1 })`). Whenever a record's base changes, its live predictions are
recomputed over the new base in start order. Two `+1` predictions stay `+2` over any base, and
retracting one leaves `+1` (Relay's revert-and-reapply, Apollo's layer replay; section 14).

**The version field is not a change.** A delta that changes only the entity's `version` field
matches no answer. Versions order writes (section 5.6); they never repair.

### 5.2 Repair is a join

Finding the answers a change can make wrong is a **join** of two changing collections: record
deltas and active answers, matched on the answers' conditions.

- An answer matches a delta when the delta's **old or new** value meets the answer's `.where` (a
  field the delta does not carry counts as meeting it) and the delta changes a field that can make
  that kind of answer wrong (section 2.2). Moving a record into or out of the condition always
  matches.
- **Observed deltas repair one hop.** A delta revealed by the response to a machine's request (a
  load, a `staleTime` refetch, a focus refetch) repairs like any other. A delta revealed by a
  **repair's** response updates the record's copies (C1) and marks the answers it matches `stale`
  with an observed cause, but starts no lookup; the next machine request or local cause refreshes
  them. A delta that only fills a field the store did not hold is not a change. So a refetch's own
  response never causes another refetch (C3), and no loop guard is needed. TanStack DB, Apollo
  (whose `cache-and-network` policy cascades exactly this way, apollo-client#6760) and Relay all
  stop here.
- **One in flight, one waiting.** An answer has at most one repair lookup in flight. Deltas that
  match it meanwhile mark that lookup stale on arrival (the fence) and queue a single trailing
  refetch, however many arrive. Sustained traffic costs an answer one refetch at a time, back to
  back, and consolidation per turn is no longer the only control.
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

### 5.4 Values consolidate per turn; causes do not

All field deltas produced in one scheduler turn are consolidated per record before the join runs,
so a bulk write repairs each answer once and a value set and set back within the turn shows no
change.

Consolidation applies to **values** only. A write settling (success, failure or uncertain), an
`.alsoChanges`, a pushed delete, `invalidate`, a reconnect and a restore are **causes**, and each
keeps its repair obligations even when the values it touched net to nothing: the server saw the
intermediate value, and whatever else it did is invisible to the client. A settled write's affected
answers are computed from **its own delta** (the base before its prediction to its response), not
from the turn's net. Obligations are a set keyed by answer and cause; several causes met by one
refetch cost one refetch. No sync engine or normalized cache consolidates obligations (section 14).

### 5.5 What this replaces

| Former special rule | Now |
| --- | --- |
| rollback on failure | removing a predicted delta |
| held fields | an unconfirmed prediction, ended by a confirming read (5.6) |
| the in-flight fence | the second half of the join |
| the stale floor | the frontier |
| coalescing within a window | values consolidated per turn; causes never consolidated (5.4) |
| one-hop repair | an observed delta from a repair's response marks stale and starts nothing (5.2) |

Behaviour is unchanged; the rules now follow from one model, and a missing case shows up as a
missing term.

### 5.6 Store rules

**Records.** One record per key holds the fields received so far, each with the version, start
revision and landed revision of the write that set it. A record's **base** is what the server has
said; its **visible** value is the base with live predicted deltas on top.

**Ordering.** A write replaces a stored field when both carry a version and its version is strictly
greater (a lower version is rejected; an equal one falls through), or otherwise when its request
started at or after the stored field's landed revision. A lookup's start is when it was sent; a
push's is when it arrived; a write's confirmed fields start when the write settled. A field the
store does not hold is filled by any response, however old, so a late older response still
contributes the fields the newer one lacked.

**Contested fields.** Without versions, start order is not server truth. A field is contested when
a write carries a different value and either lands on a field another write set after this write was
sent, or is skipped by the ordering rule. A contested record is refetched by its loader and every
answer holding it; when the contest came from a repair's response, they are marked stale instead
(5.2), so contests cannot loop. If one field flips between two sources twice in a row,
`FieldDisagrees` is reported: two endpoints use one name for different values.

**How a write ends.**

| Ending | Predicted deltas | Repair |
| --- | --- | --- |
| success | fields the response carries replace them; a predicted field it omits is **unconfirmed** | affected answers, from the write's own delta; plus one confirming read if a field is unconfirmed |
| failure or defect | removed | affected answers, all fields |
| rejected, or cancelled before sending | removed | none |
| uncertain (cancelled after sending, response lost, restored mid-flight) | kept, every field **unconfirmed** | **forced**: the record's loader and every answer holding it refetch; then as in "Uncertain writes" below |

**Uncertain writes.** A read cannot prove that an uncertain write will not still apply: the server
may run a cancelled or lost request after the read returns. The forced repair shows the server's
state now, not the write's fate. Tier 1 offers three levels, strongest first:

1. **A status witness.** A transaction may declare `status: (attempt) => lookup`, a request fact
   that asks the server whether an attempt was applied; with the attempt id as an idempotency key
   the answer is final. Until it answers, the record's queue stays halted and its predictions stay
   `pending`. *Applied* lets the next read confirm them; *not applied* removes them.
2. **Conditional writes.** On a versioned entity, every write sends the version its prediction was
   computed over (`commit` receives `basedOn`, which an API sends as `If-Match`). The queue resumes
   after the forced repair; if the uncertain write applies late, the next write is rejected as a
   conflict and fails, which repairs. Nothing is lost silently, though the user may see a conflict.
3. **Neither.** The queue resumes after the forced repair. The record's status stays `uncertain` for
   the transaction's uncertainty window (`uncertainFor`, default 30 seconds), and one more forced
   repair, caused by the same write, runs when it ends. A late application inside the window is
   caught; one after it is not. `flow check` warns on a predicting write to an unversioned entity
   whose transaction has no status witness.

`status`, `basedOn` and `uncertainFor` are amendments to the Transactions plan. The runtime never
retries an uncertain write by itself. A transaction's `commit` receives the
attempt's id; an API that deduplicates by key sends it (an `Idempotency-Key` header), which is a
request fact on the operation, not a domain declaration.

**Unconfirmed predictions end by a confirming read.** Confirmation is a fact about a read, not about
a value: this is Replicache's `lastMutationID` and Linear's sync-id wait in request-and-response
form.

- A **confirming read** started after the write settled and carries the field for the record: the
  `.byKey` loader, or any answer whose shape carries the field. When it lands, its base replaces the
  prediction, whether or not the value changed.
- **A read that omits the record confirms nothing.** It removes the record from that answer (C6),
  and the next candidate is scheduled. The prediction ends when a read carries the field, or when no
  active answer and no loader holds the record any more, since nothing can then display it. A
  `notFound` from the loader confirms a predicted delete.
- **Settlement schedules one**: an affected answer that carries the field if one is already
  refetching, otherwise the loader, otherwise one active answer that carries it. It is a repair
  whose cause is the write, so C3 holds.
- **If nothing active carries the field**, nothing can display it, and the prediction ends at
  settlement.
- **If the confirming read fails**, the field stays unconfirmed and `pending`, and the next
  successful read that carries it confirms it. A prediction never outlives its confirmation, so it
  cannot mask a newer server value.
- **No flicker.** Until confirmed, the field shows the predicted value marked `pending`; it does not
  fall back to the old base while the confirming read runs.
- **Witnesses, not mechanisms.** A prediction ends on a confirmation witness. Tier 1 has two: the
  write's response carries the field, or a confirming read lands. Frontiers are opaque comparable
  positions, not local integers. A sync engine adapter supplies its own witness (a transaction id)
  and positions (a log offset) without changing a declaration.

**Publication.** Applying a response and dropping the predictions it confirms is one publication: no
publication shows a field older than a settled write's confirmed value. An answer being repaired
keeps serving its last complete data, marked `stale`, until the refetch lands whole.

**Per-record queues.** A write with `.predicts` keeps one write in flight per record, first in,
first out, across every screen, unless it is `.concurrent()`. It is layered under the transaction's
own concurrency (Transactions O2), never instead of it:

- **The actor decides first.** The transaction's `concurrency` (`reject`, `cancel`, `allow`,
  `serialize`) decides whether and when an occurrence starts, and its preview applies at that start,
  as `minimal-library.md` section 6 says ("optimistic writes apply when the commit starts").
- **Then the record queue.** A started occurrence joins the queue of every record it predicts, in
  one step, and is sent when it heads all of them. Joining all queues at once gives every queue the
  same relative order, so two writes over the same two records cannot deadlock.
- **Its prediction shows on joining,** stacked in start order and replayed over each new base (5.1).
  A queued occurrence the actor cancels is removed without starting its adapter and settles
  interrupted, as Transactions' queued work does.
- **The queue waits on nothing but its writes:** no focus or connectivity gate.

Endings release it as follows:

| Ending of the write in flight | Queue |
| --- | --- |
| success or failure | the next write is sent |
| a queued write cancelled | removed; no repair, as for "cancelled before sending" |
| uncertain | **halted** until the uncertain write is resolved ("Uncertain writes" above); the queued predictions are replayed over the repaired base; then the next write is sent |

This is Replicache's and Zero's rule: a temporary error halts the queue, and a permanent one is
skipped.

**Creates.** A write that creates returns the record (`.one(Note)`). Its delta, from nothing to the
record, enters every condition it meets, so those answers refetch. Tier 1 never predicts membership,
so the record appears in a list when that refetch lands. Until then the machine that created it
shows it from its memory: the documented pattern is a draft item the view renders beside the answer
until the answer holds its key. TanStack DB's hardest open problems are temporary ids and the echo
of an optimistic insert; tier 1 avoids both by construction.

**Predicted deletes.** `.predicts(({ input }) => Note.delete(input.key))` hides the record in every
answer, marked `pending`, from the moment the write starts (C6 allows a live prediction to hide a
record). Success confirms the delete and leaves a tombstone, and answers whose condition the record
met refetch (a count changes); failure brings the record back; uncertain keeps it hidden and pending
until the forced repair shows whether it exists.

**Holding.** A record exists while an answer references it (until the answer's `gcTime` after its
last subscriber), a loader subscription holds it, or a predicted delta is live. A pushed change to a
record nothing holds is matched against active answers (unknown fields count as matching) and makes
the matching ones stale; the record itself is not stored.

**Deletes.** A delete hides the record in every answer and leaves a tombstone while any lookup that
started before it is in flight, so that lookup cannot bring the record back. When the entity has a
version, the tombstone keeps the delete's version until the record's `gcTime`, and a save at a lower
or equal version, from a response or a push, cannot bring the record back. Without versions, pushes
are ordered by arrival and the tombstone guards only lookups. A non-list reference to a deleted
record (`note.folder`) marks the answers holding it stale and reads as a typed `Deleted` value,
never as `undefined`. A `notFound` never deletes a record whose create is unsettled.

**Persistence.** Only confirmed data is persisted: each persisted answer's references and context,
and for each record only the fields persisted answers project. Restore writes at revision 0 and
lowers every restored answer's frontier, so live data wins. A write restored as uncertain keeps its
records `pending` until its forced repair lands. A different principal is a new Runtime.

**Hydration.** Data rendered on the server is confirmed data at the server render's position, and
respects each answer's `staleTime`. It is not a restore, which lowers frontiers so live data wins.

**Status.** Every answer read (`useView`, `Domain.entry.get`) carries `{ data, stale, pending,
source }`: `stale` is `false` or the cause that made it stale, `pending` is true while it shows an
unconfirmed prediction, and `source` is `network`, `hydrated` or `restored`. Every record read
carries `{ data, pending, uncertain }`. These are public from the first version, so a sync engine's
`complete` can be added later without a breaking change (Zero's result types, Firestore's snapshot
metadata).


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
  predicted fields and returns the record, a create adds the record with a seeded id, and a
  predicted delete removes it. These defaults are the **reference layer** of section 8. An entry
  whose condition uses `serverMatches` has no derived default, because the client cannot evaluate
  it, so it needs an override; a missing one is a type error.
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
| `NotesDomain.inFolder.get(checkpoint, input)` | the answer at that revision: `{ data, stale, pending, source }` (section 5.6), or `undefined` if no active answer has that input; for a paged answer, the loaded pages in order |

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
recorded conditions and orders as expression trees (`ref`, `val`, `func`), paging inputs,
`unaffectedBy`, predicted fields, other changes, ordering and edges to other domains. The layout is
added to the InspectionAndArtifacts schema (V4) as a declared nested layout.

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
inFolder     reads pages of Note at result.notes, paged by input.cursor
             where record.folderId = input.folderId; ordered by pinned desc, title, noteId
pinnedCount  derived from Note where record.pinned = true
search       reads a list of Note at result.hits.note where record.workspaceId = input.workspaceId
             and the server matches input.q on title, body
             ranked by the server; unaffected by author
create       writes one Note
rename       writes one Note; predicts title; one at a time per record
move         writes one Note; predicts folderId; one at a time per record
remove       deletes Note; predicts the delete
events       listens; saves or deletes Note

impact       source      read          certain                  possible
             create      inFolder      enters (condition)       —
             create      pinnedCount   enters, if pinned        —
             create      search        enters                   —
             rename      inFolder      title (order)            folderId, pinned in the response
             rename      search        title                    any field in the response
             move        inFolder      folderId (condition)     pinned, title in the response
             move        search        folderId                 any field in the response
             remove      every read    leaves (hidden at once)  —
             events      every read    —                        any pushed field
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
| why does this record show this value | `trace summarize --entity Note:n7 --at <sequence>`: the base value, live predictions, unconfirmed fields, and the delta that set each field |
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
| `prediction` | started, settled, replayed, unconfirmed field confirmed or ended, with its attempt and the confirming read |
| `byKey` | a loader read served from the store or sent to the server |
| `invalidate`, `reconnect`, `restore` | the source and the entities it covers |
| `tombstone`, `gc` | record, reason |
| `selfCheck` | a response record that contradicted a read's condition, or a list out of its declared order (`HiddenOrder`) |
| `observed` | an answer marked stale by a repair's response, with the delta; no lookup started |
| `skipAudit` | a skipped answer refetched in the background in development or tests, and whether it differed (`HiddenFilter`) |

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
them. For current state it offers a passive read, `inspect(runtime).domains.notes.answers()`, at one
store revision: each active answer's frontier, live predictions with their attempts, and unconfirmed
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
- **Several domains.** Repair spans domains, so domains whose entities overlap are tested together:
  `propertyTest([NotesDomain, FoldersDomain], …)`.
- **Results:** pass, fail, or inconclusive. A run that reaches the turn bound or leaves external
  work pending is inconclusive, never a pass or a failure.
- **A failure** is shrunk and printed as a static Story with literal records, inputs and delivery
  schedule, plus the seed, the failed property and the first publication that broke it. The printed
  Story is re-run before printing; if it does not reproduce, it is printed as "not reproduced".

### 8.2 What it checks

| Property | Checked |
| --- | --- |
| C1 coherence | at every publication: all copies of each record field agree |
| C2 convergence | once quiet: every active answer equals the oracle's answer, element by element, including context fields, or is marked stale with a recorded observed cause; lists compared in their declared order where they have one, as sets otherwise |
| C3 no cascades | every repair has exactly one source; no lookup starts from a repair's response; repairs per source stay within a bound |
| C4 monotonic truth | every field's version and landed revision never move backwards, except through a recorded forced repair |
| C5 honest prediction | every displayed unconfirmed value is an overlay with a live attempt and is `pending`; every unconfirmed field has a scheduled or failed confirming read; no publication shows a field older than a settled write's confirmed value; persisted data contains no overlay |
| C6 no silent loss | every record that leaves an answer has a recorded reason |
| C7 determinism | each failing plan, and a sample of passing ones, is run twice and the traces compared |
| C8 explainability | every repair, skip and hidden record names its source |

**Quiet** is a fixed suffix of existing commands: `process()`; then `advanceToNextTimer()` and
`process()` until no timer remains or a horizon is reached; then a checkpoint. After it, the clock
is advanced a long way and no new lookup may start: a refetch loop shows up here.

### 8.3 Two oracles, two owners

| Layer | Runs in | Server | Oracle | A failure means |
| --- | --- | --- | --- | --- |
| **library** | Flow State's own suite, over this document's example domains and generated ones | the fixture's derived defaults | a **from-scratch evaluator**: recomputes each answer by filtering and ordering the server's records, written separately from the runtime's indexed join | the repair runtime is wrong: a Flow State bug |
| **app** | the app's `propertyTest` | the fixture with its overrides | **the fixture itself**: each answer's expected value is the fixture's read for that input, called on the fixture's current state, so it never consults the domain | the declarations disagree with the author's server: a missing `.alsoChanges`, a filter or order the domain left out, a field wrongly in `.unaffectedBy` |

- **The app oracle never reads the domain.** A filter or order an override applies and the domain
  omits makes the fixture's answer differ from the repaired one, which is a failure. Entries without
  an override use the derived defaults, so for them the app layer adds nothing.
- **The library evaluator is independent of the runtime.** It shares the recorded conditions and
  orders (they are the declaration under test) but not the join, the frontiers or the deltas. It
  also runs every condition through both the index and a full scan, so an indexing bug shows as a
  disagreement.
- **Mutation and coverage checks belong to the library suite.** Flow State's suite runs known-bad
  variants (a dropped `.alsoChanges`, a filter dropped from `.where`, a field dropped from
  `.orderBy`) and fails if any passes, and fails if a runtime rule never fired. An app's
  `propertyTest` reports its coverage counters and does not fail on them.
- **The app layer is only as good as its overrides.** A fixture that copies the domain's conditions
  proves only consistency. The helper reports which entries were overridden; entries with no
  override are covered by the library suite only.

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
  fields, so contested and unconfirmed fields occur.
- **Coverage:** the helper counts how often each runtime rule fires (the fence, tombstones,
  contested and unconfirmed fields, replays, halted queues, observed deltas, page refetches, forced
  repairs, uncertain endings, restores). Flow State's suite fails when a rule never fired; an app's
  run reports the counts. A run with no active answer or no settled write does not count as a pass.

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
| a recorded function is one expression of reads and operators | the proxy and the types for booleans (`===`), conversions and calls; a mandatory `flow check` error for conditionals, short-circuits and impure calls, also run when a domain is constructed in development |
| `.one` and `.list` places exist; inferred record fields have the entity's types | the type system |
| an operation registered in a domain is reached only through it | `flow check` |
| an operation is in at most one domain; a domain's `api` covers its operations' services | the type system for registered values; `flow check` otherwise |
| a resource, transaction or stream whose result or events carry an entity's key fields, or that requires a domain's API service, but is not in a domain | `flow check`: an error for an API service a domain owns, a warning otherwise |
| at most one `.byKey` per entity across the App | `flow check` |
| predictions change only the write's own entity type | the type system |
| a condition the server contradicts, or an order it does not keep | the response self-check, on every response; `HiddenOrder` drops that answer's `.orderBy` |
| `.unaffectedBy` only on a list without `.orderBy`; `.pagedBy` names an optional input; `.orderBy` ends with the key fields | the type system |
| every input of a list or derived read appears in `.where`, `.orderBy`, `.pagedBy` or `.ignoring` | `flow check` error |
| a predicting write to an unversioned entity whose transaction has no `status` witness | `flow check` warning |
| a filter the server applies but the domain left out | the **skip audit**, in development and tests: a sample of answers the join skipped is refetched in the background and compared; a difference reports `HiddenFilter` |
| a missing `.alsoChanges`, or a field wrongly left out of `.where` or `.orderBy` or put in `.unaffectedBy` | the skip audit; the property test's app layer, for entries the fixture overrides |
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
- **It scales both ways.** A two-screen app writes a domain of a few lines with no conditions, no
  order and no test (section 3.5). A large app adds conditions and orders where traces show
  refetches worth saving, and its teams never list each other's writes, because repair spans
  domains (section 1.1).

## 11. What it costs

- **Recording has limits.** Conditionals and short-circuits in a recorded function cannot be seen by
  the proxy or the types, and the result is a condition that is too narrow, which makes repair miss
  stale answers. A mandatory `flow check` error must catch them. This is the main new obligation.
- **Identity sits away from the shape.** Renaming `noteId` in a struct breaks the domain's `.list`:
  a type error, fixed in another file.
- **Inference by field name.** A struct field named `title` that means something else is read as
  the note's title. API structs normally agree with their records; nothing writes it down.
- **Two concurrency settings**: `concurrency` on the transaction (how one actor issues it) and
  `.concurrent()` in the domain (whether writes to one record queue). Different concerns, two knobs.
- **A declared order trusts the declared filters.** With `.orderBy`, a change to a field outside the
  condition and the order repairs nothing. Filters driven by an input are caught by the input rule
  and orders by the total-order check; a constant filter the server applies and the domain omits is
  caught only by the skip audit or the app's property test.
- **Uncertain writes are only as safe as the API.** Without a status witness or versions, a write
  that applies after its uncertainty window is not noticed until something else refetches.
- **Indexes cut matching, not refetches.** A broad derived read or an `Entity.all` target still
  refetches every answer it reaches; `flow explain` shows which.
- **Observed staleness waits.** An answer a repair's response marked stale stays stale, and says so,
  until the next machine request or local cause.
- **Pages refetch together.** A repair of a paged answer refetches every loaded page, which is the
  price of never predicting where a moved record lands.
- **Creates show late.** A new record appears in a list when its refetch lands; the machine shows it
  from memory until then.

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

### 13.1 Decided in draft 6

The draft 5 review raised six decisions; draft 6 takes the recommendation on each. The alternatives
are recorded so they can be revisited.

| Decision | Taken | Not taken |
| --- | --- | --- |
| D1. a response that reveals a changed record (C2 against C3) | observed deltas repair one hop; a repair's response only marks stale (5.2); C2 gains "or is marked stale with a recorded observed cause" | amending C3 so repairs may chain, with termination argued from monotonic bases |
| D2. which fields can make a list wrong | section 2.2: condition and order fields, with a verified `.orderBy`; `.unaffectedBy` only for server-ranked lists | listing unaffected fields on every list |
| D3. repair across domains | entities belong to no domain; one join across the App; writers declare effects with `.alsoChanges`, narrowed by `Entity.where`; `.dependsOn` removed | `.dependsOn` with a completeness check; a named tag per entity (RTK Query) |
| D4. the small-app on-ramp | a domain with no conditions (3.5); `fields: Row.fields`; predicting writes queue by default (`.concurrent()` opts out); no property-test warning; mutation and coverage gates in Flow State's suite | a `flow scaffold domain` command, which would change CommandLine's closed command set |
| D5. undeclared shapes | predicted deletes, the creates pattern, `.pagedBy`, hydration (4.2, 5.6) | predicting creates into lists (tier 2) |
| D6. public status and tier-2 room | `{ data, stale, pending, source }`; confirmation witnesses; opaque frontier positions; the attempt id for idempotency (5.6) | exposing completeness now |

`.count` became `.derivedFrom(Entity, fields?)`, because a folder's size or a quote depends on
fields, not only on which records meet the condition.

### 13.2 Earlier questions

1. **`staleTime` and `gcTime`.** They stay on the operation as request facts. Should a domain be
   able to require them for its reads?
2. **Machine references.** Should definitions accept the raw operation name as an alias for its
   domain handle, so adoption renames nothing?
3. **Escape hatch.** TanStack DB offers `fn.where` for plain JavaScript that tools cannot analyse.
   Tier 1 has `serverMatches` instead, which names the fields such logic reads. Is that enough?
4. **Untested shapes.** Arrays of nested entities, nullable and optional places, and unions at a
   place were not exercised by the spike, nor were draft 6's `.orderBy`, `.pagedBy`, `.derivedFrom`
   fields and `Entity.where` targets.
5. **Paged repair.** A repair refetches every loaded page. Should a paged answer be able to keep
   only its first page on repair, as TanStack Query's `maxPages` does?
6. **The skip audit's sample.** How many skipped answers it refetches, and whether it runs in
   production behind a flag, needs measuring.

7. **The amendments in sections 6.6 and 7.6.** They change the StoriesAndModels, CommandLine and
   InspectionAndArtifacts plans (new evidence fields, read helpers, a fixture helper, CLI flags,
   diff sections, trace events). Each needs that plan's approval.
8. **The property test's budget.** 50 runs of 40 steps is a guess; it needs measuring on a real
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
| predictions replayed over each new base | Relay revert-and-reapply (relay.dev, GraphQL mutations guide); Apollo `EntityStore.Layer` replay |
| a prediction ends by a confirming read, not a value | Replicache `lastMutationID`; Electric and TanStack DB `awaitTxId`; Linear's sync-id wait |
| no flicker between settlement and confirmation; one publication applies and drops | TanStack DB issues #108, #2201, #1602 |
| repair obligations are never consolidated | no reviewed system consolidates them; TanStack DB #1912 (same-tick delete and reinsert) |
| an uncertain write halts its record's queue | Replicache server push (temporary errors halt, permanent ones advance); Zero mutators |
| versioned tombstones | Linear's archive and delete actions; Electric `must-refetch` |
| responses that reveal changes as a cascade source (D1) | apollo-client#6760 (`cache-and-network`); TanStack DB treats a response as observed state |
| affected fields from `where` and `orderBy` (D2) | TanStack DB live queries; Data Client `Collection` `nonFilterArgumentKeys` |

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

**Draft 7** applies a three-lens review of draft 6 (correctness, complexity, performance against
`minimal-library.md`).

| Finding | Change |
| --- | --- |
| an uncertain write's forced repair is not a completion witness; the write can still apply after it | three levels: a status witness, conditional writes on versions, or an uncertainty window with a second repair, 5.6 |
| "leave out a condition you cannot express" was no longer safe once 2.2 trusted declared fields | inputs must be accounted for, `serverMatches`, total orders, the skip audit for constant filters, 2.2 |
| a hidden secondary sort key passed the order check through ties | `.orderBy` ends with the key fields, 4.2 |
| `folderSize` missed moves; calendar promised other series stay fresh, which the overlap rule cannot give | `serverMatches(input.folderId, record.parentId)`; targets narrowed by calendar, and the text corrected (examples) |
| the app oracle used the domain's own conditions, so it could not find what the domain omitted | the app oracle is the fixture's own read, 8.3 |
| a confirming read that omits the record had no defined effect | omission confirms nothing; the prediction ends when nothing holds the record; `notFound` confirms a delete, 5.6 |
| record queues contradicted Transactions' preview-on-dequeue and had no multi-record or actor contract | layered under actor concurrency; atomic joining of every record's queue, 5.6 |
| page repair and sustained events had no control across turns | one repair in flight and one waiting per answer, 5.2; first-page repair is open, 13.2 |

**Draft 6** turns the draft 5 decisions into the API (section 13.1). New words: `.orderBy`,
`.pagedBy`, `.derivedFrom` (replacing `.count`), `.concurrent()` (inverting
`.oneAtATimePerRecord()`), `Entity.where` targets, `asc` and `desc`. Removed: `.dependsOn` and
`ContestLoop`. New rules: what can make an answer wrong (2.2), observed deltas (5.2), creates,
predicted deletes, hydration and status (5.6), and the skip audit (9). The smallest domain is
section 3.5.

**Draft 5** applies a semantics and ergonomics review (an external review centred on C2, C3 and held
predictions) and four prior-art reviews: TanStack DB and Query; Apollo, Relay, urql, Data Client,
RTK Query and Normy; Replicache, Zero, Electric, Firestore, Convex and Linear; and a catalogue of
real-world cache failures with small- and large-app ergonomics. Findings that every source supported
were applied; findings that change the surface or the goals became decisions D1 to D6, taken in
draft 6 (section 13.1).

| Finding | Change |
| --- | --- |
| a held field ended only on a later delta, so a refetch returning the unchanged value left it predicted forever | unconfirmed fields end by a confirming read that settlement schedules, 5.6 |
| removing a prediction at settlement flickers the old value until the repair lands | the prediction stays `pending` until confirmed; apply-and-drop is one publication, 5.6 |
| a prediction computed from the record drifted when the base changed (Relay's `+2`) | predictions are replayed over each new base, 5.1 |
| A to B to A within a turn could drop a write's repairs | values consolidate; causes keep their obligations, from the write's own delta, 5.4 |
| the version field changes on every write, so every row "changed" | the version field never repairs, 5.1 |
| queued writes after an uncertain write were undefined | the queue halts until the forced repair lands, then replays, 5.6 |
| a late save could bring a deleted record back; a deleted reference read as `undefined` | versioned tombstones until `gcTime`; a typed `Deleted`, 5.6 |
| a late older response's extra fields were not stated | fields the store lacks are filled by any response, 5.6 |
| C5 did not cover unconfirmed fields or older publications | the property row extended, 8.2 |
| a response that reveals a change repairs, contradicting C3 | D1, decided in draft 6 |
| long `.unaffectedBy` lists for wide entities | D2, decided in draft 6 |
| cross-domain repair declared by readers; shared entities like `User` unowned | D3, decided in draft 6 |
| a two-screen app writes about 80 lines before any workflow | D4, decided in draft 6 |
| delete writes, creates, paging and hydration have no declared form | D5, decided in draft 6 |
| status is internal; the frontier and confirmation are local-only, which constrains tier 2 | D6, decided in draft 6 |

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
