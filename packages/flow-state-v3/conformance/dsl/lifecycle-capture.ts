import { Option } from "effect";
import type { Purpose } from "../world/storage.ts";
import { captureOf, type Ending, Life, type Model, Phase, unsavedOf } from "./lifecycle-model.ts";

const rolledEnding = (model: Model, e: Ending, index: number) => {
  const held = Option.exists(e.attempt, (id) =>
    model.attempts.some((a) => a.id === id && Phase.$is("Held")(a.phase)),
  );

  return Option.match(Option.fromUndefinedOr(model.saved.lives[index]), {
    onNone: () => ({ ...e, life: Life.Closed() }),
    onSome: (life) => {
      if (held) return e;

      return Life.$is("Delivering")(life) ? { ...e, life: Life.Maybe() } : { ...e, life };
    },
  });
};

/**
 * The lanes a kill may leave: an acknowledged Attempt whose ending no landing answer followed may
 * be on disk as its ending or, if the batch holding it died, as its acknowledged head
 * (WriteAhead R10, I10, I17). It restores as a never-sent head does, allowed and not owed: the
 * boot may restore it unknown { Restored } once, or not at all. A queued commit the landed batch
 * holds, whose ending no landing followed, is on disk queued: it restores as a queued commit
 * (Restore R3).
 *
 * **Details**
 *
 * Each ending takes back its life at the last landing or boot (the model's `saved`), unless its
 * Attempt is a Held head, whose restore its identity's next start owes instead (Restore I6); an
 * ending decided since is not on disk, so it closes, and the restore alone may follow. The landed batch holds the end of
 * the step that wrote it (WriteAhead R10), so every other ending takes back that exact life; one
 * saved mid-delivery may or may not have been heard, and becomes `Maybe`.
 */
export const rolledBack = (model: Model) => {
  const unsaved = unsavedOf(model);

  return {
    ...model,
    attempts: model.attempts.map((a, index) => {
      if (a.phase._tag !== "Gone" || !unsaved.includes(a.id)) return a;

      if (model.acknowledged.includes(a.id))
        return { ...a, phase: Phase.Restoring({ head: true }) };

      return index < model.saved.minted ? { ...a, phase: Phase.Restoring({ head: false }) } : a;
    }),
    endings: model.endings.map((e, i) => rolledEnding(model, e, i)),
  };
};

/**
 * After a reload, a local actor (its machine not persisted, WriteAhead R3) is gone with its page:
 * no record restores it, so its Attempts are Gone, its endings closed, and nothing stays owed to
 * them (Restore I6 owes a restore only to an Acknowledged Attempt, and a local one is never
 * acknowledged).
 */
export const localGone = (model: Model, local: ReadonlyArray<string>) => {
  const isLocal = (actor: { readonly machine: string }) => local.includes(actor.machine);

  const gone: ReadonlySet<string> = new Set(
    model.attempts.filter((a) => isLocal(a.lane.actor)).map((a) => a.id),
  );

  const owedToGone = (o: Model["obligations"][number]) =>
    o._tag === "AwaitLetGo"
      ? Option.exists(Option.fromUndefinedOr(model.endings[o.ending]), (e) => isLocal(e.actor))
      : gone.has(o.attempt);

  return {
    ...model,
    attempts: model.attempts.map((a) =>
      gone.has(a.id) ? { ...a, phase: Phase.Gone({ why: "closed" }) } : a,
    ),
    endings: model.endings.map((e) => (isLocal(e.actor) ? { ...e, life: Life.Closed() } : e)),
    obligations: model.obligations.filter((o) => !owedToGone(o)),
    actors: model.actors.filter((a) => !isLocal(a.actor)),
    releasing: model.releasing.filter((l) => !isLocal(l.actor)),
  };
};

/**
 * After a reload, a head whose acknowledgement never landed was never on disk as a head
 * (WriteAhead R10): it does not hold its lane.
 */
export const unlanded = (model: Model) => ({
  ...model,
  attempts: model.attempts.map((a) =>
    Phase.$is("Restoring")(a.phase) && a.phase.head && !model.acknowledged.includes(a.id)
      ? { ...a, phase: Phase.Restoring({ head: false }) }
      : a,
  ),
});

/**
 * A boot reads the store: what it holds now is saved, and nothing is pending.
 */
export const booted = (model: Model) => ({
  ...model,
  saved: captureOf(model),
  pending: Option.none(),
});

/**
 * The store received a batch holding `model`, the end of the step that wrote it (WriteAhead R10):
 * a flush lands at once, any other waits for an answer.
 */
export const wrote = (model: Model, purpose: Purpose) =>
  purpose === "flush"
    ? { ...model, saved: captureOf(model) }
    : { ...model, pending: Option.some(captureOf(model)) };

/**
 * The store landed the held batches: the latest one's capture is saved.
 */
export const landed = (model: Model) =>
  Option.match(model.pending, {
    onNone: () => model,
    onSome: (capture) => ({
      ...model,
      saved: capture.ended >= model.saved.ended ? capture : model.saved,
      pending: Option.none(),
    }),
  });
