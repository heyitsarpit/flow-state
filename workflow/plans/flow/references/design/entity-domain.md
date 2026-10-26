# Entity domain: the tier-1 proposal (final)

Status: **final: the tier-1 entity design.** It is measured against
`entities.md` (goals G1–G9, correctness C1–C8) and stays within tier 1 (`entities.md` section 3.3):
records stay coherent, answers are repaired, fields are predicted, and list membership is never
predicted. Outcome O6 of [FlowState.plan](../../FlowState.plan) adopts sections 1 to 9 as normative;
the plan owns the rest of the library. `minimal-library.md` sits beside this file; mentions of the capability Plans
refer to archived provenance under `workflow/plans/archive/rewrite`. Code is illustrative.

It passed the three gates of section 13.1: a type spike, an agent experiment and a fuzzed runtime
model (section 15). The runtime property suite in Flow State's own tests is an implementation
obligation, not a design gate. The designs it was chosen over are in git history at commit
`ad129cc4`; the reviews that shaped it are in the commit history of this file.

---

## 1. The rule

> **An operation describes a request. A domain describes what the request means for shared data.**

- **Request facts stay on the operation:** what is asked, with which input, what comes back (a plain
  Schema), how long the answer may be cached, how one actor issues the request, and what the adapter
  sends (an idempotency key, a base version).
- **Data-policy facts live in the domain:** which records a result holds, which changes can make an
  answer wrong, what a write predicts, and what else a write changes on the server.

An operation module never imports an entity. Adopting entities edits the domain, not the operations.

### 1.1 What a domain is

A domain is the shared-data meaning of one feature's operations (notes and their folders).

1. **Registration is the boundary.** A domain lists the operations it gives meaning to. Each
   operation is registered in at most one domain, and machines reach a registered operation only
   through it (`O.Notes.rename`).
2. **Declarations only.** Nothing in a domain sends, commits, reads another resource or chooses a
   state. Its recorded positions are data (section 4.1); its runtime functions compute values whose
   effects it declares.
3. **Shared entities, one join.** Entities belong to no domain. Any domain may hold, list, predict
   and target any entity, and repair runs over every active answer in the App, whichever domain
   declared it. A domain declares only what its own writes do beyond the records they return
   (`.alsoChanges`), so no team lists another team's writes.
4. **Configured, not programmed.** Its behaviour is the runtime's fixed algorithm (section 5). It is
   not a machine and holds no user logic, because cache-maintenance code written by authors is the
   code that fails. Machines remain the only place workflow is written, including what to do about a
   write whose outcome is unknown.

### 1.2 What tier 1 will not do

Tier 1 is opinionated: each of these is left out because it is wrong for a request cache, or because
it needs a contract tier 1 cannot have. Tier 2 (a sync engine) is the answer to the first group.

| Will not                                                                        | Why                                                                                                  |
|---------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| predict list membership, show instant creates, or keep queries complete offline | the server decides membership; that is a sync engine's job (tier 2)                                  |
| sort or filter on the client to produce an answer                               | `.where` and `.orderBy` are claims checked against responses, never computed results                 |
| infer server semantics the domain did not declare                               | checks find contradictions; they cannot prove an absent filter or side effect                        |
| establish a lost write's final outcome                                          | only the backend knows; tier 1 shows the server's state now and leaves reconciliation to the machine |
| retry an uncertain write                                                        | only the API knows whether a retry is safe                                                           |
| merge conflicting server values field by field                                  | versions or request order decide; merging is for sync engines and CRDTs                              |
| accept backends that serve reads older than the client's own settled writes     | freshness rests on read-your-writes (section 5.3)                                                    |
| hydrate server-rendered data in version 1                                       | out of scope in `minimal-library.md` section 10 and `entities.md` section 3.4                        |
| refetch only part of a paged answer                                             | a moved record changes which page later records fall on                                              |
| guarantee the fewest refetches                                                  | a conservative refetch is preferred to a missed one                                                  |
| run arbitrary JavaScript predicates (`fn.where`)                                | tools cannot read them; `serverMatches` names what the server reads                                  |
| reconstruct arbitrary historical values from trace artifacts                    | artifacts carry digests; values live in checkpoints and live inspection                              |
| generate a fake API server from a domain                                        | a domain does not know how operations call their API; fixtures are ordinary Layers                   |

---

## 2. Reading a domain

Every name in a domain is either **yours** or one of a small, fixed set of **library words**.
Library words are verbs and prepositions; nothing you name sits at their level. Field references are
written through the recorded `record`, so a typo is a type error.

### 2.1 Authoring vocabulary

| Word                                                                  | Reads as                                                                                            |
|-----------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| `domain(id, entries)`                                                 | these entries are the shared-data meaning of these operations                                       |
| `read(resource)`, `write(transaction)`, `listen(stream)`              | this request reads, changes or reports shared data                                                  |
| `.one(Entity, at?)`                                                   | the result holds one record at this place (the whole result by default)                             |
| `.list(Entity, at, member?)`                                          | the result holds a list of records at this place                                                    |
| `.derivedFrom(Entity, fields?, where?)`                               | the result is computed from records it does not hold (a count, a sum, a quote)                      |
| `.byKey(({ input }) => key)`                                          | this read is how one record is loaded by its key                                                    |
| `.where(({ input, record }) => condition)`                            | only records meeting this condition can be in, or count toward, this result                         |
| `.orderBy(({ record }) => [desc(record.pinned), asc(record.noteId)])` | the server returns the list in this total order, ending with the key                                |
| `.unordered()`                                                        | the client never relies on this list's order (a calendar, a map, a board grouped in the view)       |
| `.pagedBy(({ input }) => input.cursor, ({ result }) => result.next)`  | this input picks a page, and this is the next page's input                                          |
| `.ignoring(({ input }) => [input.locale])`                            | these inputs change neither which records nor their order                                           |
| `.unaffectedBy(...fields)`                                            | on a server-ranked list: a change to these fields cannot make it wrong                              |
| `.predicts(({ input }) => changes)`                                   | what to show before the server answers                                                              |
| `.alsoChanges(({ input }) => targets)`                                | the server also changes these, which the response does not carry                                    |
| `.as([Note], (event) => change)`                                      | how one stream event becomes a change to these entities                                             |
| `eq`, `oneOf`, `contains`, `between`, `overlaps`, `and`               | conditions                                                                                          |
| `serverMatches(input.q, record.title, record.body)`                   | the server filters on these in a way the client cannot evaluate                                     |
| `asc`, `desc`                                                         | sort keys                                                                                           |
| `Note.patch`, `Note.save`, `Note.delete`                              | changes to records                                                                                  |
| `Note.all`, `Note.where(…)`, `Note.fields(key, …)`                    | targets: every answer on the entity, the answers a condition overlaps, or some fields of one record |
| `principal()`                                                         | the signed-in principal, inside a condition                                                         |

### 2.2 Other public words

`entity({ id, fields, primaryKey, version? })` declares an entity, and `Note.pick(...)` names an
explicit record shape (section 4.2). Reads: `Note.get(source, key, shape)` and
`Domain.entry.get(source, input)` (section 6.2), `Note.queue(checkpoint, key)` (section 6.3).
Testing: `propertyTest` (section 8). A field may be marked `sensitive` (section 7.4).

### 2.3 What can make an answer wrong

The record store keeps every copy of a field right (C1), so a field an answer merely displays never
makes it wrong. Only these changes repair an answer:

| Answer                                      | Repaired when                                                                                                             |
|---------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `.one`                                      | the record is deleted; the store keeps its fields right                                                                   |
| `.list` with `.orderBy`                     | a record enters or leaves the condition, or an order field of a record in it changes                                      |
| `.list` with `.unordered()`                 | a record enters or leaves the condition                                                                                   |
| `.list` with neither (ranked by the server) | a record enters or leaves the condition, or any field not in `.unaffectedBy` changes                                      |
| `.derivedFrom(E)`                           | a record enters or leaves the condition, or any field of a record meeting it changes                                      |
| `.derivedFrom(E, fields)`                   | a record enters or leaves the condition, or one of those fields of a record meeting it changes                            |
| any answer                                  | a write's `.alsoChanges` target reaches it, a write's `invalidate` covers it, or a reconnect or restore covers its entity |

A list with no `.where` has every record of the entity in its condition, so a create or a delete
repairs it. For a derived answer, the fields name what the server's computation reads: omit them and
any field repairs (the safe default); `() => []` means only membership matters (a plain count);
condition fields always repair, so listing them is allowed but not needed. A derived answer may hold
many values, such as one count per column; the fields still name what it reads. Condition fields
always repair, because they decide entering and leaving.

