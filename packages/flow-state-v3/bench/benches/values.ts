import { Option, Result } from "effect";
import type { Story } from "../../src/host/testing/index.ts";
import type { App } from "../../src/index.ts";
import { InternalsId } from "../../src/host/inspect.ts";
import { compiledOf } from "../../src/host/inspect.ts";

type Walk = (typeof WALKS)[number];

// A field's walkers, as a machine's compiled fields hold them.
type Walker = {
  // FLOW_STATE_ALLOW_UNKNOWN: a field's walkers take the field's own values, typed at the definition.
  readonly encode: (value: unknown) => Result.Result<unknown, unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: as above.
  readonly decode: (value: unknown) => Result.Result<unknown, unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: as above.
  readonly text: (value: unknown) => Result.Result<{ readonly text: string }, unknown>;
  readonly memo: () => { readonly hits: number; readonly misses: number };
};

// FLOW_STATE_ALLOW_UNKNOWN: a field value walked by its own walker.
type Pair = { readonly walker: Walker; readonly value: unknown };

const fieldsOf = (app: App) =>
  new Map(
    Object.values(app.machines).map((entry) => {
      const machine = "machine" in entry ? entry.machine : entry;

      return [compiledOf(machine).id, compiledOf(machine)[InternalsId].fields] as const;
    }),
  );

// The last memory each actor of a Story's run published, each field paired with its walker.
const memoriesOf = async (app: App, story: Story<string>) => {
  const fields = fieldsOf(app);
  const run = await story.run();
  const last = new Map<string, Pair[]>();

  for (const e of run.evidence) {
    if (e._tag !== "Published") continue;
    const memory = e.memory;

    const pairs = (fields.get(e.actor.machine) ?? []).flatMap((f) =>
      f.name in memory ? [{ walker: f.walk, value: memory[f.name] }] : [],
    );

    last.set(`${e.actor.machine}/${e.actor.name}`, pairs);
  }

  return [...last.values()].flat();
};

// The inputs of one walk: fresh copies, so no part is served from the memo, except for the memo
// bench, which walks the same values again; decode walks the encoded forms.
// FLOW_STATE_ALLOW_UNKNOWN: encoded forms of field values, typed at their definitions.
const inputsOf = (walk: Walk, pairs: ReadonlyArray<Pair>, encoded: ReadonlyArray<unknown>) => {
  if (walk === "decode") return encoded.map((v) => structuredClone(v));

  if (walk === "text-memo") return pairs.map((p) => p.value);

  return pairs.map((p) => structuredClone(p.value));
};

// Walks one value; every result lands in the sink, so no walk can be dropped as unused.
// FLOW_STATE_ALLOW_UNKNOWN: a field value walked by its own walker.
const walkOne = (
  walk: Walk,
  walker: Walker,
  input: unknown,
  sink: { ok: number; bytes: number },
) => {
  if (walk === "encode" || walk === "decode") {
    const result = walk === "encode" ? walker.encode(input) : walker.decode(input);

    if (Result.isSuccess(result)) sink.ok += 1;

    return;
  }

  const text = walker.text(input);

  if (Result.isFailure(text)) return;
  sink.ok += 1;
  sink.bytes += text.success.text.length;
};

// The memo's growth over one walk, each walker counted once however many values share it.
const memoGrowth = (
  pairs: ReadonlyArray<Pair>,
  before: ReadonlyMap<Walker, { hits: number; misses: number }>,
) =>
  [...new Set(pairs.map((p) => p.walker))].reduce(
    (sum, w) => ({
      hits: sum.hits + w.memo().hits - (before.get(w)?.hits ?? 0),
      misses: sum.misses + w.memo().misses - (before.get(w)?.misses ?? 0),
    }),
    { hits: 0, misses: 0 },
  );

// One walk over every pair, timed alone: copying the inputs is setup.
const walkSubject = async (walk: Walk, pairs: ReadonlyArray<Pair>) => {
  const encoded = pairs.map((p) => Result.getOrUndefined(p.walker.encode(p.value)));

  const op = async () => {
    const inputs = inputsOf(walk, pairs, encoded);
    const memoBefore = new Map(pairs.map((p) => [p.walker, p.walker.memo()]));
    const sink = { ok: 0, bytes: 0 };
    const start = performance.now();

    for (const [n, pair] of pairs.entries()) walkOne(walk, pair.walker, inputs[n], sink);

    const ms = performance.now() - start;
    const memo = memoGrowth(pairs, memoBefore);

    return {
      units: pairs.length,
      counters: { ok: sink.ok, bytes: sink.bytes, memoHits: memo.hits, memoMisses: memo.misses },
      sample: Option.some(ms),
    };
  };

  // The memo bench's first walk fills the memo; every walk after it is all hits.
  const filled = await op();

  return {
    op,
    proof: async () => {
      const { counters } = await op();
      const failed = pairs.length - counters.ok;

      const memoWrong =
        (walk === "text-memo" && counters.memoMisses > 0) ||
        (walk === "text" && counters.memoHits > 0);

      return pairs.length > 0 && failed === 0 && !memoWrong
        ? Option.none()
        : Option.some(`${failed} of ${pairs.length} walks failed, memo ${String(memoWrong)}`);
    },
    shape: async () => ({ values: pairs.length, bytes: filled.counters.bytes }),
  };
};

/**
 * The walks a `values` bench times: encode, canonical text from fresh values, canonical text served
 * by the memo, and decode.
 */
export const WALKS = ["encode", "text", "text-memo", "decode"] as const;

/**
 * One walk over every field value the memories of a Story's run publish, each walked by its
 * machine's own compiled walker.
 */
export const valuesSubject = async (app: App, story: Story<string>, walk: Walk) =>
  walkSubject(walk, await memoriesOf(app, story));
