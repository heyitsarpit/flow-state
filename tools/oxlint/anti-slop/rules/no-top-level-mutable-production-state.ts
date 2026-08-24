import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestSupportFile } from "../shared/file-scope.ts";

function isProgramDeclaration(node: ESTree.VariableDeclaration): boolean {
	return node.parent.type === "Program" || node.parent.type === "ExportNamedDeclaration";
}

function isPackageSource(filename: string): boolean {
	const normalized = filename.replaceAll("\\", "/");
	return /\/packages\/[^/]+\/src\//u.test(normalized);
}

/** Keep mutable production state behind an explicit service, resource, or host owner. */
export const noTopLevelMutableProductionStateRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow top-level mutable production variables. Mutable caches and registries need an explicit owner and lifetime.",
		},
		messages: {
			topLevelMutable:
				"Do not keep mutable production state at module scope. Give this cache or registry an explicit service, resource, or host owner.",
		},
	},
	createOnce(context) {
		return {
				VariableDeclaration(node: ESTree.VariableDeclaration) {
					if (
						node.declare === true ||
					!isPackageSource(context.filename) ||
					isTestSupportFile(context.filename) ||
					!isProgramDeclaration(node) ||
					node.kind === "const"
				) {
					return;
				}
				context.report({ node, messageId: "topLevelMutable" });
			},
		};
	},
});
