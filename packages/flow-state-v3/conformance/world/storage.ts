import { Data } from "effect";
import type { Page } from "./page.ts";

/**
 * Why the runtime writes a batch: to acknowledge an Attempt before its send, to capture a
 * record, or a plain flush.
 */
export type Purpose = "acknowledge" | "capture" | "flush";

/**
 * One key's write in a batch: a new value, or the key's removal.
 */
export type Write = Data.TaggedEnum<{
  Put: { key: string; value: string };
  Remove: { key: string };
}>;

/**
 * Constructors and matchers for {@link Write}.
 */
export const Write = Data.taggedEnum<Write>();

/**
 * How the suite answers every held batch.
 */
export type StorageAnswer = "ack" | "refuse" | "hang" | "landNoAck";

type Held = {
  readonly writes: ReadonlyArray<Write>;
  readonly purpose: Purpose;
  readonly acknowledges: ReadonlyArray<string>;
  readonly answer: (ok: boolean) => void;
};

const shuffled = <A>(items: ReadonlyArray<A>, seed: number) => {
  const out = [...items];
  let x = (seed * 2_654_435_761 + 1) >>> 0;

  for (let i = out.length - 1; i > 0; i -= 1) {
    x = (Math.imul(x, 48_271) >>> 0) % 2_147_483_647;
    const j = x % (i + 1);
    const a = out[i];
    const b = out[j];

    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }

  return out;
};

/**
 * The fake world's durable store: a key-value map with atomic batches.
 *
 * **When to use**
 *
 * A runtime loads every record at boot and writes batches; the suite answers awaited batches with
 * `answer`.
 *
 * **Details**
 *
 * - A plain flush lands at once and is answered in a later task.
 * - An acknowledgement or a capture is held until the suite answers it: `ack` lands it, `refuse`
 *   drops it, `hang` leaves it unanswered for good (it still dies with its page), `landNoAck`
 *   lands it and leaves it unanswered (the confirmation was lost).
 * - `load` returns the records in an order fixed by the seed and the page, never the order
 *   written, so a runtime's restore order is its own.
 * - A held batch dies with its page; the bytes that landed stay.
 * - `write`'s `acknowledges` names the Attempts the batch acknowledges (the runtime's claim);
 *   `answer` returns those of the batches that landed (`ack`, `landNoAck`), the suite's fact of
 *   which acknowledgements are on disk (Restore R3, I8). A flush acknowledges nothing.
 * - The ids are not checked against the bytes, whose encoding is the runtime's: a runtime that
 *   leaves a landed acknowledgement unnamed is owed no restore for it (a stated limit).
 *
 * **Gotchas**
 *
 * - Every answer is given in a later task, never inside `write`.
 */
export type Storage = {
  readonly load: () => ReadonlyMap<string, string>;
  readonly write: (
    writes: ReadonlyArray<Write>,
    purpose: Purpose,
    answer: (ok: boolean) => void,
    acknowledges: ReadonlyArray<string>,
  ) => void;
  readonly answer: (how: StorageAnswer) => ReadonlyArray<string>;
  readonly kill: () => void;
};

/**
 * An empty store whose load order is fixed by `seed` and the page; its answers run as the page's
 * tasks.
 */
// RETURN_TYPE: the exported Storage contract; it types the write and answer parameters for the runtime.
export const makeStorage = (seed: number, page: Page): Storage => {
  let kv: ReadonlyMap<string, string> = new Map();
  let held: ReadonlyArray<Held> = [];

  const land = (writes: ReadonlyArray<Write>) => {
    const next = new Map(kv);

    for (const w of writes)
      Write.$match(w, {
        Put: ({ key, value }) => next.set(key, value),
        Remove: ({ key }) => next.delete(key),
      });

    kv = next;
  };

  return {
    load: () => new Map(shuffled([...kv], seed * 40_503 + page.page())),
    write: (writes, purpose, answer, acknowledges) => {
      if (purpose === "flush") {
        land(writes);
        page.later(() => answer(true));

        return;
      }

      held = [...held, { writes, purpose, answer, acknowledges }];
    },
    answer: (how) => {
      const chosen = held;
      held = [];
      const landed = how === "ack" || how === "landNoAck";

      if (landed) for (const h of chosen) land(h.writes);

      if ((how === "ack" || how === "refuse") && chosen.length > 0)
        page.later(() => {
          for (const h of chosen) h.answer(how === "ack");
        });

      return landed ? chosen.flatMap((h) => h.acknowledges) : [];
    },
    kill: () => {
      held = [];
    },
  };
};
