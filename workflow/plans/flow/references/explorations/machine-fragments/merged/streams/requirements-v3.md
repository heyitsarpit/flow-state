# Streams: requirements for the next from-scratch design (v3)

Status: **input for a designer, written 2026-11-01. Proposes no API.** Only section 2 records owner decisions; every
tier below is proposed until the owner confirms it. A requirement says what must be true, for any source and any app;
it does not say how. Where this file names a word from `proposal-v2.md`, it is in section 6, the rows that exist because
of that draft, or in a source note.

Companion: [prior-art-v2-assessment.md](prior-art-v2-assessment.md).

## 1. Plain words

| Word here | Meaning |
| --- | --- |
| **source** | where live data comes from: a WebSocket, SSE, a `fetch` body, polling, a vendor SDK |
| **adapter** | the author's code that talks to the source. Flow is not a network library: only the adapter sees close codes, greetings and SDK statuses |
| **every-value feed** | each value is a separate event and all of them matter: chat messages, notifications. The docs also say "facts" |
| **latest-value feed** | only the newest value matters: a price, who is online. The docs also say "state" |
| **session** | one placed subscription, for as long as it stays placed. It may span many connections |
| **connection** | one physical attempt inside a session |
| **listening** | the server will now send this client everything new. A transport opening does not prove it |
| **gap** | a stretch of time in which values may have been sent that the consumer did not get |
| **repair** | reading what a gap lost from somewhere else (a history endpoint) |
| **resume position** | where the next connection or session asks to continue from |
| **consumer** | what receives the values: a machine, or an entity domain through `listen` |

Source codes: **SR** brief requirement, **FC** brief failure case, **DG** brief design goal, **RV1–RV5** the v2 reviews,
**R1, R2** the earlier reviews, **MDL** the model, **CMP** comparison.md, **AUD** the multiplicity audit, **S** owner
decision in decisions-v2.md, **SC** `merged/story-checks/stories-amended.md` section 11, **DESK** the dispatch desk's code and
REVIEW, **PA** prior art.

Kinds: **B** behaviour, **A** API property, **C** cost limit.
Tiers: **must**; **should** (may be traded for a stated reason); **limit** (a design may decline it, if it says so).

## 2. Owner priorities and confirmed preferences

Order of priority (AGENTS.md): correctness first, then how easily the code reads at a glance, then agent UX. Standard
upfront contracts beat clever hybrids. Cutting scope for correctness is fine. Each addition must be worth it.

| # | What the owner said | Status | Source |
| --- | --- | --- | --- |
| O1 | One `stream` function, with `delivers: "every" \| "latest"`. "Facts" and "state" stay as docs words for the concepts | confirmed preference (spelling) | S11 |
| O2 | A session reads `input` once, at start. Changing a non-key field never restarts it | confirmed | S11 |
| O3 | Two operations on one contract and key are two sessions, with a warning | confirmed | S11 |
| O4 | The API as walked was acceptable. **Spellings are preferences.** Behaviour, and earlier decisions S1–S11, may be re-judged from the ground up | confirmed | S12 |
| O5 | Spellings kept for now, as preferences: signals in-band; `Feed.live({ proof \| lost, restartAt })`, `Feed.down`; the names `Feed`, `live`, `down` | preference | S12 |
| O6 | Entity domains give client coherence. They are not a sync engine | confirmed | memory, brief SR24 |
| O7 | Wiring every app repeats belongs inside Flow ("it just works") | confirmed direction | open-items 15 |
| O8 | Flow never re-opens a session itself; no Flow timeout and no Flow retry (rule 25) | merged design | K14, MD |
| O9 | The stream contract's merged shape: `input`, `output`, `key` required, resume position outside the key, placements, rows typed per transition | merged design; a design may argue with a failure case | K1–K19 |
| O10 | Stories fake the transport, not the adapter, and stream controls are ordinary wire steps with no stream-specific step words | decided | W37, SC |

**Re-judgeable earlier decisions.** S2 (in-band signals), S3 (repair lives in the adapter), S4 (the position lives in
machine memory), S5–S10, and M6-D3's reconnect combinator are all prior art under S12. No row below depends on them,
except the rows in section 6, which say so.

## 3. Requirements

### 3.1 What a value means, and how it arrives

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| V1 | Whether a feed is every-value or latest-value is a property of the data, stated once on the contract, and no consumer can change it | Consume one feed from a view only, a mapped machine and `listen`. All three get the same skipping and equality rules. Delete the machine's mapping: the meaning does not change | SR1, FC3, RV1 H3 | B | must |
| V2 | Flow never skips, merges or equality-silences a value of an every-value feed, including after a reload, handover or hydration | "sync now" twice, reload, "sync now" twice: 4 deliveries | SR2, FC1, FC2, FC25 | B | must |
| V3 | A slow consumer of a latest-value feed may skip to the newest. A value equal to the last one the machine heard is not delivered to it again | 1,000 ticks/s: at most one waiting delivery and one row publication per publication; ticks 5, 5: the machine hears one | SR3 | B | must |
| V4 | Every-value feeds reach each consumer in source order, one per turn, interleaved fairly with every other event. The next is not taken until the previous turn commits | A burst of 500 messages and 3 user sends: 500 turns in order, sends not starved | SR4 | B | must |
| V5 | A fast source never causes more machine work than the machine can absorb, and never makes a user's send fail. Deliveries do not use up the external event cap | Mailbox full of 1,024 sends plus a ticker at 1,000/s: neither is dropped | SR19, FC32 | B | must |
| V6 | No every-value feed can be silently under-consumed. An every-value feed nothing handles is an error, or else its reader gets all values and can see any loss | A refactor removes the bell's handler and reads the feed in a view: compile error, or the view still counts every notification | RV1 H3, FC3 | A | must |
| V7 | A value's identity comes from the source. Two values with one identity are one value; a value with no identity cannot be told from a replay, and the design says what happens to it | Two identical id-less "sync now" pushes around a replay: the design's documented result holds in a Story | RV1 L5 | B | limit |
| V8 | A finite stream of every-value items that must drive the machine (streamed tool calls) can tell "finished" from "cut off" | NDJSON tool calls ending in a terminator; then one without it: different outcomes | RV2 M7, SR16 | B | should |
| V9 | The consumer that does not care about loss (typing indicators) says so at a cost of about one line | The desk's typing feed: the "accept loss" handling is one visible line | DESK presence, DG4 | A | should |

