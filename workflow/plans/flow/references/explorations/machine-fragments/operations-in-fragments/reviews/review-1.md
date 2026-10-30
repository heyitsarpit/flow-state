# Review 1: operations in fragments, correctness and real code

**Status: advice to the main session.** Nothing here is decided. Reviewed: [../proposal.md](../proposal.md) under
F1–F7 ([../decisions.md](../decisions.md)), against [../../machine-design.md](../../machine-design.md) (sections 1–2,
2.7.13–2.7.16, rules 1, 9, 14, 20, 39–47, N1–N3) and OD1–OD26. Streams are judged only for ownership. Code for the
three features is in this session's scratchpad (`review/upload.ts`, `review/follow.ts`, `review/comments.ts`); it was
not type-checked, like the proposal's.

## Verdict

**Sound direction, two Highs to fix before acceptance.** Keeping lane identity (FO3) and moving only the *binding*
one level down (2.4) is the right call. Most of the lifecycle table holds when walked. But the proposal leaves the
question "which thing is this incarnation about" implicit. It infers the answer from the placement kind, and records
it only for `.each`, on the Attempt instead of on the lane. The two Highs come from that gap and from freeze and thaw
being defined by analogy. Both fixes are small and add no public word.

**Highs: 2** (H1, H2). Mediums: 9. Lows: 6.

On the real code, a reused feature pays off only when its hosts are thin. The comments panel does: a further host
saves about 79 %. The follow button saves about 20 % on a single-button page, not the 63 % that 4.4 implies. The
upload queue's second host is worse than writing it host-only would be. The worst friction is F4 and F6 together: a
root trait whose input arrives later (an avatar, an editor that switches documents) must be written as `.each` over a
list that also keeps the busy predecessor. Every such host repeats that pattern.

## Root causes

**R1. The placement's subject is implicit and recorded in the wrong place** (H1, M1, M4, M6). FO0's "about one thing"
is a claim about each placement kind: the actor for a root trait, the copy key for `.each`, one life for
`.resumable()`. Nothing enforces it. The copy key goes on the Attempt (FO3) rather than on the lane, so two copies can
share one lane while each Attempt still names a different copy.
*Fix:* name one concept, the incarnation's **subject**: the copy key under `.each`, nothing for the root or for
`.resumable()`, and later the reset value under `resetOn` (phase 2). Record it **on the lane** when the lane is
created, not on each Attempt. A member (`commit`, `retry`, `cancel`) from an incarnation whose subject differs from the
lane's is declined: a commit ends `NotSent { Rejected }` and a retry or cancel is evidence. Delivery goes to the live
incarnation with the lane's subject, or is parked for it. This enforces FO0 at runtime. It also makes FO5's "with the
Attempt's copy key" unnecessary, and gives phase 2 a direct way to admit `resetOn`: a reset value is a subject. This is
a concept, not a word.

**R2. Lifecycle verbs defined "one level down" by analogy leave gaps where the analogy breaks** (H2, M3, L3). Rule 44
was written for an actor, which has no freeze, no same-turn raises into a newborn, and no `when`. Fragments have all
three.
*Fix:* add three rows to the 2.4 delta. What thaw re-places (H2). What the creating turn's raises see before FO6's
deliveries run (M3). That FO8 is vacuous for `.each` (L3).

