import type { StepperMemory } from "../../fixtures/number-input/machines/stepper.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";

/**
 * A stepper memory record as the Runtime shows it.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a snapshot's or evidence record's memory is erased to Values.
export const fieldOf = (memory: unknown) =>
  // SAFETY: the stepper's memory is the Field record its definition declares.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a snapshot's memory is erased to Values
  memory as StepperMemory;

/**
 * Every memory the stepper published in a run, in order.
 */
export const published = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Published" ? [fieldOf(e.memory)] : []));