### 3.2 Knowing whether anything was missed

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| G1 | After anything that could have lost every-value items (a reconnect, an SDK's silent rejoin, an overflow, a server reset), the consumer learns "nothing missed", "something missed" or "don't know" before any item newer than the interruption | Each of: drop, append 2, reconnect, new item. No new item arrives before the answer | SR5, FC4, FC55, RV1 M1 | B | must |
| G2 | The default answer when nothing proves otherwise is "may have missed" | A plain Stream with no signals; a drop and a reopen with no words: reported as possible loss | SR5, DG5, FC21 | B | must |
| G3 | One interruption gets its own answer. Answers about separate interruptions never merge across a delivered value | down, value, live, value: each stretch is answered; the later reconnect is not covered by the earlier notice | MDL N3, N4, N9 | B | must |
| G4 | "Nothing missed" needs evidence the author named. A transport opening, sending a cursor, or a full snapshot is not evidence | A `hello` with no echo of the position; a snapshot on join: reported as not proven. A Story reads what proved continuity | SR6, FC21, FC65, CMP 3.3 | B | must |
| G5 | The most dangerous mistake, claiming "nothing missed" without basis, is caught or at least visible in a one-line review and in tooling | Grep and Inspection show the stated basis of every such claim | SR6, SR40, FC65 | A | must |
| G6 | Evidence covers what this consumer's stream delivered, not what an SDK object received | An SDK channel cached across connections says `resumed`; one value was lost to an overflow or a release before it. Result: not proven | RV2 H3, RV3 L7 | B | must |
| G7 | Live means listening. A registered connection that stays quiet still counts as live; a source that never says so has an honest path with a stated cost | A reconnect with no new messages reaches live. A graphql-ws-like fake registers late and no message between its ack and registration is lost | SR7, FC19, FC51, FC66 | B | must |
| G8 | "Listening" and "I hold everything since my position" are separate facts, readable separately | During a repair the composer may be enabled, while a covered list is still stale | RV1 RC2, MDL F11, S6 Q16 | B | must |
| G9 | Every sequence an adapter can produce has one conservative meaning. A misbehaving adapter causes extra repair, never silent loss and never stale-as-current | Enumerate every (state, input): values before registration, a value after a drop with no re-registration, a second "registered", repeated drops, signals with no values. None undefined, none ignored without a record | SR8, FC31, FC47, FC64 | B | must |
| G10 | A first connection for a consumer that holds nothing and needs nothing from before now does not show "something may be missing" | New user, empty room, `hello`: no notice | RV2 H1, R1 M7 | B | must |
| G11 | The answer to "does this connection owe anything?" belongs to the consumer's memory, not to the session or connection. Every later connection or session for that memory owes from the first time it was listening | Quiet room: connect; nothing posted; drop or leave the screen or reload or thaw; m1, m2 posted; connect again. Reported as possible loss, in every one of those paths, including when memory is still empty | RV4 H1, RV5 H1, MDL N1 | B | must |
| G12 | A consumer that read a snapshot before listening does not lose what happened between the read and listening | Read history (empty or not); message posted; socket registers: the message appears or a possible loss is reported, on sources with positions and on sources without them | FC13, RV4 H1c | B | must |
| G13 | A first attempt that fails before ever listening does not produce a false loss notice | App opens offline; hello deadline; first join times out; then connects: no notice | RV3 M1 | B | should |
| G14 | A connection that started with a position it was given is not a "first connection", whatever else is true | Reload with a cursor; `hello` without replay: repair or possible loss | RV2 H1, RV3 H1 | B | must |
| G15 | A consumer can ignore a loss notice only by a means that cannot also swallow a real later loss, a known loss or a reset | Handler ignores first-load noise; later `lost` and `reset` still reach the app | RV4 H1b, RV5 M2 | A | must |
| G16 | Repeated status with no values costs no new notices beyond what each interruption owes, and a notice loop does not train users to ignore it | Normal snapshots are not reconnects; Firestore's repeated snapshots produce no notice | FC62, R1 M7 | B | should |
| G17 | A source that can never prove continuity has a defined cost: a repeated notice, or an accepted-loss choice | SSE with sparse ids, no greeting, no read endpoint: behaviour stated and shown | FC52, FC74 | C | limit |

### 3.3 Resume and repair

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| R1 | The position a new session starts from is one at or before which the consumer holds every item or has accepted the loss. A later item never moves it past a hole | After a loss, a live item beyond the hole arrives; reload: the next session asks from before the hole, or the loss was reported | SR9, FC22 | B | must |
| R2 | Within a session, a reconnect resumes without author code | Drop for 5 s, two messages meanwhile: they arrive in order with no machine transition | SR13, FC4, FC8 | B | must |
| R3 | Across sessions, resuming needs no algorithm in author code, and the resume position survives whatever memory survives | Re-entry, reload, handover, thaw: the server sees the right position | SR9, SR31, DG2, open-items 15 | A | must |
| R4 | Live items that arrive during a repair reach the consumer only after what came before them, and a repair that dies delivers none of them past the hole | Drop mid-repair with 12 live items waiting: next connection asks from before the hole; no item past it was delivered. **Probe: every design that passes live items straight through fails this** | RV1 H1, FC43, probe | B | must |
| R5 | Every possible loss has an end: a repair that started after it and reports itself complete, a new session that proves continuity, or the app's explicit acceptance shown to the user | Failed repair, partial repair, reload mid-repair: the consumer leaves "owing", given repairs eventually succeed | SR10, FC60 | B | must |
| R6 | A repair that started before the latest loss never settles it | A late page after a second drop: not counted | SR10, FC43 | B | must |
| R7 | Only the server's own word completes a repair. A short page, an empty page or a stream end never does | Page 1 of 3 short; empty page with `next`; body ends early: still repairing or failed, never "in sync". Author's natural pager line tested too | FC42, RV1 M5, DESK S-M3 | B | must |
| R8 | A repair read starts after the connection is listening | Repair started on ack, server registers later; a message in between is not lost | FC51 | B | must |
| R9 | A failed repair read is retried and not forgotten | History 503 once, then OK: repaired | FC23 | B | must |
| R10 | A history that cannot reach back is a reported loss, not an outage: no reconnect budget spent, nothing shown as complete | Retention 100, gap 300: one "something missed", then what is kept, then live | RV2 H2, FC52 | B | must |
| R11 | A repair that makes no progress ends within a bound | A pager returning empty pages with `next` forever: ends as a failed connection | RV1 M5, MDL N5 | B | must |
| R12 | Reload in the middle of a repair loses nothing and gets no one stuck | Reload during page 2: new session repairs again; no state waits forever | SR10, FC45 | B | must |
| R13 | A server reset is a named loss. Positions compare only within one position space, and later quiet reconnects resume in the new space, also across sessions | Reset to epoch 9; quiet reconnect asks from `{9,0}`, no second notice; old `{8,1}` and new `{9,1}` both kept; reload keeps it | SR11, FC24, FC46 | B | must |
| R14 | Replays, repair overlap and reordered frames leave each item held once, using only identities the source gives. Positions may be dense or sparse; the limits for sparse are stated | Replay overlap, a frame delivered twice, `release({ nth })` reorder: each message once. A ULID feed is walked | SR12, FC14, FC44, DESK duplicate | B | must |
| R15 | A source with dense positions and no greeting can prove continuity from its positions | SSE ids 8 then 9 after `from: 8`: proven; 8 then 11: not proven | RV2 H8, FC35 | B | should |
| R16 | Reading history must work for newest-first APIs (Slack, Discord, Ably), or the limit is stated. A drop mid-repair never loses the older pages | Newest-first pager; drop after page 1 of 3: older pages are still requested or the loss is reported | RV3 H3 | B | must |
| R17 | A repair read can be cancelled on release and leaves no request running | Leave during a page: request aborted | DESK S-M2 | B | must |
| R18 | Repair of what the user sees does not force machine states or an algorithm per app | Chat's forced code: no position comparison, no "owing" state | FC63, DG2, CMP 4.3 | A | should |
| R19 | Repair state is visible to Inspection, Stories and Playback, not hidden in an adapter | Evidence shows a repair running, its basis and its end | SR38, CMP carry 5 | A | must |
| R20 | A repair reads a change log with deletes. A state read cannot carry deletes, so it never counts as proof of continuity for items | A list read after a deletion: not reported as "nothing missed" | RV1 M1 | B | must |
| R21 | A reset for a materialised source ("throw everything away and re-sync") has a correct path | Electric `must-refetch`: rows removed in the gap vanish | RV2 M8, IP29 | B | should |

### 3.4 Reconnecting, ending, classification

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| C1 | A Wi-Fi blip forces no machine states. A session that ended reopens only when the machine places it again | 2-second drop: no transition. Terminal failure: reaches the machine | SR13, FC73, O8 | B | must |
| C2 | The retry budget measures health over time. A server that accepts then drops exhausts it in bounded tries and time; a connection healthy for a stated time restores it. "Accepted", "first value" or "first replay" never restores it | `flap(20, upFor 1 s)`: ends after N on the test clock. A connection up for the stated time: restored. A connection that never registered does not restore it | SR14, FC36, FC41, RV1 M3 | B | must |
| C3 | The same holds for a machine-level reopen: a replayed message does not reset its backoff | Flapping server replaying one message per cycle: backoff still grows | RV1 M9, FC73 | B | must |
| C4 | A reload's effect on budgets and backoff is stated | Reload during an outage: documented result, Story | SR14, FC77 | B | must |
| C5 | Only the adapter classifies. "Offline, retrying" and "signed out, stop" are different things a view and a machine can tell apart | Close 4401 becomes terminal; close 1006 becomes a transient drop; a banner per reason | SR15, FC9, DESK | B | must |
| C6 | A stall fails, never completes. An end that cannot prove completeness is not a clean completion. A clean close of a feed is visible | A stalled body; a truncated body with no terminator; a deploy's clean close of a chat socket: none reads as finished or silently stops | SR16, FC29, FC37, FC80 | B | must |
| C7 | Clean close behaves the same whichever transport produced it | Effect sockets fail on every close; push SDKs complete. Same meaning at the machine | FC61, SC 9 | B | must |
| C8 | A terminal ending always reaches something that must handle it | Budget gone on a chat with no handler: compile error or check error, never only a row saying "ended" | CMP 6.2, SR26, DG5 | A | must |
| C9 | SDKs that own their own reconnect and backoff work without Flow fighting them. A session on a shared SDK connection cannot close it for others | Socket.IO, Ably, Phoenix: one app-wide client, 3 sessions; one leaves: others unaffected; the SDK's budget stands in | RV2 X1, H3, RV4 H2, DESK PR | B | must |
| C10 | A clean way exists for a session's failure to be a failure of one key only, with a path to retry it without destroying user data | Watchlist symbol ends after its budget: symbol stays in the list, shown "ended", can be retried | RV1 M10 | B | should |
| C11 | Authenticated sources that hide status (EventSource) have a documented path | SSE 401: tells signed-out from offline by a stated method | RV1 L4, RV2 L3 | C | limit |
| C12 | Failed polls are typed drops that keep the position, not defects or a restart from the beginning | Poll 503: reconnects from the cursor, not `"0"` | FC72 | B | must |
| C13 | A manual "reconnect now" is not required, and must not be precluded | Design note only | brief 8, open-items 18 | A | limit |
| C14 | A polling source has an honest meaning of "live" before its first answer, stated | Offline device, first GET pending: what the row says is documented | RV3 L5, DESK technicians | B | should |

### 3.5 Bounds

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| M1 | Memory held for a session is bounded for any sequence, on every path, by default | Flood; flap 10,000 cycles; a week offline with 100,000 missed: memory bounded | SR18, FC11, FC34, FC49, RV1 M4 | C | must |
| M2 | A pulled source waits at the bound and loses nothing | `fetch` body, polling: slow consumer stalls the read | SR18 | B | must |
| M3 | A pushed every-value source loses only with a reported loss at the point of loss. A pushed latest-value source keeps the newest | Flood past the bound: exactly one reported loss, or a reconnect from before it | SR18, FC26 | B | must |
| M4 | Connection status is never pushed out by values, and repeated status costs bounded memory. No merging of status upgrades an answer or hides a drop | Buffer full, then a drop: the drop is known; `[proof, down]` ends dropped | SR18, FC26, MDL F5 | B | must |
| M5 | The easiest way to write a bridge for a callback source is bounded. An unbounded bridge is caught or at least flagged | Agent writes the raw socket from the docs: bounded. **The desk's own adapter was unbounded (S-H1)** | FC34, DESK S-H1 | A | must |
| M6 | An SDK that awaits its callback can be slowed by the bound instead of overflowing it | SDK awaits; 400 messages on a bound of 256: nothing lost, no reconnect | RV2 M2, DESK typing | B | should |
| M7 | Tooling evidence is bounded too | A flapping SDK for a day: evidence stays bounded | RV1 M13 | C | must |
| M8 | A busy source does not get stuck in a repair-overflow-repair loop without a stated bound | 100 msg/s with a long gap: it ends, by progress or by the budget | RV1 Q18 | B | should |
| M9 | `subscribe.each` states its cost per key | 5,000 keys: documented, no silent limit | RV1 M10 | C | limit |

### 3.6 Freshness a view can trust

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| F1 | A view can tell "current now" from "was current when last connected", and knows how old the latter is | Drop on a ticker: the price dims with its true age | SR20, FC15, FC20 | B | must |
| F2 | Showing a last-known value as current needs a visible word in code. The most natural expression cannot lie | `show(row.value)` is empty while stale; showing stale reads as a choice | SR20, FC50 | A | must |
| F3 | After a reconnect, a value is current only once the new connection confirmed it. An equal value still confirms | Reconnect, same price: undimmed; machine hears nothing | SR20, FC20, FC53 | B | must |
| F4 | The machine never acts on stale data as current | A cached price or one queued before a drop does not fire an alert | SR21, FC54, FC67 | B | must |
| F5 | **What the row shows as current and what the machine heard agree.** A value shown current is delivered unless equal | Tick 105 discarded by a drop, reconfirmed: machine hears 105 | RV1 H2, MDL F2, F3 | B | must |
| F6 | A value read from history is never "current" | A latest-value feed with a repair: an old page value does not show as current or fire an alert. **Probe: v2 fails this** | probe (assessment 8) | B | must |
| F7 | One expression, valid for every phase including ended and not placed, reads whether a feed is live | `row?.connection === "Live"` type-checks in every phase | SR22, FC50 | A | must |
| F8 | Views can show connecting, reconnecting with a reason, ended with a reason, distinctly | One banner per case | SR22, FC6, FC9 | B | must |
| F9 | Quiet can be told from dead without Flow measuring wall time | Flat market with pings: current. Half-open socket: drops within the stated window | SR23, FC40, FC81 | B | must |
| F10 | After a page wakes, an old value stops showing as live within a stated, small window. The claim matches what browsers do (timers may not count sleep) | `suspend 10 min`; on wake the row leaves live within the window | SR23, FC56, RV1 M8 | B | must |
| F11 | A push-on-change source does not stay dimmed forever after a reconnect | Source sends nothing new on reconnect: a path to confirm exists (the server attests, or re-sends) | FC53 | B | should |
| F12 | A value's age is true: a cached value does not look new, and ages survive clock differences across reload and SSR | Offline snapshot from the morning; server clock 5 min off: no negative or fresh age | RV1 M6, M14 | B | must |
| F13 | An optimistic local echo from an SDK has stated meaning | Firestore local write fires the listener at once: stated | RV2 s10 | C | limit |

### 3.7 Entity records fed by streams

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| E1 | Pushes apply in order at arrival, never join a write's record queue, and clear no `uncertain` mark. Versions decide duplicates and reorders | Push fault property test passes | SR24, FC14 | B | must |
| E2 | An answer is trusted only while every push channel covering it is live, and a read that started before a gap never clears that gap | Record deleted while down leaves the list after the rejoin, quiet or not | SR25, FC5, FC19, FC28, MDL N1 | B | must |
| E3 | Leaving the screen makes covered answers stale | Open settings, delete elsewhere, return: refetch, gone | FC48 | B | must |
| E4 | The first-live race counts for entity answers | Answer read before the channel first went live is possibly missing pushes | SR25, FC13 | B | must |
| E5 | A proven reconnect withdraws staleness with no read | Replay proven: no refetch | SR25, FC5 | B | should |
| E6 | The machine needs no handler for possible losses (the domain repairs) but must handle an ending | Compile or check error for an unhandled ending | SR26, RV1 M12 | A | must |
| E7 | A `listen` accepts only every-value feeds | Type error on a latest feed | SR26 | A | must |
| E8 | Several sessions of one entry on one key have defined meaning, with a warning | AUD F10: two actors, one drops: the sequence matches the stated result | SR27, FC76 | B | must |
| E9 | One connection can feed both records and a log without opening two sockets, or the cost is stated. **The desk opens two connections to one workspace socket because of this** | Desk: pushes and activity on one socket: 1 connection, or a stated 2 | DESK feed.contracts, README | C | limit |
| E10 | A `listen` feed can use server replay across sessions, or the extra refetch on every re-entry is stated | Re-entry on a perfect server: refetch count stated | RV1 M12, FC69, DESK | C | limit |
| E11 | Costs of refetch are stated and bounded | Change before `SUBSCRIBED`: at most 2 reads; hydration: one refetch per covered list | FC68, FC69, RV1 L1 | C | must |
| E12 | Property tests can inject stream faults, with the domain audited after each push | Push, drop, reconnect, unsubscribe, overflow | IP18 | A | should |

### 3.8 Streaming writes

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| W1 | A write can report before its ending. This costs no turn per update and is never an ending | Tokens at 100/s update a row with no turns | SR29, FC12 | B | must |
| W2 | Progress belongs to one Attempt. A superseded Attempt never overwrites or clears a newer one's; each ending sees its own Attempt's last progress | Stop, Ask: only the new answer's progress. Regenerate under `cancel` | SR29, FC30, DESK | B | must |
| W3 | Stop, cut-off and stall follow the write lane: unknown, never success | Stop; cut body; 20 s stall: each ends incomplete with the partial text | SR30, FC37, FC80 | B | must |
| W4 | Progress is never persisted; after a reload it is absent and the outcome stated | Reload while asking: unknown, no partial | SR30, FC70 | B | must |
| W5 | Callback sources report progress with no hand-written runtime bridge | XHR `onprogress` calls it directly | SR30, FC58 | A | must |
| W6 | After Stop, whether Ask is admitted is defined; retrying may double charge, and this is stated | Story: Stop, Ask | FC39, FC70 | B | must |
| W7 | Concurrent uploads each have their own progress, or the limit is stated | Three uploads at once | FC71, AUD F1 | B | must |
| W8 | Upload progress is honest: bytes sent are not bytes stored | Bar at 100% while the request is open shows "waiting for the server" | FC79, DESK | B | should |
| W9 | Writes over a live connection have a route; a publish an SDK queues offline is not a success | Ably `publish` offline: unknown until ack | RV2 M5, DESK ping | B | should |
| W10 | A half-open upload ends, and abort always resumes the caller | Stalled XHR ends unknown | RV2 L2, s4 | B | must |

### 3.9 Lifecycle, ownership, multiplicity

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| L1 | Who owns a session is stated, consistent with the merged rules, for every edge: start, each connection change, ending, leave, disposal, new incarnation, Runtime disposal, restore, handover, wake, freeze, thaw, reset | A table with every cell filled | SR33, IP5, IP15, RV3 H2 | B | must |
| L2 | What a released session had not delivered is discarded with a record, never routed late to another state | Items queued at release: discarded, evidence | SR33, FC10, MDL | B | must |
| L3 | A new session for the same actor, operation and key opens only after a releasing predecessor finished clean-up, within a stated bound, whatever state or path it came from | Fast leave and re-enter on Supabase; a move between sibling states; a `resetOn` with an unchanged key: never two channels (a stated overlap only past the bound) | SR17, FC33, RV4 M1 | B | must |
| L4 | Callbacks firing after release reach nothing | SDK emits after removal | SR17 | B | must |
| L5 | Two live copies of one fragment on an equal key both run; neither stalls on the other | Two `PriceTile`s on AAPL: both live | RV3 H2 | B | must |
| L6 | One session's release can never break another live session using a shared SDK object | Actors A and B on `room:1`; A leaves: B stays truly live. A detach from any cause drops B's row | RV4 H2 | B | must |
| L7 | Leaving screens does not leak subscriptions on a shared client | Visit 1,000 per-document channels: attached count does not grow without limit, or a stated cost | RV5 M1 | C | should |
| L8 | `subscribe.each` is one session per distinct key; equal keys in two actors are two; two operations on one contract and key are two with a warning | Watchlist of 50; two screens on one room | SR39, FC7, K4, S11 | B | must |
| L9 | A warning about duplicates fires only when both can be active | Mutually exclusive placements: no warning | RV1 L7 | A | should |
| L10 | Connection-limited sources (SSE's six) are designed for or a stated limit | Seven tabs on HTTP/1.1: stated | SR39, FC18 | C | limit |
| L11 | Slow clean-up cannot stall disposal past the Runtime's bound. Sources whose clean-up cannot be awaited are named | `removeChannel` 10 s; `fromAsyncIterable` | RV2 M6 | C | must |
| L12 | Every stream delivery has a stated place in rules 8, 14, 20, 25, 37, 47 | Rule-by-rule list | IP5–IP11 | A | must |

### 3.10 Persistence, tabs, SSR

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| P1 | What survives a reload is defined per kind. Every-value: no equality baseline. Latest-value: last value, last-known with age, never current. Queued items and buffers are not saved | Close and reopen in every phase of the chat case | SR31, FC15 | B | must |
| P2 | Unresolved loss and the resume position survive with the actor's record, and repair resumes | Reload with an unaccepted gap: not forgotten | SR31, FC45 | B | must |
| P3 | Second tabs and leader handover are walked; no stale-as-current, no lost position | Leader closes; new leader resumes | SR31, FC75 | B | must |
| P4 | Streams never delay SSR settling. A server-rendered latest value shows as last-known until the client's own session confirms it, and causes no duplicate delivery | Ticker SSR: dim, then undim, no double event | SR32, FC78, RV1 IP22 | B | must |
| P5 | Whatever the "does this memory owe?" decision reads crosses SSR and hydration with the memory. A hydrated memory holding items is never treated as first | Server read items; client's first connect: not `first`. **v2's SSR table does not say this** (assessment 16) | derived from G11, SR32 | B | must |
| P6 | Sensitive values are omitted from transfer | Marked output not in the payload | SR32 | B | must |

### 3.11 Stories and fakes

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| S1 | Stories replace the transport, never the adapter, so classification, decoding, bounds, heartbeats and handshakes run in tests. Replacing the adapter should be hard to do by accident | Overflow and token expiry run in a Story. **The desk's first Stories replaced the whole service (S-H2)** | SR34, FC26, DESK S-H2 | A | must |
| S2 | All adapter time runs on Effect's Clock; a wall-clock adapter is detected or its effect stated | Backoff and heartbeat advance on the test clock | SR34, FC38 | C | must |
| S3 | Every real sequence is one control away: accept, frames, silence, drop with a code, flood, restart a log, refuse or hold a repair read, withhold a greeting, reorder, flap, suspend. In the words of the Stories decision (2.10.9) | The chat Story written with them | SR35, FC16, FC59, SC table | A | must |
| S4 | A Story can assert the position the server saw, what proved continuity, and the reported losses | `cp.read(socket)`, session records | SR35, SC 7 | A | must |
| S5 | A Story can step to "the next reconnect" or "the next page retry" by name, without knowing durations | `advance({ next: { operation, timer: "backoff" } })` | SC 6 | A | must |
| S6 | Settling never waits for an open stream, nor for a streaming write's open body with nothing sent | `process`-equivalent returns with a socket open | SR35, SC 10 | B | must |
| S7 | Playback frames show each feed's phase and the age of what's shown; playback opens no session | Frame reads the phase | SR35, IP24 | B | must |
| S8 | Stream records have named cells, for coverage | `flow stories --coverage --kind session` | SC 7 | A | should |
| S9 | Spelling of a fake's pushes, closes and error tags is one form | Desk gaps 36–38 resolved | DESK gaps 32, 36–38, S-M4 | A | should |
| S10 | Cells no transport can reach (a signal after release begins) are covered by a Flow-owned suite | Suite list | SC 8 | A | limit |
| S11 | A duplex fake is not required, and its absence is stated | Client-sent frames form | SC 12 | C | limit |

### 3.12 Tooling and the graph

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| T1 | `flow check` finds the static mistakes from tokens and data, never by running closures: unhandled loss or ending, a latest feed in `listen`, duplicate consumption | One deliberately wrong file per finding | SR36, FC17, DESK tools/findings | A | must |
| T2 | `flow explain` prints each placement with its kind and session multiplicity | `LIVE subscribes feed (Chat.messages, every, one session per room)` | SR37 | A | must |
| T3 | Inspection lists each session: phase, last drop reason, basis of its last continuity answer, losses, bound, release; and flags values with no sign of listening, and churn | Flapping adapter flagged | SR37, FC64 | A | must |
| T4 | One graph and one runtime. No hidden per-adapter state machine that tooling cannot see; kind, required handling and row type are readable without running code | Inspect a repair from the CLI | SR38, CMP 6.3 | A | must |
| T5 | Stream facts reach fragment hosts in summaries, so checks work there | `FeedUnhandled` at a host | RV3 M2 | A | must |
| T6 | Stream rows are read the same way as other rows, including in fragments and keyed lanes | `cp.lane(address)`; `O.x.get(s, k)`. Desk misread a keyed lane (S-H3) | SC 5, K5, DESK S-H3 | A | must |

### 3.13 API shape and cost

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| A1 | A consumer who writes nothing about gaps still gets a type-required handler, or a conservative visible default. Omission is never silent loss and never stale-as-current | Omit each piece in turn: type error, check finding, or a dim row | DG5, S7 Q22 | A | must |
| A2 | The docs' first example, copied, gets correct liveness and loss handling | Sonnet agent writes each product case from the docs alone; mistakes counted. **Not yet run on any draft** | SR40, CMP 8 | A | should |
| A3 | No algorithm in author code: no comparing positions to infer loss, no second copy of a status Flow has, no protocol every app of a kind writes identically | Read chat, ticker, listen: none present | DG2, FC63, open-items 15 | A | must |
| A4 | Few general concepts. A new source (Pusher, MQTT, Phoenix) needs adapter code only. A rule naming one SDK or case is a defect | Add MQTT on paper | DG1, DG3 | A | must |
| A5 | Common cases cost about what a resource costs. The design reports new words per tier, common first. Reference: v2 has 24 (12 common) | Count. A rare concept charged to the common tier is a defect | DG2, DG4 | C | should |
| A6 | Code-size targets are reported per case. Reference: v2 chat 77 lines total, about 30 on the Flow side; earlier 110; a lossy 17 | Same server, same formatting | DG2, CMP 4.1 | C | should |
| A7 | One question has one answer in the API. No concept exists only to patch another | Each word names the failure it prevents, and no simpler rule prevents it | AGENTS, assessment | A | should |
| A8 | Repeated wiring is absorbed or justified: the same ending-to-event map, the reopen with backoff and healthy reset, the "may have missed" payload and handler, the live guard, the socket adapter (deadlines, bound, classify) | Desk feed, presence and technicians: count repeats. **Desk: six-key map ×3, reopen ×2 (REVIEW table items 13–16)** | DESK REVIEW, open-items 15, RV1 s7 | A | should |
| A9 | A shortcut for ending maps must not hide a new terminal error in silence. Where a catch-all exists, a distinct case like signed-out is still reachable and a newly added typed error can be noticed | Add `Banned` to the adapter errors: the design's stated result holds | derived: RV2 M1, A8 | A | must |
| A10 | Names follow Effect and Schema conventions; errors name the fix | Review; Effect's `Stream.timeout` silently ending stays out of recipes | SR40, FC37 | A | should |
| A11 | Samples type-check against the installed Effect | `tsc` on adapters. **Samples failed before (CMP 3.3)** | CMP 3.3, RV3 L2, RV4 L2 | A | must |
| A12 | The contract's natural line for a repair does not invite the wrong "complete" | The idiom `Option.fromNullable(p.next)` or a short-page test either cannot be written or is flagged | RV1 M5, DESK S-M3 | A | should |
| A13 | Static analysis, Stories, CLI inspection stay unbroken, and truth stays a compilation target | Existing commands work | AGENTS, SR38 | A | must |
| A14 | The design is stated as small tables with every cell filled, invariants and an executable model with mutants, **and the model is told what it does not cover** | Model passes; mutants die; server variants listed | brief 9, RV3 preface | A | should |
| A15 | Any model must be runnable on the owner's laptop, bounded in memory and with a stated limit | One process under 2 GB | owner machine incident, 2026-11-01 | C | should |
| A16 | A contract states the preconditions an author must meet, in plain words, and each one that cannot be checked has a failure mode that is safe | Each precondition broken in a Story: at worst extra work, or at worst visible | RV4 H1c, 3.7 P0–P3 | A | should |

### 3.14 Outbound live state

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| U1 | Latest-wins state an app sends over a live connection (cursor, typing, "I'm here") either has a design tied to a live session, re-sent per connection, cleared on leave, not restored as current, rate-bounded, no turn per move, no Attempt and no ending; or is declared out of scope with a workaround meeting those clauses | Cursor case end to end, either way | SR28, FC27, FC57, S5 Q8, open-items 16 | B | limit |
| U2 | Re-judge U1's tier: RV2 calls outbound presence common, not rare (typing, away, Ably re-enter). The desk's typing went through `allow` transactions | Count product cases needing it | RV2 s7, DESK typing | A | should |

### 3.15 Integration

| Id | Requirement | Test scenario | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- |
| I1 | Sync-engine status, offsets and `truncate` map onto the design with no status inside values | One paragraph and a walk | IP29, FC6 | B | should |
| I2 | Rows replace OPS O6's tags; Rewrites of OPS O1, O4, O6, V9, Q1; MCH O6; PER O2, O4; SSR O2, O3, O5; TST; INS; EDP O1, O4; MD placeholders are listed | Amendment list per IP19–IP27 | IP1–IP29 | A | must |
| I3 | Checkout needs no streams. This must stay true: no stream concept leaks into a plain write | Checkout's files unchanged, apart from renames | DESK COVERAGE ("No streams") | C | must |
| I4 | Deferred coverage is reachable by the design: SSE with `Last-Event-ID`, offline `down`, a second resuming feed, a streamed SSE body under `Fake.fetch` | Paper walk | open-items 33 | A | should |

## 4. Product cases every design walks

Tests, not the specification: chat with repair and reset; presence as a re-sent state; a ticker with a watchlist, a
quiet market and an alert; LLM tokens with Stop; upload progress; `listen` on Supabase; Firestore, graphql-ws, SSE,
polling; Socket.IO and Ably (recipe-breakers in RV2 and RV3); Electric as materialised rows; and cursors. The desk adds
these real shapes: a workspace socket carrying two kinds of item, presence and typing on one SDK channel, and keyed
polling of technician pulses. Checkout uses no streams.

## 5. Stated costs a design should expect to keep

These are platform facts, not defects: a quiet SDK that never says it is listening stays not-live, or is optimistic
(FC66); a resumable source's quiet reconnect may repeat a read (FC68, FC69); a machine-level reopen may repeat a repair
(FC73); sparse ids with no greeting repeat a notice (FC74); no browser API reports that a server kept generating after
Stop (FC70).

## 6. Rows that exist only because of the current draft

**This is the part to read first.** These look like requirements in proposal-v2 and its reviews, but each is true only
given how that draft works. A new design owes none of them unless it makes the same choice. The general requirement
behind each is named; that is the one that binds. None of these is a must.

| Id | Draft-only statement | Why it is draft-only | What actually binds | Source | Kind | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| X1 | Within a session, no position goes downstream twice (I13) | Consumers must already survive duplicates (reloads, frames delivered twice). **Probe: removing all dedupe fails only this invariant** | R14; a stated bound on duplicates | I13, MDL N2 | B | should |
| X2 | Pages stop where they first meet a buffered socket value (`meet`) | One way to end early. Not needed for correctness in the probe. Has a real but small efficiency value (assessment 8) | R4, M8 | principle 2 | B | should |
| X3 | Keep positions of recent page values (`seen`), and a `tail` after an empty-buffer finish | Only serve X1 | R14 | I7, rev 4.1 | B | limit |
| X4 | The socket's lag behind a page is at most `bufferSize` (P3) | Exists so `seen` and `tail` work | M1 | 3.7 | B | limit |
| X5 | Pages are oldest first (P0) as an author obligation | Follows from emitting pages directly and advancing the position per value | R16 | RV3 H3, S8 | A | limit |
| X6 | Retention drops only a prefix (P1) so a continued page meets the buffer | Needed by the meet | R10 | 3.7 | B | limit |
| X7 | `registered` set by every start and every delivered value, persisted like `heard`, with `initial` on `settle(lost)` (I27, rev 7.1, RV5 M2) | Shape of one fix for G11 | G10, G11, G14, G15, P5 | I27 | B | limit |
| X8 | `from` is required in the options whenever `position` is given; `fresh` only with a declared, empty `from` | RV3's patch. **The mutant removing it survives since revision 7 (mutations-output line 107)** | G11, G12, G14 | S8 H1 | A | limit |
| X9 | A handler reads `initial && why === "Unproven" && memory empty` | Author-side patch over X7 | G15, A3 | S9, S10 | A | limit |
| X10 | Signals merge as `(down₁, live, down₂)` groups in the callback queue | Exists because signals are items in a value queue (S2) | M4 | MDL F5, I25 | B | limit |
| X11 | Per fact session `|Q| ≤ 3` and one mailbox item | A pump's shape | V4, V5 | I7 | C | limit |
| X12 | The reconnect loop has phases `Connecting, Live, CatchingUp, Waiting, Done`, with 70 cells | Exists only if the adapter side runs the repair (S3) | R19, T4 | 3.4 | B | limit |
| X13 | A proof never re-confirms a `last` this session did not confirm (S6 Q17) | One answer to F3, F11. RV1 argued it is too strict | F3, F11, P4 | S6 | B | should |
| X14 | The row reads `Live` during a repair (S6 Q16) | One answer to G8 | G8 | S6 | A | limit |
| X15 | A position is carried in `input`, filled from memory, written by each handler (S4), with its "defined cursor" and "pass the snapshot's head" preconditions | S4 is re-judgeable. RV1 s7 and open-items 15 already query it | R1, R3, G12 | S4, RV4 L8 | A | limit |
| X16 | Identity is per placement path, and the wait is per actor, operation and key, as two named rules | One way to state L3 and L5 | L3, L5 | S8, S9 | B | limit |
| X17 | `Feed.CannotRepair`'s `continueAt` | Shape of R10. What must be true: what remains is still delivered after the notice | R10 | S7, RV3 M3 | A | limit |
| X18 | Rule numbers 67–72, renumbering from 61–66, and "the pump" as a term | Merge mechanics | I2 | SC 1, 11 | C | limit |
| X19 | Two recipes (per-session transport, SDK-owned), documented per source | One way to state C9 and L6 | C9, L6 | RV2 X1 | A | limit |
| X20 | Ref-counted channels in an app's Ably service | Sample-level fix | L6, L7 | RV5 M1 | C | limit |
| X21 | The `Dropped`-state `owed` flag, and "one `missed` per interruption" as a counter | Shape of G3 | G3 | 3.1 | B | limit |
| X22 | Defaults (`resetAfter` 1 minute, `bufferSize` 1,024, emptyRun ≥ 2, finalizer race 3 s, evidence ring 256) | Values. What binds is that a default exists and is safe | C2, M1, R11, L11, M7 | S5 | C | limit |
| X23 | `DuplicateStreamSession` removal, `persist` removal | Clean-up of the old plan | I2 | S5, S11 | C | limit |
