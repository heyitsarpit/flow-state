import { defineRule } from "@oxlint/plugins";

import { appliesTo, propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";

// An incarnation's timers and schedule issues change only through the schedule decision: one
// function decides each schedule's timers and issues for an occasion, src/core/schedules.ts, the
// one timer writer, applies it, and src/core/world.ts holds the only raw issue writes, its issue
// helpers. A timer or issue written anywhere else is a schedule input combined outside that
// decision, the freedom behind timers that disarm, restart or pause in the wrong order and issues
// one key clears for another. Decides by path itself: src outside test files. A new incarnation's
// empty `new Map()` and `[]` are not writes, and a `schedules` array is a record's saved timers,
// not an incarnation's.
const TIMER_WRITER = "src/core/schedules.ts";

const ISSUE_WRITER = "src/core/world.ts";

const DECISION = "src/core/schedule-decision.ts";

// Fields only an incarnation has: a literal with one of them and `schedules` or `issues` builds
// an incarnation.
const INCARNATION_FIELDS = new Set(["activations"]);

const isEmptyMap = (node: ESTree.Node) =>
  node.type === "NewExpression" &&
  node.callee.type === "Identifier" &&
  node.callee.name === "Map" &&
  node.arguments.length === 0;

const isEmptyArray = (node: ESTree.Node) => node.type === "ArrayExpression" && node.elements.length === 0;

const keyName = (property: ESTree.Node) => {
  if (property.type !== "Property") return "";

  if (property.key.type === "Identifier" && !property.computed) return property.key.name;

  return property.key.type === "Literal" ? String(property.key.value) : "";
};

const writes = new Set(["set", "delete", "clear", "push", "splice"]);

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

// `Object.assign(…)`.
const isObjectAssign = (node: ESTree.CallExpression) =>
  node.callee.type === "MemberExpression" &&
  node.callee.object.type === "Identifier" &&
  node.callee.object.name === "Object" &&
  propertyName(node.callee) === "assign";

export const timersDecidedRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "An incarnation's timers and schedule issues are written only where the schedule decision is applied.",
    },
    messages: {
      write:
        "{{what}} writes an incarnation's timers outside the schedule decision. Decide the change in `decide` (src/core/schedule-decision.ts) and apply it through src/core/schedules.ts.",
      issue:
        "{{what}} writes an incarnation's issues outside the issue helpers. Raise or clear an issue through src/core/world.ts, and a schedule's only from `decide` (src/core/schedule-decision.ts).",
    },
    schema: [],
  },
  createOnce(context) {
    let rel = "";
    // Names bound to an incarnation's timers in this file: `const timers = incarnation.schedules`.
    const aliases = new Set<string>();

    const reportTimers = (node: ESTree.Node, what: string) => {
      if (rel !== TIMER_WRITER) context.report({ node, messageId: "write", data: { what } });
    };

    const reportIssues = (node: ESTree.Node, what: string) => {
      if (rel !== ISSUE_WRITER) context.report({ node, messageId: "issue", data: { what } });
    };

    // A written value: anything but a fresh incarnation's empty map or list, or a record's array.
    const written = (property: ESTree.Node) =>
      property.type === "Property" &&
      property.value.type !== "ArrayExpression" &&
      !isEmptyMap(property.value);

    const writtenIssues = (property: ESTree.Node) =>
      property.type === "Property" && !isEmptyArray(property.value);

    return {
      before() {
        const path = relativePath(context.filename);

        aliases.clear();
        rel = path ?? "";

        return path !== undefined && appliesTo(path, { only: ["src"], exceptTests: true });
      },
      // `{ ...incarnation, schedules: timers }`, `{ ...incarnation, issues }` and an incarnation
      // built as a literal.
      ObjectExpression(node: ESTree.ObjectExpression) {
        if (isSchemaFields(node)) return;

        const spread = node.properties.some((p) => p.type === "SpreadElement");
        const incarnation = node.properties.some((p) => INCARNATION_FIELDS.has(keyName(p)));

        if (!spread && !incarnation) return;

        const beside = spread ? "beside a spread" : "in an incarnation literal";

        for (const property of node.properties) {
          if (keyName(property) === "schedules" && written(property))
            reportTimers(property, `\`schedules:\` ${beside}`);

          if (keyName(property) === "issues" && writtenIssues(property))
            reportIssues(property, `\`issues:\` ${beside}`);
        }
      },
      // `const timers = incarnation.schedules`: an alias a copy may be made from.
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (
          node.id.type === "Identifier" &&
          node.init?.type === "MemberExpression" &&
          propertyName(node.init) === "schedules"
        )
          aliases.add(node.id.name);
      },
      // `new Map(incarnation.schedules)` or `new Map(timers)` of an alias: a copy made to be written.
      NewExpression(node: ESTree.NewExpression) {
        const [first] = node.arguments;

        if (node.callee.type !== "Identifier" || node.callee.name !== "Map") return;

        if (first?.type === "MemberExpression" && propertyName(first) === "schedules")
          reportTimers(node, "`new Map(….schedules)`");

        if (first?.type === "Identifier" && aliases.has(first.name))
          reportTimers(node, "`new Map(…)` of an incarnation's timers");
      },
      // `incarnation.schedules = timers`, `incarnation.issues = issues`.
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (node.left.type !== "MemberExpression") return;

        if (propertyName(node.left) === "schedules") reportTimers(node, "`.schedules =`");

        if (propertyName(node.left) === "issues") reportIssues(node, "`.issues =`");
      },
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee;

        // `IssueSource.Schedule(…)`: a schedule issue's source, built only by the decision.
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "IssueSource" &&
          propertyName(callee) === "Schedule" &&
          rel !== DECISION
        )
          context.report({
            node,
            messageId: "issue",
            data: { what: "`IssueSource.Schedule(…)`" },
          });

        // `Object.assign(incarnation, { schedules })` and `{ issues }`.
        if (isObjectAssign(node))
          for (const argument of node.arguments)
            if (argument.type === "ObjectExpression")
              for (const property of argument.properties) {
                if (keyName(property) === "schedules") reportTimers(node, "`Object.assign` of `schedules`");

                if (keyName(property) === "issues") reportIssues(node, "`Object.assign` of `issues`");
              }

        // `incarnation.schedules.set(track, tracked)`, `.issues.push(issue)` and the like.
        if (
          callee.type === "MemberExpression" &&
          writes.has(propertyName(callee)) &&
          callee.object.type === "MemberExpression"
        ) {
          if (propertyName(callee.object) === "schedules")
            reportTimers(node, `\`.schedules.${propertyName(callee)}\``);

          if (propertyName(callee.object) === "issues")
            reportIssues(node, `\`.issues.${propertyName(callee)}\``);
        }
      },
    };
  },
});
