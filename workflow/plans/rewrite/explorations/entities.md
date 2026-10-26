# Entities: goals, boundaries and correctness

Status: the guide every entity proposal is measured against. It states what the entity work must
improve, what it must not become, which parts of Flow State it must work with, and what
"correct" means. It is not a design and names no API.

Documents measured against it:

- `entity-domain.md`: the tier-1 proposal, the chosen direction;
- `entity-domain-examples.md`: seven apps written with it;
- `sync-engine-adapter.md`: the tier-2 plug-in point, a future path; its section 0 binds version 1.

Earlier proposals (operation-first, entity-centric, the coordinator, the knowledge store) are in
git history at commit `ad129cc4`; `entity-domain.md` section 12 says why the domain was chosen. The
first version of this file is at commit `df45fec2`.

---

## 1. What we are improving

Flow State today (`minimal-library.md`, decisions 1–8a) caches **answers to questions**: "notes in
folder 3", "note 42", "the pinned count". Each answer is its own copy. When a command changes a
record, the author must remember every answer that shows it and patch or invalidate each one at
the commit site.

The author is usually an AI agent, and it forgets one. The results are three failures that never
crash, so no test fails and a human finds them later by accident:

1. **Stale screens after a write.** The rename shows in the editor but not in the sidebar.
2. **Optimistic updates that disagree.** The detail view flips at once and the list does not.
3. **Wrong empty or loading states.** "No results" shows when the data has not arrived.

The entity work exists to remove these failures by replacing "remember every place this data
appears" with declarations an agent can get right while looking at one place.

## 2. Goals

| #  | Goal                  | In one line                                                                                                                                                         |
|----|-----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| G1 | Coherence             | every copy of a server record shows the same fields in the same publication                                                                                         |
| G2 | Validity after change | a settled change repairs every answer it could affect, including answers that do not contain the record yet                                                         |
| G3 | Honest prediction     | anything shown before the server confirms it is marked, has a cause, and ends                                                                                       |
| G4 | Ordering safety       | a late or older response never overwrites newer truth                                                                                                               |
| G5 | Honest status         | an answer says whether it is loading, refreshing, failed or deleted                                                                                                 |
| G6 | Local declarations    | each fact about shared data is declared once, in one place, without global knowledge of the app                                                                     |
| G7 | Loud mistakes         | a likely mistake is a type error, a `flow check` error, or a diagnostic; when it cannot be, it fails in the safe direction (an extra refetch, never a stale screen) |
| G8 | Optional              | an app without shared records pays nothing; adoption is one entity at a time                                                                                        |
| G9 | Explainable           | every refetch, hidden record and prediction has one traced cause                                                                                                    |

## 3. Boundaries

### 3.1 The client predicts; the server decides

No locally computed result is ever authoritative. The server owns truth and membership: which
records belong in a list, in what order, with what totals. The client keeps copies of fields, and
may **predict** a change to a record's fields (an optimistic title). Every prediction is an overlay
with a cause, and the server confirms, retracts or corrects it. Predicting a list's membership is
tier 2 (section 3.3): it belongs to a sync engine.

This is the line between Flow State's entity work and a client database such as TanStack DB, which
computes membership with local queries over local collections.

### 3.2 Machines coordinate; the data layer keeps copies true

Machines decide what happens next: which command to send, what a failure means, whether a draft or
the server wins, when to refresh for a business reason. The data layer answers one question: is
this copy still what the server would say? It never starts a command, chooses a state, sends events
other than its lane outcomes, or reads one entity to change another. Machines never hold copies of
records.

### 3.3 Two tiers (decided)

Flow State's own entity layer is **tier 1**, a request cache that knows about records. Anything that
needs the client to hold or predict list membership is **tier 2**, provided by a sync engine
through an adapter. Flow State does not reimplement a sync engine's client half.

