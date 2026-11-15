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
 * How a case answers every held batch.
 */
export type StorageAnswer = "ack" | "refuse" | "hang" | "landNoAck";

type Held = { readonly writes: ReadonlyArray<Write>; readonly answer: (ok: boolean) => void };

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
 * **Details**
 *
 * - A plain flush lands at once and is answered in a later task; after `holdFlushes` a flush is
 *   held like any other batch.
 * - An acknowledgement or a capture is held until a case answers it: `ack` lands it, `refuse`
 *   drops it, `hang` leaves it unanswered for good (it still dies with its page), `landNoAck`
 *   lands it and leaves it unanswered (the confirmation was lost).
 * - `load` returns the records in an order fixed by the seed and the page, never the order
 *   written, so a runtime's restore order is its own.
 * - A held batch dies with its page; the bytes that landed stay.
 * - Every answer is given in a later task, never inside `write`.
 */
export type Storage = {
  readonly load: () => ReadonlyMap<string, string>;
  readonly write: (
    writes: ReadonlyArray<Write>,
    purpose: Purpose,
    answer: (ok: boolean) => void,
  ) => void;
  readonly answer: (how: StorageAnswer) => void;
  readonly holdFlushes: () => void;
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
  let holdingFlushes = false;

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
    write: (writes, purpose, answer) => {
      if (purpose === "flush" && !holdingFlushes) {
        land(writes);
        page.later(() => answer(true));

        return;
      }

      held = [...held, { writes, answer }];
    },
    answer: (how) => {
      const chosen = held;
      held = [];

      if (how === "ack" || how === "landNoAck") for (const h of chosen) land(h.writes);

      if ((how === "ack" || how === "refuse") && chosen.length > 0)
        page.later(() => {
          for (const h of chosen) h.answer(how === "ack");
        });
    },
    holdFlushes: () => {
      holdingFlushes = true;
    },
    kill: () => {
      held = [];
    },
  };
};
