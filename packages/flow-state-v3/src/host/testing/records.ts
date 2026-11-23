import { Predicate, Result } from "effect";
import { EntryRecord, PositionRecord, strictly, WorkRecord } from "../../core/record-shape.ts";
import { entry } from "../../entry.ts";

// The one codec of each record kind the writer emits.
const CODEC_OF_KIND = {
  "actor/": PositionRecord,
  "work/": WorkRecord,
  "entry/": EntryRecord,
} as const;

/**
 * Whether a saved record's JSON decodes, strictly, by the one Shape codec of its kind that the
 * writer encodes with and the boot decodes with: an actor key's position, a work key's work, an
 * entry key's saved read entry.
 *
 * **When to use**
 *
 * As a test's oracle of what the writer can emit: it is the codec itself, so it cannot accept more.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a stored value parsed from its text, judged here by its kind's codec.
export const writerDecodes = entry(
  "writerDecodes",
  (kind: keyof typeof CODEC_OF_KIND, json: unknown) =>
    Result.isSuccess(strictly(CODEC_OF_KIND[kind])(json)),
);

// A Schema AST node's string literal, if it is one.
// FLOW_STATE_ALLOW_UNKNOWN: an AST node, read for its tag alone.
const literalOf = (node: unknown) =>
  Predicate.hasProperty(node, "_tag") &&
  node._tag === "Literal" &&
  Predicate.hasProperty(node, "literal") &&
  Predicate.isString(node.literal)
    ? [node.literal]
    : [];

// What a node of an AST holds: an array's items, an object's own values.
// FLOW_STATE_ALLOW_UNKNOWN: an AST node or one of its members.
// RETURN_TYPE: one list type for an array's items and an object's values.
const childrenOf = (node: unknown): ReadonlyArray<unknown> => {
  if (Array.isArray(node)) {
    const items: ReadonlyArray<unknown> = node;

    return items;
  }

  return Predicate.isObject(node) ? Object.values(node) : [];
};

// Every string literal an AST names, walked with its own stack.
// FLOW_STATE_ALLOW_UNKNOWN: Schema ASTs, read for their literals alone.
const literalsIn = (root: ReadonlyArray<unknown>) => {
  const found = new Set<string>();
  const seen = new Set<unknown>();
  const stack: Array<unknown> = [...root];

  while (stack.length > 0) {
    const node = stack.pop();

    if (!seen.has(node)) {
      seen.add(node);

      for (const literal of literalOf(node)) found.add(literal);
      stack.push(...childrenOf(node));
    }
  }

  return found;
};

/**
 * Every string literal the record codecs name (channels, holds, tags, statuses): the other valid
 * values a literal slot of a saved record may be swapped for.
 */
export const recordLiterals: ReadonlySet<string> = literalsIn(
  Object.values(CODEC_OF_KIND).map((codec) => codec.ast),
);
