import { defineRule } from "@oxlint/plugins";

import { appliesTo, optionsSchema, propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";
import type { Options } from "./shared.ts";

const isOptionTag = (node: ESTree.Node | null | undefined) =>
  node?.type === "Literal" && (node.value === "Some" || node.value === "None");

const isTagRead = (node: ESTree.Node | null | undefined) =>
  node?.type === "MemberExpression" && propertyName(node) === "_tag";

const isTagKey = (node: ESTree.Property) =>
  !node.computed &&
  ((node.key.type === "Identifier" && node.key.name === "_tag") ||
    (node.key.type === "Literal" && node.key.value === "_tag"));

const comparisons = new Set(["===", "!==", "==", "!="]);
const assertions = new Set(["toBe", "toEqual", "toStrictEqual"]);

// `expect(x._tag).toBe("Some")`: the receiver of the assertion is `expect(<read of _tag>)`.
const isTagAssertion = (node: ESTree.CallExpression) => {
  const callee = node.callee;

  if (callee.type !== "MemberExpression" || !assertions.has(propertyName(callee))) return false;

  const subject = callee.object;

  return (
    subject.type === "CallExpression" &&
    subject.callee.type === "Identifier" &&
    subject.callee.name === "expect" &&
    isTagRead(subject.arguments[0]) &&
    isOptionTag(node.arguments[0])
  );
};

// An `Option` is read with `Option.isSome`, `Option.isNone` and `Option.match` and built with `Option.some`
// and `Option.none`: the `_tag` of an `Option` is Effect's own representation, which a hand-written
// `"Some"` or `"None"` copies and which a rename or a second representation would silently break.
export const noHandOptionRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "An Option is read and built with the Option module, never by its `_tag` string.",
    },
    messages: {
      hand:
        "`_tag` against \"Some\" or \"None\" is a hand-written Option. Read it with `Option.isSome`, `Option.isNone` or `Option.match`; build it with `Option.some(value)` or `Option.none()`.",
    },
    schema: optionsSchema,
  },
  createOnce(context) {
    return {
      before() {
        const rel = relativePath(context.filename);
        const given: Options = context.options[0] ?? {};

        return rel !== undefined && appliesTo(rel, given);
      },
      BinaryExpression(node: ESTree.BinaryExpression) {
        if (
          comparisons.has(node.operator) &&
          ((isTagRead(node.left) && isOptionTag(node.right)) ||
            (isOptionTag(node.left) && isTagRead(node.right)))
        )
          context.report({ node, messageId: "hand" });
      },
      Property(node: ESTree.Property) {
        if (isTagKey(node) && isOptionTag(node.value)) context.report({ node, messageId: "hand" });
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isTagAssertion(node)) context.report({ node, messageId: "hand" });
      },
    };
  },
});
