// The type-aware lint (M5-D6): JavaScript logic over a recorded value, and impure calls in a recorded
// position. It reads source and type facts through the TypeScript 7 compiler API (the root
// node_modules/typescript, `unstable/async`) and runs nothing. It recognises a recorded value by its type (the
// `__flowRecorded` brand), not by where it is written, so it follows values into helpers and factories. It
// builds no description and compares nothing. Nodes are typed `any`: the spike reads a handful of kinds.
import { API } from "typescript/unstable/async";
import { SyntaxKind as K } from "typescript/unstable/ast";

export type Finding = {
  file: string;
  line: number;
  rule: "logic" | "impure";
  message: string;
  // `code` only when the lint has checked that the rewrite type-checks (its operands are conditions, or
  // values of one type); otherwise an instruction in words.
  fix: { code: string } | { instruction: string };
};

const IMPURE_ROOTS = new Set(["Date", "Math", "crypto", "performance"]);

export async function lint(dir: string, files: readonly string[]): Promise<Finding[]> {
  const api = new API({ cwd: dir });
  const findings: Finding[] = [];
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [`${dir}/tsconfig.json`] });
    const project = snapshot.getProjects()[0]!;
    const checker = project.checker;
    for (const f of files) {
      const sf: any = await project.program.getSourceFile(`${dir}/${f}`);
      // A source file the type facts do not cover fails closed, as Inspection D2's deny codes do.
      if (!sf) throw new Error(`TypeFactsUnavailable: ${f}`);
      await lintFile(f, sf, checker, findings);
    }
  } finally {
    await api.close();
  }
  return findings;
}

