import { Schema } from "effect";

/**
 * One case's verdict: it passed; it failed with every oracle that caught it in the failing step
 * (none for a case's own expectation or a thrown defect) and why, where `cites` is the Invariant
 * a failed case expectation cites, when its label names one; or it ran past its time bound
 * (`Timeout`, a defect: it names no oracle and cites nothing, so it never catches a mutant).
 */
export const CaseVerdict = Schema.Union([
  Schema.TaggedStruct("Pass", { id: Schema.String }),
  Schema.TaggedStruct("Fail", {
    id: Schema.String,
    oracles: Schema.Array(Schema.String),
    why: Schema.String,
    cites: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
  Schema.TaggedStruct("Timeout", {
    id: Schema.String,
    seed: Schema.Number,
    seconds: Schema.Number,
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
