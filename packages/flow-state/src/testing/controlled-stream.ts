import { Cause, Effect, Queue, Stream } from "effect";

const ControlledStreamSourceTypeId = Symbol.for("@flow-state/core/testing/ControlledStreamSource");

type ControlledStreamListener<Value, Error> = Readonly<{
  readonly onValue: (value: Value) => void;
  readonly onFailure: (error: Error) => void;
  readonly onDone: () => void;
}>;

type ControlledStreamSource<Value, Error> = Readonly<{
  readonly subscribe: (listener: ControlledStreamListener<Value, Error>) => () => void;
}>;

type ControlledStreamCarrier<Value, Error> = Stream.Stream<Value, Error> & {
  readonly [ControlledStreamSourceTypeId]?: ControlledStreamSource<Value, Error>;
};

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

export function controlledStreamSourceOf<Value, Error>(
  stream: Stream.Stream<Value, Error>,
): ControlledStreamSource<Value, Error> | undefined {
  return (stream as ControlledStreamCarrier<Value, Error>)[ControlledStreamSourceTypeId];
}

export function createControlledStream<Value, Error = never>(
  id: string,
): ControlledStream<Value, Error> {
  const history: Array<ControlledStreamEvent<Value, Error>> = [];
  const buffered: Array<ControlledStreamEvent<Value, Error>> = [];
  const listeners = new Map<number, ControlledStreamListener<Value, Error>>();
  let nextListenerId = 0;
  let interrupted = false;
  let terminal: ControlledStreamEvent<Value, Error> | undefined;

  const deliver = (
    listener: ControlledStreamListener<Value, Error>,
    event: ControlledStreamEvent<Value, Error>,
  ) => {
    switch (event.type) {
      case "value":
        listener.onValue(event.value);
        break;
      case "failure":
        listener.onFailure(event.error);
        break;
      case "done":
        listener.onDone();
        break;
    }
  };

  const flushBufferedInto = (listener: ControlledStreamListener<Value, Error>) => {
    while (buffered.length > 0) {
      const event = buffered.shift();
      if (event === undefined) {
        continue;
      }

      deliver(listener, event);
    }
  };

  const subscribe = (listener: ControlledStreamListener<Value, Error>) => {
    interrupted = false;
    const listenerId = nextListenerId++;
    listeners.set(listenerId, listener);

    const replayTerminalDirectly = terminal !== undefined && buffered.length === 0;
    flushBufferedInto(listener);
    if (replayTerminalDirectly && terminal !== undefined) {
      deliver(listener, terminal);
    }

    let active = true;
    return () => {
      if (!active) {
        return;
      }

      active = false;
      listeners.delete(listenerId);
      interrupted = listeners.size === 0;
    };
  };

  const deliverOrBuffer = (event: ControlledStreamEvent<Value, Error>) => {
    if (terminal !== undefined) {
      return;
    }

    if (event.type !== "value") {
      terminal = event;
    }

    if (listeners.size === 0) {
      buffered.push(event);
      if (terminal !== undefined) {
        interrupted = true;
      }
      return;
    }

    for (const listener of Array.from(listeners.values())) {
      deliver(listener, event);
    }

    if (terminal !== undefined) {
      listeners.clear();
      interrupted = true;
    }
  };

  const stream = Stream.callback<Value, Error>((queue) =>
    Effect.gen(function* () {
      const unsubscribe = subscribe({
        onValue: (value) => {
          Queue.offerUnsafe(queue, value);
        },
        onFailure: (error) => {
          Queue.failCauseUnsafe(queue, Cause.fail(error));
        },
        onDone: () => {
          Queue.endUnsafe(queue);
        },
      });

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          unsubscribe();
        }),
      );
    }),
  ) as ControlledStreamCarrier<Value, Error>;

  Object.defineProperty(stream, ControlledStreamSourceTypeId, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      subscribe,
    }),
    writable: false,
  });

  return Object.freeze({
    kind: "controlledStream",
    id,
    stream: () => stream,
    emit: (value: Value) => {
      history.push({ type: "value", value });
      deliverOrBuffer({ type: "value", value });
    },
    fail: (error: Error) => {
      history.push({ type: "failure", error });
      deliverOrBuffer({ type: "failure", error });
    },
    end: () => {
      history.push({ type: "done" });
      deliverOrBuffer({ type: "done" });
      interrupted = true;
    },
    cancelled: () => interrupted,
    events: () => history,
  });
}
