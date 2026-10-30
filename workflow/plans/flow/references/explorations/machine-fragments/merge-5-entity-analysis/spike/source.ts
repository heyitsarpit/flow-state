// The lint (M5-D6, revised after review 3): an allowlist grammar for recorded callbacks, checked with type
// facts from the TypeScript 7 compiler API (the root node_modules/typescript, `unstable/async`). It runs
// nothing and builds no description. A recorded callback is found by its position: any function passed to a
// library recorded position (`.where`, `.orderBy`, `.byKey`, `.pagedBy`, a place, `.derivedFrom`, `.predicts`),
// written inline or passed by name, whatever its own parameter types (none, `any`), wherever the call is written.
//
// The grammar. A recorded callback's body is one expression made only of:
//   - calls to library functions (resolved by the checker to the library module), whose arguments are again
//     in the grammar; `Entity.patch` field values may also be runtime functions, which must not use the
//     callback's own parameters;
//   - property reads (`.x`, `["x"]`) on the callback's own parameters;
//   - literals, `new Date(<literal>)`, and pure `Math` functions over literals;
//   - identifiers and property reads whose type is a literal (a module `const`, an `as const` member, an enum
//     member) — `const NOW = Date.now()` has type number, so it is not one;
//   - reads rooted at a parameter of an enclosing factory whose type is a string, number or boolean (a tenant
//     id), never a Date or an object;
//   - calls to a helper in the same file whose parameters are recorded values or literals and whose body meets
//     the grammar;
//   - parentheses, `as`, `!`, `satisfies` around any of these; array and object literals of them, no spreads.
// Anything else is an error: "not a recorded expression: …". Nodes are typed `any`: the spike reads a handful
// of kinds.
import { API, TypeFlags } from "typescript/unstable/async";
import { SyntaxKind as K } from "typescript/unstable/ast";

export type Finding = {
  file: string;
  line: number;
  rule: "not-recorded" | "closure" | "claim";
  severity: "error" | "info";
  message: string;
  // `code` only when the lint has checked the rewrite type-checks; otherwise an instruction in words.
  fix?: { code: string } | { instruction: string };
};

const PURE_MATH = new Set(["max", "min", "abs", "floor", "ceil", "round", "trunc"]);
const WRAPPERS = new Set([K.ParenthesizedExpression, K.AsExpression, K.TypeAssertionExpression, K.NonNullExpression, K.SatisfiesExpression]);
const unwrap = (n: any): any => (n && WRAPPERS.has(n.kind) ? unwrap(n.expression) : n);

// The positions of recorded callbacks, by method and argument index.
const RECORDED: Record<string, readonly number[]> = { where: [0], orderBy: [0], byKey: [0], pagedBy: [0, 1], list: [1], one: [1], derivedFrom: [1], predicts: [0] };

// Lints the project's program (every source file its tsconfig includes, outside node_modules), or the given files.
export async function lint(dir: string, files?: readonly string[]): Promise<Finding[]> {
  const api = new API({ cwd: dir });
  const findings: Finding[] = [];
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [`${dir}/tsconfig.json`] });
    const project = snapshot.getProjects()[0]!;
    const names: string[] = files ? files.map((f) => `${dir}/${f}`) : (await project.program.getSourceFileNames()).filter((n: string) => n.startsWith(`${dir}/`) && !n.includes("/node_modules/") && !n.endsWith(".d.ts"));
    for (const full of names) {
      const f = full.slice(dir.length + 1);
      const sf: any = await project.program.getSourceFile(full);
      // A source file the type facts do not cover fails closed, as Inspection D2's deny codes do.
      if (!sf) throw new Error(`TypeFactsUnavailable: ${f}`);
      await lintFile(f, sf, project.checker, `${dir}/flow.ts`, findings);
    }
  } finally {
    await api.close();
  }
  return findings;
}

