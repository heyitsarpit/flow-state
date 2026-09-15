import type { App } from "../app/app.js";
import {
  runtimeSetupForAdmissionTestInternal,
  type RuntimeAdmissionProbe,
  type RuntimeSetup,
} from "./runtime.js";

export const runtimeSetupForAdmissionTest = <A extends App>(options: {
  readonly app: A;
  readonly admissionProbe: RuntimeAdmissionProbe;
}): RuntimeSetup<A> => {
  return runtimeSetupForAdmissionTestInternal(options.app, {
    admissionProbe: options.admissionProbe,
  });
};

export type { RuntimeAdmissionPhase, RuntimeAdmissionProbe } from "./runtime.js";
