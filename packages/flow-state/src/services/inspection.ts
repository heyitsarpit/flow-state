import { Context, Effect, Layer, Ref } from "effect";

import type { FlowInspectionEvent } from "../public/data-types.js";

export class InspectionLog extends Context.Service<
  InspectionLog,
  {
    readonly entries: Effect.Effect<ReadonlyArray<FlowInspectionEvent>>;
    readonly append: (event: FlowInspectionEvent) => Effect.Effect<void>;
    readonly clear: Effect.Effect<void>;
    readonly subscribe: (
      listener: (event: FlowInspectionEvent) => void,
    ) => Effect.Effect<() => void>;
  }
>()("@flow-state/core/InspectionLog") {
  static readonly layer = Layer.effect(
    InspectionLog,
    Effect.gen(function* () {
      const entries = yield* Ref.make<ReadonlyArray<FlowInspectionEvent>>([]);
      const listeners = new Set<(event: FlowInspectionEvent) => void>();

      const append = Effect.fn("InspectionLog.append")(function* (event: FlowInspectionEvent) {
        yield* Ref.update(entries, (current) => [...current, event]);
        yield* Effect.sync(() => {
          for (const listener of Array.from(listeners)) {
            listener(event);
          }
        });
      });

      const subscribe = Effect.fn("InspectionLog.subscribe")(
        (listener: (event: FlowInspectionEvent) => void) =>
          Effect.sync(() => {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          }),
      );

      return InspectionLog.of({
        entries: Ref.get(entries),
        append,
        clear: Ref.set(entries, []),
        subscribe,
      });
    }),
  );
}
