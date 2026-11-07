# Actor lifetime: convergence brief

Status: brief for one redesign, 2026-11-07. Everything in "Findings" is evidence, not a decision. Paths are from the
repository root unless noted; MD = `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`.

## The problem

A shared actor (one named by `actorRef(machine, id)`, ensured from any component or host code) must stop living at
some point, or memory grows without bound. Before 2026-11-07 that was `retain: Duration` on the ref: disposed that long
after the last use. It was a guessed timer in user code, it expired actors in the middle of work (a checkout in 3-D
Secure in a background tab), and one number served opposite needs (an editor should stay; presence should end so other
users see you leave). The goal: one lifetime rule, decided by the runtime from facts it already has, with no duration in
user code, that keeps every guarantee below.

## Requirements

1. Correctness first: never lose or reorder work in progress (write-ahead, unknown outcomes held, parked endings
   delivered once, endings delivered to the right incarnation, lanes adopted only by their own identity).
2. No timers or durations in user code. Internal timing is allowed if it is invisible.
3. Shared actor identity keeps serving: persistence and restore by identity (Persistence O2), `send(ref, event)` between
   actors (Runtime O4), context providers bound by identity, server rendering transfer (ServerRendering O3), multi-tab
   ownership (`workflow/plans/flow/references/design/multi-tab.md`), several screens showing one actor without a common
   parent (React O1).
4. Memory is bounded in normal use; what a disposed actor costs is stated.
5. Behaviour never depends on whether a cache happened to keep an actor.
6. React: Strict Mode remounts, route changes and Suspense transitions do not churn; render registers nothing (React O2).
7. The core is pure and deterministic (AGENTS.md): no clock in the core; the host drives time.
8. Static analysis, the single graph, Stories, `flow check`/`flow explain` and Inspection keep working; Stories must not
   reach states production cannot.
9. Locality: a property sits next to the thing it describes. Prefer standard upfront contracts to clever hybrids.

## Decided by the user (keep these)

- `retain` is removed; a shared actor lives while it is used, and work in progress is a use (OD27).
- Public API round, OD27 Q1-Q6: `SendTargetAbsent` carries a reason (`NotAdopted`, `RecordUndecodable`,
  `NotPersisted`); a host `ensureActor` is not a use by itself and handles get no `release()` (host code keeps an actor
  with a `snapshots` subscription); no dedicated keep-alive API; Stories end a use with `Story.release(ref)`; Inspection
  gives each actor `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }`; the grace stays internal.
- Explicit `disposeActor` and `forget` are unchanged. Local actors keep React O3.
- machine-design.md is the main proposal: the result merges there first, plans later (C rows).

## Open for the user (propose options with a recommendation; do not decide)

- Schedules that do work (debounce, autosave, a held re-send on a timer): should they keep the actor alive? Options
  seen: a property on the schedule marking it as work; a stated limit plus a `flow check` info; flushing at the grace's
  end.
- Handle sends (`handle.send` from host code) to an absent persisted actor: restore, as action sends do, or drop, as
  React O3 says today?
- A persisted target that was never created: a new reason `NoRecord`, or reuse `NotPersisted`?
- Anything else your design needs the user for.

## Findings to resolve, all at once

From review 1 (2026-11-07, of the first proposal):
- R1-H1. The default flips: a shared actor without `retain` lived forever; now it is disposed when unused. Say so; give
  the way to keep one alive.
- R1-H2. "After the React commit" is undefined for the Runtime, headless hosts and Stories; restored and hydrated actors
  have no uses until consumers attach after readiness.
- R1-H3. Disposal then quick re-use shows `initial` memory for a persisted actor unless the Runtime keeps its copy.
- R1-H4. Restore-on-send contradicts LazyFeatures O2 ("a send never adopts or creates its target"); a send has no input;
  undecodable records and unadopted lazy entries.
