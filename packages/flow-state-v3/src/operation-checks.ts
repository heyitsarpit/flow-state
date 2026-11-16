import { Option, SchemaAST } from "effect";
import { invalid, isUncertain } from "./config.ts";
import { checkName } from "./construction.ts";
import type { Bound, Ending } from "./contract.ts";
import type { EventFields } from "./definition.ts";
import type { Finding } from "./error.ts";

// Every ending of an operation, by its place: its event must be one this definition declares.
const endingsOf = (bound: Bound) => {
  const endings: Array<readonly [string, Ending]> = [
    ["success", bound.success],
    ...Object.entries(bound.failure).map(([tag, e]) => [`failure.${tag}`, e] as const),
  ];

  if (bound.kind === "write")
    endings.push(...Option.toArray(Option.map(bound.notSent, (e) => ["notSent", e] as const)), [
      "unknown",
      bound.unknown,
    ]);

  return endings;
};

const endingFindings = (
  name: string,
  bound: Bound,
  internal: Readonly<Record<string, EventFields>>,
) =>
  endingsOf(bound)
    .filter(([, e]) => !Object.hasOwn(internal, e.ending.event))
    .map(([place, e]) =>
      invalid(
        ["operations", name, ...place.split(".")],
        "UnknownEvent",
        `${name}'s ${place} ending maps to ${e.ending.event}, which this definition does not declare as an internal event`,
        "Map every ending to one of the definition's internalEvents.",
      ),
    );

// RETURN_TYPE: the findings this construction reports: a key field outside the input, or one that may be absent.
const keyFieldFindings = (name: string, bound: Bound): Array<Finding> => {
  const ast = SchemaAST.toType(bound.input.ast);
  const fields = SchemaAST.isObjects(ast) ? ast.propertySignatures : [];
  const names = fields.map((p) => String(p.name));

  const outside = bound.key
    .filter((key) => !names.includes(key))
    .map((key) =>
      invalid(
        ["operations", name, "key", key],
        "KeyOutsideInput",
        `${name}'s key field ${key} is not an input field`,
        "Key an operation only by fields of its input.",
      ),
    );

  return [
    ...outside,
    ...fields
      .filter((p) => bound.key.includes(String(p.name)) && SchemaAST.isOptional(p.type))
      .map((p) => keyOptional(name, String(p.name))),
  ];
};

// RETURN_TYPE: the Finding protocol the caller collects.
const keyOptional = (name: string, field: string): Finding => ({
  code: "KeyFieldOptional",
  path: ["operations", name, "key", field],
  summary: `${name}'s key field ${field} is optional`,
  help: "Make every key field of the contract's input required.",
});

// RETURN_TYPE: the findings this construction reports, in walk order.
export const operationFindings = (
  operations: Readonly<Record<string, Bound>>,
  internal: Readonly<Record<string, EventFields>>,
): Array<Finding> => {
  const writes = new Map<string, string>();

  return Object.entries(operations).flatMap(([name, bound]) => {
    const at = ["operations", name];
    const found: Array<Finding> = [...checkName(name, at)];

    found.push(...keyFieldFindings(name, bound), ...endingFindings(name, bound, internal));

    if (bound.kind === "write") {
      const target = internal[bound.unknown.ending.event];

      if (target !== undefined && !isUncertain(target))
        found.push({
          code: "UnknownNotUncertain",
          path: [...at, "unknown"],
          summary: `${name}'s unknown ending maps to ${bound.unknown.ending.event}, not a Flow.uncertain event`,
          help: "Map unknown: to an internal event declared with Flow.uncertain.",
        });

      const first = writes.get(bound.contract);

      if (first !== undefined)
        found.push({
          code: "SharedContract",
          path: at,
          details: { contract: bound.contract, first },
          summary: `${name} and ${first} both write ${bound.contract}`,
          help: "Declare one write operation per write contract.",
        });
      else writes.set(bound.contract, name);
    }

    return found;
  });
};
