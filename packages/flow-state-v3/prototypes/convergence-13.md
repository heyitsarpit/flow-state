# Convergence 13: round 12's final review by root cause, the story prototype, and `flow graph` as conformance proof

Status: **everything here is proposed**, except where marked **Arpit's call** (given through the coordinator during the round). The other calls are the builder's or the coordinator's, under delegation, for Arpit to overrule. Decisions start at D221. Inputs: `HANDOFF.md` (plan cut, step 3b), `round-12/review.md` (the final review, advice), `round-13/review-mid.md` (the mid-session review, advice), `round-12/RESULTS.md`, `convergence-12.md`, `round-12/api-changes.md`, `round-7/cli-outputs.md`, and 2.10 of `machine-design.md` (out of date in places; recorded decisions supersede it).

## Findings, by root cause

| Root cause | What was assumed, and is false | Review findings |
| --- | --- | --- |
| **1. An op's identity was taken to be its name, so a key across releases was guessed at.** Three designs failed review in turn: D217 (by key shape), the first D221 (by a stamp, then projection onto shared fields, with D78's rename at restore), and that one's restore. | That an old key can be mapped onto a new one: by shape, by projection, or by renaming the lane | round 12 H1 (a decline with no release; a stranded hold), mid review H1 (a rename onto a taken id dropped a hold silently, in one mint order), M1 (an absent optional field "cannot place"), M4 (four unpinned paths), L1, L2 (a queued Attempt promoted beside a collided hold), L3, L5 (a key field with a default); assumptions 75-77 |
| **2. One contract stated twice drifts, unless one is made from the other.** | That the type side and the data side of the same contract agree by themselves | M1 (`KeyOf` required what `commit` lets be absent), M2 (creation read a present input by its type side and an absent one by its codec), M3 (a fragment's declarations existed in-process and not in `Compiled`), L5 (`compare-all` skipped names everywhere, not the places it meant) |
| **3. A refusal written is not a refusal pinned** (round 12's root cause 2, again) | That code that works by hand is covered | the 8 surviving mutants: D217's match, D218 below the root, `inputFields`, two services, the seal's `fields`, D124's union |

## Decisions, proposed

| Id | Decision | Why | Replaces |
| --- | --- | --- | --- |
| **D221** | **Key fields are required** (**Arpit's call**): rule 39's key has no optional field and no default, and an absent value is never a key value; the compile refuses one (`KeyFieldOptional`), and `KeyOf` is a plain required pick. **An op's key fields are part of its identity** (coordinator's addition, proposed): a release that changes `keyFields` (as a set) makes a new version of the op. Each lane is stamped at mint with the fields it was made under (`Lane.keyFields`, saved with it). A lane under other fields is an **old-version hold**: never renamed, never matched against a new key; said at each boot (`OldVersionLane`); reachable by its own old key through `retry(k)` and `cancel(k)` (an exact lane id), the rule 46 path. Until it ends, **every** commit of that actor's op declines (`NotSent { Rejected }`, evidence `BesideOldVersion`) and its transition runs, under every policy, `serialize` included; a keyed `idle` says no. A hold is never dropped and nothing sends beside it. Since a stamped lane never moves, two lanes cannot share an id: the mid review's collision cannot occur (R13-KEYS's removed-field cases, both mint orders). D78's rename is kept only for the suite's hand key closures (F2: no fields to stamp, a seam), in two passes, a move onto a taken id refused loudly (`LaneRekeyCollision`) with the mover keeping its name | Three designs of one mechanism failed review (policy-convergence). Every one tried to say whether an old server thing is a new one, which the Runtime cannot know. A standard upfront contract replaces the inference: a changed key is a changed op. The cost: after such a release, the op is unusable for that actor until its old holds end, and an app reaches them by old keys its typed handle cannot spell yet (owed). The table below is every case | D217's shape test; the first D221's projection (`olderKeyLane`) and its restore rename for stamped lanes; D78's rename for typed ops; M1's `Pick` with optional fields |
| **D222** | **A field has one default, which applies at creation and at restore alike** (coordinator's call, proposed for Arpit). It is whichever the field's Schema states, a constructor default or a decoding default; both with different values is refused at the compile (`TwoDefaults`). `Flow.initial`'s constant is its field's default at both doors, and its Schema may state none (`TwoDefaults`). A computed initial is made from the other fields at both doors. A present input at creation is still checked by its type side (D219). The four ported fixtures are back to one default each | Mid review M2: the first D222 split defaults by door, so a release-added input with only a constructor default quarantined every old actor, and one with only a decoding default refused every creation | the first D222 (constructor at creation, decoding at restore); D214's decoding-only restore default |
| **D223** | **`Compiled` carries what a fragment declares and every event's payload.** `CompiledFragment.kind`, `events: { external, host, internal, payloads }`, `ports: { exits, callbacks, guards }` (an `optional` field that nothing sets until `Flow.optional` exists); `Compiled.events.payloads` (event → field → Schema). `CompiledData`, the seal's closure walk, `flow check`'s `UnknownEvent` (fragment bodies) and `flow graph` read them | M3. `Story.fragment` builds its stand-in host from them; a Story's sends are checked against `payloads` | `CompiledFragment` with nodes and memory only |
| **D224** | **The Story API as built** (`round-13/api-changes.md`): a machine Story's subject is the suite's `Fixture` (the machine and its client half); sends come from `story.E`, made from `Compiled.events` and checked by payload Schemas; fakes are given as `options.fakes`; `Fake.call` names its transport route and answers `{ ok }` or `{ fail }`, and gets the idempotency key; `run()` is synchronous; `lane(op)` with no key reads the one non-idle lane among the keys the run could make; a request's phase may be `aborted`; a machine Story may `reload()` | Each is where the harness has no slot the design assumes (a fixture Layer, a lane listing, a microtask executor). Each is logged with before and after, for Arpit | |
| **D225** | **`flow trace <id>`** runs the Story once and prints its timeline: each step in its data form, then the runtime's evidence in that step (turns with the alternative and instance of each part, endings, mints, lane cells) and the wire's phase changes, checkpoints with `seq`. `--at <checkpoint>` stops there. Round 7's `explain --trace --at` stays the paper design's point form | Round 7 proposed `trace` for the timeline and `explain --trace --at` for a point. With no trace file format yet, a Story is the input that makes a run; the timeline is what reading a run needs first | round 7's `trace summarize <file>` (prior art) |
| **D226** | **`flow graph`: one edge per alternative**, named by its own place (`definition`, `at`), so an edge and an observation share one name. An edge says what decides it (`token:`, `idle:op(k)`, `retryable:`, `port:`, `closure:<path>`) and is marked `late`, `shadowed`, `unreached` or `unsourced` when the data says it can never be taken. Fillings (callbacks, exits), schedule triggers (the Runtime's `implicit`) and `whenAbandoned` callbacks are edges; a filling runs from the host's leaf under the placing node; a `whenAbandoned` callback runs in the turn that ends the life, and a resumable one's also from anywhere, when its frozen life ends. `unseen` lists what data cannot say: follow-up closures (`labFollowUps`), D209's module blocks, hand data's undeclared events | HANDOFF 3b: the graph is never smaller than behaviour, and never larger without saying so. The three filling rules are what the gate found (below) | |
| **D227** | **The graph gate** (`conformance/graph-gate.ts`): the suite, its searches included, with an observer on every boot (`drive.ts`'s `observeBoots`). Every `turn` the runtime writes must name, per part, an edge of the graph of what that boot was given, from its node (a filling: under it), to its target, and the moved incarnation must land under that target; a taken edge the graph calls `shadowed` or `unreached` is a disagreement; one it calls `unsourced` is listed as sent only by the suite. Fails on any disagreement and on no observation. Not in `mutate-one` (its control is 194 s of a 300 s budget); run on the final commit | The `turn` record gains each part's place and the moved incarnation's path, `from` and `to`: evidence for tools, read by nothing in the Runtime | |

## D221: before and after, and every case

```ts
// user-defined: charge, Go, region   existing: transaction, key, retry, cancel, idle
const charge = transaction({ id: "lab/charge", input: { k: S.String, region: S.String }, key: ["k", "region"], /* … */ })   // release 2 added `region`
// a hold of release 1, key { k: "a" }, unsure, restored under release 2
```

| Step | Before (D217, then the first D221) | After (D221) |
| --- | --- | --- |
| restore | try to rename the lane to the new key; if its input lacks a field, stamp it "older" | never rename a stamped lane; say `OldVersionLane` |
| `Go { k: a, region: eu }` | declines if its key agrees with the old one on shared fields | declines: an old-version hold of `charge` exists |
| `Go { k: b, region: eu }` | sends | **declines** too: the Runtime cannot say `b` is another server thing under a changed key |
| `retry({ k: a, region: eu })` | names the old lane by projection | names nothing (no lane has that key) |
| `retry({ k: a })` | names it | names it, by its own old key (needs `as never` in typed code today) |
| `idle({ k: z, region: eu })` | passes unless a lane agrees on `k` | no |

| Case | Rule | Pinned by |
| --- | --- | --- |
| No release; two keys | two lanes, nothing old | `R13-KEYS/with-no-release-two-keys-are-two-lanes` |
| A field added (required); one old hold | every commit of the op declines; `retry`/`cancel` by the old key; then commits send | `R13-KEYS/a-release-that-adds…`, `R12-KEYS` ×2 |
| A field renamed (`[k]` → `[id]`) | the same as added: a changed set | `R12-KEYS/a-typed-release-that-changes-the-key…` |
| A field removed; two old holds that would share the new key | both kept, both said, no collision, in either mint order; each cancelled by its own key; then commits send | `R13-KEYS/…removes…-eu-first`, `…-us-first` |
| Several old holds | every commit declines until the last ends | the removed-field cases |
| `serialize` | declines; queues nothing beside an old hold | `R13-KEYS/serialize-…` |
| A reload in between | the stamp is on disk; still old, said again | `R13-KEYS/a-reload-in-between-…` |
| A keyed `idle` | says no while an old hold exists | `R13-KEYS/a-keyed-idle-…` |
| Another actor | untouched | `R13-KEYS/another-actor-is-not-held` |
| Fields reordered only | the same set: the same version | `sameFields` (by set) |
| An optional or defaulted key field | refused at the compile (`KeyFieldOptional`) | `front-check` ×4 |
| A lane with no stamp (a hand key closure, F2) | no version; D78's rename in two passes; a collision is `LaneRekeyCollision`, loud, the mover keeps its name | the `KeyRelease` hand cases; the rename mutant below |

Mutants [ran]: no decline beside an old hold (7 cases red); stamped lanes renamed at restore (`R12-KEYS`, both removed-field cases red: the collision is now raised, loudly, and the case sees it); the guard blind to old holds (red). The mid review's four survivors (`rekey.no-restamp-moved`, `older.shared-old-fields`, `older.first-held-only`, `rekey.collision-unchecked`) name code that no longer exists: there is no restamp, no projection, and no rename of a stamped lane.

## D222: the doors

| Door | What is read | An absent field | A failure |
| --- | --- | --- | --- |
| Creation (`ensure`, `useActor`) | a present input, checked by its Schema's type side (D219): refinements kept, no transforming decode | its one default (constructor or decoding, or `Flow.initial`'s constant); absent if optional; else `InputMissing` | the creation is refused (`InputRefused`, `InputMissing`): no actor exists |
| Restore of an actor record | each stored field by its codec (`toCodecJson`) | the same one default; a computed initial run over the restored fields; absent if optional; an input with no default refuses the record (`RestoreMissingInput`) | quarantined (`RecordQuarantined`, D46); the old bytes are kept |
| The compile | | | `TwoDefaults`: two different defaults, or a default beside `Flow.initial` |

## D228: the lie gate, targeted

| Id | Decision | Why | Replaces |
| --- | --- | --- | --- |
| **D228** | **The lie gate runs targeted by default.** `falsify.ts --part lies` runs each lie only on the cases that went red by its named oracle in the last `--full` run, recorded one file per lie in `conformance/lie-cases/`; a lie with no record, or whose recorded cases no longer go red, runs the whole suite, so a stale record costs time and never passes a lie. `--full` (a round's final commit) runs every lie over the whole suite and rewrites the records. `--parallel N`, N at most 8 (Arpit's rule), runs N lies at once, each in its own copy | Arpit's parallel rule and the coordinator's brief. The record is of killing cases, not of a probe's firing cases (only the vacuous lies have probes) | the full run as the only mode |

Proof that targeted catches what the full run catches [ran, `run-costs.md`]: the full run (`--full`, 3cce106b's tree) found all 75 lies red and recorded their cases; targeted at 3cce106b ran all 75 on those cases, and all 75 went red, none falling back. Stated limit: this is the same verdict on fewer cases, not a search for new cases; a code change that moves a lie's kill elsewhere makes targeted fall back to the full suite for it (shown: `lie.released` with a record pointing at `PAY-01` fell back and went red).

## What the graph gate found

| Disagreement | Where the bug was | Fixed by |
| --- | --- | --- |
| 13 callback fillings "from another node" (`Form traits.osc.callbacks.onGone`, `Checkout/Pay traits.summary.callbacks.onPay`, ThreeDS's countdown, …) | **the graph**: it put a filling at the placing node; the runtime runs it from the host's leaf | D226: a filling's leaf must be under the placing node |
| `whenAbandoned` callbacks run in a turn whose leaf is outside the placing node (`Form traits.osc.callbacks.onGone` from `DONE`) | **the graph**: abandonment is in the leaving turn, or by a reset or a copy's removal | the turn's part says `fused`; the edge says `onAbandon` |
| `Desk/Panels`' history trait's `onGone` from `CUSTOMER` | **the graph**: a resumable trait's frozen life can end later, with the host elsewhere | `onAbandon: "frozen"` |
| `Checkout/Pay on.AbortPay[0]` taken 60 times, unsourced | **a fixture**: `typed/cells.ts` adds the handler to compiled Pay and did not declare the event (so `flow check` on it would say `UnknownEvent`) | `cells.ts` declares `AbortPay` |
| `Checkout/Pay on.CartLoaded[0]` taken once, unsourced | **the suite or Pay**: Pay declares `CartLoaded` internal and nothing maps or schedules it; only FRAG-09 sends it from outside | not fixed: Pay is the pinned reference. For Arpit: the real Pay's cart read is not in the pinned subset |

At the final commit (3cce106b): **0 disagreements**; 77,522 turns and 78,543 parts observed; 730 edges over 55 machines; 483 taken; 178 not taken but guarded; 62 not taken and unmarked (listed by `--list`: the suite does not drive them; nothing says they cannot be taken); 5 unreached and 3 unsourced, each a true static fact (one Deep variant cannot reach FIELD; Lab/Chat without pages has no `Page` source).

## The mid review's other findings

- **M3** fixed: `flow check` reads a fragment's operations' endings and its schedules' sends against the fragment's own declarations; `attach` and `panels` say nothing; a pin (`frag-typo`) shows an undeclared fragment ending is `UnknownEvent`. The `placedEvents` exemption (L4) is gone: no fixture needed it.
- **L1, L2, L3, L5**: part of the key rule. L1's two cases and L2's promotion cannot occur (no projection; no new lane beside an old one). L3: an unstamped lane has no version, stated above. L5: refused at the compile.
- **L4**: `Compiled.events.uncertain` (and a fragment's) lists the `Flow.uncertain` events as data; pinned in `front-check`. `Port.optional` stays unset (not built).
- Not addressed: the "+1 `unsure` per boot" behaviour (older than round 13).

## Requirements still open, for the next round

- `Typed<R>` carrying its events, so `story.E` and `Story.machine` are typed by the machine, and an internal event is a type error at the send.
- A lane listing in the harness's `Reads` (Inspection's), so `lane(op)` needs no candidate keys.
- Rule 61's finish phase and `HostTimeWait`, once a Story can park on host work.
- `Story.app`, tabs, `together`, `suspended`, `Fake.storage`, streams in Stories.
- The 62 unmarked untaken edges: a directed search per edge, or a mark the graph can prove.
