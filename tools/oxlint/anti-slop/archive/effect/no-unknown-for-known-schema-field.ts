// Archived: superseded by anti-slop/no-unknown. Retained for historical reference; not registered.
import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { normalizedFilename } from "../../shared/file-scope.ts";
import { isPathWithin } from "../../shared/module-path.ts";
import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";

type RuleOptions = [{ allowedFiles?: string[]; fields: string[]; openFields?: string[]; sourceRoots?: string[] }];

function propertyName(property: ESTree.ObjectProperty): string | null {
	if (!property.computed && property.key.type === "Identifier") return property.key.name;
	return property.computed && property.key.type === "Literal" && typeof property.key.value === "string"
		? property.key.value
		: null;
}

function isSchemaUnknown(sourceCode: SourceCode, node: ESTree.Expression): boolean {
	const value = unwrapExpression(node);
	if (value.type === "MemberExpression" && memberName(value) === "Unknown") {
		return isImportedFromEffect(sourceCode, value.object, new Set(["Schema"]));
	}
	if (value.type !== "CallExpression") return false;
	const callee = unwrapExpression(value.callee);
	return callee.type === "MemberExpression" && (memberName(callee) === "optional" || memberName(callee) === "optionalKey") &&
		isImportedFromEffect(sourceCode, callee.object, new Set(["Schema"])) &&
		value.arguments.length === 1 && value.arguments[0]?.type !== "SpreadElement" &&
		value.arguments[0] !== undefined && isSchemaUnknown(sourceCode, value.arguments[0]);
}

function isSchemaObject(sourceCode: SourceCode, node: ESTree.ObjectExpression): boolean {
	const parent = node.parent;
	if (parent?.type !== "CallExpression") return false;
	const callee = unwrapExpression(parent.callee);
	return callee.type === "MemberExpression" && memberName(callee) === "Struct" &&
		isImportedFromEffect(sourceCode, callee.object, new Set(["Schema"]));
}

/** Require a concrete schema for known public configuration fields. */
export const noUnknownForKnownSchemaFieldRule = defineRule({
	meta: {
		type: "problem",
		docs: { description: "Disallow Schema.Unknown for configured fields with a known domain contract." },
		messages: {
			knownField:
				"This configuration field has a known contract. Replace Schema.Unknown with its concrete domain schema before construction.",
		},
		schema: [
			{
				type: "object",
				properties: {
					allowedFiles: { type: "array", items: { type: "string" } },
					fields: { type: "array", items: { type: "string" } },
					openFields: { type: "array", items: { type: "string" } },
					sourceRoots: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ fields: [] }] satisfies RuleOptions,
	},
	createOnce(context) {
		let sourceFile = false;
		let fields: ReadonlySet<string> = new Set();
		let openFields: ReadonlySet<string> = new Set();
		return {
			Program() {
				const option = context.options?.[0];
				const rawAllowedFiles = typeof option === "object" && option !== null && !Array.isArray(option) ? option.allowedFiles : undefined;
				const rawFields = typeof option === "object" && option !== null && !Array.isArray(option) ? option.fields : undefined;
				const rawOpenFields = typeof option === "object" && option !== null && !Array.isArray(option) ? option.openFields : undefined;
				const rawRoots = typeof option === "object" && option !== null && !Array.isArray(option) ? option.sourceRoots : undefined;
				fields = new Set(Array.isArray(rawFields) && rawFields.every((field): field is string => typeof field === "string") ? rawFields : []);
				openFields = new Set(Array.isArray(rawOpenFields) && rawOpenFields.every((field): field is string => typeof field === "string") ? rawOpenFields : []);
				const roots = Array.isArray(rawRoots) && rawRoots.every((root): root is string => typeof root === "string") ? rawRoots : undefined;
				const normalized = normalizedFilename(context.filename);
				const allowedFiles = Array.isArray(rawAllowedFiles) && rawAllowedFiles.every((file): file is string => typeof file === "string") ? rawAllowedFiles : [];
				const matchesFile = (file: string) => {
					const normalizedFile = normalizedFilename(file);
					const relativeFile = normalizedFile.startsWith("/") ? normalizedFile.slice(1) : normalizedFile;
					return normalized.endsWith(`/${relativeFile}`);
				};
				sourceFile = !allowedFiles.some(matchesFile) && (roots === undefined || roots.some((root) => isPathWithin(context.filename, root)));
			},
			ObjectExpression(node: ESTree.ObjectExpression) {
				if (!sourceFile || !isSchemaObject(context.sourceCode, node)) return;
				for (const property of node.properties) {
					if (property.type !== "Property") continue;
					const name = propertyName(property);
					if (name !== null && fields.has(name) && !openFields.has(name) && isSchemaUnknown(context.sourceCode, property.value)) {
						context.report({ node: property.value, messageId: "knownField" });
					}
				}
			},
		};
	},
});
