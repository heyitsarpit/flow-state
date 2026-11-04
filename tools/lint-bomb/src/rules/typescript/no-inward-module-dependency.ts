import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isPathWithin, resolveRelativeModule, stripModuleExtension } from "../../shared/module-path.ts";

type Profile = { sourceRoot: string; forbiddenRoots: string[] };
type RuleOptions = [{ sourceRoot?: string; forbiddenRoots?: string[]; profiles?: Profile[] }];

const defaultOptions: RuleOptions = [{}];

function isWithin(path: string, root: string, cwd: string): boolean {
	return isPathWithin(path, root, cwd);
}

function specifierOf(node: ESTree.Node): string | null {
	if (
		node.type === "ImportDeclaration" ||
		node.type === "ExportAllDeclaration" ||
		node.type === "ExportNamedDeclaration"
	) {
		return node.source !== null && typeof node.source.value === "string"
			? node.source.value
			: null;
	}
	if (node.type === "ImportExpression" && node.source.type === "Literal") {
		return typeof node.source.value === "string" ? node.source.value : null;
	}
	return null;
}

/** Keep domain/core modules from depending inward on host and live composition modules. */
export const noInwardModuleDependencyRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow core modules from importing host, adapter, testing, runtime, or public entrypoint modules.",
		},
		messages: {
			configuration: "Configure explicit nonempty architecture boundaries for this rule; see its options.",
			inwardDependency:
				"Core code must not import the configured boundary `{{root}}`. Depend on the required protocol or capability contract and select implementations at application composition. Use Layer wiring for Effect Services; keep pure transformations as plain functions.",
		},
		schema: [
			{
				type: "object",
				properties: {
					sourceRoot: { type: "string", minLength: 1 },
					forbiddenRoots: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
					profiles: {
						type: "array",
						minItems: 1,
						items: {
							type: "object",
							properties: {
								sourceRoot: { type: "string", minLength: 1 },
								forbiddenRoots: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
							},
							required: ["sourceRoot", "forbiddenRoots"],
							additionalProperties: false,
						},
					},
				},
				additionalProperties: false,
			},
		],
		defaultOptions,
	},
	createOnce(context) {
		let sourceProfiles: Profile[] = [];

		const check = (node: ESTree.Node) => {
			if (sourceProfiles.length === 0) return;
			const specifier = specifierOf(node);
			if (specifier === null) return;
			const resolved = resolveRelativeModule(context.filename, specifier);
			if (resolved === null) return;
			const matchingRoots = sourceProfiles
				.flatMap((profile) => profile.forbiddenRoots)
				.filter((root) => isWithin(stripModuleExtension(resolved), stripModuleExtension(root), context.cwd))
				.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
			const forbiddenRoot = matchingRoots[0];
			if (forbiddenRoot !== undefined) {
				context.report({
					node,
					messageId: "inwardDependency",
					data: { root: forbiddenRoot },
				});
			}
		};

		return {
			Program(node: ESTree.Program) {
				sourceProfiles = [];
				const option = context.options?.[0] as Partial<RuleOptions[0]> | undefined;
				const candidates = option?.profiles ?? (option === undefined ? [] : [option]);
				const profiles = (Array.isArray(candidates) ? candidates : []).filter((profile): profile is Profile =>
					profile !== null && typeof profile === "object" && typeof profile.sourceRoot === "string" && profile.sourceRoot.trim().length > 0 && Array.isArray(profile.forbiddenRoots) && profile.forbiddenRoots.length > 0 && profile.forbiddenRoots.every((value) => typeof value === "string" && value.trim().length > 0)
				);
				if (profiles.length === 0 || profiles.length !== (Array.isArray(candidates) ? candidates.length : 0)) {
					context.report({ node, messageId: "configuration" });
					return;
				}
				sourceProfiles = profiles.filter((profile) => isWithin(context.filename, profile.sourceRoot, context.cwd));
			},
			ImportDeclaration: check,
			ExportNamedDeclaration: check,
			ExportAllDeclaration: check,
			ImportExpression: check,
		};
	},
});
