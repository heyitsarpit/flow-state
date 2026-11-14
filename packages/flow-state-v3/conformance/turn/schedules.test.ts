import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { parts } from "../../fixtures/index.ts";
import { Address } from "../dsl/facts.ts";
import { empty } from "../dsl/lifecycle-model.ts";
import { Fact } from "../dsl/oracle.ts";
import { partFixture } from "../parts/reference.ts";
import { Observation } from "../port.ts";
import { schedules } from "./schedules.ts";

describe("the schedules oracle", () => {
  it("a firing before its arming's delay breaks Turn I21 and names its actor (step-2f O6)", () => {
    const pay = parts.find((p) => p.name === "pay");
    assert.ok(pay !== undefined);

    const actor = { machine: pay.machine.compiled.id, id: "shopper-1" };
    const machines = { [actor.machine]: partFixture(pay).handlers };

    const drove = (event: string) => Fact.Drove({ actor, event, to: Address.Root(), labels: {} });

    const turn = (event: string, from: string, to: string, at: string) =>
      Fact.Reported({
        observation: Observation.Turn({
          actor,
          event,
          from,
          to,
          parts: [{ part: [], definition: actor.machine, at, node: "root", target: to }],
          members: [],
        }),
      });

    const steps = [
      [
        Fact.Ensured({ actor, use: "story" }),
        drove("Start"),
        turn("Start", "IDLE", "CARD", "states.IDLE.on.Start[0]"),
      ],
      [drove("PayRequested"), turn("PayRequested", "CARD", "PAYING", "on.PayRequested[1]")],
      [
        Fact.Advanced({ ms: 1000 }),
        turn("CheckTick", "PAYING", "PAYING", "states.PAYING.on.CheckTick[0]"),
      ],
    ];

    const life = { before: empty, after: empty, applied: [] };
    const next = schedules.open({}, [], machines, {});

    const found = steps
      .flatMap((step) => next(step, [], life))
      .filter((v) => v.invariant === "Turn I21")
      .map((v) => Option.getOrElse(v.subject, () => "no subject"));

    assert.deepEqual(found, [`${actor.machine} ${actor.id}`]);
  });
});
