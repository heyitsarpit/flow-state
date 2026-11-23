// @effect-diagnostics unstableApiUsage:off -- the setup's adapter runs over Effect's fetch client, as the app's real Layer would
import { Context, Effect, Exit, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { layerIndexedDb } from "../../../src/host/persistence.ts";
import { Fake } from "../../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  Outcome,
  runtimeSetup,
  transaction,
} from "../../../src/index.ts";
import { NoResponse } from "../services.ts";

/**
 * The deposits port: one part of a cheque's photo, sent with its idempotency key.
 */
export class DepositsApi extends Context.Service<
  DepositsApi,
  {
    readonly part: (
      input: { readonly depositId: string; readonly part: number; readonly of: number },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<void, NoResponse>;
  }
>()("flow-state-v3/fixtures/transfers/DepositsApi") {}

const DepositsTruth = Schema.Struct({
  parts: Schema.Record(Schema.String, Schema.Array(Schema.Number)),
});

type Truth = typeof DepositsTruth.Type;

/**
 * The deposits server's truth: the parts each deposit has received.
 */
export const Deposits = Fake.server("Deposits", {
  truth: DepositsTruth,
  initial: { parts: {} },
  endpoints: {
    part: Fake.call({
      request: {
        depositId: Schema.String,
        part: Schema.Number,
        of: Schema.Number,
        key: Schema.String,
      },
      success: Schema.Struct({}),
      failure: Schema.Never,
      handle: (truth: Truth, { depositId, part }) => ({
        truth: {
          parts: { ...truth.parts, [depositId]: [...(truth.parts[depositId] ?? []), part] },
        },
        exit: Exit.succeed({}),
      }),
    }),
  },
  controls: {},
  lost: () => new NoResponse(),
});

/**
 * The deposits port over its fake.
 */
export const DepositsFake = Layer.effect(
  DepositsApi,
  Effect.map(Deposits, (server) =>
    DepositsApi.of({
      part: (input, { idempotencyKey }) =>
        server.part({ ...input, key: idempotencyKey }).pipe(Effect.asVoid),
    }),
  ),
);

/**
 * The deposits port over HTTP: `PUT /deposits/:id/parts/:n`.
 */
export const DepositsHttp = (origin: string) =>
  Layer.effect(
    DepositsApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));
      const lost = () => Effect.fail(new NoResponse());

      return DepositsApi.of({
        part: ({ depositId, part, of }, { idempotencyKey }) =>
          HttpClientRequest.put(
            `/deposits/${encodeURIComponent(depositId)}/parts/${String(part)}`,
          ).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.setHeader("Upload-Length", String(of)),
            client.execute,
            Effect.asVoid,
            Effect.catchTags({ HttpClientError: lost }),
          ),
      });
    }),
  );

/**
 * A cheque deposit sent in parts, reporting its progress after each; keyed by the deposit's id.
 */
export const depositCheque = transaction({
  id: "Bank/depositCheque",
  input: { depositId: Schema.String, parts: Schema.Number },
  key: ["depositId"],
  concurrency: "reject",
  services: [DepositsApi],
  idempotency: ["depositId"],
  progress: Schema.Number,
  commit: (input, context) =>
    Effect.forEach(
      Array.from({ length: input.parts }, (_, n) => n),
      (n) =>
        DepositsApi.use((api) =>
          api.part(
            { depositId: input.depositId, part: n, of: input.parts },
            { idempotencyKey: `${input.depositId}-${String(n)}` },
          ),
        ).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              context.progress((n + 1) / input.parts);
            }),
          ),
        ),
      { concurrency: 1 },
    ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
});

/**
 * One cheque deposit, named by its id.
 */
export const ChequeDeposit = definition({
  id: "Bank/ChequeDeposit",
  persist: true,
  states: ["READY", "SENDING", "DONE"],
  events: { Send: { parts: Schema.Number }, Abort: {}, Resume: {} },
  internalEvents: { Deposited: {}, Unsure: Flow.uncertain({}) },
  memory: { depositId: Flow.input(Schema.String), notice: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    depositCheque: depositCheque.outcomes({ success: E.Deposited, failure: {}, unknown: E.Unsure }),
  }),
});

const byDeposit = ({ memory }: { readonly memory: typeof ChequeDeposit.Memory.Type }) => ({
  depositId: memory.depositId,
});

/**
 * Sending deposits the cheque in parts; its row's `progress` shows how far it got. Aborting stops
 * the parts on the wire, and resuming sends the same deposit again, at most twice.
 */
export const ChequeDepositMachine = machine(ChequeDeposit, ({ S, O }) => ({
  default: S.READY,
  // A deposit's ending reaches whichever screen is open, a reopened one included.
  on: {
    Deposited: { target: S.DONE, updateMemory: () => ({ notice: "deposited" }) },
    Unsure: { target: S.READY, updateMemory: () => ({ notice: "not sure it arrived" }) },
  },
  states: {
    READY: {
      on: {
        Resume: {
          target: S.SENDING,
          guard: [O.depositCheque.retryable(byDeposit, { times: 2 })],
          updateMemory: () => ({ notice: "" }),
          actions: [O.depositCheque.retry(byDeposit)],
        },
        Send: {
          target: S.SENDING,
          actions: [
            O.depositCheque.commit(({ memory, event }) => ({
              depositId: memory.depositId,
              parts: event.parts,
            })),
          ],
        },
      },
    },
    SENDING: {
      on: {
        Abort: { actions: [O.depositCheque.cancel(byDeposit)] },
      },
    },
    DONE: {},
  },
}));

/**
 * The rent cheque's deposit.
 */
export const rentCheque = actorRef(ChequeDepositMachine, { depositId: "dep-1" });

/**
 * The bank grown with cheque deposits.
 */
export const depositSetup = runtimeSetup({
  app: app({ id: "bank", machines: { deposits: ChequeDepositMachine } }),
  services: Layer.merge(
    DepositsHttp("https://deposits.example").pipe(Layer.provide(FetchHttpClient.layer)),
    layerIndexedDb(),
  ),
  scope: "bank",
  persistence: { captureMs: 0 },
});
