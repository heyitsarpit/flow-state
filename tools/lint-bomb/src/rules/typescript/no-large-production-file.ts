import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestFile, isTestSupportFile } from "../../shared/file-scope.ts";

type RuleOptions = [{ threshold?: number; productionThreshold?: number; testThreshold?: number }];

const DEFAULT_PRODUCTION_THRESHOLD = 500;
const DEFAULT_TEST_THRESHOLD = 1000;

function isLintTarget(filename: string): boolean {
	const normalized = filename.replaceAll("\\", "/");
	return (
		!normalized.endsWith(".d.ts") &&
		(!isTestSupportFile(filename) || isTestFile(filename))
	);
}

function countCodeLines(text: string, comments: ReadonlyArray<{ range: [number, number] }>): number {
	if (text === "") return 0;
	let stripped = "";
	let cursor = 0;
	for (const comment of comments) {
		const [start, end] = comment.range;
		if (start < cursor) continue;
		stripped += text.slice(cursor, start) + text.slice(start, end).replace(/[^\r\n]/gu, " ");
		cursor = end;
	}
	stripped += text.slice(cursor);
	const trim = (value: string) => value.replace(/(?:\r\n|\n|\r)+$/u, "");
	const original = trim(text).split(/\r\n|\n|\r/u);
	const code = trim(stripped).split(/\r\n|\n|\r/u);
	let commentOnly = 0;
	for (const [index, line] of original.entries()) {
		if (line.trim() !== "" && (code[index] ?? "").trim() === "") commentOnly += 1;
	}
	return original.length - commentOnly;
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

/** Turn oversized package modules into review prompts with separate test and production caps; comment-only lines do not count. */
export const noLargeProductionFileRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Warn when a package source file exceeds its review-size threshold. Split by ownership, not by arbitrary chunks.",
		},
		messages: {
			largeFile:
				"This source module has {{lines}} lines, not counting comments. Review whether its responsibilities remain cohesive and extract independent concerns when justified. Keep related invariants and their owner together; line count alone does not justify arbitrary file splits.",
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
				const lines = countCodeLines(context.sourceCode.text, context.sourceCode.getAllComments());
				const threshold = isTestFile(context.filename) ? testThreshold : productionThreshold;
				if (lines > threshold) {
					context.report({ loc: node.loc.start, messageId: "largeFile", data: { lines } });
				}
			},
		};
	},
});
