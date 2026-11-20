---
proposal fixture-catalog-review
status merged 2026-11-17 [@convention.fixture-catalog]
    accepted user 2026-11-17
    proposed 2026-11-17
supersedes @proposal.fixture-catalogue
---
# Fixture catalog review: coverage first, fewer and richer apps

**Bottom line (proposed):** backport the late features into the apps that would really use them and merge
overlapping fixtures, going from 23 named fixtures to 14 (28 to 19 with the five UI primitives). After that, every
public feature has at least three homes in unrelated apps. Today 25 of the 51 features in the matrix below have
fewer than three homes, and none of `optimistic`, `setData`/`invalidate`, `idempotency`, storage failures, React,
server rendering or inspection has any. Swap per-row prose for one shared vocabulary of shapes, loads and edges, and
fix nine places where the draft disagrees with the code. Port behaviour and tests from client apps and integration
SDKs, not state libraries: kamp.us (`codebases/phoenix`) and `codebases/ui-sdk` locally, and the Vercel AI SDK,
tus-js-client, Shopify Hydrogen's cart, Supabase auth and realtime, the Phoenix JS client and tldraw sync on the
web. Nothing here is decided: every change is proposed, and the user accepts each one.

**Why now:** the draft catalog (@convention.fixture-catalog, uncommitted) gives each late feature
(traits, subroutines, `.each`, context, props and emits, lazy entries, `resource`, `transaction`, streams, entity
domains) one or two planned fixtures. Most of the older fixtures stay simple machines.

**Read first:** @convention.fixtures; @convention.fixture-catalog; prior art
@proposal.fixture-catalogue (26 shapes) and @proposal.ui-primitives (how ui-sdk was mined).

**Risk:**
- The session fixture and several Stories are untracked and still being built, so "used today" is a snapshot of
  2026-11-17.
- Public test names were read through a web summariser. Each name marked *verified* below I fetched and matched
  myself; spot-check the rest before porting.
- Some cases depend on Plan rules the blind review found unclear (section 7). Those cases can't be written red
  until the user decides them.

## 1. Coverage matrix

Columns are the 14 fixtures after the merges in section 2. Merged fixtures keep their planned features in the
column that absorbs them.

`pa` pay (+cells, +cart) · `sy` sync (+lanes) · `tr` transfers · `si` sign-in · `se` session (+settings-panel) ·
`cp` command-palette · `ni` number-input · `pl` player · `wz` wizard · `sr` search (+pager) ·
`ho` home (dashboard + thermostat + ticker) · `kb` kanban (+checklist) · `ch` chat · `dr` draft (+delivery)

`U` used today · `P` planned in the draft catalog · `B` proposed backport · `.` none

| Feature (API name)                                        | pa  | sy  | tr  | si  | se  | cp  | ni  | pl  | wz  | sr  | ho  | kb  | ch  | dr  |
| --------------------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| compound `states`                                         | B   | .   | .   | B   | .   | .   | U   | U   | P   | .   | B   | .   | B   | .   |
| `S.X.history`, `history.child`, `S.previous.history`      | B   | .   | .   | .   | .   | .   | .   | U   | P   | .   | .   | .   | .   | B   |
| `Flow.input` value-named actors                           | P   | B   | U   | .   | U   | .   | .   | U   | .   | .   | .   | B   | B   | B   |
| `Flow.initial` computed                                   | .   | .   | .   | B   | .   | .   | U   | .   | P   | .   | B   | .   | .   | .   |
| `Flow.private`                                            | .   | B   | .   | B   | B   | .   | .   | U   | .   | .   | .   | .   | .   | .   |
| guards, `deny`, `check`                                   | P   | U   | .   | U   | .   | U   | U   | .   | P   | P   | .   | .   | .   | .   |
| `trait`, `whenAbandoned`                                  | B   | .   | .   | .   | .   | .   | .   | .   | P   | .   | P   | P   | B   | P   |
| `subroutine` with exits                                   | B   | .   | B   | B   | .   | .   | .   | .   | P   | .   | .   | .   | .   | .   |
| `.each({ of, max, by })`                                  | P   | .   | .   | .   | .   | .   | .   | .   | .   | .   | P   | P   | B   | P   |
| `.resumable()`                                            | .   | .   | .   | .   | .   | .   | .   | .   | .   | .   | B   | P   | .   | B   |
| raise into copies                                         | B   | .   | .   | .   | .   | .   | .   | .   | P   | .   | B   | P   | .   | .   |
| `schedules` with `armOn`                                  | U   | U   | U   | U   | .   | .   | U   | U   | P   | .   | P   | .   | B   | B   |
| `keys`, `paused`, `pausedBy`, `restartOn`, `disarmOn`     | .   | B   | .   | .   | .   | .   | .   | B   | .   | P   | P   | .   | B   | .   |
| an Effect `Schedule` as `schedule`                        | .   | B   | .   | .   | .   | .   | .   | .   | .   | .   | P   | .   | B   | B   |
| `props`, `onProps`                                        | .   | .   | .   | .   | .   | B   | P   | .   | .   | P   | .   | .   | .   | .   |
| `emits`, `useOnEmit`                                      | .   | .   | .   | B   | .   | P   | P   | .   | .   | B   | .   | P   | .   | .   |
| `context`, `onContext`, `Provider.select`                 | P   | .   | P   | .   | U   | .   | .   | .   | .   | .   | P   | B   | P   | B   |
| refused context shapes (`ContextCycle`, missing provider) | .   | .   | .   | .   | U   | .   | .   | .   | .   | .   | B   | .   | .   | .   |
| local actors: `createActor`, `useActor`, `disposeActor`   | .   | .   | .   | .   | .   | B   | B   | .   | .   | P   | .   | B   | .   | .   |
| `send(ref, event)`                                        | P   | .   | B   | .   | .   | .   | .   | .   | .   | .   | .   | B   | .   | .   |
| `forget`, `unsettledWrites`                               | .   | .   | U   | B   | .   | .   | .   | .   | .   | .   | .   | .   | .   | P   |
| `resource`, `O.x.lookup`                                  | U   | U   | B   | .   | B   | .   | .   | .   | P   | P   | P   | P   | B   | .   |
| `O.x.subscribe`, `staleTime`, `gcTime`, `O.x.refetch`     | .   | .   | B   | .   | B   | .   | .   | .   | .   | P   | P   | B   | B   | .   |
| resource `subscribe.each`                                 | .   | .   | .   | .   | .   | .   | .   | .   | .   | P   | B   | B   | .   | .   |
| `placeholder({ previous, input })`                        | .   | .   | B   | .   | .   | .   | .   | .   | .   | P   | .   | B   | .   | .   |
| `O.x.setData`, `O.x.invalidate`, `O.x.clear`              | B   | .   | B   | .   | B   | .   | .   | .   | .   | .   | .   | .   | .   | .   |
| `transaction` `concurrency: "reject"`                     | U   | .   | .   | B   | .   | .   | .   | .   | .   | .   | .   | .   | .   | .   |
| `concurrency` latest, cancel, serialize                   | B   | U   | B   | .   | .   | .   | .   | .   | .   | .   | .   | B   | B   | B   |
| endings, `Flow.uncertain`, `unknown`                      | U   | U   | U   | U   | .   | U   | .   | U   | .   | .   | .   | B   | B   | B   |
| `O.x.retry`, `retryable`, `O.x.cancel`                    | U   | U   | U   | U   | .   | .   | .   | .   | .   | .   | .   | .   | B   | B   |
| optimistic values on a read (`optimistic`)                | .   | .   | B   | .   | B   | .   | .   | .   | .   | .   | .   | .   | B   | .   |
| `progress`, `previous` holds, `O.x.previous`, `cancelAll` | .   | .   | .   | .   | .   | .   | .   | .   | .   | .   | .   | .   | B   | P   |
| `idempotency`, `guarded`                                  | B   | .   | B   | .   | .   | .   | .   | .   | .   | .   | .   | B   | .   | .   |
| owed endings, quarantine                                  | U   | .   | U   | .   | .   | .   | .   | .   | .   | .   | .   | .   | B   | B   |
| `stream` `delivers: "every"`, `position`, `catchUp`       | .   | .   | B   | .   | .   | .   | .   | .   | .   | .   | .   | B   | P   | B   |
| `delivers: "latest"`, `Feed.callback`, `dropAt`           | .   | B   | .   | .   | .   | .   | .   | B   | .   | .   | P   | .   | B   | .   |
| `reconnect`, `idleTime`, `Feed.down`/`ping`/`done`/`gone` | .   | .   | .   | .   | .   | .   | .   | .   | .   | .   | P   | .   | P   | B   |
| `Feed.multiplex`, stream `subscribe.each`                 | .   | .   | .   | .   | .   | .   | .   | .   | .   | .   | P   | B   | P   | .   |
| `entity`, `domain`, `read(...).list`/`.one`/`.byKey`      | P   | .   | B   | .   | .   | .   | .   | .   | .   | .   | .   | P   | B   | .   |
| `predicts`, repair, `basedOn`                             | P   | .   | .   | .   | .   | .   | .   | .   | .   | .   | .   | P   | B   | .   |
| `.gone` tombstones                                        | B   | .   | .   | .   | .   | .   | .   | .   | .   | .   | .   | P   | B   | .   |
| `pagedBy`, `more`                                         | .   | .   | B   | .   | .   | .   | .   | .   | .   | B   | .   | P   | B   | .   |
| `persist`, restore, reload                                | U   | U   | U   | B   | U   | U   | .   | .   | P   | .   | P   | B   | B   | P   |
| release versions, saved-shape reset, migration            | .   | P   | B   | P   | .   | .   | .   | .   | P   | .   | .   | B   | .   | P   |
| multi-tab ownership (Web Lock, second tab)                | B   | .   | .   | .   | B   | .   | .   | .   | .   | .   | .   | .   | .   | P   |
| storage failures (quota, corrupt, slow read)              | B   | .   | .   | .   | B   | .   | .   | .   | .   | .   | .   | .   | .   | B   |
| Runtime per scope, `dispose`                              | P   | .   | .   | .   | B   | .   | .   | .   | .   | .   | .   | .   | .   | P   |
| lazy entries `{ id, load }`, adoption, dormant records    | .   | .   | .   | .   | P   | .   | .   | .   | P   | .   | .   | B   | .   | .   |
| React hooks, Strict Mode, grace                           | .   | .   | .   | B   | .   | B   | B   | .   | .   | B   | .   | B   | .   | .   |
| server rendering, hydration                               | B   | .   | .   | .   | .   | .   | .   | .   | .   | B   | .   | B   | .   | .   |
| `inspect`, `trace.export`/`trace.import`, sinks           | B   | B   | B   | .   | .   | .   | .   | .   | .   | .   | .   | .   | B   | .   |

