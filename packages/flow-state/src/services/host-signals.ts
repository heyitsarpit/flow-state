import { Context, Effect, Layer, Ref } from "effect";

import { HostSignalSource, type HostSignalsSnapshot } from "./host-signal-source.js";

function makeHostSignals() {
  return Effect.gen(function* () {
    const source = yield* HostSignalSource;
    const state = yield* Ref.make(yield* source.snapshot);

    yield* Effect.acquireRelease(
      source.subscribe((snapshot) => {
        Effect.runSync(Ref.set(state, snapshot));
      }),
      (unsubscribe) =>
        Effect.sync(() => {
          unsubscribe();
        }),
    );

    const setFocused = Effect.fn("HostSignals.setFocused")(function* (focused: boolean) {
      yield* Ref.update(state, (current) => ({
        ...current,
        focused,
      }));
    });

    const setOnline = Effect.fn("HostSignals.setOnline")(function* (online: boolean) {
      yield* Ref.update(state, (current) => ({
        ...current,
        online,
      }));
    });

    return HostSignals.of({
      snapshot: Ref.get(state),
      setFocused,
      setOnline,
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
