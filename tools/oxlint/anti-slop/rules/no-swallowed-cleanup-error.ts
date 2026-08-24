import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const cleanupMethodNames = new Set(["close", "dispose", "release", "teardown", "unsubscribe"]);

import { isTestFile } from "../shared/file-scope.ts";

function staticCallName(call: ESTree.CallExpression): string | null {
  const { callee } = call;
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return null;
}

function returnsUndefined(handler: ESTree.Expression): boolean {
	if (handler.type !== "ArrowFunctionExpression" || handler.params.length !== 0) return false;
	const body = handler.body;
	if (body.type === "BlockStatement") {
		return body.body.length === 0 ||
			(body.body.length === 1 && body.body[0]?.type === "ReturnStatement" && body.body[0].argument === null);
	}
	return (
    (body.type === "Identifier" && body.name === "undefined") ||
    (body.type === "UnaryExpression" &&
      body.operator === "void" &&
      body.argument.type === "Literal" &&
      body.argument.value === 0)
  );
}

function swallowsCleanupRejection(node: ESTree.CallExpression): boolean {
  if (node.arguments.length !== 1) return false;
  const { callee } = node;
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier" ||
    callee.property.name !== "catch" ||
    callee.object.type !== "CallExpression"
  ) {
    return false;
  }

  const cleanupName = staticCallName(callee.object);
  const handler = node.arguments[0];
  return (
    cleanupName !== null &&
    cleanupMethodNames.has(cleanupName) &&
    handler.type !== "SpreadElement" &&
    returnsUndefined(handler)
  );
}

/** Keep cleanup failures observable in tests instead of converting rejection to success. */
export const noSwallowedCleanupErrorRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow narrowly matched cleanup rejections swallowed with catch(() => undefined) in tests.",
    },
    messages: {
      swallowedCleanupError:
        "This cleanup rejection is converted to success, so the test cannot detect a failed lifecycle operation. Assert the expected failure or let the rejection fail the test.",
    },
  },
  createOnce(context) {
    let testFile = false;

    return {
      Program() {
        testFile = isTestFile(context.filename);
      },
      CallExpression(node: ESTree.CallExpression) {
        if (testFile && swallowsCleanupRejection(node)) {
          context.report({ node, messageId: "swallowedCleanupError" });
        }
      },
    };
  },
});