The `long` run of every fixture also exports and imports its trace. The last row marks only where a sink or a
redacted field is part of the app.

### Weak cells (fewer than three homes before backports, or one app shape)

Counted from `U` and `P` only, before any backport:

- **One home or none:** `subroutine` (wz), `.resumable()` (kb), local actors (sr), `send(ref)` (pa), resource
  `subscribe.each` (sr), `placeholder` (sr), `setData`/`invalidate`/`clear` (none), optimistic values (none),
  `progress`/`previous` (dr), `idempotency`/`guarded` (none), `delivers: "every"` (ch), `.gone` (kb), `pagedBy`
  (kb), multi-tab (dr), storage failures (none), React (none), server rendering (none), inspection (none), refused
  context shapes (se, only as a hand test).
- **Two homes:** `history` (pl, wz), `props` (ni, sr), `predicts` (pa, kb), entity reads (pa, kb), Runtime per
  scope (pa, dr), lazy entries (se, wz).
- **One shape only:** `trait` has no existing fixture. Context has one tree shape (an org chain). Streams have one
  app (chat) for `every`. Every `transaction` policy except `reject` lives in one git client.

After the backports, every row has at least three homes in apps with different shapes. The exceptions are
`progress` (2) and multi-tab (3, all document-like); those two get a decision in section 7.

## 2. The split and the fixture count

### Count

|                        | Existing | Planned | UI primitives (T72, T73) | Total |
| ---------------------- | -------- | ------- | ------------------------ | ----- |
| Before (draft catalog) | 10       | 13      | 5                        | 28    |
| After (proposed)       | 8        | 6       | 5                        | 19    |

### Merges (each proposed, accept one by one)

- M1 · merge: `cells` · into: `pay` · why it's one real app: `cells` is Pay's body as a client cell with an abort: the
  "second checkout shape" the pay row wants.
- M2 · merge: `cart` · into: `pay` · why it's one real app: A storefront's cart and its checkout are one app. The
  header, page and popover share the cart and then pay it.
- M3 · merge: `lanes` · into: `sync` · why it's one real app: Both model a git sync client. The three lane policies
  become three remotes of one client.
- M4 · merge: `dashboard`, `thermostat`, `ticker` · into: new `home` · why it's one real app: A smart-home app: polled
  panels, per-room schedules, live readings as a `latest` stream.
- M5 · merge: `checklist` · into: `kanban` · why it's one real app: A board is columns → cards → checklist items: the
  three-deep `.each` the checklist row asks for.
- M6 · merge: `pager` · into: `search` · why it's one real app: A results list owns a local pager actor with props, the
  shape the pager row describes.
- M7 · merge: `settings-panel` · into: `session` · why it's one real app: A workspace shell lazily loads its billing
  settings: lazy entries under a real context tree.
- M8 · merge: `delivery` · into: `draft`, plus release Stories in `sign-in`, `sync`, `transfers`, `kanban` · why it's
  one real app: Releases aren't an app; every persisted app ships a second release.

No new fixture is needed. Uploads, the AI assistant reply and presence all fit `chat` and `draft`. Server rendering
fits `search`, `kanban` and the product page in `pay`.

If M2 is accepted, rename `pay` to `shop` (proposed, a small rename). The fixture would model a storefront rather
than only its payment step.

### Per fixture, after backports

Each backport is the feature a real app of that kind uses, with that app's reason.

- **pay (shop):** cart domain with predictions and `.gone` for a delisted product; line items via `.each` with a
  raised "clear cart"; the address form as a `trait` whose lookups end on abandonment; 3-D Secure as a
  `subroutine`; Back through checkout steps by `history`; cart quantity `latest` per line key; `idempotency` on
  the charge; `invalidate` of the orders read after an order is placed; two checkout tabs; a product page that is
  server rendered.
- **sync (+lanes):** remotes as value-named actors; backoff as an Effect `Schedule`; `pausedBy` while rate limited
  with a `Flow.private` token; remote-head pushes as a `latest` stream; a second release.
- **transfers:** step-up confirmation as a `subroutine` before a large transfer; the balance as a `resource` with
  `invalidate` after a transfer and an `optimistic` pending balance; transfers as entity records with list, detail
  and `pagedBy` statement pages; a notifications `stream` that catches up; `serialize` per account;
  `idempotency` by transfer id; a transfer between two accounts' actors via `send(ref)`; account context under the
  signed-in user.
- **sign-in:** the code step as a `subroutine`; cooldown by `Flow.initial` from input; the typed code as
  `Flow.private`; verify with `concurrency: "reject"`; a `SignedIn` emit; persisted restore; a password flow in a
  second release; `forget` on sign-out; React Strict Mode.
