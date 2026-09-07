import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { lexicalTypeParameterNames } from "../shared/lexical-type-parameters.ts";

type Parameter = ESTree.ParamPattern;
type FunctionWithContract =
	| ESTree.ArrowFunctionExpression
	| ESTree.Function
	| ESTree.TSCallSignatureDeclaration
	| ESTree.TSConstructSignatureDeclaration
	| ESTree.TSConstructorType
	| ESTree.TSFunctionType
	| ESTree.TSMethodSignature;

type TypeSubstitution = {
	readonly type: ESTree.TSType;
	readonly substitutions: ReadonlyMap<string, TypeSubstitution>;
};

function parameterAnnotation(parameter: Parameter): ESTree.TSTypeAnnotation | null | undefined {
	if (parameter.type === "TSParameterProperty") return parameterAnnotation(parameter.parameter);
	if (parameter.type === "RestElement") {
		return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
	}
	if (parameter.type === "AssignmentPattern") {
		return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
	}
	return parameter.typeAnnotation;
}

function parameterName(parameter: Parameter, sourceText: string): string {
	if (parameter.type === "TSParameterProperty") return parameterName(parameter.parameter, sourceText);
	if (parameter.type === "AssignmentPattern") return parameterName(parameter.left, sourceText);
	if (parameter.type === "RestElement") return parameterName(parameter.argument, sourceText);
	return parameter.type === "Identifier" ? parameter.name : sourceText;
}

function isOptionalParameter(parameter: Parameter): boolean {
	if (parameter.type === "TSParameterProperty") return isOptionalParameter(parameter.parameter);
	if (parameter.type === "AssignmentPattern") return true;
	return "optional" in parameter && parameter.optional === true;
}

function typeReferenceName(type: ESTree.TSTypeReference): string | null {
	if (type.typeName.type === "Identifier") return type.typeName.name;
	if (type.typeName.type === "TSQualifiedName") return type.typeName.right.name;
	return null;
}

function containsNullishTupleElement(
	element: ESTree.TSTupleElement,
	containsNullish: (type: ESTree.TSType) => boolean,
): boolean {
	if (element.type === "TSOptionalType") return true;
	if (element.type === "TSRestType") return containsNullish(element.typeAnnotation);
	if (element.type === "TSNamedTupleMember") {
		return element.optional || containsNullishTupleElement(element.elementType, containsNullish);
	}
	return containsNullish(element);
}

