import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

const effectDurationMethods = new Set(["sleep", "timeout", "delay"]);
const scheduleDurationMethods = new Set(["spaced", "fixed", "windowed", "exponential"]);

function isNumericLiteral(node: ESTree.Expression | ESTree.SpreadElement | undefined): boolean {
	if (node?.type === "Literal") return typeof node.value === "number";
	return node?.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "Literal" && typeof node.argument.value === "number";
}

function durationArgumentIndex(method: string, argumentCount: number): number | null {
	if (argumentCount === 1) return 0;
	if (argumentCount === 2 && (method === "timeout" || method === "delay")) return 1;
	return null;
}

/** Require duration units to be visible instead of relying on milliseconds by default. */
export const noNumericDurationRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description: "Disallow bare numeric duration arguments in Effect and Schedule APIs.",
		},
		messages: {
			duration:
				"Bare numeric durations hide their unit. Use Duration.seconds/millis or a unit-tagged duration string.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				const callee = node.callee;
				if (
					callee.type !== "MemberExpression" ||
					callee.computed ||
					callee.object.type !== "Identifier" ||
					callee.property.type !== "Identifier"
				) {
					return;
				}

				const method = callee.property.name;
				let argumentIndex: number | null = null;
				if (
					isImportedFromEffect(context.sourceCode, callee.object, new Set(["Effect"])) &&
					effectDurationMethods.has(method)
				) {
					argumentIndex = durationArgumentIndex(method, node.arguments.length);
				} else if (
					isImportedFromEffect(context.sourceCode, callee.object, new Set(["Schedule"])) &&
					scheduleDurationMethods.has(method)
				) {
					argumentIndex = 0;
				}

				if (argumentIndex !== null && isNumericLiteral(node.arguments[argumentIndex])) {
					context.report({ node: node.arguments[argumentIndex], messageId: "duration" });
				}
			},
		};
	},
});
