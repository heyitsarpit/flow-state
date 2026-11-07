# Check: streams merge into machine-design.md

Status: **applied 2026-11-01**, with the owner's decisions; nothing skipped. High 2's adapter is `ChatLogSocket`, so 2.10.18.7's fixture is `ChatLogSocket.layer.pipe(Layer.provide(ChatFake))`. The flood doubt is not settled, and is in section 7 item 23 as unproven; line numbers below stay those of `40c3c68e`.

Reviewed 2026-11-01. Scope: `afcc2641..40c3c68e`, against [merged/streams/merge-plan.md](../../../../flow/references/explorations/machine-fragments/merged/streams/merge-plan.md) (ME1–ME88, MX1–MX21) and [proposal-v3.md](../../../../flow/references/explorations/machine-fragments/merged/streams/proposal-v3.md) (v3). Line numbers are of `machine-design.md` at `40c3c68e`. Only this file was written. Everything below is by reading: no model, type check or Flow code ran.

## Verdict

**The normative text merged faithfully. The merge's own Story fixes do not type-check.** 2 High, 6 Medium, 10 Low. Both Highs are in samples the merge changed (MX6, MX7), not in a rule or table.

| Check | Result |
| --- | --- |
| Streams T1–T9 against v3 section 5 | A line diff, with labels normalised, leaves only headings, the moved rules table and `req` prefixes. **Every cell is equal.** |
| Rules 67–72 | 67 and 72 equal v3. 68–71 gain text not in v3's rows, each sourced (rule 41's row, rule 8's row, S11, v3 section 2); no behaviour is invented. Plan ME23 names only 71's addition (Low 7). |
| 2.11 against v3 sections 2, 3, 6, 8, 10 | Code equal once comments are stripped, except `ChatSocket.layer` and the planned wording. 2.11.10's "Repair" and "Failure maps" are fair summaries of ST Q3 and ST Q6. |
| Section 7 item 23 | Page-order contract at 5778. All 16 silent-loss rows at 7683–7698, with only labels changed. Every Unproven item at 7703–7710, plus S15's fallback and S16's note. |
| S1–S16 | All 16 rows equal decisions-v2.md, with annotations appended. Low 6 is the one gap. |
| Stale words | `DuplicateStreamSession`, `Feed.reconnect`, `Feed.CannotRepair`, `bufferSize`, `"facts"`, resume position in `input`: outside 2.11, each remaining hit is a removed list, an annotated decision, a C row naming what it replaces, or a fake's own `from`. No `*Stream details*` or `M6 rule` is left. |
| Edits landed | All 88 ME rows are in the text. The plan's script-level "After" strings that seemed absent span line breaks, and were checked by eye. |
| Links | `machine-design.md`, `README.md`, `NEXT.md`, `revisit.md`, `open-items.md`, `stories-amended.md` and all of `merged/streams/` resolve, except two quoted in the plan (Low 7). The moved desk `tsconfig.json`'s relative paths are correct. |
| Labels | No bare T*n* for a stream table is left in 2.10 or 2.11. Requirement rows carry `req`. Low 5 and Low 8 are the remaining clashes. |

**Item 4, the merge's own additions:**

| Addition | Verdict |
| --- | --- |
| Rule 13, author tag equal to a `Feed` reason | **Correct, and needed**: `lose(e)` tests "`e` is Flow's", so an author's `Closed` would be misread. But incomplete: Medium 2. |
| C102, `Feed` beside `stream` | **Correct.** Package O1 lists `stream` and `listen` on the root route, and contracts and adapters both need `Feed`. Diagnostics is missed: Medium 6. |
| Rule 71, not `Flow.private` | **Correct.** 2.2.2 makes `Flow.private` a memory modifier. |
| Rule 40, bare `every` excluded | **Correct** (S7 Q22). But 2.7.3 still says the opposite: Medium 1. |
| `ChatSocket.layer` as a fixture | **Wrong as written**: High 1. MX6 says it did not examine this. |
| No-`catchUp` contract in 2.10.18.7 | **Hides a problem**: High 2. |
| `Story.app` cut annotation | **Hides a problem**: prose over a sample left wrong. Medium 4. |

## High

**1. Lines 5593, 6469, 8437: a fixture that needs a sibling fixture is a type error under the design's own rule.**

> `fixtures: [ChatSocket.layer, ChatFake, HistoryFake],   // user-defined. [P, merge] ChatSocket is in R, so its Layer is a fixture; ChatFake binds the constructor it reads`

