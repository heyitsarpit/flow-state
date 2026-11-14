import { type ActorRef, sameActor } from "../port.ts";
import { type ActorRecord, isHead, type Model, Obligation } from "./lifecycle-model.ts";
import { owesRelease, ownsRow, restorable } from "./lifecycle.ts";

const actorOf = (model: Model, actor: ActorRef) =>
  model.actors.find((a) => sameActor(a.actor, actor));

/**
 * Begins an incarnation of `actor`: its ordinal moves on, and, on a return from grace,
 * `disposeActor` or `forget`, each Held head of its lanes owes its restore ending to this
 * incarnation, for a cause read from the actor's record.
 *
 * **Gotchas**
 *
 * - Held heads owe a restore here, and a never-sent head restored from a capture when the store
 *   landed its acknowledging batch (Restore R3); one whose batch never landed owes nothing
 *   (Restore I8).
 * - A boot owes nothing (Actors I40): it makes every identity a record, so the incarnation a boot
 *   wakes at ready and one a later ensure starts owe their restore endings alike (Restore R3,
 *   I6). A Held head that owes its release is not kept (WriteLanes R4), so it owes no restore.
 * - A Held head whose Attempt any owed row names (parked, kept, refused, or one decided in the
 *   Runtime's disposal) owes no restore either: that saved outcome is what the incarnation is
 *   delivered (Restore I6), as at a boot.
 * - A disposed identity's unbound Held head owes its restore here, at the adopting incarnation,
 *   never at the boot (Restore R1, Actors I40).
 */
export const incarnate = (model: Model, actor: ActorRef) => {
  const known = actorOf(model, actor);
  const cause = causeOf(model, known?.record ?? "bound");

  const returning = known !== undefined && known.record !== "bound";

  const owing = model.attempts.filter(
    (a) =>
      returning &&
      sameActor(a.lane.actor, actor) &&
      restorable(model, a) &&
      isHead(model, a) &&
      !owesRelease(model, a.id) &&
      !ownsRow(model, a),
  );

  return {
    ...model,
    actors: [
      ...model.actors.filter((a) => !sameActor(a.actor, actor)),
      { actor, record: "bound" as const },
    ],
    obligations: [
      ...model.obligations,
      ...owing.map((a) => Obligation.AwaitRestore({ attempt: a.id, cause })),
    ],
  };
};

const causeOf = (model: Model, record: ActorRecord) => {
  if (record === "disposeActor" || record === "forget") return record;

  return model.afterDisposal ? "runtimeDisposal" : "plain";
};
