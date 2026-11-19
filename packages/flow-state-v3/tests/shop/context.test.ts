import { describe, expect, it } from "vite-plus/test";
import { mainCart, mainPulse } from "../../fixtures/shop/app.ts";
import { CartPulse, CartPulseMachine } from "../../fixtures/shop/machines/cart-pulse.ts";
import {
  pulseAdds,
  pulseReloaded,
  pulseReloadMidAdd,
} from "../../fixtures/shop/stories/context.ts";
import { BURST, LARGE, largePulse, pulseBurst } from "../../fixtures/shop/stories/load.ts";
import { mixedProviderPulse, unhandledPulse } from "../../fixtures/shop/stories/structure.ts";
import { dataView } from "../../src/host/inspect.ts";
import { turnsOf } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";
import { played } from "../rules/played.ts";
import { refusal } from "../refusals.ts";

const line = (variantId: string, quantity: number) => ({ variantId, quantity });

describe("the mini-cart reads its cart through context slots (Actors R18, Turn R22)", () => {
  it.fails("Turn R22, Compile R4: a pass-through and a derived slot; a larger count pulses, every change is shown once, an equal one is silent", async () => {
    const run = await played(pulseAdds);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(mainPulse);

    expect(at("empty")).toEqual(
      expect.objectContaining({ state: "QUIET", context: { lines: {}, count: 0 } }),
    );
    expect(at("added")).toEqual(
      expect.objectContaining({
        state: "PULSING",
        context: { lines: { l1: line("v1", 1) }, count: 1 },
        memory: { pulses: 1, shown: 1 },
      }),
    );
    // The count follows the edit before the cart service answers: wanted 5 over the answered 1.
    expect(at("asked")).toEqual(
      expect.objectContaining({
        state: "PULSING",
        context: { lines: { l1: line("v1", 1) }, count: 5 },
        memory: { pulses: 2, shown: 5 },
      }),
    );
    // The answer moves the lines and clears the wish: the count stays 5, so no reaction runs.
    expect(at("answered")).toEqual(
      expect.objectContaining({
        context: { lines: { l1: line("v1", 5) }, count: 5 },
        memory: { pulses: 2, shown: 5 },
      }),
    );
    // A smaller count: `when` declines the pulse, the payload reaction shows it, and 2 becomes the
    // baseline, so the raise to 3 pulses.
    expect(at("lowered")?.memory).toEqual({ pulses: 2, shown: 2 });
    expect(at("raised")?.memory).toEqual({ pulses: 3, shown: 3 });
    expect(at("refused")?.memory).toEqual({ pulses: 3, shown: 3 });
    expect(run.checkpoints.refused.read(mainCart)?.memory.errors).toEqual({ l2: "sold out" });
    // One Counted per changed count (1, 5, 2, 3) and one Grew per larger one (1, 5, 3).
    expect(turnsOf(run, CartPulse.E.Counted)).toHaveLength(4);
    expect(turnsOf(run, CartPulse.E.Grew)).toHaveLength(3);
  });

  it.fails("Turn R22, L5: edits faster than the cart service answers pulse once per larger count; the late answers change nothing shown", async () => {
    const run = await played(pulseBurst);
    const expected = { pulses: BURST + 1, shown: BURST + 1 };

    expect(run.checkpoints.burst.read(mainPulse)?.memory).toEqual(expected);
    expect(run.checkpoints.answered.read(mainPulse)).toEqual(
      expect.objectContaining({
        context: expect.objectContaining({ count: BURST + 1 }),
        memory: expected,
      }),
    );
  });

  it.fails("Turn R22, Actors R18, S1 + S9: a reload at the deepest node reads the count again silently; the next raise pulses once", async () => {
    const run = await played(pulseReloaded);

    expect(run.checkpoints.reloaded.read(mainPulse)).toEqual(
      expect.objectContaining({
        state: "QUIET",
        context: expect.objectContaining({ count: 3 }),
        memory: { pulses: 0, shown: 0 },
      }),
    );
    expect(run.checkpoints.raised.read(mainPulse)?.memory).toEqual({ pulses: 1, shown: 4 });
  });

  it("Actors R18, Turn R22, E8: after a reload mid-add the mini-cart shows the count only if it heard it change, and pulses at most once", async () => {
    const run = await played(pulseReloadMidAdd);
    const pulse = run.checkpoints.settled.read(mainPulse);

    // The server applied the line, so the count is 1; the mini-cart heard the change (a pulse and
    // shown 1) only if the add settled after its admission, else it read 1 silently.
    expect(pulse?.context["count"]).toBe(1);
    expect([0, 1]).toContain(pulse?.memory.shown);
    expect(pulse?.memory.pulses).toBe(pulse?.memory.shown);
    expect(turnsOf(run, CartPulse.E.Counted).length).toBe(pulse?.memory.shown);
  });

  it.fails("Actors R18, E3: a cart of a thousand lines is read whole and counted", async () => {
    const run = checked(await largePulse().run());
    const pulse = run.checkpoints.full.read(mainPulse);

    expect(Object.keys(pulse?.context["lines"] ?? {})).toHaveLength(LARGE);
    expect(pulse?.memory).toEqual({ pulses: LARGE, shown: LARGE });
  });
});

describe("construction refuses a slot of two providers and a reaction nothing handles (Compile R19, I18)", () => {
  it.fails("Compile R19, I18, T13: a derived slot whose reads name two providers is InvalidConfiguration at the second read", () => {
    expect(refusal(mixedProviderPulse)).toEqual([
      ["InvalidConfiguration", "context.count.reads.name"],
    ]);
  });

  it.fails("Compile R19, I18: a reaction whose event no state handles is refused at its event", () => {
    expect(refusal(unhandledPulse)).toEqual([["InvalidConfiguration", "onContext.0.event"]]);
  });
});

describe("Compiled holds the field-level edges (Compile R19, I18)", () => {
  // The view's key names are the build's choice; these assert that each slot lists its provider
  // and its reads by name, and each reaction its slot.
  it.fails("Compile R19, I18: each slot lists its provider and the fields it reads; each reaction names its slot", () => {
    const view = dataView(CartPulseMachine.compiled);

    expect(view).toEqual(
      expect.objectContaining({
        context: [
          [
            "lines",
            expect.objectContaining({
              provider: "Shop/Cart",
              reads: [{ name: "lines", kind: "memory", field: "lines" }],
            }),
          ],
          [
            "count",
            expect.objectContaining({
              provider: "Shop/Cart",
              reads: [
                { name: "lines", kind: "memory", field: "lines" },
                { name: "wanted", kind: "memory", field: "wanted" },
              ],
            }),
          ],
        ],
        reactions: [
          expect.objectContaining({ slot: "count" }),
          expect.objectContaining({ slot: "count" }),
        ],
      }),
    );
  });
});
