# Fixture catalog check, 2026-11-17

**Verdict: ISSUES.** The catalog's sources are sound (all 145 local citations exist at their exact line), but its
coverage matrix disagrees with its own App blocks and migration steps, whole families of public behaviour have no
home (every `NotSent` ending, Attempts, keys, most stream edges), two apps consume a context nothing provides, and
the migration plan has two order inversions and three features with no building Task. Against the user's added
criterion, additive growth, it rewrites the oldest machines and renames persisted ids instead of building around
them (section "Additive growth"). A lead acting on it today would build fixtures that fail to boot, test the wrong
step, or break existing Stories.

Under review: code:wiki/conventions/fixture-catalog.md (uncommitted). Judged against code:wiki/conventions/fixtures.md,
the Plans and the V3 Tasks. `C:n` is a catalog line; paths are from the repository root. All findings below were
re-checked by me; the log at the end says which sidecar raised each and what I did with it.

## Findings, most severe first

### 1. The matrix disagrees with the App blocks and the steps (Coverage matrix, high)

- **Wrong:** C865 says "the numbers match the matrix cells". They don't, in three directions:
  - Cells with no support in the App block, by name or substance. Examples: `send(ref, event)` sh:1 (shop has no
    send); `.resumable()` kb:2 (no resumable in kanban); `props`/`emits` kb:7 (kanban names neither);
    `placeholder` kb:3; `forget` dr:3; `Runtime per scope` dr:3; `S.X.history` dr:3 (its only "history" is a tldraw
    test name, C804); `inspect` sh/sy/tr:16 while C80-82 says the row marks only apps with a sink or redaction,
    and no block has either; `Flow.private` se:1 and pl:U (neither block declares one); `.gone` and `predicts` kb:9,
    ch:9 (neither block says so).
  - App features the matrix marks `.`: optimistic commits in shop (C127, C128) and kanban (C569); `.resumable()` on
    chat's `reply` (C658); Strict Mode in chat (C732); local actors in chat (`Recipients`, C651) and draft
    (`Outline`, C752); refused shapes in shop (C138), kanban (C583), search (C484).
  - Cells against steps: dr `previous` is 3 (C59), the block and step 4 say 4 (C757, C893); step 9 gives transfers
    predictions and `.gone` (C901), the matrix is `.` (C67, C68); step 16 names home and sign-in (C912), C78 omits
    them; step 14 owns Story words (C908) and no cell is 14; `.resumable()` dr:3 (C37) but step 2 owns it (C881);
    number-input props 6 (C42), but step 6 lists no props for it (C896).
- **Evidence:** read C26-C82 against each App block; matrix sidecar's full list of about 60 cells.
- **Fix:** make the App block the one fact and the matrix a view of it: each App block's machine and operation lines
  carry the feature and step (`T addLine (latest per line key; step 1)`), and the matrix is either generated or
  re-derived by hand from them in one pass. Drop the C865 claim until it holds.

### 2. Whole families of public behaviour have no home (Coverage matrix, Fixtures, high)

- **Wrong:** fixtures.md item 6 asks for three unrelated homes per feature. These Plan features have none, or are
  named only inside a copied test title:
  - Every `Flow.NotSent` reason: `Rejected`, `Superseded`, `Overloaded`, `Restored`, `OldVersion`, `NoPersistence`,
    `StorageRefused` (Operations.plan:154-176, 197-203, 254-282). `grep -n "NotSent\|Attempt" C` finds nothing.
  - Attempts: `Attempt.id` across re-sends, `StillUnknown`, `retry` evidence `InFlight`/`NothingToResend`,
    `cancel({ attempt })`, `CancelMissed` (Operations.plan:149-152, 178-186, 205-208, 436-441).
  - Contract `key`: canonical keys across reload (bigint, `-0`, NFC), `InvalidKey`, `KeyOmitsInput`
    (Operations.plan:51-75).
  - Mapping: `notSent:`, `otherwise`, `Flow.ignore`, `writes` with `InvalidWrite`, mapper throws as `Defect` with
    `UserClosure` (Operations.plan:104-172).
  - Streams beyond names: `Feed.live` proof and `restartAt`, `missed` (`Unproven`, `Lost`, `Reset`), `dropAt`
    behaviour, `DuplicateSession`, `idleTime`, `ReleaseOverdue`, `fills` (Operations.plan:287-351).
  - Lifecycle and caps: mailbox `AdmissionOverloaded` at 1,024 as a Story (L2 names it, no app carries it),
    `late` handlers and `LateMayNotLeave` (Machines.plan:647-660), `unsettledWrites` (in no block).
  - Server rendering and lazy edges: `DehydrateCommitInFlight`, `DehydrateUnsettled`, `HydrationScopeMismatch`,
    `HydrationIncompatible`, `EntryMismatch`, a send to an unadopted entry (ServerRendering.plan:22-77, 121-174;
    LazyFeatures.plan:33-51, 90-97).
