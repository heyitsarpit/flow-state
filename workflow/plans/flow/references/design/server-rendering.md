# SSR hydration: design

Status: adopted, with later decisions. [ServerRendering.plan](../../ServerRendering.plan) is the
contract and wins where this document differs. React Suspense integration stays out of scope: no
Flow hook ever suspends.

Decisions since this design was written, reflected below:

- **Scope lives on the setup.** `runtimeSetup({ scope })` names whose data a Runtime holds;
  `dehydrate` takes no `scope` option and stamps the setup's. `principal()` is gone.
- **Render reads, commit writes.** `Hydrate` exposes its payload to render as a read-only overlay;
  the store changes only in the commit effect (section 2.5).
- **Shape digest, not the Model fingerprint**, decides payload compatibility (section 2.3).
- **`FlowProvider setup={…}`** constructs and owns one Runtime per scope (section 1.4).
- **Lazy loads never hold `ready()`** (lazy-features.md section 9).

Primary target: Next.js App Router (React Server Components with streaming). Also covered: plain
React SSR with `renderToPipeableStream`, and client navigations that deliver new server data to a
running browser Runtime.

## 0. The design in one paragraph

A server component calls `dehydrate(setup, prepare, { within })` from `flow-state/server`.
It constructs a private request Runtime, runs `prepare` (which ensures actors), waits up to
`within` for the Runtime to go quiet, and captures one consistent cut, using the persistence
capture algorithm with a different selection. The result is a Schema-encoded, JSON-safe,
size-bounded payload. It disposes the Runtime before returning, so no request Runtime outlives
its call. The payload goes as a prop to `<Hydrate payload={…}>` from `flow-state/react`, a client
component. In both the server-side render of client components and the browser's hydration
render, a component's output depends only on its props and the payloads of its ancestor
`Hydrate` boundaries. That is why the server HTML and the first browser render cannot disagree,
whatever order streamed segments arrive or hydrate in. Render only reads the payload. In its commit
effect `Hydrate` merges payload items into the live client Runtime under fixed precedence rules. Actors become active as if restored, and
activities reattach to hydrated cache entries without refetching while those entries are within
`staleTime`.

Two new public names: `dehydrate` (new route `flow-state/server`) and `Hydrate` (in
`flow-state/react`). Two Story commands: `dehydrate` and `hydrate`. Nothing else is new.

---

## 1. Surface

### 1.1 Routes

```text
flow-state           (unchanged)
flow-state/react     FlowProvider  Hydrate  useActorByRef  useActor  useView     // built with "use client"
flow-state/server    dehydrate                                                   // server only
flow-state/testing   story (+ commands dehydrate, hydrate)  model  defineConfig  CheckpointProvider  propertyTest
flow-state/inspect   (unchanged; new trace events)
```

- **`flow-state/server` is server only, enforced by export conditions.** It is the same technique
  as Next's `server-only` package. `"./server"` maps `react-server` and `node` to the real module;
  `browser` and `default` map to a stub that throws `FlowError(ServerOnlyImport)` when imported.
  Importing it from a client component therefore breaks the browser build, or fails on first
  load, never silently. Only the capture side lives here: the settle wait, selection, redaction,
  the size bound and encoding. The hydrate side must be in the client bundle, so it lives in the
  core runtime.
- **The `flow-state/react` build starts with `"use client"`**, so server components can import and
  render `FlowProvider` and `Hydrate` directly. The hooks are client-only anyway.
- O12's "four routes" becomes five. Nothing is exported from `flow-state/server` except
  `dehydrate`.

### 1.2 `dehydrate`

```ts
dehydrate(
  setup: RuntimeSetup<A, never /* no persistence */>,
  prepare: (runtime: Runtime<A>) => void,
  options: {
    within: Duration.Input;         // the settle bound; required (D34 style: no default)
    maxBytes?: number;              // encoded size bound; default 262_144
    inspector?: InspectorSink;      // attached to the private Runtime before ready()
  },
): Promise<Hydration<A>>
```

- **Returns a Promise.** `dehydrate` is a final framework adapter: a server component awaits it.
  That is allowed under the archived Effect bridge rule, which ReactAndHosts O4 kept. Internally
  it is one Effect run on the private Runtime.
- **`setup` must have no `persistence`.** This is a type error, and also a runtime
  `FlowError(DehydratePersistentSetup)` for untyped callers. A server KeyValueStore shared between
  requests is a cross-request leak. A per-request in-memory store gives nothing, because the
  Runtime is disposed before `dehydrate` returns.
- **`prepare` is synchronous** and receives a ready Runtime. It uses only the existing host
  surface: `ensureActor`, `createActor` and `send`. It may not return work. A throw in `prepare`
  disposes the Runtime and rejects with that error (a FlowError passes through unchanged).
- **The result `Hydration<A>`** is an opaque, branded, JSON-safe value. Authors never write the
  type and never read its fields. It is RSC-serialisable as a prop.

### 1.3 `Hydrate`

```tsx
<Hydrate payload={payload}>{children}</Hydrate>
```

- It must sit under a `FlowProvider`; otherwise it throws `FlowError(HydrateOutsideProvider)`.
- It never suspends and renders its children unchanged.
- It may be nested and repeated: one per streamed segment, or one in a layout plus one in a page.

### 1.4 Worked example: Dispatch Desk on Next.js App Router

Server setup, a new file `app/server-setup.ts`. Services are per request because they carry the
caller's token.

```ts
import { runtimeSetup } from "flow-state";
import { DeskApp } from "./app.js";
import { HttpTicketApi } from "./http-api.js";

export const deskServerSetup = (user: User) =>
  runtimeSetup({ app: DeskApp, scope: user.id, services: HttpTicketApi(user.token) }); // no persistence
```

