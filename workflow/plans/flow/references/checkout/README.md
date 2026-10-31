# Checkout reference app

A storefront cart and checkout, and a merchant's refunds page, written against the Flow State design
(machine-design.md with every merge). It exists for one situation the dispatch desk never meets: a write where a
blind re-send is the bug, because it could charge a card twice.

Nothing here runs yet: Flow State's runtime is the design. The Effect-only files (`adapters/`) type-check with
`nubx tsc -p workflow/plans/flow/references/checkout/tsconfig.effect-only.json`.

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

Stories are transcripts (`*.story.ts`); their checks are in `*.test.ts` through `@flow-state/vitest` (proposed).
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
