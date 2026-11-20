import { defineRule } from "@oxlint/plugins";

import { appliesTo, propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";

// An incarnation's timers change only through the schedule decision: one function decides each
// schedule's timers for an occasion, and src/core/schedules.ts, the one writer, applies it. A timer
// written anywhere else is a schedule input combined outside that decision, the freedom behind
// timers that disarm, restart or pause in the wrong order. Decides by path itself: src outside test
// files, except the writer. A new incarnation's empty `new Map()` is not a write, and a `schedules`
// array is a record's saved timers, not an incarnation's.
const WRITER = "src/core/schedules.ts";

const isEmptyMap = (node: ESTree.Node) =>
  node.type === "NewExpression" &&
  node.callee.type === "Identifier" &&
  node.callee.name === "Map" &&
  node.arguments.length === 0;

const isSchedulesKey = (property: ESTree.Node) =>
  property.type === "Property" &&
  ((property.key.type === "Identifier" && !property.computed && property.key.name === "schedules") ||
    (property.key.type === "Literal" && property.key.value === "schedules"));

const writes = new Set(["set", "delete", "clear"]);

// `Schema.Struct({ ...Head, schedules: ... })`: a record's field declarations, not a value.
const isSchemaFields = (node: ESTree.ObjectExpression) => {
  const parent = node.parent;

  return (
    parent?.type === "CallExpression" &&
    parent.callee.type === "MemberExpression" &&
    parent.callee.object.type === "Identifier" &&
    parent.callee.object.name === "Schema"
  );
};

export const timersDecidedRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "An incarnation's timers are written only where the schedule decision is applied.",
    },
    messages: {
      write:
        "{{what}} writes an incarnation's timers outside the schedule decision. Decide the change in `decide` (src/core/schedule-decision.ts) and apply it through src/core/schedules.ts.",
    },
    schema: [],
  },
  createOnce(context) {
    const report = (node: ESTree.Node, what: string) => context.report({ node, messageId: "write", data: { what } });

    return {
      before() {
        const rel = relativePath(context.filename);

        return rel !== undefined && rel !== WRITER && appliesTo(rel, { only: ["src"], exceptTests: true });
      },
      // `{ ...incarnation, schedules: timers }`: an incarnation copied with its timers replaced.
      ObjectExpression(node: ESTree.ObjectExpression) {
        if (!node.properties.some((p) => p.type === "SpreadElement") || isSchemaFields(node)) return;

        for (const property of node.properties)
          if (
            isSchedulesKey(property) &&
            property.type === "Property" &&
            property.value.type !== "ArrayExpression" &&
            !isEmptyMap(property.value)
          )
            report(property, "`schedules:` beside a spread");
      },
      // `incarnation.schedules = timers`.
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (node.left.type === "MemberExpression" && propertyName(node.left) === "schedules")
          report(node, "`.schedules =`");
      },
      // `incarnation.schedules.set(track, tracked)`, `.delete` and `.clear`.
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee;

        if (
          callee.type === "MemberExpression" &&
          writes.has(propertyName(callee)) &&
          callee.object.type === "MemberExpression" &&
          propertyName(callee.object) === "schedules"
        )
          report(node, `\`.schedules.${propertyName(callee)}\``);
      },
    };
  },
});
