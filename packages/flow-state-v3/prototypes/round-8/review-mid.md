# Round 8: independent mid-session review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 8. Checkpoint `076da60d`. Marks: **[ran]**, **[read]**, **[reasoning]**. Ages: r1-2, r3, r6, r7-edge, r8.

## Verdict

**Removing `acked` is correct, and it is the right root cause. No High.** I could not get a second key or a lost hold out of it: real IndexedDB with the slowed store 0/12 two keys, 12/12 one key [ran]; directed search complete to depth 12, 26,279 states, matching the builder [ran]; wider alphabets with a stricter oracle clean (below) [ran].

**D98 and D99 solve their roots for what they claim. D97's code is right, but its case does not pin it: the mutant that removes the fix survives.** **D100 is a set of case-by-case rules, and its root is not solved:** a refused ending still loses a completion for good, by any door that is not encoding.

**The weak part of this checkpoint is the harness, not the runtime.** At `076da60d`, `main.ts` exits 1 on unchanged code, because a variant name with a space breaks D103's lock parse, and the committed `mutate.ts` cannot run outside the repo. Its new control caught that correctly. Three new pins pass with the behaviour they name removed.

**What I'd read first:** `round8.scenario.ts:171-182` (D97's case), `main.ts:204,215` (the lock parse), `durable.ts:371-380` (restore order).

## Reproduced

| Item | Claimed | I got |
| --- | --- | --- |
| Suite | 607/607 | 607/607, **exit 1**: `unlogged: variant:REV4-H5/key` x5 [ran]. STATUS doesn't mention the exit |
| `--swap` | | 607/607, same exit 1 [ran] |
| 5 s gate | | 27 failed, 27 expected, none different [ran] |
| CLI pins | | pass [ran] |
| H1 real, `bareSerial`, hold 400 ms | 0/12 | **0/12 two keys, 12/12 one key.** Restored `A` 12, endings `unknown,failure` 12, final `W` 12. Not rerun: `refunds` [ran] |
| `flush.serialize.directed` | complete depth 12, clean | Complete depth 12, 26,279 states, 83 s [ran] |
| `mutate.ts` control | passes | **Fails at this commit**, on every chunk (M3) [ran] |

## My mutants

Written from code and rules before reading `STATUS.md`, `results-h1store.json` and the bodies in `round8.scenario.ts`. I had read: `AGENTS.md`, `HANDOFF.md`, `convergence-8.md`, `round-7/review.md`, `mutate.ts`, `mutate-one.ts`, `mutants-r7.ts`, the round 7 to 8 diff, `lane`, `durable`, `edge`, `driver`, parts of `turn`, `gate`, `reads`, `harness`, `drive`, `flush.search`, the first 150 lines of `round8.compiled.ts`. Two lines of `round8.scenario.ts` showed in a grep. `mutants-r8.ts` is not in this commit.

**Runner caveat.** The committed runner would not start, so kills ran on a scratch copy with `SCENARIOS.md` copied in and `printReports` in a try/catch. Runtime and scenarios are byte-identical. Run with `mutate.ts`'s own gates, no `--search`, control green at 29-30 s per chunk.

**45/64 killed; 45/63 without one equivalent** (`d99.stamp-kept-in-memory`). 43 by the suite, 2 only by the gate, 0 by watchdog [ran].

| Survivor | What it means |
| --- | --- |
| **`d97.off`** | D97 unpinned: M2 |
| **`driver.fatal-keeps-fibers`**, **`durable.firing-not-saved`** | Each has a case written for it, and it passes anyway: M6 |
| `d99.lane-no-stamp`, `d99.no-lane-floor`, `d99.stamp-constant` | The lane's stamp is unpinned. It matters only when a poison actor's record stays back and a lane goes ahead [reasoning] |
| `d99.meta-ignored` | No case needs `meta` for the boot floor: Q2 |
| `d99.mint-floor-w-off` | `W`'s mints in the floor are unpinned |
| `d96.parked-held-hook-dropped`, `d96.released-evidence-dropped` | A parked hold's `restored` hook, and the `Released` note on a restored releasing lane. Oracle (a) reads that note |
| `d100.guard-no-reason`, `d100.lookup-tag` | Nothing reads the reason `Unencodable`, or tells `Defect` from another mapped tag |
| `turn.overlap-allowed`, `turn.refusal-keeps-asks`, `lane.queue-unbounded` | First two: reported before and still unpinned. D102 says pin or give a reason |
| `gate.lane-id-unchecked` | My form removes `k === lane/id` only; the next line still checks the id's shape. The record's key against its body stays unpinned |
| `cli.rule20-notsent-off`, `cli.unknown-event-off` | STATUS says not yet added |

