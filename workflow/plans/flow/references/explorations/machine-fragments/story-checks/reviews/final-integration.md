# Final integration check: streams v3, Stories amended, Fakes v2

Advice to the main session. Nothing else was edited. Paths: "v3" is `merge-6-streams/proposal-v3.md`, "SA" is `story-checks/stories-amended.md`, "F2" is `story-checks/fakes-v2.md`.

## Verdict

**One High, a sample that the new ping rule breaks; the fix is one signal. The three documents otherwise agree on behaviour.** Five Mediums are worth fixing before the owner reads them. `clearedAt`: I recommend cutting it (section 2). `bufferSize`: I recommend cutting it, which closes SA item 17 (both in section 2).

**Ran:** `scratchpad/final/t3.mjs` (my own BFS of T1's `connect`, T2 rows 3, 5, 6, 7, T3; about 300 to 500 states per config) and `scratchpad/final/fills.ts` (`tsc --strict` against `infer.ts`'s stand-in type, not real Flow). The full directory is `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/final/`. The model is small: one key, up to 4 items, atomic pages of 1, no stale duplicates, no Persistence. No Flow code exists to run.

**Stale words: clean.** `Feed.reconnect`, `initial`, `Story.make`, `.expect`, `latency`, `Story.records`, `process()`, `delivers: "facts"` and `Feed.CannotRepair` appear only in before blocks, cut lists and conversion notes (`initial` on `Fake.server` is the legitimate word). No `at:` remains on `Feed.live`, `more`, `done`, `gone`. All `Feed.done` samples carry `proof`. Rule numbers agree: SA keeps 61–66, v3 takes 67–72, and `machine-design.md` ends at 66. Exceptions are in L1, L2.

## 1. Findings

### High

**H1. The ticker contradicts T1's ping rule: a quiet symbol never goes `Live`.**
Where: v3 6.3 (lines 678–684, 709) against v3 3.2's `idle` row (line 219) and T1's `ping` row (line 475).
The adapter emits only pings and quotes, with no `Feed.live`. A ping in `Connecting` does not re-arm, so a quiet symbol ends `Silent` at 25 s and reconnects for ever. `Silent` is not a flap, so it never ends. My count: 69 connections an hour, 0 flaps, never `Live`. Line 709 says "Quiet market: pings keep `Live`", which is false. Each retry re-subscribes on the shared socket. Line 219's own advice ("a server first event") is what this sample skips. Presence, chat, polling, `fetch`, graphql-ws and Electric all register properly; only the ticker fails.
Fix, in v3 6.3:

```ts
readonly frames: (symbol: string) => Stream.Stream<{ t: "subscribed" } | { t: "ping" } | { t: "quote"; quote: Quote }, MarketDropped>   // the service emits subscribed when this symbol's subscribe is sent
Stream.map((f) => f.t === "subscribed" ? Feed.live() : f.t === "ping" ? Feed.ping : f.quote)
```

A11's caveat at line 1060 (ticker's `frames` not compiled) stands.

### Medium

**M1. `O.x.bookmark({ at })` skips `clearedAt`, so 3.7's own "stays cleared" recipe does not hold.**
Where: v3 T3 line 528, 3.7 line 304.
The action sets `filled` false itself, so T3's end-of-turn row (`filled` and now empty) never fires and `clearedAt` stays old or undefined. Model: `clear + bookmark, value, leave with wipe, enter, page`: the cleared item returns. Same with leave in the turn.
Fix, if `clearedAt` stays: T3 line 528 gains "**if the field is empty, `clearedAt = at`**". The model is then clean on this oracle. If `clearedAt` is cut (section 2), this goes away.

**M2. T1 does not set `seen` on `done` or `gone`; the model does.**
Where: v3 T1 lines 485–486, against `s3/every.ts` line 49 and the old model's `done` path.
`through` is optional, and `Feed.done(items, { proof })` is what an author writes first. Built from the table, `complete(through ?? seen ?? greeted)` then finds nothing on a single-page read with no head, and the record is `{ at: undefined }` over a filled list. Next: a false notice and a full re-read on each reconnect, and a clear returns everything (`enter, page, page, clear, value`). 3.7 item 3 says this happens only when no position is known, but the page's items carried positions.
Fix: lines 485 and 486 add "`seen` = last item". Safe either way: newest-first pages only set it lower, which is duplicates. Model: the "cleared returned" hit goes.

