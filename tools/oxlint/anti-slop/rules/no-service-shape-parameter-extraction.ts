import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

function unwrapParentheses(type: ESTree.TSType): ESTree.TSType {
	return type.type === "TSParenthesizedType" ? unwrapParentheses(type.typeAnnotation) : type;
}

function isLiteralType(type: ESTree.TSType, value: number | string): boolean {
	const unwrapped = unwrapParentheses(type);
	return (
		unwrapped.type === "TSLiteralType" &&
		unwrapped.literal.type === "Literal" &&
		unwrapped.literal.value === value
	);
}

function isServiceConstructorType(
  sourceCode: SourceCode,
  type: ESTree.TSType,
): boolean {
	const unwrapped = unwrapParentheses(type);
	if (unwrapped.type !== "TSIndexedAccessType" || !isLiteralType(unwrapped.indexType, "of")) {
		return false;
	}

	const serviceType = unwrapParentheses(unwrapped.objectType);
  if (
    serviceType.type !== "TSTypeQuery" ||
    serviceType.exprName.type !== "Identifier" ||
    serviceType.typeArguments !== null
  ) return false;
  return isEffectServiceIdentifier(sourceCode, serviceType.exprName);
}

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
}

function isEffectServiceClass(sourceCode: SourceCode, node: ESTree.Node): boolean {
	if (node.type !== "ClassDeclaration") return false;
	let current = node.superClass;
	while (current !== null && current.type === "CallExpression") current = current.callee;
	if (current === null || current.type !== "MemberExpression" || current.object.type !== "Identifier") return false;
	if (
		(current.computed && (current.property.type !== "Literal" || current.property.value !== "Service")) ||
		(!current.computed && (current.property.type !== "Identifier" || current.property.name !== "Service"))
	) return false;
	return isImportedFromEffect(sourceCode, current.object, new Set(["Context", "Effect"]));
}

function isEffectServiceIdentifier(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): boolean {
  const variable = resolveVariable(sourceCode, identifier);
  return variable !== null && variable.defs.some((definition) =>
    definition.node.type === "ClassDeclaration" && isEffectServiceClass(sourceCode, definition.node),
  );
}

function isServiceShapeParameterExtraction(sourceCode: SourceCode, node: ESTree.TSIndexedAccessType): boolean {
	if (!isLiteralType(node.indexType, 0)) return false;

	const parametersType = unwrapParentheses(node.objectType);
	return (
		parametersType.type === "TSTypeReference" &&
		parametersType.typeName.type === "Identifier" &&
		parametersType.typeName.name === "Parameters" &&
		parametersType.typeArguments?.params.length === 1 &&
    isServiceConstructorType(sourceCode, parametersType.typeArguments.params[0])
	);
}

/** Keep Effect service contracts explicit instead of deriving them from constructor plumbing. */
export const noServiceShapeParameterExtractionRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				'Disallow deriving an Effect service contract through Parameters<(typeof Service)["of"]>[0].',
		},
		messages: {
			serviceShape:
				'Do not derive the service contract through Parameters<(typeof Service)["of"]>[0]. Declare the service type explicitly.',
		},
	},
	createOnce(context) {
		return {
			TSIndexedAccessType(node: ESTree.TSIndexedAccessType) {
          if (isServiceShapeParameterExtraction(context.sourceCode, node)) {
					context.report({ node, messageId: "serviceShape" });
				}
			},
		};
	},
});
