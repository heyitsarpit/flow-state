# Checkout reference app

A storefront cart and checkout, and a merchant's refunds page, written against the Flow State design
(machine-design.md with every merge). It exists for one situation the dispatch desk never meets: a write where a
blind re-send is the bug, because it could charge a card twice.

Nothing here runs yet: Flow State's runtime is the design. The Effect-only files (`adapters/`) type-check with
`nubx tsc -p workflow/plans/flow/references/checkout/tsconfig.effect-only.json`. Every file type-checks against stand-ins with `typecheck/tsconfig.checkout.json`; ../CONVERSION.md says what that proves.

## Where the data comes from

- `adapters/shop-api.ts`: our shop's HTTP API over `fetch` (Effect's `FetchHttpClient.Fetch`). Our server talks to
  Stripe's API with the `Idempotency-Key` the browser sends, which is Flow's `attempt.id`.
- `adapters/stripe.ts`: Stripe.js in the page. `handleNextAction` returns a Promise and takes no AbortSignal.
- `adapters/server.ts`: the shop's and Stripe's behaviour as pure functions over one truth (`ShopTruth`, an Effect
  Schema): idempotency records, the intent's states, the capture job, webhooks.
- `testing/stripe.fake.ts`: that truth as a `Fake.server`, its endpoints routed by `Fake.fetch` under the real
  `ShopHttp` adapter, and a Stripe.js stand-in over its `nextAction` endpoint.

## Feature map

| Module  | Files                     | How it is different                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cart    | `features/Cart/`          | stepper copies that own nothing (`.each` over memory); line quantities on `latest`; the coupon a plain unkeyed write whose guess lives in memory beside the store's predicted line totals; two screens (page and header) on one record queue                                                                                                                                                            |
| Pay     | `features/Pay/`           | the payment as the hold's hardest case: `attempt.id` as Stripe's idempotency key, a reconcile read before any re-send, `mayHaveApplied` in the receipt's wording; Stripe.js as a commit that cannot be aborted; 3-D Secure as a subroutine with exits and a nested resumable `Countdown`; compensation on leave; a summary that resets per cart and waits for its own write; guest vs signed-in context |
| Refunds | `features/Refunds/`       | money in order: `serialize` per charge, `outstanding`, `Overloaded`; predicted refunded amounts over the record beneath; `writes` invalidating the list; reload mid-refund                                                                                                                                                                                                                              |
| Shopper | `features/Shopper/`       | the shared actor the checkout reads as context                                                                                                                                                                                                                                                                                                                                                          |
| App     | `app/`, `next/`, `tools/` | persisted browser setup with a version (orphaned lanes re-sent), SSR of the cart page with a commit in flight, Inspection of unknown charges, `flow explain` of a late challenge                                                                                                                                                                                                                        |

Stories are transcripts (`*.story.ts`); their checks are in `*.test.ts` with the test runner's `expect` over checkpoint reads.
The property test (`testing/checkout.property.test.ts`) checks that no intent is charged twice and none is left
authorized.

## Build notes (B7)

- **F11 B** ("a subroutine that owns a write"): rule 48 forbids a mapped write under a subroutine, so Stripe.js's
  `handleNextAction` is the host's `authenticate` commit and its ending arrives after the `TimedOut` exit. Marked
  `design gap:` in `three-ds.subroutine.ts`, as the desk's Resolve wizard does.
- **O10 C** (COVERAGE: "the challenge's ending after `TimedOut` may not leave PAID"): PAID owns no call, so rule 15
  could never fire there. Built where it does: the late ending while the shopper is paying again may not leave
  PAYING (`pay/late-while-paying`).
- **P4 C** (COVERAGE: "paying in a second tab is refused by the intent's `reject`"): a lane is per Runtime, so
  `reject` cannot see another tab's confirm. Built as Stripe's refusal (`IntentBusy`); marked `design gap:` in
  `pay.story.ts`.
- **O11 D** (`NotSent { Disposed }`): skipped. No checkout path commits into a disposed actor; a Story would have to
  stage it against the app's own flow.
- `StorageRefused` is not repeated here; the desk's `editor/quota-refused` covers it.

## Playback (B8)

`app/presentation.ts` is "Pay safely", a list of presentations over the Stories that hold the module checkpoints
(`cart`, `quantity-coalesced`, `coupon-predicted`, `paid`, `challenge-timing-out`, `pay-unsure`, `reconciled`,
`voided-on-leave`, `reload-mid-charge`, `refunds-queued`; `challenge` is in `pay/challenged`). `app/demo.tsx` plays
it in a `StoryPlayer`, and replays the property test's shrunk counterexample when one was emitted (X6).

## Design gaps

Every `// design gap:` comment in this folder's code (grep `design gap:`). 11 gaps; the text is the comment's. Findings against the design from the conversion are in [../CONVERSION.md](../../../archive/flow-design-2026-11/CONVERSION.md).

| #   | File                                  | Gap                                                                                                                                                                                        |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `features/Cart/cart.domain.ts`        | on a READ, `.one` beside `.list` is assumed to be allowed the same way).                                                                                                                   |
| 2   | `features/Cart/cart.story.ts`         | that the destination's standing wire rule covers a request made by the `"server"` tab is implied by "one world" (W29) but not stated; see findings-checkout.md.                            |
| 3   | `features/Cart/cart.test.ts`          | a queue entry's fields beyond `entity` are not shown (merge 5 names the queue, not its row); `key` and `items` (the Attempts in order) are assumed.                                        |
| 4   | `features/Cart/cart.test.ts`          | `checkReplays` reports a "prediction fault" (M5-D10 9.9); its record code is not named, so `PredictionFault` is assumed.                                                                   |
| 5   | `features/Pay/Pay.tsx`                | an `unsettledWrites()` entry's shape is not in the design; `contract` is assumed, as in the desk host.                                                                                     |
| 6   | `features/Pay/order-summary.trait.ts` | under `cancel`, a key-less `O.shipping.cancel` in an ending's handler is assumed to release that ending's Attempt only (rule N2 states this for `allow`), not the newer quote on the wire. |
| 7   | `features/Pay/pay.story.ts`           | COVERAGE P4 C says "refused by the intent's `reject`"; a lane is per Runtime, so `reject` cannot see another tab's confirm; the refusal is Stripe's.                                       |
| 8   | `features/Pay/pay.story.ts`           | a seeded lane's shape is the Persistence plan's; `version` and `operation` on it are assumed, to say which build stored it.                                                                |
| 9   | `features/Pay/pay.test.ts`            | a Story reads a fragment's private fields (2.2.2), so F19's "private stays out of every host's reach" has no Story read; the nearest is to say the Story sees the counter.                 |
| 10  | `features/Pay/three-ds.subroutine.ts` | F11 B names "a subroutine that owns a write"; under rule 48 the reference keeps the write in the host and lets its ending arrive after the exit, as the desk's Resolve wizard does.        |
| 11  | `tools/inspection.ts`                 | a lane entry's field names follow 2.10.7's list, as in the desk's tools/inspection.ts.                                                                                                     |
