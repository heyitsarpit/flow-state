# Record migration: questions for the user (phase 1, round 1, 2026-11-09)

Everything here is **proposed**. Nothing is built for Q1; the cases named below pin what the design already says.

## What the design already gives an app (built and pinned, P1-M)

Where the data comes from: the Runtime's storage adapter (IndexedDB, `localStorage`, the fake's `kv`) hands Flow the bytes a capture wrote
under release 1. Flow parses its own envelope, then decodes the memory **per field, with the release that is running** (2.2.2). So an app
already migrates a record with Effect Schema alone, in three ways:

```ts
// release 2 of Lab/Memo (conformance/typed/phase1m.ts)
const Title = Schema.Struct({ text: Schema.String, lang: Schema.String });
// user-defined: TitleFromRelease1. Release 1 stored a string; this decodes it into the new shape, and encodes the new shape.
const TitleFromRelease1 = Schema.Union([
  Title,
  Schema.String.pipe(Schema.decodeTo(Title, SchemaTransformation.transform({ decode: (text) => ({ text, lang: "en" }), encode: (t) => t.text }))),
]);
definition({
  id: "Lab/Memo",                                  // existing
  persist: true,                                   // existing
  states: ["DRAFT", "SENT"],
  memory: {
    title: Flow.initial(TitleFromRelease1, { text: "", lang: "en" }),   // existing: Flow.initial; user-defined: the Schema
    body: Flow.initial(Schema.String, ""),
    // release 1's `legacy` is not declared: dropped at restore
    words: Flow.initial(Schema.Number, (start) => String(start["body"]).split(" ").length), // existing: a computed initial runs over the restored fields
  },
  …
});
```

Pinned: `P1-M/release-1-records-restore-under-release-2-across-a-reload` (title reshaped, `legacy` gone, `words` = 3, leaf `SENT` kept).
Purity: S11's replay re-runs the restore, so a migration that reads a clock or a counter is red in every Story that boots it (probe run,
not kept: `S11 replay differs: {"segment":1,"step":0,"input":"boot"}`). Flow cannot refuse one at construction: a transformation's decode
is a closure (stated limit, as `ImpureDefault`'s custom getter).

What it cannot do, and what happens then (2.7.17, rule 46; pinned by the two `...-quarantines-the-record-...` variants): a record whose
**leaf is a state the release removed**, or whose field no Schema of this release reads, is quarantined at the boot; an ensure starts
fresh (`RecordUndecodable`) from input and adopts its lanes. **The memory is lost.** The same for:

- a field renamed (`title` to `heading`): the old one must stay declared, optional, forever, for a computed initial to read it;
- two fields merged or one split, where the new value needs a field this release no longer declares;
- a state renamed (`SENT` to `SUBMITTED`) or moved under a new parent.

## Q1. How does an app migrate a record's memory and states across a release?

### Option A: Schema only (today). No new API

Write it into the release docs: per-field Schemas, computed initials, and keep old fields optional while any old record may exist. A
state rename or removal loses the record's memory.

```ts
// release 2: `title` renamed to `heading`, `SENT` renamed to `SUBMITTED`
memory: {
  title: Schema.optionalKey(Schema.String),                                         // existing; kept only to be read, forever
  heading: Flow.initial(Schema.String, (start) => String(start["title"] ?? "")),    // existing: computed over the restored fields
},
states: ["DRAFT", "SUBMITTED"],  // a record saved in SENT is RecordUndecodable: fresh memory, its lanes adopted
```

Added: nothing. Dropped: nothing. Cost: dead fields in every release; every state rename is data loss; `start["title"]` is untyped.

### Option B (recommended): `previous` on the definition, as operations have it

An earlier release's record shape is declared data, like `previous: [{ key }]` on a contract (2.7.15). Each capture stamps the record
with the version of its memory and states (as a lane is stamped with its key's version, in Flow's format-tagged spelling). At restore,
a record of the current version decodes as today; one of `previous[i]`'s version decodes by **that entry's** Schemas, and its `to` maps
it to the next entry, up to the current shape; then the current decode runs. A record matching no entry is quarantined, as today.

```ts
// release 3 of Lab/Memo: `title` renamed to `heading`, `SENT` renamed to `SUBMITTED`
definition({
  id: "Lab/Memo",
  persist: true,
  states: ["DRAFT", "SUBMITTED"],
  memory: {
    heading: Flow.initial(Title, { text: "", lang: "en" }),
    body: Flow.initial(Schema.String, ""),
    words: Flow.initial(Schema.Number, 0),
  },
  previous: [                                                     // NEW: previous (on the definition)
    {
      states: ["DRAFT", "SENT"],                                  // NEW: an earlier release's state names, as written then
      memory: { title: Schema.String, body: Schema.String, legacy: Schema.Number },  // NEW: its memory, as Schemas only
      to: ({ state, memory }) => ({                               // NEW: to, one pure step to the next shape
        state: state === "SENT" ? "SUBMITTED" : state,            // typed: "DRAFT" | "SENT" in, the next entry's states out
        memory: { heading: { text: memory.title, lang: "en" }, body: memory.body, words: memory.body.split(" ").length },
      }),
    },
    {
      states: ["DRAFT", "SENT"],                                  // release 2's shape, after release 1's
      memory: { title: Title, body: Schema.String, words: Schema.Number },
      to: ({ state, memory }) => ({ state: state === "SENT" ? "SUBMITTED" : state, memory: { heading: memory.title, body: memory.body, words: memory.words } }),
    },
  ],
  …
});
```

Added: `previous` on the definition; each entry's `states`, `memory` (Schemas, no `Flow` markers) and `to`; a version stamp on the actor
record (Flow-private); `flow check` errors for an entry whose `to` can return a state not in the next entry. Dropped: nothing; the
per-field Schema migration still works for small changes. Gotchas: the chain is ordered oldest first, each `to` maps to the next entry,
the last to the current definition; a nested state is named by its path; a fragment's memory has its own `previous` (it is declared
where the fragment is).

