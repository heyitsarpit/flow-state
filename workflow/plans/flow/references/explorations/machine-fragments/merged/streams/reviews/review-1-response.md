# Response to review 1 of merge 6 (revision 2, 2026-10-31)

Every finding in [review-1.md](review-1.md), the root cause behind it (proposal section 0, C1–C7), and where revision
2 resolves it. "§" refers to [../proposal.md](../proposal.md). Nothing here is accepted; the two superseding decisions
are proposed as M6-D8 and M6-D9 (§10).

## High

| # | Finding | Cause | Resolution | Where |
| --- | --- | --- | --- | --- |
| H1 | A quiet connection never opens | C1 | Every connection starts with a claim made when its transport opens. `Session.reconnect`'s `connect` returns the opened connection `{ claim, values }`, so a quiet connection opens at the claim (M6-D8). A `listen` therefore lowers its frontier on the rejoin, and the deleted record leaves | §4.1.2, §4.1.3, rule 40, rule 43; walks §7.1 step 4, §7.6 |
| H2 | `latest` data looks fresh when it isn't; authors render `data` while not open | C2 | The lane is typed: `data` exists only while `connection === "Live"`. A `latest` lane is `Live` only after a value on the current connection, and holds `lastKnown` otherwise. An `every` lane has no data (M6-D9). Rendering a stale value as current is a type error | §4.1.5; §7.2, §7.3; open question R1.1 |
| H3 | Continuity claimed too generously: silent re-opens; a full snapshot counted as `resumed` on `every` | C3 | `resumed` means every fact after the connection's start position follows, in order. A snapshot is a `gap` on `every`, and claims carry no continuity on `latest`. Only an in-band server answer proves continuity. A silent re-open is an adapter defect: both constructors make the claim structural, and Inspection reports `NoClaims` | §4.1.4, rule 41, §6.4 Inspection |
| H4 | The chat recipe loses messages: highest-seen cursor, a forgotten failed catch-up, a server reset below `lastSeq` | C4 | Rule 45: a resume parameter is a watermark that never passes a hole. A gap is an obligation discharged only by a successful catch-up (waiting states with a budget). Positions are scoped by epoch, a reset is `gap(Reset { epoch })`, and dedup is by `(epoch, seq)` | §4.3.2, rule 45; §7.1 (`hold`, CATCHING_UP, CATCH_UP_WAIT, OUT_OF_SYNC) |
| H5 | Persistence suppresses equal values on `every` | C5 | The equality baseline after a restore applies to resources and `latest` streams only; `every` has none | rules 39, 51; §4.5 restore row; §6.4 Persistence |
| H6 | Per-adapter buffers and overflow; a sliding queue evicting `down`; Story fakes skip the adapter | C6 | `Session.push(register, { capacity })`: bounded, loss becomes `Overflow { lost }` at the loss point, and signals are never evicted. Adapters are written over a transport service (`Socket.WebSocketConstructor`, an SDK subset), and Stories fake only that service | §4.1.6, rule 52; §7.0; §7.7.3, §7.7.4 |
| H7 | Outbound ephemeral sends have no home | C7 | `publish`: latest-wins state an activity carries on its session, re-sent on every connection, with no Attempt or ending. Proposed, with "out of scope" as the alternative | §4.1.9, rule 53, §7.8; open question R2.1 |

## Medium

| Finding | Cause | Resolution | Where |
| --- | --- | --- | --- |
| A `listen` that ends or sits down leaves answers fresh; `failure` must be mapped for `listen` | C5 | Stale cause `listen` while the session is not `Live` or has ended. `resumed` withdraws it, a gap lowers frontiers, and a release turns it into ordinary staleness. `failure` and `complete` are required on a `listen` activity | §4.2 table, rules 49, 50; §7.6 |
| A clean server close ends a feed | C5 | A connection's clean end is offered to `while` as `ConnectionEnded`, and `complete` is required on `every` | §4.1.3, rule 43, rule 50; A21 |
| A superseded Attempt's ending wipes the new one's progress | C5 | Progress is stored per Attempt; an ending clears only its own | §4.1.10, rule 48; §10 note on M6-D5 |
| Signal semantics: `open` while open, the first signal of a connection, `Opened` vs `Reconnected` | C1 | The grammar: one claim per connection, an extra claim ignored with `ExtraClaim` evidence. `Opened` is the session's first connection, `Reconnected` any later one | §4.1.2, rule 40 |
| Rule 8 and the mailbox cap only partly amended | C5 | Deliveries are bounded by sessions (one waiting each), never count against the 1,024 cap, and are never dropped except a released session's at admission | §4.3.3, rule 46; §6.4 machine-design rule 8 |
| Release and restart can race (Supabase's async remove) | C5 | A new session for the same activity and key starts after the previous session's finalizers finish, within the disposal bound. `emit` is disabled after release | §4.3.3, rule 44; §7.7.3 |
| `Stream.callback` defaults to an unbounded buffer | C6 | `Session.push` requires `capacity`; rule 52 requires every push source to be bounded and to report loss | §4.1.6, rule 52 |
| SSE cannot prove continuity before the first value; `EventSource` cannot send `Last-Event-ID` or expose `retry:` | C3 | The proof is the server's in-band `hello`. The watermark goes in the URL of a new `EventSource`. The browser's own retry is outside the adapter's view and stated. A `contiguous` hook is open question R2.2 | §7.7.5; R2.2 |
| `Schedule.both` does not exist; whether the retry budget resets is unstated | (example error) | `Schedule.max([Schedule.exponential(…), Schedule.recurs(8)])` (EFX `Schedule.ts:856`); the schedule restarts at every open | §4.1.1, §4.1.3; R2.3 |
| `Stream.timeout` ends a stream silently | C5 | Deadlines fail: `Stream.timeoutOrElse` / `Effect.timeoutOrElse` with an error | §4.1.7, §4.1.10, rule 42 |
| Adapters use `Date.now` | C6 | Adapter time is Effect's `Clock`; heartbeats and deadlines are written with `Effect.sleep` and `timeoutOrElse` | rule 52; §4.1.1 |
| Retry after Stop under `reject` unstated; reload spelling in Stories guessed | C5 | After Stop's ending is admitted, a new start is admitted (a new Attempt); `retry` only where the server dedups. Reloads use M3's `closeTab` / `openTab` (M3:621-622) | §4.1.10, §7.4; §7.0 |
| A quiet feed's staleness needs a recipe | C2 | `asOf` from the source in each value (it also keeps equal prices from being silenced), and a `quiet` schedule armed on each value | §4.3.5, §7.3 |

## Conflicts with operations-in-definition

| Finding | Resolution | Where |
| --- | --- | --- |
| Declarations, duplicate identities, `s.calls` rows, progress reads and required mappings are written against module-level descriptors | The design does not depend on where declarations live; §11 lists each spelling that changes under OID (sites, `s.operations`, `DuplicatePlacement`, mappings checked at the site) | §11 |

## Not taken from the reviews

- **"Open only after a value since the last open" for every kind** (H2's first proposal). It is taken for `latest`
  only: an `every` feed is live from its claim, because its facts are not a displayed value (A18).
- **A fire-and-forget transaction for outbound sends** (H7 option a). Rejected for `publish` (A23).
