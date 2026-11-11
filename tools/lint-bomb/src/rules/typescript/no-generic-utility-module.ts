import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";

const defaultNames = new Set(["common", "generic", "helper", "helpers", "manager", "managers", "misc", "util", "utils"]);

function basename(filename: string): string {
	return filename.replaceAll("\\", "/").split("/").at(-1)?.replace(/\.[^.]+$/u, "") ?? "";
}

/** Keep helpers next to their domain owner instead of creating miscellaneous module dumps. */
export const noGenericUtilityModuleRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Discourage generic utility module names in package source. Name helper modules after their domain owner.",
		},
		messages: {
			genericUtilityModule:
				"Name this module after its coherent responsibility. Keep domain knowledge with its domain; put genuinely generic, reused functions in focused shared modules. Reuse existing library operations first, and do not duplicate functions or create a file per helper merely to avoid a utility filename.",
		},
		schema: [
			{
				type: "object",
				properties: {
					bannedNames: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
	},
	createOnce(context) {
		return {
			Program(node: ESTree.Program) {
				if (isTestSupportFile(context.filename)) return;
				const name = basename(context.filename);
				const option = context.options?.[0];
				const configuredNames =
					typeof option === "object" && option !== null && !Array.isArray(option) && "bannedNames" in option
						? option.bannedNames
						: undefined;
				const bannedNames = Array.isArray(configuredNames)
					? new Set(configuredNames.filter((value): value is string => typeof value === "string"))
					: defaultNames;
				if (bannedNames.has(name)) context.report({ node, messageId: "genericUtilityModule" });
			},
		};
	},
});
