import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { isTestFile } from "../../shared/file-scope.ts";

function isUnshadowedGlobal(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): boolean {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable.defs.length === 0;
    scope = scope.upper;
  }
  return true;
}

function isNoopThenCallback(sourceCode: SourceCode, expression: ESTree.Node): boolean {
	if (expression.type === "Literal" && expression.value === null) return true;
	if (
		expression.type === "UnaryExpression" && expression.operator === "void" &&
		expression.argument.type === "Literal" && expression.argument.value === 0
	) return true;
	if (expression.type === "Identifier" && expression.name === "undefined") {
		return isUnshadowedGlobal(sourceCode, expression as ESTree.IdentifierReference);
	}
	if (expression.type === "ArrowFunctionExpression" || expression.type === "FunctionExpression") {
		const body = expression.body;
		if (body === null || body.type !== "BlockStatement") {
			return (
				expression.type === "ArrowFunctionExpression" &&
			body?.type === "Identifier" && body.name === "undefined" &&
				isUnshadowedGlobal(sourceCode, body as ESTree.IdentifierReference)
			);
		}
		if (body.body.length === 0) return true;
		return body.body.length === 1 && body.body[0]?.type === "ReturnStatement" &&
			body.body[0].argument === null;
	}
	return false;
}

function memberName(member: ESTree.MemberExpression): string | null {
  if (!member.computed && member.property.type === "Identifier") return member.property.name;
  return member.computed && member.property.type === "Literal" && typeof member.property.value === "string"
    ? member.property.value : null;
}

function isResolvedPromiseCall(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
	if (expression.type !== "CallExpression" || expression.arguments.length !== 0) return false;
	const callee = expression.callee;
	return (
		callee.type === "MemberExpression" &&
		callee.object.type === "Identifier" && callee.object.name === "Promise" &&
		isUnshadowedGlobal(sourceCode, callee.object) &&
		memberName(callee) === "resolve"
	);
}

function isBarePromiseResolveAwait(sourceCode: SourceCode, node: ESTree.AwaitExpression): boolean {
  if (node.parent.type !== "ExpressionStatement") return false;
  const call = node.argument;
	if (isResolvedPromiseCall(sourceCode, call)) return true;
	if (call.type !== "CallExpression" || call.arguments.length > 1) return false;
	const callee = call.callee;
	if (
		callee.type !== "MemberExpression" || memberName(callee) !== "then"
	) return false;
	const resolved = callee.object;
	if (!isResolvedPromiseCall(sourceCode, resolved)) return false;
	const callback = call.arguments[0];
	return callback === undefined || isNoopThenCallback(sourceCode, callback);
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
        "A microtask turn does not prove readiness or completion. Await a contract-owned lifecycle signal, such as Deferred.await. Use TestClock to control elapsed Effect time; advancing time does not independently prove that a lifecycle transition occurred.",
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
