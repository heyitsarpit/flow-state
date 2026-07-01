import { Context, Effect, Layer, Ref } from "effect";

import { HostSignalSource, type HostSignalsSnapshot } from "./host-signal-source.js";

function makeHostSignals() {
  return Effect.gen(function* () {
    const source = yield* HostSignalSource;
    const state = yield* Ref.make(yield* source.snapshot);
    const listeners = new Set<(snapshot: HostSignalsSnapshot) => void>();

    const publish = (snapshot: HostSignalsSnapshot) => {
      for (const listener of listeners) {
        listener(snapshot);
      }
    };

    const setSnapshot = Effect.fn("HostSignals.setSnapshot")(function* (
      snapshot: HostSignalsSnapshot,
    ) {
      yield* Ref.set(state, snapshot);
      yield* Effect.sync(() => {
        publish(snapshot);
      });
    });

    yield* Effect.acquireRelease(
      source.subscribe((snapshot) => {
        Effect.runSync(setSnapshot(snapshot));
      }),
      (unsubscribe) =>
        Effect.sync(() => {
          unsubscribe();
        }),
    );

    const setFocused = Effect.fn("HostSignals.setFocused")(function* (focused: boolean) {
      const current = yield* Ref.get(state);
      const next = {
        ...current,
        focused,
      } satisfies HostSignalsSnapshot;
      yield* setSnapshot(next);
    });

    const setOnline = Effect.fn("HostSignals.setOnline")(function* (online: boolean) {
      const current = yield* Ref.get(state);
      const next = {
        ...current,
        online,
      } satisfies HostSignalsSnapshot;
      yield* setSnapshot(next);
    });

    const subscribe = Effect.fn("HostSignals.subscribe")(function* (
      listener: (snapshot: HostSignalsSnapshot) => void,
    ) {
      return yield* Effect.sync(() => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      });
    });

    return HostSignals.of({
      snapshot: Ref.get(state),
      setFocused,
      setOnline,
      subscribe,
    });
  });
}

export type { HostSignalsSnapshot } from "./host-signal-source.js";

export class HostSignals extends Context.Service<
  HostSignals,
  {
    readonly snapshot: Effect.Effect<HostSignalsSnapshot>;
    readonly setFocused: (focused: boolean) => Effect.Effect<void>;
    readonly setOnline: (online: boolean) => Effect.Effect<void>;
    readonly subscribe: (
      listener: (snapshot: HostSignalsSnapshot) => void,
    ) => Effect.Effect<() => void>;
  }
>()("@flow-state/core/HostSignals") {
  static readonly layer = Layer.effect(HostSignals, makeHostSignals());

  static readonly liveLayer = HostSignals.layer.pipe(Layer.provide(HostSignalSource.browserLayer));

  static readonly testLayer = HostSignals.layer.pipe(
    Layer.provide(
      HostSignalSource.staticLayer({
        focused: true,
        online: true,
      }),
    ),
  );
}

export type HostSignalsService = Parameters<(typeof HostSignals)["of"]>[0];
