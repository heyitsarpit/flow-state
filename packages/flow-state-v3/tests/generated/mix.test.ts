import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import { numberSetup } from "../../fixtures/number-input/machine.ts";
import {
  type Generated,
  generate,
  propertyTest,
  type Step,
  type Samples,
  samplesOf,
  Story,
} from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";
import { mix, stressMix } from "./fixtures.ts";
import { planted } from "./planted.ts";

const SEEDS = [1, 2, 3, 4, 5];

// The fixture a store key, a server's name or an actor's machine belongs to.
const ownerOf = (parts: ReadonlyArray<Samples>) => ({
  server: (name: string) =>
    parts.filter((p) => p.servers.some((s) => s.server.name === name)).map((p) => p.id),
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

// The mix's samples set of one fixture, by its samples id; a missing one fails the file.
const part = (id: string) => {
  const found = mix.find((p) => p.id === id);
  assert.ok(found !== undefined, `the mix has no ${id}`);

  return found;
};

// The fixtures one trace record names: a call's server, a batch's keys, or evidence's actor.
const ownersOf = (record: Generated["run"]["trace"]["events"][number]["record"]) => {
  switch (record._tag) {
    case "Request":
      return owner.server(record.server);
    case "Write":
      return record.keys.flatMap(owner.key);
    case "Runtime":
      return "actor" in record.evidence ? owner.machine(record.evidence.actor.machine) : [];
    case "Step":
      return [];
  }
};

// The fixtures each step of a run touched, by the step's kind: its evidence, calls and batches.
const touchedBy = (g: Generated) => {
  const touched: Array<{ readonly kind: Step["_tag"]; readonly owners: Set<string> }> = [];

  for (const { record } of g.run.trace.events) {
    if (record._tag === "Step") touched.push({ kind: record.step._tag, owners: new Set() });

    for (const id of ownersOf(record)) touched.at(-1)?.owners.add(id);
  }

  return touched;
};

// Each disposal of the Runtime: how many fixtures had started an actor in that open before it,
// and how many turns any actor took in that open after it.
const disposalsOf = (g: Generated) => {
  const events = g.run.trace.events;

  return events.flatMap((e, n) => {
    if (e.record._tag !== "Step" || e.record.step._tag !== "disposeRuntime") return [];
    const open = events.filter((x) => x.tab.open === e.tab.open);
    const at = open.indexOf(e);

    const started = open
      .slice(0, at)
      .flatMap((x) =>
        x.record._tag === "Runtime" && x.record.evidence._tag === "Incarnated"
          ? owner.machine(x.record.evidence.actor.machine)
          : [],
      );

    const turns = open
      .slice(at + 1)
      .filter((x) => x.record._tag === "Runtime" && x.record.evidence._tag === "Turn");

    return [{ step: n, live: distinct(started), turnsAfter: turns.length }];
  });
};

const sharedKinds = new Set(
  runs.flatMap((g) => touchedBy(g).flatMap((t) => (t.owners.size >= 2 ? [t.kind] : []))),
);

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

  it("one clock: an advance step moves the work of two fixtures", () => {
    expect(sharedKinds.has("advance")).toBe(true);
  });

  it("one disposal: disposing the Runtime, with two fixtures live, stops both until the reload", () => {
    const disposals = runs.flatMap(disposalsOf);

    expect(disposals.some((d) => d.live >= 2)).toBe(true);
    expect(disposals.filter((d) => d.turnsAfter > 0)).toEqual([]);
  });

  it("each fixture of the mix alone, under the mix profile, keeps every run rule", () => {
    const failures = mix.flatMap((part) =>
      propertyTest(part, { profile: "mix", properties: rules, seeds: SEEDS }),
    );

    expect(failures.map((f) => `${f.fixtures.join("+")} ${f.rule} from seed ${f.seed}`)).toEqual(
      [],
    );
  }, 60_000);

  it("each run counts the steps that touched two fixtures, and every mix run has some", () => {
    expect(runs.map((g) => g.shared > 0)).toEqual(SEEDS.map(() => true));
  });

  it("fixed seeds of the mix keep every run rule", () => {
    const failures = propertyTest(mix, { profile: "mix", properties: rules, seeds: SEEDS });

    expect(failures.map((f) => `${f.rule} from seed ${f.seed}:\n${f.breaches.join("\n")}`)).toEqual(
      [],
    );
  }, 60_000);

  it("a mix whose fixtures never share a resource is inconclusive (Testing O6)", () => {
    const [failure] = propertyTest([part("transfers"), idle], {
      profile: "mix",
      properties: rules,
      seeds: [1],
    });

    expect(failure?.rule).toBe("inconclusive");
    expect(failure?.breaches.join("\n")).toContain("no step touched two fixtures");
  }, 60_000);

  it("a failing mix shrinks by dropping whole fixtures first: a fault in one fixture's edge keeps that fixture alone", () => {
    const [failure] = propertyTest([part("transfers"), planted, part("lanes")], {
      profile: "mix",
      properties: rules,
      seeds: Array.from({ length: 20 }, (_, n) => n + 1),
    });

    expect(failure?.rule).toBe("WriteLanes I6");
    expect(failure?.fixtures).toEqual(["pay-planted"]);
    expect(failure?.story.startsWith("Story.app(shopSetup,")).toBe(true);
  }, 120_000);

  it("a fault in one fixture's edge, among all four of the mix, shrinks to that fixture within the shrink bound", () => {
    const parts = [part("transfers"), part("lanes"), planted, part("palette")];

    const [failure] = propertyTest(parts, {
      profile: "mix",
      properties: rules,
      seeds: Array.from({ length: 20 }, (_, n) => n + 1),
    });

    expect(failure?.rule).toBe("WriteLanes I6");
    expect(failure?.fixtures).toEqual(["pay-planted"]);
    expect((failure?.shrinks ?? Number.POSITIVE_INFINITY) <= 1000).toBe(true);
  }, 120_000);
});

describe("a mix after a reload that attaches nothing (Testing O6)", () => {
  // Stress seed 18 reloads with no actor attached under a held store, then sends to closed screens.
  it("Testing O6: a person opens a screen before acting on it, so the stress mix from seed 18 touches two fixtures in one step", () => {
    expect(generate(stressMix, { drawing: "mix", seed: 18 }).shared).toBeGreaterThan(0);
  }, 60_000);
});
