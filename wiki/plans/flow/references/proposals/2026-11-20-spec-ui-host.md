---
proposal spec-ui-host
status proposed 2026-11-20
---
# UI and host: design and Spec

**Bottom line:** the host gets one new piece of state, the **Publication** (one immutable cut per drained slice, written
only by the driver), and everything a UI reads derives from it: snapshots by a per-actor memo, `useView` through
`useSyncExternalStore`, emits stamped with the publication they belong to, hydration through `getServerSnapshot`.
The React binding then owns only two small machines (a hook's **Attachment**, the Provider's **Lease**), the host owns
the **TabLock**, and inspection, the player and the Next.js proofs add no runtime state. Everything here is proposed.

Covers @task.V3.T111, @task.V3.T28, @task.V3.T27, @task.V3.T30, @task.V3.T116, @task.V3.T49, @task.V3.T108.
Paths are under `packages/flow-state-v3/` unless they start with `wiki/` or `tools/`.

## 1. What exists

| Area                | Where                                                            | What holds                                            | Wrong or missing                                                  |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Handle              | `src/host/runtime.ts` `Actor`, `handleOf`                        | follows identity; foreign handles refused             | `getSnapshot` builds a new object per call                        |
| Snapshot            | `src/host/snapshot.ts` `snapshotIn`, `outside`                   | one function for live, record, quarantined, ended     | never cached; no `props` row                                      |
| Step loop           | `src/host/driver.ts` `drainInbox`                                | sole writer of `world`; evidence to `sink` per step   | no subscribe, no notify, no version                               |
| Uses, grace         | `src/core/incarnations.ts`, `Input.Ensure{use}`, `Input.Release` | uses are a multiset per actor; `freeGrace` 100 ms     | reachable only through `testing.attach`                           |
| Ready               | `runtime.ts` `ready`, core `life`                                | one bootstrap; store read before any actor            | an ensure before ready is rejected; no boot queue                 |
| Store port          | `src/host/store.ts` `Store`, `StoreScope`                        | atomic batches; `storeContract`; reviewed (T58)       | keep as is                                                        |
| IndexedDB           | `src/host/platform/indexeddb.ts` `layerIndexedDb`                | 7 real-browser cases; closes on `versionchange`       | version 1 only; `database` option; no `layerMemory`               |
| Hide                | `src/host/platform/browser.ts` `onHidden`, `src/host/edge.ts`    | flush on `visibilitychange` and `pagehide`            | ignores `event.persisted`; no `pageshow`                          |
| Inspection          | `src/host/inspect.ts` `inspect`, `attachInspector`; `trace.ts`   | `RuntimeCut` first slice; text renderer               | no Model, no export or import, no buffer                          |
| Stories             | `src/host/testing/` `story.ts`, `run.ts`, `steps.ts`             | one tab named `main`; reload, hide, show              | no second tab; no frames for a player                             |
| Browser runner      | `tools/browser/` `run.ts`, `provider.ts`                         | installed Chrome (headless) and Safari (safaridriver) | runs store tests only; no fixture, no React                       |
| React, player, lock | none                                                             | -                                                     | nothing exists (`src/` has no `react/`; no `navigator.locks` use) |

Measured facts this design rests on (`prototypes/safari/RESULTS.md`, verdicts 2 to 5):

- Safari drops a cached page's Web Lock; the page that comes back still believes it holds it. Chrome keeps it.
- A batch issued in `pagehide` while entering the bfcache fires `oncomplete` on return although no put landed.
- Without `commit()` the batch stays open while frozen and blocks the next page's reads of that store.
- A WebDriver Safari session keeps no website data, so persistence across a browser restart cannot be shown there.

## 2. State inventory

