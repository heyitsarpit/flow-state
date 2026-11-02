# Round 7: final independent review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 7. Commit `e7ee754c`. Marks: **[ran]**, **[read]**, **[reasoning]**. Ages: r1-2, r3, r4, r5, r6, r7-early, r7-edge. Chrome 146 headless, this Mac, Bun 1.4.2. Experiments ran in copies under the scratchpad, under `watch.ts`, each command under 5 minutes, peak 371 MB Bun and about 890 MB Chrome. **Two process trees overlapped** while mutants and H3 ran; the benchmarks and the quiet-machine reruns did not overlap anything.

## Verdict

**`edge.ts` is what it says: one rule with a few stated policies, and I could not break the rule itself. But the rule's promise did not reach its callers: a ticket says "this value landed", and the edge lands "the newest value".** That gap is a real double send, new in r7-edge: a `serialize` commit queued while the first commit's batch waits replaces `acked: true` with `acked: false` in `dirty`. The batch lands, the request leaves, a kill restores `NotSent { Restored }`, the next press sends a second key. Fake [ran]; real IndexedDB with a slowed store, **12/12 two keys** [ran]; with no slowing 0/24. `Checkout/Refunds` is persisted and `serialize` [read]. A one-line fix passes 563/563 and a directed search [ran].

**H3 is narrower than RESULTS says, and worse.** It is not a lost write: at the next open **Chrome recreates the origin's whole IndexedDB directory** (LevelDB `LOG`: "Creating DB ... since it was missing"), and an older, committed database goes with it. 13 of 248 main-process SIGKILLs; 0 of 299 for the other kill kinds. So "needs a first visit" is false. Who deletes it: not established.

**The lane core, driver and edge are one fix, two small edge changes and one decision away from starting production work**, provided the suite grows first. `Compiled` is ready for machine, fragment and operations compile prototypes, and not ready for entities or the outside world. `flow check` is worth keeping as a table lint, not as a bug finder.

**What I'd read first:** `durable.ts:153-162` with `edge.ts:165` (a plain write and a ticket share one `dirty` key). I predicted H1 from reading those lines before running anything. Second, `edge.ts:146-147` (nothing rechecks hidden after an answer). Third, `driver.ts:115` (the after-drain loop with no fatal check).

## Reproduced

| Item | Claimed | I got |
| --- | --- | --- |
| Suite | 563/563 | 563/563, 247 MB, 9.6 s [ran] |
| `--swap` | 563/563 | 563/563 [ran] |
| 5 s gate | 26 fail, 26 expected, each with a reason | 26, none unexpected [ran]. **2 reasons read `UNCLASSIFIED`, 1 is wrong** (Tests) |
| CLI pins | all pass | all pass [ran] |
| `tsc --strict` on typed | 0 errors | **1:** `fake-world.ts:401`, `claim` missing, from the last clock commit [ran] |
| Data diff typed vs hand | 49 | **52** [ran] |
| `flush.pay.tight` | depth 15, 10,319 states, longer run | At 30 s: depth 13, 4,061 states, no unpinned [ran] |
| Builder mutants 32/32, 3 search-only | killed | **0 of the 3 search-only kills reproduce:** `e-poison-blocks-lanes`, `drain-not-waited`, `flush-deadline-not-now` passed my runner, quiet machine; `drain-not-waited` also passed the repo's own `mutate-one.ts` (`inconclusive`) [ran]. Why they were killed at 22:15: not established |
| H1, E2, M1 on real IndexedDB | fixed | Fixed, tighter than the builder's runs (below) [ran] |
| S4 polluted 6x | 94; 174 us, 17.6; 17.8 before | **Not reproduced:** pre-edge 17.3-19.8, edge 17.6-18.8, alternating, 8 pages each side [ran] |
| Long tasks, busy | 0, 28%; review 36, 42% | 1 long task in 6 runs, busy 25-30% [ran] |

## My mutants