- R1-H5. Counting activities or stream sessions as uses makes presence immortal.
- R1-M1/M2. `Held` and armed schedules as uses keep invisible actors alive.
- R1-M4. Multi-tab: remote uses and a new leader race. R1-M5: local actors. R1-M6: React Activity hiding loses its remedy.
- R1-M3. Review 8's H2 was already closed by Runtime-owned lanes; the real gain is in-actor follow-up and endings of
  non-persisted identities.

From the prototype run (round-14x, `packages/flow-state-v3/prototypes/round-14x/LIFETIME-RESULTS.md` in the worktree
`.claude/worktrees/agent-acee8f40b71d961fd`):
- P1. A persisted target never created fits no reason.
- P2. "A send to a disposing target queues" has no window when disposal is atomic.
- P3. A remount after a reload that quarantined the record: does a pre-attach handle create the actor?
- P4. Endings parked for a path while a non-persisted shared actor was alive, at its disposal.
- P5. Strict Mode survives a 0 ms grace (a later task); the grace matters for route changes.
- P6. Stories' record-keeping `dispose()` has no host counterpart.
- P7. The grace and use counts enter the state hash (searches grow about 23%).
- P8. 22 suite cases dispose a busy actor through that Stories step.

From review 2 (2026-11-07, of the design text, the prototype and the suite):
- R2-H1. Server `dehydrate` loses actors: a server ensure is not a use and read lookups are not uses, so an actor being
  prepared is disposed mid-load.
- R2-H2. Debounce and autosave are silently deferred: armed schedules are not uses, so closing the editor within 2 s of
  typing defers the save until someone reopens the ticket (`dispatch-desk/features/Tickets/editor/autosave.trait.ts`).
- R2-H3. "A pending ensure is a use" contradicts React O2 ("render registers nothing").
- R2-H4. Stories' `dispose(ref)` reaches states production cannot (property tests generate it too).
- R2-H5. The suite's harness re-attaches with a use count on an absent actor after every reload, a feature the design
  does not have; restored actors' grace is never exercised.
- R2-M1. Sends to a disposing target conflict with React O3 and Runtime O4's handle-send rule; a queued event could
  reach a fresh incarnation from `initial`.
- R2-M2. Handle sends and action sends are not separated; the prototype has no cross-actor action sends.
- R2-M3. A persisted actor disposed before its first capture has no saved record yet.
- R2-M4. `Story.release(ref)` collides with the wire `release()` in Stories' vocabulary; `release` with no use held.
- R2-M5. The rewritten R9 H1 walk cannot be a Story (Runtime disposal is the suite's alone).
- R2-M6. Places still saying `retain`: `multi-tab.md` 5.3 and V-MT2, React V4, React O3's handle-send drop, Runtime O3's
  reference, `dispatch-desk/app/host.ts` (ensures Toasts, queue, feed, editor with no use), four reference refs.
- R2-L2. A new leader waiting for followers to re-attach never ends if one never does. R2-L3: the Runtime's copy grows
  for the session. R2-L4: a settled head counted as busy.
- R2-F. Untested parts: restore-on-send delivering after `unknown { Restored }` and parked endings; a `Held` head with
  waiting commits counted as busy; `disposeActor`/`forget` clearing uses; contexts, subscriptions and pending ensures;
  action-send restore; multi-tab; SSR activation; Inspection `uses`; `ConflictingActorRef`.

## What to produce

`proposal-v2.md` beside this file: one coherent lifetime design that resolves every finding above, or states a limit
with its reason. Draft it from this brief first; read MD's current 2.7.17, rule 73 and OD27 only afterwards, as prior
art, and say where you depart from it. Include: the rule in full; before/after code for the editor, presence, the
checkout in 3-D Secure, the queue on a server page, a toast, a local actor, a Story; the exact replacement text for MD
(rule 73, 2.7.17, rule 44's sentence, the Stories lines, OD27's addendum, the C rows); the suite changes it implies
(what the 22 busy-dispose cases become, what the harness stops doing, the cases and the global invariant to add); a
finding-by-finding table (finding, resolution, where); and the open questions for the user.