async function lintFile(file: string, sf: any, checker: any, findings: Finding[]) {
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

  // The value type of a recorded expression ("boolean" for a condition), or undefined if not recorded.
  const recordedValue = async (n: any): Promise<string | undefined> => {
    const t = await checker.getTypeAtLocation(n);
    const brand = t && (await checker.getPropertyOfType(t, "__flowRecorded"));
    if (!brand) return undefined;
    const bt = await checker.getNonNullableType(await checker.getTypeOfSymbol(brand));
    const v = await checker.getPropertyOfType(bt, "v");
    return v ? checker.typeToString(await checker.getNonNullableType(await checker.getTypeOfSymbol(v))) : "unknown";
  };
  // The nearest enclosing function, and whether it is a recorded callback (its parameter is a recording context).
  const enclosing = (n: any): any => {
    for (let p = n.parent; p; p = p.parent) if (p.kind === K.ArrowFunction || p.kind === K.FunctionExpression || p.kind === K.FunctionDeclaration) return p;
    return undefined;
  };
  const isRecordedCallback = async (fn: any) => {
    const p = fn?.parameters?.[0];
    if (!p) return false;
    const t = await checker.getTypeAtLocation(p);
    return !!(t && (await checker.getPropertyOfType(t, "__flowRecording")));
  };
  // A closure: the recorded value's root name is not a parameter of the function it is used in (a runtime
  // function that captured the recording `input`). A helper that takes recorded values as parameters is not one.
  const names = (b: any): string[] => (b.kind === K.Identifier ? [b.text] : (b.elements ?? []).flatMap((e: any) => names(e.name)));
  const rootName = (x: any): string | undefined => {
    while (x && (x.kind === K.PropertyAccessExpression || x.kind === K.ElementAccessExpression || x.kind === K.ParenthesizedExpression || x.kind === K.NonNullExpression)) x = x.expression;
    return x?.kind === K.Identifier ? x.text : undefined;
  };
  const closesOver = async (n: any, operands: any[]) => {
    const fn = enclosing(n);
    if (!fn || (await isRecordedCallback(fn))) return false;
    const params = fn.parameters.flatMap((p: any) => names(p.name));
    for (const o of operands) if ((await recordedValue(o)) && !params.includes(rootName(o))) return true;
    return false;
  };
  const operandsOf = (n: any) => (n.kind === K.ConditionalExpression ? [n.condition] : n.kind === K.BinaryExpression ? [n.left, n.right] : n.kind === K.PrefixUnaryExpression ? [n.operand] : []);
  const add = async (n: any, rule: Finding["rule"], message: string, fix: Finding["fix"]) => {
    const closure = rule === "logic" && (await closesOver(n, operandsOf(n)));
    findings.push(
      closure
        ? { file, line: line(n), rule, message: `a recorded value inside a runtime function: ${message}`, fix: { instruction: "a predicted value's function receives the input as its second parameter, (beneath, input) => …; use that instead of the recording `input`" } }
        : { file, line: line(n), rule, message, fix },
    );
  };
  const flat = (n: any, op: number): any[] => {
    const x = n.kind === K.ParenthesizedExpression ? n.expression : n;
    return x.kind === K.BinaryExpression && x.operatorToken.kind === op ? [...flat(x.left, op), ...flat(x.right, op)] : [x];
  };

  const visit = async (n: any): Promise<void> => {
    if (n.kind === K.ConditionalExpression && (await recordedValue(n.condition)))
      await add(n, "logic", "`?:` on a recorded value records only one branch (a proxy is always truthy)", {
        instruction: "a recorded position cannot branch: in a condition, write the alternatives as or(and(…), and(…)) over conditions, make two read entries, or use serverMatches; in a predicted field, use a function (beneath, input) => …",
      });
    if (n.kind === K.BinaryExpression) {
      const t = n.operatorToken.kind;
      const l = await recordedValue(n.left);
      const r = await recordedValue(n.right);
      if (l || r) {
        if (t === K.AmpersandAmpersandToken || t === K.BarBarToken) {
          const parts = flat(n, t);
          const kinds = await Promise.all(parts.map(recordedValue));
          const name = t === K.AmpersandAmpersandToken ? "and" : "or";
          const what = t === K.AmpersandAmpersandToken ? "`&&` records only its second operand" : "`||` records only its first operand";
          await add(n, "logic", what, kinds.every((k) => k === "boolean") ? { code: `${name}(${parts.map(src).join(", ")})` } : { instruction: `${name}(…) takes conditions; an operand here is not one` });
        } else if (t === K.EqualsEqualsEqualsToken || t === K.ExclamationEqualsEqualsToken) {
          const same = l && r && l === r;
          const code = `eq(${src(n.left)}, ${src(n.right)})`;
          await add(n, "logic", "`===` on a recorded value records a JavaScript boolean", same ? { code: t === K.EqualsEqualsEqualsToken ? code : `not(${code})` } : { instruction: "write eq(a, b) with two values of one type" });
        } else if (t === K.QuestionQuestionToken) {
          await add(n, "logic", "`??` on a recorded value records only its first operand", { instruction: "a condition has no default: the absent input already drops its constraint under and" });
        } else {
          await add(n, "logic", "JavaScript arithmetic or comparison on a recorded value throws at construction", { instruction: "conditions compare with eq, lt, gt, …; compute a bound in the machine and pass it as an input" });
        }
        return; // one finding per expression
      }
    }
    if (n.kind === K.PrefixUnaryExpression && n.operator === K.ExclamationToken) {
      const v = await recordedValue(n.operand);
      if (v) {
        await add(n, "logic", "`!` on a recorded value: a proxy is always truthy", v === "boolean" ? { code: `not(${src(n.operand)})` } : { instruction: "not(…) takes a condition" });
        return;
      }
    }
    const callee = n.kind === K.CallExpression ? n.expression : n.kind === K.NewExpression ? n.expression : undefined;
    const root = callee?.kind === K.PropertyAccessExpression ? callee.expression?.text : callee?.text;
    if (callee && IMPURE_ROOTS.has(root) && (await isRecordedCallback(enclosing(n))))
      await add(n, "impure", `\`${src(n)}\` runs once, at construction, and is recorded as a constant (a best-effort list: Date, Math, crypto, performance)`, {
        instruction: "pass the value as an input field the machine supplies (input.now)",
      });
    const kids: any[] = [];
    n.forEachChild((c: any) => {
      kids.push(c);
    });
    for (const c of kids) await visit(c);
  };
  await visit(sf);
}
