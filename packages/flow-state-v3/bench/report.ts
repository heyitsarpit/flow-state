import { Schema } from "effect";

/**
 * What a worker process reports for each bench it ran, by id: its samples per unit after warm-up, how many
 * warm-up samples it took, the operations per sample, the first operation's counters, the
 * fixture's shape, and where its time went (`startedAt` is ms since the process started); or the problem that stopped it; or, past its timeout,
 * the samples it took.
 */
export const Report = Schema.fromJsonString(
  Schema.Union([
    Schema.Struct({
      _tag: Schema.Literal("Done"),
      id: Schema.String,
      samples: Schema.Array(Schema.Number),
      warmup: Schema.Number,
      batch: Schema.Number,
      counters: Schema.Record(Schema.String, Schema.Number),
      shape: Schema.Record(Schema.String, Schema.Number),
      timing: Schema.Record(Schema.String, Schema.Number),
    }),
    Schema.Struct({ _tag: Schema.Literal("Failed"), id: Schema.String, problem: Schema.String }),
    Schema.Struct({
      _tag: Schema.Literal("TimedOut"),
      id: Schema.String,
      problem: Schema.String,
      samples: Schema.Array(Schema.Number),
    }),
  ]),
);

/**
 * One worker's report, decoded.
 */
export type Report = typeof Report.Type;