From round 7's table, now killed: `edge.poison-holds-lanes`, `edge.hide-one-scope`, `driver.cut-mid-drain`, `driver.after-drain-ignores-work`, `gate.nan-is-null`, `gate.map-is-object`, `gate.schedule-unbounded`, `edge.no-retry-cap`, `edge.backoff-overridden`, `turn.keyless-idle-ignores-quarantine`, `durable.owed` [ran]. That is real progress.

## Question 1: is removing `acked` correct?

**Yes.** The convergence's table of paths holds, read against the code [read]:

| Attack | Result |
| --- | --- |
| Double send behind a held batch | H1's trace: hold, one key [ran]. Real 0/12 [ran] |
| `W` restore | `W` always ends `NotSent { Restored }`. A head reaches `W` by no path; a promotion always goes through a ticket [read]. `d96.ticket-record-head-as-w` dies [ran] |
| Refused first send, then a kill | Put back in `dirty`, but its mail resolves the lane in the same drain, and F3 keeps the cell even if the turn refuses [read]. After a landed plain batch: no lane on disk, no hold [ran] |
| Refused turn on that mail | Cell stays, lane resolves [read] |
| `landNoAck` | Hold. Pessimistic, same as round 7 [read], pinned [ran] |
| `serialize` search, stricter oracle (i): *may be at the server, unreleased, so a head on disk says it, after every step* | Alphabet `Go Note Retry Forget holdPlain FLUSH ack refuse landNoAck KILL lost ok`: clean to depth 7, 25,000 states. `Go Retry Forget ack refuse failHeld sayFailed KILL lost`: clean to depth 9, 40,000 states. Both stopped by the state budget [ran] |
| `latest`, a target that doesn't exist in the repo, with (i) | Clean to depth 7, 25,000 states, budget [ran] |

**Did a real distinction go with it? No.** Round 7's `acked: true` was written before the request left, so it never meant "sent". The only state that said "not sent" was the lie. What round 7 could say that round 8 can't: nothing true.

**A claim that was already false and matters more now: M1.** Restore's order ends a hold's route with `W`'s answer.

**Stale after D96** [read]:

- `lane.ts:437` `byEnding`'s second branch cannot run: every restored mail on a lane is `unknown`.
- `Purpose`'s `"acknowledge"` now means "first send".
- A `capture` ticket writes the bytes already on disk. Its only value is a store that still answers, so it may not be worth keeping [reasoning].
- `machine-design.md:843,1316,2238,2282,2306` still say never-acknowledged restores `NotSent`. For the merge list.

## Question 2: D97-D100

**D97: fixed, not unified.** M2's real trace: round 7 `out` until +5.1 s, round 8 `newest` at once [ran]. Root B said "not one question", and it is still three: `accept`'s `urgent`, `pump`'s three clauses, `hide`'s two. No divergence with harm found [read]. Backoff kept: `d97.no-backoff-when-hidden` dies [ran]. **Its case is M2.**

**D98: right.** `d98.off` and `d98.batches-dropped-after-fatal` die [ran]. Residual: the edge's retries go on after a fatal, for good on a failing store [read]. Low. The case can't fail for its cited reason on round 7: round 7's adapter has no `onLogged`, so it stops at `fatal: expected true` [ran]. The mutants cover that.

