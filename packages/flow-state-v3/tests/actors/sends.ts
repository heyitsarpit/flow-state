import { Step, type Cut, type Story, type StoryRun } from "../../src/host/testing/index.ts";
import type { ActorRef } from "../../src/index.ts";

type Who = { readonly machine: string; readonly name: string };

/**
 * Reads actors by their refs, as evidence names them: each ref's identity as a step of `story`
 * records it.
 */
export const readerOf = (story: Story) => {
  const idOf = (ref: ActorRef) => {
    const step = story.detach(ref).steps.at(-1);

    return step !== undefined && Step.$is("detach")(step) ? step.actor : { machine: "", name: "" };
  };

  const is = (ref: ActorRef) => {
    const id = idOf(ref);

    return (actor: Who) => actor.machine === id.machine && actor.name === id.name;
  };

  return { idOf, is };
};

/**
 * The events an actor's turns ran, in order, across every open of the run.
 */
export const turnsOf = (run: StoryRun, is: (actor: Who) => boolean) =>
  run.evidence.flatMap((e) => (e._tag === "Turn" && is(e.actor) ? [e.event] : []));

/**
 * How many incarnations of an actor began in the run.
 */
export const incarnationsOf = (run: StoryRun, is: (actor: Who) => boolean) =>
  run.evidence.filter((e) => e._tag === "Incarnated" && is(e.actor)).length;

/**
 * How many incarnations of an actor ended in the run.
 */
export const endsOf = (run: StoryRun, is: (actor: Who) => boolean) =>
  run.evidence.filter((e) => e._tag === "Finished" && is(e.actor)).length;

/**
 * Every send the run dropped, in order: its target, event and reason, and the sender it was
 * reported on, read by field name so a field the record lacks reads as undefined.
 */
export const droppedSends = (run: StoryRun) =>
  run.evidence.flatMap((e) => {
    if (e._tag !== "SendTargetAbsent") return [];

    return [
      {
        actor: e.actor,
        event: e.event,
        reason: e.reason,
        sender: "sender" in e ? e.sender : undefined,
      },
    ];
  });

/**
 * The open issues of an actor at a cut that refused one of its turns.
 */
export const refusedTurns = (cut: Cut, ref: ActorRef) =>
  (cut.read(ref)?.issues ?? []).filter((d) => d.details["refused"] === "InvalidTurn");