**M3. v3 section 9 cannot be applied without `proposal-v2.md`, and that text is wrong for v3.**
Where: v3 section 9, lines 1161, 1169, 1179.
"v2 6.1 stands" points at v2's rules 61–66, which collide with SA's 61–66. Its rule 25 row names `Feed.reconnect`. Its rule 37 row lists four reasons, not `Feed`. Its Testing row is superseded by SA's C70, C71, C73. And "per v2 6.2" omits v2's rows for Persistence O4 and ServerRendering O2, O5, V3, V5, so an implementer cannot tell if they stand. SA section 8 gives lines; v3 gives none.
Fix: replace section 9's first two lists with one self-contained table: v2's 6.1 and 6.2 rows copied, renumbered (`61→67, 62→68, 63→69, 64→70, 66→72`; check v2's 65), `Feed.reconnect` rows dropped, and Testing O2, O3, O6 marked "taken by SA C70, C71, C73". Add today's anchors: rule 8 line 473, 13 line 562, 14 line 572, 20 line 620, 25 line 694, 37 line 787, 47 line 866, 52 line 929, 57 line 992, 2.5 line 1076, 2.7.3 line 1399, 2.7.8 line 1926, 2.7.9 line 1963, 2.7.10 line 2004, 2.7.13 line 2092, 2.7.15 line 2532, 2.7.16 line 2561, 2.8 line 2619, 3.6 line 5579. Say they are taken before Stories merges and shift after it.

**M4. Section 1's silent-loss table leaves out four real cases.**
Where: v3 lines 32–42. Each is stated deeper in the file, and the owner reads section 1.
Add these rows:

| Case | Who breaks it | Same in trimmed v2? |
| --- | --- | --- |
| A guard denies a value or a page: the bookmark moves past it, with `DeliveryDenied` evidence only (rule 71, Q3) | App | Mostly: the next value moves the cursor past it |
| `fills` names a wrong field of the right kind: wipes are misread. `FillsUntouched` flags some (3.6) | Memory shape | No |
| Under `subscribe.each`, an evicted, quiet, empty key reads as first open (T3's bound) | Scale | No |
| A false `Feed.live({ proof })`. The Adapter row names only `Feed.done`'s | Adapter | Yes |

Also line 9's "does not compile, unless" is then true. Line 24: after "die within a minute" add "(a `Silent` end does not count, so a half-open server retries for ever)".

**M5. SA section 10 item 16: all three still stand, and v3's Flapping Story cannot run.**
Where: v3 lines 1126, 1139–1145. All three SA claims check out against the rules.
Fix:

```ts
const bookmark = (cp: Story.Frame<typeof ChatRoom>) => cp.records("session", { operation: O.activity }).at(-1)?.bookmark
const flapped = Array.from({ length: 7 }).reduce(
  (story: typeof base) => story.advance("1 second").world(Chat.socket.drop()).advance({ next: { operation: O.messages, timer: "backoff" } }),
  base,
).advance("1 second").world(Chat.socket.drop())                           // the eighth drop ends it: no backoff left (W7)
 .checkpoint("ended")
expect(ended.state).toBe(S.ENDED)
```

Then SA item 16 and section 11 item 14 can read "done". Fix line 1131's comment too: `filled` false reads "cleared, no message since", not "stays cleared" (a later message raises it).

### Low

**L1.** v3 section 9's table and line 1183 are stale: F2 has taken items 1, 2, 3, 13, 14 (F2 lines 95–97); SA has `filled` (SA line 949, 1036). Change the column to "Taken", drop "Rename needed" and line 1183's second clause. Line 1055: S3 no longer lacks F2's heartbeat; make it P and recount line 1065 to 13 C. "SC" (lines 1055, 1136) is never defined; write "`stories-amended.md`".

**L2.** SA line 2253: "`held` is internal to v3" is wrong; v3 Q7 renamed it. Write "`bookmark` with `filled`, as 2.10.6". v3 T7's `fresh(r)` (line 586) and T1's `seen` reuse words that lines 14, 372, 1229, 1231 announce as cut: rename `current(r)` and `lastRead`.

**L3.** The ping rule did not reach the fake text. F2 line 95, SA lines 384, 1485, item 12: "keeps the connection alive" holds only once registered. SA 2.10.9's heartbeat row: add "a ping does not register: `open` still sends the greeting". F2 line 32's `frame: { room: "", text: "", from: "" }` is a blank `Message`, which a chat adapter emits as a value; show a union with a ping frame. F2's `delivery` shape (line 178) lacks SA's `ping: true`.

**L4.** Two T1 gaps an implementer hits. `lose` under the default never steps `n`, so literally the delay never grows (line 465): "Under the default: step `n` for the delay; it never exhausts." `idle`'s re-arm is written only on `ping`: line 497 add "re-armed by `register`, a value and a ping".

**L5.** "In a row" is not what `lose` counts (lines 24, 405, 465): `Silent` neither adds nor resets, so 7 flaps, then an hour of `Silent`, then one flap is `Flapping`. Reset `flaps` on `Silent`, or write "8, none healthy in between".

**L6.** Unstated false notices; no data lost; all visible in the model. (a) A wipe with no prior clear, dropped before its read lands: `b = { at: undefined }`, so row 7 owes one notice, against "no notice" (lines 67, 299). (b) A drop in a first load after a `more` with no `through` (Ably): no record, field filled, row 7; 6.1's "Row 3 again" holds only with an empty field. Row 7's notice is needed for from-now feeds, so state these rather than add state. Add both to 3.7 and 6.1.

**L7.** A clear during a read: pages landed before the clear are not past the frozen `at`, so they return after a drop or wipe. 3.7 item 4 reads as only later pages. Reword: "a read in progress: its items may return".

**L8.** `fills` typing. (a) `infer.ts`'s `FillsField` keeps `?`, so `fills: undefined` compiles when memory has any optional field (chat's `notice`). I ran this against the stand-in: `{ [K in keyof M]-?: … }` is the fix. (b) An optional or nullable list is rejected; 3.6 does not say so. Add: "a required field: `Schema.optional` and `NullOr` are not offered." Otherwise the rejections hold.

**L9.** `drop`'s lifetime on the row is not in T1: `register` does not clear it. Say whether it does. v3's and SA's chat test (`filter((r) => r.drop)`, length 1) depends on a record carrying `drop` only when written; say that in SA 2.10.6's row.

**L10.** v3 line 1245 cites models in `/private/tmp`, which will not survive. Copy `s3/` to `merge-6-streams/model/v3/` and cite that. v3 line 431's "Supabase's 2,048": I found no source; the only 2,048 is RV1's "queue plus buffer" arithmetic (`reviews/v3-round-1.md` line 193).

**L11.** If `clearedAt` stays: SA line 949's `bookmark` (`{ at, filled }`) and v3 line 1095 need it too, or a test cannot see the clear after a later message. T3's decode row (line 534) should say "`at` or `clearedAt`". T3's "Upgrade" row (line 533) has nothing shipped to upgrade from: cut it.

## 2. The new items, walked

| Item | Result |
| --- | --- |
| `proof` on `Feed.done` | Sound. T1 records it and nothing branches on it. Only M4's table row was missing |
| Ping rule | Sound as a rule. Broke the ticker (H1) and the fake text (L3). Chat, Presence, polling, `fetch`, graphql-ws recipes were checked and hold |
| `Silent` not a flap | Sound against AT 9's trap; L5 is a wording or reset choice. Note it also means a heartbeat server that half-opens each time never ends: visible, row `Connecting`, no data lost |
| `head`, `through`, `at` | No leftover `at` on a signal or answer. SA and v3 agree. `head` and `through` do one job in `complete`, so they could be one word (below) |
| `bufferSize` | See below |
| `fills` rejections | L8 only. Spike is against a stand-in, as v3 says |
| `clearedAt` | M1 and L11 are its bugs. See below |

**Is `clearedAt` worth it? My advice: cut it, and state the limit.** RV3 said "do not add a third bit", and this is it, unreviewed by any round.
- **What it buys:** one sequence, clear, then a message, then a wipe. With no later message, `filled` false and `at` already stay cleared. Model with no `clearedAt`: exactly that one hit, and no others.
- **Direction of failure.** Without it, cleared items visibly come back, and nothing is lost. With it, an accidental `[]` no longer heals on a wipe, and a bug in it hides items silently. Section 1 already calls the accidental `[]` the worst form. Correctness first says take the failure that shows.
- **Cost.** A second persisted position (O5 decode, SSR digest), writes in T1 `connect`, T2 rows 2 and 5, three T3 rows, and rule 71, and it already hid one bug (M1) in one read. 3.7 already lists six ways cleared items return, so "stays cleared" is a soft promise regardless.
- **Against cutting.** AT finding 5 is real: a chat's Clear, one message and a room switch un-clears. Add it as 3.7's seventh item, with the recipe: keep `clearedBefore` in memory and skip older items in `upsert`, since the app knows its own order. Say plainly that it is the owner's call, in section 1's "Look at these first", with this trade. If the owner keeps it, M1 and L11 are required.
- **Edits if cut.** T1 `connect`; T2 rows 2, 5; T3's lines 528–530, 534; rule 71; section 2's table; 3.7 lines 298, 303; 6.1's row; Q7; line 53; section 11's two mutants. Re-run the model afterwards.

**32 words: what can go.** Each with a one-line reason; I recommend (1).
1. **`bufferSize`: cut (31).** The desk's 256 was a test bound, and a flood test can send 1,025 frames: SA says "a flood is a long list". That closes SA item 17: no contract's production bound is set for a test. Its production case has no source (L10). Under `reconnect`, `Overflow` retries and catches up. Edits: v3 3.2, 3.2's table, Q8's row, line 1209; SA line 1027 ("send `1,024 + 1` frames"), item 17, section 11 item 13. Put it in `revisit.md`. **If kept:** still change SA line 1027 not to suggest a low bound in a test.
2. **`head` into `through` (30), owner's read.** `Feed.live({ through: f.head })`: "known through here". `complete` already treats them alike. Q7 split them for clarity, so this is taste, and a rename across the samples.
3. **`Feed.Signal`:** a type for helpers, with no behaviour. It could move to read-only, but that changes the count, not the design. Do not bother.
`pages` stays, as v3 says.

## 3. Complete as proposals?

- **Decided against proposed:** clear in all three. v3 line 3, F2 line 3, SA's marks. S11, S12 and the W rows are cited correctly.
- **Lines:** SA section 8's anchors were spot-checked and match today's `machine-design.md` (650, 999, 5684, 5759, 5769, 6533). v3 has none: M3.
- **Plan clauses cited exist:** Persistence O2, O3, O5, ServerRendering O3, Operations O1, O4, O6, V9, Q1, Machines O5 (overdue, line 127), O6, Runtime O4, O6, Testing, EntityDomains O1, O4, Inspection O4, CommandLine O5.
- **Unproven:** both are honest. v3 section 11 lists the new items as not modelled, and SA section 6 says the model must be re-run. v3 line 53 tells the truth about `clearedAt`.
- **Samples:** read as written, apart from H1 and M5. v3's and SA's chat Story are identical, and its steps agree with 2.10.9. One name, `Chat`, is both contract and fake in v3's samples; acceptable for an illustration, since they sit in separate files.

## 4. Merge order

No conflicts if merged in this order. **Stories first, because SA's section 8 lines are today's**; `decisions.md` line 94 agrees.

1. **Preconditions, in `story-checks/`:** re-run the Stories executor model (SA section 6, item 6); convert the desk's fakes (F2 section 6).
2. **Owner accepts** Stories and the Fake spellings. Apply SA sections 3, 4, 7, 8 to `machine-design.md` and to `Testing.plan`, `Package.plan`, `Diagnostics.plan`, `EntityDomains.plan`, `Inspection.plan`, `CommandLine.plan`. **F2 is not merged on its own:** it says SA wins, and 2.10.4 has its text.
3. **Owner accepts** v3, after M3's table. Apply it: rules 67–72 after 66, no overlap with SA's rules 11, 58, 61–66. The shared places are additive: 3.6 (two rows), section 5 (new C rows after C85), Inspection O4. Testing O2, O3, O6 need nothing further (M3).
4. **Then remove** the `*Stream details: merge 6*` marks in 2.10.9, 2.10.15, 2.10.18.7, and take SA section 11's table out of the proposal. Update `revisit.md`, `open-items.md`, `NEXT.md`.
5. **The one dependency:** SA 2.10.9 assumes v3 (`catchingUp`, `bookmark`, `backoff`, `page`, `healthy`, `idle`). If the owner falls back to trimmed v2, that section and section 11 need revising; the rest of Stories stands, `ping` included.