**D99: solves its root as stated.** "An id on disk is never repeated" holds [read]: a record's ids are minted at or before the stamp in that process, and the floor reads quarantined records too. Actor records are never deleted, so a floor stays once one lands. Gens leave only through records [read]. Attempt ids are the host's, UUIDs on a page [read], so a repeated boot can't reuse a server key.

| Attack | Result |
| --- | --- |
| Per-boot rewrite | **Real:** a hold rewrites its lane on every boot. Round 7 wrote actor, meta; round 8 actor, lane, meta [ran]. Cost small, but with a failing store each boot now reports `StorageFailure` for a page that did nothing [ran] |
| Boot with nothing landed | Ids reached no disk, so repeating them is harmless [reasoning] |
| Lost `meta` | **No longer harmful for boots.** `nextMint` can still repeat a dead lane's mint: the floor reads live lanes only. A repeat only ever equals a dead mint, and entity marks are not saved (`save` keeps `refs`) [read]. No harm traced. Evidence shows one mint twice |
| Stamp on non-integer | Ignored. `meta`'s check is laxer, `Number.isFinite` not `isSafeInteger`. Low [read] |

**Proposed, for the redesign pass: drop `meta`.** It now gives one floor another way, costs its own transaction on every commit (`nextMint` changes), and no case needs it for boots (`d99.meta-ignored` survives). Stamp `{ boot, mint }` per record, and identity has one mechanism. Not built.

**D100: case-by-case.** Encoding sites in a turn, and what each does [read]:

| Door | Unencodable means |
| --- | --- |
| Commit input or key | `NotSent { StorageRefused }` plus issue. **The store was never asked** (claim untrue, [ran]) |
| Lookup input or key | `failure { Defect, why: Unencodable }` plus issue. The convergence says `NotSent { Unencodable }`. `Defect` is defensible: rule 37 makes reads map it |
| Module value | Dropped, issue |
| `retry`, `cancel` key | Issue, nothing |
| Guard key | Deny, reason `Unencodable`, issue on every evaluation |
| `resetOn` (`inc.ts:104`, `turn.ts:351`) | **Refuses.** Stuck if it's on an ending's turn |
| Stream key (`gate.ts:215`) | Refuses, through the module's own path |
| `.each` key (`gate.ts:75`) | Refuses |
| Memory | Poison at the edge |
| Lane parked | Value replaced |
| `frozen.parked` | Not handled: poisons the actor until thaw. Not run |

**Does a fourth door mean one thing? Yes.** Each was found by reading, and the fourth by accident. `gate.ts`'s header says closures are checked by their kind at seal "so a new call site cannot forget". D100 moved the other way, to `text(x) === undefined` at call sites.

**The door is where a value enters, not where it's used** [reasoning]:

- A value comes in through an event payload, an outcome's `from`, or a stream frame. Decode there, by Schema. A failure there has one meaning: an ending, or an issue and a drop.
- After that, `text` failing is a defect, and a typed program can't reach it.
- Hand-written `Compiled` still needs a fallback, but one, by Slot kind at seal.
- **There are still two codecs.** Memory goes through `toCodecJson`; keys, inputs and guard keys through `canon`. So `Schema.BigInt` is legal in memory and fails as a key [read]. HANDOFF asked for one codec. `keyFields` with Schemas is the natural home. Also: JSON from `fetch` can't carry `1n`, so typed Schema decode is the real source of these values, not a server [reasoning].

**A refused ending's turn is the same harm, untouched: M4.** D100 fixes the encoding path of "a completion lost for good".

## Question 3: control, log, oracle (h)

**Control: sound in design, and it worked.** It found the runner broken here. Weaknesses:

| Item | Evidence |
| --- | --- |
| A mutant that doesn't parse counts as **killed**: `KILLED syntax-error crash:` | [ran]. `mutate.ts:98`, `!parsed` |
| A watchdog timeout counts as killed, so load can make a kill | [read]. Round 7's 3 false kills had another cause, and STATUS's explanation fits what I read |
| `kills` is never compared with the killer | [read] |
| Control failure exits before temp cleanup: `flow-mut-*` left behind | [read], `mutate.ts:53` |

