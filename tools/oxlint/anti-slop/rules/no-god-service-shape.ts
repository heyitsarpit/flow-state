import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestSupportFile } from "../shared/file-scope.ts";

type RuleOptions = [{ threshold?: number }];

const DEFAULT_THRESHOLD = 16;

function optionThreshold(option: unknown): number {
	if (typeof option !== "object" || option === null || Array.isArray(option)) return DEFAULT_THRESHOLD;
	const threshold = (option as Record<string, unknown>).threshold;
	return typeof threshold === "number" && Number.isInteger(threshold) && threshold > 0
		? threshold
		: DEFAULT_THRESHOLD;
}

function isServiceLikeName(name: string): boolean {
	return /(?:Service|Repository|Dependencies|Deps|Port|Client)$/u.test(name);
}

function isPackageSource(filename: string): boolean {
	const normalized = filename.replaceAll("\\", "/");
	return /\/packages\/[^/]+\/src\//u.test(normalized);
}

/** Warn when a capability contract has grown into a dependency bag. */
export const noGodServiceShapeRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Warn when a service-like contract has too many members. Prefer cohesive ports over god dependency bags.",
		},
		messages: {
			godServiceShape:
				"`{{name}}` has {{members}} members. Split this dependency bag into cohesive ports owned by separate capabilities.",
		},
		schema: [
			{
				type: "object",
				properties: { threshold: { type: "integer", minimum: 1 } },
				additionalProperties: false,
			},
		],
		defaultOptions: [{ threshold: DEFAULT_THRESHOLD }] satisfies RuleOptions,
	},
	createOnce(context) {
		let threshold = DEFAULT_THRESHOLD;
		let inProductionSource = false;
		const declarations = new Map<string, ESTree.TSInterfaceDeclaration | ESTree.TSTypeAliasDeclaration>();
		const countType = (type: ESTree.TSType | ESTree.TSInterfaceHeritage, visited = new Set<string>()): number => {
			if (type.type === "TSInterfaceHeritage") {
				if (type.expression.type !== "Identifier" || visited.has(type.expression.name)) return 0;
				const declaration = declarations.get(type.expression.name);
				if (declaration === undefined) return 0;
				const nextVisited = new Set([...visited, type.expression.name]);
				return declaration.type === "TSInterfaceDeclaration"
					? declaration.body.body.length + declaration.extends.reduce((total, item) => total + countType(item, nextVisited), 0)
					: countType(declaration.typeAnnotation, nextVisited);
			}
			if (type.type === "TSParenthesizedType" || type.type === "TSTypeOperator") return countType(type.typeAnnotation, visited);
			if (type.type === "TSIntersectionType") return type.types.reduce((total, member) => total + countType(member, visited), 0);
			if (type.type === "TSTypeLiteral") return type.members.length;
			if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier" || visited.has(type.typeName.name)) return 0;
			if (type.typeName.name === "Readonly" && type.typeArguments?.params.length === 1) {
				return countType(type.typeArguments.params[0], visited);
			}
			const declaration = declarations.get(type.typeName.name);
			if (declaration === undefined) return 0;
			const nextVisited = new Set(visited);
			nextVisited.add(type.typeName.name);
			return declaration.type === "TSInterfaceDeclaration"
				? declaration.body.body.length + declaration.extends.reduce((total, item) => total + countType(item, nextVisited), 0)
				: countType(declaration.typeAnnotation, nextVisited);
		};
		const check = (name: string, members: number, node: ESTree.Node) => {
			if (inProductionSource && isServiceLikeName(name) && members > threshold) {
				context.report({
					node,
					messageId: "godServiceShape",
					data: { name, members },
				});
			}
		};

		return {
			Program() {
				threshold = optionThreshold(context.options?.[0]);
				inProductionSource = isPackageSource(context.filename) && !isTestSupportFile(context.filename);
			},
			TSInterfaceDeclaration(node: ESTree.TSInterfaceDeclaration) {
				if (!node.declare) declarations.set(node.id.name, node);
			},
			TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
				declarations.set(node.id.name, node);
			},
			"Program:exit"() {
				for (const [name, declaration] of declarations) {
					if (declaration.type === "TSInterfaceDeclaration" && declaration.declare) continue;
					if (declaration.type === "TSTypeAliasDeclaration" && "declare" in declaration && declaration.declare === true) continue;
					const members = declaration.type === "TSInterfaceDeclaration"
						? declaration.body.body.length + declaration.extends.reduce((total, item) => total + countType(item), 0)
						: countType(declaration.typeAnnotation);
					check(name, members, declaration);
				}
			},
		};
	},
});
