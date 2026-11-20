import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { StepperMachine } from "./machines/stepper.ts";

/**
 * The number input app: one field machine, nothing persisted, no services.
 */
export const numberApp = app({ id: "number-input", machines: { stepper: StepperMachine } });

/**
 * The number input's setup: no store and no services, so a reload starts every field fresh.
 */
export const numberSetup = runtimeSetup({ app: numberApp });

/**
 * The field most stories use.
 */
export const quantity = actorRef(StepperMachine, "quantity");
