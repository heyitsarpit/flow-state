# Fixture catalog

**What it is:** the fixture apps. For each app it gives the machines, operations and journeys, the features each one
adds and at which migration step, and the scenarios with the real tests they copy. After the apps come what changes
in today's fixtures, the migration plan in Task order, and the Task text that must change. The rules for a fixture
(additive growth, folder layout, manifest, the `S`, `L` and `E` codes) are in code:wiki/conventions/fixtures.md.

**Decided (the user, 2026-11-17):**
- 16 fixtures, each growing by new machines around the old ones: `shop`, `cells`, `lanes`, `sync`,
  `transfers`, `sign-in`, `session`, `command-palette`, `number-input`, `player`, `wizard`, `search`, `home`,
  `kanban`, `chat` and `draft`.
- `pay` became the folder `shop/`, its Story ids `shop/…`; machine and persisted ids stay (the user, 2026-11-17,
  Q16 B; built by @task.V3.T86). `cells` and `lanes` stay their own fixtures.
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

**Scenarios are best-guess guidance.** The items and their linked tests are a starting point, not a contract. The
lead reads the linked tests, aims for proper coverage of its step's features, and is free to add scenarios, reshape
or split an item, or replace one with a better case: for example giving a load item its numbers and what must hold
under it, or adding a combined-stress case. Each change is written back here as an item, so the list stays the
record of what is covered.

**Sources** are local clones in `codebases/` (`ai`, `tus-js-client`, `hydrogen`, `tldraw`, `ui-sdk`, and `phoenix`,
which is the kamp.us app), linked at the end of this page. Each local test name below was matched at its file and
line on 2026-11-17, and each sentence says only what the test shows. A public URL marks a source with no local copy;
those are **not checked here**. A scenario with no real source says "no source" and follows its Plan rule.

## Coverage matrix

A view of the "Features by step" lists in the App blocks below; regenerate it from them, never edit a cell alone.
A cell is `U` (used today) or the migration step that adds the feature to that app; `.` means the app doesn't use
it. Steps 9 (browser), 10 (CLI) and 17 (Story words) add no feature, so no cell shows them.

`pa` shop · `ce` cells · `la` lanes · `sy` sync · `tr` transfers · `si` sign-in · `se` session · `cp` command-palette ·
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
| `context`, `onContext`, `Provider.select`                     |1 |. |. |. |1 |1 |U |1 |. |. |. |. |2 |2 |4 |4 |
| `ContextCycle`, `MissingContextProvider`                      |. |. |. |. |. |. |1 |. |. |. |. |. |2 |15|4 |. |
| `ConflictingActorRef`, duplicate `.each` key, missing service |1 |. |. |. |. |. |. |. |. |. |. |4 |. |2 |. |. |
| `createActor`, `disposeActor`                                 |. |. |. |. |1 |. |. |5 |6 |. |. |4 |. |2 |8 |8 |
| `useActor` (React)                                            |. |. |. |. |. |18|. |18|18|. |. |18|. |18|18|. |
| `send(ref, event)`                                            |1 |. |. |1 |. |. |. |. |. |1 |. |. |. |8 |. |. |
| a deep mailbox, no ending lost                                |. |. |1 |. |. |. |1 |. |. |. |. |. |. |. |4 |. |
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
| `serialize`, a deep queue, no ending lost                     |. |. |1 |. |. |. |. |. |. |. |. |. |. |4 |4 |. |
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

### shop (the app `shop`, once `pay`)

A storefront: product page, cart and checkout, grown around today's checkout. Source: Shopify Hydrogen's cart;
Stripe's 3-D Secure flow (<https://docs.stripe.com/payments/3d-secure>, not checked here).

