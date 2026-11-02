# Convergence 8: make the persistence edge and the tests trustworthy

Status: **proposed, throwaway**, by the round's builder under delegated authority. Arpit overrules. Written before the code; "Corrections after building" at the end says what the code changed. Input: [round-7/review.md](round-7/review.md), [round-7/RESULTS.md](round-7/RESULTS.md), [round-7/review-mid.md](round-7/review-mid.md), all advice. Everything is rerun before it is believed. Not in this round: H2's entity redesign (`known-failing-h2.ts` stays known-failing), `out ∪ dirty` (the review's evidence is against it), `.plan` files, `machine-design.md`.

## Findings by root cause

| Root | Findings | Answer |
| --- | --- | --- |
| **A. A bit on disk says something the writer does not know.** A plain write and a ticket share one `dirty` key, so a ticket's "this value landed" becomes "the newest value landed", and the newest value can say `acked: false` about an Attempt at the server | Review H1, assumption 7, assumption 24, oracle (h) reading a substring | D96 |
| **B. The edge's "due" is not one question.** `accept` asks "urgent, hidden, or due"; `pump` asks only "ticket or due"; so an answer that frees a hidden scope does not issue | M2, assumption 8's other half | D97 |
| **C. A fatal is checked at two of the three places that loop** | `runAfterDrain` spins for good | D98 |
| **D. Identity depends on a floor that lands apart from what it protects.** `g${boot}.n` ids sit in actor records, the boot number in `meta` | M3, assumption 25, RESULTS' note that `meta` "may land apart" | D99 |
| **E. "Never fails the turn" stopped at two of five doors.** Guard key, lookup and module value still use `admit`, and a refused ending stays `W` for good | M9's residue (review M4, Q4), RESULTS' owner's call 5 | D100 |
| **F. A gate that does not run does not kill.** `mutate-one` skips `--swap`, CLI pins and the 5 s gate, so whole classes read 0. "Every search kills nothing" is a question about what searches are for | M5, typed 0/11, CLI 0/10, `meta-not-now` | D101, D102 |
| **G. The log can be satisfied by anything.** `main.ts` takes a hash found anywhere in the log and never notices a deleted id | Review's "Bulk reasons are the weak part", deleted variant | D103 |
| **H. The fake lacks what reality did.** No wipe, no store that goes slow after an ack; `claim` missing on one timer; `cdp.ts` calls a main-process kill a kill | Review's fake gaps, `tsc` error, H3's corrections | D104, D105 |
| **I. H3 is stated wrong and its cause is open** | Review Q3, RESULTS' "first visit" | D106 |

## Decisions (all proposed)

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D96** | **`acked` goes.** Since a first send is one batch (round 7), every head on disk arrived in a ticket's batch or something newer of the same lane, so a head on disk may have been sent. A restored head is `unknown { Restored }`, or held if it says held. `NotSent { Restored }` remains only for `W`, which truly was not sent. What a ticket now promises: *a record with this Attempt as head landed*, and that is what a newer value of the same lane also says. Tried first; the one-line fix is the fallback, with a stated reason | Disk format loses a field. A kill in the window of a refused first send that landed could read as a hold instead of `NotSent`: see below, checked | `world.ts`, `lane.ts`, `durable.ts`, four cases' reads of `head.acked` |
| **D97** | **`pump` also issues when hidden, unless in backoff.** Backoff stays: a hidden page with a failing store must not spin | None seen | `edge.ts` |
| **D98** | **`work()` is false after a fatal.** One place, so every loop agrees. Batches already accepted still go: they are cuts that were published | None | `driver.ts` |
| **D99** | **A record says which boot wrote it, and restore's floor is the largest it reads.** Same shape as the mint floor. Every id in a record was minted at or before that record's stamp, so an id on disk can never be repeated. No write path changes, `meta` stays as it is | One short field per record. A lane rewrites once if touched in a new boot | `durable.ts`, adapter's hash |
| **D100** | **The three doors use `text`, the one codec, and none fails the turn.** A guard key that cannot encode denies that alternative, and a later alternative may match. A lookup whose input or key cannot encode ends as a failure, `NotSent { Unencodable }`, through its outcomes. A module value that cannot encode is dropped with `UnencodableValue`; the module's member does not run. A throw in a closure is a separate matter and stays a refusal | A denial for a reason a reader must find in issues, so the guard says `Unencodable` and an issue names it | `turn.ts`, `gate.ts` |
| **D101** | **`mutate-one` runs what the round's gates run:** suite, `--swap`, CLI pins, 5 s gate. Searches only after those, and a search's kill must also be shown not to fail on the unmutated code | A slower mutant | `mutate-one.ts`, `mutate.ts` |
| **D102** | **Pins for what survives, starting with the review's table.** Each cites what it tests. A survivor reported twice gets a pin or a reason | More cases | New `round8.scenario.ts` |
| **D103** | **The log is keyed by id.** A hash counts only on a log line naming that id. A lock id with no scenario is a failure unless a `removed:` line names it | Old bulk lines stay valid only where they name the id | `main.ts` |
| **D104** | **The fake gets a wipe and a store that goes slow after an ack.** `{ reload: true, wipe: true }` and `{ slowAfterAck: true }` | | `fake-world.ts`, `drive.ts`, `harness.ts` |
| **D105** | **`cdp.ts` names its kills:** `killMain`, `killTree`, `crash`. A kill that is only main-process says so at the call | | `cdp.ts`, callers |
| **D106** | **Design for a wiped origin.** Case for what it does to a hold in both key forms. H3's cause gets 45 minutes; "not established" is an allowed answer | | Scenario, RESULTS |

### D96: what could `acked: false` on disk have meant, once a first send is one batch

From the code [read]; each is then checked by a case or the suite:

| Path to a head on disk | `acked` today | Was it ever "not sent, and known"? |
| --- | --- | --- |
| First send: `flush` skips the plain write and writes `encodeLane(.., true)` with a ticket | true | No: it says true before anything is sent |
| A plain write of that lane while the ticket is out: `W` grew, `then` was set | **false**: H1 | **It lies** |
| A head promoted from `W`: asks, as a first send | true | Same |
| A resend: `capture` ticket | true | Same |
| `refuseFirst`: the head settles `NotSent { StorageRefused }`, plain write says false | false | True, but mail in the same drain resolves it, batches go after the drain, and a delete or a promoted head replaces it in `dirty` before any batch leaves |
| Restored head re-written | whatever was on disk | Follows from the above |

So a head with `acked: false` that lands is H1 or nothing. `W` entries carry the field too and restore never read it there.

**What a ticket promises after this.** Between its write entering `dirty` and its answer, what can replace the lane's value? More `W`, or nothing on disk changes (`then` is not encoded). The head cannot change while its ack is out (`ackOut`, D48). A disposal parks the head, and the ticket is then fenced (`onStored`), so nothing is sent. So every newer value still names that Attempt as head.

```decisions-changed
D80          amended   D80,D97  an answer to a hidden page issues at once, backoff apart
D89          amended   D89,D100 "never fails the turn" now holds for a guard key, a lookup, a module value and a member's key
```

## What the tests must also be able to see

- Oracle (h) reads the record: at the moment a keyed request starts, the Attempt is the **head** of a lane on disk. `stored.includes(key)` also matched `W`.
- A `serialize` target and a directed alphabet in `flush.search.ts`, so a depth-11 trace is in reach.

## Corrections after building

- **D96: taken, the removal, not the line.** Across 563 cases, the only expected results that moved were five reads of the field itself. `W` keeps `NotSent { Restored }`, a refusal leaves no hold, and a landed ticket nobody heard stays a hold, each pinned. Words left behind: the phase `on: "ack" | "capture"` and the ticket's `purpose` now mean "first send" and "resend", and `purpose` only picks the store's durability hint. Not renamed in this round, so the diff stays readable.
- **D97: the guard was needed.** Written without `failures === 0`, a mutant shows a hidden page spinning 50 tries with no time passing.
- **D99: the harm is real, not only a repeated frame.** On round 7's code a read's ending reached another copy (`pathOfId` finds the first match). Also covers an unreadable `meta`.
- **D100: a fourth door, a member's key on `retry` or `cancel`,** found reading the first three. Same family, done. **A fifth, `resetOn`, stays a refusal:** a reset value is a fragment's identity, so there is nothing to enter and nothing to compare. A throw in any closure also stays a refusal, and a refused ending still leaves its actor where it was (D50): that is the stuck `W` with a cause that is the author's, and it is not this round's.
- **D101: changed by what ran.** Round 7's three search-only kills were false: `flush.pay.tight` failed on the unmutated code at the commit they ran on. So `mutate.ts` runs a control first and stops if it fails, and searches left the default gates. See RESULTS.
- **D105, D106: H3's cause is established, and it overturns the review's kill table.** Chrome's own corruption recovery, on a log with a bare record header in it. Not main-only. See RESULTS. Nothing in the runtime changes for it: the design already says only a key the server recognises prevents duplicates.
- **Oracle (g)'s exemption for `meta` removed.** `meta` is one scope, so it never needed one. The suite and searches pass without it.
- **The gate's allow list now holds how a case fails,** a thing the review worried about and D101 did not list.
- **The first M2 case did not reproduce M2:** written with the later `Note` hidden, which sets `due` to 0. A survivor showed it. Rewritten, then seen failing on round 7. Three other first-draft pins were vacuous the same way (fibers, lane id, firing) and were caught the same way.

```decisions-added
D96 D97 D98 D99 D100 D101 D102 D103 D104 D105 D106
```

## Second pass: after the mid-session review (round-8/review-mid.md)

Reviewer's verdict: D96 right, no High, the harness the weak part. Advice, weighed; proposed, written before this code. Several findings were already covered by work after the checkpoint (M2's case, M3's split and scratch run, two of M6's three) and are not repeated here.