| #   | State                            | Owner (one writer)                                | States                                                 | Inputs that change it in one step                           |
| --- | -------------------------------- | ------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| S1  | Publication, per Runtime         | `src/host/publication.ts`, called by `drainInbox` | `{ version, world }`, version rising                   | a drained slice whose world changed                         |
| S2  | Snapshot memo, per actor         | `publication.ts` `snapshotAt`                     | `{ version, snapshot }`                                | a read at a newer version                                   |
| S3  | Attachment, per hook instance    | `src/react/attachment.ts`                         | `Rendered`, `Waiting`, `Attached`, `Ended`             | commit effect, ready, cleanup, actor disposed               |
| S4  | Lease, per Provider with `setup` | `src/react/lease.ts`                              | `Held`, `Lapsing`, `Disposed`                          | effect setup, cleanup, grace expiry, scope change           |
| S5  | Emit queue, per listener         | `src/react/listen.ts`                             | list of `{ version, emit }`                            | a publication carrying emits, a commit, unmount             |
| S6  | TabLock, per Runtime             | `src/host/platform/tab-lock.ts`                   | `Unasked`, `Owner`, `Second`, `Released`               | `ready`, grant, refusal, `pagehide`, disposal, boot failure |
| S7  | Boot queue, per Runtime          | the core's `life` (T28)                           | `Booting(queue)`, `Ready`, `Failed`                    | a call before ready, boot end                               |
| S8  | Inspector buffer                 | `src/host/inspect.ts`                             | ring of evidence, `Open` or `Disposed`                 | sink, `drain`, `clear`, `dispose`, a throwing callback      |
| S9  | Player cursor                    | `src/react/player.ts` reducer                     | `Recording`, `Ready(cursor, playing, speed)`, `Failed` | controls, pacing tick, record end                           |

