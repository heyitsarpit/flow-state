# Actor lifetime, fresh proposal: the Runtime owns pending work

Status: brief, 2026-11-07, for a from-scratch proposal. Evidence, not decisions, except where marked decided. Paths are
from the repository root. MD = `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`.

## The idea to develop

A shared actor (named by `actorRef(machine, value)`, ensured from components or host code) must end when nothing uses
it, or memory grows forever. Ending it is unsafe only because of **work the actor itself has planned but not yet handed
to the Runtime**. Writes already sent are safe today: their lanes are Runtime records that outlive the actor (OD19),
are persisted, and park their endings for the next incarnation (rule 44, OD21, OD22). The idea: make the rest of the
actor's pending work the Runtime's too, so an unused actor can end after a short internal grace with nothing lost, and
the lifetime rule stays tiny.

**The user's constraint: ideally no more public API changes.** Treat every new public word, option, field, step or
reason as a cost that must be justified against a design with none. Look first for designs that need no new API (for
example, the Runtime keeping a persisted actor's armed schedules and waking the actor when one falls due, then letting
it go again; or anything better). If you add API, show the no-API alternative you rejected and why.

## Evidence: what is actually at risk

All 33 schedules in both reference apps (`workflow/plans/flow/references/dispatch-desk/`, `.../checkout/`), grep
`schedule:`:
- **Delayed writes and retries (about 11):** autosave 2 s (`features/Tickets/editor/autosave.trait.ts`), the editor's
  800 ms settle, 2 s and 3 s resends and lock backoff (`editor.machine.ts`), the body's 1 s settle and 2 s retry
  (`body.trait.ts`), upload start and 3 s retry (`Attachments/upload.trait.ts`), Pay's retry (`checkout/features/Pay/pay.machine.ts`).
  These are lost when the actor ends early. This is the whole problem.
- **Reads and polls (about 9):** queue polls, Find's search debounce, Pay's 3 s status check during 3-D Secure. Redone
  on return; nobody is looking meanwhile.
- **Stream reconnects (3):** feed `reopen`, roster `reconnect`. An unused actor's streams should stop.
- **UI-only timers (about 10):** toast expiry, row fade, badge settle, countdowns, 3-D Secure's give-up.

Two more kinds of actor-owned pending work:
- **Chained steps:** when write A succeeds the actor starts write B (Pay: create the intent, then confirm). If the actor
  is gone while A is in flight, B waits for the next visit.
- **Reactions while away:** the actor's response to an ending (a failure toast sent to the toasts actor, a notice).

The previous answer was `retain: "10 minutes"` on each ref: it kept the actor long enough for all of the above in
practice, but it was a guessed number in user code, lost work longer than the window (3-D Secure in a background tab, a
long upload, backoff), and kept actors that should end (presence told other users you were still viewing).

## Requirements

1. Correctness first: never lose, duplicate or reorder work in progress. Write-ahead, unknown outcomes held, parked
   endings delivered exactly once, endings to the right incarnation, lanes adopted only by their own identity.
2. No timers or durations in user code. Internal timing is fine if invisible.
3. Shared identity keeps serving persistence and restore (Persistence O2), sends between actors (Runtime O4), context
   providers, server rendering transfer (ServerRendering O3), multi-tab ownership
   (`workflow/plans/flow/references/design/multi-tab.md`), several screens on one actor (React O1).
4. Memory bounded in normal use; state exactly what each state of an actor holds and when it is freed; no new leak.
5. Behaviour never depends on whether a cache kept an actor.
6. React: Strict Mode, route changes and Suspense transitions do not churn; render registers nothing (React O2).
7. The core is pure and deterministic, with no clock (`AGENTS.md`); time is the host's, returned as data.
8. Static analysis, the single graph, Stories, `flow check`, `flow explain` and Inspection keep working; Stories must
   not reach states production cannot. No hidden behaviour: any work the Runtime does for an absent actor must be as
   visible (graph, Stories, traces) as the actor doing it.
