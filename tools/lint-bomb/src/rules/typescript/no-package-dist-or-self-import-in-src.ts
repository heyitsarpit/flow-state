import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { hasPathSegment, isPathWithin, resolveRelativeModule } from "../../shared/module-path.ts";

type PackageProfile = { packageName: string; sourceRoot: string };
type RuleOptions = [{ packageName?: string; sourceRoot?: string; packages?: PackageProfile[] }];

const defaultOptions: RuleOptions = [{}];

function isInSourceRoot(filename: string, sourceRoot: string, cwd: string): boolean {
  return isPathWithin(filename, sourceRoot, cwd);
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
  if (node.type === "TSImportType") {
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
      configuration:
        "Configure explicit nonempty architecture boundaries for this rule; see its options.",
      selfImport:
        "Package source must not import its own public package name. Import the owning source module directly.",
      distImport:
        "Package source must not import built dist output. Import the owning source module directly.",
    },
    schema: [
      {
        type: "object",
        properties: {
          packageName: { type: "string", minLength: 1 },
          sourceRoot: { type: "string", minLength: 1 },
          packages: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                packageName: { type: "string", minLength: 1 },
                sourceRoot: { type: "string", minLength: 1 },
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
      Program(node: ESTree.Program) {
        sourcePackage = null;
        const option = context.options?.[0] as Partial<RuleOptions[0]> | undefined;
        const candidates = option?.packages ?? (option === undefined ? [] : [option]);
        const packages = (Array.isArray(candidates) ? candidates : []).filter(
          (profile): profile is PackageProfile =>
            profile !== null &&
            typeof profile === "object" &&
            typeof profile.packageName === "string" &&
            profile.packageName.trim().length > 0 &&
            profile !== null &&
            typeof profile === "object" &&
            typeof profile.sourceRoot === "string" &&
            profile.sourceRoot.trim().length > 0,
        );
        if (
          packages.length === 0 ||
          packages.length !== (Array.isArray(candidates) ? candidates.length : 0)
        ) {
          context.report({ node, messageId: "configuration" });
          return;
        }
        sourcePackage =
          packages.find((profile) =>
            isInSourceRoot(context.filename, profile.sourceRoot, context.cwd),
          ) ?? null;
      },
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
      TSImportType: check,
    };
  },
});
