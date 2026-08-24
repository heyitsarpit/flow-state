import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isPathWithin, normalizeModulePath, resolveRelativeModule, stripModuleExtension } from "../shared/module-path.ts";

type Profile = { sourceRoot: string; forbiddenRoots: string[] };
type RuleOptions = [{ sourceRoot?: string; forbiddenRoots?: string[]; profiles?: Profile[] }];

const defaultProfile: Profile = {
	sourceRoot: "packages/flow-state/src/core",
	forbiddenRoots: [
		"packages/flow-state/src/cli",
		"packages/flow-state/src/react",
		"packages/flow-state/src/testing",
		"packages/flow-state/src/runtime",
		"packages/flow-state/src/index.ts",
		"packages/flow-state/src/server.ts",
	],
};

const defaultOptions: RuleOptions = [{ profiles: [defaultProfile] }];

function isWithin(path: string, root: string): boolean {
	return isPathWithin(path, root);
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
			inwardDependency:
				"Core code must not depend inward on `{{root}}`. Move composition outward or depend on a narrow port.",
		},
		schema: [
			{
				type: "object",
				properties: {
					sourceRoot: { type: "string" },
					forbiddenRoots: { type: "array", items: { type: "string" } },
					profiles: {
						type: "array",
						items: {
							type: "object",
							properties: {
								sourceRoot: { type: "string" },
								forbiddenRoots: { type: "array", items: { type: "string" } },
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
		let sourceProfile: Profile | null = null;

		const check = (node: ESTree.Node) => {
			if (sourceProfile === null) return;
			const specifier = specifierOf(node);
			if (specifier === null) return;
			const resolved = resolveRelativeModule(context.filename, specifier);
			if (resolved === null) return;
			const forbiddenRoot = sourceProfile.forbiddenRoots.find((root) =>
				isWithin(stripModuleExtension(resolved), stripModuleExtension(normalizeModulePath(root))),
			);
			if (forbiddenRoot !== undefined) {
				context.report({
					node,
					messageId: "inwardDependency",
					data: { root: forbiddenRoot },
				});
			}
		};

		return {
			Program() {
				const option = context.options?.[0] as Partial<RuleOptions[0]> | undefined;
				const profiles =
					Array.isArray(option?.profiles) &&
					option.profiles.every(
						(profile) =>
							typeof profile?.sourceRoot === "string" &&
							Array.isArray(profile.forbiddenRoots) &&
							profile.forbiddenRoots.every((root): root is string => typeof root === "string"),
					)
						? option.profiles
						: [
								{
									sourceRoot:
										typeof option?.sourceRoot === "string"
											? option.sourceRoot
											: defaultProfile.sourceRoot,
									forbiddenRoots:
										Array.isArray(option?.forbiddenRoots) &&
										option.forbiddenRoots.every((root): root is string => typeof root === "string")
											? option.forbiddenRoots
											: defaultProfile.forbiddenRoots,
								},
							];
				sourceProfile = profiles.find((profile) => isWithin(context.filename, profile.sourceRoot)) ?? null;
			},
			ImportDeclaration: check,
			ExportNamedDeclaration: check,
			ExportAllDeclaration: check,
			ImportExpression: check,
		};
	},
});