### 2.4 Omission stays safe (G7)

Section 2.3 trusts the declared conditions, so a filter left out would make an answer miss repairs.
These rules keep a missing filter loud or safe:

1. **Every input is accounted for.** Each field of a list's or derived read's input appears in
   `.where`, `.orderBy`, `.pagedBy`, `.ignoring` or a `serverMatches`. An unused input is a **type
   error** at the entry, because it is how a hidden filter shows itself (a search's `q`): recorded
   input values carry the field they came from, and `domain()` checks each read (section 15). The
   message offers `serverMatches` first and `.ignoring` only for inputs such as a locale or a
   format, and `flow explain` prints ignored inputs on their own line.
2. **A filter the client cannot evaluate is declared, not dropped.** `serverMatches(input.q,
   record.title, record.body)` may hold for any record, and a change to any field it names repairs.
   With no record fields, `serverMatches(input.q)` means any field repairs.
3. **An order is total.** `.orderBy` ends with the entity's key fields (a type error otherwise), so
   a sort key the server uses and the domain omits can break the declared order on a tie and report
   `HiddenOrder` (section 4.4 says when this check can see it).
4. **A filter with no input** (the server hides archived records) and **a server side effect the
   domain forgot** cannot be seen statically. Declare the filter as a constant (`eq(record.archived,
   false)`) and the effect with `.alsoChanges`. The response check catches a returned record that
   contradicts the condition. The audit mode (section 9) refetches every unrepaired answer after
   each change and reports `HiddenFilter` or `UndeclaredEffect`; the app's property test does the
   same against its fixture. Outside those, such an omission is silent, as it is in every request
   cache.

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
  result: Schema.Struct({ notes: Schema.Array(NoteRow), next: Schema.optional(Schema.String) }),
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
export const NotesDomain = domain("notes", {
  noteById: read(noteById)
    .one(Note)
    .byKey(({ input }) => ({ noteId: input.noteId })),

  inFolder: read(notesInFolder)
    .list(Note, ({ result }) => result.notes)
    .where(({ input, record }) => eq(record.folderId, input.folderId))
    .orderBy(({ record }) => [desc(record.pinned), asc(record.title), asc(record.noteId)])
    .pagedBy(({ input }) => input.cursor, ({ result }) => result.next),

  pinnedCount: read(pinnedCount)
    .derivedFrom(Note, ({ record }) => [record.pinned])
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

  events: listen(noteEvents).as([Note], (event) =>
    event.type === "noteSaved" ? Note.save(event.note) : Note.delete({ noteId: event.noteId })),
});
```

`render(model, "text")` prints it as sentences, a projection of the recorded description:

- **noteById** reads one note, and is how a note is loaded by its key.
- **inFolder** reads pages of notes at `result.notes`, where the folder is the input's, ordered by
  pinned descending, title and key. It repairs when a note enters or leaves the folder, or a note in
  it is pinned, unpinned or renamed.
- **pinnedCount** is derived from the `pinned` field of notes that are pinned.
- **search** reads a list of notes at `result.hits.note`, where the workspace is the input's and the
  server matches `input.q` on title and body, ranked by the server, unaffected by author. It repairs
  when any other field of a note in the workspace changes.
- **create** writes one note.
- **rename** writes one note and predicts its title; **move** predicts its folder. Both queue behind
  other writes to the same note.
- **remove** deletes a note and hides it at once.
- **events** saves or deletes notes (an opaque mapping).

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

**Decision 6 on a domain operation.** `minimal-library.md` section 6 gives every commit call-site
`optimistic` and `writes`. On an operation registered in a domain, call-site `optimistic` and any
`setData` are **type errors**: the domain's `.predicts` is the one form, and a hand-written cache
update would bypass the record store (C1). `writes` may contain only `invalidate` of a domain read
or an entity, a business refresh the machine decides on; it is recorded as a cause. `clear` is a
type error.

### 3.5 The smallest domain

A two-screen todo app needs this much:

```ts
export const Todo = entity({ id: "todos/Todo", fields: TodoRow.fields, primaryKey: ["todoId"] });

export const TodosDomain = domain("todos", {
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
- **No condition and no order.** `todos` has no input, so the input rule asks for nothing. Every
  change to a todo repairs the list: correct, and cheap at this size. Add `.where` and `.orderBy`
  when `flow trace summarize` shows refetches worth saving.
- **A new todo** shows from the composer machine's memory until the list's refetch holds its key
  (section 5.5, Creates).
- **No test is required.** `propertyTest` is worth adding when the domain grows (section 8).

---

## 4. How declarations are recorded

### 4.1 Recorded positions and runtime functions

A domain mixes two kinds of function, and which is which is fixed by position:

| Kind         | Positions                                                                                                                                                                                                                   | When it runs                                                                                                              | What tools see                                                                                                |
|--------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| **recorded** | places (`at`), `.byKey`, `.where`, `.orderBy`, `.pagedBy`, `.ignoring`, `.derivedFrom` fields and conditions, `.alsoChanges` targets, `Entity.where` conditions, and in `.predicts` the entity, the key and the field names | once, when the domain is constructed, with recording proxies                                                              | the full expression                                                                                           |
| **runtime**  | `.as` mappings, and `.predicts` run again for real                                                                                                                                                                          | `.as` on each event; `.predicts` at each write start, with the real input, and each function-valued field with the record | the declared effect (the entities `.as` lists, the predicted entities and field names), never the computation |

Recording works as TanStack DB's query builder does (section 14): what a recorded function touches
becomes a plain description (`ref`, `val`, `func`) that `flow graph`, `flow check`, `flow explain`
and the runtime read. The rules of section 4.7 apply to recorded positions only. A runtime function
is ordinary code, shown by the CLI as an opaque mapping with its declared effect; its actual results
appear in the trace (section 7.4).

### 4.2 Places in a result (`.one`, `.list`)

`({ result }) => result.notes` records the path `["notes"]`. An array on the path means each
element; `result.hits.note` over an array of hits means the `note` of each hit.

- **The record shape is inferred** from the struct at that place. It must contain the entity's key
  fields, and every field whose name matches an entity field must have that field's type. The
  matching fields are what this result carries; the rest (a search `highlight`) belong to the
  result. `Note.pick("title", …)` names the shape explicitly and rejects other same-named fields;
  use it when a place holds a nested struct whose same-named fields mean something else (a line's
  `product.price` that is the price at add time, held where `Product` would read it as live). A
  field of a different entity never collides: a `CartLine.price` is not a `Product.price`.
- **Nested entities follow the entity's declaration.** `Note.fields.author` is a `User`, so holding
  a note holds its author as a user. A condition or order may read a nested path
  (`record.author.userId`); a change to the nested record reaches the parent's answers only through
  such paths, or through a server-ranked list that is not `.unaffectedBy` that field.
- **Two entity types at one place** (a folder's files and subfolders in one array) are two `.list`s
  on one entry. Each element matches the entity whose key fields it carries. When the entities share
  key field names, the place must be a tagged union and each `.list` names its member: `.list(File,
  at, { kind: "file" })`. `record` in the entry's `.where` and `.orderBy` has the fields the listed
  entities share, including the tag.
- **A singleton** (`read(myCart).one(Cart)` with no input) takes its key from the response.

### 4.3 Conditions (`.where`, `serverMatches`)

`({ input, record }) => eq(record.folderId, input.folderId)` records a condition. Conditions use
operators, never JavaScript comparisons:

| Operator                              | Condition                                                  |
|---------------------------------------|------------------------------------------------------------|
| `eq(a, b)`                            | equal                                                      |
| `oneOf(a, values)`                    | `a` is one of an array                                     |
| `contains(arrayField, value)`         | an array field contains the value                          |
| `between(a, from, to)`                | `a` lies in the half-open range `[from, to)`               |
| `overlaps(start, end, from, to)`      | the record's interval `[start, end)` overlaps `[from, to)` |
| `and(c1, c2, …)`                      | all hold                                                   |
| `serverMatches(input, …recordFields)` | the server decides from these; may hold for any record     |

Each argument is a record field, an input field, `principal()` or a constant. Several `.where` calls
are combined with `and`. The entity's version field may not appear in a condition or an order (a
type error), so a change to the version alone never repairs.

- **Absent inputs mean "no constraint", for every operator.** An optional input that is absent
  turns the operator that uses it into a condition that always holds: `oneOf(record.status,
  input.statuses)` with no `statuses` means any status, and `between(record.postedAt, input.from,
  input.to)` with no `to` has no upper bound. A filter that means something else when absent is
  written with `serverMatches`.
- **`serverMatches`** records which input the server matches against which record fields. Its record
  fields are condition fields. `serverMatches(input.folderId, record.parentId)` describes a subtree
  the server computes.
- **Bindings.** A `.where` on an entry applies to all of its `.list`s, or to its one `.derivedFrom`.
  An entry with several `.derivedFrom`s gives each its own condition as the third argument, and an
  entry-level `.where` is then a type error.

### 4.4 Order (`.orderBy`, `.unordered`)

`({ record }) => [desc(record.pinned), asc(record.title), asc(record.noteId)]` records the sort
keys. The order is total: it ends with the entity's key fields (with a union's tag before them).

- **Checked within each response, on that response's own values.** Numbers, booleans, dates and key
  fields are compared; string keys are not, because the client cannot know the server's collation.
  So an omitted sort key is caught only when two records tie on every checked key before it.
- A response out of order reports `HiddenOrder`, naming the two records and the first key they
  disagree on, and that answer is treated as server-ranked (every field repairs it) for the rest of
  the Runtime. The demotion is evidence (section 7.4).
- **The order is a claim about the server**, never something the client sorts by.
- **`.unordered()`** says the client does not rely on the order at all: a calendar placing events by
  time, a map, a board the view groups and sorts by visible fields. Only entering and leaving
  repairs it. It is unchecked, and wrong if the view renders the list in response order.

- **Directions.** Any direction works for any sort key, the tie-breaking key included; the order
  only has to match the server's.

### 4.5 Pages (`.pagedBy`)

`.pagedBy(({ input }) => input.cursor, ({ result }) => result.next)` names the input that picks a
page and where a response says the next page's input is (a cursor, an offset or a page number;
absent at the last page). The pages loaded for one input without the paging field form **one paged
answer**. This amends `minimal-library.md`, which deferred infinite lists as one cache entry.

- A machine loads more with `O.Notes.inFolder.more(input)`, which fetches the page after the last
  loaded one.
- **A repair rebuilds the chain**: it refetches the first page, takes each next input from the page
  just fetched, and stops after as many pages as were loaded or at the last page. The whole chain is
  one repair lookup (section 5.2) and is published at once. Until then the previous chain is served,
  marked `stale`. A failed page keeps the previous chain, stale with the failure; a delta that
  matches mid-rebuild restarts it from the first page.
- Cost: a repair of N loaded pages is N sequential requests (section 5.6).

### 4.6 Predictions and targets (`.predicts`, `.alsoChanges`, `.as`)

- **`.predicts(({ input }) => Note.patch(input.key, { title: input.title }))`** runs twice. At
  construction it is recorded, which fixes the entity, the key and the field names. When the write
  starts it runs again with the real input, so `input` is typed as the real input and a field's
  value may compute from it: `Account.patch(input.from, { balance: (a) => a.balance - input.amount
  })`, where the function receives the record. Keys may be arrays (`User.patch(input.keys, {
  status: "archived" })`), and the version field cannot be patched (a type error).
  `Note.delete(key)` hides a record of any entity. A **patch** may change only an entity the entry
  names in a place or an `.alsoChanges` target, so `addComment` may predict its post's
  `commentCount` once it targets `Post.fields(...)`; a patch to an unnamed entity is a type error.
- **Shapes of a write.** A write may have several places (`.one(Account, at)` twice for a transfer),
  a `.list` place (the users a bulk archive returns), or no place at all (an edit whose response is
  empty, declaring only `.alsoChanges`). `.predicts` and `.alsoChanges` return one change or target,
  or an array of them. A target may name an entity no answer holds yet (audit entries): it costs
  nothing now and keeps the effect declared for future reads and the trace.
- **`.alsoChanges(({ input }) => targets)`** names what the server changes beyond the response, in
  the language of `.where`:
  - `Txn.where(({ record }) => eq(record.accountId, input.from))` reaches an answer when a record
    could meet both conditions: equal-to-a-value conditions on the same field are compared, and
    anything else counts as overlapping.
  - `Post.fields(input.postKey, ({ record }) => [record.commentCount])` says these fields of one
    record changed to values the client does not know. They are treated as unconfirmed (section
    5.5): a confirming read is scheduled, and lists repair only where those fields are condition or
    order fields.
  - `Txn.all` reaches every answer on the entity.
- **`.as([Note], (event) => change)`** lists the entities it may change, and runs for real on each
  event. Its result must be a change to a listed entity (a type error otherwise, and a runtime error
  naming the event).

### 4.7 What recording forbids, and how mistakes are reported

A recording proxy sees property access but not JavaScript logic. In a recorded position:

| Written                                                | Result                                                                                                                           |          |                                                                                                                                                                                                                                                                     |
|--------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `record.folderId === input.folderId`                   | **an error at construction:** "`.where` received a boolean. Write `eq(record.folderId, input.folderId)`."                        |          |                                                                                                                                                                                                                                                                     |
| arithmetic, templates, `String(x)` on a recorded value | **an error:** the proxy throws from its conversion hooks and names the place; arithmetic belongs in a predicted field's function |          |                                                                                                                                                                                                                                                                     |
| a method call (`record.title.trim()`)                  | **an error:** recorded values cannot be called                                                                                   |          |                                                                                                                                                                                                                                                                     |
| `cond ? a : b`, `a && b`, `a \                         | \                                                                                                                                | b`, `if` | **not detectable by the proxy or the types**: one branch is recorded and the condition is silently too narrow. A **mandatory** `flow check` rule (an error) rejects them in recorded positions, and the same check runs when a domain is constructed in development |
| `Date.now()`, `Math.random()`, outer mutable state     | `flow check` rejects them; they would run once at construction                                                                   |          |                                                                                                                                                                                                                                                                     |

**The rule for authors: a recorded position is one expression of property reads and library
operators.** Logic the client cannot express belongs in the server and is declared with
`serverMatches`. A declaration the source check cannot read (compiled or generated code) is a `flow
check` error, not a pass.

---

## 5. Repair: the runtime

The runtime uses four ideas from differential dataflow: changes are deltas, repair is a join,
freshness is a frontier, and values consolidate per turn. Section 5.5 holds the store rules they
rest on, and section 5.6 the bounds.

### 5.1 Changes

A record change carries the old and the new value.

| Source            | Effect                                                                 |
|-------------------|------------------------------------------------------------------------|
| a write starting  | a **predicted** delta on the visible value; nothing else (below)       |
| a write settling  | its predictions resolve (section 5.5); the response changes the base   |
| a response        | changes the base where it carries newer fields (an **observed** delta) |
| a push (`listen`) | changes the base to the pushed value, or deletes                       |

- **Predictions change visible values only.** A predicted delta never lowers a frontier, fences a
  lookup or starts a repair; a write's settlement carries all of its obligations. An answer is
  `pending` while it holds a record with a live prediction.
- **Predictions are replayed, not stored.** A predicted field keeps its value or function. Whenever
  a record's base changes, its live predictions are recomputed over the new base in start order. Two
  `+1` predictions stay `+2` over any base, and retracting one leaves `+1` (Relay's
  revert-and-reapply, Apollo's layer replay).
- **A later write retires older predictions.** When a write's confirmed value for a field lands,
  every older prediction of that field on that record ends, confirmed or not: the record queue sent
  the later write after the older one, so its value is the newer truth.
- **Failure** removes a write's predictions: retraction is the inverse delta.

### 5.2 Repair is a join

Finding the answers a change can make wrong is a **join** of base deltas and active answers, matched
on the answers' conditions.

- **Matching.** An answer matches a delta when the delta's old or new value meets its condition and
  the delta enters or leaves it, or changes a field section 2.3 lists for that kind of answer. A
  field the delta does not carry counts as meeting the condition. A record no active list holds has
  no old side for lists (every record in an active list is held), so only derived answers treat its
  unknown old value as matching. That includes a record's first sighting: when a list's load reveals
  records the client has not held, derived answers on the entity refetch once.
- **A response that is behind makes its own answer stale.** A response carrying a record at a lower
  version than the store holds is behind for that record, so its membership for that record is out
  of date: from a machine's request the answer refetches; from a repair it is marked stale (one
  hop). The runtime model found this case: a list loading while a push moved one of its records
  away.
- **Rejected sources still reach derived answers.** A response or push that the ordering rule or a
  tombstone rejects still joins derived answers, from its values to the current base, because a
  derived answer carries no versions and may have been computed against that intermediate server
  state (a count taken while a record was briefly pinned). From a repair's response it only marks
  them stale. The runtime model found this case too.
- **Causes.** Every repair has causes from one closed list: a write settled (success, failure,
  uncertain), a push, a machine's request revealing a change, an `.alsoChanges` target, an
  `invalidate`, a reconnect, a restore, a contested field, a confirming read for an unconfirmed
  field. One lookup may satisfy several causes; it records all of them.
- **A settled write repairs from both bases.** Its affected answers are the union of those matching
  the delta from the base before its prediction to its response, and those matching the delta from
  the base at settlement to its response. A push that moved the record while the write was in flight
  is then repaired too.
- **Observed deltas repair one hop.** A delta revealed by the response to a machine's request (a
  load, a `staleTime` refetch, a focus refetch) repairs like any other. A delta revealed by a
  **repair's** response updates the copies (C1) and marks the answers it matches `stale` with that
  observation as the cause, but starts no lookup; the next machine request or local cause refreshes
  them. So a repair's response never starts a lookup (C3), and no loop guard is needed. TanStack DB,
  Apollo (whose `cache-and-network` policy cascades exactly this way) and Relay stop here.