- **session (+settings-panel):** the four-layer workspace tree it has today, deepened (section 4); the lazily
  loaded billing panel; the profile read with `subscribe`; team rename `optimistic`; sign-out `clear`; a new
  Runtime per account; sign-out from another tab; a corrupt saved record.
- **command-palette:** commands passed as `props` instead of the `Configure` event; a `CommandRan` emit; the palette
  as a local actor.
- **number-input:** `props` and emits (T78); a form of inputs as local actors; React Strict Mode.
- **player:** `pausedBy` (user pause against buffering); the speaker's state as a `Feed.callback` `latest` stream.
- **wizard:** as planned (subroutines, history, traits, lazy explainer).
- **search (+pager):** reads, `placeholder`, `subscribe.each`, the local pager with props and emits, result
  paging, a hydrated first render.
- **home:** room panels via `.each` under house → zone → room context; keyed schedules with `pausedBy`
  (vacation); polled reads with focus refetch; live readings as a `latest` stream (`Feed.multiplex`); offscreen
  panels `.resumable()`; refused context shapes.
- **kanban (+checklist):** columns → cards → items via `.each`; card domain with predictions, `guarded` moves and
  `latest` per card; a board listen `stream` with catch-up; a lazily loaded card detail; React; a hydrated board;
  a second release.
- **chat:** threads as value-named actors and an `.each` list; messages as entity records with send `serialize` per
  thread, an optimistic echo reconciled by id, tombstones and history `pagedBy`; the message stream (`every`,
  catch-up, reconnect with an Effect `Schedule`); presence and typing as `latest` with keyed expiry; attachments
  with `progress`; an assistant reply as a resumable stream; owed sends after reload; a composer `trait`.
- **draft (+delivery):** autosave `latest` with keyed debounce; attachment upload with `progress`, `previous`
  and resume; sections via `.each`, collapsed ones `.resumable()`; collaborator ops as an `every` stream; storage
  quota; multi-tab; releases and migration.

## 3. Improvements to the catalog

Each item is proposed, with its reason.

### Simplify

1. **One shared vocabulary instead of per-row prose.** Define the shapes, loads and edges once in fixtures.md, and
   let each row cite their codes with parameters (`S1×{3,8,32}`). This removes the repeated prose and the "does
   not apply" sentences: a shape that doesn't fit is `n/a` in a grid.
   - Structure: `S1` deep chain · `S2` wide fan-out · `S3` forest · `S4` dual role (consumer and provider) ·
     `S5` middle-layer override · `S6` parent ended, disposed, forgotten or reloaded under live children (each
     order) · `S7` refused shape (cycle, missing provider, conflicting ref, duplicate key) · `S8` churn (children
     added and removed while live) · `S9` reload at the deepest node.
   - Load: `L1` many actors · `L2` a queue at its cap (64 follow-ups, 64 queued commits, 1,024 mailbox) ·
     `L3` slow, lost and out-of-order answers · `L4` repeated reloads · `L5` bursts faster than turns.
   - Edges: `E1` empty · `E2` `undefined` or `None` · `E3` byte bound, at and past · `E4` count cap, at and past
     · `E5` delays −1, 0, 2^31−1, 2^31 · `E6` bigint and 2^53 · `E7` decode failure · `E8` reload mid-call.
2. **Split every mixed "(have); add …" bullet** into a `have` and a `missing` bullet so each one can be checked.
   Nine rows mix them: cells, command-palette, lanes, number-input, pay, player, session, sign-in and sync.
3. **Replace "Has:" with a pointer to the fixture's `stories` registry.** The lists already drift: lanes omits
   `displacedPastItems` and `displacedOnWire`, session omits `fanOut`, `parentUnderChildren` and `long`, and
   `longList` and `pastBound` are event values, not Stories.
4. **Add a registration grid** (fixture × the six runners) generated or checked by @task.V3.T80, instead of
   prose claims about the mix and pair sweeps.
5. **Add a "Sources" line to every row**, naming the real app or SDK whose behaviour and tests it ports
   (section 5).

### Correct (verified against the code)

6. **session:** the row says "One layer only". The fixture has four definitions, Org → Session → Team → Badge
   (`packages/flow-state-v3/fixtures/session/machine.ts`), two roots, a middle-layer override (`guestTeam`), a
   24-wide `fanOut` and `parentUnderChildren` Stories. Still missing: 8 and 32 layers, 64 and 1,024 wide, a cycle,
   a signed-out root, and a missing provider as a Story rather than a hand test.
7. **command-palette:** "(missing) pair sweep" is wrong. `tests/generated/pairs-persisted.test.ts` sweeps it.
8. **sign-in:** "(missing) pair sweep" is wrong. `tests/generated/pairs-local.test.ts` sweeps it.
9. **lanes:** "(missing) key at the byte bound" is wrong: `atStringBound` (262,144 bytes) is sent in
   `seededStress`. "(missing) in the app mix" is wrong: `mix = [transfers, pay, lanes, palette, session]`.
10. **session:** "(missing) in the app mix" is wrong (same line).
11. **Registration gaps the row doesn't record:** `player` is missing from the reload sweep
    (`tests/rules/sweep.ts` `fixtureStories`). `cells`, `sign-in` and `sync` call servers but aren't in `mix`.
    `command-palette`, `number-input` and `player` have no bench `long`. `transfers` `manyReceipts` is in no
    runner.
12. **Owners differ from the Task text:** T17, T20 and T57 name sync ("the rest is unowned" is wrong); T17 and T77
    name sign-in; T20 doesn't name lanes; T76 doesn't name number-input; T9 doesn't name pay or transfers.
    Re-derive each Owner line from `wk show`.

### Clarify

13. **Define the terms that no Plan defines** in fixtures.md: forest, pair sweep, app mix, held store, samples,
    seededStress, NaN-like text. Or replace them with the vocabulary codes.
14. **"Covers"** should list API names as they appear in `machine.ts` or `contracts.ts`, with the file. Today
    `transaction`, `quarantine`, `forget` and `deadline` (transfers) appear only in contracts or Stories.
15. **The "undecodable record"** for pay is a newer-format owed record (`unreadOwed`). Say which of the two it
    means, a newer format or a broken encoding, since they end differently.

### Missing coverage

16. **Operations in depth (section 4)** and the Plan's `optimistic`, `setData`/`invalidate`, `idempotency`,
    storage failures, React, server rendering and inspection, which the matrix shows with no home.

## 4. Operations and structure in depth

Each case names its home fixture and its source (section 5). The sources are test files or user flows from client
apps and SDKs, ported as our own behaviour statements, the way ui-sdk was mined.

### `resource` reads

- Typeahead: a newer lookup releases the older; a late older answer never lands (`Superseded`) · home: sr · source:
  ui-sdk `trigger-menu.test.ts:183`; Zag async-list `seq`
- Closing before a load starts still lets the next open load · home: sr · source: ui-sdk `trigger-menu.test.ts:210`
- Many actors on one key share one in-flight lookup; the last one leaving starts `gcTime` · home: sr, ho · source: Plan
  O2
- `refetch` while running joins it, or queues one trailing request; a poll faster than the server · home: ho · source:
  Plan O2
- A write lands between a read's start and its answer: the older answer loses · home: tr, se · source: blind review #27
- Focus and reconnect refetch stale subscribed entries, ordered by contract then key · home: ho · source: Plan O2
- A failure after data keeps the data and shows the error; the next focus retries · home: ho · source: Plan O2
- `placeholder({ previous })` on a filter or account switch; previous key's error doesn't leak · home: sr, kb, tr ·
  source: Plan O2
- A read parked `Interrupted` by a freeze or actor end, then a reload (`E8`) · home: sr · source: Plan O2
- A bounded readback after an unknown write: a budget of probes, then one forced refetch · home: kb, ch · source:
  phoenix `fate/readback.test.ts:32,73`
