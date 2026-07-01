export type SelectionSource<T> = {
  readonly getSnapshot: () => T;
  readonly getServerSnapshot?: () => T;
  readonly subscribe: (listener: () => void) => () => void;
};

export type FlowConcurrencyPolicy =
  | "reject-while-running"
  | "allow"
  | "serialize"
  | "cancel-previous";
