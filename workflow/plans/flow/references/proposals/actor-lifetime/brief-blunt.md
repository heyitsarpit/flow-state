# Actor lifetime, version 4: the blunt rule (brief)

Status: brief, 2026-11-07. The rule, fixes, improvements and defaults below were **accepted by the user** in the Claude
Code session on 2026-11-07. Paths are from the repository root; MD =
`workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`.

## Why this version

Three proposals (`proposal.md`, `proposal-v2.md`, `proposal-v3.md`) kept shared actors alive while they had "work",
derived or flagged. Judged by the bugs each causes in app code, that cleverness is the problem: lifetimes that change
when a handler gains a `send`, work done after the user left (leaving is sometimes how a user cancels), leaks from
repeating schedules, locks held for absent screens, and "why is this actor still alive?". The user chose a blunt rule
that a React developer already expects, with one exception that prevents a dangerous bug.

## The rule (accepted)

**A shared actor lives while something uses it, plus until its writes already in flight have returned. Its schedules
belong to it and end with it.**

- **Uses:** an attached consumer (counted from its commit effect, never from render), a `snapshots` subscription, a
  bound context consumer, and `dehydrate`'s subscription during prepare.
- **The one exception:** a write lane of the actor that is `InFlight` keeps it until the ending returns, so a chained
  step runs (Pay: the confirm returns, then `place` is committed by the same incarnation). Without it a customer is
  charged with no order. Mail already queued is processed too (a turn is atomic; queued events are finite).
- **Nothing else counts:** not schedules (of any kind), lookups, activities, stream sessions, `Held` lanes, parked
  endings or context.
- **Then:** with no uses and no in-flight write, the actor ends after the grace. A persisted actor keeps its record
  (and the Runtime's copy); its armed deadlines are in the record, and an overdue one fires once when it is next
  ensured or reloaded (Machines O5). A non-persisted actor is gone; its lanes stay with the Runtime (rule 44).

## Fixes (accepted; apply all)

1. **Grace:** React O3's 100 ms on the Runtime Clock, internal, for shared and local actors alike (not "one task": an
   Effect `forkScoped` subscriber starts a tick later and would lose the race).
2. A use is counted from the commit effect only; render registers nothing (React O2).
3. At `ready`, restored actors stay as records until something ensures them; hydrated actors start the grace at
   activation.
