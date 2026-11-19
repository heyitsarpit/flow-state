import { defineRule } from "@oxlint/plugins";

import { appliesTo, optionsSchema, propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";
import type { Options } from "./shared.ts";

const comparisons = new Set(["===", "!==", "==", "!="]);

const isString = (node: ESTree.Node | null | undefined) =>
  node?.type === "Literal" && typeof node.value === "string";

// What a tag test reads, when the node is one: `X.$is("A")(subject)` or `subject._tag === "A"`,
// negated or in parentheses.
const subjectOf = (node: ESTree.Node, text: (n: ESTree.Node) => string): string | undefined => {
  if (node.type === "ParenthesizedExpression") return subjectOf(node.expression, text);

  if (node.type === "UnaryExpression" && node.operator === "!") return subjectOf(node.argument, text);

  if (
    node.type === "CallExpression" &&
    node.callee.type === "CallExpression" &&
    node.callee.callee.type === "MemberExpression" &&
    propertyName(node.callee.callee) === "$is" &&
    isString(node.callee.arguments[0]) &&
    node.arguments[0] !== undefined
  )
    return text(node.arguments[0]);

  if (node.type === "BinaryExpression" && comparisons.has(node.operator)) {
    const read = isString(node.right) ? node.left : isString(node.left) ? node.right : undefined;

    if (read?.type === "MemberExpression" && propertyName(read) === "_tag") return text(read.object);
  }

  return undefined;
};

// The operands of one `||` or `&&` chain, flattened through nested chains of either operator.
const operands = (node: ESTree.Node): ReadonlyArray<ESTree.Node> =>
  node.type === "LogicalExpression" && (node.operator === "||" || node.operator === "&&")
    ? [...operands(node.left), ...operands(node.right)]
    : node.type === "ParenthesizedExpression"
      ? operands(node.expression)
      : [node];

// The tests of an if / else-if ladder, from its head down.
const ladder = (node: ESTree.IfStatement): ReadonlyArray<ESTree.Node> =>
  node.alternate?.type === "IfStatement" ? [node.test, ...ladder(node.alternate)] : [node.test];

// The tests of a nested ternary: `a ? x : b ? y : z`.
const ternaries = (node: ESTree.ConditionalExpression): ReadonlyArray<ESTree.Node> =>
  node.alternate.type === "ConditionalExpression"
    ? [node.test, ...ternaries(node.alternate)]
    : [node.test];

const repeats = (subjects: ReadonlyArray<string | undefined>) => {
  const seen = new Set<string>();

  for (const subject of subjects) {
    if (subject === undefined) continue;
    if (seen.has(subject)) return true;
    seen.add(subject);
  }

  return false;
};

// A closed set of tags is decided by `$match` or by a table keyed by tag (`satisfies Record<Tag, …>`), so a new
// tag is a compile error wherever it must be decided. Two tests of one value's tag joined by `||` or `&&`, an
// else-if ladder or a ternary chain over it leave every other tag, a later one included, to a silent default.
export const noTagChainRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "A value's tag is decided by `$match` or a table keyed by tag, never by a chain of tag tests.",
    },
    messages: {
      chain:
        "Two tests of `{{subject}}`'s tag in one chain leave every other tag to a default. Use `$match`, or a table `satisfies Record<Tag, …>`, so a new tag must be decided.",
    },
    schema: optionsSchema,
  },
  createOnce(context) {
    const text = (node: ESTree.Node) => context.sourceCode.getText(node);

    const check = (node: ESTree.Node, tests: ReadonlyArray<ESTree.Node>) => {
      const subjects = tests.map((t) => subjectOf(t, text));

      if (repeats(subjects))
        context.report({
          node,
          messageId: "chain",
          data: { subject: subjects.find((s, i) => s !== undefined && subjects.indexOf(s) !== i) ?? "" },
        });
    };

    return {
      before() {
        const rel = relativePath(context.filename);
        const given: Options = context.options[0] ?? {};

        return rel !== undefined && appliesTo(rel, given);
      },
      LogicalExpression(node: ESTree.LogicalExpression) {
        // Only the outermost chain is checked: its operands include every nested one.
        let parent = node.parent;

        while (parent?.type === "ParenthesizedExpression") parent = parent.parent;

        if (
          parent?.type === "LogicalExpression" &&
          (parent.operator === "||" || parent.operator === "&&")
        )
          return;
        check(node, operands(node));
      },
      IfStatement(node: ESTree.IfStatement) {
        if (node.parent?.type === "IfStatement" && node.parent.alternate === node) return;
        check(node, ladder(node));
      },
      ConditionalExpression(node: ESTree.ConditionalExpression) {
        if (node.parent?.type === "ConditionalExpression" && node.parent.alternate === node) return;
        check(node, ternaries(node));
      },
    };
  },
});
