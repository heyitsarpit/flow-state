import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function isDeclarationOrGeneratedFile(filename: string): boolean {
	const normalized = filename.replaceAll("\\", "/");
	return (
		/\.d\.[cm]?ts$/u.test(normalized) ||
		/(?:^|\/)generated(?:\/|$)/u.test(normalized) ||
		/\.(?:gen|generated)\.[cm]?tsx?$/u.test(normalized)
	);
}

/** Prefer ordinary type imports over inline import type queries in maintained source. */
export const noInlineImportTypeQueryRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow inline import type queries in ordinary source while allowing declaration and generated files.",
		},
		messages: {
			inlineImportType:
				"Replace this inline import type query with a named `import type` declaration. Declaration and generated files are exempt.",
		},
	},
	createOnce(context) {
		let allowedFile = false;

		return {
			Program() {
				allowedFile = isDeclarationOrGeneratedFile(context.filename);
			},
			TSImportType(node: ESTree.TSImportType) {
				if (!allowedFile) context.report({ node, messageId: "inlineImportType" });
			},
		};
	},
});
