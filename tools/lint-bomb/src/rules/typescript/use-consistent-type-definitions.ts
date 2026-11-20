import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

type Preference = "interface" | "type";
type RuleOptions = [{ preference?: Preference }];

const DEFAULT_PREFERENCE: Preference = "type";

function preferenceFromOption(option: unknown): Preference {
	if (typeof option !== "object" || option === null || Array.isArray(option)) {
		return DEFAULT_PREFERENCE;
	}
	return (option as Record<string, unknown>).preference === "interface"
		? "interface"
		: DEFAULT_PREFERENCE;
}

function isSimpleInterface(node: ESTree.TSInterfaceDeclaration): boolean {
	return !node.declare && node.extends.length === 0;
}

function isSimpleObjectAlias(node: ESTree.TSTypeAliasDeclaration): boolean {
	return node.typeAnnotation.type === "TSTypeLiteral";
}

function declarationName(node: ESTree.Node): string | null {
	if (
		node.type !== "ClassDeclaration" &&
		node.type !== "FunctionDeclaration" &&
		node.type !== "TSModuleDeclaration"
	) {
		return null;
	}
	return node.id?.type === "Identifier" ? node.id.name : null;
}

function moduleScopeKey(
	node: ESTree.TSModuleDeclaration | ESTree.TSGlobalDeclaration,
): string | null {
	if (node.kind === "global") return "global";
	const name = node.id;
	if (name.type === "Identifier") return `namespace:${name.name}`;
	if (name.type === "Literal" && typeof name.value === "string") return `module:${name.value}`;
	if (name.type === "TSQualifiedName") {
		const path = (part: ESTree.TSTypeName): string | null =>
			part.type === "Identifier"
				? part.name
				: part.type === "TSQualifiedName"
					? `${path(part.left)}.${part.right.name}`
					: null;
		const qualifiedName = path(name);
		return qualifiedName === null ? null : `namespace:${qualifiedName}`;
	}
	return null;
}

function mergedInterfaceDeclarations(program: ESTree.Program): Set<ESTree.TSInterfaceDeclaration> {
	const merged = new Set<ESTree.TSInterfaceDeclaration>();
	const visitScope = (statements: ESTree.Node[]): void => {
		const interfaces = new Map<string, ESTree.TSInterfaceDeclaration[]>();
		const valueNames = new Set<string>();
		const moduleScopes = new Map<string, ESTree.Node[][]>();
		for (const statement of statements) {
			const declaration =
				statement.type === "ExportNamedDeclaration" ||
				statement.type === "ExportDefaultDeclaration"
					? statement.declaration
					: statement;
			if (declaration?.type === "TSInterfaceDeclaration") {
				const sameName = interfaces.get(declaration.id.name) ?? [];
				sameName.push(declaration);
				interfaces.set(declaration.id.name, sameName);
			}
			const valueName = declaration === null ? null : declarationName(declaration);
			if (valueName !== null) valueNames.add(valueName);
			if (declaration?.type === "TSModuleDeclaration" && declaration.body?.type === "TSModuleBlock") {
				const key = moduleScopeKey(declaration);
				if (key !== null) {
					const scopes = moduleScopes.get(key) ?? [];
					scopes.push(declaration.body.body);
					moduleScopes.set(key, scopes);
				}
			}
		}
		for (const [name, declarations] of interfaces) {
			if (declarations.length > 1 || valueNames.has(name)) {
				for (const declaration of declarations) merged.add(declaration);
			}
		}
		for (const [key, scopes] of moduleScopes) {
			if (key === "global") {
				visitScope(scopes.flat());
				continue;
			}
			for (const scope of scopes) visitScope(scope);
			if (scopes.length > 1) {
				const exportedDeclarations = scopes.flatMap((scope) =>
					scope.filter(
						(statement) =>
							statement.type === "ExportNamedDeclaration" &&
							statement.declaration !== null,
					),
				);
				if (exportedDeclarations.length > 0) visitScope(exportedDeclarations);
			}
		}
	};
	visitScope(program.body);
	return merged;
}

/** Keep ordinary object contracts on one spelling while preserving constructs that do not translate cleanly. */
export const useConsistentTypeDefinitionsRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Prefer one spelling for simple object type definitions. Default preference: `type`; interfaces with heritage and ambient declarations are ignored.",
			defaultPreference: DEFAULT_PREFERENCE,
		},
		messages: {
			preferType:
				"Prefer a `type` alias for this simple object contract unless declaration merging or public augmentation is intentional. The project default is `type`.",
			preferInterface:
				"Prefer an `interface` for this simple object contract. Configure `preference: \"type\"` if this module intentionally uses type aliases.",
		},
		schema: [
			{
				type: "object",
				properties: {
					preference: { type: "string", enum: ["interface", "type"] },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ preference: DEFAULT_PREFERENCE }] satisfies RuleOptions,
	},
	createOnce(context) {
		let preference: Preference = DEFAULT_PREFERENCE;
		let mergedDeclarations = new Set<ESTree.TSInterfaceDeclaration>();
		return {
			Program(node: ESTree.Program) {
				preference = preferenceFromOption(context.options?.[0]);
				mergedDeclarations = mergedInterfaceDeclarations(node);
			},
			TSInterfaceDeclaration(node: ESTree.TSInterfaceDeclaration) {
				if (preference === "type" && isSimpleInterface(node) && !mergedDeclarations.has(node)) {
					context.report({ node, messageId: "preferType" });
				}
			},
			TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
				if (preference === "interface" && isSimpleObjectAlias(node)) {
					context.report({ node, messageId: "preferInterface" });
				}
			},
		};
	},
});
