import { defineRule } from "@oxlint/plugins";

import { propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";

// The callback options whose value is a list of read changes.
const CHANGE_LISTS = new Set(["writes", "optimistic"]);

type Fn = ESTree.ArrowFunctionExpression | ESTree.FunctionExpression;

const isFunction = (node: ESTree.Node | null | undefined): node is Fn =>
  node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";

const keyName = (node: ESTree.Property) => {
  if (node.computed) return undefined;
  if (node.key.type === "Identifier") return node.key.name;

  return node.key.type === "Literal" && typeof node.key.value === "string" ? node.key.value : undefined;
};

const calls = (node: ESTree.CallExpression, name: string) =>
  node.callee.type === "MemberExpression" && propertyName(node.callee) === name;

// Whether a block returns a value at its own level, not inside a nested function.
const returns = (node: ESTree.Node): boolean => {
  if (node.type === "ReturnStatement") return node.argument !== null;
  if (isFunction(node)) return false;

  return Object.entries(node).some(([key, child]) =>
    key === "parent"
      ? false
      : Array.isArray(child)
      ? child.some((c) => c !== null && typeof c === "object" && "type" in c && returns(c))
      : child !== null && typeof child === "object" && "type" in child && returns(child),
  );
};

// A temporary finder for the read-change refactor (Pending D41): the old `resource.write(key, data)`
// form, `O.x.setData`, a change list written as one record, the `InvalidWrite` name, and an update
// that returns nothing. It runs on demand, outside `nub run check`.
export const noOldReadChangeRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Read changes use `resource.set` and `resource.update`, in a list." },
    messages: {
      write: "`.write(` in `writes` or `optimistic` is the old form: use `resource.set` or `resource.update`.",
      setData: "`setData` is cut: write the change in the transaction's `writes`.",
      record: "`writes` and `optimistic` return a list of changes, not one record.",
      invalidWrite: "`InvalidWrite` is renamed `InvalidUpdate`.",
      noReturn: "An update returns the new data; this one returns nothing.",
    },
    schema: [],
  },
  createOnce(context) {
    // The change-list callbacks the walk is inside, and every function it is inside.
    const lists: Array<Fn> = [];
    const functions: Array<Fn> = [];

    return {
      before() {
        return relativePath(context.filename) !== undefined;
      },
      ArrowFunctionExpression(node: ESTree.ArrowFunctionExpression) {
        functions.push(node);
      },
      "ArrowFunctionExpression:exit"() {
        functions.pop();
      },
      FunctionExpression(node: ESTree.FunctionExpression) {
        functions.push(node);
      },
      "FunctionExpression:exit"() {
        functions.pop();
      },
      Property(node: ESTree.Property) {
        const name = keyName(node);

        if (name === undefined || !CHANGE_LISTS.has(name) || !isFunction(node.value)) return;

        lists.push(node.value);

        if (node.value.body.type === "ObjectExpression")
          context.report({ node: node.value.body, messageId: "record" });
      },
      "Property:exit"(node: ESTree.Property) {
        if (lists.at(-1) === node.value) lists.pop();
      },
      ReturnStatement(node: ESTree.ReturnStatement) {
        if (
          lists.length > 0 &&
          functions.at(-1) === lists.at(-1) &&
          node.argument?.type === "ObjectExpression"
        )
          context.report({ node, messageId: "record" });
      },
      CallExpression(node: ESTree.CallExpression) {
        if (lists.length > 0 && calls(node, "write")) context.report({ node, messageId: "write" });
        if (calls(node, "setData")) context.report({ node, messageId: "setData" });

        const update = node.arguments[1];

        if (
          calls(node, "update") &&
          isFunction(update) &&
          update.body.type === "BlockStatement" &&
          !returns(update.body)
        )
          context.report({ node, messageId: "noReturn" });
      },
      Identifier(node: ESTree.IdentifierName | ESTree.IdentifierReference) {
        if (node.name === "InvalidWrite") context.report({ node, messageId: "invalidWrite" });
      },
      Literal(node: ESTree.Literal) {
        if (node.value === "InvalidWrite") context.report({ node, messageId: "invalidWrite" });
      },
    };
  },
});
