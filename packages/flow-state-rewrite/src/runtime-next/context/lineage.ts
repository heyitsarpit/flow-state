import { Option, Result } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { ActorIdentity } from "../actor/actor-directory.js";

/** One exact actor lifetime at one published revision. */
export type ContextCut = { readonly identity: ActorIdentity; readonly revision: number };

/** A consumer's inherited ancestors, keyed by actor key. */
export type ContextLineage = ReadonlyMap<string, ContextCut>;

/** Unsettled ancestor requirements grouped by incoming provider key. */
export type ContextEdgeDebt = Map<string, ContextLineage>;

export type ContextLineageProvider = {
  slot: string;
  cut: ContextCut;
  lineage: ContextLineage;
};

const invalidCut = (path: (string | number)[], summary: string) =>
  Failure({
    code: "MissingContextProvider",
    path,
    details: {},
    summary,
    help: "Reconcile the provider at a valid current revision.",
  });

export const conflictingCut = (path: (string | number)[], ancestor: string) =>
  Failure({
    code: "MissingContextProvider",
    path,
    details: { ancestor, reason: "incompatible-ancestor-cut" },
    summary: "Context providers require incompatible ancestor cuts.",
    help: "Reconcile the stale provider before selecting this consumer context.",
  });

// RETURN_TYPE: Keep validation failures independent of the cut value they inspect.
export const validateCut = (
  key: string,
  cut: ContextCut,
  path: (string | number)[],
): Result.Result<void, PublicDiagnostic> => {
  if (cut.identity.key !== key)
    return Result.fail(invalidCut(path, "Context cut does not match its actor key."));

  if (!Number.isSafeInteger(cut.revision) || cut.revision < 0)
    return Result.fail(invalidCut(path, "Context revision must be a non-negative safe integer."));

  return Result.succeed(undefined);
};

// RETURN_TYPE: A validated lineage remains owned by its caller until reconciliation succeeds.
export const validateLineage = (
  lineage: ContextLineage,
  path: (string | number)[],
): Result.Result<void, PublicDiagnostic> => {
  for (const [key, cut] of lineage) {
    const validation = validateCut(key, cut, [...path, key]);

    if (Result.isFailure(validation)) return Result.fail(validation.failure);
  }

  return Result.succeed(undefined);
};

const sameCut = (left: ContextCut, right: ContextCut) =>
  Object.is(left.identity, right.identity) && left.revision === right.revision;

export const covers = (actual: ContextCut, required: ContextCut) =>
  Object.is(actual.identity, required.identity) && actual.revision >= required.revision;

const sameLineage = (left: ContextLineage, right: ContextLineage) => {
  if (left.size !== right.size) return false;

  for (const [key, cut] of right) {
    const current = left.get(key);

    if (current === undefined || !sameCut(current, cut)) return false;
  }

  return true;
};

/** Shared ancestry keeps the copied cut immutable across sibling edge views. */
export const ownCut = (cut: ContextCut) =>
  Object.freeze({ identity: cut.identity, revision: cut.revision });

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

/** Owned ancestry shares unchanged keyed branches across graph joins. */
const lineageRoots = new WeakMap<ContextLineageTree, LineageTrie>();

const lineageRoot = (tree: ContextLineageTree) => {
  const root = lineageRoots.get(tree);

  if (root === undefined) throw new TypeError("Context lineage has no owned root");

  return root;
};

class ContextLineageTree implements ReadonlyMap<string, ContextCut> {
  [Symbol.toStringTag] = "ContextLineage";

  constructor(root: LineageTrie) {
    lineageRoots.set(this, root);
    Object.freeze(this);
  }

  get size() {
    return lineageRoot(this).size;
  }

  // RETURN_TYPE: The ReadonlyMap port returns a missing cut as undefined.
  get(key: string): ContextCut | undefined {
    let node = lineageRoot(this);

    for (const digit of keyDigits(key)) {
      const child = node.children.get(digit);

      if (child === undefined) return undefined;
      node = child;
    }

    return Option.isSome(node.cut) ? node.cut.value : undefined;
  }

