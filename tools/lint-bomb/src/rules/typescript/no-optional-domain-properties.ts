import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { createTypeEnvironment, resolveTypeAlias, type TypeEnvironment } from "../../shared/dictionary-types.ts";

import { isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];
type TypeSubstitution = { readonly type: ESTree.TSType; readonly substitutions: TypeSubstitutions };
type TypeSubstitutions = ReadonlyMap<string, TypeSubstitution>;

type PropertyNode = ESTree.TSPropertySignature | ESTree.PropertyDefinition | ESTree.AccessorProperty;

function unwrapType(type: ESTree.TSType): ESTree.TSType {
	return type.type === "TSParenthesizedType" ? unwrapType(type.typeAnnotation) : type;
}

function typeReferenceName(type: ESTree.TSTypeReference): string | null {
	if (type.typeName.type === "Identifier") return type.typeName.name;
	// A qualified reference has a different binding identity from any same-named
	// top-level alias; leave it unresolved without a namespace-aware type checker.
	return null;
}

function containsNullishTupleElement(
	element: ESTree.TSTupleElement,
	environment: TypeEnvironment,
	substitutions: TypeSubstitutions,
	visitedAliases: ReadonlySet<ESTree.TSTypeAliasDeclaration>,
): boolean {
	if (element.type === "TSOptionalType") return true;
	if (element.type === "TSNamedTupleMember") {
		return (
			element.optional ||
			containsNullishTupleElement(element.elementType, environment, substitutions, visitedAliases)
		);
	}
	if (element.type === "TSRestType") {
		return containsNullishTupleElement(element.typeAnnotation, environment, substitutions, visitedAliases);
	}
	return containsNullishType(element, environment, substitutions, visitedAliases);
}

function containsNullishType(
	type: ESTree.TSType,
	environment: TypeEnvironment,
	substitutions: TypeSubstitutions = new Map(),
	visitedAliases: ReadonlySet<ESTree.TSTypeAliasDeclaration> = new Set(),
): boolean {
	const unwrapped = unwrapType(type);
	if (unwrapped.type === "TSTypeReference") {
		const name = typeReferenceName(unwrapped);
		const substitution = name === null ? undefined : substitutions.get(name);
		if (substitution !== undefined) {
			return containsNullishType(substitution.type, environment, substitution.substitutions, visitedAliases);
		}
		const alias = resolveTypeAlias(unwrapped, environment);
		if (alias !== null && !visitedAliases.has(alias)) {
			const nextSubstitutions = new Map<string, TypeSubstitution>();
			for (const [index, parameter] of (alias.typeParameters?.params ?? []).entries()) {
				const explicitArgument = unwrapped.typeArguments?.params[index];
				const argument = explicitArgument ?? parameter.default;
				if (argument !== null && argument !== undefined) {
					nextSubstitutions.set(parameter.name.name, {
						type: argument,
						substitutions: explicitArgument === undefined ? new Map(nextSubstitutions) : substitutions,
					});
				}
			}
			return containsNullishType(
				alias.typeAnnotation,
				environment,
				nextSubstitutions,
				new Set([...visitedAliases, alias]),
			);
		}
		return unwrapped.typeArguments?.params.some((argument) =>
			containsNullishType(argument, environment, substitutions, visitedAliases),
		) ?? false;
	}
	if (unwrapped.type === "TSNullKeyword" || unwrapped.type === "TSUndefinedKeyword") return true;
	if (unwrapped.type === "TSUnionType" || unwrapped.type === "TSIntersectionType") {
		return unwrapped.types.some((member) =>
			containsNullishType(member, environment, substitutions, visitedAliases),
		);
	}
	if (unwrapped.type === "TSArrayType") {
		return containsNullishType(unwrapped.elementType, environment, substitutions, visitedAliases);
	}
	if (unwrapped.type === "TSTupleType") {
		return unwrapped.elementTypes.some((element) =>
			containsNullishTupleElement(element, environment, substitutions, visitedAliases),
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
				"Use a required Option for independent absence. Put state-specific required fields in their variant: Data.TaggedEnum for trusted states or Schema.TaggedUnion for admitted states. Normalize wire omission, null, and undefined with Schema.OptionFromOptionalNullOr only when they mean the same thing; preserve distinctions required by the protocol.",
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
		defaultOptions: [{}] satisfies RuleOptions,
	},
	createOnce(context) {
		let sourceFile = false;
		let environment: TypeEnvironment | null = null;
		const check = (node: PropertyNode) => {
			const type = propertyType(node);
			if (
				sourceFile &&
				(node.optional === true ||
					(type !== null && environment !== null && containsNullishType(type, environment)))
			) {
				context.report({ node, messageId: "domainProperty" });
			}
		};

		return {
			Program() {
				environment = createTypeEnvironment(context.sourceCode.ast);
				const option = context.options?.[0];
				const rawSourceRoots =
					typeof option === "object" && option !== null && !Array.isArray(option)
						? option.sourceRoots
						: undefined;
				const configuredRoots =
					Array.isArray(rawSourceRoots) &&
					rawSourceRoots.every((root): root is string => typeof root === "string")
						? rawSourceRoots
						: undefined;
				sourceFile = configuredRoots === undefined || configuredRoots.some((root) => isPathWithin(context.filename, root, context.cwd));
			},
			TSPropertySignature: check,
			PropertyDefinition: check,
			TSAbstractPropertyDefinition: check,
			AccessorProperty: check,
			TSAbstractAccessorProperty: check,
		};
	},
});
