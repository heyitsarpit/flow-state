import type { ESTree } from "@oxlint/plugins";

export function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression" ||
		current.type === "TSInstantiationExpression"
	) {
		current = current.expression;
	}
	return current;
}

export function memberName(expression: ESTree.MemberExpression): string | null {
	if (!expression.computed && expression.property.type === "Identifier") return expression.property.name;
	if (!expression.computed && expression.property.type !== "PrivateIdentifier") return null;
	if (expression.property.type === "Literal" && typeof expression.property.value === "string") {
		return expression.property.value;
	}
	if (
		expression.property.type === "TemplateLiteral" &&
		expression.property.expressions.length === 0 &&
		expression.property.quasis.length === 1
	) {
		return expression.property.quasis[0]?.value.cooked ?? expression.property.quasis[0]?.value.raw ?? null;
	}
	return null;
}

/** Only an explicitly unsafe API spelling is strong enough for a syntax-only review signal. */
export function isExplicitUnsafeMethod(expression: ESTree.MemberExpression): boolean {
	return memberName(expression)?.endsWith("Unsafe") ?? false;
}

const knownMutatingMethods = new Set(["add", "clear", "delete", "offer", "publish", "set", "update"]);

export function isKnownMutatingMethod(expression: ESTree.MemberExpression): boolean {
	const name = memberName(expression);
	return name !== null && knownMutatingMethods.has(name);
}