  // RETURN_TYPE: ReadonlyMap lookup must remain boolean through parent layers.
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  // RETURN_TYPE: ReadonlyMap requires mutable tuple entries from its iterator.
  *entries(): MapIterator<[string, ContextCut]> {
    const root = lineageRoot(this);
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
        stack.push({ node: child.value, children: child.value.children.values(), entered: false });
    }
  }

  // RETURN_TYPE: The ReadonlyMap port requires a MapIterator of keys.
  *keys(): MapIterator<string> {
    for (const [key] of this.entries()) yield key;
  }

  // RETURN_TYPE: The ReadonlyMap port requires a MapIterator of cuts.
  *values(): MapIterator<ContextCut> {
    for (const [, cut] of this.entries()) yield cut;
  }

  forEach(callback: (value: ContextCut, key: string, map: ContextLineage) => void) {
    for (const [key, cut] of this.entries()) callback(cut, key, this);
  }

  [Symbol.iterator]() {
    return this.entries();
  }
}

const ownedTree = (lineage: ContextLineage) => {
  if (lineage instanceof ContextLineageTree) return Result.succeed(lineage);
  const valid = validateLineage(lineage, ["context", "lineage"]);

  if (Result.isFailure(valid)) return Result.fail(valid.failure);
  let root = emptyTrie;

  for (const cut of lineage.values()) {
    const inserted = insertTrie(root, cut, ["context", "lineage"]);

    if (Result.isFailure(inserted)) return Result.fail(inserted.failure);
    root = inserted.success;
  }

  return Result.succeed(new ContextLineageTree(root));
};

/** Merge owned provider cuts with shared ancestry and exact conflict checks. */
// RETURN_TYPE: The production lineage merge exposes typed cut conflicts.
export const mergeOwnedContextLineage = (
  consumer: ActorIdentity,
  previous: ContextLineage,
  providers: ContextLineageProvider[],
): Result.Result<ContextLineage, PublicDiagnostic> => {
  let root = emptyTrie;

  for (const provider of providers) {
    const path = ["contextBindings", provider.slot];
    const valid = validateCut(provider.cut.identity.key, provider.cut, path);

    if (Result.isFailure(valid)) return Result.fail(valid.failure);
    const ancestry = ownedTree(provider.lineage);

    if (Result.isFailure(ancestry)) return Result.fail(ancestry.failure);
    const extended = insertTrie(lineageRoot(ancestry.success), provider.cut, path);

    if (Result.isFailure(extended)) return Result.fail(extended.failure);
    const merged = mergeTries(root, extended.success, path);

    if (Result.isFailure(merged)) return Result.fail(merged.failure);
    root = merged.success;
  }

  const lineage = new ContextLineageTree(root);

  if (lineage.has(consumer.key))
    return Result.fail(conflictingCut(["context", "lineage"], consumer.key));

  return Result.succeed(
    previous instanceof ContextLineageTree && lineageRoot(previous) === root ? previous : lineage,
  );
};