- Signed-in data must never show under another identity after a switch · home: se, sr · source: phoenix
  `pages/panoFeedOverlay.test.ts:32,37`
- A bigint key, a key at and past its bound, an omitted input field (`KeyOmitsInput`) · home: sr · source: Plan O1
- A missing service refused at boot, by name · home: sr · source: Plan O1
- `invalidate` over more than 256 expanded identities (`AdmissionOverloaded`) · home: kb · source: Plan O5
- A hydrated first render, then a client write before hydration merges · home: sr, kb · source: Plan ServerRendering O5

### `transaction` writes

- A double tap under `reject`; a double submit across two tabs · home: pa, si · source: blind review #4; Plan
  Persistence O7
- Quantity `latest` per line key: a keyed line never aborts an unrelated line · home: pa · source: Hydrogen
  `cart-transactions.test.ts` (*verified*)
- Two unkeyed adds; rejecting one removes only its own optimistic line · home: pa · source: Hydrogen, same file
  (*verified*)
- Autosave `latest`: the superseded save's optimistic value disappears · home: dr · source: blind review #7 (Plan gap,
  section 7)
- `cancel` policy interrupts a call already on the wire; its ending is evidence only · home: sy · source: blind review
  #4 (Plan gap)
- Send `serialize` per thread, parallel across threads; queued sends drain in order · home: ch · source: LangGraph
  `stream.queue.test.tsx`
- Optimistic echo, then the server echo reconciled by id with no duplicate · home: ch · source: LangGraph
  `stream.optimistic.test.tsx` (*verified*)
- A temp id reconciled to the server id with no orphan · home: ch, kb · source: phoenix
  `fate/optimisticCommentAdd.realstore.test.ts:121`
- Rejection restores the list with no phantom row; a count never below zero · home: kb, ch · source: phoenix
  `optimisticCommentAdd.test.ts:162`, `optimisticCommentDelete.test.ts:130,194`
- Delete restored on a typed failure; an auth failure redirects instead of showing inline · home: kb · source: phoenix
  `pages/optimisticPostDelete.test.ts:17,21`
- A reload mid-charge gives `unknown { Restored }` with the same Attempt and no re-send · home: pa, tr · source: blind
  review #1; Plan Persistence O4
- Queued commits behind an in-flight one after a reload · home: tr · source: blind review #8 (Plan gap)
- `idempotency` by input fields; a re-send on an old key reads first · home: pa, tr · source: Plan O1
- 3-D Secure next action as a `subroutine`; closed mid-challenge; reload mid-challenge · home: pa · source:
  react-stripe-js `EmbeddedCheckout.client.test.tsx` (weak; see section 5)
- Upload in chunks with `progress`; abort, then resume from the stored offset · home: dr, ch · source: tus
  `test/spec/test-common.js` (*verified*)
- Resume fails (the stored upload is gone), so a new upload starts and the stale record is dropped · home: dr · source:
  tus, same file (*verified*)
- Retry until the delays run out; abort stops a pending retry · home: dr · source: tus, same file (*verified*)
- Storage quota refuses the ack: the commit ends `NotSent`, the draft stays in memory · home: dr · source: phoenix
  `fate/snapshot.test.ts:137`; `lib/draftStorage.unit.test.ts:94`
- Signed-out → auth redirect → return: the draft survives, then clears on submit · home: dr, si · source: phoenix
  `lib/draftStorage.unit.test.ts:45`
- An identity switch tears down the previous identity's saved data · home: se · source: phoenix `App.test.tsx:692`
- Sign-out mid-transfer disposes the Runtime; the Attempt ends `unknown { Disposed }` · home: se, tr · source: blind
  review #20
- A release changes a key fingerprint while a lane is held · home: dr, tr · source: blind review #10

### Streams

- Resume after reload replays the whole reply, replacing the partial text, not duplicating · home: ch · source: Vercel
  AI `use-chat.ui.test.tsx`
- Only the latest of two overlapping resumes applies · home: ch · source: Vercel AI `ui/chat.test.ts` (*verified*)
- Stop while a reconnect is pending: no messages added · home: ch · source: Vercel AI, same file (*verified*)
- Interrupted output kept with no error and no automatic follow-up · home: ch · source: Vercel AI, same file
  (*verified*)
- A tool result queued while stopping starts no new request · home: ch · source: Vercel AI, same file (*verified*)
- Many views of one chat reconnect once · home: ch · source: Vercel AI `use-chat.ui.test.tsx`
- A second view attaches to a reply already in flight · home: ch · source: LangGraph `stream.reattach.test.tsx`
- Heartbeat not acknowledged closes the socket and errors its channels · home: ch · source: Phoenix JS
  `assets/test/socket_test.js` (*verified*)
- Rejoin on a new connection before the old one closed, with no duplicate · home: ch · source: Phoenix JS, same file
  (*verified*)
- A join sent while disconnected goes out on connect · home: ch · source: Phoenix JS, same file (*verified*)
- A join timeout retries with backoff · home: ch · source: Phoenix JS `assets/test/channel_test.js`
- Backoff grows, resets after a synced session; a terminal close stops reconnecting · home: ch, dr · source: y-websocket
  `test/reconnect.test.js`
- Chunks from a superseded socket never corrupt its replacement · home: ch, dr · source: tldraw
  `sync-core/src/test/TLSocketRoom.test.ts`
- A staggered ack for an in-flight push makes no net change · home: kb, dr · source: tldraw `TLSyncClientRebase.test.ts`
  (*verified*)
- Presence: a leave removes one entry and keeps the key while others remain · home: ch · source: realtime-js
  `test/RealtimeChannel.presence.test.ts`
- Same-tick subscriptions coalesce into one control request · home: ch, kb · source: phoenix
  `fate/liveSubscribeBatch.test.ts:117`
- Owner churn never closes the shared connection (count stays at least 1) · home: ch · source: phoenix
  `fate/globalLivePin.test.ts:103`
- A burst of errors from one failed connect makes one scheduled retry · home: ch · source: phoenix
  `fate/liveRetry.unit.test.ts:75`
- Readings faster than turns: `latest` drops the oldest, at and past 1,024 · home: ho · source: Plan O4
- `Flapping` after repeated drops; a position that fails to decode · home: ch · source: blind review #23, #24 (Plan
  gaps)
- The parent ends with sessions live: release within 5 s, late items dropped as evidence · home: ch, ho · source: Plan
  O7

### Structure (each shape in three or more apps)

- `S1` deep chain · homes and parameters: se ×{4, 8, 32}; ho house → zone → room → panel; kb column → card → item; wz
  subroutine in a compound in a compound
- `S2` wide fan-out · homes and parameters: se 1 → {64, 1,024}; ch 1 connection → 100 threads; ho 1 house → 256 rooms;
  pa 1,000 lines
- `S3` forest · homes and parameters: se 3 orgs; pa many carts; tr 64 accounts; sy 64 remotes; ch several hubs; ho
  several houses
- `S4` dual role · homes and parameters: se team; ho zone; ch thread (reads session, provides to message views)
- `S5` middle override · homes and parameters: se `guestTeam`; ho mode override at zone
- `S6` parent ended under live children · homes and parameters: se (sign-out, dispose, forget, reload, each order); kb
  board closed with cards loading; ch hub ended with sessions; dr parent draft ended in another tab
- `S7` refused shape · homes and parameters: se cycle and missing provider; ho missing provider; pa conflicting ref; kb
  duplicate `.each` key
- `S8` churn · homes and parameters: ch threads added and removed; ho rooms added and removed mid-tick; kb items added
  and removed mid-raise
- `S9` reload at the deepest node · homes and parameters: wz deepest sub-state; kb item; se badge

