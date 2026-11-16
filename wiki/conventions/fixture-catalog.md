# Fixture catalog

**What it is:** the fixture apps. For each app it gives the machines, operations and journeys, the features each one
adds and at which migration step, and the scenarios with the real tests they copy. After the apps come what changes
in today's fixtures, the migration plan in Task order, and the Task text that must change. The rules for a fixture
(additive growth, folder layout, manifest, the `S`, `L` and `E` codes) are in code:wiki/conventions/fixtures.md.

**Decided (the user, 2026-11-17):**
- 16 fixtures, each growing by new machines around the old ones: `pay` (the app `shop`), `cells`, `lanes`, `sync`,
  `transfers`, `sign-in`, `session`, `command-palette`, `number-input`, `player`, `wizard`, `search`, `home`,
  `kanban`, `chat` and `draft`.
- `pay` keeps its folder, its machine ids and its Story ids; `shop` is the name of the larger app around it, as it
  already is in `pay/machine.ts`. `cells` and `lanes` stay their own fixtures.
- The toaster, menu and combobox live in `kanban`, the tree in `draft`, and the token input in `chat`.
- `subroutine` and `whenAbandoned` are built by @task.V3.T57.
- Source review: code:wiki/plans/flow/references/proposals/fixture-catalog-review-2026-11-17.md; check:
  code:wiki/plans/flow/references/proposals/fixture-catalog-check-2026-11-17.md.

**This page is a task list.** Each scenario is a checklist item. At its close, the lead of each Task marks every
item in the fixtures its step names, so the next agent starts from what is left:

- built: tick the box and end the item with "built: Story id", once its Story or sample runs and was red before
  the build;
- left: keep the box open and end the item with "left: @task.V3.Tn, needs the feature" when it uses a feature a
  later Task builds; anything buildable
  with features that exist is this Task's and is never left;
- an unmarked item in a step's fixtures fails that Task's close, and its review checks every "left" reason.

A lead takes every item marked left for its Task, then the items its step adds, and corrects a row the build
proves wrong.

**Sources** are local clones in `codebases/` (`ai`, `tus-js-client`, `hydrogen`, `tldraw`, `ui-sdk`, and `phoenix`,
which is the kamp.us app), linked at the end of this page. Each local test name below was matched at its file and
line on 2026-11-17, and each sentence says only what the test shows. A public URL marks a source with no local copy;
those are **not checked here**. A scenario with no real source says "no source" and follows its Plan rule.

## Coverage matrix

A view of the "Features by step" lists in the App blocks below; regenerate it from them, never edit a cell alone.
A cell is `U` (used today) or the migration step that adds the feature to that app; `.` means the app doesn't use
it. Steps 9 (browser), 10 (CLI) and 17 (Story words) add no feature, so no cell shows them.

`pa` pay · `ce` cells · `la` lanes · `sy` sync · `tr` transfers · `si` sign-in · `se` session · `cp` command-palette ·
`ni` number-input · `pl` player · `wz` wizard · `sr` search · `ho` home · `kb` kanban · `ch` chat · `dr` draft

| Feature (API name)                                            |pa|ce|la|sy|tr|si|se|cp|ni|pl|wz|sr|ho|kb|ch|dr|
| ------------------------------------------------------------- |--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| compound `states`                                             |1 |. |. |. |. |. |. |. |U |U |2 |. |2 |. |4 |. |
| `S.X.history`, `history.child`, `S.previous.history`          |1 |. |. |. |. |. |. |. |. |U |2 |. |. |. |. |. |
| `Flow.input` value-named actors                               |1 |. |. |1 |U |. |U |. |. |U |. |. |. |2 |4 |4 |
| `Flow.initial` computed                                       |. |. |. |. |. |1 |. |. |U |. |2 |. |2 |. |. |. |
| `Flow.private`                                                |. |. |. |1 |. |1 |. |. |. |U |. |. |. |. |. |. |
| guards, `deny`, `check`                                       |1 |. |. |U |. |U |. |U |U |. |2 |4 |. |. |. |. |
| `trait`                                                       |2 |. |. |2 |. |. |. |. |. |. |. |4 |2 |. |4 |4 |
| `whenAbandoned`                                               |4 |. |. |. |. |. |. |. |. |. |. |. |. |. |4 |4 |
| `subroutine` with exits                                       |2 |. |. |. |2 |2 |. |. |. |. |2 |. |. |. |. |. |
| `.each({ of, max, by })`                                      |2 |. |. |. |. |. |. |. |. |. |. |. |2 |2 |4 |4 |
| `.resumable()`                                                |. |. |. |. |. |. |. |. |. |. |. |. |2 |2 |. |4 |
| raise into copies                                             |2 |. |. |. |. |. |. |. |. |. |. |. |2 |2 |. |. |
| `schedules` with `armOn`                                      |U |. |. |U |U |U |. |. |U |U |2 |. |2 |. |. |. |
| `keys`, `paused`, `pausedBy`, `restartOn`, `disarmOn`         |. |. |. |2 |. |. |. |. |. |. |. |. |2 |8 |4 |4 |
| an Effect `Schedule` as `schedule`                            |. |. |. |2 |. |. |. |. |. |. |. |. |2 |. |4 |. |
| `props`, `onProps`                                            |. |. |. |. |. |. |. |5 |6 |. |. |5 |. |8 |. |. |
| `emits`, `onEmit`                                             |. |. |. |. |. |3 |. |3 |6 |. |. |5 |. |8 |. |. |
| `context`, `onContext`, `Provider.select`                     |1 |. |. |. |1 |1 |U |. |. |. |. |. |2 |2 |4 |4 |
| `ContextCycle`, `MissingContextProvider`                      |. |. |. |. |. |. |1 |. |. |. |. |. |2 |15|4 |. |
| `ConflictingActorRef`, duplicate `.each` key, missing service |1 |. |. |. |. |. |. |. |. |. |. |4 |. |2 |. |. |
| `createActor`, `disposeActor`                                 |. |. |. |. |1 |. |. |5 |6 |. |. |4 |. |2 |8 |8 |
| `useActor` (React)                                            |. |. |. |. |. |18|. |18|18|. |. |18|. |18|18|. |
| `send(ref, event)`                                            |1 |. |. |1 |1 |. |. |1 |. |1 |. |. |. |8 |. |. |
| mailbox cap, `AdmissionOverloaded`                            |. |. |1 |. |. |. |1 |. |. |. |. |. |. |. |4 |. |
| `forget`, `unsettledWrites`                                   |. |. |. |. |U |1 |. |. |. |. |. |. |. |. |. |4 |
| `late` handlers, `LateMayNotLeave`                            |4 |. |. |. |. |. |. |. |. |. |. |4 |. |. |. |4 |
| `resource`, `O.x.lookup`                                      |U |. |. |U |1 |. |. |. |6 |. |4 |4 |4 |4 |4 |4 |
| `O.x.subscribe`, `staleTime`, `gcTime`, `O.x.refetch`         |4 |. |. |. |4 |. |4 |. |. |. |. |4 |4 |4 |4 |. |
| resource `subscribe.each`                                     |. |. |. |. |. |. |. |. |. |. |. |4 |4 |4 |. |8 |
| `placeholder({ previous, input })`                            |. |. |. |. |4 |. |. |. |. |. |. |4 |. |4 |. |. |
| `O.x.setData`, `O.x.invalidate`, `O.x.clear`                  |4 |. |. |. |4 |. |4 |. |. |. |. |4 |. |. |. |. |
| `optimistic` values on a read                                 |4 |. |. |. |4 |. |4 |. |. |. |. |. |. |. |4 |. |
| `reject`, `NotSent { Rejected }`                              |U |U |. |U |U |U |. |U |. |. |4 |. |. |. |4 |. |
| `latest`, `Superseded`                                        |1 |. |U |. |. |. |. |. |6 |. |. |. |2 |2 |. |4 |
| `serialize`, `NotSent { Overloaded }`                         |. |. |1 |. |. |. |. |. |. |. |. |. |. |4 |4 |. |
| `concurrency: "cancel"`                                       |. |. |U |. |. |. |. |. |. |U |. |. |. |. |. |4 |
| `O.x.cancel`, `NotSent { Cancelled }`, `CancelMissed`         |U |U |. |. |U |U |. |. |. |. |. |. |. |. |. |4 |
| endings, `Flow.uncertain`, `unknown`                          |U |U |U |U |U |U |. |U |. |U |4 |. |2 |2 |4 |4 |
| Attempts: `O.x.retry`, `retryable`, `StillUnknown`            |U |. |U |. |U |. |. |. |. |. |. |. |. |. |. |4 |
| `NotSent { Restored }`, `unknown { Restored }`                |U |. |. |. |U |. |. |. |. |. |. |. |. |. |4 |. |
| `StorageRefused`, `NoPersistence`                             |13|. |. |. |U |. |1 |. |. |. |. |. |. |. |. |13|
| `NotSent { OldVersion }`                                      |. |. |7 |. |. |. |. |. |. |. |. |. |. |7 |. |7 |
| `NotSent { Disposed }`, `unknown { Disposed }`                |. |1 |. |. |U |. |. |. |. |. |. |. |. |. |4 |. |
| `notSent:`, `otherwise`, `Flow.ignore`, mapper `Defect`       |1 |. |. |. |. |. |. |. |. |. |. |4 |. |2 |. |. |
| canonical keys, `InvalidKey`, `KeyOmitsInput`                 |. |. |U |. |1 |. |. |. |. |. |. |4 |. |. |. |. |
| `progress`                                                    |. |. |. |. |4 |. |. |. |. |. |. |. |. |. |4 |4 |
| `previous` holds, `O.x.previous`                              |. |. |7 |. |7 |. |. |. |. |. |. |. |. |. |. |7 |
| `idempotency`                                                 |4 |. |. |. |4 |. |. |. |. |. |. |. |. |. |4 |. |
| `guarded`                                                     |. |. |. |. |11|. |. |. |. |. |. |. |. |11|11|. |
| owed endings, quarantine                                      |U |. |. |. |U |. |. |. |. |. |. |. |. |. |4 |4 |
| `stream` `delivers: "every"`, `position`, `catchUp`           |. |. |. |. |12|. |. |. |. |. |. |. |. |12|12|12|
| `delivers: "latest"`, `Feed.callback`, `dropAt`               |. |. |. |12|. |. |. |. |. |12|. |. |12|. |12|. |
| `reconnect`, `idleTime`, `Flapping`, `ReleaseOverdue`         |. |. |. |. |. |. |. |. |. |. |. |. |12|. |12|12|
| `Feed.live` proof, `missed` (`Unproven`, `Lost`, `Reset`)     |. |. |. |. |. |. |. |. |. |. |. |. |12|. |12|12|
| `Feed.multiplex`, `DuplicateSession`, `UnplacedStream`        |. |. |. |. |. |. |. |. |. |. |. |. |12|12|12|. |
| `entity`, `domain`, `read(...).list`/`.one`/`.byKey`          |. |. |. |. |11|. |. |. |. |. |. |. |. |11|11|. |
| `predicts`, repair, `basedOn`                                 |. |. |. |. |11|. |. |. |. |. |. |. |. |11|11|. |
| `.gone` tombstones                                            |. |. |. |. |11|. |. |. |. |. |. |. |. |11|11|. |
| `pagedBy`, `more`                                             |. |. |. |. |11|. |. |. |. |. |. |. |. |11|11|. |
| `persist`, restore, reload                                    |U |U |U |. |U |1 |U |U |. |. |2 |. |2 |2 |4 |4 |
| release versions, saved-shape reset, migration                |. |. |. |7 |7 |7 |. |. |. |. |7 |. |. |7 |. |7 |
| multi-tab ownership (Web Lock, second tab)                    |14|. |. |. |. |. |14|. |. |. |. |. |. |. |. |14|
| storage failures: corrupt, quota, slow read, non-durable      |13|. |. |. |. |. |1 |. |. |. |. |. |. |. |. |13|
| Runtime per scope, `dispose`                                  |. |. |. |. |. |. |1 |. |. |. |. |. |. |. |4 |4 |
| lazy entries `{ id, load }`, adoption, dormant records        |. |. |. |. |. |. |15|. |. |. |15|. |. |15|. |. |
| `EntryMismatch`, a failed load, a send to an unadopted entry  |. |. |. |. |. |. |15|. |. |. |15|. |. |15|. |. |
| server rendering, hydration                                   |18|. |. |. |. |. |18|. |. |. |. |18|. |18|. |. |
| `DehydrateCommitInFlight`, `DehydrateUnsettled`, `Hydration*` |18|. |. |. |. |. |18|. |. |. |. |18|. |18|. |. |
| `inspect`, `trace.export`/`trace.import`, sinks, redaction    |16|. |. |. |16|16|. |. |. |. |. |. |16|. |16|. |