- **One in flight, one waiting.** An answer has at most one repair lookup in flight (a paged rebuild
  counts as one). Deltas that match it meanwhile fence that lookup and queue a single trailing
  refetch, however many arrive.
- **The fence.** The join's delta rule has two halves: a new delta against existing answers
  (ordinary repair), and a new answer against deltas already in flight. An answer whose request
  started before an affecting change is stale on arrival.
- **Indexing is an optimisation.** The join may start as a scan of active answers. Equality,
  `oneOf`, `contains` and range indexes, as Electric routes changes to shapes, are added when
  measurement calls for them, and must agree with the scan.

### 5.3 Freshness is a frontier

Each answer has a **frontier**: the position up to which its data accounts for every affecting
change. A matching delta newer than the frontier makes the answer stale; a response whose request
started at or after that delta advances it. Positions are opaque and comparable, so a sync engine
can supply its own (a log offset).

- **Ordered streams are a precondition.** A stream delivers its events in the order the server
  sent them.
- **Read-your-writes is a precondition.** A request started after a write settled must see that
  write. A backend that serves older replicas breaks this, and is a non-goal (section 1.2). A
  response carrying a field at a lower version than the store holds neither advances a frontier for
  that record nor confirms a prediction.
- **Reconnects, restores and `invalidate`** lower the frontier of every answer they cover. Answers
  with subscribers refetch, in canonical order, under the runtime-wide bound (section 5.6); answers
  without subscribers are only marked stale.

