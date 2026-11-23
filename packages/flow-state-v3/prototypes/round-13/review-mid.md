# Round 13: mid-session review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 13. Checkpoint `ea087ca1`. Marks: **[ran]**, **[read]**, **[reasoning]**.

Setup: a detached worktree at `scratchpad/r13-mid`, `node_modules` linked to the main checkout's. Every command ran under `watch.ts` or `perl alarm`, one suite at a time. Probes live in the worktree only (`conformance/typed/zz-review.ts`, `conformance/scenarios/zz-review.scenario.ts`, behind `ZZ_PROBES=1` in `main.ts`). They go with the worktree; each is described in Q1's and Q3's tables, enough to rewrite it. The mutant runner stays at `scratchpad/r13m-run.ts`.

## Verdict

**D221 is the right shape, and it fixes all three of round 12's H1 harms.** The stamp is a real release boundary. No release, both orders send. The older hold has a way out. The guard and the commit see the same lane. I could not strand a hold [ran].

**The High is next to D221, not in it.** Restore can lose an unsure hold without a word when a release removes an optional key field. The rekey's "key unchanged" branch never checks for a collision. The code is D78's, but M1 makes it reachable from typed code. D221 restamps in that branch without checking. No case covers it.

- Q1: correct for releases that **add** fields. Wrong at restore for an added **optional** field (M1 below). The lookup is one rule, but it hides two cases (L1). Of my 10 mutants, 6 die. All 4 survivors change behaviour, and all 4 are missing pins (M4).
- Q2: `Pick` is consistent with rule 39 ("its Schema is `input`'s pick") and with D215. No two inputs collapse onto one lane, except `region: undefined` and absent, which store as the same JSON [read]. But restore's placeability test treats "absent" as "cannot place". That contradicts M1 (M1 below).
- Q3: D222 is consistent at creation. It is not consistent across doors:
  - a release that adds an input with only a constructor default quarantines every existing actor;
  - an input with only a decoding default refuses every creation.
  - So a field needs both defaults, and the four ported fixtures now state both (M2).
- Q4: enough for `Story.fragment` and `flow graph` to start. But `flow check` still reads fragment ops against the machine's declarations, and exits 1 on two real fixtures (M3). A Story reading data cannot tell which events are `Flow.uncertain` (L4).

## Reproduced

| Item | Claimed | I got |
| --- | --- | --- |
| Suite `--round 13 --no-search` | 761/761, lock clean | **761/761**, unlogged none, stale 0, 68.3 s, 927 MB [ran] |
| `checks/types-check.ts` | 16 directives | `TYPES PASS`, 16 [ran] |
| `checks/front-check.ts` | 58 pins | `FRONT PASS`, 58 pins, 71 machines, 6 corruptions [ran] |
| CLI pins | pass | all pass [ran] |

## The questions

### Q1. D221

| Probe (`ZZ-PROBES/…`) | What happened [ran] | Right? |
| --- | --- | --- |
| R13's own: no release, `{k:a}` and `{k:a,region:eu}`, both orders | 2 requests each order (suite) | yes |
| **R.** Rel 1 key `[k]`, hold `{k:a,region:eu}`. Rel 2 `[k,region]` required | `LaneRekeyed`, stamp `[k,region]`. `{k:a,region:us}` sends; `{k:a,region:eu}` busy (rule 16); a reload keeps it | yes |
| T. Rel 1 `[k]` → rel 2 `+region` → rel 3 `+tier`, all required | the older lane matches on `k`; a keyed retry resends it | yes |
| F. Key fields reordered only | restamped `["region","k"]`, nothing older | yes |
| W. The older hold, resent by `retry(k)`, on the wire; a commit agreeing with it | declines (`BesideOlderKey`) | yes |
| **A.** Rel 1 `[k]`, hold `{k:a}`. Rel 2 adds `region`, **optional** | stays stamped `["k"]` across every reload. `{k:a,region:eu}` declines, `idle({k:a,region:eu})` says no, and **`retry({k:a,region:"us"})` resends the region-absent hold** | **no** → M1 |
| **B2.** Rel 1 `[k,region]` optional: holds `{k:a,region:eu}` (minted first) and `{k:a}`. Rel 2 drops `region` | **one lane after the reload, no issue**. The harness's oracle (h): "may be at the server, and no head on disk says so: att-1-1". After the other hold settles, a commit on `{k:a}` sends | **no** → H1 |
| B1. The same, minted in the other order | `LaneRekeyCollision`; the eu lane stays under its old stamp, an older-key lane | yes (by design) |
| B4. Rel 1 `[k,region]` required, holds eu and us; rel 2 drops `region`; `serialize` | eu rekeys, us collides. A commit queued behind eu **sends when eu settles, beside the us hold** | edge → L2 |
| B5. As B4 on `reject` | the commit after eu settles declines beside us | yes |
| D. Rel 1 `[k]` → rel 2 `[j]`: no shared field | **any** `j` declines beside `{k:a}`; `retry({j:"anything"})` resends it | stated nowhere → L1 |
| M. Two older lanes `{k:a,tier:1}`, `{k:a,tier:2}` → `[k,region]` | `cancel({k:a,region:eu})` lets go of tier 1 (insertion order); a commit declines beside tier 2; a second cancel lets go of tier 2, then a commit sends | works, order-picked → L1 |