**STATUS's account of round 7's three kills:** read, not rerun. Plausible.

**Log: better, and a tamper still passes** [ran, in a scratch copy]:

| Tamper | Result |
| --- | --- |
| Baseline | **Exit 1 on unchanged code.** So nobody can use this as a gate |
| Delete a variant whose name has a space (`key g1.2: ...`), log the two hashes | **606/606, `removed: none`.** Round 7's deleted-variant finding, still open for those six |
| Weaken an expected result, run `--lock` | `REV8-H1`, printed once as unlogged; next run clean. **No log line** (`main.ts:222`) |
| Weaken oracle (h); add a line to `gate-5s-expected.txt` | Nothing notices. Not hashed: `search/*`, `gate-5s-expected.txt`, `cli/main.ts`, `typed/*`, `mutate*.ts`, the round's `adapter.ts` normaliser |
| Restore an older `round7.scenario.ts` | Caught: those old lines' reason is bulk. A hash logged once with a unique reason stays valid for good [read] |
| Reason `removed:X | ` empty; two reasons that differ by one word | Pass [read] |

The log can't stop someone determined, and shouldn't try. `--lock` refusing while anything is unlogged, plus hashing what the round's gates depend on, closes the easy cases.

**Oracle (h): now sees a lying record of one kind.**

- `d96.plain-while-ticket-demotes`: found, depth 6, H1's own trace. `d96.plain-on-wire-demotes`: found, depth 1 [ran].
- It reads the disk after the step settles, not when the request starts, and skips a key already seen (`flush.search.ts:204,210`) [read]. So it can't see a lie written after the first step, or on a resend.
- `held-bit-lies`: **not found** by the directed search. The suite kills it [ran].
- My (i), every step instead of first sight, cost nothing visible and found nothing. **Proposed: replace (h) with it.**
- It runs only inside a search, and `mutate-one` skips searches by default, so no gate runs it.

## Question 4: tests

**Do new cases fail for their cited reason? Mostly.** On the round 7 runtime [ran]: all but one of the `REV8-M9` cases, `REV8-M3` x3 and the H1 cases that should, fail with the cited message. Mutants sampled against their killers [ran]: `plain-while-ticket-demotes` by `REV8-H1`; `d98.off` by `REV8-FATAL`; `guard-refuses`, `lookup-*` by `REV8-M9`; `edge.*` by their named pins. Those are good. Exceptions:

