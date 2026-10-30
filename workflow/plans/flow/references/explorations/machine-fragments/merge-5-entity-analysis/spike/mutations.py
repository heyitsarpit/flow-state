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
 ("freeze everywhere", "flow.ts", '  return Object.freeze(x);\n}', '  return x;\n}'),
 ("faults not skips", "flow.ts", 'const fault = e instanceof RecordingError || e instanceof PredictionFault;', 'const fault = false;'),
 ("checkReplays double call", "flow.ts", '  if (options.checkReplays) {', '  if (false) {'),
 ("key decode", "flow.ts", '  if (!types || key === null || typeof key !== "object") return key;', '  return key;'),
 ("total canonical (bigint)", "flow.ts", '  if (typeof x === "bigint") return `${x}n`;\n', ''),
 ("literal-type constants", "source.ts", '(TypeFlags.Literal | TypeFlags.EnumLiteral | TypeFlags.Null)', '(TypeFlags.Literal | TypeFlags.EnumLiteral | TypeFlags.Null | TypeFlags.Number)'),
 ("receiver check", "source.ts", '          if (callee.kind === K.PropertyAccessExpression && unwrap(callee.expression).kind !== K.Identifier) ok = (await check(callee.expression, ctx, seen)) && ok;\n', ''),
 ("computed field names", "source.ts", '      if (p.name?.kind === K.ComputedPropertyName) {\n        ok = bad(p, "a computed field name") && ok;\n        continue;\n      }\n', ''),
 ("named callbacks", "source.ts", '        else if (a.kind === K.Identifier && named.has(a.text)) await checkCallback(named.get(a.text));', '        else if (a.kind === K.Identifier) {}'),
 ("zero-parameter callbacks", "source.ts", '  const checkCallback = async (fn: any) => {', '  const checkCallback = async (fn: any) => {\n    if (fn.parameters.length === 0) return;'),
 ("ts-nocheck files", "source.ts", 'const nocheck = /@ts-nocheck/.test(text) || file.endsWith(".js");', 'const nocheck = false;'),
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
    res.append((name, len(fails), fails[:2]))
for n,c,f in res: print(f"{'OK  ' if c else 'MISS'} {n}: {c} failing; {f}")
