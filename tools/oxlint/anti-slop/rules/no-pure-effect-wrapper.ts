import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";
import { isTestSupportFile } from "../shared/file-scope.ts";

function isPackageSource(filename: string): boolean {
	const normalized = filename.replaceAll("\\", "/");
	return /\/packages\/[^/]+\/src\//u.test(normalized);
}

function isPureExpression(node: ESTree.Node): boolean {
	switch (node.type) {
		case "Identifier":
		case "Literal":
			return true;
		case "TSAsExpression":
		case "TSSatisfiesExpression":
		case "TSNonNullExpression":
			return isPureExpression(node.expression);
		case "MemberExpression":
			return isPureExpression(node.object) && (!node.computed || isPureExpression(node.property));
		case "ArrayExpression":
			return node.elements.every((element) => element === null || isPureExpression(element));
		case "ObjectExpression":
			return node.properties.every((property) =>
				property.type === "SpreadElement"
					? isPureExpression(property.argument)
					: isPureExpression(property.value),
			);
		case "UnaryExpression":
			return isPureExpression(node.argument);
		case "BinaryExpression":
		case "LogicalExpression":
			return isPureExpression(node.left) && isPureExpression(node.right);
		case "ConditionalExpression":
			return (
				isPureExpression(node.test) &&
				isPureExpression(node.consequent) &&
				isPureExpression(node.alternate)
			);
		default:
			return false;
	}
}

/** Keep pure projections in ordinary TypeScript instead of wrapping them in Effect.succeed. */
export const noPureEffectWrapperRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Discourage wrapping an obviously pure value in Effect.succeed. Keep pure projections plain unless the Effect boundary is intentional.",
		},
		messages: {
			pureEffectWrapper:
				"This Effect.succeed wraps an obviously pure value. Keep the projection plain or document the intentional Effect boundary.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				if (!isPackageSource(context.filename) || isTestSupportFile(context.filename)) return;
				if (
					node.callee.type !== "MemberExpression" ||
					node.callee.computed ||
					node.callee.object.type !== "Identifier" ||
					node.callee.property.type !== "Identifier" ||
					node.callee.property.name !== "succeed" ||
					!isImportedFromEffect(context.sourceCode, node.callee.object, new Set(["Effect"])) ||
					node.arguments.length !== 1 ||
					node.arguments[0].type === "SpreadElement" ||
					!isPureExpression(node.arguments[0])
				) {
					return;
				}
				context.report({ node, messageId: "pureEffectWrapper" });
			},
		};
	},
});
