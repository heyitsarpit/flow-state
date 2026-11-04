import { defineRule } from "@oxlint/plugins";
import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import {
  arrayMethodTarget,
  isKnownArrayExpression,
  resolveArrayBinding,
  unwrapArrayExpression,
} from "../../shared/array-method.ts";

function enclosingReducer(node: ESTree.Node) {
  let parent = node.parent;
  while (parent !== null) {
    if (parent.type === "FunctionDeclaration") return null;
    if (parent.type === "ArrowFunctionExpression" || parent.type === "FunctionExpression") {
      const callback = parent;
      let owner: ESTree.Node | null = callback.parent;
      while (owner !== null && unwrapArrayExpression(owner) === callback) owner = owner.parent;
      if (owner?.type !== "CallExpression") return null;
      const method = arrayMethodTarget(owner.callee);
      const firstArgument = owner.arguments[0];
      if (
        method === null || (method.name !== "reduce" && method.name !== "reduceRight") ||
        owner.arguments.length > 2 || firstArgument === undefined ||
        unwrapArrayExpression(firstArgument) !== callback
      ) return null;
      const firstParameter = callback.params[0];
      const accumulator = firstParameter?.type === "AssignmentPattern" ? firstParameter.left : firstParameter;
      if (accumulator?.type !== "Identifier") return null;
      return { callback, accumulator, initialValue: owner.arguments[1] };
    }
    parent = parent.parent;
  }
  return null;
}

function referencesAccumulator(
  sourceCode: SourceCode,
  node: ESTree.Node,
  accumulator: Variable,
  visited = new Set<Variable>(),
): boolean {
  const variable = resolveArrayBinding(sourceCode, node);
  if (variable === null || visited.has(variable)) return false;
  if (variable === accumulator) return true;
  visited.add(variable);
  if (variable.references.some(reference => reference.isWrite() && !reference.init)) return false;
  for (const definition of variable.defs) {
    if (
      definition.type === "Variable" && definition.node.type === "VariableDeclarator" &&
      definition.node.id.type === "Identifier" && definition.node.init !== null &&
      definition.node.parent.type === "VariableDeclaration" && definition.node.parent.kind === "const"
    ) {
      return referencesAccumulator(sourceCode, definition.node.init, accumulator, visited);
    }
  }
  return false;
}

