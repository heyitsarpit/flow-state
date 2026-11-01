# Review 1 of merge 6, streams (2026-10-31)

Two independent Sonnet reviews: correctness against the merged design and merges 3–5, and eight real cases written in
the API (adapters for five of them type-check against Effect 4.0.5; scratch copies in the session scratchpad,
`streams-review/`). The main session verified that `Schedule.both` does not exist in Effect 4.0.5 (`Schedule.max`
does, `node_modules/effect/src/Schedule.ts:856`).

## High

1. **A quiet connection never opens.** `Session.reconnect` emits `open()` only before a connection's first element,
   so a reconnected but silent socket stays Down or Opening, the `listen` frontier is never lowered, and a record
   deleted while down stays shown. Fix: emit `open()` when `connect` succeeds (make it an Effect of the stream).
2. **`latest` data looks fresh when it isn't.** After a reconnect the lane is Open with the old connection's data until
   the first frame; a quiet ticker shows an old price as live forever. Fix: for `latest`, Open only after a value
   since the last open, Opening until then. Most common author mistake: rendering `data` while not Open; type the lane
   as a union so `data` exists only when live (`lastKnown` otherwise).
3. **Continuity is claimed too generously.** An adapter that re-opens silently produces no gap (state it as an adapter
   obligation; flag `every` streams with no signals); a "starts with a full snapshot" counts as `resumed`, which loses
   missed facts on an `every` feed (snapshot is `resumed` only for `latest`).
4. **The chat recipe loses messages.** `lastSeq` is the highest seq held and also the resume parameter: after a gap, a
   live message beyond it advances `lastSeq`, a failed catch-up goes to `self`, and the next session resumes past the
   hole with no gap. A server reset below `lastSeq` drops every new message as seen. Fix: a contiguous watermark as the
   resume parameter, a retry state for a failed catch-up, and dedup on epoch plus seq; state it as a rule.
5. **Persistence contradicts rule 39.** After a reload, Persistence suppresses a `value` equal to the last, which drops
   a repeated message on an `every` stream. Scope PER:35-38 to resources and `latest` streams.
6. **Buffers and overflow are per adapter and untestable.** Every push adapter re-implements the overflow-to-gap
   protocol; a sliding queue can evict a `down` signal; Story fakes replace the whole service, so slow consumers and
   overflow paths are never exercised. Fix: ship `Session.push(register, { capacity })` with a never-evicted signal
   channel, overflow to gap for `every`, sliding for `latest`; fake at the transport layer, below the adapter.
7. **Outbound ephemeral sends have no home** (a cursor at 30 Hz): either a documented fire-and-forget write (no ending
   turn, no lane row) or one sentence putting it out of scope.

## Medium

- A `listen` session that ends or sits Down leaves answers fresh: its ending must mark them stale, and `failure` must
  be mapped for `listen`.
- A clean server close ends a feed silently (completion is not retried): treat completion as a drop in the
  combinator, or require `complete` mapped on `every`.
- Progress cleared at the wrong moment under `latest`: a superseded Attempt's ending wipes the new one's progress;
  store progress per Attempt.
- Signal semantics: `open` while Open is a no-op; the first signal of a connection wins; define `Opened` versus
  `Reconnected`.
- Rule 8 and the mailbox cap are only partly amended; release and restart can race (Supabase's async remove);
  `Stream.callback` defaults to an unbounded buffer.
- SSE cannot prove continuity before the first value: give `Session.reconnect` a `contiguous: (last, first) => boolean`
  hook; `EventSource` can't send `Last-Event-ID` or expose `retry:`.
- `Schedule.both` doesn't exist (use `Schedule.max`); say whether the retry budget resets after a successful
  connection.
- `Stream.timeout` ends a stream silently: a deadline must fail explicitly.
- Adapters must sleep through `Effect.sleep`, not `Date.now`, so Stories can drive heartbeats.
- Retry after Stop on an LLM answer under `reject` is unstated; reload spelling in Stories is guessed.
- Staleness of a quiet feed needs a recipe: `asOf` in the value plus a `quiet` schedule.

## Conflicts with operations-in-definition

Stream declarations, `DuplicateSession`/`DuplicateListen` identity ("descriptor and key"), `s.calls` rows keyed by
operation path, `progress` reads and the required-mapping checks are all written against module-level descriptors;
they change if declarations move onto the definition.
