import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { parts } from "../../fixtures/index.ts";
import { scenarios } from "../suite.ts";
import type { Fixture } from "./fixture.ts";
import { type Level, unfoldedGuards } from "./handlers.ts";

const placesIn = (prefix: string, level: Level) =>
  Object.entries(level).flatMap(([event, alternatives]) =>
    alternatives.flatMap((a, i) =>
      a.opaque && Option.isNone(a.idle) ? [`${prefix}on.${event}[${i}]`] : [],
    ),
  );

const unfolded = (fixture: Fixture) => {
  const { handlers } = fixture;

  return [
    ...placesIn("", handlers.root),
    ...Object.entries(handlers.states).flatMap(([state, level]) =>
      level === undefined ? [] : placesIn(`states.${state}.`, level),
    ),
  ]
    .filter((place) => handlers.folds.guards[place] === undefined)
    .map((place) => `${fixture.name} ${place}`);
};

const handFixtures = () => {
  const partNames = new Set(parts.map((p) => p.name));
  const all = scenarios.flatMap((s) => s.fixtures).filter((f) => !partNames.has(f.name));

  return [...new Map(all.map((f) => [f.name, f])).values()];
};

describe("unfolded hand guards are owed (Conformance R19; phase-out step 5)", () => {
  it("every guarded place of a hand fixture with no fold is listed once, owed to a Task", () => {
    const found = handFixtures().flatMap(unfolded).toSorted();
    assert.ok(found.length > 0, "the walk found no guarded place");

    assert.deepStrictEqual(unfoldedGuards.map((g) => `${g.fixture} ${g.place}`).toSorted(), found);
  });

  it("a planted unfolded guard is found", () => {
    const [first] = handFixtures();
    assert.ok(first !== undefined);

    const planted: Fixture = {
      ...first,
      handlers: {
        ...first.handlers,
        root: {
          ...first.handlers.root,
          Planted: [
            {
              index: Option.none(),
              target: "stay",
              when: [],
              opaque: true,
              updates: false,
              idle: Option.none(),
            },
          ],
        },
      },
    };

    assert.ok(unfolded(planted).includes(`${first.name} on.Planted[0]`));
  });
});
