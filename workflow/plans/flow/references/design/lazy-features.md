# Lazy-loaded features: design

Status: adopted, with later decisions. [LazyFeatures.plan](../../LazyFeatures.plan) is the
contract and wins where this document differs. React Suspense stays out of scope. Since this
design: transferred lazy entries load after `ready()` resolves instead of holding it (section 9),
and a dormant record that fails to decode is discarded alone (Q3).

## 1. The answer in one paragraph

The app stays a closed list (D13), but closed over **ids**, not over **code**. A lazy entry in
`app({ machines })` declares the machine's id and a loader (`load: () => import(...)`). The app
module then imports no feature code, and the bundler splits it out. At runtime Flow does not need
the loader to run a feature, because **a ref carries its machine**: any code that can name a lazy
actor (`editorRef(t)`, `createActor(EditorMachine)`, a Story) already has that machine's code in
its chunk. The first time a Runtime meets a lazy entry's machine, it **adopts** the entry
synchronously, as one admission step: compile, conflict checks, decode the entry's dormant
persisted data, install, then publish one cut. `ensureActor`, `send` and the React hooks keep their
synchronous signatures and need no loading state, no queue and no new names. The loader runs only
where no ref is in hand: in tools (`inspect`, the CLI and `flow check`, which load every entry so
the representation stays complete) and in client bootstrap after SSR (the server's adopted entries
must be adopted before hydration). Downloading the code is the router's or the bundler's job; React
renders a plain `import()` loading state, as for any other code-split component.

## 2. The tension and how it is resolved

| Need                                                                | Kept by                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| a complete structural representation for the CLI                    | tools await every `load`; `inspect(app)` sees every machine                                   |
| type-level wiring and service checks                                | `load`'s return type is `Promise<typeof EditorMachine>`, so `app()` types every lazy machine  |
| no dynamic universe (archived ApplicationsAndActors C1)             | adoption binds code to an id declared at construction; an undeclared machine is still refused |
| exact provenance                                                    | first machine object per id wins; another object with that id is `EntryMismatch`              |
| atomic publication, ordered turns, fencing, bounded resources       | adoption is one admission step with one publication, rolled back in reverse order on failure  |
| Story determinism                                                   | adoption is synchronous and happens inside the command that names the actor                   |
| a first bundle without every machine, operation, domain and service | app.ts imports only ids and loaders; heavy services use the deferred-service recipe (§7)      |

Why "the ref is the code" is safe: `actorRef(machine, id)` takes the machine value (O3). A module
that imports `editorRef` therefore imports `EditorMachine`, its definition, operations and domain.
The split falls where the app author puts it: at the route, the panel, or whatever the UI
code-splits on. Flow's only job is not to pull everything back into the entry bundle through
`app.ts` and `setup.ts`. That is the whole problem the minimal-library sketch named (decision 2,
"Open: lazy-loaded features").

## 3. The surface

### 3.1 One new entry form, and nothing else public

```ts
app({
  id,
  machines: {
    name: Machine,                                     // eager (today)
    name: { machine: Machine, context?: Wiring },      // eager with a wiring default (today, D14)
    name: { id: MachineId, load: () => Promise<Machine>, context?: Wiring },  // lazy (new)
  },
})
```

- **`id`** is the machine's definition id, exactly as authored (D9). It lets the Runtime map a ref
  to its entry, and tell dormant persisted data from orphans, without loading anything. The type
  of `load` must resolve to a machine whose definition id is the same literal. A mismatch is a type
  error, and also an `EntryMismatch` at adoption and in `flow check`.
- **`load`** returns a Promise of the machine:
  `() => import("./editor.machine.js").then((m) => m.EditorMachine)`. It is called only by tools
  and by post-SSR bootstrap (§9). It never runs in Stories or on a client that has the ref in hand.
- **`context`** is the wiring default, declared eagerly as for eager entries. Wiring is structure,
  so it stays in app.ts where `flow graph` reads it and where types check it against the lazy
  machine's context declaration. The providers it names (`SessionRef`) are imported eagerly, so a
  wiring default should name only eager providers. A lazy provider belongs in a ref's own
  `context` instead.
- **No `services` on an entry.** Services stay one Layer on `runtimeSetup` (D15). Its requirement
  closure covers lazy machines through their loader types. Heavy service code is deferred inside
  the service (§7).

Deliberately not added: `lazy()`, `feature()`, `runtime.load`, a loading lifecycle, a loading
handle, `useLazyActor`, per-entry Layers, or a Story `load` command. §13 says why.