- Two rows have fewer than three homes even in the matrix: `concurrency: "reject"` (sh, si; C54) and refused
  context shapes (se, ho; C45). A context cycle appears only in session (C328).
- **Fix:** add a row per family and place each in three apps where the product would meet it. Proposed homes:
  `Rejected` in sign-in `verify`, shop `pay`, kanban `assign` (double click); `Superseded` in draft `save`, home
  `setTarget`, shop `setQuantity`; `Overloaded` in chat `send`, sync `serialize`, transfers; `Restored` in transfers,
  shop, chat; `OldVersion` in sync, draft, kanban (step 4); `NoPersistence` in session, shop, draft (step 12);
  canonical keys in transfers (bigint cents), search (bigint key, already E6), kanban; a context cycle also in
  home (zone mode feeding house) and kanban (step 13, a lazy entry bringing one, LazyFeatures.plan:38-40).

### 3. Kanban and chat consume a context nothing provides (kanban, chat, high)

- **Wrong:** `Board` consumes `member` (C544) and `Hub` consumes `session` (C646); no machine in either app provides
  them. Boot refuses a missing provider (`MissingContextProvider`), so both apps fail as written.
- **Evidence:** C543-C553, C645-C653; the refusal is tested in packages/flow-state-v3/tests/actors/context.test.ts.
- **Fix:** add the provider each product has: kanban `Workspace`, shared, ⇢ `member`; chat `Account`, shared,
  ⇢ `session` (not named `Session`, which already names machines in sign-in and session).

### 4. Two steps run before their Tasks can (Migration plan, high)

- **Wrong:** step 5 is @task.V3.T76, which is blocked by @task.V3.T77 (step 6). Step 14 is @task.V3.T29, blocked by
  @task.V3.T49 (step 16) and by @task.V3.T23, which waits on @task.V3.T22; neither T22 nor T23 has a step.
- **Evidence:** `wk show @epic.V3 --tree` (T76 "Blocked by: @task.V3.T9, @T77"; T29 "Blocked by: @T49,
  @task.V3.T23, …"; T23 "Blocked by: @T22").
- **Fix:** order the steps by the blocker graph: emits before props, inspection before Story words; add a line that
  step 14 also waits on T22 and T23.

### 5. Owners that don't build what their step adds (Migration plan, high; one item needs the user)

- **Step 1 has no owner** (C867), and fixtures.md "Not built yet" names @task.V3.T80 for the same work, whose text
  covers only the seam harness. A new Task is a scope change: **the user's decision.**
- **`subroutine` and `whenAbandoned` have no building Task.** Step 2 gives them to @task.V3.T57 (C881), whose text
  names neither, and `grep -rl subroutine packages/flow-state-v3/src` finds nothing. Four apps depend on
  `subroutine` (shop, transfers, sign-in, wizard).
- **`cancelAll` is retired** (wiki/specs/core/WriteLanes.spec R15, "deferred", revisit.md), yet C59 puts it in step 3
  for transfers, chat and draft. Machines.plan:168 and :656 still name it; that Plan text is stale too.
- **`previous` is split:** step 4 gives draft's `previous` to T56 (C893), C59 gives it to step 3 (T21), and
  Operations.plan:266-272 makes `previous` the old-key lane, which is T56's.
- **`useActor` is React** (React.plan:29, built by @task.V3.T30, minimal in T58), yet C46 places local actors at
  steps 1, 3, 5, 6 and 7. `createActor` from @task.V3.T9 is what those steps can use.
- **Step 1 uses `Flow.input` value-named actors as "U"** (C30); @task.V3.T9's own comment says they never start
  until T9 lands. Correct once step 1 waits on T9, as C868 says; the `U` cells should read `1` until then.
- **Fix:** propose the step 1 Task to the user; route `subroutine`/`whenAbandoned` to T57 by an amendment note or
  name another owner; strike `cancelAll` from C59 and step 3; put draft `previous` at 4; split C46 into
  `createActor`/`disposeActor` (step 1) and `useActor` (step 15).

### 6. The list of Task text to amend misses seven Tasks (Migration plan, medium)

- **Wrong:** C915-C924 lists T9, T24, T25, T30, T48, T49, T57, T72, T73. Also naming old fixtures: @task.V3.T20
  (`pay`), @task.V3.T21 (`cells`, `pay`, `dashboard`), @task.V3.T22 (`thermostat`, `checklist`), @task.V3.T56
  (`delivery`), @task.V3.T58 ("Pay and checkout"), @task.V3.T76 (`pager`), @task.V3.T77 (`checklist`).
- **Evidence:** `wk show @task.V3.Tn | grep` for each name.
- **Fix:** add them.

### 7. The registration plan misses most of today's hand-written lists (Existing fixtures, step 1, medium)

- **Wrong:** step 1 says "runners that read `fixtures/index.ts`" but today fixtures are picked by hand in at least
  13 places, several not in fixtures.md's runner table: packages/flow-state-v3/tests/generated/fixtures.ts (samples,
  stressSamples, mix), saved.stress.test.ts (seed table), seven `pairs-*.test.ts` files, profiles.test.ts:49,
  tests/rules/sweep.ts:23-33, bench/run.ts:21-37, tests/cli/cli.test.ts:45-53, flow.config.ts, tests/faults.ts (test
  paths by string) and vite.config.ts:228 (a lint override on `fixtures/pay/**`).
