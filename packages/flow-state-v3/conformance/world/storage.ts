import { Option } from "effect";

/**
 * Why the runtime writes a batch: to acknowledge an Attempt before its send, to capture a
 * record, or a plain flush.
 */
export type Purpose = "acknowledge" | "capture" | "flush";

/**
 * One key's write in a batch; an absent value deletes the key.
 */
export type Write = { readonly key: string; readonly value: string | undefined };

/**
 * How the suite answers the held batches it matches.
 */
export type StorageAnswer = "ack" | "refuse";

type Held = {
  readonly writes: ReadonlyArray<Write>;
  readonly purpose: Purpose;
  readonly answer: (ok: boolean) => void;
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
 *   drops it.
 * - `load` returns the records in an order fixed by the seed and the page, never the order
 *   written, so a runtime's restore order is its own.
 * - A held batch dies with its page; the bytes that landed stay.
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
  ) => void;
  readonly answer: (how: StorageAnswer, match: Option.Option<string>) => number;
  readonly entries: () => ReadonlyMap<string, string>;
  readonly held: () => ReadonlyArray<{
    readonly purpose: Purpose;
    readonly keys: ReadonlyArray<string>;
  }>;
  readonly batches: () => ReadonlyArray<{
    readonly purpose: Purpose;
    readonly writes: ReadonlyArray<Write>;
  }>;
  readonly kill: () => void;
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
 * Builds an empty store.
 *
 * **Details**
 *
 * `later` queues an answer as a page task; `page` names the page the load order is fixed for.
 */
// RETURN_TYPE: The exported Storage contract; it types the write method's parameters for the runtime.
export const makeStorage = (
  seed: number,
  later: (task: () => void) => void,
  page: () => number,
): Storage => {
  let kv: ReadonlyMap<string, string> = new Map();
  let held: ReadonlyArray<Held> = [];

  let batches: ReadonlyArray<{ readonly purpose: Purpose; readonly writes: ReadonlyArray<Write> }> =
    [];

  const land = (writes: ReadonlyArray<Write>) => {
    const next = new Map(kv);

    for (const w of writes) {
      if (w.value === undefined) next.delete(w.key);
      else next.set(w.key, w.value);
    }

    kv = next;
  };

  const matches = (h: Held, match: Option.Option<string>) =>
    Option.match(match, {
      onNone: () => true,
      onSome: (m) => h.purpose === m || h.writes.some((w) => w.key.includes(m)),
    });

  return {
    load: () => new Map(shuffled([...kv], seed * 40_503 + page())),
    write: (writes, purpose, answer) => {
      batches = [...batches, { purpose, writes }];

      if (purpose === "flush") {
        land(writes);
        later(() => answer(true));

        return;
      }

      held = [...held, { writes, purpose, answer }];
    },
    answer: (how, match) => {
      const chosen = held.filter((h) => matches(h, match));
      held = held.filter((h) => !matches(h, match));

      if (how === "ack") for (const h of chosen) land(h.writes);

      if (chosen.length > 0)
        later(() => {
          for (const h of chosen) h.answer(how === "ack");
        });

      return chosen.length;
    },
    entries: () => kv,
    held: () => held.map((h) => ({ purpose: h.purpose, keys: h.writes.map((w) => w.key) })),
    batches: () => batches,
    kill: () => {
      held = [];
    },
  };
};
