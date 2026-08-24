import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

/** Ban named aliases that merely conceal TypeScript's unknown top type. */
export const noUnknownTypeAliasesRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow type aliases whose resolved type is unknown; unknown must remain visible at an allowed boundary.",
		},
		messages: {
			unknownAlias:
				"Type alias `{{alias}}` hides `unknown`. Keep `unknown` explicit at the parsing boundary or on an allowed `cause` field; otherwise use the parsed owner type.",
		},
	},
	createOnce(context) {
		const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();

			const resolvesToUnknown = (
				type: ESTree.TSType,
				substitutions = new Map<string, ESTree.TSType>(),
				visited = new Set<string>(),
			): boolean => {
				if (type.type === "TSUnknownKeyword") return true;
				if (type.type === "TSParenthesizedType") return resolvesToUnknown(type.typeAnnotation, substitutions, visited);
				if (type.type === "TSUnionType" || type.type === "TSIntersectionType") {
					return type.types.some((member) => resolvesToUnknown(member, substitutions, visited));
				}
				if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return false;
				const substitution = substitutions.get(type.typeName.name);
				if (substitution !== undefined) return resolvesToUnknown(substitution, substitutions, visited);
				const name = type.typeName.name;
				if (visited.has(name)) return false;
				const alias = aliases.get(name);
				if (alias === undefined) {
					return type.typeArguments?.params.some((parameter) =>
						resolvesToUnknown(parameter, substitutions, visited),
					) ?? false;
				}
				const nextSubstitutions = new Map(substitutions);
				for (const [index, parameter] of (alias.typeParameters?.params ?? []).entries()) {
					const argument = type.typeArguments?.params[index] ?? parameter.default;
					if (argument !== undefined && argument !== null) nextSubstitutions.set(parameter.name.name, argument);
				}
				const nextVisited = new Set(visited);
				nextVisited.add(name);
				return resolvesToUnknown(alias.typeAnnotation, nextSubstitutions, nextVisited);
			};

		return {
			Program(node) {
				aliases.clear();
				for (const statement of node.body) {
					const declaration =
						statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
					if (declaration?.type === "TSTypeAliasDeclaration") {
						aliases.set(declaration.id.name, declaration);
					}
				}
				for (const alias of aliases.values()) {
					if (!resolvesToUnknown(alias.typeAnnotation, new Map(), new Set([alias.id.name]))) continue;
					context.report({
						node: alias.id,
						messageId: "unknownAlias",
						data: { alias: alias.id.name },
					});
				}
			},
		};
	},
});