Written from code and rules before opening `RESULTS.md`, `mutants-r7.ts`, `plants.txt`. I had read nothing of round 7's results; I had read the code, and I found H1 while writing them. By eye about 15 resemble the builder's. 121 written; 1 invalid (`typed.unknown-state-allowed`, a syntax error), so 120. Equivalent by reading: `edge.ticket-not-urgent` (a ticket's persist always has `now`), `lane.release-keeps-storage-timer`, `gate.getter-throws-through` (`hooks.run` already wraps), `gate.seal-idempotence-off`.

| Part | Default runner (includes `flush.pay.tight` at 30 s) | Tight alone, on survivors | 5 s gate, on survivors | Own check |
| --- | --- | --- | --- | --- |
| Edge | **20/25** | +0 | +0 | |
| Driver | **8/12** | +0 | +0 | |
| Durable | **13/19** | +0 | +2 (`meta-not-now`, `deadline-not-now`) | |
| Lane | **13/15** | +0 | +0 | |
| Gate | **7/14** | +0 | +0 | |
| Turn | **11/15** | +0 | +0 | |
| Typed | **0/11** | | | **11/11:** `--swap` 7, `compare` 2, `date-check` 2 |
| CLI | **0/10** | | | **7/10:** pins |

**Core 72/100; 72/96 (75%) without equivalents; 74/96 with the gate.** Every kill was a scenario: **no search killed one mutant of 100, and `flush.pay.tight` added nothing** [ran]. The search is not paying for itself as a mutation gate. `mutate-one` runs neither `--swap`, the CLI pins nor the gate, so typed and CLI read 0 there.

**Survivors that matter:**

| Survivor | What it means |
| --- | --- |
| `edge.poison-holds-lanes` | A poison actor's commit would never leave, and no case sees it |
| `edge.ticket-batch-carries-only-its-own` (hide flushes only the first scope) | **A hide with two actors is unpinned** |
| `driver.cut-mid-drain`, `driver.after-drain-ignores-work` | The "batches go after the drain" rule, section 8's answer 5, is unpinned |
| `durable.owed-record-deleted`, `durable.firing-not-saved`, `turn.refusal-keeps-asks`, `turn.keyless-idle-ignores-quarantine` | D72, L6, a refused turn's asks, D88 by key-less guard |
| `gate.lane-id-unchecked`, `gate.nan-is-null`, `gate.schedule-unbounded`, `edge.no-retry-cap`, `durable.mint-floor-from-meta-only`, `turn.overlap-allowed` | **Survived the mid-round review or round 6's too. Reported twice, not pinned** |
| `gate.map-is-object`, `gate.unknown-closure-allowed`, `turn.timers-not-reaped`, `lane.queue-unbounded`, `driver.fatal-keeps-fibers`, `driver.credit-kept`, `edge.backoff-overridden`, `durable.memory-decode-failure-ignored` | Unpinned; lower harm |
| `cli.notsent-off`, `cli.unknown-event-off` | Two rules with no pin |

---

## Question 1: the edge

**Is the invariant true of the code? Yes for what it says** [read, ran]. `pump` and `hide` both refuse while `s.out`; oracle (g) sees it from the store. A failed batch goes back unless something newer is in `dirty`, so the next batch holds everything not known landed. **Is it one rule or a pile? One rule, four policies** (urgency, poison, backoff, reports) in 184 lines. That is a real gain over D83, D94, D95. The pile moved to the seam: `durable.flush` still holds `saved`, `owed`, `asks`, `rekeyed`, `acked`, and H1 is there. The proposal's proof covers disk state only, and it says nothing about what a ticket promises.

| Attack | Result |
| --- | --- |
| **`serialize` behind a held batch** | **Broken: H1** |
| Two actors | Isolated for failure and poison [read, builder's cases]. `flush.two` no failure [read]. Hide with two actors unpinned. Cross-actor cut: stated limit |
| Hung store | Safe and loud once. **No timeout on `out`,** so an actor stays stuck until reload; a `Forget` behind a hung ack waits too [read]. Stated for IndexedDB, not as "any host's batch that never answers" |
| Late failure | Holds. H1 real, no sleep: 12 cycles, batches `flush:false, flush:true, acknowledge:true, flush:true`, restored `UNSURE` 12, final `PAID` 12, **0 two keys** [ran] |
| Kill at each instant | E2 real, offsets 0-25 ms, 80 cycles: **0 `W` with no lane** [ran]. M1 real, SIGKILL from a beacon sent in the success turn's own listener, 48 cycles: `B` 45, `U` held 1, **`null` 2 (H2's signature)** [ran]. Directed search on the fixed code, depth 11: clean [ran] |
| Hide mid-batch | Safe direction, real cost: M1. A residual: M2 |
| Poison | Lanes ahead, deletes stay, as stated [read]. Pinned only partly (above). A second poison report per try is stated |
| `now` | Pinned by the gate only for `meta` and deadlines |
| Drain timing | Fatal plus mail plus a pending batch: `runAfterDrain` spins for good, ran into the harness's settle guard [ran]: Low. Otherwise a cut is a step boundary [read] |
| `meta` apart | Actor lands, `meta` does not: boot number repeats, frame `seq` 2000001 twice [ran]: M3 |

**The hide window, constructed.** The builder's 0/40 had no batch out. Mine [ran]:

| Construction | Batch out at the event | Charge became a hold |
| --- | --- | --- |
| Navigate at the success turn, plain batch 200 KB to 8 MB just before, no slowing | **0/42** | 0/42 |
| Navigate at the success turn, store held 300 ms by a real second transaction | **11/12** | **11/11 of those**, no kill at all |
| Same, with the proposal's `out ∪ dirty` issued at hide | 11/12 | **11/11: no help.** The queued transaction does not survive the page |
| SIGKILL at the success turn, no hide | 0-8 of 14 by size | 10-11 of 14 whatever the batch: the stated pessimistic hold |

So the cost is real only when the store is slower than the page's way out. This Mac never got there without help. Phones: unknown. **`out ∪ dirty` should not be built on this evidence.**

**The old clock.** `page.ts:42` reads `Date.now()` and real timers. The fake's clock never reached a browser. The commit that changed it moved one line of `edge.ts` (`due = 0` to `-Infinity`), which matters only when the clock goes back. **It does not weaken the real runs** [read]. A real clock change is still not run. My reruns were on `e7ee754c`.

## Question 2: a first send is one batch

**Losing the click is right wherever nothing else left** [reasoning]. Nothing was sent, so a press is safe, and a notice saying "wasn't sent" would be about a click the disk never heard of. Where it is not simply fine:

- A turn's other effects are not in that batch: another actor's batch, an unpersisted machine's request.
- A shopper saw `PAYING`, then a reload shows `CARD` with no word. Honest, and silent. It is still the owner's row (2.10.15). **Proposed: accept.**
- A `W` entry still ends `NotSent { Restored }`, so the two paths now differ.
- At the 5 s default the same kill can lose the actor's first record too: `PAY-09` and `PAY-13` restore no actor at all, state `undefined` [ran].

**Can a request leave before its batch landed? No** [read, ran]: `stored` comes only from `answered`, and `dispatch` waits on it. **But that batch may not say what the ticket says: H1.** And "landed" means the store said so: H2.

## Question 3: H3

| Kill | Cycles | Origin wiped (old sentinel gone) | Charged | Charged, nothing on disk |
| --- | --- | --- | --- | --- |
| SIGKILL main only, as `cdp.ts` does, waiting for its children to exit | 248 | **13** (2, 4, 7 by run) | 158 | **5** |
| Same, no sentinel yet | 103 | not measured | 67 | 1 |
| Every process at once | 96 | 0 | 96 | 0 |
| Storage service, then renderer | 77 | 0 | 77 | 0 |
| Renderer only | 126 | 0 | 126 | 0 |

**Established** [ran]:

- **Not lost before reaching the file.** At the kill, the intent's bytes were in `000003.log` for 67/67 charged, including the lost one.
- **Not a read artefact.** Empty on re-read, and after one more restart.
- **The whole origin goes.** `indexedDB.databases()` drops to what the check itself created; a sentinel committed `strict` minutes earlier is gone. LevelDB's new `LOG`: "Creating DB ... since it was missing", on a fresh `MANIFEST-000001`.
- **The directory still exists right after restart,** so the deletion comes after that, by the first open.
- **The quota database's bucket row is unchanged** (3 wipes compared).
- **Disk was 58% used,** so not space eviction by low disk [reasoning].

**Ruled out by that:** macOS `fsync` and the `strict` hint. SIGKILL does not drop the page cache anyway [reasoning], and the bytes were in the file. Renderer-only kills: not the cause.

**Corrections to RESULTS.** "It needs a first visit": false. "Within milliseconds of the click": the wipe does not depend on a click, as far as I measured. "Whole-browser kill": `cdp.ts` kills the main process only, so children outlive it.

**Not established:** who deletes it, and why only sometimes. **Caveats:** the tree kill runs `ps` first, so it lands a few ms later; I do not read that as the cause, since wipes do not need a click. Two earlier main-only runs were overwritten by a tag bug of mine and are not counted. Headless, a temp profile. Whether a normal profile or a real crash does it: not run. **I stopped here on budget.** Next step if wanted: Chromium's `--enable-logging=stderr --v=1` around a wipe, and reading its IndexedDB open path.

**Consequence:** every hold on the origin can vanish, not only a new one. The rule the coordinator decided, *only a key the server recognises prevents duplicates*, is the only answer, and now carries more weight. The fake has no such step; it should.

## Question 4: M9, partly built

**It matters** [ran]. Guard key on a success's alternative, server value `1n`: `InvalidTurn`, redelivered, `InvalidTurn`, **state `W` for good, no lane, `waits: []`, 60 s later the same**, even with a later alternative that would have matched. That is round 6's M9, "a lost completion", through another door. Typed programs reach it: a `Schema.BigInt` field is legal, and `canon` throws where memory now goes through `toCodecJson`. Lookups and module values are the same family [read]. **Proposed:** a guard key that cannot encode denies that alternative; a lookup ends as a failure; a module value is dropped with an issue. All three use the one codec. A small change, and it makes "never fails the turn" true.

---

## High

### H1. A later plain write replaces the awaited ack. Two keys. **r7-edge** (the `acked` bit per write is r1-2; `dirty` merging it is new) [ran]

```text
bare with charge: "serialize"; captureMs huge
Note holdPlain FLUSH Go Go ack ack KILL Go ack ack
-> lane on disk acked:false while att-1 is at the server. Restore: NotSent { Restored }.
-> att-3 sent beside undecided att-1. Oracle (a) fires, depth 11, 44 s.
```

`durable.ts:161` writes `encodeLane(tx, l, l.head?.acked ?? false)` for the second commit; `edge.ts:165` lets it win over the ticket's value; the ticket still answers. Round 6 kept them apart in FIFO. Needs a batch out, or two commits before `later` runs; then a kill before the next batch lands. Real: 0/24 at this Mac's speed, 12/12 with the store held 400 ms after the ack. Anything `serialize` and persisted: `Checkout/Refunds`.

**Proposed fix, one line:** a head awaiting its ack is written as acknowledged.

```ts
// CHANGED, durable.ts:161. existing: encodeLane, acked, phase. Nothing added.
put(actor, id, encodeLane(tx, l, l.head?.acked === true || (l.head?.phase.t === "durable" && l.head.phase.on === "ack")));
```

Result: 563/563; same search clean to depth 11 [ran]. **Better, by root cause (proposed):** since a first send is one batch, a head on disk may always have been sent, so `acked` can go and restore says unknown; only a refusal needs saying. Worth one redesign pass, as it removes a bit that can lie. **Why nothing saw it:** every flush fixture is `reject`; tight has no `holdPlain`; oracle (h) is `stored.includes(key)`, which `acked:false` satisfies.

### H2. A main-process kill can delete the origin's IndexedDB. **r6-real, cause outside the code** [ran]

Question 3. A stated limit, not a fix. But it should be stated correctly, and its rate here is 5%, not "about 1 in 100".

## Medium

- **M1. A batch out at hide costs a hold, no kill needed. r7-edge** [ran]. Table above. Safe direction, and a stated cost; the evidence is now better than 0/40.
- **M2. Hidden, batch out, answer comes: plain memory waits its timer. r7-edge** [ran]. `Note out, hide, Note newest, hide, ack`: disk says `out` at +4.9 s, `newest` at +5.1 s. `hide` skipped it, `answered`'s `pump` checks only `due`. So mid-review assumption 8 is half closed; in a hidden tab "5 s" can be a minute. **Proposed:** `pump` also issues when `host.isHidden()`.
- **M3. `meta` apart repeats a boot, and generations with it. r7-edge** [ran]. `g${boot}.n` ids sit in saved records, and a repeated boot restarts `n`, so a new id can equal a saved one. Observed: frame `seq` repeats. **Harm beyond that: not traced** [reasoning]. **Proposed:** `meta` boards the first batch of the boot, or restore takes a floor from what it read.
- **M4. M9's residue. r3** [ran]. Question 4.
- **M5. The search is not a gate. r7-edge** [ran]. 0 kills in 100; builder's 3 not reproducible; deadline-bound results. Tests.

## Low

- `runAfterDrain` spins for good after a fatal with mail left and a batch pending. **r7-edge** [ran]. `work()` needs a fatal check.
- `fake-world.ts:401` no `claim`, so `tsc` fails and `timers` shows `undefined`. **r7-edge** [ran].
- Oracle (g) exempts `meta`, with no reason given. **r7-edge** [read].
- `page.ts` still awaits `open` outside the bound; still assumes the owner without Web Locks. **r6, r7-early** [read].
- RESULTS' 49 differences; "each with a reason". **r7-edge** [ran].
- Variant `a-failed-batch-re-enters-only-keys-it-was-newest-of` deleted, not named in the log. Others cover it. **r7-edge** [ran].

| Age | High | All |
| --- | --- | --- |
| r3 | 0 | 1 |
| r6 | 1 | 2 |
| r7-early | 0 | 0 |
| r7-edge | 1 | 9 |

## Assumptions

| # | Assumption | State | Note |
| --- | --- | --- | --- |
| 1 | A tab with no disk may send | **Fixed** | D26 declines [read]. Cost: dead button, owner's |
| 2 | A record stays | **Limit, understated** | H2 |
| 3 | The server honours a key for ever | **Limit** | No age on a hold |
| 4 | One actor's bad record is its own | **Fixed** | Per slot [read] |
| 5 | Encode and decode one format | **Fixed for typed** | `date-check` kills both mutants. Hand: `$NaN` stays |
| 6 | A failed batch is known first | **Fixed** | E2 0/80 [ran] |
| 7 | An awaited write is still right when it goes | **OPEN** | **H1 is this, in a new form** |
| 8 | Timers fire on time | **Half** | M2 |
| 9 | A write at hide finishes | **Limit** | M1; large record at reload 0/6 [read] |
| 10 | D87's bound covers the disk | **Open** | Host contract |
| 11 | A reload is not a failed attempt | **Open, Pay's** | `check` warns now |
| 12 | Clocks move forward | **Half** | Edge fine; restored `dueAt` absolute |
| 13 | Unreadable actor is safe to replace | **Open** | Needs a release story |
| 14 | A plain write lands at once or fails | **Half** | `holdPlain` exists; not in tight, so depth 5 only |
| 15 | One Mac speaks for browsers | **Limit** | |
| 16 | A Web Lock exists | **Open** | Host |
| 17 | A quarantined id survives | **Open, Low** | |
| 18 | The world does not change after a turn | **Open, Low** | Encoding now up to 5 s later |
| 19 | `text()` round-trips | **Hand only** | Mutant survives |
| 20 | D80 covers plain memory | **Decided, flagged** | Leaf, first record lost |

**New, from the edge:**

| # | Assumption | True? | Harm when false |
| --- | --- | --- | --- |
| 21 | The store answers truthfully | **False in effect:** H2 | Charged, nothing on disk |
| 22 | Batches are atomic | True on IndexedDB: builder's 56 cycles [read]. Contract for any host | A tear case exists |
| 23 | Every batch answers | **Not guaranteed** | Actor stuck until reload; `StorageSilent` once; no retry, no reopen |
| 24 | A ticket's value is the one that lands | **False: H1** | Two keys |
| 25 | `meta` is only a floor | **Partly false: M3** | Reused ids |
| 26 | Encoding off the turn costs nothing that matters | Main thread still: busy 25-30% at 10,000, 6x, 100 ms [ran] | Jank |
| 27 | A failing store eventually recovers | Retries for ever, batch grows, encoded each try [read]. Real quota not run | Growth |
| 28 | The host's connection stays usable | Reasoning: Safari loses it; the host never reopens | Retries for ever |
| 29 | The page gets to run `answered` | False once frozen or gone | M1, M2 |

## Tests

**Do cases fail without their fix?** Sampled from my kills against what they cite [ran]: `edge.putback-beats-newer` by `REV7-H1` (D83), `durable.lane-write-not-now` by `REV7-M1` (D84), `durable.retired-not-now` by `REV7-D80` (D80, the row names no D93), `lane.ackout-false` by `MED-01` (D48), `lane.rule18-off` by `PAY-05` (rule 18), `durable.corrupt-lane-no-hold` by `REV7-M8` (D88), `durable.old-name-kept` by `REV6-H5` (D78), `driver.failed-read-still-persists` by `REV7-M2`, `gate.keys-unsorted` by `REV4-H5`. **9/9 fail for the reason cited.** Cases are not the weak part. `meta-not-now` and `deadline-not-now` die only at the gate, which `mutate-one` does not run.

**Is the fake realistic?** Mostly. Late failure matches `onabort`'s timing in kind. Gaps against real runs [ran]: a plain write lands at the call in the fake, and takes ms really; no slow store after an ack, which is H1's real shape; no origin wipe; a kill is atomic in the fake and main-first in `cdp.ts`.

**Can oracles see the failure?** Plants: I agree 13 caught, one after a case was added [read `plants.txt`; my overlapping mutants agree]. 6 of 13 by suite only. The two unplanted are real-Chrome questions, and the spy covers them [read]. **But oracle (h) cannot tell `acked:false` from `true`, and no plant was a ticket's value being replaced.** Proposed (h): the record says acknowledged.

**"26 fail, all 26 expected."** Differential with kills flushed too [ran]: 9 of the 10 "kill loses plain memory" pass then, so that label is true of them. **`REV6-TEAR` still fails, so its label is wrong. `PAY-09`, `PAY-13` read `UNCLASSIFIED`:** the real reason is a lost first record, with no actor restored. 13 name their bound, fault or a read on the turn; I read their messages and agree. No new bug in the sample. A gate with a free-text allow list can hide one; it is honest as "nothing new", as RESULTS says.

**Are searches looking at the right actions?** No, for this bug. Every flush fixture is `reject`. Tight's alphabet lacks `holdPlain`, `Retry`, `hang`, `refuse`, `freeze`. Depths against round 6 [read]: pay 8 to 7 (now complete), cross 6 to 5, fragstore.row 7 to 6, listen.none 6 to 5, odd 3 to 2; states about half. **Proposed:** a small directed alphabet per risk finds in 44 s what a wide one misses in 110 s [ran].

**Are benchmarks honest?** S4's 94 and 174: not reproduced, not the edge; likely load or page history, not established. Long tasks: 28% agreed; the review's 36 and 42% not reproduced. The builder's note that "persisted at once" excludes encoding is right and matters.

**`expected-changes.log`, all rounds, 247 lines:** 66 semantic, 171 hash (104 `file:`), 10 comments.

| Class | Count | Which |
| --- | --- | --- |
| Stronger | about 26 | Mutant survivors tightened, cases added, oracles repaired (`S6`, `moneyAudit`, pins narrowed), D59, D55, D50 |
| Neutral | about 34 | Scenario text wrong before code, fixture bugs, format, a close taking time, `stalled` moved, formatter |
| **Weaker** | **6** | Below |

| Weaker | Justified? |
| --- | --- |
| `HIGH-02` x2, `REV4-H4`, `SPIKE-05`: a refused turn no longer | Yes, decided: D89, O5 |
| `PAY-09`, `PAY-13`, `STORE-04/Restored`, `REV6-CAPTURE`: `NotSent { Restored }` gone | Follows the invariant, charges still 0, logged as the owner's. **Not accepted yet** |
| `ctx.ts` L3: ack claim may wait on its own actor's batch | Yes, the edge's meaning, narrowed from any actor |
| `PAY-10/hang`: "not charged" to pending | Looks weaker, is truer (D30). Counted stronger |
| `LIKE-06`: stale until a read | Round 3 narrowed it |
| `STORE-07`: late repair only if uninterruptible | Yes: M7 |

**Bulk reasons are the weak part of the log:** 94 hash lines share a generic reason, and `main.ts` accepts any hash found anywhere in the log, and never flags a deleted id. So I rechecked by running old expectations.

**Round's expected results on the current runtime** [ran], `ctx.ts` of that round, current fake and fixtures, `checkMints` stubbed where absent:

| Scenarios as of | Pass | Fail, all classified |
| --- | --- | --- |
| Round 4, `5c0bbad8` | **342/357** | 3 first send (owner's); 4 D89 (decided); 4 L3 claim; 4 `SPIKE-03/04`, fake's close time |
| Round 5, `4ab940b7` | **446/458** | Same 11, `STREAM5-LOSE` (D79) |
| Round 6, `f836a1e5` | **505/517** | Same 11, `REV6-CAPTURE` |

**No silent regression.**

**Tamper:** `pay.compiled.ts` byte-identical to `397a2e2c`, unchanged since round 2, and its lock line present [ran]. Round 1 to 2 changed it (`AbortPay` moved out, `index` added), logged only loosely (`ALL-PAY`). **Catalog: no scenario id gone since round 1; 1 variant gone, above; no `skip`, `only` or `todo`** [ran].

## Production question

**Lane core** (`lane.ts`, `step.ts`, `turn.ts`, restore): stable. 13/15 and 11/15 on mutants. Nothing new from this review except M4's door. Ready to port against, once the unpinned rows are pinned.

**Driver:** small and clear. One Low. Its best rule, after-drain, has no test.

**Edge:** I could not break the rule. With H1 fixed I could not make it send twice. Costs are known and measured. **Not "clean" yet: H1, M2, M3 are open,** all small.

**Before production work starts, in my view:**

1. H1 fixed, or `acked` removed.
2. M2, M3, M4, and the fatal check.
3. Owner: 2.10.15's row; H2 as a limit, with business keys in every money example.
4. Pins for the survivors above, with `--swap`, CLI and the gate in the runner.
5. `Compiled` frozen for machine, fragment, operations.
6. A phone or Safari run, and real quota: unknown, and they could move M1 and assumption 23. **The one that could change the design.**
7. Round 8's H2 (versions) settled before the store ports.

## `Compiled` and the typed path (question 6)

**Enough for two of four.**

| Prototype | Start? | Why |
| --- | --- | --- |
| Machine and fragment | **Yes** | Typed Pay, ThreeDS, Countdown: 81 Slots, 0 bare, 0 duplicate paths [ran]; a flipped target fails cases [read] |
| Operations | **Yes** | `keyFields`, `events`, `commit` Slot, `R` with `provide` exist. Read's outcomes need a look |
| Entity | **No, after round 8's H2** | `domain` never typed, and per-field versions will change it |
| Outside world | **No, or on paper only** | Stream closures never typed; `subscribe` is an Effect behind an `anEffect` check that checks nothing |

**What will change** [read, ran]:

- `commit` always a Slot: 60 hand fixtures bare.
- `domain.confirms`, `reads`, `listens`, `repair`, `version` to Slots: 18, 11 and more bare.
- Stream `key`, `backoff`, `subscribe`: 6 each.
- `key` closure gone for `keyFields`; `events` required.
- `memory` as fields with Schemas rather than three closures.
- Fragment ports declared rather than read off nodes.
- `target`, `uses`, `fragment` strings, unless tokens survive.
- `domain` per machine.
- Whether a Runtime takes a layer.

**The 84 of 563 and 18 casts:** the casts do not worry me; they sit at one mapped-token seam [read]. The 84 do. Typed mutants are killed only by `--swap`, `compare` and `date-check`, none in `mutate-one`, and the suite's 479 others cannot catch a compile bug.

**`JSON.parse(JSON.stringify(compiled))` plus a code table, in reasoning:**

- **Typed Pay and fragments: no distance that I can find.** Every closure is a Slot with a unique `definition path`; rebinding by that key is mechanical; `provide`'s wrapper belongs in the table.
- **Hand fixtures: 708 Slots, 117 bare functions, 13 duplicate paths** across 35 machines [ran], plus `idleMs: Infinity`, which JSON turns into `null`, and the `on.on.` typo.
- **Runtime:** `seal` works on data and `known` passes. `sealedAlready` is identity, and fine. I found no read of identity past seal, but did not run it.

**The test is cheap. Proposed: run it in round 8, as a pass of the suite on typed machines.**

## `flow check` (question 7)

**Worth shipping as a lint for rules a table can decide:** rule 20's totals, `UnresolvedHold`, `KeyRequired`, unknown events. **Not in this form as a bug finder,** and not with Rule 16 as written. It exits 0 on Pay with six bugs, so a green result says little, and it should say so.

**The single most useful change, proposed: Rule 16 only for events sent from outside.** Its text is about "a press", yet it fires on `Confirmed`, `IntentRead`, `Authenticated` and ports. By the listing: typed Pay 5 to 2, `pay-full` 9 to 2, cart 1 to 1, keeping P4's and P6's lines [ran on the listing, not built]. That removes most of the 8 false warnings, and the data is there (`events.external`).

**Tried and rejected** [ran]: a "success dropped" rule finds `Confirmed` (P3) with 21-plus false alarms on `Settled`; a "left behind" rule gives 3 on Pay, 2 false. Reachability on Rule 16 removes nothing. P1, P2, P5 need closures or a key's value, so **a table cannot see them; the search can.**

## What round 8 must do, in order

1. `round-7/durable.ts:161`: H1's line, or remove `acked`. New case in `conformance/scenarios/`. A `serialize` target and directed alphabet in `conformance/search/flush.search.ts`; oracle (h) reads the record.
2. `edge.ts:147`: issue when hidden (M2). `driver.ts:115`: fatal check. `durable.ts:176`: `meta` (M3).
3. `gate.ts`, `turn.ts`: M9's three doors, one codec.
4. `conformance/mutate-one.ts`: `--swap`, CLI pins, gate. Pins for the survivors above; start with hide on two actors, after-drain, poison's lanes.
5. `conformance/fake-world.ts`: a wipe step, a slow store after an ack; fix `claim`. `conformance/bench/cdp.ts`: name the kill kinds.
6. Owner: 2.10.15; H2 restated in RESULTS; a second tab's button.
7. Round 8's H2 redesign, then type `domain` and streams.
8. Typed suite with `JSON` and a code table; start machine, fragment and operations prototypes.
9. A phone or Safari; real quota.

## Not checked

- Who deletes the origin's directory. A normal profile, headed Chrome, a real crash.
- Why the builder's 3 search-only mutants died then and survive now.
- Whether M3's reused ids cause any wrong route.
- Entities, sessions, streams beyond the suite. `flow graph`, `story`, `trace`. Round 6's M5, M6, M10, M12.
- Whether `Refunds` would really send twice: I ran `bare` with `serialize`, and read the fixture. A business key would stop it at the server.
- The frozen-owner tab and D26's real run: builder's, read.
- Safari, Firefox, phones, power loss, real quota, eviction, key expiry, a real clock change. Old mutant list. `nub run verify`. Lint and format: no code changed here.
- My classification of the log's 66 lines is judgment, and the stronger and neutral counts are approximate.
