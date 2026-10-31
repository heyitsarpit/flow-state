# Reference coverage: each API across very different situations

**Status: proposed.** Nothing here is decided. It maps the design against the reference code and proposes where the
uncovered parts go. Every placement, every reshape of an existing module, both new apps, the new desk modules and the
Story direction in section 6 are proposals for the owner to accept or reject in numbered rounds.

**Goal (the owner's).** Coverage is not "each API appears once". Each API shows up in **very different situations**
and is **used differently** in each, so a reader sees its range. The target is at least three situations per API that
use it differently, never three copies of one use. The code need not live in one app; a small new app is justified
when it opens new situations, not only new APIs.

**Sources.**

| Short | Document |
| --- | --- |
| MD | [machine-design.md](explorations/machine-fragments/machine-design.md): fragments and the turn (2.1–2.6, rules 1–12), operations (2.7, rules 13–25, N1–N3, 39–47), entities (2.8, rules 26–38, merge 5's M5-D1–D10), fragment operations (2.9, rules 48–60), Stories (2.10, rules 61–66), keywords (3.6) |
| ED-D | [design/entity-domain.md](design/entity-domain.md): `.alsoChanges`, `.derivedFrom`, `.ignoring`, conditions, `Entity.queue` |
| M6 | [merge-6-streams/proposal-v2.md](explorations/machine-fragments/merge-6-streams/proposal-v2.md) revision 7.1, [decisions-v2.md](explorations/machine-fragments/merge-6-streams/decisions-v2.md) S1–S10. **Not merged:** every streams row is **PM6** |
| PB | [playback.md](explorations/playback.md): frames, `StoryFrame`, `StoryPlayer`, presentations |
| DD | [dispatch-desk/](dispatch-desk/): [README.md](dispatch-desk/README.md), [REVIEW.md](dispatch-desk/REVIEW.md), the code |
| FP | `apps/features/src/pages/*.mdx`: the keyword list per area |

**How to read the map.**

- Each row is one API (a keyword, or a pattern of keywords that only makes sense together).
- Columns **A**, **B**, **C** (and sometimes **D**) are **situations**: a module or app (codes in section 1) and, after
  the dash, **what is different about how the API is used there**. *today* means the desk shows it now; everything else
  is proposed.
- **Today** counts the desk as it is: **none**; **once** (one situation, or several modules using it the *same* way,
  marked "same template"); **several** (two or more situations that use it differently).
- **Target** is the number of distinct situations wanted: 3 unless the row says otherwise.
- "(misuse Mn)" means the code exists but REVIEW.md found it wrong.

---

## 1. The situations

A situation is a module in a setting. The four axes the owner named, per module:

| Code | Module | Domain | Data shape | Lifetime | Failure profile |
| --- | --- | --- | --- | --- | --- |
| **ED** | desk Editor (existing) | ops | one record | a screen; writes outlive it | flaky network, lock conflicts |
| **QU** | desk Queue (existing, reshaped) | ops | a filtered list; bulk sets | a screen | other dispatchers, partial bulk failure, overload |
| **CM** | desk Comments (existing) | ops / conversation | a list under a record | a drawer that resets per ticket | flaky network, refused text |
| **UP** | desk Uploads (existing) | ops | copies carrying bytes | across reload (bytes lost) | slow network, user cancel, file gone |
| **FE** | desk Feed (existing, PM6) | ops | a stream of facts | across reload | socket drops, history truncated, log reset |
| **PR** | desk Presence (existing, rewritten, PM6) | ops | a single current value | a screen | SDK quirks, SDK's own reconnect |
| **AS** | desk Assistant (existing, reshaped, PM6) | AI | a stream of tokens into one value | a screen | stalls, truncation, refusal |
| **FD** | desk Find (new) | ops | ephemeral results | per keystroke | slow and stale responses |
| **RW** | desk Resolve wizard (new) | field work | a tree of steps; a parts list | a subroutine's life | abandonment, late endings |
| **IN** | desk Inspector (new) | ops | a tree of tabs | frozen across tab switches | reads cut by freezes |
| **FB** | desk Field board (new, PM6) | field work | keyed current values | a long-lived wallboard | poller offline, stale values |
| **AD** | desk Roster admin (new) | admin | related entities (technicians, teams, customers) | a screen | merge conflicts, refused deletes |
| **CK** | Checkout app (new) | payments | one intent; cart lines; refunds per charge | across reload; background capture | double-charge risk, SDK (Stripe.js), 3-D Secure, compensation |
| **NB** | Notebook app (new) | docs and chat | one doc of fields; a message list; keyed cursors | across reload and tabs | offline, 412 conflicts, storage quota, SSE gaps |

Why two apps and not more desk modules: payments (CK) and collaborative docs (NB) open situations a desk cannot host
without looking forced: never charging twice against a third party, compensation on leave, last-write-wins field saves,
SSE and a collaboration SDK, and two tabs as the normal path. The desk gains four modules (FD, RW, IN, FB) and an admin
module (AD) because ops, field work and admin situations do fit a dispatcher's tool.

---

## 2. The map

### 2.1 Fragments and the turn

| # | API | Design | Today | A | B | C | Target |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | trait with no I/O | MD 2.1, rule 3 | none | **CK** `Countdown` — a visible 3-D Secure timer, armed on an event | **IN** `Reservation` — a parts-hold timer that must survive a freeze | **NB** `Field` — synchronous validation per field, no timer at all | 3 |
| F2 | writing trait (a trait that declares `operations`) | MD 2.9, rules 48–50 | once | **CM** *today* — placed on two hosts, one with `resetOn`; A-B-A adoption | **NB** `Reactions` — a plain `optimistic` write, placed on a message and on the doc | **IN** `History` — a read plus a "pin note" write, inside a resumable tab | 3 |
| F3 | trait on a node, `Flow.state(…, { traits })` | MD 2.1, 2.3, rule 1 | none | **IN** — one trait per tab node | **RW** — a signature pad trait only on SIGNOFF | **CK** — `Countdown` only on CHALLENGE | 3 |
| F4 | `.each` over a memory list, pure copies | MD 3.3, rule 9 | none | **CK** `QuantityStepper` per cart line — the host owns the writes | **RW** `PartLine` per part used — validation only | **NB** `TagChip` per tag — removed by a copy's exit-like `notify` | 3 |
| F5 | `.each` over keys a live source fills | MD rule 9, 2.7.10 | none | **FB** `TechCard` copies over `memory.visible`, filled from the board's filter | **QU** `RowFlash` copies over rows a push just changed | **NB** `CursorLabel` copies over collaborators the cursor feed reports | 3 |
| F6 | `.each` copies that own writes | MD 2.9.6, rules 48, 51 | once | **UP** *today* — commit on creation, release on abandon | **NB** `Autosave` per field — `latest`, debounced, never released | **QU** `AssignToggle` per row — `latest` toggle owned by the row, not the queue | 3 |
| F7 | `.each` options: `max`, `by`, `E.x.key(k)` | MD rule 9 | once | **UP** *today* — `max` refuses a sixth file | **NB** — `by` orders fields by schema position | **CK** — `E.line.key(k).Increment` from a line's own button | 3 |
| F8 | leaf subroutine (`Confirm`) left by exits | MD 2.1, 3.2, rule 6 | none | **RW** `ConfirmDiscard` — nested inside another subroutine | **CK** `ConfirmRemove` — its exit carries which line | **NB** `ConfirmLeave` — entered only while writes are unsettled | 3 |
| F9 | subroutine with states and `.history` | MD 3.2 | none | **RW** wizard — Back returns to the last step (`.history`) | **CK** address step — returns to the exact field (`.history.child`) | — | 2 |
| F10 | `exits` with data | MD 2.2, 3.2 | none | **RW** `Resolved { resolution }` | **CK** 3-D Secure `Passed { authId }`, `Declined { code }`, `TimedOut` | **NB** `ConfirmLeave` `LeaveAnyway` | 3 |
| F11 | a subroutine that owns a write; its ending arrives after the exit | MD rules 48, 53 | none | **RW** `resolve` lands after the wizard was left | **CK** the challenge's confirm lands after a `TimedOut` exit | — | 2 |
| F12 | `.resumable()`: freeze, thaw, `dueAt` kept | MD 2.1, 2.4 rule 1 | none | **IN** tabs — reads cut on freeze, restarted on thaw | **CK** `Countdown` under a help overlay — time keeps running while frozen | **NB** chat composer per room — a frozen draft per room | 3 |
| F13 | `resetOn` (value) and the pin commit (3.4) | MD 3.4, rule 56 | once | **QU** preview *today* — follows the selected ticket, writes parked | **CK** checkout — resets on a new cart id; waits for its own write (pin) | **IN** tabs — resumable, but fresh when the ticket changes | 3 |
| F14 | `whenAbandoned` | MD rule 60, 3.5 | once | **UP** *today* — key-less `cancel`: the bytes are worthless | **CM** *today* — no cancel: a comment is intent | **RW** — notify only; the resolution draft survives (3.5) | 3 |
| F15 | `guards`, `callbacks`, `Flow.optional` ports | MD 2.2, rule 5 | once (same template: one `onFailed`) | **RW** `canResolve` guard with denial codes | **CK** `mayPay` guard reading the host's context | **NB** optional `onConflict` callback; absent on the read-only viewer | 3 |
| F16 | `hostEvents` with `raise` | MD 2.2, rule 2 | none | **RW** `JumpTo { step }` from the step bar | **IN** `OpenTab { tab }` from a deep link | — | 2 |
| F17 | `notify` | MD 2.2, rule 6 | once (same template) | **RW** `Progressed { step }` drives the host's step bar | **NB** `Saved { field }` feeds the doc's "all saved" badge | **CM** *today* — failures only | 3 |
| F18 | nesting hides the level below | MD rule 10 | none | **RW** wizard → `ConfirmDiscard` | **IN** tab → `Reservation` | **CK** challenge → `Countdown` | 3 |
| F19 | `Flow.private`, `Flow.annotate({ denials })` | MD 2.2.1, 2.2.2 | none | **RW** — private step bookkeeping; annotated guard | **CK** — private challenge state; annotated `mayPay` | **IN** — private scroll anchors | 3 |
| F20 | `Flow.input`, `Flow.initial`, `Flow.uncertain`, `internalEvents` | MD 2.2 | several | **ED**, **QU**, **CM** *today* | | | done |
| F21 | the turn: before/after memory, ordered alternatives, `deny`, `check()` | MD 2.5, rules 7, 22 | several | **ED** *today* — saved vs draft compared after the outcome | **FD** — `TooShort` denial shown under the box | **CK** — Pay button's `check()` reasons rendered as help text | 3 |
| F22 | shared actor; context from another actor | FP runtime, MD 2.10.1 | once | **DD** Toasts, Session *today* | **NB** `Outbox` — a shared actor others report to | **CK** — guest vs signed-in context changes the flow | 3 |
| F23 | sending into another actor's fragment | DD gap 3 | once | **AS** *today* — "Use as comment" | **NB** — "Quote into doc" sends into the doc's `Reactions` copy | — | 2 |

### 2.2 Operations and write lanes

| # | API | Design | Today | A | B | C | D | Target |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | the hold: `unknown` keeps the Attempt, the same Attempt is re-sent | MD rules 18–21, 2.7.13 | once (same template ×4: ED, QU, CM, UP) | **ED** *today* — re-sent on a schedule with `retryable`, then `cancel` | **CK** — a payment that must never double-charge: no blind re-send; a reconcile `lookup` decides, then the hold is released | **NB** body — an etag'd autosave; a re-send that meets 412 ends `StillUnknown` | **QU** bulk — the held head blocks a `serialize` FIFO, so order is kept | 4 |
| O2 | contract `commit` over a real source | MD 2.7.2 | once (`fetch`, XHR) | **ED** *today* — `fetch` with `AbortController` | **CK** — Stripe.js Promises, no signal; `Idempotency-Key: attempt.id` | **QU** — `RequestResolver` batching per-item statuses below the commit | **NB** — the collaboration SDK's calls | 4 |
| O3 | `reject` | MD 2.7.8 | several | **ED** *today* — one save at a time; a second is declined | **CM**, **UP** *today* — keyed per call, so it never refuses a different post | **CK** pay — a double click is `NotSent { Rejected }`, mapped to nothing visible | | 3 |
| O4 | `latest`: a newer commit replaces the queued one | MD 2.7.8, C10 | none | **NB** title, tags — last write wins, `Superseded` evidence | **CK** quantity — rapid taps send at most two requests | **QU** assign toggle — assign, unassign, assign sends once | | 3 |
| O5 | `latest` behind a held unknown | MD 2.7.8 (`setLike`), rule 29 | none | **QU** — a toggle while the assign is unsure waits behind the hold | **CK** — a quantity change on an unsure line waits, then goes | **NB** — a tag edit waits behind an unsure tag save | | 3 |
| O6 | when **not** to use `latest` | MD 2.9.6 | none | **NB** body — an etag would be stale, so `reject` and coalesce in the fragment | **ED** — an explicit Save must not race the lock; `reject` | — | | 2 |
| O7 | `serialize`: FIFO ≤ 64, `outstanding`, `Overloaded` | MD 2.7.8, rule 35 | none | **QU** bulk per workspace — operations apply in order | **CK** refunds per charge — money order matters | **NB** chat sends per room — messages arrive in the order typed | | 3 |
| O8 | `cancel`: a newer commit interrupts the one on the wire | MD 2.7.8, rule N2 | none | **AS** — Regenerate interrupts the streaming reply | **CK** — a new address interrupts the shipping quote | — | | 2 |
| O9 | `allow`: per-Attempt lanes | MD 2.7.8, rule N2 | none | **FB** Nudge — many at once, each toasts its own result | **NB** typing pings through the SDK — fire and forget | **AD** invite emails — key-less handling in each ending's own turn | | 3 |
| O10 | endings current, late, adopted; late turns; `LateMayNotLeave` | MD rules 14, 15, 20 | once (misuse M1, M2) | **ED** *today* — late after Close, adopted on reopen | **RW** — late after the wizard's exit | **CK** — the challenge's ending after `TimedOut` may not leave PAID | | 3 |
| O11 | declines as endings: `NotSent { Rejected, Overloaded, Disposed, StorageRefused, Cancelled }` | MD rule 16, 2.7.1 | once | **CM** *today* — `Rejected` from another subject path | **QU** — `Overloaded` at the 65th bulk op | **NB** — `StorageRefused` on a full quota | **CK** — `Disposed` | 4 |
| O12 | `unknown` reasons: `Restored`, `StillUnknown`, `Interrupted`, `Defect` | MD 2.7.1, rule 18 | once (misuse M4) | **UP** *today* — `Restored` means the bytes are gone | **CK** — `StillUnknown { AlreadyCaptured }` | **NB** — `Restored` mid-autosave: re-send the coalesced value | | 3 |
| O13 | `attempt.id`, `retryCount`, `mayHaveApplied` | MD rule 19 | once | **ED** *today* — idempotency header | **CK** — `mayHaveApplied` decides the receipt's wording | **NB** — the SSE echo is matched to the draft by `attempt.id` | | 3 |
| O14 | holds outlive the actor; parked endings; adoption | MD rules 44, 53, 54 | several (misuse M13, M14) | **ED**, **CM**, **UP** *today* | **CK** — the receipt appears after the tab was closed and reopened | **NB** — a doc closed mid-autosave adopts it on reopen | | 3 |
| O15 | every hold has an owner; `UnresolvedHold` | MD rule 45 | once | **ED** *today* — CLOSED's `Reopen` | **RW** — the wizard's host owns its hold after exit | — | | 2 |
| O16 | `runtime.unsettledWrites()` | MD rule 44 | once | **DD** host *today* — `beforeunload` | **NB** `Outbox` — a panel listing every unsettled write | **CK** — leave-page warning only while capturing | | 3 |
| O17 | lane `progress` | MD rule 21, M6 S5 Q11 | once | **UP** *today* — XHR bytes | **AS** — tokens (PM6) | **NB** — a pasted image's upload | | 3 |
| O18 | unkeyed operation, key-less members | MD rule 43 | none | **CK** coupon — one per cart | **AD** — "rebuild roster index", one per workspace | — | | 2 |
| O19 | per-item batch results (`RequestResolver`) | MD 2.7.11 | none | **QU** bulk close | **AD** bulk invite | — | | 2 |
| O20 | compensation on leave; contract `orphaned` | MD 2.7.7 | none | **CK** — void the authorization when checkout is left | **RW** — release reserved parts when the wizard is abandoned | **CK** — `orphaned` re-sends across a version change | | 3 |
| O21 | plain write with `optimistic` | MD rule 36 | none | **NB** reactions | **CK** coupon — predicted total in memory | **FB** "on break" toggle | | 3 |
| O22 | the operation's `writes` option | MD rule 36 | once | **CM** *today* — invalidates the thread | **NB** — a post invalidates the doc's comment count | **CK** — a refund invalidates the order total | | 3 |
| O23 | mapped events only from endings; named operations in small actors | MD rules 40–42, 47 | several | **PR**, **AS** *today* | | | | done |

### 2.3 Reads and schedules

| # | API | Design | Today | A | B | C | Target |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | live read in `activities`, `refetch` | MD rules 41, 42 | several | **QU**, **ED**, **CM** *today* | **AD** — a roster read beside a `listen` | | done |
| R2 | one-off `lookup`: one lane, latest delivered, `Superseded` | MD 2.7.9 | none | **FD** — per keystroke; stale answers never arrive | **CK** — a reconcile poll after an unknown charge | **RW** — a part number lookup a state waits on | 3 |
| R3 | key-less `cancel` of a lookup | MD 2.7.9 | none | **FD** — an empty box | **CK** — stop polling once the webhook confirmed | — | 2 |
| R4 | read failures `Defect`, `Interrupted` required | MD 2.8.10 | once (misuse M5) | **ED** *today* | **FD** — a failed search keeps the last results, dimmed | **RW** — a failed part lookup lets the step continue unvalidated | 3 |
| R5 | paging on a live read (plan's proposed `more`, `hasMore`) | DD gap 23 | once | **QU** *today* — forward pages | **NB** — chat scrollback, older pages | **AD** — roster pages under a sort | 3 |
| S1 | debounce with `restartOn` | MD rule 23 | once | **ED** *today* | **FD** — per keystroke, then a `lookup` | **NB** — keyed, per field | 3 |
| S2 | keyed schedules (`keys`) | MD 2.7.10 | once (same template: resend per uncertain key) | **QU** — an SLA deadline per ticket | **NB** — a debounce per field | **CM** *today* — resend per post | 3 |
| S3 | `armOn`, `disarmOn` | MD rule 23 | once | **UP** *today* | **CK** — armed when the challenge is shown | — | 2 |
| S4 | `s.schedules`, `dueAt`, `useNow` in a view | MD 2.1, FP views | none | **QU** — "breaches in 12 min" | **CK** — challenge countdown | **FB** — "seen 40 s ago" from `last.at` | 3 |
| S5 | backoff from memory; `Schedule.*` | MD 2.7.6 | several | **ED**, **FE**, **PR** *today* | | | done |

### 2.4 Entities

The desk has one entity (Ticket), one domain plus the feed's `listen` domain, two predicting writes, one list with
`eq`/`and`/`serverMatches`, and `Ticket.get` in two views. This block gives entities the same range as the rest.

| # | API | Design | Today | A | B | C | D | Target |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | several entities with relations (key fields naming another entity; `.alsoChanges`) | ED-D 1.1, 4.6 | none | **AD** — `Technician` belongs to a `Team`; moving one `.alsoChanges` both teams' counts | **CM** — `Comment` as an entity; a post `.alsoChanges` its `Ticket.commentCount` | **NB** — `Message` in a `Room`, `Reaction` counts on a message | **QU** — `Ticket.assignee` names a `Technician`; rows show the technician's name from its own record | 4 |
| E2 | many-record writes (a `many` key array; cap 4,096, `Overloaded`) | MD rule 35, M5-D9 | none | **QU** bulk close — one write predicts N tickets of one entity | **AD** merge customers — predicts a delete, a patch and N re-pointed tickets across two entities | **NB** "mark room read" — N messages, no list moves | | 3 |
| E3 | deletes (`Entity.delete`) restored on a definite failure | MD rule 30, 2.8.2 | none | **UP** — remove an attachment; 403 restores it | **NB** — delete a message; past the edit window the server refuses, it reappears in place | **AD** — remove a technician who has open tickets; 409 restores the row | | 3 |
| E4 | a record leaves or joins a list because of a prediction | MD rules 28, 30 | once | **QU** — assign predicts `assignee`, so the ticket leaves "Unassigned" (`isNull`) and joins "Mine" at once | **FB** — a dispatch from QU predicts `status: "busy"`, so the technician moves column on the board (another actor) | **NB** — pin predicts `pinned`, so a message joins "Pinned" | **CK** — a refund predicts `status: "refunding"`, so it leaves "Completed" | 4 |
| E5 | three-valued conditions with `and`/`or`/`not`, nullable fields | M5-D7, M5-D8 | once (`eq`, `and`, `serverMatches`) | **QU** — `or(eq(priority, "urgent"), and(isNull(assignee), lt(dueAt, input.now)))`; a predicted field not carried makes it maybe, so it refetches | **AD** — `or(eq(teamId, input.team), isNull(teamId))`: my team or unplaced | **NB** — `and(contains(mentions, input.me), isNull(readAt))`: unread mentions | | 3 |
| E6 | multiple sort keys; a null sort pair is skipped | M5-D4, MD 2.8.2 | once (`updatedAt`, keys) | **QU** — `desc(priority)`, `asc(dueAt)` with nullable `dueAt`, then keys | **NB** — `asc(createdAt)`, `asc(id)` for messages | **AD** — `asc(team)`, `asc(name)`, keys | | 3 |
| E7 | cross-actor coherence: one record on two screens, an optimistic write while the other holds it | MD 2.8.4 | once | **ED**+**QU** *today* — a title save shows in the queue row | **FB**+**AD** — an admin rename while the board shows the technician | **NB** — a message edited in the chat while the doc's mention sidebar shows it | **CK** — mini-cart header and cart page show one line | 4 |
| E8 | record-queue ordering across actors | MD rule 29, 2.8.5 | once | **ED**+**QU** *today* (`assign-repairs`) — save then assign on one ticket | **QU** bulk close vs **ED** save — a FIFO of N and one save meet on one record | **NB** — the doc's title autosave vs a rename from the sidebar list | | 3 |
| E9 | `predicted`, `uncertain`, `unconfirmed` shown distinctly | MD 2.8.12 | once (misuse M9, M10) | **QU** row badges — italic predicted, a "?" for uncertain, "checking" for unconfirmed | **NB** message — "sending", "may not have saved", "edited, confirming" | **AD** roster row — greyed while predicted, a retry chip when uncertain | | 3 |
| E10 | `listen` feeding records beside a domain read (PM6) | M6 2.8 | once | **FE**+**QU** *today* — socket pushes into the ticket list | **NB** — SSE message pushes beside the message list read | **AD** — technician changes from a polling-with-cursor fact feed beside the roster read | | 3 |
| E11 | `checkReplays` (on in Stories and `propertyTest`) | M5-D10 9.9 | none | **QU** — the predicted status field replays over a pushed base | **NB** — a reaction count `(beneath, input) => …` replays over a new base | **CK** — a line total replays when the price changes under it | | 3 |
| E12 | `Entity.queue` in Inspection and Stories | ED-D 6.3, C30, C84 | none | **QU** — bulk vs save removals (`Superseded`, `Released`) | **AD** — the merge's queue across two entities | **NB** — autosave vs rename on one doc | | 3 |
| E13 | creates as `creating` drafts (no temporary ids) | MD 2.8.7, rule 33 | none (CM drafts are the plain version) | **QU** — new ticket, shown apart until the list holds its id | **NB** — a sent message, matched by the SSE echo | **AD** — invite a technician | | 3 |
| E14 | predicted field functions `(beneath, input) => value` | M5 | none | **NB** reaction counts | **CK** line totals | **AD** team counts | | 3 |
| E15 | derived reads (`.derivedFrom`) | ED-D | once | **QU** *today* — open count | **AD** — technicians per team | **NB** — unread count per room | | 3 |
| E16 | a domain write beside a plain write with `optimistic` | MD 2.8.3, rule 36 | none | **NB** — message edit (domain) and reactions (plain) on one screen | **CK** — cart line (domain) and coupon (plain) | — | | 2 |
| E17 | unknown in a domain: forced repair; what clears `uncertain` | MD rules 30–32 | once | **ED** *today* | **QU** bulk — N records marked, cleared by one retry | **AD** merge — uncertain across two entities | | 3 |
| E18 | lanes and predicted keys persist together; reload | MD rule 38 | once (prose) | **DD** `persistence.ts` *today* | **NB** — reload mid-edit marks the message uncertain and repairs | **CK** — reload mid-refund | | 3 |
| E19 | `.byKey`, `Entity.get`/`pick` (total), `.ignoring` | ED-D | once | **ED** *today* | **AD** — `.ignoring(lastSeenAt)` so presence churn never repairs lists | **NB** | | 3 |

### 2.5 Streams (all **PM6**)

| # | API | Design | Today | A | B | C | Target |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | fact feed with catch-up: `Feed.reconnect` `from`, `position`, `catchUp` | M6 2.3, S3, S6 | once (misuse S-M2, S-M3) | **FE** *today* — raw WebSocket, cursor pages | **NB** — SSE, `Last-Event-ID` replay as the proof | **AD** — polling with a cursor, every connection a loop of GETs | 3 |
| T2 | `Feed.CannotRepair`, `missed { Lost }`, `initial` | M6 S7, S9, S10 | once | **FE** *today* | **NB** — chat history truncated; the room shows "older messages unavailable" | **AD** — a first registration with an empty roster ignores `initial` | 3 |
| T3 | `Feed.live()`, `{ proof }`, `{ lost, restartAt }` | M6 2.3 | several | **FE**, **PR** *today* | **NB** — the SDK's resume flag as the proof | | done |
| T4 | `Feed.down(reason)`, the row's `drop` | M6 2.3, 2.6 | none | **FB** — the poller's network drops | **NB** — the browser goes offline | **PR** — the SDK reports a disconnect it will retry itself | 3 |
| T5 | state feed: `connection`, `value`, `last { value, at }`, `resetAfter` | M6 2.6 | once | **PR** *today* — the viewer list | **FB** — technician status, stale after a minute | **NB** — a cursor position, dimmed when old | 3 |
| T6 | `subscribe.each`: one session per key | MD 2.7.10, M6 | none | **FB** — per technician on the board | **NB** — per collaborator | **QU** — presence per visible row, keys follow scrolling | 3 |
| T7 | an SDK through `Feed.callback(register, { bufferSize })` | M6 2.4 S, 3.3, 4.7 | none | **PR** — a vendor presence SDK, the SDK's reconnect kept | **NB** — a collaboration SDK, `emit` back-pressure | — | 2 |
| T8 | raw WebSocket recipe P (bounded queue, `Overflow`, close codes) | M6 2.4, 4.1 | once (misuse S-H1) | **FE** *today* | — | — | 1 |
| T9 | machine-level re-open vs the SDK's budget | M6 4.1, S5 Q3 | once (same template ×2) | **FE** *today* — RETRY_WAIT | **PR** — no RETRY_WAIT; the SDK's budget is the budget | — | 2 |
| T10 | streamed write: `progress(p)`, Stop | M6 2.9, 4.4 | once | **AS** — tokens, interrupted by Regenerate | **UP** — `progress(p)` from XHR | — | 2 |
| T11 | streams across reload and SSR (cursor in memory, released at capture) | M6 2.10, S4 | once | **FE** *today* | **NB** — chat resumes from the persisted cursor | — | 2 |

### 2.6 Runtime, persistence, reload, tabs, SSR

| # | API | Design | Today | A | B | C | Target |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | `app`, setups, `actorRef`, `ensureActor`, lazy entries | FP runtime | several | **DD** *today* | | | done |
| P2 | `retain`, `disposeActor`, `forget` | FP runtime | once | **DD** host *today* | **NB** — closing a doc keeps it warm for a minute | **CK** — `forget` after the receipt | 3 |
| P3 | reload mid-write | MD 2.7.15, 2.10.10 | once | **ED** *today* — acknowledged save re-held | **CK** — an unacknowledged charge is `NotSent { Restored }`: never charged | **NB** — a coalesced autosave: only the sent value is a lane | 3 |
| P4 | two tabs (the second runs without persistence) | MD 2.10.10 | once | **ED** *today* | **NB** — two tabs on one doc, the second says "read-only here" | **CK** — paying in a second tab is refused by the intent's `reject` | 3 |
| P5 | storage refusal | MD 2.7.13 | none | **NB** — quota full | — | — | 1 |
| P6 | a non-durable payload beside persisted memory | DD gap 15 | once | **UP** *today* | **NB** — a pasted image | — | 2 |
| P7 | SSR: `dehydrate`, `hydrate`, `DehydrateCommitInFlight` | MD 2.7.15 | once | **QU** *today* | **CK** — a cart page with a coupon commit in flight | **NB** — a doc page; streams released at capture | 3 |
| P8 | rebind across versions | MD 2.7.7, P19 | none | **CK** | — | — | 1 |

### 2.7 Inspection and `flow check`

| # | API | Design | Today | A | B | C | Target |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I1 | Inspection listing: lanes, incarnations, sessions, `Entity.queue` | MD 2.10.7, M6 2.12 | once | **DD** `tools/inspection.ts` *today* | **CK** — an unknown charge's lane | **NB** — sessions per collaborator | 3 |
| I2 | `flow explain` | MD 2.7.16 | once | **DD** *today* | **RW** — a subroutine's exits | **CK** — a challenge's late ending | 3 |
| I3 | findings that fire: `UnresolvedHold`, `SharedContract`, `KeyRequired`, `VerbMismatch`, `DuplicatePlacement`, `KeyOmitsInput`, `UnusedOperation`, `LateMayNotLeave`, `DehydrateCommitInFlight`, `PredictionNotRetained`, rule 20 rows, rule 56 | MD 2.7.16, M5 | once (commands only) | **DD** `tools/findings/` — one wrong file each | organic: **QU** rule 56 accepted, **CK** `DehydrateCommitInFlight` | — | 1 each |
| I4 | stream findings: `FeedUnhandled`, `ListenNeedsFacts`, `DuplicateSession`, `DuplicateListen`, `UnprovenValues`, `RegistrationChurn` (PM6) | M6 2.12 | once | **DD** `tools/findings/` | organic: **FB** `ListenNeedsFacts` if a state feed were listened | — | 1 each |

### 2.8 Stories

| # | API | Design | Today | A | B | C | Target |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Y1 | machine, app and fragment-alone Stories | MD rules 11, 58, 61 | several | **ED**, **DD**, **CM** *today* | **RW** — a subroutine alone in the stand-in host | | done |
| Y2 | `Fake.server` truth (an Effect Schema) and controls | MD 2.10.4 | once (`Schema.declare`, gap 35) | **DD** | **CK** `StripeFake` — `busy`, `challenge`, `webhookTwice` | **NB** `NotesFake` — `conflict`, `truncateHistory` | 3 |
| Y3 | `hold`, `release`, `drop`, `match` | MD 2.10.4, rule 65 | several (misuse M15) | **ED** *today* | **CK** — drop the charge's response | **NB** — hold the SSE replay | done |
| Y4 | `duplicate` | MD 2.10.4 | none | **CK** — the webhook arrives twice | **NB** — SSE redelivers an event | — | 2 |
| Y5 | `together`, `release({ nth })`, `advance({ to })`, `advance(…, { suspended })`, `checkpoint(…, { at })` | MD 2.10.3, 2.10.6 | none (`nth` in the property test only) | **QU** — `together` for two dispatchers; `advance({ to })` an SLA | **CK** — `together` for two tabs paying | **NB** — `suspended` for a closed laptop lid | 3 |
| Y6 | `Fake.fetch`, `Fake.webSocket` over the real adapter | MD 2.10.4, M6 2.11 | none (misuse S-H2) | **FE** — `Fake.webSocket` | **NB** — `Fake.fetch` with a streamed SSE body | **CK** — `Fake.fetch` under the Stripe adapter | 3 |
| Y7 | `Fake.storage` `.seed`, `.from(story)`, `reload`, `openTab`, `closeTab` | MD 2.10.10 | once | **ED** *today* | **NB** — seed a stale outbox; continue from another Story | **CK** — reload mid-charge | 3 |
| Y8 | `Story.records`, `Story.inspection`, `Story.entity`, `Story.attempt` | MD 2.10.6–2.10.8 | several | **DD** *today* | | | done |
| Y9 | property tests | MD 2.10.16 | once | **DD** *today* — converges | **CK** — never charged twice; every authorization captured or voided | **NB** — a message never shows twice | 3 |
| Y10 | Story as a raw transcript; checks in `@flow-state/vitest` with typed `at.<checkpoint>` (owner's direction, **proposed**) | — | none | every module (section 6) | | | all |

### 2.9 Playback and exploration

| # | API | Design | Today | A | B | C | Target |
| --- | --- | --- | --- | --- | --- | --- | --- |
| X1 | named checkpoints | MD 2.10.6 | several | **DD** *today* | | | every Story |
| X2 | `StoryFrame` (one frame; `tab`) | PB 5 | once (gap 11) | **DD** *today* | **NB** — two tabs side by side | — | 2 |
| X3 | `StoryPlayer` and `definePresentation` | PB 6 | none | **DD** desk tour | **CK** "Pay safely" | **NB** "Two tabs, one notebook" | 3 |
| X4 | next-action highlight into a keyed copy or a nested subroutine | MD 2.10.13 | none | **RW** — into `ConfirmDiscard` | **NB** — into one field's `Autosave` copy | — | 2 |
| X5 | gaps (actors a frame lacks) | PB 5 | none | **DD** desk tour | — | — | 1 |
| X6 | failure replay of a property counterexample | PB 8 | none | **CK** | — | — | 1 |
| X7 | `flow stories --coverage` | MD 2.10.15 | once | every app | | | per app |

### 2.10 Counts (today)

| Family | none | once | several | rows |
| --- | --- | --- | --- | --- |
| Fragments and the turn (F) | 12 | 9 | 2 | 23 |
| Operations (O) | 10 | 10 | 3 | 23 |
| Reads and schedules (R, S) | 3 | 5 | 2 | 10 |
| Entities (E) | 8 | 11 | 0 | 19 |
| Streams, PM6 (T) | 3 | 7 | 1 | 11 |
| Runtime and persistence (P) | 2 | 5 | 1 | 8 |
| Inspection and `flow check` (I) | 0 | 4 | 0 | 4 |
| Stories (Y) | 4 | 3 | 3 | 10 |
| Playback (X) | 4 | 2 | 1 | 7 |
| **Total** | **46** | **56** | **13** | **115** |

Only 13 of 115 APIs are shown today in two genuinely different situations, and no entity API is. Targets: 76 rows aim
at three situations or more (6 of them at four), 20 at two, 5 at one (T8, P5, P8, X5, X6: each has one natural home),
2 at one wrong file per finding (I3, I4), and 9 rows are already done; the last 3 apply to every Story or app.

---

## 3. Sameness: the template every desk module shares

The owner's observation is right: the desk's modules are one template filled in seven times.

| Part | The template | Where it repeats |
| --- | --- | --- |
| **Machine shape** | a flat set of leaves under one active state: OPEN/EDITING/SAVING/UNSURE/FAILED, or LIVE/RETRY_WAIT/SIGNED_OUT. No subroutine, `.history`, node trait or resumable state | `editor.machine.ts`, `queue.machine.ts`, `feed.machine.ts`, `presence.machine.ts`, `assistant.machine.ts` |
| **Contract** | `transaction({ key: [...ids], concurrency: "reject", commit })`, with `unknownWhenLost` making `NoResponse` and `ServerError` unknown | `ticket.contracts.ts` ×2, `comments.contracts.ts`, `attachments.contracts.ts`, `assistant.contracts.ts`: five `reject`, no other mode |
| **Write style** | commit on a user event; `unknown: E.XUnsure`; a `resend` schedule, `retryable({ times: 3 })`, else `cancel` plus a toast or `problem` | editor UNSURE, queue `reconcile`, comments `resend`, upload `resend` (REVIEW 4, items 2–5) |
| **Read style** | a live placement plus `refetch`; never a `lookup`, never a read a state waits on | queue `list`, editor `ticket`, comments `thread` |
| **Failure handling** | every Flow reason mapped by hand to one event; streams' six-key `failure` to `FeedEnded` | editor, upload, assistant, comments; feed ×2, presence |
| **Stream style** | `subscribe` in LIVE; `FeedEnded` → RETRY_WAIT, doubling delay, one-minute `Healthy` reset; terminal SIGNED_OUT | `feed.machine.ts`, `presence.machine.ts` |
| **Entities** | one entity; `eq`/`and` lists; one-record `Entity.patch` predictions | `ticket.domain.ts`, `feed.domain.ts` |
| **Data source** | `fetch` or a raw WebSocket; one in-memory `Desk` fake for everything | `next/http-api.ts`; `testing/desk.fake.ts` (522 lines) |
| **Fragment style** | a root trait with I/O, one `onFailed` callback, one `notify` | `comments.trait.ts`, `upload.trait.ts` |
| **Story shape** | `Story.make(X, { fixtures: [DeskClient], world: [Desk.x.hold()] })`, `send`, `expect({ state, operations })`, `release`, `expect`; checkpoints in four files, no presentation | every `*.story.ts` |

**Rule for the placement (proposed).** Every module is built around a feature mix no other module uses, and says so in
a "How this module is different" line. The hand-written resend trio stays in **one** module (ED), where it is the point.
Two modules may share an API only if they use it differently (section 2's variation notes).

---

## 4. Gaps, grouped

1. **Concurrency range.** Only `reject` exists. `latest`, `serialize`, `cancel`, `allow` and the hold in a payment,
   an etag'd save and a FIFO (O1, O4–O9).
2. **Entities.** One entity; no relations, many-record writes, deletes, list moves by prediction, three-valued
   conditions, multiple sorts, `checkReplays`, `Entity.queue`, creates (E1–E19).
3. **Subroutines and lifecycle.** Subroutines, exits, `.history`, `hostEvents`, nesting, `Flow.private`,
   `Flow.annotate` (F8–F11, F16, F18, F19).
4. **Resumable and node traits; pure fragments.** F1, F3, F4, F5, F12.
5. **One-off reads.** R2–R4.
6. **Streams range (PM6).** `Feed.down`, `subscribe.each`, `Feed.callback`, SSE and polling recipes (T1, T4–T7).
7. **Money-shaped and SDK-shaped writes.** O2, O13, O18–O20, P3, P7, P8.
8. **Persistence edges.** P3–P5, Y7.
9. **Time on screen.** S4.
10. **`flow check` evidence.** I3, I4.
11. **Story tooling and playback.** Y4–Y7, Y10, X3–X6.

---

## 5. The placement proposal

Every module below lists what it contributes **and how its use differs** from the other modules using the same API.

### 5.1 Existing desk modules: keep, reshape or rewrite

| Module | Proposal | How this module is different |
| --- | --- | --- |
| **ED Editor** | **Keep; fix M1, M2, M12, M13.** The one home of the resend trio (O1 A) and of current/late/adopted routing (O10 A), with a routing table in its header. Its Save stays `reject` with a one-line pointer to NB for `latest` (O6 B) | the full hold: same Attempt re-sent, `retryable`, `cancel`, late after Close, adopted on reopen |
| **QU Queue** | **Reshape.** Assign becomes a per-row `AssignToggle` `.each` copy on `latest` (F6 C, O4 C, O5 A). Bulk close and bulk assign on a `serialize` lane per workspace with a `many` key (O7 A, E2 A), batched by `RequestResolver` (O2 C, O19 A), `Overloaded` at 65 (O11 B). Filters with `or`/`isNull`/`lt` and two sort keys (E5 A, E6 A); assign moves rows between lists (E4 A). New ticket as a draft, archive as a delete (E13 A). SLA keyed schedule with `useNow` (S2 A, S4 A). Presence per visible row by `subscribe.each` (T6 C) | the only module with `serialize` bulk, many-record writes of one entity, condition operators and time on screen |
| **CM Comments** | **Keep the two-host shape; reshape the data.** Comments become a `Comment` entity whose post `.alsoChanges` the ticket's count (E1 B); the resend schedule goes (manual Resend only). Fix M8, M16 | the only fragment placed on two hosts with `resetOn`; the only entity owned by a fragment |
| **UP Uploads** | **Keep; fix M3, M4.** Removing an attachment is an `Entity.delete` restored on 403 (E3 A). PM6: `progress(p)` (T10 B) | the only `.each` copy that commits on creation and releases on abandon |
| **FE Feed** | **Keep; fix S-H1, S-H2, S-M2, S-M3.** Stories through `Fake.webSocket` (Y6 A). Keeps the one machine-level RETRY_WAIT (T9 A) | the only raw-WebSocket recipe, `{ lost, restartAt }` and a `listen` into tickets |
| **PR Presence** | **Rewrite over a vendor presence SDK** through `Feed.callback` inside `Feed.reconnect` (T7 A); no RETRY_WAIT (T9 B); `Feed.down` from the SDK (T4 C) | the only desk transport that is a third-party SDK |
| **AS Assistant** | **Reshape to `concurrency: "cancel"`:** Regenerate interrupts (O8 A, T10 A). Fix S-H3, S-M1, S-M6 | the only `cancel` lane; the only streamed write |
| **Session, Toasts** | **Keep** | context and a shared actor |

### 5.2 New desk modules

**FD Find** (`features/Find/`): a command palette over tickets, customers and parts.

- Contributes: R2 A, R3 A, R4 B, S1 B, F21 B.
- Files: `find.contracts.ts`, `find.definition.ts`, `find.machine.ts`, `FindPalette.tsx`, `find.story.ts`, `find.test.ts`.
- **How this module is different:** no write and no live placement: one-off reads only, cancelled by clearing.

**RW Resolve wizard** (`features/Resolve/`): closing a ticket on site: reason, parts used, customer sign-off.

- Contributes: F3 B, F4 B, F8 A, F9 A, F10 A, F11 A, F14 C, F15 A, F16 A, F17 A, F18 A, F19 A, O10 B, O15 B, O20 B,
  R2 C, R4 C, I2 B, Y1, X4 A.
- Files: `resolve.contracts.ts`, `resolve-wizard.subroutine.ts`, `confirm-discard.subroutine.ts`, `part-line.trait.ts`,
  `signature.trait.ts`, `ResolveWizard.tsx`, `resolve.story.ts`, `resolve.test.ts`.
- **How this module is different:** built from subroutines, exits, `.history` and nested fragments; the only
  `hostEvents` from a step bar; compensation on abandon.

**IN Inspector** (`features/Inspector/`): the ticket's side panel with tabs History, Customer, Parts.

- Contributes: F1 B, F2 C, F3 A, F12 A, F13 C, F16 B, F18 B, F19 C.
- Files: `inspector.definition.ts`, `inspector.machine.ts`, `history.trait.ts`, `reservation.trait.ts`,
  `Inspector.tsx`, `inspector.story.ts`, `inspector.test.ts`.
- **How this module is different:** leaving a state freezes its fragments instead of ending them; a read cut by a
  freeze beside a write that outlives it.

**FB Field board** (`features/FieldBoard/`, PM6): a wallboard of technicians.

- Contributes: F5 A, O9 A, O21 C, S4 C, E4 B, E7 B, T4 A, T5 B, T6 A.
- Files: `field.contracts.ts`, `field.definition.ts`, `field.machine.ts`, `FieldBoard.tsx`, `testing/field.fake.ts`,
  `field.story.ts`, `field.test.ts`.
- **How this module is different:** all keyed state feeds with `subscribe.each`; the only `allow` lane; a list moved
  by another actor's prediction.

**AD Roster admin** (`features/Roster/`): technicians, teams and customers for a workspace admin.

- Contributes: E1 A, E2 B, E3 C, E5 B, E6 C, E7 B, E9 C, E10 C, E12 B, E13 C, E14 C, E15 B, E17 C, E19 B, O9 C, O18 B,
  O19 B, R1, R5 C, T1 C, T2 C.
- Files: `roster.contracts.ts`, `roster.domain.ts` (`Technician`, `Team`, `Customer`), `roster.definition.ts`,
  `roster.machine.ts`, `Roster.tsx`, `MergeCustomers.tsx`, `roster.story.ts`, `roster.test.ts`.
- **How this module is different:** several related entities in one domain; a merge that writes across two entities;
  a polling-with-cursor `listen`.

### 5.3 New app CK: Checkout (`references/checkout/`)

A storefront cart and checkout plus a merchant refunds page.

- **Situations it opens:** never charging twice against a third party; authorization holds and compensation; a
  challenge with a visible timer; refunds whose order is money; SSR with a write in flight.
- **Contributes:** F1 A, F3 C, F4 A, F7 C, F8 B, F9 B, F10 B, F11 B, F12 B, F13 B, F15 B, F18 C, F19 B, F21 C, F22 C,
  O1 B, O2 B, O3 C, O4 B, O5 B, O7 B, O8 B, O10 C, O11 D, O12 B, O13 B, O14 B, O16 C, O18 A, O20 A/C, O21 B, O22 C,
  R2 B, R3 B, S3 B, S4 B, E4 D, E7 D, E11 C, E14 B, E16 B, E18 C, P2 C, P3 B, P4 C, P7 B, P8, I1 B, I2 C, Y2 B, Y3 B,
  Y4 A, Y5 B, Y6 C, Y7 C, Y9 B, X3 B, X6.
- **Files.**
  ```text
  checkout/
    README.md
    features/Cart/     cart.contracts.ts  cart.domain.ts  cart.definition.ts  cart.machine.ts  quantity-stepper.trait.ts  confirm-remove.subroutine.ts  Cart.tsx  MiniCart.tsx  cart.story.ts  cart.test.ts
    features/Pay/      pay.contracts.ts  pay.definition.ts  pay.machine.ts  three-ds.subroutine.ts  countdown.trait.ts  Pay.tsx  pay.story.ts  pay.test.ts
    features/Refunds/  refunds.contracts.ts  refunds.domain.ts  refunds.definition.ts  refunds.machine.ts  Refunds.tsx  refunds.story.ts  refunds.test.ts
    adapters/stripe.ts            Stripe.js and fetch to typed values and errors (Effect-only)
    testing/stripe.fake.ts        truth as an Effect Schema; controls busy, challenge, webhookTwice
    testing/checkout.property.test.ts
    app/   app.ts  setup.ts  view.tsx  presentation.ts  demo.tsx
    next/  server-setup.ts  page.tsx
    tools/ cli.ts  inspection.ts
  ```
- **How this app is different:** a third-party SDK as the commit, a reconcile read instead of a blind re-send,
  compensation on leave, unkeyed operations, and SSR with a commit in flight. No streams.

### 5.4 New app NB: Notebook (`references/notebook/`)

A shared notebook: a document of fields and a body, a chat beside it, collaborators' cursors.

- **Situations it opens:** last-write-wins field saves beside an etag'd body; ordered chat sends; SSE and a
  collaboration SDK; offline; two tabs and reloads as the main path; storage quota.
- **Contributes:** F1 C, F2 B, F4 C, F5 C, F6 B, F7 B, F8 C, F10 C, F12 C, F15 C, F17 B, F22 B, F23 B, O1 C, O2 D,
  O4 A, O5 C, O6 A, O7 C, O9 B, O11 C, O12 C, O13 C, O14 C, O16 B, O17 C, O21 A, O22 B, R5 B, S1 C, S2 B, E1 C, E2 C,
  E3 B, E4 C, E5 C, E6 B, E7 C, E8 C, E9 B, E10 B, E11 B, E12 C, E13 B, E14 A, E15 C, E16 A, E18 B, E19 C, T1 B,
  T2 B, T3 B, T4 B, T5 C, T6 B, T7 B, T11 B, P2 B, P3 C, P4 B, P5, P6 B, P7 C, I1 C, Y2 C, Y3 C, Y4 B, Y5 C, Y6 B,
  Y7 B, Y9 C, X2 B, X3 C, X4 B.
- **Files.**
  ```text
  notebook/
    README.md
    features/Doc/      doc.contracts.ts  doc.domain.ts  doc.definition.ts  doc.machine.ts  autosave.trait.ts  body.trait.ts  field.trait.ts  tag-chip.trait.ts  confirm-leave.subroutine.ts  Doc.tsx  doc.story.ts  doc.tabs.story.ts  doc.test.ts
    features/Chat/     chat.contracts.ts  chat.domain.ts  chat.definition.ts  chat.machine.ts  composer.trait.ts  reactions.trait.ts  Chat.tsx  MentionsSidebar.tsx  chat.story.ts  chat.test.ts
    features/Cursors/  cursors.contracts.ts  cursors.definition.ts  cursors.machine.ts  Cursors.tsx  cursors.story.ts
    features/Outbox/   outbox.definition.ts  outbox.machine.ts  Outbox.tsx
    adapters/          sse.ts  collab-sdk.ts  http.ts   (Effect-only)
    testing/           notes.fake.ts  collab.fake.ts  notebook.property.test.ts
    app/   app.ts  setup.ts  persistence.ts  view.tsx  presentation.ts  demo.tsx
    tools/ cli.ts  inspection.ts
  ```
- **How this app is different:** `latest` beside an etag'd `reject`, `serialize` for chat order, SSE and an SDK
  transport, a domain write beside a plain `optimistic` write, and reload and two tabs as the main path.

### 5.5 `tools/findings/` (desk)

Tiny, deliberately wrong definitions, one per finding, each with its expected `flow check` line and a test asserting
it. Excluded from the app and from Story globs. Closes I3 A, I4 A.

### 5.6 Each API's range, checked

For each API, the situations above differ on at least one axis of section 1. Examples of the range:

- **The hold (O1):** ED (re-send on a schedule) · CK (never re-send blindly; reconcile, then release) · NB (etag;
  re-send meets 412) · QU (a held head blocks a FIFO).
- **`.each` (F4–F6):** over memory (CK steppers, RW parts, NB tags) · over live keys (FB cards, QU flashes, NB
  cursor labels) · owning writes (UP bytes, NB `latest` autosaves, QU toggles).
- **Many-record writes (E2):** one entity, many rows (QU) · two entities and a delete (AD merge) · many rows, no list
  moves (NB mark read).
- **State feeds (T5):** a list of viewers (PR) · a status per technician (FB) · a cursor position (NB).

---

## 6. Exploration and playback coverage

**Direction (the owner's; proposed here).** A Story is a raw transcript: the user's, time's and the world's inputs and
named checkpoints, with no `expect`. Checks live in a test file through a test adapter such as `@flow-state/vitest`,
which runs the Story once and gives typed access to each checkpoint's cut as `at.<checkpoint>`. One Story feeds tests,
`StoryPlayer`, presentations, coverage and property tests.

```ts
// before (today: editor.story.ts)
export const saved = editor("editor/saved")
  .send(E.TitleChanged({ title: FIRST }))            // existing: send
  .send(E.SaveRequested())
  .expect({ state: S.OPEN.SAVING })                  // existing: expect  (dropped)
  .world(Desk.saveTitle.release())                   // existing: world, release
  .expect({ state: S.OPEN.SAVED })                   // existing: expect  (dropped)

// after (proposed): editor.story.ts, a transcript
export const saved = editor("editor/saved")
  .send(E.TitleChanged({ title: FIRST }))
  .send(E.SaveRequested())
  .checkpoint("saving")                              // existing: checkpoint
  .world(Desk.saveTitle.release())
  .checkpoint("saved")

// after (proposed): editor.test.ts
import { storyTest } from "@flow-state/vitest"        // NEW (proposed): the test adapter
storyTest(saved, ({ at }) => {                        // NEW (proposed): at, typed by the Story's checkpoints
  expect(at.saving.state).toBe(S.OPEN.SAVING)         // vitest's expect; at.saving is the step cut
  expect(Editor.O.save.get(at.saving, T42)?.pending).toBe(true)
  expect(at.saved.state).toBe(S.OPEN.SAVED)
  // at.saaved: a type error, not a checkpoint of `saved`
})
```

Added: `@flow-state/vitest`, `storyTest`, `at.<checkpoint>`. Dropped from Stories: `.expect`. Kept: every step word,
checkpoints, fakes. Open: whether `Story.records`, `Story.inspection` and `Story.entity` become `at.x.records`,
`at.x.inspection` and `at.x.entity(Ticket, key)`.

| Module or app | Named checkpoints | Presentation |
| --- | --- | --- |
| ED | `draft`, `saving`, `unsure`, `resending`, `gave-up`, `closed-while-saving`, `reopened-unsure` | "The save you can't lose" |
| QU | `filtered`, `toggled`, `toggled-while-unsure`, `left-unassigned`, `bulk-queued`, `bulk-partly-failed`, `sla-breached`, `created`, `archived` | "Bulk close fifty tickets" |
| FD | `typing`, `too-short`, `results`, `stale-dropped`, `cleared`, `jumped` | "Find anything" |
| RW | `reason`, `parts`, `back-to-reason`, `confirm-discard`, `resolved`, `left-mid-resolve`, `parts-released` | "Resolve on site" (next-action into the nested subroutine) |
| IN | `history-open`, `frozen`, `thawed`, `reservation-expired-while-away` | "Tabs remember" |
| FB | `board-live`, `technician-stale`, `poller-down`, `dispatched-elsewhere`, `nudged` | "The wallboard" |
| AD | `roster`, `moved-team`, `merge-predicted`, `merge-refused-restored`, `remove-refused-restored` | "Merge two customers" |
| PR, FE, AS | `joined`, `sdk-resumed`, `caught-up`, `history-truncated`, `streaming`, `regenerated` | "Live desk" |
| DD app | `desk-open`, `pushed-rename`, `sign-out-refused` | the desk tour, with gaps shown |
| CK | `cart`, `quantity-coalesced`, `coupon-predicted`, `challenge`, `challenge-timing-out`, `paid`, `pay-unsure`, `reconciled`, `voided-on-leave`, `refunds-queued`, `reload-mid-charge` | "Pay safely", and the property test's counterexample replayed |
| NB | `typing-title`, `title-superseded`, `body-conflict`, `chat-caught-up`, `history-truncated`, `offline`, `outbox`, `reloaded`, `second-tab` | "Two tabs, one notebook" (`<StoryFrame tab="a">` and `tab="b"`) |

Each app also gets `app/demo.tsx` (a `StoryPlayer` page per presentation), a property test whose failure prints a
replayable Story, and `flow stories --coverage` in its `tools/cli.ts`.

---

## 7. The order of work, in batches

1. **B1, desk fixes.** REVIEW.md M1–M16, S-H1–S-M6; split `desk.fake.ts`; truth as an Effect Schema. No new features.
2. **B2, Stories as transcripts (if accepted).** ED first for the owner to judge, then the rest of the desk.
3. **B3, desk entities.** CM to a `Comment` entity, UP deletes, QU conditions, sorts, list moves, creates; then AD.
4. **B4, desk reshapes.** QU toggles and bulk `serialize`; AS `cancel`; PR over an SDK (PM6).
5. **B5, new desk modules.** FD and RW (merged features), then IN, then FB (PM6).
6. **B6, `tools/findings/`.**
7. **B7, Checkout app.**
8. **B8, Notebook app** (PM6 for Chat and Cursors).
9. **B9, playback and the map.** Presentations and `demo.tsx` per app; recount section 2; update each README; revisit
   every PM6 row when merge 6 lands.

---

## Proposed questions for the owner (round 1)

- **Q1.** The two apps CK and NB? A: both. B: CK only; NB's situations as desk modules. C: neither.
  Recommendation: A: last-write-wins docs, SSE, SDK cursors and two tabs read as forced in a desk.
- **Q2.** The admin module AD for entity range? A: yes, a desk module. B: put its entities into NB.
  Recommendation: A: admin is a different domain inside the same app, which is the point.
- **Q3.** QU's assign as a per-row `latest` toggle copy? A: yes. B: keep `reject` assign, add bulk only.
  Recommendation: A: otherwise the queue stays a copy of the editor's template.
- **Q4.** AS on `concurrency: "cancel"`? A: yes. B: keep `reject` with Stop. Recommendation: A.
- **Q5.** Stories as transcripts with `@flow-state/vitest`? A: convert everything in B2. B: new code only.
  Recommendation: A, ED first.
- **Q6.** `tools/findings/` with deliberately wrong files? A: yes, excluded from the app. B: prose only.
  Recommendation: A.