- `REV8-M2/an-answer-to-a-hidden-page-issues-at-once`: passes on round 7 (M2).
- `REV8-FATAL/a-fatal-stops-the-fibers`, `L6-a-firing-...`, `a-module-value-...`: M6.
- Labels: `D84-batches-go-after-the-drain` and `D83-a-lost-meta-...` cite decisions about something else (D84: a lane's batch goes now; D83: per-key writes) [read]. Low.

**What the fake still gets wrong:**

| Gap | Effect |
| --- | --- |
| A value like `1n` arrives by a direct call; JSON can't carry one | Tests a path only Schema decode can reach. Typed path has no such case [read] |
| Any batch can be answered in any order unless `storeWide`, off by default. IndexedDB runs them in order | Superset, so safe, but some traces are impossible. `REV8-M3`'s is real only when the actor's batch was urgent [reasoning] |
| `hide` flips hidden back unless `stay`, and later tasks always run. A real hidden page may freeze | What let M2's case go wrong, and assumption 29 |
| `slowAfterAck` holds plain writes only; a slow store holds tickets too | Ticket answers are steps anyway [read] |
| `wipe` is certain, at the next open; real was 5% on main-process kills | Fine as a pin. H3's cause not started (STATUS) |
| Kill is atomic; `FLOW_TEST_FLUSH=kills` flushes after `wipe` | Only that classification mode [read] |
| Plain writes land at the call unless `holdPlain` | As before |

**What each search still misses:**

| Search | Misses |
| --- | --- |
| `flush.serialize.directed` | Sampled 8 mutants at depth 10, 12,000 states: 2 found, both lying records [ran]. **Never reaches a hold:** no `lost`, `ok`, `Retry`, `Forget`, `refuse` [read] |
| Every flush search | **D97 can't be reached:** `FLUSH` is `hide` with no `stay`. **D99 can't be seen:** `fake-world.ts` filters `meta` from state text, the adapter drops `boot` and ranks stamps, and no oracle reads ids. **Refused turns can't happen:** no `throwIn`. No wipe, `tear`, `crashAfterBoot`, `load`. No `latest` target. No module's hooks. No Refunds |
| `two`, depth 8 | Clean, 2,182 states [ran]. Hide with two actors isn't what it hunts; `REV8-PINS` has it |
| The rest | Not rerun |

A search hunts new traces and isn't a regression gate, as `mutate-one.ts` says. Agreed. Round 7's "0 of 100" stops being a problem once it's stated.

## High

None.

## Medium

### M1. Restore's order ends a hold's route with `W`'s answer. **r1-2, exposed by round 7's one-batch rule** [ran]

```text
serialize, captureMs 0
Go Go ack KILL
-> delivered: Unsure, then No. State A, row uncertain, `U` left.
Go ack, a minute later -> W, waits [held, W], 1 request, 1 key. Nothing moves until a Retry or Forget.
```

`durable.ts:371-380`: head's mail, then `W`'s. Real run: restored `A` 12/12, final `W` 12/12 [ran]. Money is safe. But a machine's prompt for a hold is replaced by a `NotSent` for a press the user made after it. `flow check`'s `UnresolvedHold` reasons by the state a hold arrives in, and this leaves that state. STATUS flags it as doubt. **Proposed:** per lane, `W`'s endings first, then the head's, so the last route is the hold. Rule 44's text changes. Not tried against the suite.

### M2. D97's case does not pin D97. **r8** [ran]

```text
d97.off survives. REV8-M2/an-answer-to-a-hidden-page-issues-at-once passes on round 7.
The case sends `Note newest` after `{ hide, stay }`, so `accept` was already urgent.
M2's trace: Note out, holdPlain, hide, Note newest (visible), { hide, stay }, ack.
Round 7: out, out at +4.9 s, newest at +5.1 s. Round 8: newest.
```

`round8.scenario.ts:171-182`. **Proposed:** move `Note newest` before `{ hide, stay }`.

### M3. The suite exits 1 and the mutation runner cannot run at this checkpoint. **r8** [ran]

```text
main.ts --round 8: 607/607, exit 1. unlogged: variant:REV4-H5/key x5
expected.lock: `variant:REV4-H5/key g1.2: armed, sent, stored present`
main.ts:204,215: l.split(" "). Six names collapse into one id.
bun mutate.ts: CONTROL FAILED ... swap: could not run
main.ts:251 printReports reads ../SCENARIOS.md and machine-design.md. Neither is in the scratch copy.
```

The control and `mutate-one` read `SUMMARY`, printed after reports, so `--swap` and `gate5s` both die there. STATUS says `mutate-one` "not yet run across the survivor list", which is honest. It may be fixed in the builder's uncommitted work, which I did not read. **Proposed:** split on the last space; `--no-catalog` skips reports.

### M4. A refused ending's turn still loses the completion for good. **r3 (D50); D100 left it** [ran]

```text
Done: [{ target: TF }, { target: C }], TF's schedule 3_000_000_000
Go ack ok -> InvalidTurn x2, state W, waits [], and the same at +120 s. C matched and wasn't tried.
Done: [{ target: C, patch: throws on this value }]
Go ack ok -> InvalidTurn x2, state W, waits [].
```

`turn.ts:1155`. This is round 6's M9, with a charge that succeeded. D100 calls a throw "a separate matter", and it is for the author. For the system it's one harm: a state that waits with nothing to end it, and `waits` says so honestly by saying nothing. Oracle (f) would catch it, but no alphabet has `throwIn`. **Proposed:** treat this as the design question it is. After the redelivery, an ending's turn that refuses should say so on the row or in `waits`, and possibly run the machine's declared fallback. Not designed here.

### M5. A failure with no I/O and a handler that asks again spins with no bound. **r1-2; r8 adds an entrance** [ran]

```text
Look { v: 1n }, LookFailed: [{ members: lookup(read, () => ({ v: 1n })) }]
-> 1.8 GB in 1.6 s, killed by the watchdog. Bounded at 2,000 turns: 29 ms, 2,001 UnencodableValue.
A commit closure that throws at once: the same, 2,000 turns in 23 ms.
```

`reads.ts:47` with `driver.ts:218`. Harness log inflates the memory; production's would be smaller. The loop stays: `drainMs` yields, and nothing stops it. "Retry on failure" is an ordinary handler, and the network normally rate-limits it. Round 7 stopped here by refusing. **Proposed:** `TurnStorm`'s bound also covers mail a turn produced with nothing outside in between.

### M6. Three pins pass with what they name removed. **r8** [ran]

| Case | Why |
| --- | --- |
| `REV8-FATAL/a-fatal-stops-the-fibers` | The answer that triggers the fatal also ends the only fiber. `driver.fatal-keeps-fibers` survives. Needs a second fiber still open |
| `REV8-PINS/L6-a-firing-before-its-turn-survives-a-kill` | `durable.firing-not-saved` survives. Not traced why |
| `REV8-M9/a-module-value-...` | At `captureMs: 0` the issue is satisfied by the edge's poison report, so the suite passes; only the 5 s gate kills it. Should read the module or the origin |

### M7. Change-log tamper paths left. **r1-2, r8** [ran]

Question 3's table. `main.ts:222`, `main.ts:63`.

## Low

- `REV8-M9`: a superseded lookup's failure arrives after the newer read started. `Both` (lookup `1n`, follow-up good lookup): open reads 1, `last: failed`, `LookFailed` delivered. With an encodable first read, nothing is delivered. `reads.ts:47` has no generation. **r8** [ran]
- A commit that can't encode says `StorageRefused`. **r6, D89** [ran]
- `text(new Date(NaN))` is `null`, one lane with `null`. Assumption 19. **r3** [ran]
- Guard's issue per evaluation. **r8** [read]; STATUS has it
- D99 rewrites per boot, `meta`'s `isFinite`. **r8**
- `mutate.ts:98`, `mutate.ts:53`. **r8** [ran, read]
- `byEnding`'s dead branch; stale names. **r8** [read]
- `convergence-8.md` has no "Corrections after building" yet, and the lookup's tag already differs. **r8** [read]

| Age | High | All |
| --- | --- | --- |
| r1-2 | 0 | 3 |
| r3 | 0 | 2 |
| r6 | 0 | 1 |
| r8 | 0 | 9 |

## Assumptions: the 29, continued

| # | Assumption | State now | Note |
| --- | --- | --- | --- |
| 1 | A tab with no disk may send | Fixed | |
| 2 | A record stays | Limit | D106 pins the cost; business key pinned. H3 not started |
| 3 | The server honours a key for ever | Limit | |
| 4 | One actor's bad record is its own | Fixed | |
| 5 | Encode and decode one format | **Changed: fixed for memory only** | Keys and inputs use `canon` |
| 6 | A failed batch is known first | Fixed | |
| 7 | An awaited write is still right when it goes | **Closed** | D96. Real 0/12 |
| 8 | Timers fire on time | **Mostly** | M2 fixed. Backoff timers on a hidden page, restored `dueAt` remain |
| 9 | A write at hide finishes | Limit | |
| 10 | D87's bound covers the disk | Open | |
| 11 | A reload is not a failed attempt | Open, Pay's | |
| 12 | Clocks move forward | Half | |
| 13 | Unreadable actor is safe to replace | Open | Its stamp counts now |
| 14 | A plain write lands at once or fails | **Better** | `holdPlain` in the directed search |
| 15 | One Mac speaks for browsers | Limit | |
| 16 | A Web Lock exists | Open | |
| 17 | A quarantined id survives | Open, Low | |
| 18 | The world does not change after a turn | Open, Low | |
| 19 | `text()` round-trips | Hand only | NaN pinned. Invalid Date isn't |
| 20 | D80 covers plain memory | Decided, flagged | |
| 21 | The store answers truthfully | False in effect | |
| 22 | Batches are atomic | True on IndexedDB | D96 leans on it harder. A host contract |
| 23 | Every batch answers | Not guaranteed | Unchanged |
| 24 | A ticket's value is the one that lands | **Replaced** | Now: *a record with this head landed*. Held on search and read |
| 25 | `meta` is only a floor | **True for boots; redundant** | Mint repeats only a dead one |
| 26 | Encoding off the turn costs nothing that matters | Unmeasured | A lane rewrite per boot added |
| 27 | A failing store eventually recovers | Unchanged | Retries also outlive a fatal |
| 28 | The host's connection stays usable | Open | |
| 29 | The page gets to run `answered` | False once frozen | D97 helps only if it runs |

**New:**

| # | Assumption | True? | Harm when false |
| --- | --- | --- | --- |
| 30 | A head on disk may have been sent | By design, pessimistic | A hold on what never left. Stated |
| 31 | `W` never left | True [read, mutant] | Double send: any new path from head to `W` |
| 32 | Every id in a record is at or below its stamp | True [read] | Reused gens |
| 33 | Gens reach nothing but records | True [read]. A read's `ctx.id` contains an inc id | Low |
| 34 | A synchronous failure is rate-limited | **False:** M5 | Spin |
| 35 | The last ending delivered at restore is the one that matters | **False:** M1 | Hold's prompt left |
| 36 | A refused turn can be redelivered into success | **False:** M4 | Completion lost |
| 37 | Unencodable values are rare and come from a server | **False in part:** a typed Schema makes them | A legal program always declines |
| 38 | A gate's exit code means something | **False here:** M3 | Failures unseen |

## The rest of the system

- **`Compiled`:** D100 adds nothing to it, which is why it can't fix the root. `keyFields` with Schemas, and event and outcome Schemas as the decode point, would make the typed path's doors unreachable. Worth doing when machine and operations compile, step 8. Hand fixtures keep one fallback.
- **`flow check`:** a lint for a key field whose Schema isn't plain JSON is cheap and table-readable [reasoning]. `UnresolvedHold` should learn M1, or M1 should be fixed. `Rule20NotSent` is unchanged and still right, since `W`, `Cancelled`, `StorageRefused` remain.
- **Types:** `Unencodable` isn't in any typed denial reason [read]. A reader of `check()` gets a word no type mentions.
- **Stories, trace, explain:** nothing reads `acked` [read]. `flow trace` should expect a repeated dead mint if `meta` stays apart.
- **The single graph, static analysis:** nothing here breaks them. Restore's order is a runtime rule no table shows, and that's M1's reason for being missed.

## Not checked

- `refunds` real rerun; H3; a real clock; Safari, phones, quota. `run-plants.sh`, other searches. `flow graph`, `story`, `trace`.
- `mutants-r8.ts`, and anything uncommitted in the builder's checkout.
- Why `durable.firing-not-saved` survives. Whether M1's reorder passes the suite. `frozen.parked` poison was read, not run.
- My kills are on the patched scratch copy of `main.ts` and `mutate.ts`.
- **Load:** the builder's Chrome and H3 runs were live on this machine throughout, and my mutants, searches and one Chrome overlapped. Trees: mutation children under 1,400 MB by its watchdog, searches about 240 MB, Chrome 791 MB. One experiment reached 1,816 MB and `watch.ts` killed it: M5. Search budgets were by states, so load changes times, not verdicts.
- **Budget:** over the 45 minutes, mostly the mutation loop, restarted twice because of M3.
- Experiments and mutant list are under the scratchpad's `rev/`: `mutants-rev.ts`, `x1.ts` to `x5.ts`, `m2.ts`, `e2.ts`. Nothing written in this worktree except this file.
