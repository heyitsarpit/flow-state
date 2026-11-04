import type { ESTree, SourceCode } from "@oxlint/plugins";

import { importedEffectFunctionName } from "./effect-import.ts";
import { resolveVariable } from "../scope.ts";

const workflowNames = new Set(["fn", "fnUntraced", "fnUntracedEager", "gen"]);

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
  let current = expression;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSInstantiationExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function isTransparentWrapper(
  node: ESTree.Node,
): node is ESTree.Expression & { expression: ESTree.Expression } {
  return (
    node.type === "ParenthesizedExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSTypeAssertion" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSInstantiationExpression"
  );
}

export function isEffectWorkflowCallee(sourceCode: SourceCode, callee: ESTree.Expression): boolean {
  return workflowNameInCallee(sourceCode, callee) !== null;
}

export function isInsideEffectWorkflow(sourceCode: SourceCode, node: ESTree.Node): boolean {
  return isInsideEffectWorkflowWithSeen(sourceCode, node, new Set());
}

function isInsideEffectWorkflowWithSeen(
  sourceCode: SourceCode,
  node: ESTree.Node,
  seenFunctions: ReadonlySet<ESTree.Node>,
): boolean {
  let current: ESTree.Node | null = node.parent;
  while (current !== null) {
    if (
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression"
    ) {
      if (seenFunctions.has(current)) return false;
      const seen = new Set([...seenFunctions, current]);
      if (isEffectWorkflowCallback(sourceCode, current)) return true;
      if (isEffectTryCallback(sourceCode, current)) return false;
      if (isImmediatelyInvoked(current) || isEffectDeferredCallback(sourceCode, current)) {
        current = current.parent;
        continue;
      }
      if (isLocalFunctionCalledInWorkflow(sourceCode, current, seen)) return true;
      return false;
    }
    current = current.parent;
  }
  return false;
}

type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;

type FunctionCallArgument = {
  readonly call: ESTree.CallExpression;
  readonly index: number;
};

