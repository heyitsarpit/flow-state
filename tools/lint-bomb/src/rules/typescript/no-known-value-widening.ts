import { defineRule } from "@oxlint/plugins";

import {
	classifyWideningTarget,
	createTypeEnvironment,
	isKnownEvidenceExpression,
	type TypeEnvironment,
	type WideningTarget,
} from "../../shared/dictionary-types.ts";
import { containsUnknownType } from "../../shared/typescript-type.ts";

import { resolveVariable } from "../../shared/scope.ts";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

type FunctionExpression = ESTree.ArrowFunctionExpression | ESTree.Function;

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

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
	if (variable.defs.length !== 1) return null;
	const [definition] = variable.defs;
	return definition?.type === "Variable" && definition.node.type === "VariableDeclarator"
		? definition.node
		: null;
}

function isStableConstVariable(variable: Variable, declarator: ESTree.VariableDeclarator): boolean {
	return (
		declarator.parent.type === "VariableDeclaration" &&
		declarator.parent.kind === "const" &&
		variable.references.every((reference) => reference.init || !reference.isWrite())
	);
}

function hasKnownEvidence(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	visitedVariables = new Set<Variable>(),
): boolean {
	if (isKnownEvidenceExpression(expression)) return true;
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || visitedVariables.has(variable)) return false;
	const declarator = variableDeclarator(variable);
	if (
		declarator === null ||
		declarator.init === null ||
		!isStableConstVariable(variable, declarator)
	) {
		return false;
	}
	visitedVariables.add(variable);
	return hasKnownEvidence(sourceCode, declarator.init, visitedVariables);
}

function annotationTarget(
	annotation: ESTree.TSTypeAnnotation | null | undefined,
	environment: TypeEnvironment,
): WideningTarget | null {
	return annotation === null || annotation === undefined || containsUnknownType(annotation.typeAnnotation)
		? null
		: classifyWideningTarget(annotation.typeAnnotation, environment, annotation.typeAnnotation);
}

function enclosingFunction(node: ESTree.Node): FunctionExpression | null {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (
			current.type === "ArrowFunctionExpression" ||
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression"
		) {
			return current;
		}
		current = current.parent;
	}
	return null;
}

function sourceKeyName(sourceCode: SourceCode, key: ESTree.PropertyKey): string {
	if (key.type === "Identifier" || key.type === "PrivateIdentifier") return key.name;
	if (key.type === "Literal") return String(key.value);
	return sourceCode.getText(key);
}

function functionName(sourceCode: SourceCode, owner: FunctionExpression | null): string {
	if (owner === null) return "anonymous function";
	if (owner.id !== null) return owner.id.name;
	const parent = owner.parent;
	if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier")
		return parent.id.name;
	if (parent.type === "MethodDefinition") return sourceKeyName(sourceCode, parent.key);
	return "anonymous function";
}

function isEmptyObjectExpression(expression: ESTree.Expression): boolean {
	const unwrapped = unwrapExpression(expression);
	return unwrapped.type === "ObjectExpression" && unwrapped.properties.length === 0;
}

function staticObjectKey(key: ESTree.PropertyKey, computed: boolean): string | null {
	if (!computed && key.type === "Identifier") return key.name;
	if (key.type === "Literal" && (typeof key.value === "string" || typeof key.value === "number")) {
		return String(key.value);
	}
	return null;
}

function unwrapParenthesizedExpression(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (current.type === "ParenthesizedExpression") current = current.expression;
	return current;
}

function unwrapParenthesizedType(type: ESTree.TSType): ESTree.TSType {
	let current = type;
	while (current.type === "TSParenthesizedType") current = current.typeAnnotation;
	return current;
}

/** Match only data-only literal shapes whose simple annotation preserves their inferred fields. */
function typeLiteralValueMatches(expression: ESTree.Expression, type: ESTree.TSType): boolean {
	const value = unwrapParenthesizedExpression(expression);
	const expected = unwrapParenthesizedType(type);
	if (value.type === "ObjectExpression" && expected.type === "TSTypeLiteral") {
		if (value.properties.length !== expected.members.length) return false;
		const values = new Map<string, ESTree.Expression>();
		for (const property of value.properties) {
			if (property.type !== "Property" || property.kind !== "init" || property.method || property.shorthand) {
				return false;
			}
			const key = staticObjectKey(property.key, property.computed);
			if (key === null || values.has(key)) return false;
			values.set(key, property.value);
		}
		const seen = new Set<string>();
		for (const member of expected.members) {
			if (member.type !== "TSPropertySignature" || member.optional || member.typeAnnotation === null) {
				return false;
			}
			const key = staticObjectKey(member.key, member.computed);
			const actual = key === null ? undefined : values.get(key);
			if (key === null || actual === undefined || seen.has(key)) return false;
			seen.add(key);
			if (!typeLiteralValueMatches(actual, member.typeAnnotation.typeAnnotation)) return false;
		}
		return seen.size === values.size;
	}

	if (value.type === "Literal") {
		if (typeof value.value === "string") {
			return expected.type === "TSStringKeyword" ||
				(expected.type === "TSLiteralType" && expected.literal.type === "Literal" && expected.literal.value === value.value);
		}
		if (typeof value.value === "number") {
			return expected.type === "TSNumberKeyword" ||
				(expected.type === "TSLiteralType" && expected.literal.type === "Literal" && expected.literal.value === value.value);
		}
		if (typeof value.value === "boolean") {
			return expected.type === "TSBooleanKeyword" ||
				(expected.type === "TSLiteralType" && expected.literal.type === "Literal" && expected.literal.value === value.value);
		}
		if (value.value === null) return expected.type === "TSNullKeyword";
	}
	if (value.type === "TemplateLiteral" && value.expressions.length === 0) {
		return expected.type === "TSStringKeyword" ||
			(expected.type === "TSLiteralType" && expected.literal.type === "Literal" && expected.literal.value === value.quasis[0]?.value.cooked);
	}
	return false;
}

