import { Effect, Option, Predicate } from "effect";
import type { Actor } from "../../src/index.ts";
import { attachInspector, type Evidence } from "../../src/host/inspect.ts";
import { bench } from "../declare.ts";
import { storyNamed } from "./story.ts";

/**
 * Each fixture's long Story, every saved stress Story, and the Stories that save and restore large
 * values: the regression watch for ordinary apps, per turn.
 */
export const TURN_STORIES = [
  "cells/long",
  "shop/long",
  "session/long",
  "sign-in/long",
  "sync/long",
  "transfers/long",
  "cells/stress-56",
  "palette/stress-36",
  "lanes/stress-36",
  "number-input/stress-36",
  "shop/stress-36",
  "player/stress-36",
  "session/stress-36",
  "sign-in/stress-36",
  "sync/stress-36",
  "transfers/stress-45",
  "session/stress-agenda-long",
  "session/archive-large",
] as const;

// Runs over 100 ms each take fewer samples, so a worker stays within seconds.
const SLOW = new Set(["palette/stress-36"]);

const storyBenches = TURN_STORIES.map((id) =>
  bench({
    id: `turn.${id.replace("/", ".")}.per-turn-ms`,
    concern: "turn",
    tags: ["story", id.split("/")[0] ?? id, id.includes("stress") ? "stress" : "long"],
    size: { n: 1, unit: "run" },
    runs: SLOW.has(id) ? 20 : 200,
    load: () => storyNamed(id),
  }),
);

// How many steps one operation sends to the field.
const SENDS = 1000;

type Watch = "detached" | "attached" | "buffered";

// The bounded buffer an inspector keeps: the last records, the oldest dropped.
const BUFFER = 1000;

// The field's value as its last snapshot publishes it.
const valueOf = (field: Actor) =>
  Option.match(field.getSnapshot(), {
    onNone: () => Number.NaN,
    onSome: ({ memory }) => (Predicate.isNumber(memory["value"]) ? memory["value"] : Number.NaN),
  });

// A Runtime of the number input, one unbounded field, stepped up `SENDS` times: the turn with no
// Story, store or server around it, timed with no inspector, a no-op one, and a bounded buffer.
// Each step moves the value by one, so the value read before and after an operation counts the
// steps it served, with or without an inspector.
const fieldSubject = async (watch: Watch) => {
  const { numberSetup, quantity } = await import("../../fixtures/number-input/app.ts");
  const runtime = numberSetup.construct();
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the bench is a host boundary: it boots a Runtime synchronously to time its sends
  Effect.runSync(runtime.ready());
  const field = runtime.ensureActor(quantity);
  const kept = { next: 0, turns: 0 };
  const ring: Array<Evidence> = [];

  const sink = (evidence: Evidence) => {
    if (evidence._tag === "Turn") kept.turns += 1;

    if (watch !== "buffered") return;
    ring[kept.next] = evidence;
    kept.next = (kept.next + 1) % BUFFER;
  };

  if (watch !== "detached") attachInspector(runtime, sink);

  field.send({ _tag: "Set", value: 0 });

  const op = async () => {
    const before = valueOf(field);
    const start = performance.now();

    for (let n = 0; n < SENDS; n += 1) field.send({ _tag: "StepBy", direction: 1, size: "step" });

    const ms = performance.now() - start;

    return {
      units: SENDS,
      counters: { stepped: valueOf(field) - before },
      sample: Option.some(ms),
    };
  };

  return {
    op,
    proof: async () => {
      const { counters } = await op();

      return counters.stepped === SENDS
        ? Option.none()
        : Option.some(`${SENDS} steps moved the value by ${counters.stepped}`);
    },
    shape: { sends: SENDS, actors: 1 },
  };
};

const fieldBenches = (["detached", "attached", "buffered"] as const).map((watch) =>
  bench({
    id: `turn.number-input.field-${watch}.per-send-ms`,
    concern: "turn",
    tags: ["runtime", "inspector", watch],
    size: { n: SENDS, unit: "sends" },
    load: () => fieldSubject(watch),
  }),
);

/**
 * Every `turn` bench.
 */
export const turnBenches = [...storyBenches, ...fieldBenches];
