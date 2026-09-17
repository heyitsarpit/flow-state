import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noPhaseRebindingRule } from "./no-phase-rebinding.ts";

const tester = createRuleTester("no-phase-rebinding");
const options = [{ sourceRoots: ["packages/flow-state-rewrite/src/runtime"] }];

tester.run("workflow values and ordinary locals", noPhaseRebindingRule, {
  valid: [
    {
      code: "function scan(values: number[]) { for (let index = 0; index < values.length; index += 1) values[index]; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/scan.ts",
      options,
    },
    {
      code: "async function load(read: () => Promise<string>) { let value: string; value = await read(); value = value.trim(); return value; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/load.ts",
      options,
    },
    {
      code: "function shadowed(Effect: { read: () => string }) { let value = Effect.read(); value = Effect.read(); return value; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/shadowed.ts",
      options,
    },
    {
      code: "function ordinary(value: string) { let field: string; field = value; let total = 0; total += 1; return field + total; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/ordinary.ts",
      options,
    },
    {
      code: "function loop() { for (let prepared = 0; prepared < 3; prepared += 1) { return prepared; } return 0; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/loop.ts",
      options,
    },
    {
      code: "function dispatchControl() { let admitted = false; const release = () => { if (!admitted) return; }; admitted = true; return { admitted, release }; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/admitted-capability-cell.ts",
      options,
    },
    {
      code: "function worklist(worklist: string[]) { for (let prepared = 0; prepared < worklist.length; prepared++) worklist[prepared]; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/worklist.ts",
      options,
    },
    {
      code: "function stage(value: string) { const staged = {}; Object.assign(staged, { value }); return staged; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/stage.ts",
      options,
    },
    {
      code: "function read(input: string) { const prepared = input.trim(); return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/read.ts",
      options,
    },
    {
      code: "function scalar(value: string) { const staged = { value }; let extracted = staged.value; extracted = extracted.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/scalar-extraction.ts",
      options,
    },
    {
      code: "function destructured(value: string) { const staged = { value }; let extracted: string; ({ value: extracted } = staged); extracted = extracted.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/destructured-scalar.ts",
      options,
    },
    {
      code: "function scalarConditional(value: string, condition: boolean) { const staged = { value }; let extracted = condition ? staged.value : value; extracted = extracted.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/scalar-conditional.ts",
      options,
    },
    {
      code: "function localConditional(value: string, condition: boolean) { const local = { value }; const alias = condition ? local : local; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/local-conditional.ts",
      options,
    },
    {
      code: "function falsyPhase(value: string) { const phase = false; const alias = phase || { value }; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/falsy-phase.ts",
      options,
    },
    {
      code: "function scalarLogical(value: string) { const staged = { value }; let extracted = staged.value || value; extracted = extracted.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/scalar-logical.ts",
      options,
    },
    {
      code: "function truthyAnd(value: string) { const staged = { value }; let extracted = staged && value; extracted = extracted.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/truthy-and.ts",
      options,
    },
    {
      code: "function scalarFallback(value: string) { const staged = { value }; const phase = { value }; let extracted = staged.value || phase.value; extracted = extracted.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/scalar-fallback.ts",
      options,
    },
    {
      code: "function scalarParameters(value: string, fallback: string) { let extracted = value ?? fallback; extracted = extracted.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/scalar-parameters.ts",
      options,
    },
    {
      code: "function arrayScalar(value: string) { const staged = { value }; let extracted = value; [extracted = staged.value] = [value]; extracted = extracted.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/array-scalar.ts",
      options,
    },
    {
      code: 'function computedLength(values: string[]) { for (let prepared = 0; prepared < values["length"]; prepared += 1) values[prepared]; }',
      filename: "/project/packages/flow-state-rewrite/src/runtime/computed-length.ts",
      options,
    },
    {
      code: "function shadowed(prepared: string) { return (value: string) => { value = value.trim(); return prepared + value; }; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/shadowed-parameter.ts",
      options,
    },
    {
      code: "function undefinedAnd(value: string) { const staged = { value }; let extracted = undefined && staged; extracted = value.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/undefined-and.ts",
      options,
    },
    {
      code: "function unreachableArrayDefault(value: string) { const staged = { value }; const local = { value }; const [, alias = staged] = [0, local]; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/unreachable-array-default.ts",
      options,
    },
    {
      code: "function constantArrayBranch(value: string) { const staged = { value }; const local = { value }; const source = true ? [0, local] : [0, staged]; const [, alias] = source; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/constant-array-branch.ts",
      options,
    },
    {
      code: "function namedLogicalScalar(value: string) { const staged = { value }; const falseAlias = false || false; let extracted = falseAlias || value; extracted = extracted.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/named-logical-scalar.ts",
      options,
    },
    {
      code: "function spreadScalar(value: string) { const staged = { value }; const { value: extracted } = { ...staged }; extracted = extracted.trim(); return extracted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/spread-scalar.ts",
      options,
    },
    {
      code: "function continueLocal(value: string, condition: boolean, stop: boolean) { const staged = { value }; const local = { value }; let alias = local; while (condition) { if (stop) { alias = local; continue; } alias = local; } alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/continue-local.ts",
      options,
    },
    {
      code: "function scalarPhase(phase: string) { const alias = phase; return alias.trim(); }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/scalar-phase.ts",
      options,
    },
    {
      code: "function scalarParameter(phase: string) { phase = phase.trim(); return phase; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/scalar-parameter.ts",
      options,
    },
    {
      code: "function ordinarySwitch(value: string, choice: boolean) { let result: string; if (choice) result = value; else result = value.trim(); switch (choice ? 1 : 0) { case 1: return result; default: return result; } }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/ordinary-switch.ts",
      options,
    },
    {
      code: "function shadowedLocal(value: string) { const staged = { value }; const alias = staged; function inner() { let alias = value; alias = alias.trim(); return alias; } return inner() + staged.value; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/shadowed-local.ts",
      options,
    },
    {
      code: "function ordinaryNamed(value: string) { let phase = value; phase = phase.trim(); let staged = phase; staged = staged.trim(); let workflow = staged; workflow = workflow.trim(); return workflow; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/ordinary-named-locals.ts",
      options,
    },
    {
      code: "function captureSnapshotArray() { const captured = []; captured.push(1); return captured; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/actor-engine.ts",
      options,
    },
    {
      code: "const phase = { read() { return 1; } }; phase.read();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/read-only-member.ts",
      options,
    },
    {
      code: "function read(phase: { read(): number }) { return phase.read(); }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/typed-read-only-member.ts",
      options,
    },
    {
      code: "type PhaseInput = { phase: { read(): number } }; function read({ phase }: PhaseInput) { return phase.read(); }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/named-typed-read-only-member.ts",
      options,
    },
  ],
  invalid: [
    {
      code: "function prepare() { let prepared: string; return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/prepare.ts",
      options,
      errors: [{ messageId: "placeholder" }],
    },
    {
      code: "function prepare(input: string) { let prepared = input; prepared = input.trim(); return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/prepare.ts",
      options,
      errors: [{ messageId: "rebind" }],
    },
    {
      code: "function admittedTwice() { let admitted = false; admitted = true; admitted = false; return admitted; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/admitted-twice.ts",
      options,
      errors: [{ messageId: "rebind" }, { messageId: "rebind" }],
    },
    {
      code: "function numeric() { let prepared = 0; prepared += 1; return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/numeric.ts",
      options,
      errors: [{ messageId: "rebind" }],
    },
    {
      code: "function mutate(value: string) { const staged = {}; staged.value = value; return staged; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/mutate.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function methodMutation(value: string) { const staged = {}; staged.update(value); return staged; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/method-mutation.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function alias(value: string) { const staged = { value }; const alias = staged; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function destructure(value: string) { let prepared = value; ({ prepared } = { prepared: value.trim() }); return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/destructure.ts",
      options,
      errors: [{ messageId: "rebind" }],
    },
    {
      code: "function loop(value: string) { let prepared = value; for (; prepared.length > 0; prepared = prepared.slice(1)) return prepared; return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/rebind-loop.ts",
      options,
      errors: [{ messageId: "rebind" }],
    },
    {
      code: "function aliasWrite(value: string) { const staged = { value }; let alias; alias = staged; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/alias-write.ts",
      options,
      errors: [{ messageId: "rebind" }],
    },
    {
      code: "async function prepare(read: () => Promise<string>) { let prepared: string; prepared = await read(); return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/awaited-phase.ts",
      options,
      errors: [{ messageId: "rebind" }],
    },
    {
      code: "function phaseObject(next: () => object) { for (let prepared = {}; prepared; prepared = next()) return prepared; return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/phase-object-loop.ts",
      options,
      errors: [{ messageId: "rebind" }],
    },
    {
      code: "function cursorWrite() { for (let prepared = 0; prepared < 3; prepared += 1) { prepared = 1; } return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/cursor-body-write.ts",
      options,
      errors: [{ messageId: "rebind" }],
    },
    {
      code: "function nestedMember(value: string) { const staged = { value }; ({ payload: { value: staged.value } } = { payload: { value } }); return staged; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/nested-member.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function assertedAlias(value: string) { const staged = { value }; const alias = staged as { value: string }; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/asserted-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function satisfiedAlias(value: string) { const staged = { value }; const alias = staged satisfies { value: string }; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/satisfied-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function nonNullAlias(value: string) { const staged = { value }; const alias = staged!; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/non-null-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function conditionalAlias(value: string, condition: boolean) { const staged = { value }; const local = { value }; const alias = condition ? staged : local; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/conditional-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function deleteMember(value: string) { const staged = { value }; delete staged.value; return staged; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/delete-member.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function logicalAlias(value: string, condition: boolean) { const staged = { value }; const local = { value }; const alias = staged || local; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/logical-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function nullishAlias(value: string, condition: boolean) { const staged = { value }; const local = { value }; const alias = staged ?? local; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/nullish-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function dynamicLength(values: string[], bound: string) { for (let prepared = 0; prepared < values[bound]; prepared += 1) values[prepared]; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/dynamic-length.ts",
      options,
      errors: [{ messageId: "rebind" }],
    },
    {
      code: "function arrayAlias(value: string) { const staged = { value }; const [, alias] = [0, staged]; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/array-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function arrayDefault(value: string) { const staged = { value }; const [, alias = staged] = [0]; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/array-default.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function conditionalArray(value: string, condition: boolean) { const staged = { value }; const local = { value }; const source = condition ? [0, staged] : [0, local]; const [, alias] = source; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/conditional-array-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function objectParameter(prepared: { value: string }) { prepared.value = \"next\"; return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/object-parameter.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function destructuredObjectParameter({ phase }: { phase: { value: string } }, next: string) { phase.value = next; return phase; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/destructured-object-parameter.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "type PhaseInput = { phase: { value: string } }; function mutate({ phase }: PhaseInput, next: string) { phase.value = next; return phase; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/named-destructured-object-parameter.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function nestedParameters(prepared: { value: string }) { function inner(prepared: { value: string }) { prepared.value = \"next\"; return prepared; } prepared.value = \"next\"; return inner(prepared); }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/nested-parameters.ts",
      options,
      errors: [{ messageId: "phaseBag" }, { messageId: "phaseBag" }],
    },
    {
      code: "function objectPatternValue(value: string) { const staged = { value }; const { nested: prepared } = { nested: staged }; prepared.value = value; return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/object-pattern-value.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function objectPatternDefault(value: string) { const staged = { value }; const { nested: prepared = staged } = {}; prepared.value = value; return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/object-pattern-default.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function constantArraySpread(value: string) { const staged = { value }; const [, prepared] = [0, ...[staged]]; prepared.value = value; return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/constant-array-spread.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function namedFalseLogicalAlias(value: string) { const staged = { value }; const falseAlias = false || false; const alias = falseAlias || staged; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/named-false-logical-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function namedNullishLogicalAlias(value: string) { const staged = { value }; const nullishAlias = undefined ?? undefined; const alias = nullishAlias ?? staged; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/named-nullish-logical-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function assignmentRhsAlias(value: string) { const staged = { value }; let other; const alias = (other = staged); alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/assignment-rhs-alias.ts",
      options,
      errors: [{ messageId: "rebind" }, { messageId: "phaseBag" }],
    },
    {
      code: "function spreadObjectPattern(value: string) { const staged = { value }; const { nested: alias } = { ...{ nested: staged } }; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/spread-object-pattern.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function spreadAlias(value: string) { const staged = { value }; const alias = { ...staged }; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/spread-alias.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function missingObjectPhaseDefault(value: string) { const staged = { value }; const local = { value }; const source = condition ? {} : { nested: local }; const { nested: alias = staged } = source; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/missing-object-phase-default.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function missingLogicalArrayPhaseDefault(value: string) { const staged = { value }; const local = { value }; const source = condition && [local]; const [alias = staged] = source; alias.value = value; return alias; }",
      filename:
        "/project/packages/flow-state-rewrite/src/runtime/missing-logical-array-phase-default.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function nestedAssignmentRhs(value: string, condition: boolean) { const staged = { value }; let container; const outer = (container = condition ? { nested: staged } : { nested: {} }); const { nested: alias } = outer; alias.value = value; return alias; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/nested-assignment-rhs.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function objectRest(value: string) { const staged = { value }; const { ...rest } = staged; rest.value = value; return rest; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/object-rest.ts",
      options,
      errors: [{ messageId: "phaseBag" }],
    },
    {
      code: "function switchRebind(value: string, choice: number) { let prepared = value; switch (choice) { case 0: prepared = value.trim(); break; default: prepared = value; } return prepared; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/switch-rebind.ts",
      options,
      errors: [{ messageId: "rebind" }, { messageId: "rebind" }],
    },
  ],
});