**Can an older-key hold be stranded?** No [ran: P2's case, A, D, M, T].
- A keyed `retry` or `cancel` names it.
- So does a key-less one in the ending handler, because the restored ending is delivered as `unknown Restored`.
- When several older lanes match, one member call frees one lane, and repeated calls free them all.
- Holds are not stranded. They are **lost**, by H1.

**Two Attempts beside one hold?**
- No release: no (suite).
- After a release that adds a field: no [ran R, T, W].
- After a release that removes one: **yes**, in two ways:
  - by H1's silent loss;
  - by B4's queue promotion (L2).

**Is `olderKeyLane` one rule?** It is one lookup for the commit, the members and the guard. That part holds: the guard and the commit agreed in every probe. Dropping the stamp test is equivalent, as STATUS says [reasoning]. The lookup hides three things:
1. "No shared field" matches every older lane (D);
2. "several lanes" means the first in insertion order (M);
3. the lookup's partner at restore, `placeable`, treats an absent optional field as no value (A).

### Q2. M1, `KeyOf = Pick<TypeOf<I>, K>`

- **Consistent with rule 39** ("its Schema is `input`'s pick") and with D215 [read]:
  - the seal makes the key as `{ f: input[f] }`;
  - `canon` drops `undefined` (`gate.ts:52`);
  - so an absent field and a typed key without it name one lane.
- **Collapse:** `{region: undefined}` (under `S.optional`) and an absent `region` name one lane. Both store as the same JSON, so this is not a loss. Nothing else collapses: Dates go through `toJSON`; NaN and bigint are spelled apart [read].
- **Not consistent with D221's restore.**
  - `durable.ts:393` calls a lane placeable only if `input[f] !== undefined` for every current field.
  - Under M1, absent *is* a value. So `{k:a}` under `[k,region]` (optional) is already at its right id.
  - It stays stamped `["k"]`, and M1 below follows.
- Rule 39 also says a key has "no default". `compileOp` does not refuse a key field with a default (L5) [read].

### Q3. M2, D222

- Creation through `Struct.make` is the type side throughout. This matches D219's reason [read]. `R13-CREATE` pins both of its rows [ran].
- **Across the doors, a field's default now depends on which door it comes through** [ran, probe E, one release adding `n` as `Flow.input`]:

  | `n`'s Schema | An old actor at restore | A new actor at creation |
  | --- | --- | --- |
  | constructor default 7 only | **`RecordQuarantined`** ("memory this release cannot decode") | `n: 7` |
  | decoding default 4 only | `n: 4` | **refused** (`InputMissing`) |
  | both | `n: 4` | `n: 7` |

- **Against D214's restore row:**
  - a release-added `Flow.initial` restores from its constant, which 2.2.2 defines as a constructor default;
  - a release-added `Flow.input` with a constructor default refuses the record instead.
  - So the restore row treats one modifier two ways.
- **Against the doors' failed-decode table:**
  - The creation row still says "What decodes: the input" (`convergence-12.md:48`). Round 12's review asked for this to be fixed.
  - The restore row's quarantine is now reached by a field that creation accepts.
- The four ported fixtures (`feed`, `lab-machines`, `round7`, `round8`) now state each default twice. That is the cost, written out.

### Q4. M3, the new `CompiledFragment` fields

- **Enough for a start** [read]:
  - `kind`;
  - events by direction, each with its payload fields;
  - exits and callbacks with their fields;
  - guard ports by name (a guard port carries no data in the design, so `{}` is complete).
- `front-check` pins each of them [ran].
- **Still read from the wrong place:** `flow check`'s machine-level loop (`cli/check.ts:291, 301-303`).
  - It takes `mapped` from **every** op in `c.ops`, fragment ops included, and checks it against the machine's `events` only.
  - Result [ran]: `flow check attach` gives 7 errors and `flow check panels` gives 5, all `UnknownEvent` for fragment-internal events (`Stored`, `TooBig`, …), exit 1.
  - Round 12 does the same. M3's new fragment loop covers handlers only, not mapped or scheduled events → M3 below.
- `placedEvents` (`check.ts:314`) exempts any fragment handler named like a placement. It is unpinned and has no comment (L4).
- **`Compiled.events.payloads` loses `Flow.uncertain`.**
  - `payloadsOf` copies each record (`events.ts:23`), and the mark is a `WeakSet` by identity.
  - So a Story or `flow graph` reading the data cannot tell which events an `unknown:` may target (L4).

## High

### H1. Restore drops an unsure hold, silently, when a release removes an optional key field and the lanes were minted in one order. **older (D78), made reachable by M1; D221 restamps in the same branch** [ran]

```ts
// zz-review B2b. user-defined: Go, region   existing: transaction key, release, reload
// rel 1: key ["k", "region"], region optional.  Hold A = { k: a, region: eu } (minted first), hold B = { k: a } (region absent). Both unsure.
// rel 2: key ["k"].  reload:
//   A: placeable, fresh { k: a } != its key  -> LaneRekeyed to id {k:a}          (durable.ts:406 checks so_far: free)
//   B: placeable, fresh { k: a } == its key  -> `return restamp(v)`              (durable.ts:404: NO collision check)
//   -> two lanes with one id; setLane keeps B. No issue. Oracle (h): "may be at the server, and no head on disk says so: att-1-1"
// then retry({k:a}) resolves B, and Go { k: a } SENDS while A may be at the server.
```

- **Where:** `durable.ts:404`. The "same key text" branch returns before `so_far` is consulted. `so_far` is only ever checked for a lane that moves, against lanes already placed.
- **Order:** minted B first, then A (B1) gives `LaneRekeyCollision`, and A stays as an older-key lane. That is right. Only one order loses the hold.
- **Why now:** M1 makes optional key fields first-class. Removing one is a release that merges server things. The same branch is reached whenever a moved lane takes the id of a lane that does not move.
- **Pins:** no suite case reaches `LaneRekeyCollision`. Mutant `rekey.collision-unchecked` survives all 761 cases.
- **Proposed:** place lanes in two passes. First, the ids of lanes whose key text does not change. Then move the others, refusing (`LaneRekeyCollision`, keep the old id and stamp) any move onto a taken id. Pin both mint orders, and the serialize queue of L2.

## Medium

### M1. Restore's placeability test treats an absent optional key field as "cannot place", which contradicts M1. A release that adds an optional key field turns every held lane without it into a permanent older-key lane. **r13 (D221)** [ran A]

- `durable.ts:393`: `input[f] !== undefined`. Under rule 39 and M1, `{k:a}` under `[k, region?]` is a key, and the lane is already at its id.
- Harm, until the hold settles:
  - every commit `{k:a, region:*}` declines;
  - `idle` says no;
  - **a typed `retry({k:a, region:"us"})` resends the region-absent hold.** This is a member naming another key value's lane. The comment at `durable.ts:392` states the rule ("not placeable either") as intended.
- **Proposed:** call a lane placeable when the key closure runs on its stored input and every **required** current key field is present. That needs the op's field optionality as data, which `inputFields` could carry. Or restamp whenever `fresh`'s text equals the key's. Pin probe A.

### M2. D222 makes one field's default depend on the door: a release-added input with only a constructor default quarantines every old actor. **r13 (D222)** [ran E]

- See Q3's table.
- **Options:**
  - (a) restore takes the constructor default when the field has no decoding default, as it already does for `Flow.initial`'s constant;
  - (b) the compile refuses a `Flow.input` that has only one of the two defaults.
- I lean to (a): one value per field at both doors, and the ported fixtures drop their second default. **Arpit's call** with D219 and D222.
- Fix the doors table's creation row either way.

### M3. `flow check` exits 1 on two real typed fixtures: fragment ops' mapped events are checked against the machine's declarations. **r12-compile, left by M3** [ran]

- `cli/check.ts:291`: `mapped` is taken over all of `c.ops`, and `:301` checks it against `c.events` and the machine's handlers.
- `attach` gives 7 `UnknownEvent` errors and `panels` gives 5. All of them are declared `internalEvents` of a fragment (`real.ts:154`).
- The fragment loop (`:308-319`) checks handlers only.
- **Proposed:** check each fragment op's mapped events, and each fragment schedule's `send`, against that fragment's `events`; exclude them from the machine's loop. Add a CLI pin over `attach` and `panels` (no findings), and one with a fragment typo. `flow graph`'s gate will rely on this split.

### M4. Four of D221's paths are unpinned; each survivor is a real behaviour change. **r13** [ran]

| Survivor | Seen only by the probe |
| --- | --- |
| `rekey.no-restamp-moved` (a moved lane keeps its old stamp) | R: `{k:a,region:us}` **declines** beside the rekeyed eu hold |
| `older.shared-old-fields` (match on the old key's fields) | B5: the commit **sends** beside the collided us hold |
| `older.first-held-only` (only a Held lane is older) | W: a commit **sends** beside the older hold on the wire (2 keys, 3 requests) |
| `rekey.collision-unchecked` | B1, B3, B4: holds dropped (oracle h) |

Add R, B1/B2 (both orders), B5 and W as cases.

## Low

- **L1. `olderKeyLane`'s two unstated cases** (`lane.ts:549-560`) [ran D, M]:
  - with no shared field, every older lane matches every key;
  - with several older lanes, the first in insertion order is named, so `cancel(k)` lets go of one chosen by the store's order.

  Both are defensible ("the Runtime cannot tell"). Say so in D221 and pin D.
- **L2. A queued Attempt promotes beside an older-key hold** (B4, `serialize`). Promotion does not ask `olderKeyLane`. It is reached only after a `LaneRekeyCollision`, which is already an issue [ran].
- **L3. A lane with no stamp is never older:** records saved before D221, and hand key closures (F2). There are no deployed records yet. Note it for the production migration [read].
- **L4. M3's data, small gaps:**
  - `Flow.uncertain` is lost in `payloads` (`events.ts:23`);
  - `placedEvents`' exemption is unpinned (`check.ts:314`);
  - no pin runs the new fragment `UnknownEvent` loop;
  - `Port.optional` is never set (logged as not built).
- **L5. Rule 39's "no default" on a key field is not refused** by `compileOp` [read].

## Mutants

Applied in place, matched exactly once, restored after each. Each ran the suite as `mutate-one` does (`--round 99 --no-catalog`). The control: 761/761, no FAIL. The exit code was 1 only because the lock names my probe files.

| Mutant | File | Result [ran] |
| --- | --- | --- |
| `stamp.mint-none` (no stamp at mint) | `lane.ts` | **killed**: R12-KEYS, R13-STAMP-RELEASE retry and idle, + 3 by output |
| `stamp.save-drop` (stamp not saved) | `durable.ts` | **killed**: the same 3, + 2 by output |
| `rekey.placeable-ignored` | `durable.ts` | **killed**: the same 3, + 2 by output |
| `older.shared-current-fields` | `lane.ts` | **killed**: the same 3, + 2 by output |
| `turn.cancel-no-older` (cancel without the lookup) | `turn.ts` | **killed**: R13 cancel, minted-after |
| `turn.guard-no-older` | `turn.ts` | **killed**: R13 idle |
| `rekey.no-restamp-moved` | `durable.ts` | survives (M4) |
| `older.shared-old-fields` | `lane.ts` | survives (M4) |
| `older.first-held-only` | `lane.ts` | survives (M4) |
| `rekey.collision-unchecked` | `durable.ts` | survives (H1, M4) |

**6/10.** The survivors were not run against `--swap`, the 5 s gate or the checks; none of them touches the compile.

## Not checked

- `nub run verify`, the formatter, the linter: I changed no repo code.
- `--swap`, the 5 s gate, falsify, searches, real browsers.
- The uncommitted work in the main checkout (`story/`, `graph.ts`).
- The "+1 `unsure` per boot" behaviour that round 12's review noted is still there (every probe's memory shows it). Not round 13's.

## Traces

All from `packages/flow-state-v3/prototypes` in the worktree.

- **Suite:** `bun conformance/watch.ts --rss-mb 1900 --seconds 280 -- bun conformance/main.ts --round 13 --runtime ../round-13/adapter.ts --no-search`.
- **Probes:** `ZZ_PROBES=1 bun conformance/main.ts --round 13 --runtime ../round-13/adapter.ts --no-search --no-catalog --no-output --only ZZ-PROBES`.
- **Mutants:** `scratchpad/r13m-run.ts <id>` (the suite), or `<id> probe` (the probes under the mutant).
- **Checks:** `bun round-13/checks/{types,front}-check.ts`, `bun round-13/cli/main.ts`, `bun round-13/cli/flow.ts check attach|panels`.
- No commits. No writes to the main checkout. The worktree is removed by exact path.
