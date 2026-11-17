import { Schema } from "effect";

/**
 * What one worker process reports for one bench: its samples per unit after warm-up, how many
 * warm-up samples it took, the operations per sample, the first operation's counters and the
 * fixture's shape; or the problem that stopped it.
 */
export const Report = Schema.fromJsonString(
  Schema.Union([
    Schema.Struct({
      _tag: Schema.Literal("Done"),
      samples: Schema.Array(Schema.Number),
      warmup: Schema.Number,
      batch: Schema.Number,
      counters: Schema.Record(Schema.String, Schema.Number),
      shape: Schema.Record(Schema.String, Schema.Number),
    }),
    Schema.Struct({ _tag: Schema.Literal("Failed"), problem: Schema.String }),
  ]),
);

/**
 * One worker's report, decoded.
 */
export type Report = typeof Report.Type;