**R3. The fragment hides its I/O but its summary does not carry what the host's environment needs** (M2, M5).
`Fragment.O` is named by fragment, not by placement, and reads are exempt from `SharedContract`, so a read placed twice
cannot be named. The services the contracts need (Effect's `R`) are not in FO9's summary, so a host Story or Layer can
miss one.
*Fix:* `Fragment.O` reads write lanes only; reads go through the instance path. FO9 and the fragment's type carry the
union of its contracts' requirements.

**R4. Wiring that every author repeats** (open-items item 15; the friction table below). It recurs across all three
features: the retry-budget triplet (`retryable`, else `cancel` and notify), the second `cancel` on `unknown {
Cancelled }`, the line that keeps busy keys in membership, a 0 ms `Flow.entry` tick to commit on creation,
draft-versus-list pruning, and view-minted client ids. None of it is new with fragments. Fragments make it more
visible, because the fragment is meant to be the thing written once.

## High

### H1. Many `.each` copies over one lane: an ending reaches only the committing copy, and a queued write deadlocks

FO0 allows any `.each` copy. FO3 records the committing copy's key on the Attempt, and FO5 delivers to that copy. But
the lane is keyed by the contract key, and nothing ties that key to the copy key. Section 5 covers "one copy, many
lanes" (the comment composer). It never covers **many copies, one lane**, which is the ordinary "follow author on
each post" shape.

```ts
// existing: .each, by; user-defined: FollowButton, posts, postId, authorId
traits: { followAuthor: FollowButton.each({ of: "posts", by: "postId", max: 200 }) },
// filling
followAuthor: { input: ({ item }) => ({ userId: item.authorId }) },   // two posts by one author: two copies, ONE lane (actor, people/set-follow, { userId })
```

Failure walk (`latest`, a domain write):
1. Copy P1 toggles. Attempt a1 is recorded with copy key P1. It ends unknown, so the lane is `Held` and P1's
   `reconcile` is armed.
2. The feed refreshes and P1 scrolls out, so key P1 is removed. a1 is now unbound and parked for P1 (2.4).
3. Copy P2, by the same author, toggles. Under `latest` the commit goes into `W` behind the hold. Under the domain's
   record queue it also heads `Person(authorId)`'s queue (rule 28).
4. P2 never receives a1's unknown, so P2's `reconcile` never arms. Nobody retries or cancels a1. `W` waits until key P1
   comes back, which may never happen, or until the actor ends. Every other actor's follow of that author waits too,
   which is MD 2.7.13's cross-actor limit, now reachable without any disposal.
5. Meanwhile, if both copies are alive, P2's `O.set.retry(own)` names a1, the addressable Attempt (N2). So a copy that
   never committed re-sends another copy's write, and its handlers see none of the endings.

`flow check` passes: FO8 is vacuous for `.each` (L3), and the copy's `UnresolvedHold` check sees an owner inside the
copy. The view shows P2's button "pending" forever.
*Fix:* R1. Bind the lane to the subject of its first commit. Then P2's commit at step 3 is declined `NotSent {
Rejected }`, which maps to `Failed`, and the toast is honest. The proposal should state the rule for authors: under
`.each`, the contract key must be decided by the copy key. A follow-author button per post is written over a
membership of distinct authors. `flow check` cannot see this (the key comes from a closure), so Stories and the
runtime evidence catch it.

### H2. Freeze and thaw do not say what happens to a fragment's reads, and `.resumable()` is v1's only way to put a writing fragment on a tab

The 2.3 table says a frozen trait's reads are "released". FO4 places a trait body's `activities` "for the
incarnation's life". A thaw is the same incarnation (FO6). Nothing says whether thaw places them again, and
`Flow.entry` does not fire on thaw (2.2.1: entered, created or reset).

Under F4, a comments panel (two mapped writes) cannot sit on the Discussion tab's node. The way out the rules allow is
`.resumable()` (scratchpad `comments.ts`, host 2):

```ts
states: ["DETAILS", { DISCUSSION: Flow.state({ traits: { comments: CommentsPanel.resumable() } }) }],   // existing: Flow.state, .resumable()
```

Failure walk: the user opens Discussion, then Details, then Discussion again. At freeze the list subscription is
released. If thaw does not place it again, the panel shows a list that never updates. Its `Listed` handler never runs,
so posted drafts are never pruned, and `writes`' invalidation refreshes a cache nobody reads. That is silent wrong
state. If thaw does place it again but a one-off `lookup` was released at freeze (LiveFeed's `catchUp`), its
settlement is `Superseded` evidence. A status `"owed"` then waits for a `CaughtUp` that never comes, unless some timer
happens to have been armed.
*Fix* (2.4 delta, two sentences): "Freeze releases the incarnation's placements and one-off reads; thaw places its
`activities` again from the thawed memory, as entering a state does. A lookup released at freeze is `Superseded`
evidence, so a fragment that waits on one re-looks-up on a thaw." State as a stated limit that a fragment has no thaw
event, and decide whether `Flow.entry` should also fire on thaw (that is an owner question, because it changes
`Flow.entry`'s meaning).

## Medium

**M1. FO0 checks one placement, not the chain.** "A `.resumable()` trait" and "an `.each` copy" are allowed
literally, even inside a subroutine or a node-placed trait. A resumable trait inside a subroutine is dropped with the
subroutine and is fresh on every entry, so its incarnations are about different things: this is the cross-thing
adoption F4 meant to exclude. *Scenario:* an `Autosave.resumable()` placed inside the `Checkout` subroutine's
`ADDRESS` step. A Back during a save, then a checkout for a different cart line, adopts the first address's `Saved`.
*Fix:* FO0 reads "every placement from the actor's root to this one is a root trait, an `.each` copy, or
`.resumable()` without `resetOn`, and no subroutine is on the path." This is a construction error, as now.

**M2. `Fragment.O.x.get` is ambiguous for reads.** FO2 offers `Fragment.O.x.get(s, k?)` in views for every
operation. Reads and streams are exempt from `SharedContract`, so `traits: { general: LiveFeed, random: LiveFeed }`
is legal and `LiveFeed.O.feed.get(s)` cannot name either placement. *Scenario:* a two-room sidebar shows "live" for
`random` while `general` is offline. *Fix:* `Fragment.O` exposes only write lanes, which are unique per actor by FO3.
Reads go through `s.operations.<instance>.<name>`, as 4.2's view already does.

**M3. The creating turn's raises reach a new copy before its adopted endings.** FO6 delivers parked endings "as
follow-up turns … before any other event addressed to it". But rule 9 lets a source add a key and raise into it in the
same turn, and that raise is earlier still. *Scenario:* the composer's `Attach` adds ref r and raises `Start`, while r
is a key a restore re-adds and whose lane is `Held`. `Start`'s commit runs first and ends `NotSent { Rejected }`
(`Failed { notSent }`). Then `unknown { Restored }` arrives and the copy flips to `"unsure"`. The lane stays safe, but
the user sees "Failed" and then "Unsure", and `onIdle` freed a throttle slot that was never taken. *Fix:* state it in
the 2.4 delta's delivery-order row ("after the creating turn's own raises"). Also give a documented default: a
fragment that commits on creation guards with `O.x.idle`, as `Start` does. That turns the commit into a denied
transition, not a `NotSent`.

**M4. Extracting a host write into an `.each` fragment orphans its persisted lanes.** 2.5 sends an Attempt whose copy
key "no longer fits" to `orphaned` (P19). An Attempt written by the host-only version has no copy key. So the upgrade
that section 4.5 recommends ("extract on the second use") sends every unresolved save of a persisted workspace to
`orphaned`, outside any actor. *Scenario:* v1 ships 4.1's host-only autosave. A user's save is `Held` when they close
the tab. v2 ships the `.each` Autosave. On reload the hold goes to `orphaned` and is never re-sent, and the document
shows clean. *Fix:* with R1 the subject lives on the lane. A lane with no subject that is adopted by an `.each`
placement is delivered to the copy whose key equals the lane key, when `by` names the contract's single key field (4.1:
`by: "docId"`, `key: ["docId"]`). Otherwise it is `orphaned`, and that is stated.

**M5. Effect requirements are missing from the summary.** FO9 records contract id, verb, key and mapped events, but
not the services the contracts need (`DocsApi`, `UploadApi`, `BlobStore`). If the fragment's `R` does not reach the
host's type, a host Story or app Layer without `UploadApi` compiles. The first commit then dies as a defect, which is
an `unknown { Defect }`, held, re-sent within its budget and released. *Fix:* FO9 and the fragment's type carry the
union of its contracts' `R`. The host machine's `R` includes it, so `story.machine(host, { fixtures })` and the
Runtime's Layer are checked by types. This follows Effect convention.

**M6. Removing a unique key strands a hold silently** (F6 is decided; this is about detection). For keys that never
come back (upload refs, client ids, toasts), "parked for the next copy of that key" means held until the actor ends,
with no owner. *Scenario:* the composer's `Remove` without its `Upload.O.put.idle` guard, clicked during an outage.
The lane is `Held`, and the copy is gone forever. *Fix (no new word):* make FO8 structural for `.each`, by analogy
with rule 16's `idle` warning. A host transition that writes an `.each` field, whose fragment summary lists a holding
write, and that has no `Fragment.O.x.idle` token guard, is an `UnresolvedHold` warning. Add runtime evidence when a
copy with a non-`Idle` lane is removed. The board's keep-busy line (4.4) passes, because it reads lanes in
`updateMemory`. Still, accept a warning there or use an explicit ignore: reading lanes in `updateMemory` is not a token.

**M7. F4 blocks a root trait whose input arrives later.** A root trait's `Flow.input` is filled at actor creation, and
`resetOn` is banned with mapped writes. So "one avatar upload on a profile page" and "an editor that switches
documents" (section 5) must be `.each` over a list. Because of F6, that list also keeps the busy predecessor, so it
needs `max: 2`. The host cannot cancel the predecessor (FO2), so it raises the copy's public `Cancel`, which takes two
guarded alternatives (scratchpad `upload.ts`, avatar host: 50 lines, more than the host-only form). *Fix:* none in v1
beyond stating the pattern. R1 is the phase-2 path: a `resetOn` value is a subject, and parked endings wait for the
incarnation with that value.

**M8. `SharedContract` per actor blocks a common screen.** On a profile page with a header follow button and a
"people you may know" list, both `FollowButton` placements count, so the page has a `SharedContract` error. *Scenario:*
there is no runtime failure. The author must fold the header user into the list's membership and render the header
from `key(userId)`, or split the page into two actors. Two actors make two plain writes to one user unordered (domain
writes stay ordered by the record queue). *Fix:* state the folding pattern in FO3, or let one fragment's placements on
one contract share the operation when the subjects can be told apart (R1). That second option is phase 2.

**M9. 4.1's adopted `Conflict` loses the user's text, and Q3's "loses no fact" overclaims.** The disposal path is not
guarded by `Close`. *Scenario:* the user unmounts the workspace while a save is in flight, the save gets a 412, and
the ending is parked. The user reopens the doc, and the copy is fresh from `GET`. Then `Conflict { serverEtag }`
arrives, the copy shows "conflict", and `Overwrite` re-PUTs the *fetched* body. The user's edit was in the Attempt's
`input.body` and is gone. The host-only form loses it too, but fragment incarnations end far more often than actors,
so rule 44's "read what you need from the event" matters more. *Fix:* the example maps `Conflict` with `input.body`
(the mapper's `ctx.input`) and keeps it as `mine`. FO7's sentence "reads what it needs from the event" should be
listed as a Story walk ("copy removed during a save; re-added; the ending is adopted").

## Low

- **L1.** 4.2's root `Reconnect` is now accepted in `SIGNED_OUT`. The trait sets `status: "synced"` unconditionally,
  which re-subscribes a signed-out session, and each click loops through `SignedOut`. The "before" form took
  `Reconnect` only from `OFFLINE`. Guard it on `status === "offline"`.
- **L2.** 4.2's ticket places LiveFeed on a node, so every visit to the tab starts again from `at = { epoch: "",
  after: 0 }` and fetches the room's whole history again. `merge` dedupes it, but it is not "resume from the
  watermark". Say so, or use `.resumable()`.
- **L3.** FO8 passes every host that writes an `.each` field anywhere (stated), so in v1 it is effective only for
  `.resumable()`. Say that in FO8, and point to M6's structural warning.
- **L4.** Inside a fragment body, `operations` in a keyed schedule's `keys` (the comments panel's `resendPost`) is not
  defined. Is it the fragment's own rows or the host's view? State "own rows, keyed the same as the host's".
- **L5.** `retry` after a definite failure of a *released* upload or comment is a new Attempt, so the server may store
  the file or comment twice. This is the stated released-landing limit (OD20). The `Retry` button on
  `"stopped"`/`"failed"` should say so in the example's comments.
- **L6.** FO2 says acting members "exist only in the declaring fragment's body", but `raise` of a fragment's public
  `events` (`Cancel`) lets the host act indirectly. That is fine and intended. Say so, so readers do not take FO2 as
  "the host cannot stop a fragment's write".

## Lifecycle walks (what holds)

| Placement | Enter, leave, re-enter | Copy removed, re-added | Actor dispose | Reload, rebind | Two placements, one contract |
| --- | --- | --- | --- | --- | --- |
| Root trait | n/a (lives with the actor) | n/a | holds: OD19, unchanged | holds: the root incarnation is the actor's | `SharedContract` (FO3); M8 is the cost |
| `.each` | the node's copies end and are re-created by key: holds for one copy per lane | holds for one copy per lane (FO6); **H1** when copies share a lane; **M3** for same-turn raises | parked endings become evidence for a non-persisted identity (2.4 parking row): consistent with OD21 | holds: copies restore by key, then FO6 | as root |
| `.resumable()` | **H2** (reads at thaw) | n/a | as root | rebind is a fresh incarnation (`unknown { Restored }`), consistent | as root |
| any, nested | **M1** (subroutine or node ancestor) | as above | as above | **M4** (upgrade) | as above |

No lost or duplicated write was found beyond H1 and the stated released-landing limit. No ending was found going to
the wrong incarnation outside H1 and M1.

## The rules against rules 39–47 and OD19–OD26

- **FO3 against rule 40 and OD26:** consistent. `writes` and `outcomes` are found by contract id because FO3 keeps one
  operation per contract per actor.
- **FO5 against rule 14 and OD21:** consistent for traits, which have no internal late case. The "nearest surviving
  ancestor inside the fragment" clause matters only in phase 2.
- **FO6 against rule 44:** consistent, apart from M3's ordering. Thaw (H2) is new ground that rule 44 never covered.
- **FO7 against rule 20 (OD22) and 2.7.14:** the arrival set for a trait being its own `on` is correct, since the
  trait has no states.
- **FO8 against rule 45:** see L3 and M6.
- **The 2.4 delta against the table:** the dispose, rebind and parking rows read correctly. The OD25 parked-`Held` row
  for `cancel` and `allow` "applies as is" with "no binding incarnation", which is right. It needs the two additions
  from H2 and M3.

## Visibility

- **`flow check`** sees every fragment operation through FO9. It misses H1 and M6 today; M6's fix is structural.
- **`flow explain` and `flow graph`** draw from the summary, which is fine. Risk 4 (hidden LOST/UNSURE states) is
  stated.
- **Inspection** lists every lane by identity. The "operation path" is derived through FO3's uniqueness, so it holds.
- **Stories:** a fragment Story with `fixtures` holds. Host Stories need M5.
- **A gap in the walk list:** FO10 should name the H1, H2, M3 and M9 walks.

## Section 4 check

The line totals in 4.5 reproduce exactly by script: 93/63/44/107, 94/77/22/99/26, 108/95/27/122/27 and 54/37/44/81/20.
Two readings in it do not hold:

- **"A first use is larger in every case" is true by lines but not by characters.** Counting code characters without
  trailing comments, 4.1's before is 5,742 and its after is 5,238, so the after is 9 % smaller. The before's long
  one-line handlers make it look shorter by lines. The other cases are larger after by characters too: 4.2 +28 %, 4.3
  +8 %, 4.4 +44 %.
- **4.4's "at most 34 (63 %)" overstates the gain.** A written host-only single-button page (scratchpad `follow.ts`,
  the profile host-only form) is 25 lines against the fragment host's 20, a saving of 5 lines, about 20 %. 4.2's
  ticket assumption (94) is fair, since a host-only ticket repeats the whole feed.

The cases themselves hold. The exceptions are 4.2's L1 and 4.1's M9, and 4.3, which is phase 2 and was not walked
deeply.

## Friction table: three features

Lines include blank lines. The contracts and domain are excluded, as in 4.5. Host-only numbers marked "est." were not
written.

| | Upload queue (`.each` by ref; progress, cancel, retry) | Follow button (`.each` in a list; root on a profile) | Comments panel (optimistic post and delete) |
| --- | --- | --- | --- |
| **Lines: fragment + host 1 vs host-only** | 75 + 56 = 131 vs 81 (+62 %) | 37 + 39 = 76 vs 54 (+41 %) | 87 + 17 = 104 vs 82 (+27 %) |
| **Further host, after vs before** | avatar: 50 vs ~70 est. (−29 %) | profile: 20 vs 25 (−20 %) | issue tab: 18 vs ~84 est. (−79 %) |
| **Hacks** | the `File` lives in a `BlobStore` keyed by ref, because memory and lane records must be Schema data; a 0 ms `Flow.entry` tick to commit on creation (Q9's answer); `onIdle` exists only to free a throttle slot; the host's throttle uses guard alternatives to raise into `firstQueued`; avatar: `.each` with `max: 2` plus a guarded raise of `Cancel` (M7); progress emission is assumed (MD 7 item 9) | membership `ids` mirrored from the read (rule 9), plus the keep-busy line (F6); the profile-plus-suggestions page must fold the header into the list (M8) | the view mints `clientId`; drafts are pruned against `Listed` ids (rule 33); `.resumable()` on the tab only to satisfy F4 (H2) |
| **Wiring every author repeats** (item 15) | the retry-budget triplet; a second `cancel` on `unknown { Cancelled }` to release a user's stop; status mirrored from endings into memory for the row; "start the next one when a slot frees" | the retry-budget triplet; keep-busy membership; a toast callback with a fixed message | the retry-budget triplet twice; two keyed reconcile schedules of the same shape; drafts against list reconciliation; `writes` invalidation of the thread's list on every post |
| **Where F4 or F3 blocks a real need** | a single upload at the root (input arrives later): forced into `.each` (M7) | the header plus a list on one screen (M8); follow-author per post is allowed but wrong (H1) | a writing panel on a tab node: only `.resumable()` (H2) |
| **One mistake `flow check` should catch** | `Remove` without `Upload.O.put.idle`, which strands a unique-key hold forever: **not caught today** (M6's warning would catch it) | copy key ≠ lane key (`by: "postId"`, key `userId`): **not catchable** statically (closures); the runtime decline from R1 catches it in Stories | a toast-only `DeleteUnsure` with no `cancel`: **caught** (`UnresolvedHold`, unchanged inside fragments) |

**Worst friction:** M7 with F6. A thing that changes during the actor's life has to become a list that keeps busy
predecessors, and the host has to cancel them by raising events. That cost lands on every host of such a fragment, so
the reuse buys nothing there.

## For `revisit.md` (proposed, not written there)

- R1's subject as phase 2's admission rule for `resetOn` and node traits.
- Whether `Flow.entry` should fire on thaw (H2).
- A "release on user cancel" mapping, so `unknown { Cancelled }` does not need a second `cancel` (R4; item 15).
