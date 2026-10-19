/**
 * Illustrative capability call forms. The owning .plan files define every contract.
 * Application names below stand for application-owned declarations/services.
 * These fragments have not compiled or run as a new-contract proof.
 */

import { Effect, Result } from "effect";
import {
  actorRef,
  persistence,
  resource,
  runtimeSetup,
  stream,
  transaction,
  webStorage,
} from "flow-state";

// Imports show final target routes, including names deferred until their owners/proofs land.
// Services, clients, TodoApp/TodoLive/TodoMachine, actor, input values, and input types are
// application-owned. E and O are the exact catalogues supplied to a machine callback.
// submitOutcomes and buildSubmissionInput are application-owned mappings/input construction.

// Resources
const orderById = resource({
  id: "everclear.order-by-id",
  key: ({ orderId }: { orderId: string }) => [orderId],
  lookup: ({ orderId }, { signal }) =>
    Effect.gen(function* () {
      const client = yield* OrderClient;
      return yield* client.getOrder(orderId, { signal });
    }),
  persist: true,
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

const snapshot = actor.getSnapshot();
const orderKey = snapshot.O.orderById.key({ orderId });
const order = snapshot.O.orderById.getData(orderKey);
const orderState = snapshot.O.orderById.getState(orderKey);

// Transactions
const submitIntent = transaction({
  id: "everclear.submit-intent",
  key: ({ submissionId }: SubmitIntentInput) => [submissionId],
  commit: (params, { signal }) => IntentSubmitter.submit(params, { signal }),
  persist: true,
  concurrency: "reject",
});

O.submitIntent.commit(params, {
  writes: ({ value }) => [O.orderById.setData([value.order.id], value.order)],
  outcomes: {
    success: (receipt) => {
      const event = E.SubmitSucceeded(receipt);
      if (Result.isFailure(event)) throw event.failure;
      return event.success;
    },
    failure: (error) => {
      const event = E.SubmitFailed(error);
      if (Result.isFailure(event)) throw event.failure;
      return event.success;
    },
  },
});

// Transition object fragment inside the machine's event handler configuration.
const submitTransition = {
  actions: ({ event, memory }) => [
    O.submitIntent.commit(buildSubmissionInput(event, memory), { outcomes: submitOutcomes }),
  ],
};

// Streams
const submissionProgress = stream({
  id: "everclear.submission-progress",
  key: ({ submissionId }: ProgressInput) => [submissionId],
  subscribe: ({ submissionId }, { signal }) =>
    Effect.gen(function* () {
      const progressClient = yield* ProgressClient;
      return yield* progressClient.progress(submissionId, { signal });
    }),
  persist: true,
});

// Persistence
const setup = runtimeSetup({
  app: TodoApp,
  implementation: TodoLive,
  persistence: persistence({
    storage: webStorage(window.localStorage),
    scope: "user:42",
    codec: todoPersistenceCodec,
    filter: ({ kind, id }) => kind !== "stream" || id === "todo.updates",
  }),
});

const todos = resource({
  id: "todo.todos",
  key: ({ listId }: { listId: string }) => [listId],
  lookup: loadTodos,
  persist: true,
});

const Primary = actorRef(TodoMachine, "primary", { persist: true });
