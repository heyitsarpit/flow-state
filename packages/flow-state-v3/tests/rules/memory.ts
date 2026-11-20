import { Equal, Predicate } from "effect";
import type { Evidence } from "../../src/host/inspect.ts";
import { isRefusal, isTurnStart, nameOf } from "./deliveries.ts";
import type { Rule } from "./rules.ts";

const memoryOf = (e: Evidence) => (e._tag === "Published" ? e.memory : {});

type Memory = ReturnType<typeof memoryOf>;

// The turns that run no update of their own: an Unhandled, Denied or refused one.
const runsNoUpdate = (e: Evidence, evidence: ReadonlyArray<Evidence>) =>
  e._tag === "Unhandled" || e._tag === "Denied" || isRefusal(e, evidence);

// A memory whose every field is the same value as before is the same object.
const memoryKept = (before: Memory, now: Memory) =>
  before === now ||
  Object.keys(now).length !== Object.keys(before).length ||
  Object.keys(now).some((k) => !Object.is(before[k], now[k]));

/**
 * Turn I30, over one incarnation's consecutive snapshots: a memory field whose content is unchanged
 * is the same object in the next snapshot.
 *
 * **Gotchas**
 *
 * - A field is judged for snapshots of turns that run no update (Unhandled, Denied, refused): a
 *   turn that runs one may write an equal new value, an application value whose identity is its own
 *   (Turn R24).
 * - The memory object is judged after every turn: when each of its fields is the same value as
 *   before, it is the same object, a state-only move included.
 */
export const unchangedPartsKept: Rule = {
  rule: "Turn I30",
  breaches: (run) => {
    const last = new Map<string, Memory>();
    let quiet = false;

    return run.evidence.flatMap((e, at) => {
      if (e._tag === "Incarnated") last.delete(nameOf(e.actor));

      if (isTurnStart(e, run.evidence)) quiet = runsNoUpdate(e, run.evidence);

      if (e._tag !== "Published") return [];
      const who = nameOf(e.actor);
      const before = last.get(who);
      const now = memoryOf(e);
      last.set(who, now);

      if (before === undefined) return [];

      const fields = quiet
        ? Object.keys(now).filter(
            (k) =>
              Predicate.isObjectOrArray(now[k]) &&
              !Object.is(before[k], now[k]) &&
              Equal.equals(before[k], now[k]),
          )
        : [];

      const found = fields.map(
        (k) =>
          `Turn I30: ${who}'s memory field ${k} is unchanged but a new object (evidence ${at})`,
      );

      if (!memoryKept(before, now))
        found.unshift(`Turn I30: ${who}'s memory is unchanged but a new object (evidence ${at})`);

      return found;
    });
  },
};