The browser provider, `app/providers.tsx`. `FlowProvider` constructs and owns the Runtime, one per
scope, never at module level.

```tsx
"use client";
import type { ReactNode } from "react";
import { FlowProvider } from "flow-state/react";
import { browserSetup } from "./persistence.js";

export function DeskProviders({ userId, children }: { userId: string; children: ReactNode }) {
  // A setup is inert data. FlowProvider constructs one Runtime per setup scope, calls ready() in
  // its first effect, and disposes the old Runtime when the scope changes (sign-out, new user).
  return <FlowProvider setup={browserSetup(userId)}>{children}</FlowProvider>;
}
```

The root layout, `app/layout.tsx` (server component). The session is hydrated once for the whole
document.

```tsx
import { dehydrate } from "flow-state/server";
import { Hydrate } from "flow-state/react";
import { SessionRef } from "../features/Session/session.ref.js";
import { deskServerSetup } from "./server-setup.js";
import { currentUser } from "./auth.js";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser(); // the host's auth; the setup's scope comes from it, never from input
  const session = await dehydrate(deskServerSetup(user), (rt) => rt.ensureActor(SessionRef), {
    within: "300 millis",
  });
  return (
    <html>
      <body>
        <DeskProviders userId={user.id}>
          <Hydrate payload={session}>{children}</Hydrate>
        </DeskProviders>
      </body>
    </html>
  );
}
```

The queue page, `app/desk/[workspace]/page.tsx`. The queue streams in its own segment, so a slow
list never delays the shell.

```tsx
import { Suspense } from "react";
import { dehydrate } from "flow-state/server";
import { Hydrate } from "flow-state/react";
import { SessionRef } from "../../../features/Session/session.ref.js";
import { queueRef } from "../../../features/Tickets/queue/queue.ref.js";
import { QueueList } from "../../../features/Tickets/queue/QueueList.js";

export default async function DeskPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return (
    <Suspense fallback={<p>Loading queue…</p>}>
      <QueueSegment workspaceId={workspace} />
    </Suspense>
  );
}

async function QueueSegment({ workspaceId }: { workspaceId: string }) {
  const user = await currentUser();
  const payload = await dehydrate(
    deskServerSetup(user),
    (rt) => {
      rt.ensureActor(SessionRef); // the queue reads userId from the session (context closure)
      rt.ensureActor(queueRef(workspaceId), { input: { workspaceId } });
    },
    { within: "1500 millis" },
  );
  return (
    <Hydrate payload={payload}>
      <QueueList workspaceId={workspaceId} onOpen={/* client wrapper */} />
    </Hydrate>
  );
}
```

`<Suspense>` here is plain Next streaming around an async server component; no Flow hook takes
part. `QueueList` is unchanged. `useActorByRef(queueRef(ws), { input })` finds the hydrated queue,
and the lanes `list`, `open` and `feed` render from the payload on the server and during
hydration. After the commit the queue activates: `list` and `open` are fresh, so nothing is
fetched, and `feed` opens a new stream session.

Plain React SSR uses the same three calls:

```ts
// server.ts (Express or similar)
const payload = await dehydrate(deskServerSetup(user), prepareDesk, { within: "1 second" });
const tree = (
  <FlowProvider setup={browserSetup(user.id)}><Hydrate payload={payload}><Desk /></Hydrate></FlowProvider>
);
const { pipe } = renderToPipeableStream(tree, {
  bootstrapScriptContent: `window.__DESK__=${JSON.stringify(payload).replace(/</g, "\\u003c")}`,
  bootstrapScripts: ["/client.js"],
});
// client.ts
hydrateRoot(document, tree) // using window.__DESK__
```

The `<` escaping is the one host obligation. Next does it for RSC props.

---

## 2. Semantics

### 2.1 Request Runtimes and cross-request isolation

- **Every `dehydrate` call owns one private Runtime.** It constructs it, readies it, runs
  `prepare`, settles, captures and disposes it, all inside the call. The Runtime never escapes,
  so a server component cannot cache it, share it with another request, or forget to dispose it.
  Two `dehydrate` calls on one page are two Runtimes, so the layout and the page each load the
  session. Deduplicating that is the service Layer's job (for example a request-scoped `cache()`
  around the HTTP client), not Flow's.
- **Disposal is bounded.** Lookups and stream sessions are interrupted. Commits in flight are
  awaited, as O3 requires; see section 2.4 for why one should not exist.
- **The render Runtime is a second Runtime.** In the App Router, client components render on the
  server in a module graph that cannot see server-component scope. `FlowProvider setup={…}`
  therefore constructs a fresh render Runtime per request render. It is never readied on the server,
  because effects do not run there, so it builds no Layer, opens no storage and starts no work.
  It holds only decoded payloads and is garbage once the render ends; `dispose()` on a never-ready
  Runtime is a no-op.
- **Guard against a module-level Runtime (the classic leak).** A Runtime on which `ready()` has
  never been called accepts payloads from one request only. Each payload carries a request token.
  `dehydrate` gets it from React's `cache()` when it runs under `react-server`, so every segment
  of one RSC request shares it; otherwise each call gets a fresh token. A second token on an
  unreadied Runtime throws `FlowError(HydrationCrossRequest)` in render, naming the fix:
  pass the setup to the provider. A server-side module singleton therefore fails on the second
  request rather than showing one user another's data. In the browser, `FlowProvider` calls
  `ready()` in its first effect, so later client navigations, which bring new tokens, are
  accepted.
