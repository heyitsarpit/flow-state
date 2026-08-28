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
		const typeIds = new WeakMap<object, number>();
		const memo = new Map<string, boolean>();
		let nextTypeId = 0;
		const typeId = (type: ESTree.TSType): number => {
			const object = type as object;
			const existing = typeIds.get(object);
			if (existing !== undefined) return existing;
			const id = nextTypeId++;
			typeIds.set(object, id);
			return id;
		};

		const resolvesToUnknown = (
			type: ESTree.TSType,
			substitutions: ReadonlyMap<string, ESTree.TSType> = new Map(),
			visited: ReadonlySet<string> = new Set(),
		): boolean => {
			let current = type;
			while (current.type === "TSParenthesizedType") current = current.typeAnnotation;
			const substitutionKey = [...substitutions.entries()]
				.map(([name, value]) => `${name}:${typeId(value)}`)
				.sort()
				.join(",");
			const typeKey =
				current.type === "TSTypeReference" && current.typeName.type === "Identifier"
					? `alias:${current.typeName.name}`
					: `node:${typeId(current)}`;
			const key = `${typeKey}|${substitutionKey}|${[...visited].sort().join(",")}`;
			const cached = memo.get(key);
			if (cached !== undefined) return cached;

			let result = false;
			if (current.type === "TSUnknownKeyword") {
				result = true;
			} else if (current.type === "TSUnionType") {
				result = current.types.some((member) => resolvesToUnknown(member, substitutions, visited));
			} else if (current.type === "TSIntersectionType") {
				// `unknown & T` is T, so it does not erase evidence. Only an
				// intersection made solely of unknown resolves to unknown.
				result = current.types.every((member) => resolvesToUnknown(member, substitutions, visited));
			} else if (current.type === "TSTypeReference" && current.typeName.type === "Identifier") {
				const substitution = substitutions.get(current.typeName.name);
				if (substitution !== undefined) {
					result = resolvesToUnknown(substitution, substitutions, visited);
			} else if (!visited.has(`${current.typeName.name}|${substitutionKey}`)) {
					const alias = aliases.get(current.typeName.name);
					if (alias !== undefined) {
						const nextSubstitutions = new Map(substitutions);
						for (const [index, parameter] of (alias.typeParameters?.params ?? []).entries()) {
							const argument = current.typeArguments?.params[index] ?? parameter.default;
							if (argument !== undefined && argument !== null) nextSubstitutions.set(parameter.name.name, argument);
						}
						const nextVisited = new Set(visited);
						nextVisited.add(`${current.typeName.name}|${substitutionKey}`);
						result = resolvesToUnknown(alias.typeAnnotation, nextSubstitutions, nextVisited);
					}
				}
			}
			memo.set(key, result);
			return result;
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
