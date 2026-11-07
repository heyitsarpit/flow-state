# Findings on proposal-v4, from two independent reviews (2026-11-07)

Evidence for one convergence round. Review A checked the design text; review B checked app-code bugs and whether it
can be built and tested. Both say: the blunt rule is the right shape; v4 is not ready to merge or build.

## Rule-level (review B, confirmed in part by A)

- **B-H1 / A-H-c. The in-flight exception breaks when a read or a timer sits in a chain.** Write → read → write
  (`Confirmed` → poll the PaymentIntent while "processing" → `place`; or `Confirmed` → refetch cart → `place`): after
  `Confirmed`'s turn there is no use and no write out; the read outlasts 100 ms; the actor ends; the customer is charged
  with no order. Pay's own `check` lookup schedule is missed by section 7's analysis. Proposed fix: reads started in the
  ending's turn of a write that is keeping the actor also keep it, transitively (reads are finite, like mail); schedules
  still never keep it; a `flow check` warning, not info, for "a write's ending reaches a write only through a schedule
  or a read"; the analysis follows lookup endings and their raises to a fixed point.
- **B-H2. Offline-first apps stay unsynced after a reload.** Under L7 every record stays a record until ensured; write-
  ahead lanes deliver `NotSent { Restored }` only to the next ensure, so five notes edited offline sync only when each is
  opened. Proposed fix: at `ready`, a record whose identity has a write-ahead (non-`Idle`) lane is restored, and the
  in-flight exception keeps it until that lane's `Restored` ending has had its turn; other records stay records. (This
  also answers B8.)
- **B-H3. Host code that subscribes first loses the actor.** `forkScoped(runForEach(snapshots(ref)))` then
  `ensureActor(ref)`: on a never-created identity L8 makes the stream emit a terminal snapshot and complete, and the
  ensure then has no use. The other order relies on 100 ms beating Effect scheduling (a GC pause loses). Proposed fix: a
  subscription to an identity with no live incarnation and no record is a pending use; it emits when an ensure creates
  the actor and completes only on `disposeActor` or `forget`; document "subscribe, then ensure".
- **B-H4. Route navigation loses non-persisted shared state depending on network speed.** A wizard across routes with
  `loading.tsx`, list → detail → back, dashboard tabs: on localhost the next page mounts within 100 ms; in production
  the gap is 300 ms or more and the state is gone. v4 cites TanStack Query wrongly: TanStack waits `gcTime` (5 minutes,
  Infinity on the server; `codebases/tanstack-query/packages/query-core/src/removable.ts:25-27`) and keeps a query while
  fetching (`query.ts:226-227`). Only `persist: true` (durable storage) keeps memory. Proposed fix: correct the citation;
  make "hold the use in the layout or app shell" the headline recipe replacing `retain`; an Inspection-only diagnostic
  for an actor created from nothing within a few seconds of ending; `revisit.md` for a memory-only record. **This is a
  user decision**: it touches the blunt rule's timing.

## Rule text and semantics

- **A-M-b.** Rule 73 says "nothing else keeps it", but an unencodable record keeps the actor (L5.1, fix 7).
- **B-M1.** L4's "[P]" sentence contradicts L4 and the experiment: "free" includes "no mail", yet "a turn during the grace
  … does not restart it unless it commits", and "commits" is undefined; the experiment re-arms the grace after mail
  (LIFE-08). Fix: free = no use and no `InFlight` lane; mail only delays the end step; delete "unless it commits".