- **Scope match.** Each payload carries its setup's `scope`, the label for whose data a Runtime
  holds (a user, workspace or tenant id). A payload applies only to a Runtime with an equal scope,
  two absent scopes counting as equal. A mismatch throws `FlowError(HydrationScopeMismatch)` in
  render and applies nothing from that payload, so a payload for user B is never shown under user
  A, even when a router cache replays it after an account switch. `FlowProvider setup={…}` gives
  each scope its own Runtime. `scope` comes from the host's server-side authentication. Flow
  cannot check that it is true, only that both sides agree.

### 2.2 Settle: what `within` waits for

After `prepare`, `dehydrate` waits, on the Runtime Clock, until the Runtime is **quiet** or
`within` has elapsed, whichever comes first. Quiet means all of these hold:

1. Every mailbox is empty and no turn is running.
2. No finite lookup is in flight for any active lane, including chained activities that read
   earlier lanes, repair lookups and confirming reads (entity-domain.md section 5).
3. No commit is in flight and no outcome delivery is pending.

Schedules and stream sessions never count: a poll or a live feed would keep the Runtime busy for
ever. Quiet is checked after each publication, so a chain such as user, then org, then
permissions settles as a whole.

Capture happens at the first quiet cut, or at the cut current when `within` expires. Expiry is
not an error. The payload records what was still pending, and the request emits one
`DehydrateUnsettled` diagnostic to `attachInspector` sinks and the host log. A slow API costs the
client one fetch; it does not fail the page.

### 2.3 What is dehydrated

Selection: **every shared actor in the request Runtime**, plus the transitive closure of their
context providers, plus the store data that the active lanes of _any_ actor (local actors made in
`prepare` included) reference. Local actors themselves are never transferred: they have no
address, and a client `useActor` always makes a new one. `persist` flags do not apply; hydration
is a transfer, not durability.

| Item           | Transferred                                                                                                                                                                                                                                                                                                                                     | Not transferred                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Shared actor   | ref id and machine id; state path; memory encoded with the definition's `Memory` Schema; each activity binding (declaration slot, descriptor, canonical key, the entry version it last mapped to an outcome); each armed schedule's remaining time and `restartOn` baseline; the actor's own pending-commit facts, as persistence captures them | mailbox contents, issues, placeholder `previous`, fibers, sessions, input |
| Context        | nothing: it is recomputed from the hydrated providers on both sides                                                                                                                                                                                                                                                                             | selected values                                                           |
| Resource entry | canonical key, data encoded with the `result` Schema, age at capture, generation                                                                                                                                                                                                                                                                | optimistic layers, failures, errors, defects                              |
| Stream lane    | latest value encoded with the stream's value Schema, and the count                                                                                                                                                                                                                                                                              | the session, buffered values                                              |
| Entity record  | the confirmed fields that transferred answers project, each with its version                                                                                                                                                                                                                                                                    | predictions, queues, tombstones, uncertain marks, positions               |
| Entity answer  | input, references or pages, `more`, and whether it was stale at capture                                                                                                                                                                                                                                                                         | frontier positions (they are meaningless in another Runtime)              |
| Envelope       | format tag, app id, shape digest, scope, request token, sequence, `capturedAt` (server epoch milliseconds), and an `omitted` list (ids and reasons only)                                                                                                                                                                                        | values of omitted items                                                   |

