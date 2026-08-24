import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isTestFile } from "../shared/file-scope.ts";

function isTestCall(node: ESTree.CallExpression): boolean {
	const isTestCallee = (callee: ESTree.Expression): boolean => {
		if (callee.type === "Identifier") return callee.name === "test" || callee.name === "it";
		if (callee.type === "CallExpression") return isTestCallee(callee.callee);
		return callee.type === "MemberExpression" &&
			!callee.computed &&
			callee.property.type === "Identifier" &&
			(["test", "it", "each", "only", "skip", "concurrent", "fails"] as readonly string[]).includes(callee.property.name) &&
			(callee.property.name === "test" || callee.property.name === "it" || isTestCallee(callee.object));
	};
	return isTestCallee(node.callee);
}

function isFunction(node: ESTree.Node): node is ESTree.Function | ESTree.ArrowFunctionExpression {
	return node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
}

function isAssertionCall(node: ESTree.CallExpression): boolean {
	const callee = node.callee;
	if (callee.type === "Identifier") {
		return callee.name === "expect" &&
			!(node.parent.type === "MemberExpression" && node.parent.object === node);
	}
	const isExpectationExpression = (expression: ESTree.Expression): boolean => {
		if (expression.type === "CallExpression") {
			return expression.callee.type === "Identifier" && expression.callee.name === "expect";
		}
		return expression.type === "MemberExpression" && !expression.computed && isExpectationExpression(expression.object);
	};
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.property.type === "Identifier" &&
		((callee.object.type === "Identifier" && callee.object.name === "expect" &&
			(callee.property.name === "assertions" || callee.property.name === "hasAssertions")) ||
			isExpectationExpression(callee.object))
	);
}

function callbackTestFunction(sourceCode: SourceCode, node: ESTree.CallExpression): ESTree.Node | null {
	const ancestors = sourceCode.getAncestors(node) as unknown as ESTree.Node[];
	for (let index = ancestors.length - 1; index >= 0; index -= 1) {
		const ancestor = ancestors[index];
		if (isFunction(ancestor)) {
			const parent = ancestor.parent;
			if (parent.type === "CallExpression" && isTestCall(parent)) return ancestor;
			return null;
		}
	}
	return null;
}

function isInsideIf(sourceCode: SourceCode, node: ESTree.CallExpression, fn: ESTree.Node): boolean {
	const ancestors = sourceCode.getAncestors(node) as unknown as ESTree.Node[];
	for (let index = ancestors.length - 1; index >= 0; index -= 1) {
		const ancestor = ancestors[index];
		if (ancestor === fn) return false;
		if (ancestor.type === "IfStatement") return true;
	}
	return false;
}

/** Reject tests whose only assertion is hidden behind a possibly skipped branch. */
export const noExpectInIfRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Disallow tests whose only assertion is nested inside an if statement.",
		},
		messages: {
			conditionalAssertion:
				"This test's only assertion is inside an if and may never run. Add an unconditional assertion or expect.assertions/expect.hasAssertions.",
		},
	},
	createOnce(context) {
		const assertions = new Map<ESTree.Node, { unconditional: boolean; conditional: ESTree.CallExpression[] }>();
		let testFile = false;

		return {
			Program() {
				testFile = isTestFile(context.filename);
			},
			CallExpression(node: ESTree.CallExpression) {
				if (!testFile) return;
				if (!isAssertionCall(node)) return;
				const fn = callbackTestFunction(context.sourceCode, node);
				if (fn === null) return;
				const state = assertions.get(fn) ?? { unconditional: false, conditional: [] };
				if (isInsideIf(context.sourceCode, node, fn)) state.conditional.push(node);
				else state.unconditional = true;
				assertions.set(fn, state);
			},
			"Program:exit"() {
				for (const state of assertions.values()) {
					if (!state.unconditional) {
						for (const node of state.conditional) {
							context.report({ node, messageId: "conditionalAssertion" });
						}
					}
				}
			},
		};
	},
});
