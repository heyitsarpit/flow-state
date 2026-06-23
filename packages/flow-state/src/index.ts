import { Effect } from "effect";
import { createMachine, initialTransition } from "xstate";

export type FlowStatePrimitive = "atom" | "resource" | "mutation" | "machine";

export interface FlowStatePackageInfo {
  readonly name: "@flow-state/core";
  readonly status: "smoke-tested";
  readonly primitives: readonly FlowStatePrimitive[];
}

export const packageInfo: FlowStatePackageInfo = {
  name: "@flow-state/core",
  status: "smoke-tested",
  primitives: ["atom", "resource", "mutation", "machine"],
};

const smokeMachine = createMachine({
  id: "flow-state-smoke",
  initial: "idle",
  states: {
    idle: {
      on: {
        START: "running",
      },
    },
    running: {},
  },
});

export interface FlowPreview {
  readonly label: string;
  readonly initialState: string;
  readonly primitives: readonly FlowStatePrimitive[];
}

export function createFlowPreview(): FlowPreview {
  const label = Effect.runSync(Effect.succeed("Effect + XState ready"));
  const [snapshot] = initialTransition(smokeMachine);
  const initialState =
    typeof snapshot.value === "string" ? snapshot.value : JSON.stringify(snapshot.value);

  return {
    label,
    initialState,
    primitives: packageInfo.primitives,
  };
}
