import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import {
	hasPathSegment,
	isPathWithin,
	resolveRelativeModule,
} from "../shared/module-path.ts";

type PackageProfile = { packageName: string; sourceRoot: string };
type RuleOptions = [{ packageName?: string; sourceRoot?: string; packages?: PackageProfile[] }];

const defaultProfile: PackageProfile = {
	packageName: "flow-state",
	sourceRoot: "packages/flow-state/src",
};
const defaultOptions: RuleOptions = [{ packages: [defaultProfile] }];

function isInSourceRoot(filename: string, sourceRoot: string): boolean {
	return isPathWithin(filename, sourceRoot);
}

function isSelfImport(specifier: string, packageName: string): boolean {
	return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function issueForSpecifier(
	specifier: string,
	packageName: string,
	filename: string,
): "selfImport" | "distImport" | null {
	if (isSelfImport(specifier, packageName)) return "selfImport";
	const resolved = resolveRelativeModule(filename, specifier);
	if (resolved !== null && hasPathSegment(resolved, "dist")) return "distImport";
	return null;
}

function moduleSpecifier(node: ESTree.Node): string | null {
	if (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration") {
		return typeof node.source.value === "string" ? node.source.value : null;
	}
	if (node.type === "ImportExpression" && node.source.type === "Literal") {
		return typeof node.source.value === "string" ? node.source.value : null;
	}
	if (node.type === "ExportNamedDeclaration" && node.source !== null) {
		return typeof node.source.value === "string" ? node.source.value : null;
	}
	return null;
}

/** Keep package source pointed at source owners instead of its public or built surface. */
export const noPackageDistOrSelfImportInSrcRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow package self-imports and relative dist imports from package source modules.",
		},
		messages: {
			selfImport:
				"Package source must not import its own public package name. Import the owning source module directly.",
			distImport:
				"Package source must not import built dist output. Import the owning source module directly.",
		},
		schema: [
			{
				type: "object",
				properties: {
					packageName: { type: "string" },
					sourceRoot: { type: "string" },
					packages: {
						type: "array",
						items: {
							type: "object",
							properties: {
								packageName: { type: "string" },
								sourceRoot: { type: "string" },
							},
							required: ["packageName", "sourceRoot"],
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
		let sourcePackage: PackageProfile | null = null;

		const check = (node: ESTree.Node) => {
			if (sourcePackage === null) return;
			const specifier = moduleSpecifier(node);
			if (specifier === null) return;
			const messageId = issueForSpecifier(specifier, sourcePackage.packageName, context.filename);
			if (messageId !== null) context.report({ node, messageId });
		};

		return {
			Program() {
				const option = context.options?.[0] as Partial<RuleOptions[0]> | undefined;
				const packages =
					Array.isArray(option?.packages) &&
					option.packages.every(
						(profile) =>
							typeof profile?.packageName === "string" && typeof profile.sourceRoot === "string",
					)
						? option.packages
						: [
								{
									packageName:
										typeof option?.packageName === "string"
											? option.packageName
											: defaultProfile.packageName,
									sourceRoot:
										typeof option?.sourceRoot === "string"
											? option.sourceRoot
											: defaultProfile.sourceRoot,
								},
							];
				sourcePackage = packages.find((profile) => isInSourceRoot(context.filename, profile.sourceRoot)) ?? null;
			},
			ImportDeclaration: check,
			ExportNamedDeclaration: check,
			ExportAllDeclaration: check,
			ImportExpression: check,
		};
	},
});
