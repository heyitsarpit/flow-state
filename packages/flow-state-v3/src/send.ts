import type { ActorRef, AnyDefinition, EventOf, MappedEvent, PayloadOf } from "./definition.ts";
import type { SendArg } from "./handles.ts";
import { builder } from "./entry.ts";

/**
 * A send in an alternative's `actions`: the target's ref, computed when the turn runs, and its
 * event in any of a send's three forms.
 */
export type SendToken<M = never, P = never> = {
  readonly "~flow": "send";
  readonly to: (input: SendArg<M, P>) => ActorRef;
  readonly event: SendEvent<SendArg<M, P>, AnyDefinition>;
};

/**
 * A public event of `D` as a send takes it: a mapping of the target's token (`Target.E.X.from(f)`),
 * a constant envelope (`Target.E.X(payload)`), or a callback returning the envelope.
 */
export type SendEvent<In, D extends AnyDefinition> =
  | {
      readonly [K in keyof D["events"] & string]: MappedEvent<K, In, PayloadOf<D["events"][K]>>;
    }[keyof D["events"] & string]
  | EventOf<D>
  | ((input: In) => EventOf<D>);

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
 * `send(to, event)` captures its callbacks and reads neither; the turn calls them with its memory
 * after the update and its event. `to` returns the target's ref; the event is the target's own
 * token mapped from that input (`Target.E.X.from(f)`), a constant (`Target.E.X(payload)`), or a
 * callback returning the event. When the turn runs, the ref must name an actor and the event pass
 * the target's event check, as a handle's `send` does, or the sender's turn is refused.
 *
 * The event is delivered after the sender's turn commits, by the target's state: a live actor gets
 * it, an ended persisted one is restored from its record first, and a send never creates an actor
 * or counts as a use of one. A target with no actor is reported on the sender as
 * `SendTargetAbsent` evidence, and the sender's turn stands. Several sends keep their order.
 *
 * **Gotchas**
 *
 * - The sends one admitted event's turns make are counted, follow-ups included; the turn that would
 *   pass `RuntimeDefaults.loopGuard` is refused `InvalidTurn`, naming the chain. Context updates
 *   never count.
 * - Two machines that send to each other import each other's Machine: annotate one as
 *   `const AMachine: Machine<typeof A> = machine(A, ...)` so TypeScript can type the cycle.
 *
 * @example
 * ```ts
 * on: {
 *   Confirm: {
 *     actions: [
 *       send(
 *         ({ memory }) => actorRef(AccountMachine, { accountId: memory.payee }),
 *         Account.E.Credit.from(({ memory }) => ({ cents: memory.cents })),
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
    to: (input: NoInfer<SendArg<M, P>>) => ActorRef<D>,
    event: NoInfer<SendEvent<SendArg<M, P>, D>>,
  ): SendToken<M, P> => ({ "~flow": "send", to, event }),
);
