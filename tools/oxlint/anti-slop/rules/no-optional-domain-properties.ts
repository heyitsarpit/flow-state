import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isPathWithin } from "../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];
type TypeSubstitutions = ReadonlyMap<string, ESTree.TSType>;

const defaultSourceRoots = [
	"packages/flow-state/src/core/api",
	"packages/flow-state/src/vnext",
	"packages/flow-state-rewrite/src/public",
] as const;

type PropertyNode = ESTree.TSPropertySignature | ESTree.PropertyDefinition | ESTree.AccessorProperty;

function unwrapType(type: ESTree.TSType): ESTree.TSType {
	return type.type === "TSParenthesizedType" ? unwrapType(type.typeAnnotation) : type;
}

function typeReferenceName(type: ESTree.TSTypeReference): string | null {
	if (type.typeName.type === "Identifier") return type.typeName.name;
	return type.typeName.type === "TSQualifiedName" ? type.typeName.right.name : null;
}

function containsNullishTupleElement(
	element: ESTree.TSTupleElement,
	aliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>,
	substitutions: TypeSubstitutions,
	visitedAliases: ReadonlySet<string>,
): boolean {
	if (element.type === "TSOptionalType") return true;
	if (element.type === "TSNamedTupleMember") {
		return (
			element.optional ||
			containsNullishTupleElement(element.elementType, aliases, substitutions, visitedAliases)
		);
	}
	if (element.type === "TSRestType") {
		return containsNullishTupleElement(element.typeAnnotation, aliases, substitutions, visitedAliases);
	}
	return containsNullishType(element, aliases, substitutions, visitedAliases);
}

function containsNullishType(
	type: ESTree.TSType,
	aliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>,
	substitutions: TypeSubstitutions = new Map(),
	visitedAliases: ReadonlySet<string> = new Set(),
): boolean {
	const unwrapped = unwrapType(type);
	if (unwrapped.type === "TSTypeReference") {
		const name = typeReferenceName(unwrapped);
		const substitution = name === null ? undefined : substitutions.get(name);
		if (substitution !== undefined) {
			return containsNullishType(substitution, aliases, substitutions, visitedAliases);
		}
		const alias = name === null ? undefined : aliases.get(name);
		if (alias !== undefined && !visitedAliases.has(name!)) {
			const nextSubstitutions = new Map(substitutions);
			for (const [index, parameter] of (alias.typeParameters?.params ?? []).entries()) {
				const argument = unwrapped.typeArguments?.params[index] ?? parameter.default;
				if (argument !== null && argument !== undefined) {
					nextSubstitutions.set(parameter.name.name, argument);
				}
			}
			return containsNullishType(
				alias.typeAnnotation,
				aliases,
				nextSubstitutions,
				new Set([...visitedAliases, name!]),
			);
		}
		return unwrapped.typeArguments?.params.some((argument) =>
			containsNullishType(argument, aliases, substitutions, visitedAliases),
		) ?? false;
	}
	if (unwrapped.type === "TSNullKeyword" || unwrapped.type === "TSUndefinedKeyword") return true;
	if (unwrapped.type === "TSUnionType" || unwrapped.type === "TSIntersectionType") {
		return unwrapped.types.some((member) =>
			containsNullishType(member, aliases, substitutions, visitedAliases),
		);
	}
	if (unwrapped.type === "TSArrayType") {
		return containsNullishType(unwrapped.elementType, aliases, substitutions, visitedAliases);
	}
	if (unwrapped.type === "TSTupleType") {
		return unwrapped.elementTypes.some((element) =>
			containsNullishTupleElement(element, aliases, substitutions, visitedAliases),
		);
	}
	return false;
}

function propertyType(node: PropertyNode): ESTree.TSType | null {
	return node.typeAnnotation === null || node.typeAnnotation === undefined
		? null
		: node.typeAnnotation.typeAnnotation;
}

/** Keep configured domain properties required; use Option for expected absence. */
export const noOptionalDomainPropertiesRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow optional and explicitly nullish properties in configured domain source roots.",
		},
		messages: {
			domainProperty:
				"Domain properties must be required and non-nullish. Use Option<T> for expected absence.",
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
		defaultOptions: [{ sourceRoots: [...defaultSourceRoots] }] satisfies RuleOptions,
	},
	createOnce(context) {
		let sourceFile = false;
		const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();
		const check = (node: PropertyNode) => {
			const type = propertyType(node);
			if (
				sourceFile &&
				(node.optional === true ||
					(type !== null && containsNullishType(type, aliases)))
			) {
				context.report({ node, messageId: "domainProperty" });
			}
		};

		return {
			Program() {
				aliases.clear();
				for (const statement of context.sourceCode.ast.body) {
					const declaration =
						statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
					if (declaration?.type === "TSTypeAliasDeclaration") {
						aliases.set(declaration.id.name, declaration);
					}
				}
				const option = context.options?.[0];
				const rawSourceRoots =
					typeof option === "object" && option !== null && !Array.isArray(option)
						? option.sourceRoots
						: undefined;
				const configuredRoots =
					Array.isArray(rawSourceRoots) &&
					rawSourceRoots.every((root): root is string => typeof root === "string")
						? rawSourceRoots
						: defaultSourceRoots;
				sourceFile = configuredRoots.some((root) => isPathWithin(context.filename, root));
			},
			TSPropertySignature: check,
			PropertyDefinition: check,
			TSAbstractPropertyDefinition: check,
			AccessorProperty: check,
			TSAbstractAccessorProperty: check,
		};
	},
});