- **Encoding.** Each item is encoded with the Schema that already owns it (D47, D44, D45; the
  resource `result`, the stream value and the entity fields), inside a Flow-owned envelope Schema.
  The encoded form must be JSON-safe. A Schema whose encoded side is not JSON (such as
  `Schema.instanceOf(File)`), or a resource with no `result` Schema (Dispatch Desk's `openCount`),
  is **omitted** with reason `NotEncodable`. The client then fetches it. Order inside the payload
  is canonical: actor ids by byte order, entries by descriptor id then canonical key bytes. Equal
  runs therefore give equal bytes, which Stories rely on.
- **Identity.** The payload carries the app id and the app's **shape digest**: a digest of
  machine ids, state trees, event, input and memory Schemas, operation and entity identities of
  eager entries, and lazy entry ids. It leaves out deny codes (which need the TypeScript compiler)
  and lazy code (which the client may not have loaded), so both sides compute it from the loaded
  App alone. `inspect(app)`'s full fingerprint stays for traces and tools. A deploy that changes
  behaviour without changing shape passes the check; payloads are short-lived, so that is
  accepted. Persistence uses an author-chosen `version` because stored data outlives a deploy.
- **Redaction: sensitive data never enters a payload.** This follows D48's annotation. HTML is
  cached by CDNs, logged and shared, so the payload is treated as an artifact. A `sensitive`
  entity field is dropped from the record. The store then does not hold that field, so a reader
  that needs it fetches it on the client (entity-domain.md section 5.5, "dropped from the base").
  A resource entry or stream lane whose Schema contains a `sensitive` field is omitted whole. An
  actor whose `Memory` contains one is omitted, and so is every consumer that depends on it
  through context (closure). The reason is `Sensitive`. Faithful hydration of sensitive data is
  not offered; see question Q2.
- **Size.** `maxBytes` bounds the UTF-8 length of the serialised envelope. Over the bound,
  `dehydrate` rejects with `FlowError(DehydrateTooLarge)`, whose details list the ten largest
  items by bytes. It never silently drops data, because a silent drop is a hydration result the
  author did not choose.

### 2.4 In-flight work at capture

| At capture                                         | Payload                                                                                                                     | Client                                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Lookup in flight, no data                          | lane binding only; entry absent; listed as unsettled                                                                        | renders the lane as `Pending`; the activity looks up on activation (the server's lookup was interrupted, so this is not a duplicate) |
| Refetch in flight over data                        | entry with its data and age                                                                                                 | renders the data; the activity refetches on activation only if `staleTime` says so                                                   |
| Lookup failed (`Failure`, `Defect`, `Interrupted`) | entry absent; no error value is sent                                                                                        | `Pending` without data; the activity retries. The actor's own state, such as `DEGRADED` after `ListUnavailable`, transfers as it was |
| Events queued in a mailbox                         | dropped; counted in `DehydrateUnsettled`                                                                                    | never delivered                                                                                                                      |
| Commit in flight                                   | the actor's pending-commit facts, so the client restores it as `unknown`, exactly as persistence does (O8, Transactions O4) | the `unknown` outcome is the actor's first turn after activation                                                                     |
| Domain prediction live                             | confirmed base only                                                                                                         | the record shows its confirmed value                                                                                                 |
| Schedule armed                                     | remaining time                                                                                                              | re-armed (section 2.6)                                                                                                               |

`prepare` should not cause commits: mutations belong in server actions or on the client. A commit
in flight at capture also emits `DehydrateCommitInFlight` (warning). The honest-uncertainty rule
(D7) holds without special cases.

### 2.5 Hydration on the client: two phases

**Phase 1, in render, read-only.** When `Hydrate` renders:

1. Look up the payload by `(request token, sequence)`. If this Runtime has already decoded it,
   reuse that; otherwise check it and decode it once:
   - an app id or shape digest mismatch, or a decode failure, means the payload is dropped with
     `HydrationIncompatible` or `HydrationMalformed` (diagnostics, not throws). That is deploy
     skew, and the fallback is ordinary client loading;
   - a scope or request-token violation throws (section 2.1).
2. Build the payload's **server view**: an immutable store view of its entries, records and
   answers, plus a snapshot for each actor. Each snapshot is computed by the same pure projection
   on both sides: state and memory from the payload, context from the providers in the same view,
   and lanes projected from bindings and entries in the view (an entry missing from the view
   gives a `Pending` lane without data). Lifecycle is `active` and issues are empty.
3. Provide the server view to descendants through React context, chained to the server views of
   ancestor `Hydrate` boundaries.
4. Leave the live Runtime untouched. The server view is an overlay that only descendant hooks
   read.

**Phase 2, in a commit effect.** Apply the payload as one store version: insert items **absent**
from the live Runtime and merge items already **present** under section 2.7. Then activate the
inserted actors: at once if the Runtime is ready, otherwise as part of the bootstrap (section 2.8).
An actor attaching beneath a `Hydrate` boundary activates only after that boundary's payload is
applied. React runs child effects before parent effects, so without this rule a child would look
up data the payload already carries (TanStack Query's open issue #9968 is this race).

A render that React throws away, or the payload of an aborted navigation transition, changes
nothing: the store sees a payload only when its boundary commits. If admission rejects the
payload, nothing was ever written. TanStack Query instead writes new queries into the cache during
render; the overlay gives the same first view without mutating shared state in a render that may
not commit.

### 2.6 First render equals server HTML (H1)

> **H1.** During server rendering and during hydration, what a Flow hook returns is a function of
> the component's props and the payloads of its ancestor `Hydrate` boundaries only.

- `useView`'s `getServerSnapshot` (react.dev, useSyncExternalStore) resolves the actor in the
  chained server view, nearest boundary first, and applies the selector to that snapshot.
  Descriptor reads (`ticketById.get(s, k)`) and record reads (`Ticket.get(s, key, shape)`) on that
  snapshot read the same view. An actor in no ancestor view resolves to the same pre-attach value
  that the React stage (S8) defines for a handle whose actor is not yet attached. That value must
  itself be a pure function of ref and input (see Q4).
- On the server, React only ever calls `getServerSnapshot`, so the HTML obeys H1. In the browser,
  React calls `getServerSnapshot` while hydrating, so the hydration render obeys H1 with the same
  inputs: no mismatch. Afterwards React compares `getSnapshot`, the live store, and re-renders
  where it differs. A restored draft, newer client data or a client fetch therefore appears one
  commit after hydration, never as a mismatch.
- **Streaming order does not matter.** A component sees only its ancestors' payloads, never a
  sibling segment's. Selective hydration may hydrate segment B before segment A, or out of server
  order, and the result is the same. A component above every `Hydrate` (a header in the layout,
  outside the layout's boundary) renders the pre-attach value on both sides. To render it with
  data, put it under a boundary.
- **Nothing time-dependent is in the server view.** Freshness is not part of a lane, and `stale`
  is cause-based, so `Date.now` cannot cause a mismatch.
- **One version.** Every `useView` in one render under the same boundary chain reads one immutable
  view. The O7 guarantee that several `useView` calls in one render see one version still holds.

### 2.7 Precedence when the client already has the item

"Present" means present in the live Runtime when phase 2 runs.

| Item                                                                     | Rule                                                                                                                                                                                             | Why                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Shared actor present (active, disposing, or restored by the bootstrap)   | **Client wins.** The hydrated actor is ignored (evidence: `skipped: present`). An `ensureActor` input that differs keeps the existing first-input-wins rule                                      | an actor is workflow truth and may hold unsaved drafts; overwriting it would lose them      |
| Resource entry present, no optimistic write pending, no lookup in flight | **Younger wins.** Replace when the payload's age at hydration (section 2.9) is less than the client entry's age; otherwise skip                                                                  | what TanStack Query's `hydrate` does with `dataUpdatedAt`                                   |
| Resource entry with a pending optimistic write or an in-flight lookup    | **Skip**                                                                                                                                                                                         | fencing already orders the client's own work; a server copy cannot be placed among it       |
| Entity record field, versioned                                           | **The store's ordering rule.** A strictly greater version replaces; lower is rejected; equal falls through to the unversioned rule                                                               | entity-domain.md section 5.5, unchanged                                                     |
| Entity record field, unversioned and present                             | **Keep the client value.** If the payload value differs, the field is **contested**, and the existing contested-field rule refetches the loader and the answers holding it                       | request order across two Runtimes is not server truth; contests exist for exactly this case |
| Entity record field absent on the client                                 | filled                                                                                                                                                                                           | "a field the store does not hold is filled by any response"                                 |
| Entity answer present                                                    | **Client wins.** If the payload's references differ, the client answer is marked stale with cause `hydrate`                                                                                      | its repair machinery is authoritative; a difference is a cheap, safe refetch                |
| Entity answer absent                                                     | inserted; fresh, unless the client has, since `ready()`, accepted any base delta, live prediction, uncertain mark or queued write on that entity, in which case it is stale with cause `hydrate` | a conservative refetch is preferred to a missed one (entity-domain.md section 1.2)          |
| Stream lane present                                                      | client wins                                                                                                                                                                                      | the client session is newer                                                                 |
| Predictions on the client                                                | untouched; replayed over any new base                                                                                                                                                            | entity-domain.md section 5.1                                                                |

`hydrate` joins the closed cause list of entity-domain.md section 5.2 (an amendment). It lowers
the frontier of the answers it covers, as `restore` does.

### 2.8 Hydration, persistence and the bootstrap

On a first page load the order is: the hydration render reads the payload overlay; in the commit
effects, `Hydrate` hands its payload to the Runtime and `FlowProvider` calls `ready()`; the
bootstrap restores from `KeyValueStore`, merges, and activates the hydrated actors.

The bootstrap (O3, O8) gains one step: **after restored data is validated and prepared, and before
actors are installed, merge it with the provisional hydrated items:**

- **Actors: persisted beats hydrated.** A ref present in both is restored from the KeyValueStore,
  and the hydrated copy is discarded before it ever activates (evidence: `superseded: restored`).
  The persisted copy is the user's own workflow, such as a draft typed before a reload. The UI
  shows the server's editor during hydration, then the restored draft one commit later.
- **Data: hydrated beats persisted.** Restored entries and records are at position 0 and older by
  construction (entity-domain.md section 5.5, "Persistence"), so hydrated entries win. For
  versioned records the version rule decides, as always.
- **Context closure.** A hydrated consumer whose provider is restored reads the restored
  provider; context is recomputed, never transferred. A restored consumer whose provider exists
  only in the payload is fine for this session. The durable-closure rule
  (`NonDurableContextProvider`) is about capture and is unchanged.
- After the merge, hydrated actors are installed **as restored**: no `initial`, no input, no
  events, no finite work replayed. Context baselines are silent. Activities reconcile next.

From then on the Runtime persists normally. Hydrated actors with `persist: true` are captured like
any other.

### 2.9 Activities and schedules restart without duplicate fetches

- **Ages are skew-limited.** Age at hydration = age at capture + max(0, clientNow − capturedAt). A
  client clock that is ahead makes data look older, so it refetches sooner (the safe direction). A
  clock that is behind adds nothing, so data looks as young as at capture. Freshness is then the
  ordinary `staleTime` rule: Dispatch Desk's `ticketList` (10 seconds) does not refetch on
  activation unless more than 10 seconds have passed. Recommend `staleTime` above the expected
  time to interactive, as TanStack Query does for SSR.
- **Activities reattach by identity.** On activation each activity computes its identity (slot,
  descriptor, canonical key). It is equal to the hydrated binding unless context or memory differ
  on the client (a restored provider, for example). When equal, it binds the hydrated entry, and
  because the payload records the entry version it last mapped, its `value` outcome (Editor's
  `TicketLoaded`) is **not** delivered again. That is the no-replay rule of O8. A newer client
  entry version does deliver. When the identity differs, the old binding is released, and the new
  one looks up or binds as usual.
- **Streams** always open a new session on the client (no replay). The lane shows the hydrated
  latest value until the first new one arrives.
- **Schedules** re-arm with remaining = max(0, remaining at capture − max(0, clientNow −
  capturedAt)). A schedule at 0 fires once on activation, as restore does. `restartOn` keeps its
  captured baseline, so it does not fire on entry. Dispatch Desk's 30-second poll fires about 30
  seconds after the server's load, not 30 seconds after hydration.
- **`retain`** of a hydrated shared actor starts at activation, as for any actor with no users
  yet.

### 2.10 Client navigations

A navigation renders a new `Hydrate` with a new payload under a ready Runtime. Render reads the
overlay; the commit effect inserts absent items and merges present ones under section 2.7. A
navigation transition that React abandons never commits, so its payload changes nothing. Payloads the
Next router cache replays have the same `(token, sequence)`, so they are no-ops. A payload
prefetched long before it renders is aged by `capturedAt` (section 2.9).

---

## 3. Interactions

**Persistence (O8).** Capture reuses persistence's capture algorithm: one consistent actor and
store cut, a closed context graph, and pending commits as `unknown`. Only the selection changes
(every shared actor instead of `persist` flags), as does the destination (an envelope instead of
KeyValueStore records). Hydrate's install reuses restore's install: validate, prepare detached
data, no replay, silent baselines. The `ConcurrentCapture` retry happens inside `dehydrate`, up to
3 attempts, then `FlowError(ConcurrentCapture)`. `NonDurableContextProvider` does not apply,
because hydration takes the closure whole.

**Entity domains (O6).** Records keep versions; positions and frontiers stay per Runtime; the new
`hydrate` cause; contested fields for unversioned disagreement; predictions, queues, tombstones
and uncertain marks never transfer. A hydrated `.byKey` record is a normal holder for confirming
reads. The property suite (V5) gains a hydrate step: dehydrate model A at a random point, hydrate
it into model B that is mid-run, and check C1 to C8 on B.

**Commits.** Section 2.4: they are not a server-render concern, and when present they are honestly
`unknown`.

**Actors and context (O3, O4).** Hydrated actors are admitted through the normal admission
validation (provenance, wiring, compatible providers, headroom) before phase 2 installs anything.
A failure rolls back the whole payload, reports `HydrationRejected` with the admission diagnostic
as its cause, and leaves the page on client loading.

**React (O7).** `FlowProvider` renders children before `ready()` completes. That was always
required (no Suspense) and is now load-bearing. `useView` gains a real `getServerSnapshot`.
Handles stay stable: the handle `useActorByRef` returns during hydration is the one used after.

**Inspection and CLI (O11).**

- New trace events: `dehydrate` (selection, omitted items with reasons, unsettled items, bytes,
  attempts) and `hydrate` (per item: `inserted`, `merged`, `skipped` with the precedence rule
  that decided, `superseded`, `contested`, plus payload-level drops). Payloads contain no
  sensitive values, so the events carry digests per D48 like everything else.
- `inspect(runtime)` adds `hydration`: accepted payloads (token, sequence, scope, bytes) and the
  provenance of each hydrated actor and entry. Nothing is off the record.
- `flow check` (static): **error** when a Story `.hydrate(story, label)` names a label that the
  source Story never dehydrates; **warning** when a resource that a shared actor's activity
  subscribes to has no `result` Schema (it can be neither hydrated nor persisted). See Q5.
- `flow story run` runs a hydrate Story's source Story first.

---

## 4. Stories: dehydrate on one Runtime, hydrate on another

Two commands are added to the closed list (amends O9 and D52):

- **`.dehydrate(label, { within, maxBytes? })`** on a `story.app` runs the real settle
  (quiet or `within`, advancing the TestClock deterministically through fixture delays) and the
  real capture, and records the payload at `run.payloads[label]`. The Story keeps running
  afterwards (its Runtime is not disposed), so a test can also checkpoint the server side.
- **`.hydrate(source, label?)`** applies a payload exactly as `Hydrate` would, phases 1 and 2.
  `source` is a payload value or a Story whose run has that label. The position decides the
  timing, as in a real browser: `hydrate` commands before every other command run **before the
  bootstrap** (an initial page load, with restore merged after them, section 2.8); later ones run
  on the ready Runtime (a navigation).

Checkpoints carry the `hydrate` evidence of section 3, and `serverView(label)`, the H1 view, for
assertions. TestClocks in both Stories start at the same epoch, and seeded ids make tokens and
attempt ids equal across runs, so the payload bytes are golden-testable.

```ts
// features/Tickets/queue/queue.ssr.story.ts
export const queuePage = story
  .app(DeskSetup, { id: "queue-ssr-server", fixtures: [] })
  .ensure(SessionRef)
  .ensure(queueRef("north"), { input: { workspaceId: "north" } })
  .dehydrate("page", { within: "1500 millis" }); // stamps DeskSetup's scope

export const queueHydrated = story
  .app(DeskSetup, { id: "queue-ssr-browser", fixtures: [CountingTicketApi] })
  .hydrate(queuePage, "page") // first command: an initial page load
  .process()
  .checkpoint("active");

// A draft persisted from an earlier visit beats the server's editor; server data beats stored data.
export const restoredDraftWins = story
  .app(browserSetup("dispatcher-7"), {
    id: "editor-ssr-restore",
    fixtures: [StoredDraft, CountingTicketApi],
  })
  .hydrate(editorPage, "page")
  .process()
  .checkpoint("restored");
```

```ts
// queue.ssr.test.ts
const { active } = (await queueHydrated.run()).checkpoints;
expect(CountingTicketApi.calls(active)).toEqual({ list: 0, openCount: 1 }); // openCount has no result Schema
expect(Queue.S.HEALTHY.is(active.snapshot(queueRef("north")))).toBe(true);
expect(active.hydration.map((h) => h.fate)).not.toContain("contested");
```

React-level proof, using only React's own APIs. Render the server view to HTML with a fresh render
Runtime, put it in a jsdom container, `hydrateRoot` with a second fresh Runtime, and assert that
`onRecoverableError` is never called:

```tsx
const payload = (await queuePage.run()).payloads.page;
const ui = (rt: Runtime) => (
  <FlowProvider runtime={rt}>
    <Hydrate payload={payload}>
      <QueueList workspaceId="north" onOpen={noop} />
    </Hydrate>
  </FlowProvider>
);
container.innerHTML = renderToString(ui(DeskSetup.construct()));
hydrateRoot(container, ui(DeskSetup.construct()), { onRecoverableError: fail });
```

---

## 5. Failure cases and diagnostics

New closed codes (O10), each with remediation:

| Code                       | Where                                             | Class                                     | Behaviour                                                           | Remediation                                                                                  |
| -------------------------- | ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ServerOnlyImport`         | import of `flow-state/server` in a browser bundle | Defect                                    | throws at import                                                    | import `dehydrate` only from server components or server code                                |
| `DehydratePersistentSetup` | `dehydrate`                                       | Failure (and a type error)                | rejects before construction                                         | pass a setup without `persistence`                                                           |
| `DehydrateTooLarge`        | `dehydrate`                                       | Failure                                   | rejects; details list the 10 largest items                          | split into segments, narrow `prepare`, or raise `maxBytes`                                   |
| `DehydrateUnsettled`       | `dehydrate`                                       | diagnostic only                           | payload is produced; lists pending lanes and dropped mailbox counts | raise `within` or move the slow read into its own streamed segment                           |
| `DehydrateCommitInFlight`  | `dehydrate`                                       | warning                                   | the actor transfers with an `unknown` commit                        | commit from a server action or the client                                                    |
| `ConcurrentCapture`        | `dehydrate`                                       | Failure, retryable                        | retried 3 times, then rejects                                       | (existing)                                                                                   |
| `HydrateOutsideProvider`   | `Hydrate` render                                  | Defect                                    | throws                                                              | wrap in `FlowProvider`                                                                       |
| `HydrationCrossRequest`    | `Hydrate` render                                  | Defect                                    | throws; nothing applied                                             | construct the Runtime inside the provider (`useState`), never at module level                |
| `HydrationScopeMismatch`   | `Hydrate` render                                  | Failure                                   | throws; nothing applied                                             | give the server and browser setups the same `scope`                                          |
| `HydrationIncompatible`    | `Hydrate`                                         | diagnostic                                | payload dropped; client loads normally                              | expected during deploy skew; a persistent one means server and client run different app code |
| `HydrationMalformed`       | `Hydrate`                                         | diagnostic                                | payload dropped                                                     | payload was altered in transit or hand-built                                                 |
| `HydrationRejected`        | phase 2                                           | diagnostic, admission diagnostic as cause | whole payload rolled back                                           | see the cause                                                                                |

Omission reasons (`NotEncodable`, `Sensitive`, `LocalActor`) are details on the `dehydrate` trace
event, not codes. They are expected outcomes.

---

## 6. What to reuse

- **Persistence capture and restore (S6)** for consistent cuts, closure, pending commits as
  `unknown`, no-replay install, silent baselines, schedule re-arming and activity reconciliation.
  Archived Persistence O3 and O4 are the algorithm. Hydration is a new selection and destination
  plus a precedence merge, not a second engine.
- **The shared bounded structural codec** of InspectionAndArtifacts, for the envelope and the byte
  bound.
- **`key.ts` canonical bytes** for entry order and identity in the payload.
- **The app's shape digest** for `HydrationIncompatible`.
- **Frozen `packages/flow-state` as prior art only** (C2: nothing is ported from it).
  `withRequestRuntime` in `src/runtime/request-runtime.ts` shows the lifetime shape `dehydrate`
  adopts: construct, run, dispose, and when both the request and the disposal fail, an aggregate
  error. Its `dehydrateBoot` and `hydrateBoot` (`flow-state/runtime-boot.v1`, actor trees plus
  resource snapshots) are the cautionary version: a public mutable hydrate on the Runtime, no
  precedence and no render rule. They were deleted for good reason, and this design keeps
  hydration out of the Runtime's public methods.
- **TanStack Query's two-phase `HydrationBoundary`**: insert new queries in render, merge existing
  ones in an effect. Also its younger-data-wins merge and its per-request client rule. Flow adopts
  all three, and adds H1's ancestor-only view, which TanStack does not have.

---

## 7. Verification

V-SSR, an addition to the plan, gated after S6 and S8 as **S8b SSR hydration** (needs S4, S6 and
S8; the entity parts need S5):

1. **H1 property.** Generated trees of nested and sibling `Hydrate` boundaries over the Dispatch
   Desk components, with every hydration order of the segments: `renderToString`, then
   `hydrateRoot` in jsdom, gives zero recoverable errors and zero console hydration warnings.
2. **Cross-request isolation.** Two concurrent `dehydrate` calls with different scopes and
   interleaved fixtures share no actor, entry or token. A module-level render Runtime receiving
   two requests' payloads throws `HydrationCrossRequest` on the second, and the first request's
   data never appears in the second's HTML.
3. **Scope.** A payload with the wrong scope throws and applies nothing; a `FlowProvider` whose
   setup scope changes replaces its Runtime cleanly.
4. **Settle.** Chained activities settle as a unit; streams and schedules do not hold it open;
   `within` expiry yields the documented unsettled payload; the same Story gives identical payload
   bytes on every run (golden).
5. **No duplicate fetches.** Counting fixtures prove zero lookups on activation for fresh entries,
   exactly one for unsettled, failed or non-encodable ones, and a refetch exactly when the aged
   entry passes `staleTime`.
6. **No replay.** `TicketLoaded` is not redelivered on activation; schedules fire at captured
   remaining time on the TestClock; a schedule past due fires once.
7. **Precedence.** One Story per row of the tables in sections 2.7 and 2.8, including a persisted
   draft beating a hydrated editor, hydrated data beating persisted data, the unversioned contest
   and a hydrated answer marked stale after a client prediction.
8. **Redaction.** A `sensitive` field in an entity, a resource result and actor memory never
   appears in the payload bytes (byte search), and the matching omissions appear in the evidence.
9. **Size.** Over `maxBytes`, `dehydrate` rejects with the top-10 detail; no partial payload.
10. **Entity property suite.** The hydrate step of section 3 holds C1 to C8.
11. **Packaging.** A packed-consumer check: a browser bundle importing `flow-state/server` fails; a
    `react-server` bundle importing `flow-state/react` gets the `"use client"` boundary; the core
    route pulls none of the `dehydrate` module.
12. **Next.js proving app (V10).** Dispatch Desk on the App Router with the layout and segment
    boundaries above. A Playwright check of no hydration warnings, a streamed slow queue, a
    navigation between workspaces, and a reload with a persisted draft.

---

## 8. Plan amendments this implies

- D50: remove "SSR hydration"; keep Suspense and error-boundary integration as non-goals.
- O7: replace "SSR hydration is out of scope…" with `Hydrate` and H1; `FlowProvider` renders
  before readiness.
- O8: the bootstrap merge step of section 2.8.
- O9 and D52: the commands `dehydrate` and `hydrate`, and `run.payloads`.
- O10: the codes of section 5.
- O11: the trace events, `inspect(runtime).hydration` and the two `flow check` rules.
- O12: the fifth route, and `Hydrate` in `flow-state/react`.
- O14: stage S8b.
- entity-domain.md: section 1.2 drops the hydration row; section 5.2 adds the `hydrate` cause;
  section 5.5 gets a short "Hydration" paragraph beside "Persistence".

---

## 9. Open questions, with recommended answers

**Q1. Should `dehydrate` take a host-owned Runtime instead of a setup plus `prepare`?** A
host-owned Runtime would let one request Runtime serve several segments and let a page read actor
state on the server (for `notFound()` or a redirect). _Recommended: no, for version 1._ An escaping
request Runtime in RSC has no disposal hook: `cache()` scopes it per request but never disposes,
and open streams and polls would leak fibers. The duplicate session load is a service-level cache
concern. Pages that must decide on the server call their API directly. Revisit if Next exposes a
request-end hook.

**Q2. Faithful hydration of sensitive fields?** Some apps would accept a sensitive value in HTML
because the same user sees it rendered anyway. _Recommended: no._ Omission is the safe direction
(D5), it is consistent with D48 (sensitive is never written out), and the cost is one client fetch.
An opt-in would add a name whose only use is weakening a guarantee.

**Q3. Should the server Runtime skip streams (a server mode)?** Opening the live feed per SSR
request costs a connection. _Recommended: no server mode in version 1._ One production execution
path is a binding principle. Settle already ignores streams, and `dispose` closes them within the
call. If the cost bites, machines gate the activity with `when` on a session flag. Measure in V10.

**Q4. What exactly does an unattached, unhydrated handle render?** H1 depends on it being pure. S8
must define it. _Recommended:_ `useView` on a handle with no actor yet returns the selector applied
to a **pre-attach snapshot**: default state path, memory from `initial(input)` (pure, D46),
context and activities absent (lanes `undefined`), lifecycle `active`, no issues. It is computed
in render without registration, on both sides. This is the riskiest dependency: it reintroduces a
render-time initial computation that the archive's "render-time preparation" deletion removed,
though without creating anything. If S8 instead returns `undefined` for unattached handles, H1
still holds, but components must handle `undefined` from every `useView`.

**Q5. Should the "no `result` Schema" `flow check` rule always warn?** It is noise for browser-only
apps. _Recommended:_ warn only when the app is listed with `ssr: true` in `flow.config.ts`, or
when the resource is used by a `persist: true` ref. Persistence needs the Schema too, so this
merges with an existing concern.

**Q6. Default `maxBytes`?** _Recommended: 256 KiB_ of encoded JSON per payload. A larger page
should split into segments, which also streams better. Measure in V10.

**Q7. Should hydrated actors beat persisted actors in some cases?** For example, a server-confirmed
state change while the user was away (the ticket was closed on the server, but the persisted editor
is OPEN). _Recommended: no._ Persisted beats hydrated for actors, always. Server data still flows
in through hydrated entries and records, and the restored actor's activities react to that data
through their normal outcomes. A second rule would make precedence depend on content.

**Q8. Should `scope` be unified with the entity `principal()` source and `persistence.scope`?**
_Decided:_ `runtimeSetup({ scope })` is the one field. Persistence partitions by it and payloads
carry it; `dehydrate` has no `scope` option. `principal()` is removed: a condition about the
signed-in account uses an input field, or `serverMatches` when only the server applies it.

---

## 10. Sources

- TanStack Query, Advanced SSR (per-request client, `HydrationBoundary`, streaming pending
  queries, `staleTime` above 0 after SSR):
  https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
- TanStack Query hydration reference (only successful queries are dehydrated by default; hydrate
  overwrites only newer data): https://tanstack.com/query/latest/docs/react/reference/hydration
- React `useSyncExternalStore` and `getServerSnapshot` (used during server rendering and
  hydration; must match): https://react.dev/reference/react/useSyncExternalStore
- React `renderToPipeableStream` (`bootstrapScriptContent`):
  https://react.dev/reference/react-dom/server/renderToPipeableStream
- React `cache` (per-request memoisation in Server Components): https://react.dev/reference/react/cache
- Next.js server and client components, `server-only`, serialisable props:
  https://nextjs.org/docs/app/getting-started/server-and-client-components
- Zustand with Next.js (no global stores on the server; a store per request created in a provider):
  https://zustand.docs.pmnd.rs/guides/nextjs
- Redux Toolkit with Next.js (`makeStore` per request; a `useRef` store provider):
  https://redux-toolkit.js.org/usage/nextjs
- XState persistence (`getPersistedSnapshot`, restoring an actor from a snapshot without replay):
  https://stately.ai/docs/persistence
- Apollo Client Next.js integration (client components rendered on the server stream their cache to
  the browser): https://github.com/apollographql/apollo-client-integrations/tree/main/packages/nextjs