Why: one concept across the system (an earlier release, declared, matched by version, never guessed by shape), typed end to end, no
version number to forget (the stamp is Flow's), and `to` runs once per record at restore inside the core, so it is pure, synchronous and
replayed by S11 like the rest. Prior art: Zustand `persist` (`version` plus `migrate(state, version)`), redux-persist `createMigrate`,
IndexedDB `onupgradeneeded`: all number-based and untyped; XState has no snapshot migration; Effect Schema's own answer is a union of
tagged versions decoded into the current one, which Option B lifts from one field to the record.

### Option C: a version number and one migrate function over the encoded record

```ts
definition({
  id: "Lab/Memo",
  persist: true,
  version: 3,                                                     // NEW: version, bumped by hand
  migrate: (stored: unknown, from: number) => stored,             // NEW: migrate, over the encoded JSON, untyped
  …
});
```

Added: `version`, `migrate`. Cost: untyped (it sees Flow's encoded memory, which leaks Flow's record layout into user code), a missed bump
is silent, states and fragments are the user's to find in the JSON.

**Recommendation: B.** It needs the actor record to carry a version of its memory and states, which is the same mechanism as U17's key and
identity versions, so Flow already owes the format tag work for it (below).

## Not questions (the runner's calls, recorded as proposed)

- `previous: [{ key }]` is built as 2.7.15 says, with three calls: a current keyed member never names an old-version lane, even by the
  same key text (2.7.15 "never matched against a new key"); a `previous[i]` member names only lanes of its own version; an earlier key
  equal to the current key's version is refused (`PreviousIsCurrent`, proposed name).
- Flow's own record envelope (an actor record's `root`, `leaf`, `kids`, `activations`, a lane record's `head`, `w`, `parked`) has no
  format tag; only the version entries do. Proposed: every record carries Flow's record format; Flow keeps a pure upgrade from each older
  format to the next, run before the release's checks; a newer format than the running Flow is quarantined (a downgrade). Not built: no
  envelope change exists yet to test it against; it is the first item of the next round.
