import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestFile, isTestSupportFile } from "../shared/file-scope.ts";

type RuleOptions = [{ threshold?: number; productionThreshold?: number; testThreshold?: number }];

const DEFAULT_PRODUCTION_THRESHOLD = 500;
const DEFAULT_TEST_THRESHOLD = 1000;

function isLintTarget(filename: string): boolean {
	const normalized = filename.replaceAll("\\", "/");
	return (
		!normalized.endsWith(".d.ts") &&
		 /\/packages\/[^/]+\/src\//u.test(normalized) &&
		(!isTestSupportFile(filename) || isTestFile(filename))
	);
}

function optionThreshold(
	option: unknown,
	key: "threshold" | "productionThreshold" | "testThreshold",
	fallback: number,
): number {
	if (typeof option !== "object" || option === null || Array.isArray(option)) return fallback;
	const value = (option as Record<string, unknown>)[key];
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Turn oversized package modules into review prompts with separate test and production caps. */
export const noLargeProductionFileRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Warn when a package source file exceeds its review-size threshold. Split by ownership, not by arbitrary chunks.",
		},
		messages: {
			largeFile:
				"This package source module is {{lines}} lines long. Confirm it still has one owner or document the decomposition decision.",
		},
		schema: [
			{
				type: "object",
				properties: {
					threshold: { type: "integer", minimum: 1 },
					productionThreshold: { type: "integer", minimum: 1 },
					testThreshold: { type: "integer", minimum: 1 },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [
			{ productionThreshold: DEFAULT_PRODUCTION_THRESHOLD, testThreshold: DEFAULT_TEST_THRESHOLD },
		] satisfies RuleOptions,
	},
	createOnce(context) {
		return {
			"Program:exit"(node: ESTree.Program) {
				if (!isLintTarget(context.filename)) return;
				const option = context.options?.[0];
				const productionThreshold = optionThreshold(
					option,
					"productionThreshold",
					optionThreshold(option, "threshold", DEFAULT_PRODUCTION_THRESHOLD),
				);
				const testThreshold = optionThreshold(option, "testThreshold", DEFAULT_TEST_THRESHOLD);
					const text = context.sourceCode.getText(node);
					const lines = text === "" ? 0 : text.replace(/(?:\r\n|\n|\r)+$/u, "").split(/\r\n|\n|\r/u).length;
				const threshold = isTestFile(context.filename) ? testThreshold : productionThreshold;
				if (lines > threshold) {
					context.report({ node, messageId: "largeFile", data: { lines } });
				}
			},
		};
	},
});