### 3.2 Changed: `inspect` returns a Promise

`inspect(app): Promise<Model>` awaits every lazy entry's `load` (in declaration order, all started
at once), then compiles. One form for every app. `render(model, ...)` stays synchronous. The CLI
already runs asynchronously. `attachInspector(runtime, sink)` is unchanged and reports adoption as
an event (§10).

### 3.3 New diagnostics codes

`EntryMismatch` and `EntryLoadFailed` (§11). Collisions found at adoption reuse the construction
collision codes, with `details.entry`. `SendTargetAbsent` gains `details.adopted: boolean`.

## 4. Worked example (Dispatch Desk)

Make the editor lazy, and add a hypothetical Reports panel as a fully lazy feature with its own
domain, entity and a heavy chart SDK.

```ts
// app/app.ts: no editor or reports code is imported here
import { app } from "flow-state";
import { SessionMachine } from "../features/Session/session.machine.js";
import { SessionRef } from "../features/Session/session.ref.js";
import { QueueMachine } from "../features/Tickets/queue/queue.machine.js";
import { ToastsMachine } from "../features/Toasts/toasts.machine.js";

export const DeskApp = app({
  id: "dispatch-desk",
  machines: {
    session: SessionMachine,
    toasts: ToastsMachine,
    queue: { machine: QueueMachine, context: { userId: SessionRef } },
    editor: {
      id: "DispatchDesk/Editor",
      load: () =>
        import("../features/Tickets/editor/editor.machine.js").then((m) => m.EditorMachine),
      context: { canEdit: SessionRef },
    },
    reports: {
      id: "DispatchDesk/Reports",
      load: () => import("../features/Reports/reports.machine.js").then((m) => m.ReportsMachine),
      context: { userId: SessionRef },
    },
  },
});
```

```ts
// app/setup.ts: one Layer, as today. ChartsApi's Layer is cheap; its SDK loads on first use.
export const DeskSetup = runtimeSetup({
  app: DeskApp,
  services: Layer.mergeAll(DemoTicketApi, ChartsApiLive),
});

// features/Reports/charts-api.ts: the deferred-service recipe (plain Effect, no Flow API)
export const ChartsApiLive = Layer.effect(
  ChartsApi,
  Effect.gen(function* () {
    const sdk = yield* Effect.cached(
      Effect.tryPromise({
        try: () => import("heavy-chart-sdk"),
        catch: (cause) => new ChartsUnavailable({ cause }),
      }),
    );
    return ChartsApi.of({
      render: (input, signal) => sdk.pipe(Effect.flatMap((m) => m.render(input, signal))),
    });
  }),
);
```

```tsx
// app/view.tsx: the panel's code (component, editorRef, EditorMachine, its definition) loads on
// open. The loading state is ordinary React state: no Suspense and no Flow API.
function Desk() {
  const [opened, setOpened] = useState<TicketKey | null>(null);
  const [Panel, setPanel] = useState<
    typeof import("../features/Tickets/editor/TicketPanel.js").TicketPanel | null
  >(null);

  const open = (ticket: TicketKey) => {
    setOpened(ticket);
    if (!Panel)
      void import("../features/Tickets/editor/TicketPanel.js").then((m) =>
        setPanel(() => m.TicketPanel),
      );
  };

  return (
    <main className="desk">
      <QueueList workspaceId="north" onOpen={open} />
      {opened &&
        (Panel ? <Panel key={opened.ticketId} ticket={opened} /> : <p role="status">Opening…</p>)}
      <ToastStack />
    </main>
  );
}
```