function isReturnedReplacement(
	callback: ESTree.Node,
	variable: Variable,
	copy: ESTree.Node,
	returnStatement: ESTree.ReturnStatement,
): boolean {
	if (
		(callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression") ||
		callback.body === null || callback.body.type !== "BlockStatement" ||
		returnStatement.parent !== callback.body
	) return false;
	const body = callback.body.body;
	const returnIndex = body.indexOf(returnStatement);
	if (returnIndex < 0) return false;
	return variable.references.some((reference) => {
		if (!reference.isWrite() || reference.init) return false;
		const assignment = reference.identifier.parent;
		if (
			assignment?.type !== "AssignmentExpression" || assignment.operator !== "=" ||
			assignment.left !== reference.identifier || assignment.right !== copy
		) return false;
		const statement = assignment.parent;
		if (
			statement?.type !== "ExpressionStatement" || statement.expression !== assignment ||
			statement.parent !== callback.body
		) return false;
		const assignmentIndex = body.indexOf(statement);
		return assignmentIndex >= 0 && assignmentIndex < returnIndex;
	});
}

function hasObservableEscape(
	sourceCode: SourceCode,
	variable: Variable,
	copy: ESTree.Node,
	callback: ESTree.Node,
	visited = new Set<Variable>(),
): boolean {
	if (visited.has(variable)) return false;
	visited.add(variable);
	for (const reference of variable.references) {
		if (!reference.isRead()) continue;
		let value: ESTree.Node = reference.identifier;
		let parent = value.parent;
		while (
			parent !== null &&
			(parent.type === "ParenthesizedExpression" || parent.type === "TSAsExpression" ||
				parent.type === "TSTypeAssertion" || parent.type === "TSNonNullExpression" ||
				parent.type === "TSSatisfiesExpression")
		) {
			value = parent;
			parent = value.parent;
		}
		let insideCopy = false;
		for (let current: ESTree.Node | null = reference.identifier; current !== null; current = current.parent) {
			if (current === copy) {
				insideCopy = true;
				break;
			}
		}
		if (insideCopy) continue;
		if (
			parent?.type === "ReturnStatement" && parent.argument === value &&
			isReturnedReplacement(callback, variable, copy, parent)
		) continue;
		if (
			parent?.type === "VariableDeclarator" && parent.init === value &&
			parent.id.type === "Identifier" && parent.parent.type === "VariableDeclaration" &&
			parent.parent.kind === "const"
		) {
			const alias = resolveArrayBinding(sourceCode, parent.id);
			if (alias === null || hasObservableEscape(sourceCode, alias, copy, callback, visited)) return true;
			continue;
		}
		// Reading a member from the accumulator does not publish the accumulator itself.
		if (parent?.type === "MemberExpression" && parent.object === value) continue;
		// Any other read can retain or publish this version. Be conservative.
		return true;
	}
	return false;
}

function accumulatorEscapes(sourceCode: SourceCode, callback: ESTree.Node, accumulator: { readonly start: number }, copy: ESTree.Node): boolean {
	const variable = sourceCode.getDeclaredVariables(callback).find((candidate) =>
		candidate.identifiers.some((identifier) => identifier.start === accumulator.start),
	);
	return variable !== undefined && hasObservableEscape(sourceCode, variable, copy, callback);
}

function isGlobalCopyOwner(sourceCode: SourceCode, node: ESTree.Node, name: string): boolean {
  node = unwrapArrayExpression(node);
  if (node.type !== "Identifier" || node.name !== name) return false;
  const variable = resolveArrayBinding(sourceCode, node);
  return variable === null || variable.defs.length === 0;
}

/** Reject non-spread copies of reducer accumulators; pair with oxc/no-accumulating-spread. */
export const noReduceAccumulatorCopyRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow copying growing reducer accumulators with Object.assign, Array.from, or array copy methods." },
    messages: {
      accumulatorCopy: "Repeatedly copying a growing reducer accumulator can cause quadratic work. Mutate a fresh, locally owned builder before publication, or use a collection operation with the required output and traversal semantics. Preserve copying when the initial state is shared or prior versions must remain observable; never mutate caller-owned or published state merely to remove copies.",
    },
  },
	createOnce(context) {
		return {
			ObjectExpression(node: ESTree.ObjectExpression) {
				const reducer = enclosingReducer(node);
				if (reducer === null) return;
				const accumulator = context.sourceCode.getDeclaredVariables(reducer.callback).find(variable =>
					variable.identifiers.some(identifier => identifier.start === reducer.accumulator.start),
				);
				if (accumulator === undefined) return;
				const copiesAccumulator = node.properties.some((property) =>
					property.type === "SpreadElement" && referencesAccumulator(
						context.sourceCode,
						property.argument,
						accumulator,
					),
				);
				if (copiesAccumulator && !accumulatorEscapes(context.sourceCode, reducer.callback, reducer.accumulator, node)) {
					context.report({ node, messageId: "accumulatorCopy" });
				}
			},
			CallExpression(node) {
        const method = arrayMethodTarget(node.callee);
        if (method === null) return;
        const reducer = enclosingReducer(node);
        if (reducer === null) return;
        const accumulator = context.sourceCode.getDeclaredVariables(reducer.callback).find(variable =>
          variable.identifiers.some(identifier => identifier.start === reducer.accumulator.start),
        );
        if (accumulator === undefined) return;
        const isAccumulator = (expression: ESTree.Node) =>
          referencesAccumulator(context.sourceCode, expression, accumulator);
        let copiesAccumulator = false;
        if (method.name === "assign" && isGlobalCopyOwner(context.sourceCode, method.object, "Object")) {
          const target = node.arguments[0];
          copiesAccumulator = (
            target !== undefined && unwrapArrayExpression(target).type === "ObjectExpression" &&
            node.arguments.slice(1).some(isAccumulator)
          );
        } else if (method.name === "from" && isGlobalCopyOwner(context.sourceCode, method.object, "Array")) {
          const source = node.arguments[0];
          copiesAccumulator = source !== undefined && isAccumulator(source);
        } else if (["concat", "slice", "toSpliced", "toSorted", "toReversed", "with"].includes(method.name)) {
          const initialValue = reducer.initialValue;
          const arrayAccumulator = initialValue !== undefined &&
            isKnownArrayExpression(context.sourceCode, initialValue);
          copiesAccumulator = arrayAccumulator && isAccumulator(method.object);
        }
				if (copiesAccumulator && !accumulatorEscapes(context.sourceCode, reducer.callback, reducer.accumulator, node)) {
					context.report({ node, messageId: "accumulatorCopy" });
				}
      },
    };
  },
});