`ChatSocket.layer` (5699) has `Socket.WebSocketConstructor` in its own `R`. `Testing.plan` O3 and 2.10.4's table (3942) say a fixture "may depend on setup services", not on other fixtures, and that "missing service requirements are type errors". `Story.machine` has no setup, and 3.6 removes `services?`. So nothing states that the list resolves one fixture from another, and the plan (MX6) says so: "not re-examined". The record's own desk trial, the only code that was type-checked, wrote it the other way: `DeskFeedSocket.layer.pipe(Layer.provide(socketClient))` (`trials/desk/features/Tickets/feed/feed.story.ts:23`, also `presence.story.ts:21`).

This is general. 2.11 makes a service adapter the standard form, so nearly every stream Story meets it.

Fix, in both samples:

```ts
fixtures: [ChatSocket.layer.pipe(Layer.provide(ChatFake)), HistoryFake],   // ChatFake binds the constructor ChatSocket.layer reads
```

Change 5593 likewise, without `HistoryFake`, and 8437's wording to "`ChatSocket.layer`, provided `ChatFake`, as a fixture". If the owner would rather have the list resolve siblings, that is a Testing O3 change, and needs its own C row.

**2. Line 5575: "The machine is 2.11.2's `ChatRoom`, over a contract with `position: "seq"`… and no `catchUp`": no such machine can exist.**

A definition imports its contract, so a different contract is a different definition, and that contract is written nowhere. Reusing 2.11.2's definition fails four ways:

1. **A type error.** 5664 maps `pages: E.Page.from(…)`, and 2.11.6 says `pages` is "optional, needs `catchUp`".
2. **`position: "seq"` names no field.** 2.10.4's `Message` (3997) is `{ room, text, from }`, and 2.10.18.7 reuses it with no redeclaration. So `v[position]` has nothing to read, and `slice(req.from ?? 0)` has no sequence to agree with.
3. **The adapter does not read this fake.** "ChatSocket is 2.11.2's adapter" (5593), but that adapter branches on `f.t` and emits `f.message` (5706–5711), while this fake's frames are bare `Message`s (5580). `frameOf` could wrap them, but nothing says so. `from` is also typed `Cursor` there and a number here.
4. **The prose contradicts the sample and 2.11.3.** "With `ping`, `hold({ after: 2 })` is a real half-open" and "a client's `idleTime` ends it", but this `Fake.stream` has no `ping`. 2.11.3 (5747) says a source whose only registration is its first value "has no time to give: `"Infinity"`".

The Story's walk itself is right: `from: 2`, and Streams T2 row 6 owes one `missed Unproven`. Only its subject is wrong.

Fix: write the subject out, per AGENTS.md's "complete, no `…`". In 2.10.18.7, add a contract `ChatLog` with `position: "seq"`, `reconnect`, `idleTime: "Infinity"`, a `Message` with `seq`, its one-branch adapter, and a definition with no `pages`, and call the machine `ChatLogRoom`. Drop the `ping` sentence, or add `ping` and a greeting to the fake and a real `idleTime`. Update 8437.

## Medium

**1. Lines 1531, 1501: "for every kind" contradicts rule 40 as amended.**

> `A **bare** operation (typing: ChatTyping.typing, …) maps nothing, for every kind` … `a read's or stream's data is in its lane for views`

Rule 40 (810) now says never an `every` stream, and `ChatTyping` has no contract in the design, so 1501's "bare… the machine subscribes" cannot be judged. An `every` row has no data either (2.11.9). Rule 40 also leaves one question open: 2.11.6 requires `failure` on a `listen` entry, but rule 37 (790) exempts `listen` from its list, and rule 40's clause names only "an `every` stream's".

Fix at 1531: "maps nothing, for every kind but an `every` stream (rule 40), and a `listen` entry, which must map `failure` (2.11.6)"; and "a read's or a `latest` stream's data is in its lane". At 1501: `// bare: a delivers: "latest" stream; maps nothing`. At 810: "(never an `every` stream's or a `listen` entry's…)".

**2. Line 572: rule 13's list omits the tag `Feed`.**

> `on a stream, so is one of Feed's reasons (Closed, Overflow, Silent, Flapping) [P, merge]`

`failure` has a key spelled `Feed` (2.11.6). An author error tagged `Feed` then matches that key: the map's exhaustiveness passes with one line covering both, which is the hole MX9 exists to close. Fix: add "or the tag `Feed`, the map's own key".

**3. Lines 1085, 1086, 1089 with 1083 and 5616: rule marks overclaim what the owner decided.**

