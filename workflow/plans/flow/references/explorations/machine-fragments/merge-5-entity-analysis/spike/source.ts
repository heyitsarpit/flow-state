// The source reader: reads domain declarations through the TypeScript 7 compiler API (the root
// node_modules/typescript, `unstable/async`), runs nothing, and produces the same description that
// recording produces. Anything a recorded position holds that is not a library operator, a parameter read,
// a constant (a literal, a module `const`, an `as const` member, an enum member) is a finding with a
// fix-it. Resolution is syntactic within the project (imports, re-exports, exported consts); the real
// reader resolves symbols with the checker. Nodes are typed `any`: the spike reads a handful of kinds.
import { API } from "typescript/unstable/async";
import { SyntaxKind as K } from "typescript/unstable/ast";
import type { ChangeIR, EntryDescription, IR } from "./flow.ts";

export type Finding = {
  file: string;
  line: number;
  entry: string;
  rule: string;
  message: string;
  fix?: string;
  fixKind?: "mechanical" | "starting point"; // a starting point may break a type rule (A3, A11): the types decide
};
export type SourceResult = { domains: Record<string, Record<string, EntryDescription>>; findings: Finding[] };

const LIB_PACKAGE = "flow-state"; // the real library's specifier; the spike's stand-in is the file flow.ts
const OPERATORS = new Set(["eq", "oneOf", "contains", "between", "overlaps", "gt", "gte", "lt", "lte", "isNull", "and", "or", "not", "serverMatches", "when", "coalesce", "add", "sub", "asc", "desc"]);
const IMPURE_ROOTS = new Set(["Date", "Math", "crypto", "performance"]);
const UNREADABLE: IR = { op: "<unreadable>", args: [] };
const WRAPPERS = new Set([K.ParenthesizedExpression, K.AsExpression, K.TypeAssertionExpression, K.NonNullExpression, K.SatisfiesExpression]);

type Resolved =
  | { kind: "lib"; name: string }
  | { kind: "libNamespace" }
  | { kind: "entity"; id: string }
  | { kind: "op"; id: string }
  | { kind: "const"; value: IR }
  | { kind: "members"; members: Record<string, IR> } // an enum or an `as const` object
  | { kind: "other"; name: string };

const joinPath = (from: string, rel: string) => {
  const parts = from.split("/").slice(0, -1);
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
};
const unwrap = (n: any): any => (n && WRAPPERS.has(n.kind) ? unwrap(n.expression) : n);

export async function readSources(dir: string, files: readonly string[]): Promise<SourceResult> {
  const api = new API({ cwd: dir });
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [`${dir}/tsconfig.json`] });
    const project = snapshot.getProjects()[0]!;
    const sources = new Map<string, any>();
    const load = async (path: string) => {
      if (!sources.has(path)) sources.set(path, await project.program.getSourceFile(path));
      return sources.get(path);
    };
    const findings: Finding[] = [];
    const domains: SourceResult["domains"] = {};
    for (const f of files) {
      const path = `${dir}/${f}`;
      await readFile(path, await load(path), load, `${dir}/flow.ts`, findings, domains);
    }
    return { domains, findings };
  } finally {
    await api.close();
  }
}