### 5.4 Values consolidate per turn; causes do not

All base deltas produced in one scheduler turn are consolidated per record before the join runs, so
a bulk write repairs each answer once. Consolidation applies to **values** only: a cause keeps its
obligations even when the values it touched net to nothing, because the server saw the intermediate
value and whatever else it did is invisible to the client. Obligations are a set keyed by answer and
cause, and several causes met by one refetch cost one refetch.

### 5.5 Store rules

**Records.** One record per key holds the fields received so far, each with the version, start
position and landed position of the source that set it. A record's **base** is what the server has
said; its **visible** value is the base with live predictions on top.

**Ordering.** A source replaces a stored field when both carry a version and its version is strictly
greater (a lower version is rejected; an equal one falls through), or otherwise when its request
started at or after the stored field's landed position. A lookup starts when its adapter is invoked;
a push when it arrives; a write's confirmed fields when it settles. A field the store does not hold
is filled by any response, so a late older response still contributes fields the newer one lacked.

**Contested fields.** Without versions, request order is not server truth. A field is contested when
a source carries a different value and either lands on a field another source set after it started,
or is rejected by the ordering rule. A contested record is refetched by its loader and every answer
holding it; when the contest came from a repair's response, they are marked stale instead (5.2). The
contest is evidence (section 7.4); tier 1 does not guess why two endpoints disagree.

**How a write ends.**

| Ending                                                                     | Predictions                                                                             | Repair                                                                                                 |
|----------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| success                                                                    | fields the response carries replace them; a predicted field it omits is **unconfirmed** | affected answers from both bases (5.2); a confirming read for each unconfirmed field                   |
| failure or defect                                                          | removed                                                                                 | affected answers, all predicted fields                                                                 |
| rejected, or cancelled before its adapter was invoked                      | removed                                                                                 | none                                                                                                   |
| uncertain (cancelled after invocation, response lost, restored mid-flight) | removed once the forced repair lands                                                    | **forced**: the record's loader and every answer holding it refetch; the record is `uncertain` (below) |

**Confirmation.** A prediction a response did not carry ends by a confirming read, never by waiting
for a later delta (Replicache's `lastMutationID` and Linear's sync-id wait, in request-and-response
form).

- A **confirming read** started after the write settled, carries the field for the record, and is
  accepted by the ordering rule: the `.byKey` loader, or an answer whose shape carries the field.
  Its base replaces the prediction, whether or not the value changed.
- **Settlement schedules one**, deterministically: the affected answer that carries the field, first
  in canonical order, if one is already refetching; otherwise the loader; otherwise the first active
  answer, in canonical order, that carries it.
- **A read that omits the record confirms nothing.** It removes the record from that answer (C6),
  and the next candidate is scheduled. A `notFound` from the loader confirms a predicted delete.
- **If nothing active carries the field**, nothing can display it: the prediction ends, and the
  field is **dropped from the base**, so the next reader must fetch it rather than see the old
  value.
- **If the confirming read fails**, the field stays unconfirmed and `pending`; the next accepted
  read that carries it confirms it.
- **No flicker.** Until confirmed, the field shows the predicted value marked `pending`.
- **Witnesses.** Tier 1's confirmation witnesses are a response that carries the field and a
  confirming read. A sync engine adapter supplies its own (a transaction id) without changing a
  declaration.

**Publication.** Applying a response and ending the predictions it confirms is one publication: no
publication shows a field older than a settled write's confirmed value. An answer being repaired
keeps serving its last complete data, marked `stale`, until the refetch lands whole.

**Per-record queues.** A write with `.predicts` keeps one write in flight per record, first in,
first out, across every screen. This is a cross-actor lane, an amendment to Transactions D1, layered
under the transaction's own concurrency:

- **The actor decides first.** The transaction's `concurrency` (`reject`, `allow`, `serialize`)
  decides whether and when an occurrence starts; its prediction applies at that start, as
  `minimal-library.md` section 6 says. `cancel` on a predicting domain write is a `flow check`
  error: each cancelled send would be an uncertain write and a forced repair.
- **Then the record queue.** A started occurrence joins the queue of every record it predicts, in
  one step, and is sent when it heads all of them; joining all at once gives every queue the same
  relative order, so writes over the same records cannot deadlock. Its prediction shows on joining
  and is replayed over each new base. A queued occurrence the actor cancels is removed without
  invoking its adapter and settles interrupted.
- **Release.** Success, failure or rejection sends the next write. An uncertain ending sends it once
  the forced repair has landed, with its predictions replayed over the repaired base. The queue
  waits on nothing else: no focus or connectivity gate.

**Uncertain writes.** A read cannot prove that an uncertain write will not still apply: the server
may run a lost request after the read returns. Tier 1 does not pretend otherwise:

- The forced repair shows the server's state now, and the write's predictions end when it lands.
- The record is marked `uncertain` until a later write to it succeeds or the machine reconciles the
  attempt. Reconciling is workflow: the transaction's `unknown` outcome (`minimal-library.md`
  section 6) reaches the machine with `attempt.id`, which an API that deduplicates by key can use to
  ask what happened or to retry safely.
- `commit` receives `basedOn`, the version each prediction was computed over, which an API may send
  as `If-Match`. That protects a later write from overwriting a late application; it does not tell
  anyone the earlier write finished.
- A write restored as uncertain persists the keys it predicted with its attempt, as plain data, so a
  restore can mark them `uncertain` and run the forced repair.

**Creates.** A write that creates returns the record (`.one(Note)`). Its delta, from nothing to the
record, enters every condition it meets, so those answers refetch, and the record appears when that
refetch lands. Until then the machine that created it shows it from memory: the documented pattern
is a draft item the view renders beside the answer until the answer holds its key. TanStack DB's
hardest open problems are temporary ids and the echo of an optimistic insert; tier 1 avoids both.