- The manifest in fixtures.md lacks what runners use today: `stressSamples`, the saved-stress seed, and the pair
  sweep's `writes`, `persisted`, `cancelsAcknowledging` and `retainsUnknown` (pairs-local.test.ts:6-7 sweeps sign-in
  and sync, which neither persist nor have lanes). That table is fixtures.md's, not under review, but step 1 can't
  be done without it.
- The layout has no slot for live adapters (`pay/shop-http.ts`, `sync/git-http.ts`, four more), which tests import.
- **Fix:** step 1 lists each hand list it replaces and the manifest fields it adds; propose the manifest fields as
  a fixtures.md change for the user; put live adapters in `services.ts` or a named `adapters/` file.

### 8. The `pay`/`cells`/`lanes` merges break ids and records (Existing fixtures to change, medium)

- **Wrong:**
  - `cells` uses `id: Pay.id` (packages/flow-state-v3/fixtures/cells/machine.ts:10). C845 puts `OneClick` beside
    `Checkout` in one app; two machines with one id can't share it.
  - C842 renames `Checkout/Pay` to `Checkout`. Persisted record names in `unreadOwed`
    (fixtures/pay/stories.ts:16-23) and tests/rules/rules.test.ts carry `Checkout/Pay`.
  - `lanes` machine ids are `Lanes/${concurrency}` (lanes/machine.ts:40); C847 doesn't say what `Remote` is named.
  - Names: `manyReceipts` is `stressManyReceipts`, a function, not a Story (transfers/stories.ts:157);
    `displacedPastItems` is `stressDisplacedPastItems` (lanes/stories.ts:255).
- **Fix:** give `OneClick` its own id; keep the `Checkout/Pay` id (it is a persisted fact) or rewrite those records
  in the same step; name the `Remote` ids; use the code's export names.

### 9. Structural stress is thin where fixtures.md asks for most (scenarios in every app, medium)

- **Wrong:**
  - S6 is always parent-first. No row ends a child first, forgets a parent, or reloads it under live children,
    except sync (C196). fixtures.md:68 asks for each order.
  - No row runs a structure under load (fixtures.md:101); S and L rows stay separate in every app.
  - S9 appears only in command-palette and wizard; none of the S1 chains (session, home, kanban, draft) names it.
  - S4 is coded only in session and chat; transfers `Account`, home `Zone` and kanban `Board` are dual-role but
    uncoded. Shop's `Shopper → Cart → CartLine` is an uncoded S1.
  - Parameters missing: "many carts", "many remotes", "several boards" and five more have no count (fixtures.md:59).
  - No app has the full E5 set (−1, 0, 2^31 − 1, 2^31). Shop's E4 "quantity 0" is not a count cap.