| Tier 1: built into Flow State                                                                             | Tier 2: a sync engine, plugged in          |
|-----------------------------------------------------------------------------------------------------------|--------------------------------------------|
| one record per key; every answer shows the same fields                                                    | live results kept current by pushes        |
| repair: answers that may hold or depend on changed records refetch when a write settles or a push arrives | instant list entry and exit; local queries |
| optimistic **field** patches, rollback, honest `unknown`                                                  | optimistic writes that change membership   |
| ordering, deletes, repair that never cascades                                                             | completeness of results; offline operation |

**What tier 1 gives up:** a record's fields change at once, but it leaves one list and enters
another when the refetch lands. A pending create is held in machine memory, or the app uses a sync
engine. There is no list-completeness flag beyond the lane's loaded status.

**Integration over generality.** The entity layer is part of Flow State, not a standalone library.
It uses what the Runtime already has (request start revisions, attempt ids, turns, the clock,
persistence, traces) and adds no host interface.

**Order of work.** Tier 1 is built in version 1. Tier 2 is not built by Flow State: sync engines
supply it through adapters written later against the contract in `sync-engine-adapter.md`, whose
section 0 lists what version 1 must guarantee so that no core change is needed.

#### Tier 0, 1 and 2: what each is for

Every app starts at tier 0, and each record type moves up only when it needs to. Tiers coexist in
one app, but each record type belongs to exactly one.

