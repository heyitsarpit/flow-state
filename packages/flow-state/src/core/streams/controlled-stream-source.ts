import type { Stream } from "effect";

const ControlledStreamSourceTypeId = Symbol.for("flow-state/ControlledStreamSource");

export type ControlledStreamListener<Value, Error> = Readonly<{
  readonly onValue: (value: Value) => void;
  readonly onFailure: (error: Error) => void;
  readonly onDone: () => void;
}>;

export type ControlledStreamSource<Value, Error> = Readonly<{
  readonly subscribe: (listener: ControlledStreamListener<Value, Error>) => () => void;
}>;

type ControlledStreamCarrier<Value, Error, Requirements = never> = Stream.Stream<
  Value,
  Error,
  Requirements
> & {
  readonly [ControlledStreamSourceTypeId]?: ControlledStreamSource<Value, Error>;
};

export function controlledStreamSourceOf<Value, Error, Requirements>(
  stream: Stream.Stream<Value, Error, Requirements>,
): ControlledStreamSource<Value, Error> | undefined {
  return (stream as ControlledStreamCarrier<Value, Error, Requirements>)[
    ControlledStreamSourceTypeId
  ];
}

export function attachControlledStreamSource<Value, Error, Requirements>(
  stream: Stream.Stream<Value, Error, Requirements>,
  source: ControlledStreamSource<Value, Error>,
): Stream.Stream<Value, Error, Requirements> {
  Object.defineProperty(
    stream as ControlledStreamCarrier<Value, Error, Requirements>,
    ControlledStreamSourceTypeId,
    {
      configurable: false,
      enumerable: false,
      value: source,
      writable: false,
    },
  );

  return stream;
}
