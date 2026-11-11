import { type ActorRef, sameActor } from "../port.ts";
import { type ActorRecord, isHead, type Model, Obligation } from "./lifecycle-model.ts";
import { owesRelease } from "./lifecycle.ts";

const actorOf = (model: Model, actor: ActorRef) =>
  model.actors.find((a) => sameActor(a.actor, actor));

/**
 * Begins an incarnation of `actor`: its ordinal moves on, and, on a return from grace,
 * `disposeActor` or `forget`, each Held head of its lanes owes its restore ending to this
 * incarnation, for a cause read from the actor's record.
 *
 * **Gotchas**
 *
 * - Only Held heads owe a restore here. A never-sent head acknowledged before its page died owes
 *   one from the `Reload` (Restore R3), when the store landed its acknowledging batch; one whose
 *   batch never landed owes nothing (Restore I8).
 * - A boot's restore endings are owed from the `Reload` itself, to each actor's next incarnation:
 *   the boot decides them before it opens any incarnation (round-14 `step.ts` `onBoot`: `restore`,
 *   then the `incarnation` notes), and a record not woken at ready hears them, parked, at its
 *   return. So the incarnation a boot opens owes no second restore ending (Restore I6, WriteLanes
 *   I15: once per incarnation). A Held head that owes its release is not kept (WriteLanes R4),
 *   so it owes no restore.
 */
export const incarnate = (model: Model, actor: ActorRef) => {
  const known = actorOf(model, actor);
  const cause = causeOf(model, known?.record ?? "bound");

  const returning = known !== undefined && known.record !== "bound";

  const owing = model.attempts.filter(
    (a) =>
      returning &&
      sameActor(a.lane.actor, actor) &&
      a.phase._tag === "Held" &&
      isHead(model, a) &&
      !owesRelease(model, a.id),
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
