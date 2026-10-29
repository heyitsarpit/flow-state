// The source reader: reads domain declarations through the TypeScript 7 compiler API (the root
// node_modules/typescript, `unstable/async`), runs nothing, and produces the same description that
// recording produces. Anything a recorded position holds that is not a library operator, a parameter read
// or a constant is a finding with a fix-it. Resolution is syntactic within the project (imports, exported
// consts); the real reader would resolve symbols with the checker. Nodes are typed `any`: the spike reads
// a handful of node kinds.
import { API } from "typescript/unstable/async";
import { SyntaxKind as K } from "typescript/unstable/ast";
import type { ChangeIR, EntryDescription, IR } from "./flow.ts";

export type Finding = { file: string; line: number; entry: string; rule: string; message: string; fix?: string };
export type SourceResult = { domains: Record<string, Record<string, EntryDescription>>; findings: Finding[] };

const LIB = "flow.ts"; // the stand-in for the "flow-state" module specifier
const OPERATORS = new Set(["eq", "oneOf", "contains", "between", "overlaps", "gt", "gte", "lt", "lte", "isNull", "and", "or", "not", "serverMatches", "when", "coalesce", "add", "sub", "asc", "desc"]);
const IMPURE_ROOTS = new Set(["Date", "Math", "crypto", "performance"]);
const UNREADABLE: IR = { op: "<unreadable>", args: [] };

type Resolved = { kind: "lib"; name: string } | { kind: "entity"; id: string } | { kind: "op"; id: string } | { kind: "other"; name: string };

const joinPath = (from: string, rel: string) => {
  const parts = from.split("/").slice(0, -1);
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
};

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
    for (const f of files) await load(`${dir}/${f}`);

    const findings: Finding[] = [];
    const domains: SourceResult["domains"] = {};
    for (const f of files) {
      const path = `${dir}/${f}`;
      await readFile(path, await load(path), load, findings, domains);
    }
    return { domains, findings };
  } finally {
    await api.close();
  }
}

