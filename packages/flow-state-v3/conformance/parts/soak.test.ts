import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { implemented as production } from "../adapters/production.ts";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import { oracles } from "../suite.ts";
import { parts } from "../../fixtures/index.ts";
import { scriptOf } from "./generate.ts";
import { reachOf, seedsByReach, soaked } from "./soak.ts";

const pay = Option.getOrThrow(Option.fromUndefinedOr(parts.find((p) => p.name === "pay")));
const candidates = [1, 2, 3, 4].map((seed) => scriptOf(pay, "varied", seed, production));

const planted = (name: string, invariant: string, event: string) => {
  const found = violation(`${invariant}: planted`, Option.some("att-planted"));

  return oracle<number>({
    name,
    guarantee: [found.invariant],
    start: () => 0,
    step: (n, cut) => [
      n + 1,
      cut.some((f) => Fact.$is("Drove")(f) && f.event === event) ? [found] : [],
    ],
  });
};

describe("seeds chosen by reach and the soak run (T61; survey item 4)", () => {
  it("the chooser keeps a script that reaches a cell the base set lacks, and drops one that adds nothing", () => {
    const [first, ...rest] = candidates.map((s) => ({ script: s, reach: reachOf(s) }));

    assert.ok(first !== undefined);
    const [missing] = [...first.reach];

    const lacking = new Set(
      [...rest, first].flatMap((c) => [...c.reach]).filter((r) => r !== missing),
    );

    const chosen = seedsByReach([...rest, first], lacking);

    assert.deepEqual(chosen.filter((c) => c.reach.has(missing ?? "")).length, 1);
    assert.deepEqual(seedsByReach([first], new Set(first.reach)), []);
  });

  it("a soak run keeps one shrunk case per new signature and none for a known one", () => {
    const judges = [
      ...oracles,
      planted("lane-queue", "WriteLanes I12", "PayRequested"),
      planted("selection", "Turn I2", "Leave"),
    ];

    const result = soaked(candidates, judges, new Set());

    assert.ok(result.shrunk.length >= 1);
    assert.equal(new Set(result.shrunk.map((s) => s.signature)).size, result.shrunk.length);
    assert.ok(result.shrunk.every((s) => s.script.id.endsWith("-shrunk")));

    const known = soaked(candidates, judges, new Set(result.shrunk.map((s) => s.signature)));

    assert.deepEqual(known.shrunk, []);
  }, 120_000);
});
