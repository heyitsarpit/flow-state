import { Story } from "../../src/host/testing/index.ts";
import { defaults } from "./contracts.ts";
import { numberSetup, quantity } from "./machine.ts";
import { numberFixtures } from "./server.ts";

/**
 * The number input app with no steps yet: every number input Story starts here.
 */
export const numberStory = (id: string) => Story.app(numberSetup, { id, fixtures: numberFixtures });

/**
 * The props the usual and stress Stories configure: 0 to 20 in whole steps, with the wheel on.
 */
export const bounded = { ...defaults, min: 0, max: 20, step: 1, wheel: true };

/**
 * A quantity field set to 5: a held + for one second (a step at once, one at 400 ms, then ten
 * more every 60 ms), released into one commit; three wheel turns 100 ms apart, committed 300 ms
 * after the last; "12" typed and committed on leaving; then a value set from outside and "12"
 * typed again, which commits again.
 */
export const usual = numberStory("number-input/usual")
  .ensure(quantity)
  .send(quantity, { _tag: "Configure", settings: bounded })
  .send(quantity, { _tag: "Set", value: 5 })
  .send(quantity, { _tag: "Press", direction: 1, size: "step" })
  .advance("1 second")
  .checkpoint("held")
  .send(quantity, { _tag: "Release" })
  .checkpoint("released")
  .send(quantity, { _tag: "Wheel", direction: -1 })
  .advance("100 millis")
  .send(quantity, { _tag: "Wheel", direction: -1 })
  .advance("100 millis")
  .send(quantity, { _tag: "Wheel", direction: -1 })
  .advance("299 millis")
  .checkpoint("wheeling")
  .advance("1 millis")
  .checkpoint("wheeled")
  .send(quantity, { _tag: "Typed", text: "12" })
  .send(quantity, { _tag: "Blur" })
  .checkpoint("typed")
  .send(quantity, { _tag: "Set", value: 4 })
  .send(quantity, { _tag: "Typed", text: "12" })
  .send(quantity, { _tag: "Blur" })
  .checkpoint("end");

type NumberStory = ReturnType<typeof numberStory>;

const nextSeed = (seed: number) => (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;

const gestures = [
  (s: NumberStory) => s.send(quantity, { _tag: "Press", direction: 1, size: "step" }),
  (s: NumberStory) => s.send(quantity, { _tag: "Press", direction: -1, size: "large" }),
  (s: NumberStory) => s.send(quantity, { _tag: "Press", direction: 1, size: "small" }),
  (s: NumberStory) => s.send(quantity, { _tag: "Release" }),
  (s: NumberStory) => s.send(quantity, { _tag: "Cancel" }),
  (s: NumberStory) => s.send(quantity, { _tag: "Wheel", direction: 1 }),
  (s: NumberStory) => s.send(quantity, { _tag: "Wheel", direction: -1 }),
  (s: NumberStory) => s.send(quantity, { _tag: "Typed", text: "19.5" }),
  (s: NumberStory) => s.send(quantity, { _tag: "Typed", text: "250" }),
  (s: NumberStory) => s.send(quantity, { _tag: "Blur" }),
  (s: NumberStory) => s.send(quantity, { _tag: "Key", key: "End" }),
  (s: NumberStory) => s.send(quantity, { _tag: "Key", key: "Home" }),
  (s: NumberStory) => s.send(quantity, { _tag: "StepBy", direction: 1, size: "step" }),
  (s: NumberStory) => s.send(quantity, { _tag: "Set", value: 20 }),
] as const;

const burst = (story: NumberStory, seed: number) => {
  const gesture = gestures[seed % gestures.length] ?? gestures[0];
  const gap = (seed >>> 8) % 4 === 0 ? (seed >>> 12) % 500 : (seed >>> 12) % 21;
  const moved = gesture(story).advance(`${gap} millis`);

  return (seed >>> 4) % 33 === 0
    ? moved.reload().send(quantity, { _tag: "Configure", settings: bounded })
    : moved;
};

/**
 * A hundred and fifty gestures near both bounds at gaps of 0 to 20 ms, a quarter of them followed by up
 * to half a second so the hold, repeat and wheel timers fire mid-burst, with a reload about every
 * thirty gestures (each reload starts the field fresh, so the props are sent again).
 */
export const stress = Array.from({ length: 150 }, (_, n) => n)
  .reduce(({ story, seed }) => ({ story: burst(story, seed), seed: nextSeed(seed) }), {
    story: numberStory("number-input/stress")
      .ensure(quantity)
      .send(quantity, { _tag: "Configure", settings: bounded }),
    seed: 7,
  })
  .story.checkpoint("end");

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, stress };
