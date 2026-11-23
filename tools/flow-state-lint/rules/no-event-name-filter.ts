import { defineRule } from "@oxlint/plugins";

import { propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";

// `x.event`: an evidence record's event name.
const isEventName = (node: ESTree.Node) =>
  node.type === "MemberExpression" && propertyName(node) === "event";

// The event name itself, or a template literal that interpolates it.
const holdsEventName = (node: ESTree.Node) =>
  isEventName(node) || (node.type === "TemplateLiteral" && node.expressions.some(isEventName));

// `set.has(...)` and `list.includes(...)`: a membership test of a name.
const isMembership = (node: ESTree.CallExpression) =>
  node.callee.type === "MemberExpression" &&
  (propertyName(node.callee) === "has" || propertyName(node.callee) === "includes");

// Evidence is selected by event token (`turnsOf(run, Def.E.X)`, `evidenceOf(run, Def.E.X)`), never by an
// event name compared with a string: a renamed event leaves such a filter empty, and a test that expects
// none then passes. The rule flags an evidence record's `.event` compared with `===` or `!==` to anything,
// literal or variable, and passed to `has` or `includes`, in `tests/` and `fixtures/`. A rule over every
// app's machines, which has no token to name, keeps the comparison with a disable comment and its reason.
export const noEventNameFilterRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Tests and fixtures select evidence by event token, not by comparing event names.",
    },
    messages: {
      named:
        "An event name compared with a string selects nothing once the event is renamed, and a test expecting none then passes. Select by token: `turnsOf(run, Def.E.X)` or `evidenceOf(run, Def.E.X)`.",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      before() {
        const rel = relativePath(context.filename);

        return rel !== undefined && /^(tests|fixtures)\//u.test(rel);
      },
      BinaryExpression(node: ESTree.BinaryExpression) {
        if (
          (node.operator === "===" || node.operator === "!==") &&
          (isEventName(node.left) || isEventName(node.right))
        )
          context.report({ node, messageId: "named" });
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isMembership(node) && node.arguments.some(holdsEventName))
          context.report({ node, messageId: "named" });
      },
    };
  },
});
