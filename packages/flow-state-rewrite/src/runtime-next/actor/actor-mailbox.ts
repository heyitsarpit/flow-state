import { Cause, Deferred, Effect, Exit, Fiber, Predicate, Queue, Result, Scope } from "effect";

import type { EventOf } from "../../definition/domain.js";
import { decodeEventPayloadResult } from "../../definition/schema.js";
import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { Machine } from "../../machine/machine.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { DispatchReceipt } from "../runtime.js";
import type { ContextTicketOutcome } from "../context/context-participant.js";
import type { ContextTicket } from "../context/context-ticket.js";
import { copyStructural } from "../structural-copy.js";
import type { LifecycleCommand } from "./lifecycle.js";
import type { OperationFact } from "./actor-operation-work.js";
import { checkedActorSuccessor } from "./actor-state.js";

export type ActorCommand<D extends MachineDefinition> =
  | { kind: "event"; event: EventOf<D> }
  | { kind: "lifecycle"; command: LifecycleCommand }
  | { kind: "context"; ticket: ContextTicket<D>; isCancelled(): boolean }
  | { kind: "operation"; fact: OperationFact<D> };

export type ActorCommandOutcome<D extends MachineDefinition> =
  | { kind: "receipt"; receipt: DispatchReceipt }
  | { kind: "context"; outcome: ContextTicketOutcome<D> }
  | { kind: "operation" };

export const actorFailure = (reason: string) =>
  Failure({
    code: "InvariantViolation",
    path: ["actor", reason],
    details: { reason },
    summary: "Actor cannot complete this command",
    help: "Use an active actor and a valid committed input.",
  });

/** A suspended or disposed publication does not admit another external event. */
/** One executing command plus sixty-four waiting ordinary commands and a control place. */
export const ACTOR_MAILBOX_CAPACITY = 64;

/** Admit an owned event envelope and its payload before it takes mailbox capacity. */
// RETURN_TYPE: Preserve the Definition-indexed event envelope across structural copying and validation.
export const ownEventEnvelope = <D extends MachineDefinition>(
  machine: Machine<D>,
  event: EventOf<D>,
): Result.Result<EventOf<D>, PublicDiagnostic> => {
  const owned = copyStructural(event, "actor");

  if (Result.isFailure(owned)) return Result.fail(owned.failure);

  if (!Predicate.isObject(owned.success) || Array.isArray(owned.success))
    return Result.fail(rejected("invalid-event"));

  // FLOW_STATE_ALLOW_UNKNOWN: The copied envelope remains untrusted until matched with a Definition token.
  const eventType: unknown = Object.getOwnPropertyDescriptor(owned.success, "type")?.value;

  if (!Object.values(machine.definition.E).some((token) => Object.is(token.id, eventType)))
    return Result.fail(rejected("foreign-event"));

  const payload = Object.fromEntries(
    Object.entries(owned.success).filter(([key]) => key !== "type"),
  );

  if (Result.isFailure(decodeEventPayloadResult(payload)))
    return Result.fail(rejected("invalid-event"));

  return owned;
};

/** Event admission delegates to the actor-owned mailbox without storing another queue. */
export const makeActorEventFacade = <D extends MachineDefinition>(options: {
  machine: Machine<D>;
  mailbox: Pick<
    Effect.Success<ReturnType<typeof makeActorMailbox<ActorCommand<D>, ActorCommandOutcome<D>>>>,
    "admit"
  >;
  isInactive(): boolean;
}) => {
  const ownEvent = (event: EventOf<D>) =>
    options.isInactive()
      ? Result.fail(actorFailure("inactive"))
      : ownEventEnvelope(options.machine, event);

  const admitEvent = (event: EventOf<D>) => {
    const owned = ownEvent(event);

    return Result.isFailure(owned)
      ? Result.fail(owned.failure)
      : options.mailbox.admit({ kind: "event", event: owned.success }, false);
  };

  const dispatch = (event: EventOf<D>) => {
    const admitted = admitEvent(event);

    return Result.isFailure(admitted)
      ? Effect.fail(admitted.failure)
      : Deferred.await(admitted.success).pipe(
          Effect.flatMap((outcome) =>
            outcome.kind === "receipt"
              ? Effect.succeed(outcome.receipt)
              : Effect.fail(actorFailure("event-outcome")),
          ),
        );
  };

  const send = (event: EventOf<D>) => Result.map(admitEvent(event), () => undefined);

  return { send, dispatch };
};

