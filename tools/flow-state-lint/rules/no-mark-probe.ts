import { defineRule } from "@oxlint/plugins";

import { appliesTo, optionsSchema, propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";
import type { Options } from "./shared.ts";

// A key starting with `~`: one of Flow's own marks, which a caller can copy onto any value.
const isMarkKey = (node: ESTree.Node | undefined) =>
  (node?.type === "Literal" && typeof node.value === "string" && node.value.startsWith("~")) ||
  (node?.type === "TemplateLiteral" && (node.quasis[0]?.value.cooked ?? "").startsWith("~"));

const calleeName = (callee: ESTree.Node) =>
  callee.type === "Identifier"
    ? callee.name
    : callee.type === "MemberExpression"
      ? `${callee.object.type === "Identifier" ? callee.object.name : ""}.${propertyName(callee)}`
      : "";

const markProbes = new Set(["hasProperty", "Predicate.hasProperty", "Object.hasOwn"]);

// A value trusted because it carries a `~` mark: anyone can forge the mark, so a Flow-made value is
// recognised by identity (a WeakSet or WeakMap Flow fills when it makes the value) instead.
export const noMarkProbeRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "No probe of a `~` mark: Flow-made values are recognised by identity." },
    messages: {
      probe:
        "`{{call}}` trusts a value by its `~` mark, which any caller can copy. Recognise a Flow-made value by identity: a WeakSet or WeakMap filled where Flow makes it.",
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
      CallExpression(node: ESTree.CallExpression) {
        const name = calleeName(node.callee);
        const key = node.arguments[1];

        if (markProbes.has(name) && key !== undefined && key.type !== "SpreadElement" && isMarkKey(key))
          context.report({ node, messageId: "probe", data: { call: name } });
      },
      BinaryExpression(node: ESTree.BinaryExpression) {
        if (node.operator === "in" && isMarkKey(node.left))
          context.report({ node, messageId: "probe", data: { call: "in" } });
      },
    };
  },
});
