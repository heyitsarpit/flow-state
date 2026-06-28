import type { Cause, Effect, Exit, Option } from "effect";

export type SelectionSource<T> = {
  readonly getSnapshot: () => T;
  readonly getServerSnapshot?: () => T;
  readonly subscribe: (listener: () => void) => () => void;
};

export type FlowOperationLane = "success" | "failure" | "defect" | "interrupt";

export type FlowOperationOutcome<A, E> = {
  readonly exit: Exit.Exit<A, E>;
  readonly lane: FlowOperationLane;
  readonly cause: Option.Option<Cause.Cause<E>>;
};

export interface FlowRegistry<Key, Value, MissingError> {
  readonly get: (key: Key) => Effect.Effect<Value, MissingError>;
  readonly getOption: (key: Key) => Effect.Effect<Option.Option<Value>>;
  readonly register: (value: Value) => Effect.Effect<void>;
  readonly remove: (key: Key) => Effect.Effect<void>;
  readonly values: Effect.Effect<ReadonlyArray<Value>>;
}

export type FlowConcurrencyPolicy =
  | "reject-while-running"
  | "allow"
  | "serialize"
  | "cancel-previous";

export type FlowTestControls = {
  readonly flush: () => Promise<void>;
  readonly advance: (duration: string | number) => Promise<void>;
  readonly settle: (bounds: {
    readonly maxTicks: number;
    readonly maxFibers: number;
  }) => Promise<void>;
};
