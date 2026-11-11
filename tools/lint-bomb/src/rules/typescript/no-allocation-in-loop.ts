import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isPathWithin } from "../../shared/module-path.ts";

const iterationMethods = new Set([
	"every",
	"filter",
	"find",
	"findIndex",
	"findLast",
	"findLastIndex",
	"flatMap",
	"forEach",
	"map",
	"reduce",
	"reduceRight",
	"some",
]);

type Loop =
	| ESTree.ForStatement
	| ESTree.ForInStatement
	| ESTree.ForOfStatement
	| ESTree.WhileStatement
	| ESTree.DoWhileStatement;

function isLoop(node: ESTree.Node): node is Loop {
	return (
		node.type === "ForStatement" ||
		node.type === "ForInStatement" ||
		node.type === "ForOfStatement" ||
		node.type === "WhileStatement" ||
		node.type === "DoWhileStatement"
	);
}

function isFunction(node: ESTree.Node): boolean {
	return (
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionExpression" ||
		node.type === "FunctionDeclaration"
	);
}

function isIterationCallback(node: ESTree.Node): boolean {
	const call = node.parent;
	if (call?.type !== "CallExpression" || !call.arguments.some((argument) => argument === node)) {
		return false;
	}
	const callee = call.callee;
	return (
		callee.type === "MemberExpression" &&
		callee.property.type === "Identifier" &&
		iterationMethods.has(callee.property.name)
	);
}

// Repeats per element: inside a loop's body, or inside an iteration method's callback.
function repeatsPerElement(node: ESTree.Node): boolean {
	let child: ESTree.Node = node;
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (isLoop(current) && current.body === child) return true;
		if (isFunction(current)) return isIterationCallback(current);
		child = current;
		current = current.parent;
	}
	return false;
}

function hasSourceRoots(option: unknown): option is { sourceRoots: string[] } {
	return (
		typeof option === "object" &&
		option !== null &&
		!Array.isArray(option) &&
		"sourceRoots" in option &&
		Array.isArray(option.sourceRoots) &&
		option.sourceRoots.every((root: unknown) => typeof root === "string")
	);
}

/** Flag allocations that run once per loop iteration or per element in configured hot paths. */
export const noAllocationInLoopRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Report object, array, new, closure and spread allocations inside loop bodies and iteration callbacks in configured hot-path source roots.",
		},
		messages: {
			allocation:
				"This allocates once per iteration in a hot path. Hoist it out of the loop, reuse one value, or loop without the per-element callback. If each element needs a new value, as when building a result, keep it and disable this line with the reason.",
		},
		schema: [
			{
				type: "object",
				properties: {
					sourceRoots: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{}],
	},
	createOnce(context) {
		let sourceFile = false;
		const check = (node: ESTree.Node) => {
			if (sourceFile && repeatsPerElement(node)) context.report({ node, messageId: "allocation" });
		};
		return {
			Program() {
				const option = context.options?.[0];
				sourceFile =
					!hasSourceRoots(option) ||
					option.sourceRoots.some((root) => isPathWithin(context.filename, root, context.cwd));
			},
			ObjectExpression: check,
			ArrayExpression: check,
			NewExpression: check,
			ArrowFunctionExpression: check,
			FunctionExpression: check,
			SpreadElement(node: ESTree.SpreadElement) {
				const container = node.parent;
				if (container?.type !== "CallExpression" && container?.type !== "NewExpression") check(node);
			},
		};
	},
});