**The doors, the refused ending and the spin are one problem: what happens to a value or a completion that the turn cannot use.** D100's list grew by reading, and each entry was a site. So D100's mechanics go.

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D107** | **A hold's route is the last one.** Restore delivers, per lane, `W`'s `NotSent { Restored }` first, then the head's `unknown`. `Go Go ack KILL` ended in `A` with a hold nobody was asked about, because `W`'s answer to a later press ran over the prompt. Why this and not hiding `W`'s endings: each still has an owner who pressed. Rule 44's "creation order" changes within a lane | Order within a lane is no longer mint order at restore | `durable.ts` |
| **D108, replaces D100's mechanics** | **One door.** Every Slot whose result becomes a key, an input or a module value is gated at seal by one check, `encodable`, as `gate.ts`'s header promised. It throws `Unencodable`. One reader, `entered`, turns that into "did not enter". The turn has one table, by member verb: commit declines `NotSent { Unencodable }` (not `StorageRefused`: the store was never asked), lookup ends `Defect`, module value and member key do nothing. A guard key denies. A `resetOn` value with no text is one constant, so no reset fires. One issue, one code. A new member verb cannot forget | One reason renamed: logged | `gate.ts`, `turn.ts`, `reads.ts`, `inc.ts` |
| **Two codecs stay, for a stated reason** | `Schema.toCodecJson` carries a value, and must give it back: memory. `canon` names a lane: it must be stable, and need not be reversible. They answer different questions. **An `input` is carried and goes through `canon`, and that is the gap** (a `Date` in an input resends as a string): input and key fields through their Schemas belongs with `keyFields` in the compile step, since hand-written `Compiled` has no Schema to use. Not done here, for the handoff | Assumption 5 stays half | |
| **D109** | **A turn can never lose a completion.** An ending whose turn refuses twice (D50) is kept: on its lane as a parked ending (D72's path, on disk), a `parked` wait says so, and it is delivered again at the next boot or adoption. A hold needs nothing: its lane already holds it. A read's ending has no lane and no disk, so it becomes a `stranded` wait, named, until the next ask. Not chosen: falling through to the next alternative (a throw is not a denial: it could take a branch the author meant only for a false guard), and a declared fallback (new API for a path no fixture wants yet) | A machine still sits in `W` until a reload. Visible, not fixed. A release that fixes the closure heals it | `turn.ts`, `publish.ts`, `world.ts` |
| **D110** | **At most `askMax` asks per actor and operation per `askWindowMs`, 256 a second, a guess.** A commit, lookup or retry past that does not start and does not end: `TurnStorm`, once, and a `stranded` wait. "Ask again on failure" is an ordinary handler and the network rate-limits it; a failure with no I/O does not. The bound sits at the ask, because an ending must never be what is dropped. Pure: `env.now` and a table in the world | A real burst past 256 a second is cut. Search-as-you-type is far under it | `turn.ts`, `world.ts` |
| **D111, revises D99** | **`meta` goes.** The stamp is the one mechanism for boots, the lanes' mints already are the one for mints, and `meta` cost its own transaction on every commit. Every fewer log write is a smaller H3 window. A boot with nothing on disk may repeat a number: its ids reached no record. A hold no longer rewrites per boot: `saved` compares bytes without the stamp | Frame numbers may repeat across a boot that landed nothing: evidence only | `durable.ts`, `world.ts`, adapter |
| **D112** | **Write-ahead is checked in every step of every case and search,** as part of `checkClaims`: a key the server may hold, on a persisted write, unreleased, is the head of a lane on disk. Oracle (h) goes into it. A wipe or a corrupted record exempts what it took | A parse per step while something is undecided | `drive.ts`, `ctx.ts` |
| **D113** | **Harness.** `--lock` refuses while anything is unlogged. The lock hashes searches, the gate's allow list and runner, and the round's CLI pins, typed checks and adapter. A mutant that does not parse or load is `INVALID`, not killed; a watchdog kill is counted apart. Search alphabets reach holds and a refused turn | | `main.ts`, `mutate.ts`, `flush.search.ts` |