## Fixtures

Notation in App blocks:
- **shared** is an app actor (`actorRef`); **local** is a `createActor` actor.
- `◂ X` means a part of `X` (by `.each`, a trait or a `subroutine`).
- `⇢ ctx` provides context; `⇠ ctx` consumes it. Every consumed context has its provider in the same app.
- **R** is a `resource`, **T** a `transaction`, **S** a `stream`.
- "(have)" marks a machine or operation that exists today and stays as it is; `(step n)` marks when a new one comes.

Scenario sources use the reference links at the end of the page, with a line number and the test name as written.

### pay (the app `shop`)

A storefront: product page, cart and checkout, grown around today's checkout. Source: Shopify Hydrogen's cart;
Stripe's 3-D Secure flow (<https://docs.stripe.com/payments/3d-secure>, not checked here).

- **Machines:**
  - `Checkout/Pay` (have), shared per cart. It stays as it is.
  - `Shopper` (step 1), shared, ⇢ `shopper`.
  - `Cart` (step 1), shared, named by shopper, ⇠ `shopper`. From step 2, `CartLine` ◂ `Cart` via `.each`.
  - `CartBadge` (step 1), shared, holding a ref to `Cart` and reading its snapshot.
  - `CheckoutFlow` (step 1), shared per cart, ⇠ `shopper`. Its steps are address → shipping → pay under `history`;
    it holds a ref to `Checkout/Pay` and sends it `CardChosen` and `PayRequested`. From step 2, `AddressForm` is a
    trait on its address step and `ThreeDSecure` a `subroutine` in its pay step.
  - `ProductPage` (step 18), local, server rendered.
- **Operations:**
  - R: `intentStatus` (have), `orderForCart` (have), `product` (step 4), `cart` (step 4), `addressLookup` (step 4).
  - T: `pay`, `placeOrder`, `voidAuthorization` (have, `reject`); `addLine` (step 1; `idempotency` by line id from
    step 4); `setQuantity` (step 1, `latest` per line key).
- **Journeys:**
  1. Browse: R `product` → T `addLine` → `CartBadge` shows the line.
  2. Edit: quantity edits on one line, `latest` per line.
  3. Checkout: address (R `addressLookup`) → shipping → Back → `Checkout/Pay` pays → unknown → R `intentStatus` →
     T `placeOrder` → `invalidate` R `orderForCart`.
  4. Challenge: `ThreeDSecure` opened, closed, or reloaded mid-challenge.
  5. Two tabs: a second tab pays the same cart.