Line 1083 says "Each is **[P]** but where it cites S11 or S15". Rule 67 cites S11, but S11 only spelled `delivers`: "never skipped or silenced, one per turn" and "current only while this connection confirmed it" are v3's. Rule 68 cites S15 and opens "Streams T1", while 5616 says the tables are [P]. Rule 71 cites S15, which confirmed that Flow keeps the position with `fills`, not "`at` and `filled`" or the partition's shape. AGENTS.md: "Never present something as decided unless I accepted it."

Fix: mark clauses. 67: "**Kinds.** The spelling is S11's; the meanings are [P]." 68: "(behaviour, S15; Streams T1 is [P])". 71: "(that Flow keeps it, S15; its shape is [P])". Change 1083 to "Each is [P] but for the clause that cites S11 or S15".

**4. Lines 6493–6501: the `Story.app` annotation is prose over a sample left wrong.**

> `const bookmark = (cp: Story.Frame<typeof ChatRoom>) => cp.records("session", { operation: O.activity })…`
> `…so on a Story.app cut the helper annotates that setup's frame, not ChatRoom's [P, merge].`

The next lines call `bookmark(afterReload)`, an app cut, with that helper, and read `Desk.socket`. `O.activity` is the desk's, not `ChatRoom`'s (2.11.2 has `O.messages`). So the block names two subjects and three undefined cuts, then a sentence says it should be different.

Fix: one subject, the desk's, as in the trial:

```ts
const bookmark = (cp: Story.Frame<typeof DeskSetup>) => cp.records("session", { operation: O.activity }).at(-1)?.bookmark   // user-defined: DeskSetup, O.activity (the desk's feed)
```

Delete the added sentence, and say above the block that it reads the desk's Story, `merged/streams/trials/desk/features/Tickets/feed/feed.story.ts`.

**5. Lines 5749, 5869, 5838, 5857, 6268 and 7705: evidence reads as proof of Flow.**

2.11 cites "(spike)", "compile", "(model)" and "Modelled." with no statement of what those are. v3 said it in its section 11, which stays out of the design: real Effect with a **stand-in** `stream` and `Feed`, and a model written by the tables' author. Item 23 does state it, but 900 lines later. Examples: "a compile error (spike)" (5749), "compile error at the map (spike, ST DT)" (5869), "a reduced Ably compile" (6268).

7705 adds a false claim: "**Trial 2 re-ran on this text: 5 of 8 right first time**". It ran on v3 sections 1, 2, 3 and 6 (v3 says so), before 3.4's page-order contract was written and before this merge's text existed.

Fix: in 2.11's opening (5616): "**Evidence.** "Spike" is `tsc` against real Effect and a stand-in Flow; "model" is a small executable model of these tables, by their author ([model/v3/](merged/streams/model/v3/)). Neither ran Flow, which does not exist yet (section 7 item 23)." At 7705: "**Trial 2 ran on the record's sections 1, 2, 3 and 6: 5 of 8 right first time**".

**6. Lines 7529–7531, 41: the Diagnostics plan change is owed but has no row.**

The merge plan's 2.7 says "`Package.plan` O1, `Diagnostics.plan` | `Feed`'s export; finding names | C102", but C102 reads only "`Feed` is exported beside `stream`", and decision 8's row (41) lists no Diagnostics. C83 does this for Stories. Whoever applies the C rows will miss the `FeedUnhandled`, `SharedFills`, `Overflow`-class names. Fix: add "| C103 | Diagnostics | The finding names of 2.11.13 and `Feed`'s reasons | Adds |", add Diagnostics to line 41, and point the plan's row at it.

## Low

**1. Line 6268: garbled by a label replace.** "in the record's spike (its the record's section 11)". Fix: "in the record's spike (its section 11)".

**2. Line 943: wrong citation, carried from v3.** "A freeze keeps the partition… (rule 70)". Rule 70 says nothing of it. Fix: "(rule 71, Streams T9)".

**3. Line 1208: 2.5 step 6 drops two of Streams T3's conditions.** "For each session placed and connected, write the bookmark's `filled`…". T3 (5971) says a session waiting for its predecessor writes nothing and "A releasing turn may raise `filled`, never lower it". The citation saves it, but a reader of 2.5 would implement a lower. Fix: append "; a session waiting for its predecessor writes nothing, and a releasing turn may only raise it".