/** Drain mapped children before the next external Queue item, yielding without admitting it. */
export const runMappedContinuations = <Event, Receipt, Error = PublicDiagnostic>(options: {
  first: Event;
  execute(event: Event): Result.Result<
    {
      receipt: Receipt;
      // oxlint-disable-next-line anti-slop/no-readonly -- Planner continuations are an immutable authored batch until the consumer schedules them.
      mapped: readonly Event[];
    },
    Error
  >;
  current(): Receipt;
}) =>
  Effect.gen(function* () {
    const pending = [options.first];
    let parent: Receipt | undefined;
    let steps = 0;

    while (pending.length > 0) {
      const next = pending.pop();

      if (next === undefined) continue;
      const completed = options.execute(next);

      if (Result.isFailure(completed)) return yield* Effect.fail(completed.failure);
      parent ??= completed.success.receipt;

      for (let index = completed.success.mapped.length - 1; index >= 0; index -= 1) {
        const mapped = completed.success.mapped[index];

        if (mapped !== undefined) pending.push(mapped);
      }

      steps += 1;

      if (steps % 64 === 0) yield* Effect.yieldNow;
    }

    return parent ?? options.current();
  });

type Entry<Command, Outcome> = {
  command: Command;
  generation: number;
  control: boolean;
  internal: boolean;
  finalInternalAttempt: boolean;
  completion: Deferred.Deferred<Outcome, PublicDiagnostic>;
};

type Waiter = {
  target: number;
  completion: Deferred.Deferred<void, PublicDiagnostic>;
};

const isFinalInternalFailure = <Command, Outcome>(
  entry: Entry<Command, Outcome>,
  exit: Exit.Exit<Outcome, PublicDiagnostic>,
  phase: "prepared" | "active" | "closed",
) =>
  entry.internal &&
  phase === "active" &&
  Exit.isFailure(exit) &&
  (entry.finalInternalAttempt ||
    !Cause.hasFails(exit.cause) ||
    Cause.hasDies(exit.cause) ||
    Cause.hasInterrupts(exit.cause));

const rejected = (reason: "closed" | "full" | "overflow" | "foreign-event" | "invalid-event") =>
  Failure({
    code: reason === "closed" ? "DisposedActorRef" : "InvariantViolation",
    path: ["actor", "mailbox"],
    details: { reason },
    summary: `Actor mailbox ${reason}`,
    help: "Dispatch only while the actor has admission and capacity.",
  });

