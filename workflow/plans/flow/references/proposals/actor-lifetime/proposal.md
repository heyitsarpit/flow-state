# Actor lifetime: an actor lives while it is used

Status: **PROPOSED.** Nothing here is decided, and no plan or design section changes because of it.
Written 2026-11-07, from a session with the user. Replaces `retain` on `actorRef`.

## The rule

- A **use** is any of: an attached React consumer, a live `snapshots` subscription, a bound context
  consumer, or **work in progress**: an operation in flight, a write not yet landed, a held unknown
  (`Held`), a parked ending awaiting delivery, or an armed schedule.
- An actor with **no uses** is disposed once the host's current React commit has finished (so
  StrictMode remounts and route changes do not count).
- A **persisted** actor disposed this way keeps its saved record; the next ensure or send restores it.
  A non-persisted actor is gone.
- Only `disposeActor` or `forget` removes a saved record (unchanged).

```ts
// before
actorRef(EditorMachine, [ws, ticket], { persist: true, retain: "10 minutes" });
actorRef(PresenceMachine, [ws, ticket], { retain: "15 seconds" });

// after
actorRef(EditorMachine, [ws, ticket], { persist: true });   // dropped: retain
actorRef(PresenceMachine, [ws, ticket]);                     // dropped: retain
```

Added: "work in progress is a use"; a send to an absent persisted target restores it and delivers.
Dropped: the `retain` option and its timer.

## Why

- `retain` leaks a timer into user code (AGENTS.md: no internal wiring in user code), and each value
  is a guess.
- It expires an actor whatever it is doing: a checkout in 3-D Secure left in a background tab is
  disposed mid-payment; review 8's H2 is the same path for the editor's save.
- One duration serves two opposite needs: keep longer to avoid churn (editor), end sooner because
  being alive is visible to others (presence).

## Prior art

- XState: an actor's lifetime is its owner's (component via `useActorRef`'s effect cleanup, provider
  via `createActorContext`, parent for children); `systemId` gives addressing without shared
  ownership. `codebases/xstate/packages/xstate-react/src/useActorRef.ts:87-93`.
- TanStack Query: removes an entry only with no observers **and** `fetchStatus === "idle"`; gc times
  merge by maximum. `codebases/tanstack-query/packages/query-core/src/query.ts:226-227`,
  `removable.ts`.
- Zustand and Redux keep plain state forever; they own no running work.
  `codebases/zustand/src/vanilla.ts`.

## Why actors are shared by id (must keep working)

1. Persistence and restore by identity (Persistence O2, Runtime O1).
2. `send(ref, event)` between actors (Runtime O3, O4).
3. Context providers bound by identity (Runtime O1, O4).
4. Server rendering transfers shared actors and matches them by identity (ServerRendering O3).
5. Multi-tab ownership of one identity (`references/design/multi-tab.md`).
6. Several screens showing one actor without a common parent (React O1).

## Changes it implies (to be confirmed by review)

| Area | Before | After |
| --- | --- | --- |
| Runtime O3 lifetime | disposed `retain` after the last use; forever without it | disposed with no uses; work in progress is a use |
| Runtime O4 sends | `SendTargetAbsent` if the target is absent | persisted target: restored, then delivered; otherwise `SendTargetAbsent` |
| ConflictingActorRef | `persist`, `retain`, `context` | `persist`, `context` |
| ServerRendering | retention starts at activation | an unused hydrated actor is disposed after activation unless busy |
| Persistence O2-O4 | "a persisted actor whose retain expired keeps its record" | "... disposed for having no uses keeps its record" |
| machine-design.md 2.9.x | parked endings and unbound lanes for an actor disposed by retain expiry | to be determined: implicit disposal can no longer happen while a lane is busy |

## Open

1. Restore cost when navigating back to a persisted actor (unmeasured). If too slow, a hidden
   snapshot cache inside the runtime, with no change to behaviour.
2. An unknown that never resolves keeps its actor alive; Flow reports an issue.
3. Whether an armed schedule should keep an actor alive (a one-hour reminder means one hour alive).
