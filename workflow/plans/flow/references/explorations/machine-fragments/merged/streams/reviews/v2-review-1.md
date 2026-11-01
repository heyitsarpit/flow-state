# Review 1 of proposal-v2 (revision 2): correctness and integration

Status: **advice to the owner, not a decision.** Reviewed against `brief.md` (DG1-DG5, SR1-SR40, K1-K19, M6-D1-D7,
FC1-FC81, IP1-IP29), `machine-design.md` (MD) rules 8, 13-15, 20-25, 29-32, 37, 39-47, OD1-OD26 and the plans. Method:
read the whole proposal; walk every table cell of 3.1-3.4 against the prose; walk the six claimed-met FCs and every
partial or cost FC; check Effect 4.0.5 signatures the proposal relies on (`Schedule.upTo`, `Stream.paginate`,
`Stream.timeoutOrElse`, `Socket.readerString`, `Stream.fromEffectRepeat` all exist; `upTo({ times })` gives one more
evaluation than `times`, consistent with I12). Nothing was compiled or run, so every finding below is a reading of the
tables; the first action in the verdict is to run them.

## 1. Verdict

**Sound design, not yet acceptable as written: 3 High findings, all fixable by local table and rule edits, none needing a
redesign.** The core idea (a connection the adapter narrates, one session table, adapter-side repair, a position in
machine memory) survives every abstract test I applied: it needs no per-source concept, the common tier is small, and
the conservative defaults are mostly right. The three Highs are exactly where hand-written tables disagree with the
prose or with each other, which is what the brief's section 9 predicts. The work to do before acceptance is the
executable model the proposal itself asks for, with three more mutants (below), and the edits in section 3.

Of the six FCs revision 2 now claims to meet: **FC64 holds; FC35 holds for dense ids; FC54 holds only after an explicit
`Feed.down`; FC53 is only met where the server attests; FC42 holds only if the author honours an undocumented
precondition; FC23 holds except for the High below.** FC43 and FC22 (listed as met) are broken by the same High.

## 2. Root causes

