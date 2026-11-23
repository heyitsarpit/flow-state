import { Equal } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import { type Samples, Step } from "../../src/host/testing/index.ts";

const everySamples = [
  ...new Map(
    manifests.flatMap((m) => [...m.samples, ...m.stressSamples]).map((s) => [s.id, s]),
  ).values(),
];

// The named values no step sends: a step sending an equal event is one the generator draws.
const unsent = (samples: Samples) => {
  const sent = samples.steps.flatMap((step) => (Step.$is("send")(step) ? [step.event] : []));

  return samples.values
    .filter((v) => !sent.some((event) => Equal.equals(event, v.value)))
    .map((v) => v.name);
};

// Samples whose steps do not yet send their declared values, each a known gap with its owner.
const KNOWN_GAPS = new Set(["bank-planned"]);

describe("generated runs offer every edge value a fixture declares (fixtures.md, edge values)", () => {
  for (const samples of everySamples.filter((s) => !KNOWN_GAPS.has(s.id)))
    it(`${samples.id}: each named value is sent by one of its steps, so the generator draws it`, () => {
      expect(unsent(samples)).toEqual([]);
    });

  for (const samples of everySamples.filter((s) => KNOWN_GAPS.has(s.id)))
    it.fails(`fixtures.md edge values: ${samples.id}'s steps send each named value`, () => {
      expect(unsent(samples)).toEqual([]);
    });
});
