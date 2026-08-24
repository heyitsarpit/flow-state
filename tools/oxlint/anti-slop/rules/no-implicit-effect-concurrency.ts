import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

const combinators = new Set(["all", "forEach", "validate"]);

function hasConcurrencyOption(node: ESTree.CallExpression): boolean {
	const lastArgument = node.arguments.at(-1);
	if (lastArgument === undefined || lastArgument.type === "SpreadElement") return false;
	let current: ESTree.Expression = lastArgument;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression"
	) {
		current = current.expression;
	}
	if (current.type !== "ObjectExpression") return false;
	return current.properties.some(
		(property) =>
			property.type === "Property" &&
			(property.computed
				? property.key.type === "Literal" && property.key.value === "concurrency"
				: property.key.type === "Identifier" && property.key.name === "concurrency"),
	);
}

/** Make serial-versus-parallel Effect coordination explicit at each call site. */
export const noImplicitEffectConcurrencyRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Require an explicit concurrency option on sequential-default Effect combinators.",
		},
		messages: {
			concurrency:
				"Effect.{{method}} runs sequentially by default. Pass an explicit { concurrency } option so the coordination choice is visible.",
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
					callee.property.type !== "Identifier" ||
					!combinators.has(callee.property.name) ||
					!isImportedFromEffect(context.sourceCode, callee.object, new Set(["Effect"])) ||
					 hasConcurrencyOption(node)
				) {
					return;
				}
				context.report({
					node,
					messageId: "concurrency",
					data: { method: callee.property.name },
				});
			},
		};
	},
});
