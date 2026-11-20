// A vitest reporter for the faults runner: prints each finished test declared with `it.fails` as
// "expected fail: <file> > <names>", so the dead core's greens among the gap markers are told
// apart from the tests that should have failed.
import { relative } from "node:path";

type TestCase = {
  readonly fullName: string;
  readonly options: { readonly fails?: boolean };
  readonly module: { readonly moduleId: string; readonly project: { readonly config: { readonly root: string } } };
};

export default class FailsReporter {
  onTestCaseResult(test: TestCase) {
    if (test.options.fails === true)
      console.log(`expected fail: ${relative(test.module.project.config.root, test.module.moduleId)} > ${test.fullName}`);
  }
}
