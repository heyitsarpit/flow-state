import type { FlowEvent, FlowReceipt } from "./data-types.js";
import type { FlowMachine, FlowSnapshot } from "./machine-types.js";

export type FlowTransitionCandidateGuardResult = "pass" | "fail" | "not-applicable" | "skipped";

export type FlowAppliedMicrostepGuardResult = Extract<
  FlowTransitionCandidateGuardResult,
  "pass" | "not-applicable"
>;

export type FlowTransitionActionCounts = Readonly<{
  readonly exit: number;
  readonly transition: number;
  readonly entry: number;
}>;

export type FlowTransitionCandidate<State extends string = string> = Readonly<{
  readonly index: number;
  readonly target: State;
  readonly reenter: boolean;
  readonly guard: FlowTransitionCandidateGuardResult;
  readonly hasUpdate: boolean;
  readonly actionCounts: FlowTransitionActionCounts;
}>;

export type FlowTransitionInspection<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Machine extends FlowMachine<Context, Event, State> = FlowMachine<Context, Event, State>,
> = Readonly<{
  readonly kind: "transition-inspection";
  readonly machine: Machine;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly matched: boolean;
  readonly candidates: ReadonlyArray<FlowTransitionCandidate<State>>;
  readonly chosen?: FlowTransitionCandidate<State>;
  readonly target?: State;
  readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowMicrostepTrigger = "event" | "always" | "after";

export type FlowMicrostepInspectionStep<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly step: number;
  readonly trigger: FlowMicrostepTrigger;
  readonly event: Event;
  readonly from: State;
  readonly to: State;
  readonly index: number;
  readonly reenter: boolean;
  readonly guard: FlowAppliedMicrostepGuardResult;
  readonly hasUpdate: boolean;
  readonly actionCounts: FlowTransitionActionCounts;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowMicrostepInspectionLimitReached = Readonly<{
  readonly step: number;
  readonly limit: number;
}>;

export type FlowMicrostepInspection<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Machine extends FlowMachine<Context, Event, State> = FlowMachine<Context, Event, State>,
> = Readonly<{
  readonly kind: "microstep-inspection";
  readonly machine: Machine;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly matched: boolean;
  readonly steps: ReadonlyArray<FlowMicrostepInspectionStep<Context, Event, State>>;
  readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
  readonly limitReached?: FlowMicrostepInspectionLimitReached;
}>;

export type FlowActionInspectionPhase = "exit" | "transition" | "entry";

export type FlowUpdateInspectionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly kind: "update";
  readonly step: number;
  readonly trigger: FlowMicrostepTrigger;
  readonly event: Event;
  readonly from: State;
  readonly to: State;
  readonly transitionIndex: number;
  readonly index: number;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly receipt: FlowReceipt;
}>;

export type FlowActionInspectionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = Readonly<{
  readonly kind: "action";
  readonly step: number;
  readonly trigger: FlowMicrostepTrigger;
  readonly event: Event;
  readonly from: State;
  readonly to: State;
  readonly transitionIndex: number;
  readonly phase: FlowActionInspectionPhase;
  readonly index: number;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly receipt: FlowReceipt;
  readonly emitted: ReadonlyArray<FlowReceipt>;
}>;

export type FlowActionFact<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> =
  | FlowUpdateInspectionFact<Context, Event, State>
  | FlowActionInspectionFact<Context, Event, State>;

export type FlowActionInspection<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Machine extends FlowMachine<Context, Event, State> = FlowMachine<Context, Event, State>,
> = Readonly<{
  readonly kind: "action-inspection";
  readonly machine: Machine;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly matched: boolean;
  readonly facts: ReadonlyArray<FlowActionFact<Context, Event, State>>;
  readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowNoTransitionReason =
  | "unknown"
  | "ignored-in-state"
  | "blocked-by-guard"
  | "stopped-by-microstep-limit";

export type FlowNoTransitionExplanation<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Machine extends FlowMachine<Context, Event, State> = FlowMachine<Context, Event, State>,
> = Readonly<{
  readonly kind: "no-transition-explanation";
  readonly machine: Machine;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly reason: FlowNoTransitionReason;
  readonly state: State;
  readonly availableInStates: ReadonlyArray<State>;
  readonly guardFailures: ReadonlyArray<number>;
  readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
  readonly limitReached?: FlowMicrostepInspectionLimitReached;
}>;