**Moves.** A predicted move changes the field at once, but no list predicts membership, so a moved
record stays in its old list until that list's refetch. For a move that must look instant (a board's
card drag), read the parent-level list (`cards` of a board, `.unordered()`), and group and sort it
in the view by visible fields; the prediction then moves the card immediately. Per-group lists show
the move after their refetch. Instant per-list moves are tier 2.

**Predicted deletes.** `.predicts(({ input }) => Note.delete(input.key))` hides the record in every
answer, marked `pending`, from the moment the write starts (C6 allows a live prediction to hide a
record). Success confirms the delete and answers whose condition the record met refetch (a count
changes); failure brings the record back; an uncertain ending shows whatever the forced repair
finds.

**Deletes.** A delete hides the record in every answer and leaves a tombstone while any lookup that
started before it is in flight. A delete may carry a version (`Note.delete(key, { version })`); a
versioned tombstone lives until the record's `gcTime`, and a save at a lower or equal version cannot
bring the record back. Without a version, pushes are ordered by arrival and the tombstone guards
only lookups; `flow check` warns on `listen` over an unversioned entity. A non-list reference to a
deleted record (`note.folder`) marks the answers holding it stale and reads as a typed `Deleted`
value. A `notFound` never deletes a record whose create is unsettled.

**Holding.** A record exists while an answer references it (until the answer's `gcTime` after its
last subscriber), a loader subscription holds it, or a prediction on it is live.

**Persistence.** Only confirmed data is persisted: each persisted answer's references and context,
and for each record only the fields persisted answers project. Restore writes at position 0 and
lowers every restored answer's frontier, so live data wins. A different principal is a new Runtime.

**Status.** An answer read is the resource lane `minimal-library.md` decision 8a already defines
(its status, error and `pending`) plus `stale`: `false`, or the causes that made it stale. A failed
repair is the lane's failed refresh, with the previous data kept. A record read carries `{ data,
pending, uncertain, unconfirmed }`, where `unconfirmed` lists field names. A sync engine's
`complete` can be added later without a breaking change.

### 5.6 Bounds

| Cost                         | Bound                                                                                                        |
|------------------------------|--------------------------------------------------------------------------------------------------------------|
| matching one delta           | the scanned active answers, or the index hits once indexes exist                                             |
| refetches per delta          | the matched active answers; one in flight and one waiting per answer                                         |
| refetches across the Runtime | at most a fixed number of repair lookups in flight (a Runtime option, default 6), started in canonical order |
| a paged repair               | as many sequential requests as pages were loaded                                                             |
| prediction replay            | the live predictions on that record, bounded by its queue                                                    |
| tombstones                   | the deletes within `gcTime`                                                                                  |
| evidence                     | the bounded retention of InspectionAndArtifacts O3, with truncation markers                                  |
| recording                    | once per domain, at construction                                                                             |

High-frequency membership churn across many loaded pages (a live map of moving drivers) is expensive
by these bounds, and belongs to tier 2.

---

## 6. Stories

Stories keep every rule of `minimal-library.md` section 11 and the StoriesAndModels plan: the closed
command list (`send`, `process`, `advance`, `advanceTo`, `advanceToNextTimer`, `checkpoint`, `run`),
one production executor, the Runtime clock, seeded ids, fixtures as Layers, and atomic checkpoints
(O4). A domain adds **no Story kind and no Story command**. It adds evidence fields and read
helpers, listed in section 6.5.

### 6.1 Fixtures

Fixtures are ordinary complete Layers (O2). Repair is visible in a Story only if the fixture
remembers writes, so a domain's fixture keeps its state in a `Ref` created inside the Layer's scope,
giving every run fresh state. Pushes are delivered through the stream's fixture, on the Runtime
clock. A domain does not generate a fixture: it does not know how its operations call their API.

### 6.2 Reading records and answers

A checkpoint is one atomic cut over published snapshots and one store revision (O4). Reads take the
checkpoint, so they read exactly that revision:

| Read                                          | Returns                                                                                                                                                                                       |
|-----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Note.get(checkpoint, key, shape)`            | `{ data, pending, uncertain, unconfirmed }` for the fields in `shape`, with a field the store does not hold reported as missing; `undefined` if the store does not hold the record            |
| `NotesDomain.inFolder.get(checkpoint, input)` | the answer at that revision: the lane plus `stale` (section 5.5), with a paged answer's pages in order; `undefined` if no active answer has that input, whether never subscribed or collected |
| `Note.queue(checkpoint, key)`                 | the record's queue: each attempt, its write and its state                                                                                                                                     |

Live views use `Note.get(snapshot, key, shape)` through `useView`, read through Runtime-internal
bookkeeping (D22). `CheckpointProvider` reads from its checkpoint.

### 6.3 Repair evidence

Every checkpoint and `run.end` carries, from the start of the run to the cut, the repair decisions
and the diagnostics (`HiddenOrder`, a contest, a `selfCheck`), projected from the accepted trace
evidence in the cut (O4's copying and failed-capture rules apply).

```ts
type Repair = {
  sequence: number;                                   // position in the run's decision order
  read: "notes.inFolder";
  input: { folderId: "f1" };
  causes: Array<Cause>;                               // the closed list of section 5.2
  record?: { entity: "notes/Note"; key: { noteId: "n7" } };
  changed: Array<{ field: string; from: unknown; to: unknown }>;
  matched: "entered" | "left" | "both" | "target";
  action: "refetch" | "trailing" | "joined" | "observed";
};
type Skip = Omit<Repair, "matched" | "action"> & {
  reason: "outside-condition" | "unaffected" | "fresh";
};
```

- `repairs` lists answers that became stale and what was done; `skips` lists candidates the join
  rejected, with the reason. Answers that were not active appear in neither.
- **Order is canonical:** by delta, then by the entry's position in its domain, then by the input's
  canonical key. Tests compare lists exactly.
- **Values.** Checkpoints are in-process and carry values, except fields marked `sensitive`, which
  carry digests; artifacts carry digests only (section 7.4).
- **Retention.** Evidence follows the bounded model of InspectionAndArtifacts O3. When the prefix a
  question needs has been truncated, the answer says so ("insufficient evidence"), never "none".

```ts
const { settled } = (await moveRepairs.run()).checkpoints;
expect(NotesDomain.inFolder.get(settled, { folderId: "f1" })?.data.notes.map((n) => n.noteId))
  .toEqual(["n8"]);
const byMove = settled.repairs.filter((r) => r.causes.some((c) => c.write === "notes.move"));
expect(byMove.map((r) => r.input))
  .toEqual([{ folderId: "f1" }, { folderId: "f2" }]);
```

**A trap worth a note.** With `oneOf(record.status, input.statuses)`, an absent `statuses` means any
status: a table opened with no status filter keeps archived users after an archive. A Story
asserting they disappear is wrong, not the library.

### 6.4 Determinism

- **Recording** runs once when a domain is constructed; its description is fingerprinted into the
  App's identity.
- **Consolidation unit: one scheduler turn**, in Stories and production alike. Values that cancel in
  a turn produce no value change; causes keep their obligations (section 5.4).
- **Repairs are decided in canonical order**, and their lookups start in that order under the
  Runtime-wide bound.
- **Audit mode is off in Stories** unless a Story enables it, and its lookups never publish.

### 6.5 Amendments to the StoriesAndModels plan

| Amendment                                                                                            | Outcome |
|------------------------------------------------------------------------------------------------------|---------|
| checkpoints and `run.end` carry `repairs`, `skips` and diagnostics, projected from captured evidence | O4, V4  |
| `Entity.get`, `Entity.queue` and `Domain.entry.get` read the checkpoint's store revision             | O4, V4  |

---

## 7. The CLI and inspection

A domain is recorded at construction into the App's internal representation (SurfaceSimplification
O2), and every runtime decision is a trace event, so the CLI explains a domain without a second
model. This section targets D40's command set; section 7.6 lists the amendments.

### 7.1 The recorded description

`inspect(app)` (D39) includes each domain as plain data: its entries, places, conditions and orders
as expression trees, paging and ignored inputs, `unaffectedBy`, predicted entities and fields,
`.alsoChanges` targets, `.as` entity lists, which entries are indexed and which scanned, and the
operation id each entry registers (`notes.inFolder` is `notes/in-folder`). Constants in conditions
are recorded as literals, under a size cap. `render(model, "text")` prints the sentences of section
3.3, with golden tests; `render(model, "json")` is the form for agents.