- **Features by step:**
  - **used today:** `schedules` with `armOn` (`Checkout/Pay`'s recheck schedule); `resource`, `O.x.lookup` (R
    `intentStatus`, `orderForCart`); `reject`, `NotSent { Rejected }` (T `pay` (`busyRefused`)); `O.x.cancel`, `NotSent
    { Cancelled }`, `CancelMissed` (`Checkout/Pay` voids); endings, `Flow.uncertain`, `unknown` (`Checkout/Pay`);
    Attempts: `O.x.retry`, `retryable`, `StillUnknown` (`Checkout/Pay` checks again); `NotSent { Restored }`, `unknown {
    Restored }` (`lostConfirm`, `unreadOwed`); owed endings, quarantine (`Checkout/Pay`); `persist`, restore, reload
    (`Checkout/Pay`).
  - **step 1:** compound `states` (`CheckoutFlow`'s address, shipping and pay steps); `S.X.history`, `history.child`,
    `S.previous.history` (Back into `CheckoutFlow`'s shipping step restores its sub-step); `Flow.input` value-named
    actors (`Cart`, named by shopper); guards, `deny`, `check` (`CheckoutFlow` checks the cart isn't empty); `context`,
    `onContext`, `Provider.select` (`Cart` and `CheckoutFlow` ⇠ `shopper`); `ConflictingActorRef`, duplicate `.each`
    key, missing service (a second `Cart` ref with another shopper, refused); `send(ref, event)` (`CheckoutFlow` sends
    `CardChosen` and `PayRequested` to `Checkout/Pay`); `latest`, `Superseded` (T `setQuantity`, `latest` per line key);
    `notSent:`, `otherwise`, `Flow.ignore`, mapper `Defect` (T `addLine` maps `notSent:` to a line error).
  - **step 2:** `trait` (`AddressForm` on `CheckoutFlow`'s address step); `subroutine` with exits (`ThreeDSecure` in
    `CheckoutFlow`'s pay step); `.each({ of, max, by })` (`CartLine` ◂ `Cart`); raise into copies ("clear cart" raised
    into `CartLine`s).
  - **step 4:** `whenAbandoned` (`AddressForm` ends R `addressLookup` when the step is left); `late` handlers,
    `LateMayNotLeave` (`CheckoutFlow` hears a late `addressLookup` ending); `O.x.subscribe`, `staleTime`, `gcTime`,
    `O.x.refetch` (R `product`, R `cart`); `O.x.setData`, `O.x.invalidate`, `O.x.clear` (`invalidate` R `orderForCart`
    after `placeOrder`); `optimistic` values on a read (T `addLine` and `setQuantity` on R `cart`); `idempotency` (T
    `addLine` keyed by line id).
  - **step 13:** `StorageRefused`, `NoPersistence` (quota refuses a checkout write); storage failures: corrupt, quota,
    slow read, non-durable (quota at checkout).
  - **step 14:** multi-tab ownership (Web Lock, second tab) (a second tab pays the same cart).
  - **step 16:** `inspect`, `trace.export`/`trace.import`, sinks, redaction (card details redacted in the checkout
    trace).
  - **step 18:** server rendering, hydration (`ProductPage`); `DehydrateCommitInFlight`, `DehydrateUnsettled`,
    `Hydration*` (a request rendered while `addLine` is in flight (`DehydrateCommitInFlight`)).
- **Scenarios:**
  - **Usual:**
    - [ ] Checkout with an unsure charge, a recheck, then an order (have: `usual`). Source: Stripe's flow, not checked.
    - [ ] An add shows a line at once. Copies [cart.test.ts:4535][hy-cart] "empty cart: optimistic placeholder line
      appears immediately on add".
  - **Load:**
    - [ ] L5: two quick clicks on one line; once the latest answer lands, the line is no longer pending. Copies
      [cart.test.ts:1500][hy-cart] "rapid clicks abort prior request, only last executes".
    - [ ] L1 × 64 carts each mid-pay under L3 (have: `seededStress`, `long`).
  - **Structure:**
    - [ ] S1: `Shopper` → `Cart` → `CartLine` → `CartBadge`, with S9 at a line.
    - [ ] S2: 1,000 `CartLine`s under L5, with "clear cart" raised.
    - [ ] S3: 64 shoppers under L3.
    - [ ] S6 × {cart first, flow first, shopper forgotten, reloaded} with a challenge open.
    - [ ] S7: a second `Cart` ref with another shopper, refused.
    - [ ] Switching carts cancels the old cart's in-flight refresh. Copies [cart.test.ts:1949][hy-cart] "hydrating a
      different cart cancels in-flight authoritative revalidation".
    - [ ] Restoring the same cart id is a no-op. Copies [cart.test.ts:673][hy-cart] "no-ops when same cart ID already
      hydrated".
  - **Edges:**
    - [ ] E1: the empty cart before load. Copies [cart.test.ts:717][hy-cart] "returns EMPTY_CART_STATE before
      hydration".
    - [ ] Quantity 0 removes the line. Copies [cart.test.ts:951][hy-cart] "decrease to zero routes to remove (quantity:
      0)".
    - [ ] E4: 1,000 lines and one past the cart's `max`. E5: the recheck delay at −1, 0, 2^31 − 1 and 2^31 ms.
    - [ ] E7: an owed record of a newer format (have: `unreadOwed`). E8: a reload mid-charge, mid-challenge and mid-add.
  - **Combinations:**
    - [ ] A change that fails while the first load is in flight restores the loaded cart. Copies
      [cart.test.ts:5971][hy-cart] "restores the loaded cart after a change that fails while the first load is in
      flight".
    - [ ] Context with persistence and lanes; quota at checkout (step 13); two tabs (step 14); a server-rendered page
      with an add in flight (step 18).
  - [ ] **Variety:** a full checkout against `cells`' one-click; a guest shopper against a signed-in one.
  - **Findings:**
    - [ ] A rejected add removes only its own line. Copies [cart-transactions.test.ts:210][hy-tx] "removes only a
      rejected unkeyed add transaction" and [cart.test.ts:4583][hy-cart] "empty cart add: optimistic line removed on
      reject".
    - [ ] One line's request never aborts another's. Copies [cart-transactions.test.ts:378][hy-tx] "does not let one
      keyed line abort an unrelated line" and [cart.test.ts:1530][hy-cart] "cross-line independence: line A mutation
      does not cancel line B".
    - [ ] A failing line rolls back alone. Copies [cart.test.ts:1579][hy-cart] "concurrent rollback: failing line A does
      not clobber line B".
    - [ ] A stale snapshot never brings back a removed line. Copies [cart.test.ts:1630][hy-cart] "concurrent removes: a
      stale out-of-order snapshot does not resurrect removed lines".
    - [ ] Stale overlapping add answers merge only their own lines. Copies [cart-transactions.test.ts:253][hy-tx]
      "merges only add-owned lines from stale overlapping add responses".
    - [ ] The checkout trace waits for the cart to settle. Copies [cart-tracker.test.ts:543][hy-track] "ignores pending
      cart state until the cart settles".

### cells

A one-click checkout: a client-side cell over pay's body. Kept as it is. Source: no source.

- **Machines:** the cell (have, id `Checkout/Pay` in its own app).
- **Operations:** pay's `pay` contract (have), with `AbortPay`.
- **Journeys:** 1. One click: pay → abort or succeed.
- **Features by step:**
  - **used today:** `reject`, `NotSent { Rejected }` (the cell's pay body); `O.x.cancel`, `NotSent { Cancelled }`,
    `CancelMissed` (`AbortPay`); endings, `Flow.uncertain`, `unknown` (the cell); `persist`, restore, reload (the cell).
  - **step 1:** `NotSent { Disposed }`, `unknown { Disposed }` (the cell disposed mid-pay).
- **Scenarios:** usual, `long` and `seededStress` (have). New: the cell disposed mid-pay (S6 × {disposed, reloaded}
  under L3). E1: an empty cart id; E3: a cart id at and past the key bound.

### lanes

A sync client whose three remotes differ only in lane policy. Kept as it is. Source: no source.

- **Machines:** `Lanes/latest`, `Lanes/serialize`, `Lanes/cancel` (have).
- **Operations:** T `sync` under each policy (have).
- **Journeys:** 1. Commit: rapid commits under each policy.
- **Features by step:**
  - **used today:** `latest`, `Superseded` (`Lanes/latest` (`stressDisplacedPastItems`)); `concurrency: "cancel"`
    (`Lanes/cancel` (`displacedOnWire`)); endings, `Flow.uncertain`, `unknown` (every `Lanes/*`); Attempts: `O.x.retry`,
    `retryable`, `StillUnknown` (every `Lanes/*` retry); canonical keys, `InvalidKey`, `KeyOmitsInput` (`atStringBound`;
    canonical forms added at step 1); `persist`, restore, reload (persisted lanes).
  - **step 1:** mailbox cap, `AdmissionOverloaded` (1,024 events to one `Lanes/*` actor); `serialize`, `NotSent {
    Overloaded }` (`Lanes/serialize` past 64 queued).
  - **step 7:** `NotSent { OldVersion }` (release 2 changes the `sync` key fingerprint); `previous` holds,
    `O.x.previous` (the old-key lane held under release 2).
- **Scenarios:**
  - [ ] **Usual and load:** `usual`, `seededStress`, `nearBound` (12 queued) (have).
  - [ ] **Load:** L2: 64 queued commits under `serialize`, then one more ending `NotSent { Overloaded }`; 1,024 events
    to one actor, then one more refused `AdmissionOverloaded`.
  - [ ] **Structure:** S3: the same key under two actors; S6 × {disposed, reloaded} with queued, held and running
    commits of several keys.
  - [ ] **Edges:** E3: `atStringBound` (have) and past it; `Unencodable` (have). Canonical keys: one key in NFC and
    decomposed forms, and `-0` against `0`, restored as one lane.
  - [ ] **Combinations:** release 2 changes the key fingerprint: a held lane ends `NotSent { OldVersion }` and the old
    lane is held as `previous` (step 7).
  - [ ] **Findings:** `stressDisplacedPastItems` and `displacedOnWire` (have).

### sync

A git client, grown with a repo around today's sync machine. Source: no source; the 4xx rule copies kamp.us's live
retry.

- **Machines:**
  - `Git/Sync` (have), shared.
  - `Repo` (step 1), shared, named by repo, holding a `Flow.private` token and a ref to `Git/Sync`; it sends
    `SyncRepo` and `Pushed`.
  - `RateLimit` (step 2), a trait on `Repo`.
- **Operations:** T `sync` (have); R `remoteHead` (have); S `headPushes` (step 12, `latest`, into `Repo`).
- **Journeys:**
  1. Commit: `Repo` sends `SyncRepo`.
  2. Rate limited: `RateLimit` pauses `Repo`'s schedules (`pausedBy`) with an exponential `Schedule`.
  3. Pushed: S `headPushes` → `Repo` sends `Pushed` → R `remoteHead` refetch.
- **Features by step:**
  - **used today:** guards, `deny`, `check` (`O.sync.idle`); `schedules` with `armOn` (the computed backoff);
    `resource`, `O.x.lookup` (R `remoteHead`); `reject`, `NotSent { Rejected }` (T `sync`); endings, `Flow.uncertain`,
    `unknown` (`Git/Sync`).
  - **step 1:** `Flow.input` value-named actors (`Repo`, named by repo); `Flow.private` (`Repo`'s token); `send(ref,
    event)` (`Repo` sends `SyncRepo` and `Pushed` to `Git/Sync`).
  - **step 2:** `trait` (`RateLimit` on `Repo`); `keys`, `paused`, `pausedBy`, `restartOn`, `disarmOn` (`RateLimit`'s
    `pausedBy` while limited); an Effect `Schedule` as `schedule` (`RateLimit`'s exponential `Schedule`).
  - **step 7:** release versions, saved-shape reset, migration (release 2 of `Repo`).
  - **step 12:** `delivers: "latest"`, `Feed.callback`, `dropAt` (S `headPushes` into `Repo`).
- **Scenarios:**
  - [ ] **Usual:** sync, peek (have).
  - [ ] **Load:** L1 × 64 repos with repeated rate limits under L3 (have in part: `seededStress`).
  - [ ] **Structure:** S3 × 64 repos; S6 × {repo first, sync first, reloaded} during a backoff.
  - [ ] **Edges:** E5: a retry-after of −1, 0, 2^31 − 1 and 2^31 ms. E1: an empty repo name.
  - [ ] **Combinations:** release 2 of `Repo` (step 7); pushes (step 12).
  - [ ] **Variety:** pushed against polled.
  - [ ] **Findings:** a 4xx that isn't a rate limit is not retried. Copies [liveRetry.unit.test.ts:27][kp-retry] "does
    NOT retry a genuine 4xx app error".

### transfers

A bank app grown around today's account machine. Source: tus-js-client for a cheque deposit's chunked upload;
kamp.us for rows restored after a failure.

- **Machines:**
  - `Bank/Transfers` (have), shared, named by account.
  - `Customer` (step 1), shared, ⇢ `customer`, holding refs to the accounts.
  - `TransferForm` (step 1), local, ⇠ `customer`. From step 2, `StepUp` is a `subroutine` in it.
  - `ChequeDeposit` (step 4), shared, named by deposit, ⇠ `customer`.
  - `Statement` (step 11), local, ⇠ `customer`.
- **Operations:**
  - T: `transfer` (have, `reject`; from step 4 it declares `idempotency` by transfer id, the one edit to an old
    contract, since a money write must name the server's key); `depositCheque` (step 4, `progress`).
  - R: `balance` (step 1); `transfers` (step 11, a domain with `pagedBy`).
  - S: `notifications` (step 12, `every`, `catchUp`).
- **Journeys:**
  1. Send: `TransferForm` → `Customer` sends `Send` to the source account → an optimistic balance → `invalidate`
     R `balance`.
  2. Lost answer: lost → owed → reload → receipt (have).
  3. Large amount: `StepUp` first.
  4. Deposit: photograph a cheque → T `depositCheque` with `progress`, aborted and resumed.
  5. Catch-up: notifications after the app was closed.
- **Features by step:**
  - **used today:** `Flow.input` value-named actors (`Bank/Transfers`, named by account); `schedules` with `armOn` (the
    deadline); `forget`, `unsettledWrites` (`forgotten`); `reject`, `NotSent { Rejected }` (T `transfer`); `O.x.cancel`,
    `NotSent { Cancelled }`, `CancelMissed` (abandon); endings, `Flow.uncertain`, `unknown` (`Bank/Transfers`);
    Attempts: `O.x.retry`, `retryable`, `StillUnknown` (resend once); `NotSent { Restored }`, `unknown { Restored }`
    (`lostThenReload`); `StorageRefused`, `NoPersistence` (`refusedWrite`); `NotSent { Disposed }`, `unknown { Disposed
    }` (`heldAtDisposal`); owed endings, quarantine (`quarantined`, receipts); `persist`, restore, reload
    (`Bank/Transfers`).
  - **step 1:** `context`, `onContext`, `Provider.select` (`TransferForm` ⇠ `customer`); `createActor`, `disposeActor`
    (`TransferForm`, a local actor); `send(ref, event)` (`Customer` sends `Send` to the source account); `resource`,
    `O.x.lookup` (R `balance`); canonical keys, `InvalidKey`, `KeyOmitsInput` (account names in NFC and decomposed
    forms; cents as bigint).
  - **step 2:** `subroutine` with exits (`StepUp` in `TransferForm`).
  - **step 4:** `O.x.subscribe`, `staleTime`, `gcTime`, `O.x.refetch` (R `balance`); `placeholder({ previous, input })`
    (R `balance` on an account switch); `O.x.setData`, `O.x.invalidate`, `O.x.clear` (`invalidate` R `balance` after T
    `transfer`); `optimistic` values on a read (a pending balance on R `balance`); `progress` (T `depositCheque` in
    `ChequeDeposit`); `idempotency` (T `transfer` by transfer id (one-line edit)).
  - **step 7:** `previous` holds, `O.x.previous` (a held transfer under a changed key); release versions, saved-shape
    reset, migration (release 2 of `Customer`).
  - **step 11:** `guarded` (a record version ends an unknown transfer); `entity`, `domain`,
    `read(...).list`/`.one`/`.byKey` (R `transfers` domain); `predicts`, repair, `basedOn` (a pending transfer
    predicted); `.gone` tombstones (a cancelled scheduled transfer); `pagedBy`, `more` (statement pages).
  - **step 12:** `stream` `delivers: "every"`, `position`, `catchUp` (S `notifications`).
  - **step 16:** `inspect`, `trace.export`/`trace.import`, sinks, redaction (account numbers redacted).
- **Scenarios:**
  - [ ] **Usual:** send, decline, lose the answer, resend once, abandon (have). A deposit sent in chunks, each reported.
    Copies [test-common.js:401][tus-common] "should upload a file in chunks".
  - [ ] **Load:** L1 × 64 accounts with owed endings at boot under L4. `largeReceipts` (have); `stressManyReceipts`
    (have, registered with no runner yet).
  - **Structure:**
    - [ ] S1: `Customer` → `TransferForm` → `StepUp`, with S9 inside `StepUp`.
    - [ ] S3 × 64 accounts, one forgotten or quarantined while the rest reload.
    - [ ] S6 × {account first, customer first, forgotten, reloaded} during a deposit.
    - [ ] A large deposit split into parts, one failing. Copies [test-parallel-uploads.js:41][tus-parallel] "should
      split a file into multiple parts and create an upload for each" and [test-parallel-uploads.js:325][tus-parallel]
      "should emit error from a partial upload".
  - [ ] **Edges:** E6: cents 0, negative and above 2^53, as bigint. E3: a transfer id at the key bound. E2: `null` and
    `undefined` payloads. E8: a reload mid-deposit.
  - [ ] **Combinations:** a read after a write (an older `balance` answer loses); releases (step 7); notifications (step
    12).
  - [ ] **Variety:** a shared account against a local form.
  - **Findings:**
    - [ ] A deposit aborted, then resumed from its parts. Copies [test-parallel-uploads.js:448][tus-parallel] "should
      abort all partial uploads and resume from them".
    - [ ] A failed reversal restores the row and carries its code. Copies [optimisticPostDelete.test.ts:21][kp-pdel]
      "POST_DELETE_FAILED restores the post and carries the code for the inline error (#1639)".

### sign-in

Email-code sign-in, grown with a persisted session around today's unpersisted screen. Source: kamp.us's auth page
and draft round-trip; Supabase auth-js (<https://github.com/supabase/auth-js/blob/master/test/GoTrueClient.test.ts>,
not checked here).

- **Machines:**
  - `Auth/SignIn` (have), shared, unpersisted. It stays as it is.
  - `AuthSession` (step 1), shared, persisted, ⇢ `session`, holding a ref to `Auth/SignIn`. From step 2, `Reauth`
    is a `subroutine` in it; from step 3 it hears `SignedIn`.
  - `ReturnTo` (step 1), shared, persisted, ⇠ `session`, holding the route and draft to resume.
  - `PasswordSignIn` (step 7), shared, release 2.
- **Operations:** T `begin`, `verify` (have, `reject`); T `setUsername` (step 1); R `me` (step 1).
- **Journeys:**
  1. Sign in: email → T `begin` → code → T `verify` → `SignedIn` → R `me`.
  2. Resend: under cooldown and lockout (have).
  3. Return: a draft goes through the auth redirect and back with `ReturnTo`.
  4. Handle: T `setUsername`, the redirect held until it succeeds.
  5. Sign out: `forget` `AuthSession`.
- **Features by step:**
  - **used today:** guards, `deny`, `check` (`Auth/SignIn`); `schedules` with `armOn` (cooldown and lockout); `reject`,
    `NotSent { Rejected }` (T `begin`, `verify`); `O.x.cancel`, `NotSent { Cancelled }`, `CancelMissed` (`Auth/SignIn`);
    endings, `Flow.uncertain`, `unknown` (`Auth/SignIn`).
  - **step 1:** `Flow.initial` computed (`AuthSession`'s handle from the email); `Flow.private` (`AuthSession`'s refresh
    token); `context`, `onContext`, `Provider.select` (`ReturnTo` ⇠ `session`); `forget`, `unsettledWrites` (sign-out
    forgets `AuthSession`); `persist`, restore, reload (`AuthSession`, `ReturnTo`).
  - **step 2:** `subroutine` with exits (`Reauth` in `AuthSession`).
  - **step 3:** `emits`, `onEmit` (`SignedIn`, heard by `AuthSession`).
  - **step 7:** release versions, saved-shape reset, migration (release 2 adds `PasswordSignIn`).
  - **step 16:** `inspect`, `trace.export`/`trace.import`, sinks, redaction (schedule and emit events).
  - **step 18:** `useActor` (React) (Strict Mode).
- **Scenarios:**
  - [ ] **Usual:** sign in with a code (have). A retried handle save releases the held redirect. Copies
    [AuthPage.test.tsx:89][kp-auth] "retry on the stuck surface re-attempts and, on success, RELEASES the redirect".
  - [ ] **Load:** L1 × 16 screens for different accounts, one in lockout while another verifies; L4 during a lockout.
  - [ ] **Structure:** S3 × 16 accounts; S6 × {session first, screen first, forgotten, reloaded} while `Reauth` runs,
    with S9 inside `Reauth`.
  - **Edges:**
    - [ ] A blank handle never calls the server. Copies [AuthPage.test.tsx:164][kp-auth] "a blank username field never
      touches setUsername and never holds the gate".
    - [ ] E1: an empty email and a code of 0 characters. E3: an email past its byte bound. E5: a lock delay at −1, 0,
      2^31 − 1 and 2^31 ms.
  - [ ] **Combinations:** release 2 (step 7); Strict Mode (step 18).
  - [ ] **Variety:** an unedited prefilled handle needs confirming. Copies [UsernameBootstrap.test.tsx:32][kp-boot]
    "does NOT commit the unedited email prefill on the first submit — it asks to confirm".
  - **Findings:**
    - [ ] A failed handle save holds the redirect and keeps the handle. Copies [AuthPage.test.tsx:72][kp-auth] "parks on
      a retryable surface and HOLDS the redirect when setUsername fails — the handle is not dropped".
    - [ ] Starting the gate twice is a no-op. Copies [signupUsernameGate.test.tsx:34][kp-gate] "is idempotent: a second
      begin/end is a no-op, not a toggle".
    - [ ] A draft survives the redirect, then clears on submit. Copies [draftStorage.unit.test.ts:45][kp-draft]
      "survives the signed-out → auth-redirect → return round-trip, then clears on submit (AC1+AC2)".

### session

A workspace shell. Today's four machines stay; billing and reads are added. Source: kamp.us's app shell and snapshot.

- **Machines:**
  - `Workspace/Org` (have), ⇢ `org`; `Workspace/Session` (have), ⇠ `org` ⇢ `user`; `Workspace/Team` (have),
    ⇠ `user` ⇢ `team`; `Workspace/Badge` (have), ⇠ `team`.
  - `Billing` (step 15), a lazy entry, ⇠ `org`.
- **Operations:** T `signIn` (have); R `profile`, `teams` (step 4); T `renameTeam` (step 4); T `updatePlan`
  (step 15).
- **Journeys:**
  1. Boot: org → session → teams → badges.
  2. Rename a team: `optimistic` on R `teams`.
  3. Billing: lazy adoption → T `updatePlan`.
  4. Sign out: `clear` → a new Runtime for the next account.
  5. Another tab signs out.
- **Features by step:**
  - **used today:** `Flow.input` value-named actors (`Workspace/Session` refs); `context`, `onContext`,
    `Provider.select` (`Org` → `Session` → `Team` → `Badge`); `persist`, restore, reload (the workspace).
  - **step 1:** `ContextCycle`, `MissingContextProvider` (a cycle and a missing provider as Stories); mailbox cap,
    `AdmissionOverloaded` (1,024 sends to one `Badge`); `StorageRefused`, `NoPersistence` (a failed storage read:
    `NoPersistence`); storage failures: corrupt, quota, slow read, non-durable (a corrupt record; a non-durable
    provider); Runtime per scope, `dispose` (a new Runtime per account).
  - **step 4:** `O.x.subscribe`, `staleTime`, `gcTime`, `O.x.refetch` (R `profile`); `O.x.setData`, `O.x.invalidate`,
    `O.x.clear` (`clear` on sign-out); `optimistic` values on a read (T `renameTeam` on R `teams`).
  - **step 14:** multi-tab ownership (Web Lock, second tab) (another tab signs out).
  - **step 15:** lazy entries `{ id, load }`, adoption, dormant records (`Billing`); `EntryMismatch`, a failed load, a
    send to an unadopted entry (`Billing`'s failed load and `EntryMismatch`).
  - **step 18:** server rendering, hydration (the shell); `DehydrateCommitInFlight`, `DehydrateUnsettled`, `Hydration*`
    (a shell rendered for one user hydrated under another).
- **Scenarios:**
  - [ ] **Usual:** two four-layer trees, a reload, a middle-layer rename (have). The shell paints before the session
    settles. Copies [App.test.tsx:217][kp-app] "invariant 1: the shell chrome paints while the session is isPending —
    with NO FateClient mounted".
  - [ ] **Load:** L5: context waves under a held store (have, in `seededStress`). L2: 1,024 sends to one badge.
  - **Structure:**
    - [ ] S1 × {4 (have), 8, 32} under L5, with S9 at the deepest badge.
    - [ ] S2 × {24 (have: `fanOut`), 64, 1,024} under L5.
    - [ ] S3: two roots (have). S4: the team (have). S5: `guestTeam` (have).
    - [ ] S6 × {parent first (have: `parentUnderChildren`), child first, forgotten, signed out, reloaded}.
    - [ ] S7: a cycle and a missing provider as Stories.
  - **Edges:**
    - [ ] E2: an undefined user. E1: an empty user. E4: consumers at and past the cap.
    - [ ] E7: a corrupt saved record. Copies [snapshot.test.ts:108][kp-snap] "returns null on a corrupt (non-JSON)
      payload, no throw".
    - [ ] E3: an oversized record refused unread. Copies [snapshot.test.ts:123][kp-snap] "returns null on an oversized
      payload without parsing it".
  - **Combinations:**
    - [ ] An identity switch drops the old identity's saved data. Copies [App.test.tsx:692][kp-app] "AC3: an identity
      switch A→B tears down the PREVIOUS identity's snapshot" and [App.test.tsx:711][kp-app] "AC3: sign-out / account
      deletion (A→signed-out) tears down A's snapshot".
    - [ ] A record written under one user never restores under another. Copies [snapshot.test.ts:364][kp-snap] "a
      snapshot written under user A does NOT hydrate under user B".
    - [ ] A failed storage read with a sign-in queued (see @plan.Pending.D17).
  - [ ] **Variety:** eager and lazy entries; singleton and keyed providers.
  - **Findings:**
    - [ ] A signed-out boot restores nothing signed-in. Copies [App.test.tsx:725][kp-app] "identity-scoped: a signed-out
      settle hydrates NO authed snapshot (anon owns none)".
    - [ ] A boot with no host page degrades without throwing. Copies [boot.test.ts:24][kp-flags] "returns undefined when
      there is no window (outage fallback / flag off) — no throw".
    - [ ] A context update at the follow-up cap waits (@plan.Pending.D13).

### command-palette

An editor's command palette, grown with a workbench around it. Source: ui-sdk's command tests.

- **Machines:**
  - `Palette/Palette` (have), shared. From step 3 it emits `CommandRan`; from step 5 it declares `props` with
    defaults, so every existing Story runs unchanged and new Stories use it as a local actor.
  - `Workbench` (step 1), shared, holding the open documents and a ref to the palette; it sends `Configure` with
    one command per document, and from step 3 hears `CommandRan` and opens that document.
- **Operations:** T `runCommand` (have).
- **Journeys:**
  1. Run: open → type → highlight → T `runCommand` → `Workbench` opens the document.
  2. Pages: frames with Back.
  3. Live list: `Workbench` sends a new list mid-search.
- **Features by step:**
  - **used today:** guards, `deny`, `check` (`Palette/Palette`'s `deny`); `reject`, `NotSent { Rejected }` (T
    `runCommand`); endings, `Flow.uncertain`, `unknown` (`Palette/Palette`); `persist`, restore, reload
    (`Palette/Palette`).
  - **step 1:** `send(ref, event)` (`Workbench` sends `Configure` to the palette).
  - **step 3:** `emits`, `onEmit` (`CommandRan`, heard by `Workbench`).
  - **step 5:** `props`, `onProps` (commands as `props`, with defaults); `createActor`, `disposeActor` (a local
    palette).
  - **step 18:** `useActor` (React) (Strict Mode).
- **Scenarios:**
  - [ ] **Usual:** open, search, run (have). Pages are the items of their command. Copies
    [command.test.ts:193][ui-command] "pages are the items of the command with that value".
  - [ ] **Load:** 1,000 and 4,097 entries (have). One keystroke over 10,000 entries ranks within a frame. Copies
    [command.test.ts:155][ui-command] "10,000 items: a fuzzy keystroke stays well under a frame". Typing bursts under a
    held store: no source.
  - [ ] **Structure:** S1: frames 1, 8 and 64 deep with Back and Escape through all of them, and S9 at the deepest; S3:
    two palettes, each with its own workbench.
  - [ ] **Edges:** an empty query keeps the source order. Copies [command.test.ts:120][ui-command] "an empty query keeps
    the source order". E3 and E4: the entry bounds (have: `pastBound`, `overBound`).
  - [ ] **Combinations:** the pair sweep (have: `pairs-persisted`); Strict Mode (step 18).
  - [ ] **Variety:** a shared and a local palette.

### number-input

An order form of steppers, grown around today's stepper. Source: ui-sdk's number-input tests.

- **Machines:**
  - `Number/Stepper` (have), shared. From step 6 it declares `props` (`min`, `max`, `step`) with defaults and emits
    `Committed`, as @task.V3.T78 scopes.
  - `OrderForm` (step 6), shared, creating one local stepper per field and hearing `Committed`.
- **Operations:** R `stock` (step 6, feeds `max`); T `saveOrder` (step 6, `latest`).
- **Journeys:** 1. Order: R `stock` → steppers get `max` → hold to repeat → blur emits `Committed` → T `saveOrder`.
- **Features by step:**
  - **used today:** compound `states` (`Number/Stepper`); `Flow.initial` computed (`Number/Stepper`); guards, `deny`,
    `check` (`Number/Stepper`); `schedules` with `armOn` (hold to repeat).
  - **step 6:** `props`, `onProps` (`min`, `max`, `step`, with defaults); `emits`, `onEmit` (`Committed`, heard by
    `OrderForm`); `createActor`, `disposeActor` (steppers local to `OrderForm`); `resource`, `O.x.lookup` (R `stock`);
    `latest`, `Superseded` (T `saveOrder`).
  - **step 18:** `useActor` (React) (Strict Mode).
- **Scenarios:**
  - [ ] **Usual:** step, hold, type, blur (have). Stepping stops on the grid. Copies
    [number-input.test.ts:53][ui-number] "End and the increment button stop at the highest value on the step grid".
  - [ ] **Load:** 150 steps (have); L5: press and release interleaved with the wheel for thousands of turns.
  - [ ] **Structure:** S2: 64 steppers in one form under L5; S6 × {form first, stepper first} during a hold.
  - [ ] **Edges:** typed junk (have); E6: 2^53; a step of 0; min above max. A step from an empty field starts at 0,
    clamped into the bounds. Copies [number-input.test.ts:176][ui-number] "steps from empty start at 0, within the
    bounds".
  - [ ] **Combinations:** props and emits (step 6); Strict Mode (step 18).
  - [ ] **Findings:** a user's change back to an earlier value after one set from outside. Copies
    [number-input.test.ts:185][ui-number] "a commit after a value set from outside reports the user's change back to an
    earlier value".

### player

Multi-room audio, grown with a household around today's player. Source: no source.

- **Machines:**
  - `Music/Player` (have), shared per room.
  - `Household` (step 1), shared, holding refs to rooms and sending `Play` to a group.
  - `Speaker` (step 12), shared per room, reading S `speakerState`.
- **Operations:** T `play` (have, `cancel`); S `speakerState` (step 12, `latest`, `Feed.callback`).
- **Journeys:** 1. Play: play → history back to the last sub-state (have). 2. Group: `Household` plays a group.
  3. Buffering: `Speaker` shows the speaker's reports.
- **Features by step:**
  - **used today:** compound `states` (`Music/Player`); `S.X.history`, `history.child`, `S.previous.history`
    (`Music/Player`); `Flow.input` value-named actors (`Music/Player`, named by room); `Flow.private` (`Music/Player`);
    `schedules` with `armOn` (the position tick); `concurrency: "cancel"` (T `play`); endings, `Flow.uncertain`,
    `unknown` (`Music/Player`).
  - **step 1:** `send(ref, event)` (`Household` sends `Play` to grouped rooms).
  - **step 12:** `delivers: "latest"`, `Feed.callback`, `dropAt` (S `speakerState` into `Speaker`).
- **Scenarios:** usual and stress (have). New: L1 × 16 rooms playing together under L5; S6 × {room disposed, room
  reloaded} while its tick is armed; E1: an empty room; E3: a room at the key bound; a seek past the track's end and a
  negative seek.

### wizard

An insurance quote with an inspection booking. Its booking half (a slot held, then taken meanwhile) is what no other
app carries. Source: Cal.com's booker
(<https://github.com/calcom/cal.com/blob/main/packages/features/bookings/Booker/store.ts>, a flow, not checked
here) for the booking; no source for the quote.

- **Machines:**
  - `Quote` (step 2), shared, with its steps as compound states.
  - `Vehicle` and `Driver` (step 2), `subroutine`s; `Driver` is reused for each extra driver.
  - `Explainer` (step 15), a lazy entry.
- **Operations:** R `postcode`, `slots` (step 4); T `holdSlot` (step 4, `reject`), `submitQuote` (step 4).
- **Journeys:**
  1. Quote: forward → Back by history → R `postcode` → T `submitQuote` once.
  2. Book: T `holdSlot` → the slot is taken meanwhile → pick again.
  3. Explain: open the explainer (lazy).
- **Features by step:**
  - **step 2:** compound `states` (`Quote`'s steps); `S.X.history`, `history.child`, `S.previous.history` (Back through
    `Quote`); `Flow.initial` computed (`Quote`'s start date); guards, `deny`, `check` (`Quote` checks each step);
    `subroutine` with exits (`Vehicle`, `Driver` (reused)); `schedules` with `armOn` (the slot hold's expiry);
    `persist`, restore, reload (`Quote`).
  - **step 4:** `resource`, `O.x.lookup` (R `postcode`, `slots`); `reject`, `NotSent { Rejected }` (T `holdSlot`);
    endings, `Flow.uncertain`, `unknown` (T `submitQuote`).
  - **step 7:** release versions, saved-shape reset, migration (release 2 adds a step).
  - **step 15:** lazy entries `{ id, load }`, adoption, dormant records (`Explainer`); `EntryMismatch`, a failed load, a
    send to an unadopted entry (`Explainer`'s failed load).
- **Scenarios:**
  - [ ] **Usual:** forward through every step, Back by history, submit once.
  - [ ] **Load:** L2: 64 queued Next and Back events; a double submit; L1 × 16 wizards; L4.
  - [ ] **Structure:** S1: a subroutine in a compound in a compound, four deep, with history through each and S9 at the
    deepest; a step left while its lookup is in flight; S3 × 16.
  - [ ] **Edges:** a history never entered; E2; E5 at −1, 0, 2^31 − 1 and 2^31 ms; empty answers.
  - [ ] **Combinations:** release 2 adds a step (step 7); the lazy explainer (step 15).
  - [ ] **Variety:** the same subroutine at two depths.
  - [ ] **Findings:** a month change clears the held slot (Cal.com's `setMonth`, not checked here).

### search

Product search with a results pager. Source: ui-sdk's async loads; kamp.us's search and feed.

- **Machines:**
  - `SearchPage` (step 4), shared, with `Filters` as a trait; server rendered from step 18.
  - `ResultList` (step 4), local.
  - `Pager` (step 5), local, ◂ `ResultList`'s view, with `props` and the `PageChanged` emit.
  - `Saved` (step 4), shared.
- **Operations:** R `suggestions`, `results`, `saved` (step 4); T `saveSearch` (step 4).
- **Journeys:**
  1. Type: R `suggestions`; the latest wins.
  2. Search: R `results` → page with `Pager`.
  3. Filter: the previous results stay shown.
  4. Save: T `saveSearch` → `invalidate` R `saved`.
- **Features by step:**
  - **step 4:** guards, `deny`, `check` (`SearchPage`); `trait` (`Filters` on `SearchPage`); `ConflictingActorRef`,
    duplicate `.each` key, missing service (a missing service refused at boot); `createActor`, `disposeActor`
    (`ResultList`); `late` handlers, `LateMayNotLeave` (a late `results` ending after the page left); `resource`,
    `O.x.lookup` (R `suggestions`); `O.x.subscribe`, `staleTime`, `gcTime`, `O.x.refetch` (R `results`); resource
    `subscribe.each` (R `results` per facet); `placeholder({ previous, input })` (R `results` on a filter change);
    `O.x.setData`, `O.x.invalidate`, `O.x.clear` (`invalidate` R `saved` after T `saveSearch`); `notSent:`, `otherwise`,
    `Flow.ignore`, mapper `Defect` (R `results` maps `otherwise`); canonical keys, `InvalidKey`, `KeyOmitsInput` (bigint
    and `KeyOmitsInput` cases on R `results`).
  - **step 5:** `props`, `onProps` (`Pager`); `emits`, `onEmit` (`Pager`'s `PageChanged`).
  - **step 18:** `useActor` (React) (`Pager` in a view); server rendering, hydration (`SearchPage`);
    `DehydrateCommitInFlight`, `DehydrateUnsettled`, `Hydration*` (a saved shape that doesn't match
    (`HydrationIncompatible`)).
- **Scenarios:**
  - [ ] **Usual:** type, results, a cached repeat, a refetch after the stale time. The field follows the URL's query
    with no stale second source. Copies [App.test.tsx:642][kp-app] "reads q live — a different query renders a different
    echoed value (no stale/double source)".
  - [ ] **Load:** L5: keystroke bursts; L3; L1: a thousand distinct keys collected by `gcTime`.
  - **Structure:**
    - [ ] S2: one read shared by 64 `ResultList`s under L5.
    - [ ] S8: `subscribe.each` as facets change under L5.
    - [ ] S3: two search pages sharing no entries.
    - [ ] S6 × {page first, list first} under live reads; late answers dropped. Copies
      [restore-late-items.test.ts:123][ui-late] "stops waiting for the items once destroyed".
    - [ ] S7: a missing service refused at boot by name.
  - [ ] **Edges:** E1: no rows and an empty query; a stale time of 0; E3 and E6: keys at and past the bound and a bigint
    key; total 0 and a page past the last.
  - [ ] **Combinations:** the pager's props and emits (step 5); hydration then a client edit (step 18).
  - **Findings:**
    - [ ] A stale load never lands and its request aborts. Copies [trigger-menu.test.ts:183][ui-trigger] "a stale load
      never lands, and its signal aborts".
    - [ ] A newer write of the same value survives late items. Copies [restore-late-items.test.ts:102][ui-late] "keeps a
      newer write of the same value once the items arrive".
    - [ ] Results landed under another identity are never shown. Copies [panoFeedOverlay.test.ts:32][kp-overlay]
      "rejects an overlay landed under a DIFFERENT identity (never foreign state)".
    - [ ] A bare shortcut key typed in a field is not a command. Copies [searchShortcut.test.ts:17][kp-shortcut] "does
      not match a bare K (so typing 'k' in a field is untouched)".

### home

A smart-home dashboard. Source: ui-sdk's toast pause reasons for `pausedBy`; Supabase realtime-js
(<https://github.com/supabase/realtime-js/blob/master/test/RealtimeClient.resilience.test.ts>, not checked here).

- **Machines:**
  - `House` (step 2), shared, ⇢ `mode`.
  - `Zone` (step 2), shared, named by zone, ⇠ `mode` ⇢ `zoneMode`.
  - `Room` (step 2), shared, named by room, ⇠ `zoneMode`, with `Panel` as a trait and `Sensor` ◂ `Room` via `.each`;
    sensors are `.resumable()` while offscreen.
- **Operations:** T `setTarget` (step 2, `latest` per room); R `readings` (step 4); S `liveReadings` (step 12).
- **Journeys:**
  1. Set target: T `setTarget` → S `liveReadings` confirms the temperature.
  2. Vacation: `Room` raises `Pause` into its sensors; `pausedBy` vacation.
  3. Scroll: offscreen sensors freeze and resume.
  4. Reconnect: the connection drops → stale readings refetch.
- **Features by step:**
  - **step 2:** compound `states` (`Room`'s heater cycle); `Flow.initial` computed (`Room`'s target from the zone mode);
    `trait` (`Panel` on `Room`); `.each({ of, max, by })` (`Sensor` ◂ `Room`); `.resumable()` (`Sensor`s offscreen);
    raise into copies (`Room` raises `Pause` into its sensors); `schedules` with `armOn` (`Sensor` polls); `keys`,
    `paused`, `pausedBy`, `restartOn`, `disarmOn` (per-sensor keys; vacation `pausedBy`); an Effect `Schedule` as
    `schedule` (a multi-step `Schedule` for the heater); `context`, `onContext`, `Provider.select` (`House` ⇢ `mode`,
    `Zone` ⇢ `zoneMode`, `Room` ⇠); `ContextCycle`, `MissingContextProvider` (a zone mode feeding the house; a room with
    no zone); `latest`, `Superseded` (T `setTarget`); endings, `Flow.uncertain`, `unknown` (T `setTarget`); `persist`,
    restore, reload (`House`, `Zone`, `Room`).
  - **step 4:** `resource`, `O.x.lookup` (R `readings`); `O.x.subscribe`, `staleTime`, `gcTime`, `O.x.refetch` (R
    `readings`, refetched on focus); resource `subscribe.each` (R `readings` per sensor).
  - **step 12:** `delivers: "latest"`, `Feed.callback`, `dropAt` (S `liveReadings`); `reconnect`, `idleTime`,
    `Flapping`, `ReleaseOverdue` (S `liveReadings`); `Feed.live` proof, `missed` (`Unproven`, `Lost`, `Reset`) (S
    `liveReadings`); `Feed.multiplex`, `DuplicateSession`, `UnplacedStream` (one connection for every room).
  - **step 16:** `inspect`, `trace.export`/`trace.import`, sinks, redaction (schedule events).
- **Scenarios:**
  - [ ] **Usual:** set a target, readings on schedule, the heater cycles, a vacation pause and resume.
  - [ ] **Load:** L1 × 256 rooms; L5: readings faster than turns, at and past 1,024 (step 12); L4 mid-pause.
  - [ ] **Structure:** S1: house → zone → room → sensor, with S9 at a sensor; S4: zone; S5: a mode override at a zone;
    S8: rooms added mid-tick; S6 × {house first, room first, reloaded} with live timers; S3: two houses; S7: a zone mode
    feeding the house (a cycle) and a room with no zone.
  - [ ] **Edges:** E1: no rooms; E5: −1, 0, 2^31 − 1, and 2^31 refused; pause reasons stacked and removed in turn; a key
    leaving and returning.
  - [ ] **Combinations:** `left` against `dueAt` across a reload (see @plan.Pending.D18); the stream (step 12).
  - [ ] **Variety:** a multi-step `Schedule` against one delay; keyed against unkeyed.
  - **Findings:**
    - [ ] Pause reasons hold separately. Copies [toast.test.ts:247][ui-toast] "pause reasons hold separately: one
      clearing never resumes while another holds".
    - [ ] A network failure schedules a reconnect, and a missed heartbeat falls back to one (realtime-js, not checked
      here).

### kanban

A project tracker with checklists, a card menu, an assignee picker and toasts. Source: tldraw's sync client,
kamp.us's optimistic lists, ui-sdk's menu, combobox and toast tests.

- **Machines:**
  - `Workspace` (step 2), shared, ⇢ `member`.
  - `Board` (step 2), shared, named by board, ⇠ `member` ⇢ `board`, with `Column` ◂ `Board`, `Card` ◂ `Column` and
    `ChecklistItem` ◂ `Card`, each via `.each`; collapsed columns are `.resumable()`.
  - `CardDetail` (step 2), local, ⇠ `board`; a lazy entry from step 15.
  - `CardMenu` and `Toaster` (step 8, @task.V3.T72), local and shared, with `Toast` ◂ `Toaster` via `.each`.
  - `AssigneePicker` (step 8, @task.V3.T73), local, with `props` and the `Picked` emit.
- **Operations:**
  - R: `cards`, `comments` (step 4); `boards`, `users` (step 8); `cards` becomes a domain at step 11.
  - T: `moveCard` (step 2, `latest` per card; `guarded` from step 11); `addComment` (step 4, `serialize` per card);
    `deleteComment` (step 4); `archiveCard` (step 8); `assign` (step 8).
  - S: `boardEvents` (step 12).
- **Journeys:**
  1. Move: drag a card; the server confirms, rejects or modifies it.
  2. Discuss: open `CardDetail` → add a comment → delete one.
  3. Checklist: "check all" raised into the items.
  4. Archive: T `archiveCard` → a toast.
  5. Move to board: `CardMenu` loads R `boards` → sends `CardArrived` to the other `Board`.
  6. Assign: `AssigneePicker` → R `users` → T `assign`.
  7. Together: another user's change arrives on S `boardEvents` while my move is pending.
  8. Filter: R `cards` keeps the previous cards shown.
- **Features by step:**
  - **step 2:** `Flow.input` value-named actors (`Board`, named by board); `.each({ of, max, by })` (`Column`, `Card`,
    `ChecklistItem`); `.resumable()` (collapsed `Column`s); raise into copies ("check all" into `ChecklistItem`s);
    `context`, `onContext`, `Provider.select` (`Workspace` ⇢ `member`; `Board` ⇠ `member` ⇢ `board`; `CardDetail` ⇠
    `board`); `ConflictingActorRef`, duplicate `.each` key, missing service (a duplicate card key); `createActor`,
    `disposeActor` (`CardDetail`); `latest`, `Superseded` (T `moveCard` per card); endings, `Flow.uncertain`, `unknown`
    (T `moveCard`); `notSent:`, `otherwise`, `Flow.ignore`, mapper `Defect` (a mapper that throws: `Defect`); `persist`,
    restore, reload (`Board`).
  - **step 4:** `resource`, `O.x.lookup` (R `cards`, `comments`); `O.x.subscribe`, `staleTime`, `gcTime`, `O.x.refetch`
    (R `cards`); resource `subscribe.each` (R `cards` per column); `placeholder({ previous, input })` (R `cards` on a
    filter change); `serialize`, `NotSent { Overloaded }` (T `addComment` per card).
  - **step 7:** `NotSent { OldVersion }` (a move held across release 2); release versions, saved-shape reset, migration
    (release 2 of `Board`).
  - **step 8:** `keys`, `paused`, `pausedBy`, `restartOn`, `disarmOn` (`Toast`'s pause reasons); `props`, `onProps`
    (`AssigneePicker`); `emits`, `onEmit` (`AssigneePicker`'s `Picked`); `send(ref, event)` (`CardMenu` sends
    `CardArrived` to another `Board`).
  - **step 11:** `guarded` (T `moveCard`); `entity`, `domain`, `read(...).list`/`.one`/`.byKey` (the `cards` domain);
    `predicts`, repair, `basedOn` (T `moveCard` predicts); `.gone` tombstones (a card deleted by another user);
    `pagedBy`, `more` (`cards` pages).
  - **step 12:** `stream` `delivers: "every"`, `position`, `catchUp` (S `boardEvents`); `Feed.multiplex`,
    `DuplicateSession`, `UnplacedStream` (one connection for every board).
  - **step 15:** `ContextCycle`, `MissingContextProvider` (a lazy entry that brings a context cycle); lazy entries `{
    id, load }`, adoption, dormant records (`CardDetail`); `EntryMismatch`, a failed load, a send to an unadopted entry
    (`CardDetail` adopted with the wrong id).
  - **step 18:** `useActor` (React) (the board's views); server rendering, hydration (a hydrated board);
    `DehydrateCommitInFlight`, `DehydrateUnsettled`, `Hydration*` (a render with a move unsettled
    (`DehydrateUnsettled`)).
- **Scenarios:**
  - **Usual:**
    - [ ] A move confirmed. Copies [TLSyncClient.test.ts:1497][tl-client] "[CR3] a commit push_result confirms the
      pending push without changing the store".
    - [ ] A comment's temporary id becomes the server's. Copies
      [optimisticCommentAdd.realstore.test.ts:121][kp-cadd-real] "reconciles the temp id to the server id on the HTTP
      result (no orphan temp)".
    - [ ] The menu stays open while its items load. Copies [menu-pending.test.ts:17][ui-menu-pending] "stays pending,
      and the menu open, until it resolves".
    - [ ] A toast for an async archive shows its result with a fresh duration. Copies [toast.test.ts:135][ui-toast] "a
      promise toast loads, then shows the result with a fresh duration".
  - [ ] **Load:** L1 × 1,024 cards; L5: bursts of moves; L3; E8 with a move pending. A toast pushed out of view keeps
    its time. Copies [toast.test.ts:261][ui-toast] "a toast pushed out of view waits with its time, and one never shown
    never starts".
  - **Structure:**
    - [ ] S1: workspace → board → column → card → item, with S9 at an item; S4: `Board`.
    - [ ] S2: 1,024 cards in one column under L5. S3: 8 boards with distinct domains.
    - [ ] S6 × {board first, column first, card detail first, reloaded} with cards loading.
    - [ ] S7: a duplicate card key; a lazy `CardDetail` that brings a context cycle (step 15).
    - [ ] Nested menus close together. Copies [details.test.ts:90][ui-details] "closing a menu with a key closes its
      open submenu with the same source".
    - [ ] Stacked dialogs. Copies [alert-dialog.test.ts:17][ui-alert] "a question asked while another is open waits for
      it, and gets its own answer" and [focus-return-everywhere.test.ts:341][ui-focus] "the middle of three dialogs
      reopened from the last still closes".
  - **Edges:**
    - [ ] E1: an empty domain; E2: an undefined field, a missing version, a null sort key.
    - [ ] A count never below zero. Copies [optimisticCommentDelete.test.ts:194][kp-cdel] "never drives commentCount
      below zero".
    - [ ] The picker at its maximum. Copies [combobox-highlight.test.ts:111][ui-combo-hl] "arrows still reach unchosen
      items once a multiple combobox is at maxSelected".
  - **Combinations:**
    - [ ] A remote change leaves my pending move alone. Copies [TLSyncClient.test.ts:1441][tl-client] "[CR2] preserves
      local speculative changes when the server patches other records".
    - [ ] Staggered acks make no net change. Copies [TLSyncClientRebase.test.ts:168][tl-rebase] "invariant 1: a
      staggered commit ack for an in-flight push emits no net document change".
    - [ ] Appends converge across staggered acks. Copies [TLSyncClientRebase.test.ts:253][tl-rebase] "invariant 2:
      base-relative array appends converge across staggered commit acks".
    - [ ] Release 2 (step 7); lazy detail (step 15); a hydrated board (step 18).
  - [ ] **Variety:** ordered, unordered and server-ranked lists; versioned and unversioned entities.
  - **Findings:**
    - [ ] A rejected move is reverted. Copies [TLSyncClient.test.ts:1528][tl-client] "[CR3] a discard push_result drops
      the pending push and reverts the local change".
    - [ ] A modified move takes the server's version. Copies [TLSyncClient.test.ts:1548][tl-client] "[CR3] a
      rebaseWithDiff push_result applies the server's modified diff instead".
    - [ ] Changes applied during a rebase send nothing. Copies [TLSyncClient.test.ts:1477][tl-client] "[CR2] does not
      generate new push requests for changes applied during a rebase".
    - [ ] A bare temporary id must not reconcile. Copies [optimisticCommentAdd.realstore.test.ts:187][kp-cadd-real]
      "BARE temp id fails to reconcile — the #1714 defect, now guarded against".
    - [ ] Rejected adds and deletes restore the list and counts. Copies [optimisticCommentAdd.test.ts:162][kp-cadd]
      "rollback restores the prior list on reject (no phantom row)", [optimisticCommentDelete.test.ts:130][kp-cdel]
      "rollback restores the edge and commentCount (no phantom drop)" and
      [definitionAddOptimistic.unit.test.ts:150][kp-defadd] "rollback restores the bumped aggregates on a rejected add
      (no phantom count)".
    - [ ] A stale report for a removed id is ignored. Copies [savedReconcile.test.ts:44][kp-saved] "ignores a stale
      report for an id no longer in the connection".
    - [ ] A repair read stops after its probe budget. Copies [readback.test.ts:32][kp-readback] "refetches
      deterministically once the probe budget is spent".
    - [ ] The menu: [trigger-menu.test.ts:183][ui-trigger] "a stale load never lands, and its signal aborts",
      [menu-pending.test.ts:58][ui-menu-pending] "resolving after the menu closed and reopened leaves it open" and
      [menu-trigger-unmount.test.ts:29][ui-menu-unmount] "closes when the trigger that opened it leaves".
    - [ ] The picker: [combobox.test.ts:126][ui-combo] "a value set before its items load shows their label once they
      arrive", [combobox.test.ts:155][ui-combo] "resolving after the list closed and reopened leaves it open" and
      [combobox.test.ts:169][ui-combo] "with multiple, text typed while it was pending stays".
    - [ ] Toasts: [toast.test.ts:175][ui-toast] "a promise toast dismissed while loading stays closed",
      [toast.test.ts:232][ui-toast] "pausing keeps the time left, and resuming continues from it" and
      [toast-swipe.test.ts:65][ui-swipe] "a swipe cut short by its region going away lets go of the toast".

### chat

Team chat with an AI assistant, attachments and a recipients field. Source: the Vercel AI SDK, tus-js-client,
kamp.us's live connection; y-websocket (<https://github.com/yjs/y-websocket/blob/master/test/reconnect.test.js>, not
checked here).

- **Machines:**
  - `Account` (step 4), shared, ⇢ `session`.
  - `Hub` (step 4), shared, ⇠ `session` ⇢ `hub`, with `ThreadList` ◂ `Hub` via `.each`; `Presence` ◂ `Hub` from
    step 12.
  - `Thread` (step 4), shared, named by thread, ⇠ `hub`, with `Composer` as a trait (and `Attachment` ◂ `Composer`
    via `.each`) and `AssistantReply` ◂ `Thread`.
  - `Recipients` (step 8, @task.V3.T73), local (the token input).
- **Operations:**
  - R: `history` (step 4; a `messages` domain with `pagedBy` from step 11); `contacts` (step 8).
  - T: `send` (step 4; `serialize` per thread, `idempotency` by client id); `upload` (step 4, `progress`); `ask`
    (step 4, `reject`); `deleteMessage` (step 4).
  - S: `messages`, `presence`, `reply` (step 12).
- **Journeys:**
  1. Join: R `history`, then S `messages`.
  2. Send: an echo, then reconciled by id.
  3. Attach: T `upload` with `progress`, cancelled or resumed.
  4. Ask: T `ask` → S `reply` → reload → the reply resumes → stop.
  5. Delete: T `deleteMessage` → a tombstone.
  6. Train ride: the connection drops → rejoin with no duplicate → catch-up.
  7. DM: `Recipients` → R `contacts`.
- **Features by step:**
  - **step 4:** compound `states` (`Thread`'s composing and sending); `Flow.input` value-named actors (`Thread`, named
    by thread); `trait` (`Composer` in `Thread`); `whenAbandoned` (`Composer` keeps unsent text when abandoned);
    `.each({ of, max, by })` (`ThreadList`, `Attachment`); `keys`, `paused`, `pausedBy`, `restartOn`, `disarmOn` (typing
    timers per user); an Effect `Schedule` as `schedule` (the resend backoff); `context`, `onContext`, `Provider.select`
    (`Account` ⇢ `session`; `Hub` ⇠ `session` ⇢ `hub`; `Thread` ⇠ `hub`); `ContextCycle`, `MissingContextProvider` (a
    `Hub` with no `Account`, refused at boot); mailbox cap, `AdmissionOverloaded` (1,024 typing events); `resource`,
    `O.x.lookup` (R `history`); `O.x.subscribe`, `staleTime`, `gcTime`, `O.x.refetch` (R `history`); `optimistic` values
    on a read (T `send`'s echo on R `history`); `reject`, `NotSent { Rejected }` (T `ask`, one question at a time);
    `serialize`, `NotSent { Overloaded }` (T `send` per thread); endings, `Flow.uncertain`, `unknown` (T `send`, `ask`);
    `NotSent { Restored }`, `unknown { Restored }` (owed sends after a reload); `NotSent { Disposed }`, `unknown {
    Disposed }` (a thread disposed mid-send); `progress` (T `upload`); `idempotency` (T `send` by client message id);
    owed endings, quarantine (T `send`); `persist`, restore, reload (`Thread`, `Hub`); Runtime per scope, `dispose` (a
    new Runtime per workspace).
  - **step 8:** `createActor`, `disposeActor` (`Recipients`).
  - **step 11:** `guarded` (an edit proved by the message version); `entity`, `domain`, `read(...).list`/`.one`/`.byKey`
    (the `messages` domain); `predicts`, repair, `basedOn` (T `send` predicts); `.gone` tombstones (a deleted message);
    `pagedBy`, `more` (history pages).
  - **step 12:** `stream` `delivers: "every"`, `position`, `catchUp` (S `messages`); `delivers: "latest"`,
    `Feed.callback`, `dropAt` (S `presence`); `reconnect`, `idleTime`, `Flapping`, `ReleaseOverdue` (S `messages`);
    `Feed.live` proof, `missed` (`Unproven`, `Lost`, `Reset`) (S `messages`); `Feed.multiplex`, `DuplicateSession`,
    `UnplacedStream` (one connection for every thread).
  - **step 16:** `inspect`, `trace.export`/`trace.import`, sinks, redaction (a sink).
  - **step 18:** `useActor` (React) (Strict Mode).
- **Scenarios:**
  - **Usual:**
    - [ ] Send with an instant echo. Copies [use-chat.ui.test.tsx:628][ai-react] "should show user message immediately".
    - [ ] One id serves sending and resuming. Copies [chat.test.ts:140][ai-chat] "uses the same lazily generated id for
      sending and resuming".
    - [ ] An attachment resumed. Copies [test-common.js:623][tus-common] "should resume a previously started upload".
  - **Load:**
    - [ ] Sends during a reply queue and go in order. Copies [chat.test.ts:5930][ai-chat] "should queue messages sent
      during a response and send them one at a time in order".
    - [ ] Throttled updates. Copies [use-chat.ui.test.tsx:3338][ai-react] "should throttle UI updates when throttle is
      set".
    - [ ] Same-tick subscriptions coalesce into one request. Copies [liveSubscribeBatch.test.ts:117][kp-live-batch]
      "coalesces same-tick subscribeById calls into ONE /fate/live control POST".
    - [ ] The retry budget counts connects, not errors. Copies [liveRetry.unit.test.ts:99][kp-retry] "charges the budget
      per connect, not per error — N views do not drain it faster".
    - [ ] L2: 64 queued sends and one more `Overloaded`; 1,024 typing events and one more refused; flapping connections
      ending `Flapping` (see @plan.Pending.D14).
  - **Structure:**
    - [ ] S1: account → hub → thread → composer → attachment, with S9 at an attachment; S4: `Hub`.
    - [ ] S2: one connection fanned out to 100 threads under L5. Many views reconnect once. Copies
      [use-chat.ui.test.tsx:2540][ai-react] "should only reconnect once for multiple useChat consumers".
    - [ ] Owner churn never closes the shared connection. Copies [globalLivePin.test.ts:103][kp-pin] "WITH the pin: the
      same churn never closes the EventSource — refcount stays >= 1".
    - [ ] S6 × {hub first, thread first, reloaded} with live sessions. A late update from the old chat is dropped.
      Copies [use-chat.ui.test.tsx:3495][ai-react] "should ignore a delayed publication after changing chats".
    - [ ] S8: a thread switched mid-reply aborts the old stream. Copies [use-chat.ui.test.tsx:3694][ai-react] "should
      abort the previous stream when the id changes".
    - [ ] S3: two hubs; S7: a hub with no account, refused at boot.
  - **Edges:**
    - [ ] E8: a reload mid-reply; the resumed stream replaces the partial text. Copies
      [use-chat.ui.test.tsx:133][ai-react] "replaces a partial response when a resumed transport replays the full
      stream".
    - [ ] A token removed while it loads. Copies [token-input.test.ts:14][ui-token] "a token removed while it loads
      comes back settled on undo".
    - [ ] A token that fails to load. Copies [token-input.test.ts:48][ui-token] "a token that fails to load leaves a
      supplied token with the id it would have generated".
    - [ ] Closed at once; a reconnect with no bookmark; a bookmark at 256 entries and past it; E7: a position that fails
      to decode; `missed` as `Unproven`, `Lost` and `Reset`.
  - **Combinations:**
    - [ ] Stop while a reconnect is pending. Copies [chat.test.ts:1763][ai-chat] "should stop a resumed stream while
      reconnection is pending".
    - [ ] Stop pauses the send queue. Copies [chat.test.ts:6046][ai-chat] "should pause the queue on stop and resume it
      in order with the next message".
    - [ ] An edit stops the reply and clears the queue. Copies [chat.test.ts:6429][ai-chat] "should stop the response
      and clear the queue when a message is edited".
    - [ ] A tool result queued while stopping. Copies [chat.test.ts:1594][ai-chat] "should not restart the chat from a
      tool output queued while stopping" and [chat.test.ts:1512][ai-chat] "should wait for a pending tool callback and
      its message update before stop resolves".
    - [ ] An identity reset cancels a pending retry. Copies [liveRetry.unit.test.ts:140][kp-retry] "reset() cancels a
      pending retry so it never fires onto a re-keyed client".
    - [ ] Backoff grows, resets after a synced session, and stops after a terminal close: y-websocket
      `testShouldReconnectTrueGrowsTheBackoff`, `testSyncedSessionResetsTheBackoff`,
      `testTerminalCloseStopsReconnecting` (not checked here).
  - [ ] **Variety:** `every` against `latest`; with and without `catchUp`; one connection against one per thread.
  - **Findings:**
    - [ ] Only the latest of two overlapping resumes applies. Copies [chat.test.ts:1814][ai-chat] "should only apply the
      latest overlapping resumed stream".
    - [ ] A resume never copies the previous reply. Copies [chat.test.ts:2852][ai-chat] "should not copy the previous
      assistant message when resuming a stream".
    - [ ] A partial tool call survives repeated interruptions. Copies [chat.test.ts:3171][ai-chat] "should continue a
      hydrated partial static tool call across repeated stream interruptions".
    - [ ] Repeated failed resumes show the latest error. Copies [chat.test.ts:1886][ai-chat] "should publish the latest
      error after repeated failed resume attempts".
    - [ ] A non-network error doesn't resume. Copies [chat.test.ts:1195][ai-chat] "should not resume an active response
      after a non-network error".
    - [ ] A failed reply pauses the queue. Copies [chat.test.ts:6080][ai-chat] "should pause the queue when a response
      fails".
    - [ ] Strict Mode's second mount aborts the first reconnect. Copies [use-chat.ui.test.tsx:2916][ai-react] "should
      abort the first reconnect when StrictMode starts another".
    - [ ] A burst of errors makes one retry. Copies [liveRetry.unit.test.ts:75][kp-retry] "coalesces a burst of errors
      from one failed connect into ONE scheduled retry".
    - [ ] A rejected batch drops all its work. Copies [nkzwFateCoalescePin.test.ts:134][kp-coalesce] "a rejected
      coalesced flush discards the WHOLE batch and reports the error".
    - [ ] A loading token settles itself. Copies [token-input.test.ts:80][ui-token] "a loading token settles itself when
      onValueChange replaces the value as it's inserted".
    - [ ] Disposal releases the connection. Copies [chat.test.ts:178][ai-chat] "disposes the configured transport".

### draft

A collaborative document editor with an outline and image uploads. Source: tus-js-client, tldraw's sync and
migrations, kamp.us's draft storage, ui-sdk's tree tests.

- **Machines:**
  - `Library` (step 4), shared, ⇢ `author`.
  - `Document` (step 4), shared, named by document, ⇠ `author`, with `Section` ◂ `Document` via `.each`
    (`.resumable()` when collapsed) and `ImageUpload` as a trait on each section; `Collaborators` ◂ `Document` from
    step 12.
  - `Outline` (step 8, @task.V3.T73), local (the tree), with lazily loaded children.
- **Operations:** R `document` (step 4), `children` (step 8); T `save` (step 4, `latest`), `upload` (step 4,
  `progress`, `cancel` on replace); S `ops` (step 12).
- **Journeys:**
  1. Edit: edit → autosave on a debounce.
  2. Image: paste → T `upload` → abort → resume from the offset.
  3. Collapse: collapsed sections freeze and resume.
  4. Collaborate: a collaborator's op arrives during my save.
  5. Tabs: a second tab opens the document.
  6. Upgrade: release 2 migrates sections while a save is held.
- **Features by step:**
  - **step 4:** `Flow.input` value-named actors (`Document`, named by document); `trait` (`ImageUpload` on `Section`);
    `whenAbandoned` (`ImageUpload` when its section is deleted); `.each({ of, max, by })` (`Section` ◂ `Document`);
    `.resumable()` (collapsed `Section`s); `keys`, `paused`, `pausedBy`, `restartOn`, `disarmOn` (the autosave debounce
    per section); `context`, `onContext`, `Provider.select` (`Library` ⇢ `author`; `Document` ⇠ `author`); `forget`,
    `unsettledWrites` (a deleted document); `late` handlers, `LateMayNotLeave` (an upload ending after its section
    closed); `resource`, `O.x.lookup` (R `document`); `latest`, `Superseded` (T `save`); `concurrency: "cancel"` (T
    `upload` when an image is replaced); `O.x.cancel`, `NotSent { Cancelled }`, `CancelMissed` (an upload cancelled);
    endings, `Flow.uncertain`, `unknown` (T `save`, `upload`); Attempts: `O.x.retry`, `retryable`, `StillUnknown` (T
    `upload` retried); `progress` (T `upload`); owed endings, quarantine (T `save`); `persist`, restore, reload
    (`Document`); Runtime per scope, `dispose` (a Runtime per document scope).
  - **step 7:** `NotSent { OldVersion }` (a save held across release 2); `previous` holds, `O.x.previous` (T `upload`'s
    old-key lane); release versions, saved-shape reset, migration (release 2 migrates sections).
  - **step 8:** `createActor`, `disposeActor` (`Outline`); resource `subscribe.each` (R `children` per outline branch).
  - **step 12:** `stream` `delivers: "every"`, `position`, `catchUp` (S `ops`); `reconnect`, `idleTime`, `Flapping`,
    `ReleaseOverdue` (S `ops`); `Feed.live` proof, `missed` (`Unproven`, `Lost`, `Reset`) (S `ops`).
  - **step 13:** `StorageRefused`, `NoPersistence` (quota refuses a save); storage failures: corrupt, quota, slow read,
    non-durable (quota and a slow read).
  - **step 14:** multi-tab ownership (Web Lock, second tab) (a second tab).
- **Scenarios:**
  - **Usual:**
    - [ ] Drafts are kept per document. Copies [draftStorage.unit.test.ts:40][kp-draft] "keys drafts by route so two
      surfaces never collide".
    - [ ] An upload resumed from a stored address. Copies [test-browser-specific.js:11][tus-browser] "should resume an
      upload from a stored url" and [test-common.js:567][tus-common] "should resume an upload from a specified url".
    - [ ] Outline children load on expand. Copies [tree.test.ts:698][ui-tree] "a branch with no children loads them,
      then expands".
  - **Load:**
    - [ ] Retry until the delays run out. Copies [test-common.js:836][tus-common] "should retry the upload" and
      [test-common.js:1091][tus-common] "should stop retrying after all delays have been used".
    - [ ] Progress resets the retry count. Copies [test-common.js:1241][tus-common] "should reset the attempt counter if
      an upload proceeds".
    - [ ] L1: three tabs (step 14); thousands of old records across a release (step 7).
  - **Structure:**
    - [ ] S1: library → document → section → upload, with S9 at an upload.
    - [ ] S6 × {document first, section first, forgotten, reloaded} during an upload, in one Runtime.
    - [ ] The outline's depth limit. Copies [tree-reorder.test.ts:321][ui-reorder] "maxDepth counts the rows under an
      item too".
    - [ ] A row deleted during a move. Copies [tree-reorder.test.ts:444][ui-reorder] "a row the owner deletes ends the
      move".
    - [ ] A superseded connection never corrupts its replacement. Copies [TLSocketRoom.test.ts:457][tl-socket] "[SR5]
      ignores chunks from a superseded socket so they do not corrupt the replacement socket".
  - **Edges:**
    - [ ] The stored upload is gone, so a new one starts. Copies [test-common.js:95][tus-common] "should create an
      upload if resuming fails".
    - [ ] A 4xx drops the stored address. Copies [test-browser-specific.js:217][tus-browser] "should delete upload urls
      on a 4XX".
    - [ ] A locked upload. Copies [test-common.js:730][tus-common] "should emit an error if an upload is locked".
    - [ ] E7: a garbage stored draft is never offered. Copies [draftStorage.unit.test.ts:81][kp-draft] "rejects a
      garbage / shape-mismatched stored value rather than offering it".
    - [ ] Quota and a throwing store never throw into the editor (step 13). Copies [snapshot.test.ts:137][kp-snap]
      "returns false (no throw) on a quota-exceeded setItem" and [draftStorage.unit.test.ts:94][kp-draft] "swallows a
      throwing storage rather than losing the in-memory draft". That the draft stays in memory: no source.
    - [ ] E1: an empty draft; E3: a draft at its size bound.
  - **Combinations:**
    - [ ] Offline edits are pushed again after a reconnect. Copies [TLSyncClient.test.ts:595][tl-client] "[CL8] drops
      pending pushes when going offline and re-pushes the speculative diff after reconnect".
    - [ ] A held save is flushed before a reconnect. Copies [TLSyncClient.test.ts:378][tl-client] "[CL5] a reconnect
      flushes pending store history first, so a change queued behind the frame throttle is neither lost nor
      resurrected".
    - [ ] Offline changes survive a full catch-up. Copies [TLSyncClient.test.ts:492][tl-client] "[CL6][CP3] re-applies
      offline changes after a wipe_all reconnect and pushes them to the server".
    - [ ] The catch-up position is reused. Copies [TLSyncClient.test.ts:1613][tl-client] "[CR5][CL2] advances
      lastServerClock to the last buffered event's serverClock and reuses it on reconnect".
    - [ ] Old records migrate. Copies [TLSyncRoom.test.ts:287][tl-room] "[RC3] migrates the snapshot if it is dealing
      with old data" and [upgradeDowngrade.test.ts:349][tl-mig] "[MG1] clients will receive updates from a snapshot
      migration upon connection".
    - [ ] Two saves in a row: the first one's optimistic value goes (see @plan.Pending.D16).
  - [ ] **Variety:** one document and many; autosave on a timer and on blur; release 2 adds, drops and retypes a field.
  - **Findings:**
    - [ ] Abort stops a pending retry. Copies [test-common.js:1131][tus-common] "should stop retrying when the abort
      function is called".
    - [ ] Abort while the upload is created. Copies [test-common.js:1208][tus-common] "should stop upload when the abort
      function is called during the POST request".
    - [ ] Abort with terminate. Copies [test-terminate.js:6][tus-terminate] "should terminate upload when abort is
      called with true".
    - [ ] A failed outline load is retried on the next expand. Copies [tree.test.ts:720][ui-tree] "a failed load marks
      the branch, and the next expand tries again".
    - [ ] Expanding again while loading cancels. Copies [tree.test.ts:740][ui-tree] "expanding again while loading
      cancels".
    - [ ] A session on a schema the server can't reconcile is refused. Copies [TLSyncRoom.test.ts:2533][tl-room] "[SES6]
      handleResumedSession rejects a session whose schema the server can no longer reconcile".
    - [ ] A failed migration rejects only that session. Copies [upgradeDowngrade.test.ts:1033][tl-mig] "[MG1] rejects
      only the affected session when down migration fails during broadcast" and [upgradeDowngrade.test.ts:837][tl-mig]
      "[MG2] rejects session when addDocument up migration throws during put".
    - [ ] A bad push rejects only its own tab. Copies [TLSyncRoom.test.ts:1723][tl-room] "[RP12][RP2] a TLSyncError
      mid-push rejects only the offending session".
    - [ ] A mismatched ack resets the connection. Copies [TLSyncClient.test.ts:1592][tl-client] "[CR4] resets the
      connection on a push_result with a mismatched clientClock".
    - [ ] An unauthorised save redirects to sign-in. Copies [useDraftSubmit.test.tsx:40][kp-submit] "redirects to auth
      on an UNAUTHORIZED throw, setting no inline error".
    - [ ] The editor leaves nothing running once closed. Copies [leaks.test.ts:30][ui-leaks] "leaves nothing running
      after it unmounts".

## Existing fixtures to change

Every existing machine, Story id and test stays. Each existing folder gains an `index.ts` manifest (fixtures.md,
"Where a fixture is registered") and new folders for what is added; nothing moves.

- **pay:** new machines `Shopper`, `Cart`, `CartBadge`, `CheckoutFlow` and later `CartLine`, `AddressForm`,
  `ThreeDSecure`, `ProductPage`; new operations `addLine`, `setQuantity`, `product`, `cart`, `addressLookup`.
  `Checkout/Pay`, its contracts, `shop-http.ts` and every `pay/…` Story are unchanged. `secondCheckout` gets a Story.
- **cells, lanes:** a manifest and the new Stories in their rows; no machine changes.
- **sync:** new `Repo` and `RateLimit`; `Git/Sync` unchanged.
- **transfers:** new `Customer`, `TransferForm`, `StepUp`, `ChequeDeposit`, `Statement`, R `balance`; one edit, the
  `idempotency` line on T `transfer` (step 4). `stressManyReceipts` is registered.
- **sign-in:** new `AuthSession`, `ReturnTo`, `PasswordSignIn`, T `setUsername`, R `me`; `Auth/SignIn` stays
  unpersisted.
- **session:** new `Billing`, reads and writes; the four machines unchanged.
- **command-palette:** new `Workbench`; `Palette/Palette` gains the `CommandRan` emit (@task.V3.T77) and `props`
  with defaults (@task.V3.T76).
- **number-input:** new `OrderForm`; `Number/Stepper` gains props and emits with defaults (@task.V3.T78).
- **player:** new `Household` and `Speaker`; registered with the reload sweep and the bench's `long`.

## Migration plan

Steps follow the Tasks' blockers (`wk show @task.V3.Tn`). Each adds only features its Task builds or that exist when
it starts, and writes its scenarios red first. The step numbers are the matrix cells.

1. **Wrap and link with today's features: @task.V3.T82.** Starts once @task.V3.T9 and
   @task.V3.T20 close, since both edit `fixtures/`.
   - A manifest in every folder, and `fixtures/index.ts`. Replace each hand list: `tests/generated/fixtures.ts`
     (`samples`, `stressSamples`, `mix`), `tests/generated/saved.stress.test.ts`, the seven
     `tests/generated/pairs-*.test.ts`, `tests/generated/profiles.test.ts`, `tests/rules/sweep.ts`, `bench/run.ts`,
     `tests/cli/cli.test.ts` and `flow.config.ts`. `tests/faults.ts` and `vite.config.ts` keep their path strings.
   - Every cell marked 1.
2. **Fragments and schedules: @task.V3.T57,** with `subroutine` and `whenAbandoned` (the user, 2026-11-17). New:
   `wizard`, `home` (no reads or streams yet), `kanban` (no domain yet). Every cell marked 2.
3. **Emits: @task.V3.T77.**
4. **Reads and operations: @task.V3.T21.** New: `search`, `chat` (no streams yet), `draft` (no streams or tabs yet).
5. **Props: @task.V3.T76** (blocked by T9 and T77).
6. **Number input on props and emits: @task.V3.T78.**
7. **Releases: @task.V3.T56.**
8. **Hosted UI primitives: @task.V3.T72** (toaster and menu in `kanban`) **and @task.V3.T73** (combobox in
   `kanban`, tree in `draft`, token input in `chat`).
9. **Browser slice: @task.V3.T58.** Every fixture runs in real browsers; no new feature.
10. **CLI: @task.V3.T22, then @task.V3.T23.** `flow check` runs clean over every fixture's app; no new feature.
11. **Entity store: @task.V3.T24.**
12. **Streams: @task.V3.T25.**
13. **Store adapters: @task.V3.T28** (after T58).
14. **Multi-tab: @task.V3.T27** (after T28).
15. **Lazy features: @task.V3.T48.**
16. **Inspection: @task.V3.T49.** Every `long` run is also exported and imported.
17. **Story words: @task.V3.T29** (after T49 and T23). `duplicate`, `times`, `Fake.Refused`, `Fake.Closed`, frames and
    `together` in chat (duplicate delivery), kanban and draft; no new feature.
18. **React and server rendering: @task.V3.T30** (after T58, T76 and T77).

## Task text to amend

For the orchestrator. Each names a fixture that no longer exists, or a scope this page changed:
- @task.V3.T21 names `dashboard` (now `home`).
- @task.V3.T22 names `thermostat` and `checklist` (now `home` and `kanban`).
- @task.V3.T24 names `cart` (now `pay`'s `Cart`, which stays a read with `optimistic` values; the domains are
  `kanban`, `chat` and `transfers`).
- @task.V3.T25 names `ticker` (now `home`).
- @task.V3.T30 names `pager` (now `search`).
- @task.V3.T48 names `settings-panel` (now `session`'s `Billing`).
- @task.V3.T49 names `thermostat` (now `home`).
- @task.V3.T56 names `delivery` (now `draft` and the release Stories of step 7).
- @task.V3.T57 owns the `dashboard`, `checklist` and `thermostat` rows (now `home` and `kanban`), and now also
  `subroutine` and `whenAbandoned`.
- @task.V3.T72 and @task.V3.T73 ask for their own folders (now hosted in `kanban`, `chat` and `draft`).
- @task.V3.T76 names `pager` (now `search`).
- @task.V3.T77 names `checklist` (now `kanban`).

@task.V3.T9 (`lanes`), @task.V3.T20 (`pay`) and @task.V3.T58 ("Pay and checkout") need no change, since those
fixtures stay.

## Open

Plan gaps that block red scenarios are proposed decisions @plan.Pending.D14 to @plan.Pending.D19: `Flapping` in
chat, queued writes after a reload in transfers, a superseded optimistic value in draft, a pre-boot storage failure
in session, `dueAt` across sleep in sign-in and home, and the two wire cancels in lanes. `cancelAll` is retired
(@spec.WriteLanes R15) and has no row.

## Source files

[hy-cart]: ../../codebases/hydrogen/packages/hydrogen/src/core/cart/cart.test.ts
[hy-tx]: ../../codebases/hydrogen/packages/hydrogen/src/core/cart/cart-transactions.test.ts
[hy-track]: ../../codebases/hydrogen/packages/hydrogen/src/core/analytics/cart-tracker.test.ts
[tus-common]: ../../codebases/tus-js-client/test/spec/test-common.js
[tus-browser]: ../../codebases/tus-js-client/test/spec/test-browser-specific.js
[tus-parallel]: ../../codebases/tus-js-client/test/spec/test-parallel-uploads.js
[tus-terminate]: ../../codebases/tus-js-client/test/spec/test-terminate.js
[ai-chat]: ../../codebases/ai/packages/ai/src/ui/chat.test.ts
[ai-react]: ../../codebases/ai/packages/react/src/use-chat.ui.test.tsx
[tl-client]: ../../codebases/tldraw/packages/sync-core/src/lib/TLSyncClient.test.ts
[tl-rebase]: ../../codebases/tldraw/packages/sync-core/src/test/TLSyncClientRebase.test.ts
[tl-socket]: ../../codebases/tldraw/packages/sync-core/src/test/TLSocketRoom.test.ts
[tl-room]: ../../codebases/tldraw/packages/sync-core/src/test/TLSyncRoom.test.ts
[tl-mig]: ../../codebases/tldraw/packages/sync-core/src/test/upgradeDowngrade.test.ts
[ui-command]: ../../codebases/ui-sdk/packages/core/test/command.test.ts
[ui-number]: ../../codebases/ui-sdk/packages/core/test/number-input.test.ts
[ui-trigger]: ../../codebases/ui-sdk/packages/core/test/trigger-menu.test.ts
[ui-late]: ../../codebases/ui-sdk/packages/core/test/restore-late-items.test.ts
[ui-menu-pending]: ../../codebases/ui-sdk/packages/core/test/menu-pending.test.ts
[ui-menu-unmount]: ../../codebases/ui-sdk/packages/core/test/menu-trigger-unmount.test.ts
[ui-details]: ../../codebases/ui-sdk/packages/core/test/details.test.ts
[ui-combo]: ../../codebases/ui-sdk/packages/core/test/combobox.test.ts
[ui-combo-hl]: ../../codebases/ui-sdk/packages/core/test/combobox-highlight.test.ts
[ui-toast]: ../../codebases/ui-sdk/packages/core/test/toast.test.ts
[ui-swipe]: ../../codebases/ui-sdk/packages/core/test/toast-swipe.test.ts
[ui-tree]: ../../codebases/ui-sdk/packages/core/test/tree.test.ts
[ui-reorder]: ../../codebases/ui-sdk/packages/core/test/tree-reorder.test.ts
[ui-token]: ../../codebases/ui-sdk/packages/core/test/token-input.test.ts
[ui-leaks]: ../../codebases/ui-sdk/packages/core/test/leaks.test.ts
[ui-alert]: ../../codebases/ui-sdk/packages/core/test/alert-dialog.test.ts
[ui-focus]: ../../codebases/ui-sdk/packages/core/test/focus-return-everywhere.test.ts
[kp-app]: ../../codebases/phoenix/apps/web/src/App.test.tsx
[kp-flags]: ../../codebases/phoenix/apps/web/src/flags/boot.test.ts
[kp-snap]: ../../codebases/phoenix/apps/web/src/fate/snapshot.test.ts
[kp-auth]: ../../codebases/phoenix/apps/web/src/pages/AuthPage.test.tsx
[kp-boot]: ../../codebases/phoenix/apps/web/src/pages/UsernameBootstrap.test.tsx
[kp-gate]: ../../codebases/phoenix/apps/web/src/pages/signupUsernameGate.test.tsx
[kp-draft]: ../../codebases/phoenix/apps/web/src/lib/draftStorage.unit.test.ts
[kp-submit]: ../../codebases/phoenix/apps/web/src/fate/useDraftSubmit.test.tsx
[kp-cadd-real]: ../../codebases/phoenix/apps/web/src/fate/optimisticCommentAdd.realstore.test.ts
[kp-cadd]: ../../codebases/phoenix/apps/web/src/fate/optimisticCommentAdd.test.ts
[kp-defadd]: ../../codebases/phoenix/apps/web/src/pages/definitionAddOptimistic.unit.test.ts
[kp-cdel]: ../../codebases/phoenix/apps/web/src/fate/optimisticCommentDelete.test.ts
[kp-pdel]: ../../codebases/phoenix/apps/web/src/pages/optimisticPostDelete.test.ts
[kp-saved]: ../../codebases/phoenix/apps/web/src/pages/savedReconcile.test.ts
[kp-readback]: ../../codebases/phoenix/apps/web/src/fate/readback.test.ts
[kp-live-batch]: ../../codebases/phoenix/apps/web/src/fate/liveSubscribeBatch.test.ts
[kp-coalesce]: ../../codebases/phoenix/apps/web/src/fate/nkzwFateCoalescePin.test.ts
[kp-pin]: ../../codebases/phoenix/apps/web/src/fate/globalLivePin.test.ts
[kp-retry]: ../../codebases/phoenix/apps/web/src/fate/liveRetry.unit.test.ts
[kp-overlay]: ../../codebases/phoenix/apps/web/src/pages/panoFeedOverlay.test.ts
[kp-shortcut]: ../../codebases/phoenix/apps/web/src/lib/searchShortcut.test.ts
