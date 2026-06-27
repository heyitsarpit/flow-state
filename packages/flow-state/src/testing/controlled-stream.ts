import { Stream } from "effect";

export type ControlledStreamEvent<Value, Error> =
  | Readonly<{ readonly type: "value"; readonly value: Value }>
  | Readonly<{ readonly type: "failure"; readonly error: Error }>
  | Readonly<{ readonly type: "done" }>;

export type ControlledStream<Value, Error> = Readonly<{
  readonly kind: "controlledStream";
  readonly id: string;
  readonly stream: () => Stream.Stream<Value, Error>;
  readonly emit: (value: Value) => void;
  readonly fail: (error: Error) => void;
  readonly end: () => void;
  readonly cancelled: () => boolean;
  readonly events: () => ReadonlyArray<ControlledStreamEvent<Value, Error>>;
}>;

export function createControlledStream<Value, Error = never>(
  id: string,
): ControlledStream<Value, Error> {
  const history: Array<ControlledStreamEvent<Value, Error>> = [];
  let interrupted = false;

  return Object.freeze({
    kind: "controlledStream",
    id,
    stream: () => Stream.empty,
    emit: (value: Value) => {
      history.push({ type: "value", value });
    },
    fail: (error: Error) => {
      history.push({ type: "failure", error });
    },
    end: () => {
      history.push({ type: "done" });
      interrupted = true;
    },
    cancelled: () => interrupted,
    events: () => history,
  });
}
