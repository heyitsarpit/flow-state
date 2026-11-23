import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";

import { numberSetup, quantity } from "../app.ts";
import { Stepper } from "../machines/stepper.ts";
import { defaults } from "../machines/stepping.ts";
import { numberFixtures } from "../server/layer.ts";

const E = Stepper.E;

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
  .send(quantity, E.Configure({ settings: bounded }))
  .send(quantity, E.Set({ value: 5 }))
  .send(quantity, E.Press({ direction: 1, size: "step" }))
  .advance("1 second")
  .checkpoint("held")
  .send(quantity, E.Release())
  .checkpoint("released")
  .send(quantity, E.Wheel({ direction: -1 }))
  .advance("100 millis")
  .send(quantity, E.Wheel({ direction: -1 }))
  .advance("100 millis")
  .send(quantity, E.Wheel({ direction: -1 }))
  .advance("299 millis")
  .checkpoint("wheeling")
  .advance("1 millis")
  .checkpoint("wheeled")
  .send(quantity, E.Typed({ text: "12" }))
  .send(quantity, E.Blur())
  .checkpoint("typed")
  .send(quantity, E.Set({ value: 4 }))
  .send(quantity, E.Typed({ text: "12" }))
  .send(quantity, E.Blur())
  .checkpoint("end");

type NumberStory = ReturnType<typeof numberStory>;

const nextSeed = (seed: number) => (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;

const gestures = [
  (s: NumberStory) => s.send(quantity, E.Press({ direction: 1, size: "step" })),
  (s: NumberStory) => s.send(quantity, E.Press({ direction: -1, size: "large" })),
  (s: NumberStory) => s.send(quantity, E.Press({ direction: 1, size: "small" })),
  (s: NumberStory) => s.send(quantity, E.Release()),
  (s: NumberStory) => s.send(quantity, E.Cancel()),
  (s: NumberStory) => s.send(quantity, E.Wheel({ direction: 1 })),
  (s: NumberStory) => s.send(quantity, E.Wheel({ direction: -1 })),
  (s: NumberStory) => s.send(quantity, E.Typed({ text: "19.5" })),
  (s: NumberStory) => s.send(quantity, E.Typed({ text: "250" })),
  (s: NumberStory) => s.send(quantity, E.Blur()),
  (s: NumberStory) => s.send(quantity, E.Key({ key: "End" })),
  (s: NumberStory) => s.send(quantity, E.Key({ key: "Home" })),
  (s: NumberStory) => s.send(quantity, E.StepBy({ direction: 1, size: "step" })),
  (s: NumberStory) => s.send(quantity, E.Set({ value: 20 })),
] as const;

const burst = (story: NumberStory, seed: number) => {
  const gesture = gestures[seed % gestures.length] ?? gestures[0];
  const gap = (seed >>> 8) % 4 === 0 ? (seed >>> 12) % 500 : (seed >>> 12) % 21;
  const moved = gesture(story).advance(`${gap} millis`);

  return (seed >>> 4) % 33 === 0
    ? moved.reload().send(quantity, E.Configure({ settings: bounded }))
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
      .send(quantity, E.Configure({ settings: bounded })),
    seed: 7,
  })
  .story.checkpoint("end");

const configured = E.Configure({ settings: bounded });
const setFive = E.Set({ value: 5 });
const cleared = E.Set({ value: null });
const stepUp = E.Press({ direction: 1, size: "step" });
const largeDown = E.Press({ direction: -1, size: "large" });
const smallUp = E.Press({ direction: 1, size: "small" });
const released = E.Release();
const cancelled = E.Cancel();
const wheelUp = E.Wheel({ direction: 1 });
const typedFraction = E.Typed({ text: "19.5" });
const typedJunk = E.Typed({ text: "abc" });
const blurred = E.Blur();
const home = E.Key({ key: "Home" });
const end = E.Key({ key: "End" });

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
 * A stress run from seed 36, printed by the generator and pasted here. The reload sweep and the
 * bench run it as any Story.
 */
export const seededStress = numberStory("number-input/stress-36")
  .ensure(quantity)
  .send(quantity, typedJunk)
  .send(quantity, typedJunk)
  .send(quantity, configured)
  .send(quantity, configured)
  .send(quantity, typedFraction)
  .send(quantity, typedJunk)
  .send(quantity, home)
  .send(quantity, typedFraction)
  .reload({ reattach: false })
  .send(quantity, end)
  .send(quantity, largeDown)
  .send(quantity, blurred)
  .send(quantity, smallUp)
  .send(quantity, cancelled)
  .send(quantity, smallUp)
  .send(quantity, wheelUp)
  .send(quantity, typedJunk)
  .send(quantity, blurred)
  .send(quantity, largeDown)
  .world(Fake.network.offline())
  .send(quantity, smallUp)
  .dispose(quantity, { how: "forget" })
  .send(quantity, wheelUp)
  .send(quantity, setFive)
  .advance("20 millis")
  .disposeRuntime()
  .reload()
  .advance("7 millis")
  .send(quantity, cancelled)
  .advance("20 millis")
  .send(quantity, smallUp)
  .advance("3 millis")
  .send(quantity, stepUp)
  .send(quantity, wheelUp)
  .advance("16 millis")
  .send(quantity, cleared)
  .send(quantity, stepUp)
  .send(quantity, largeDown)
  .send(quantity, released)
  .send(quantity, cancelled)
  .send(quantity, configured)
  .send(quantity, configured)
  .send(quantity, setFive)
  .send(quantity, wheelUp)
  .advance("5 millis")
  .send(quantity, setFive)
  .advance("2 millis")
  .send(quantity, end)
  .advance("17 millis")
  .send(quantity, wheelUp)
  .send(quantity, home)
  .send(quantity, typedJunk)
  .advance("18 millis")
  .send(quantity, typedFraction)
  .send(quantity, setFive)
  .send(quantity, cancelled)
  .send(quantity, smallUp)
  .send(quantity, end)
  .send(quantity, released)
  .reload({ reattach: false })
  .advance("4 millis")
  .send(quantity, wheelUp)
  .advance("10 millis")
  .send(quantity, typedJunk)
  .send(quantity, configured)
  .send(quantity, stepUp)
  .send(quantity, end)
  .send(quantity, largeDown)
  .send(quantity, end)
  .send(quantity, typedFraction)
  .send(quantity, largeDown)
  .send(quantity, home)
  .send(quantity, typedFraction)
  .send(quantity, largeDown)
  .send(quantity, blurred)
  .advance("20 millis")
  .send(quantity, cleared)
  .send(quantity, cancelled)
  .send(quantity, typedJunk)
  .send(quantity, released)
  .advance("15 millis")
  .send(quantity, configured)
  .send(quantity, setFive)
  .send(quantity, home)
  .advance("8 millis")
  .send(quantity, blurred)
  .send(quantity, smallUp)
  .advance("7 millis")
  .send(quantity, blurred)
  .send(quantity, home)
  .send(quantity, typedJunk)
  .advance("15 millis")
  .send(quantity, end)
  .advance("15 millis")
  .send(quantity, smallUp)
  .advance("56438 millis")
  .world(Fake.network.online())
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