- **B-M3.** Which React effect counts a use is unstated. On re-suspend React cleans layout effects only; Activity hidden
  cleans both. Say passive effects (`useSyncExternalStore`'s subscribe) and correct the claims at v4:291 and v4:308.
- **A-M-c / B-M4.** A lookup (`useActorByRef(ref)`) returns `null` (B11) while `handle.getSnapshot()` returns the record
  with lifecycle `active`. Fix: a lookup of a persisted identity with a record returns the record view; a read, not a use.
- **A-M-d / B-L1.** A send that restores runs the starting turn, entry lookups and activities and fires overdue deadlines
  (a late write), then ends 100 ms later; a broadcast to N persisted identities restores all N. Restore the stated limit.
- **A-M-f / B-L3.** A repeating schedule whose write overlaps its period (a heartbeat on a slow network) keeps the actor
  forever. State it; show it in `uses.busy`; put it in `ScheduleLeadsToWrite`'s message.
- **A-M-g.** Decision 15 (one `onContext` on restore) is narrowed to "reload: silent" without saying so. Mark and state
  it, or persist the selection.
- **B-M5.** Background schedules stop silently (a kitchen timer, a token refresh on a header-only session actor, upload
  backoff); a retry gaining a delay changes lifetime (an immediate retry runs in the ending's turn). State the app-shell
  recipe beside section 6.
- **B-M7.** The "ending" window in the send table needs a core input (`stopped(actor, incarnation)` after Runtime O6's
  cleanup); the experiment found disposal atomic.
- **B-L2.** An end blocked by an unencodable record retries "after its next publication", but a free actor publishes
  nothing. Retry at each grace expiry.

## Decisions and data

- **A-H-b.** The upload fixture fix does not work: a re-send's `FileGone` comes back as `unknown { StillUnknown }` (rule
  18), so after a reload mid-upload the user gets three wasted re-sends and `GaveUp`
  (`workflow/plans/flow/references/dispatch-desk/features/Attachments/upload.trait.ts:70-71`). Write the fixture change
  in full (map `StillUnknown { failure: FileGone }` to `Gone` if mappings can read the failure), or raise a question.
- **B-M2 / A-B9.** The records cliff policy deletes user data: the oldest "clean" records can be drafts saved locally and
  never sent, and dropping them from the capture deletes them from storage. Fix: evict only the Runtime's in-memory copy
  and re-read storage on return; never drop a record holding an armed deadline or a non-`Idle` lane.

## Merge text (review A)

- **A-H-a.** C123 is already absorb-wiring's (optional handler target, W37). Renumber v4's new rows to C124-C128.
- **A-H-d.** `host.ts` is not true as written: its subscription uses `Stream.take(1)` and ends at once; its bare ensures
  of Session, Toasts, queue and feed keep nothing. Give the replacement code.
- **A-M-a.** E5 copies sections "verbatim" that cite proposal-only things ("fix 4", "decision 15", "Q1", "B3", "section
  6") and carry [P] marks. Give the merged text in full with references resolved and no [P] or Q marks.
- **A-M-h.** Stale text: MD:2199 "a persisted actor disposed with no uses (rule 73)", MD:2235 "an ensure after no-use
  disposal (rule 73)", the 2.10 Total row (94 → 95), E13's fallback should be "after OD29".
- **A-L.** E8's `{ detach: ref }` vs the `[ref?, options?]` form; I15's Inspection printing not carried into E5; L4
  "unless it commits" ambiguous; L8 "terminal snapshot" for a never-created identity undefined; whether `detach` applies
  to `Story.machine`.

## Suite (both)

- **A-M-e / B-M8.** The global invariant checks safety only; a runtime that never ends anything passes. Add: liveness
  (free for the grace with no intervening input means ended); same incarnation (every ending of a lane `InFlight` at the
  last detach is delivered to the same incarnation id); no schedule fires on an ended incarnation. Evidence must carry
  incarnation ids.
- **B-M6.** List the 22 cases by id with each target row (including "ended with an armed schedule, comes back",
  `round9.scenario.ts:201-211`); the LIFE-01..10 migration (`release` → `detach`, `NotPersisted` → `NoRecord`, LIFE-08
  inverted); name the core inputs about 7 of the 15 new cases need (`subscribe`/`unsubscribe {owner}`,
  `hydrate(payload)`/`activate`, `codecFails`, a bounds override, lazy entries, context providers, `flow check` is
  compile-side); say which are core cases and which need browser tests.
- **A / B.** Hash whether a grace is armed, not the counter (the experiment measured about 23% more states); test chains
  of two or more (confirm → place → `Placed`); L7 changes every reload case, not only the 22; `round6.scenario.ts:879`
  keeps its explicit dispose; the rebind case needs `advance` past 100 ms.

## v4's questions, both reviews

- **Q1 (`<Hydrate>` holds a use):** A, until each inserted actor's first consumer attaches or the boundary unmounts.
- **Q2 (in-flight exception for local actors):** A, plus a rule: when a new incarnation of an equal local identity starts
  while the old one is kept only by writes, the old one is disposed at once and the new one adopts the lanes (otherwise
  an invisible old incarnation places the order while the remounted screen shows the card form).
- **Q3 (`detach` with no use held):** A, `ActorAbsent`.
- **B3** (a chained step needing the user runs without them): accept as a limit; name the router-leave hook in the recipe.
- **B4** (a late persisted autosave overwrites newer data): accept as a limit; `ScheduleLeadsToWrite`'s message says the
  write needs a precondition (If-Match), and the editor's title save should show one, as `body.trait.ts` does.
- **B5, B6, B7, B10:** accept (B7: say "once per incarnation" in rule 44).
- **B8:** answered by B-H2. **B9:** answered by B-M2. **B11:** fix by B-M4.
