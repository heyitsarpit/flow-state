import type { ActorRef, AnyDefinition, EventOf, SendToken } from "./definition.ts";
import type { SendArg } from "./handles.ts";
import { builder } from "./entry.ts";

/**
 * Sends a public event to another actor, as a later turn of the target. Inert.
 *
 * **When to use**
 *
 * A rare escape hatch, as XState's `sendTo`: one actor tells another to act. Prefer context, a
 * provider the other actor reads, when the other actor only needs to see a value.
 *
 * **Details**
 *
 * `send(to, event)` captures both callbacks and reads neither; the turn calls them with its memory
 * after the update and its event. The event is delivered after the sender's turn commits, by the
 * target's state: a live actor gets it, an ended persisted one is restored from its record, and a
 * send never creates an actor. Several sends keep their order.
 *
 * @example
 * ```ts
 * on: {
 *   Confirm: {
 *     actions: [
 *       send(
 *         ({ memory }) => actorRef(AccountMachine, { accountId: memory.payee }),
 *         ({ memory }) => ({ _tag: "Credit", cents: memory.cents }),
 *       ),
 *     ],
 *   },
 * }
 * ```
 */
export const send = builder(
  "send",
  // RETURN_TYPE: the token keeps the memory and event types its callbacks read.
  <M, P, D extends AnyDefinition>(
    to: (input: SendArg<M, P>) => ActorRef<D>,
    event: (input: SendArg<M, P>) => EventOf<D>,
  ): SendToken<M, P> => ({ "~flow": "send", to, event }),
);