function isFunctionNode(node: ESTree.Node): node is FunctionNode {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function functionCallArgument(node: ESTree.Node): FunctionCallArgument | null {
  let parent: ESTree.Node | null = node.parent;
  while (parent !== null && isTransparentWrapper(parent)) parent = parent.parent;
  if (parent?.type !== "CallExpression") return null;
  const index = parent.arguments.findIndex(
    (argument) => argument.type !== "SpreadElement" && unwrapExpression(argument) === node,
  );
  return index === -1 ? null : { call: parent, index };
}

function workflowNameInCallee(sourceCode: SourceCode, callee: ESTree.Expression): string | null {
  const value = unwrapExpression(callee);
  if (value.type === "CallExpression") return workflowNameInCallee(sourceCode, value.callee);
  return importedEffectFunctionName(sourceCode, value, new Set(["Effect"]), workflowNames);
}

function workflowBodyArgumentIndex(sourceCode: SourceCode, call: ESTree.CallExpression): number {
  const name = workflowNameInCallee(sourceCode, call.callee);
  if (name === "gen" && call.arguments.length > 1) {
    const first = call.arguments[0];
    if (first !== undefined && first.type !== "SpreadElement" && !isFunctionNode(unwrapExpression(first))) {
      return 1;
    }
  }
  return 0;
}

/** True when this function is passed as the callback that defines an Effect workflow. */
export function isEffectWorkflowCallback(sourceCode: SourceCode, node: ESTree.Node): boolean {
  if (!isFunctionNode(node)) return false;
  const argument = functionCallArgument(node);
  return (
    argument !== null &&
    argument.index === workflowBodyArgumentIndex(sourceCode, argument.call) &&
    isEffectWorkflowCallee(sourceCode, argument.call.callee)
  );
}

/** True for the eager generator callback; its synchronous prefix runs at invocation. */
export function isEagerEffectWorkflowCallback(sourceCode: SourceCode, node: ESTree.Node): boolean {
  if (!isFunctionNode(node)) return false;
  const argument = functionCallArgument(node);
  return (
    argument !== null &&
    argument.index === 0 &&
    workflowNameInCallee(sourceCode, argument.call.callee) === "fnUntracedEager" &&
    isEffectWorkflowCallee(sourceCode, argument.call.callee)
  );
}

/** True when a function is the body callback for a deferred Effect workflow. */
export function isLazyEffectWorkflowCallback(sourceCode: SourceCode, node: ESTree.Node): boolean {
  return isEffectWorkflowCallback(sourceCode, node) && !isEagerEffectWorkflowCallback(sourceCode, node);
}

const deferredCallbackMethods = new Set([
  "sync",
  "suspend",
  "map",
  "flatMap",
  "tap",
  "andThen",
  "forEach",
  "acquireRelease",
  "acquireUseRelease",
]);

/** True when an expression occupies a callback argument deferred by Effect evaluation. */
export function isEffectDeferredCallbackArgument(
  sourceCode: SourceCode,
  node: ESTree.Node,
): boolean {
  if (!isFunctionNode(node) && node.type !== "Identifier") return false;
  const argument = functionCallArgument(node);
  if (argument === null) return false;
  const { call, index } = argument;
  if (isEffectWorkflowCallee(sourceCode, call.callee)) {
    return index === workflowBodyArgumentIndex(sourceCode, call) && isLazyEffectWorkflowCallee(sourceCode, call.callee);
  }
  const method = importedEffectFunctionName(
    sourceCode,
    call.callee,
    new Set(["Effect"]),
    deferredCallbackMethods,
  );
  if (!deferredCallbackMethods.has(method ?? "")) return false;
  if (method === "acquireRelease") return (call.arguments.length === 2 || call.arguments.length === 3) && index === 1;
  if (method === "acquireUseRelease")
    return call.arguments.length === 3 && (index === 1 || index === 2);
  if (method === "sync" || method === "suspend") return call.arguments.length === 1 && index === 0;
  if (method === "forEach") {
    if (index === 0 && call.arguments.length <= 2) return true;
    return index === 1 && call.arguments.length >= 2 && call.arguments.length <= 3;
  }
  return index === call.arguments.length - 1;
}

/** True only for callback positions whose execution belongs to Effect evaluation. */
export function isEffectDeferredCallback(sourceCode: SourceCode, node: ESTree.Node): boolean {
  return isFunctionNode(node) &&
    (isEffectTryCallback(sourceCode, node) || isEffectDeferredCallbackArgument(sourceCode, node));
}

/** Effect.try's try callback deliberately converts native throws into its failure channel. */
export function isEffectTryCallback(sourceCode: SourceCode, node: ESTree.Node): boolean {
  if (!isFunctionNode(node)) return false;
  let parent: ESTree.Node | null = node.parent;
  while (parent !== null && isTransparentWrapper(parent)) parent = parent.parent;
  if (
    parent?.type !== "Property" ||
    parent.key.type !== "Identifier" ||
    parent.key.name !== "try" ||
    parent.value !== node
  ) {
    return false;
  }
  const object = parent.parent;
  const call = object?.parent;
  if (object?.type !== "ObjectExpression" || call?.type !== "CallExpression") return false;
  return (
    importedEffectFunctionName(sourceCode, call.callee, new Set(["Effect"]), new Set(["try"])) === "try"
  );
}

function isImmediatelyInvoked(node: FunctionNode): boolean {
  let parent: ESTree.Node | null = node.parent;
  while (parent !== null && isTransparentWrapper(parent)) parent = parent.parent;
  if (parent?.type !== "CallExpression") return false;
  let callee: ESTree.Expression = parent.callee;
  while (isTransparentWrapper(callee)) callee = callee.expression;
  return callee === node;
}

/** True for a direct recursive call of the local function declaration being checked. */
export function isSelfRecursiveFunctionReference(
	sourceCode: SourceCode,
	node: ESTree.Node,
	functionNode: ESTree.Node,
): boolean {
	if (
		node.type !== "Identifier" ||
		functionNode.type !== "FunctionDeclaration" ||
		functionNode.id === null
	) return false;
	const call = node.parent;
	if (call?.type !== "CallExpression" || call.callee !== node) return false;
	let current: ESTree.Node | null = call.parent;
	while (current !== null && !isFunctionNode(current)) current = current.parent;
	return current === functionNode &&
		resolveVariable(sourceCode, node) !== null &&
		resolveVariable(sourceCode, node) === resolveVariable(sourceCode, functionNode.id);
}

function isLocalFunctionCalledInWorkflow(
  sourceCode: SourceCode,
  node: FunctionNode,
  seenFunctions: ReadonlySet<ESTree.Node>,
): boolean {
  let identifier: (ESTree.Node & { type: "Identifier"; name: string }) | null = null;
  if (node.type === "FunctionDeclaration") identifier = node.id;
  else {
    let parent: ESTree.Node | null = node.parent;
    while (parent !== null && isTransparentWrapper(parent)) parent = parent.parent;
    if (
      parent?.type === "VariableDeclarator" &&
      parent.init !== null &&
      unwrapExpression(parent.init) === node &&
      parent.id.type === "Identifier"
    ) {
      identifier = parent.id;
    }
  }
  if (identifier === null) return false;
  const variable = resolveVariable(sourceCode, identifier);
  if (variable === null) return false;
  return variable.references.some((reference) => {
    if (!reference.isRead()) return false;
    const call = reference.identifier.parent;
    return (
      call?.type === "CallExpression" &&
      call.callee === reference.identifier &&
      isInsideEffectWorkflowWithSeen(sourceCode, call, seenFunctions)
    );
  });
}

/** The eager generator variant must not be treated as execution-deferred construction. */
export function isLazyEffectWorkflowCallee(
  sourceCode: SourceCode,
  callee: ESTree.Expression,
): boolean {
  const value = unwrapExpression(callee);
  if (value.type === "CallExpression") return isLazyEffectWorkflowCallee(sourceCode, value.callee);
  return workflowNameInCallee(sourceCode, value) !== "fnUntracedEager" &&
    isEffectWorkflowCallee(sourceCode, value);
}
