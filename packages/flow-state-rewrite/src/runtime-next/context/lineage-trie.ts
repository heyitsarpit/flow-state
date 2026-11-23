import { Option, Result } from "effect";

import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import {
  addDebtCut,
  conflictingCut,
  ownCut,
  sameCut,
  settleDebtCut,
  type ContextCut,
  type ContextLineage,
} from "./lineage-model.js";
import { makeContextLineageView, type ContextLineageViewReader } from "./lineage-view.js";

type LineageTrie = {
  cut: Option.Option<ContextCut>;
  children: Map<number, LineageTrie>;
  size: number;
};

const emptyTrie: LineageTrie = { cut: Option.none(), children: new Map(), size: 0 };

const keyDigits = (key: string) => {
  const digits: number[] = [];

  for (let index = 0; index < key.length; index += 1) {
    const unit = key.charCodeAt(index);
    digits.push(unit >>> 8, unit & 255);
  }

  return digits;
};

const insertTrie = (root: LineageTrie, cut: ContextCut, path: (string | number)[]) => {
  const parents: Array<{ node: LineageTrie; digit: number }> = [];
  let node = root;

  for (const digit of keyDigits(cut.identity.key)) {
    parents.push({ node, digit });
    node = node.children.get(digit) ?? emptyTrie;
  }

  if (Option.isSome(node.cut))
    return sameCut(node.cut.value, cut)
      ? Result.succeed(root)
      : Result.fail(conflictingCut(path, cut.identity.key));

  let updated: LineageTrie = {
    cut: Option.some(ownCut(cut)),
    children: node.children,
    size: node.size + 1,
  };

  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const parent = parents[index]!;
    const children = new Map(parent.node.children);
    children.set(parent.digit, updated);
    updated = { cut: parent.node.cut, children, size: parent.node.size + 1 };
  }

  return Result.succeed(updated);
};

type MergeStep =
  | { kind: "enter"; left: LineageTrie; right: LineageTrie }
  | {
      kind: "exit";
      left: LineageTrie;
      cut: Option.Option<ContextCut>;
      children: Map<number, LineageTrie>;
      shared: Array<{ digit: number; left: LineageTrie; right: LineageTrie }>;
    };

const finishMerge = (step: Extract<MergeStep, { kind: "exit" }>, results: LineageTrie[]) => {
  for (let index = step.shared.length - 1; index >= 0; index -= 1)
    step.children.set(step.shared[index]!.digit, results.pop()!);

  let size = Option.isSome(step.cut) ? 1 : 0;

  for (const child of step.children.values()) size += child.size;

  const sameChildren =
    step.left.children.size === step.children.size &&
    [...step.children].every(([digit, child]) => step.left.children.get(digit) === child);

  return size === step.left.size && step.cut === step.left.cut && sameChildren
    ? step.left
    : { cut: step.cut, children: step.children, size };
};

const queueMerge = (
  step: Extract<MergeStep, { kind: "enter" }>,
  steps: MergeStep[],
  results: LineageTrie[],
  path: (string | number)[],
) => {
  if (step.left === step.right) {
    results.push(step.left);

    return Result.succeed(undefined);
  }

  const leftCut = step.left.cut;
  const rightCut = step.right.cut;

  if (Option.isSome(leftCut) && Option.isSome(rightCut) && !sameCut(leftCut.value, rightCut.value))
    return Result.fail(conflictingCut(path, leftCut.value.identity.key));

  const cut = Option.isSome(leftCut) ? leftCut : rightCut;
  const children = new Map(step.left.children);
  const shared: Extract<MergeStep, { kind: "exit" }>["shared"] = [];

  for (const [digit, child] of step.right.children) {
    const existing = step.left.children.get(digit);

    if (existing === undefined) children.set(digit, child);
    else shared.push({ digit, left: existing, right: child });
  }

  steps.push({ kind: "exit", left: step.left, cut, children, shared });

  for (let index = shared.length - 1; index >= 0; index -= 1) {
    const pair = shared[index]!;
    steps.push({ kind: "enter", left: pair.left, right: pair.right });
  }

  return Result.succeed(undefined);
};

const mergeTries = (left: LineageTrie, right: LineageTrie, path: (string | number)[]) => {
  const steps: MergeStep[] = [{ kind: "enter", left, right }];
  const results: LineageTrie[] = [];

  while (steps.length > 0) {
    const step = steps.pop()!;

    if (step.kind === "exit") results.push(finishMerge(step, results));
    else {
      const queued = queueMerge(step, steps, results, path);

      if (Result.isFailure(queued)) return Result.fail(queued.failure);
    }
  }

  return Result.succeed(results[0]!);
};

/** The trie root remains private while the public view reads its persistent nodes. */
const lineageRoots = new WeakMap<ContextLineage, LineageTrie>();

const lineageRoot = (lineage: ContextLineage) => {
  const root = lineageRoots.get(lineage);

  if (root === undefined) throw new TypeError("Context lineage has no owned root");

  return root;
};