Real counterparts for `S6`: ui-sdk `restore-late-items.test.ts:123` ("stops waiting for the items once destroyed")
and `leaks.test.ts:30`. Real counterparts for stacked dialogs and nested menus (`S1` and `S6` in UI): ui-sdk
`alert-dialog.test.ts:17`, `focus-return-everywhere.test.ts:341` and `details.test.ts:90`.

## 5. Sources to copy from

Libraries like Flow (TanStack Query and DB, XState, Effect, signals and stores) are dropped as sources at the
user's direction: they test a library, not an app built on one. Local sources come first.

### Local

- `codebases/ui-sdk` · what to replicate (paths): Uncited tests: `packages/core/test/trigger-menu.test.ts` (stale load,
  abort), `restore-late-items.test.ts`, `alert-dialog.test.ts`, `focus-return-everywhere.test.ts`, `details.test.ts`,
  `leaks.test.ts`, `virtualizer-find.test.ts`, `field.test.ts:93` · feeds: sr, kb, pa, UI primitives · why it's a real
  case: An integration library with complex state; the method already worked
- `codebases/phoenix` (kamp.us app, not the Elixir framework) · what to replicate (paths):
  `apps/web/src/fate/*.test.ts*` (17 files: optimistic add, delete and edit, snapshot, readback, live subscribe, retry,
  pin); `src/App.test.tsx:670,692`; `src/lib/draftStorage.unit.test.ts`;
  `src/pages/{optimisticPostDelete,definitionAddOptimistic.unit,panoFeedOverlay,savedReconcile}.test.ts` · feeds: ch,
  kb, dr, se, si · why it's a real case: A shipped app: optimistic lists, identity switches, quota, a live connection