| RC | Root cause | Findings | Fix |
| --- | --- | --- | --- |
| RC1 | The section 3 tables were written by hand and never run; 3.4 contradicts its own invariants (I18, I21) and leaves variables undefined (`liveSince`, position equality, `undefined` positions). | H1, M3, M4, M5, L2, L3 | Build the model now (CMP's `model.py` plus 3.4). Add mutants: buffer emitted on abandonment; stale `liveSince`; value discarded then proof; `undefined` position equal to `undefined`. State equality of positions once. |
| RC2 | One bit, `Live`, serves two audiences: "the server registered me" (composer, row) and "I am complete" (`listen` freshness, a user trusting the list). The catch-up proof is emitted at the start and treated as final by Flow. | M1, M2 (Q16) | Keep `Live` for registration. Let `Feed.reconnect` tell Flow's session when the catch-up completes (the channel Inspection already uses) and make `listen` freshness and the "proven" evidence follow completion. No new author word. |
| RC3 | The machine's view of a state feed (`heard`, advanced only by delivered values) and the row's view (`last`, `confirmed`) are updated by different paths with no reconciliation point. | H2, M7 | One rule: whenever `last` becomes current by any path (value, proof, discard recovery), compare it to `heard` and slot it if different. |
| RC4 | A fact feed with nothing mapped is unspecified: the row has no `value`, no loss indicator, and `missed` is "required when `value` is mapped". | H3 | Make a fact feed with no `value` mapping a type error, or give the row a loss flag. |
| RC5 | Time is under-specified: which clock `at` uses, what it means for a cached value, what crosses SSR and reload, and what a deadline does across sleep. | M6, M8 | Define `at` once; stamp a post-drop value with the drop moment; transfer ages, not instants; state the wake window honestly. |
| RC6 | Wiring every app of a kind writes the same way is still in author code (open-items 15). | section 7 | Absorb the first five in section 7. |

## 3. Findings

Severity: **High** = silent loss or silent wrong state reachable from the documented examples or tables. **Medium** =
fails closed but wrongly, a documented claim that does not hold, or a cost the common tier pays unstated. **Low** =
spelling, spec ambiguity, limits to state.

**Count of High findings: 3.**

### High

**H1. An SDK's own `Feed.down` during a catch-up emits the buffer past the hole (silent permanent loss).** Table 3.4,
row "inner `Feed.down(r)`", column `CatchingUp`: "interrupt the page read; proof *abandoned*; emit `buffer`, then
it". The buffer holds live facts that arrived after the catch-up started; the pages that should precede them are
unfinished. Flow's session has already been told `Feed.live({ proof: "catch-up from <from>" })`, so it believes the
answer is proven. Emitting the buffer sets `last` to the newest buffered position (pass-through rule), so the reconnect
that follows resumes from past the hole, and the machine's cursor passes it too (it advances on each handled fact).
Scenario: a Supabase-like adapter with `catchUp` where the author emits `Feed.down` from the SDK's status callback
(the 4.7 Firestore sample does exactly this with `Feed.down`). Offline 10 minutes, 300 messages missed. Reconnect;
catch-up reads page 1 of 3; the SDK reports `CLOSED` through `Feed.down` (not through `fail`); the buffer (12 live
messages) is emitted as facts, no `missed`, `last` = message 312; the next connection asks from 312. Messages 2-300
are never shown and nothing reported them. This contradicts R-Position, I4, I5, I18, I21 and the claims for FC22, FC42
and FC43. Row 556 (a failure) correctly discards the buffer ("none of it was emitted"); the `Feed.down` row copies the
reset row instead. The wording of I18 ("or before the connection ends") reads as permitting it, so the model would not
catch it as written.
*Fix.* In `CatchingUp`, inner `Feed.down` behaves like row 556: abandon the proof, discard the buffer, emit the `down`,
go to `Connecting`. Reword I18 to "no buffered value is emitted unless the catch-up completed". Add the mutant "buffer
emitted on abandonment".

**H2. A state value Flow has shown as current can be one the machine never hears (silent divergence).** Two paths:
(a) 3.2's admission rule discards a queued state delivery when `st != Live` or `slotConn != conn`, but `heard` is not
changed and `last` already holds the value; (b) 3.1, `Dropped` + `Feed.live({ proof })` sets `confirmed = true` and
`last.at`, but never offers `last.value` to the slot. After (a) and then (b), or (a) and then a `Feed.live()` plus an
equal value (that one slots correctly because it is compared to `heard`, so only the proof path fails), the row shows
`value = v1` current while the machine's last heard value is `v0` and no event will ever arrive until the source
changes again. Scenario: the ticker with an alert at 100. The price is 99 (heard). A tick 105 arrives, the slot is set,
a drop happens before the mailbox admits it, admission discards it (SR21, correct). The adapter reconnects with
`from = version(105)`; the server attests "your version is still current" (`Feed.live({ proof })`). The row shows 105
current and undimmed; the alert never fires and the machine's `memory` still says 99. Push-on-change sources, the only
ones that can attest, send nothing further. Same shape for any guard that reads state memory. This is the "stale as
current" failure SR21 exists to prevent, in the machine instead of the view.
*Fix.* RC3's rule: when `confirmed` becomes true by proof, or a value is re-confirmed, if `last.value` differs from
`heard` then slot it at the current `conn` and deliver. Add the mutant "value discarded then proof" and invariant "row
`value` defined and different from `heard` implies a delivery is queued".

**H3. A fact feed with no `value` mapping fails open (silent skipping), and removing the mapping removes the check.**
2.6 gives fact feeds a `last` and no `value`; 2.7 requires `missed` only "when `value` is mapped" and `failure` only
"when anything is mapped"; K3 says a bare stream's data is its row. So a fact feed consumed only by a view is
allowed: the row publishes once per Runtime publication (SR3's rule, applied to a fact feed), a view sees only the
newest fact, every intermediate fact is invisible, and no field says anything was missed. SR1's test ("the same
stream consumed by a view only, by a mapped machine and by `listen` delivers the same values with the same skipping")
fails, and FC3 (the exact scenario: remove the machine's `value` mapping to show the feed only in a view) is answered
only for equality, not for skipping or loss. Scenario: a notifications feed mapped to a machine counts the bell. A
refactor moves the count into the view, the `value` mapping is deleted, `FeedUnhandled` stops firing (nothing is
mapped), and the bell now counts at most one notification per publication with no warning.
*Fix.* Prefer a type error: a `delivers: "facts"` stream's operation must map `value` and `missed` (or be placed by
`listen`). If the owner wants view-only fact feeds, the row needs a bounded, ordered recent list and a loss flag, which
is more concept; the type error is cheaper and stays honest. `flow check` row: `FactFeedUnmapped`.

### Medium

**M1. The catch-up proof is optimistic: Flow treats the session as proven while the repair is pending.** `Feed.live(
{ proof: "catch-up from <from>" })` is emitted before the first page (3.4). Flow's 3.1 says "answer proven" and 2.8
says a proof withdraws the `feedDown` staleness. Consequences: (a) a `listen` list reads fresh while catch-up pages
(which carry the deletes) have not arrived or keep failing (retries run up to the schedule with the socket open, minutes
for 8 steps of exponential from 500 ms); (b) a user sees "Live" with no sign of a known gap, because Q16 A hides the
phase from the row; (c) it contradicts R-Live's own sentence "anything not proven is delivered as `missed`" and SR6
("nothing missed may be reported only on a proof"). Nothing is lost permanently (a failed catch-up drops the
connection and repeats), so Medium. *Fix* is RC2. Related: `catchUp` over a *state read* (a list) cannot carry
tombstones, so a catch-up proof on a `listen` feed claims continuity about deletes it cannot see (FC5, FC19 again).
State in the docs that `catchUp` must return a change log including deletes, and that `listen` feeds should leave
repair to the domain.

**M2. `catchUp` never runs for a connection that starts with a value (the hello-less socket).** 3.4: inner
`Feed.live()` with `catchUp` and `last` defined enters `CatchingUp`; but inner value with `signalled = false` emits the
implicit `Feed.live()` and goes straight to `Live`, no catch-up. So a plain socket with no greeting (the case where
there is no server replay and a catch-up is needed) reports `missed Unproven` for the hole and never repairs it, and
`last` then passes the hole. Reported, so not silent, but `catchUp` is unusable on exactly the sources that need it.
A later `Feed.live()` (Supabase `SUBSCRIBED` after a change) then starts a catch-up after the `missed` was already
delivered. *Fix.* Treat the implicit live like an inner unproven `Feed.live()`: hold the first value in the buffer,
enter `CatchingUp`.

**M3. `liveSince` is not cleared on `connect`, so a never-live connection can restore the budget (FC41 variant).** 3.4
row "inner fails ... `Connecting`": "if `now - liveSince >= resetAfter` (a live connection only) reset `n`". `liveSince`
is set at a live signal and cancelled only by an inner `Feed.down`; "reconnect delay elapsed" does not clear it.
Connection 1 is live 5 minutes and drops; connection 2 hangs in `Connecting` for 100 s (slow handshake, dead route)
and fails: `now - liveSince` is about 400 s, the budget resets, so a route that never reconnects never exhausts its
budget. *Fix.* Clear `liveSince` on every `connect` and on every failure; the reset test reads only a `liveSince` set on
this connection. Add the mutant.

**M4. Position equality and `undefined` positions are unspecified; the catch-up dedupe can drop real facts and holds
all page positions.** (a) "dropping those whose position equals one the pages returned": `position` returns structured
values (`{ epoch, seq }`) in the headline sample; equality is not stated (Effect `Equal` on plain objects is
reference-based unless the value is a `Data`/Schema class). If it is reference equality, dedupe never fires and every
overlap is duplicated (acceptable, at-least-once); if `undefined` equals `undefined`, a buffered fact with no position
is dropped because a page value had none (the 4.7 polling recipe returns `undefined` for most events), which is silent
loss. (b) `pageSet` accumulates every page position: a laptop closed for a week, 100,000 messages, is 100,000 retained
positions, unbounded memory against SR18. *Fix.* Positions compare by Schema equivalence of the contract's position
type; `undefined` never equals anything; invert the structure: index the *buffer's* positions (at most 1,024) and
remove matches as pages stream past, so memory is bounded by the buffer.

**M5. "Complete" is not linearized with registration, and the idiomatic pager shape invites the wrong `none`.** FC42's
fix is "the author returns `none` only from the server's own completeness field". Two preconditions are missing: the
read that said complete must have started after the server registered the connection (FC51), and its snapshot must not
lag the live path (a read replica behind the socket's primary produces a hole between the page's snapshot and the first
buffered live message, silently, with proof recorded as *complete*). And the `Stream.paginate` step shape (Q15 A) is
the shape where `Option.fromNullable(p.nextCursor)` or `p.items.length < pageSize ? none : some` is the natural line;
the short-page idiom is exactly the FC42 mistake. Also an empty page with a `next` equal to the cursor at the head of
the log loops forever (the pager polls); the buffer overflow ends it, by accident. *Fix.* State the precondition in the
docs and in `Feed.reconnect`'s doc comment; add a page-count or elapsed bound that ends a catch-up as a failed
connection rather than relying on buffer overflow.

**M6. A value that arrives after `Feed.down` is stamped with the arrival time, so a cached value shows a fresh age.**
3.1, `Dropped` + value: `last = { v, now, conn, own }`. `Last.at` is defined as "the last moment Flow knew it was
current" (2.6), but a cached value is not known current. The Firestore sample's offline snapshot from the morning would
render dimmed "as of 1 second ago". SR20 and FC15 ask for the age to be true. *Fix.* In `Dropped` keep `last.at` as the
drop moment when the new value replaces `last` (or carry the source's own time if the contract names one). Mutant:
"cached value ages from arrival".

**M7. First connection of a fact feed reports `missed Unproven`, so every plain feed shows a loss notice at every open
(and every SSR render).** 3.1: `Opening` + `Feed.live()` (and a plain Stream's first value) on facts delivers `missed
Unproven`. The brief says the first connection counts, so this follows the requirement, but with `from` undefined there
is nothing to have missed, the handler cannot tell a first start from a reconnect (`why` has no `Start`), and the
sample's explicit-acceptance handler writes "Some messages could not be recovered" into memory, which then persists and
is server-rendered. Common-tier cost, trains users to ignore the notice, and makes `missed` noise. *Fix.* Add a `Start`
literal to `why` (a literal, not a word) so the one-line handler can ignore it, and have `Feed.reconnect` emit
`Feed.live()` with an internal "origin" mark when `from` is undefined and nothing was passed yet so Flow can label it.
The sample machine should show the ignore.

**M8. The wake and half-open claims (FC56, FC81, SR23) are stronger than the platform allows.** 4.3 and the lifecycle
row say the overdue deadline "fires on wake within one event-loop tick". `Stream.timeoutOrElse` is per-pull and runs on
`Effect.sleep`, i.e. `setTimeout`. After a system sleep many browsers' monotonic timers do not count the sleep, so a
25-second idle deadline fires up to 25 s after wake (and background-tab throttling adds more). The window is "the
deadline" not "one tick", and SR23 asks for a stated window. No wake signal (`visibilitychange`, `pageshow`, `online`)
is used. Also, because Flow pulls only when `inFlight = none`, the deadline is paused while a turn runs (harmless, but
unstated). *Fix.* State the window as the idle deadline; document a recipe that races the deadline with a
`visibilitychange` stream in the adapter; mark FC56 and FC81 "met within the deadline".

**M9. Machine-level reopen in the headline sample reintroduces FC41 one layer up.** 4.1 `Message` handler writes
`reopenInMs: 1000` on every fact. A flapping server that replays one message before dropping resets the machine's
backoff each cycle: the session ends (budget gone), `FeedEnded` doubles to 2000, the next session gets one message,
`reopenInMs` returns to 1000, forever at about 1 s with a catch-up read each cycle. The walk's step 4 claims the
doubling holds. This is wiring every chat repeats (section 7) and an instance of the same mistake `resetAfter` exists
to prevent. *Fix.* Absorb machine-level reopen (section 7) or reset only after a stated healthy period.

**M10. A permanently ended `subscribe.each` key has no re-open path, and the sample destroys the user's data.** 4.3
`QuoteEnded` removes the symbol from `watchlist` (the user's list) after the budget (12 exponential steps from 500 ms,
well over an hour) is exhausted; moving it to `ended` leaves nothing that re-adds it. A network outage longer than the
budget silently empties the watchlist (and persists that). K15 bans `armOn` on keyed schedules, so the machine cannot
cheaply write a per-key reopen. Common-tier (ticker) case with no correct short handler. *Fix.* Keep ended keys in a
separate memory set and show them "ended"; provide a per-key reopen recipe, or absorb it (section 7). Also state
`subscribe.each`'s cap: K4 gives no `max`, and 5,000 keys are 5,000 `Feed.reconnect` instances.

**M11. Row/machine mismatch risk when `catchUp` pages arrive while the composer is enabled.** Q16 A means a user can
send during a catch-up; the post echoes back through the feed (fact with the server cursor). If a page contains the
echoed message and the buffer also contains it, dedupe depends on M4. If the author's `upsert` is by `clientId` vs
`id`, a duplicate entry appears. Low in isolation; listed because it multiplies M4. (Cost stated, no fix beyond M4.)

**M12. The S4 resume position cannot be maintained for `listen` feeds.** `listen` pushes are applied at arrival and
never reach a machine turn (2.8), so a machine's `memory.cursor` is never advanced by them. A replay-capable `listen`
feed (Electric offset, Supabase with a log) therefore resumes only within a session (`Feed.reconnect`'s `last`); every
new session (leaving the screen, `PushEnded` retry) starts unproven and costs a refetch. Fine for correctness, but
"proof" is unreachable across sessions for `listen`, FC48 and FC69's cost applies even to a perfect server, and the
document says nothing. State it, or let the domain own the position for `listen` entries.

**M13. Evidence retention is unspecified (SR18).** "Repeated status changes cost bounded memory" holds for the queue,
but Inspection's per-session evidence (`Discarded`, drops, `Overflow`, `UnprovenValues` counts) has no stated
retention. A flapping SDK for a day writes unbounded evidence. State a ring buffer and counters.

**M14. `at` is an instant, and it crosses clocks.** `last.at` is "Runtime Clock ms". It is persisted (reload), handed over
(leader tab) and transferred by SSR (server clock to client clock). Server-to-browser skew shows ages that are negative
or minutes off ("as of -3 s ago"); a monotonic Runtime Clock would be meaningless after reload. FC15, FC75 and FC78 are
claimed met. *Fix.* Define `at` as epoch ms from the Runtime's wall `Clock`, and transfer an *age at capture* so the
client rebases it on its own clock.

### Low

**L1. Hydration costs a refetch for every `listen`-covered answer.** SSR transfers answers read on the server; the
client's first session is an unproven start, which lowers "every answer whose read started before this moment", so each
hydrated list refetches once (FC13's rule applied to SSR). Correct and conservative; state it as a cost beside FC69.

**L2. 3.1 and the row disagree on `value` for fact rows.** The `FeedRow` union gives `Connecting`/`Live` rows a `value`
field while 2.6 says fact rows have none (a type error). Make the type conditional on `delivers` in the written type.

**L3. Ambiguities a model will trip on.** (a) `Live` + `Feed.live({ proof })` on a state feed: does it re-confirm
(Q17)? 3.1 says "answer proven" only. (b) 3.4's `Connecting` + inner `Feed.live({ lost })` with `catchUp` falls into
the "no catchUp or last undefined" row, but `lost` without `restartAt` is also listed as starting a catch-up in the
row above it; the two rows overlap. (c) `Feed.callback` after `Feed.Overflow` outside `Feed.reconnect` fails the session
with `Overflow`: the failure record must name it; state the type of `E`. (d) The setter `progress(p)` on a schema
mismatch is unspecified (defect, evidence, or ignored?).

**L4. FC9 for SSE.** `EventSource` hides the status code, so a 401 is indistinguishable from a blip; the SSE sample
retries until the budget ends as `SseDropped`, not `SignedOut`. Document that SSE needs a `fetch` pre-flight to classify.

**L5. FC1 and FC25 hold for Flow, but at-least-once (R-Position) cannot be survived by an identity-less fact.** Two
"sync now" notifications with no id are indistinguishable from a replay of one. The stated limit ("two facts that share
an identity are one fact") covers equal ids, not the absence of an id. The common notifications case deserves the
sentence: identity-less facts need a source-provided position as identity.

**L6. `ReleaseOverdue` past 5 s starts a second session while the first is still closing.** The old session's `emit`
reaches nothing, but the SDK may still hold the topic (FC33 recurs past the bound). Stated as an issue; also say the
successor's row stays `Connecting` with `drop: undefined` for up to 5 s, which the banner shows as "Connecting…".

**L7. The explain, check and Inspection rows can only be as good as `delivers`.** `DuplicateSession` "possibly equal
keys" is a warning on any two operations of one contract; with `subscribe.each` it will fire on every pair. Allow a
`when`-style exclusivity or key-disjointness to silence it (IP3: `when` and `DuplicatePlacement` are not discussed at
all in the proposal).

## 4. The failure cases

**The six now claimed met.** FC23: met except H1, and the retry delay shows nothing in the row (M1). FC35: met for dense
ids; sparse stays a cost; SSE 401 is L4. FC42: met only under M5's preconditions; the model's I18 does not cover them.
FC53: met only when the server attests; without attestation the row is `Live` with `value` undefined and dimmed until
the next change, possibly forever; and see H2 for the attested case. FC54: met only after an explicit `Feed.down`; a
cache forwarded as an SDK's first value with no `down` is a current value (the Firestore sample must know
`fromCache`); the age is also wrong (M6). FC64: met.

**Other FCs that are not fully met.** FC3: answered for equality, not for skipping or loss (H3). FC10: met only where the
server replays; a no-replay source gets `missed` and the unhandled facts are gone (stated). FC15, FC75, FC78: ages
cross clocks (M14). FC19: met for sources that say `live`; the plain-stream form is the FC66 cost. FC22 and FC43: broken
by H1. FC41: met in the adapter, broken at machine level in the sample (M9) and by M3. FC44: met for position-free
dedupe; `undefined` equality breaks it (M4). FC56, FC81: overclaimed (M8). FC73, FC77: costs, and the sample is wrong
(M9). FC76: met for two actors, and across sessions M12. Remaining FCs not named here: I agree with the proposal's
status (FC1, FC2, FC4-FC9, FC11-FC14, FC16-FC18, FC20, FC21, FC24-FC34, FC36-FC40, FC45-FC52, FC55, FC57-FC63, FC65-FC72,
FC74, FC79, FC80). FC65 remains "visible, not prevented" (the `proof` string can say anything).

## 5. Integration points IP1-IP29

| IP | Status | Note |
| --- | --- | --- |
| IP1 contract | ok | `delivers`, resume `after` outside `key`. State the type of `E` after `Feed.reconnect` (L3c). |
| IP2 `.outcomes` | gap | `missed` required only with `value` (H3); `Closed`, `Defect`, `Interrupted` repeated in every record (section 7). |
| IP3 verbs, `when`, `DuplicatePlacement` | gap | `when` and `DuplicatePlacement` never discussed; two states that both place the operation bounce the session (extra reconnect and `missed`); `each` has no cap (M10, L7). |
| IP4 rows | ok | `connection` on every phase (FC50) holds; fix L2 and keep `Releasing` as `undefined`. |
| IP5 rule 14 | ok | Never late, discard on release; the rule 14 amendment is coherent. Add that the discard is invisible to the machine except as the next session's answer. |
| IP6 rule 20 | ok | Stream rows, `Defect`/`Interrupted`. No late handler is correct. |
| IP7 rule 8, N3 | ok | Amendment text is right; add "or discarded with evidence" to the Inspection list of lost deliveries. |
| IP8 memory reads | ok | Input read at start only; `Loaded` then `S.LIVE` reads the after-memory (correct). |
| IP9 schedules | partial | Adapter deadlines on Clock (M8); machine reopen in memory (M9); FC77 stated. |
| IP10 rule 25 | ok with a flag | `Feed.reconnect` is a Flow-shipped retry (M6-D3, accepted); it reports to Inspection through an unspecified channel, so the returned Stream is not a "plain Stream" (name the service it uses). |
| IP11 rule 47 | ok | Deliveries as endings. |
| IP12 mailbox | ok | Outside the cap, at most one item per session (per fact session). |
| IP13 disposal | ok | Release within 5 s; note `Waiting` sleeps cancel. |
| IP14 write lane | ok | Progress per Attempt; check the setter's schema failure (L3d). |
| IP15 ownership | ok | Activation-owned vs Runtime-owned is justified. |
| IP16 `listen` | partial | Applied at arrival; M1 (optimistic proof), M12 (position). |
| IP17 staleness | ok | Table 2.8 is the right shape; M1. |
| IP18 property tests | thin | Faults named; the audit after each push is not specified. |
| IP19 Operations.plan | ok | Listed in 6.2. |
| IP20 Machines.plan | ok | Listed. |
| IP21 Persistence | ok with a flag | `last` persists only with a turn or the final capture, so a crashed tab restores an older `last` (safe: it is dimmed and aged). |
| IP22 SSR | partial | Ages cross clocks (M14); server sessions "may run" (nondeterministic HTML if pushes land before capture); L1; M7 notice in server memory. |
| IP23 Testing | ok | Needs listed; spelling pending M3. |
| IP24 Playback | ok | Frames carry phase and `last.at`. |
| IP25 Inspection | partial | Retention (M13). |
| IP26 `flow check` | gap | `FactFeedUnmapped` (H3); `DuplicateSession` noise (L7). |
| IP27 MD placeholders | ok | 6.1 lists each replacement. |
| IP28 React, multi-tab | ok | Handover is a restore. |
| IP29 sync engine | **missing** | No walk. Say how `truncate` / must-refetch maps to `Feed.live({ lost, restartAt })`, how an engine's `up-to-date` maps to a proof, and that no status is inside values. One paragraph, no new word. |

## 6. The owner's new questions

**Q15, the shape of `catchUp`: agree with A**, with three stated conditions. (1) The step shape is right because it
makes completion explicit and avoids a new word. (2) It needs the precondition of M5 written into the contract of
`catchUp`, and a bound for the non-terminating empty-page-with-`next` case. (3) It cannot carry tombstones from a state
read, so `catchUp` is for change logs only (M1). B's `Feed.complete` marker is worse: a stream that ends without it
would still need to be read as incomplete, which is A's rule with an extra word.

**Q16, the row during a catch-up: A for the row, but not for freshness.** `Live` is right for the composer. It is
wrong as the signal `listen` freshness and "proven" evidence follow (M1). Keep A and add the internal completion signal
(RC2) so `listen` and evidence key off completion. B (`Connecting` until the last page) is right that the proof is not
yet earned, and wrong that it conflicts with I1, because the caught-up facts are admitted as values on a connection
that is registered; the conflict disappears once registration and completeness are separate facts. If a view needs
"loading history…", a row field is a new word; I would not add it until a product case needs it, and I flag that the
current row cannot show it.

**Q17, a proof on a state feed: agree with A, with one repair and one relaxation.** The repair is H2 (a re-confirmation
must be offered to the machine when it differs from `heard`). The relaxation: the `own` restriction is stricter than
needed. When the machine passes the restored position through `input` (S4), the adapter's `from` does name the restored
`last`, and the server's attestation is true for it. Today a push-on-change source stays dimmed after every reload.
Keep `own` as the default and let a proof re-confirm a restored `last` when the position came from `input`. B (a proof
means nothing on a state feed) leaves FC53 permanently open for the one class of source it matters for.

**Q18, the page retry budget: agree with A, with a bound.** A fresh copy of the reconnect schedule per good page is
the right default (no new word). The risk is that the budget and the 1,024-value buffer race: a busy room (over about 17
messages a second) fills the buffer before an exponential page budget runs out, so the connection ends in `Overflow`
and the catch-up restarts. It stays bounded (each failed connection spends a reconnect step, and pages already emitted
advance `last`), but it is a throttling loop. Make the buffer size an option of `Feed.reconnect` for this case, or time
the page retries against the fill rate. `catchUpSchedule` (B) adds a word to move one number.

## 7. Wiring every app writes the same way (open-items 15)

Absorb (same in every app of the kind):

1. **Machine-level reopen** (`FeedEnded -> RETRY_WAIT`, `reopenInMs` doubling, reset on first message, `Reopen`, the
   `schedules` line): about six lines per feed, identical, and wrong in the sample (M9). Absorb as a placement option or
   default behaviour whose backoff is kept in the Runtime's persisted record. This is the largest item.
2. **`restartAt` -> cursor in the `missed` handler** and **`cursor: event.message.cursor` in every fact handler** (the
   owner's own example, and the contract's `position` already says it). Tension with S4 (Flow stores no position): the
   least invasive absorption that respects S4 is a typed default fill: the select may omit `after`, and Flow fills it
   from the last *handled* fact's `position`, held in the session record that persists with the actor. The owner decides
   whether that still counts as "Flow stores no position".
3. **`Closed`, `Defect`, `Interrupted` -> the same "ended" event** in every stream `failure` record; give streams a
   default for these three (the owner already accepted rule 37's pattern for reads, so this is a default, not a new
   rule).
4. **The `missed` event payload** (`why`, `restartAt`): every app declares `MayHaveMissed` with the same fields.
   Ship `Feed.Missed` as a ready-made payload schema (already in the item).
5. **`upsert` by id** on at-least-once facts: absorbed by an entity domain; for plain memory lists a keyed-list
   memory helper.
6. **Snapshot-then-subscribe for state feeds** (read the current state on each connection and emit it first, then
   updates): every push-on-change state feed needs it for FC53 and writes it by hand. An option on `Feed.reconnect`.
7. **`live` guard** (`operations.x?.connection === "Live" || deny("Offline")`): a built-in guard form like `O.x.idle`.
8. **Per-key reopen** for `subscribe.each` (M10).
9. **Hello deadline plus idle deadline plus `highWaterMark` plus close-code classification** in the WebSocket adapter
   (22 lines): Flow is not a network library, so keep it adapter-side, but a documented recipe function is cheap.
10. **Held-write release and retry budgets** on the write side (already item 15's list).

Keep as app decisions: the banner text per `drop`/`failure` reason, whether to accept `missed`, the `catchUp` pager,
classification of errors.

## 8. What I did not check

I did not compile the samples or run any model. I did not read `proposal.md` or the earlier reviews' details beyond
their summaries. The Effect claims were checked by signature and doc comment only. The `Feed.callback` queue (3.3) and
the pump (3.2) read as consistent apart from H2; I found no deadlock: every wait (successor on `Released`, pump on
`inFlight`) ends by a bound or an admitted turn, and every buffer is bounded except `pageSet` (M4) and evidence (M13).