/** Share unchanged wave cuts while propagating revised ancestors through a DAG. */
export const mergeContextLineageDeltas = (sources: ContextLineage[], own: ContextCut[] = []) => {
  let root = emptyTrie;

  for (const source of sources) {
    const tree = ownedTree(source);

    if (Result.isFailure(tree)) return Result.fail(tree.failure);
    const merged = mergeTries(root, lineageRoot(tree.success), ["context", "changes"]);

    if (Result.isFailure(merged)) return Result.fail(merged.failure);
    root = merged.success;
  }

  for (const cut of own) {
    const valid = validateCut(cut.identity.key, cut, ["context", "changes"]);

    if (Result.isFailure(valid)) return Result.fail(valid.failure);
    const inserted = insertTrie(root, cut, ["context", "changes"]);

    if (Result.isFailure(inserted)) return Result.fail(inserted.failure);
    root = inserted.success;
  }

  return Result.succeed(new ContextLineageTree(root));
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

const addDebtCut = (required: Option.Option<ContextCut>, observed: Option.Option<ContextCut>) => {
  if (Option.isNone(required)) return { cut: observed, conflict: Option.none<string>() };

  if (Option.isNone(observed)) return { cut: required, conflict: Option.none<string>() };

  if (!Object.is(required.value.identity, observed.value.identity))
    return { cut: required, conflict: Option.some(required.value.identity.key) };

  const cut = covers(observed.value, required.value) ? observed.value : required.value;

  return { cut: Option.some(cut), conflict: Option.none<string>() };
};

const settleDebtCut = (
  required: Option.Option<ContextCut>,
  observed: Option.Option<ContextCut>,
  inherited: boolean,
) => {
  if (Option.isNone(required)) return { cut: required, conflict: Option.none<string>() };

  if (Option.isNone(observed))
    return {
      cut: inherited ? Option.none<ContextCut>() : required,
      conflict: Option.none<string>(),
    };

  if (!Object.is(required.value.identity, observed.value.identity))
    return { cut: required, conflict: Option.some(required.value.identity.key) };

  const cut = covers(observed.value, required.value) ? Option.none<ContextCut>() : required;

  return { cut, conflict: Option.none<string>() };
};

const debtLeaf = (mode: DebtMode, left: LineageTrie, right: LineageTrie) => {
  const required = left.cut;
  const observed = right.cut;

  return mode === "add"
    ? addDebtCut(required, observed)
    : settleDebtCut(required, observed, mode === "select");
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
  const leaf = debtLeaf(mode, frame.left, frame.right);
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

/** Debt stays with lineage's private trie so mutable trie internals do not cross modules. */
/** Wave-local caches keep shared debt work proportional to changed trie branches. */
export const makeContextDebtOps = () => {
  const selectCache: DebtCache = new WeakMap();
  const addCache: DebtCache = new WeakMap();
  const settleCache: DebtCache = new WeakMap();
  const ownedCache = new WeakMap<ContextLineage, ContextLineageTree>();

  const own = (lineage: ContextLineage) => {
    if (lineage instanceof ContextLineageTree) return Result.succeed(lineage);
    const cached = ownedCache.get(lineage);

    if (cached !== undefined) return Result.succeed(cached);
    const converted = ownedTree(lineage);

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
        ? Result.succeed(new ContextLineageTree(settled.root))
        : Result.fail(conflictingCut(["context", "debt", edge], conflict.value));
    },
  };
};

// RETURN_TYPE: The merge operation exposes only a typed failure, not the mutable destination.
const appendCut = (
  next: Map<string, ContextCut>,
  consumer: ActorIdentity,
  ancestor: string,
  cut: ContextCut,
  path: (string | number)[],
): Result.Result<void, PublicDiagnostic> => {
  if (ancestor === consumer.key) return Result.fail(conflictingCut(path, ancestor));

  const present = next.get(ancestor);

  if (present !== undefined && !sameCut(present, cut))
    return Result.fail(conflictingCut(path, ancestor));

  next.set(ancestor, ownCut(cut));

  return Result.succeed(undefined);
};

/** Merge provider ancestry without retaining mutable caller cuts. */
export const reconcileContextLineage = (
  consumer: ActorIdentity,
  previous: ContextLineage,
  providers: ContextLineageProvider[],
) => {
  const priorValidation = validateLineage(previous, ["context", "lineage"]);

  if (Result.isFailure(priorValidation)) return Result.fail(priorValidation.failure);

  const next = new Map<string, ContextCut>();

  for (const provider of providers) {
    const path = ["contextBindings", provider.slot];
    const providerValidation = validateCut(provider.cut.identity.key, provider.cut, path);

    if (Result.isFailure(providerValidation)) return Result.fail(providerValidation.failure);

    const lineageValidation = validateLineage(provider.lineage, path);

    if (Result.isFailure(lineageValidation)) return Result.fail(lineageValidation.failure);

    for (const [ancestor, cut] of provider.lineage) {
      const merged = appendCut(next, consumer, ancestor, cut, path);

      if (Result.isFailure(merged)) return Result.fail(merged.failure);
    }

    const merged = appendCut(next, consumer, provider.cut.identity.key, provider.cut, path);

    if (Result.isFailure(merged)) return Result.fail(merged.failure);
  }

  return Result.succeed(sameLineage(previous, next) ? previous : next);
};
