# Merge plan: streams into machine-design.md

Status: **applied 2026-11-01** (S15, S16; the `.plan` changes in 2.7 are still owed). Written against `machine-design.md` at HEAD `afcc2641`, and [proposal-v3.md](proposal-v3.md) and [decisions-v2.md](decisions-v2.md) as they stand there. Method as in [the amended Stories plan](../story-checks/merge-plan.md).

Short names: **MD** [machine-design.md](../../machine-design.md); **v3** [proposal-v3.md](proposal-v3.md); **S1–S16** [decisions-v2.md](decisions-v2.md); **SA** [stories-amended.md](../story-checks/stories-amended.md); **FI** [final-integration.md](../story-checks/reviews/final-integration.md); **AT2** [trials/agent-trial-2.md](trials/agent-trial-2.md). "Before" quotes are copied from MD by the script that applies them, each checked to occur exactly once; "…" only shortens a quote here.

Marks: **small** (wording, numbering, a superseded clause), **small†** (a behaviour consequence no decision settles, carried marked [P, merge]), **owner** (behaviour no decision covers). This plan has **no owner row**: S15 confirmed the behaviour, S14 delegated the words, S16 delegated the rest.

---

# Part 1: compatibility

## 1.1 What was checked

| Source | Rows | Where it lands |
| --- | --- | --- |
| v3 section 2 | three ideas | 2.11.1 (ME83) |
| v3 section 3, the "This design" half of 3.1, and 3.2–3.8 | 8 subsections | 2.11.2–2.11.9 (ME83). v2's half of 3.1 stays in the record |
| v3 section 4 | Q1–Q10 | Behaviour only, 2.11.10: ST Q2's first registration, ST Q3's convergence and order, ST Q5's `idleTime`, default and recipe, ST Q6, ST Q7. Options and evidence stay in the record |
| v3 section 5 | rules 67–72, T1–T9 | ME23; 2.11.11 |
| v3 section 6 | 8 examples | 2.11.12 |
| v3 section 8 | tooling, Stories | 2.11.13; ME40, ME41, C100, C101 |
| v3 section 9 | 22 MD rows, 25 plan rows, 10 Stories rows | 1.2 |
| v3 section 10 | words, cuts | 2.11.14; ME66, ME67 |
| v3 section 1 | silent-loss table, Unproven; "Decisions overturned" | ME76 (item 23); ME80, ME81, and the annotations of ME84. The rest is for the owner: not merged |
| v3 sections 7, 11 | traceability, what ran | Stay in the record; item 23 and the section's marks cite them |
| S1–S16 | 16 rows | ME84, verbatim, annotated where overturned |
| SA section 11; FI M3 | 14 items, control table; M3's table | 1.3 |
| MD swept with grep for `merge 6`, `M6 `, `Feed.reconnect`, `lost`, `DuplicateStreamSession`, `resume position`, `facts`, `Stream details`, `merge-6-streams`, `stream`, `session`, `listen`, `gap` | — | Every hit that changes is in 2.3. `lost` and `facts` otherwise mean a lost request and a workflow fact; `listen` had no text in MD but 2.7.3's row |

## 1.2 v3 section 9, row by row

v3's line numbers predate the Stories merge, so each row was found again by its text.

| v3 row | Found at (quote) | State | Edit |
| --- | --- | --- | --- |
| New rules after 66 | "**The owner decides.**" | clean; rule numbers free | ME23 |
| Rule 8 | "**Deliveries are never lost.**" | clean | ME5 |
| Rule 13 | "**Endings map to events, on the declarer.**" | clean; adds MX9 | ME6, ME7 |
| Rule 14 | "**Owner, current, late, decided at admission.**" | clean | ME8 |
| Rule 20 | "**Required handling**" | clean | ME9 |
| Rule 25 | "**No Flow timeout and no Flow retry.**" | clean | ME10; ME31, ME72 (MX5) |
| Rule 37 | "**Reads carry confirmed data**" | clean | ME12 |
| Rule 41 | "(rule 52; *Stream details: merge 6*)" | clean | ME16 |
| Rule 47 | "**Mapped events come only from endings**" | clean | ME18 |
| Rule 52, thaw | "so a stream resumes from the fragment's own position" | clean | ME19 |
| Rule 57 | "**Summaries carry operations and requirements**" | clean | ME20 |
| N3 | "are discarded with evidence (merge 6)" | clean | ME11 |
| 2.5 | step 1, step 6 | clean; v3 says "the turn's end", which is step 6 | ME24–ME26 |
| 2.7.3 stream row | "`value`, `gap`, `complete`, `failure` (M6 rule 50)" | clean; `listen` kept | ME27 |
| 2.7.3 "two sessions on one key" | "end `DuplicateSession` (M6 rule 47)" | clean | ME30 |
| 2.7.8; 2.7.9 "M6 rule 44" | "cannot publish later (M6 rule 44)" | 2.7.8 only: 2.7.9 no longer has it | ME32 |
| 2.7.10 | "`DuplicateSession` (merge 6 rule 47)" | clean; sample stale (MX8) | ME33–ME35 |
| 2.7.13 | the lifetime table | clean | ME36, ME37 |
| 2.7.15 | "M6 rule 51 restores the data" | clean | ME38 |
| 2.7.16 | "`flow check`:", "`flow explain`:" | clean; ME39 (MX4) | ME39–ME42 |
| 2.8 | end of 2.8 | no `listen` text exists, so a new 2.8.14 | ME43 |
| C57 | "*Stream details: merge 6*" in C57 | clean | ME69 |
| 3.6, section 5 | the table; "### For tooling" | additive | ME66–ME68, ME71 |
| Section 7 item 9 | "**Writes that stream**" | clean | ME74 |
| Section 6 | "**An Rpc-based contract**" | additive; open-items 16–19 exist | ME73 |

**Not in v3's table, found by the sweep:** rule 39's and 2.7.3's position in `input` (ME14, ME28, ME29: v3's section 1 list overturns them); rule 39's function list (ME13); rule 40's bare operation (ME15, MX10); rule 42 (ME17); 2.7.6 and section 6 on rule 25 (ME31, ME72); 2.7.16's handles (ME42); the marks and bare T*n* in 2.10 (ME44–ME65); C79 (ME70); item 22's path (ME75); merge 1's note (ME81); W37 (ME82).