const cutAt = (root: LineageTrie, key: string) => {
  let node = root;

  for (const digit of keyDigits(key)) {
    const child = node.children.get(digit);

    if (child === undefined) return undefined;
    node = child;
  }

  return Option.isSome(node.cut) ? node.cut.value : undefined;
};

const lineageReader: ContextLineageViewReader = {
  size: (lineage) => lineageRoot(lineage).size,
  get: (lineage, key) => cutAt(lineageRoot(lineage), key),
  entries: function* (lineage) {
    const root = lineageRoot(lineage);
    const stack = [{ node: root, children: root.children.values(), entered: false }];

    while (stack.length > 0) {
      const frame = stack.at(-1)!;

      if (!frame.entered) {
        frame.entered = true;

        if (Option.isSome(frame.node.cut))
          yield [frame.node.cut.value.identity.key, frame.node.cut.value];
      }

      const child = frame.children.next();

      if (child.done) stack.pop();
      else
        stack.push({
          node: child.value,
          children: child.value.children.values(),
          entered: false,
        });
    }
  },
};

// RETURN_TYPE: Trie nodes never cross this owner boundary; callers receive only the lineage port.
const makeTree = (root: LineageTrie): ContextLineage => {
  const view = makeContextLineageView(lineageReader);

  lineageRoots.set(view, root);

  return view;
};

export const isOwnedContextLineage = (lineage: ContextLineage) => lineageRoots.has(lineage);

/** A scoped builder mutates only its root reference and never exposes trie nodes. */
export const makeContextLineageBuilder = () => {
  let root = emptyTrie;

  return {
    add(cut: ContextCut, path: (string | number)[]) {
      const inserted = insertTrie(root, cut, path);

      if (Result.isFailure(inserted)) return Result.fail(inserted.failure);
      root = inserted.success;

      return Result.succeed(undefined);
    },
    merge(lineage: ContextLineage, path: (string | number)[]) {
      const merged = mergeTries(root, lineageRoot(lineage), path);

      if (Result.isFailure(merged)) return Result.fail(merged.failure);
      root = merged.success;

      return Result.succeed(undefined);
    },
    mergeWithCut(lineage: ContextLineage, cut: ContextCut, path: (string | number)[]) {
      const extended = insertTrie(lineageRoot(lineage), cut, path);

      if (Result.isFailure(extended)) return Result.fail(extended.failure);
      const merged = mergeTries(root, extended.success, path);

      if (Result.isFailure(merged)) return Result.fail(merged.failure);
      root = merged.success;

      return Result.succeed(undefined);
    },
    has(key: string) {
      return cutAt(root, key) !== undefined;
    },
    matches(lineage: ContextLineage) {
      return lineageRoots.get(lineage) === root;
    },
    finish() {
      return makeTree(root);
    },
  };
};

type DebtMerge = { root: LineageTrie; conflict: Option.Option<string> };

type DebtMode = "select" | "add" | "settle";

type DebtCache = WeakMap<LineageTrie, WeakMap<LineageTrie, DebtMerge>>;

type DebtFrame = {
  left: LineageTrie;
  right: LineageTrie;
  entered: boolean;
  keys: number[];
  children: Map<number, LineageTrie>;
  childIndex: number;
  cut: Option.Option<ContextCut>;
  conflict: Option.Option<string>;
};

const cachedDebt = (cache: DebtCache, left: LineageTrie, right: LineageTrie) =>
  cache.get(left)?.get(right);

const cacheDebt = (cache: DebtCache, left: LineageTrie, right: LineageTrie, result: DebtMerge) => {
  let rights = cache.get(left);

  if (rights === undefined) {
    rights = new WeakMap();
    cache.set(left, rights);
  }

  rights.set(right, result);
};

// RETURN_TYPE: Frames retain the exact cut and conflict Option types across the iterative walk.
const makeDebtFrame = (left: LineageTrie, right: LineageTrie): DebtFrame => ({
  left,
  right,
  entered: false,
  keys: [],
  children: new Map(),
  childIndex: 0,
  cut: Option.none(),
  conflict: Option.none(),
});

const applyDebtChild = (frame: DebtFrame, digit: number, child: DebtMerge) => {
  if (Option.isSome(child.conflict) && Option.isNone(frame.conflict))
    frame.conflict = child.conflict;

  if (child.root.size > 0) frame.children.set(digit, child.root);
};

const directDebtChild = (mode: DebtMode, left: LineageTrie, right: LineageTrie) => {
  if (left === emptyTrie) return mode === "add" ? right : emptyTrie;

  if (right === emptyTrie) return mode === "select" ? emptyTrie : left;

  return undefined;
};

const enterDebtFrame = (mode: DebtMode, frame: DebtFrame) => {
  const leaf =
    mode === "add"
      ? addDebtCut(frame.left.cut, frame.right.cut)
      : settleDebtCut(frame.left.cut, frame.right.cut, mode === "select");

  frame.cut = leaf.cut;
  frame.conflict = leaf.conflict;
  frame.keys =
    mode === "add"
      ? [...new Set([...frame.left.children.keys(), ...frame.right.children.keys()])]
      : [...frame.left.children.keys()];
  frame.entered = true;
};