| Tier                    | What it is                                                                                                   | What the author does after a write                                                                          |
|-------------------------|--------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| **0: plain operations** | resources, transactions and streams from `minimal-library.md`; no entities                                   | refreshes what the write affected by hand (decision 6's call-site `writes`, `invalidate`)                   |
| **1: entities**         | one copy per record; answers that hold or depend on a changed record are repaired; optimistic field patches  | nothing beyond declaring what the write changes; fields update at once, lists settle when the refetch lands |
| **2: a sync engine**    | the engine holds collections, keeps results live, predicts membership and works offline; Flow State hosts it | nothing; the engine maintains results and confirms writes its own way                                       |

**Use cases.**

| Tier | Typical use                                                                                                                                                                                                                                                                  |
|------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0    | settings pages, checkout and onboarding wizards, server-computed reports and dashboards, uploads, heartbeats, analytics, internal tools where each screen owns its data                                                                                                      |
| 1    | a list beside a detail view, a sidebar repeating items, a user or avatar embedded across screens, boards, inboxes, admin tables with an editor; any REST or GraphQL backend                                                                                                  |
| 2    | chat and collaboration where lists must change instantly for everyone, live dashboards of other users' changes, local filtering, sorting and joining over a complete dataset, offline-first apps, backends that already speak a sync protocol (Postgres with Electric, Zero) |

**How common each is** (an estimate, not a measurement). Most product apps reach tier 1 for a few
record types, typically the signed-in user and the main thing the app is about, while most of their
code stays at tier 0. Small apps and single-screen tools never leave tier 0. Tier 2 is for apps
whose lists themselves must be live or offline, and needs server support.

**How to choose, per record type.**

- **Stay at tier 0** while the data is shown in one place, a write only refreshes the screen that
  made it, or the data is computed by the server and never edited.
- **Move to tier 1** when the record appears in more than one answer at once, a write to it must
  update another screen, or it is optimistic in one place and shown in another. The trigger an agent
  can follow: a commit site that needs two or more `invalidate` or `setData` calls for the same kind
  of record. `flow check` hints at it when two resources return the same key fields.
- **Move to tier 2** when the record's lists, not just its fields, must change instantly or stay
  live for many users, when the client must query data it has not fetched, or when the app must work
  offline.

**What tier 1 can imitate, and what it cannot.**

| Tier-2 feature                                   | In tier 1                                                                             |
|--------------------------------------------------|---------------------------------------------------------------------------------------|
| an item moving between lists                     | its fields change at once; the lists settle when the refetch lands                    |
| a new item appearing at once                     | a pending item held in machine memory and drawn by the view until the refetch lands   |
| live updates from other users                    | a push stream updates fields and refetches affected answers: correct, chattier        |
| instant membership in many lists, instant counts | possible only by hand-written placement per feature, which is error-prone; use tier 2 |
| offline use, queued writes                       | not possible                                                                          |
| local queries over data never fetched            | not possible: only an engine that syncs complete collections can answer them          |
| results kept live without refetching             | not possible: tier 1's membership always comes from a server response                 |

Moving up a tier changes declarations, not machines: tier 0 to tier 1 declares the entity and
registers its operations in a domain; tier 1 to tier 2 replaces those operations with an engine
adapter's streams and transactions.

### 3.4 Non-goals

| Not a goal                                    | Where it belongs instead                                     |
|-----------------------------------------------|--------------------------------------------------------------|
| local queries, joins, local sorting as truth  | a sync engine, through the tier-2 adapter                    |
| predicted list membership, list completeness  | a sync engine, through the tier-2 adapter                    |
| offline-first operation and write queues      | a later design (persisted operations, re-keying)             |
| collaborative text (CRDT, OT)                 | a plain stream to a sync provider, owned by a document actor |
| workflow: toasts, navigation, retries, drafts | machines                                                     |
| presence, typing, a device's own location     | plain streams mapped to events                               |
| a sync engine of our own                      | hosting existing engines (section 6)                         |
| server-side rendering hydration               | out of scope for version 1, as in `minimal-library.md`       |

## 4. Systems it must work with

| System                                               | What the entity work must respect                                                                                                                                                 |
|------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Machines** (decisions 1–8a)                        | activities subscribe, actions commit, outcomes return as events; memory holds keys and drafts; the data layer never makes workflow decisions                                      |
| **Operations** (`resource`, `transaction`, `stream`) | apps without entities keep them unchanged, including decision 6's call-site `optimistic` and `writes`; one canonical form per piece of data (D1)                                  |
| **Snapshots and React** (decision 8, `useView`)      | snapshots stay plain frozen data; lanes keep their statuses and `pending`; reads are passive and tear-free across actors                                                          |
| **The Runtime**                                      | ordered turns, one publication per turn, the Runtime clock, one Runtime per principal; nothing on wall time                                                                       |
| **Stories** (StoriesAndModels)                       | every input playable at an exact step; fixtures on the Runtime clock, no test-only escapes; checkpoints show the truth of their moment                                            |
| **The CLI**                                          | every relation is data `flow graph` can draw; `flow check` has a rule for each likely mistake; `explain` and `trace` answer "why"                                                 |
| **Inspection**                                       | nothing off the record, including suppressed repairs; available in production through `attachInspector`                                                                           |
| **Persistence**                                      | only server-confirmed data is persisted; restored data is treated as stale; predictions never survive as confirmed                                                                |
| **TypeScript and Effect 4.0.5**                      | Schemas own record shapes; identity survives the Schema combinators authors use; declarations type without manual annotations (spikes have found nested lambdas in arrays cannot) |
| **Sync engines, later**                              | the constraints in section 6 stay satisfiable                                                                                                                                     |

## 5. What correctness means

Correctness is stated as properties that a proposal must guarantee and that tests can check.

| #  | Property          | Statement                                                                                                                                                                        |
|----|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| C1 | Coherence         | at every publication, two copies of the same field of the same record show the same visible value                                                                                |
| C2 | Convergence       | once the server is quiet and requests complete, every active answer agrees with what the server returns for its input on every change the client observed (its own writes, pushes, responses), after a bounded number of refetches, or is marked stale with the recorded observation that made it stale |
| C3 | No cascades       | every refetch has recorded causes: a write settling, a pushed change, a machine's request, or an explicit invalidation; a repair's own response never starts another refetch |
| C4 | Monotonic truth   | no write replaces a field with data the store knows to be older                                                                                                                  |
| C5 | Honest prediction | every displayed value the server has not confirmed is an overlay with a live cause; it ends by confirmation, retraction or repair; it is marked `pending`; it is never persisted |
| C6 | No silent loss    | a record leaves an answer only because the server deleted it, a server response omitted it, or a live prediction hides it                                                        |
| C7 | Determinism       | the same Story inputs produce the same snapshots and traces                                                                                                                      |
| C8 | Explainability    | for any refetch, hidden record or prediction, the trace names its causes |

**Correct declarations are a precondition.** The properties hold only when authors declare
correctly. A proposal must therefore list every declaration that can be wrong and say, for each,
what catches it: the type system, `flow check`, a runtime self-check, the repair audit, a generated
test, or the safe direction. A declaration that can be wrong silently, with a stale screen as the
result, is a defect of the proposal.

**Evidence, not argument.** A proposal's claims are accepted only with:

- a property test that drives random interleavings of reads, writes, failures, uncertain endings,
  pushes and reconnects against a stateful fake server, and checks C1–C6;
- a TypeScript spike of its declaration forms against the installed Effect;
- an agent experiment: several agents write the scenarios in section 7, and their mistakes are
  counted by what catches them.

## 6. Sync engines: the tier-2 plug-in point

Sync engines (Electric, Zero, PowerSync, Firestore listeners) are not designed now, but nothing may
shut them out:

| Constraint                                                                                | Why engines need it                                        |
|-------------------------------------------------------------------------------------------|------------------------------------------------------------|
| one ingestion path for record changes (upsert or delete by key, with an optional version) | an adapter only has to produce those changes               |
| an answer may be maintained by its source, by refetching or by pushes                     | engines keep result sets live without a refetch            |
| keys are records of primitive fields                                                      | they must match tables' primary keys                       |
| versions are opaque, comparable and supplied by the source                                | engines order changes with their own versions              |
| updates from reads and pushes reach every copy of a record                                | engines push record values constantly                      |
| a write can be confirmed by its source, not only by its response                          | engines confirm writes by echoing an id                    |
| optimistic predictions are optional per write                                             | engines with their own client store predict for themselves |
| persistence can belong to the source                                                      | engines persist their own data for offline use             |

## 7. Scenarios every proposal must handle

Each scenario is written in every proposal, so they can be compared one to one.

| Scenario                                               | What it tests                                                       |
|--------------------------------------------------------|---------------------------------------------------------------------|
| rename a note shown in an editor, a list and a sidebar | G1: coherence without listing screens                               |
| move a note between folders with counts on screen      | G2: answers that gain or lose a record; counts that hold no records |
| two editors on one note, one dirty                     | G3, machines: drafts versus server changes                          |
| a save cancelled after sending                         | G3: `unknown` and its end                                           |
| a slow list response landing after a save              | G4: ordering                                                        |
| a note deleted by another user, pushed live            | G5, C6: deletes from outside                                        |
| a board drag between columns                           | fast field changes that must not refetch                            |
| a chat send and live messages                          | tier 1: a pending send in machine memory; tier 2: a sync engine     |
| e-mail labels and unread counts                        | many-to-many fields; aggregates                                     |
| a bank transfer between two accounts                   | one write changing several records of one type                      |
| a cart singleton and checkout                          | singletons; writes that return the whole record                     |
| a live map of moving drivers                           | high-frequency changes that rarely move membership                  |
| a global search across notes and folders               | answers spanning several entity types                               |
| settings, a heartbeat, an analytics event              | G8: parts of an app that need no entity                             |

## 8. How proposals are compared

1. **Correctness:** C1–C8, and which declaration mistakes remain silent.
2. **Ease of writing for agents:** decisions an agent must make before writing; how much it must
   know beyond the file it is in.
3. **Verification with the CLI:** what `flow graph`, `flow check` and `flow explain` can show
   without running the app.
4. **Stories:** how a scenario is written, replayed and asserted.
5. **Runtime orchestration:** whether every effect is caused, bounded and traceable.
6. **Simplicity:** names added, one canonical form per concept (D1), changes to agreed decisions
   (D10).
7. **Optional cost:** what an app without entities, and an app adopting its first entity, has to
   change.