- **Fix:** each S6 row names its orders (`S6 × {parent first, child first, forgotten, reloaded}`); each S row
  carries its L partner (`S2 × 1,024 under L5`); add S9 to each S1 chain; give counts.

### 10. Seven citations don't show what the catalog says they copy (Sources, medium)

All 145 local citations name an existing test at the exact cited line. These don't support their sentence:

- C573 "Undo from a toast": toast.test.ts:135 is a promise toast loading then succeeding; no undo.
- C396 "Steps from empty start at 0": number-input.test.ts:176 clamps to `min: 5`; unbounded decrement gives −1.
- C475 "a changed query": App.test.tsx:642 renders one query; no change.
- C369 L5 "typing bursts under a held store": command.test.ts:155 times one keystroke on 10,000 items.
- C131 "only the last request runs": cart.test.ts:1500 asserts no abort and no request count.
- C796-C798 "quota full keeps the draft in memory": snapshot.test.ts:137 and draftStorage.unit.test.ts:94 assert
  no throw; neither checks an in-memory draft.
- C232 "export with progress": test-common.js:401 is a chunked upload.
- C14-C15 says every test name was checked, but auth-js, realtime-js, y-websocket and Cal.com have no local copy and
  no line; Zag (C456) and y-indexeddb (C745) are cited and copied by no scenario.
- **Fix:** reword each sentence to what the test shows, or cite a test that shows it (ui-sdk's toast suite for an
  undo, if one exists; otherwise "no source"); mark public-URL sources "not checked".

### 11. Some App blocks aren't whole apps, or features sit where the product wouldn't put them (realism, medium)

- command-palette: `Workbench` and `Palette` have no link, `CommandRan` has no listener, and `Workbench` is in no
  journey (C356-C364). The palette should run commands on the workbench's open documents.
- player: `Household` provides `household` (C409) and nothing consumes it.
- sign-in: `ReturnTo` is local (C261) but carries a draft across a full-page redirect (C268); local actors are never
  persisted (Persistence.plan:45). It should be shared and persisted. S1 "SignIn → CodeStep → Session" (C278) is
  not a chain: `CodeStep` is a subroutine and `Session` only hears an emit.
- draft S1 names `paragraph` (C780), which is not a machine; draft S6 (C781) spans two tabs, not one Runtime.
- Features with no journey: home `Panel` `.resumable()` (C511), draft `Section` `.resumable()` (C751), chat
  `deleteMessage` (C656), wizard `Explainer` (C437).
- wizard repeats shop's address → shipping → pay under `history`, `AddressForm` trait and a subroutine (C105-C108
  against C434-C436); fixtures.md:24 allows a new app only when no existing one can carry the feature. Its
  booking half (slot hold, a slot taken meanwhile) is what earns it a place; say so, and give the quote half a source
  or mark it "no source".
- **Fix:** as listed per item.

### 12. Clarity (all sections, low)

- Facts said more than once: `manyReceipts` registration (C233, C851, C879), player registration (C426, C859,
  C879); step 1 restates "Existing fixtures to change".
- Vague rows: "bounds (have)" (C373), "persistence on" (C398, while C70 marks number-input `.`), "persistence turned
  on (history after a reload needs step 4)" (C424, step 4 is releases), "strikes" (C194), "Pull" (C190).
- "No source" for shop's unsure charge (C129) although the header cites Stripe's 3-D Secure flow.
- `Session` names machines in sign-in and session.

## Additive growth

Criterion added by the user mid-review: existing machines, their Stories and their tests change only slightly; they
become part of a larger app as new machines are added around them, and are not rewritten. Against it the catalog
**fails in nine places.** It rewrites the three oldest machines (`Checkout/Pay`, `Git/Sync`, the `lanes` machines),
renames ids that are persisted facts, and restructures every folder at once, which breaks 106 test, bench and tool
imports of `pay`, `cells` and `lanes` alone. Each item below gives the additive alternative; where an edit to an old
machine is truly needed, it says why and keeps it to one declaration.

The rule I apply: an old machine keeps its id, states, memory and Stories; Story ids stay; a new machine reaches an
old one by holding its `actorRef` (send, read its snapshot) or by consuming context the old one already provides.
Making an old machine consume a new context is an edit, allowed only when the product can't work otherwise.