4. `dehydrate` holds a `snapshots` subscription on each prepared actor, taken before any await, until it captures.
5. A pre-attach handle of a persisted identity reads the Runtime's copy of the record (no flash of `initial`).
6. The record is encoded in the step that ends the actor (a capture may not have run yet; captures coalesce over 5 s).
7. While the record cannot be encoded, the end waits, and Inspection says why.
8. Sends (action and handle alike): live delivers; a persisted target ending right now queues for its next
   incarnation, but explicit `disposeActor` or `forget` during that cleanup drops the queue with `NoRecord`; an ended
   persisted target whose record decodes is restored, and the event is delivered after its parked endings and
   `unknown { Restored }` (rule 44); a record that does not decode drops with `RecordUndecodable` (the record stays for
   an ensure to discard and start fresh); no record (not persisted, never created, disposed, forgotten) drops with
   `NoRecord`; a lazy entry not adopted drops with `NotAdopted`. A send never creates (it has no input); restoring from
   a record is not creating (amend LazyFeatures O2's phrase).
9. A handle follows the identity, not the incarnation: its reads and its sends agree after an end.
10. Stories: the step that ends a use is `detach(ref)` (renamed from the decided `Story.release`, which collides with
    the fakes' wire `release()`); Stories' `ensure(ref)` attaches a use, as a mounted screen; plain `dispose(ref)` means
    `disposeActor` (`{ how: "now" }` removed, `{ how: "forget" }` kept); "the answer lands with no actor" is a
    `reload`, as in production. The prototype suite's faked re-attach of use counts goes.
11. Every place still describing `retain`: `workflow/plans/flow/references/design/multi-tab.md` 5.3 and V-MT2, React V4
    and O3, Runtime O3's reference, the reference refs (editor, roster, presence, assistant) and
    `workflow/plans/flow/references/dispatch-desk/app/host.ts` (bare host ensures now keep nothing alive).
12. Rule 44: endings parked for a path stay on the lane record when a non-persisted shared actor ends; the next
    incarnation that adopts the lane receives them.

## Decisions (accepted)

- **13, the records cliff** (Persistence O3 rejects a whole capture over 4,096 records or 16 MiB): when over the limit,
  drop the oldest ended actors whose record equals what is already saved (nothing unsaved), with evidence; never a live
  actor or an unsaved delta.
- **14, `unknown { Restored }`:** document that `Restored` means "a new incarnation" (a reload, or a return after the
  actor ended within the Runtime), not only a reload; fix the upload fixture that maps it to "the bytes are gone".
- **15, context while away:** on restore, deliver one `onContext` if the provider's slot changed since capture.
- `SendTargetAbsent` reasons: `NoRecord` **replaces** `NotPersisted` (still three with `RecordUndecodable` and
  `NotAdopted`).
- Local actors keep React O3 (now sharing the same 100 ms grace).

## Improvements (accepted; no new API)

1. A `flow check` info: a schedule whose event leads to a write in a machine that is not persisted ("lost if the screen
   unmounts first"); for a persisted machine, "delayed until the next open". Use the graph analysis v3 designed (all
   arming paths: entry, `armOn`, `restartOn`, keyed `keys`, `.each` copies, subroutine entry), to warn, never to keep
   an actor alive.
2. A documented recipe: commit the draft on the way out (a Close event that commits before the screen leaves).
3. Inspection's decided `uses` field shows exactly why an actor is alive: uses by kind, and the in-flight writes.
4. `revisit.md`: a "you are being let go" signal to the actor (the real fix for a debounced save on a route change); new
   API, so deferred.

## Stated limits (accepted)

Autosave inside its debounce: persisted, it fires on the next open or reload (late, not lost); not persisted, lost.
Reactions while away appear on return, or never for a non-persisted actor. A non-persisted actor hidden longer than the
grace (Suspense fallback, React Activity) starts fresh. Multi-tab follower uses need browser tests. Restore cost is not
measured.

## Decided earlier (keep)

`retain` removed (OD27); OD27's public API round (a host `ensureActor` is not a use by itself; handles get no
`release()`; host code keeps an actor with a `snapshots` subscription; no keep-alive API; Inspection's `uses`; the grace
internal); explicit `disposeActor`/`forget` unchanged; identity is folded into input (OD30,
`workflow/plans/flow/references/proposals/actor-identity/proposal.md`); `Flow.ignore` (OD28): an ignored unknown is not
in flight; a handler's `target` may be omitted (decision 3 B in `proposals/absorb-wiring/absorb-wiring-proposal.md`).
machine-design.md is the main proposal; the result merges there first, plans later.

## Prior art to reuse

`proposal-v3.md` (its send table, dehydrate handling, Stories rewrite, memory table and its replacement-text structure)
and its review findings: H3 (host race, closed by fix 1), H4 (fix 7), M1 (decision 14), M3 (decision 15), M4 (decision
13), M5 and M6 (fixes 9 and 8). v3's derivation of "leads to work" survives only as improvement 1.

## Produce

`proposal-v4.md` beside this brief, "Status: ACCEPTED in principle; text for review": the rule in full; every public
API change (expected: none beyond `detach`, `NoRecord`, Stories' `ensure`/`dispose` meanings); an actor-state table
(what each holds, what frees it); leaks; before/after for the editor's autosave, the checkout in 3-D Secure (and the
chained confirm), presence, the queue on a server page, a toast, a local actor and a Story; the exact replacement text
for MD (rule 73, section 2.7.17, rule 44, the Stories lines, OD27's addendum or a new OD, C rows, and the `flow check`
finding's name); the suite changes (the 22 busy-dispose cases, the harness, new cases including the in-flight
exception, the grace, restore at ready, dehydrate, every send row, handle following identity, the records cliff, context
on restore); an issue-by-issue table covering every issue in `brief-runtime-owned.md` and both reviews of v2 and v3;
open questions only if something is genuinely unsettled; limits.
