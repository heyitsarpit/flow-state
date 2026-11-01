# Review 2 of merge 6, streams, revision 2 (2026-10-31)

Two independent Sonnet reviews: correctness, and ten cases written as real code (adapters type-checked against Effect
4.0.5; the chat adapter run under `TestClock` against a scripted socket; scratch in the session scratchpad,
`streams-review-2/`). Verdict from both: root causes C1, C2, C3 and C5 hold; C4 (watermark) and C6 (bounds) only partly;
fixes are local, no redesign.

## High

1. **The reconnect budget resets at every open,** so a server that accepts then drops (a draining load balancer)
   loops forever at 500 ms, each cycle a catch-up read or a `listen` refetch. Reset only after a minimum time up
   (R2.3 B, default about 10 s); `connect` cannot see the counter itself.
2. **The watermark doesn't discharge reliably.** A catch-up returning a partial or empty page moves to SYNCED with
   messages held above `through`; a late `CaughtUp` from the old epoch writes the old epoch back; "never past a hole"
   holds only for dense integer seq; a reload mid-catch-up leaves CATCHING_UP stuck (the read doesn't resume and the
   server honestly says `resumed`); `from` ignores a `gap(Reset)` claim, so every quiet reconnect gaps again. Fix:
   state rule 45 as "freeze on a delivered gap, unfreeze on a discharging catch-up" with a `pendingGap`/`owed` field;
   ignore `CaughtUp` from another epoch; leave CATCHING_UP only when contiguous; let a claim update the position.
   The ~110-line chat recipe should ship as a reusable piece.
3. **An extra claim inside an open connection is ignored,** which fails open on `every` (an SDK that reconnects and
   reports `open()` without `down` loses missed deletions). On `every`, treat it as an implicit `down` plus a new
   connection; ignore it only on `latest`.
4. **Releasing a Live `listen` session leaves answers fresh** forever: mark covered answers stale on release.
5. **Bounds are Flow-owned only on `Session.push`.** `Socket.fromWebSocket` buffers without limit unless `highWaterMark`
   is set (`effect/src/socket/Socket.ts`); never-evicted signals from a flapping SDK grow without bound. Give
   `Session.reconnect` a `capacity` too, and coalesce adjacent `down`/claim pairs with no value between them.
6. **The typed lane can't be read as written:** `connection` is missing on `Complete`/`Failure`/`Defect`, so every
   example guard fails to compile; and `show(lane.connection === "Live" ? lane.data : lane.lastKnown)` still renders
   stale as fresh. Give every variant `connection`, and wrap `lastKnown` as `Stale<A> = { value, since }`.
7. **No right moment for the claim on SDKs without a subscribe acknowledgement** (`graphql-ws`, from memory): claim
   only after the server registered the subscription; give a barrier recipe.
8. **Feeds with no read endpoint and no `hello`** (SSE, notifications) can never discharge `Unproven`: each restart
   gaps again. Allow `contiguous` proof on `every` (R2.2 B), or treat a session started from a watermark whose first
   value is `after + 1` as continuous.

## Medium

- `latest` can stay dimmed forever: a push-on-change source never reaches Live; `resumed` on `latest` should make
  `lastKnown` live; equality suppression can keep a reconnect Opening. Let `open()` carry the current value.
- Freshness still leaks through the mapper: a cached value delivered as an ordinary `value` event is shown as fresh
  from memory. Use `Session.cached(v)` or a separate outcome.
- Values before a claim break "a gap precedes the connection's values": `Session.push` holds them behind the claim.
- Page wake: a backgrounded page shows a 10-minute-old price as Live until a timer fires; every adapter hand-wires a
  wake probe. Add `restartOn: Session.wake` and Story controls `background({ for })` and `wake`.
- `publish`: nothing at activity end (ghost cursors), restored state republished, a turn per move at 30 Hz.
- `progress(v)` returns an Effect, awkward from DOM callbacks: add `progress.sync(v)`.
- Stories can't yet withhold a `hello`, hold a catch-up response, reorder frames, or background a page.
- Out-of-sync chat has no automatic exit; `held` is never pruned.

## Low

`new SignedOut({})` and `Stream.scan(new Set())` don't compile; `ExtraClaim` fires on normal Firestore snapshots;
`ConnectionEnded` is unreachable on the WebSocket path; `Session.push.end()` and `Session.reconnect`'s clean end are
inconsistent.

## Authoring

More complete, not simpler: the chat machine went from 17 to about 110 lines. Cut `Emit` to `emit`/`fail`/`end`,
default `capacity` (1000 for `every`, 1 for `latest`), drop `publishes`, replace mapper `live` with `Session.cached`.
Most common mistake: `emit.down(...)` with no matching claim afterwards (a value after `down` should imply an unproven
`open()`). Most dangerous: a bare `Session.resumed()` with no evidence; require a witness.
