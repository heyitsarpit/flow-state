# Entity domain (draft 2): operations know nothing of entities

Status: an experimental variant of `entity-coordinator.md` (option B of tier-1 decision 1), not
decided. It does not replace that file. It is measured against `entities.md` and stays within
tier 1 (section 3.3): no predicted list membership. Code is illustrative.

Draft 2 replaces draft 1's vocabulary, which read as runtime mechanics (`answer`, `holds`,
`returns`, `where: { Note: { folderId: input("folderId") } }`), with declarations that read as
sentences. It records them the way TanStack DB's query builder does, and states the runtime in the
terms of differential dataflow. Section 11 lists the research behind each choice.

---

## 1. The rule

> **An operation describes a request. A domain describes what the request means for shared data.**

- **Request facts stay on the operation:** what is asked, with which input, what comes back
  (as a plain Schema), how long the answer may be cached, and how one actor issues the request.
- **Data-policy facts live in the domain:** which records the result contains, which changes can
  make an answer wrong, what a write predicts, and how writes to one record are ordered.

An operation module never imports an entity. Adopting entities edits the domain, not the
operations.

## 2. Reading a domain

Every name in a domain is either **yours** or one of a small, fixed set of **library words**.

| Yours                                                  | The library's                                          |
| ------------------------------------------------------ | ------------------------------------------------------ |
| the domain's id and the keys of its entries (`inFolder`, `rename`) | `domain`, `read`, `write`, `listen`        |
| entity names (`Note`) and their fields (`folderId`)    | `.one`, `.list`, `.count`, `.byKey`                    |
| operations (`notesInFolder`, `renameNote`)             | `.where`, `.unaffectedBy`, `.predicts`, `.alsoChanges`, `.oneAtATimePerRecord` |
| values inside functions (`input.folderId`)             | the operators `eq`, `oneOf`, `contains`, `between`, `and` |

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
| `.as((event) => change)` | how one stream event becomes a record change |
| `eq`, `oneOf`, `contains`, `between`, `and` | conditions inside `.where` |
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
(section 11).

### 4.1 Places in a result (`.one`, `.list`)

`({ result }) => result.notes` records the path `["notes"]`. An array on the path means each
element; `result.hits.note` over an array of hits means the `note` of each hit.

- **The record shape is inferred** from the struct at that place. It must contain the entity's key
  fields, and every field whose name matches an entity field must have that field's type. The
  matching fields are what this result carries; the rest (a search `highlight`) belong to the
  result, not the record.
- **Nested entities follow the entity's declaration.** `Note.fields.author` is a `User`, so holding
  a note holds its author as a user; the domain names only top-level places.

### 4.2 Conditions (`.where`)

`({ input, record }) => eq(record.folderId, input.folderId)` records the condition
`eq(record.folderId, input.folderId)`. Conditions use operators, never JavaScript comparisons:

| Operator | Condition |
| --- | --- |
| `eq(a, b)` | equal |
| `oneOf(a, values)` | `a` is one of an array |
| `contains(arrayField, value)` | an array field contains the value |
| `between(a, from, to)` | in a half-open range |
| `and(c1, c2, …)` | all hold |

Each argument is a record field, an input field, the signed-in principal (`principal()`) or a
constant. Several `.where` calls are combined with `and`.

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

The runtime is `entity-proposal.md` section 6 (ordering, contested and held fields, tombstones,
holding, persistence of confirmed data, one-hop repair). Draft 2 states it with four ideas from
differential dataflow, which turn its special cases into consequences.

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

---

## 6. Rules and checks

| Rule | Checked by |
| --- | --- |
| a recorded function is one expression of reads and operators | the proxy and the types for booleans (`===`), conversions and calls; a mandatory `flow check` error for conditionals, short-circuits and impure calls |
| `.one` and `.list` places exist; inferred record fields have the entity's types | the type system |
| an operation registered in a domain is reached only through it | `flow check` |
| an operation is in at most one domain; a domain's `api` covers its operations' services | the type system for registered values; `flow check` otherwise |
| a resource whose result carries an entity's key fields but is not in a domain | `flow check` warning |
| at most one `.byKey` per entity | `flow check` |
| predictions change only the write's own entity type | the type system |
| a condition the server contradicts | the response self-check, on every response |
| a missing `.alsoChanges` or a field wrongly in `.unaffectedBy` | the generated convergence test |