`TicketPanel`, `useEditor` and `editorRef` do not change. When `useEditor` runs, its effect calls
`ensureActor(editorRef(t), { input: t })`. The Runtime sees `DispatchDesk/Editor` for the first
time and adopts the entry: it compiles the editor, sees that the ticket domain is already known
(the queue uses it), decodes dormant editor records for this scope, and installs. Then it ensures
the actor. All of this happens in one synchronous call. In a Next.js App Router app the same thing
happens without the `useState` dance: each route's client components are already split
(https://nextjs.org/docs/app/guides/lazy-loading), so a route that renders `TicketPanel` carries
the editor, and the root layout's `FlowProvider` carries only app.ts and setup.ts.

The editor's `send(ToastsRef, ...)` imports the toasts machine, which is eager here anyway. Had
toasts been lazy, the editor's chunk would carry it, which is correct: a sender needs the target's
event vocabulary.

```ts
// Stories need nothing new: ensure adopts inside the command.
export const saved = story
  .app(DeskSetup, { id: "ticket-save", fixtures: [SlowSave] })
  .ensure(SessionRef)
  .ensure(Editor42, { input: T42 }) // adopts DispatchDesk/Editor here, at this exact step
  .send(Editor42, E.SaveRequested())
  .process()
  .checkpoint("saving");
```

## 5. Adoption: exact semantics

### 5.1 Triggers

A Runtime adopts an inactive lazy entry when one of these meets a machine whose id is that entry's
`id`:

1. `runtime.ensureActor(ref, ...)`, including through `useActorByRef(ref, options)` in its effect
   and through Story `ensure`;
2. `runtime.createActor(machine, ...)`, including `useActor` and `story.machine`;
3. construction, when an eager entry's wiring default or ref names a lazy machine (§5.5);
4. post-SSR bootstrap, for entries named in the server's transfer (§9), through `load`.

These never adopt: lookup-only `useActorByRef(ref)` in render (render creates nothing, O7), an
actor's `send(ref, ...)` action (§6.3), `getSnapshot` or `useView` reads, inspection and capture.

### 5.2 Steps (one admission, one publication)

Adoption runs inside the admission of the call that triggered it, before that call's own
registration. It is synchronous for triggers 1 to 3.

1. **Provenance.** The machine is a Flow machine. Its definition id equals the entry `id`, and no
   other machine object has been adopted for that id in this Runtime. Otherwise: `EntryMismatch`.
2. **Compile.** Compile the machine inertly with the same compiler as construction (cached per
   machine object across Runtimes, since compilation is pure). Record every domain, entity and
   operation that the definition reaches.
3. **Closure.** Collect the entry's wiring: the app default and, for an ensure, the ref's own
   `context`. Any provider whose machine is an inactive lazy entry is adopted in the same step,
   transitively. Its code is in hand, because the wiring holds its ref. Run the context-cycle
   check over the adopted graph plus the new closure. Every upward read from the new nodes is
   inside it, so a cycle that involves them is found.
4. **Conflicts.** Merge the closure's ids into the Runtime's compiled graph and run the
   construction rules that span machines: machine, operation, domain, entity and resource id
   collisions; one object per entity id (a second `entity` value with the same id is a
   collision, which catches duplicated module copies); an operation registered in at most one
   domain; at most one `.byKey` per entity across the adopted graph (entity-domain.md section 9).
   Failure: the construction code, with `details.entry`.
5. **Prepare dormant data.** Decode and validate this closure's dormant persisted records (§8)
   detached, before installation, exactly as bootstrap prepares restored data before services.
6. **Install.** Register the compiled entries. Install restored actors, resource entries and
   entity records (restored at position 0, with frontiers lowered, entity-domain.md section 5.5).
   Establish silent context baselines and activate restored actors.
7. **Publish** one cut, which carries the new structure and the restored truth. Then the
   triggering admission continues as it would for an eager machine.

If any step fails, nothing from steps 2 to 6 stays: rollback runs in reverse order, as admission
rollback already does. The entry stays inactive. The triggering call throws (host) or reports
(hook, §6.4) one `FlowError`. A later trigger retries from step 1. Every failure in steps 1 to 5
is deterministic, so a retry fails the same way unless the code changed.

### 5.3 Ordering and guarantees

- Adoption happens only at admission boundaries, never inside a macrostep. No actor's turn
  observes a half-adopted graph.
- Adoption is idempotent: an adopted entry is never adopted again, and a later trigger only checks
  provenance (step 1).
- Entries are never unloaded. JavaScript cannot unload a module, and the number of entries is
  closed, so the adopted set is bounded by the app.
- Adoption order changes nothing a Story asserts on, except through the data it restores. Two
  Runtimes that adopt the same entries in different orders compile the same graph (§12, V-L4).

### 5.4 Provenance, honestly stated

Eager entries keep exact object provenance against the app value. Lazy entries get "declared id,
first object wins, every later object must be identical". A forged or mistaken machine still
cannot run under an id the app does not declare. A second copy of a feature module (the dual
package hazard, a duplicated chunk, an HMR re-execution) fails loudly with `EntryMismatch`. When
`load` does run (tools, post-SSR bootstrap), its result must be the adopted object.

### 5.5 Lazy entries reached from eager code

If an eager machine's wiring default, an eager ref, or `setup.ts` reaches a lazy machine's object,
the bundler has already put that code in the first bundle. Construction adopts such an entry at
`ready()` (trigger 3), so behaviour stays correct. `flow check` warns with `LazyEntryReachedEagerly`
(§10), because the split has been lost.

## 6. Actors

### 6.1 `ensureActor`, `createActor`, `disposeActor`

Signatures and synchronous contracts are unchanged. For an inactive lazy entry they adopt first
(§5.2), then admit. Calling either before `ready()` keeps today's error. Disposal and `retain` are
unchanged. Disposing every actor of an entry does not deactivate it.

### 6.2 Handles and sends from outside

A handle exists only after its actor is admitted, which is after adoption. So **no event can be
sent to an actor whose code is not loaded**: there is nothing to queue, reject or drop, and no new
bound. `actor.send` keeps its bounded mailbox and `AdmissionOverloaded`.

### 6.3 Actor-to-actor `send(ref, ...)`

The rule is unchanged: a send to a ref with no actor is dropped and reports `SendTargetAbsent`
(O3, D27). An unadopted entry has no actors, so a send to it drops. The diagnostic adds
`adopted: false`, so an agent can tell "the actor was never ensured" from "its feature was never
opened". A send never adopts, because adoption would create structure from inside a turn. The
existing `flow check` warning ("send target not ensured at startup") covers both cases.

### 6.4 React

- `FlowProvider`, `useActorByRef`, `useActor` and `useView` are unchanged. Adoption happens in the
  same effect that ensures or creates, never in render.
- **Loading the code** is done before the component that calls the hook exists, by whatever loads
  that component: the router's route chunks, `import()` in an event handler with a state flag
  (§4), or a framework's dynamic import. React renders that loading state itself, without Flow and
  without suspending.
- **Loading the data** is shown, as today, through lanes (`title ?? "Loading…"`).
- **Dependency on O7's first render.** Before the effect runs, the ensure form has no actor yet
  even for eager machines. O7 deleted render-time preparation and states no first-render rule.
  Lazy entries add no new window: whatever O7 decides for an eager machine (recommended in Q1: the
  ensure form returns `null` until the actor exists, and `useView` accepts `null`) applies
  unchanged.
- **Adoption failure in a hook** (`EntryMismatch` or a collision) is a build defect. The hook
  rethrows the `FlowError` during the next render. That is ordinary React, not error-boundary
  integration: a Next.js `error.tsx` boundary shows it, and its `reset()` re-renders, which
  retries adoption (Q4).

### 6.5 Context and wiring defaults

A lazy machine's wiring is resolved like an eager one's: the ref's `context`, else the app
default. Providers are adopted in the same step (§5.2 step 3). The silent first baseline and the
causal waves of O4 apply from that step's publication. A provider adopted later than its consumers
cannot happen, because a consumer's admission needs its providers.

### 6.6 Schedules, activities and commits

Nothing new. An adopted actor starts its schedules and activities on admission, or restores them
(§8). Commits, `writes`, `optimistic` and `attempt.id` behave as for eager machines. An actor
restored at adoption with an in-flight commit gets that commit's `unknown` outcome at adoption,
the same rule bootstrap applies (O8).

## 7. Services

- **One Layer per Runtime** (D15). The type of `runtimeSetup` requires `services` to provide the
  union of requirements of every entry, lazy entries included, read from `load`'s type. A missing
  service is a type error, as today. Nothing is built at adoption, so adoption has no Layer
  failure mode and stays synchronous.
- **Deferring heavy service code** is a recipe on Effect primitives, not a Flow feature: the Layer
  builds a thin service at `ready()`, and the service loads its implementation on first call with
  `Effect.cached(Effect.tryPromise(() => import(...)))` (§4).
  - The load runs once per Runtime. `Effect.cached` memoises success. On failure, use
    `Effect.cachedInvalidateWithTTL`, or catch and rebuild the cache, so the next call
    re-imports. Browsers implementing whatwg/html#10327 no longer cache a failed module fetch
    (https://github.com/whatwg/html/pull/10327), so a re-import refetches.
  - A load failure is the adapter's own failure, before any request is sent. For a lookup it is
    the lane's `Failure`. For a commit it is a typed failure (`ChartsUnavailable`), never
    `unknown`: the request was not dispatched, which is the "honest remote uncertainty"
    invocation boundary of O5.
  - Shared base services (KeyValueStore, TicketApi) are built once, by Effect's ordinary Layer
    memoisation (https://effect.website/docs/requirements-management/layer-memoization/).
- **Rejected: per-entry `services` built at adoption.** That would make adoption asynchronous,
  bring back a loading state and queued sends, add a Layer failure mode at an admission boundary,
  and need a rule for two entries providing one Tag (a shared resource entry would run under
  whichever entry adopted first: nondeterminism). The recipe gives the same bundle split for the
  one part that is heavy, the SDK.

## 8. Persistence (amends O8)

### 8.1 Dormant records

- **Bootstrap reads all of the scope.** Effect's `KeyValueStore` cannot list keys, so S6 keeps a
  per-scope manifest. `ready()` reads the manifest and every record's bytes, bounded by the scope's
  size bound. It decodes only records whose owner is adopted. Every other record is **dormant**:
  bytes held in memory, keyed by owner id (machine id, operation id, entity id).
- **Adoption decodes dormant records** with the newly compiled Schemas (§5.2 step 5). Restore
  rules are unchanged: no replay of input, `initial`, events or finite work; pending commits come
  back as `unknown`; deadlines are absolute.
- **Capture** writes the records of adopted owners, as today. It never rewrites or drops a dormant
  record. With per-record keys they are left untouched. If S6 writes one blob per scope, dormant
  bytes are re-emitted byte-identical. A failed write keeps the last good record, as today.
- **Orphans.** A dormant actor record whose machine id is in no entry is an orphan, found at
  `ready()` without loading because lazy ids are declared. It follows O8's rule for removed
  machines. Operation and entity ids of lazy entries are not known before adoption, so their
  unclaimed records stay dormant until adoption, or until a `version` change discards the scope
  (Q5).
- **Durable context closure.** Unchanged, and checked at capture over adopted actors. A dormant
  consumer has no live context, and gets a fresh baseline from current providers at adoption
  (restore never uses serialised selected values).

### 8.2 Uncertain writes must not wait for a feature

A persisted uncertain write records the entity keys it predicted (entity-domain.md section 5.5).
If those keys were inside the dormant actor record, a ticket that an unopened lazy editor left
uncertain would show as certain in the eager queue: a breach of honest uncertainty (D7). So:

- **The predicted keys are stored as their own plain-data record** (entity id, canonical key,
  attempt id), separate from the actor record.
- At `ready()`, or at the first adoption that makes the entity known, the record is marked
  `uncertain` and the forced repair runs (the `.byKey` loader if adopted, plus every active answer
  that holds the record).
- The owning actor's `unknown` outcome still waits for that actor's adoption. Reconciliation is
  workflow, so it belongs to the machine.

Rule: **an uncertainty marker applies no later than the first moment its record is readable.**

### 8.3 Second tab and scopes

Unchanged. A second tab on the scope runs without persistence, so it has no dormant set. A
different scope is a new Runtime, with its own dormant set and its own adopted set.

## 9. SSR and hydration

Coordinate with the SSR design. The lazy-specific rules are:

- **Server.** A per-request Runtime. Server host code ensures actors with refs in hand, so
  adoption is synchronous on the server. Client components rendered on the server run their hooks
  in render only (no effects), so ensures happen in host code before render. That rule does not
  depend on laziness.
- **Transfer.** The dehydrated payload lists the **ids** of the entries the server adopted. It
  never carries module specifiers. The client accepts only ids its app declares (any other id
  fails the payload's validation), so a payload cannot make the client import arbitrary code.
- **Client bootstrap.** `ready()` resolves without waiting for lazy code: one slow chunk must not
  hold every ensure and send in the app. After it resolves, the client starts `load` for every
  transferred entry id in parallel, each bounded by 10 seconds. An entry adopts when its load has
  finished and the first attach holding its ref has happened, installing its transferred state;
  until then the server view stays on screen. In Next.js the route's client chunks are usually
  already on the page, so each `import()` resolves at once from the module map.
- **A failed client load** reports `EntryLoadFailed` with the cause. The entry stays inactive, its
  transferred state provisional and its persisted data dormant. The next attach holding the ref
  retries the load. Truth is preserved, and only the hydration is lost.
- **Cross-request isolation.** Compiled machines are cached per machine object across Runtimes,
  because they are pure and inert. The adopted set, dormant bytes and restored actors belong to
  one Runtime and are never shared between requests or scopes.

## 10. Inspection, traces and `flow check` (amends O11)

- **Representation.** Every entry carries `loading: "eager" | "lazy"`. A lazy entry also carries
  its `id` and, live, `adopted` with the adopting trigger. `await inspect(app)` loads every entry,
  so the static representation is complete, and identical to the one an all-eager app would have
  except for the `loading` field. `flow graph` marks lazy nodes, and Mermaid draws them dashed.
- **Trace events.** `EntryAdopted { entry, trigger: "ensure" | "create" | "construct" | "bootstrap",
  closure: [entry ids], restored: { actors, resources, records } }` and
  `EntryAdoptionFailed { entry, code }` (attachInspector, Story evidence, trace artifacts),
  bounded like every other event. Checkpoints list the adopted entries.
- **`flow check` rules**, all over the full loaded graph:

| Rule                                                                                                       | Level   |
| ---------------------------------------------------------------------------------------------------------- | ------- |
| a lazy entry's `id` differs from its loaded machine's definition id (`EntryMismatch`)                      | error   |
| one machine listed twice (eager and lazy, or as two lazy entries)                                          | error   |
| `load` fails to import at tool time (`EntryLoadFailed`)                                                    | error   |
| every existing cross-machine rule (collisions, one `.byKey`, one domain per operation, context cycles)     | error   |
| an entity's `.byKey` lives in a lazy entry, while another entry holds, predicts or listens to it           | warning |
| a lazy machine's object is reachable from eager wiring, `setup.ts` or `app.ts` (`LazyEntryReachedEagerly`) | warning |
| `load` is not of the form `() => import("<literal>")` or `.then((m) => m.X)`                               | warning |

The `.byKey` warning exists because, before that entry is adopted, confirming reads and forced
repairs for the entity fall back to active answers, or drop the field (section 5.5 of
entity-domain.md). That is safe (G7) but does less work than the full app would. The remedy is to
move the `.byKey` read into an eager domain, or into the same entry as every user of the entity.

## 11. Failures and diagnostics

| Case                                                                  | Where                                      | FlowError code                               | Classification | Retry                                               |
| --------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------- | -------------- | --------------------------------------------------- |
| machine id differs from entry `id`, or a different object for that id | adoption, `load` result, `flow check`      | `EntryMismatch`                              | Defect         | none useful; reload or fix the build                |
| collision, second `.byKey`, operation in two domains, context cycle   | adoption step 3 or 4, `flow check`         | existing construction codes, `details.entry` | Defect         | deterministic; fix the code                         |
| dormant record fails decoding or validation                           | adoption step 5                            | O8's restore codes                           | per O8 (Q3)    | per O8                                              |
| `load` rejects (chunk 404 after a deploy, offline)                    | `inspect`, CLI, client bootstrap after SSR | `EntryLoadFailed`, cause = the import error  | Failure        | next trigger calls `load` again; no automatic retry |
| ensure or create before `ready()`                                     | host                                       | unchanged                                    | unchanged      | unchanged                                           |
| send to an unadopted entry's ref                                      | actor action                               | `SendTargetAbsent` with `adopted: false`     | report only    | n/a                                                 |
| a deferred service's import fails                                     | adapter                                    | none from Flow: the adapter's typed failure  | Failure        | the recipe re-imports on the next call              |

Remediation text: `EntryMismatch` says "two copies of `<id>` are loaded, or the entry's `id` does
not match its machine; check for duplicated packages or chunks and stale HMR state, and reload".
`EntryLoadFailed` names the entry and says that after a deploy the old chunks may be gone, so
serve HTML with `Cache-Control: no-cache` and reload on `vite:preloadError` or webpack's
`ChunkLoadError` (https://vite.dev/guide/build#load-error-handling).

## 12. Stories and tests (amends O9)

- **No new command.** `ensure` and `story.machine` adopt synchronously inside the command, at an
  exact step, with the TestClock frozen. `load` never runs in a Story, so there is no real
  asynchrony to order. That is what "load deterministically" means here: adoption is a pure
  function of the code and the dormant bytes.
- **Checkpoints** list the adopted entries, and the evidence carries `EntryAdopted`. A test can
  assert that a step adopted nothing (a Story about the queue must not pull in the editor).
- **Persistence in Stories**, with an in-memory `KeyValueStore` fixture seeded with an editor
  record: the Story asserts the record stays dormant through queue-only steps, and is restored at
  the `ensure(Editor42)` step without replaying `initial`.
- **`model` and `propertyTest`** are unaffected (pure, and given explicit domains). `propertyTest`
  gains one generated step, "adopt domain D now", to show that adopting mid-run keeps C1 to C8.
- **`CheckpointProvider`** is unaffected: it renders frozen snapshots of actors that existed.
- **SSR bootstrap and `load` failure** are covered by Runtime production tests (V-L5), not
  Stories. A Story's inputs are commands and fixtures, and module loading is neither.

## 13. Alternatives considered and rejected

| Alternative                                                                                  | Why rejected                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| async `ensureActor`, or a handle with a `loading` lifecycle and queued sends                 | changes the core sync contract (O3), re-adds a lifecycle D16 removed, needs a pre-load snapshot (the deleted "prepared actor" of archived ReactAndHosts O2) and a queue bound, and is unnecessary because refs carry the code                               |
| `ensureActor` throws `NotReady` until `await runtime.load(ref)`                              | adds a name, and a likely agent mistake (forgetting the load), to guard an asynchrony that does not exist when the ref is in hand                                                                                                                           |
| a `lazy(() => import(...))` helper (minimal-library sketch)                                  | the entry object already distinguishes the forms; the sketch also could not map a ref to its entry without loading, which `id` solves                                                                                                                       |
| runtime registration of features (RTK `combineSlices().inject`, RTK Query `injectEndpoints`) | an open universe: tools cannot see what may be injected, and the archive's C1 excludes it. RTK needs `withLazyLoadedSlices` declaration merging to recover the types (https://redux.js.org/toolkit/api/combineSlices), which our `load` type gives for free |
| per-entry service Layers                                                                     | §7                                                                                                                                                                                                                                                          |
| a generated manifest of lazy ids or digests                                                  | D2: no generated spec file is stored                                                                                                                                                                                                                        |
| refs built from loaders so that importing a ref imports no machine code                      | needs eager ids and event Schemas anyway, makes `send` asynchronous, and saves little: the sender needs the target's definition                                                                                                                             |
| module federation or remote entries                                                          | not version 1; `load` must be a build-local `import()` (flow check warning)                                                                                                                                                                                 |

Prior art behind the shape: TanStack Router keeps route structure (paths, search validation,
loaders) in the eager config and splits only the component
(https://tanstack.com/router/latest/docs/framework/react/guide/code-splitting): structure eager,
code lazy, as here with `id` and `context`. React's `lazy` caches the load promise and needs
Suspense for a fallback (https://react.dev/reference/react/lazy), which is why Flow leaves code
loading to the host.

## 14. What to reuse

- **Admission and rollback** (archived ApplicationsAndActors O3 and O4, ported runtime-next
  admission): adoption is one more admission phase with the same reverse-order rollback.
- **Bootstrap order** (archived Persistence O2: validate and prepare detached data, then install,
  then baselines, then activate): adoption repeats it for one closure.
- **The construction compiler and its collision checks** (S2): adoption calls them over the
  adopted graph plus the new closure. Construction-only checks must be written as a function of a
  graph, not of the app value, so both callers share them.
- **Context lineage and waves** (runtime-next port): silent baselines at adoption.
- **The rewrite's `prepareActorSnapshot` exact-shape admission and restore seam**
  (packages/flow-state-rewrite/src/runtime/actor-engine.ts), for decoding dormant actors.
- **The old package's bounded boot decoder limits** (packages/flow-state
  runtime-boot-decoder.ts), for the transfer payload's entry-id list and dormant bytes.
- Nothing in either package implements lazy loading. Both are closed over machine objects.

## 15. Verification

- **V-L1 Types (S1 spike).** A lazy entry infers its machine from `load` without annotations. The
  wiring default is checked against the lazy machine's context. The `runtimeSetup` service closure
  includes lazy requirements. Negative fixtures: wrong `id` literal, missing service, wrong
  context provider, `load` resolving to a non-machine.
- **V-L2 Bundle split (S10).** Build Dispatch Desk with Vite and with Next.js. Assert that the
  entry chunk contains no `DispatchDesk/Editor` or Reports code (by searching the bundle for
  definition ids) and no chart SDK, and that the app still passes every Story.
- **V-L3 Adoption (S3).** Synchronous adoption on ensure, create and construct. One publication.
  Rollback after a failure at each step leaves no trace. Idempotence. `EntryMismatch` for a second
  object. A transitive provider closure. A cycle found only through the new closure. Collisions
  across entries.
- **V-L4 Order independence (S3, S5).** Two Runtimes adopt the same entries in different orders
  and produce identical compiled graphs and identical traces for the same commands.
  `propertyTest` with the adopt step.
- **V-L5 Persistence and SSR (S6, SSR stage).** Dormant records survive many captures
  byte-identical. Restore at adoption without replay. An uncertainty marker applied at `ready()`
  for an eager entity while its actor stays dormant. Orphan detection by declared id. A client
  bootstrap that loads transferred ids, rejects undeclared ids, and survives a `load` rejection,
  with adoption on a later ensure.
- **V-L6 Tools (S9).** `inspect` of a lazy app equals that of the all-eager app except for
  `loading`. Each new `flow check` rule fires on a fixture. `EntryLoadFailed` sets the exit
  status.
- **V-L7 Stories (S7).** A Story's checkpoints show adoption at the exact `ensure` step. Two runs
  give identical traces.

## 16. Plan amendments

- **D50:** delete "lazy-loaded features".
- **O3:** add the lazy entry form, adoption (§5) and its provenance rule. Add `adopted` to
  `SendTargetAbsent`.
- **O7:** state that adoption happens in the hook effects, and that code loading is the host's
  (no Suspense). The first-render rule is Q1.
- **O8:** add the manifest, dormant records, byte-identical carry-forward and separate
  uncertainty markers (§8).
- **O9:** adoption in `ensure` and `story.machine`, adopted entries in checkpoints, the
  `propertyTest` adopt step.
- **O10:** `EntryMismatch` and `EntryLoadFailed`.
- **O11:** `inspect` returns a Promise, the representation's `loading` field, the trace events and
  the `flow check` rules of §10.
- **minimal-library decision 2:** replace the "Open" note with this design.

## 17. Open questions, with recommendations

- **Q1. What does the ensure form of `useActorByRef` and `useActor` return before its effect has
  created the actor?** This is not lazy-specific. O7 deleted render-time preparation, so the first
  render has no actor even for eager machines, and the plan gives no rule. _Recommend:_ the
  ensure form returns `Actor | null`, `null` until the actor exists in the Runtime (an existing or
  restored actor is found by passive lookup in render, so it is non-null at once), and `useView`
  accepts `null` and returns `undefined`. The type then forces the loading branch (D5), and one
  rule covers eager machines, lazy machines and SSR. The cost is a one-frame loading render for
  actors created on mount, and TicketPanel changes. This is the riskiest question, because it
  changes O7 for every app. Lazy entries need no more than whatever is decided.
- **Q2. Should a lazy entry's `id` be inferred instead of written?** It cannot be: mapping a ref
  to its entry, and telling dormant data from orphans, must work without loading. _Recommend:_
  keep it explicit and type-checked against `load`. This needs definitions to keep their id as a
  literal type (add to the V1 spike).
- **Q3. What happens when a dormant record fails to decode at adoption?** Failing adoption would
  make the feature unopenable until storage is cleared. _Recommend:_ follow O8's bootstrap rule
  for an invalid record, ideally "discard that record with a restore diagnostic and continue
  fresh; storage keeps the last good bytes until a successful capture replaces them". Adoption
  never fails because of persisted data.
- **Q4. Should a hook rethrow an adoption failure in render?** _Recommend:_ yes. Adoption failures
  are deterministic build defects (mismatch, collision). Rendering a broken feature as if empty
  would hide them, and Next's `error.tsx` with `reset()` is the standard surface. `load` never
  runs in a hook, so a network failure cannot reach this path.
- **Q5. How long do unclaimed dormant records of undeclared operation or entity ids live?**
  _Recommend:_ until a persistence `version` change. They are bounded by the scope's size bound,
  and only tools can know every owned id. A later option can let `ready()` load every entry to
  prune them, as a development aid.
- **Q6. Should `load` ever run at runtime for prefetching?** _Recommend:_ no. Prefetching code is
  the router's job (`<Link prefetch>`, `import()`), and warming an actor is `ensureActor`
  (minimal-library decision 3). Add `runtime.load` only if a real screen needs to adopt without
  any ref in hand.
- **Q7. Does adoption order change entity behaviour?** Only through `.byKey` placement (§10
  warning) and the answers that exist. _Recommend:_ accept, with the warning and V-L4. Making it a
  `flow check` error would stop a lazy feature from owning its own entity's loader, which is the
  common case of a self-contained feature.