async function readFile(path: string, sf: any, load: (p: string) => Promise<any>, findings: Finding[], domains: SourceResult["domains"]) {
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

  // ── what a name means: a library export, an entity, an operation, or something else
  const imports = new Map<string, { module: string; name: string }>();
  for (const st of sf.statements) {
    if (st.kind !== K.ImportDeclaration || !st.importClause?.namedBindings?.elements) continue;
    for (const el of st.importClause.namedBindings.elements)
      imports.set(el.name.text, { module: st.moduleSpecifier.text, name: el.propertyName?.text ?? el.name.text });
  }
  const exportedInit = async (p: string, name: string) => {
    const f = await load(p);
    for (const st of f.statements)
      if (st.kind === K.VariableStatement)
        for (const d of st.declarationList.declarations) if (d.name.text === name) return { init: d.initializer, file: p };
    return undefined;
  };
  const classify = async (init: any, inFile: string, name: string): Promise<Resolved> => {
    // entity<Row>()({ id: "…" }) or op<I, R>()("…")
    if (init?.kind === K.CallExpression && init.expression.kind === K.CallExpression && init.expression.expression.kind === K.Identifier) {
      const inner = await resolveIn(inFile, init.expression.expression.text);
      const a = init.arguments[0];
      if (inner.kind === "lib" && inner.name === "entity" && a?.kind === K.ObjectLiteralExpression) {
        const idProp = a.properties.find((p: any) => p.name?.text === "id");
        return { kind: "entity", id: idProp.initializer.text };
      }
      if (inner.kind === "lib" && inner.name === "op" && a?.kind === K.StringLiteral) return { kind: "op", id: a.text };
    }
    return { kind: "other", name };
  };
  const resolveIn = async (inFile: string, name: string): Promise<Resolved> => {
    const f = await load(inFile);
    for (const st of f.statements) {
      if (st.kind === K.ImportDeclaration && st.importClause?.namedBindings?.elements)
        for (const el of st.importClause.namedBindings.elements)
          if (el.name.text === name) {
            const mod: string = st.moduleSpecifier.text;
            const imported = el.propertyName?.text ?? name;
            if (mod.endsWith(LIB)) return { kind: "lib", name: imported };
            const target = joinPath(inFile, mod);
            const e = await exportedInit(target, imported);
            return e ? classify(e.init, e.file, imported) : { kind: "other", name };
          }
      if (st.kind === K.VariableStatement)
        for (const d of st.declarationList.declarations) if (d.name.text === name) return classify(d.initializer, inFile, name);
    }
    return { kind: "other", name };
  };
  const resolve = (name: string) => resolveIn(path, name);

  // ── fix-its: the same expression in operator syntax
  const BIN: Record<number, string> = {
    [K.AmpersandAmpersandToken]: "and", [K.BarBarToken]: "or", [K.QuestionQuestionToken]: "coalesce",
    [K.EqualsEqualsEqualsToken]: "eq", [K.PlusToken]: "add", [K.MinusToken]: "sub",
    [K.LessThanToken]: "lt", [K.GreaterThanToken]: "gt", [K.LessThanEqualsToken]: "lte", [K.GreaterThanEqualsToken]: "gte",
  };
  const fix = (n: any): string => {
    switch (n.kind) {
      case K.ParenthesizedExpression:
        return fix(n.expression);
      case K.ConditionalExpression:
        return `when(${fix(n.condition)}, ${fix(n.whenTrue)}, ${fix(n.whenFalse)})`;
      case K.BinaryExpression: {
        const t = n.operatorToken.kind;
        if (t === K.ExclamationEqualsEqualsToken) return `not(eq(${fix(n.left)}, ${fix(n.right)}))`;
        const name = BIN[t];
        if (!name) return src(n);
        const flat = (x: any): string[] => (x.kind === K.BinaryExpression && x.operatorToken.kind === t && (name === "and" || name === "or") ? [...flat(x.left), ...flat(x.right)] : [fix(x)]);
        return `${name}(${[...flat(n.left), ...flat(n.right)].join(", ")})`;
      }
      case K.PrefixUnaryExpression:
        return n.operator === K.ExclamationToken ? `not(${fix(n.operand)})` : src(n);
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

  // ── a recorded position into the description
  type Scope = Map<string, string>; // parameter name → root
  let entry = "";
  const find = (n: any, rule: string, message: string, fixText?: string): IR => {
    findings.push({ file, line: line(n), entry, rule, message, ...(fixText !== undefined ? { fix: fixText } : {}) });
    return UNREADABLE;
  };
  const scopeOf = (fn: any, single?: string): Scope => {
    const s: Scope = new Map();
    const p = fn.parameters[0];
    if (!p) return s;
    if (p.name.kind === K.ObjectBindingPattern) for (const el of p.name.elements) s.set(el.name.text, el.propertyName?.text ?? el.name.text);
    else if (single) s.set(p.name.text, single);
    return s;
  };
  const bodyOf = (fn: any): any => {
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

  const expr = async (n: any, scope: Scope): Promise<IR> => {
    switch (n.kind) {
      case K.ParenthesizedExpression:
        return expr(n.expression, scope);
      case K.StringLiteral:
      case K.NoSubstitutionTemplateLiteral:
        return { val: n.text };
      case K.NumericLiteral:
        return { val: Number(n.text) };
      case K.TrueKeyword:
        return { val: true };
      case K.FalseKeyword:
        return { val: false };
      case K.NullKeyword:
        return { val: null };
      case K.PrefixUnaryExpression:
        if (n.operator === K.MinusToken && n.operand.kind === K.NumericLiteral) return { val: -Number(n.operand.text) };
        return find(n, "logic", "`!` on a recorded value is JavaScript logic; the proxy sees an object, which is always truthy", fix(n));
      case K.Identifier: {
        const root = scope.get(n.text);
        if (root) return { ref: [root] };
        return find(n, "outer-value", `\`${n.text}\` is an outer value; a recorded position reads only its parameters and constants`);
      }
      case K.PropertyAccessExpression: {
        const base = await expr(n.expression, scope);
        if (!("ref" in base)) return base;
        return { ref: [...base.ref, n.name.text] };
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
        return find(n, "logic", "`?:` records only one branch (the proxy is always truthy); write when(c, a, b)", fix(n));
      case K.BinaryExpression: {
        const t = n.operatorToken.kind;
        const what =
          t === K.AmpersandAmpersandToken ? "`&&` records only its second operand; write and(...)"
          : t === K.BarBarToken ? "`||` records only its first operand; write or(...)"
          : t === K.QuestionQuestionToken ? "`??` records only its first operand; write coalesce(a, b)"
          : t === K.EqualsEqualsEqualsToken || t === K.ExclamationEqualsEqualsToken ? "`===` compares two proxies and records a JavaScript boolean; write eq(a, b)"
          : "JavaScript arithmetic or comparison on a recorded value throws at construction; write add, sub, lt, gt";
        return find(n, "logic", what, fix(n));
      }
      case K.TemplateExpression:
        return find(n, "logic", "a template converts a recorded value to a string; string transforms stay serverMatches");
      case K.NewExpression:
        return find(n, "impure", `\`${src(n)}\` runs once, at construction, and is recorded as a constant`, "pass the value as an input field the machine supplies (input.now)");
      case K.CallExpression:
        return call(n, scope);
      default:
        return find(n, "one-expression", `${K[n.kind]} is not recorded`);
    }
  };

  const call = async (n: any, scope: Scope): Promise<IR> => {
    const callee = n.expression;
    if (callee.kind === K.Identifier) {
      const r = await resolve(callee.text);
      if (r.kind === "lib" && OPERATORS.has(r.name)) return { op: r.name, args: await Promise.all(n.arguments.map((a: any) => expr(a, scope))) };
      if (r.kind === "lib" && r.name === "opaque") return opaqueCall(n, scope);
      return find(n, "unknown-call", `\`${callee.text}\` is not a library operator; inline it as operators, or use opaque([...deps], fn) in a predicted value`);
    }
    if (callee.kind === K.PropertyAccessExpression && callee.expression.kind === K.Identifier) {
      const rootName = callee.expression.text;
      if (IMPURE_ROOTS.has(rootName))
        return find(n, "impure", `\`${src(n)}\` runs once, at construction, and is recorded as a constant`, "pass the value as an input field the machine supplies (input.now)");
      if (scope.has(rootName)) return find(n, "logic", "recorded values cannot be called; a filter the client cannot evaluate is serverMatches");
    }
    if (callee.kind === K.PropertyAccessExpression && (scope.has(callee.expression.expression?.text) || scope.has(callee.expression.text)))
      return find(n, "logic", "recorded values cannot be called; a filter the client cannot evaluate is serverMatches");
    return find(n, "unknown-call", `\`${src(callee)}\` is not a library operator`);
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
      find(n, "opaque-closure", `the opaque function closes over ${outer.map((o) => `\`${o}\``).join(", ")}, a recording value at construction; declare it as a dependency`, `opaque([${depsText}], (${params}) => ${body})`);
    }
    return { opaque: deps };
  };

  const entityId = async (n: any) => {
    const r = n.kind === K.Identifier ? await resolve(n.text) : undefined;
    return r?.kind === "entity" ? r.id : (find(n, "entity", "expected an entity declared with entity(...)"), "<unknown>");
  };
  const callback = async (fn: any, single?: string) => {
    const b = bodyOf(fn);
    return b ? expr(b, scopeOf(fn, single)) : UNREADABLE;
  };

  const change = async (n: any, scope: Scope): Promise<ChangeIR | undefined> => {
    if (n.kind === K.ParenthesizedExpression) return change(n.expression, scope);
    if (n.kind !== K.CallExpression || n.expression.kind !== K.PropertyAccessExpression) {
      find(n, "predicts", "`.predicts` returns Entity.patch(...) or Entity.delete(...), or an array of them; `when` belongs inside a field value", fix(n));
      return undefined;
    }
    const ent = await entityId(n.expression.expression);
    const method = n.expression.name.text;
    const key = await expr(n.arguments[0], scope);
    if (method === "delete") return { change: "delete", entity: ent, key };
    if (method !== "patch") return (find(n, "predicts", `Entity.${method} is not a prediction`), undefined);
    const fields: Record<string, IR> = {};
    for (const p of n.arguments[1].properties) {
      const v = p.kind === K.ShorthandPropertyAssignment ? p.name : p.initializer;
      if (v.kind === K.ArrowFunction) {
        const b = bodyOf(v);
        fields[p.name.text] = b ? await expr(b, new Map([...scope, ...scopeOf(v, "prior")])) : UNREADABLE;
      } else fields[p.name.text] = await expr(v, scope);
    }
    return { change: "patch", entity: ent, key, fields };
  };

  const readEntry = async (n: any): Promise<EntryDescription | undefined> => {
    const chain: any[] = [];
    let cur = n;
    while (cur.kind === K.CallExpression && cur.expression.kind === K.PropertyAccessExpression) {
      chain.unshift(cur);
      cur = cur.expression.expression;
    }
    if (cur.kind !== K.CallExpression || cur.expression.kind !== K.Identifier) return (find(n, "entry", "an entry starts with read, write or listen"), undefined);
    const base = await resolve(cur.expression.text);
    const o = await resolve(cur.arguments[0].text);
    if (base.kind !== "lib" || o.kind !== "op") return (find(n, "entry", "an entry starts with read(op), write(op) or listen(op)"), undefined);
    const d: EntryDescription = { kind: base.name as EntryDescription["kind"], op: o.id };
    for (const c of chain) {
      const m = c.expression.name.text;
      const a = c.arguments;
      if (m === "one" || m === "list")
        d.places = [...(d.places ?? []), { mode: m, entity: await entityId(a[0]), at: a[1] ? await callback(a[1]) : null }];
      else if (m === "derivedFrom") d.derivedFrom = { entity: await entityId(a[0]), fields: a[1] ? await callback(a[1]) : null };
      else if (m === "byKey") d.byKey = await callback(a[0]);
      else if (m === "where") d.where = await callback(a[0]);
      else if (m === "orderBy") {
        const ir = await callback(a[0]);
        d.orderBy = "arr" in ir ? [...ir.arr] : [ir];
      } else if (m === "pagedBy") d.pagedBy = { input: await callback(a[0]), next: await callback(a[1]) };
      else if (m === "predicts") {
        const fn = a[0];
        const b = bodyOf(fn);
        const scope = scopeOf(fn);
        const items = b?.kind === K.ArrayLiteralExpression ? b.elements : b ? [b] : [];
        d.predicts = (await Promise.all(items.map((x: any) => change(x, scope)))).filter((x): x is ChangeIR => x !== undefined);
      } else if (m === "as") {
        // a runtime position: the entity list is declared; the mapping is ordinary code, never read
        d.as = { entities: await Promise.all(a[0].elements.map(entityId)), mapping: "opaque" };
      } else find(c, "entry", `.${m} is not known to the spike`);
    }
    return d;
  };

  const visit = async (n: any): Promise<void> => {
    if (n.kind === K.CallExpression && n.expression.kind === K.Identifier) {
      const r = await resolve(n.expression.text);
      if (r.kind === "lib" && r.name === "domain") {
        const id: string = n.arguments[0].text;
        const out: Record<string, EntryDescription> = {};
        for (const p of n.arguments[1].properties) {
          entry = `${id}.${p.name.text}`;
          const d = await readEntry(p.initializer);
          if (d) out[p.name.text] = d;
        }
        domains[id] = out;
        return;
      }
    }
    const kids: any[] = [];
    n.forEachChild((c: any) => {
      kids.push(c);
    });
    for (const c of kids) await visit(c);
  };
  await visit(sf);
}