async function lintFile(file: string, sf: any, checker: any, libPath: string, findings: Finding[]) {
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
  const typeOf = async (n: any) => checker.getTypeAtLocation(n);
  const flags = async (n: any): Promise<number> => (await typeOf(n))?.flags ?? 0;
  const isLiteralType = async (n: any) => ((await flags(n)) & (TypeFlags.Literal | TypeFlags.EnumLiteral | TypeFlags.Null)) !== 0 && ((await flags(n)) & TypeFlags.Any) === 0;
  const isPrimitive = async (n: any) => {
    const f = await flags(n);
    return (f & TypeFlags.Any) === 0 && (f & (TypeFlags.String | TypeFlags.Number | TypeFlags.Boolean | TypeFlags.Literal | TypeFlags.EnumLiteral)) !== 0;
  };
  const brand = async (n: any, name: string) => {
    const t = await typeOf(n);
    return !!(t && (t.flags & TypeFlags.Any) === 0 && (await checker.getPropertyOfType(t, name)));
  };
  const isCondition = async (n: any) => {
    const t = await typeOf(n);
    const b = t && (await checker.getPropertyOfType(t, "__flowRecorded"));
    if (!b) return false;
    const v = await checker.getPropertyOfType(await checker.getNonNullableType(await checker.getTypeOfSymbol(b)), "v");
    return v ? (await checker.typeToString(await checker.getNonNullableType(await checker.getTypeOfSymbol(v)))) === "boolean" : false;
  };
  // A callee declared in the library module (through imports, aliases, namespaces and re-exports).
  const fromLibrary = async (callee: any) => {
    const node = unwrap(callee);
    const at = node.kind === K.PropertyAccessExpression ? node.name : node;
    let sym = await checker.getSymbolAtLocation(at);
    if (sym && sym.flags & 2097152) sym = await checker.getAliasedSymbol(sym); // an alias (an import)
    const path: string | undefined = sym?.valueDeclaration?.path;
    return path !== undefined && path.toLowerCase() === libPath.toLowerCase();
  };
  const names = (b: any): string[] => (b.kind === K.Identifier ? [b.text] : (b.elements ?? []).flatMap((e: any) => names(e.name)));
  const paramsOf = (fn: any): string[] => fn.parameters.flatMap((p: any) => names(p.name));
  const rootOf = (x: any): any => {
    x = unwrap(x);
    while (x && (x.kind === K.PropertyAccessExpression || x.kind === K.ElementAccessExpression)) x = unwrap(x.expression);
    return x;
  };
  const enclosingFunctions = (n: any): any[] => {
    const out: any[] = [];
    for (let p = n.parent; p; p = p.parent) if (p.kind === K.ArrowFunction || p.kind === K.FunctionExpression || p.kind === K.FunctionDeclaration) out.push(p);
    return out;
  };
  // Same-file helpers: `const name = (params) => expression`.
  const helpers = new Map<string, any>();
  for (const st of sf.statements)
    if (st.kind === K.VariableStatement)
      for (const d of st.declarationList.declarations) if (d.initializer?.kind === K.ArrowFunction && d.name.kind === K.Identifier) helpers.set(d.name.text, d.initializer);

  // Declarations through the checker (names are never resolved by text): a constant is a type fact and a value fact.
  const declOf = async (n: any): Promise<any> => {
    let sym = await checker.getSymbolAtLocation(n);
    if (sym && sym.flags & 2097152) sym = await checker.getAliasedSymbol(sym);
    return sym?.valueDeclaration ? await sym.valueDeclaration.resolve() : undefined;
  };
  const literalInit = (x: any): boolean => {
    x = unwrap(x);
    if ([K.StringLiteral, K.NumericLiteral, K.NoSubstitutionTemplateLiteral, K.TrueKeyword, K.FalseKeyword, K.NullKeyword].includes(x.kind)) return true;
    if (x.kind === K.PrefixUnaryExpression && x.operator === K.MinusToken && unwrap(x.operand).kind === K.NumericLiteral) return true;
    if (x.kind === K.ArrayLiteralExpression) return x.elements.every(literalInit);
    if (x.kind === K.ObjectLiteralExpression) return x.properties.every((p: any) => p.kind === K.PropertyAssignment && p.name?.kind !== K.ComputedPropertyName && literalInit(p.initializer));
    return false;
  };
  // A constant: its type is a literal, and its declaration is a single, non-ambient `const` (or an enum member, or a
  // property of a literal object) whose initializer is itself a literal. `Date.now() as 1`, a getter, `declare
  // const` and a computed enum member are not.
  const isConstant = async (n: any): Promise<boolean> => {
    if (!(await isLiteralType(n))) return false;
    const d = await declOf(n.kind === K.PropertyAccessExpression ? n.name : n);
    if (!d) return false;
    if (d.kind === K.VariableDeclaration) {
      const list = d.parent;
      const stmt = list?.parent;
      const ambient = (stmt?.modifiers ?? []).some((m: any) => m.kind === K.DeclareKeyword) || (list?.flags & 8388608) !== 0;
      return (list?.flags & 2) !== 0 && list.declarations.length === 1 && !ambient && d.initializer !== undefined && literalInit(d.initializer);
    }
    if (d.kind === K.EnumMember) return d.initializer === undefined || literalInit(d.initializer);
    if (d.kind === K.PropertyAssignment) return literalInit(d.initializer);
    return false;
  };
  // Parameters: a recorded callback has exactly one; no parameter of a callback or helper has an initializer or a
  // rest element anywhere in its binding tree (`now = Date.now()` would record a stale constant).
  const badBinding = (b: any): any => {
    if (!b) return undefined;
    if (b.initializer || b.dotDotDotToken) return b;
    for (const e of b.name?.elements ?? []) {
      const x = badBinding(e);
      if (x) return x;
    }
    return undefined;
  };
  const checkParams = (fn: any, kind: "callback" | "helper"): boolean => {
    if (kind === "callback" && fn.parameters.length !== 1) return bad(fn, `a recorded callback takes exactly one parameter (it has ${fn.parameters.length})`);
    for (const p of fn.parameters) {
      const b = badBinding(p);
      if (b) return bad(b, "a default or rest parameter (it would be evaluated once, at construction)");
    }
    return true;
  };
  // A library call must return a recorded value, a sort key or a change: `contradicts(…)` and `canonical(…)` are
  // declared in the library but return plain values.
  const recordedResult = async (n: any) => {
    const t = await typeOf(n);
    if (!t || t.flags & TypeFlags.Any) return false;
    if ((await checker.getPropertyOfType(t, "__flowRecorded")) || (await checker.getPropertyOfType(t, "__sort"))) return true;
    const text: string = await checker.typeToString(t);
    return /^Change</.test(text) || /^(readonly )?Change<.*>\[\]$/.test(text);
  };
  type Ctx = { params: Set<string>; fn: any };
  const bad = (n: any, what: string, fix?: Finding["fix"]): false => {
    findings.push({ file, line: line(n), rule: "not-recorded", severity: "error", message: `not a recorded expression: ${what}`, ...(fix ? { fix } : {}) });
    return false;
  };
  const fixFor = async (n: any): Promise<Finding["fix"]> => {
    if (n.kind === K.BinaryExpression) {
      const t = n.operatorToken.kind;
      if ((t === K.AmpersandAmpersandToken || t === K.BarBarToken) && (await isCondition(n.left)) && (await isCondition(n.right)))
        return { code: `${t === K.AmpersandAmpersandToken ? "and" : "or"}(${src(unwrap(n.left))}, ${src(unwrap(n.right))})` };
      if (t === K.EqualsEqualsEqualsToken && (await brand(n.left, "__flowRecorded")) && (await brand(n.right, "__flowRecorded"))) return { code: `eq(${src(n.left)}, ${src(n.right)})` };
    }
    if (n.kind === K.PrefixUnaryExpression && n.operator === K.ExclamationToken && (await isCondition(n.operand))) return { code: `not(${src(n.operand)})` };
    if (n.kind === K.ConditionalExpression || n.kind === K.IfStatement || n.kind === K.SwitchStatement)
      return { instruction: "a recorded expression cannot branch: write or(and(…), and(…)) over conditions, make two read entries, choose the callback outside it (in a factory), or use serverMatches" };
    return { instruction: "write it with condition operators over the callback's parameters and constants; compute anything else in the machine and pass it as an input" };
  };
  const kindName = (n: any) => (K as any)[n.kind] as string;

  const check = async (n0: any, ctx: Ctx, seen = new Set<any>()): Promise<boolean> => {
    const n = unwrap(n0);
    switch (n.kind) {
      case K.StringLiteral:
      case K.NumericLiteral:
      case K.NoSubstitutionTemplateLiteral:
      case K.TrueKeyword:
      case K.FalseKeyword:
      case K.NullKeyword:
        return true;
      case K.PrefixUnaryExpression:
        if (n.operator === K.MinusToken && unwrap(n.operand).kind === K.NumericLiteral) return true;
        return bad(n, `\`${src(n)}\` (an operator on a recorded value is JavaScript logic)`, await fixFor(n));
      case K.NewExpression:
        if (unwrap(n.expression).text === "Date" && n.arguments?.length === 1 && [K.StringLiteral, K.NumericLiteral].includes(unwrap(n.arguments[0]).kind)) return true;
        return bad(n, `\`${src(n)}\` runs once, at construction (a Date constant is new Date("…literal…"))`, { instruction: "pass the value as an input field the machine supplies (input.now)" });
      case K.Identifier:
      case K.PropertyAccessExpression:
      case K.ElementAccessExpression: {
        if (n.kind === K.ElementAccessExpression && ![K.StringLiteral, K.NumericLiteral].includes(unwrap(n.argumentExpression).kind)) return bad(n, "a computed property name");
        const root = rootOf(n);
        if (root?.kind === K.Identifier && ctx.params.has(root.text)) return true; // a read on the callback's parameters
        if (await isConstant(n)) return true; // a literal const, an as-const member, an enum member
        if (root?.kind === K.Identifier && enclosingFunctions(ctx.fn).some((f) => paramsOf(f).includes(root.text)) && (await isPrimitive(n))) return true; // a factory's primitive parameter
        return bad(n, `\`${src(n)}\` is neither a read on the callback's parameters nor a literal constant`, { instruction: "a value computed at load (Date.now(), a call) is stale; pass it as an input, or use a literal const" });
      }
      case K.ArrayLiteralExpression: {
        let ok = true;
        for (const e of n.elements) ok = (e.kind === K.SpreadElement ? bad(e, "a spread") : await check(e, ctx, seen)) && ok;
        return ok;
      }
      case K.ObjectLiteralExpression: {
        let ok = true;
        for (const p of n.properties) {
          if (p.name?.kind === K.ComputedPropertyName) ok = bad(p, "a computed property name") && ok;
          else if (p.kind === K.PropertyAssignment) ok = (await check(p.initializer, ctx, seen)) && ok;
          else if (p.kind === K.ShorthandPropertyAssignment) ok = (await check(p.name, ctx, seen)) && ok;
          else ok = bad(p, p.kind === K.SpreadAssignment ? "a spread (it would copy recorded values as one object)" : "a method or accessor");
        }
        return ok;
      }
      case K.CallExpression: {
        const callee = unwrap(n.expression);
        const lib = await fromLibrary(callee);
        const entityMethod = callee.kind === K.PropertyAccessExpression && ["patch", "delete"].includes(callee.name.text) && (await fromLibraryEntity(callee.expression));
        if (n.questionDotToken) return bad(n, "an optional call (`?.()`)");
        if (lib || entityMethod) {
          let ok = (await recordedResult(n)) || bad(n, `\`${src(callee)}\` returns a plain value, not a recorded expression`);
          // The receiver is part of the expression: `(c ? Card : Card2).patch(…)` branches there.
          if (callee.kind === K.PropertyAccessExpression && unwrap(callee.expression).kind !== K.Identifier) ok = (await check(callee.expression, ctx, seen)) && ok;
          for (const [i, a] of n.arguments.entries()) {
            if (a.kind === K.SpreadElement) {
              ok = bad(a, "a spread argument");
              continue;
            }
            if (entityMethod && callee.name.text === "patch" && i === 1 && unwrap(a).kind === K.ObjectLiteralExpression) ok = (await patchFields(unwrap(a), ctx, seen)) && ok;
            else ok = (await check(a, ctx, seen)) && ok;
          }
          return ok;
        }
        if (callee.kind === K.PropertyAccessExpression && unwrap(callee.expression).text === "Math" && PURE_MATH.has(callee.name.text)) {
          let ok = true;
          for (const a of n.arguments) ok = ((await isConstant(unwrap(a))) || literalInit(a) || bad(a, "Math over a non-literal")) && ok;
          return ok;
        }
        const hd = callee.kind === K.Identifier ? await declOf(callee) : undefined;
        const isHelper = hd?.kind === K.VariableDeclaration && (hd.parent?.flags & 2) !== 0 && hd.initializer?.kind === K.ArrowFunction && helpers.get(callee.text) !== undefined && hd.initializer.pos === helpers.get(callee.text).pos;
        if (callee.kind === K.Identifier && isHelper && !seen.has(callee.text)) {
          const h = helpers.get(callee.text);
          if (!checkParams(h, "helper")) return bad(n, `helper \`${callee.text}\` has a default or rest parameter`);
          for (const p of h.parameters)
            if (!(await brand(p, "__flowRecorded")) && !(await isPrimitive(p))) return bad(n, `helper \`${callee.text}\`'s parameter \`${src(p.name)}\` is not a recorded value or a primitive (any, a generic or an object)`);
          if (h.body.kind === K.Block) return bad(n, `helper \`${callee.text}\` is not one expression`);
          let ok = await check(h.body, { params: new Set(paramsOf(h)), fn: h }, new Set([...seen, callee.text]));
          for (const a of n.arguments) ok = (await check(a, ctx, seen)) && ok;
          return ok;
        }
        return bad(n, `a call to \`${src(callee)}\` (only library operators, same-file helpers that meet this grammar, and pure Math over literals)`, { instruction: "compute it in the machine and pass it as an input, or inline it as operators" });
      }
      default:
        return bad(n, `\`${src(n).slice(0, 60)}\` (${kindName(n)})`, await fixFor(n));
    }
  };
  const fromLibraryEntity = async (x: any) => {
    const t = await typeOf(x);
    return !!(t && (t.flags & TypeFlags.Any) === 0 && (await checker.getPropertyOfType(t, "patch")) && (await checker.getPropertyOfType(t, "delete")) && (await checker.getPropertyOfType(t, "save")));
  };
  // Patch fields: a value in the grammar, or a runtime function that does not use the callback's parameters.
  const patchFields = async (obj: any, ctx: Ctx, seen: Set<any>) => {
    let ok = true;
    for (const p of obj.properties) {
      if (p.name?.kind === K.ComputedPropertyName) {
        ok = bad(p, "a computed field name") && ok;
        continue;
      }
      if (p.kind !== K.PropertyAssignment) {
        ok = (p.kind === K.ShorthandPropertyAssignment ? await check(p.name, ctx, seen) : bad(p, "a spread of fields")) && ok;
        continue;
      }
      const v = unwrap(p.initializer);
      if (v.kind === K.ArrowFunction || v.kind === K.FunctionExpression) {
        const own = new Set(paramsOf(v));
        const visit = (x: any) => {
          if (x.kind === K.Identifier && ctx.params.has(x.text) && !own.has(x.text) && !(x.parent?.kind === K.PropertyAccessExpression && x.parent.name === x)) {
            findings.push({ file, line: line(x), rule: "closure", severity: "error", message: `a predicted field's function uses \`${x.text}\` from its \`.predicts\` callback (a recording value)`, fix: { instruction: "a predicted field's function receives the input as its second parameter, (beneath, input) => …" } });
            ok = false;
          }
          x.forEachChild((c: any) => {
            visit(c);
          });
        };
        visit(v.body);
      } else ok = (await check(p.initializer, ctx, seen)) && ok;
    }
    return ok;
  };

  // Same-file named functions, for callbacks passed by name.
  const named = new Map<string, any>(helpers);
  for (const st of sf.statements) if (st.kind === K.FunctionDeclaration && st.name) named.set(st.name.text, st);
  const nocheck = /@ts-nocheck/.test(text) || file.endsWith(".js");
  // Same-file domain factories: functions whose body calls the library's `domain`.
  const factories = new Set<string>();
  for (const [name, fn] of named) {
    let found = false;
    const scan = (x: any) => {
      if (x.kind === K.CallExpression && unwrap(x.expression).kind === K.Identifier && unwrap(x.expression).text === "domain") found = true;
      x.forEachChild((c: any) => {
        scan(c);
      });
    };
    scan(fn.body ?? fn);
    if (found) factories.add(name);
  }
  let reportedNocheck = false;
  const checkCallback = async (fn: any) => {
    if (nocheck && !reportedNocheck) {
      reportedNocheck = true;
      findings.push({ file, line: 1, rule: "not-recorded", severity: "error", message: "not a recorded expression: this file is not type-checked (@ts-nocheck or JavaScript), so its recorded positions cannot be analysed" });
    }
    if (!checkParams(fn, "callback")) return;
    const ctx = { params: new Set(paramsOf(fn)), fn };
    if (fn.body.kind === K.Block) {
      const stmt = fn.body.statements[0];
      const single = fn.body.statements.length === 1 && stmt?.kind === K.ReturnStatement && stmt.expression;
      if (single) await check(stmt.expression, ctx);
      else bad(stmt ?? fn.body, "a block (`if`, `switch`, statements): a recorded callback is one expression", stmt ? await fixFor(stmt) : undefined);
    } else await check(fn.body, ctx);
  };
  const visit = async (n: any): Promise<void> => {
    const callee = n.kind === K.CallExpression ? unwrap(n.expression) : undefined;
    const positions = callee?.kind === K.PropertyAccessExpression ? RECORDED[callee.name.text] : undefined;
    if (positions && (await fromLibrary(callee))) {
      for (const i of positions) {
        const a = n.arguments[i] && unwrap(n.arguments[i]);
        if (!a) continue;
        if (a.kind === K.ArrowFunction || a.kind === K.FunctionExpression) await checkCallback(a);
        else if (a.kind === K.Identifier) {
          // A name is followed through the checker: a single same-file `const` (or function declaration) only. A
          // parameter, a `let`, an import or a shadowed name cannot be followed.
          const d = await declOf(a);
          const sameFile = d && named.get(a.text) !== undefined;
          const fn =
            d?.kind === K.VariableDeclaration && (d.parent?.flags & 2) !== 0 && d.parent.declarations.length === 1 && [K.ArrowFunction, K.FunctionExpression].includes(d.initializer?.kind) ? d.initializer
            : d?.kind === K.FunctionDeclaration ? d
            : undefined;
          if (sameFile && fn && named.get(a.text).pos === (fn.kind === K.FunctionDeclaration ? fn.pos : fn.pos)) await checkCallback(named.get(a.text));
          else bad(a, `a recorded callback the lint cannot follow (\`${a.text}\` is ${d ? K[d.kind] === "Parameter" ? "a parameter" : (d.parent?.flags & 2) === 0 ? "not a const" : "declared elsewhere" : "unresolved"}): write it inline or as a const in this file`);
        }
        else bad(a, `a recorded callback the lint cannot read here (\`${src(a).slice(0, 40)}\`): write it inline or as a const in this file`);
      }
    }
    // A factory call: an argument that is not a literal is fixed for the domain's life; say so (9.5).
    if (n.kind === K.CallExpression && unwrap(n.expression).kind === K.Identifier && factories.has(unwrap(n.expression).text))
      for (const a of n.arguments)
        if (!(await isLiteralType(a)) && !literalInit(a))
          findings.push({ file, line: line(a), rule: "claim", severity: "info", message: `\`${src(a).slice(0, 40)}\` is passed to the domain factory \`${unwrap(n.expression).text}\`: its value is fixed for the domain's life` });
    // A claim the lint cannot check: say so where it is made.
    if (n.kind === K.CallExpression && (await fromLibrary(n.expression)) && unwrap(n.expression).text === "serverMatches")
      findings.push({ file, line: line(n), rule: "claim", severity: "info", message: `\`${src(n)}\` claims the server's match reads ${n.arguments.length > 1 ? "only these record fields" : "any field"}; a wrong list misses repairs, and only audit mode and propertyTest check it` });
    const kids: any[] = [];
    n.forEachChild((c: any) => {
      kids.push(c);
    });
    for (const c of kids) await visit(c);
  };
  await visit(sf);
}
