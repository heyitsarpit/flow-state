# Impact: call state belongs to the use site (the `calls` object)

**Not pursued (2026-11-07):** closed at the references cleanup; nothing has referred to it since 2026-10-31. Kept as prior art.

Written 2026-10-30 as an exploration. Nothing here is accepted, and no proposal was edited. Abbreviations: MD =
[machine-design.md](../../../../flow/references/explorations/machine-fragments/machine-design.md), AU = [audit-multiplicity.md](../audit-multiplicity.md), M3, M4, M5, M6 = the
`merge-N-*/proposal.md` files. Citations are `file:line` as the files stand today.

**Verdict in one line:** the lane model gets simpler and several rules and decisions disappear, but the change is
**medium**, not small: it also reverses "fragments do no I/O" (MD rule 3), reverses D9 (two commit values share a
lane), needs one new rule for a call whose owner is gone, and turns every list of independent calls into a trait with
membership. Section 2 has the count; section 6 shows that a cheaper variant exists for lists.

## 1. The model

**A call site** is a name in a `calls` record of an owner body (machine, trait or subroutine). Its value is a commit
value (`O.x.commit(select, { outcomes })`, MD:982-985). The site is the identity of the lane:

| Question | Answer |
|---|---|
| Lane identity | (owner instance, call name). The owner instance is the actor, a state-placed or root trait incarnation, a subroutine incarnation, or an `.each` copy (key and incarnation, MD:466-473). Two placements of one fragment have two owners, so two lanes (`likesA`, `likesB`; `{ A: Confirm }`, `{ B: Confirm }`). |
| Existence | Declared, so it always exists while its owner does: `s.calls.pay` is never `undefined`, a typo is a type error. Eviction, "absent lane" and `?? false` (MD:570-574, D11, D19, N3's lane clause) have no subject. |
| Row | `{ pending, retryCount, progress? }` under `reject`, `latest`, `cancel`; `{ pending, outstanding }` under `allow`, `serialize` (`pending` is `outstanding > 0`, so view code reads one name in every mode). `retryCount` and `progress` stay type errors under `allow` and `serialize` (rule N2 stays). |
| Where it is read | Actor: `s.calls.pay`. Trait, subroutine or copy: on that instance's slice, `row.calls.set.pending` (recommended over a parallel `s.calls.<instance>[i]` list, because a row would otherwise have to be zipped from `s.memory` and `s.calls`; `calls` becomes a reserved slice name beside `key` and `item`, MD:457-458). |
| Members | `calls.pay` in `actions` starts a write. `calls.pay.retry`, `.cancel`, `.idle` take **no key selector**. `idle` is still the guard with `InFlight` (rule 16); `pending`, `retryCount`, `outstanding`, `progress` are snapshot data only. |
| `reject` | A start on a pending site ends `NotSent { why: "Rejected" }`; the transition runs (rule 16, unchanged). |
| `latest` | One in flight, one waiting, **per site** (MD:1218). A newer start replaces the waiting one. See the K-rule below. |
| `cancel` | A start cancels the site's previous Attempt. `x.cancel` still cancels every outstanding Attempt of the site (rule 24). |
| `allow` | Any number outstanding at one site; the row says how many. One call that needs status, retry or progress needs one owner (a copy). |
| `serialize` | One running, up to 64 queued, per site. |
| Retry | The site's addressable Attempt (rule N2, unchanged). `retry` on a pending addressable Attempt ends `Rejected` (rule 16). Because the lane is the site, **"which commit value started it" is the site**, so the per-Attempt starter and lane-key bookkeeping (MD:575-578, D20) vanish. |
| Routing owner | Unchanged and separate from the lane owner. Current or late is still decided at admission by the **state activation** the starting transition names (rule 14, MD:515-521). A lane lives with an instance; an ending routes by a state. |

**K-rule (new, small).** The transaction `key(input)` no longer names a lane. It is kept for one machine-visible test:
a `latest` or `cancel` start supersedes or cancels, and any start replaces a retained *unknown* Attempt, only if the
older Attempt has the **same key**; with another key the site counts as busy (`Rejected`). Without it, one host site
used for many records lets `latest` drop another record's write: its mapper reads `superseded: true` and the handler
ignores it as "newer intent" (MD:1245), so the user's like on row 1 is silently never sent. Unkeyed transactions never
trip it.

**What the key still does.** Honestly, little. Record queues are keyed by the **predicted record** from `.predicts`
(M4 rule 28-29, M4:577-582), not by the transaction key; M4 rule 34 only borrowed that record key as the *lane* key
(M4:614-616). So the key's remaining jobs are the K-rule and `flow explain`'s print (M5:541-543). The owner's phrase
"entity record queues across actors, and ordering" overstates it: queues need no `key`. Recommendation: keep `key`
optional with exactly the K-rule's job, and say so in Operations O1; if the owner prefers fewer concepts, delete it and
replace the K-rule with a Story-derived `flow check` warning (`SiteManyKeys`). Rule 34 then shrinks to "the default key
for the K-rule" or goes.

**Owner lifetime (resolves design item 15, and proposes rule N4).** MD:2259-2262 closed item 15 as "call endings are
never dropped" and let the Attempt carry the copy's key. That still holds for the *delivery guarantee*, but a lane that
lives on a copy dies with it, so the closure needs a destination:

- **N4. An ending whose owner incarnation is gone is an orphan ending.** It is admitted (the Attempt's ending is
  recorded, rule 17 holds), never mapped onto the dead owner's events, and delivered to the owner's host through a
  **required port** per call, `calls.<name>.onOrphaned` (a `Flow.Callback` whose payload is the ending report:
  channel, reason, `key`, `input?`). `{ target: "self" }` is the explicit ignore, as for late events (rule 20, D13).
  It is the host-side twin of `whenAbandoned` (MD:421-425). Calls on the actor root have no orphans.
- A **frozen** `.resumable()` owner is alive: the ending updates the lane and the mapped event waits for the thaw, as a
  queued timer does (MD:371-372).
- Leaving an owner never cancels its Attempts (C12, MD:2147); the lane row simply leaves the snapshot with the slice.

**Persistence.** The lane persists in the owner's slice, with the same keys and counters (MD:474-476, C17). On restore
an invoked send ends `unknown(Restored)`, an unacknowledged one `NotSent { Restored }` (MD:1330); the ending routes to
the owner incarnation if the repaired key list still has it, otherwise it is orphaned (N4).

**Stories (M3).** A Story and a view read the same rows: `checkpoint.snapshot.calls.pay`,
`checkpoint.snapshot.memory.likes[i].calls.set` (M3:877-897 becomes one paragraph). `ending` evidence and
`checkpoint.pending` operation entries name the **call** (`{ owner: instance path, copy key?, name }`) instead of
`operation` plus lane key (M3:539-560, 956-957). Naming clash: M3 already uses `checkpoint.calls` for callbacks and
exits told (M3:390-404, 933, 1415-1418); rename one of them.

**Fragments placed twice and subroutines.** Placed twice: two owners, two lanes, by construction (and the cross-record
order still comes from the record queue). Subroutine: the lane is fresh on every entry (rule 1), so its `retryCount`
budget resets on re-entry; abandoning it with a pending call orphans the ending (N4).

**Where this makes existing text smaller or deletes it.**

- Deleted: eviction and "absent lane" (MD:570-574, D11 MD:2423-2426, D19 MD:2476-2480, N3's lane clause MD:627-628);
  key selectors on `idle`, `retry`, `cancel` (MD:581, 583, 998-1004); `laneKey` in every mapper (MD:961-966, D21's
  second half, item 6 MD:2234-2236, M4:177, M4:225); the `SharedCopyLane` warning (MD:453-455, C18 MD:2153); the
  per-Attempt starter and lane key (MD:575-578, D20 MD:2481-2491); the `find` reads (MD:1087-1090); the key consts
  (`challenge` MD:1531, `chargeKey`, `refundKey` MD:1168-1169).
- Shorter: rule 21 (28 lines to about 14), N2, D18.
- Reversed: D9 (MD:2415-2418) and the paragraph "Lanes belong to the transaction and key, not to `pay`"
  (MD:1006-1017). See section 4, problem 3.

## 2. The impact table

Dispositions: **R** rewrite, **S** small edit, **D** deleted, **U** unchanged (listed only in the last table). A
"small edit" is a sentence or a spelling (`pay.idle(key)` to `calls.pay.idle`). A "rewrite" changes the content.

| Doc | Item (lines) | Disp | Reason |
|---|---|---|---|
| MD | Rule 3 No I/O (409) | R | Traits and subroutines declare calls. The question is how far (section 4, problem 1). |
| MD | Rule 9 `.each` fillings and incarnations (441-480) | R | The copy owns the lane: the Attempt-carries-copy paragraph (449-458, 466-473) becomes "the lane is the copy's"; orphan endings per N4. |
| MD | Rule 10 hidden level and summaries (481-485) | S | A contract summary lists the calls a fragment starts, and the host sees `row.calls`. |
| MD | Rule 11 tested alone (486-489) | S | A fragment alone needs fixtures for its calls (M3 `Fixture`). |
| MD | Rule 13 endings map to events (508-514) | S | "the definition's events" becomes "the owner's events"; `laneKey` gone from the context. |
| MD | Rule 14 owner, current, late (515-521) | S | Adds: owner instance gone means orphan (N4). State-activation routing is untouched. |
| MD | Rule 16 declines (525-534) | S | `idle(key)` to `idle`; `NothingToResend` names its row by the owner. |
| MD | Rule 20 required handling (544-550) | S | A late event of a fragment owner arrives as `onOrphaned`, filled by the host. |
| MD | Rule 21 the lane (551-578) | R | Per site, not per actor, transaction and key. Existence bullet and starter bullet go. |
| MD | Rule 22 memory reads (579-596) | S | Key selects of `idle`, `retry`, `cancel` no longer exist (581, 583); lane-read bullet (595) renamed. |
| MD | Rule 24 cancel (603-608) | S | `x.cancel(key)` to `calls.x.cancel`; still every outstanding Attempt of the site. |
| MD | N1 one reference, one thing (616-620) | S | "call lanes" leave the keyed-list roster. |
| MD | N2 per-call reference (621-626) | R | Same promise, shorter: no lane key, no starter; "give each call its own key" becomes "its own owner". |
| MD | N3 existence (627-631) | S | The lane clause goes; copies and records stay. |
| MD | D4 commit value is the handle (2391-2395) | S | Superseded again: members lose their key arguments. |
| MD | D5 declines are endings (2396-2401) | S | `pay.idle(key)` spelling. |
| MD | D6 lane read (2402-2406) | S | Same two facts, now on the site's row. |
| MD | D7 keys optional (2407-2408) | R | Keys are no longer a lane concept; K-rule only. |
| MD | D9 two commit values share a lane (2415-2418) | R | Reversed: two sites, two lanes. Options in problem 3. |
| MD | D11 settled lane evicted (2423-2426) | D | Declared lanes always exist. |
| MD | D18 lanes are `s.calls` (2465-2475) | R | Same reasons (typed, one published value), new shape: a record by name, rows on slices. Rejected options A-C stay rejected. |
| MD | D19 absent lane has no row (2476-2480) | D | No such thing. |
| MD | D20 concurrency decides members (2481-2491) | R | F1 is closed by construction at one site; the starter clause goes. |
| MD | D21 copy-started calls, `laneKey` (2492-2496) | R | `laneKey` deleted; copy-started becomes copy-owned; N4. |
| MD | Revision paragraph (12-15) | S | A second revision note. |
| MD | 1 The idea (34-36, 44-52) | R | "Fragments are locked islands of logic with no I/O" is the headline claim. |
| MD | 2.1 table and reading (63-89) | S | `calls` on instances; keyed-list roster loses call lanes (82-84). |
| MD | 2.2 "Fragments may not declare `operations`" (292) | R | Reversed for `operations` and `calls`; still no `context`, `send`, persistence. |
| MD | 2.3 where things go, row 303 (303) | S | Commit values are written in the body of whoever owns the call. |
| MD | 2.5 turn tables (645-649) | S | Key selects row; lane-read paragraph. |
| MD | 2.6 key order and `Flow` (745-763) | S | `calls` joins the category order; "a lane is snapshot data" sentence. |
| MD | 2.7.2 data sources (897, 901, 902, 904) | S | Rows for `key`, copy key, `retryCount`, cancel. |
| MD | 2.7.3 mapper context (961-966) | S | `laneKey` removed. |
| MD | 2.7.3 handle, member table, keys optional (972-1004) | R | New member table; no key selectors; "keys are optional" shrinks to the K-rule. |
| MD | 2.7.3 "Lanes belong to the transaction and key, not to `pay`" (1006-1017) | R | Reversed (D9). |
| MD | 2.7.3 refusing, static start, select typing (1019-1043) | S | Spelling. |
| MD | 2.7.5 reading a lane (1082-1105) | R | Without `find` and `?? 0`. |
| MD | 2.7.6 waiting and reconciling (1117-1153) | S | Spelling; `lane()` helper at 1142 goes. |
| MD | 2.7.7 compensation, cancel (1168-1205) | S | `chargeKey`, `refundKey`, `waitUnsure(refund, refundKey)`, `put.cancel(key)`. |
| MD | 2.7.8 concurrency (1215-1246) | R | "per actor, descriptor and key" to per site; the row column; the likes example needs a per-row owner. |
| MD | 2.7.11 batches (1299-1303) | S | "Keyed by item, `reject`" to "one owner per item". |
| MD | 2.7.12 timing table (1323) | S | "the lane row exists". |
| MD | 3.1 sign-in (1349-1350, 1463-1464, 1531, 1654) | S | `verify.idle`; one verify at a time, not one per challenge (problem 9). |
| MD | 3.2 signup (1843, 1867, 1871) | S | Already unkeyed; spelling only. |
| MD | 3.4 pin commit (1973, 2000, 2012-2014) | R | `pin.idle(({ event }) => ({ id }))` is per row: it needs a row owner. |
| MD | 3.6 keywords (2054-2055) | S | Drop `laneKey`, `s.calls.<operation path>`; add `calls`, `onOrphaned`. |
| MD | 4 L2 (2064) | S | Wording about copy-started endings. |
| MD | 4 L6/L8 (2068) | S | "an absent lane is absent" goes. |
| MD | 4 L7 (2069) | S | `verify.idle(key)`. |
| MD | 4 A5 I/O inside fragments (2088) | R | "Prevented (rule 3)" becomes "allowed, by design". |
| MD | 5 Machines O1 fragments row (2103) | S | Fragments declare `calls` and `operations`. |
| MD | 5 Machines O1 operations row (2109) | S | Same. |
| MD | 5 Machines O4 (2114) | S | Guards receive `calls` rows of their owner. |
| MD | 5 Machines O8 (2115) | S | Snapshot shape. |
| MD | 5 Persistence O2 (2116) | S | Lanes persist in the owner's slice. |
| MD | 5 Testing O1 (2117) | S | Fragment Stories need fixtures. |
| MD | 5 CommandLine O5 (2119) | S | New findings (below). |
| MD | 5 C6 (2141) | S | Mapper context. |
| MD | 5 C7 (2142) | S | Members without keys. |
| MD | 5 C8 (2143) | R | Rewritten (rule 21). |
| MD | 5 C12 (2147) | S | Owner kinds. |
| MD | 5 C17 (2152) | S | Persist in owner's slice. |
| MD | 5 C18 (2153) | S | `SharedCopyLane` goes; `SharedTransaction`, orphan findings come. |
| MD | 5 C20 (2155) | D | Replaced by the N4 row. |
| MD | 6 "Fragment I/O" bullet (2173-2176) | R | No longer left out. |
| MD | 7 item 0 (2217-2221) | S | F13 becomes a prerequisite (problem 4). |
| MD | 7 item 6 `laneKey` (2234-2236) | D | Moot. |
| MD | 7 item 15 copy call owners (2259-2262) | R | Re-closed by N4, not by "carries the copy". |
| MD | "Changes after review" list (2338-2342) | S | A new entry. |
| M3 | Header revision (17-20) | S | Q40 settled a third time. |
| M3 | 2 table, lane row (277) | S | Spelling. |
| M3 | 3.4 `copy` on `ending` entries (435) | S | Folded into `call`. |
| M3 | 3.6 `ending` entries (539-560) | R | `call` replaces `operation` plus lane `key`; rule 34 sentence goes. |
| M3 | 3.6 lanes on the snapshot (569-574) | R | New row shape and placement. |
| M3 | 3.6 `pending` bullet (575-590) | S | Entries carry `call`. |
| M3 | 3.12 frame example (772, 776) | S | `row.calls.like.pending`. |
| M3 | 3.14 reaching a lane (877-897) | R | Whole subsection. |
| M3 | rule 8 (950-964) | S | Row shape; `copy` field. |
| M3 | rule 17 (1037-1038) | R | Rewritten. |
| M3 | 5 and 6 implementation and tables (744, 1058-1059, 1075, 1095, 1121, 1123, 1169, 1171) | S | Eight mentions of the old row. |
| M3 | Rejected-alternatives text (1353-1366) | S | Re-point to D18. |
| M3 | Q21 (1477-1481) | R | Row shape and placement. |
| M3 | Q40 (1381-1398, 1593-1598) | R | Third revision of one question. |
| M3 | Keyword and table rows 1202, 1215 | S | Rule-21 and rule-34 rows. |
| M3 | `checkpoint.calls` name clash (390-404, 933, 1116, 1138, 1415-1418, 1618) | S | Rename one side. |
| M4 | Header (5) | S | Decisions list. |
| M4 | 1 glossary "the lane" (23-24) | S | A site's lane. |
| M4 | 2 lane row and `saving` view (79, 90) | S | `row.calls.like.pending`. |
| M4 | 3.1 the list (99-325) | R | Section 4 below; two traits plus a thin host. |
| M4 | 3.5 E2 (434-437) | S | `calls.x.retry`. |
| M4 | 3.7 E10 (505-523) | S | Default key is for the K-rule only. |
| M4 | Rule 29 (590-595) | S | "Actor concurrency" to "the site's lane". |
| M4 | Rule 31 (603-609) | S | Spelling. |
| M4 | Rule 34 (614-616) | S | Or delete if the key is deleted (section 1). |
| M4 | 6.4 unknown lanes live until success (901-904) | D | Bounded by the owner; no leak of abandoned keys. |
| M4 | E17 (936-941) | R | Per site; "per-call key and `reject`" becomes "per-call owner". |
| M4 | E2 and E7 entries (913-915) | S | "Superseded in part" again. |
| M4 | Amendment tables (675, 699, 723, 735) | S | Rows naming the lane key and rule 21. |
| M5 | 3.4 `many` key sentence (366-371) | S | "Every start shares one lane" is now the default for a site. |
| M5 | 3.7 `flow explain` (531, 541-543) | S | Prints the call name and owner, not the lane key. |
| M5 | Table row 86 (86) | S | Rule 34's role. |
| M5 | Amendment sentences (768, 822-824) | S | The `many` retry sentence. |
| M6 | Header (10-11) | S | Progress read. |
| M6 | Table rows 131-132 | S | "lane per actor, transaction and key" adapted. |
| M6 | 4.1.8 progress (369-373) | S | `s.calls.generate.progress`. |
| M6 | Rule 48 and its table row (573-577, 608) | S | Same. |
| M6 | 7.4 chat example (878-899) | S | The `find` reads go. |
| M6 | 7.5 upload walk (906-922) | R | One `Upload` trait per upload, instead of a keyed `reject` lane. |
| M6 | M6-D5 | S | Read location. |
| AU | N1, N3 | S | As MD. |
| AU | N2 | R | As MD. |
| AU | 2 matrix (14 lane rows) and 2.5 totals | S | Many "wrong" cells become "defined by construction". |
| AU | F1 fix | R | Closed by the site, not by "addressable". |
| AU | F4 fix | R | The copy owns the lane. |
| AU | F5 `laneKey` | D | Moot. |
| AU | F9 decision | R | Shape and placement of `s.calls`. |
| AU | 4 items 2 and 3 | S | M5 follow-ups. |
| AU | 5 decisions 1-4 | R | Re-asked. |

Unchanged (so the denominator is visible):

| Doc | Items unchanged |
|---|---|
| MD rules (14) | 1, 2, 4, 5, 6, 7, 8, 12, 15, 17, 18, 19, 23, 25 (rule 5 gains one port, `onOrphaned`, with no text change) |
| MD decisions (11) | D1, D2, D3, D8, D10, D12, D13, D14, D15, D16, D17 |
| MD sections (6) | 2.7.1, 2.7.4, 2.7.9, 2.7.10, 3.3, 3.5 |
| M3, M4, M5, M6 | All rules and decisions not named above, including M4 E18 and rules 26-28, 30, 32, 33, 35-38; M6 rules 41-47, M6-D6, M6-D7; M5 outside lane keys |
| AU | F2, F3, F6, F7, F8, F10-F15 (11 findings) |

**Count.** The 118 rows of the table are the changed items.

| Doc | Rewrite | Small | Deleted | Total |
|---|---|---|---|---|
| MD | 20 | 45 | 4 | 69 |
| M3 | 6 | 10 | 0 | 16 |
| M4 | 2 | 10 | 1 | 13 |
| M5 | 0 | 4 | 0 | 4 |
| M6 | 1 | 6 | 0 | 7 |
| AU | 5 | 3 | 1 | 9 |
| **All** | **34** | **78** | **6** | **118** |

Recommendation for AU: do not edit it. It is the dated record behind N1-N3. Add one note at its top that D18-D21 are
superseded in part by this change, which turns its 9 items into one.

Plan-level documents (Operations O1/O3/O6/O7, Machines O1/O4/O8, EntityDomains O1) get the same edits as MD section 5's
C rows. They are not counted.

**New decisions this needs (named, not written):** D22 call state belongs to the site; D23 fragments may declare
`operations` and `calls`; D24 N4 and `onOrphaned`; D25 the K-rule.

## 3. Problems it solves

Mapped to the bug list (AU:7-17, the owner's list, MD:2481-2491).

| Bug | Before | After |
|---|---|---|
| **Wrong-write retry** (AU F1) | `retry` re-sent "the newest start" on a lane of several Attempts; fixed by N2's addressable Attempt and a type error under `allow`. | By construction at one site: the addressable Attempt is the site's. Under `allow` a site has no `retry`, and a call that needs one has its own owner. N2 stays as the statement of this, but D20's starter clause goes. Residual: a site used for many keys (K-rule). |
| **`.each` copies share a lane** (AU F4) | Needed the Attempt to carry copy key and incarnation, a `SharedCopyLane` lint and a note that the lane key must name the copy (MD:453-455). | Impossible: each copy owns its own lane. Lint deleted. |
| **Keyed lookup** (M3 Q40, MD:1087-1090) | `s.calls.Stripe.confirm.find((l) => l.key.intentId === id)`, a wrong key reading as idle. | `s.calls.pay.pending`, `row.calls.set.pending`. No key to get wrong. |
| **Two uses of one operation collide** | `pay` and `payWithSaved` shared one lane on purpose (D9); two list rows with unkeyed `setLike` shared one too. | Two sites, two lanes; two row copies, two lanes. The cost is D9's server promise (problem 3). |
| **Never-started reads** (AU F9) | A lane never started read as idle unless `?? false` was written, and a never-started row was indistinguishable from an evicted one. | A declared site always exists. No `?? false`, no D19. A wrong site name is a type error. |
| **`progress` under `allow`** (AU F1, M6 rule 48) | A type error under `allow`, with "key each upload". | Same error, and the fix is concrete: one owner (an `Upload` copy) per upload; its `progress` is `row.calls.put.progress`. |

Also solved: the `NothingToResend` ending naming its row (`laneKey`) is replaced by the owner's `key`; key selectors in
`idle`, `retry`, `cancel` and rule 22's key-select clause disappear; lane eviction and its growth question (M4:901-904)
disappear; the `lane()` helper at MD:1142 and four key consts disappear.

## 4. New problems and open questions

**1. Calls in traits reverse "fragments do no I/O".** MD:34-36, rule 3 (MD:409), MD:292, A5 (MD:2088) and the first
bullet of section 6 (MD:2173-2176) all say fragment I/O was deliberately left out, and rule 10's promise (swap a
fragment for one with the same summary, MD:481-485) assumed a fragment's effects were callbacks and exits. The owner's
`Like` trait lists `O.Issues.setLike.commit(...)` inside the trait. *Recommendation:* accept it. The alternative, a
`Flow.Call` port the host fills with a commit value, keeps rule 3 literally, but the host cannot read the trait's
private memory or `key`, so the select ends up in the host and the row trait loses its point. Consequences to write
down: the summary records "starts call X" (a state-changer-like effect); `story.trait` needs fixtures; rule 8's
totality now covers the trait's own endings.

**2. Owner gone before the ending (N4).** Section 1 proposes one required port per call, `onOrphaned`. Costs: one line
per call per placement; its payload is an ending report, not the mapped event, so the host cannot reuse the trait's
handlers. *Recommendation:* N4 as written. The alternative, drop orphan endings with evidence as raises are dropped
(MD:466-473), breaks rule 17 and re-opens D13's sign-in hole (a late wrong code that must strike). A smaller fallback:
make `onOrphaned` `Flow.optional` with the info finding optional guards already get (MD:160), and let `flow check`
error only for transactions with `unknown:` mapped.

**3. D9 reverses: two sites on one transaction can both charge.** `pay` and `payWithSaved` were one lane so `reject`
promised one write in flight per intent (MD:1006-1012). Now they are two lanes. *Options:* (A) lane per site, plus a
`flow check` warning `SharedTransaction` when one actor has two sites of one `reject` transaction; the fix is one site
whose select reads `memory.useSaved` (selects read the after memory, rule 22, so one site covers both: MD:1028-1032
already shows the conditional start as two alternatives). (B) Keep a hidden per-actor gate on (transaction, key) for
`reject` only. *Recommendation:* A. B keeps two identities for one fact, which is what the audit removed, and for an
unkeyed transaction its gate would span copies. The case is rare and visible in code.

**4. Lists become traits, and bulk actions need F13.** Four of about ten keyed-lane examples change shape: the likes
(MD:1236-1246, M4 3.1), the pin (MD:1973, 2000), M4's drafts and M6's uploads. Each needs a row trait, a membership
list in host memory kept in sync with the data, a `max`, and a view sending `E.rows.key(id).Toggle()`. "Delete
selected" or "like all" over rows is a raise into every copy, which AU F13 (AU:347-352) left **not expressible**.
*Recommendation:* make F13 a prerequisite (`E.rows.keys(ids).Event()` or an `all` address) before any list adopts
this. A smaller trap: ids past `max` are repaired away (MD:464-465), so a row beyond `max` has no copy and no action.
`max` must be the page size.

**5. Cost of the per-row trait for lists (M4 3.1, both ways).** M4 3.1 today is 159 lines (definition 49, machine 109;
M4:138). A sketch of the same list under the new model (row trait, draft trait, thin host; drafted for this comparison,
not type-checked; the domain's 26 lines unchanged):

| Piece | Lines |
|---|---|
| `IssueRow` trait (three calls, reconcile schedule, six handlers, three callbacks) | 51 |
| `DraftRow` trait (`create`, `del`, status in trait memory) | 44 |
| Host definition (memory `issueIds`, `draftIds`; two `.each`) | 20 |
| Host machine (activity, toast, `Create`, `Listed`, callback fillings) | 31 |
| `onOrphaned` fillings (five calls) | about 5 |
| **Total** | **about 151** (today 159) |

Line count is a wash. What moves: `likeUnsure` memory, its keyed schedule, `draft`/`editDraft`/`dropDraft`/`without`
(M4:193-196) and the two key consts (M4:199-200) vanish; per-row retry budgets and `latest` per row come free. What
is added: two files, `max` bounds (500 rows), membership writes in `Listed` and `Create`, three callbacks for toast,
reload and selection, and a `Listed` handler that must prune draft copies by their own `id`. A draft copy removed while
its `del` is pending is an orphan (N4). The per-turn cost of reconciling 500 copies and publishing 500 slices is
unmeasured and should be before this is accepted for lists. A cheaper rewrite is not available: with host-level sites
and `latest`, the K-rule makes a second row's like `Rejected` while the first is pending; with `allow` there is no
coalescing.

**6. Calls shared between a machine and its fragments.** A site has one owner, so the host cannot start a trait's call,
and a trait cannot start a host's. The host starts a trait's call only by raising a `hostEvent` into it (as
`E.timer.Start`, MD:1448). The host may read the trait's rows (rule 4: it reads everything) and guard on
`!row.calls.set.pending`, but `idle` is a body-level handle, so such a guard loses the standard `InFlight` code.
*Recommendation:* rows also carry `idle` as `true | Denial` (as a field's `error` does, MD:1384), and a trait call's
select may read only the trait's memory, its event and `key`; host data enters through `Flow.input` and guard ports.
Exclusion between a host site and a trait site writing one record is the record queue's job (order), not a lane's.

**7. A call started in one state and read in another.** A lane is the owner's, not a state's, so a root-owned site
reads the same everywhere (the sign-in's `verify.idle`, signup's `create.idle()`). A trait or subroutine placed on a
state owns a lane that leaves with the state: `pending` becomes unreadable after leaving, and the ending is an orphan.
*Recommendation:* the rule of thumb is rule 1's, "the highest node whose lifetime matches" the work; add a
`flow check` warning when a state-placed trait's call can be outstanding at its owner's end and the host fills
`onOrphaned` with an ignore. History re-entry (MD:378-380) stays a warning: a re-entered state is a new activation.

**8. `calls` in the definition or in the machine body.** The principle in MD:306-307 is: structure (it produces `S`,
`E` and view types) lives in the definition; filling (it refers to `S`, `E`, `O`) lives in the machine. A call is both:
its existence and its mode (`s.calls.pay`, the row shape) are structure; its select and outcomes are filling.

| | Body (owner's example) | Definition |
|---|---|---|
| Locality | commit value next to the transitions that list it; mappers use `E` | name and transaction in the definition, commit value in the machine: two lists for one thing (against MD:765-768 and the memory note "properties live with declarations") |
| Typing | the row type must flow from the body to `Actor<typeof Machine>` (views already use it, MD:1732) and, for traits, to the host's slice type through `trait(declaration, body)` | rows come from the definition like every other slice; `check(s, ...)` and `story.machine(def)` see them |
| Risk | inference through the body's return (the summary-in-types question, MD:2222-2224) | `calls: { pay: Stripe.confirm }` repeats the `O.Stripe.confirm` the machine already writes |

*Recommendation:* the body, if the spike shows the row type reaches `Actor<typeof Machine>` and a trait's host slice;
otherwise the definition lists name and transaction only (`calls: { pay: Stripe.confirm }`) and the body fills them,
as `operations` is listed in the definition and used through `O`. A separate scope hazard: guards receive `calls` (the
rows, rule 22 area, MD:2114), while the body-level `calls.pay` is the handle. Name the body-level one differently
(`C.pay`, or `call.pay`), or the guard parameter shadows it.

**9. Sign-in behaviour changes.** `verify` is keyed by challenge (MD:1531, 1654) so a late verify of challenge c1 does
not block c2's Submit. Under one site, c2's `verify.idle` says `InFlight` until c1's ending is admitted. *Recommendation:*
accept: it is stricter and simpler, and the 15-second soft timeout (MD:1663) still frees the UI. Say so in 3.1.

**10. Small ones.** (a) Naming clash with M3's `checkpoint.calls`: rename that one (`checkpoint.told`).
(b) Should activities move into trait bodies too, since keyed activities are now the odd keyed list (M6-D7)? Defer. (c)
`.each` reserved names grow by `calls`. (d) A resumable owner holding an ending (section 1) is the one place a mapped
event waits indefinitely; cap it with the same retraction rule as timers. (e) Rule 5 gains an implicit port per call
(`onOrphaned`) for fragment-owned calls; list it in the contract summary.

**New `flow check` findings.** Errors: unfilled `onOrphaned`; a transaction used at two sites of one actor with
`reject` (`SharedTransaction`, a warning if the owner takes problem 3's option A). Warnings: a site whose starts carry
more than one key in Story traces (`SiteManyKeys`), a state-placed call outstanding at its owner's end.

## 5. How often does one machine call the same operation more than once?

Counted from the five rewrites in [merged/server-calls/rewrites/](../../../../flow/references/explorations/machine-fragments/merged/server-calls/rewrites/) and the design's
examples. "Sites" are `.commit(...)` values (`grep` of the rewrites).

| Machine | Commit sites | (a) one operation from **different** sites | (b) one site, **many concurrent** calls |
|---|---|---|---|
| `checkout.ts` | 3 (`pay`, `challenge`, plus the `intent` read) (checkout.ts:54, 67, 74) | 0 | 0 (one intent) |
| `booking.ts` | 5 (`hold`, `charge`, `confirm`, `refund`, `release`) (booking.ts:55-76) | 0 | 0 (one hold) |
| `signin.ts` | 2 (`verifyCode`, `resendCode`) (signin.ts:52, 59) | 0 | at most 1 per challenge in flight (`reject`) |
| `m1.save.ts` | 1 (`save`) (m1.save.ts:33) | 0 | 0 (one open document) |
| `list.ts` | 4 (`like`, `create`, `rename`, `remove`) (list.ts:68-95) | 0 | **4 of 4**: per row, per temp row |

**(a) is zero in all five rewrites, and the owner's expectation holds.** The only case in the design is hypothetical:
`pay` and `payWithSaved` on `Payments.charge` (MD:1014-1015), which exists to explain D9. Starting **one site from
several transitions** is common and is not (a): `remove` starts from `Delete` and from `Created` (list.ts:95), `refund`
from the late `Paid` and the give-up (MD:1186-1187). That is one site with two start points, and it needs no change. I
did not find P13's `overwrite`/`merge`/`flushAfter` in the current text; the proposal records P13 as resolved by rule
22 (merged/server-calls/proposal.md:1019), so the stale-select workaround that would have produced a second site is gone.

**(b) is common, and only in lists.** All four sites of the list; the pin per row (MD:1973, 2000); chat send per
message (MD:1090); uploads per ref (M6:906-922); batches per item (MD:1299-1303). The other machines are single-call.
So the real multiplicity is "one site, many items", and D9's two-sites collision (problem 3) is a rare case. This
lowers the weight of problem 3 and raises the weight of problems 4 and 5.

## 6. A third option: a call site declared as many

Option C. Declare the multiplicity on the site, keyed by a list the host already owns, instead of moving the site into
a per-row trait (option B, sections 1-4). Option A is today's model.

```ts
calls: {
  like:   O.Issues.setLike.commit(select, { outcomes }).each({ of: "issueIds" }),     // one lane per id in memory.issueIds
  create: O.Issues.create.commit(select, { outcomes }).each({ of: "creating", by: "draftId" }),   // rule 9's `by`
  remove: O.Issues.remove.commit(select, { outcomes }).each({ of: "issueIds" }),
}
// read:  s.calls.like.find(l => l.key === id)   (a keyed list, N1)  -- or, when the list is `.each` copies,
//        row.calls.like.pending                 (the lane is published on the copy the view already renders)
// act:   actions: [calls.like.at(({ event }) => event.id)]   retry / cancel / idle take the same `at(key)` selector
```

A many-site is a **declared set of lanes**: one lane per key of the `of` list, owned by the host actor (not by a
copy), created when the key joins the list and not when a call starts. The key is the list's key, not `key(input)`, so
the transaction's `key` is deleted outright and the K-rule is unnecessary: `latest` coalesces per key because the lane
is per key. Where the list is not memory (the Issues rows come from an activity's answer, M4:306), the host keeps an id
list in memory (`issueIds`, written by `Listed`), or the view reads by `find`.

**Issues list (M4 3.1), rewritten with option C.** The domain (26 lines) is unchanged except that `createIssue` loses
its `key`. The definition adds `issueIds` and four `.each` declarations; the machine replaces the key consts by `at`
selectors and keeps everything else. As a diff against M4:138-300:

```ts
// definition: + memory.issueIds: Flow.initial(Schema.Array(Schema.String), [])                       (+1)
// body:       + calls: { like, rename, remove, create }, each ending `.each({ of: ... })`            (+4 over the 4 consts)
//             - const issue = ..., drafted = ...                       (-2); + const at = (f) => ...  (+0, the selector is inline)
//             Listed:  updateMemory adds `issueIds: event.ids`                                       (+0, same line)
//             guards:  remove.idle(issue) -> calls.remove.idle.at(issue); create.idle(drafted) -> ...at(drafted)   (+0)
// kept:       likeUnsure memory and the keyed reconcile schedule, draft()/editDraft()/dropDraft()/without(), the Draft schema
// view:       s.calls.like.find((l) => l.key === id)?.pending     (was find on l.key.id)
```

Sketched, not type-checked: about **161 lines** (M4's 159, +1 memory, +1 net for `calls` declarations, +0 spellings;
the `key:` line of `createIssue` moves out of the domain file).

| | A: today (M4 3.1) | B: per-row traits | C: many-site |
|---|---|---|---|
| Lines (definition plus machine plus traits) | 159 | about 151 (3 files) | about 161 (2 files) |
| Lane identity | actor, transaction, `key(input)` | copy incarnation plus name; fresh when a key is re-added | host plus name plus list key; a re-added key finds its lane again if it still exists |
| Retry, cancel, idle addressing | by `key(input)` selector | none, the lane is the instance | `at(key)` selector; a key not in the list is `NothingToResend` |
| Ending after the row is removed | routed normally (owner is the host) | an orphan (N4): needs a new rule and a required `onOrphaned` line per call | routed normally to the host mapper with `key`; the lane row is gone, the ending is not lost. No new rule |
| Never-started reads | `find` returns `undefined`, `?? false` | none, the slice has the lane | none for keys in the list; `find` returns `undefined` for a key not in it |
| Two copies share a lane | possible (`SharedCopyLane`) | impossible | impossible, keys are distinct list entries |
| Typing | `s.calls.<op path>` keyed list | row type from the trait | keyed list typed by the `of` field's element type |
| Per-row behaviour besides the call (status, a reconcile timer, a toast) | host memory arrays and a keyed schedule | in the row trait's memory and schedules | host memory arrays, as today |
| Reverses rule 3 (fragment I/O) | no | **yes** | no |
| Bulk start over many keys | not expressible (actions are static, Machines O1) | needs F13 (raise into every copy) | not expressible either; same gap |
| Reusable across hosts | no | yes (the trait) | no |
| Concepts added | none | `calls` in fragments, N4, `onOrphaned`, reserved `calls` slice | `.each` on a commit value, `at(key)` |

**Recommendation: C for lists whose rows are host data, B for rows that are their own thing, and neither for a
single-call machine, which just uses a plain site.**

- **Use C** when the rows already live in host memory or in an answer and the call is the only per-row behaviour:
  likes, pin, rename, remove, the chat's per-message send. This covers the Issues list. It keeps today's per-key lane
  semantics, deletes `key(input)`, fixes never-started reads and `laneKey`, and needs no rule 3 reversal and no N4,
  because the owner is the actor.
- **Use B** when each item has its own behaviour (status, timers, progress, cancel) or the unit is reused in several
  hosts: the draft with its status machine, an upload with progress and cancel (M6:906-922), the owner's `Like` trait.
- **Order of work.** Adopt the single named site and C first. They fix the whole bug list of section 3 except "calls in
  fragments", and need only rule 21's rewrite. Add B (calls inside fragments, N4) as a later, separate decision, since
  it alone costs the principle reversal.
- With C alone the impact count falls by about 11 rows (rule 3, rules 10 and 11, the idea, 2.2:292, A5, section 6,
  both Machines O1 rows, Testing O1, C20 and item 15 become unchanged or smaller), to about 110, and the size to
  **small to medium**.

## 7. Verdict

**The owner's expectation is half right, and the size is medium.**

Right: the semantic change is one sentence ("a lane is a use site's, not a transaction-and-key's"), it removes more
than it adds in the lane machinery (about 12 deletions of rule fragments, 6 whole items), and it turns the audit's
hardest finding (F1) and its largest family (copies sharing lanes, never-started reads, keyed lookups) into properties
of the model instead of rules. 78 of 118 changed items are one-sentence spelling edits (`pay.idle(key)` to
`calls.pay.idle`), mostly mechanical.

Wrong, or understated: (1) the example puts I/O in a trait, which reverses the headline principle of the fragment
design and touches rule 3, rule 10, rule 11, A5, section 6, Machines O1 and Testing O1; (2) it reverses D9, and the
double-charge protection is replaced by a lint; (3) it needs a new rule for an ending whose owner is gone (N4); (4)
every independent-calls list becomes a trait (unless it uses option C), with membership, `max` and, for bulk actions, the unexpressible F13;
(5) 34 of the 118 items are rewrites, 20 of them in MD; (6) the transaction `key` is nearly vestigial, not a living
"server-side concern", and the owner should know that before relying on it.

Honest size: **medium for the owner's example (option B), small to medium if lists use option C (section 6) and calls
inside fragments wait.** About 118 touch points in five documents under B, of which about 35 need thought. Design work is
concentrated in four decisions: D22 (the site), D23 (I/O in fragments), D24 (N4), D25 (the K-rule). It is smaller
than the multiplicity audit's rewrite of lanes (which added N1-N3 and D18-D21) in rules, larger in principles.
Recommended order: decide problems 1 and 3, settle F13, let the type spike answer problem 8, then edit MD, then M3 and
M4, then M6 7.5; leave AU as a record.
