import { Schema } from "effect";

/**
 * One case's verdict: it passed, or it failed with the oracle that caught it (none for a case's
 * own expectation or a thrown defect) and why.
 */
export const CaseVerdict = Schema.Union([
  Schema.TaggedStruct("Pass", { id: Schema.String }),
  Schema.TaggedStruct("Fail", {
    id: Schema.String,
    oracle: Schema.OptionFromOptionalNullOr(Schema.String),
    why: Schema.String,
  }),
]);

/**
 * The decoded {@link CaseVerdict}.
 */
export type CaseVerdict = typeof CaseVerdict.Type;

/**
 * A run's verdicts as one line of JSON, the form a child process prints for its parent.
 */
export const VerdictsJson = Schema.fromJsonString(Schema.Array(CaseVerdict));

/**
 * The prefix of the one line a child prints with its verdicts.
 */
export const VERDICTS_LINE = "VERDICTS ";
