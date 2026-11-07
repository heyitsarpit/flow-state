import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { Result } from "effect";

export type Edit = readonly [file: string, find: string, replace: string];
export type Snapshot = { readonly root: string; readonly trees: readonly string[]; readonly context: readonly string[] };
export type Copy = { readonly dir: string; readonly tree: (name: string) => string; readonly close: () => void };
export type Problem = { readonly id: string; readonly problem: "does not apply" | "does not parse"; readonly why: string };

const nodeModules = (from: string): string | undefined => {
  for (let d = from; dirname(d) !== d; d = dirname(d)) if (existsSync(join(d, "node_modules/.bin/tsc"))) return join(d, "node_modules");
  const common = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: from, stdin: "ignore" }).stdout.toString().trim();
  const main = common && join(dirname(common), "node_modules");
  return main && existsSync(join(main, ".bin/tsc")) ? main : undefined;
};

export const pattern = (find: string): RegExp =>
  new RegExp(
    find
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s*"),
  );
export const applyEdits = (text: string, find: string, replace: string): string | null => {
  const p = pattern(find);
  return p.test(text) ? text.replace(p, () => replace) : null;
};

const ancestor = (paths: readonly string[]): string => {
  const parts = paths.map((p) => p.split(sep));
  const out: string[] = [];
  for (let i = 0; parts.every((p) => i < p.length - 1 && p[i] === parts[0]![i]); i++) out.push(parts[0]![i]!);
  return out.join(sep) || sep;
};

export const snapshot = (sources: readonly string[], context: readonly string[] = []): Snapshot => {
  const abs = sources.map((s) => realpathSync(resolve(s)));
  const ctx = context.map((c) => resolve(c)).filter((c) => existsSync(c)).map((c) => realpathSync(c));
  const base = ancestor([...abs.map((a) => join(a, "x")), ...ctx]);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-snap-")));
  const nm = nodeModules(abs[0]!);
  mkdirSync(join(root, "pristine"));
  if (nm) symlinkSync(nm, join(root, "node_modules"));
  const trees = abs.map((a) => relative(base, a));
  for (const [i, a] of abs.entries()) cpSync(a, join(root, "pristine", trees[i]!), { recursive: true, filter: (f) => basename(f) !== "node_modules" });
  const rels = ctx.map((c) => relative(base, c));
  for (const [i, c] of ctx.entries()) {
    mkdirSync(dirname(join(root, "pristine", rels[i]!)), { recursive: true });
    cpSync(c, join(root, "pristine", rels[i]!));
  }
  return { root, trees, context: rels };
};

const treeOf = (s: Snapshot, name: string): string => {
  const t = s.trees.find((x) => basename(x) === name);
  if (t === undefined) throw new Error(`defect: no tree ${name} in the snapshot`);
  return t;
};

const edited = (s: Snapshot, tree: string, edits: readonly Edit[]): Result.Result<Map<string, string>, { problem: Problem["problem"]; why: string }> => {
  const texts = new Map<string, string>();
  const at = treeOf(s, tree);
  for (const [file, find, replace] of edits) {
    const path = join(s.root, "pristine", at, file);
    const before = texts.get(path) ?? (existsSync(path) ? readFileSync(path, "utf8") : "");
    const after = applyEdits(before, find, replace);
    if (after === null) return Result.fail({ problem: "does not apply", why: `edit does not apply to ${file}: ${find.slice(0, 120)}` });
    texts.set(path, after);
  }
  return Result.succeed(texts);
};

export const check = (s: Snapshot, tree: string, id: string, edits: readonly Edit[]): Problem | null => {
  const t = edited(s, tree, edits);
  if (Result.isFailure(t)) return { id, ...t.failure };
  const at = join(s.root, "pristine", treeOf(s, tree));
  for (const [path, text] of t.success)
    try {
      new Bun.Transpiler({ loader: "ts" }).scan(text);
    } catch (e) {
      return { id, problem: "does not parse", why: `${relative(at, path)}: ${String(e).slice(0, 120)}` };
    }
  return null;
};

let copies = 0;
export const copyOf = (s: Snapshot, tree: string, edits: readonly Edit[]): Result.Result<Copy, string> => {
  const t = edited(s, tree, edits);
  if (Result.isFailure(t)) return Result.fail(t.failure.why);
  const dir = join(s.root, `c-${process.pid}-${++copies}`);
  mkdirSync(dir);
  if (existsSync(join(s.root, "node_modules"))) symlinkSync(join(s.root, "node_modules"), join(dir, "node_modules"));
  for (const tr of s.trees) cpSync(join(s.root, "pristine", tr), join(dir, tr), { recursive: true });
  for (const c of s.context) {
    mkdirSync(dirname(join(dir, c)), { recursive: true });
    symlinkSync(join(s.root, "pristine", c), join(dir, c));
  }
  for (const [path, text] of t.success) writeFileSync(join(dir, relative(join(s.root, "pristine"), path)), text);
  return Result.succeed({
    dir,
    tree: (name) => join(dir, treeOf(s, name)),
    close: () => rmSync(dir, { recursive: true, force: true }),
  });
};

export const dropSnapshot = (s: Snapshot): void => rmSync(s.root, { recursive: true, force: true });
