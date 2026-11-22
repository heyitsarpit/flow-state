import { readdirSync } from "node:fs";
import { Option, Predicate, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { compiledOf, InternalsId } from "../../src/host/inspect.ts";
import { loose } from "../../src/test/loose.ts";

type Compiled = ReturnType<typeof compiledOf>;

const FIXTURES = new URL("../../fixtures/", import.meta.url);

// Every fixture machine: each machine a fixture's machines module exports.
const modules = await Promise.all(
  readdirSync(FIXTURES, { recursive: true, encoding: "utf8" })
    .filter((f) => /(?:^|\/)machines\/.+\.ts$/u.test(f) && !f.endsWith(".test.ts"))
    .toSorted()
    .map(async (file) => {
      // FLOW_STATE_ALLOW_UNKNOWN: a module's exports, read before they are trusted; a module
      // whose machine refuses to build throws, and is named by the first test below.
      const loaded: unknown = await import(new URL(file, FIXTURES).href).catch(() => undefined);

      return {
        file,
        loaded: loaded !== undefined,
        exports: Predicate.isObject(loaded) ? Object.entries(loaded) : [],
      };
    }),
);

const machines = modules.flatMap(({ file, exports }) =>
  exports.flatMap(([name, value]) =>
    Predicate.isObject(value)
      ? Option.toArray(
          Option.map(Result.getSuccess(Result.try(() => compiledOf(value))), (compiled) => ({
            name: `${file}#${name}`,
            machine: value,
            compiled,
          })),
        )
      : [],
  ),
);

// The slow scans each derived field replaces, the reference of Types I10.
const chainOf = (path: string) =>
  path.split(".").map((_, i, segments) => segments.slice(0, i + 1).join("."));

const leafOf = (compiled: Compiled, path: string) => {
  let at = path;

  for (let node = compiled.states.get(at); node !== undefined && Option.isSome(node.default);) {
    at = node.default.value;
    node = compiled.states.get(at);
  }

  return at;
};

const handledOf = (compiled: Compiled) =>
  new Set([
    ...compiled.root.keys(),
    ...[...compiled.states.values()].flatMap((node) => [...node.on.keys()]),
  ]);

// FLOW_STATE_ALLOW_UNKNOWN: a value read one property at a time, as plain JavaScript reads it.
const field = (value: unknown, key: PropertyKey) =>
  Predicate.hasProperty(value, key) ? value[key] : undefined;

// FLOW_STATE_ALLOW_UNKNOWN: a callback read off a value, called as plain JavaScript calls it.
const called = (f: unknown, input: unknown) => {
  const run: (input: unknown) => unknown = loose(f);

  return Predicate.isFunction(f) ? run(input) : undefined;
};

// The path the authored root default names: the machine's body run again with its definition's
// tokens (a `C` whose reactions are blank), and the default it returns found among the
// definition's state tokens by identity, so the oracle never reads what construction derived.
const authoredDefault = (machine: unknown, compiled: Compiled) => {
  const definition = field(machine, "definition");
  const S = field(definition, "S");
  const C = new Proxy({}, { get: () => ({ change: () => ({}) }) });
  const body = field(field(field(machine, InternalsId), "internals"), "body");
  const written = called(body, { S, E: field(definition, "E"), O: field(definition, "O"), C });
  const chosen = field(written, "default");

  return (
    [...compiled.states.keys()].find((path) => path.split(".").reduce(field, S) === chosen) ?? ""
  );
};

describe("Compiled's derived fields equal their slow scans (Types I10, T5)", () => {
  it("Types T5: every fixture machines module builds its machines", () => {
    expect(modules.filter((m) => !m.loaded).map((m) => m.file)).toEqual([]);
  });

  it("Types T5: the fixtures hold machines to check, nested ones among them", () => {
    const depths = machines.flatMap(({ compiled }) =>
      [...compiled.states.keys()].map((path) => chainOf(path).length),
    );

    expect({
      machines: machines.length >= 40,
      nested: Math.max(...depths) >= 2,
    }).toEqual({ machines: true, nested: true });
  });

  for (const { name, machine, compiled } of machines)
    it(`Types I10: ${name}'s chain, depth, leaf, initial and handled tags`, () => {
      const nodes = [...compiled.states.values()];

      expect({
        chains: nodes.map((n) => n.chain),
        depths: nodes.map((n) => n.depth),
        leaves: nodes.map((n) => n.leaf),
        initial: compiled.initial,
        handled: [...compiled.handledTags].toSorted(),
      }).toEqual({
        chains: nodes.map((n) => chainOf(n.path)),
        depths: nodes.map((n) => chainOf(n.path).length),
        leaves: nodes.map((n) => leafOf(compiled, n.path)),
        initial: leafOf(compiled, authoredDefault(machine, compiled)),
        handled: [...handledOf(compiled)].toSorted(),
      });
    });
});