/** The engine owns this protocol and starts its only consumer after installation. */
export const makeActorMailbox = <Command, Outcome>(options: {
  run: (command: Command) => Effect.Effect<Outcome, PublicDiagnostic>;
  afterAcknowledgement: () => void;
  onInternalFailure(command: Command): void;
}) =>
  Effect.gen(function* () {
    const ownerScope = yield* Scope.Scope;
    const queue = yield* Queue.bounded<Entry<Command, Outcome>>(ACTOR_MAILBOX_CAPACITY + 1);
    const waiters = new Set<Waiter>();
    let admitted = 0;
    let completed = 0;
    let ordinaryWaiting = 0;
    let controlWaiting = 0;
    let internalFailure: { generation: number; cause: Cause.Cause<PublicDiagnostic> } | undefined;
    let phase: "prepared" | "active" | "closed" = "prepared";
    let sealed = false;
    let consumer: Fiber.Fiber<void> | undefined;
    let current: Entry<Command, Outcome> | undefined;

    const offer = (
      command: Command,
      control: boolean,
      terminal: boolean,
      internal = false,
      finalInternalAttempt = false,
    ) => {
      if (phase === "closed" || (sealed && !terminal)) return Result.fail(rejected("closed"));

      if (control ? controlWaiting >= 1 : ordinaryWaiting >= ACTOR_MAILBOX_CAPACITY)
        return Result.fail(rejected("full"));
      const next = checkedActorSuccessor(admitted, "admittedGeneration");

      if (Result.isFailure(next)) return Result.fail(rejected("overflow"));

      const completion = Deferred.makeUnsafe<Outcome, PublicDiagnostic>();

      const entry: Entry<Command, Outcome> = {
        command,
        generation: next.success,
        control,
        internal,
        finalInternalAttempt,
        completion,
      };

      if (!Queue.offerUnsafe(queue, entry)) return Result.fail(rejected("full"));

      admitted = next.success;

      if (control) controlWaiting += 1;
      else ordinaryWaiting += 1;

      return Result.succeed(completion);
    };

    const admit = (command: Command, control: boolean) => offer(command, control, false);

    // RETURN_TYPE: Recursive capacity retry infers TS7023/TS7024 without an explicit Effect lane on TypeScript 7.0.2.
    const admitTerminal = (command: Command): Effect.Effect<Outcome, PublicDiagnostic> =>
      Effect.suspend(() => {
        const offered = offer(command, true, true);

        if (Result.isSuccess(offered)) return Deferred.await(offered.success);

        return offered.failure.details.reason === "full"
          ? Effect.yieldNow.pipe(Effect.flatMap(() => admitTerminal(command)))
          : Effect.fail(offered.failure);
      });

    const seal = () => void (sealed = true);
    const unseal = () => void (sealed = false);

    // RETURN_TYPE: Recursive replay branches infer TS7023/TS7024 without an explicit Effect lane on TypeScript 7.0.2.
    const admitInternalAttempt = (
      command: Command,
      final: boolean,
    ): Effect.Effect<void, PublicDiagnostic> =>
      Effect.suspend(() => {
        const offered = offer(command, false, false, true, final);

        if (Result.isSuccess(offered))
          return Deferred.await(offered.success).pipe(
            Effect.asVoid,
            Effect.catchCause((cause) =>
              final || !Cause.hasFails(cause) || Cause.hasDies(cause) || Cause.hasInterrupts(cause)
                ? Effect.failCause(cause)
                : Effect.yieldNow.pipe(Effect.flatMap(() => admitInternalAttempt(command, true))),
            ),
          );

        return offered.failure.details.reason === "full"
          ? Effect.yieldNow.pipe(Effect.flatMap(() => admitInternalAttempt(command, final)))
          : Effect.fail(offered.failure);
      });

    const admitInternal = (command: Command) => admitInternalAttempt(command, false);

    const finish = (entry: Entry<Command, Outcome>, exit: Exit.Exit<Outcome, PublicDiagnostic>) => {
      if (isFinalInternalFailure(entry, exit, phase) && Exit.isFailure(exit)) {
        options.onInternalFailure(entry.command);

        if (internalFailure === undefined)
          internalFailure = { generation: entry.generation, cause: exit.cause };
      }

      Deferred.doneUnsafe(entry.completion, exit);
      completed = entry.generation;
      current = undefined;

      for (const waiter of waiters) {
        if (waiter.target > completed) continue;
        waiters.delete(waiter);
        Deferred.doneUnsafe(
          waiter.completion,
          internalFailure !== undefined && internalFailure.generation <= waiter.target
            ? Effect.failCause(internalFailure.cause)
            : Effect.void,
        );
      }

      Result.try({ try: options.afterAcknowledgement, catch: () => undefined });
    };

    const consume = Effect.gen(function* () {
      while (phase !== "closed") {
        const entry = yield* Queue.take(queue);

        if (entry.control) controlWaiting -= 1;
        else ordinaryWaiting -= 1;

        current = entry;
        const exit = yield* Effect.exit(Effect.suspend(() => options.run(entry.command)));
        finish(entry, exit);
      }
    });

    const activate = () =>
      Effect.sync(() => {
        if (phase !== "prepared") return false;
        phase = "active";

        return true;
      }).pipe(
        Effect.flatMap((start) =>
          start
            ? Effect.forkIn(consume, ownerScope, {
                startImmediately: true,
                uninterruptible: false,
              }).pipe(
                Effect.tap((fiber) => Effect.sync(() => void (consumer = fiber))),
                Effect.asVoid,
              )
            : Effect.void,
        ),
      );

    const flush = () =>
      Effect.suspend(() => {
        const target = admitted;

        if (completed >= target)
          return internalFailure !== undefined && internalFailure.generation <= target
            ? Effect.failCause(internalFailure.cause)
            : Effect.void;

        const completion = Deferred.makeUnsafe<void, PublicDiagnostic>();
        const waiter = { target, completion };
        waiters.add(waiter);

        return Deferred.await(completion).pipe(
          Effect.ensuring(Effect.sync(() => void waiters.delete(waiter))),
        );
      });

    // Terminal disposal drains the prefix even when a caller-visible internal failure was latched.
    const drain = () => flush().pipe(Effect.ignore);

    const close = () =>
      Effect.gen(function* () {
        if (phase === "closed") return;
        phase = "closed";

        let entry = Queue.takeUnsafe(queue);

        while (entry !== undefined) {
          if (Exit.isSuccess(entry))
            Deferred.doneUnsafe(entry.value.completion, Effect.fail(rejected("closed")));
          entry = Queue.takeUnsafe(queue);
        }

        yield* Queue.shutdown(queue);

        if (consumer !== undefined) yield* Fiber.interrupt(consumer);

        if (current !== undefined) {
          Deferred.doneUnsafe(current.completion, Effect.fail(rejected("closed")));
          current = undefined;
        }

        for (const waiter of waiters)
          Deferred.doneUnsafe(waiter.completion, Effect.fail(rejected("closed")));

        waiters.clear();
      });

    return {
      admit,
      admitInternal,
      admitTerminal,
      seal,
      unseal,
      activate,
      flush,
      drain,
      close,
      isSealed: () => sealed,
      isClosed: () => phase === "closed",
    };
  });