- **A1, pay → shop, `Checkout/Pay` becomes `Checkout` (C842).** Rewrites: A persisted machine id: owed records
  `owed/Checkout/Pay/…` in `unreadOwed` (fixtures/pay/stories.ts:16-23) and tests/rules/rules.test.ts. Additive: Keep
  the id `Checkout/Pay`; the app is already `shop` (pay/machine.ts:446). Rename the folder only, contents unchanged, or
  keep `pay/` as the folder of shop's checkout part.
- **A2, Checkout gains steps address → shipping → pay under `history`, `ThreeDSecure` as a subroutine in the pay step, ⇠
  `shopper` (C105-C108).** Rewrites: The structure of the oldest machine, which 29 test files import. Additive: Add a
  new `CheckoutFlow` machine with the address and shipping steps under `history`, holding a ref to the unchanged
  `Checkout/Pay` and sending it `Pay` at the last step. `ThreeDSecure` is a subroutine of `CheckoutFlow`'s pay step,
  which waits on the old machine's ending. Shopper reaches checkout through `CheckoutFlow`, not by editing Pay.
- **A3, Stories "split into the layout of fixtures.md" (C844).** Rewrites: Every pay Story's file and, if ids follow
  files, its id. Additive: Leave `stories.ts` as it is; new Stories go in new files beside it (`stories/usual.ts`, …).
  The manifest lists both. Story ids `pay/…` and `pay/stress-36` stay.
- **A4, cells merged into shop, its cell becomes `OneClick` (C845-C846).** Rewrites: Its app, and its id `Pay.id`
  collides with Checkout in one app (cells/machine.ts:10). Additive: Keep `cells` as its own app and fixture, unchanged,
  Story ids `cells/…`. One-click is a variant app of the same pay body, which the old comment already says
  (cells/machine.ts:6-7). If it must sit in shop, the one needed edit is its own id, plus re-keying its Stories'
  records: say so and do it in one commit.
- **A5, lanes merged into sync, its machines become `Remote`s under `Repo` via `.each` (C847, C180, step 2).** Rewrites:
  Three machines turned into a fragment, and their Stories moved. Additive: Keep the three `Lanes/*` machines and
  Stories unchanged as value-named actors. `Repo` is new and holds their refs (or their names as data); a rate limit
  reaches them by `send`. If a folder merge is wanted, move the files unchanged and keep ids `lanes/…`. `.each` gets its
  own new machine in `home` or `kanban`, which the catalog already has.
- **A6, sync: `Git/Sync` becomes `Remote`'s body (C849).** Rewrites: The sync machine. Additive: Keep `Git/Sync`; `Repo`
  sits beside it and sends to it. `headPushes` and `RateLimit` attach to `Repo`, not to `Git/Sync`.
- **A7, Step 1 restructures every fixture into the fixtures.md layout (C869-C870).** Rewrites: Every file path; 106
  imports for three fixtures, about 120 in all. Additive: Add `index.ts` (the manifest) to each existing folder and
  nothing else. Old files (`machine.ts`, `stories.ts`, `contracts.ts`, `server.ts`, `*-http.ts`) stay where they are;
  new machines and Stories use the new layout. fixtures.md's layout then needs one line: an existing flat file is kept.
- **A8, sign-in becomes persisted (C852, C283).** Rewrites: `SignIn`'s `persist: false` (sign-in/machine.ts:10), its
  Stories' meaning, and its pair sweep (pairs-local.test.ts:6). Additive: Keep `SignIn` as is. Persist the new `Session`
  and `ReturnTo` (finding 11 already moves `ReturnTo` to shared). Restore after a reload is then proven where the
  product needs it, with no change to the old machine.
- **A9, player: "add a level under `PLAYING`" for S1 (C421).** Rewrites: The player machine. Additive: Put the
  three-level history in a new machine (a `Queue` view or the `Household` group) or in wizard, which already has four
  levels (C447).

Edits I judge needed, each kept to one declaration, with why:

- **Context consumption on old machines:** shop's `Checkout/Pay` ⇠ `shopper` and transfers' `Bank/Transfers`
  ⇠ `customer` (C105, C213). Not needed: the new machines can hold refs instead (`CheckoutFlow` above; a new
  `Customer` that holds account refs). Where a lead still wants context, the edit is one `context` entry and no
  state changes, and the old Stories gain a provider in their setup and nothing else.