9. Locality; standard upfront contracts over clever hybrids; minimal API (the user's constraint above).

## Decided by the user (keep)

- `retain` is removed; a shared actor lives while it is used (OD27).
- OD27 public API round: `SendTargetAbsent` carries a reason (`NotAdopted`, `RecordUndecodable`, `NotPersisted`); a host
  `ensureActor` is not a use by itself, handles get no `release()`, host code keeps an actor with a `snapshots`
  subscription; no dedicated keep-alive API; a Story step ends a use (named `Story.release(ref)`; a rename to `detach`
  was proposed because `release` already means "deliver held items" on fakes, not decided); Inspection gives each actor
  `uses: { consumers, subscriptions, contexts, pendingEnsures, busy }`; the grace is internal.
- Explicit `disposeActor` and `forget` unchanged. Local actors keep React O3 (a reopening of this, "a local actor is not
  disposed while busy", was proposed, not decided).
- Identity (OD30, accepted 2026-11-07, merging): an actor is its machine plus its input; a ref built from a value is
  named by the machine's input fields; a singleton has a literal name. See
  `workflow/plans/flow/references/proposals/actor-identity/proposal.md`.
- `Flow.ignore` (OD28): an ignored unknown is released and is not work.
- machine-design.md is the main proposal; your result merges there first, plans later (C rows in section 5).

## Issues any design must solve (found by two reviews and a prototype run)

Lifetime and timing:
- The default flips: a shared actor without `retain` lived forever; say so, and how an app keeps one alive.
- "After the React commit" is undefined for the Runtime, headless hosts and Stories; restored and hydrated actors have
  no uses until consumers attach after readiness.
- A pending ensure counted as a use contradicts React O2 ("render registers nothing") and leaks on discarded renders.
- Strict Mode survives a 0 ms grace (a later task); the grace matters for route changes; the 100 ms is a guess.
- Gaps longer than the grace (a Suspense fallback on the network, React Activity hiding) restart a non-persisted actor.
- Restore cost (a decode per return) is unmeasured.

What counts as work:
- Counting activities or stream sessions keeps presence alive forever; counting `Held` or every armed schedule keeps
  invisible actors alive; a never-resolving unknown; an endless re-arming schedule.
- Debounce and autosave closed within their delay; timed re-sends; lock backoff; chained steps; reactions while away.
- Finite lookups in progress (a server page waits for them).

Server rendering:
- `dehydrate` loses actors: a server ensure is not a use and lookups are not uses, so an actor being prepared is
  disposed mid-load (`dispatch-desk/next/app/desk/[workspace]/page.tsx` waits 1500 ms).

Sends:
- A send to an absent target: restore it (contradicts LazyFeatures O2, "a send never adopts or creates its target"; a
  send carries no input; undecodable records; lazy entries not loaded) or drop it with a reason.
- A send to a target that is disposing; handle sends (React O3 drops them) versus action sends; a persisted target never
  created (a `NoRecord` reason was proposed).

Persistence and restore:
- Disposal then quick re-use shows `initial` memory unless the record is kept in memory or restored at once.
- A persisted actor disposed before its first capture (captures coalesce over 5 s) has no saved record yet.
- Restored actors at `ready` with nothing pending: start live or stay as a record?
- An ensure over a record that no longer decodes; a remount after a quarantined record.
- Endings parked for a path while a non-persisted shared actor was alive, at its disposal (rule 44 is silent).

Stories, suite and tools:
- Stories' record-keeping `dispose(ref)` disposed a live, possibly busy actor and kept its record, which production
  cannot do; property tests generate it; 22 suite cases rely on it. What replaces it.
- The prototype suite's harness re-attached a use count to an absent actor after every reload, a feature no design has.
- `Story.release(ref)` collides with the fakes' wire `release()`.
- The R9 H1 Story walk relies on Runtime disposal, which is the policy suite's alone.

Multi-tab:
- Remote (follower) uses and a new leader race; a leader waiting for followers to re-attach never ends if one never
  does; follower uses cannot be tested in a Story (tabs share only storage).

Places still describing `retain`: `multi-tab.md` 5.3 and V-MT2, React V4 and O3, Runtime O3's reference, the reference
apps' refs (editor, roster, presence, assistant) and `dispatch-desk/app/host.ts` (host ensures that keep nothing alive).

## Read

`AGENTS.md`; the plans (`workflow/plans/flow/Runtime.plan`, `React.plan`, `Persistence.plan`, `ServerRendering.plan`,
`LazyFeatures.plan`, `Testing.plan`, `Machines.plan`, `Operations.plan`); MD for lanes and parking (2.7.13, rules 14,
17, 21, 23, 25, 44, 53, OD19-OD22, OD25), schedules (2.7.10, rule 23), Stories (2.10); the reference apps; prior art in
`codebases/` (xstate, tanstack-query: `query.ts`, `removable.ts`, `mutation.ts`; zustand); the prototype round 13
(`packages/flow-state-v3/prototypes/round-13/`) for how schedules, records and lanes are stored and restored. Do not
read MD's current rule 73, section 2.7.17 or OD27's lifetime text, or `proposal.md` and `proposal-v2.md` beside this
brief, until your own draft is written; then read them as prior art and say where you differ and why.

## Produce

`proposal-v3.md` beside this brief, "Status: PROPOSED": the rule in full; every public API change (aim for none; list
each with its rejected no-API alternative); a table of every state an actor can be in, what it holds in memory, and
what frees it; leaks considered; before/after code for the editor (autosave), the checkout in 3-D Secure, presence, the
queue on a server page, a toast, a local actor and a Story; the exact replacement text for MD (rule 73, 2.7.17, rule
44, the Stories lines, the decision entry, C rows); the suite changes; an issue-by-issue table covering every issue
above; open questions for the user as "Q1. … A: … B: … Rec. …" with small before/afters; limits.
