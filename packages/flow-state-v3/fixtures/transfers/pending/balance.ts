/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-call, typescript/no-unsafe-return -- each line under an `@ts-expect-error` uses a read member or option the Operations Spec adds and the package lacks, so its values type as any until it lands */
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
import { Customer, CustomerMachine } from "../machines/customer.ts";
import { Accounts } from "../server/accounts.ts";
import { NoAnswer } from "../services.ts";

const Cents = Schema.Struct({ cents: Schema.Number });

/**
 * The available-balance port: an account's available cents, and a card payment that debits it.
 */
export class AvailableApi extends Context.Service<
  AvailableApi,
  {
    readonly available: (input: {
      readonly account: string;
    }) => Effect.Effect<typeof Cents.Type, NoAnswer>;
    readonly debit: (
      input: { readonly account: string; readonly cents: number },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<typeof Cents.Type, NoAnswer>;
  }
>()("flow-state-v3/fixtures/transfers/AvailableApi") {}

/**
 * The port fake over the accounts server.
 */
export const AvailableFake = Layer.effect(
  AvailableApi,
  Effect.map(Accounts, (accounts) =>
    AvailableApi.of({
      available: accounts.balance,
      debit: (input, { idempotencyKey }) => accounts.debit({ ...input, key: idempotencyKey }),
    }),
  ),
);

/**
 * The available-balance port over HTTP.
 */
export const AvailableHttp = (origin: string) =>
  Layer.effect(
    AvailableApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));
      const lost = () => Effect.fail(new NoAnswer());

      return AvailableApi.of({
        available: ({ account }) =>
          HttpClientRequest.get(`/accounts/${encodeURIComponent(account)}/available`).pipe(
            client.execute,
            Effect.flatMap((r) => HttpIncomingMessage.schemaBodyJson(Cents)(r)),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
        debit: ({ account, cents }, { idempotencyKey }) =>
          HttpClientRequest.post(`/accounts/${encodeURIComponent(account)}/debits`).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe({ cents }),
            client.execute,
            Effect.flatMap((r) => HttpIncomingMessage.schemaBodyJson(Cents)(r)),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
      });
    }),
  );

/**
 * An account's available cents, fresh for ten seconds.
 */
export const available = resource({
  id: "Bank/available",
  input: { account: Schema.String },
  key: ["account"],
  services: [AvailableApi],
  staleTime: "10 seconds",
  gcTime: "1 minute",
  lookup: (input) => AvailableApi.use((api) => api.available(input)),
});

/**
 * A card payment from an account, keyed by its payment id. A lost answer is unknown.
 */
export const cardPayment = transaction({
  id: "Bank/cardPayment",
  input: { paymentId: Schema.String, account: Schema.String, cents: Schema.Number },
  key: ["paymentId"],
  concurrency: "reject",
  services: [AvailableApi],
  // The server keys a card payment by the payment's own id, not by the Attempt.
  idempotency: ["paymentId"],
  commit: (input) =>
    AvailableApi.use((api) => api.debit(input, { idempotencyKey: input.paymentId })).pipe(
      Effect.catchTag("NoAnswer", (e) => Outcome.unknown(e)),
    ),
});

/**
 * The balance card: the customer's account's available cents, the last account's while a new one
 * loads, and a notice.
 */
export const BalanceCard = definition({
  id: "Bank/BalanceCard",
  states: ["SHOWN"],
  events: { Pay: { paymentId: Schema.String, account: Schema.String, cents: Schema.Number } },
  internalEvents: {
    Read: { cents: Schema.Number, placeholder: Schema.Boolean },
    Unread: {},
    Paid: {},
    PayUnsure: Flow.uncertain({}),
  },
  memory: {
    cents: Flow.initial(Schema.Number, 0),
    placeholder: Flow.initial(Schema.Boolean, false),
    notice: Flow.initial(Schema.String, ""),
  },
  context: { account: Flow.context(Customer.M.account) },
  operations: ({ E }) => ({
    available: available.outcomes({
      // @ts-expect-error Operations O2, O6: a placed read maps `value`, its placeholder marked
      value: E.Read.from((v, { placeholder }) => ({ cents: v.cents, placeholder })),
      failure: { NoAnswer: E.Unread, Defect: E.Unread, Interrupted: E.Unread },
    }),
    cardPayment: cardPayment.outcomes({ success: E.Paid, failure: {}, unknown: E.PayUnsure }),
  }),
});

/**
 * The card places the customer's account's balance, showing the last account's while a new
 * account has none yet; a payment that lands marks the balance stale, so it is read again.
 */
export const BalanceCardMachine = machine(BalanceCard, ({ S, O }) => ({
  default: S.SHOWN,
  states: {
    SHOWN: {
      // @ts-expect-error Operations O2: a state places a read in `activities`
      activities: [
        // @ts-expect-error Operations O2, O6: `subscribe` with a `placeholder` from the previous key
        O.available.subscribe(({ context }) => ({ account: context.account ?? "" }), {
          // @ts-expect-error Operations O6: `placeholder` reads the placement's previous key and data
          placeholder: ({ previous }) => previous?.data,
        }),
      ],
      on: {
        Read: {
          updateMemory: ({ event }) => ({ cents: event.cents, placeholder: event.placeholder }),
        },
        Unread: { updateMemory: () => ({ notice: "balance unavailable" }) },
        Pay: {
          actions: [
            O.cardPayment.commit(({ event }) => ({
              paymentId: event.paymentId,
              account: event.account,
              cents: event.cents,
            })),
          ],
        },
        Paid: {
          // @ts-expect-error a member's select reads memory and the event, not context
          actions: [O.available.invalidate(({ context }) => ({ account: context.account ?? "" }))],
        },
        PayUnsure: { updateMemory: () => ({ notice: "checking the payment" }) },
      },
    },
  },
}));

/**
 * The signed-in customer.
 */
export const me = actorRef(CustomerMachine, "me");

/**
 * The customer's balance card.
 */
export const card = actorRef(BalanceCardMachine, "card");

/**
 * The bank grown with the balance card around the customer.
 */
export const balanceSetup = runtimeSetup({
  app: app({
    id: "bank",
    machines: {
      customer: CustomerMachine,
      card: { machine: BalanceCardMachine, context: { account: me } },
    },
  }),
  services: Layer.merge(
    AvailableHttp("https://accounts.example").pipe(Layer.provide(FetchHttpClient.layer)),
    layerIndexedDb(),
  ),
  scope: "bank",
  persistence: { captureMs: 0 },
});
