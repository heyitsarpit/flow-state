import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { isTestFile } from "../shared/file-scope.ts";

function isGlobalPromise(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): boolean {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable.defs.length === 0;
    scope = scope.upper;
  }
  return true;
}

function isBarePromiseResolveAwait(sourceCode: SourceCode, node: ESTree.AwaitExpression): boolean {
  if (node.parent.type !== "ExpressionStatement") return false;
  const call = node.argument;
  if (call.type !== "CallExpression" || call.arguments.length !== 0) return false;
  const callee = call.callee;
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Promise" &&
    isGlobalPromise(sourceCode, callee.object) &&
    callee.property.type === "Identifier" &&
    callee.property.name === "resolve"
  );
}

/** Disallow scheduler timing barriers disguised as an empty resolved Promise in tests. */
export const noPromiseMicrotaskBarrierRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow bare await Promise.resolve() scheduler barriers in test files.",
    },
    messages: {
      microtaskBarrier:
        "This test depends on an implicit microtask turn. Await an explicit lifecycle signal or use the deterministic scheduler owned by the test harness.",
    },
  },
  createOnce(context) {
    let testFile = false;

    return {
      Program() {
        testFile = isTestFile(context.filename);
      },
      AwaitExpression(node: ESTree.AwaitExpression) {
        if (testFile && isBarePromiseResolveAwait(context.sourceCode, node)) {
          context.report({ node, messageId: "microtaskBarrier" });
        }
      },
    };
  },
});