**4. Lines 7301, 7306: 3.6's streams rows.**
- 7301: "Read-only: … `progress(p)` in a commit's context": an author calls it, and it is not new (rule 39). Move it to "Existing".
- 7301: "Existing with a new meaning: `delivers`' values": `delivers` was not in this design before the merge. It is new here, and uncounted in 2.11.14's 29. Say "New, not counted (S11)".
- 7306: "**Removed** (streams)" lists words this design never had, including a bare `initial`, while `Flow.initial` and `Fake.server`'s `initial` are live. Fix: head it "**Not adopted** (earlier streams proposals)", and write "`initial` on `missed`".

**5. Line 5618: the definition of "v3 item *n*" is wrong.** It says a row of "the record's section 9 table of what Stories took". That table has 10 rows. 2.10 cites items 11 and 13 (4721, 4725, 4068), and others point at the wrong row: item 9 for `{ timer: "page" }` (row 4), item 7 for `next` and reload (row 6), item 6 for `session` records (row 5). The numbers come from an earlier v3 table. Fix: "(numbered from an earlier draft of that table; its rows are in a different order)", or renumber 3921, 4475, 4542, 4543, 4552, 4562, 4721, 4725.

**6. Line 8427: S12 is not annotated, though 8414 says each overturned row is.** S12 keeps `Feed.live({ proof | lost, restartAt })`, and `lost` is gone. It is noted only in 8433's paragraph. Fix: append "*`lost` is overturned; S15, proposal-v3.*".

**7. merge-plan.md's own counts.**
- 23: "22 MD rows, 25 plan rows": v3 section 9 has 25 and 17.
- 122: "Applied in one commit", and 249 "Three commits": ME85–ME88 came in a fourth.
- 122: "ME1–ME82 are text replacements" omits ME85–ME88.
- ME23 names only rule 71's addition, though 68, 69 and 70 gain text too.
- 132, 175: two links are design-relative, quoted "After" text, as Low 6 of the Stories check found. Backticks would fix them.

**8. Lines 2836, 8219: older S labels now read as streams' rows.** "`// maps value: the machine subscribes (S11)`" and "S15 with `Story.ending`" predate S1–S16 and mean other things. Fix at 2836: name its source (for example, "merge 5's S11"); 8219 is history, so leave it and note it in 8414.

**9. Line 888, 1249: `bookmark` is missing from member lists.** Rule 50's acting members and 2.6's handle list omit it, though 2.7.16 (2628) and 2.7.3 (1512) have it. Without it, rule 50 does not say a host cannot call a fragment's `O.x.bookmark`. Fix: add `bookmark` to both.

**10. Line 5804 with 5910–5934: `Interrupted` has no source, carried from v3.** `Feed` covers `Interrupted`, and rule 37 requires it, but no Streams T1 row produces it: a release discards, and no cell ends a session `Interrupted`. Fix: either state that it comes only from `stream fails e` with an interrupted Stream outside release, or remove it from `Feed` and say so in rule 37.

**Also, not defects in the design:** `merged/story-checks/stories-amended.md:18` still says v3 "is **not merged**", in its marks table, under a status that says otherwise. README line 16 still reads "streams, which is held for the owner", in a row of history.

## Not checked

- **Nothing was run**: no model, spike, `tsc` or Flow code. "Type-checks by reading" means reading the design's rules against the samples.
- **Whether the tables are right.** Fidelity to v3 was checked, not T1–T9's logic or whether the model covers them. v3's RV1–RV3 did that.
- **Effect claims** (`Retry.Options`, `Stream.callback`, `Queue`, 4.0.5's socket finalizer) were not read against `node_modules/effect`.
- **2.11.12.8's vendor recipes**: compared to v3 line by line, not checked against any SDK.
- **`.plan` files**: read only Testing O3, Package O1 and Runtime O4. Whether C86–C102 can be applied to each plan was not checked.
- **One open doubt, not a finding:** 2.10.9's "a flood past the buffer: `1,024 + 1` frames". Streams T4 says a pushed source holds up to 2,048 in `Repairing`, and Flow pulls in `Live`. So 1,025 frames overflow only if they arrive with no pull between them, which 2.10.4's frame delivery was not traced far enough to settle.
- **Req row labels** (`req FC66`, `req A11`, ...) exist as a form; each was not looked up in `requirements-v3.md`.
- **The other commits' link edits** outside `README.md`, `NEXT.md`, `revisit.md`, `open-items.md` and `merged/streams/` (dispatch-desk, older records) were checked only by the diff stat. `explorations/` is untracked and keeps old links (MX17).
- **Line counts of `open-items.md` items 15–19 and 33** against plan M5: not read.
