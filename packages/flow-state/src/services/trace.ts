import { Context, Effect, Layer, Ref } from "effect";

import type { FlowReceipt } from "../public/types.js";

export class TraceLog extends Context.Service<
  TraceLog,
  {
    readonly entries: Effect.Effect<ReadonlyArray<FlowReceipt>>;
    readonly append: (entry: FlowReceipt) => Effect.Effect<void>;
    readonly clear: Effect.Effect<void>;
  }
>()("@flow-state/core/TraceLog") {
  static readonly layer = Layer.effect(
    TraceLog,
    Effect.gen(function* () {
      const entries = yield* Ref.make<ReadonlyArray<FlowReceipt>>([]);

      const append = Effect.fn("TraceLog.append")(function* (entry: FlowReceipt) {
        yield* Ref.update(entries, (current) => [...current, entry]);
      });

      return TraceLog.of({
        entries: Ref.get(entries),
        append,
        clear: Ref.set(entries, []),
      });
    }),
  );
}