const queueDebtChild = (
  mode: DebtMode,
  frame: DebtFrame,
  cache: DebtCache,
  frames: DebtFrame[],
) => {
  if (frame.childIndex >= frame.keys.length) return false;

  const digit = frame.keys[frame.childIndex++]!;
  const left = frame.left.children.get(digit) ?? emptyTrie;
  const right = frame.right.children.get(digit) ?? emptyTrie;
  const direct = directDebtChild(mode, left, right);

  if (direct !== undefined) {
    applyDebtChild(frame, digit, { root: direct, conflict: Option.none() });

    return true;
  }

  const cached = cachedDebt(cache, left, right);

  if (cached !== undefined) {
    applyDebtChild(frame, digit, cached);

    return true;
  }

  frames.push(makeDebtFrame(left, right));

  return true;
};

// RETURN_TYPE: The cached result has one root and one exact conflict lane.
const finishDebtFrame = (frame: DebtFrame, cache: DebtCache): DebtMerge => {
  let size = Option.isSome(frame.cut) ? 1 : 0;

  for (const child of frame.children.values()) size += child.size;

  const sameChildren =
    frame.left.children.size === frame.children.size &&
    [...frame.children].every(([digit, child]) => frame.left.children.get(digit) === child);

  let root: LineageTrie = emptyTrie;

  if (size > 0)
    root =
      frame.left.cut === frame.cut && sameChildren
        ? frame.left
        : { cut: frame.cut, children: frame.children, size };

  const result = { root, conflict: frame.conflict };

  cacheDebt(cache, frame.left, frame.right, result);

  return result;
};

/** Memoize immutable trie pairs so adjacent edges revisit only newly changed branches. */
// RETURN_TYPE: The merge returns its exact debt root and conflict key to the owner.
const reconcileDebtTries = (
  mode: DebtMode,
  left: LineageTrie,
  right: LineageTrie,
  cache: DebtCache,
): DebtMerge => {
  const direct = directDebtChild(mode, left, right);

  if (direct !== undefined) return { root: direct, conflict: Option.none() };

  const known = cachedDebt(cache, left, right);

  if (known !== undefined) return known;

  const frames = [makeDebtFrame(left, right)];
  let result: DebtMerge = { root: emptyTrie, conflict: Option.none() };

  while (frames.length > 0) {
    const frame = frames.at(-1)!;

    if (!frame.entered) enterDebtFrame(mode, frame);

    if (queueDebtChild(mode, frame, cache, frames)) continue;

    result = finishDebtFrame(frame, cache);
    frames.pop();

    if (frames.length > 0) {
      const parent = frames.at(-1)!;
      applyDebtChild(parent, parent.keys[parent.childIndex - 1]!, result);
    }
  }

  return result;
};

/** Wave-local caches keep shared debt work proportional to changed trie branches. */
export const makeContextDebtOps = (
  ownLineage: (lineage: ContextLineage) => Result.Result<ContextLineage, PublicDiagnostic>,
) => {
  const selectCache: DebtCache = new WeakMap();
  const addCache: DebtCache = new WeakMap();
  const settleCache: DebtCache = new WeakMap();
  const ownedCache = new WeakMap<ContextLineage, ContextLineage>();

  const own = (lineage: ContextLineage) => {
    if (lineageRoots.has(lineage)) return Result.succeed(lineage);
    const cached = ownedCache.get(lineage);

    if (cached !== undefined) return Result.succeed(cached);
    const converted = ownLineage(lineage);

    if (Result.isSuccess(converted)) ownedCache.set(lineage, converted.success);

    return converted;
  };

  return {
    // RETURN_TYPE: The internal debt owner exposes only readonly lineage and a typed diagnostic.
    reconcile(
      previous: ContextLineage,
      changed: ContextLineage,
      covered: ContextLineage,
      inherited: boolean,
      edge: string,
    ): Result.Result<ContextLineage, PublicDiagnostic> {
      const prior = own(previous);
      const required = own(changed);
      const actual = own(covered);

      if (Result.isFailure(prior)) return Result.fail(prior.failure);

      if (Result.isFailure(required)) return Result.fail(required.failure);

      if (Result.isFailure(actual)) return Result.fail(actual.failure);

      const selected = inherited
        ? reconcileDebtTries(
            "select",
            lineageRoot(required.success),
            lineageRoot(actual.success),
            selectCache,
          )
        : { root: lineageRoot(required.success), conflict: Option.none<string>() };

      const added = reconcileDebtTries("add", lineageRoot(prior.success), selected.root, addCache);

      const settled = reconcileDebtTries(
        "settle",
        added.root,
        lineageRoot(actual.success),
        settleCache,
      );

      let conflict = selected.conflict;

      if (Option.isNone(conflict)) conflict = added.conflict;

      if (Option.isNone(conflict)) conflict = settled.conflict;

      return Option.isNone(conflict)
        ? Result.succeed(makeTree(settled.root))
        : Result.fail(conflictingCut(["context", "debt", edge], conflict.value));
    },
  };
};
