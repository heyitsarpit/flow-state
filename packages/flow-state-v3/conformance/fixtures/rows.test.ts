import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { Effect, Option, Schema } from "effect";
import { compiledOf, loadPrototype } from "../adapters/prototype.ts";
import type { Fixture } from "./fixture.ts";
import { Cancel, Latest, Serialize } from "./one-lane.ts";
import { Cells, Pay } from "./pay.ts";
import type { Row, RowMember } from "./reference.ts";

const ROUND_14 = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "prototypes",
  "round-14",
);

const Token = Schema.Struct({
  node: Schema.optionalKey(Schema.String),
  op: Schema.optionalKey(Schema.String),
  verb: Schema.optionalKey(Schema.String),
  times: Schema.optionalKey(Schema.Number),
});

const Alternative = Schema.Struct({
  target: Schema.String,
  tokens: Schema.Array(Token),
  members: Schema.Array(Schema.Struct({ op: Schema.String, verb: Schema.String })),
});

const Compiled = Schema.Struct({
  root: Schema.String,
  nodes: Schema.Record(
    Schema.String,
    Schema.Struct({ on: Schema.Record(Schema.String, Schema.Array(Alternative)) }),
  ),
});

type Alternative = typeof Alternative.Type;

const LANE_KINDS: ReadonlyArray<string> = ["commit", "retry", "cancel", "cancelAll"];

// RETURN_TYPE: a type predicate narrows the verb; it cannot be inferred.
const isRowKind = (verb: string): verb is RowMember["kind"] => LANE_KINDS.includes(verb);

const laneMembers = (alternative: Alternative, writes: ReadonlyArray<string>) =>
  alternative.members.flatMap((m) =>
    writes.includes(m.op) && isRowKind(m.verb) ? [{ operation: m.op, kind: m.verb }] : [],
  );

const retryableOf = (alternative: Alternative) =>
  Option.fromUndefinedOr(alternative.tokens.find((t) => t.verb === "retryable"));

const guardOf = (alternatives: ReadonlyArray<Alternative>, index: number) => {
  const alternative = alternatives[index];

  if (alternative === undefined) return Option.none();
  const own = retryableOf(alternative);

  if (Option.isSome(own))
    return Option.some({
      operation: own.value.op ?? "",
      times: own.value.times ?? 0,
      passes: true,
    });

  const before = alternatives
    .slice(0, index)
    .filter((a) => a.target === alternative.target)
    .flatMap((a) => Option.toArray(retryableOf(a)));

  return Option.map(Option.fromUndefinedOr(before.at(-1)), (t) => ({
    operation: t.op ?? "",
    times: t.times ?? 0,
    passes: false,
  }));
};

const compiledRows = (compiled: typeof Compiled.Type, writes: ReadonlyArray<string>) =>
  Object.entries(compiled.nodes).flatMap(([node, { on }]) =>
    Object.entries(on).flatMap(([event, alternatives]) =>
      alternatives.flatMap((alternative, index) => {
        const members = laneMembers(alternative, writes);

        if (members.length === 0) return [];
        const state = alternative.tokens.find((t) => t.node !== undefined)?.node;
        const from = node === compiled.root ? (state ?? "any") : node;
        const to = alternative.target === "self" ? "same" : alternative.target;

        return [{ event, from, to, members, guard: guardOf(alternatives, index) }];
      }),
    ),
  );

const shown = (rows: ReadonlyArray<Row>) =>
  rows
    .map((r) => {
      const guard = Option.match(r.guard, {
        onNone: () => "",
        onSome: (g) => ` retryable(${g.operation}, ${g.times}) ${g.passes ? "passes" : "fails"}`,
      });

      return `${r.event} ${r.from}->${r.to} [${r.members.map((m) => `${m.operation}.${m.kind}`).join(", ")}]${guard}`;
    })
    .toSorted();

const FIXTURES: ReadonlyArray<Fixture> = [Pay, Cells, Serialize, Latest, Cancel];

describe("reference rows (a change detector)", () => {
  it("each fixture's rows are its compiled machine's alternatives that run lane members", async () => {
    const loaded = await Effect.runPromise(loadPrototype(ROUND_14));

    for (const fixture of FIXTURES) {
      const compiled = Option.getOrThrow(compiledOf(loaded, fixture.name));
      const decoded = Schema.decodeUnknownSync(Compiled)(compiled);
      const writes = Object.keys(fixture.operations);

      assert.deepStrictEqual(
        shown(fixture.rows),
        shown(compiledRows(decoded, writes)),
        `${fixture.name}'s rows`,
      );
    }
  });
});
