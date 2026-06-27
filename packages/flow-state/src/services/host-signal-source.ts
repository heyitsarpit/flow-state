import { Context, Effect, Layer } from "effect";

export type HostSignalsSnapshot = Readonly<{
  readonly focused: boolean;
  readonly online: boolean;
}>;

type HostSignalListener = (snapshot: HostSignalsSnapshot) => void;

function readBrowserSignals(): HostSignalsSnapshot {
  return {
    focused: typeof document === "undefined" ? true : document.visibilityState !== "hidden",
    online: typeof navigator === "undefined" ? true : navigator.onLine,
  };
}

export class HostSignalSource extends Context.Service<
  HostSignalSource,
  {
    readonly snapshot: Effect.Effect<HostSignalsSnapshot>;
    readonly subscribe: (listener: HostSignalListener) => Effect.Effect<() => void>;
  }
>()("@flow-state/core/HostSignalSource") {
  static readonly browserLayer = Layer.succeed(
    HostSignalSource,
    HostSignalSource.of({
      snapshot: Effect.sync(readBrowserSignals),
      subscribe: Effect.fn("HostSignalSource.browser.subscribe")(function* (
        listener: HostSignalListener,
      ) {
        return yield* Effect.sync(() => {
          if (typeof window === "undefined" || window.addEventListener === undefined) {
            return () => undefined;
          }

          const emit = () => {
            listener(readBrowserSignals());
          };

          window.addEventListener("visibilitychange", emit, false);
          window.addEventListener("online", emit, false);
          window.addEventListener("offline", emit, false);

          return () => {
            window.removeEventListener("visibilitychange", emit);
            window.removeEventListener("online", emit);
            window.removeEventListener("offline", emit);
          };
        });
      }),
    }),
  );

  static staticLayer(snapshot: HostSignalsSnapshot): Layer.Layer<HostSignalSource> {
    return Layer.succeed(
      HostSignalSource,
      HostSignalSource.of({
        snapshot: Effect.succeed(snapshot),
        subscribe: Effect.fn("HostSignalSource.static.subscribe")(function* () {
          return () => undefined;
        }),
      }),
    );
  }
}
