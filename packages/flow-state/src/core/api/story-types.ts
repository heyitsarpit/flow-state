import type { FlowTraceOutcomeKind, FlowTraceOutcomeSource } from "./inspect-types.js";
import type { FlowIssueSummary, FlowSeededResource } from "./data-types.js";
import type { FlowRuntimeBootPayload } from "./runtime-types.js";
import type {
  FlowMachine,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "./machine-types.js";

export type FlowStoryExpectedFacts = Readonly<{
  readonly receiptTypes?: ReadonlyArray<string>;
  readonly relatedIds?: ReadonlyArray<string>;
  readonly issueKinds?: ReadonlyArray<FlowIssueSummary["kind"]>;
  readonly issueSources?: ReadonlyArray<FlowIssueSummary["source"]>;
  readonly outcomeKinds?: ReadonlyArray<FlowTraceOutcomeKind>;
  readonly outcomeSources?: ReadonlyArray<FlowTraceOutcomeSource>;
}>;

export type FlowStorySeed<FixtureName extends string = string> = Readonly<{
  readonly resources?: ReadonlyArray<FlowSeededResource>;
  readonly fixtures?: ReadonlyArray<FixtureName>;
  readonly boot?: FlowRuntimeBootPayload;
  readonly actorId?: string;
}>;

export type FlowStorySetup = Readonly<{
  readonly kind: "setup";
  readonly description: string;
}>;

export type FlowStoryStart<Machine extends FlowMachine = FlowMachine> =
  | Readonly<{
      readonly kind: "snapshot";
      readonly snapshot: FlowSnapshot<
        InferMachineContext<Machine>,
        string,
        InferMachineEvent<Machine>
      >;
    }>
  | FlowStorySetup;

export type FlowStory<
  Machine extends FlowMachine = FlowMachine,
  FixtureName extends string = string,
> = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly seed?: FlowStorySeed<FixtureName>;
  readonly start?: FlowStoryStart<Machine>;
  readonly events: ReadonlyArray<InferMachineEvent<Machine>>;
  readonly expectedState?: InferMachineState<Machine>;
  readonly expectedFacts?: FlowStoryExpectedFacts;
  readonly tags?: ReadonlyArray<string>;
}>;
