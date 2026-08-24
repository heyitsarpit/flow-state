import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import {
	isPathWithin,
	normalizeModulePath,
	resolveRelativeModule,
	stripModuleExtension,
} from "../shared/module-path.ts";

type PackageProfile = { sourceRoot: string; entrypoints: string[] };
type RuleOptions = [{ sourceRoot?: string; entrypoints?: string[]; packages?: PackageProfile[] }];

const defaultProfile: PackageProfile = {
	sourceRoot: "packages/flow-state/src",
	entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"],
};
const defaultOptions: RuleOptions = [{ packages: [defaultProfile] }];

function normalizedPath(value: string): string {
	return value.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
}

function withoutExtension(value: string): string {
	return value.replace(/\.[cm]?[jt]sx?$/u, "");
}

function isPublicEntrypoint(filename: string, sourceRoot: string, entrypoints: readonly string[]): boolean {
	return entrypoints.some((entrypoint) =>
		isPathWithin(filename, `${sourceRoot}/${normalizedPath(entrypoint)}`),
	);
}

function isAnotherPublicEntrypoint(
	filename: string,
	specifier: string,
	sourceRoot: string,
	entrypoints: readonly string[],
): boolean {
	const resolvedModule = resolveRelativeModule(filename, specifier);
	const resolved = resolvedModule === null ? null : stripModuleExtension(resolvedModule);
	if (resolved === null) return false;
	const prefix = normalizeModulePath(sourceRoot);
	const current = stripModuleExtension(normalizeModulePath(filename));
	return entrypoints.some((entrypoint) => {
		const candidate = `${prefix}/${withoutExtension(normalizedPath(entrypoint))}`;
		return resolved !== current && isPathWithin(resolved, candidate);
	});
}

/** Keep public entrypoints explicit and independent from one another. */
export const noPublicEntrypointExportDriftRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow star re-exports and public-entrypoint-to-public-entrypoint coupling in package entrypoints.",
		},
		messages: {
			starReExport:
				"Public entrypoints must list exports explicitly so internal additions cannot drift into the public API.",
			crossEntrypoint:
				"Public entrypoints must not compose through another public entrypoint. Import the owning internal module instead.",
		},
		schema: [
			{
				type: "object",
				properties: {
					sourceRoot: { type: "string" },
					entrypoints: { type: "array", items: { type: "string" } },
					packages: {
						type: "array",
						items: {
							type: "object",
							properties: {
								sourceRoot: { type: "string" },
								entrypoints: { type: "array", items: { type: "string" } },
							},
							required: ["sourceRoot", "entrypoints"],
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
		let publicEntrypoint = false;
		let activeProfile: PackageProfile | null = null;

		return {
			Program() {
				const option = context.options?.[0] as Partial<RuleOptions[0]> | undefined;
				const packages =
					Array.isArray(option?.packages) &&
					option.packages.every(
						(profile) =>
							typeof profile?.sourceRoot === "string" &&
							Array.isArray(profile.entrypoints) &&
							profile.entrypoints.every((entrypoint): entrypoint is string => typeof entrypoint === "string"),
					)
						? option.packages
						: [
								{
									sourceRoot:
										typeof option?.sourceRoot === "string"
											? option.sourceRoot
											: defaultProfile.sourceRoot,
									entrypoints:
										Array.isArray(option?.entrypoints) &&
										option.entrypoints.every((entrypoint): entrypoint is string => typeof entrypoint === "string")
											? option.entrypoints
											: defaultProfile.entrypoints,
								},
							];
				activeProfile =
					packages.find((profile) => isPublicEntrypoint(context.filename, profile.sourceRoot, profile.entrypoints)) ??
					null;
				publicEntrypoint = activeProfile !== null;
			},
			ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
				if (publicEntrypoint) context.report({ node, messageId: "starReExport" });
			},
			ImportDeclaration(node: ESTree.ImportDeclaration) {
				const specifier = typeof node.source.value === "string" ? node.source.value : null;
				if (
					publicEntrypoint &&
					specifier !== null &&
					activeProfile !== null &&
					isAnotherPublicEntrypoint(
						context.filename,
						specifier,
						activeProfile.sourceRoot,
						activeProfile.entrypoints,
					)
				) {
					context.report({ node, messageId: "crossEntrypoint" });
				}
			},
				ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
				const specifier =
					node.source !== null && typeof node.source.value === "string" ? node.source.value : null;
				if (
					publicEntrypoint &&
					specifier !== null &&
					activeProfile !== null &&
					isAnotherPublicEntrypoint(
						context.filename,
						specifier,
						activeProfile.sourceRoot,
						activeProfile.entrypoints,
					)
				) {
						context.report({ node, messageId: "crossEntrypoint" });
					}
				},
				ImportExpression(node: ESTree.ImportExpression) {
					const specifier = node.source.type === "Literal" && typeof node.source.value === "string"
						? node.source.value
						: null;
					if (
						publicEntrypoint &&
						specifier !== null &&
						activeProfile !== null &&
						isAnotherPublicEntrypoint(
							context.filename,
							specifier,
							activeProfile.sourceRoot,
							activeProfile.entrypoints,
						)
					) {
						context.report({ node, messageId: "crossEntrypoint" });
					}
				},
			};
	},
});