**v3's Plans block** is section 5's C86–C102, one row each or grouped as v3 groups them, with Testing O2, O3 and O6 noted as taken by C70, C71, C73. **Its Stories block** is already in 2.10, as FI L1 says; nothing is outstanding.

## 1.3 SA section 11 and FI M3

| Item | State |
| --- | --- |
| 1. Rule numbers; 2. old 2.11 and 4.1 Story | Done in v3. 2.10.9 and 2.11.13 agree |
| 3. `lane` for a stream in a fragment | 2.10.9 has `cp.lane(address)`; 2.11 adds nothing |
| 4. Sleep tags | Streams T1's `backoff`, `page`, `healthy`, `idle` match 2.10.3. Release's 5 s has no tag: MX19 |
| 5. `session` records | Checked against Streams T1–T4: `cell`, T2's row, `proof`, `bookmark` with `filled`, `missed`, `drop`, `Overflow`, `Discarded`, `st`, `ended` all have a writer. ME47 relabels |
| 6. Awaiting finalizer | 2.10.9, 2.10.15; ME60 removes the mark |
| 7. Clean-end wording | ME51 |
| 8. A streaming write's commit fiber | Rule 61's finish phase stands; nothing to change |
| 9. Global `fetch` | 2.11.12's samples read `FetchHttpClient.Fetch` or `Sse`. The desk's `next/http-api.ts` is owed (2.7) |
| 10, 11, 12, 13, 14 | Done in v3 and 2.10 |
| Control table, "take it out" | **MX15** |
| FI M3's table | Is v3 section 9's; 1.2 |
| FI H1, M1–M5, L1–L11 | Applied in v3 before this plan. Spot-checked: the ticker's `subscribed`, `lastRead`, `current(r)`, no `clearedAt`, `Silent` not a flap |

## 1.4 Conflicts

Each is **proposed**. The labels are stated in 2.11's opening.

| # | Conflict | Mark | Resolution |
| --- | --- | --- | --- |
| MX1 | **Label clashes.** v3's T1–T9 against section 5's tooling T rows and Stories T*n*; its RV*n* against SA RV*n*; its trial-2 C1–C5 against section 5's C rows; its requirement rows (G11, F9, M1, C4, W6, R20, ...) against section 4's and the decisions' labels; its Q*n* against the S rows' and SA's Q*n*; DT and AT | small | **Streams T*n***; **ST RV*n***; **STC*n*** for trial 2's findings; **req X** for a requirement row; **ST Q*n***; **ST DT**, **ST AT**. S*n* is unique, and `S.X` in code is another thing. "v3 item *n*" in 2.10 stays and is defined. New C rows are C86–C102 |
| MX2 | **v3's anchors are stale**, by about 1,180 lines after 2.10 and partly before it | small | 1.2 re-finds each by quote; the script refuses a quote that does not occur exactly once |
| MX3 | **v3's own "3.6" would read as MD's 3.6**, and "section 8" and "section 1" likewise | small | Mapped: v3 3.*n* to 2.11.(*n*+1), section 8 to 2.11.13, section 1's table to section 7 item 23, section 9 to C86–C102, section 11 to "the record's section 11" |
| MX4 | **Position in `input`.** Rule 39, 2.7.3 twice, 2.7.16 and OD12 say a resume position is an input field outside the key; v3 overturns it | small | S15 decides. Rules reworded; OD12 annotated, not rewritten (ME80). `KeyOmitsInput` still exempts streams, for S11's reason: a session reads `input` once (ME39) |
| MX5 | **Rule 25 elsewhere.** 2.7.6, section 6 and merge 1's note state it flatly | small | ME31, ME72, ME81. Rule 25's title keeps its words for sessions and calls |
| MX6 | **v3's Story omits its adapter.** Rule 11 and 2.10.1 make a fixture list meet `R`; v3 moved the socket into the service `ChatSocket`, so `fixtures: [ChatFake, HistoryFake]` is a type error | small† | Add `ChatSocket.layer`, an ordinary Layer fixture (2.10.4). `ChatFake` binds the constructor it reads. In 2.11.13 and 2.10.18.7. Whether fixtures resolve one another's requirements is 2.10.4's existing shape, not re-examined |
| MX7 | **2.10.18.7 against 2.11.** It passes `input: { room }`, where the machine's is `roomId`; its fixture is named `ChatSocket`, which is now the service; and a contract with `catchUp` would freeze the bookmark and need a history fake, so `from: 2` would not hold | small† | `roomId`; fixture `ChatFake`; its prose says this room has `position: "seq"` and no `catchUp`, and owes one `missed Unproven`. Fake and test otherwise unchanged. 2.11.13's Story is the room with history |
| MX8 | **2.7.10's sample predates rows.** `failure: E.QuoteLost.from(...)` has no record, and `?.data` is not a stream row | small† | From v3's ticker: the `failure` record and `?.value` |
| MX9 | **Reason tags.** Rule 13 makes an author tag equal to a Flow reason a type error; v3 adds `Closed`, `Overflow`, `Silent`, `Flapping`, and says "a reason may be named, and it beats `Feed`", which is ambiguous if the author also fails with one | small† | Extend rule 13 to a stream's `Feed` reasons. **Not settled by v3** |
| MX10 | **Rule 40's bare operation** "maps nothing", against S7 Q22 and v3 3.5: a bare `every` is a type error | small† | ME15; rule 37's clause. A bare `latest` stays legal (Presence) |
| MX11 | **"Flow-private" against `Flow.private`.** Rule 71's word, and a modifier of a memory field (2.2.2) | small† | Rule 71 says it is not that |
| MX12 | **Where `Feed` is exported.** v3 and its plan rows do not say | small† | C102: beside `stream`. **Not settled by v3** |
| MX13 | **The LLM Story.** 2.10.18 says it ports at this merge; v3 6.5 gives contract and machine only | small† | 2.10.18 says so; owed in 2.7 |
| MX14 | **v3 section 1 is for the owner**, but its table and Unproven list are limits | small† | Item 23, as item 22 did: table verbatim but labels; first person removed; S15's fallback and S16's page-order note added |
| MX15 | **"Take SA section 11's table out"** (Stories plan 2.8, v3 9 step 4) against "merged records are kept" | mechanics | The table never reached MD; 2.10.9 cites it as the conversion from earlier controls. SA keeps it, under a status line (M6). The marks do go |
| MX16 | **v3's keyword marks in code** (`// existing`, `// NEW`, `// RENAMED`, `// Effect`) | small | Dropped as MX5 of the Stories plan did; a comment's remaining explanation, `// user-defined` and citations stay |
| MX17 | **Uncommitted work.** `decisions-v2.md`'s S16 row is uncommitted; `.claude/launch.json` and `explorations/` are untracked | mechanics | S16 goes in the mechanics commit, with the record. The other two are never staged, and `explorations/absorb-wiring*.md` keeps its old links (S16) |
| MX18 | **`Chat` names a contract and a fake** in v3's samples | small | Kept, as FI section 3 accepted: separate files |
| MX19 | **Release's 5 s bound has no timer tag**, where Streams T1 tags the others | small† | Left untagged: its cells are suite-only (2.10.15), so no address needs it. **Not settled by v3** |
| MX20 | **v3's "Decisions overturned" is short.** S5's Q3 (the recipe) and Q13 (the option) also go, with `Feed.reconnect` and `bufferSize` | small† | Annotated on S5 as a merge finding. S2, S11's rows and S6 Q18 stand |
| MX21 | **K2, O5, O8 and M6-D3 are not MD rows**: they are the brief's and the requirements' | small | One paragraph under the S rows records them. MD's rows (OD12, rule 25) carry their own annotation |