- **Machines:**
  - `Checkout/Pay` (have), shared per cart. It stays as it is.
  - `Shopper` (step 1), shared, ⇢ `shopper`.
  - `Cart` (step 1), shared, named by shopper, ⇠ `shopper`. From step 2, `CartLine` ◂ `Cart` via `.each`.
  - `Cart` ⇢ its item count and whether it waits on the cart service (`count`, `busy`).
  - `CartBadge` (step 1), shared, ⇠ `cart`: the item count as context, bumping on each change.
  - `CheckoutFlow` (step 1), shared per cart, ⇠ `shopper`. Its steps are address → shipping → pay under `history`;
    ⇠ `count` and `busy` from `Cart`, and ⇠ `payment`: `Checkout/Pay`'s state, which ends the flow at PAID. Its
    `PayWith` sends `CardChosen` then `PayRequested` to `Checkout/Pay` (one event and one handler added: the product
    pays from its pay step). From step 2,
    `AddressForm` is a trait on its address step and `ThreeDSecure` a `subroutine` in its pay step.
  - `Subscription` (step 1), shared, persisted: a weekly box; each week its schedule's `Due` sends `CardChosen` then
    `PayRequested` to its renewal's `Checkout/Pay`. It reads nothing of that Pay, so the send table's persisted rows
    have a target that can end, be forgotten or be disposed (`CheckoutFlow` binds its Pay as context, a use).
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
    key, missing service (a second `Cart` ref with another shopper, refused); `send(ref, event)` (`CheckoutFlow` and `Subscription`
    send `CardChosen` and `PayRequested` to `Checkout/Pay`); `latest`, `Superseded` (T `setQuantity`, `latest` per line key);
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
    - [x] Checkout with an unsure charge, a recheck, then an order. Source: Stripe's flow, not checked. built:
      `shop/lost-confirm`, `shop/usual`.
    - [x] The checkout steps with Back into shipping's last step, ending when the checkout's Pay is paid. No source.
      built: `shop/checkout-steps`.
    - [ ] An add shows a line at once. Copies [cart.test.ts:4535][hy-cart] "empty cart: optimistic placeholder line
      appears immediately on add". left: @task.V3.T21, needs `optimistic` values on R `cart`.
  - **Load:**
    - [x] L5: three quick clicks on one line with the first on the wire: the middle one Superseded, the first and last
      sent, nothing left pending (`latest` queues, never aborts). Copies [cart.test.ts:1500][hy-cart] "rapid clicks
      abort prior request, only last executes". built: `shop/quantity-clicks`.
    - [x] L1 × 64 carts under L3 (have: `seededStress`, `long`). built: `shop/stress-36`, `shop/long`,
      `shop/stress-many-shoppers`.
  - **Structure:**
    - [x] S1: `Shopper` → `Cart` → `CartBadge`, with S9 at the badge, under L3. built: `shop/chain`.
    - [ ] S1 and S9 through `CartLine`. left: @task.V3.T57, needs `.each`.
    - [ ] S2: 1,000 `CartLine`s under L5, with "clear cart" raised. left: @task.V3.T57, needs `.each` and raise into
      copies.
    - [x] S3: 64 shoppers under L3. built: `shop/stress-many-shoppers`.
    - [x] S6 × {flow first, shopper forgotten, reloaded}. built: `shop/flow-first`, `shop/shopper-forgotten`,
      `shop/reloaded-mid-add`.
    - [x] S6 cart first, refused `BlockedByDependents` while the badge and flow are bound (Actors R20, Stories R3).
      built: the `cartFirst` builder.
    - [x] S6: a checkout flow bound after its cart has a line begins: inverted (Turn R12; its mirror's baseline is
      silent, Turn R22), owner @task.V3.T57. built: `shop/flow-bound-late`.
    - [ ] S6 with a challenge open. left: @task.V3.T57, needs `subroutine` (`ThreeDSecure`).
    - [x] S7: a second `Cart` ref with another shopper, refused `ConflictingActorRef` (Actors R5, Stories R3). built:
      the `conflictingCart` builder.
    - [ ] S7: a duplicate `.each` key, refused: left: @task.V3.T57, needs `.each`. A missing service at boot: left:
      @task.V3.T21, needs boot to refuse an operation whose service is missing.
    - [ ] Switching carts cancels the old cart's in-flight refresh. Copies [cart.test.ts:1949][hy-cart] "hydrating a
      different cart cancels in-flight authoritative revalidation". left: @task.V3.T21, needs R `cart` with
      `O.x.subscribe`.
    - [x] The same cart ensured twice is one incarnation with its lines. Copies [cart.test.ts:673][hy-cart] "no-ops when
      same cart ID already hydrated". built: `shop/same-cart-twice`.
  - **Edges:**
    - [x] E1: the empty cart before any add. Copies [cart.test.ts:717][hy-cart] "returns EMPTY_CART_STATE before
      hydration". built: `shop/browse` ("empty").
    - [x] Quantity 0 removes the line. Copies [cart.test.ts:951][hy-cart] "decrease to zero routes to remove (quantity:
      0)". built: `shop/quantity-zero`; 0 and negative quantities in the `shop` samples.
    - [ ] E4: 1,000 lines and one past the cart's `max`. left: @task.V3.T57, needs `.each({ max })`.
    - [x] E5: the retry delay at 0, 2^31 − 1 and 2^31 ms. built: `shop/busy-edges`. At −1 (have: `busyRefused`) it is
      refused today; Turn R14 counts it as 0 once @task.V3.T57 moves that check.
    - [x] E7: an owed record of a newer format (have: `unreadOwed`). E8: a reload mid-charge and mid-add. built:
      `shop/unread-owed`, `shop/lost-confirm`, `shop/reloaded-mid-add`.
    - [ ] E8: a reload mid-challenge. left: @task.V3.T57, needs `subroutine` (`ThreeDSecure`).
  - **Combinations:**
    - [ ] A change that fails while the first load is in flight restores the loaded cart. Copies
      [cart.test.ts:5971][hy-cart] "restores the loaded cart after a change that fails while the first load is in
      flight". left: @task.V3.T21, needs R `cart`.
    - [x] Context with persistence and lanes. built: `shop/reloaded-mid-add`, `shop/chain`.
    - [ ] Quota at checkout (step 13): left: @task.V3.T28, needs store adapters. Two tabs (step 14): left:
      @task.V3.T27, needs multi-tab ownership. A server-rendered page with an add in flight (step 18): left:
      @task.V3.T30, needs server rendering.
    - [x] `CheckoutFlow` sends `CardChosen` and `PayRequested` to `Checkout/Pay`. No source. built:
      `shop/checkout-sends` (Actors R16).
    - [x] The send table's persisted rows through `Subscription`'s renewal: kept by work in flight, ended and restored
      (work in flight, then the grace), restored with a held unknown delivered first, never created, forgotten, a
      record that does not decode, ending with an unwritten change the next incarnation holds, being disposed. No
      source. built: `shop/renewal-busy-pay`, `shop/renewal-ended-pay`, `shop/renewal-unsure-pay`,
      `shop/renewal-unopened-pay`, `shop/renewal-forgotten-pay`, `shop/renewal-damaged-pay`,
      `shop/renewal-ending-pay`, `shop/renewal-disposing-pay` (Actors R16, I14).
    - [ ] A send to a persisted actor while the Runtime boots, queued. left: @task.V3.T99, needs a persisted sender
      owed an ending at boot.
    - [ ] A send to a lazy entry not adopted, dropped NotAdopted. left: @task.V3.T48, needs lazy entries.
  - [x] **Variety:** a full checkout (`shop/checkout-steps`) against `cells`' one-click (`cells/usual`); a guest shopper
    (`shop/guest-browse`) against a signed-in one (`shop/browse`). built.
  - **Findings:**
    - [x] A refused add removes only its own line. Copies [cart-transactions.test.ts:210][hy-tx] "removes only a
      rejected unkeyed add transaction" and [cart.test.ts:4583][hy-cart] "empty cart add: optimistic line removed on
      reject". built: `shop/refused-add-alone`.
    - [x] One line's request never aborts another's. Copies [cart-transactions.test.ts:378][hy-tx] "does not let one
      keyed line abort an unrelated line" and [cart.test.ts:1530][hy-cart] "cross-line independence: line A mutation
      does not cancel line B". built: `shop/independent-lines`.
    - [x] A failing line rolls back alone. Copies [cart.test.ts:1579][hy-cart] "concurrent rollback: failing line A does
      not clobber line B". built: `shop/failing-line-alone`.
    - [ ] A stale snapshot never brings back a removed line. Copies [cart.test.ts:1630][hy-cart] "concurrent removes: a
      stale out-of-order snapshot does not resurrect removed lines". left: @task.V3.T21, needs R `cart`: each
      `setQuantity` answer carries only its own line, so step 1 has no whole-cart snapshot to go stale.
    - [ ] Stale overlapping add answers merge only their own lines. Copies [cart-transactions.test.ts:253][hy-tx]
      "merges only add-owned lines from stale overlapping add responses". left: @task.V3.T21, needs R `cart` with
      `optimistic` values.
    - [x] Checkout waits for the cart to settle. Copies [cart-tracker.test.ts:543][hy-track] "ignores pending cart state
      until the cart settles", reshaped: `Begin` is denied `CartBusy` while a line waits. built:
      `shop/waits-while-busy`.
    - [x] A quantity never answered (lost, its write refused) or answered for a line the server no longer holds
      clears its wish, so checkout can begin. No source. built: `shop/quantity-lost`, `shop/quantity-not-saved`,
      `shop/removed-line-answer`.
    - [ ] The checkout's trace waits for the cart to settle. left: @task.V3.T49, needs `inspect` sinks.
    - [x] Records under cart names this release cannot read (an owner that is a number, a name with an extra field)
      are quarantined and reported at the boot, and no cart starts under them (Restore R5). No source. built:
      `shop/unreadable-name`.
    - [x] Owed records under names no ref gives (a local `~` name with its actor record, an empty name, a broken
      escape, spaces that do not name themselves back) wake no cart (Restore R5, WriteAhead I3). No source. built:
      `shop/odd-record-names`; the same shapes are failures in `bank-planned-edges`, so stress runs draw them.
    - [x] Records whose key and content disagree (the main cart's record under a local key and the guest's key,
      an owed record naming it under a local key and a key that does not round-trip, one kind's text under another
      kind's prefix): the main cart restores its own line and hears no ending it never made (Restore R5). No
      source. built: `shop/borrowed-records`; owed records under another identity's key are failures in
      `bank-planned-edges`.
    - [x] A context consumer restored by a reload publishes once (Turn I9). built: `shop/browse` with a reload that
      attaches nothing.
  - **Runtime life** (@task.V3.T99; each test is an `it.fails` until its feature is built):
    - [x] A payment the shop has not taken is listed by `unsettledWrites` for a close warning, and nothing once it
      answers (Actors R26). No source. built: `shop/leave-while-paying`.
    - [x] A payment SDK session that fails to close when the services are released at sign-out: CleanupFailed
      (Actors R23). No source. built: `shop/session-close-fails`, port fake `ShopFakeSessionCloseFails`.
    - [ ] A Pay disposed while its intent-status read is out, whose cleanup throws: the ref is quarantined and the
      next ensure reports CleanupFailed (Actors R23). left: the user's read on the quarantine of a ref.
    - [ ] `runPromise` from a host (Actors R27). left: its public signature, the user's read.

### cells

A one-click checkout: a client-side cell over pay's body. Kept as it is. Source: no source.

- **Machines:** the cell (have, id `Checkout/Pay` in its own app).
- **Operations:** pay's `pay` contract (have), with `AbortPay`.
- **Journeys:** 1. One click: pay → abort or succeed.
- **Features by step:**
  - **used today:** `reject`, `NotSent { Rejected }` (the cell's pay body); `O.x.cancel`, `NotSent { Cancelled }`,
    `CancelMissed` (`AbortPay`); endings, `Flow.uncertain`, `unknown` (the cell); `persist`, restore, reload (the cell).
  - **step 1:** `NotSent { Disposed }`, `unknown { Disposed }` (the cell disposed mid-pay).
- **Scenarios:**
  - [x] Usual, `long` and `seededStress` (have). built: `cells/usual`, `cells/long`, `cells/stress-56`.
  - [x] S6 disposed under L3: a charge on the wire past the disposal's bound ends unknown Disposed, and one never sent
    ends NotSent Disposed. built: `cells/disposed-on-wire`, `cells/never-sent-disposed`. Inverted (WriteAhead R14,
    WriteLanes R10): the restore then ends the same Attempt again unknown Restored, owner @task.V3.T56 (the lane
    stays Held after its ending is heard, as with Restore R3's re-heard head; needs a heard mark in the record).
  - [x] S6 reloaded under L3: a charge on the wire at a reload ends unknown Restored. built: `cells/reloaded-on-wire`.
  - [x] E1: an empty cart and intent id. built: `cells/empty-ids`.
  - [x] E3: an intent id (the key of `pay`) as a long key round-trips, timed on the bench (no key size bound,
    @plan.Pending.D24). built: `cells/long-key` (100,000 characters).

### lanes

A sync client whose three remotes differ only in lane policy. Kept as it is. Source: no source.

- **Machines:** `Lanes/latest`, `Lanes/serialize`, `Lanes/cancel` (have); `Lanes/paged` (step 1), whose lane key
  holds a page number (T `sync-page`, `serialize`).
- **Operations:** T `sync` under each policy (have).
- **Journeys:** 1. Commit: rapid commits under each policy.
- **Features by step:**
  - **used today:** `latest`, `Superseded` (`Lanes/latest` (`stressDisplacedPastItems`)); `concurrency: "cancel"`
    (`Lanes/cancel` (`displacedOnWire`)); endings, `Flow.uncertain`, `unknown` (every `Lanes/*`); Attempts: `O.x.retry`,
    `retryable`, `StillUnknown` (every `Lanes/*` retry); canonical keys, `InvalidKey`, `KeyOmitsInput` (long keys;
    canonical forms added at step 1); `persist`, restore, reload (persisted lanes).
  - **step 1:** a deep mailbox, no ending lost (events well past the old scale to one `Lanes/*` actor); `serialize`, a
    deep queue, no ending lost (`Lanes/serialize` well past the old 64 queued).
  - **step 7:** `NotSent { OldVersion }` (release 2 changes the `sync` key fingerprint); `previous` holds,
    `O.x.previous` (the old-key lane held under release 2).
- **Scenarios:**
  - [x] **Usual and load:** `usual`, `seededStress`, `nearBound` (12 queued) (have). built: `lanes/usual`,
    `lanes/stress-36`, `lanes/stress-near-bound`.
  - [x] **Load:** L2: a head and a queue well past the old 64 commits under `serialize`, every one ending, timed on the bench.
    built: `lanes/serialize-deep` (1,000 queued). Events to one actor well past the old 1,024, none refused, no
    ending lost, doubled or made up: a runtime test over `lanesSetup`, since a Story's send runs its turn before the
    next. built: `tests/lanes/lanes.test.ts` (20,000 sends).
  - [x] **Structure:** S3: one key under two actors, under L3. built: `lanes/one-key-two-actors`. S6 × {disposed,
    reloaded} with queued, held and running commits of several keys. built: `lanes/disposed-with-work`,
    `lanes/reloaded-with-work`.
  - [x] **Edges:** E3: long keys and strings (`longCommit`, a million characters, timed), in the stress
    samples; `Unencodable` (have).
    built: `lanes/stress-36` and the stress samples.
  - [x] **Keys** (corrected: Operations O1 says "Unicode spelling matters"): one name in NFC and decomposed forms names
    two lanes. built: `lanes/two-spellings`.
  - [x] **Keys:** page `-0` names the lane of page `0`: inverted (Operations O1; today it declines
    `NotSent { Unencodable }`), owner @task.V3.T21. built: `lanes/negative-zero`, on the new `Lanes/paged` client,
    whose key holds a page number.
  - [ ] **Combinations:** release 2 changes the key fingerprint: a held lane ends `NotSent { OldVersion }` and the old
    lane is held as `previous`. left: @task.V3.T56, needs release versions (step 7).
  - [x] **Findings:** `stressDisplacedPastItems` and `displacedOnWire` (have). built:
    `lanes/stress-displaced-past-items`, `lanes/displaced-on-wire`.

### sync

A git client, grown with a repo around today's sync machine. Source: no source; the 4xx rule copies kamp.us's live
retry.

- **Machines:**
  - `Git/Sync` (have), shared.
  - `Repo` (step 1), shared, named by repo, holding a `Flow.private` token and ⇠ `Git/Sync`'s head and backoff as
    context; `Commit` sends `SyncRepo` and `PushSeen` sends `Pushed` to the main client (two events and their
    handlers added: the product tells its client to sync; `PushSeen` stands in for S `headPushes` until step 12).
  - `Git/Mirror` (step 1), shared, named by remote, unpersisted: forwards each push to its upstream mirror until the
    push's hop count reaches its time to live. Two mirrors linked to each other are the loop guard's runaway chain.
  - `Git/MirrorStatus` (step 1), shared, ⇠ a mirror's count, so each hop is also a context update.
  - `Git/Replica` (step 1), shared, ⇠ a mirror's count and last commit; its `onContext` turn pushes each new commit
    to its upstream mirror, so a send made by an `onContext` turn is in a runaway chain.
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
  - [x] **Usual:** sync, peek (have); a repository opened with a token reads its client's head and backoff. built:
    `sync/usual`, `sync/open-repo`.
  - [x] **Load:** L1 × 64 repositories on their own clients, every other one rate limited, every fourth answer lost
    (L3) (have in part: `seededStress`). built: `sync/stress-many-repos`, `sync/stress-36`.
  - [x] **Structure:** S3 × 64 repositories, each a tree of its own client. built: `sync/stress-many-repos`. S6 ×
    {repo first, reloaded} during a backoff. built: `sync/repo-first`, `sync/reloaded-in-backoff`. Sync first,
    refused `BlockedByDependents` while a repository is bound (Actors R20). built: the `syncFirst` builder.
  - [x] **Structure:** S6: a repository opened during its client's backoff shows it: inverted (Turn R12), owner
    @task.V3.T57. built: `sync/repo-opened-in-backoff`.
  - [x] **Edges:** E5: a retry-after of 0, 2^31 − 1 and 2^31 ms. built: `sync/retry-edges`; −1 is refused today and
    counts as 0 once @task.V3.T57 moves that check (Turn R14). E1: an empty repository name. built: `sync/empty-name`.
  - [ ] **Combinations:** release 2 of `Repo`: left: @task.V3.T56, needs release versions. Pushes: left:
    @task.V3.T25, needs streams.
  - [ ] **Variety:** pushed against polled. left: @task.V3.T25, needs S `headPushes`.
  - [x] `Repo` sends `SyncRepo` and `Pushed` to `Git/Sync`. No source. built: `sync/repo-commits` (Actors R16).
  - [x] Loop guard: two mirrors forwarding to each other stop at `RuntimeDefaults.loopGuard`; a chain of exactly the
    guard with a context update at each hop is never refused; an import of a branch name where a commit belongs is
    refused on the sender; a replica's `onContext` sends counted, stopping its loop at the guard; one count shared
    by two replicas that one send-less push reaches, alone or each feeding its own mirror pair. No source. built:
    `sync/mirror-loop`, `sync/mirror-chain-with-status`, `sync/mirror-imports-ref`, `sync/replica-loop`,
    `sync/replicas-loop`, `sync/replica-pairs` (Actors R13, I20).
  - [ ] **Findings:** a 4xx that isn't a rate limit is not retried. Copies [liveRetry.unit.test.ts:27][kp-retry] "does
    NOT retry a genuine 4xx app error". left: needs a `BadRequest` failure on `Git/sync`, an edit to an old contract
    this row does not allow; the user's call.
  - [x] Variety, unpersisted: a sync the Git host has not taken is listed by `unsettledWrites` for a close warning,
    and nothing once it answers (Actors R26; @task.V3.T99, an `it.fails` until built). No source. built:
    `sync/leave-while-syncing`.

### transfers

A bank app grown around today's account machine. Source: tus-js-client for a cheque deposit's chunked upload;
kamp.us for rows restored after a failure.

- **Machines:**
  - `Bank/Transfers` (have), shared, named by account.
  - `Customer` (step 1), shared, ⇢ `customer`, holding refs to the accounts.
  - `TransferForm` (step 1), ⇠ `customer`, reading R `balance`; shared until a Story can drive a local actor
    (@task.V3.T76). From step 2, `StepUp` is a `subroutine` in it.
  - `ChequeDeposit` (step 4), shared, named by deposit, ⇠ `customer`.
  - `Statement` (step 11), local, ⇠ `customer`.
  - `StandingOrder` (@task.V3.T81), shared, persisted, named by order, ⇠ `customer`, reading R `balance`; its
    `Plan.first` and `Pause.until` are `DateFromString` fields.
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
  6. Standing order: plan the rent from a date, pause it until one or with no end, resume.
- **Features by step:**
  - **used today:** `Flow.input` value-named actors (`Bank/Transfers`, named by account); `schedules` with `armOn` (the
    deadline); `forget`, `unsettledWrites` (`forgotten`); `reject`, `NotSent { Rejected }` (T `transfer`); `O.x.cancel`,
    `NotSent { Cancelled }`, `CancelMissed` (abandon); endings, `Flow.uncertain`, `unknown` (`Bank/Transfers`);
    Attempts: `O.x.retry`, `retryable`, `StillUnknown` (resend once); `NotSent { Restored }`, `unknown { Restored }`
    (`lostThenReload`); `StorageRefused`, `NoPersistence` (`refusedWrite`); `NotSent { Disposed }`, `unknown { Disposed
    }` (`heldAtDisposal`); owed endings, quarantine (`quarantined`, receipts); `persist`, restore, reload
    (`Bank/Transfers`).
  - **step 1:** `context`, `onContext`, `Provider.select` (`TransferForm` ⇠ `customer`); `createActor`, `disposeActor`
    (`TransferForm`, a local actor); `resource`,
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
  - **@task.V3.T81:** an event field whose Schema transforms (`StandingOrder`'s `DateFromString` dates); construction
    refusals (builders in `stories/structure.ts`).
- **Scenarios:**
  - [x] **Usual:** send, decline, lose the answer, resend once, abandon (have); the form reads its customer's account
    and checks the balance before a send. built: `transfers/usual`, `transfers/declined`,
    `transfers/lost-then-reload`, `transfers/long`, `transfers/check-and-send`.
  - [ ] **Usual:** a deposit sent in chunks, each reported. Copies [test-common.js:401][tus-common] "should upload a
    file in chunks". left: @task.V3.T21, needs `progress` (T `depositCheque`).
  - [x] **Load:** L1 × 64 accounts with owed endings at boot under L4. built: `transfers/stress-owed-at-boot`.
    Inverted (WriteLanes R10, WriteAhead R14): the second reload delivers each Held head's unknown Restored again,
    owner @task.V3.T56 (Restore R3's re-heard head). `largeReceipts` (have); `stressManyReceipts` (have), run by
    `tests/transfers/durability.stress.test.ts` and kept out of `stories`: a reload at each of its 1,300 steps is too
    long for the sweep. built: `transfers/stress-large-receipts`, `transfers/stress-many-receipts`.
  - **Structure:**
    - [x] S1: `Customer` → `TransferForm`, with S9 at the form. built: `transfers/chain`.
    - [ ] S1 and S9 inside `StepUp`. left: @task.V3.T57, needs `subroutine`.
    - [x] S3 × 64 accounts, one forgotten while the rest reload (L4). built: `transfers/stress-many-accounts`; one
      quarantined (have): `transfers/quarantined`.
    - [x] S6 × {form first, customer forgotten, reloaded}. built: `transfers/form-first`,
      `transfers/customer-forgotten`, `transfers/lost-then-reload`. Customer first, refused `BlockedByDependents`
      while the form is bound (Actors R20). built: the `customerFirst` builder.
    - [x] S6: a form bound after the account was chosen checks its balance: inverted (Turn R12), owner @task.V3.T57.
      built: `transfers/form-bound-late`.
    - [ ] S6 during a deposit. left: @task.V3.T21, needs `progress` (T `depositCheque`).
    - [ ] A large deposit split into parts, one failing. Copies [test-parallel-uploads.js:41][tus-parallel] "should
      split a file into multiple parts and create an upload for each" and [test-parallel-uploads.js:325][tus-parallel]
      "should emit error from a partial upload". left: @task.V3.T21, needs `progress`.
  - [x] **Edges:** E6: cents 0, negative and 2^53 (2^53 past the bank's limit, declined). built:
    `transfers/cents-edges`. E3: a long transfer id round-trips, timed. built: `transfers/long-id` (100,000
    characters). E2: `null` and
    `undefined` payloads, refused `InvalidEvent`. built: `tests/transfers/bank-app.test.ts`. Account names in NFC and
    decomposed forms are two accounts (Machines O2: no Unicode normalization). built: `transfers/two-spellings`.
  - [ ] **Edges:** bigint cents as a key, named "$1n". left: @task.V3.T21, needs bigint key naming (Operations O1). E8:
    a reload mid-deposit. left: @task.V3.T21, needs `progress`.
  - [ ] **Combinations:** a read after a write (an older `balance` answer loses): left: @task.V3.T21, needs read
    freshness. Releases (step 7): left: @task.V3.T56. Notifications (step 12): left: @task.V3.T25.
  - [x] **Variety:** a shared account against a form of its own. built: `transfers/check-and-send`.
  - [ ] **Variety:** a local form. left: @task.V3.T76, needs a Story word that drives a `createActor` actor
    (`Story.machine`); the form is shared until then.
  - [x] `Customer` sends `Send` to the source account: cut (the orchestrator, 2026-11-19). `TransfersMachine` takes
    no input, so it is named by a literal (Actors R5) and a send to an account held in memory does not type-check;
    naming it by value changes its identity, which additive growth forbids.
  - **Standing orders (@task.V3.T81):**
    - [x] Usual: the rent planned from a date, paused until one, reloaded and resumed; a plan over the balance
      returns to the draft. Shaped on [ban.unit.test.ts:36][kp-ban] "permanent ban (no expiry) → banned, carries
      the reason" and [ban.unit.test.ts:43][kp-ban] "ban with a future expiry → banned until then" (an end date or
      none, kept as given); no closer source. built: `transfers/standing-order`.
    - [x] Load: S2 × 32 orders under one customer, under L4. built: `transfers/stress-many-orders`. L3: the balance
      check lost to a dropped network. built: `transfers/order-offline`. No source.
    - [x] Structure: S1 with S9, customer → rent, reloaded with only the rent ensured. built:
      `transfers/order-chain`. S6 × {order first, customer forgotten, reloaded}. built: `transfers/order-first`,
      `transfers/order-customer-forgotten`, `transfers/standing-order`. Customer first, refused
      `BlockedByDependents` while the rent is bound (Actors R20). built: the `customerFirstUnderOrder` builder. No
      source.
    - [x] Edges: E1, E2, E3: first dates at the epoch and ±8.64e15 ms, a memo absent, `undefined` or empty, a pause
      with no end, each read back equal after a reload. built: `transfers/order-date-edges`. E2, E7: a first date
      that is `null`, `undefined` or its ISO text, refused `InvalidEvent`. built:
      `tests/transfers/standing-order.test.ts`. E6: a plan of 2^53 cents, in `bank-orders`. E5: not this feature's,
      the order has no schedule. No source.
    - [x] S7: ten construction mistakes as builders in `stories/structure.ts` (an unset config, a bare context
      slot, operations with no `return`, a text amount, a first date as ISO text, the form's same-named lookup and
      event, a null handler, a half-built read, a hand-written ending), each refused (Compile R2, R3, R4, R5). A
      Story step sending null fails InvalidEvent. Refused payloads stay out of the samples: a refused send fails the
      Story by design, so a generated run cannot carry one without a Story word for an expected refusal. No source.
    - [x] Samples and combinations: `bank-orders` (edge dates, 2^53 cents, a dropped network) in the generator and
      the pair sweep. The app mix takes `bank-planned` (two accounts' transfers beside the rent; newer-format and
      unreadable records) and `bank-planned-edges` (the rest of the old set's steps, receipt edges, edge dates) in
      place of `transfers`, carrying all of its steps, failures and controls between them; the usual set is kept to
      six steps, since the mix's one-network check needs one of five seeds to call every server. built:
      `bank-planned`, `bank-planned-edges`.
    - [x] Variety: a third unrelated app with a transforming event field, unpersisted, a `Duration` driving a
      computed delay. built: `player/sleep-timer`.
  - **Findings:**
    - [ ] A deposit aborted, then resumed from its parts. Copies [test-parallel-uploads.js:448][tus-parallel] "should
      abort all partial uploads and resume from them". left: @task.V3.T21, needs `progress`.
    - [ ] A failed reversal restores the row and carries its code. Copies [optimisticPostDelete.test.ts:21][kp-pdel]
      "POST_DELETE_FAILED restores the post and carries the code for the inline error (#1639)". left: @task.V3.T24,
      needs the statement's domain rows.
    - [x] A disk that takes a write and then refuses it: a transfer's acknowledging write ends it NotSent
      StorageRefused; a lost answer whose Held save and re-send capture are both refused is saved Held once the
      disk has room (WriteAhead R5, R13). No source. built: `transfers/refused-held-write`,
      `transfers/refused-resend-capture`.
  - **Runtime life** (@task.V3.T99; each test is an `it.fails` until its feature is built):
    - [x] Usual: a transfer the bank has not taken is listed by `unsettledWrites` for a close warning, and nothing
      once it answers (Actors R26). No source. built: `transfers/leave-while-sending`.
    - [x] A held transfer stays listed after its account is removed (`disposeActor`), unbound, at the next boot,
      and bound once adopted (Actors R20, R26). No source. built: `transfers/unsure-account-removed`.
    - [x] L1 × 64 and L4: every held account listed at each boot (Actors R26). built: `transfers/stress-owed-at-boot`.
    - [x] A bank client's interrupt cleanup throws when the disposal's bound interrupts a hung transfer: CleanupFailed
      after unknown Disposed (Actors R23). No source. built: `transfers/interrupt-cleanup-fails`, port fake
      `BankFakeCleanupThrows`.
    - [x] E7: forget drops a held wire whose operation and contract an earlier release had, with HoldForgotten, and
      the next boot neither reports nor keeps it (Actors R21). No source. built: `transfers/forgotten-retired-wire`.
    - [ ] L5, S6 child-first and forget-with-hold orders, and step samples offering hold, drop and release words for
      `unsettledWrites`; CleanupFailed and HoldForgotten under load. left: @task.V3.T99's build, with the Cut's
      `unsettled` read.

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
  - `TrustedDevice` (@task.V3.T81), shared, persisted, named by device, ⇠ `session`; its `Trust.until` and
    `Seen.at` are `DateFromString` fields, the second nullable.
- **Operations:** T `begin`, `verify` (have, `reject`); T `setUsername` (step 1); R `me` (step 1).
- **Journeys:**
  1. Sign in: email → T `begin` → code → T `verify` → `SignedIn` → R `me`.
  2. Resend: under cooldown and lockout (have).
  3. Return: a draft goes through the auth redirect and back with `ReturnTo`.
  4. Handle: T `setUsername`, the redirect held until it succeeds.
  5. Sign out: `forget` `AuthSession`.
  6. Trust a device: trust the laptop until a date while signed in, confirm it again after a week, revoke it.
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
  - **@task.V3.T81:** an event field whose Schema transforms (`TrustedDevice`'s `DateFromString` dates);
    construction refusals (builders in `stories/structure.ts`).
- **Scenarios:**
  - [x] **Usual:** sign in with a code (have). A retried handle save releases the held redirect. Copies
    [AuthPage.test.tsx:89][kp-auth] "retry on the stuck surface re-attempts and, on success, RELEASES the redirect".
    built: `sign-in/usual`, `sign-in/handle-retry`.
  - [x] **Load:** L1 × 16 screens for different accounts, one in lockout while another verifies; L4 during a lockout.
    built: `sign-in/stress-many-screens`, `sign-in/reload-in-lockout`.
  - [x] **Structure:** S3 × 16 accounts under L4. built: `sign-in/stress-many-sessions`. S6 × {screen first,
    forgotten, reloaded}. built: `sign-in/screen-first`, `sign-in/sign-out-forgets`, `sign-in/reloaded-mid-handle`.
    Session first, refused `BlockedByDependents` while its return is bound (Actors R20). built: the `sessionFirst`
    builder.
  - [x] **Structure:** S6: a return saved after its session signed in returns at once: inverted (Turn R12), owner
    @task.V3.T57. built: `sign-in/return-saved-late`.
  - [ ] **Structure:** S6 while `Reauth` runs, and S9 inside `Reauth`. left: @task.V3.T57, needs `subroutine`.
  - **Edges:**
    - [x] A blank handle never calls the server. Copies [AuthPage.test.tsx:164][kp-auth] "a blank username field never
      touches setUsername and never holds the gate". built: `sign-in/blank-handle`.
    - [x] E1: an empty email and a code of 0 characters. built: `sign-in/empty-email`, `sign-in/empty-code`. E3: an
      a long email round-trips as the begin key, timed. built: `sign-in/long-email` (100,000 characters).
    - [x] E5 corrected: the lockout delay is 60 seconds per wrong try, computed from the tries, so −1, 0 and 2^31 ms
      are unreachable here; computed-delay edges are built in `shop/busy-edges` and `sync/retry-edges`.
  - [ ] **Combinations:** release 2 (step 7): left: @task.V3.T56. Strict Mode (step 18): left: @task.V3.T30.
  - [x] **Variety:** an unedited prefilled handle needs confirming. Copies [UsernameBootstrap.test.tsx:32][kp-boot]
    "does NOT commit the unedited email prefill on the first submit — it asks to confirm". built:
    `sign-in/unconfirmed-prefill`.
  - **Findings:**
    - [x] A failed handle save holds the redirect and keeps the handle. Copies [AuthPage.test.tsx:72][kp-auth] "parks on
      a retryable surface and HOLDS the redirect when setUsername fails — the handle is not dropped". built:
      `sign-in/handle-retry` ("stuck").
    - [x] Submitting twice holds the gate once and releases it once. Copies [signupUsernameGate.test.tsx:34][kp-gate]
      "is idempotent: a second begin/end is a no-op, not a toggle". built: `sign-in/submit-twice`.
    - [x] A draft survives the redirect, then clears on submit. Copies [draftStorage.unit.test.ts:45][kp-draft]
      "survives the signed-out → auth-redirect → return round-trip, then clears on submit (AC1+AC2)". built:
      `sign-in/handle-retry` ("released", "submitted").
  - **Trusted devices (@task.V3.T81):**
    - [x] Usual: signed out, a device is denied trust; signed in, the laptop is trusted until a date and seen; a
      millisecond short of a week it is fresh, at a week due; it survives a reload and is revoked. Shaped on
      [ban.unit.test.ts:43][kp-ban] "ban with a future expiry → banned until then"; no closer source. built:
      `sign-in/trust-device`.
    - [x] Load: S2 × 16 devices under one session, under L4. built: `sign-in/stress-many-devices`. No source.
    - [x] Structure: S1 with S9, session → laptop, reloaded with only the laptop ensured. built:
      `sign-in/device-chain`. S6 × {device first, session forgotten, reloaded}. built: `sign-in/device-first`,
      `sign-in/device-session-forgotten`, `sign-in/trust-device`. Session first, refused `BlockedByDependents` while
      the laptop is bound (Actors R20). built: the `sessionFirstUnderDevice` builder. No source.
    - [x] Edges: E1, E2, E3: trust until the epoch and ±8.64e15 ms, a label absent, `undefined` or empty, a device
      seen at no time (`null`), each read back equal after a reload. built: `sign-in/device-date-edges`. E2, E7: a
      trust date `null`, `undefined` or its ISO text, and a seen time `undefined` or missing, refused
      `InvalidEvent`. built: `tests/sign-in/trusted-device.test.ts`. E5: the week's reminder a millisecond short and
      at a week. built: `sign-in/trust-device`. No source.
    - [x] S7: seven construction mistakes as builders in `stories/structure.ts` (the session's definition as a
      slot, a text field, the bare `me` contract, a `{ day: 7 }` delay, NaN and infinite reminder days, a null
      handler), each refused (Compile R2, R4; Turn R14). No source.
    - [x] Samples: `auth-devices` (edge dates, an unreadable laptop record) in the generator, the stress generator
      and the pair sweep. built: `auth-devices`.
  - [ ] Sign-in's samples in the app mix: left for the mix's own seed count: a sixth part fails the mix's one-network
    check at five seeds, as a lean devices set did again (@task.V3.T81). The pair sweep runs them (`auth-session`,
    `auth-devices`).

### session

A workspace shell. Today's four machines stay; billing and reads are added. Source: kamp.us's app shell and snapshot.

- **Machines:**
  - `Workspace/Org` (have), ⇢ `org`; `Workspace/Session` (have), ⇠ `org` ⇢ `user`; `Workspace/Team` (have),
    ⇠ `user` ⇢ `team`; `Workspace/Badge` (have), ⇠ `team`.
  - `Workspace/Avatar` (step 1), persisted, ⇠ `user` from the session, undefined when signed out.
  - `Workspace/Status` (step 1), ⇠ `team` with no default provider, so its ref must name one.
  - `Workspace/Byline` (step 1), persisted, ⇠ `user` from the session (undefined when signed out) and `team` from
    the core team; counts each change of either it hears.
  - `Workspace/Inbox` (T9), persisted, ⇢ its messages; `Workspace/Digest` (T9), persisted, ⇠ a Date or undefined,
    NaN, -0, a Map, a Set, a class instance, an Option and a nested mix, and a reaction reading its own memory;
    `Workspace/ThreadView` (T9), persisted, ⇠ a tree whose replies point back (cycles).
  - `Workspace/Presence` (T9), never saved, ⇠ `user`; `Workspace/Dot` (T9), persisted, ⇠ a presence its ref names.
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
  - **step 1:** `ContextCycle`, `MissingContextProvider` (a cycle and a missing provider as Stories); a deep mailbox,
    no ending lost (sends well past the old scale to one `Badge`); `StorageRefused`, `NoPersistence` (a failed
    storage read:
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
  - [x] **Usual:** two four-layer trees, a reload, a middle-layer rename (have). The shell paints before the session
    settles. Copies [App.test.tsx:217][kp-app] "invariant 1: the shell chrome paints while the session is isPending —
    with NO FateClient mounted". built: `session/usual`, `session/shell-before-session`.
  - [x] **Load:** L5: context waves under a held store (have, in `seededStress`). built: `session/stress-36`. L2: sends
    to one badge well past the old 1,024, none refused, no ending lost, doubled or made up, timed on the bench: a
    runtime test over `workspaceSetup`. built: `tests/session/workspace.test.ts` (20,000 pings).
  - **Structure:**
    - [x] S1 × 4 under L5 (have), with S9 at the badges: only badges are touched after the reload. built:
      `session/usual`, `session/fan-out`.
    - [x] S1 × {8, 32} corrected: a definition cannot read its own kind as context, so a chain needs one definition per
      layer; the workspace's four layers are its deepest chain.
    - [x] S2 × {24 (have), 64, 5,000} under L5. built: `session/fan-out`, `session/wall`, and
      `session/stress-wall` (5,000 saved badges), built on call and run by `tests/session/workspace.stress.test.ts`.
    - [x] S3: two roots (have). S4: the team (have). S5: `guestTeam` (have). built: `session/usual`.
    - [x] S6 × {parent first, child first, forgotten, signed out, reloaded}. built: the `parentUnderChildren` builder
      (refused `BlockedByDependents`, Actors R20), `session/child-first`, `session/team-forgotten`,
      `session/signed-out-undefined`, `session/usual`.
    - [x] S6 returned and reloaded with S4: the new `Workspace/Byline` reads the session's user and the team's name
      (a diamond with a direct edge); it comes back after both changed, hearing each once, then a reload owes only its
      unknown user (Actors R9, R18). built: `session/byline-returns`.
    - [x] S7: a missing provider, the new `Workspace/Status` with no team: refused `MissingContextProvider` by
      `ensureActor` and by a Story's ensure (Actors R18). built: the `missingTeam` builder.
    - [x] S7: the live badge's ref naming another team, refused `ConflictingActorRef` (Actors R5). built: the
      `conflictingBadge` builder.
    - [x] S5: the guests' badge opened before the guests' team, which binds the session its own ref names, so
      opening the team later is the same identity (Actors R5, R18). built: `session/guest-badge-first`.
    - [x] L4 over every context Story, builders' runnable steps included: a second reload at every position hears
      nothing the first did not, and an end reload of 0, 1 or 3 hears the same (Actors R9, R19). built:
      `tests/rules/reloads.test.ts`.
    - [x] S5 never saved: the guest's dot starts the guest's presence by its own ref, and a return by a send and a
      reload with nothing open keep that binding (Actors R18). built: `session/guest-dot-returns`.
    - [x] S7 nested: a badge whose ref names the live guests' team bound to another session, refused
      `ConflictingActorRef` (Actors R5). built: the `nestedConflictingTeam` builder.
    - [x] S7: a cycle, corrected: a cycle needs two definitions that read each other as context, which module order
      cannot build without a stand-in definition of the same id (`tests/actors/context.test.ts` uses one), so no app
      reaches `ContextCycle`; whether that refusal should stay is the user's call.
  - **Edges:**
    - [x] E2: an undefined user, read by the new `Workspace/Avatar` after a sign-out, saved and restored. E1: an empty
      user. built: `session/signed-out-reloaded` (the undefined user is saved, so the reload hears nothing),
      `session/signed-out-undefined`.
    - [x] Consumers well past the old scale, each heard: a context update never counts toward the loop guard
      (@plan.Pending.D13). built: `session/wall`, `session/avatar-wall`, `session/stress-wall`.
    - [x] E7: a corrupt saved record, quarantined. Copies [snapshot.test.ts:108][kp-snap] "returns null on a corrupt
      (non-JSON) payload, no throw". built: `session/corrupt-record`.
    - [x] E2, E5: every value kind a selector returns (a Date or undefined, NaN, -0, Map, Set, class instance, Option,
      nested mix, cycles) heard once per change and never at a reload; a reaction reading memory keeps the baseline it
      read across a reload (Actors R18, R19; Turn R22). built: `session/digest-heard`, `session/thread-heard`,
      `session/digest-quiet`; the inbox samples set in the generator.
    - [x] E3 corrected (@plan.Pending.D23, no codec bounds): 5,000 calendar days selected by a saved and an unsaved
      consumer, saved and restored with nothing made up or lost; a 3,001-row log under three memory-reading reactions;
      a step the store refuses restores a consistent world. built: `session/stress-agenda-long`,
      `session/archive-large`, `session/digest-refused`, `session/unread-recovers`.
    - [x] E7: a record naming a last-seen form no release wrote, quarantined, never thrown; a format-1 record steps to
      format 2 with nothing made up (Restore R5). built: `session/corrupt-seen`, `session/format-one-avatar`.
    - [x] Context edge values (@plan.Pending.D22): each value kind (undefined, Option, Date, NaN, -0, Map, Set, class
      instance) across repeated reloads, hearing nothing made up (Actors R9, R19). built: `session/digest-heard`,
      `session/digest-quiet`. A cyclic selection never crashes the run. built: `session/thread-heard`. A value at and
      past the measured depth limit (@plan.Pending.D26). built: `session/lists-at-depth`, `session/folders-at-depth`,
      `session/maps-at-depth`. A source that fails then recovers (Turn R25). built: `session/unread-recovers`.
    - [ ] Stress and mix reach of the inbox: 64 and more digests on one inbox under L5, and the inbox samples in the
      mix and the pair sweep. left: no owner Task (routed to the orchestrator); the mix and the pair sweep take one
      samples set per fixture.
    - [x] E3: an oversized record, quarantined unread. Copies [snapshot.test.ts:123][kp-snap] "returns null on an
      oversized payload without parsing it". built: `session/stress-oversized-record`.
  - **Combinations:**
    - [x] An identity switch drops the old identity's saved data. Copies [App.test.tsx:692][kp-app] "AC3: an identity
      switch A→B tears down the PREVIOUS identity's snapshot" and [App.test.tsx:711][kp-app] "AC3: sign-out / account
      deletion (A→signed-out) tears down A's snapshot". built: `session/new-account-runtime`.
    - [x] A record written under one user never restores under another. Copies [snapshot.test.ts:364][kp-snap] "a
      snapshot written under user A does NOT hydrate under user B". built: `session/new-account-runtime` ("bob").
    - [x] A failed storage read starts with no persistence and never overwrites saved data; a refused write keeps the
      live state and saves the newest later (Restore R9). built: `session/refused-load-keeps-data`,
      `session/refused-write-retries`.
    - [ ] A failed storage read with a sign-in queued. left: @task.V3.T28, needs a send before ready, which only a
      slow store read allows; no handle exists before ready today (@plan.Pending.D17).
    - [ ] Quota, a slow read and a non-durable store. left: @task.V3.T28, needs store adapters.
  - [x] **Variety:** singleton providers here, a keyed provider in `pay` (`Cart`, named by its owner). built:
    `session/usual`, `shop/browse`.
  - [ ] **Variety:** eager and lazy entries. left: @task.V3.T48, needs lazy entries.
  - **Findings:**
    - [x] A signed-out boot restores nothing signed-in. Copies [App.test.tsx:725][kp-app] "identity-scoped: a signed-out
      settle hydrates NO authed snapshot (anon owns none)". built: `session/new-account-runtime` ("next").
    - [ ] A boot with no host page degrades without throwing. Copies [boot.test.ts:24][kp-flags] "returns undefined when
      there is no window (outage fallback / flag off) — no throw". left: @task.V3.T30, needs server rendering.
    - [x] A context update never counts toward the loop guard, so it never waits (@plan.Pending.D13). built: `session/avatar-wall`.

### command-palette

An editor's command palette, grown with a workbench around it. Source: ui-sdk's command tests.

- **Machines:**
  - `Palette/Palette` (have), shared. From step 3 it emits `CommandRan`; from step 5 it declares `props` with
    defaults, so every existing Story runs unchanged and new Stories use it as a local actor.
  - `Workbench` (step 1), shared, holding the open documents, which the palette reads as context; from step 3 it
    hears `CommandRan` and opens that document. It does not send: it mirrors data, which context and `onContext`
    already do (the orchestrator, 2026-11-19).
- **Operations:** T `runCommand` (have).
- **Journeys:**
  1. Run: open → type → highlight → T `runCommand` → `Workbench` opens the document.
  2. Pages: frames with Back.
  3. Live list: the palette reads a new list from `Workbench` mid-search.
- **Features by step:**
  - **used today:** guards, `deny`, `check` (`Palette/Palette`'s `deny`); `reject`, `NotSent { Rejected }` (T
    `runCommand`); endings, `Flow.uncertain`, `unknown` (`Palette/Palette`); `persist`, restore, reload
    (`Palette/Palette`).
  - **step 1:** `context`, `onContext`, `Provider.select` (the palette reads the `Workbench`'s documents).
  - **step 3:** `emits`, `onEmit` (`CommandRan`, heard by `Workbench`).
  - **step 5:** `props`, `onProps` (commands as `props`, with defaults); `createActor`, `disposeActor` (a local
    palette).
  - **step 18:** `useActor` (React) (Strict Mode).
- **Scenarios:**
  - [x] **Usual:** open, search, run (have). Pages are the items of their command. Copies
    [command.test.ts:193][ui-command] "pages are the items of the command with that value". built: `palette/usual`,
    `tests/command-palette/palette.test.ts` (PALETTE-PAGE-1).
  - [x] **Load:** entries at real scale, timed on the bench (have 1,000 and 10,000; 300,000 in a record past 16 MiB).
    Typing bursts under a held store, no source. built: `palette/large-list`, `palette/stress-huge-list`,
    `palette/typing-under-held-store`.
  - [x] **Load** corrected: one keystroke over 10,000 entries. Copies [command.test.ts:155][ui-command] "10,000 items: a
    fuzzy keystroke stays well under a frame". Ranking speed is the fixture's own code, and no test times it; with no
    codec bounds (@plan.Pending.D23) a 10,000-entry list is a bench case for a later Task.
  - [x] **Structure:** S1: frames 1, 8 and 64 deep with Back and Escape, S9 at the deepest: 1 (PALETTE-9, PALETTE-10
    with Escape), 8 with a reload at the deepest, 64 saved and restored whole. built: `palette/frames-8`, the
    `framesSixtyFour` builder. S3: two palettes. built: `palette/two-palettes`.
  - [ ] **Structure:** each palette with its own workbench, read as context. left: needs the palette to declare a
    context slot, an edit to an old machine for a later Task; no send (the orchestrator, 2026-11-19).
  - [x] **Edges:** an empty query keeps the source order. Copies [command.test.ts:120][ui-command] "an empty query keeps
    the source order". built: `palette/empty-query-order`. E3: entries at real scale, timed (`largeList`). built: `palette/large-list`.
  - [x] **Combinations:** the pair sweep (have). built: the `palette` pair sweep.
  - [ ] **Combinations:** Strict Mode (step 18). left: @task.V3.T30, needs React.
  - [ ] **Variety:** a shared and a local palette. left: @task.V3.T76, needs `props` and a Story word for a local
    actor.

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
  - `SleepTimer` (@task.V3.T81), shared per room, unpersisted; its `Set.after` is a `DurationFromMillis` field and
    drives a computed delay.
- **Operations:** T `play` (have, `cancel`); S `speakerState` (step 12, `latest`, `Feed.callback`).
- **Journeys:** 1. Play: play → history back to the last sub-state (have). 2. Group: `Household` plays a group.
  3. Buffering: `Speaker` shows the speaker's reports. 4. Sleep: set a room's sleep timer, cancel it.
- **Features by step:**
  - **used today:** compound `states` (`Music/Player`); `S.X.history`, `history.child`, `S.previous.history`
    (`Music/Player`); `Flow.input` value-named actors (`Music/Player`, named by room); `Flow.private` (`Music/Player`);
    `schedules` with `armOn` (the position tick); `concurrency: "cancel"` (T `play`); endings, `Flow.uncertain`,
    `unknown` (`Music/Player`).
  - **step 1:** `send(ref, event)` (`Household` sends `Play` to grouped rooms).
  - **step 12:** `delivers: "latest"`, `Feed.callback`, `dropAt` (S `speakerState` into `Speaker`).
  - **@task.V3.T81:** an event field whose Schema transforms (`SleepTimer`'s `DurationFromMillis`), the third app.
- **Scenarios:**
  - [x] Usual and stress (have). built: `player/usual`, `player/stress`, `player/stress-36`.
  - [x] L1 × 16 rooms playing at once under L5 (bursts of seeks). built: `player/sixteen-rooms`.
  - [x] `Household` plays a group of rooms together, one room at a time by a send to itself. No source. built:
    `player/group-play`; S2 × 64: `player/group-of-64`; forty plays past the guard in total: `player/group-replays`;
    one play whose sends pass the guard though its chain does not: `player/group-past-guard`;
    a room in its grace, an ended unpersisted room, a disposed and an unopened room, a room name with no encoded
    form: `player/group-in-grace`, `player/group-room-ended`, `player/group-rooms-absent`, `player/group-bad-room`
    (Actors R13, R16, I25).
  - [x] S6 × {room disposed, room reloaded} while its tick is armed. built: `player/room-disposed`,
    `player/room-reloaded`.
  - [x] E1: an empty room. built: `player/empty-room`. E3 corrected: a room is its player's name, not a key; a long
    room name round-trips, timed. built: `player/long-room` (a million characters).
  - [x] A seek far past any track and a negative seek, taken as given (the player keeps no track length). built:
    `player/seek-edges`.
  - [x] Sleep timer (@task.V3.T81): set for half an hour, a millisecond short and at it; cancelled. built:
    `player/sleep-timer`. L1 × 16 timers. built: `player/sixteen-timers`. E5: 0 ms and 2^31 − 1 ms, a millisecond
    short and at it; −1 ms inverted (Turn R14: counts as zero; the runtime refuses the turn), owner to be routed;
    2^31 ms refuses the Set's turn. built: `player/sleep-timer-edges`. E2, E7: a duration `null`, `undefined` or its
    milliseconds, refused `InvalidEvent`. built: `tests/player/sleep-timer.test.ts`. Samples: `sleep-timer`. No source.

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
  - [ ] **Edges:** E1: no rows and an empty query; a stale time of 0; E3 and E6: long keys and a bigint
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
  - [ ] **Load:** L1 × 256 rooms; L5: readings faster than turns, well past the old 1,024 mailbox (step 12);
    L4 mid-pause.
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
    filter change); `serialize`, a deep queue, no ending lost (T `addComment` per card).
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
    `Hub` with no `Account`, refused at boot); a deep mailbox, no ending lost (typing events well past the old 1,024);
    `resource`, `O.x.lookup` (R `history`); `O.x.subscribe`, `staleTime`, `gcTime`, `O.x.refetch` (R `history`);
    `optimistic` values on a read (T `send`'s echo on R `history`); `reject`, `NotSent { Rejected }` (T `ask`, one
    question at a time); `serialize`, a deep queue, no ending lost (T `send` per thread); endings, `Flow.uncertain`,
    `unknown` (T `send`, `ask`); `NotSent { Restored }`, `unknown { Restored }` (owed sends after a reload);
    `NotSent { Disposed }`, `unknown { Disposed }` (a thread disposed mid-send); `progress` (T `upload`);
    `idempotency` (T `send` by client message id); owed endings, quarantine (T `send`); `persist`, restore, reload
    (`Thread`, `Hub`); Runtime per scope, `dispose` (a new Runtime per workspace).
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
    - [ ] L2: queued sends and typing events well past the old 64 and 1,024, none refused, no ending lost, timed;
      flapping connections ending `Flapping` (see @plan.Pending.D14).
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
    - [ ] Closed at once; a reconnect with no bookmark; a long bookmark, timed, with no size bound (@plan.Pending.D24); E7: a position
      that fails to decode; `missed` as `Unproven`, `Lost` and `Reset`.
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
    - [ ] E1: an empty draft; E3: a long draft round-trips, timed.
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

- **shop:** new machines `Shopper`, `Cart`, `CartBadge`, `CheckoutFlow` and later `CartLine`, `AddressForm`,
  `ThreeDSecure`, `ProductPage`; new operations `addLine`, `setQuantity`, `product`, `cart`, `addressLookup`.
  `Checkout/Pay`, its contracts, its adapter and every `shop/…` Story are unchanged. `secondCheckout` gets a Story.
- **cells, lanes:** a manifest and the new Stories in their rows; no machine changes; lanes gains `Lanes/paged`.
- **sync:** new `Repo` and `RateLimit`; `Git/Sync` unchanged.
- **transfers:** new `Customer`, `TransferForm`, `StepUp`, `ChequeDeposit`, `Statement`, R `balance`; one edit, the
  `idempotency` line on T `transfer` (step 4). `stressManyReceipts` is registered.
- **sign-in:** new `AuthSession`, `ReturnTo`, `PasswordSignIn`, T `setUsername`, R `me`; `Auth/SignIn` stays
  unpersisted.
- **session:** new `Workspace/Avatar`, `Workspace/Status`, later `Billing`, reads and writes; the four machines
  unchanged.
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

Found at step 1 (@task.V3.T82), each the user's call:
- @task.V3.T96 owns the actor-to-actor `send(ref, event)` action for `shop`, `sync` and `player` (and `kanban` at
  step 8); `transfers` and `command-palette` dropped it (the orchestrator, 2026-11-19).
- `ContextCycle` needs two definitions that read each other, which module order cannot build without a stand-in
  definition of the same id; no real app reaches it today.
- `sync`'s 4xx finding needs a `BadRequest` failure on the old `Git/sync` contract, an edit additive growth forbids.
- Every app grown at step 1 keeps its old `App` value for its old Stories beside a grown one of the same id and
  scope, so no old Story's setup or saved seed changes.

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
[kp-ban]: ../../codebases/phoenix/apps/web/worker/features/pasaport/ban.unit.test.ts
[kp-shortcut]: ../../codebases/phoenix/apps/web/src/lib/searchShortcut.test.ts