- **`Palette` local with props (C358, step 5) and `Stepper` local with props and emits (C384, step 6):** these are
  already scoped by @task.V3.T76 and @task.V3.T78, which the user approved as Tasks. Keep them additive anyway:
  declare `props` with defaults so the shared use and every existing Story still run unchanged, and add the local
  use as new Stories. No existing Story id changes.
- **`Session` adds new consumers and `Billing` (C300-C305):** additive already; no edit to `Org`, `Session`, `Team`
  or `Badge` is needed.

Fixtures with no conflict: session, command-palette (Workbench is new), number-input (OrderForm is new) and
transfers (Customer, TransferForm, Statement are new), once the context edits above are replaced by refs.

## What needs the user

- Whether `cells` and `lanes` stay their own fixtures (16 apps, not 14), which additive growth implies (A4, A5). The
  14-app list was the user's acceptance on 2026-11-17, so this is a change to an accepted record.
- A new Task for migration step 1, or which existing Task owns it (finding 5).
- The manifest fields fixtures.md must gain for the pair sweep and saved stress (finding 7).
- Whether `subroutine` and `whenAbandoned` join @task.V3.T57 (finding 5).

## Sidecar log

Seven Haiku sidecars: two source checkers (effort medium), and migration, layout, blind, coverage, and realism
reviewers (effort high). I re-ran or re-read each finding below before using it.

- **Sources A (C95-C536, 49 citations):** all at delta 0. Accepted P4 (number-input), P6 (App.test.tsx:642), P9
  (command burst), P1 (cart abort), P8 (export) after reading each body. Changed P2, P3, P7 to no finding: the
  other cited test in each row carries the claim. Accepted the public-URL note.
- **Sources B (C537-C840, 96 citations):** all at delta 0. Accepted P1 (toast undo) after reading toast.test.ts:135;
  accepted P2/P3 together as one quota item; rejected P4 (drafts keyed per document is what the row claims).
- **Migration:** accepted step 5 and step 14 inversions (wk tree), the step 1 owner gap, T56 `previous`, `useActor`
  in T30, `cancelAll` retired (read WriteLanes.spec R15), and the seven missing Tasks (grepped each). Changed the
  `Flow.input` "U" finding to low: step 1 waits on T9 already. Rejected `guarded` belonging to T21: its meaning is the
  domain's proof (EntityDomains.plan:221), so step 9 is right. Added myself: `subroutine` has no Task.
- **Layout:** accepted the 13 hand lists, missing manifest fields (read pairs-local.test.ts), `Pay.id` reuse
  (cells/machine.ts:10), persisted `Checkout/Pay` names, the lint override, and the two export names. Rejected
  "player is unregistered": it is in the generator, saved stress and bench, so the catalog's C426 means the reload
  sweep and `long` only, which is true; noted as a wording issue under finding 12.
- **Blind (58 situations, from fixtures.md and Plans only):** I checked each against the catalog. Covered: B1, B2,
  B3, B5, B6, B9 (serialize cap only), B16 (D15), B20, B22, B24, B25 (partly), B26, B28, B32, B34, B35, B36 (D18),
  B37, B39, B40, B42, B44, B45, B49 (partly), B50 (D14), B54 (partly). Not covered, now in finding 2: B4, B7, B8,
  B10, B11, B12, B13, B14, B17, B18, B19, B21, B23, B27, B29, B30, B31, B33, B38, B41, B43, B46, B47, B48, B51, B52,
  B53, B55, B56, B57, B58. Rejected none; B19 (`NonDurableContextProvider`) and B21 (scope caps) fold into finding 2.
- **Coverage:** accepted the missing families, the two short rows, and the cell-by-cell mismatches after reading the
  blocks; changed "about 60 unsupported cells" to the examples in finding 1, since several are true in substance
  (for example `armOn` where an app has a timed state). Accepted the step and matrix disagreements.
- **Realism:** accepted the kanban and chat providers (re-read C544, C646), the palette, `Household`, `ReturnTo`, the
  draft S1/S6 items, the S/L/E table, S6 orders, no structure under load, and the wizard overlap. Rejected
  "`send(ref)` in transfers bypasses the transaction": the payee `Account` receives an event and runs its own
  `transfer`, which is how the product would do it. Rejected "lane policy per remote is a test device" as a finding:
  it is odd for git, but it keeps the old `lanes` Stories in a real app with one line of justification to add.
