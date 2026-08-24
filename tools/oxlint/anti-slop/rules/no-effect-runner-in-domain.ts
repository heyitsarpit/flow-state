import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";
import { isTestFile } from "../shared/file-scope.ts";

const runnerNames = new Set([
	"runFork",
	"runForkWith",
	"runCallback",
	"runCallbackWith",
	"runPromise",
	"runPromiseExit",
	"runPromiseExitWith",
	"runPromiseWith",
	"runSync",
	"runSyncExit",
	"runSyncExitWith",
	"runSyncWith",
]);

function normalizedFilename(filename: string): string {
	return filename.replaceAll("\\", "/");
}

function isAllowedBoundary(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	return (
		isTestFile(filename) ||
		normalized.includes("/src/runtime/") ||
		normalized.includes("/src/cli/") ||
		normalized.includes("/src/react/") ||
		normalized.includes("/src/testing/") ||
		normalized.endsWith("/src/core/orchestrator/orchestrator-system.ts") ||
		normalized.endsWith("/src/core/runtime/services/host-signals.ts")
	);
}

function runnerName(callee: ESTree.Expression): string | null {
	if (callee.type !== "MemberExpression" || callee.computed) return null;
	return callee.property.type === "Identifier" ? callee.property.name : null;
}

/** Keep Effect execution at explicit host/runtime ownership boundaries. */
export const noEffectRunnerInDomainRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Effect runners in core domain code; yield Effects to the owning runtime instead.",
		},
		messages: {
			runner:
				"This Effect runner leaves and re-enters the current runtime from domain code. Yield the Effect, or move execution to an explicit host/runtime boundary.",
		},
	},
	createOnce(context) {
		let allowedBoundary = false;
		const effectReceivers = new Set(["Effect", "Runtime", "ManagedRuntime"]);

		return {
			Program() {
				// createOnce is shared across files; filename is only available once
				// Oxlint has entered the per-file visitor phase.
				allowedBoundary = isAllowedBoundary(context.filename);
			},
			CallExpression(node: ESTree.CallExpression) {
				if (allowedBoundary) return;
				if (node.callee.type !== "MemberExpression") return;
				const name = runnerName(node.callee);
				if (
					name !== null &&
					runnerNames.has(name) &&
					isImportedFromEffect(context.sourceCode, node.callee.object, effectReceivers)
				) {
					context.report({ node, messageId: "runner" });
				}
			},
		};
	},
});