### 7.2 Static questions: `flow explain <domain>`

Static mode reads the App and runs nothing. The impact table is generated by the same classifier the
runtime uses (section 2.3), and golden-tested against the library oracle (section 8.3): every repair
a generated run observes must appear in some row.

```text
$ flow explain notes
noteById     reads one Note; loads a note by its key
inFolder     reads pages of Note at result.notes, next page at result.next
             where record.folderId = input.folderId; ordered by pinned desc, title, noteId
pinnedCount  derived from Note.pinned where record.pinned = true
search       reads a list of Note at result.hits.note where record.workspaceId = input.workspaceId
             and the server matches input.q on title, body; ranked by the server
             unaffected by author
create       writes one Note
rename       writes one Note; predicts title; one at a time per record
move         writes one Note; predicts folderId; one at a time per record
remove       deletes Note; predicts the delete
events       listens; changes Note (opaque mapping)

source     read         at start      from the response        repairs when
create     inFolder     —             the created note         it enters a folder (all pages)
create     pinnedCount  —             the created note         it is pinned
create     search       —             the created note         it is in the workspace
rename     inFolder     title (order) folderId, pinned, title  it is in, enters or leaves the folder
rename     pinnedCount  —             pinned                   pinned changes
rename     search       title         any field but author     it is in the workspace
move       inFolder     folderId      folderId, pinned, title  it leaves or enters a folder
move       pinnedCount  —             pinned                   pinned changes
move       search       folderId      any field but author     it is in the workspace
remove     inFolder     hidden        —                        on settle, if it was in the folder
remove     pinnedCount  —             —                        on settle, if it was pinned
remove     search       hidden        —                        on settle, if in the workspace
remove     noteById     Deleted       —                        —
events     any read     —             the pushed note          by these rules; a delete hides
uncertain  noteById and every holder of the record: forced refetch
reconnect, restore, invalidate(Note.all): active Note answers refetch, others go stale
```

The reverse view, `flow explain notes --read notes.inFolder`, lists every source in any domain that
can affect one read, and the machines that subscribe to it (from `flow graph`).

### 7.3 Evidence questions: from a trace artifact

Evidence mode never runs application code. A Story run writes the trace, and the CLI reads it:

```text
$ flow story run move-repairs --trace-output move.trace.json
$ flow explain notes --trace move.trace.json --at settled
$ flow trace summarize move.trace.json --read notes.inFolder
$ flow trace summarize move.trace.json --entity Note:n7 --sequence 41
$ flow trace diff before.trace.json after.trace.json --section repairs
```

| Question                            | Answered by                                                                                                                                                             |
|-------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| why did this read refetch           | `trace summarize --read`: each repair with its causes, record, fields and action                                                                                        |
| why did it not refetch              | `explain --trace --at`: whether the read was active then, its effective rules (after any demotion), and whether the join rejected it or never matched it                |
| why does this field hold this value | `trace summarize --entity --sequence`: the source of each field, rejected contenders, predictions, confirmations and digests; values only where a checkpoint holds them |
| why is this write waiting           | `trace summarize --entity`: the record's queue, its head, and halts                                                                                                     |
| is this record uncertain, and why   | the `uncertain` events of that record                                                                                                                                   |
| what changed between two runs       | `trace diff --section repairs`, normalised and ordered                                                                                                                  |

### 7.4 Trace events

Every event carries the Runtime's sequence number, so it orders against machine transitions in one
total order.

| Event                                | Fields                                                                                                 |
|--------------------------------------|--------------------------------------------------------------------------------------------------------|
| `delta`                              | record, source, changed field names, digests; for `.as`, the event's digest and the change it produced |
| `field`                              | accepted, rejected or contested, with the compared versions or positions                               |
| `repair`                             | read, input, causes, record, changed fields, matched, action                                           |
| `skip`                               | read, input, causes, reason; only for candidates the join considered                                   |
| `lookup`                             | a repair lookup started or settled: read, input, the causes it satisfies, its outcome, pages           |
| `prediction`                         | started, replayed, confirmed, retired, ended, with attempt, fields and the confirming read chosen      |
| `queue`                              | joined, sent, halted, released, removed, with record and attempt                                       |
| `uncertain`                          | opened, forced repair landed, ended (later write or reconciliation)                                    |
| `answer`                             | activated, deactivated, demoted by `HiddenOrder`                                                       |
| `invalidate`, `reconnect`, `restore` | the source and what it covers                                                                          |
| `tombstone`, `gc`                    | record, reason                                                                                         |
| `selfCheck`                          | a response record contradicting a condition, or a response out of its declared order                   |
| `audit`                              | in audit mode: an unrepaired answer refetched and compared, and whether it differed                    |

- **Values and redaction.** Artifacts carry field names and digests, not values. Values reach only
  `attachInspector`'s in-memory events and checkpoints; a `sensitive` field is a digest everywhere.
- **Volume.** Skips are recorded only for candidates the join considered; every turn also records
  counters `{ deltas, candidates, repairs, skips, lookups, pages }`. `trace summarize --read` totals
  them per source.

### 7.5 Production inspection

`attachInspector(runtime, sink)` (D39) receives the same events as they happen and never delays
them. For current state, `inspect(runtime).domains.notes.answers()` gives, at one store revision,
each active answer's frontier, stale causes and effective rules, live predictions, record queues and
uncertain records. It starts no work; a late-attached inspector gets that snapshot and a truncation
marker.

### 7.6 Amendments to the CommandLine and InspectionAndArtifacts plans

| Amendment                                                                 | Plan                                                                                                                                               |                |
|---------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|----------------|
| `flow explain <domain>` with `--read <domain.entry>`, `--trace <artifact\ | ->` and `--at <checkpoint>`                                                                                                                        | CommandLine O1 |
| `flow trace summarize <artifact\                                          | -> --read <domain.entry>` or `--entity <Entity:key>`, optional `--sequence <n>`; the two filters exclusive; an unknown read, entity or key exits 2 | CommandLine O1 |
| trace diff section `repairs`                                              | CommandLine O3, InspectionAndArtifacts                                                                                                             |                |
| the recorded domain layout in the inspection schema                       | InspectionAndArtifacts V4                                                                                                                          |                |
| the trace events of section 7.4 and their redaction rule                  | InspectionAndArtifacts                                                                                                                             |                |
| `inspect(runtime).domains` as a passive current-state read                | InspectionAndArtifacts, D39                                                                                                                        |                |

`flow explain` exits 0 whenever it produces an explanation, including "stale" and "insufficient
evidence", and 2 for an unknown domain, entry, artifact or checkpoint.

---

## 8. The property test

### 8.1 What it is

`propertyTest(domains, options)` is a test-host helper in `flow-state/testing`, not a Story kind.
From a seed it generates plans, each an ordinary static Story run on a fresh Runtime, and checks the
properties of `entities.md` on their evidence.

```ts
test("notes converge", () =>
  propertyTest([NotesDomain], {
    fixture: NotesServer,                   // an ordinary fixture Layer that remembers writes
    inputs: { inFolder: folderInputs, search: searchInputs }, // generators for read inputs
    seed: 1,
    runs: 50,
    steps: 40,
  }));
```

- **No app needed.** The helper subscribes every read entry through a generated probe actor, with
  inputs drawn from `inputs` (resource keys are TypeScript types, so the generators are explicit).
- **Domains whose entities overlap are tested together**, because repair spans domains.
- **Actions:** writes starting and settling as success, failure or uncertain; lookups whose
  responses reorder, duplicate, fail or come back empty; pushes; reconnects; restores; unsubscribing
  and resubscribing; `invalidate`.
- **Results:** pass, fail, or inconclusive (the turn bound reached, or external work left pending).
  A failure is shrunk and printed as a static Story with literal data, the seed and the property it
  broke, re-run before printing.
- **Observation.** The checker reads every committed publication through the production evidence
  path, read-only, so per-publication properties are checked even when one `process()` runs several
  turns.

### 8.2 What it checks