function preservesSimpleObjectShape(
	expression: ESTree.Expression,
	type: ESTree.TSType | null | undefined,
): boolean {
	return type !== null && type !== undefined && typeLiteralValueMatches(expression, type);
}

function isDictionaryAccumulatorTarget(destination: WideningTarget): boolean {
	return destination.kind === "open dictionary" || destination.kind === "generic container";
}

function hasParentAssertion(node: ESTree.Node): boolean {
	return node.parent?.type === "TSAsExpression" || node.parent?.type === "TSTypeAssertion";
}

/** Detect sound syntactic cases where a known value is explicitly widened and loses evidence. */
export const noKnownValueWideningRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow syntactically established values from flowing into explicitly broad or anonymous target types that discard useful evidence.",
		},
		messages: {
			widening:
				"The explicit {{target}} type on {{subject}} discards known type evidence. Preserve inference and generic relationships, or check compatibility with satisfies. Keep deliberate named contracts and valid finite-key dictionaries; review whether a broader dictionary is intentionally open before replacing it.",
		},
	},
	createOnce(context) {
		let environment: TypeEnvironment | null = null;
		const reportedExpressions = new Set<string>();

		const reportFlow = (
			expression: ESTree.Expression,
			destination: WideningTarget | null,
			subject: string,
			targetType?: ESTree.TSType | null,
		) => {
			if (destination === null) return;
			if (destination.kind === "anonymous object" && preservesSimpleObjectShape(expression, targetType)) return;
			if (
				isDictionaryAccumulatorTarget(destination) &&
				isEmptyObjectExpression(expression)
			) {
				return;
			}
			if (!hasKnownEvidence(context.sourceCode, expression)) return;
			const key = `${expression.start}:${expression.end}`;
			if (reportedExpressions.has(key)) return;
			reportedExpressions.add(key);
			context.report({
				node: expression,
				messageId: "widening",
				data: { subject, target: destination.kind },
			});
		};

		const targetFromAnnotation = (annotation: ESTree.TSTypeAnnotation | null | undefined) =>
			environment === null ? null : annotationTarget(annotation, environment);

		return {
			Program(node) {
				reportedExpressions.clear();
				environment = createTypeEnvironment(node);
			},
				VariableDeclarator(node) {
					if (
						node.init === null ||
						node.id.type !== "Identifier" ||
						node.init.type === "TSAsExpression" ||
						node.init.type === "TSTypeAssertion"
					) return;
				reportFlow(
					node.init,
					targetFromAnnotation(node.id.typeAnnotation),
					`binding \`${node.id.name}\``,
					node.id.typeAnnotation?.typeAnnotation,
				);
			},
			PropertyDefinition(node) {
				if (node.value === null) return;
				reportFlow(
					node.value,
					targetFromAnnotation(node.typeAnnotation),
					`property \`${sourceKeyName(context.sourceCode, node.key)}\``,
					node.typeAnnotation?.typeAnnotation,
				);
			},
			AccessorProperty(node) {
				if (node.value === null) return;
				reportFlow(
					node.value,
					targetFromAnnotation(node.typeAnnotation),
					`property \`${sourceKeyName(context.sourceCode, node.key)}\``,
					node.typeAnnotation?.typeAnnotation,
				);
			},
			AssignmentExpression(node) {
				if (node.operator !== "=" || node.left.type !== "Identifier") return;
				const variable = resolveVariable(context.sourceCode, node.left);
				if (variable === null) return;
				const declarator = variableDeclarator(variable);
				if (declarator === null || declarator.id.type !== "Identifier") return;
				reportFlow(
					node.right,
					targetFromAnnotation(declarator.id.typeAnnotation),
					`binding \`${declarator.id.name}\``,
					declarator.id.typeAnnotation?.typeAnnotation,
				);
			},
			ReturnStatement(node) {
				if (node.argument === null) return;
				const owner = enclosingFunction(node);
				reportFlow(
					node.argument,
					targetFromAnnotation(owner?.returnType),
					`return value of \`${functionName(context.sourceCode, owner)}\``,
					owner?.returnType?.typeAnnotation,
				);
			},
			ArrowFunctionExpression(node) {
				if (node.body.type === "BlockStatement") return;
				reportFlow(
					node.body,
					targetFromAnnotation(node.returnType),
					`return value of \`${functionName(context.sourceCode, node)}\``,
					node.returnType?.typeAnnotation,
				);
			},
			TSAsExpression(node) {
				if (environment === null || hasParentAssertion(node) || containsUnknownType(node.typeAnnotation)) return;
				reportFlow(
					node.expression,
						classifyWideningTarget(node.typeAnnotation, environment, node.typeAnnotation),
					"assertion",
					node.typeAnnotation,
				);
			},
			TSTypeAssertion(node) {
				if (environment === null || hasParentAssertion(node) || containsUnknownType(node.typeAnnotation)) return;
				reportFlow(
					node.expression,
						classifyWideningTarget(node.typeAnnotation, environment, node.typeAnnotation),
					"assertion",
					node.typeAnnotation,
				);
			},
		};
	},
});