/** Disallow hidden absence in function inputs and outputs. */
export const noNullishFunctionContractsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow optional, nullish, and defaulted function contracts; use Option for expected absence and an explicit result or error channel for failure.",
		},
		messages: {
			nullishContract:
				"Function contract `{{name}}` hides absence with null, undefined, an optional parameter, or a default. Use Option<T> for expected absence, Result/Either for pure failure, or Effect's E channel for effectful failure.",
		},
	},
	createOnce(context) {
		const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();

		const containsNullish = (
			type: ESTree.TSType,
			shadowedAliases: ReadonlySet<string>,
			substitutions: ReadonlyMap<string, TypeSubstitution> = new Map(),
			visitedAliases = new Set<string>(),
			visitedTypes = new Set<ESTree.TSType>(),
		): boolean => {
			if (visitedTypes.has(type)) return false;
			const nextVisitedTypes = new Set(visitedTypes);
			nextVisitedTypes.add(type);
			if (type.type === "TSNullKeyword" || type.type === "TSUndefinedKeyword") return true;
			if (type.type === "TSParenthesizedType") {
				return containsNullish(type.typeAnnotation, shadowedAliases, substitutions, visitedAliases, nextVisitedTypes);
			}
			if (type.type === "TSUnionType" || type.type === "TSIntersectionType") {
				return type.types.some((member) =>
					containsNullish(member, shadowedAliases, substitutions, visitedAliases, nextVisitedTypes),
				);
			}
			if (type.type === "TSConditionalType") {
				return (
					containsNullish(type.trueType, shadowedAliases, substitutions, visitedAliases, nextVisitedTypes) ||
					containsNullish(type.falseType, shadowedAliases, substitutions, visitedAliases, nextVisitedTypes)
				);
			}
			if (type.type === "TSArrayType") {
				return containsNullish(type.elementType, shadowedAliases, substitutions, visitedAliases, nextVisitedTypes);
			}
			if (type.type === "TSTupleType") {
				return type.elementTypes.some((element) =>
					containsNullishTupleElement(element, (elementType) =>
						containsNullish(elementType, shadowedAliases, substitutions, visitedAliases, nextVisitedTypes),
					),
				);
			}
			if (type.type !== "TSTypeReference") return false;

			const name = typeReferenceName(type);
			if (name === null) return false;
			const substitution = substitutions.get(name);
			if (substitution !== undefined) {
				return containsNullish(
					substitution.type,
					shadowedAliases,
					substitution.substitutions,
					visitedAliases,
					nextVisitedTypes,
				);
			}

			if (!shadowedAliases.has(name) && !visitedAliases.has(name)) {
				const alias = type.typeName.type === "Identifier" ? aliases.get(name) : undefined;
				if (alias !== undefined) {
					const nextSubstitutions = new Map(substitutions);
					for (const [index, parameter] of (alias.typeParameters?.params ?? []).entries()) {
						const argument = type.typeArguments?.params[index] ?? parameter.default;
						if (argument !== null && argument !== undefined) {
							nextSubstitutions.set(parameter.name.name, { type: argument, substitutions });
						}
					}
					return containsNullish(
						alias.typeAnnotation,
						shadowedAliases,
						nextSubstitutions,
						new Set([...visitedAliases, name]),
						nextVisitedTypes,
					);
				}
			}

			// Inspect type arguments so Promise<T | undefined>, Effect<T | null, ...>,
			// and named containers cannot hide the nullish contract.
			return type.typeArguments?.params.some((argument) =>
				containsNullish(argument, shadowedAliases, substitutions, visitedAliases, nextVisitedTypes),
			) ?? false;
		};

		const report = (node: ESTree.Node, name: string) => {
			context.report({ node, messageId: "nullishContract", data: { name } });
		};

		const checkFunction = (node: FunctionWithContract) => {
			const shadowedAliases = lexicalTypeParameterNames(node, context.sourceCode.visitorKeys);
			for (const parameter of node.params) {
				if (isOptionalParameter(parameter)) {
					report(parameter, parameterName(parameter, context.sourceCode.getText(parameter)));
					continue;
				}
				const annotation = parameterAnnotation(parameter);
				if (
					annotation !== null &&
					annotation !== undefined &&
					containsNullish(annotation.typeAnnotation, shadowedAliases)
				) {
					report(parameter, parameterName(parameter, context.sourceCode.getText(parameter)));
				}
			}

			const returnType = node.returnType;
			if (
				returnType !== null &&
				returnType !== undefined &&
				containsNullish(returnType.typeAnnotation, shadowedAliases)
			) {
				report(returnType.typeAnnotation, "return");
			}
		};

		return {
			Program(node) {
				aliases.clear();
				for (const statement of node.body) {
					const declaration =
						statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
					if (declaration?.type === "TSTypeAliasDeclaration") aliases.set(declaration.id.name, declaration);
				}
			},
			ArrowFunctionExpression: checkFunction,
			FunctionDeclaration: checkFunction,
			FunctionExpression: checkFunction,
			TSCallSignatureDeclaration: checkFunction,
			TSConstructSignatureDeclaration: checkFunction,
			TSConstructorType: checkFunction,
			TSDeclareFunction: checkFunction,
			TSEmptyBodyFunctionExpression: checkFunction,
			TSFunctionType: checkFunction,
			TSMethodSignature: checkFunction,
		};
	},
});
