import { samplesOf, Story } from "../../src/host/testing/index.ts";
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

const configured = { _tag: "Configure", settings: bounded } as const;
const setFive = { _tag: "Set", value: 5 } as const;
const cleared = { _tag: "Set", value: null } as const;
const stepUp = { _tag: "Press", direction: 1, size: "step" } as const;
const largeDown = { _tag: "Press", direction: -1, size: "large" } as const;
const smallUp = { _tag: "Press", direction: 1, size: "small" } as const;
const released = { _tag: "Release" } as const;
const cancelled = { _tag: "Cancel" } as const;
const wheelUp = { _tag: "Wheel", direction: 1 } as const;
const typedFraction = { _tag: "Typed", text: "19.5" } as const;
const typedJunk = { _tag: "Typed", text: "abc" } as const;
const blurred = { _tag: "Blur" } as const;
const home = { _tag: "Key", key: "Home" } as const;
const end = { _tag: "Key", key: "End" } as const;

const sampleEvents = {
  configured,
  setFive,
  cleared,
  stepUp,
  largeDown,
  smallUp,
  released,
  cancelled,
  wheelUp,
  typedFraction,
  typedJunk,
  blurred,
  home,
  end,
};

/**
 * A stress run from seed 50, printed by the generator and pasted here. The reload sweep and the
 * bench run it as any Story.
 */
export const seededStress = Story.app(numberSetup, { id: "number-input/stress-50", fixtures: [] })
  .ensure(quantity)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .send(quantity, home)
  .advance("4 millis")
  .dispose(quantity)
  .send(quantity, cancelled)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, largeDown)
  .advance("16 millis")
  .disposeRuntime()
  .reload()
  .advance("15 millis")
  .send(quantity, wheelUp)
  .ensure(quantity)
  .send(quantity, configured)
  .send(quantity, wheelUp)
  .advance("1 millis")
  .send(quantity, typedJunk)
  .advance("19 millis")
  .send(quantity, typedJunk)
  .send(quantity, largeDown)
  .advance("18 millis")
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .send(quantity, cleared)
  .advance("13 millis")
  .send(quantity, stepUp)
  .advance("8 millis")
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, end)
  .send(quantity, cancelled)
  .send(quantity, typedJunk)
  .advance("6 millis")
  .advance("7 millis")
  .advance("7 millis")
  .send(quantity, home)
  .advance("12 millis")
  .send(quantity, end)
  .send(quantity, configured)
  .advance("16 millis")
  .advance("16 millis")
  .send(quantity, typedFraction)
  .send(quantity, released)
  .send(quantity, blurred)
  .advance("1 millis")
  .reload()
  .advance("1 millis")
  .send(quantity, largeDown)
  .detach(quantity)
  .advance("15 millis")
  .send(quantity, setFive)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .advance("2 millis")
  .send(quantity, typedFraction)
  .send(quantity, blurred)
  .advance("4 millis")
  .send(quantity, end)
  .send(quantity, largeDown)
  .advance("4 millis")
  .send(quantity, typedFraction)
  .send(quantity, end)
  .send(quantity, home)
  .send(quantity, configured)
  .send(quantity, home)
  .advance("4 millis")
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, largeDown)
  .send(quantity, cancelled)
  .send(quantity, blurred)
  .advance("7 millis")
  .send(quantity, cleared)
  .advance("6 millis")
  .advance("10 millis")
  .send(quantity, wheelUp)
  .send(quantity, setFive)
  .send(quantity, typedJunk)
  .advance("9 millis")
  .dispose(quantity, { how: "forget" })
  .send(quantity, largeDown)
  .send(quantity, released)
  .send(quantity, typedFraction)
  .send(quantity, configured)
  .advance("20 millis")
  .send(quantity, released)
  .send(quantity, home)
  .send(quantity, cancelled)
  .advance("13 millis")
  .send(quantity, wheelUp)
  .advance("7 millis")
  .send(quantity, typedFraction)
  .send(quantity, typedFraction)
  .send(quantity, typedFraction)
  .send(quantity, typedFraction)
  .send(quantity, largeDown)
  .send(quantity, typedJunk)
  .send(quantity, wheelUp)
  .send(quantity, typedJunk)
  .send(quantity, smallUp)
  .advance("16 millis")
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * What a person can do to the field, for generated runs: configure it, set and type values, press
 * and release the steppers, cancel, wheel, blur and jump to an end. It has no server.
 */
export const samples = samplesOf({
  id: "number-input",
  story: numberStory("number-input/samples"),
  names: { setup: "numberSetup", fixtures: [] },
  actors: { quantity },
  servers: {},
  failures: [],
  landedFailures: [],
  values: sampleEvents,
  controls: [],
  steps: (story) =>
    Object.values(sampleEvents).reduce((s, event) => s.send(quantity, event), story),
});

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, stress, seededStress };
