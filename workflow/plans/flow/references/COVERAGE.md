# Reference coverage: each API across very different situations

**Status: proposed.** Nothing here is decided except the scope: the owner chose **two projects, the dispatch desk plus
the Checkout app** (option B; the Notebook app is dropped). This file maps the design against the reference code and
proposes where the uncovered parts go. Every placement, every reshape of an existing module, the Checkout app, the new
desk modules and the Story direction in section 6 are proposals for the owner to accept or reject in numbered rounds.

**Goal (the owner's).** Coverage is not "each API appears once". Each API shows up in **very different situations**
and is **used differently** in each, so a reader sees its range. The target is at least three situations per API that
use it differently, never three copies of one use. A small new app is justified when it opens new situations, not only
new APIs.

## At a glance: what each app and module pushes (proposed)

One comparison. Each row pushes a different set of Flow State features, covers a different point on the four axes,
and leaves alone what another row owns. Codes are explained in section 1, and row numbers in section 2.

| Row | Pushes hardest, and how | Domain · data shape · lifetime · failure profile | Deliberately avoids (owner) |
| --- | --- | --- | --- |
| **DD** Dispatch desk (app) | the whole Runtime on one closed app: many actors on one ticket, cross-actor coherence, writes that outlive screens, several related entities, every stream recipe that exists in the desk, two tabs and reload in its tab Stories, SSR of the queue, the desk tour presentation | ops, field work, admin · records, lists, trees, facts, current values · screens, background, across reload and tabs · concurrent dispatchers, SDK quirks, socket drops | payments, compensation and a third-party commit (CK) |
| **CK** Checkout (app) | the hold where a re-send could double-charge: Stripe.js as the commit, `Idempotency-Key: attempt.id`, a reconcile `lookup` that releases the hold, `mayHaveApplied`; 3-D Secure as a subroutine with exits and a visible `Countdown`; voiding the authorization on leave; `serialize` refunds; unkeyed coupon with `optimistic`; SSR with a commit in flight | payments · one intent, cart lines, refunds per charge · across reload, background capture · third-party SDK, challenge timeouts, duplicate webhooks | streams of any kind (FE, PR, QU); timed re-sends of the hold (ED) |
| **ED** Editor | three things on one ticket screen, each a different use: the **title save** is the full hold (same Attempt re-sent on a schedule with `retryable`, then `cancel`; late after Close, adopted on reopen; `UnresolvedHold`); the **description fields** are `.each` `Autosave` copies on `latest` (last write wins, `Superseded`) beside an etag'd body on `reject` that meets 412; the **panels** (History, Customer, Parts) are `.resumable()` traits on tab nodes (freeze and thaw, a read cut by a freeze beside a write that outlives it, a `Reservation` countdown whose `dueAt` survives, `raise` to open a tab). Its tab Stories own two tabs, reload and storage refusal | ops · one record with fields, a tree of panels · a screen whose writes outlive it; across reload and tabs · flaky network, lock conflicts, 412, quota | bulk (QU); subroutines (RW); streams of its own (FE, PR) |
| **QU** Queue | entities at list scale: `serialize` bulk close with a `many` key, `RequestResolver` per-item results, `Overloaded`; `latest` assign toggles as `.each` copies waiting behind a held unknown; `or`/`isNull`/`lt` conditions, two sort keys, rows leaving and joining lists by prediction; SLA keyed schedule with `useNow`. Its **technician panel** is all keyed state feeds: `subscribe.each` per technician over the polling recipe, `last`, `resetAfter`, `Feed.down`, stale age; `.each` cards over live keys; `allow` nudges; presence per visible row | ops, field work · a filtered list, bulk sets, keyed current values · a screen; a long-lived panel · other dispatchers, partial bulk failure, poller offline | one-record holds (ED); related-entity merges (AD); one-off reads (FD) |
| **FD** Find | one-off `lookup` only: one lane, latest answer delivered, `Superseded`, cleared by a key-less `cancel`, debounced with `restartOn`, `TooShort` denial | ops · ephemeral results · per keystroke · slow and stale answers | every write and every live placement |
| **RW** Resolve wizard | subroutines: a wizard with `.history`, exits carrying data, a nested `ConfirmDiscard`, `hostEvents` from the step bar, guard ports with annotated denials, `Flow.private`; a `Signature` writing trait on one node; a write that lands after the exit; releasing reserved parts on abandon | field work · a tree of steps, a parts list · one subroutine's life · abandonment, late endings | resumable state (ED panels); streams; entities beyond the ticket |
| **AD** Roster admin | entities across relations: `Technician`, `Team`, `Customer` in one domain with `.alsoChanges`; a customer merge predicting a delete, a patch and re-pointed tickets, confirmed by a `ConfirmMerge` subroutine; deletes restored on 409; `.ignoring`; `listen` from a polling-with-cursor fact feed beside the roster read; online dots per row through PR's SDK contract | admin · related entities · a screen · merge conflicts, refused deletes | bulk queues on one entity (QU); timed re-sends (ED) |
| **CM** Comments | a writing trait placed on two hosts, one with `resetOn` (A-B-A adoption); `Comment` as an entity whose post `.alsoChanges` the ticket; posts on `serialize` per ticket so they land in the order typed; deletes restored; plain `optimistic` reactions beside the domain edit; manual resend only | ops / conversation · a list under a record · a drawer reset per ticket · flaky network, refused text, edit window | scheduled re-sends (ED); `.each` (UP) |
| **UP** Uploads | `.each` copies that own writes: commit on creation (`Flow.entry`), XHR progress, `armOn`/`disarmOn`, `whenAbandoned` cancel, `FileGone` after reload; `Entity.delete` restored on 403 | ops · copies carrying bytes · across reload, bytes lost · slow network, user cancel | streamed bodies (AS); parked user intent (CM) |
| **PR / FE / AS** Live desk (PM6) | PR: a collaboration SDK through `Feed.callback`, twice (the presence set as a state feed; typing events with `emit` back-pressure), the SDK's own reconnect kept, `allow` pings through the SDK. FE: raw WebSocket with close codes, catch-up, `{ lost, restartAt }`, `listen` into tickets and comments, the one machine-level RETRY_WAIT. AS: a streamed write on `cancel`, Regenerate interrupting the reply | ops and AI · a current value, events, a stream of facts, a stream of tokens · a screen; FE across reload · SDK quirks, socket drops, history truncated, stalls | keyed polling feeds (QU); `reject` holds (ED) |

**Why Checkout is its own app.** A dispatch desk never moves money, so it never meets a write where a blind re-send is
the bug. Checkout makes the hold's hardest form the main path: an idempotency key handed to a third-party SDK, a
reconcile read instead of a timer, compensation when the user leaves after authorizing, refunds whose order is money,
and a 3-D Secure challenge that is a subroutine with its own timer and exits. Its failure profile (duplicate webhooks,
challenge timeouts, `mayHaveApplied` wording on a receipt) and its SSR cart page with a commit in flight have no honest
place in a desk. Everything else the dropped Notebook app would have opened now lives in the desk (section 5) or is
deferred (section 5.5).

**Sources.**

| Short | Document |
| --- | --- |
| MD | [machine-design.md](explorations/machine-fragments/machine-design.md): fragments and the turn (2.1–2.6, rules 1–12), operations (2.7, rules 13–25, N1–N3, 39–47), entities (2.8, rules 26–38, merge 5's M5-D1–D10), fragment operations (2.9, rules 48–60), Stories (2.10, rules 61–66), keywords (3.6) |
| ED-D | [design/entity-domain.md](design/entity-domain.md): `.alsoChanges`, `.derivedFrom`, `.ignoring`, conditions, `Entity.queue` |
| M6 | [merged/streams/proposal-v2.md](explorations/machine-fragments/merged/streams/proposal-v2.md) revision 7.1, [decisions-v2.md](explorations/machine-fragments/merged/streams/decisions-v2.md) S1–S10. **Not merged:** every streams row is **PM6** |
| PB | [playback.md](explorations/playback.md): frames, `StoryFrame`, `StoryPlayer`, presentations |
| DD | [dispatch-desk/](dispatch-desk/): [README.md](dispatch-desk/README.md), [REVIEW.md](dispatch-desk/REVIEW.md), the code |
| FP | `apps/features/src/pages/*.mdx`: the keyword list per area |

**How to read the map.**

- Each row is one API (a keyword, or a pattern of keywords that only makes sense together).
- Columns **A**, **B**, **C** (and sometimes **D**) are **situations**: a module or app (codes in section 1) and, after
  the dash, **what is different about how the API is used there**. *today* means the desk shows it now; everything else
  is proposed. "ED fields", "ED panels", "ED tabs" and "QU techs" name the editor's description fields, its panels, its
  tab Stories and the queue's technician panel.
- **Today** counts the desk as it is: **none**; **once** (one situation, or several modules using it the *same* way,
  marked "same template"); **several** (two or more situations that use it differently).
- **Target** is the number of distinct situations wanted: 3 unless the row says otherwise.
- "(misuse Mn)" means the code exists but REVIEW.md found it wrong. "deferred" points at section 5.5.

---

## 1. The situations

A situation is a module in a setting. The four axes the owner named, per module:

| Code | Module | Domain | Data shape | Lifetime | Failure profile |
| --- | --- | --- | --- | --- | --- |
| **ED** | desk Editor (existing, extended) | ops | one record; its description fields; a tree of panels | a screen; writes outlive it; panels frozen across tab switches; across reload and tabs | flaky network, lock conflicts, 412, storage quota |
| **QU** | desk Queue (existing, reshaped) | ops, field work | a filtered list; bulk sets; keyed technician values | a screen; a long-lived technician panel | other dispatchers, partial bulk failure, overload, poller offline |
| **CM** | desk Comments (existing, reshaped) | ops / conversation | a list under a record | a drawer that resets per ticket | flaky network, refused text, edit window |
| **UP** | desk Uploads (existing) | ops | copies carrying bytes | across reload (bytes lost) | slow network, user cancel, file gone |
| **FE** | desk Feed (existing, PM6) | ops | a stream of facts | across reload | socket drops, history truncated, log reset |
| **PR** | desk Presence (existing, rewritten, PM6) | ops / collaboration | a current value; a stream of events | a screen | SDK quirks, the SDK's own reconnect |
| **AS** | desk Assistant (existing, reshaped, PM6) | AI | a stream of tokens into one value | a screen | stalls, truncation, refusal |
| **FD** | desk Find (new) | ops | ephemeral results | per keystroke | slow and stale responses |
| **RW** | desk Resolve wizard (new) | field work | a tree of steps; a parts list | a subroutine's life | abandonment, late endings |
| **AD** | desk Roster admin (new) | admin | related entities (technicians, teams, customers) | a screen | merge conflicts, refused deletes |
| **CK** | Checkout app (new) | payments | one intent; cart lines; refunds per charge | across reload; background capture | double-charge risk, Stripe.js, 3-D Secure, compensation |

---

## 2. The map

### 2.1 Fragments and the turn

| # | API | Design | Today | A | B | C | Target | Built (B9) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | trait with no I/O | MD 2.1, rule 3 | none | **CK** `Countdown` — a visible 3-D Secure timer, armed on an event | **ED panels** `Reservation` — a parts-hold timer that must survive a freeze | **ED fields** `Field` — synchronous validation per field, no timer at all | 3 | several (3), met |
| F2 | writing trait (a trait that declares `operations`) | MD 2.9, rules 48–50 | once | **CM** *today* — placed on two hosts, one with `resetOn`; A-B-A adoption | **RW** `Signature` — uploads a signature, placed only on SIGNOFF inside a subroutine | **ED panels** `History` — a read plus a "pin note" write, inside a resumable tab | 3 | several (3), met |
| F3 | trait on a node, `Flow.state(…, { traits })` | MD 2.1, 2.3, rule 1 | none | **ED panels** — one trait per tab node | **RW** — the signature trait only on SIGNOFF | **CK** — `Countdown` only on CHALLENGE | 3 | several (3), met |
| F4 | `.each` over a memory list, pure copies | MD 3.3, rule 9 | none | **CK** `QuantityStepper` per cart line — the host owns the writes | **RW** `PartLine` per part used — validation only | **AD** `SkillChip` per skill on a technician form — removed by its own event | 3 | several (3), met |
| F5 | `.each` over keys a live source fills | MD rule 9, 2.7.10 | none | **QU techs** `TechCard` copies over the technicians the filter shows | **QU** `RowFlash` copies over rows a push just changed | **PR** `ViewerBadge` copies over viewers the SDK reports | 3 | several (3), met |
| F6 | `.each` copies that own writes | MD 2.9.6, rules 48, 51 | once | **UP** *today* — commit on creation, release on abandon | **ED fields** `Autosave` per field — `latest`, debounced, never released | **QU** `AssignToggle` per row — a `latest` toggle owned by the row, not the queue | 3 | several (3), met |
| F7 | `.each` options: `max`, `by`, `E.x.key(k)` | MD rule 9 | once | **UP** *today* — `max` refuses a sixth file | **ED fields** — `by` orders fields by schema position | **CK** — `E.line.key(k).Increment` from a line's own button | 3 | several (3), met |
| F8 | leaf subroutine (`Confirm`) left by exits | MD 2.1, 3.2, rule 6 | none | **RW** `ConfirmDiscard` — nested inside another subroutine | **CK** `ConfirmRemove` — its exit carries which line | **AD** `ConfirmMerge` — its exit picks the surviving record | 3 | several (3), met |
| F9 | subroutine with states and `.history` | MD 3.2 | none | **RW** wizard — Back returns to the last step (`.history`) | **CK** address step — returns to the exact field (`.history.child`) | — | 2 | several (2), met |
| F10 | `exits` with data | MD 2.2, 3.2 | none | **RW** `Resolved { resolution }` | **CK** 3-D Secure `Passed { authId }`, `Declined { code }`, `TimedOut` | **AD** `Merge { survivorId }` | 3 | several (3), met |
| F11 | a subroutine that owns a write; its ending arrives after the exit | MD rules 48, 53 | none | **RW** `resolve` lands after the wizard was left | **CK** the challenge's confirm lands after a `TimedOut` exit | — | 2 | several (2), met; CK: write kept in the host (rule 48) |
| F12 | `.resumable()`: freeze, thaw, `dueAt` kept | MD 2.1, 2.4 rule 1 | none | **ED panels** — reads cut on freeze, restarted on thaw | **CK** `Countdown` under a help overlay — time keeps running while frozen | — | 2 | several (2), met |
| F13 | `resetOn` (value) and the pin commit (3.4) | MD 3.4, rule 56 | once | **QU** preview *today* — follows the selected ticket, writes parked | **CK** checkout — resets on a new cart id; waits for its own write (pin) | **ED panels** — resumable, but fresh when the ticket changes | 3 | several (3), met |
| F14 | `whenAbandoned` | MD rule 60, 3.5 | once | **UP** *today* — key-less `cancel`: the bytes are worthless | **CM** *today* — no cancel: a comment is intent | **RW** — notify only; the resolution draft survives (3.5) | 3 | several (3), met |
| F15 | `guards`, `callbacks`, `Flow.optional` ports | MD 2.2, rule 5 | once (same template: one `onFailed`) | **RW** `canResolve` guard with denial codes | **CK** `mayPay` guard reading the host's context | **ED fields** optional `onConflict` callback; absent where a field is read-only | 3 | several (3), met |
| F16 | `hostEvents` with `raise` | MD 2.2, rule 2 | none | **RW** `JumpTo { step }` from the step bar | **ED panels** `OpenTab { tab }` from a deep link | — | 2 | several (2), met |
| F17 | `notify` | MD 2.2, rule 6 | once (same template) | **RW** `Progressed { step }` drives the host's step bar | **ED fields** `Saved { field }` feeds an "all saved" badge | **CM** *today* — failures only | 3 | several (3), met |
| F18 | nesting hides the level below | MD rule 10 | none | **RW** wizard → `ConfirmDiscard` | **ED panels** tab → `Reservation` | **CK** challenge → `Countdown` | 3 | several (3), met |
| F19 | `Flow.private`, `Flow.annotate({ denials })` | MD 2.2.1, 2.2.2 | none | **RW** — private step bookkeeping; annotated guard | **CK** — private challenge state; annotated `mayPay` | **ED panels** — private scroll anchors | 3 | several (3), met |
| F20 | `Flow.input`, `Flow.initial`, `Flow.uncertain`, `internalEvents` | MD 2.2 | several | **ED**, **QU**, **CM** *today* | | | done | once (1), done |
| F21 | the turn: before/after memory, ordered alternatives, `deny`, `check()` | MD 2.5, rules 7, 22 | several | **ED** *today* — saved vs draft compared after the outcome | **FD** — `TooShort` denial shown under the box | **CK** — Pay button's `check()` reasons rendered as help text | 3 | several (3), met |
| F22 | shared actor; context from another actor | FP runtime, MD 2.10.1 | once | **DD** Toasts, Session *today* | **AD** — the Session's admin role decides which actions exist | **CK** — guest vs signed-in context changes the flow | 3 | several (3), met |
| F23 | sending into another actor's fragment | DD gap 3 | once | **AS** *today* — "Use as comment" | **QU** — "Reply" in a row sends into the editor's `comments` copy | — | 2 | several (2), met |

### 2.2 Operations and write lanes

| # | API | Design | Today | A | B | C | D | Target | Built (B9) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | the hold: `unknown` keeps the Attempt, the same Attempt is re-sent | MD rules 18–21, 2.7.13 | once (same template ×4: ED, QU, CM, UP) | **ED** title *today* — re-sent on a schedule with `retryable`, then `cancel` | **CK** — a payment that must never double-charge: no blind re-send; a reconcile `lookup` decides, then the hold is released | **ED fields** body — an etag'd autosave; a re-send that meets 412 ends `StillUnknown` | **QU** bulk — the held head blocks a `serialize` FIFO, so order is kept | 4 | several (4), met |
| O2 | contract `commit` over a real source | MD 2.7.2 | once (`fetch`, XHR) | **ED** *today* — `fetch` with `AbortController` | **CK** — Stripe.js Promises, no signal; `Idempotency-Key: attempt.id` | **QU** — `RequestResolver` batching per-item statuses below the commit | **PR** — the collaboration SDK's calls | 4 | several (4), met |
| O3 | `reject` | MD 2.7.8 | several | **ED** *today* — one save at a time; a second is declined | **UP** *today* — keyed per call, so it never refuses a different file | **CK** pay — a double click is `NotSent { Rejected }`, mapped to nothing visible | | 3 | several (3), met |
| O4 | `latest`: a newer commit replaces the queued one | MD 2.7.8, C10 | none | **ED fields** summary, location note — last write wins, `Superseded` evidence | **CK** quantity — rapid taps send at most two requests | **QU** assign toggle — assign, unassign, assign sends once | | 3 | several (3), met |
| O5 | `latest` behind a held unknown | MD 2.7.8 (`setLike`), rule 29 | none | **QU** — a toggle while the assign is unsure waits behind the hold | **CK** — a quantity change on an unsure line waits, then goes | **ED fields** — a field edit waits behind that field's unsure save | | 3 | several (3), met |
| O6 | when **not** to use `latest` | MD 2.9.6 | none | **ED fields** body — an etag would be stale, so `reject` and coalesce in the fragment | **ED** title — an explicit Save must not race the lock; `reject` | — | | 2 | several (2), met |
| O7 | `serialize`: FIFO ≤ 64, `outstanding`, `Overloaded` | MD 2.7.8, rule 35 | none | **QU** bulk per workspace — operations apply in order | **CK** refunds per charge — money order matters | **CM** posts per ticket — comments land in the order typed | | 3 | several (3), met |
| O8 | `cancel`: a newer commit interrupts the one on the wire | MD 2.7.8, rule N2 | none | **AS** — Regenerate interrupts the streaming reply | **CK** — a new address interrupts the shipping quote | — | | 2 | several (2), met |
| O9 | `allow`: per-Attempt lanes | MD 2.7.8, rule N2 | none | **QU techs** Nudge — many at once, each toasts its own result | **PR** typing pings through the SDK — fire and forget | **AD** invite emails — key-less handling in each ending's own turn | | 3 | several (3), met |
| O10 | endings current, late, adopted; late turns; `LateMayNotLeave` | MD rules 14, 15, 20 | once (misuse M1, M2) | **ED** *today* — late after Close, adopted on reopen | **RW** — late after the wizard's exit | **CK** — the challenge's ending after `TimedOut` may not leave PAID | | 3 | several (3), met; CK: may not leave PAYING (PAID owns no call) |
| O11 | declines as endings: `NotSent { Rejected, Overloaded, Disposed, StorageRefused, Cancelled }` | MD rule 16, 2.7.1 | once | **CM** *today* — `Rejected` from another subject path | **QU** — `Overloaded` at the 65th bulk op | **ED tabs** — `StorageRefused` on a full quota | **CK** — `Disposed` | 4 | several (3), short; CK `Disposed` skipped |
| O12 | `unknown` reasons: `Restored`, `StillUnknown`, `Interrupted`, `Defect` | MD 2.7.1, rule 18 | once (misuse M4) | **UP** *today* — `Restored` means the bytes are gone | **CK** — `StillUnknown { AlreadyCaptured }` | **ED fields** — `Restored` mid-autosave: re-send the coalesced value | | 3 | several (3), met |
| O13 | `attempt.id`, `retryCount`, `mayHaveApplied` | MD rule 19 | once | **ED** *today* — idempotency header | **CK** — `mayHaveApplied` decides the receipt's wording | **CM** — the pushed comment carries `attempt.id`, so its draft is pruned | | 3 | several (3), met |
| O14 | holds outlive the actor; parked endings; adoption | MD rules 44, 53, 54 | several (misuse M13, M14) | **ED**, **CM**, **UP** *today* | **CK** — the receipt appears after the tab was closed and reopened | **AD** — a merge outlives the admin screen | | 3 | several (3), met |
| O15 | every hold has an owner; `UnresolvedHold` | MD rule 45 | once | **ED** *today* — CLOSED's `Reopen` | **RW** — the wizard's host owns its hold after exit | — | | 2 | several (2), met |
| O16 | `runtime.unsettledWrites()` | MD rule 44 | once | **DD** host *today* — `beforeunload` | **AD** — a "pending changes" footer lists unsettled roster writes | **CK** — leave-page warning only while capturing | | 3 | several (3), met |
| O17 | lane `progress` | MD rule 21, M6 S5 Q11 | once | **UP** *today* — XHR bytes | **AS** — tokens (PM6) | **RW** — the signature image's upload | | 3 | several (3), met |
| O18 | unkeyed operation, key-less members | MD rule 43 | none | **CK** coupon — one per cart | **AD** — "rebuild roster index", one per workspace | — | | 2 | several (2), met |
| O19 | per-item batch results (`RequestResolver`) | MD 2.7.11 | none | **QU** bulk close | **AD** bulk invite | — | | 2 | several (2), met |
| O20 | compensation on leave; contract `orphaned` | MD 2.7.7 | none | **CK** — void the authorization when checkout is left | **RW** — release reserved parts when the wizard is abandoned | **CK** — `orphaned` re-sends across a version change | | 3 | several (3), met |
| O21 | plain write with `optimistic` | MD rule 36 | none | **CM** reactions | **CK** coupon — predicted total in memory | **QU techs** "on break" toggle | | 3 | several (3), met |
| O22 | the operation's `writes` option | MD rule 36 | once | **CM** *today* — invalidates the thread | **RW** — resolving invalidates the ticket's history read | **CK** — a refund invalidates the order total | | 3 | several (3), met |
| O23 | mapped events only from endings; named operations in small actors | MD rules 40–42, 47 | several | **PR**, **AS** *today* | | | | done | once (1), done |

### 2.3 Reads and schedules

| # | API | Design | Today | A | B | C | Target | Built (B9) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | live read in `activities`, `refetch` | MD rules 41, 42 | several | **QU**, **ED**, **CM** *today* | **AD** — a roster read beside a `listen` | | done | several (2), done |
| R2 | one-off `lookup`: one lane, latest delivered, `Superseded` | MD 2.7.9 | none | **FD** — per keystroke; stale answers never arrive | **CK** — a reconcile poll after an unknown charge | **RW** — a part number lookup a state waits on | 3 | several (3), met |
| R3 | key-less `cancel` of a lookup | MD 2.7.9 | none | **FD** — an empty box | **CK** — stop polling once the webhook confirmed | — | 2 | several (2), met |
| R4 | read failures `Defect`, `Interrupted` required | MD 2.8.10 | once (misuse M5) | **ED** *today* | **FD** — a failed search keeps the last results, dimmed | **RW** — a failed part lookup lets the step continue unvalidated | 3 | several (3), met |
| R5 | paging on a live read (plan's proposed `more`, `hasMore`) | DD gap 23 | once | **QU** *today* — forward pages | **CM** — older comments, paged backwards | **AD** — roster pages under a sort | 3 | several (3), met |
| S1 | debounce with `restartOn` | MD rule 23 | once | **ED** *today* | **FD** — per keystroke, then a `lookup` | **QU** — the search box, then a live read's new input | 3 | several (3), met |
| S2 | keyed schedules (`keys`) | MD 2.7.10 | once (same template: resend per uncertain key) | **QU** — an SLA deadline per ticket | **ED fields** — a debounce per field | **CM** *today* — resend per post | 3 | several (3), met |
| S3 | `armOn`, `disarmOn` | MD rule 23 | once | **UP** *today* | **CK** — armed when the challenge is shown | — | 2 | several (2), met |
| S4 | `s.schedules`, `dueAt`, `useNow` in a view | MD 2.1, FP views | none | **QU** — "breaches in 12 min" | **CK** — challenge countdown | **QU techs** — "seen 40 s ago" from `last.at` | 3 | several (3), met |
| S5 | backoff from memory; `Schedule.*` | MD 2.7.6 | several | **ED**, **FE**, **PR** *today* | | | done | once (1), done |

### 2.4 Entities

The desk has one entity (Ticket), one domain plus the feed's `listen` domain, two predicting writes, one list with
`eq`/`and`/`serverMatches`, and `Ticket.get` in two views. This block gives entities the same range as the rest.

| # | API | Design | Today | A | B | C | D | Target | Built (B9) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | several entities with relations (key fields naming another entity; `.alsoChanges`) | ED-D 1.1, 4.6 | none | **AD** — `Technician` belongs to a `Team`; moving one `.alsoChanges` both teams' counts | **CM** — `Comment` as an entity; a post `.alsoChanges` its `Ticket.commentCount` | **CK** — a `CartLine` names a `Product`; its price comes from the product's record | **QU** — `Ticket.assignee` names a `Technician`; rows show the name from its own record | 4 | several (4), met |
| E2 | many-record writes (a `many` key array; cap 4,096, `Overloaded`) | MD rule 35, M5-D9 | none | **QU** bulk close — one write predicts N tickets of one entity | **AD** merge customers — predicts a delete, a patch and N re-pointed tickets across two entities | **CM** "mark thread read" — N comments, no list moves | | 3 | several (3), met |
| E3 | deletes (`Entity.delete`) restored on a definite failure | MD rule 30, 2.8.2 | none | **UP** — remove an attachment; 403 restores it | **CM** — delete a comment; past the edit window the server refuses, it reappears in place | **AD** — remove a technician who has open tickets; 409 restores the row | | 3 | several (3), met |
| E4 | a record leaves or joins a list because of a prediction | MD rules 28, 30 | once | **QU** — assign predicts `assignee`, so the ticket leaves "Unassigned" (`isNull`) and joins "Mine" at once | **QU techs** — a dispatch also predicts the technician's `status: "busy"`, so the technician moves column (a second record) | **CM** — pin predicts `pinned`, so a comment joins "Pinned" | **CK** — a refund predicts `status: "refunding"`, so it leaves "Completed" | 4 | several (4), met |
| E5 | three-valued conditions with `and`/`or`/`not`, nullable fields | M5-D7, M5-D8 | once (`eq`, `and`, `serverMatches`) | **QU** — `or(eq(priority, "urgent"), and(isNull(assignee), lt(dueAt, input.now)))`; a predicted field not carried makes it maybe, so it refetches | **AD** — `or(eq(teamId, input.team), isNull(teamId))`: my team or unplaced | **CM** — `and(contains(mentions, input.me), isNull(readAt))`: unread mentions | | 3 | several (3), met |
| E6 | multiple sort keys; a null sort pair is skipped | M5-D4, MD 2.8.2 | once (`updatedAt`, keys) | **QU** — `desc(priority)`, `asc(dueAt)` with nullable `dueAt`, then keys | **CM** — `asc(createdAt)`, `asc(id)` | **AD** — `asc(team)`, `asc(name)`, keys | | 3 | several (3), met |
| E7 | cross-actor coherence: one record on two screens, an optimistic write while the other holds it | MD 2.8.4 | once | **ED**+**QU** *today* — a title save shows in the queue row | **QU techs**+**AD** — an admin rename while the panel shows the technician | **CM** — a comment edited in the queue's preview while the editor's thread shows it | **CK** — mini-cart header and cart page show one line | 4 | several (4), met |
| E8 | record-queue ordering across actors | MD rule 29, 2.8.5 | once | **ED**+**QU** *today* (`assign-repairs`) — save then assign on one ticket | **QU** bulk close vs **ED** save — a FIFO of N and one save meet on one record | **AD**+**QU techs** — a roster rename and a dispatch's status prediction meet on one technician | | 3 | several (3), met |
| E9 | `predicted`, `uncertain`, `unconfirmed` shown distinctly | MD 2.8.12 | once (misuse M9, M10) | **QU** row badges — italic predicted, a "?" for uncertain, "checking" for unconfirmed | **CM** comment — "sending", "may not have saved", "edited, confirming" | **AD** roster row — greyed while predicted, a retry chip when uncertain | | 3 | several (3), met |
| E10 | `listen` feeding records beside a domain read (PM6) | M6 2.8 | once | **FE**+**QU** *today* — socket pushes into the ticket list | **FE**+**CM** — the same socket's comment events into `Comment` records beside the thread read | **AD** — technician changes from a polling-with-cursor fact feed beside the roster read | | 3 | several (3), met |
| E11 | `checkReplays` (on in Stories and `propertyTest`) | M5-D10 9.9 | none | **QU** — the predicted status field replays over a pushed base | **AD** — a team count `(beneath, input) => …` replays over a new base | **CK** — a line total replays when the price changes under it | | 3 | several (3), met |
| E12 | `Entity.queue` in Inspection and Stories | ED-D 6.3, C30, C84 | none | **QU** — bulk vs save removals (`Superseded`, `Released`) | **AD** — the merge's queue across two entities | **CK** — a quantity `latest` vs a mini-cart removal on one line | | 3 | several (3), met |
| E13 | creates as `creating` drafts (no temporary ids) | MD 2.8.7, rule 33 | none (CM drafts are the plain version) | **QU** — new ticket, shown apart until the list holds its id | **CM** — a posted comment, matched when the push holds its id | **AD** — invite a technician | | 3 | several (3), met |
| E14 | predicted field functions `(beneath, input) => value` | M5 | none | **CM** — `Ticket.commentCount` `+1` | **CK** line totals | **AD** team counts | | 3 | several (3), met |
| E15 | derived reads (`.derivedFrom`) | ED-D | once | **QU** *today* — open count | **AD** — technicians per team | **CM** — unread count per ticket | | 3 | several (3), met |
| E16 | a domain write beside a plain write with `optimistic` | MD 2.8.3, rule 36 | none | **CM** — comment edit (domain) and reactions (plain) on one row | **CK** — cart line (domain) and coupon (plain) | — | | 2 | several (2), met |
| E17 | unknown in a domain: forced repair; what clears `uncertain` | MD rules 30–32 | once | **ED** *today* | **QU** bulk — N records marked, cleared by one retry | **AD** merge — uncertain across two entities | | 3 | several (3), met |
| E18 | lanes and predicted keys persist together; reload | MD rule 38 | once (prose) | **DD** `persistence.ts` *today* | **ED tabs** — reload mid-comment-edit marks the comment uncertain and repairs | **CK** — reload mid-refund | | 3 | several (3), met |
| E19 | `.byKey`, `Entity.get`/`pick` (total), `.ignoring` | ED-D | once | **ED** *today* | **AD** — `.ignoring(lastSeenAt)` so presence churn never repairs lists | **CK** — a product by key | | 3 | several (3), met |

### 2.5 Streams (all **PM6**)

| # | API | Design | Today | A | B | C | Target | Built (B9) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | fact feed with catch-up: `Feed.reconnect` `from`, `position`, `catchUp` | M6 2.3, S3, S6 | once (misuse S-M2, S-M3) | **FE** *today* — raw WebSocket, cursor pages | **AD** — polling with a cursor, every connection a loop of GETs | SSE — deferred | 2 | several (2), met; PM6 |
| T2 | `Feed.CannotRepair`, `missed { Lost }`, `initial` | M6 S7, S9, S10 | once | **FE** *today* | **AD** — a first registration with an empty roster ignores `initial` | — | 2 | several (2), met; PM6 |
| T3 | `Feed.live()`, `{ proof }`, `{ lost, restartAt }` | M6 2.3 | several | **FE**, **PR** *today* | **PR** — the SDK's resume flag as the proof | | done | several (2), done; PM6 |
| T4 | `Feed.down(reason)`, the row's `drop` | M6 2.3, 2.6 | none | **QU techs** — the poller's network drops | **PR** — the SDK reports a disconnect it will retry itself | browser offline — deferred | 2 | several (2), met; PM6 |
| T5 | state feed: `connection`, `value`, `last { value, at }`, `resetAfter` | M6 2.6 | once | **PR** *today* — the viewer list | **QU techs** — technician status, stale after a minute | — | 2 | several (2), met; PM6 |
| T6 | `subscribe.each`: one session per key | MD 2.7.10, M6 | none | **QU techs** — per technician, a fixed set | **QU** — presence per visible row, keys follow scrolling | **AD** — online dots per roster row, over the SDK contract | 3 | several (3), met; PM6 |
| T7 | an SDK through `Feed.callback(register, { bufferSize })` | M6 2.4 S, 3.3, 4.7 | none | **PR** — the presence set as a state feed, the SDK's reconnect kept | **PR** — typing events as a second callback, `emit` back-pressure | **AD** — the same SDK contract placed per row | 3 | several (3), met; PM6 |
| T8 | raw WebSocket recipe P (bounded queue, `Overflow`, close codes) | M6 2.4, 4.1 | once (misuse S-H1) | **FE** *today* | — | — | 1 | once (1), met; PM6 |
| T9 | machine-level re-open vs the SDK's budget | M6 4.1, S5 Q3 | once (same template ×2) | **FE** *today* — RETRY_WAIT | **PR** — no RETRY_WAIT; the SDK's budget is the budget | — | 2 | several (2), met; PM6 |
| T10 | streamed write: `progress(p)`, Stop | M6 2.9, 4.4 | once | **AS** — tokens, interrupted by Regenerate | **UP** — `progress(p)` from XHR | — | 2 | several (2), met; PM6 |
| T11 | streams across reload and SSR (cursor in memory, released at capture) | M6 2.10, S4 | once | **FE** *today* | a second fact feed resuming across reload — deferred | — | 1 | once (1), met; PM6 |

### 2.6 Runtime, persistence, reload, tabs, SSR

| # | API | Design | Today | A | B | C | Target | Built (B9) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | `app`, setups, `actorRef`, `ensureActor`, lazy entries | FP runtime | several | **DD** *today* | | | done | once (1), done |
| P2 | `retain`, `disposeActor`, `forget` | FP runtime | once | **DD** host *today* | **AD** — leaving the roster keeps it warm for a minute | **CK** — `forget` after the receipt | 3 | several (3), met |
| P3 | reload mid-write | MD 2.7.15, 2.10.10 | once | **ED tabs** *today* — an acknowledged title save re-held | **CK** — an unacknowledged charge is `NotSent { Restored }`: never charged | **ED tabs** — a coalesced field autosave: only the sent value is a lane | 3 | several (3), met |
| P4 | two tabs (the second runs without persistence) | MD 2.10.10 | once | **ED tabs** *today* — the title save | **ED tabs** — description fields in two tabs; the second says "not saved on this device" | **CK** — paying in a second tab is refused by the intent's `reject` | 3 | several (3), met; CK built as Stripe's `IntentBusy` (lanes are per Runtime) |
| P5 | storage refusal | MD 2.7.13 | none | **ED tabs** — quota full during an autosave capture | — | — | 1 | once (1), met |
| P6 | a non-durable payload beside persisted memory | DD gap 15 | once | **UP** *today* | **RW** — a signature image in tab memory | — | 2 | several (2), met |
| P7 | SSR: `dehydrate`, `hydrate`, `DehydrateCommitInFlight` | MD 2.7.15 | once | **QU** *today* | **CK** — a cart page with a coupon commit in flight | **AD** — the roster page; its `listen` released at capture | 3 | several (3), met |
| P8 | rebind across versions | MD 2.7.7, P19 | none | **CK** | — | — | 1 | once (1), met; seeded lane; seed shape a design gap |

### 2.7 Inspection and `flow check`

| # | API | Design | Today | A | B | C | Target | Built (B9) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I1 | Inspection listing: lanes, incarnations, sessions, `Entity.queue` | MD 2.10.7, M6 2.12 | once | **DD** `tools/inspection.ts` *today* | **CK** — an unknown charge's lane | **QU techs** — sessions per technician | 3 | several (3), met |
| I2 | `flow explain` | MD 2.7.16 | once | **DD** *today* | **RW** — a subroutine's exits | **CK** — a challenge's late ending | 3 | several (3), met |
| I3 | findings that fire: `UnresolvedHold`, `SharedContract`, `KeyRequired`, `VerbMismatch`, `DuplicatePlacement`, `KeyOmitsInput`, `UnusedOperation`, `LateMayNotLeave`, `DehydrateCommitInFlight`, `PredictionNotRetained`, rule 20 rows, rule 56 | MD 2.7.16, M5 | once (commands only) | **DD** `tools/findings/` — one wrong file each | organic: **QU** rule 56 accepted, **CK** `DehydrateCommitInFlight` | — | 1 each | one wrong file per finding |
| I4 | stream findings: `FeedUnhandled`, `ListenNeedsFacts`, `DuplicateSession`, `DuplicateListen`, `UnprovenValues`, `RegistrationChurn` (PM6) | M6 2.12 | once | **DD** `tools/findings/` | organic: **QU techs** `ListenNeedsFacts` if its state feed were listened | — | 1 each | one wrong file per finding |

### 2.8 Stories

| # | API | Design | Today | A | B | C | Target | Built (B9) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Y1 | machine, app and fragment-alone Stories | MD rules 11, 58, 61 | several | **ED**, **DD**, **CM** *today* | **RW** — a subroutine alone in the stand-in host | | done | several (2), done |
| Y2 | `Fake.server` truth (an Effect Schema) and controls | MD 2.10.4 | once (`Schema.declare`, gap 35) | **DD** | **CK** `StripeFake` — `busy`, `challenge`, `webhookTwice` | **PR** SDK fake — `resume`, `detach` | 3 | several (3), met |
| Y3 | `hold`, `release`, `drop`, `match` | MD 2.10.4, rule 65 | several (misuse M15) | **ED** *today* | **CK** — drop the charge's response | **PR** — hold the SDK's attach | done | several (3), done |
| Y4 | `duplicate` | MD 2.10.4 | none | **CK** — the webhook arrives twice | **FE** — the socket redelivers a frame | — | 2 | several (2), met |
| Y5 | `together`, `release({ nth })`, `advance({ to })`, `advance(…, { suspended })`, `checkpoint(…, { at })` | MD 2.10.3, 2.10.6 | none (`nth` in the property test only) | **QU** — `together` for two dispatchers; `advance({ to })` an SLA | **CK** — `together` for two tabs paying | **QU techs** — `suspended` overnight; the poller resumes | 3 | several (3), met |
| Y6 | `Fake.fetch`, `Fake.webSocket` over the real adapter | MD 2.10.4, M6 2.11 | none (misuse S-H2) | **FE** — `Fake.webSocket` | **AD** — `Fake.fetch` under the polling recipe | **CK** — `Fake.fetch` under the Stripe adapter | 3 | several (3), met |
| Y7 | `Fake.storage` `.seed`, `.from(story)`, `reload`, `openTab`, `closeTab` | MD 2.10.10 | once | **ED tabs** *today* | **ED tabs** — `.seed` stale lanes; `.from(story)` continues another Story's storage | **CK** — reload mid-charge | 3 | several (3), met |
| Y8 | `Story.records`, `Story.inspection`, `Story.entity`, `Story.attempt` | MD 2.10.6–2.10.8 | several | **DD** *today* | | | done | once (1), done |
| Y9 | property tests | MD 2.10.16 | once | **DD** *today* — converges | **CK** — never charged twice; every authorization captured or voided | **CM** — a comment never shows twice | 3 | several (3), met |
| Y10 | Story as a raw transcript; checks in `@flow-state/vitest` with typed `at.<checkpoint>` (owner's direction, **proposed**) | — | none | every module (section 6) | | | all | every Story |

### 2.9 Playback and exploration

| # | API | Design | Today | A | B | C | Target | Built (B9) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X1 | named checkpoints | MD 2.10.6 | several | **DD** *today* | | | every Story | every Story |
| X2 | `StoryFrame` (one frame; `tab`) | PB 5 | once (gap 11) | **DD** *today* | **ED tabs** — two tabs side by side | — | 2 | several (2), met |
| X3 | `StoryPlayer` and `definePresentation` | PB 6 | none | **DD** desk tour | **CK** "Pay safely" | **RW** "Resolve on site" | 3 | several (3), met |
| X4 | next-action highlight into a keyed copy or a nested subroutine | MD 2.10.13 | none | **RW** — into `ConfirmDiscard` | **ED fields** — into one field's `Autosave` copy | — | 2 | several (2), met |
| X5 | gaps (actors a frame lacks) | PB 5 | none | **DD** desk tour | — | — | 1 | once (1), met |
| X6 | failure replay of a property counterexample | PB 8 | none | **CK** | — | — | 1 | once (1), met |
| X7 | `flow stories --coverage` | MD 2.10.15 | once | every app | | | per app | every app |

### 2.10 Counts

**Today** (unchanged by the trim: it describes the desk as it is):

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

Only 13 of 115 APIs are shown today in two genuinely different situations, and no entity API is.

**Built (B9 recount, against the code as committed):**

| Family | none | once | several | rows |
| --- | --- | --- | --- | --- |
| Fragments and the turn (F) | 0 | 1 | 22 | 23 |
| Operations (O) | 0 | 1 | 22 | 23 |
| Reads and schedules (R, S) | 0 | 1 | 9 | 10 |
| Entities (E) | 0 | 0 | 19 | 19 |
| Streams, PM6 (T) | 0 | 2 | 9 | 11 |
| Runtime and persistence (P) | 0 | 3 | 5 | 8 |
| Inspection and `flow check` (I) | 0 | 0 | 4 | 4 |
| Stories (Y) | 0 | 1 | 9 | 10 |
| Playback (X) | 0 | 2 | 5 | 7 |
| **Total** | **0** | **11** | **104** | **115** |

114 of 115 rows meet their target. The one short of it is O11 (three of four situations: CK `Disposed` was
skipped, see checkout/README.md). Situations counted are those each row names; a deferred cell (section 5.5) is not
counted. The streams rows (T) are built and marked **pending merge 6**. Deviations from a cell as written are noted in
the row (F11, O10, P4, P8) and in each project's README build notes.

**Targets after the trim.** 72 rows aim at three situations or more (6 of them at four), 23 at two, 6 at one (T8, T11,
P5, P8, X5, X6), 2 at one wrong file per finding (I3, I4), 9 rows are already done, and 3 apply to every Story or app.

**What the trim cost.**

- **Drops from "several" to "once":** T11 (a fact feed across reload). Its second situation was the Notebook chat
  resuming from a persisted cursor; it is now FE alone, with the second case deferred (section 5.5).
- **Drops from three situations to two:** F12 (`.resumable()`), T1 (fact feed with catch-up), T2 (`CannotRepair`),
  T4 (`Feed.down`), T5 (state feed rows). SSE and offline are deferred; no desk screen hosts a third resumable trait or a
  third state feed without repeating one.
- **Kept at three by moving into the desk:** `latest` (O4, O5) through the editor's description fields; two tabs (P4,
  Y7, X2) through the editor's tab Stories; `Feed.callback` (T7) through PR; `serialize` (O7) through CM; the entity
  rows that used Notebook messages (E1–E16) through CM, AD and CK.
- **Concentration:** the editor now carries three situations (title, fields, panels) and the queue two (list,
  technicians). Each is a separate machine or fragment within its screen, so they stay distinct, but a reader will find
  more in those two folders than elsewhere.

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
a "How this module is different" line. The hand-written resend trio stays in **one** place (the editor's title save),
where it is the point. Two modules may share an API only if they use it differently (section 2's variation notes).

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
6. **Streams range (PM6).** `Feed.down`, `subscribe.each`, `Feed.callback`, the polling recipe (T1, T4–T7); SSE and
   offline deferred.
7. **Money-shaped and SDK-shaped writes.** O2, O13, O18–O20, P3, P7, P8.
8. **Persistence edges.** P3–P5, Y7.
9. **Time on screen.** S4.
10. **`flow check` evidence.** I3, I4.
11. **Story tooling and playback.** Y4–Y7, Y10, X3–X6.

---

## 5. The placement proposal

Two projects: the dispatch desk (existing modules reshaped, three new modules) and the Checkout app. Every module below
lists what it contributes **and how its use differs** from the other modules using the same API.

### 5.1 Existing desk modules: keep, reshape or extend

| Module | Proposal | How this module is different |
| --- | --- | --- |
| **ED Editor** | **Keep the title save; fix M1, M2, M12, M13.** It is the one home of the resend trio (O1 A) and of current/late/adopted routing (O10 A), with a routing table in its header. **Add description fields:** an `.each` `Autosave` copy per field (summary, location note) on `latest` with a keyed debounce (F6 B, O4 A, O5 C, S2 B), a `Field` validation trait (F1 C), and the body on `reject` with an etag, coalesced in the fragment, meeting 412 (O1 C, O6 A). **Add panels:** History, Customer and Parts as nodes with `.resumable()` traits placed by `Flow.state(…, { traits })` (F2 C, F3 A, F12 A, F13 C, F16 B, F18 B, F19 C); a `Reservation` countdown in Parts (F1 B). **Extend its tab Stories:** two tabs on the description fields, reload mid-autosave, storage quota refused, `Fake.storage.seed` and `.from` (P3–P5, Y7, X2) | the only screen with three write styles side by side (a held title, `latest` fields, an etag'd body), and the only resumable fragments |
| **QU Queue** | **Reshape.** Assign becomes a per-row `AssignToggle` `.each` copy on `latest` (F6 C, O4 C, O5 A). Bulk close and bulk assign on a `serialize` lane per workspace with a `many` key (O7 A, E2 A), batched by `RequestResolver` (O2 C, O19 A), `Overloaded` at 65 (O11 B). Filters with `or`/`isNull`/`lt` and two sort keys (E5 A, E6 A); assign moves rows between lists (E4 A). New ticket as a draft, archive as a delete (E13 A). SLA keyed schedule with `useNow` (S2 A, S4 A). Presence per visible row by `subscribe.each` (T6 B). **Add a technician panel (PM6):** a state feed per technician over the polling-with-cursor recipe with `subscribe.each` (T5 B, T6 A), `TechCard` copies over live keys (F5 A), `Feed.down` (T4 A), stale age (S4 C), `allow` nudges (O9 A), an "on break" `optimistic` toggle (O21 C), technicians moving column on a dispatch's prediction (E4 B) | the only module with `serialize` bulk, many-record writes of one entity, condition operators, keyed polling state feeds and an `allow` lane |
| **CM Comments** | **Keep the two-host shape; reshape the data and the lane.** Comments become a `Comment` entity whose post `.alsoChanges` the ticket's count (E1 B, E14 A); posts on `serialize` per ticket (O7 C); delete restored past the edit window (E3 B); pin moves a comment to "Pinned" (E4 C); unread mentions with `contains`/`isNull` (E5 C); reactions as a plain `optimistic` write beside the domain edit (O21 A, E16 A); pushes from FE's socket through `listen` (E10 B); manual Resend only. Fix M8, M16 | the only fragment placed on two hosts with `resetOn`; the only entity owned by a fragment; the only `serialize` lane inside a fragment |
| **UP Uploads** | **Keep; fix M3, M4.** Removing an attachment is an `Entity.delete` restored on 403 (E3 A). PM6: `progress(p)` (T10 B) | the only `.each` copy that commits on creation and releases on abandon |
| **FE Feed** | **Keep; fix S-H1, S-H2, S-M2, S-M3.** Stories through `Fake.webSocket` (Y6 A); `duplicate` a frame (Y4 B); comment events for CM's `listen` (E10 B). Keeps the one machine-level RETRY_WAIT (T9 A) | the only raw-WebSocket recipe, `{ lost, restartAt }` and `listen` into two entities |
| **PR Presence** | **Rewrite over a collaboration SDK** through `Feed.callback` inside `Feed.reconnect`: the presence set as a state feed (T7 A) and typing events as a second callback with `emit` back-pressure (T7 B); no RETRY_WAIT (T9 B); `Feed.down` from the SDK (T4 B); the SDK's resume flag as the proof (T3); `allow` typing pings through the SDK (O9 B, O2 D); `ViewerBadge` copies (F5 C) | the only desk transport that is a third-party SDK |
| **AS Assistant** | **Reshape to `concurrency: "cancel"`:** Regenerate interrupts (O8 A, T10 A). Fix S-H3, S-M1, S-M6 | the only `cancel` lane; the only streamed write |
| **Session, Toasts** | **Keep** | context and a shared actor |

### 5.2 New desk modules

**FD Find** (`features/Find/`): a command palette over tickets, customers and parts.

- Contributes: R2 A, R3 A, R4 B, S1 B, F21 B.
- Files: `find.contracts.ts`, `find.definition.ts`, `find.machine.ts`, `FindPalette.tsx`, `find.story.ts`, `find.test.ts`.
- **How this module is different:** no write and no live placement: one-off reads only, cancelled by clearing.

**RW Resolve wizard** (`features/Resolve/`): closing a ticket on site: reason, parts used, customer sign-off.

- Contributes: F2 B, F3 B, F4 B, F8 A, F9 A, F10 A, F11 A, F14 C, F15 A, F16 A, F17 A, F18 A, F19 A, O10 B, O15 B,
  O17 C, O20 B, O22 B, P6 B, R2 C, R4 C, I2 B, Y1, X3 C, X4 A.
- Files: `resolve.contracts.ts`, `resolve-wizard.subroutine.ts`, `confirm-discard.subroutine.ts`, `part-line.trait.ts`,
  `signature.trait.ts`, `ResolveWizard.tsx`, `resolve.story.ts`, `resolve.test.ts`.
- **How this module is different:** built from subroutines, exits, `.history` and nested fragments; the only
  `hostEvents` from a step bar; compensation on abandon.

**AD Roster admin** (`features/Roster/`): technicians, teams and customers for a workspace admin.

- Contributes: E1 A, E2 B, E3 C, E5 B, E6 C, E7 B, E8 C, E9 C, E10 C, E11 B, E12 B, E13 C, E14 C, E15 B, E17 C, E19 B,
  F4 C, F8 C, F10 C, F22 B, O9 C, O14 C, O16 B, O18 B, O19 B, P2 B, P7 C, R1, R5 C, T1 B, T2 B, T6 C, T7 C, Y6 B.
- Files: `roster.contracts.ts`, `roster.domain.ts` (`Technician`, `Team`, `Customer`), `roster.definition.ts`,
  `roster.machine.ts`, `confirm-merge.subroutine.ts`, `skill-chip.trait.ts`, `Roster.tsx`, `MergeCustomers.tsx`,
  `roster.story.ts`, `roster.test.ts`.
- **How this module is different:** several related entities in one domain; a merge that writes across two entities;
  a polling-with-cursor `listen`.

### 5.3 New app CK: Checkout (`references/checkout/`)

A storefront cart and checkout plus a merchant refunds page.

- **Situations it opens:** never charging twice against a third party; authorization holds and compensation; a
  challenge with a visible timer; refunds whose order is money; SSR with a write in flight.
- **Contributes:** F1 A, F3 C, F4 A, F7 C, F8 B, F9 B, F10 B, F11 B, F12 B, F13 B, F15 B, F18 C, F19 B, F21 C, F22 C,
  O1 B, O2 B, O3 C, O4 B, O5 B, O7 B, O8 B, O10 C, O11 D, O12 B, O13 B, O14 B, O16 C, O18 A, O20 A/C, O21 B, O22 C,
  R2 B, R3 B, S3 B, S4 B, E1 C, E4 D, E7 D, E11 C, E12 C, E14 B, E16 B, E18 C, E19 C, P2 C, P3 B, P4 C, P7 B, P8, I1 B,
  I2 C, Y2 B, Y3 B, Y4 A, Y5 B, Y6 C, Y7 C, Y9 B, X3 B, X6.
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

### 5.4 `tools/findings/` (desk)

Tiny, deliberately wrong definitions, one per finding, each with its expected `flow check` line and a test asserting
it. Excluded from the app and from Story globs. Closes I3 A, I4 A.

### 5.5 Deferred by the trim

Recorded as item 33 in [open-items.md](explorations/machine-fragments/open-items.md), "SSE transport and offline
coverage (deferred by the coverage trim)":

- the SSE recipe with `Last-Event-ID` replay as the proof (T1 C);
- `Feed.down` caused by the browser going offline (T4 C);
- a second fact feed resuming its cursor across reload (T11 B);
- `Fake.fetch` with a streamed SSE body (a Y6 variant).

### 5.6 Each API's range, checked

For each API, the situations above differ on at least one axis of section 1. Examples of the range:

- **The hold (O1):** ED title (re-send on a schedule) · CK (never re-send blindly; reconcile, then release) · ED body
  (etag; a re-send meets 412) · QU (a held head blocks a FIFO).
- **`.each` (F4–F6):** over memory (CK steppers, RW parts, AD skills) · over live keys (QU technician cards, QU row
  flashes, PR viewer badges) · owning writes (UP bytes, ED `latest` field autosaves, QU toggles).
- **Many-record writes (E2):** one entity, many rows (QU) · two entities and a delete (AD merge) · many rows, no list
  moves (CM mark read).
- **`serialize` (O7):** bulk operations (QU) · money (CK refunds) · conversation order (CM).

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
| ED title | `draft`, `saving`, `unsure`, `resending`, `gave-up`, `closed-while-saving`, `reopened-unsure` | "The save you can't lose" |
| ED fields and tabs | `typing-summary`, `summary-superseded`, `body-conflict`, `reloaded-mid-autosave`, `second-tab`, `quota-refused` | "Two tabs, one ticket" (`<StoryFrame tab="a">` and `tab="b"`) |
| ED panels | `history-open`, `frozen`, `thawed`, `reservation-expired-while-away` | "Panels remember" |
| QU | `filtered`, `toggled`, `toggled-while-unsure`, `left-unassigned`, `bulk-queued`, `bulk-partly-failed`, `sla-breached`, `created`, `archived` | "Bulk close fifty tickets" |
| QU techs | `technicians-live`, `technician-stale`, `poller-down`, `dispatched-moves-column`, `nudged` | "Who is free" |
| FD | `typing`, `too-short`, `results`, `stale-dropped`, `cleared`, `jumped` | "Find anything" |
| RW | `reason`, `parts`, `back-to-reason`, `confirm-discard`, `resolved`, `left-mid-resolve`, `parts-released` | "Resolve on site" (next-action into the nested subroutine) |
| AD | `roster`, `moved-team`, `merge-predicted`, `merge-refused-restored`, `remove-refused-restored` | "Merge two customers" |
| CM | `posted-in-order`, `edited-in-preview`, `delete-refused-restored`, `pinned` | in the desk tour |
| PR, FE, AS | `joined`, `sdk-resumed`, `typing`, `caught-up`, `history-truncated`, `streaming`, `regenerated` | "Live desk" |
| DD app | `desk-open`, `pushed-rename`, `sign-out-refused` | the desk tour, with gaps shown |
| CK | `cart`, `quantity-coalesced`, `coupon-predicted`, `challenge`, `challenge-timing-out`, `paid`, `pay-unsure`, `reconciled`, `voided-on-leave`, `refunds-queued`, `reload-mid-charge` | "Pay safely", and the property test's counterexample replayed |

Both projects get `app/demo.tsx` (a `StoryPlayer` page per presentation), a property test whose failure prints a
replayable Story, and `flow stories --coverage` in `tools/cli.ts`.

---

## 7. The order of work, in batches

One Opus agent builds everything. The batches are only the order of work.

1. **B1, desk fixes.** REVIEW.md M1–M16, S-H1–S-M6; split `desk.fake.ts`; truth as an Effect Schema. No new features.
2. **B2, Stories as transcripts (if accepted).** ED first for the owner to judge, then the rest of the desk.
3. **B3, desk entities.** CM to a `Comment` entity on `serialize`, UP deletes, QU conditions, sorts, list moves,
   creates; then AD.
4. **B4, desk reshapes and extensions.** ED description fields and panels; QU toggles and bulk `serialize`; AS
   `cancel`; then the PM6 parts: PR over the collaboration SDK and QU's technician panel.
5. **B5, new desk modules.** FD and RW (merged features).
6. **B6, `tools/findings/`.**
7. **B7, Checkout app.**
8. **B8, playback and the map.** Presentations and `demo.tsx` for both projects; recount section 2; update each README;
   revisit every PM6 row and open-items item 33 when merge 6 lands.


**Built (2026-10-31).** B1 102decf2, B2 da1bef1c, B3 768505f8, B4 91927d86, B5 906cae2e, B6 67066476, B7 5677ae36
(Checkout), B8 b268ee67 (playback), B9 (READMEs and this recount). Section 2's "Built (B9)" column and the recount in
2.10 say what exists; each project's README lists its design gaps and what was skipped.
---

## Proposed questions for the owner (round 1)

Answered: the scope is two projects, the desk plus Checkout (option B).

- **Q1.** The admin module AD for entity range? A: yes, a desk module. B: put its entities into QU and CM.
  Recommendation: A: admin is a different domain inside the same app, which is the point.
- **Q2.** QU's assign as a per-row `latest` toggle copy? A: yes. B: keep `reject` assign, add bulk only.
  Recommendation: A: otherwise the queue stays a copy of the editor's template.
- **Q3.** AS on `concurrency: "cancel"`? A: yes. B: keep `reject` with Stop. Recommendation: A.
- **Q4.** Stories as transcripts with `@flow-state/vitest`? A: convert everything in B2. B: new code only.
  Recommendation: A, ED first.
- **Q5.** `tools/findings/` with deliberately wrong files? A: yes, excluded from the app. B: prose only.
  Recommendation: A.

## Decisions (2026-10-31)

- **Trim (owner):** two projects, the dispatch desk and Checkout; Notebook dropped (option B).
- **Q1–Q5, delegated (owner asleep, "give the task to an Opus agent to build all of them"), each the recommended
  option A, for the owner's review:** Q1 Roster admin (AD) as a desk module; Q2 the queue's assign as a per-row
  `latest` toggle; Q3 the assistant on `concurrency: "cancel"`; Q4 every Story as a transcript, with checks through
  `@flow-state/vitest` (`storyTest`, typed `at.<checkpoint>`), editor first; Q5 `tools/findings/` with deliberately
  wrong files, excluded from the app.
