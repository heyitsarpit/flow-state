/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-call -- each line under an `@ts-expect-error` uses a read member or commit option the Operations Spec adds and the package lacks, so its values type as any until it lands */
// @effect-diagnostics unstableApiUsage:off -- the setup's adapter runs over Effect's fetch client, as the app's real Layer would
import { Context, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpIncomingMessage } from "effect/http";
import { layerIndexedDb } from "../../../src/host/persistence.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  Outcome,
  resource,
  runtimeSetup,
  transaction,
} from "../../../src/index.ts";
import { Carts } from "../server/carts.ts";
import { NoResponse, SoldOut } from "../services.ts";

const Lines = Schema.Record(
  Schema.String,
  Schema.Struct({ variantId: Schema.String, quantity: Schema.Number }),
);

/**
 * The cart read port: a whole cart's lines, and a quick add from the mini cart.
 */
export class CartViewApi extends Context.Service<
  CartViewApi,
  {
    readonly cart: (input: {
      readonly cartId: string;
    }) => Effect.Effect<{ readonly lines: typeof Lines.Type }, NoResponse>;
    readonly quickAdd: (
      input: { readonly cartId: string; readonly lineId: string; readonly variantId: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<void, SoldOut | NoResponse>;
  }
>()("flow-state-v3/fixtures/shop/CartViewApi") {}

/**
 * The port fake over the carts server.
 */
export const CartViewFake = Layer.effect(
  CartViewApi,
  Effect.map(Carts, (carts) =>
    CartViewApi.of({
      cart: carts.cart,
      quickAdd: (input, { idempotencyKey }) =>
        carts.addLine({ ...input, key: idempotencyKey }).pipe(Effect.asVoid),
    }),
  ),
);

/**
 * The cart read port over HTTP.
 */
export const CartViewHttp = (origin: string) =>
  Layer.effect(
    CartViewApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));
      const lost = () => Effect.fail(new NoResponse());

      return CartViewApi.of({
        cart: ({ cartId }) =>
          HttpClientRequest.get(`/carts/${encodeURIComponent(cartId)}`).pipe(
            client.execute,
            Effect.flatMap((r) =>
              HttpIncomingMessage.schemaBodyJson(Schema.Struct({ lines: Lines }))(r),
            ),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
        quickAdd: ({ cartId, lineId, variantId }, { idempotencyKey }) =>
          HttpClientRequest.post(`/carts/${encodeURIComponent(cartId)}/lines`).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe({ lineId, variantId }),
            client.execute,
            Effect.asVoid,
            Effect.catchTags({ HttpClientError: lost }),
          ),
      });
    }),
  );

/**
 * A whole cart, read fresh for ten seconds.
 */
export const cart = resource({
  id: "Shop/cart",
  input: { cartId: Schema.String },
  key: ["cartId"],
  services: [CartViewApi],
  staleTime: "10 seconds",
  gcTime: "1 minute",
  lookup: (input) => CartViewApi.use((api) => api.cart(input)),
});

/**
 * One line added from the mini cart. A lost answer is unknown.
 */
export const quickAdd = transaction({
  id: "Shop/quickAdd",
  input: { cartId: Schema.String, lineId: Schema.String, variantId: Schema.String },
  key: ["cartId", "lineId"],
  concurrency: "reject",
  services: [CartViewApi],
  commit: (input, { attempt }) =>
    CartViewApi.use((api) => api.quickAdd(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});

/**
 * The header's mini cart: which cart it shows and its lines as last read.
 */
export const MiniCart = definition({
  id: "Shop/MiniCart",
  states: ["SHOWN"],
  events: {
    Show: { cartId: Schema.String },
    Add: { lineId: Schema.String, variantId: Schema.String },
  },
  internalEvents: {
    Read: { lines: Lines },
    Unread: {},
    Added: {},
    AddFailed: {},
    AddUnsure: Flow.uncertain({}),
  },
  memory: {
    cartId: Flow.initial(Schema.String, "cart-1"),
    lines: Flow.initial(Lines, {}),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    cart: cart.outcomes({
      // @ts-expect-error Operations O2: a placed read maps `value`
      value: E.Read.from((v) => ({ lines: v.lines })),
      failure: { NoResponse: E.Unread, Defect: E.Unread, Interrupted: E.Unread },
    }),
    quickAdd: quickAdd.outcomes({
      success: E.Added,
      failure: { SoldOut: E.AddFailed },
      unknown: E.AddUnsure,
    }),
  }),
});

/**
 * The mini cart places the cart it shows; an add shows its line at once as an optimistic value on
 * the cart and is invalidated when the server answers, so the cart is read again.
 */
export const MiniCartMachine = machine(MiniCart, ({ S, O }) => ({
  default: S.SHOWN,
  states: {
    SHOWN: {
      // @ts-expect-error Operations O2: a state places a read with `subscribe` in `activities`
      activities: [O.cart.subscribe(({ memory }) => ({ cartId: memory.cartId }))],
      on: {
        Show: { updateMemory: ({ event }) => ({ cartId: event.cartId }) },
        Read: { updateMemory: ({ event }) => ({ lines: event.lines }) },
        Unread: { updateMemory: () => ({ notice: "cart unavailable" }) },
        Add: {
          actions: [
            O.quickAdd.commit(
              ({ memory, event }) => ({
                cartId: memory.cartId,
                lineId: event.lineId,
                variantId: event.variantId,
              }),
              // @ts-expect-error Operations O5: a commit's `optimistic` value on a read
              {
                // @ts-expect-error Operations O5: `optimistic` reads the starting turn's event
                optimistic: ({ event }) => ({
                  cart: { [event.lineId]: { variantId: event.variantId, quantity: 1 } },
                }),
              },
            ),
          ],
        },
        Added: { actions: [O.cart.invalidate(({ memory }) => ({ cartId: memory.cartId }))] },
        AddFailed: { updateMemory: () => ({ notice: "sold out" }) },
        AddUnsure: { updateMemory: () => ({ notice: "checking your cart" }) },
      },
    },
  },
}));

/**
 * The header's mini cart.
 */
export const miniCart = actorRef(MiniCartMachine, "header");

/**
 * The shop grown with the mini cart.
 */
export const miniCartSetup = runtimeSetup({
  app: app({ id: "shop", machines: { miniCart: MiniCartMachine } }),
  services: Layer.merge(
    CartViewHttp("https://carts.example").pipe(Layer.provide(FetchHttpClient.layer)),
    layerIndexedDb(),
  ),
  scope: "shop",
  persistence: { captureMs: 0 },
});