- `codebases/mono/apps/zbugs` (Rocicorp's bug tracker) · what to replicate (paths): Flows, not tests:
  `shared/queries.ts:178-198` cursor-paged comments both ways; `shared/mutators.ts` issue create, update and delete;
  `src/pages/list/list-page.tsx` filtered lists; `src/hooks/use-is-offline.ts` offline composer · feeds: kb, ch · why
  it's a real case: A real tracker; it has no Playwright specs, so we write the Stories ourselves

Rejected locally: `codebases/accountability` has one web smoke test (`packages/web/test/smoke.test.ts`), so it
has no client cases. `codebases/alchemy` is an infrastructure library. The rest are libraries.

### Public (read on the web; not cloned)

- Vercel AI SDK, `vercel/ai` · behaviour and test files: `packages/ai/src/ui/chat.test.ts`,
  `packages/react/src/use-chat.ui.test.tsx`: resume, stop, overlapping resumes, tool calls, many consumers · feeds: ch ·
  why: Streams with resume and stop in an SDK many apps build on
- LangGraph React SDK, `langchain-ai/langgraphjs` · behaviour and test files:
  `libs/sdk-react/src/tests/stream.{optimistic,queue,reattach,core}.test.tsx` · feeds: ch · why: Optimistic echo, queued
  submits, reattach to an in-flight run
- tus-js-client, `tus/tus-js-client` · behaviour and test files: `test/spec/test-common.js`, `test-parallel-uploads.js`,
  `test-terminate.js` · feeds: dr, ch · why: The reference resumable-upload client: offsets, retry delays, abort,
  fingerprints
- Shopify Hydrogen, `Shopify/hydrogen` · behaviour and test files:
  `packages/hydrogen/src/core/cart/cart-transactions.test.ts`, `src/react/cart.test.tsx` · feeds: pa · why: A storefront
  cart with keyed optimistic lines and per-line aborts
- Supabase auth-js, `supabase/auth-js` · behaviour and test files: `test/GoTrueClient.test.ts` ("refresh should only
  happen once", recover and refresh); `test/GoTrueClient.browser.test.ts` (Web Locks, BroadcastChannel);
  `src/lib/locks.ts` · feeds: se, si · why: Refresh races and multi-tab locks in a widely used session client
- Supabase realtime-js, `supabase/realtime-js` · behaviour and test files: `test/RealtimeClient.resilience.test.ts`,
  `RealtimeClient.lifecycle.test.ts`, `RealtimeChannel.presence.test.ts` · feeds: ch, ho · why: Reconnect, heartbeat and
  presence diffs
- Phoenix JS client, `phoenixframework/phoenix` · behaviour and test files: `assets/test/socket_test.js`,
  `channel_test.js`, `presence_test.js` · feeds: ch · why: The channel reconnect, rejoin and buffered-push tests the
  brief asked for
- Yjs providers, `yjs/y-websocket`, `yjs/y-indexeddb` · behaviour and test files: `test/reconnect.test.js`;
  `tests/y-indexeddb.tests.js` (early destroy, concurrent merge) · feeds: dr · why: Collaborative sync: backoff,
  terminal close, local storage racing the network
- tldraw sync, `tldraw/tldraw` · behaviour and test files: `packages/sync-core/src/test/TLSocketRoom.test.ts`,
  `TLSyncClientRebase.test.ts` · feeds: dr, kb, ch · why: Superseded sockets, staggered acks, presence restore
- Zag, `chakra-ui/zag` · behaviour and test files: `packages/machines/async-list/src/async-list.machine.ts` (stale
  `seq`, abort on leave, load more) · feeds: sr, kb · why: A component state-machine kit with paged async lists
- Cal.com, `calcom/cal.com` · behaviour and test files: `packages/features/bookings/Booker/store.ts`,
  `useSlotReservationId.ts` (flows) · feeds: new Stories in `pay` or `wizard` · why: A slot taken while held, a
  reservation lost on reload (no tests read)
- react-stripe-js, `stripe/react-stripe-js` · behaviour and test files: `src/components/Elements.test.tsx`,
  `EmbeddedCheckout.client.test.tsx` · feeds: pa · why: Weak: no confirm, 3-D Secure or unknown-outcome tests; use the
  3-D Secure flow from Stripe's docs instead

### Proposed additions to `codebases/` (the user adds them)

1. `vercel/ai`: `packages/ai/src/ui/`, `packages/react/src/`. This is the largest single source of stream cases.
2. `tus/tus-js-client`: `test/spec/`, `lib/upload.ts`. Uploads with `progress`, `previous` and resume.
3. `Shopify/hydrogen`: `packages/hydrogen/src/core/cart/`, `src/react/`. The cart and pay cases.
4. `phoenixframework/phoenix`: only `assets/js/phoenix/` and `assets/test/`. Channel reconnect.
5. `tldraw/tldraw`: `packages/sync-core/`. Sync, rebase and presence.
6. Also worth adding: `supabase/auth-js` and `supabase/realtime-js` (session and realtime), and
   `langchain-ai/langgraphjs` `libs/sdk-react/`.

Not yet searched: Plane, Twenty, Excalidraw and Liveblocks. Their directories returned 403 or 404, so I cite no
paths from them.

## 6. Proposed row edits

Each edit is proposed; accept or reject it on its own. They assume the vocabulary in section 3, item 1. Where a
merge is rejected, the edit applies to the fixture that would have absorbed it.

- **R1 (catalog head):** add the coverage matrix (section 1) and the registration grid. Replace "Has:" with
  "Stories: see `stories` in `fixtures/<name>/stories.ts`". Add "Sources:" to every row.
- **R2 cells:** delete the row and move its bullets to pay as the "client cell" shape (M1). Its "a second cell shape
  that is not a Pay copy" bullet becomes pay's one-click checkout.
- **R3 command-palette:** change combinations to "(have) persistence, server, pair sweep (`pairs-persisted`)". Add
  "(missing) commands as `props`; a `CommandRan` emit; React Strict Mode; bench `long`". Change frame depth to
  "S1×{1,8,64} as fixed Stories (stress reaches depth only by chance today)".
- **R4 lanes:** delete the row and move it into sync as three remotes (M3). Drop "(missing) key at byte bound" and
  "(missing) in the app mix" (both exist). Keep "(missing) 64 queued commits, 1,024 mailbox (L2)" and "S3: the
  same key under two actors".
- **R5 number-input:** split the mixed load bullet. Define "NaN-like text" as `Typed "abc"` (have) and add `E6` and
  `step 0`. Add "(missing) a form of inputs as local actors (S2×64); React Strict Mode; bench `long`". Set the
  owner to T78 only.
- **R6 pay:** add backports (section 2: address `trait`, 3-D Secure `subroutine`, checkout `history`,
  `idempotency`, `invalidate` of orders, two tabs, server-rendered product page) and absorb cart (M2). Change
  structure to "S3 many carts (`secondCheckout` exists only in a hand test)". Sources: Hydrogen cart.
- **R7 player:** add "(missing) registered in the reload sweep and bench `long`". Add `pausedBy` (user pause,
  buffering) and the speaker's state as a `Feed.callback` `latest` stream. Mark "history after a reload" as
  depending on T56, since player isn't persisted.
- **R8 session:** rewrite "Has" and structure from the code: four layers, two roots, `guestTeam`, `fanOut` (24),
  `parentUnderChildren`. Missing: S1×{8,32}, S2×{64,1,024}, S7 cycle and missing provider as Stories, S6 signed-out
  root. Add lazy billing (M7), sign-out `clear`, a new Runtime per account, sign-out in another tab, and a corrupt
  record. Sources: phoenix `App.test.tsx`, auth-js. Drop "(missing) in the app mix".
- **R9 sign-in:** drop "(missing) pair sweep" (`pairs-local`). Add the code step as a `subroutine`, the
  `SignedIn` emit, `Flow.private` code, `reject` verify, `forget` on sign-out, and a password flow as release 2.
  Owners: T17, T20, T56, T77, T81. Sources: phoenix `lib/draftStorage.unit.test.ts:45`.
- **R10 sync:** absorb lanes (M3). Add an Effect `Schedule` backoff, `pausedBy` rate limit, `latest` remote-head
  pushes, release 2. Owners: T17, T20, T56, T57. Replace "push- and poll-triggered shape" with "`Pushed` (have)
  and a poll schedule (missing)".
- **R11 transfers:** name the 13 Stories in the registry, and register `manyReceipts`. Change structure to "two
  accounts (have); S3×64 (missing)". Add the step-up `subroutine`, balance `resource` with `invalidate` and
  `optimistic`, entity records with `pagedBy`, a notifications `stream`, `serialize` per account, `idempotency`,
  and `send(ref)`. Drop T9 as owner unless T9 takes the context combination.
- **R12 wizard:** keep. Add Cal.com's slot taken while held as a lookup-step Story (source: Booker `store.ts`).
- **R13 search:** absorb pager (M6). Add the `resource` cases from section 4, a hydrated first render, and
  `pagedBy` result pages. Sources: ui-sdk `trigger-menu.test.ts`, Zag async-list.
- **R14 home:** new row replacing dashboard, thermostat and ticker (M4). Its required rows are the union of theirs,
  restated in vocabulary codes, plus refused context shapes and `.resumable()` offscreen panels. Sources:
  realtime-js resilience.
- **R15 kanban:** absorb checklist (M5) as column → card → item. Add `guarded` moves, a board listen stream,
  lazy card detail, React, hydration, release 2. Sources: phoenix optimistic tests, zbugs queries, tldraw rebase.
- **R16 chat:** add the stream, send and upload cases from section 4. Sources: Vercel AI, LangGraph, Phoenix JS,
  y-websocket, realtime-js presence, phoenix `fate/live*`.
- **R17 draft:** absorb delivery (M8) as release Stories, and add tus-style attachment upload, storage quota and
  collaborator ops. Sources: tus, y-indexeddb, tldraw sync, phoenix `snapshot.test.ts`.
- **R18 Gaps section:** delete each gap the matrix now homes: server rendering, `forget`, `Flow.private`,
  inspection, isolation, React, upload progress, subroutine placements. Keep only what section 7 leaves open.

### App blocks (one per row, proposed)

Each fixture becomes a whole app (@convention.fixtures, "A fixture is a whole app"). Every block lists
the app's machines, then its operations, then its main journeys. Each backport in the matrix is tagged `[B]` on the
machine and journey where it lands.

Notation:
- **shared** is an app actor (`actorRef`); **local** is a `createActor`/`useActor` actor.
- `◂ X` means child of `X` (placed in it by `.each`, a fragment or `subroutine`).
- `⇢ ctx` provides context; `⇠ ctx` consumes it.
- **R** is a `resource`, **T** a `transaction`, **S** a `stream`.
- "have" marks a name that exists today; every other name is proposed.

Today eight fixtures are one machine and one or two operations (cells, transfers, sync, player, sign-in,
number-input, command-palette, pay). Session has four machines but only one transaction.

#### pay (shop): storefront, cart and checkout (+cells, +cart); source: Hydrogen cart, Stripe's 3-D Secure flow

- **Machines:**
  - `Shopper`, shared, ⇢ `shopper` (the signed-in or guest shopper).
  - `Cart`, shared, named by shopper, ⇠ `shopper`.
  - `CartLine`, ◂ `Cart` via `.each` [B].
  - `CartBadge` (header) and `MiniCart` (popover), both shared, reading the cart domain.
  - `Checkout/Pay` (have), shared per cart, ⇠ `shopper`, with steps address → shipping → pay under `history` [B].
  - `AddressForm`, a `trait` on the address step [B].
  - `ThreeDSecure`, a `subroutine` in the pay step [B].
  - `ProductPage`, local, server rendered [B].
- **Operations:**
  - R: `product`, `intentStatus` (have), `orderForCart` (have), `addressLookup`.
  - T: `addLine` and `setQuantity` (`latest` per line key), `pay` (have, `reject`, `idempotency`), `placeOrder`
    (have), `voidAuthorization` (have).
  - The cart is a `domain` with predictions and `.gone`.
- **Journeys:**
  1. Product page (R `product`) → Add (T `addLine` predicts a line; the badge and mini cart see it) → server
     confirms.
  2. Rapid quantity edits on one line (`latest`); a rejected add removes only its own line.
  3. Checkout: the address trait (R `addressLookup` ends on abandonment) → Back restores the shipping sub-step →
     T `pay` → unknown → R `intentStatus` → `placeOrder` → R `orderForCart` invalidated.
  4. 3-D Secure challenge closed, or the tab reloaded mid-challenge.
  5. Two tabs pay the same cart.
  6. A one-click cell checkout (the old `cells`).
  7. A product delisted while in a cart (`.gone`).

#### sync: a git client with several remotes (+lanes); source: none found outside libraries

- **Machines:**
  - `Repo`, shared, named by repo [B], ⇢ `repo`.
  - `Remote`, ◂ `Repo` via `.each`, ⇠ `repo`, one per lane policy (the old `lanes`: latest, serialize, cancel).
  - `Git/Sync` (have) becomes `Remote`'s body.
  - `RateLimit`, a `trait` on `Repo` holding the `Flow.private` token [B].
- **Operations:** T `sync` (have); R `remoteHead` (have); S `headPushes` (`latest`) [B].
- **Journeys:**
  1. Edit → T `sync` on each remote under its policy.
  2. A 429 pauses every remote's schedule (`pausedBy`, an Effect `Schedule` backoff) [B].
  3. A push arrives on `headPushes` → R `remoteHead` refetch → Pull.
  4. A repo is closed with queued, held and running commits.
  5. Release 2 changes the sync key.

#### transfers: a bank app; source: phoenix optimistic tests (pending rows)

- **Machines:**
  - `Customer`, shared, ⇢ `customer`.
  - `Account`, shared, named by account (have as `Bank/Transfers`), ⇠ `customer`, ⇢ `account`.
  - `TransferForm`, local, ⇠ `account`, with `StepUp` as a `subroutine` for large amounts [B].
  - `Statement`, local, ⇠ `account`.
- **Operations:**
  - R: `balance` [B], `transfers` (domain list, `pagedBy`, `.byKey` receipt) [B].
  - T: `transfer` (have; `serialize` per account, `idempotency` by transfer id).
  - S: `notifications` (`every`, `catchUp`) [B].
- **Journeys:**
  1. Open an account → R `balance` and the first page of R `transfers`.
  2. Send: T `transfer` with an `optimistic` pending balance → success → `invalidate` `balance`.
  3. Lost answer → owed ending → reload → receipt.
  4. A large amount → `StepUp` subroutine.
  5. Between own accounts: `send(ref)` to the payee account.
  6. A notification arrives while the app is closed → catch-up.
  7. Switch account with `placeholder({ previous })`.

#### sign-in: email-code and password sign-in; source: Supabase auth-js, phoenix `draftStorage`

- **Machines:**
  - `Auth/SignIn` (have), shared, with `CodeStep` as a `subroutine` [B].
  - `Cooldown`, a schedule using `Flow.initial` from input [B].
  - `Session`, shared, ⇢ `session`; it receives the `SignedIn` emit [B].
  - `ReturnTo`, local, holding the route and draft to resume.
- **Operations:**
  - T: `begin` (have), `verify` (have, `reject`) [B], `password` (release 2).
  - R: `me`.
- **Journeys:**
  1. Email → T `begin` → `CodeStep` (`Flow.private` code) → T `verify` → emit `SignedIn` → R `me`.
  2. Resend under cooldown and lockout.
  3. A signed-out draft goes through the auth redirect and back.
  4. Sign-out uses `forget`.
  5. Release 2 adds the password flow.
  6. React Strict Mode.

#### session: a workspace shell (+settings-panel); source: phoenix `App.test.tsx`, auth-js

- **Machines:**
  - `Workspace/Org` (have), shared, ⇢ `org`.
  - `Workspace/Session` (have), ⇠ `org`, ⇢ `user`.
  - `Workspace/Team` (have), ⇠ `user`, ⇢ `team`.
  - `Workspace/Badge` (have), ⇠ `team`.
  - `Billing`, a lazy entry `{ id, load }` ⇠ `org` [B].
- **Operations:**
  - T: `signIn` (have), `renameTeam` with `optimistic` [B], `updatePlan` (lazy billing).
  - R: `profile` (`subscribe`) [B], `members`.
- **Journeys:**
  1. Boot → `Org` → `Session` → teams and badges (S1, S2).
  2. Rename a team (`optimistic`) → badges update.
  3. Open billing (lazy adoption) → T `updatePlan`.
  4. Sign out → `clear` → a new Runtime for the next account [B].
  5. Sign out in another tab.
  6. A corrupt saved record.
  7. A cycle and a missing provider are refused.

#### command-palette: an editor command palette; source: ui-sdk `command.test.ts`

- **Machines:**
  - `Workbench`, shared, holds the open documents.
  - `Palette/Palette` (have), local [B], taking commands as `props` [B] and emitting `CommandRan` [B].
- **Operations:** T `runCommand` (have); R `recentCommands`.
- **Journeys:**
  1. Open → type → highlight → run (T `runCommand`).
  2. Pages nested 1, 8 and 64 deep with Back.
  3. The host swaps the command list mid-search (`props`).
  4. Focus returns on Escape (emit).

#### number-input: an order form of steppers; source: ui-sdk `number-input.test.ts`, `hold.test.ts`

- **Machines:**
  - `OrderForm`, shared.
  - `Number/Stepper` (have), local, ◂ `OrderForm`, one per field [B], with `props` min, max and step (T78).
- **Operations:** R `stock` (feeds `max`); T `saveOrder`.
- **Journeys:**
  1. The form reads R `stock` → steppers get `max` as props → hold to repeat → blur emits `Committed` →
     T `saveOrder`.
  2. 64 fields.
  3. React Strict Mode.

#### player: multi-room audio; source: ui-sdk has none, so the speaker device API is the real model

- **Machines:**
  - `Music/Player` (have), shared per room.
  - `Household`, shared, ⇢ `household` (the rooms list).
  - `Queue`, a `trait` of `Player`.
- **Operations:**
  - T: `play` (have).
  - S: `speakerState` (`latest`, `Feed.callback`) [B].
  - R: `track`.
- **Journeys:**
  1. Play → T `play` → speaker reports buffering (S) → `pausedBy` buffering against a user pause [B].
  2. Group rooms.
  3. A room disposed while its tick is armed.
  4. History through nested states.

#### wizard: insurance quote; source: Cal.com Booker flows for a held slot

- **Machines:**
  - `Quote`, shared, with steps as compound states.
  - `Vehicle` and `Driver` as `subroutine`s, `Driver` reused for each extra driver.
  - `Explainer`, a lazy entry.
  - `AddressForm`, a `trait` (the same shape as shop's, a second home).
- **Operations:**
  - R: `postcode`, `slots`.
  - T: `holdSlot`, `submitQuote`.
- **Journeys:**
  1. Forward → Back by history → R `postcode` → T `submitQuote` once.
  2. Book an inspection slot: T `holdSlot` → the slot is taken meanwhile → re-pick.
  3. Release 2 adds a step.

#### search (+pager): flight or product search; source: ui-sdk `trigger-menu.test.ts`, Zag async-list

- **Machines:**
  - `SearchPage`, shared, server rendered [B].
  - `Filters`, a `trait`.
  - `ResultList`, local, ◂ `SearchPage`.
  - `Pager`, local, ◂ `ResultList`, with `props` and emits.
  - `Saved`, shared.
- **Operations:**
  - R: `results` (`placeholder`, `pagedBy`), `suggestions` (typeahead, `subscribe.each` per filter facet).
  - T: `saveSearch`.
- **Journeys:**
  1. Type → R `suggestions` (latest wins).
  2. Submit → R `results` → page with `Pager`.
  3. Change a filter (`placeholder` previous).
  4. Save a search (T) → `invalidate` `Saved`.
  5. A hydrated first render, then a client edit.
  6. The page closed under live reads.

#### home: smart-home dashboard (dashboard + thermostat + ticker); source: realtime-js resilience

- **Machines:**
  - `House`, shared, ⇢ `mode`.
  - `Zone`, ◂ `House`, ⇠ `mode`, ⇢ `zoneMode` (override).
  - `Room`, ◂ `Zone` via `.each`, ⇠ `zoneMode`, with keyed schedules.
  - `Panel`, a `trait` on `Room`, `.resumable()` offscreen [B].
- **Operations:**
  - R: `readings` (polled, focus refetch).
  - T: `setTarget` (`latest` per room).
  - S: `liveReadings` (`latest`, `Feed.multiplex`, `dropAt`).
- **Journeys:**
  1. Set a target → T `setTarget` → S confirms the temperature.
  2. Vacation: `pausedBy` across every room (raise) [B].
  3. A room added mid-tick.
  4. The connection drops → stale panels refetch.
  5. A missing provider is refused [B].

#### kanban (+checklist): a project tracker; source: zbugs queries and mutators, phoenix optimistic tests

- **Machines:**
  - `Board`, shared, named by board [B], ⇠ `member` [B], ⇢ `board`.
  - `Column`, ◂ `Board` via `.each`.
  - `Card`, ◂ `Column` via `.each`.
  - `ChecklistItem`, ◂ `Card` via `.each`.
  - `CardDetail`, local [B], a lazy entry [B].
  - `CardMenu` (the menu primitive).
- **Operations:**
  - R: domain reads `cards.list`/`.byKey` (`pagedBy`), `comments` (cursor paged as in zbugs).
  - T: `moveCard` (`latest` per card, `guarded`), `addComment`, `deleteComment`.
  - S: `boardEvents` (`every`, `catchUp`) [B].
- **Journeys:**
  1. Drag a card (predicts; a 409 is repaired).
  2. Open the detail (lazy) → add a comment (temp id → server id) → delete a comment (count never below zero).
  3. "Check all" raised into items.
  4. Another user moves the card (S) while my move is pending.
  5. A hydrated board.
  6. Release 2.

#### chat: team chat with an assistant; source: Vercel AI SDK, Phoenix JS, realtime-js, tus

- **Machines:**
  - `Hub`, shared, ⇠ `session`, ⇢ `hub`.
  - `Thread`, shared, named by thread [B], ⇠ `hub`, ⇢ `thread`.
  - `ThreadList`, `.each` over threads [B].
  - `Composer`, a `trait` placed in threads and DMs [B].
  - `Attachment`, ◂ `Composer` via `.each`.
  - `Presence`, ◂ `Hub`.
  - `AssistantReply`, ◂ `Thread`.
- **Operations:**
  - R: `history` (`pagedBy`) [B].
  - T: `send` (`serialize` per thread, `optimistic` echo) [B], `upload` (`progress`, `cancelAll`) [B],
    `deleteMessage`.
  - S: `messages` (`every`, `position`, `catchUp`, `reconnect`), `presence` (`latest`) [B], `reply` (resumable).
- **Journeys:**
  1. Join → R `history` → S `messages`.
  2. Send → echo → reconciled by id.
  3. Attach a file → `progress` → cancel or resume.
  4. Ask the assistant → S `reply` → reload → resume replaces the partial reply → stop while reconnecting.
  5. A train ride: heartbeat lost → rejoin with no duplicate → catch-up.
  6. Typing indicators expire (keyed schedule).
  7. A message deleted (tombstone).

#### draft (+delivery): document editor; source: tus, y-websocket, y-indexeddb, tldraw sync, phoenix `snapshot`

- **Machines:**
  - `Library`, shared, ⇢ `author` [B].
  - `Document`, shared, named by document, ⇠ `author`.
  - `Section`, ◂ `Document` via `.each`, `.resumable()` when collapsed.
  - `AttachmentUpload`, ◂ `Section`.
  - `Collaborators`, ◂ `Document`.
- **Operations:**
  - T: `save` (`latest`, autosave on a keyed debounce), `upload` (`progress`, `previous`, resume).
  - S: `ops` (`every`, `catchUp`).
  - R: `document`.
- **Journeys:**
  1. Edit → autosave.
  2. Paste an image → upload → abort → resume from the offset.
  3. A collaborator's op arrives during my save.
  4. Two tabs (Web Lock).
  5. Quota full.
  6. Release 2 migrates sections while a save is held.

#### UI primitives (kept as fixtures, T72 and T73); source: ui-sdk tests already mined in @proposal.ui-primitives

Each primitive gets a small host app, so it calls a real operation:

- **toaster:**
  - Machines: `Toaster` (shared); `Toast` (◂ `.each`, `max`; `pausedBy` hover).
  - Operations: T `undoArchive`.
  - Journey: archive mail → toast → Undo before it expires.
- **menu:**
  - Machines: `CardMenu` (local); `MoveTo` submenu.
  - Operations: R `boards` (lazy load, a stale load never lands); T `moveCard`.
- **combobox:**
  - Machines: `AssigneePicker` (local).
  - Operations: R `searchUsers` (200 ms debounce, latest wins); T `assign`.
- **tree:**
  - Machines: `FileTree` (shared); `Node` (◂ `Node`, S1 deep).
  - Operations: R `children` via `subscribe.each`; T `rename`, `move`.
- **token-input:**
  - Machines: `Recipients` (local).
  - Operations: R `contacts`, `validateAddress`; T `send`.

Hosting these five inside kanban, chat and draft instead of as fixtures would take the count from 19 to 14.
Section 7 lists it as a decision.

Re-check against the matrix: every `B` cell above lands on a named machine and journey. Two cells changed:
- `delivers: "latest"` in `sy` is now S `headPushes`.
- `send(ref)` moves from `ch` to `kb`: chat routes through `Hub`'s context, not a ref. In kanban, `CardMenu`'s
  "Move to board" sends to another `Board` ref, so `send(ref)` lives in pa, tr and kb.

## 7. Needs a decision

1. **Merges M1 to M8** and the `shop` rename, one by one (section 2).
2. **`progress` has two homes** (dr, ch) even after the backports. Accept two, or add an export Story to `transfers`
   (statement export with progress)?
3. **Plan gaps that block red cases** (from the blind review; Plan line numbers as of 2026-11-17):
   - `Flapping` streams are never reopened (Operations.plan:306-310): what does a chat do after a train ride?
   - Offline queued writes "resume after a reload" (Persistence.plan:176-178) conflicts with queued commits ending
     `NotSent { Restored }` (Persistence.plan:191).
   - `Superseded` removal of optimistic values has no rule for non-domain writes (Operations.plan:377-382).
   - A pre-boot `StorageFailure` has no `NotSent` tag (Operations.plan:156-157 against Persistence.plan:277-279).
   - Is `dueAt` wall-clock time? Sleep and clock jumps are unstated (Persistence.plan:52, Operations.plan:125).
   - The `cancel` policy and a user cancel end a wire Attempt differently (Operations.plan:205, 239-241, 440-445).
4. **Session's status:** its fixture is untracked. Should the catalog row wait for the commit?
5. **Host the five UI primitives inside kanban, chat and draft** (19 fixtures to 14), or keep them as standalone
   fixtures with small host apps (section 6, App blocks)? They have their own Tasks (T72, T73) and an accepted
   proposal, so this is the user's call.

## 8. Sidecar log

Eleven Haiku sidecars, all read-only. I re-ran the checks on local paths and fetched eight public files myself.

- TanStack Query tests · result: rejected · why: Library source (user direction, mid-run). Paths were real; none used.
- TanStack DB and Zero tests · result: rejected · why: Library source (user direction); none used.
- XState tests · result: rejected · why: Library source; its structural shapes are covered by the `S` vocabulary
  instead.
- Effect and effect-mq tests · result: rejected · why: Library source; none used.
- Signals, stores and apps · result: changed · why: Library half rejected; the phoenix half accepted after re-grepping
  14 test names (all matched).
- Blind "what breaks" · result: accepted · why: 30 scenarios used in section 4; 10 unclear spots, 6 kept as decisions in
  section 7. Line numbers not re-checked.
- Catalog accuracy · result: accepted, 9 items · why: Re-checked: session's four definitions, the pair-sweep files,
  `atStringBound`, `mix`, `fixtureStories`. One finding was changed: "NaN-like" is a term to define, not an error.
- ui-sdk method and alchemy · result: changed · why: ui-sdk method and 15 uncited tests accepted (7 re-grepped, all
  matched). Alchemy rejected as a library.
- Web: AI chat SDKs · result: accepted · why: Four `chat.test.ts` titles and seven LangGraph titles verified by my own
  fetch.
- Web: uploads, payments, cart · result: accepted; Stripe changed · why: Four tus and three Hydrogen titles verified.
  Stripe was marked weak: no confirm or 3-D Secure tests.
- Web: auth, realtime, collab · result: accepted · why: Three Phoenix socket, two auth-js and three tldraw titles
  verified. One auth-js title is nested under a describe block (`_recoverAndRefresh` › "should handle expired session by
  attempting refresh").
- Web: products and kits · result: changed · why: Zag, Cal.com and zbugs flows accepted as flows; listing-only claims
  for Twenty, Plane and Excalidraw rejected.
