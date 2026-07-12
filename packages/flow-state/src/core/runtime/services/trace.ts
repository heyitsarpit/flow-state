import { Context, Effect, Layer, Ref } from "effect";

import type { FlowReceipt } from "../../api/types.js";
import {
  pruneReceiptHistory,
  type FlowReceiptHistory,
} from "../../inspection/receipt-retention.js";

type TraceLogSnapshot = Readonly<{
  readonly entries: ReadonlyArray<FlowReceipt>;
  readonly truncatedBeforeReceiptCount?: number;
}>;

export class TraceLog extends Context.Service<
  TraceLog,
  {
    readonly entries: Effect.Effect<ReadonlyArray<FlowReceipt>>;
    readonly snapshot: Effect.Effect<TraceLogSnapshot>;
    readonly append: (entry: FlowReceipt) => Effect.Effect<void>;
    readonly clear: Effect.Effect<void>;
  }
>()("flow-state/TraceLog") {
  static readonly layer = Layer.effect(
    TraceLog,
    Effect.gen(function* () {
      const state = yield* Ref.make<FlowReceiptHistory>({
        receipts: Object.freeze([]),
      });

      const append = Effect.fn("TraceLog.append")(function* (entry: FlowReceipt) {
        yield* Ref.update(state, (current) =>
          pruneReceiptHistory({
            receipts: Object.freeze([...current.receipts, entry]),
            ...(current.truncatedBeforeReceiptCount === undefined
              ? {}
              : { truncatedBeforeReceiptCount: current.truncatedBeforeReceiptCount }),
          }),
        );
      });

      return TraceLog.of({
        entries: Effect.map(Ref.get(state), (current) => current.receipts),
        snapshot: Effect.map(Ref.get(state), (current) =>
          Object.freeze({
            entries: current.receipts,
            ...(current.truncatedBeforeReceiptCount === undefined
              ? {}
              : { truncatedBeforeReceiptCount: current.truncatedBeforeReceiptCount }),
          }),
        ),
        append,
        clear: Ref.set(state, {
          receipts: Object.freeze([]),
        }),
      });
    }),
  );
}
