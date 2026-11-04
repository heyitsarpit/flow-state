import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import {
	isPathWithin,
	configuredPath,
	normalizeModulePath,
	resolveRelativeModule,
	stripModuleExtension,
} from "../../shared/module-path.ts";

type PackageProfile = { sourceRoot: string; entrypoints: string[] };
type RuleOptions = [{ sourceRoot?: string; entrypoints?: string[]; packages?: PackageProfile[] }];

const defaultOptions: RuleOptions = [{}];

function normalizedPath(value: string): string {
	return value.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
}

function withoutExtension(value: string): string {
	return value.replace(/\.[cm]?[jt]sx?$/u, "");
}

function isModuleFile(value: string): boolean {
	return /\.[cm]?[jt]sx?$/u.test(value);
}

function isPublicEntrypoint(filename: string, sourceRoot: string, entrypoints: readonly string[], cwd: string): boolean {
	return entrypoints.some((entrypoint) => {
		const normalizedEntry = normalizedPath(entrypoint);
		const candidate = `${sourceRoot}/${normalizedEntry}`;
		return isModuleFile(normalizedEntry)
			? isPathWithin(filename, candidate, cwd)
			: isPathWithin(filename, `${sourceRoot}/${withoutExtension(normalizedEntry)}`, cwd);
	});
}

function isAnotherPublicEntrypoint(
	filename: string,
	specifier: string,
	sourceRoot: string,
	entrypoints: readonly string[],
	cwd: string,
): boolean {
	const resolvedModule = resolveRelativeModule(filename, specifier);
	const resolved = resolvedModule === null ? null : stripModuleExtension(resolvedModule);
	if (resolved === null) return false;
	const prefix = configuredPath(sourceRoot, cwd);
	const current = stripModuleExtension(normalizeModulePath(filename));
	return entrypoints.some((entrypoint) => {
		const normalizedEntry = normalizedPath(entrypoint);
		const candidate = `${prefix}/${withoutExtension(normalizedEntry)}`;
		const anotherEntrypoint = isModuleFile(normalizedEntry)
			? configuredPath(resolved, cwd) === configuredPath(candidate, cwd)
			: isPathWithin(resolved, candidate);
		return resolved !== current && anotherEntrypoint;
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
			configuration: "Configure explicit nonempty architecture boundaries for this rule; see its options.",
			starReExport:
				"Public entrypoints must list exports explicitly so internal additions cannot drift into the public API.",
			crossEntrypoint:
				"Public entrypoints must not compose through another public entrypoint. Import the owning internal module instead.",
		},
		schema: [
			{
				type: "object",
				properties: {
					sourceRoot: { type: "string", minLength: 1 },
					entrypoints: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
					packages: {
						type: "array",
						minItems: 1,
						items: {
							type: "object",
							properties: {
								sourceRoot: { type: "string", minLength: 1 },
								entrypoints: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
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
			Program(node: ESTree.Program) {
				activeProfile = null;
				publicEntrypoint = false;
				const option = context.options?.[0] as Partial<RuleOptions[0]> | undefined;
				const candidates = option?.packages ?? (option === undefined ? [] : [option]);
				const packages = (Array.isArray(candidates) ? candidates : []).filter((profile): profile is PackageProfile =>
					profile !== null && typeof profile === "object" && typeof profile.sourceRoot === "string" && profile.sourceRoot.trim().length > 0 && Array.isArray(profile.entrypoints) && profile.entrypoints.length > 0 && profile.entrypoints.every((value) => typeof value === "string" && value.trim().length > 0)
				);
				if (packages.length === 0 || packages.length !== (Array.isArray(candidates) ? candidates.length : 0)) {
					context.report({ node, messageId: "configuration" });
					return;
				}
				activeProfile =
					packages.find((profile) => isPublicEntrypoint(context.filename, profile.sourceRoot, profile.entrypoints, context.cwd)) ??
					null;
				publicEntrypoint = activeProfile !== null;
			},
			ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
				if (publicEntrypoint) context.report({ node, messageId: "starReExport" });
			},
			TSImportType(node: ESTree.TSImportType) {
				const specifier = typeof node.source.value === "string" ? node.source.value : null;
				if (
					publicEntrypoint && specifier !== null && activeProfile !== null &&
					isAnotherPublicEntrypoint(context.filename, specifier, activeProfile.sourceRoot, activeProfile.entrypoints, context.cwd)
				) {
					context.report({ node, messageId: "crossEntrypoint" });
				}
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
						context.cwd,
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
						context.cwd,
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
						context.cwd,
						)
					) {
						context.report({ node, messageId: "crossEntrypoint" });
					}
				},
			};
	},
});