Not state of this concept: actor uses and the actor grace (the core's, already built), the store's tickets (the
edge's), props and emits content (boundary channels), the hydrate gate and payload (data layer).

**Seams**

| Value                                                                    | Direction | Neighbour                                                       |
| ------------------------------------------------------------------------ | --------- | --------------------------------------------------------------- |
| `Publication { version, world }` and `snapshotAt(publication, actor)`    | offered   | every reader: React, Stories, inspection                        |
| `Input.Ensure { use: "component", start, wiring }`, `Input.Release`      | consumed  | the core (exists)                                               |
| `Props` values and the input that applies them; the `props` snapshot row | consumed  | boundary channels (T76)                                         |
| `Emitted { actor, name, value, instance, key }` on a step's output       | consumed  | boundary channels (T77)                                         |
| `version` stamped on each emit at publication                            | offered   | boundary channels                                               |
| `Payload`, `Input.Hydrate`, the request gate                             | consumed  | data layer (T115)                                               |
| the render-phase overlay: `preview(machine, input, props, source)`       | offered   | data layer names it as T30's                                    |
| `Ownership = Owner \| Second` at boot                                    | offered   | saved records: boot takes it; `Second` loads and writes nothing |
| `Store`, `StoreScope`, `storeContract`                                   | consumed  | T58, unchanged                                                  |
| trace and Model bytes through `core/codec.ts`                            | consumed  | saved records' codec (T92)                                      |

## 3. The design

### 3.1 Publication and the snapshot memo (S1, S2)

Before: `getSnapshot` calls `snapshotIn(driver.world(), …)` and allocates on every call, so `useSyncExternalStore`
would loop, and a read inside a drain sees a half-drained world.

```ts
// src/host/publication.ts (NEW). Plain TypeScript over the driver; no Effect, no timer.
export type Publication = { readonly version: number; readonly world: World }   // NEW

export const makePublications = (machines: Machines, first: World) => {
  let current: Publication = { version: 0, world: first }          // S1: written only by `publish`
  const memo = new Map<ActorKey, { version: number; snapshot: Option.Option<Snapshot> }>()   // S2
  const listeners = new Map<ActorKey, Set<() => void>>()

  const snapshotAt = (at: Publication, actor: ActorId) => {
    const key = actorKey(actor)
    const known = memo.get(key)
    if (known !== undefined && known.version === at.version) return known.snapshot
    const next = reuse(known?.snapshot, snapshotIn(at.world, machines, actor))   // field by field, reference first
    memo.set(key, { version: at.version, snapshot: next })
    return next
  }

  // Called once by drainInbox when the inbox is empty and the world is not the published one.
  const publish = (world: World) => {
    if (world === current.world) return
    const before = current
    current = { version: before.version + 1, world }
    for (const [key, heard] of listeners) {
      const actor = actorOfKey(key)
      if (snapshotAt(current, actor) !== peek(before, key)) for (const tell of heard) tell()
    }
  }
  return { current: () => current, snapshotAt, publish, subscribe /* per actor key */ }
}
```

- `reuse(previous, next)` returns `previous` when every field of `next` is the same reference or `Equal.equals`;
  otherwise `next` with each unchanged field's old reference kept (so "unchanged lanes keep identity").
- The memo is not a cache of a stored fact: it is the referential-stability rule of `useSyncExternalStore`, keyed to
  the version, so it cannot be stale. An actor nobody subscribes to costs nothing until it is read.
- A handle's public `getSnapshot` reads `snapshotAt(current(), actor)`: the same object until a publication changes
  that actor. `send` drains synchronously, so `send(); getSnapshot()` still shows the turn.
- A listener throwing is the React scheduler's concern, not the driver's: `publish` runs after the slice's commands,
  outside the step's `Result.try`.

### 3.2 The binding port and the hooks

`src/react/` imports one internal route and nothing else of the host (lint scope: add the rule).

```ts
// src/host/binding.ts (NEW, internal route `flow-state/internal/binding`)
export type BindingPort = {
  readonly current: () => Publication
  readonly subscribe: (actor: ActorId, tell: () => void) => () => void
  readonly snapshotAt: (at: Publication, actor: ActorId) => Option.Option<Snapshot>
  readonly preview: (machine: Machine, input: Values, source: PreviewSource) => Snapshot   // pure, no world write
  readonly acquire: (actor: ActorId, start: Start, wiring: Option.Option<Wiring>) => () => void
  readonly whenReady: (run: (exit: Exit.Exit<void, FlowError>) => void) => () => void     // cancels the observer only
  readonly after: (grace: Duration.Duration, run: () => void) => () => void                // on the Runtime Clock
}
export type PreviewSource = Data.TaggedEnum<{ Fresh: {}; Record: {}; Payload: { payload: Payload } }>
```

```tsx
// App code: where the data comes from is the DOM (a click) and the page's own fetch (stock).
// existing: Flow.machine, ensureActor   // NEW: FlowProvider, useActor, useActorByRef, useView
// user-defined: setup, CartRef, CartMachine, Badge
import { FlowProvider, useActorByRef, useView } from "flow-state/react"

export function App() {
  return (
    <FlowProvider setup={setup}>
      <Badge />
    </FlowProvider>
  )
}

function Badge() {
  const cart = useActorByRef(CartRef, {})             // ensure: a stable handle on the first render, no work
  const count = useView(cart, (s) => s.memory.lines.length)
  return <button onClick={() => cart.send({ _tag: "Clear" })}>{count}</button>
}
```

```ts
// src/react/view.ts (NEW): the whole of useView
export const useView = <D, A>(actor: Handle<D>, select: (s: Snapshot<D, "outside">) => A): A => {
  const cell = useRef<Selected<A>>(none)               // { snapshot, select, result: value or thrown }
  const read = (snapshot: Snapshot<D, "outside">) => (cell.current = selectOnce(cell.current, snapshot, select))
  const value = useSyncExternalStore(
    actor[subscribeOf],                                // stable per handle: selector identity never resubscribes
    () => read(actor[snapshotOf]()),                   // Attached: the memo; before: the preview
    () => read(actor[serverSnapshotOf]()),             // the Payload preview, or Fresh
  )
  return unwrap(value)                                 // rethrows a selector's exception (React O5)
}
```

`selectOnce` returns the old result when the snapshot and selector are the same, and the old value when the new one
is `Equal.equals`; a thrown selector is kept against its snapshot and rethrown without re-running.

### 3.3 Attachment (S3): one table, owner `src/react/attachment.ts`

A handle is created once per hook instance (`useState` initialiser) and holds its Attachment. Render never writes it.

| From       | Input                                                | To             | Work                                                                            |
| ---------- | ---------------------------------------------------- | -------------- | ------------------------------------------------------------------------------- |
| `Rendered` | passive effect runs                                  | `Waiting`      | register `whenReady`; keep buffered sends                                       |
| `Rendered` | `send`                                               | `Rendered`     | append to the handle's buffer (no cap, D24)                                     |
| `Rendered` | render discarded (no effect ever runs)               | -              | nothing was registered; the buffer is garbage                                   |
| `Waiting`  | ready succeeded                                      | `Attached`     | `acquire` (create with the pending props, or wake); deliver the buffer in order |
| `Waiting`  | ready failed                                         | `Ended(error)` | next render throws the FlowError to the boundary                                |
| `Waiting`  | effect cleanup                                       | `Rendered`     | cancel the observer; never admits later                                         |
| `Attached` | effect cleanup (unmount, Strict Mode, Activity hide) | `Rendered`     | `release()`; the core arms the actor grace                                      |
| `Attached` | effect runs again inside the grace                   | `Attached`     | `acquire` again; the core disarms the grace: same incarnation                   |
| `Attached` | actor disposed while mounted                         | `Attached`     | re-ensure a fresh incarnation (Runtime O3)                                      |
| `Attached` | `send`                                               | `Attached`     | straight to the Runtime                                                         |

- The actor grace has one owner, the core's `Timer.Grace`. The binding holds no timer for actors: Strict Mode's
  cleanup then setup is `Release` then `Ensure`, which the core already makes a no-op inside 100 ms.
- The binding attaches only after ready, so a hook's sends never enter the boot queue (S7): one buffer, one order.
- Snapshot before `Attached`: `preview(machine, input, Record)` when the Runtime holds a record of the identity,
  else `Fresh`; recomputed in render only when props change under `Equal.equals`. During hydration React asks
  `getServerSnapshot`, which is the `Payload` preview, so the first client view equals the server HTML and the
  Runtime's copy shows on the next render. This settles React.plan:38 against ServerRendering.plan:98.
- Props (seam): before `Attached` the handle holds one replaceable props value and creation takes it; after, a
  changed value is one mailbox input from a layout effect, FIFO with sends. Both Plan sentences then hold.

### 3.4 Lease (S4): one table, owner `src/react/lease.ts`

`<FlowProvider setup>` builds its Runtime in a `useState` initialiser (`construct()` is synchronous and inert, so a
discarded render leaks nothing). `<FlowProvider runtime>` has no Lease and never disposes.

| From       | Input                                     | To                        | Work                                                    |
| ---------- | ----------------------------------------- | ------------------------- | ------------------------------------------------------- |
| `Held`     | effect cleanup                            | `Lapsing`                 | `after(grace, expire)`                                  |
| `Lapsing`  | effect setup (Strict Mode, quick remount) | `Held`                    | cancel the timer; `ready()` is not called twice         |
| `Lapsing`  | grace expiry                              | `Disposed`                | `runtime.dispose()` (keeps saved data)                  |
| `Held`     | `setup` scope changed                     | new `Held`; old `Lapsing` | construct the new Runtime; children remount on its key  |
| `Held`     | new `setup` value, same scope             | `Held`                    | keep the Runtime                                        |
| `Disposed` | effect setup                              | new `Held`                | construct again; TabLock waits for the old release (S6) |

### 3.5 Emit delivery (S5), owner `src/react/listen.ts`

Boundary channels decides what an emit is; this concept decides when a listener hears it.

```ts
// Each emit of a slice is appended to its listeners' queues with the version `publish` is about to set.
// useOnEmit subscribes to "the highest version queued for me", so an emit always re-renders its listener:
const through = useSyncExternalStore(queue.subscribe, queue.through, () => 0)
useEffect(() => { for (const e of queue.takeThrough(through)) latest.current[e.name]?.(e.value) }, [through])
```

- Delivery is in a passive effect of a commit whose render read `through`, so the DOM of that turn exists and a
  discarded render delivers nothing. Server rendering has no effects, so it delivers none.
- Outside React, `actor.onEmit(handlers)` is called from `publish`, after the listeners are told, in turn order.
- Unmount drops the queue. Listening calls no `acquire`: it is not a use.

### 3.6 TabLock (S6): one table, owner `src/host/platform/tab-lock.ts`

A `Locks` platform service (browser: `navigator.locks.request(name, { ifAvailable: true }, hold)`; tests: a fake with
a Chrome mode and a Safari mode) plus an in-document registry keyed by `app/scope` for the disposing-predecessor rule.

| From                   | Input                                                    | To         | Work                                                               |
| ---------------------- | -------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `Unasked`              | `ready()`, persistence on, same-document owner disposing | `Unasked`  | wait for its release, then ask                                     |
| `Unasked`              | lock granted                                             | `Owner`    | boot with `Ownership.Owner`: the store is read only now            |
| `Unasked`              | lock refused (another tab, or a live Runtime here)       | `Second`   | boot with `Ownership.Second`; report `SecondTabNoPersistence`      |
| `Owner`                | boot failed                                              | `Released` | release                                                            |
| `Owner`                | `pagehide` with `persisted`                              | `Released` | flush with `commit()`, wait its answer or abort the batch, release |
| `Owner`                | disposal or forget finished cleanup                      | `Released` | release last, after the Store closes                               |
| `Released` or `Second` | `pageshow` with `persisted`                              | -          | `location.reload()`: a new boot                                    |
| `Second`               | any store call                                           | -          | none is ever made (R-L3)                                           |

- `Second` never becomes `Owner` in v1: its world diverged from the saved records, and promotion would need a
  third merge table (PD3).
- The `pagehide` release makes Chrome behave as Safari already does, so one rule covers both.
- Safari verdict 2 obliges the IndexedDB adapter to answer `landed` only when every put's own request succeeded
  and the transaction completed; `oncomplete` alone is not an answer. Check `indexeddb.ts` `writeBatch` first.

### 3.7 Adapters and the boot queue (T28)

- `layerMemory()` moves the map store of `src/host/testing/` into `src/host/platform/memory.ts`; the testing fakes
  wrap it with faults. `layerIndexedDb({ database? })` keeps version 1 and gains the option. Both pass `storeContract`.
- Boot queue (S7) is the core's: calls before ready queue in order in `life`, delivered after boot, rejected with the
  boot's error on failure. The binding does not depend on it (3.3).

### 3.8 Inspection (T49)

- `inspect(app)` (Promise, loads lazy entries) and `inspect(runtime)` (sync) return one `Model`, derived from
  `Compiled` and, for a Runtime, from `current().world`; the Model is never stored.
- `attachInspector(runtime, callback | { capacity? })`: S8 is a ring with one writer per input (sink appends and
  evicts the oldest; `drain` empties and returns; `clear` empties; `dispose` closes; a throwing callback detaches
  itself, as `runtime.test.ts` already proves).
- `trace.export(trace)` is `{ format, appFingerprint, records }` through `core/codec.ts`; `trace.import(bytes)`
  returns a `Result`, validating in one fixed order: codec, schema, lifecycle transitions, Story evidence.
  Sensitive values leave as `hmac:` digests. Renderers: `text` (exists), `json`, `mermaid`.

### 3.9 Player (T108) and browser fixtures (T111), Next.js proofs (T116)

- `definePresentation(story, { scenes, pacing? })` is data; a scene's checkpoint is typed from the Story's names.
- `<StoryPlayer>` holds only the cursor (S9) in one reducer; the frame is `StoryFrame` over `run.frames[cursor]`,
  a lookup. Recording runs once on mount or on request. bippy, if accepted, adds a derived `FrameView` and no state.
- Fixture pages: one page per fixture mounts `<FlowProvider setup>` with `layerIndexedDb()`; the fixture's Stories
  run in the page through the existing runner, and at each checkpoint the DOM text must equal the Story's expected
  view. `reload` in the page is unmount, dispose, construct, mount over the same database; one real navigation
  proof per browser uses a runner command.
- Next.js proofs own no state: a real `next build` and `next start` per React version (18 and 19), driven by the
  same runner; they assert no recoverable hydration error, no emit on the server, and one render per publication.

## 4. Requirements and Invariants

Each is a check that fails on a wrong build. Sources in brackets.

**Publication**
- R-P1 `getSnapshot` returns the same object until a publication changes that actor. [T111 acceptance]
- R-P2 A turn of actor B leaves actor A's snapshot object, and each unchanged lane row, identical. [React O4]
- R-P3 `version` rises by one per publishing slice and never otherwise; a slice that changes nothing publishes
  nothing. [code: `drainInbox`]
- R-P4 Every hook in one render reads one version across actors. [React O1]
- R-P5 A listener is told once per publication, and only when its actor's snapshot object changed. [React O4; PD1]
- I-P6 `publish` is the only writer of S1; `snapshotAt` the only writer of S2. [epic: one owner per state]

**Attachment and Lease** (rows of tables 3.3 and 3.4, one check per row)
- R-A1 Render registers nothing, sends nothing to the Runtime and emits no evidence. [React O2]
- R-A2 A discarded render's buffered sends reach no actor. [React O3]
- R-A3 Buffered sends are delivered once, in order, after creation, for any count. [React O3, D24]
- R-A4 Strict Mode mount gives one incarnation, one creation, one `ready()`. [React O3]
- R-A5 Unmount, then mount inside the grace, keeps the incarnation; after the grace a fresh one adopts the lanes.
  [React O3; code: `freeGrace`]
- R-A6 Two components using one shared actor: one unmounting leaves the use. [code: uses are a multiset]
- R-A7 Unmount while waiting for ready never admits later. [React O3]
- R-A8 A scope change disposes the old Runtime after the grace and never before; `runtime=` never disposes. [React O1]
- R-A9 A selector's exception reaches the boundary, is rethrown without re-running while its snapshot is unchanged,
  and is retried on the next change of that actor. [React O5]
- R-A10 Hooks never suspend. [React O5]

**Emits and props** (delivery only)
- R-E1 An emit is heard after the commit of a render at or after its version, in turn order, never from a discarded
  render, never on the server, and when no selected value changed. [React O3]
- R-E2 Listening holds no use. [Runtime O3]
- R-E3 Pre-attach props are in the first frame's snapshot and in creation; later changes are FIFO with sends. [React O2]

**Lock and adapters**
- R-L1 The lock is asked before any store call. [Persistence O7]
- R-L2 Two Runtimes of one app and scope: exactly one is `Owner`; other apps and scopes are independent. [O7]
- R-L3 A `Second` Runtime makes no `Store` call, restores nothing, and a persisted commit ends
  `NotSent { NoPersistence }`. [O7]
- R-L4 After `pagehide` with `persisted`, the lock is free and no batch is open, in both lock modes. [O7; Safari 3, 4]
- R-L5 `pageshow` with `persisted` reloads. [O7]
- R-L6 A disposing same-document owner delays the next `ready` until its release; a failed boot releases. [O7]
- R-L7 A batch answers `landed` only when it landed. [`storeContract`; Safari 2]
- R-S1 `layerMemory` and `layerIndexedDb` pass `storeContract`; codec bytes are equal on Node, Chrome, Safari.
  [Persistence O1; Inspection O2]

**Inspection and player**
- R-I1 `trace.import(trace.export(t))` equals `t`; a malformed trace is refused at the first failing stage with that
  stage's code. [Inspection O4]
- R-I2 The inspector's buffer never exceeds `capacity`; `drain` returns each record once. [Inspection O3]
- R-I3 No inspect code is in an app bundle. [Inspection C2]
- R-Y1 Playing, stepping and scrubbing send no input to any Runtime. [Testing O9]
- R-Y2 A scene naming an unknown checkpoint is a type error. [Testing O9]

Tables 3.3, 3.4 and 3.6 are the Requirements R-A1 to R-A8 and R-L1 to R-L6 laid out by state: every row cites one,
and a Requirement with no row is a gap to close before code.

## 5. Development strategy

1. **Publication first** (`src/host/publication.ts`, handle `getSnapshot` moved onto it). Everything else reads it.
   Spike, half a day, outside the package: a 30-line React app on React 18 and 19 over a fake `publish`, Strict Mode
   and `startTransition`, proving one render per publication and no tearing; then measure `reuse` against
   identity-keyed inputs with 1, 100 and 10,000 subscribed actors.
2. **The binding's three states together** (S3, S4 and the `useView` cell) with `FlowProvider`, `useActor`,
   `useActorByRef`, `useView`. Not a minimal binding now and a full one later: that writes Attachment twice.
3. **Fixture pages in Chrome and Safari** on that binding (T111's exit).
4. **T28** (`layerMemory`, the option, the boot queue), then **T27** (TabLock, the fake `Locks`, tab steps).
5. **T30's remainder** once T76 and T77 land: props delivery, emit delivery (S5), `useNow`, the hydrate overlay with
   T115, benches. Then **T116**. **T49** any time after T92's codec. **T108** last, after the bippy answer.

Risk, highest first: emits after commit (R-E1) when the listener's view did not change; the Safari `pagehide` path
(R-L4, R-L7), provable only through safaridriver with a display; the cost of `reuse` at 10,000 views.

**Task split by state ownership (proposed)**

| Task | Owns                                      | Change                                                                |
| ---- | ----------------------------------------- | --------------------------------------------------------------------- |
| T111 | S1, S2, S3, S4; fixture pages             | builds the binding's states whole (PD2); no props, emits, hydrate     |
| T28  | S7; `layerMemory`                         | as written                                                            |
| T27  | S6                                        | as written; takes Safari D4 and R-L7                                  |
| T30  | S5; props delivery; the overlay; `useNow` | no longer "the full binding": channels and hydrate over T111's states |
| T49  | S8; Model; trace bytes                    | as written                                                            |
| T116 | none                                      | as written                                                            |
| T108 | S9                                        | as written, after the bippy answer                                    |

## 6. Testing strategy

- **Shape:** one table-driven generator per state table. For S3: sequences of length up to 6 over
  {render, discard, commit, cleanup, ready, ready fails, send, dispose actor, grace passes}, run in real React
  (Strict Mode on and off) against a model of table 3.3; the expected incarnation count, delivered sends and uses come
  from the table, never from the code. The same for S4 and S6.
- **Dimensions earlier reviews missed:** two components on one shared actor and two local actors of one machine
  (copies); a Runtime that already holds a record or a quarantined record at first render (non-default start);
  unmount, grace passes, remount, then a second cycle (sequences over time); a fixture reloaded onto an edited
  definition in the page (restore after an edit); two tabs opening at once, and three.
- **Hostile fakes:** a `Store` that fails the test on any call (R-L3); a `Locks` fake in Safari mode that drops the
  lock on freeze and in Chrome mode that keeps it (R-L4); a store whose batch completes with failed puts (R-L7); a
  React renderer that discards every second render (R-A2).
- **Planted faults** (`nub run faults`): `getSnapshot` allocating per call; `publish` per step instead of per slice;
  a release that drops all uses; the Lease disposing at cleanup; emits delivered at publish in React; the lock asked
  after `load`; `oncomplete` trusted alone; a player control that sends.
- **Guard that keeps the freedom away:** lint scope so `src/react/` imports only `flow-state/internal/binding`, and
  a rule that `snapshotIn` is called only from `publication.ts` (no second snapshot path can appear).
- **Bench:** renders per publication (must be 0 for an unrelated turn); `publish` cost at 1, 100, 10,000 subscribed
  views; the hide handler in Chrome and Safari against Node's 6 us per changed actor; lock handoff and two-tab write
  contention (T27's owed bench).
- **Browsers:** Chrome headless always; Safari cases that need a visible page are display-bound and skipped
  unattended, counted by the runner's `counted` reporter (the user's Q4 A).

## 7. Handoff for the Opus leads

| Task | Read first                                          | Decided                                       | Settle before code                                    | First commit (failing checks)                                      |
| ---- | --------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| T111 | 3.1 to 3.4; `driver.ts` `drainInbox`; `snapshot.ts` | Publication per slice; memo; tables 3.3, 3.4  | spike 1; how `after` reaches the Runtime Clock        | R-P1, R-P2, R-A4 red in real React; one fixture page red in Chrome |
| T28  | 3.7; `store.ts`; `testing/fake.ts` `makeStore`      | two adapters, one contract                    | where the queue sits in `life`                        | `storeContract` over `layerMemory`; a send before ready            |
| T27  | 3.6; `prototypes/safari/RESULTS.md`; Persistence O7 | table 3.6; no promotion (PD3)                 | the boot input for `Second` with saved records' owner | R-L1 to R-L5 on the fake `Locks`, both modes                       |
| T30  | 3.3 props note, 3.5; the boundary-channels design   | delivery timing; one props slot before attach | the emit and props types from T76, T77                | R-E1 (unchanged view), R-E3 red                                    |
| T49  | 3.8; `inspect.ts`; `trace.ts`; Inspection O1 to O6  | Model derived; fixed import order             | names marked proposed in Inspection O4                | R-I1 round trip; four malformed traces                             |
| T116 | 3.9; data-layer section on `Hydrate`                | real hosts, React 18 and 19                   | Next.js versions pinned                               | a page that mismatches on a planted fault                          |
| T108 | 3.9; Testing O9; the bippy proposal                 | cursor is the only state                      | the user's bippy answer                               | R-Y1 with a Runtime that fails on any input                        |

## 8. Proposed decisions

**PD1. One notify per publication, replacing React O3's "one notify per task".**
Trace A (per publication): a click sends `Add` then `Recount` in one task; two slices publish versions 8 and 9;
listeners are told twice; React batches both into one render that reads version 9. Trace B (per task): the first slice
notifies, the second is held for the next task; the render shows version 8, then a second render shows 9: two renders
and a frame of old data. Recommendation: A. It needs no task-boundary state.

**PD2. T111 builds Attachment, Lease and Publication whole; T30 becomes channels and the hydrate overlay.**
Trace A: T111 ships table 3.3; T30 adds a props input and S5 and touches no row. Trace B (as written): T111 ships a
"least that renders" attach; T30 rewrites it for grace, Strict Mode and Activity, and the fixtures' browser runs are
re-proved. Recommendation: A.

**PD3. A second tab stays without persistence until it reloads.**
Trace A: tab 1 closes; tab 2 keeps running, saves nothing; its reload boots as `Owner` and restores tab 1's data.
Trace B (promotion): tab 2 takes the lock with a live world that never saw tab 1's records and must merge both.
Recommendation: A, which Persistence O7 already implies.

**PD4. Before attach, props are part of creation; after, they are mailbox inputs.** Trace A: first render with
`{ value: 2 }`, then `{ value: 3 }` before the effect: the actor is created with 3, one creation, no props turn.
Trace B (always FIFO): creation with defaults, then a props turn: the first frame and the first turn disagree.
Recommendation: A; it reconciles React.plan:60 and :62.

**PD5. T111's hidden-tab resume is shown in Chrome unattended and in Safari when a display is present.**
Trace A: the unattended run counts Safari's display-bound cases as skipped by name. Trace B: the Task cannot close
without a person at the machine. Recommendation: A, following the user's Q4 A.

**Needs the user:** PD1 (changes a Plan sentence), PD2 (Task scope), the bippy proposal (blocks T108). PD3 to PD5
are small amendments the orchestrator may decide.

## 9. Sidecar log

Two of four Haiku sidecars ran; the host refused the other two (concurrency limit), so past reviews and prior art
were not swept and I read the Safari results, the Plans and the code myself.

| Finding                                                              | Result             | Why                                                |
| -------------------------------------------------------------------- | ------------------ | -------------------------------------------------- |
| `getSnapshot` is uncached and no subscribe exists (code sidecar)     | accepted           | read `runtime.ts` `handleOf`, `snapshot.ts`        |
| No React, lock, player or `layerMemory` in production (code)         | accepted           | `ls src`; grep                                     |
| Uses and the grace exist in the core (code)                          | accepted, extended | read `incarnations.ts`: uses are a multiset        |
| CLI has `story` and `trace` only; `package.json` has no `bin` (code) | not verified       | outside this document's design                     |
| T111 and T30 both build the binding (plans sidecar, item 7)          | accepted           | read both Tasks; became PD2                        |
| Props slot against FIFO (plans, item 2)                              | changed            | not a contradiction once the slot is creation; PD4 |
| Pre-attach record against hydrate first view (plans, item 3)         | changed            | settled by `getServerSnapshot`, 3.3                |
| Safari coverage against Q4 A (plans, item 10)                        | accepted           | became PD5                                         |
| Merge-rule and fingerprint contradictions (plans, items 4 to 6)      | rejected here      | the data layer's state, not this concept's         |
| T115 and T30 lack T28 in `blocked_by` (plans, item 8)                | rejected           | 3.3 removes the binding's need for the boot queue  |
| Multi-tab evidence against Inspection.plan:141 (plans, item 13)      | not verified       | low confidence by the sidecar's own word           |
