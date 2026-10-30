# Reverts each fix of reviews 3 and 4 in turn and checks that some spike check fails (run from spike/: python3 mutations.py).
import subprocess, shutil, sys
M = [
 ("existence side", "flow.ts", 'const existence = typeof before !== "object" || typeof after !== "object";', 'const existence = false;'),
 ("unread-field bound", "flow.ts", '  if (!touched) return { repair: false };\n', ''),
 ("prefix paths", "flow.ts", '  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;\n  return true;', '  return a.length === b.length && a.every((x, i) => x === b[i]);'),
 ("arrays atomic", "flow.ts", 'return i < 0 ? p : p.slice(0, i);', 'return p;'),
 ("carried fields", "flow.ts", 'env.carried ? { value: ABSENT_FIELD, field: name } : ', ''),
 ("decode failure is maybe", "flow.ts", '    : input === DECODE_FAILED ? maybe("server", "the answer\'s input could not be decoded")\n', ''),
 ("per-record slots", "flow.ts", 'const slot = (entity: string, key: unknown, field: string) => `${entity}:${keyText(key)}:${field}`;', 'const slot = (entity: string, key: unknown, field: string) => `${entity}::${field}`;'),
 ("settle reads uncomputed slots", "flow.ts", '        slots.push({ attempt: l.attempt, slot: sl, field: f, state: fault ? "fault" : "uncomputed", reason });', '        if (fault) slots.push({ attempt: l.attempt, slot: sl, field: f, state: "fault", reason });'),
 ("whole-value confirmation", "flow.ts", 'q.length <= 1 && q[0] === field', 'q[0] === field'),
 ("freeze everywhere", "flow.ts", '    return Object.freeze(x);\n  } catch {', '    return x;\n  } catch {'),
 ("faults not skips", "flow.ts", 'const fault = e instanceof RecordingError || e instanceof PredictionFault;', 'const fault = false;'),
 ("checkReplays double call", "flow.ts", '  if (options.checkReplays) {', '  if (false) {'),
 ("key decode", "flow.ts", '  if (!types || key === null || typeof key !== "object") return key;', '  return key;'),
 ("total canonical (bigint)", "flow.ts", '  if (typeof x === "bigint") return `${x}n`;\n', ''),
 ("literal-type constants", "source.ts", '    if (!(await isLiteralType(n))) return false;\n    const d = await declOf', '    return true;\n    const d = await declOf'),
 ("receiver check", "source.ts", '          if (callee.kind === K.PropertyAccessExpression && unwrap(callee.expression).kind !== K.Identifier) ok = (await check(callee.expression, ctx, seen)) && ok;\n', ''),
 ("computed field names", "source.ts", '      if (p.name?.kind === K.ComputedPropertyName) {\n        ok = bad(p, "a computed field name") && ok;\n        continue;\n      }\n', ''),
 ("named callbacks", "source.ts", '        else if (a.kind === K.Identifier) {\n', '        else if (a.kind === K.Identifier) {\n          continue;\n'),
 ("zero-parameter callbacks", "source.ts", '  const checkCallback = async (fn: any) => {', '  const checkCallback = async (fn: any) => {\n    if (fn.parameters.length === 0) return;'),
 ("ts-nocheck files", "source.ts", 'const nocheck = /@ts-nocheck/.test(text) || file.endsWith(".js");', 'const nocheck = false;'),
 # review 5
 ("H1 carried as paths", "flow.ts", '    if (held.length <= read.length && held.every((seg, i) => seg === read[i])) return true;', '    if (held[0] === read[0]) return true;'),
 ("H2 oneOf element checks", "flow.ts", '        const bad = usable(x, "oneOf");\n        if (bad) return bad.v === "maybe" ? maybe(bad.why, bad.detail, fields) : bad;\n        list.push(x);', '        list.push(x);'),
 ("H3 one parameter, no defaults", "source.ts", '  const checkParams = (fn: any, kind: "callback" | "helper"): boolean => {', '  const checkParams = (fn: any, kind: "callback" | "helper"): boolean => {\n    return true;'),
 ("H4 sealed Date/Map/Set mutators", "flow.ts", 'const seal = (x: object, names: readonly string[]) => {\n  for (const n of names)', 'const seal = (x: object, names: readonly string[]) => {\n  for (const n of [] as string[])'),
 ("wrong-kind eq is maybe", "flow.ts", '  if (kind(a) !== "null" && kind(b) !== "null" && kind(a) !== kind(b)) return maybe(', '  if (false) return maybe('),
 ("between inverted is maybe", "flow.ts", '      if (!isTri(f) && !isTri(t) && num(f.value) > num(t.value)) return maybe("server", "between: from is after to", fields);', ''),
 ("contains element checks", "flow.ts", '        const bad = usable(x, "contains");\n        if (bad) return bad.v === "maybe" ? maybe(bad.why, bad.detail, fields) : bad;', ''),
 ("typed arrays skipped", "flow.ts", '  if (x === null || typeof x !== "object" || seen.has(x as object) || ArrayBuffer.isView(x)) return x;\n  seen.add(x as object);\n  try {', '  if (x === null || typeof x !== "object" || seen.has(x as object)) return x;\n  seen.add(x as object);\n  {'),
 ("second-call outcomes", "flow.ts", '!first.ok && !second.ok && String(first.error) === String(second.error)', 'true'),
 ("copy before freezing", "flow.ts", '    return deepFreeze(copy(x));', '    return deepFreeze(x);'),
 ("isNull of an absent field is maybe", "flow.ts", 'return v(0) === ABSENT_FIELD ? maybe("server", "isNull: the field is absent, which the server may mean as null", fields) : tri(v(0) === null);', 'return tri(v(0) === null);'),
 ("carriers end a prediction", "flow.ts", '          if (!ended.includes(sl)) ended.push(sl);', '          if (!unconfirmed.includes(sl)) unconfirmed.push(sl);'),
 ("nested defaults need a parent", "flow.ts", '    if (at && typeof at === "object" && at[segs[segs.length - 1]!] === undefined) at[segs[segs.length - 1]!] = value;', '    if (segs.length === 1 && out[segs[0]!] === undefined) out[segs[0]!] = value;'),
 ("constants are value facts", "source.ts", '        if (await isConstant(n)) return true;', '        if (await isLiteralType(n)) return true;'),
 ("library results must be recorded", "source.ts", '          let ok = (await recordedResult(n)) || bad(n,', '          let ok = true || bad(n,'),
 ("names followed by symbol", "source.ts", 'if (sameFile && fn && named.get(a.text).pos === (fn.kind === K.FunctionDeclaration ? fn.pos : fn.pos))', 'if (named.has(a.text))'),
 ("optional calls", "source.ts", '        if (n.questionDotToken) return bad(n, "an optional call (`?.()`)");', ''),
 ("factory call-site info", "source.ts", '        if (!(await isLiteralType(a)) && !literalInit(a))', '        if (false)'),
]
res=[]
for name, f, a, b in M:
    src=open(f).read()
    assert a in src, name
    shutil.copy(f, f+".bak")
    open(f,'w').write(src.replace(a,b,1))
    r=subprocess.run(["bun","main.ts"],capture_output=True,text=True)
    shutil.move(f+".bak", f)
    fails=[l.strip()[5:90] for l in r.stdout.splitlines() if l.strip().startswith("FAIL")]
    crashed = not fails and r.returncode != 0
    res.append((name, len(fails), fails[:2], crashed))
# A crash counts as caught: the spike run fails (it is reported so).
for n,c,f,crashed in res: print(f"{'OK  ' if c else 'OK (the run crashes)' if crashed else 'MISS'} {n}: {c} failing; {f}")
