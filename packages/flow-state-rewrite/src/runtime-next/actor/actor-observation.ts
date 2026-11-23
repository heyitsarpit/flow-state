import { Effect, Option, Queue, Result, Scope, Stream } from "effect";

import { Defect, Diagnostic, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { ActorSnapshot } from "../runtime.js";
import type { ActorIdentity } from "./actor-directory.js";
import type { ContextCoordinator, ContextNotification } from "../context/context-coordinator.js";

type Delivery<D extends MachineDefinition> =
  | { _tag: "snapshot"; value: ActorSnapshot<D> }
  | { _tag: "end" };

/** Opaque context notification preflight and total delivery for one actor identity. */
export const makeActorContextNotifications = <D extends MachineDefinition>(
  identity: ActorIdentity,
  context: Option.Option<ContextCoordinator>,
) => ({
  prepare: (snapshot: ActorSnapshot<D>) =>
    Option.isNone(context)
      ? Result.succeed(Option.none<ContextNotification>())
      : Result.map(context.value.prepareNotification({ identity, snapshot }), Option.some),
  publish: (notification: Option.Option<ContextNotification>) => {
    if (Option.isSome(notification) && Option.isSome(context))
      context.value.publish(notification.value);
  },
  cancel: (notification: Option.Option<ContextNotification>) => {
    if (Option.isSome(notification) && Option.isSome(context))
      context.value.cancel(notification.value);
  },
});

/** A slow reader retains one latest cut and, at termination, one end marker. */
export const makeActorObservation = <D extends MachineDefinition>(
  current: () => ActorSnapshot<D>,
  options?: {
    onSnapshot: Option.Option<(snapshot: ActorSnapshot<D>) => void>;
    onObserverIssue: Option.Option<(issue: PublicDiagnostic) => void>;
  },
) => {
  const subscribers = new Set<Queue.Queue<Delivery<D>>>();
  let closed = false;
  let pending: ActorSnapshot<D> | undefined;
  const end: Delivery<D> = { _tag: "end" };

  const offerLatest = (queue: Queue.Queue<Delivery<D>>, value: ActorSnapshot<D>) => {
    if (Queue.sizeUnsafe(queue) > 0) Queue.takeUnsafe(queue);
    Queue.offerUnsafe(queue, { _tag: "snapshot", value });
  };

  const completeSubscribers = () => {
    for (const queue of subscribers) Queue.offerUnsafe(queue, end);

    subscribers.clear();
  };

  const complete = () => {
    if (closed) return;
    closed = true;
    completeSubscribers();
  };

  const publish = (value: ActorSnapshot<D>) => {
    if (closed) return;

    for (const queue of subscribers) offerLatest(queue, value);

    if (value.lifecycle === "suspended") completeSubscribers();

    if (value.lifecycle === "disposed") complete();
  };

  const stage = (value: ActorSnapshot<D>) => {
    pending = value;
  };

  const afterAcknowledgement = () => {
    const snapshot = pending;

    if (snapshot === undefined) return;
    pending = undefined;
    publish(snapshot);
    const observer = options?.onSnapshot;

    if (observer === undefined || Option.isNone(observer)) return;

    // FLOW_STATE_ALLOW_UNKNOWN: Observer callbacks can throw any host value; Defect captures it after the committed receipt.
    const delivered = Result.try({
      try: () => observer.value(snapshot),
      catch: (cause: unknown) => (cause instanceof Diagnostic ? cause : Defect(cause)),
    });

    const reporter = options?.onObserverIssue;

    if (Result.isFailure(delivered) && reporter !== undefined && Option.isSome(reporter))
      Result.try({ try: () => reporter.value(delivered.failure), catch: () => undefined });
  };

  const stream = Stream.unwrap(
    Effect.gen(function* () {
      const queue = yield* Queue.sliding<Delivery<D>>(2);
      const scope = yield* Effect.service(Scope.Scope);

      yield* Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          subscribers.delete(queue);
        }).pipe(Effect.andThen(Queue.shutdown(queue))),
      );

      const value = current();
      Queue.offerUnsafe(queue, { _tag: "snapshot", value });

      if (closed || value.lifecycle === "suspended" || value.lifecycle === "disposed")
        Queue.offerUnsafe(queue, end);
      else subscribers.add(queue);

      return Stream.fromQueue(queue).pipe(
        Stream.takeUntil((delivery) => delivery._tag === "end"),
        Stream.filter(
          // RETURN_TYPE: The filter narrows the tagged delivery before reading its snapshot.
          (delivery): delivery is Extract<Delivery<D>, { _tag: "snapshot" }> =>
            delivery._tag === "snapshot",
        ),
        Stream.map((delivery) => delivery.value),
      );
    }),
  );

  return { stream, publish, stage, afterAcknowledgement, complete };
};