---

## 7. What this buys

- **It reads as a description of the app.** Each entry is a sentence. Library words are verbs and
  prepositions; everything else is the author's.
- **Operations never import entities**, and adopting entities edits only the domain.
- **One place for every entity fact**, so the impact table, the ownership checks and the generated
  test read the domain alone.
- **No strings for paths or fields.** Renaming a field renames every reference, and a typo is a
  type error.
- **One runtime model.** Deltas, a join, frontiers and consolidation replace a list of rules.

## 8. What it costs

- **Recording has limits.** Conditionals and short-circuits in a recorded function cannot be seen by
  the proxy or the types, and the result is a condition that is too narrow, which makes repair miss
  stale answers. A mandatory `flow check` error must catch them. This is the main new obligation.
- **Identity sits away from the shape.** Renaming `noteId` in a struct breaks the domain's `.list`:
  a type error, fixed in another file.
- **Inference by field name.** A struct field named `title` that means something else is read as
  the note's title. API structs normally agree with their records; nothing writes it down.
- **Two concurrency settings**: `concurrency` on the transaction and `.oneAtATimePerRecord()` in the
  domain. Different concerns, two knobs.

## 9. Compared with `entity-coordinator.md`

| | Coordinator (draft 1) | This draft |
| --- | --- | --- |
| identity of rows | picks inside the operation's `result` | `.one` and `.list`, record shape inferred |
| conditions | `when` closures and `ignoreChanges` lists | recorded `.where` with operators, `.unaffectedBy` |
| operation modules import entities | yes | no |
| adopting entities | edit results, then register | register only |
| feeds | the stream emits record changes | the stream emits plain events; `.as` maps them |
| the runtime | rules listed one by one | deltas, a join, frontiers, consolidation |
| everything else | the same: ownership, closed set, impact table, generated test, per-record order | the same |

## 10. Open questions

1. **`staleTime` and `gcTime`.** They stay on the operation as request facts. Should a domain be
   able to require them for its reads?
2. **Machine references.** Should definitions accept the raw operation name as an alias for its
   domain handle, so adoption renames nothing?
3. **Escape hatch.** TanStack DB offers `fn.where` for plain JavaScript that tools cannot analyse.
   Tier 1 does not need one: a condition the client cannot express is left out, which is safe.
   Keep it that way?
4. **Absent inputs.** In `oneOf(record.status, input.statuses)` with `statuses` absent, does the
   operator mean "no constraint"? It should, and every operator must say so
   (`entity-domain-examples.md`, the admin app).
5. **Intervals.** Calendars need `overlaps(start, end, from, to)` besides `between`.
6. **Two entity types in one array** (files and folders). Each element is matched to the entity
   whose key fields it carries, or the author names a discriminator field.
7. **Untested shapes.** Arrays of nested entities, nullable and optional places, and unions at a
   place were not exercised by the spike.

**Settled by the type spike** (section 12): the record shape is inferred, with an optional explicit
pick; chains need no annotations.

## 11. Research behind the choices

| Choice | Source |
| --- | --- |
| callbacks called once with recording proxies; a plain expression IR (`ref`, `val`, `func`) | TanStack DB `query/builder/ref-proxy.ts` and `query/ir.ts` |
| operators instead of `===`; rejecting a boolean with the right form in the message | TanStack DB `InvalidWhereExpressionError` |
| throwing from conversion hooks; caching child proxies; forbidding calls | proxy-recording prior art (TanStack DB, Immer, Vue reactivity) |
| conditionals are invisible to a probe and need a lint | Vue's dependency tracking and Immer's documented pitfalls |
| repair as an indexed join of changes and subscriptions, with a scanned fallback | Electric's `Shapes.Filter` (equality and inclusion indexes, `other_shapes` scans) |
| deltas, the join delta rule, frontiers, consolidation | differential dataflow and DBSP |
| no dataflow library at runtime | d2ts is dormant (last release June 2025); `@tanstack/db-ivm` computes results, which tier 1 does not |

## 12. Type spike results

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