async function readFile(path: string, sf: any, load: (p: string) => Promise<any>, libPath: string, findings: Finding[], domains: SourceResult["domains"]) {
  const text: string = sf.text;
  const start = (n: any) => {
    let i: number = n.pos;
    for (;;) {
      while (i < n.end && /\s/.test(text[i]!)) i++;
      if (text.startsWith("//", i)) i = text.indexOf("\n", i);
      else if (text.startsWith("/*", i)) i = text.indexOf("*/", i) + 2;
      else return i;
    }
  };
  const src = (n: any) => text.slice(start(n), n.end);
  const line = (n: any) => text.slice(0, start(n)).split("\n").length;
  const file = path.split("/").slice(-2).join("/");
  // The library is one exact module: the package specifier, or (in the spike) the resolved stand-in file.
  const isLib = (fromFile: string, spec: string) => spec === LIB_PACKAGE || (spec.startsWith(".") && joinPath(fromFile, spec) === libPath);

  // ── what a name means
  const literal = (n: any): IR | undefined => {
    n = unwrap(n);
    if (n.kind === K.StringLiteral || n.kind === K.NoSubstitutionTemplateLiteral) return { val: n.text };
    if (n.kind === K.NumericLiteral) return { val: Number(n.text) };
    if (n.kind === K.TrueKeyword) return { val: true };
    if (n.kind === K.FalseKeyword) return { val: false };
    if (n.kind === K.NullKeyword) return { val: null };
    if (n.kind === K.PrefixUnaryExpression && n.operator === K.MinusToken && unwrap(n.operand).kind === K.NumericLiteral) return { val: -Number(unwrap(n.operand).text) };
    return undefined;
  };
  const classify = async (init: any, inFile: string, name: string, isConst: boolean): Promise<Resolved> => {
    const lit = isConst && init ? literal(init) : undefined;
    if (lit) return { kind: "const", value: lit };
    const bare = unwrap(init);
    if (isConst && bare?.kind === K.ObjectLiteralExpression && init.kind === K.AsExpression) {
      const members: Record<string, IR> = {};
      for (const p of bare.properties) {
        const v = p.kind === K.PropertyAssignment ? literal(p.initializer) : undefined;
        if (v) members[p.name.text] = v;
      }
      return { kind: "members", members };
    }
    // entity<Row>()({ id: "…" }) or op<I, R>()("…")
    if (bare?.kind === K.CallExpression && bare.expression.kind === K.CallExpression && bare.expression.expression.kind === K.Identifier) {
      const inner = await resolveIn(inFile, bare.expression.expression.text);
      const a = bare.arguments[0];
      if (inner.kind === "lib" && inner.name === "entity" && a?.kind === K.ObjectLiteralExpression) {
        const idProp = a.properties.find((p: any) => p.name?.text === "id");
        return { kind: "entity", id: idProp.initializer.text };
      }
      if (inner.kind === "lib" && inner.name === "op" && a?.kind === K.StringLiteral) return { kind: "op", id: a.text };
    }
    return { kind: "other", name };
  };
  const enumMembers = (decl: any): Resolved => {
    const members: Record<string, IR> = {};
    let next = 0;
    for (const m of decl.members) {
      const v = m.initializer ? literal(m.initializer) : { val: next };
      if (v) members[m.name.text] = v;
      if (v && "val" in v && typeof v.val === "number") next = v.val + 1;
    }
    return { kind: "members", members };
  };
  // A name exported by a module: a declaration, or a re-export (named or `export *`) followed to its source.
  const resolveExport = async (inFile: string, name: string, seen = new Set<string>()): Promise<Resolved> => {
    if (seen.has(`${inFile}#${name}`)) return { kind: "other", name };
    seen.add(`${inFile}#${name}`);
    const f = await load(inFile);
    for (const st of f.statements) {
      if (st.kind === K.VariableStatement)
        for (const d of st.declarationList.declarations) if (d.name.text === name) return classify(d.initializer, inFile, name, (st.declarationList.flags & 2) !== 0);
      if (st.kind === K.EnumDeclaration && st.name.text === name) return enumMembers(st);
      if (st.kind === K.ExportDeclaration && st.moduleSpecifier) {
        const spec: string = st.moduleSpecifier.text;
        const els = st.exportClause?.elements;
        const hit = els ? els.find((e: any) => e.name.text === name) : undefined;
        if (els && !hit) continue;
        const imported = hit ? (hit.propertyName?.text ?? name) : name;
        if (isLib(inFile, spec)) return { kind: "lib", name: imported };
        const r = await resolveExport(joinPath(inFile, spec), imported, seen);
        if (r.kind !== "other" || hit) return r;
      }
    }
    return { kind: "other", name };
  };
  const resolveIn = async (inFile: string, name: string): Promise<Resolved> => {
    const f = await load(inFile);
    for (const st of f.statements) {
      if (st.kind === K.ImportDeclaration && st.importClause?.namedBindings) {
        const nb = st.importClause.namedBindings;
        const spec: string = st.moduleSpecifier.text;
        if (nb.kind === K.NamespaceImport && nb.name.text === name) return isLib(inFile, spec) ? { kind: "libNamespace" } : { kind: "other", name };
        for (const el of nb.elements ?? [])
          if (el.name.text === name) {
            const imported = el.propertyName?.text ?? name;
            return isLib(inFile, spec) ? { kind: "lib", name: imported } : resolveExport(joinPath(inFile, spec), imported);
          }
      }
    }
    return resolveExport(inFile, name);
  };
  const resolve = (name: string) => resolveIn(path, name);

  // ── fix-its: the same expression in operator syntax
  const BIN: Record<number, string> = {
    [K.AmpersandAmpersandToken]: "and", [K.BarBarToken]: "or", [K.QuestionQuestionToken]: "coalesce",
    [K.EqualsEqualsEqualsToken]: "eq", [K.PlusToken]: "add", [K.MinusToken]: "sub",
    [K.LessThanToken]: "lt", [K.GreaterThanToken]: "gt", [K.LessThanEqualsToken]: "lte", [K.GreaterThanEqualsToken]: "gte",
  };
  let mechanical = true; // false once a fix-it introduces or, not, when or coalesce, where rule A3 or A11 applies
  const fix = (n: any): string => {
    switch (n.kind) {
      case K.ParenthesizedExpression:
        return fix(n.expression);
      case K.ConditionalExpression:
        mechanical = false;
        return `when(${fix(n.condition)}, ${fix(n.whenTrue)}, ${fix(n.whenFalse)})`;
      case K.BinaryExpression: {
        const t = n.operatorToken.kind;
        if (t === K.ExclamationEqualsEqualsToken) {
          mechanical = false;
          return `not(eq(${fix(n.left)}, ${fix(n.right)}))`;
        }
        const name = BIN[t];
        if (!name) return src(n);
        if (name === "or" || name === "coalesce") mechanical = false;
        const flat = (x: any): string[] => (x.kind === K.BinaryExpression && x.operatorToken.kind === t && (name === "and" || name === "or") ? [...flat(x.left), ...flat(x.right)] : [fix(x)]);
        return `${name}(${[...flat(n.left), ...flat(n.right)].join(", ")})`;
      }
      case K.PrefixUnaryExpression:
        if (n.operator !== K.ExclamationToken) return src(n);
        mechanical = false;
        return `not(${fix(n.operand)})`;
      case K.CallExpression:
        return `${src(n.expression)}(${n.arguments.map(fix).join(", ")})`;
      case K.ArrowFunction:
        return `(${n.parameters.map(src).join(", ")}) => ${fix(n.body)}`;
      case K.ObjectLiteralExpression:
        return `{ ${n.properties.map((p: any) => (p.kind === K.PropertyAssignment ? `${src(p.name)}: ${fix(p.initializer)}` : src(p))).join(", ")} }`;
      case K.ArrayLiteralExpression:
        return `[${n.elements.map(fix).join(", ")}]`;
      default:
        return src(n);
    }
  };
  const fixOf = (n: any) => {
    mechanical = true;
    const text = fix(n);
    return { fix: text, fixKind: mechanical ? ("mechanical" as const) : ("starting point" as const) };
  };

  // ── a recorded position into the description
  type Scope = Map<string, readonly string[]>; // parameter name → path ("@ctx" is a whole-context parameter)
  let entry = "";
  const find = (n: any, rule: string, message: string, fixed?: { fix: string; fixKind?: Finding["fixKind"] }): IR => {
    findings.push({ file, line: line(n), entry, rule, message, ...(fixed ?? {}) });
    return UNREADABLE;
  };
  const bind = (pattern: any, base: readonly string[], s: Scope) => {
    for (const el of pattern.elements) {
      const prop: string = el.propertyName?.text ?? el.name.text;
      const path = base.length === 0 ? [prop] : [...base, prop];
      if (el.name.kind === K.ObjectBindingPattern) bind(el.name, path, s);
      else s.set(el.name.text, path);
    }
  };
  const scopeOf = (fn: any, single?: string): Scope => {
    const s: Scope = new Map();
    const p = fn.parameters[0];
    if (!p) return s;
    if (p.name.kind === K.ObjectBindingPattern) bind(p.name, [], s);
    else s.set(p.name.text, [single ?? "@ctx"]);
    return s;
  };
  const bodyOf = (fn: any): any => {
    fn = unwrap(fn);
    if (fn.kind !== K.ArrowFunction) {
      find(fn, "one-expression", "a recorded position is an arrow function returning one expression");
      return undefined;
    }
    if (fn.body.kind === K.Block) {
      find(fn.body, "one-expression", "a recorded position is one expression, not a block: write the value with when, and, or");
      return undefined;
    }
    return fn.body;
  };
  const member = (base: IR, name: string): IR => {
    if (!("ref" in base)) return base;
    return base.ref.length === 1 && base.ref[0] === "@ctx" ? { ref: [name] } : { ref: [...base.ref, name] };
  };

  const expr = async (n: any, scope: Scope): Promise<IR> => {
    if (WRAPPERS.has(n.kind)) return expr(n.expression, scope); // parentheses, `as`, `<T>`, `!`, `satisfies`
    const lit = literal(n);
    if (lit) return lit;
    switch (n.kind) {
      case K.PrefixUnaryExpression:
        return find(n, "logic", "`!` on a recorded value is JavaScript logic; the proxy sees an object, which is always truthy", fixOf(n));
      case K.Identifier: {
        const path = scope.get(n.text);
        if (path) return { ref: path }; // ["@ctx"] becomes a root at the next property read (member)
        const r = path ? undefined : await resolve(n.text);
        if (r?.kind === "const") return r.value;
        return find(n, "outer-value", `\`${n.text}\` is an outer value; a recorded position reads its parameters, constants and enum members`);
      }
      case K.PropertyAccessExpression:
      case K.ElementAccessExpression: {
        const name =
          n.kind === K.PropertyAccessExpression ? n.name.text
          : n.argumentExpression.kind === K.StringLiteral || n.argumentExpression.kind === K.NumericLiteral ? n.argumentExpression.text
          : undefined;
        if (name === undefined) return find(n, "one-expression", "a computed property name is not recorded; write input.x");
        const baseNode = unwrap(n.expression);
        if (baseNode.kind === K.Identifier && !scope.has(baseNode.text)) {
          const r = await resolve(baseNode.text);
          if (r.kind === "members" && name in r.members) return r.members[name]!;
        }
        return member(await expr(n.expression, scope), name);
      }
      case K.ArrayLiteralExpression:
        return { arr: await Promise.all(n.elements.map((e: any) => expr(e, scope))) };
      case K.ObjectLiteralExpression: {
        const obj: Record<string, IR> = {};
        for (const p of n.properties) {
          if (p.kind === K.PropertyAssignment) obj[p.name.text] = await expr(p.initializer, scope);
          else if (p.kind === K.ShorthandPropertyAssignment) obj[p.name.text] = await expr(p.name, scope);
          else return find(p, "one-expression", "spreads and methods are not recorded");
        }
        return { obj };
      }
      case K.ConditionalExpression:
        return find(n, "logic", "`?:` records only one branch (the proxy is always truthy); write when(c, a, b)", fixOf(n));
      case K.BinaryExpression: {
        const t = n.operatorToken.kind;
        const what =
          t === K.AmpersandAmpersandToken ? "`&&` records only its second operand; write and(...)"
          : t === K.BarBarToken ? "`||` records only its first operand; write or(...)"
          : t === K.QuestionQuestionToken ? "`??` records only its first operand; write coalesce(a, b)"
          : t === K.EqualsEqualsEqualsToken || t === K.ExclamationEqualsEqualsToken ? "`===` compares two proxies and records a JavaScript boolean; write eq(a, b)"
          : "JavaScript arithmetic or comparison on a recorded value throws at construction; write add, sub, lt, gt";
        return find(n, "logic", what, fixOf(n));
      }
      case K.TemplateExpression:
        return find(n, "logic", "a template converts a recorded value to a string; string transforms stay serverMatches");
      case K.NewExpression:
        return find(n, "impure", `\`${src(n)}\` runs once, at construction, and is recorded as a constant`, { fix: "pass the value as an input field the machine supplies (input.now)" });
      case K.CallExpression:
        return call(n, scope);
      default:
        return find(n, "one-expression", `${K[n.kind]} is not recorded`);
    }
  };

  const libCallee = async (callee: any): Promise<string | undefined> => {
    callee = unwrap(callee);
    if (callee.kind === K.Identifier) {
      const r = await resolve(callee.text);
      return r.kind === "lib" ? r.name : undefined;
    }
    if (callee.kind === K.PropertyAccessExpression && unwrap(callee.expression).kind === K.Identifier) {
      const r = await resolve(unwrap(callee.expression).text);
      return r.kind === "libNamespace" ? callee.name.text : undefined;
    }
    return undefined;
  };

  const call = async (n: any, scope: Scope): Promise<IR> => {
    const name = await libCallee(n.expression);
    if (name && OPERATORS.has(name)) return { op: name, args: await Promise.all(n.arguments.map((a: any) => expr(a, scope))) };
    if (name === "opaque") return opaqueCall(n, scope);
    const callee = unwrap(n.expression);
    if (callee.kind === K.PropertyAccessExpression && unwrap(callee.expression).kind === K.Identifier) {
      const rootName = unwrap(callee.expression).text;
      if (IMPURE_ROOTS.has(rootName))
        return find(n, "impure", `\`${src(n)}\` runs once, at construction, and is recorded as a constant`, { fix: "pass the value as an input field the machine supplies (input.now)" });
      if (scope.has(rootName)) return find(n, "logic", "recorded values cannot be called; a filter the client cannot evaluate is serverMatches");
    }
    return find(n, "unknown-call", `\`${src(callee)}\` is not a library operator; inline it as operators, or use opaque([...deps], fn) in a predicted value`);
  };

  // opaque([deps], fn): the dependencies are recorded; the function body is checked, never read into IR.
  const opaqueCall = async (n: any, scope: Scope): Promise<IR> => {
    const [depsNode, fn] = n.arguments;
    if (depsNode?.kind !== K.ArrayLiteralExpression) return find(n, "opaque", "opaque takes an array literal of dependencies");
    const deps = await Promise.all(depsNode.elements.map((e: any) => expr(e, scope)));
    const outer: string[] = [];
    const visit = (x: any) => {
      if (x.kind === K.PropertyAccessExpression && x.expression.kind === K.Identifier && scope.has(x.expression.text)) {
        if (!outer.includes(src(x))) outer.push(src(x));
        return; // `input.emoji` is one dependency; do not count `input` again
      }
      if (x.kind === K.Identifier && scope.has(x.text) && !(x.parent?.kind === K.PropertyAccessExpression && x.parent.name === x) && !outer.includes(x.text)) outer.push(x.text);
      if (x.kind === K.CallExpression && x.expression.kind === K.PropertyAccessExpression && IMPURE_ROOTS.has(x.expression.expression?.text))
        find(x, "impure", `\`${src(x)}\` inside an opaque value: it is replayed over every new base, so it must depend only on its arguments`);
      if (x.kind === K.NewExpression && x.expression.text === "Date") find(x, "impure", "`new Date()` inside an opaque value: replays would disagree");
      x.forEachChild((c: any) => {
        visit(c);
      });
    };
    visit(fn.body);
    if (outer.length > 0) {
      const names = outer.map((o) => o.split(".").pop()!);
      let body = src(fn.body);
      outer.forEach((o, i) => (body = body.split(o).join(names[i]!)));
      const params = [...fn.parameters.map(src), ...names].join(", ");
      const depsText = [...depsNode.elements.map(src), ...outer].join(", ");
      find(n, "opaque-closure", `the opaque function closes over ${outer.map((o) => `\`${o}\``).join(", ")}, a recording value at construction; declare it as a dependency`, {
        fix: `opaque([${depsText}], (${params}) => ${body})`,
        fixKind: "mechanical",
      });
    }
    return { opaque: deps };
  };

  const entityId = async (n: any) => {
    n = unwrap(n);
    const r = n.kind === K.Identifier ? await resolve(n.text) : undefined;
    return r?.kind === "entity" ? r.id : (find(n, "entity", "expected an entity declared with entity(...)"), "<unknown>");
  };
  const callback = async (fn: any, single?: string) => {
    const b = bodyOf(fn);
    return b ? expr(b, scopeOf(unwrap(fn), single)) : UNREADABLE;
  };

  const change = async (n: any, scope: Scope): Promise<ChangeIR | undefined> => {
    n = unwrap(n);
    if (n.kind !== K.CallExpression || n.expression.kind !== K.PropertyAccessExpression) {
      find(n, "predicts", "`.predicts` returns Entity.patch(...) or Entity.delete(...), or an array of them; `when` belongs inside a field value", fixOf(n));
      return undefined;
    }
    const ent = await entityId(n.expression.expression);
    const method = n.expression.name.text;
    const key = await expr(n.arguments[0], scope);
    if (method === "delete") return { change: "delete", entity: ent, key };
    if (method !== "patch") return (find(n, "predicts", `Entity.${method} is not a prediction`), undefined);
    const fields: Record<string, IR> = {};
    for (const p of unwrap(n.arguments[1]).properties) {
      const v = unwrap(p.kind === K.ShorthandPropertyAssignment ? p.name : p.initializer);
      if (v.kind === K.ArrowFunction) {
        const b = bodyOf(v);
        fields[p.name.text] = b ? await expr(b, new Map([...scope, ...scopeOf(v, "prior")])) : UNREADABLE;
      } else fields[p.name.text] = await expr(v, scope);
    }
    return { change: "patch", entity: ent, key, fields };
  };

  const readEntry = async (n: any): Promise<EntryDescription | undefined> => {
    const chain: any[] = [];
    let cur = unwrap(n);
    while (cur.kind === K.CallExpression && unwrap(cur.expression).kind === K.PropertyAccessExpression) {
      chain.unshift(cur);
      cur = unwrap(unwrap(cur.expression).expression);
    }
    const base = cur.kind === K.CallExpression ? await libCallee(cur.expression) : undefined;
    const o = cur.kind === K.CallExpression && unwrap(cur.arguments[0])?.kind === K.Identifier ? await resolve(unwrap(cur.arguments[0]).text) : undefined;
    if (!base || !["read", "write", "listen"].includes(base) || o?.kind !== "op")
      return (find(n, "unreadable-domain", "an entry must be written read(op), write(op) or listen(op) followed by its methods; entries built by functions are not read in version 1"), undefined);
    const d: EntryDescription = { kind: base as EntryDescription["kind"], op: o.id };
    for (const c of chain) {
      const m = unwrap(c.expression).name.text;
      const a = c.arguments;
      if (m === "one" || m === "list")
        d.places = [...(d.places ?? []), { mode: m, entity: await entityId(a[0]), at: a[1] ? await callback(a[1]) : null }];
      else if (m === "derivedFrom") d.derivedFrom = { entity: await entityId(a[0]), fields: a[1] ? await callback(a[1]) : null };
      else if (m === "byKey") d.byKey = await callback(a[0]);
      else if (m === "where") {
        const w = await callback(a[0]);
        d.where = d.where ? { op: "and", args: [d.where, w] } : w; // several .where calls: and, in call order
      } else if (m === "orderBy") {
        const ir = await callback(a[0]);
        d.orderBy = "arr" in ir ? [...ir.arr] : [ir];
      } else if (m === "pagedBy") d.pagedBy = { input: await callback(a[0]), next: await callback(a[1]) };
      else if (m === "predicts") {
        const fn = unwrap(a[0]);
        const b = bodyOf(fn);
        const scope = scopeOf(fn);
        const body = b ? unwrap(b) : undefined;
        const items = body?.kind === K.ArrayLiteralExpression ? body.elements : body ? [body] : [];
        d.predicts = (await Promise.all(items.map((x: any) => change(x, scope)))).filter((x): x is ChangeIR => x !== undefined);
      } else if (m === "as") {
        // a runtime position: the entity list is declared; the mapping is ordinary code, never read
        d.as = { entities: await Promise.all(unwrap(a[0]).elements.map(entityId)), mapping: "opaque" };
      } else find(c, "entry", `.${m} is not known to the spike`);
    }
    return d;
  };

  const visit = async (n: any): Promise<void> => {
    if (n.kind === K.CallExpression && (await libCallee(n.expression)) === "domain") {
      const [idNode, entriesNode] = n.arguments.map(unwrap);
      if (idNode?.kind !== K.StringLiteral || entriesNode?.kind !== K.ObjectLiteralExpression) {
        entry = "<unknown>";
        find(n, "unreadable-domain", "a domain is read only as domain(\"literal id\", { entry: read(op)…, … }); a factory or a computed id is not read in version 1 (M5-D4: no helpers)");
        return;
      }
      const out: Record<string, EntryDescription> = {};
      for (const p of entriesNode.properties) {
        entry = `${idNode.text}.${p.name.text}`;
        const d = await readEntry(p.initializer);
        if (d) out[p.name.text] = d;
      }
      domains[idNode.text] = out;
      return;
    }
    const kids: any[] = [];
    n.forEachChild((c: any) => {
      kids.push(c);
    });
    for (const c of kids) await visit(c);
  };
  await visit(sf);
}

// The agreement check (rule A10): the first node where two descriptions differ, with both renderings.
export const canon = (x: unknown): string =>
  Array.isArray(x) ? `[${x.map(canon).join(",")}]`
  : x !== null && typeof x === "object" ? `{${Object.keys(x).sort().filter((k) => (x as any)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon((x as any)[k])}`).join(",")}}`
  : JSON.stringify(x);
export function firstDifference(a: unknown, b: unknown, path = ""): { path: string; recorded: string; source: string } | undefined {
  if (canon(a) === canon(b)) return undefined;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const d = firstDifference((a as any)[k], (b as any)[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
  }
  return { path, recorded: canon(a), source: canon(b) };
}
