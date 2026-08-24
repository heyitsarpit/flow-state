import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;

type FunctionMetrics = {
	node: FunctionNode;
	complexity: number;
	branches: number;
	nesting: number;
};

type RuleOptions = [{ threshold?: number; minimumBranches?: number }];

const DEFAULT_THRESHOLD = 15;
const DEFAULT_MINIMUM_BRANCHES = 3;

function optionNumber(
	option: unknown,
	key: "threshold" | "minimumBranches",
	defaultValue: number,
): number {
	if (typeof option !== "object" || option === null || Array.isArray(option)) {
		return defaultValue;
	}
	const value = (option as Record<string, unknown>)[key];
	return typeof value === "number" && Number.isInteger(value) && value > 0
		? value
		: defaultValue;
}

function addBranch(metrics: FunctionMetrics, weight = 1): void {
	metrics.complexity += weight + metrics.nesting;
	metrics.branches += 1;
}

function functionName(node: FunctionNode): string {
	if (node.id !== null) return node.id.name;
	if (node.parent.type === "VariableDeclarator" && node.parent.id.type === "Identifier") {
		return node.parent.id.name;
	}
	if (node.parent.type === "MethodDefinition" && node.parent.key.type === "Identifier") {
		return node.parent.key.name;
	}
	return "anonymous function";
}

/** Keep deeply branching functions small enough to read without reconstructing a control-flow graph. */
export const noExcessiveCognitiveComplexityRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow functions with excessive branching and nesting. Default threshold: 15; functions with fewer than 3 branching constructs are ignored.",
		},
		messages: {
			complexity:
				"Function `{{name}}` has cognitive complexity {{complexity}} (threshold {{threshold}}). Split the control flow into named helpers or simplify the branching.",
		},
		schema: [
			{
				type: "object",
				properties: {
					threshold: { type: "integer", minimum: 1 },
					minimumBranches: { type: "integer", minimum: 1 },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [
			{ threshold: DEFAULT_THRESHOLD, minimumBranches: DEFAULT_MINIMUM_BRANCHES },
		] satisfies RuleOptions,
	},
	createOnce(context) {
		const option = context.options?.[0];
		const threshold = optionNumber(option, "threshold", DEFAULT_THRESHOLD);
		const minimumBranches = optionNumber(
			option,
			"minimumBranches",
			DEFAULT_MINIMUM_BRANCHES,
		);
		const stack: FunctionMetrics[] = [];

		const enterFunction = (node: FunctionNode): void => {
			stack.push({ node, complexity: 0, branches: 0, nesting: 0 });
		};

		const exitFunction = (): void => {
			const metrics = stack.pop();
			if (
				metrics === undefined ||
				metrics.complexity <= threshold ||
				metrics.branches < minimumBranches
			) {
				return;
			}
			context.report({
				node: metrics.node,
				messageId: "complexity",
				data: {
					name: functionName(metrics.node),
					complexity: metrics.complexity,
					threshold,
				},
			});
		};

		const branch = (nested: boolean): void => {
			const metrics = stack.at(-1);
			if (metrics === undefined) return;
			addBranch(metrics);
			if (nested) metrics.nesting += 1;
		};

		const leaveNestedBranch = (): void => {
			const metrics = stack.at(-1);
			if (metrics !== undefined && metrics.nesting > 0) metrics.nesting -= 1;
		};

		return {
			FunctionDeclaration: enterFunction,
			"FunctionDeclaration:exit": exitFunction,
			FunctionExpression: enterFunction,
			"FunctionExpression:exit": exitFunction,
			ArrowFunctionExpression: enterFunction,
			"ArrowFunctionExpression:exit": exitFunction,
			TSDeclareFunction: enterFunction,
			"TSDeclareFunction:exit": exitFunction,
			TSEmptyBodyFunctionExpression: enterFunction,
			"TSEmptyBodyFunctionExpression:exit": exitFunction,
			IfStatement() {
				branch(true);
			},
			"IfStatement:exit": leaveNestedBranch,
			ForStatement() {
				branch(true);
			},
			"ForStatement:exit": leaveNestedBranch,
			ForInStatement() {
				branch(true);
			},
			"ForInStatement:exit": leaveNestedBranch,
			ForOfStatement() {
				branch(true);
			},
			"ForOfStatement:exit": leaveNestedBranch,
			WhileStatement() {
				branch(true);
			},
			"WhileStatement:exit": leaveNestedBranch,
			DoWhileStatement() {
				branch(true);
			},
			"DoWhileStatement:exit": leaveNestedBranch,
			SwitchStatement() {
				branch(true);
			},
			"SwitchStatement:exit": leaveNestedBranch,
			SwitchCase(node: ESTree.SwitchCase) {
				if (node.test !== null) branch(false);
			},
			CatchClause() {
				branch(true);
			},
			"CatchClause:exit": leaveNestedBranch,
			ConditionalExpression() {
				branch(true);
			},
			"ConditionalExpression:exit": leaveNestedBranch,
			LogicalExpression() {
				const metrics = stack.at(-1);
				if (metrics !== undefined) addBranch(metrics, 1);
			},
		};
	},
});