## 1.5 Owner conflicts

**None.** S15 amends rule 25 and overturns OD12's clause in the owner's own words; S16 settles trial 2's C1.

---

# Part 2: the change list

## 2.1 Order

Applied in one commit, top to bottom. ME1–ME82 are text replacements; ME83 and ME84 are additions.

## 2.2 Rule numbering

Rules 1–66 keep their numbers. Rules 67–72 are v3's. New section 2.11, after 2.10.18.7. C86–C102, after C85. Item 23 after item 22.

## 2.3 The edits

| # | Target | Mark | Before | After | Source |
| --- | --- | --- | --- | --- | --- |
| ME1 | Status paragraph | small | "Streams (merge 6) is not merged yet; where Stories reads streams, the text is marked *Stream details: merge 6*. The work order" | Streams (merge 6, `[merged/streams/proposal-v3.md](merged/streams/proposal-v3.md)`, [merged/strea … nd tells a clear from a wipe with `fills` (2.11, rules 67–72; decisions S1–S16). The work order | S15, S16 |
| ME2 | Decision order sentence | small | "**Seven decisions.**" | **Eight decisions.** | S15 |
| ME3 | Decision order sentence | small | "and 5; decision 7 builds on decisions 5 and 6." | and 5; decision 7 builds on decisions 5 and 6; decision 8 builds on decisions 2, 5, 6 and 7. | v3 9 |
| ME4 | Decisions table, new row 8 | small | "decisions Stories T1–T7, amended by SC1–SC5 and W1–W43 \| Testing … , Package O1, Diagnostics, EntityDomains O2/O4, Persistence O7 \|" | decisions Stories T1–T7, amended by SC1–SC5 and W1–W43 \| Testing O1–O9, V1–V9, Inspection O1/O … rverRendering O2/O3/O5/V3/V5, EntityDomains O1/O4, Inspection O4, CommandLine O5, Package O1 \| | v3 9 |
| ME5 | Rule 8 | small | "- exit fillings; - `whenAbandoned` fillings; - timer-fired handlers." | - exit fillings; - `whenAbandoned` fillings; - timer-fired handlers; - stream deliveries of a live session; a released session's undelivered items are discarded with evidence (rule 70). | v3 9, rule 8; v3 T9's rule list |
| ME6 | Rule 13 | small | "for a read `success:` (one-off) or `value:` (live) and `failure:` (rule 41). A mapping value" | for a read `success:` (one-off) or `value:` (live) and `failure:` (rule 41); for a stream `valu … s:`, `missed:`, `failure:`, with `fills` beside them as data (rule 67, 2.11.6). A mapping value | v3 9, rule 13 |
| ME7 | Rule 13, context and reasons | small† | "`StillUnknown`, `StorageRefused`) is a type error." | `StillUnknown`, `StorageRefused`) is a type error; on a stream, so is one of `Feed`'s reasons ( … 's context also gives `progress(p)`, which sets its row's `progress` with no turn (Streams T8). | v3 9, rule 13; MX9 |
| ME8 | Rule 14 | small | "**Owner, current, late, decided at admission.** A commit, lookup or retry of an operation is owned by the activation" | **Owner, current, late, decided at admission.** Stream deliveries are always current from the a … late (rule 70). Otherwise, a commit, lookup or retry of an operation is owned by the activation | v3 9, rule 14 |
| ME9 | Rule 20 | small | "explicit ignore; a missing handler is a `flow check` error naming … . Requirements are read per operation; a bare operation has none." | explicit ignore; a missing handler is a `flow check` error naming the event and the leaf. **Str … ey is `FeedUnhandled` (2.11.6). Requirements are read per operation; a bare operation has none. | v3 9, rule 20 |
| ME10 | Rule 25 | small | "25. **No Flow timeout and no Flow retry.** Waiting and trying again are states and schedules of the machine (2.7.6)." | 25. **No Flow timeout and no Flow retry, of a session or a call** (amended, S15). Waiting and t … ime` (2.11.10, Streams T1). A streaming write keeps its own timeout, in its commit (2.11.12.5). | v3 Q5; S15 |
| ME11 | N3 | small | "a released stream session's deliveries are discarded with evidence (merge 6)." | a released stream session's deliveries are discarded with evidence (rule 70). | v3 9, N3 |
| ME12 | Rule 37 | small | "ends on `failure` as `Defect` or `Interrupted`, a lookup cut by a … included (rule 52); a tag record must map them (rule 20; 2.8.10)." | ends on `failure` as `Defect` or `Interrupted`, a lookup cut by a freeze included (rule 52); a … 2.11.6); an `every` feed maps `value`, `missed`, `fills` and `failure`, or is a `listen` entry. | v3 9, rule 37 |
| ME13 | Rule 39, function | small | "and its function inline (`commit`, `lookup`, `subscribe`), which calls" | and its function inline (`commit`, `lookup`, `subscribe`, and a stream's `catchUp`), which calls | v3 2.11.3 |
| ME14 | Rule 39, position | small | "(`KeyOmitsInput` warns otherwise); a stream's resume position is an input field outside the key. No Rpc inside;" | (`KeyOmitsInput` warns otherwise); a stream's position is not in `input`: the contract names a … ession reads `input` once, at start, so a non-key field never restarts it (S11). No Rpc inside; | v3 1, Decisions overturned; S11, S15 |
| ME15 | Rule 40 | small† | "A **bare** operation maps nothing" | A **bare** operation (never an `every` stream's, which must map, rule 37) maps nothing | v3 2.11.6; S7 Q22; MX10 |
| ME16 | Rule 41 | small | "(rule 52; *Stream details: merge 6*). The verb decides" | (rule 52). A stream's placement is one session per (actor incarnation, placement path, operation, key) (rule 68). The verb decides | v3 9, rule 41 |
| ME17 | Rule 42 | small | "`undefined` while not placed, and no replacement rule beyond Operations O4." | `undefined` while not placed, and no replacement rule beyond Operations O4 and, for a stream, rule 70. | v3 rule 70 |
| ME18 | Rule 47 | small | "47. **Mapped events come only from endings** (OD23 Q33). An event an operation maps" | 47. **Mapped events come only from endings** (OD23 Q33), and a stream's deliveries count as endings. An event an operation maps | v3 9, rule 47 |
| ME19 | Rule 52, thaw | small | "as entering a state does, so a stream resumes from the fragment's own position (*Stream details: merge 6*). `Flow.entry`" | as entering a state does: the session is placed again from the frozen slice's bookmark. A freez … the partition, and a `latest` row's `last` and `heard`, with the slice (rule 70). `Flow.entry` | v3 9, rule 52 |
| ME20 | Rule 57 | small | "explicit exception to rule 10's "hides the level below" for these facts only). The fragment's" | explicit exception to rule 10's "hides the level below" for these facts only), and each stream operation's `delivers`, key fields, `missed`'s kind and `fills`. The fragment's | v3 9, rule 57 |
| ME21 | Stories rules' heading | small | "each names its decisions (2.10 has the marks). Streams (merge 6) renumbers from rule 67 when it merges." | each names its decisions (2.10 has the marks). | v3 9 |
| ME22 | Rule 65 | small | "`timer` names Flow's own session sleeps (*Stream details: merge 6*)." | `timer` names Flow's own session sleeps (Streams T1). | SA 11 |
| ME23 | Rules 67–72, after rule 66 | small† | "right by the test. Never by later steps or by the fake author's Effect code." | "**Streams** (2.11)…" heading, then rules 67–72 of v3 section 5 as numbered rules, with the owner's S11, S15 marks and [P]; the statement of rule 71 gains "not `Flow.private`" (MX11) | v3 5, rules 67–72; S11, S15; MX11 |
| ME24 | 2.5 step 1, mailbox | small | "user sends, call endings, timer firings and `onContext` events queue together." | user sends, call endings, stream deliveries, timer firings and `onContext` events queue together; a session moves one delivery at a time from its own queue (Streams T4, rule 69). | v3 9, 2.5 |
| ME25 | 2.5 step 1, delivery cell | small | "- A timer of a dead activation is discarded here (Machines O5)." | - **A stream delivery's bookmark cell** applies here, in the partition, and is kept through `De … p 2, so it touches no bookmark. - A timer of a dead activation is discarded here (Machines O5). | v3 9, 2.5; v3 8 |
| ME26 | 2.5 step 6, turn's end | small | "- Publish once: memory, lane rows and the store revision (step 5's starts and predictions) are one cut. Declines" | - For each session placed and connected, write the bookmark's `filled` from the field `fills` n … emory, lane rows and the store revision (step 5's starts and predictions) are one cut. Declines | v3 9, 2.5 |
| ME27 | 2.7.3, kinds table, stream row | small | "\| `value`, `gap`, `complete`, `failure` (M6 rule 50) \| none \| … placement, per key under `each`; `undefined` while not placed \|" | \| `value`, `pages`, `missed`, `fills`, `failure` (rule 67, 2.11.6); a `listen` entry the domai … ` (2.11.8) \| 2.11.9's row per placement, per key under `each`; `undefined` while not placed \| | v3 9, 2.7.3 |
| ME28 | 2.7.3, consequences | small | "**merge 6** streams gain `input` with the resume position outside … ages` is `input: { roomId, after }, key: ["roomId"]`; **merge 4**" | **streams** take `input` with no position, so 2.11.2's `messages` is `input: { roomId }, key: ["roomId"]`, and `position` names a field of `output` (S15); **merge 4** | v3 1; S15 |
| ME29 | 2.7.3, key | small | "O4) and the same rule on every kind is one rule; a resume positio … is an ordinary input field outside the key (OD12). Consequences:" | O4) and the same rule on every kind is one rule. A stream's position is not an input field (rule 71, overturning OD12's clause). Consequences: | v3 1; S15 |
| ME30 | 2.7.3, exempt streams | small | "Reads and streams are exempt: two reads never charge twice, and two sessions on one key end `DuplicateSession` (M6 rule 47)." | Reads and streams are exempt: two reads never charge twice, and two operations on one stream contract are two sessions; `flow check` warns `DuplicateSession` (rule 70). | v3 9, 2.7.3; S11 |
| ME31 | 2.7.6 | small | "Flow has no timeout and no retry (rule 25). Each is a state and a schedule." | Flow has no timeout and no retry (rule 25). Each is a state and a schedule. A stream's connection is the one thing Flow re-runs, by its contract's declaration (2.11.10). | rule 25; MX5 |
| ME32 | 2.7.8 | small | "released session cannot publish later (M6 rule 44). Nothing new is needed." | released session cannot publish later (rule 70). Nothing new is needed. | v3 9, 2.7.8 |
| ME33 | 2.7.10, sample mapping | small† | "quotes: Market.quote.outcomes({ failure: E.QuoteLost.from((_e, { key }) => ({ symbol: key.symbol })) })," | quotes: Market.quote.outcomes({ failure: { MarketDropped: E.QuoteEnded.from((_e, { key }) => key), Feed: E.QuoteEnded.from((_e, { key }) => key) } }), // 2.11.12.3 | v3 6.3; MX8 |
| ME34 | 2.7.10, sample read | small† | "useView(watch, (s) => List.O.quotes.get(s, { symbol })?.data)" | useView(watch, (s) => List.O.quotes.get(s, { symbol })?.value) | v3 3.8; MX8 |
| ME35 | 2.7.10, paragraph | small | "ordinary activity's (Machines O6; merge 6 for streams), and a del … o placements of one key are `DuplicateSession` (merge 6 rule 47)." | ordinary activity's (Machines O6; rules 67–70 for streams), and a delivery for a key that has l … nputs with one key are one session (rule 41); two operations on one contract are two (rule 70). | v3 9, 2.7.10 |
| ME36 | 2.7.13, lifetime row | small | "\| a placement's session \| the state activation, or the trait in … 6*) \| a released session's delivery is discarded (M6 rule 44) \|" | \| a placement's session \| its activation, or the trait incarnation (rule 52) \| a released session's undelivered items are discarded with evidence (rule 70) \| | v3 9, 2.7.13 |
| ME37 | 2.7.13, progress | small | "- A lane's **status** changes **only in its binding incarnation's turns**" | - A row's **`progress`** follows Streams T8: `progress(p)` by the addressable Attempt publishes … a restore clears it. - A lane's **status** changes **only in its binding incarnation's turns** | v3 9, 2.7.13; v3 T8 |
| ME38 | 2.7.15, live placement | small | "- **A live placement** re-opens from its input, and M6 rule 51 restores the data (OPS O4, Persistence O4)." | - **A live placement** re-opens from its restored `input`: a `latest` feed restores `last` and … every` feed restores its bookmark with the slice (rule 71, Streams T9; OPS O4, Persistence O4). | v3 9, 2.7.15 |
| ME39 | 2.7.16, flow check, exempt | small | "streams are exempt, since a resume position is non-key by design (OD12); a paged resource" | streams are exempt, since a session reads `input` once, at start (S11); a paged resource | S11; MX4 |
| ME40 | 2.7.16, flow check, stream findings | small | "`SharedCopyLane` is deleted. Because the verb at each use" | `SharedCopyLane` is deleted. Streams add `FeedUnhandled`, `ListenNeedsEvery`, `DuplicateSession … ls`, `FillsNotPerKey` and, not built, `UnboundedBridge` (2.11.13). Because the verb at each use | v3 9, 2.7.16 |
| ME41 | 2.7.16, flow explain | small | "`READY subscribes issues (Issues.list)`;" | `READY subscribes issues (Issues.list)`; `LIVE subscribes messages (Chat.messages, every, one session per room, fills messages, idle 45s, reconnects by predicate, catches up)`; | v3 8 |
| ME42 | 2.7.16, handles | small | "a stream's has `subscribe` and `subscribe.each`; a resource's" | a stream's has `subscribe`, `subscribe.each`, `refetch` and `bookmark`; a resource's | v3 2.11.8 |
| ME43 | 2.8, new 2.8.14 | small | "### 2.9 Operations in fragments" | New "2.8.14 `listen` and connections": rule 72, Streams T7, costs from v3 6.7 | v3 9, 2.8; v3 T7, 6.7 |
| ME44 | 2.10 intro, citations | small | "v3 is [merge-6-streams/proposal-v3.md](merge-6-streams/proposal-v … ed; inside *Stream details: merge 6* text, T1–T3 are v3's tables." | v3 is `[merged/streams/proposal-v3.md](merged/streams/proposal-v3.md)`, whose design is 2.11; Streams T*n* are 2.11.11's tables. | SA 11; MX1 |
| ME45 | 2.10 intro, Removed | small | "merge 6's `.do(…)` (W37) and `story.suspend` (its 2.11; W9)" | earlier streams proposals' `.do(…)` (W37) and `story.suspend` (W9) | SA 11; MX1 |
| ME46 | 2.10.3, next | small | "and a Story uses `next` [v3 item 7]; *Stream details: merge 6*), `{ actor: Checkout1 }`." | and a Story uses `next` [v3 item 7]; Streams T1), `{ actor: Checkout1 }`. | SA 11 |
| ME47 | 2.10.6, session record | small | "\| `session` \| stream-session evidence (v3's Inspection; *Stream … cell` per T1 and T3 write (`<State>.<input>`), T2's row and basis" | \| `session` \| stream-session evidence (2.11.13's Inspection) \| `actor`, `instance`, `copy`, … n`, `key`, a `cell` per Streams T1 and T3 write (`<State>.<input>`), Streams T2's row and basis | SA 11; MX1 |
| ME48 | 2.10.6, flags | small | "v3's flags `ValuesWhileDown`," | 2.11.13's flags `ValuesWhileDown`, | SA 11 |
| ME49 | 2.10.6, flags' mark | small | "`FillsUntouched` are `diagnostic` records (*Stream details: merge 6*) \|" | `FillsUntouched` are `diagnostic` records \| | SA 11 |
| ME50 | 2.10.9, opening | small | "*Stream details: merge 6.* This section reads v3's `Feed`, sessio … nded.md)'s section 11 has the list **[P, SA H22, v3 section 9]**." | This section reads 2.11's `Feed`, sessions and rows. Reconnecting and history run from the cont … /stories-amended.md)'s section 11 has the conversion from the earlier controls **[P, SA H22]**. | SA 11; v3 9 step 4 |
| ME51 | 2.10.9, clean end | small | "not a stream end; `complete` from a raw socket is adapter code reading code 1000 [SA RV1 M11] \|" | not a stream end; Streams T1's `stream completes` from a raw socket is adapter code reading code 1000 [SA RV1 M11] \| | SA 11 item 7 |
| ME52 | 2.10.9, reordered frames | small | "\| reordered frames (merge 6's SR12) \|" | \| reordered frames (the brief's SR12) \| | SA 11 |
| ME53 | 2.10.9, rows | small | "flapping test reads the row as `undefined`, not `Ended` (merge 6' … te). T2's row, each `proof` (on `Feed.live` and now `Feed.done`)," | flapping test reads the row as `undefined`, not `Ended`, because `FeedEnded` left the placing state (Streams T1's row). Streams T2's row, each `proof` (on `Feed.live` and `Feed.done`), | SA 11 |
| ME54 | 2.10.9, finalizer | small | "`ReleaseOverdue` and v3's T1 `Releasing` cells" | `ReleaseOverdue` and Streams T1's `Releasing` cells | MX1 |
| ME55 | 2.10.14, coverage | small | "`session` records' `cell`; *Stream details: merge 6*), ending handlers" | `session` records' `cell`), ending handlers | SA 11 |
| ME56 | 2.10.15, streams | small | "For streams (v3's T1–T8, STR66; *Stream details: merge 6*) [P, v3 item 11]: T1's signals" | For streams (Streams T1–T8, STR66) [P, v3 item 11]: Streams T1's signals | SA 11; MX1 |
| ME57 | 2.10.15, T6, T8 | small | "their delays from `advance({ next })`; T6's queue from floods through a `Feed.callback` client half; T8's progress" | their delays from `advance({ next })`; Streams T6's queue from floods through a `Feed.callback` client half; Streams T8's progress | MX1 |
| ME58 | 2.10.15, coverage counts | small | "Attempt. Coverage counts T1 and T3 cells," | Attempt. Coverage counts Streams T1 and T3 cells, | MX1 |
| ME59 | 2.10.15, suite-only | small | "(2.10.9), T1 and T3's cells for a turn in the wait" | (2.10.9), Streams T1 and T3's cells for a turn in the wait | MX1 |
| ME60 | 2.10.15, policy suite | small | "whose finalizer awaits a gate; *Stream details: merge 6*). The" | whose finalizer awaits a gate). The | SA 11 item 6 |
| ME61 | 2.10.18, intro | small† | "The record's chat (SP 4.3) and LLM (SP 4.6) cases run on v3's `Fe … e not merged; they port with merge 6 (*Stream details: merge 6*)." | The record's chat case (SP 4.3) is 2.10.18.7 and 2.11.13. The LLM case (SP 4.6) has its contrac … d machine in 2.11.12.5, and its steps in 2.10.9; its Story is not written out (the plan's 2.7). | SA 11; MX13 |
| ME62 | 2.10.18.7, heading | small | "##### 2.10.18.7 A chat room over a socket (uncommon; *Stream details: merge 6*)" | ##### 2.10.18.7 A chat room over a socket (uncommon) | SA 11 |
| ME63 | 2.10.18.7, opening | small† | "The fake extends 2.10.4's `Chat` with a resume position and a see … t merged; the Story's shape is what this case shows. With `ping`," | The fake extends 2.10.4's `Chat` with a resume position and a seed control, reached through the … issed Unproven` (Streams T2 row 6). 2.11.13's Story is the same room with history. With `ping`, | v3 2.11.2; MX7 |
| ME64 | 2.10.18.7, Story input | small† | "id: "chat/replay-then-drop", input: { room: "r1" }, fixtures: [Ch … cket], // user-defined: ChatSocket = Fake.webSocket(Chat, routes)" | id: "chat/replay-then-drop", input: { roomId: "r1" }, fixtures: [ChatSocket.layer, ChatFake], // user-defined: ChatFake = Fake.webSocket(Chat, routes). ChatSocket is 2.11.2's adapter | v3 2.11.2, 8; MX6, MX7 |
| ME65 | 2.10.18.7, test comment | small | "// replaces merge 6's expect(…, { connections })" | // read directly, not a `connections` field (2.10.9) | SA 11 |
| ME66 | 3.6, New, streams | small | "\| **New concepts, not words** \|" | \| **New, streams** \| (rules 67–72, 2.11; common) `reconnect` (`while`, `schedule`), `idleTime`, `position`, … kmark**, **cleared** and **wiped**, a **connection** within a **session** \| \| **New concepts, not words** \| | v3 10; 3.6 of v3 9 |
| ME67 | 3.6, Removed, streams | small | "\| **Author-chosen** \|" | \| **Removed** (streams) \| `Feed.reconnect` and its 70 cells; `fresh`, `registered`, `announced`, `initial`, … sion`; `delivers: "facts" \\| "state"`; `persist` on streams (2.11.14 has the list) \| \| **Author-chosen** \| | v3 10; S11 |
| ME68 | 3.6, Removed, Stories | small | "`model` and Testing O5 (W39), merge 6's `.do(…)` (W37)," | `model` and Testing O5 (W39), earlier streams proposals' `.do(…)` (W37), | MX1 |
| ME69 | C57 | small | "a freeze releases them, a thaw places them again (rules 41, 52; *Stream details: merge 6*) \| Amends C40 \|" | a freeze releases them, a thaw places them again (rules 41, 52); a stream placement in a fragment is one session per placement path (rule 68) \| Amends C40 \| | v3 9, C57 |
| ME70 | C79 | small | "`session` (with `cell`; *Stream details: merge 6*), and for Story runs" | `session` (with `cell`), and for Story runs | SA 11 |
| ME71 | Section 5, new subsection, C86–C102 | small† | "### For tooling" | New "### For streams": C86–C102, listed in 1.2's Plans block | v3 9, Plans; MX12 |
| ME72 | Section 6, Flow timeouts | small | "- **Flow timeouts and Flow retries** (rule 25). A timeout is a sc … retry is a new write or `.retry` from a state the machine enters." | - **Flow timeouts and Flow retries** (rule 25). A timeout is a schedule on the owner state; a r … eam's declared `reconnect` and `idleTime` re-run a connection, never a session or a call (S15). | S15; MX5 |
| ME73 | Section 6, streams left out | small | "- **An Rpc-based contract** (OD13): a `fromRpc` adapter, later, when a real app needs it." | - **An Rpc-based contract** (OD13): a `fromRpc` adapter, later, when a real app needs it. - **S … per Runtime (17), a manual `reconnect` member (18), `fromRpc` streams and download resume (19). | v3 9, section 6 |
| ME74 | Section 7, item 9 | small | "9. **Writes that stream** (LLM generation, upload progress): deferred; to be designed from their browser sources." | 9. ~~**Writes that stream**~~ **Closed (streams merge):** designed as progress on the write lane (`progress(p)`, Streams T8; 2.11.12.5, 2.11.12.6). A streaming write stays a transaction. | v3 9, section 7 |
| ME75 | Section 7, item 22's path | small | "(`merge-6-streams/trials/desk/RESULTS.md`)" | (`merged/streams/trials/desk/RESULTS.md`) | M3 |
| ME76 | Section 7, new item 23 | small† | "`inspection` and frame memory is unmeasured (2.10.6)." | Item 23: v3 section 1's silent-loss table and Unproven list, labels changed, plus S15's fallback and S16's note | v3 1's table, Unproven; S15, S16; MX14 |
| ME77 | Change log, Stories merge | small | "resolved. Streams (merge 6) is not merged: its rules renumber fro … , and Stories' stream parts are marked *Stream details: merge 6*." | resolved. Streams (merge 6) was not merged then; its rules were to renumber from 67, and Stories' stream parts were marked for it. | SA 11 |
| ME78 | Change log, new entry | small | "The `.plan` files are still owed (the plan's 2.7). Streams (merge 6) is still not merged." | The `.plan` files are still owed (the plan's 2.7). Streams (merge 6) was still not merged. - St … added; every mark for stream text resolved. The `.plan` files are still owed (the plan's 2.7). | v3 9 |
| ME79 | Decisions intro | small | "and amended Stories' SC1–SC5 and W1–W43, which their rewrites" | amended Stories' SC1–SC5 and W1–W43, and streams' S1–S16, which their rewrites | MX1 |
| ME80 | OD12, annotated | small | "renamed to `output`; mapper context `{ params }` becomes `{ input }`). (2026-10-30)" | renamed to `output`; mapper context `{ params }` becomes `{ input }`). (2026-10-30) *Its stream … ed by S15: a stream's position is Flow's bookmark, not an in-field (rule 71). The rest stands.* | v3 1, Decisions overturned |
| ME81 | Merge 1 note, annotated | small | "`retry: { on }` goes with every Flow retry (rule 25)." | `retry: { on }` goes with every Flow retry (rule 25). *Rule 25 later allows one thing: a stream's declared connection (S15).* | v3 1, Decisions overturned |
| ME82 | W37, annotated | small | "`.do(…)` goes. Details wait for the streams merge. *Owner-confirmed.* (2026-11-01)" | `.do(…)` goes. Details wait for the streams merge. *Owner-confirmed.* (2026-11-01) *Streams merged; the details are 2.10.9.* | SA 11 |
| ME85 | C70 | small | "L2; *Stream details: merge 6* for a session's timers)" | L2; Streams T1 for a session's timers) | SA 11; applied in a follow-up commit, missed by the first pass |
| ME86 | T2 | small | "stream cells (*Stream details: merge 6*) and Flow reasons" | stream cells (Streams T1, T3) and Flow reasons | as ME85 |
| ME87 | 2.10.9, spellings | small | "**Spellings** [P, v3 section 3]:" | **Spellings** [P, 2.11.4, 2.11.5]: | as ME85 |
| ME88 | Status paragraph | small | "It **supersedes `proposal-v3.md`** (removed," | This design **supersedes the earlier design `proposal-v3.md`**, not streams' file of that name (removed, | MX1: "v3" also names the design's own earlier version |
| ME83 | New 2.11, before "## 3. Example" | small† | "## 3. Example" | 2.4's build | v3 2, 3, parts of 4, 5, 6, 8, 10 |
| ME84 | Decisions, new subsection at the end of the file | small | "…a failure's `{ step, cut, target, path, expected, actual }` shape." | "### Streams": S1–S16 verbatim, with annotations; rows not in MD; "Proposed"; "Also rejected" | S1–S16; v3 1, 10 |

## 2.4 ME83's mechanical rules

From v3, in this order: section 2's three ideas; 3.1's source line, "This design" block and adapter; 3.2–3.8; 2.11.10's parts of section 4; section 5's intro and T1–T9; section 6; section 8; section 10's word table and cuts, without its comparison to v2. Then: (a) MX1's labels; (b) MX3's pointers; (c) MX16's code marks; (d) first person becomes "the record's"; (e) MX6's `ChatSocket.layer` and MX8's note on the helper; (f) a new opening: provenance, marks, labels, where the data comes from. Headings become 2.11.*n*, 2.11.12.*n* and "Streams T*n*". Nothing else changes.

Sections, for cross-references: 2.11.1 Three ideas; .2 Chat; .3 Contract; .4 Signals; .5 A read's answer, **with the page-order contract**; .6 Outcomes; .7 `fills`; .8 Clear, wipe, refresh; .9 Row; .10 First registration, repair, reconnect; .11 Tables; .12 Examples; .13 Tooling and testing; .14 Words and cuts.

## 2.5 Unchanged and safe

Rules 1–7, 9–12, 15–19, 21–24, 26–36, 38, 43–46, 48–51, 53–56, 58–64, 66; the write-lane tables; 2.9, whose "reads and streams" rows already say scoped to the incarnation; 2.10's wire tables, whose `Silent` is the wire state, as 2.10.9 says. No Story in 2.10.18.1–6 uses a stream.

**Broad consequences, checked.**
- **One graph, one runtime:** Streams T1 is one Runtime record. `delivers`, `position`, `fills`, `failure`'s keys, and the presence of `reconnect`, `idleTime`, `catchUp` read without running a closure. `while` and `schedule` are closures, so `flow explain` prints "reconnects by predicate".
- **Static analysis:** kept. Gains five findings; rule 20 gains a stream clause.
- **The turn:** "memory changes only through `updateMemory`" holds, because the bookmark is not memory. `check()` runs steps 2–6, so touches none. Precedent for surviving `Denied`: an admitted ending's lane cell (2.7.13).
- **Persistence and SSR:** the partition lands in one capture with memory (Persistence O3). Needs Persistence O5 and ServerRendering O3 amended: owed, C95, C97; reasoned, not run.
- **Fragments:** `fills` names the operation's own memory, so a fragment's list stays in the fragment; 2.11.7 states the parent case as a limit. A freeze keeps the partition with the slice; `resetOn`, `.each` re-adds and subroutines are new slices, so new bookmarks.
- **Stories:** `session` records, timers and the row agree with Streams T1–T4; a Story gains nothing but the words already in 2.10.
- **Entity domains:** `listen` has no bookmark; rule 72.
- **Rule 25's reach:** calls unchanged. A streaming write keeps its own timeout, so one idea has two spellings: stated.

## 2.6 Mechanics

1. **M1.** `git mv merge-6-streams merged/streams`, with its model, reviews, trials and this plan.
2. **M2.** Inside the record, relative links change: `../merged/x` → `../x`; `../machine-design.md` → `../../machine-design.md`; `../revisit.md`, `../open-items.md` likewise; deeper links gain one `../`. Status headers: proposal-v3 "merged 2026-11-01; kept as the record; where it differs from the design, the design wins"; proposal-v2 and proposal.md unchanged but superseded in the README; decisions "included"; this plan "applied". S16's row is committed (MX17).
3. **M3. Inbound links.** Every tracked file under `workflow/plans/flow` naming `merge-6-streams`, to its new path. `explorations/` is untracked and stays (MX17).
4. **M4.** `README.md`: work order row 6, order sentence, merged table, "current proposal" paragraph, the merges paragraph, the model in Spikes. `NEXT.md`: what is done, and item 1 superseded. `revisit.md`: links, plus the trimmed-v2 fallback's trigger and the private clear mark.
5. **M5.** `open-items.md` 16–19: confirmed present; 18 and 33's wording updated to the merged words; item 15's position line noted as absorbed by the bookmark.
6. **M6.** `stories-amended.md` section 11 gains a status line (MX15).
7. **M7.** No `.plan`, `packages/` or generated docs edit. Three commits: this plan; MD; the record. `.claude/launch.json` and `explorations/` stay out.

## 2.7 Still owed (not done here)

| Target | What | Row |
| --- | --- | --- |
| `Operations.plan` O1, O4, O6, V9, Q1 | Contract shape; rewrite from rules 67–72; rows; Q1 | C86–C89 |
| `Machines.plan` O6 | List form, outcome keys | C90 |
| `Runtime.plan` O4, O6 | Delivery, ownership, release bound | C91, C92 |
| `Persistence.plan` O2, O4, O5 | Position's Schema, frozen slice; `latest`; decode | C93–C95 |
| `ServerRendering.plan` O2, O3, O5, V3, V5 | Rows, partition, digest, sessions | C96–C98 |
| `EntityDomains.plan` O1, O4 | `listen` gaps, stream faults | C99 |
| `Inspection.plan` O4, `CommandLine.plan` O5 | Evidence, findings | C100, C101 |
| `Package.plan` O1, `Diagnostics.plan` | `Feed`'s export; finding names | C102, C103 |
| The desk and Checkout | Convert feeds to `position`, `reconnect`, `idleTime`, `fills`; `next/http-api.ts` to a seam | v3 item 7 |
| 2.11.12.5's Story | The LLM case, written out | MX13 |
| Spikes | req A11: ticker, Supabase, full Ably, graphql-ws, Phoenix, Electric, EventSource, counter and the desk's `features/` need re-running on the final words | v3 7 |
| `references/COVERAGE.md`, `delegated-decisions.md` | Any stream wording beyond links | history otherwise |

## 2.8 Single graph, runtime, static analysis, Stories, CLI

As 2.5's list. **CLI:** `flow explain` gains its line; `flow check` its findings; `flow stories --coverage` counts Streams T1 and T3 cells.

## 3. What blocks merging

Nothing. Limits and unproven items are section 7 item 23; plan changes are owed (2.7). A fourth High in real code would trigger S15's fallback.

## 4. What the merge check changed

Applied 2026-11-01 from [reviews/streams-merge-check.md](../../../../../../archive/flow-design-2026-11/machine-fragments/reviews/streams-merge-check.md), with the owner's decisions. This section supersedes MX6 and MX7's wording; the rows above stay as written.

- **Samples.** A fixture that needs a sibling is provided it: `ChatSocket.layer.pipe(Layer.provide(ChatFake))`, Testing O3 unchanged. 2.10.18.7's subject is written out: `ChatLog`, `Message` with `seq`, `ChatLogSocket`, `ChatLogDefinition`, `ChatLogRoom`. The bookmark helper has one subject, the desk's.
- **Rules and text.** Rule 13 adds the tag `Feed`; rule 40 and 2.7.3 except `every` and `listen`; rules 67, 68, 71 mark their clauses; rule 50 and 2.6 add `bookmark`; 2.5 step 6 keeps Streams T3's two conditions; 2.11.6 says where `Interrupted` comes from; 2.11 states what spike and model mean; item 23 corrects trial 2's claim.
- **Records.** C103 (Diagnostics), so the rows now run C86–C103. 3.6's streams rows, S12's annotation, 2.11's "v3 item *n*" definition and three citations are corrected.
- **Item 23** gains the flood doubt as unproven: 2.10.9's row is unchanged.

**This plan's own count errors** (Low 7), left as written above:

- 1.1: "22 MD rows, 25 plan rows". v3 section 9 has 25 and 17.
- 2.1 "Applied in one commit" and 2.6 M7 "Three commits": ME85–ME88 came in a fourth.
- 2.1 "ME1–ME82 are text replacements" omits ME85–ME88.
- ME23 names only rule 71's addition; rules 68, 69 and 70 gain text too.
- ME1 and ME44's quoted links were design-relative: now in backticks.
