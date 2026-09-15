import type { App } from "../app/app.js";
import { runtimeSetupForAdmissionTestInternal, type RuntimeAdmissionProbe } from "./runtime.js";

export const runtimeSetupForAdmissionTest = <A extends App>(options: {
  app: A;
  admissionProbe: RuntimeAdmissionProbe;
}) => {
  return runtimeSetupForAdmissionTestInternal(options.app, {
    admissionProbe: options.admissionProbe,
  });
};

export type { RuntimeAdmissionPhase, RuntimeAdmissionProbe } from "./runtime.js";