| Property             | Checked                                                                                                                                                                                                                                                  |
|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| C1 coherence         | at every publication: all copies of each record field agree                                                                                                                                                                                              |
| C2 convergence       | once quiet: every active answer equals the fixture's answer for its input, element by element and in declared order, or is stale with a recorded observed cause and equals it after one machine request                                                  |
| C3 no cascades       | no lookup starts from a repair's response; every lookup has recorded causes; repairs per cause stay within a bound                                                                                                                                       |
| C4 monotonic truth   | no accepted field replaces a newer one by version or position                                                                                                                                                                                            |
| C5 honest prediction | every displayed unconfirmed value is a live prediction marked `pending`; every unconfirmed field has a scheduled or failed confirming read; no publication shows a field older than a settled write's confirmed value; nothing persisted is a prediction |
| C6 no silent loss    | every record that leaves an answer has a recorded reason                                                                                                                                                                                                 |
| C7 determinism       | each failing plan, and a sample of passing ones, runs twice with identical traces                                                                                                                                                                        |
| C8 explainability    | every repair, skip, hidden record and prediction names its causes                                                                                                                                                                                        |

**Quiet** is a fixed suffix: `process()`; then `advanceToNextTimer()` and `process()` until no timer
remains or a horizon is reached; then a checkpoint. After it the clock advances a long way and no
new lookup may start.

### 8.3 The oracle

The expected value of each answer is **the fixture's own read** for that input, called on the
fixture's current state. It never consults the domain, so a filter, order or side effect the fixture
applies and the domain omits shows up as a failure. A fixture that copies the domain's conditions
proves only consistency, and is only as good as its author's model of the server; contract tests
against the real API keep it honest.

Flow State's own suite tests the runtime itself with an independent evaluator, known-bad variants of
example domains, and coverage of every runtime rule. That is the library's implementation plan, not
an app obligation.

---

## 9. Rules and checks

| Rule                                                                                                                                                                                   | Checked by                                                                                                                                                                                                                    |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| a recorded position is one expression of reads and operators                                                                                                                           | the proxy and the types for booleans, conversions and calls; a mandatory `flow check` error for conditionals, short-circuits and impure calls, also run at construction in development; an unreadable declaration is an error |
| places exist; inferred record fields have the entity's types                                                                                                                           | the type system                                                                                                                                                                                                               |
| an operation is registered in at most one domain and reached only through it                                                                                                           | the type system for registered values; `flow check` otherwise                                                                                                                                                                 |
| an operation whose result carries an entity's key fields but is not registered                                                                                                         | `flow check` warning                                                                                                                                                                                                          |
| at most one `.byKey` per entity across the App                                                                                                                                         | `flow check`                                                                                                                                                                                                                  |
| patches change only entities the entry names; `.as` results change only listed entities                                                                                                | the type system; at runtime for `.as`                                                                                                                                                                                         |
| `.orderBy` ends with the key fields; the version field is in no condition or order; `.unaffectedBy` only on a server-ranked list; an entry-level `.where` with several `.derivedFrom`s | the type system                                                                                                                                                                                                               |
| every input of a list or derived read is accounted for                                                                                                                                 | the type system, at the entry                                                                                                                                                                                                 |
| call-site `optimistic`, `setData` or `clear` on a domain operation                                                                                                                     | the type system                                                                                                                                                                                                               |
| `cancel` concurrency on a predicting domain write                                                                                                                                      | `flow check` error                                                                                                                                                                                                            |
| `listen` over an entity without a version                                                                                                                                              | `flow check` warning                                                                                                                                                                                                          |
| a condition or order the server contradicts                                                                                                                                            | the response check, on every response                                                                                                                                                                                         |
| a filter or side effect the domain omits                                                                                                                                               | audit mode, and the app's property test, against a fixture that models it                                                                                                                                                     |

**Audit mode** is a Runtime option for development and tests, off by default and off in Stories
unless enabled. After every settlement, push and observed change, it refetches **every** active
answer the runtime did not repair, compares the result with the published answer without publishing,
and reports `HiddenFilter` (a membership difference) or `UndeclaredEffect` (a write followed by a
difference, naming the write and the read, with the `.alsoChanges` to add). It is exhaustive, so it
is deterministic against a fixture, and it costs a refetch of every active answer per change, which
is why it is never on in production.

---

## 10. What this buys

- **It reads as a description of the app.** Each entry is a sentence; the CLI prints those sentences
  from the recorded description, so the prose and the behaviour cannot drift.
- **Operations never import entities**, and adopting entities edits only the domain.
- **Truth is compiled.** What each read depends on, what each write predicts and changes, and why
  every repair happened are data an agent reads with `flow explain` and the trace, not code it must
  interpret.
- **It scales both ways.** A two-screen app writes a few lines with no conditions, no order and no
  test. A large app adds conditions and orders where traces show refetches worth saving, and its
  teams never list each other's writes.
- **One runtime model.** Deltas, a join, frontiers and consolidation replace a list of special
  rules.

## 11. What it costs

- **Recording has limits.** Conditionals in a recorded position cannot be seen by the proxy or the
  types; a mandatory source check must catch them. This is the main new obligation.
- **Declared filters and effects are trusted.** A constant filter or a server side effect the domain
  omits is silent outside audit mode and the property test, as in every request cache.
- **Uncertain writes are only as recoverable as the API.** Tier 1 shows the server's state after an
  uncertain write; knowing whether it will still apply needs an API the machine can ask.
- **Moves and creates show late in per-group lists**, and a paged repair refetches every loaded
  page.
- **Indexes cut matching, not refetches.** A broad derived read or an `Entity.all` target refetches
  every answer it reaches; `flow explain` shows which.
- **First sightings cost a refetch.** A list's load that reveals records the client has not held
  makes derived answers on that entity refetch once, because their old values are unknown.
- **Observed staleness waits.** An answer a repair's response marked stale stays stale, and says so,
  until the next machine request or local cause.
- **Inference by field name.** A struct field named `title` that means something else is read as the
  note's title, unless the place uses `Note.pick`.

## 12. Why this design

Five designs were written to the same scope and reviewed with the same lenses (git history, commit
`ad129cc4`):

| Design                                                                | Why not                                                                                                |
|-----------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| entity-centric: operations live on `Note.members`                     | two vocabularies; adopting an entity renamed operations in every machine                               |
| operation-first: `depends`, `optimistic`, `affects` on each operation | an open set, so no closed-world checks; `"none"` tokens everywhere                                     |
| coordinator with picks in results                                     | `when` closures tools cannot read or index; operations imported entities                               |
| knowledge store                                                       | predicted list membership and completeness: the client half of a sync engine                           |
| **this domain**                                                       | conditions as data, operations kept plain, sentences an agent can read; the cost is the recording rule |

## 13. Gates and open questions

### 13.1 Gates

1. **Type spike: passed** (section 15.1). Every shape infers without annotations; 26 of 27 likely
   mistakes are rejected, and the 27th is the conditional the source check covers. Domain-level
   errors state their cause on the second line, after a type dump.
2. **Agent experiment: passed** (section 15.2). Ten agents (seven Sonnet, three Haiku) wrote the
   seven example apps' domains from this document and the operations alone. All ten compile, nine on
   the first run; none would show a stale screen; their questions are answered in sections 2.3,
   4.2, 4.3, 4.4 and 4.6.
3. **Runtime model: passed** (section 15.3). An executable model of section 5 passes 40,000 fuzzed
   runs against a fake server, after it found three rules this design now states (section 5.2,
   section 5.3).

The runtime property suite in Flow State's own tests (section 8.3) is the implementation's first
obligation.

### 13.2 Open questions

1. **The Runtime-wide repair bound.** 6 is a guess; it needs measuring.
2. **Audit mode's cost** on a real app, and whether a sampled variant is worth having for production
   debugging.
3. **The property test's budget.** 50 runs of 40 steps is a guess; the runtime model needed short
   runs (15 to 25 steps) to find most interleavings, and long runs to find the rest.
4. **Field-narrowed targets.** A target names records, not fields, so a Kanban move's renumbered
   positions also refetch the board's counts. `Card.where(…).fields(…)` would avoid that; it is left
   out until a measured app needs it.
5. **The plan amendments** of sections 4.5, 5.5, 6.5 and 7.6 (minimal-library's infinite lists,
   Transactions' cross-actor record lane and `basedOn`, StoriesAndModels, CommandLine,
   InspectionAndArtifacts) each need that plan's approval.

## 14. Research behind the choices

