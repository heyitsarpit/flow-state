import { Option } from "effect";
import type { Purpose } from "../world/storage.ts";
import { captureOf, type Ending, Life, type Model, Phase, unsavedOf } from "./lifecycle-model.ts";

const rolledEnding = (model: Model, e: Ending, index: number) => {
  const held = Option.exists(e.attempt, (id) =>
    model.attempts.some((a) => a.id === id && Phase.$is("Held")(a.phase)),
  );

  const least = model.saved.least.lives[index];

  return Option.match(Option.fromUndefinedOr(model.saved.lives[index]), {
    onNone: () => ({ ...e, life: Life.Closed() }),
    onSome: (life) => {
      if (held) return e;

      return least?._tag === life._tag && !Life.$is("Delivering")(life)
        ? { ...e, life }
        : { ...e, life: Life.Maybe() };
    },
  });
};

/**
 * The lanes a kill may leave: an acknowledged Attempt whose ending no landing answer followed may
 * be on disk as its ending or, if the batch holding it died, as its acknowledged head
 * (WriteAhead R10, I10, I17). It restores as a never-sent head does, allowed and not owed: the
 * boot may restore it unknown { Restored } once, or not at all.
 *
 * **Details**
 *
 * Each ending takes back its life at the last landing or boot (the model's `saved`), unless its
 * Attempt is a Held head, whose restore the boot owes instead (Restore I6); an ending decided since
 * is not on disk, so it closes, and the restore alone may follow. An ending that changed in the
 * step that wrote the landed batch may or may not be held by it (design B4), and so may one saved
 * mid-delivery: it becomes `Maybe`.
 */
export const rolledBack = (model: Model) => {
  const unsaved = unsavedOf(model);

  return {
    ...model,
    attempts: model.attempts.map((a) =>
      a.phase._tag === "Gone" && unsaved.includes(a.id) && model.acknowledged.includes(a.id)
        ? { ...a, phase: Phase.Restoring({ head: true }) }
        : a,
    ),
    endings: model.endings.map((e, i) => rolledEnding(model, e, i)),
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
  saved: captureOf(model, model),
  pending: Option.none(),
});

/**
 * The store received a batch, holding at least `least` (before the step's second turn) and at most
 * `model` (design B4): a flush lands at once, any other waits for an answer.
 */
export const wrote = (model: Model, least: Model, purpose: Purpose) =>
  purpose === "flush"
    ? { ...model, saved: captureOf(model, least) }
    : { ...model, pending: Option.some(captureOf(model, least)) };

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
