import { Array, flow, Order, Predicate } from "effect";

import type { Details, Diagnostic, Path } from "./diagnostic.js";

/*
 * Rendering:
 *
 * Character escaping
 *
 * Path and detail rendering
 *
 * Final message assembly
 */

// Character escaping
const invisibleControl = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;
const identifier = /^[A-Za-z_$][\w$]*$/u;

const unicodeEscape = (codePoint: number) =>
  codePoint <= 0xffff
    ? `\\u${codePoint.toString(16).padStart(4, "0")}`
    : `\\u{${codePoint.toString(16)}}`;

const quote = flow(
  (value: string) => JSON.stringify(value),
  (value) =>
    value.replace(invisibleControl, (character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === undefined ? "" : unicodeEscape(codePoint);
    }),
);

const text = flow(quote, (value) => value.slice(1, -1));

// Path and detail rendering
const property = (value: string) => (identifier.test(value) ? value : quote(value));

const printPath = flow(
  (path: Path) =>
    path.map((segment) => {
      if (Predicate.isNumber(segment)) return `[${segment}]`;
      return identifier.test(segment) ? `.${segment}` : `[${quote(segment)}]`;
    }),
  (segments) => `$${segments.join("")}`,
);

const printDetailValue = (value: Details[string]) =>
  Predicate.isString(value) ? quote(value) : String(value);

const printDetails = flow(
  (details: Details) => Object.entries(details),
  Array.sortWith(([key]) => key, Order.String),
  (entries) =>
    entries.length === 0
      ? []
      : [
          "  details:",
          ...entries.map(([key, value]) => `    ${property(key)}: ${printDetailValue(value)}`),
        ],
);

// Final message assembly
/**
 * Prints a deterministic message for people while keeping every field easy to
 * scan. Simple path segments use property notation; unusual segments are JSON
 * quoted so control characters and punctuation cannot reshape the output.
 * Detail keys are sorted to keep logs and snapshots stable.
 *
 * A validation failure with context looks like:
 *
 * ```text
 * SchemaValidation: Schema validation failed
 *   at $.users[0].name
 *   details:
 *     issue: "InvalidType"
 *   help: Fix the value at the reported path.
 * ```
 *
 * A failure without details stays compact:
 *
 * ```text
 * Defect: Unexpected runtime defect
 *   at $
 *   help: Inspect the original cause at the host boundary.
 * ```
 */
export const print = (diagnostic: Diagnostic) =>
  [
    `${diagnostic.code}: ${text(diagnostic.summary)}`,
    `  at ${printPath(diagnostic.path)}`,
    ...printDetails(diagnostic.details),
    `  help: ${text(diagnostic.help)}`,
  ].join("\n");