| Choice                                                                         | Source                                                                                    |
|--------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| callbacks called once with recording proxies; a plain expression IR            | TanStack DB `query/builder/ref-proxy.ts` and `query/ir.ts`                                |
| operators instead of `===`, with the right form in the error                   | TanStack DB `InvalidWhereExpressionError`                                                 |
| conditionals are invisible to a probe and need a lint                          | Vue's dependency tracking; Immer's documented pitfalls                                    |
| repair as a join of changes and subscriptions, with indexes as an optimisation | Electric's `Shapes.Filter`                                                                |
| deltas, the join delta rule, frontiers, consolidation                          | differential dataflow and DBSP                                                            |
| predictions replayed over each new base                                        | Relay revert-and-reapply; Apollo `EntityStore.Layer` replay                               |
| a prediction ends by a confirming read, not a value                            | Replicache `lastMutationID`; Electric and TanStack DB `awaitTxId`; Linear's sync-id wait  |
| no flicker between settlement and confirmation                                 | TanStack DB issues #108, #2201, #1602                                                     |
| obligations never consolidated                                                 | no reviewed system consolidates them; TanStack DB #1912                                   |
| a repair's response starts no lookup                                           | apollo-client#6760 (`cache-and-network`); TanStack DB treats a response as observed state |
| affected fields from `where` and `orderBy`                                     | TanStack DB live queries; Data Client `nonFilterArgumentKeys`                             |
| paged repair rebuilt from fresh continuations                                  | TanStack Query infinite queries (`getNextPageParam`)                                      |
| a lost write's fate needs the backend                                          | Replicache server push; Zero mutators; Convex exactly-once mutations                      |
| versioned tombstones                                                           | Linear's archive and delete actions; Electric `must-refetch`                              |

## 15. Evidence

The spike and the runtime model are kept in git history, under
`workflow/plans/flow/references/evidence/` at commit `e549b7f1`, for the S5 stage to port.

### 15.1 Type spike

The draft 8 spike (types plus a small recording runtime) wrote eleven domains without annotations:
notes with a paged list and a ranked search, a nested-path read, todos, banking, calendar, admin,
files, social, shop and a machine. The positive set compiles in about 0.2 seconds with TypeScript
7.0.2 and Effect 4.0.5. Sixteen type-equality assertions confirm the inferred types are exact (not
`any`), and a deliberately false one fails. Thirty-seven runtime checks of the recorded description
pass, including a real run of a prediction.

| Shape                                                          | Result                                                                                                                                                  |
|----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| `.orderBy` ending with the key; tuple inference                | works; an order not ending with the key is a type error naming both sort keys                                                                           |
| one order per list (`.orderBy`, `.unordered`, `.unaffectedBy`) | a second one is a type error with a sentence: "a list has one order…"                                                                                   |
| `.unaffectedBy`                                                | restricted to carried, non-key fields; after `.orderBy`, a type error explaining why                                                                    |
| `.pagedBy(input, next)`; the machine's `.more`                 | the next selector must have the paging input's type; `.more` exists only on paged reads                                                                 |
| `.derivedFrom` with fields and per-binding conditions          | works; an entry-level `.where` with several is a type error with a sentence                                                                             |
| the input rule                                                 | **a type error**: recorded input values carry their field name, and `domain()` names the unused field                                                   |
| the version field                                              | absent from `record` and from patches (type errors), and rejected by the proxy at runtime                                                               |
| nested paths (`record.author.userId`)                          | work, with the nested field's type                                                                                                                      |
| tagged-union places, two `.list`s                              | each member is narrowed; `record` has exactly the shared fields, the tag as a union; a wrong member is rejected (reported at the entity, naming `kind`) |
| singletons, `.pick`                                            | the key comes from the response; a picked shape reports other fields as context                                                                         |
| `.as([Note], fn)`                                              | a change to an unlisted entity is a type error                                                                                                          |
| per-field prediction functions                                 | typed against the record and the real input; a wrong return type is a type error                                                                        |
| a patch to an unnamed entity                                   | a type error with a sentence; deletes may name any entity                                                                                               |
| `Entity.where` and `Entity.fields` targets                     | work; a wrong key shape is a type error                                                                                                                 |
| call-site `optimistic`, `setData`                              | type errors; `optimistic` says to declare `.predicts`                                                                                                   |
| `?:` in a recorded position                                    | **still compiles, recording one branch**: the mandatory source check stays                                                                              |

What the spike changed in the design:

- **`.predicts` runs twice.** Draft 8 wrote function-valued fields that close over `input`; at
  construction `input` is a recording proxy, so arithmetic on it throws. The callback is recorded
  once for its structure and run again for real at write start (section 4.6).
- **The input rule moved from `flow check` to the types** (section 2.4).
- **Deletes need no place**: only patches are checked against the entities an entry names.
- **Implementation trap**: a chain whose type accumulates the inputs it used must block inference
  from the expected return type (`NoInfer`, or overloads instead of a conditional return), or an
  inline entry widens to "every input used" and the rule silently passes. The spike hit this on
  `.derivedFrom`.
- **Messages.** Methods that are not available here take a sentence-typed parameter, so the error
  reads as a reason. `domain()`-level errors (the input rule, unnamed patches) carry the sentence on
  their second line, after a type dump; shortening them needs the named "verify" types the draft 4
  spike recommended, and entities with short printed names.

Not exercised: the Story read helpers, the trace and the runtime repair algorithm, which are gate 3.
The spike lives in the session scratchpad and is not part of the repository.

### 15.2 Agent experiment

Each agent got a sandbox with this document, the spike library, one app's entities and operations,
and a comment describing what the app's screens need, but no domain code and no examples. It wrote
the domain and could compile it, as an agent in a real project would.

| Result | |
| --- | --- |
| compile | ten of ten; nine on the first run (the tenth forgot an import) |
| would show a stale screen | none, judged against the reference domains of `entity-domain-examples.md` |
| better than the reference | two: the chat agent counted unread messages with `readByMe` in the condition; the shop agents saw that a cart line's `price` cannot collide with a product's, so the reference's `.pick` was unnecessary |
| legitimate alternatives | tie-break directions, a broader or narrower `.alsoChanges` target, `Cart.all` for a guessed side effect, no `.derivedFrom(Folder)` where no operation moves folders |
| questions the document did not answer | several places on a write; arrays in `.predicts` and `.alsoChanges`; writes with no place; absent inputs for `between`; what a derived answer's fields mean and whether `() => []` is allowed; sort direction of the tie-break; a target for an entity no answer holds; grouped derived answers; when `.pick` is needed. All are answered now (sections 2.3, 4.2, 4.3, 4.4, 4.6) |
| what they wanted and could not say | instant membership changes (tier 2, as intended); a target narrowed to fields (open question 4) |

Weaker agents (Haiku) produced domains equivalent to the stronger ones on the three hardest apps.

### 15.3 Runtime model

An executable model of section 5 (about 400 lines) implements the store, the join, frontiers, the
fence, one-hop observed deltas, confirming reads, per-record queues, forced repairs and tombstones,
for one versioned entity with list, count and by-key answers. A fake server applies writes, other
users' changes and pushes; the network reorders, fails and loses messages, and a lost write may
still apply. At each quiet point the checker requires C2 (every answer agrees with the server, or is
marked stale, or involves an uncertain record), C3 (no lookup starts while a repair's response is
applied), C4 (no field version moves backwards) and C5 (no prediction outlives quiet unless its
confirming read failed), and again after one machine request.

- **Result:** 40,000 runs of 60 steps pass, at about 26 lookups a run.
- **What it found in the design:** a response that is behind makes its own answer stale; rejected
  sources still reach derived answers, one hop from repair responses; streams must deliver in order.
  It also confirmed that versions must be per field (a response that omits a field must not advance
  that field's version).
- **Mutation check:** removing any of eight rules makes runs fail (both bases, the behind rule,
  rejected sources, the fence, unknown old values, one hop, per-field versions, forced repair). Four
  removals survive because of the model's simplifications, not because the rules are redundant:
  confirming reads (every list in the model carries every field), failure repair (the fake server
  never half-applies), retiring older predictions, and the positional tombstone (the versioned one
  covers it for a versioned entity).
- **Limits:** one entity, versioned only; no pages, persistence or audit mode. The implementation's
  property suite covers those.

## 16. Review record

Draft 8 applies eight reviews of draft 7: four lenses (scope and simplicity, semantic correctness,
agent authoring, truth as a compilation target), each by an Opus 5.5 reviewer and a Sol 6.1
reviewer. Each finding was checked against the text and decided by the priorities of correctness,
simplicity, performance and derivable truth; the decisions are in the commit message. Earlier
drafts' reviews are in this file's history.
