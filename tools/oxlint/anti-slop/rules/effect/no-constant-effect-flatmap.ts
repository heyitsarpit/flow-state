import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";

type CallbackNode = { readonly params: readonly ESTree.Node[] };

type ReturnAnalysis = {
	readonly constants: ReadonlySet<string>;
	readonly canCompleteNormally: boolean;
	readonly valid: boolean;
};

function invalidAnalysis(): ReturnAnalysis {
	return { constants: new Set(), canCompleteNormally: false, valid: false };
}

function constantSucceedValue(sourceCode: SourceCode, node: ESTree.Expression): string | null {
	const value = unwrapExpression(node);
	if (value.type !== "CallExpression" || !isEffectSucceed(sourceCode, value) || value.arguments.length !== 1) return null;
	const argument = value.arguments[0];
	if (argument === undefined || argument.type === "SpreadElement") return null;
	const unwrappedArgument = unwrapExpression(argument);
	return unwrappedArgument.type === "Literal" ||
		(unwrappedArgument.type === "Identifier" && unwrappedArgument.name === "undefined")
		? sourceCode.getText(unwrappedArgument)
		: null;
}

function isEffectSucceed(sourceCode: SourceCode, node: ESTree.CallExpression): boolean {
	const callee = unwrapExpression(node.callee);
	return callee.type === "MemberExpression" && memberName(callee) === "succeed" &&
		isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"]));
}

function parameterIsUsed(sourceCode: SourceCode, parameter: ESTree.Node): boolean {
	if (parameter.type !== "Identifier") return true;
	let scope: Scope | null = sourceCode.getScope(parameter);
	while (scope !== null) {
		const variable = scope.set.get(parameter.name);
		if (variable !== undefined) {
			return variable.references.some((reference) => reference.isRead() && reference.identifier !== parameter);
		}
		scope = scope.upper;
	}
	return true;
}

function callbackIgnoresParameters(
	sourceCode: SourceCode,
	callback: CallbackNode,
): boolean {
	return callback.params.every((parameter) => !parameterIsUsed(sourceCode, parameter));
}

function analyzePureSingleReturn(sourceCode: SourceCode, statements: readonly ESTree.Statement[]): ReturnAnalysis {
	const [statement] = statements;
	if (statements.length !== 1 || statement?.type !== "ReturnStatement" || statement.argument === null) {
		return invalidAnalysis();
	}
	const constant = constantSucceedValue(sourceCode, statement.argument);
	return constant === null
		? invalidAnalysis()
		: { constants: new Set([constant]), canCompleteNormally: false, valid: true };
}

function isPureCondition(node: ESTree.Expression): boolean {
	const value = unwrapExpression(node);
	return value.type === "Identifier" || value.type === "Literal";
}

function sameConstant(left: ReturnAnalysis, right: ReturnAnalysis): boolean {
	if (!left.valid || !right.valid || left.canCompleteNormally || right.canCompleteNormally) return false;
	const [leftConstant] = left.constants;
	const [rightConstant] = right.constants;
	return left.constants.size === 1 && right.constants.size === 1 && leftConstant === rightConstant;
}

function analyzePureBranches(sourceCode: SourceCode, statements: readonly ESTree.Statement[]): ReturnAnalysis {
	const direct = analyzePureSingleReturn(sourceCode, statements);
	if (direct.valid) return direct;
	const [first, second] = statements;
	if (statements.length === 2 && first?.type === "IfStatement" && first.alternate === null && second !== undefined) {
		if (!isPureCondition(first.test)) return invalidAnalysis();
		const consequent = first.consequent.type === "BlockStatement"
			? analyzePureBranches(sourceCode, first.consequent.body)
			: analyzePureBranches(sourceCode, [first.consequent]);
		const fallback = analyzePureBranches(sourceCode, [second]);
		return sameConstant(consequent, fallback)
			? { constants: consequent.constants, canCompleteNormally: false, valid: true }
			: invalidAnalysis();
	}
	if (statements.length !== 1 || first?.type !== "IfStatement" || !isPureCondition(first.test)) {
		return invalidAnalysis();
	}
	if (first.alternate === null) return invalidAnalysis();
	const consequent = first.consequent.type === "BlockStatement"
		? analyzePureBranches(sourceCode, first.consequent.body)
		: analyzePureBranches(sourceCode, [first.consequent]);
	const alternate = first.alternate.type === "BlockStatement"
		? analyzePureBranches(sourceCode, first.alternate.body)
		: analyzePureBranches(sourceCode, [first.alternate]);
	return sameConstant(consequent, alternate)
		? { constants: consequent.constants, canCompleteNormally: false, valid: true }
		: invalidAnalysis();
}

function returnedSucceed(sourceCode: SourceCode, callback: ESTree.Expression): boolean {
	const value = unwrapExpression(callback);
	if (value.type !== "ArrowFunctionExpression" && value.type !== "FunctionExpression") return false;
	if (value.body === null) return false;
	if (!callbackIgnoresParameters(sourceCode, value)) return false;
	if (value.body.type !== "BlockStatement") return constantSucceedValue(sourceCode, value.body) !== null;
	const analysis = analyzePureBranches(sourceCode, value.body.body);
	return analysis.valid && !analysis.canCompleteNormally && analysis.constants.size === 1;
}

/** Prefer Effect.as when a flatMap discards the upstream value and returns a literal. */
export const noConstantEffectFlatMapRule = defineRule({
	meta: {
		type: "suggestion",
		docs: { description: "Disallow constant Effect.flatMap continuations that should use Effect.as." },
		messages: {
			constant: "This flatMap ignores its input and returns a constant. Use Effect.as(value) to make the intent explicit.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				const callee = unwrapExpression(node.callee);
				if (callee.type !== "MemberExpression" || memberName(callee) !== "flatMap" ||
					!isImportedFromEffect(context.sourceCode, callee.object, new Set(["Effect"]))) return;
				const callback = node.arguments.length === 1 ? node.arguments[0] : node.arguments[1];
				if (callback !== undefined && callback.type !== "SpreadElement" && returnedSucceed(context.sourceCode, callback)) {
					context.report({ node, messageId: "constant" });
				}
			},
		};
	},
});
