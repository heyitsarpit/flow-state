import { describe, expect, it } from "vite-plus/test";
import { numberSetup } from "../../fixtures/number-input/machine.ts";
import {
  generate,
  propertyTest,
  type Samples,
  samplesOf,
  Story,
} from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";
import { mix } from "./fixtures.ts";
import { planted } from "./planted.ts";

const SEEDS = [1, 2, 3, 4, 5];

// The fixture a store key, a server's name or an actor's machine belongs to.
const ownerOf = (parts: ReadonlyArray<Samples>) => ({
  machine: (machine: string) =>
    parts.filter((p) => p.actors.some((a) => a.actor.machine === machine)).map((p) => p.id),
  key: (key: string) =>
    parts
      .filter((p) =>
        p.actors.some((a) => key.slice(key.indexOf("/") + 1).startsWith(`${a.actor.machine}/`)),
      )
      .map((p) => p.id),
});

const distinct = (ids: ReadonlyArray<string>) => new Set(ids).size;

const runs = SEEDS.map((seed) => generate(mix, { drawing: "mix", seed }));

// An idle fixture: an app whose samples have no actors, steps or servers, so nothing it owns is
// ever touched.
const idle = samplesOf({
  id: "idle",
  story: Story.app(numberSetup, { id: "idle/samples", fixtures: [] }),
  names: { setup: "numberSetup", fixtures: [] },
  actors: {},
  servers: {},
  failures: [],
  landedFailures: [],
  controls: [],
  values: {},
  steps: (story) => story,
});

const owner = ownerOf(mix);

describe("an app mix: several fixtures in one Runtime (Testing O6)", () => {
  it("one store: a write batch carries records of two fixtures", () => {
    const batches = runs.flatMap((g) => g.run.end.records.batches);

    expect(batches.some((b) => distinct(b.keys.flatMap(owner.key)) >= 2)).toBe(true);
  });

  it("one network: every fixture's servers receive calls in one run", () => {
    const servers = mix.flatMap((p) => p.servers.map((s) => s.server.name));
    const called = runs.map((g) => new Set(g.run.end.calls.map((c) => c.server)));

    expect(called.some((set) => servers.every((s) => set.has(s)))).toBe(true);
  });

  it("one reload: after it, actors of two fixtures start again in the next open", () => {
    const restarted = runs.map((g) =>
      distinct(
        g.run.trace.events.flatMap((e) =>
          e.tab.open > 1 && e.record._tag === "Runtime" && e.record.evidence._tag === "Incarnated"
            ? owner.machine(e.record.evidence.actor.machine)
            : [],
        ),
      ),
    );

    expect(restarted.some((n) => n >= 2)).toBe(true);
  });

  it("each run counts the steps that touched two fixtures, and every mix run has some", () => {
    expect(runs.map((g) => g.shared > 0)).toEqual(SEEDS.map(() => true));
  });

  it("fixed seeds of the mix keep every run rule", () => {
    const failures = propertyTest(mix, { profile: "mix", properties: rules, seeds: SEEDS });

    expect(failures.map((f) => `${f.rule} from seed ${f.seed}:\n${f.breaches.join("\n")}`)).toEqual(
      [],
    );
  }, 60_000);

  it("a mix whose fixtures never share a resource fails Testing O6", () => {
    const [failure] = propertyTest([mix[0] ?? idle, idle], {
      profile: "mix",
      properties: rules,
      seeds: [1],
    });

    expect(failure?.rule).toBe("Testing O6");
    expect(failure?.breaches.join("\n")).toContain("no step touched two fixtures");
  }, 60_000);

  it("a failing mix shrinks by dropping whole fixtures first: a fault in one fixture's edge keeps that fixture alone", () => {
    const [failure] = propertyTest([mix[0] ?? idle, planted, mix[2] ?? idle], {
      profile: "mix",
      properties: rules,
      seeds: Array.from({ length: 20 }, (_, n) => n + 1),
    });

    expect(failure?.rule).toBe("WriteLanes I6");
    expect(failure?.fixtures).toEqual(["pay-planted"]);
    expect(failure?.story.startsWith("Story.app(shopSetup,")).toBe(true);
  }, 120_000);
});
