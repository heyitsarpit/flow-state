import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

const effectDurationMethods = new Set([
	"cachedInvalidateWithTTL",
	"cachedWithTTL",
	"delay",
	"timeout",
	"timeoutOption",
]);
const scheduleDurationMethods = new Set([
	"duration",
	"during",
	"exponential",
	"fibonacci",
	"fixed",
	"spaced",
	"windowed",
]);

function memberName(expression: ESTree.MemberExpression): string | null {
	if (!expression.computed && expression.property.type === "Identifier") return expression.property.name;
	return expression.computed && expression.property.type === "Literal" && typeof expression.property.value === "string"
		? expression.property.value
		: null;
}

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression"
	) {
		current = current.expression;
	}
	return current;
}

function isNumericLiteral(node: ESTree.Expression | ESTree.SpreadElement | undefined): node is ESTree.Expression {
	if (node === undefined || node.type === "SpreadElement") return false;
	const unwrapped = unwrapExpression(node);
	if (unwrapped.type === "Literal") return typeof unwrapped.value === "number";
	return (
		unwrapped.type === "UnaryExpression" &&
		unwrapped.operator === "-" &&
		unwrapped.argument.type === "Literal" &&
		typeof unwrapped.argument.value === "number"
	);
}

function propertyName(property: { computed: boolean; key: ESTree.PropertyKey }): string | null {
	if (property.computed) {
		return property.key.type === "Literal" && typeof property.key.value === "string"
			? property.key.value
			: null;
	}
	return property.key.type === "Identifier" ? property.key.name : null;
}

function numericDurationProperty(
	argument: ESTree.Expression | ESTree.SpreadElement | undefined,
): ESTree.Expression | null {
	if (argument === undefined || argument.type === "SpreadElement") return null;
	const object = unwrapExpression(argument);
	if (object.type !== "ObjectExpression") return null;
	for (const property of object.properties) {
		if (
			property.type === "Property" &&
			propertyName(property) === "duration" &&
			isNumericLiteral(property.value)
		) {
			return property.value;
		}
	}
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
					callee.type !== "MemberExpression"
				) {
					return;
				}

				const method = memberName(callee);
				if (method === null) return;
				const isEffect = isImportedFromEffect(
					context.sourceCode,
					callee.object,
					new Set(["Effect"]),
				);
				const isSchedule = isImportedFromEffect(
					context.sourceCode,
					callee.object,
					new Set(["Schedule"]),
				);

				let duration: ESTree.Expression | ESTree.SpreadElement | undefined;
				if (isEffect && method === "sleep") {
					duration = node.arguments[0];
				} else if (isEffect && effectDurationMethods.has(method)) {
					duration = node.arguments[node.arguments.length === 1 ? 0 : 1];
				} else if (isSchedule && scheduleDurationMethods.has(method)) {
					duration = node.arguments[0];
				}

				if (isNumericLiteral(duration)) {
					context.report({ node: duration, messageId: "duration" });
					return;
				}

				const options =
					isEffect && method === "timeoutOrElse"
						? node.arguments[node.arguments.length === 1 ? 0 : 1]
						: isSchedule && method === "upTo"
							? node.arguments[node.arguments.length === 1 ? 0 : 1]
							: undefined;
				const numericProperty = numericDurationProperty(options);
				if (numericProperty !== null) {
					context.report({ node: numericProperty, messageId: "duration" });
				}
			},
		};
	},
});
